# 🚀 Vercel & Neon Cloud Deployment Guide: MVJCE Spotlight Attendance System

This guide outlines how the **SPOTLIGHT Attendance System** is deployed using **Vercel** and **Neon Serverless Postgres Cloud**.

---

## 🏗️ Architecture Overview

| Component | Platform | Role & Capability |
|---|---|---|
| **Frontend** (`frontend/`) | **Vercel** | Ultra-fast Global Edge CDN, automated HTTPS (enabling camera barcode scanning & geolocation API), Vite SPA production bundle. |
| **Serverless API** (`api/`, `backend/`) | **Vercel Functions** | Express-powered modular API (`/api/auth`, `/api/admin`, `/api/neon`, etc.) running directly as Vercel serverless endpoints. |
| **Cloud Database** | **Neon Postgres** | Fully managed serverless PostgreSQL (`ep-nameless-mountain-az2j1d5a`) with auto-scaling, Auth JWKS, Object Storage, and Realtime queries. |

---

## ⚡ Deployment Setup

1. **Vercel Project Configuration**:
   - **Framework Preset**: `Vite`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Output Directory**: `frontend/dist`
   - **Serverless API Endpoint**: Handled automatically via `api/index.js` and `vercel.json` rewrites.

2. **Environment Variables on Vercel**:
   - `DATABASE_URL`: `postgresql://neondb_owner:npg_fZMjztB4sX0R@ep-nameless-mountain-az2j1d5a-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - `DATABASE_URL_UNPOOLED`: `postgresql://neondb_owner:npg_fZMjztB4sX0R@ep-nameless-mountain-az2j1d5a.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - `JWT_SECRET`: `attendance_secure_jwt_secret_key_2024_xyz`
   - `REGISTRATION_KEY`: `STATIC_REG_QR_KEY_SECRET_7890`
   - `ADMIN_USERNAME`: `admin`
   - `FRONTEND_URL`: `https://attendance-system-mvjce.vercel.app`

3. **Neon Cloud Services Integrated**:
   - **Neon Postgres**: Persistent transactional store for students, sessions, attendance, and admin credentials.
   - **Neon Auth**: JWKS token verification for single sign-on.
   - **Neon Object Storage**: Automated CSV & XLSX attendance export archival (`assets` bucket).
   - **Neon Functions**: Serverless cloud compute invocation.
   - **Neon Realtime**: Live query subscriptions and sealed query tokens.
