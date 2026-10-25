# 🚀 AWS Production Deployment Guide: SPOTLIGHT Attendance System

This guide is designed for deploying the **MVJCE SPOTLIGHT Attendance System** on Amazon Web Services (AWS) using Docker, optimized to handle **1,200+ concurrent attendees** during college events and lecture sessions.

---

## 🏗️ Architecture & High-Concurrency Specs (1,200 Participants)

| Component | Configuration | Purpose |
|---|---|---|
| **Container Engine** | Multi-Stage Docker | Single container serving both REST API and compiled React SPA |
| **Database** | SQLite via `better-sqlite3` | Zero-latency embedded DB with WAL mode (`journal_mode=WAL`) |
| **Concurrency Tuning** | `cache_size = -64000` (64MB RAM), `synchronous = NORMAL` | Handles 1,000+ simultaneous writes without lock starvation |
| **Database Indexes** | `idx_attendance_session`, `idx_attendance_student`, `idx_tokens_token` | Microsecond lookup performance during peak scanning windows |
| **Token Rotation** | `node-cron` 19s tick + 22s grace window | Anti-proxy rotation without database bloating |
| **Static Assets** | Built via Vite, cached in Express | Instant page loads on student mobile networks |

---

## ⚡ Quick Start: Deploying with Docker Compose (Recommended)

### Prerequisites on AWS EC2
- An AWS EC2 instance (e.g., `t3.medium` or `t4g.medium` with Ubuntu 22.04 LTS or Amazon Linux 2023)
- Docker & Docker Compose installed

### Step 1: Clone Repository on Server
```bash
git clone https://github.com/Mohammed-Zaahid-Yassin/Attendance-System.git
cd Attendance-System
```

### Step 2: Configure Environment Variables
You can customize secrets in `docker-compose.yml` or create a `.env` file in the root directory:

```env
NODE_ENV=production
PORT=3001
DB_PATH=/app/data/attendance.db
REGISTRATION_KEY=STATIC_REG_QR_KEY_SECRET_7890
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_admin_password_here
JWT_SECRET=spotlight_mvjce_production_super_secret_jwt_key
```

### Step 3: Build & Launch Container
```bash
docker compose up -d --build
```

### Step 4: Verify Deployment Health
```bash
# Check container status
docker ps

# Check container logs
docker compose logs -f

# Verify API health
curl http://localhost:3001/api/health
```

---

## 🌐 AWS EC2 Setup with HTTPS (Nginx + Let's Encrypt SSL)

For camera permissions (`html5-qrcode`) and GPS geofencing on mobile browsers (Chrome / Safari / iOS), **HTTPS is strictly mandatory**.

### 1. Launch EC2 Instance
- **Instance Type**: `t3.medium` (2 vCPU, 4 GiB RAM) or `t4g.medium` (Graviton2, high cost efficiency)
- **Storage**: 20 GiB gp3 EBS volume
- **Security Group**:
  - Inbound Port 22 (SSH) - restricted to admin IP
  - Inbound Port 80 (HTTP) - `0.0.0.0/0`
  - Inbound Port 443 (HTTPS) - `0.0.0.0/0`

### 2. Nginx Reverse Proxy Configuration
Install Nginx and Certbot:
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/attendance.conf`:
```nginx
server {
    server_name attendance.yourdomain.com; # Replace with your domain

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for high traffic
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
}
```

Enable site and generate free SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/attendance.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d attendance.yourdomain.com
```

---

## 📦 Alternative: AWS App Runner / AWS Elastic Container Service (ECS)

If deploying to **AWS App Runner** or **AWS ECS Fargate**:
1. Build and push image to **Amazon Elastic Container Registry (ECR)**:
   ```bash
   aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
   docker build -t mvjce-spotlight-attendance .
   docker tag mvjce-spotlight-attendance:latest <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/mvjce-spotlight-attendance:latest
   docker push <ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/mvjce-spotlight-attendance:latest
   ```
2. When creating the ECS Task Definition or App Runner service, attach an **Amazon EFS** (Elastic File System) volume mapped to `/app/data` to ensure the SQLite database persists across container restarts.

---

## 💾 Database Backup & Export

All student registrations and attendance logs are safely stored in `./attendance_data/attendance.db` on the host machine.

### Backup Database
```bash
# Hot backup (safe to run even while attendees are scanning)
sqlite3 attendance_data/attendance.db ".backup 'attendance_backup_$(date +%F).db'"
```

### Export Attendance via Admin Panel
Administrators can download SQLite-generated CSV files anytime with one click from `/admin/attendance`.

---

## 🛡️ Page Isolation Verification

Verify that routes remain segregated in production:
- **Registration**: Accessible only via the Admin's Static QR link (`/register?key=SECRET`). No navigation bar or links to other pages.
- **Attendance Scan**: Standalone `/scan` URL encoded in the projector QR. No links to admin or registration.
- **Projector Display**: Fullscreen `/display` high-contrast screen with 20s rotating QR code and PIN.
- **Admin Control Center**: Authenticated at `/admin`.