# 🎭 SPOTLIGHT Attendance System — MVJCE

A secure, real-time student attendance and event verification system for **MVJ College of Engineering (MVJCE)**, crafted to match the design aesthetic of the **[MVJCE Spotlight Portal](https://spotlight.webbywasp.com/)** and strictly adhere to anti-AI-slop design principles.

Built for high concurrency (**1,200+ simultaneous attendees**) on AWS using **React**, **Tailwind CSS**, **Node.js Express**, and **SQLite (`better-sqlite3`)** in WAL mode with a multi-stage **Docker** deployment.

---

## 🎨 Design Philosophy & Anti-AI Slop Compliance

The front-end is crafted to match the visual language of `spotlight.webbywasp.com`:
- **Color Palette**: Deep warm obsidian background (`#080605`), subtle warm hairline borders (`rgba(255,235,215,0.08)`), warm ivory typography (`#f5f0ea`), and Spotlight amber gradient pill buttons (`linear-gradient(135deg, #f09650, #d87e38)`).
- **Typography**: Authentic editorial headings with **Playfair Display** (combining regular serif with italic highlights), **Inter** for crisp body text, and **JetBrains Mono** for student codes and numbers.
- **Zero AI Clichés**: No floating sparkle emojis, no generic purple/indigo gradients, no fake bento boxes, no dummy loaders, no unstyled fallbacks, no single-file monolithic sprawl, and zero `console.log()` dummy submissions.
- **Strict Page Isolation**: The system guarantees zero cross-visibility between user roles. Students on registration cannot see attendance or admin pages; students marking attendance cannot see registration or admin pages; the projector screen is a dedicated presentation display; and admin controls are strictly authenticated.

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | **React.js** (Vite) | Responsive Mobile Web App & PWA |
| **Theme & Styling** | **Tailwind CSS** | Custom Spotlight tokens & Google Fonts (`Playfair Display`, `Inter`) |
| **QR Scanner** | **html5-qrcode** | HTML5 WebRTC camera APIs for mobile scanning |
| **Backend Runtime** | **Node.js + Express.js** | Modular REST API with production static file serving |
| **Database & Cache** | **SQLite (`better-sqlite3`)** | WAL mode, 64MB RAM cache, synchronous NORMAL, composite indexing |
| **Cron Engine** | **node-cron** | 19-20 second loop rotating dynamic anti-proxy QR tokens and 6-digit PINs |
| **Geofence Engine** | **Point-in-Polygon** | 4-corner auditorium boundary coordinates via Ray-Casting & Haversine |
| **Containerization** | **Multi-stage Docker** | Multi-stage builder + runtime container ready for AWS EC2/ECS/App Runner |

---

## 🚀 Key Functional Modules

### 1. Confidential Student Registration (`/register`)
- **Isolation Guard**: Accessible **ONLY** via the Admin's physical static QR code (`/register?key=SECRET`). Direct visits without the key show a restricted portal screen.
- **Form Fields**:
  - **Full Name** (compulsory)
  - **Mobile Number** (compulsory, 10 digits)
  - **Academic Year** (1st, 2nd, 3rd, 4th Year)
  - **Year-Conditional Inputs**:
    - **1st Year Students**: Asks for **Cycle** (`Physics Cycle` or `Chemistry Cycle`) and **Admission Number / USN**.
    - **2nd, 3rd, 4th Year Students**: Asks for **Department** (from official MVJCE Whitefield engineering departments list) and **USN**.
- **Real-Time Dynamic Student ID / Password Preview**:
  $$\text{StudentID} = \text{NAME}[0:4] (\text{ALL CAPS}) + \text{MOBILE}[-4:]$$
  *(e.g., "Mohammed Zaahid" + "9876543210" $\rightarrow$ `MOHA3210`)*.
- **Confirmation View**: Shows the official Student ID with a copy button and advisory to screenshot for attendance marking.

### 2. Zero-Dashboard Student Attendance (`/scan`)
- Students have **no login accounts or passwords**.
- Arrive directly via scanning the dynamic projector QR code (or use built-in camera scanner fallback).
- **Inputs**:
  1. **Student ID** (with prominent hint: *First 4 letters of your Name in CAPITAL + Last 4 digits of Mobile*).
  2. **6-Digit PIN** (conditionally enforced based on admin toggle).
- **Anti-Proxy Protection**:
  - Dynamic QR rotating every 20 seconds.
  - Paired 6-digit screen PIN.
  - GPS Geofence validation (checks against auditorium polygon if enabled).
  - Database-enforced `UNIQUE(session_id, student_id)` prevents repeat or proxy submissions.

### 3. Auditorium Projector Screen (`/display`)
- High-contrast screen designed for auditorium projectors.
- High-resolution dynamic QR code updating every 20 seconds.
- Large 6-digit screen PIN.
- 20-second visual countdown timer progress bar.
- Real-time live attendance headcount updating via live polling.
- Fullscreen toggle button.

### 4. Admin Control Center (`/admin`)
- **Session Management**: Start and stop 5 lecture/event hours.
- **Static Registration QR**: Dedicated card to view, copy link, and download the print-ready static QR code.
- **Auditorium 4-Corner Geofence**:
  - Input 4 coordinates (NW, NE, SE, SW) defining the auditorium boundary.
  - "Capture My GPS" helper button to lock in coordinates on-site.
- **On-The-Fly Emergency Toggles**:
  - **Toggle 1: Geofence Enable/Disable**: If attendees inside the auditorium face indoor GPS issues, admin flips this toggle to instantly bypass GPS blocking.
  - **Toggle 2: Screen PIN Enable/Disable**: If screen visibility in the back is obstructed, admin flips this toggle to allow QR-only submission.
- **Live Attendance Feed**: Real-time table polling, manual attendance override, and pure SQLite CSV export.
- **Student Roster**: Filter and search registered students across all departments and academic years.

---

## 🐳 Docker & AWS Deployment

### 1. Build and Run Locally
```bash
docker compose up -d --build
```
The application will be running on `http://localhost:3001` (or port 80).

### 2. AWS Production Hosting
See [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) for full AWS EC2, App Runner, ECS, and Nginx SSL setup instructions.

---

## 🔑 Default Credentials & Keys

- **Admin Username**: `admin`
- **Admin Password**: `admin123`
- **Registration Secret Key**: `STATIC_REG_QR_KEY_SECRET_7890`
- **Registration URL**: `http://localhost:5173/register?key=STATIC_REG_QR_KEY_SECRET_7890`
