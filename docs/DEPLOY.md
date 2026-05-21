# Deploy — kaleidoskop

> Single-environment (prod) deploy into a dedicated `kaleidoskop-prod`
> AWS account inside the JigJoy Organization. Domain: `kaleidoskop.jigjoy.ai`.

## Decisions

| Topic         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| AWS Account   | `kaleidoskop-prod` — new sub-account in the JigJoy Organization (owner: `jigjoy-main` / <JIGJOY_MAIN_ACCOUNT_ID>) |
| Profile       | `kaleidoskop-prod` (assume-role from `jigjoy-main`)            |
| Region        | `eu-west-1`                                                    |
| Domain        | `kaleidoskop.jigjoy.ai` (Route53 record in `jigjoy.ai` zone)   |
| TLS           | Let's Encrypt via certbot on the EC2 (no ALB at MVP)           |
| Environments  | **Just prod for now.** Dev can be added later as a separate account when traffic justifies it. |
| Compute       | Single `t4g.small` EC2 (ARM, ~$15/mo on-demand)                |
| Storage       | S3 bucket `kaleidoskop-runs` inside the kaleidoskop-prod account |
| Source repo   | https://github.com/jigjoy-ai/kaleidoskop                        |
| Deploy mode   | initial: rsync over SSH; future: ECR + SSM via GitHub Actions  |

## Step 1 — Create the AWS sub-account

This runs against the org root, so use `jigjoy-main` profile. The new
account ends up as a member of the JigJoy Organization with the standard
`OrganizationAccountAccessRole` for cross-account assume-role.

```bash
aws organizations create-account \
  --profile jigjoy-main \
  --account-name kaleidoskop-prod \
  --email aws+kaleidoskop@jigjoy.ai \
  --role-name OrganizationAccountAccessRole

# Poll until CreateAccountStatus says SUCCEEDED:
aws organizations list-create-account-status \
  --profile jigjoy-main \
  --states SUCCEEDED IN_PROGRESS FAILED
```

`aws+kaleidoskop@jigjoy.ai` is a `+alias` on the JigJoy ops mailbox so the
account-recovery email lands somewhere reachable. The address must NOT
already be associated with any other AWS account.

When the status reports `SUCCEEDED`, capture the new `AccountId` and
append a profile to `~/.aws/config`:

```ini
[profile kaleidoskop-prod]
role_arn = arn:aws:iam::<NEW_ACCOUNT_ID>:role/OrganizationAccountAccessRole
source_profile = jigjoy-main
region = eu-west-1
output = json
```

Verify:

```bash
aws sts get-caller-identity --profile kaleidoskop-prod
# → Arn: arn:aws:sts::<NEW_ACCOUNT_ID>:assumed-role/OrganizationAccountAccessRole/...
```

## Step 2 — S3 bucket

```bash
export AWS_PROFILE=kaleidoskop-prod

aws s3api create-bucket \
  --bucket kaleidoskop-runs \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

aws s3api put-public-access-block \
  --bucket kaleidoskop-runs \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Lifecycle: expire runs after 90 days.
cat > /tmp/kaleidoskop-lifecycle.json <<'EOF'
{
  "Rules": [{
    "ID": "expire-old-runs",
    "Status": "Enabled",
    "Filter": { "Prefix": "runs/" },
    "Expiration": { "Days": 90 }
  }]
}
EOF
aws s3api put-bucket-lifecycle-configuration \
  --bucket kaleidoskop-runs \
  --lifecycle-configuration file:///tmp/kaleidoskop-lifecycle.json
```

## Step 3 — EC2 + IAM

The instance role grants least-privilege S3 access plus SSM for future
GitHub Actions deploys.

`/tmp/kaleidoskop-trust.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

`/tmp/kaleidoskop-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject"],
    "Resource": "arn:aws:s3:::kaleidoskop-runs/runs/*"
  }]
}
```

```bash
aws iam create-role \
  --role-name kaleidoskop-ec2-role \
  --assume-role-policy-document file:///tmp/kaleidoskop-trust.json

aws iam put-role-policy \
  --role-name kaleidoskop-ec2-role \
  --policy-name kaleidoskop-runs-access \
  --policy-document file:///tmp/kaleidoskop-policy.json

aws iam attach-role-policy \
  --role-name kaleidoskop-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

aws iam create-instance-profile \
  --instance-profile-name kaleidoskop-ec2-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name kaleidoskop-ec2-profile \
  --role-name kaleidoskop-ec2-role
```

Launch the EC2 in the kaleidoskop-prod account's default VPC:

```bash
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters 'Name=is-default,Values=true' --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" --query 'Subnets[0].SubnetId' --output text)

AMI=$(aws ec2 describe-images --owners 099720109477 \
  --filters 'Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*' \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)

SG=$(aws ec2 create-security-group \
  --group-name kaleidoskop-sg \
  --description "kaleidoskop public ingress" \
  --vpc-id $DEFAULT_VPC \
  --query 'GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 443 --cidr 0.0.0.0/0

aws ec2 create-key-pair --key-name kaleidoskop --query 'KeyMaterial' --output text > ~/.ssh/kaleidoskop.pem
chmod 600 ~/.ssh/kaleidoskop.pem

aws ec2 run-instances \
  --image-id $AMI \
  --instance-type t4g.small \
  --key-name kaleidoskop \
  --security-group-ids $SG \
  --subnet-id $SUBNET \
  --associate-public-ip-address \
  --iam-instance-profile Name=kaleidoskop-ec2-profile \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=kaleidoskop}]'

EIP=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
INSTANCE=$(aws ec2 describe-instances --filters 'Name=tag:Name,Values=kaleidoskop' --query 'Reservations[0].Instances[0].InstanceId' --output text)
aws ec2 associate-address --instance-id $INSTANCE --allocation-id $EIP
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids $EIP --query 'Addresses[0].PublicIp' --output text)
echo "EC2 public IP: $PUBLIC_IP"
```

## Step 4 — DNS

Route53 zone `jigjoy.ai` lives in the `jigjoy-main` account
(`Z0673622111AOENE0D0QW`). Add the A record from there:

```bash
aws route53 change-resource-record-sets \
  --profile jigjoy-main \
  --hosted-zone-id Z0673622111AOENE0D0QW \
  --change-batch "$(cat <<EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "kaleidoskop.jigjoy.ai",
      "Type": "A",
      "TTL": 300,
      "ResourceRecords": [{ "Value": "${PUBLIC_IP}" }]
    }
  }]
}
EOF
)"
```

## Step 5 — Bootstrap the EC2

```bash
ssh -i ~/.ssh/kaleidoskop.pem ubuntu@kaleidoskop.jigjoy.ai

sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx
sudo mkdir -p /opt/kaleidoskop
sudo chown -R ubuntu:ubuntu /opt/kaleidoskop
```

## Step 6 — Build + rsync

From the developer machine:

```bash
cd ~/Desktop/jigjoy-services/kaleidoskop
npm run build
npm prune --omit=dev --workspace=@kaleidoskop/backend

rsync -avz packages/backend/dist/ ubuntu@kaleidoskop.jigjoy.ai:/opt/kaleidoskop/backend/
rsync -avz packages/backend/package.json ubuntu@kaleidoskop.jigjoy.ai:/opt/kaleidoskop/backend/
rsync -avz packages/backend/node_modules/ ubuntu@kaleidoskop.jigjoy.ai:/opt/kaleidoskop/backend/node_modules/
rsync -avz packages/frontend/dist/ ubuntu@kaleidoskop.jigjoy.ai:/opt/kaleidoskop/frontend/
```

## Step 7 — systemd

`/etc/systemd/system/kaleidoskop.service`:

```ini
[Unit]
Description=kaleidoskop backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/kaleidoskop/backend
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=KALEIDOSKOP_STORAGE=s3
Environment=S3_BUCKET=kaleidoskop-runs
Environment=S3_REGION=eu-west-1
Environment=KALEIDOSKOP_FRONTEND_DIST=/opt/kaleidoskop/frontend
Environment=KALEIDOSKOP_PUBLIC_ORIGIN=https://kaleidoskop.jigjoy.ai
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kaleidoskop
sudo systemctl status kaleidoskop
```

## Step 8 — nginx + TLS

`/etc/nginx/sites-available/kaleidoskop`:

```nginx
server {
    listen 80;
    server_name kaleidoskop.jigjoy.ai;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kaleidoskop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d kaleidoskop.jigjoy.ai
```

## Step 9 — Verify

```bash
curl -sf https://kaleidoskop.jigjoy.ai/health | jq
# → { "status": "ok", "storage": "S3RunStorage", "frontendDist": "/opt/kaleidoskop/frontend", ... }

curl -sf https://kaleidoskop.jigjoy.ai/r/smoke-test | grep og:title
# → <meta property="og:title" content="Replay smoke-test — 199 events · 3 stories · 2:45" />
```

## Local-dev parity

```bash
# Filesystem mode (default)
npm run dev:backend

# S3 mode against the prod bucket
KALEIDOSKOP_STORAGE=s3 \
S3_BUCKET=kaleidoskop-runs \
S3_REGION=eu-west-1 \
AWS_PROFILE=kaleidoskop-prod \
  npm run dev:backend

# Full SSR mode (backend serves SPA + OG injection)
npm run build:frontend
KALEIDOSKOP_FRONTEND_DIST=$(pwd)/packages/frontend/dist \
KALEIDOSKOP_PUBLIC_ORIGIN=http://localhost:8787 \
  npm run dev:backend
```

## Future: GitHub Actions deploy

Once initial deploy is stable, wire the same ECR + SSM `SendCommand`
pattern that `platform-edge` / `ai-coding` use in `jigjoy-infra`:

1. New ECR repo `kaleidoskop` in the kaleidoskop-prod account.
2. CI builds a Docker image (Node + frontend dist baked in), pushes
   to ECR.
3. CI uses `ssm:SendCommand` to instruct the EC2 to docker-pull and
   restart the systemd service.

A dedicated `github-actions-deployer` IAM user with ECR push + SSM
SendCommand permissions, key id stored as the
`KALEIDOSKOP_AWS_ACCESS_KEY_ID` GitHub org secret.

## Adding a dev environment later

When traffic warrants it, repeat the steps above with:
- New account: `kaleidoskop-dev`
- Bucket: `kaleidoskop-runs-dev`
- Domain: `dev.kaleidoskop.jigjoy.ai` (Route53 record in the same `jigjoy.ai` zone)
