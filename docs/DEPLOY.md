# Deploying to a VPS (Docker Compose + Caddy)

One Linux server runs everything: web, worker, Postgres, Redis, SeaweedFS (S3) and Caddy (HTTPS).
Files: `Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`, `.env.production.example`.

## 1. Server

- Ubuntu 24.04, **at least 2 vCPU / 4 GB RAM** (Chromium renders pages in the worker and
  the web app's PDF export; the image build itself needs ~3 GB RAM — add swap on smaller boxes).
- Open ports 22, 80, 443 only (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`).
- Install Docker: `curl -fsSL https://get.docker.com | sh`

## 2. DNS

Create an **A record** for your hostname (e.g. `seo.example.com`) → the server's public IP.
Caddy requests the TLS certificate on first start, so DNS must resolve before step 4.

## 3. Code and configuration

```bash
git clone https://github.com/IT21301704/seo-platform.git
cd seo-platform
cp .env.production.example .env.production
nano .env.production
```

Fill in at minimum: `DOMAIN`, `APP_URL`, `POSTGRES_PASSWORD` (and the same password inside
`DATABASE_URL`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AUTH_SECRET`, `ENCRYPTION_KEY`.
Generate secrets with `openssl rand -hex 32`. Keep a copy of `ENCRYPTION_KEY` somewhere safe.

## 4. Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps        # migrate should show "exited (0)"
docker compose -f docker-compose.prod.yml logs -f web worker
```

Open `https://<DOMAIN>` and sign in with your email. Without `EMAIL_SERVER` the sign-in link
appears in `docker compose -f docker-compose.prod.yml logs web`; configure SMTP before inviting users.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically (the `migrate` service) before web and worker restart.

## Backups

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U seo seo_platform | gzip > backup-$(date +%F).sql.gz
```

Run it from cron and copy the file off the server. Snapshots live in the `s3-data` volume.

## Integrations

- Google OAuth: authorised redirect URI `https://<DOMAIN>/api/auth/callback/google`.
- Never set `AUTH_DEV_LOGIN`, `FIXTURE_SITES` or `DEV_ALLOW_PRIVATE_HOSTS` in production.
