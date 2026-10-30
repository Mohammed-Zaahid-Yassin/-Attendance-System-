# Deployment Guide — Spotlight Attendance System (SQLite Edition)
### Persistent Storage Architecture with Fly.io & Vercel

This edition is engineered specifically for **SQLite (`better-sqlite3`)** operating in high-performance WAL mode with a persistent volume.

---

## 🚀 Option 1: Fly.io All-in-One Deployment (Recommended)

Fly.io provides NVMe persistent volumes and runs Docker containers directly near users, perfect for SQLite with zero latency and true ACID persistence.

### Prerequisites
1. Install Flyctl:
   ```powershell
   # Windows PowerShell
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```
2. Login to Fly.io:
   ```bash
   fly auth login
   ```

### Step-by-Step Deployment
1. **Create the Fly App**:
   ```bash
   cd D:\Projects\Spotlight-Attendance-SQLite
   fly launch --no-deploy
   ```
2. **Create the Persistent Volume**:
   ```bash
   # Create a 1GB NVMe persistent volume for SQLite database storage
   fly volumes create attendance_data --region sin --size 1
   ```
3. **Deploy**:
   ```bash
   fly deploy
   ```
4. **Verify Health**:
   ```bash
   fly status
   curl https://spotlight-attendance-mvjce.fly.dev/api/health
   ```

The container automatically serves the React frontend and handles all API traffic, persisting `attendance.db` on `/data/attendance.db`.

---

## 🌐 Option 2: Split Deployment (Vercel Frontend + Fly.io Backend)

If you prefer hosting the React frontend on Vercel while keeping the SQLite backend on Fly.io:

1. **Backend on Fly.io**:
   Deploy using Option 1 above. Your backend URL will be `https://spotlight-attendance-mvjce.fly.dev`.

2. **Frontend on Vercel**:
   - In Vercel, import the repository `https://github.com/Mohammed-Zaahid-Yassin/-Attendance-System-.git`.
   - Set Root Directory: `frontend` (or keep root with `outputDirectory: frontend/dist`).
   - Add Environment Variable:
     `VITE_API_BASE_URL=https://spotlight-attendance-mvjce.fly.dev`
   - Deploy.

---

## 🐳 Option 3: Local Docker / AWS EC2 / Container Deployment

```bash
# Build the Docker image
docker build -t spotlight-attendance-sqlite .

# Run with persistent volume mounted to ./data
docker run -d \
  -p 8080:8080 \
  -v ${PWD}/data:/data \
  -e DB_PATH=/data/attendance.db \
  --name spotlight-attendance \
  spotlight-attendance-sqlite
```
