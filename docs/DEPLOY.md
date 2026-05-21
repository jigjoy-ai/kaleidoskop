# Deploy

## Architecture

```
              ┌─────────────────────┐
              │  CloudFront (TLS)   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   nginx (on EC2)    │
              │   - /api  → :8787   │
              │   - /     → static  │
              └──────────┬──────────┘
                         │
                ┌────────┴───────┐
                │                │
        ┌───────▼──────┐   ┌─────▼──────┐
        │   Backend    │   │  Frontend  │
        │  Fastify     │   │  Vite SSG  │
        │  :8787       │   │  (static)  │
        └───────┬──────┘   └────────────┘
                │
                ▼
          ┌──────────┐
          │    S3    │
          │  bucket  │
          └──────────┘
```

- Backend (Fastify) handles `POST /api/runs`, `GET /api/runs/:id`,
  `GET /api/runs/:id/stream` (WebSocket).
- Frontend is static Vite build served by nginx.
- S3 stores uploaded JSONL audit logs + sidecar meta.
- IAM role attached to the EC2 instance grants `s3:PutObject`,
  `s3:GetObject`, `s3:HeadObject` on the bucket. No static AWS keys
  on the host.

## Storage configuration

The backend's storage backend is selected by env:

| Env var                       | Required | Default                   | Notes                                                                                |
| ----------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `MOZAIK_REPLAY_STORAGE`       |          | `fs`                      | `fs` (filesystem) or `s3`.                                                           |
| `MOZAIK_REPLAY_STORAGE_DIR`   |          | `./storage/runs`          | Only used in `fs` mode.                                                              |
| `S3_BUCKET`                   | for s3   | —                         | The bucket name.                                                                     |
| `S3_REGION`                   |          | SDK default chain         | e.g. `eu-central-1`. Omit to use AWS region discovery.                               |
| `S3_KEY_PREFIX`               |          | `runs/`                   | Key prefix inside the bucket. Trailing slash matters.                                |

AWS credentials are resolved by the AWS SDK's default credential chain:
env vars → shared config → IMDS (IAM role). For production EC2 the
recommended path is **IAM role only** — don't set `AWS_ACCESS_KEY_ID`
explicitly, that breaks IMDS discovery.

## Recommended IAM policy

Attach this policy to the EC2 instance role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::<your-bucket>/runs/*"
    }
  ]
}
```

`s3:ListBucket` is **not** required by the current backend (we never
list); add it later if a "run gallery" feature lands.

## Bucket setup

```bash
aws s3api create-bucket \
  --bucket mozaik-replay-runs \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1

# Block all public access — runs are accessed via signed backend reads,
# not directly from S3.
aws s3api put-public-access-block \
  --bucket mozaik-replay-runs \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Optional: lifecycle rule to expire runs after 90 days.
aws s3api put-bucket-lifecycle-configuration \
  --bucket mozaik-replay-runs \
  --lifecycle-configuration file://lifecycle.json
```

`lifecycle.json`:

```json
{
  "Rules": [{
    "ID": "expire-old-runs",
    "Status": "Enabled",
    "Filter": { "Prefix": "runs/" },
    "Expiration": { "Days": 90 }
  }]
}
```

## EC2 instance

Recommended: **t4g.small** (ARM, 2 vCPU, 2 GB RAM, ~$0.017/h on-demand
in eu-central-1). Backend's memory footprint per replay session is in
the low MB; one box handles dozens of concurrent WS clients.

```bash
# Ubuntu 24.04 LTS ARM AMI
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx

# Deploy artefacts (rsync from CI or local)
sudo mkdir -p /opt/mozaik-replay
sudo chown -R ubuntu:ubuntu /opt/mozaik-replay
rsync -avz packages/backend/dist/ ubuntu@<host>:/opt/mozaik-replay/backend/
rsync -avz packages/backend/node_modules/ ubuntu@<host>:/opt/mozaik-replay/backend/node_modules/
rsync -avz packages/frontend/dist/ ubuntu@<host>:/opt/mozaik-replay/frontend/

# systemd unit at /etc/systemd/system/mozaik-replay.service:
```

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
Environment=S3_BUCKET=mozaik-replay-runs
Environment=S3_REGION=eu-central-1
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

`/etc/nginx/sites-available/mozaik-replay`:

```nginx
server {
    listen 80;
    server_name replay.baro.rs;

    # Static frontend
    root /opt/mozaik-replay/frontend;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # WebSocket upgrade + proxied API
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;  # WS sessions can be long-lived
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mozaik-replay /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# TLS via Let's Encrypt
sudo certbot --nginx -d replay.baro.rs
```

## DNS

Route 53 (or whatever DNS provider): `A` record `replay.baro.rs` →
EC2 elastic IP. CloudFront in front is optional; nginx + EC2 TLS is
enough for the current load.

## Health check

```bash
curl -sf https://replay.baro.rs/api/health | jq
# { "status": "ok", "service": "mozaik-replay-backend",
#   "storage": "S3RunStorage", ... }
```

If `storage` is `FsRunStorage` in prod, the systemd env wasn't picked
up — re-check the unit file.

## Local dev parity

```bash
# Filesystem mode (default)
npm run dev:backend

# S3 mode against a real bucket (uses your shell's AWS creds)
MOZAIK_REPLAY_STORAGE=s3 \
S3_BUCKET=mozaik-replay-runs-dev \
S3_REGION=eu-central-1 \
  npm run dev:backend
```
