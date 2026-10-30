# 🎭 SPOTLIGHT Attendance System — SQLite Edition
### MVJ College of Engineering (MVJCE)

A high-performance, real-time student attendance and event verification system for **MVJ College of Engineering**, crafted to match the design aesthetic of the **[MVJCE Spotlight Portal](https://spotlight.webbywasp.com/)** and powered exclusively by **SQLite (`better-sqlite3`)** with persistent storage on **Fly.io** or local container runtime.

---

## 🏛️ Technology Stack & Architecture

| Layer | Component | Specification |
|---|---|---|
| **Frontend Framework** | React.js 18 + Vite | Single Page Application styled with Tailwind CSS |
| **Backend Runtime** | Node.js Express (CommonJS) | Modular REST API with production static file serving |
| **Database Engine** | **SQLite (`better-sqlite3`)** | WAL mode, synchronous NORMAL, 64MB RAM cache, busy timeout 5000ms |
| **Storage Architecture** | Persistent NVMe Volume | Persistent `/data` volume mounted on Fly.io |
| **Authentication** | JWT + Bcrypt | Role-Based Access Control (Super Admin, Attendance Mgr, QR Mgr) |
| **Live QR Engine** | Randomized 30-35s rotation | UUIDv4 tokens + 6-digit PIN with dynamic/static freeze toggle |
| **Deployment Target** | **Fly.io Persistent Volume** | Multi-stage Docker container |
| **Repository** | GitHub Origin | `https://github.com/Mohammed-Zaahid-Yassin/-Attendance-System-.git` |

---

## ⚡ Key Features (All 16 Supported)

1. **MVJCE Institutional Branding**: MVJCE crest, National Informatics Centre (NIC) attribution, and Spotlight design system.
2. **JWT Authentication & Passwords**: Multi-admin sessions, token verification, and secure password updates.
3. **Role-Based Access Control (RBAC)**: Dedicated permissions for Super Admin, Attendance Manager, QR Manager, and Custom staff.
4. **Dynamic Rotating Anti-Proxy QR**: 30-35 second window randomized refresh preventing code forwarding.
5. **Static QR Mode**: Freezes auditorium screen code for 24 hours without rotation on demand.
6. **Unique 6-Digit Rotating PIN**: Prevents student attendance marking without auditorium visual presence.
7. **Dual-Mode Geofencing**: Circle radius (meters) and Ray-Casting 4-corner polygon boundary validation.
8. **Formula Student ID Generation**: Standardized ID: `NAME[0:4] + MOBILE[-4:]` (e.g. `MOHA3210`).
9. **Permanent Static Registration QR**: High-resolution SVG/PNG QR with permanent canonical domain.
10. **Live Attendance Stream**: Real-time counter and attendee roster feed during active sessions.
11. **Manual Attendance Override**: Admin override for device/scan errors with immediate database sync.
12. **Unregistered Walk-In Reconciliation**: Immediate permanent roster creation and atomic attendance recording.
13. **Student Roster Management**: Full search, department/year filtering, student editing, and deletion.
14. **CSV Export Engine**: Instant download with customized filename tags (Subject-Dept-Year).
15. **Excel XLSX Export Engine**: Formatted spreadsheets with auto-sized column widths.
16. **Auditorium Venue & Preset Management**: Persistent auditorium GPS coordinates and preset location management.

---

## 📦 Local Development

```bash
# 1. Install dependencies
npm install
npm --prefix frontend install
npm --prefix backend install

# 2. Run Backend
npm run dev

# 3. Run Frontend
cd frontend && npm run dev
```

---

## 🧪 Testing

```bash
# Run comprehensive SQLite test suite
npm --prefix backend test
```
