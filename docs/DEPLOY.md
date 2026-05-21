# Deploy — mozaik-replay on JigJoy AWS

> Tailored to the existing JigJoy infrastructure (`jigjoy-services/jigjoy-infra`).
> If you read this looking for a generic AWS deploy guide, the patterns
> still apply — bucket layout, IAM policy, nginx config — but the profile
> names, region, VPC IDs, and domain assume JigJoy conventions.

## TL;DR

- **Account:** `spektrum-dev` (425946675747) for dev,
  `spektrum-prod` (877173392932) for prod. Local AWS CLI profile of the
  same name; `OrganizationAccountAccessRole` assume-role pattern.
- **Region:** `eu-west-1`.
- **Domain:** `replay.dev.jigjoy.ai` (dev) / `replay.jigjoy.ai` (prod).
  Dev wildcard cert `*.dev.jigjoy.ai` already exists
  (`arn:aws:acm:eu-west-1:425946675747:certificate/d38f6a55-…`).
- **Compute:** single EC2 `t4g.small` (ARM, ~$0.017/h on-demand).
- **Storage:** S3 bucket `mozaik-replay-runs-dev` for audit logs.
- **Routing:** systemd-managed backend serves both the SPA static
  bundle and the API + `/r/:id` SSR meta injection. nginx terminates
  TLS and proxies all traffic to the backend.

## New AWS account vs. spektrum-dev?

You asked whether to make a new profile. For MVP scale my call is
**deploy into `spektrum-dev`** as a new CloudFormation stack:

| Concern               | spektrum-dev                      | New account             |
| --------------------- | --------------------------------- | ----------------------- |
| Isolation             | Soft (IAM/stack-level)            | Hard (account boundary) |
| Billing breakout      | Tag-based                         | Native per-account      |
| Setup overhead        | One stack template                | Org member + DNS + ACM  |
| Cross-account access  | None needed                       | Yes, more complex       |
| Cost at MVP           | $0 incremental                    | $0 base + overhead time |

Move to a dedicated account when (a) mozaik-replay becomes a paid
product separate from spektrum or (b) shared blast radius starts
to matter. For now, stay in `spektrum-dev`.

## Storage configuration

Backend env var matrix:

| Env var                       | Required | Default                   | Notes                                                                                |
| ----------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `MOZAIK_REPLAY_STORAGE`       |          | `fs`                      | `fs` for dev-machine; `s3` in EC2 production.                                        |
| `MOZAIK_REPLAY_STORAGE_DIR`   |          | `./storage/runs`          | Only used in `fs` mode.                                                              |
| `S3_BUCKET`                   | for s3   | —                         | `mozaik-replay-runs-dev` (dev) / `mozaik-replay-runs-prod` (prod).                   |
| `S3_REGION`                   |          | SDK default               | `eu-west-1`.                                                                         |
| `S3_KEY_PREFIX`               |          | `runs/`                   | Key prefix inside the bucket.                                                        |
| `MOZAIK_REPLAY_FRONTEND_DIST` | prod     | —                         | Path to the built frontend `dist/`. Triggers SPA + OG SSR injection.                 |
| `MOZAIK_REPLAY_PUBLIC_ORIGIN` | prod     | `""` (relative URLs)      | Absolute origin for OG `og:url` / `og:image`. `https://replay.dev.jigjoy.ai`.        |

AWS credentials in EC2 come from the attached IAM role — never set
`AWS_ACCESS_KEY_ID` on the instance.

## IAM (instance role)

Least-privilege policy attached to the EC2's instance profile:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::mozaik-replay-runs-dev/runs/*"
    }
  ]
}
```

Plus the AWS-managed `AmazonSSMManagedInstanceCore` so the
GitHub-Actions deployer can use SSM `SendCommand` to pull new images
and restart the service (matches the platform-edge / ai-coding deploy
pattern in jigjoy-infra).

## Bucket setup (one-shot)

Run with `AWS_PROFILE=spektrum-dev`:

```bash
aws s3api create-bucket \
  --bucket mozaik-replay-runs-dev \
  --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1

aws s3api put-public-access-block \
  --bucket mozaik-replay-runs-dev \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Lifecycle: expire runs after 90 days.
cat > /tmp/lifecycle.json <<'EOF'
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
  --bucket mozaik-replay-runs-dev \
  --lifecycle-configuration file:///tmp/lifecycle.json
```

## EC2 instance

Slot into the existing jigjoy-infra dev VPC:

- VPC: `vpc-0c202fb26e172f14b`
- Subnet: `subnet-0b98347bab62dabc6` (public, same as platform-edge)
- Key pair: `spektrum-dev`
- Instance type: `t4g.small` (ARM, 2 vCPU, 2 GB)
- AMI: Ubuntu 24.04 LTS ARM
- Security group: inbound 22 (admin), 80, 443 from 0.0.0.0/0; outbound any.

Bootstrap once via SSH:

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx

sudo mkdir -p /opt/mozaik-replay
sudo chown -R ubuntu:ubuntu /opt/mozaik-replay
```

Deploy artefacts (rsync from CI or local for first cut):

```bash
rsync -avz packages/backend/dist/ ubuntu@<host>:/opt/mozaik-replay/backend/
rsync -avz packages/backend/node_modules/ ubuntu@<host>:/opt/mozaik-replay/backend/node_modules/
rsync -avz packages/backend/package.json ubuntu@<host>:/opt/mozaik-replay/backend/
rsync -avz packages/frontend/dist/ ubuntu@<host>:/opt/mozaik-replay/frontend/
```

`/etc/systemd/system/mozaik-replay.service`:

```ini
[Unit]
Description=mozaik-replay backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/mozaik-replay/backend
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=MOZAIK_REPLAY_STORAGE=s3
Environment=S3_BUCKET=mozaik-replay-runs-dev
Environment=S3_REGION=eu-west-1
Environment=MOZAIK_REPLAY_FRONTEND_DIST=/opt/mozaik-replay/frontend
Environment=MOZAIK_REPLAY_PUBLIC_ORIGIN=https://replay.dev.jigjoy.ai
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mozaik-replay
sudo systemctl status mozaik-replay
```

## nginx config

Backend serves both static SPA and the SSR `/r/:id` HTML, so nginx
is just TLS + proxy.

`/etc/nginx/sites-available/mozaik-replay`:

```nginx
server {
    listen 80;
    server_name replay.dev.jigjoy.ai;

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
sudo ln -s /etc/nginx/sites-available/mozaik-replay /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS via the existing ACM cert — but ACM only attaches to ALBs and
# CloudFront. On a single-EC2 deploy, use Let's Encrypt directly:
sudo certbot --nginx -d replay.dev.jigjoy.ai
```

(Switching to ALB + ACM later is a one-stack change.)

## DNS

In `spektrum-dev` Route53, in hosted zone `dev.jigjoy.ai`
(`Z07735212HGZVO529ELA1`), add an A record:

```bash
aws route53 change-resource-record-sets \
  --profile spektrum-dev \
  --hosted-zone-id Z07735212HGZVO529ELA1 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "replay.dev.jigjoy.ai",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "<EC2 elastic IP>" }]
      }
    }]
  }'
```

## GitHub Actions deploy (follow-up)

Once the EC2 is live, the convention is to wire it the same way as
`platform-edge` / `ai-coding`:

1. ECR repo `mozaik-replay` in `spektrum-dev`.
2. CI builds a Docker image of the backend (Node + frontend dist
   baked in), pushes to ECR.
3. CI uses SSM `SendCommand` to instruct the EC2 to docker-pull and
   restart the systemd service.

The IAM permissions for the `github-actions-deployer` user already
include ECR push + SSM SendCommand; just add the new ECR repo ARN to
the `ECRRepositoryArns` parameter when the `ci-infra` stack is
updated.

Initial deploy can skip Docker and use rsync over SSH; switch to
ECR + SSM when the deploy is regular enough to bother.

## Health check

```bash
curl -sf https://replay.dev.jigjoy.ai/health | jq
# { "status": "ok", "service": "mozaik-replay-backend",
#   "storage": "S3RunStorage", "frontendDist": "/opt/mozaik-replay/frontend", ... }
```

If `storage` is `FsRunStorage` in prod, the systemd env wasn't picked
up — re-check the unit file.

## Local-dev parity

```bash
# Filesystem mode (default)
npm run dev:backend

# S3 mode against the real dev bucket
MOZAIK_REPLAY_STORAGE=s3 \
S3_BUCKET=mozaik-replay-runs-dev \
S3_REGION=eu-west-1 \
AWS_PROFILE=spektrum-dev \
  npm run dev:backend

# Full SSR mode (serve SPA + OG injection from backend)
MOZAIK_REPLAY_FRONTEND_DIST=$(pwd)/packages/frontend/dist \
MOZAIK_REPLAY_PUBLIC_ORIGIN=http://localhost:8787 \
  npm run dev:backend
```
