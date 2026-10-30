# Changelog — Spotlight Attendance System (SQLite Edition)

All notable changes to this project are documented in this file.
This edition is strictly and exclusively dedicated to SQLite (`better-sqlite3`) and persistent volume architecture.

## [sqlite-v1.0.0] - 2026-10-30

### Initial Pure SQLite Architecture Release

#### Architectural Separation & Isolation
- **Exclusive Database Engine**: Standardized completely on **SQLite (`better-sqlite3`)** operating in WAL mode (`PRAGMA journal_mode = WAL`).
- **Complete Purge of PostgreSQL / Neon**:
  - Removed `pg`, `@neondatabase/serverless`, `@neon/*`, and AWS S3 SDK packages.
  - Deleted `backend/neon/` directory and `.neon`, `hello.ts`, `neon.ts`.
  - Removed all Neon sync hooks from `backend/routes/admin.js`, `backend/routes/attendance.js`, and `backend/index.js`.
- **Repository Isolation**: Directed exclusively to GitHub repository:
  `https://github.com/Mohammed-Zaahid-Yassin/-Attendance-System-.git` (`origin` remote).
- **Persistent Volume Architecture**:
  - Configured for **Fly.io** deployment with persistent NVMe volume mounted at `/data` (`DB_PATH=/data/attendance.db`).
  - Added auto-creation of parent storage directories in `backend/db.js`.
  - Production multi-stage `Dockerfile` and `fly.toml` configuration with automated health checks.

#### Application Enhancements & Feature Parity
- **Feature Parity**: Complete preservation of all 16 core features:
  1. MVJCE & National Informatics Centre (NIC) Institutional Branding.
  2. JWT Authentication with Bcrypt password hashing.
  3. Role-Based Access Control (RBAC): `super_admin`, `attendance_manager`, `qr_manager`, `custom`.
  4. Dynamic Rotating Anti-Proxy QR (30-35s randomized expiration).
  5. Static QR Mode for auditorium screens (24h freeze, instant toggle).
  6. Unique 6-Digit Rotating PIN authentication and bypass toggle.
  7. High-Precision Geofencing (Haversine circular radius and Ray-Casting Point-in-Polygon).
  8. Student Self-Registration via physical static QR code with formula-based Student ID generation.
  9. Permanent Static Registration QR code display in Admin portal.
  10. Real-time Live Attendance feed with registered/unregistered counters.
  11. Manual Attendance Override with student search and duplicate prevention.
  12. Manual Unregistered Walk-in with atomic permanent roster creation and attendance recording.
  13. Student Roster Management (LIKE search, year/department filter, edit, delete).
  14. CSV Report Export with clean filenames and custom headers.
  15. Excel XLSX Export with formatted cell widths.
  16. Auditorium Venue Config and Multi-Location Preset Management.

