# 🚀 Vercel Deployment Guide: Attendance System

This guide explains how to host the **SPOTLIGHT Attendance System** with the frontend running on **Vercel** and the backend running on a persistent service (like **Render**, **Railway**, or **AWS/VPS**) so that your SQLite database, student data, and rotating QR token cron jobs run smoothly 24/7 without data loss.

---

## 🏗️ Architecture Overview

| Component | Platform | Why |
|---|---|---|
| **Frontend** (`frontend/`) | **Vercel** | Ultra-fast Global Edge CDN, automatic SSL/HTTPS (required for camera scanning & geolocation), instant previews. |
| **Backend** (`backend/`) | **Render / Railway / EC2 / VPS** | Serverless platforms (like Vercel functions) have ephemeral, read-only storage and freeze background processes. A persistent Node service keeps your **SQLite DB (`attendance.db`)** and **20-second QR token rotation** running without losing records. |

---

## ⚡ Step 1: Deploy Backend (e.g., Render / Railway)

> *You can deploy the backend for free in under 2 minutes.*

### Option A: Deploy on Render.com with Persistent Disk (Recommended)

> ⚠️ **IMPORTANT PERSISTENCE NOTE**: Render's free tier uses an **ephemeral filesystem** that discards local files when the container sleeps after 15 minutes of inactivity. When woken up, the database file is recreated and resets credentials to `ADMIN_PASSWORD`.
>
> To ensure your student data, attendance history, and **admin password changes persist permanently across Render sleep/wake cycles and redeployments**, attach a **Render Persistent Disk**:

1. Go to [render.com](https://render.com) and log in.
2. Click **New +** → **Web Service** (or use **Blueprints** with the included `render.yaml`).
3. Connect your GitHub repository: `Mohammed-Zaahid-Yassin/-Attendance-System`.
4. Configure the service:
   - **Name**: `attendance-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Starter (or higher to enable Persistent Disks)
5. Under **Disks** (in service settings):
   - Click **Add Disk**
   - **Name**: `attendance_data`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB` (more than enough for 50,000+ attendance records)
6. Add **Environment Variables** in the Render settings:
   - `PORT`: `3001`
   - `DB_PATH`: `/var/data/attendance.db` *(points inside the persistent disk)*
   - `JWT_SECRET`: *(Generate any random strong secret string)*
   - `REGISTRATION_KEY`: `STATIC_REG_QR_KEY_SECRET_7890` *(or your custom secret)*
   - `ADMIN_USERNAME`: `admin`
   - `ADMIN_PASSWORD`: `your_initial_secure_password` *(Only used for initial first-time account setup; subsequent password changes in the admin dashboard persist permanently in the database)*
   - `NODE_ENV`: `production`
7. Click **Create Web Service**.
8. Once deployed, copy your backend URL (e.g., `https://attendance-backend-xxxx.onrender.com`).

*(Note: If using Render Blueprints, connecting the repo will automatically provision the service and disk defined in [render.yaml](file:///d:/Projects/Attendance%20System/render.yaml).)*

---

## ⚡ Step 2: Deploy Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and click **"Add New..."** → **"Project"**.
2. Select your GitHub repository: `Mohammed-Zaahid-Yassin/-Attendance-System`.
3. In the project setup screen:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `frontend` *(or leave as `./`, as root `vercel.json` is already pre-configured for both)*.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Expand **Environment Variables**:
   - Key: `VITE_API_URL`
   - Value: `https://attendance-backend-xxxx.onrender.com` *(your backend URL from Step 1, without a trailing slash)*
5. Click **Deploy**.

---

## ⚡ Step 3: Verify the Live Deployment

1. Open your Vercel deployment URL (e.g., `https://attendance-system-xxxx.vercel.app`).
2. Test the isolated routes:
   - `/admin/login`: Log in with your configured admin credentials.
   - `/display`: Check that active session QR codes and 6-digit PINs display and rotate.
   - `/scan`: Test scanning the live QR code on a mobile device (camera permissions work automatically over Vercel's HTTPS).
   - `/register?key=YOUR_KEY`: Test student self-registration.

---

## 🛠️ Included Configuration Files

- [frontend/src/main.jsx](file:///d:/Projects/Attendance%20System/frontend/src/main.jsx): Auto-configures Axios with `VITE_API_URL`.
- [frontend/vercel.json](file:///d:/Projects/Attendance%20System/frontend/vercel.json): Configures SPA client-side routing rewrites (`/*` → `/index.html`) so refreshing routes like `/admin` never 404s.
- [vercel.json](file:///d:/Projects/Attendance%20System/vercel.json): Root configuration enabling direct one-click repository import from GitHub into Vercel.
- [backend/index.js](file:///d:/Projects/Attendance%20System/backend/index.js): Universal CORS enabled with credentials to allow incoming requests from any Vercel domain.
