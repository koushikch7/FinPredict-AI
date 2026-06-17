---
layout: default
title: Deployment Guide - FinPredict AI
---

# 🚀 Deployment Guide

Complete guide to deploying FinPredict AI in production.

---

## Prerequisites

- **Docker** 20+ (recommended) OR Node.js 20+
- **2GB RAM** minimum (4GB recommended)
- **1 CPU core** minimum (2+ recommended)
- **10GB disk** for database and backups
- **Domain name** (optional but recommended)

---

## Option 1: Docker Deployment (Recommended)

### Quick Start

```bash
# Clone repository
git clone https://github.com/koushikch7/FinPredict-AI.git
cd FinPredict-AI

# Create environment file
cp .env.example .env

# Edit configuration
nano .env

# Build image
docker build -t finpredict-ai .

# Run container
docker run -d \
  --name finpredict \
  -p 3000:3000 \
  --env-file .env \
  -v finpredict-data:/app/data \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  finpredict-ai

# Check health
curl http://localhost:3000/api/health
```

### Environment Variables

Create `.env` file with:

```bash
# Required
NODE_ENV=production
PORT=3000
JWT_SECRET=<generate-64-char-random-string>
COOKIE_SECRET=<generate-64-char-random-string>

# AI Provider (at least one required)
# Option A: Google Gemini (free tier available)
GEMINI_API_KEY=your-gemini-key

# Option B: Arbiter (multi-provider gateway)
ARBITER_API_KEY=your-arbiter-key
ARBITER_BASE_URL=https://arbiter.example.com/v1

# Option C: OpenAI-compatible
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Default AI provider
DEFAULT_AI_PROVIDER=Gemini  # or Arbiter, OpenAI
DEFAULT_AI_MODEL=auto

# Optional: News API
NEWS_API_KEY=your-newsapi-key

# Optional: S3 Backup
S3_ENDPOINT=https://objectstorage.region.oraclecloud.com
S3_BUCKET=finpredict-backups
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# Optional: Zerodha Broker
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-secret
```

### Generate Secure Secrets

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Generate COOKIE_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  finpredict:
    build: .
    container_name: finpredict
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - finpredict-data:/app/data
    environment:
      - TZ=Asia/Kolkata
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  finpredict-data:
```

Run with:

```bash
docker compose up -d
```

---

## Option 2: Node.js Deployment

### Install Dependencies

```bash
# Clone repository
git clone https://github.com/koushikch7/FinPredict-AI.git
cd FinPredict-AI

# Install dependencies
npm install

# Build frontend
npm run build

# Create data directory
mkdir -p data
```

### Configure Environment

```bash
cp .env.example .env
nano .env
# Configure as shown above
```

### Run with PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start npm --name finpredict -- start

# Configure startup
pm2 startup
pm2 save

# Monitor logs
pm2 logs finpredict
```

### Run with systemd

Create `/etc/systemd/system/finpredict.service`:

```ini
[Unit]
Description=FinPredict AI
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/finpredict
ExecStart=/usr/bin/node --import tsx server/index.ts
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable finpredict
sudo systemctl start finpredict
```

---

## Reverse Proxy Configuration

### Nginx

```nginx
server {
    listen 80;
    server_name finpredict.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name finpredict.example.com;

    ssl_certificate /etc/letsencrypt/live/finpredict.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/finpredict.example.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### Caddy

```caddyfile
finpredict.example.com {
    reverse_proxy localhost:3000
    encode gzip
}
```

### Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```

---

## SSL Certificate

### Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d finpredict.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Database Backup

### Manual Backup

```bash
# Copy database file
cp /app/data/finance.db /backup/finance-$(date +%Y%m%d).db

# Or from Docker
docker cp finpredict:/app/data/finance.db ./backup/
```

### S3 Backup (Built-in)

Configure S3 credentials in `.env`, then:

1. Go to Admin → Backups
2. Click "Create Backup"
3. Or use API:
   ```bash
   curl -X POST http://localhost:3000/api/admin/backups/create \
     -H "Cookie: token=..." \
     -H "Content-Type: application/json" \
     -d '{"type": "manual"}'
   ```

### Scheduled Backups

Built-in schedules (configurable):
- **Daily:** 2 AM IST, 7-day retention
- **Weekly:** Sunday 3 AM IST, 90-day retention

---

## Monitoring

### Health Check

```bash
# Simple health check
curl http://localhost:3000/api/health

# Expected response
{"ok":true,"ts":"2026-06-17T10:00:00Z","env":"production","db":"ok"}
```

### Docker Health

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' finpredict

# View health logs
docker inspect --format='{{json .State.Health}}' finpredict | jq
```

### Logs

```bash
# Docker logs
docker logs -f finpredict

# PM2 logs
pm2 logs finpredict

# systemd logs
journalctl -u finpredict -f
```

---

## Updates

### Docker Update

```bash
cd FinPredict-AI

# Pull latest code
git pull origin main

# Rebuild image
docker build -t finpredict-ai .

# Replace container
docker stop finpredict
docker rm finpredict
docker run -d \
  --name finpredict \
  -p 3000:3000 \
  --env-file .env \
  -v finpredict-data:/app/data \
  -e TZ=Asia/Kolkata \
  --restart unless-stopped \
  finpredict-ai
```

### Node.js Update

```bash
cd /var/www/finpredict

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Rebuild frontend
npm run build

# Restart service
pm2 restart finpredict
# or
sudo systemctl restart finpredict
```

---

## Security Checklist

- [ ] Use strong, unique JWT_SECRET and COOKIE_SECRET
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Configure reverse proxy security headers
- [ ] Restrict database file permissions
- [ ] Use firewall (allow only 80/443)
- [ ] Enable automatic updates
- [ ] Configure backup retention
- [ ] Review rate limits for your use case
- [ ] Never expose .env file publicly

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs finpredict

# Common issues:
# - Missing .env file
# - JWT_SECRET too short (min 16 chars)
# - Port already in use
```

### Database locked

```bash
# SQLite needs exclusive access
# Check for multiple instances
ps aux | grep node

# Ensure only one container runs
docker ps -a | grep finpredict
```

### AI not responding

```bash
# Test AI endpoint
curl http://localhost:3000/api/admin/ai/test

# Check API key validity
# Check rate limits
# Try different provider
```

### Memory issues

```bash
# Increase container memory
docker run -d --memory=4g ...

# Check usage
docker stats finpredict
```

---

## Cloud Deployment Examples

### Oracle Cloud (Free Tier)

1. Create VM.Standard.E2.1.Micro instance
2. Install Docker
3. Follow Docker deployment steps
4. Configure security list for ports 80/443

### AWS EC2

1. Launch t3.micro instance
2. Use Amazon Linux 2 AMI
3. Install Docker and docker-compose
4. Configure security group

### DigitalOcean

1. Create $6/month Droplet
2. Choose Docker marketplace image
3. Follow Docker deployment steps

### Railway / Render / Fly.io

Use provided Dockerfile with:
- Build command: `docker build`
- Start command: `docker run`
- Port: `3000`
- Volume for `/app/data`

---

<p align="center">
  <a href="./">← Back to Home</a>
</p>
