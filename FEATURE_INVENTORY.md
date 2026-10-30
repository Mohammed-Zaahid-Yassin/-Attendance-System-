# Spotlight Attendance — Complete Feature Inventory & Audit Matrix

This document provides an exhaustive inventory of every feature implemented in the MVJ College of Engineering — Spotlight Attendance System, tracking its implementation, verification requirements, and status across the **PostgreSQL (NeonDB)** and **SQLite (better-sqlite3)** editions.

---

## Feature Matrix

| # | Feature Name | Original Status | Frontend Components | Backend Routes / Tables | PostgreSQL Edition Status | SQLite Edition Status |
|---|---|---|---|---|---|---|
| **1** | **Branding & Visual Design** | Fully Working | `Branding.jsx`, `AdminLayout.jsx`, index.html | N/A (Static presentation) | Preserved | Preserved |
| **2** | **Admin Authentication & JWT** | Fully Working | `AdminLogin.jsx`, `AdminLayout.jsx` | `POST /api/auth/login`, `GET /api/auth/verify`, `POST /api/auth/logout`<br>Table: `admins` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **3** | **RBAC & User Management** | Fully Working | `AdminSettings.jsx` (`AddUserModal`, `EditUserModal`) | `GET/POST/PUT/DELETE /api/admin/users`<br>Table: `admins` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **4** | **Student Self-Registration** | Fully Working | `RegisterPage.jsx` | `POST /api/register`, `GET /api/registration-key/verify`<br>Table: `students` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **5** | **Student Roster Management** | Fully Working | `StudentRoster.jsx` | `GET/PUT/DELETE /api/admin/students`<br>Table: `students` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **6** | **Session Lifecycle & Toggles** | Fully Working | `AdminDashboard.jsx` | `POST /api/admin/sessions/start`, `POST /api/admin/sessions/:id/stop`, `PATCH /api/admin/sessions/:id/toggle-*`<br>Table: `sessions` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **7** | **Dynamic QR Token Engine** | Fully Working | `DisplayPage.jsx`, `ScanPage.jsx` | `GET /api/token/current/:id`<br>Engine: `cron/tokenRotator.js`<br>Table: `qr_tokens` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **8** | **Projector Display Screen** | Fully Working | `DisplayPage.jsx` | `GET /api/token/current/:id`<br>Table: `qr_tokens`, `sessions` | Preserved | Preserved |
| **9** | **Mobile QR Scanner** | Fully Working | `ScanPage.jsx` | `POST /api/scan`<br>Table: `qr_tokens`, `students`, `attendance` | Preserved | Preserved |
| **10** | **Anti-Proxy Duplicate Check** | Fully Working | `ScanPage.jsx` | `POST /api/attendance/mark`<br>Table: `attendance` (UNIQUE constraint) | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **11** | **Geofencing (Circle & Polygon)**| Fully Working | `VenueMapPicker.jsx`, `AdminSettings.jsx` | `middleware/geoCheck.js`<br>Tables: `venue_configs`, `saved_locations` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **12** | **Manual Attendance (Registered)**| Fully Working | `LiveAttendance.jsx` (`ManualMarkModal`) | `POST /api/admin/attendance/manual-mark`<br>Table: `attendance` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **13** | **Unregistered Student Walk-In** | Fully Working | `LiveAttendance.jsx` (`ManualUnregisteredModal`) | `POST /api/admin/attendance/manual-unregistered`<br>Tables: `students`, `attendance` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **14** | **Live Attendance Monitoring** | Fully Working | `LiveAttendance.jsx` | `GET /api/attendance/live/:id`<br>Tables: `attendance`, `students` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **15** | **Reports & File Exports (CSV/XLSX)**| Fully Working | `LiveAttendance.jsx` | `GET /api/attendance/export/:id`, `GET /api/attendance/export-xlsx/:id`<br>Tables: `attendance`, `students`, `sessions` | Active (PostgreSQL `pg`) | Active (SQLite `better-sqlite3`) |
| **16** | **Fullscreen Registration QR** | Fully Working | `FullscreenRegistrationModal.jsx`, `AdminSettings.jsx` | `GET /api/admin/registration-qr`<br>Helper: `qrcode` | Preserved | Preserved |

---

## Feature Specifications & Verification Requirements

### 1. Branding & Visual Design
- **Requirements**: MVJ College of Engineering and NIC Club dark theme (`#120f0d`, `#181512`, amber accents). Responsive layout from 360px mobile viewports to 4K projector displays.
- **Verification**: Clean visual rendering without layout clipping or horizontal scrolling on mobile.

### 2. Admin Authentication & Role-Based Access Control
- **Requirements**: Login with username and hashed password (`bcryptjs`). Issues signed JWT token. Four access tiers: `super_admin`, `attendance_manager`, `qr_manager`, and `custom`. Primary administrator (`admin`, ID: 1) is permanent and protected against deactivation, demotion, or deletion.
- **Verification**: Unauthorized API calls return HTTP 401; insufficient privileges return HTTP 403; primary admin mutation returns HTTP 403.

### 3. Student Registration & Formula-Based Student IDs
- **Requirements**: Student ID generation formula: first 4 uppercase characters of student name + last 4 digits of phone number (e.g. "Mohammed Zaahid" + "9876549870" &rarr; `MOHA9870`). Self-registration protected by static key.
- **Verification**: Roster query retrieves newly registered student; duplicate USN or phone number is rejected.

### 4. Dynamic Rotating QR Attendance & Security PIN
- **Requirements**: Authoritative server-side rolling tokens valid for 30–35 seconds (30s base + 0–5s jitter). Projector display updates synchronously without page refresh. 6-digit PIN displayed on projector required for student check-in.
- **Verification**: Expired tokens rejected with HTTP 400; incorrect PIN rejected; duplicate check-in rejected with HTTP 409.

### 5. Geofencing (Circular & Multi-Point Polygon)
- **Requirements**:
  - Circular geofence calculated using Haversine spherical distance formula.
  - User-configurable polygon boundary (4 to 20 vertices) verified via ray-casting point-in-polygon algorithm.
  - Emergency toggle allows administrators to bypass geofence requirements instantly during GPS outages.
- **Verification**: Coordinates outside fence boundary rejected with HTTP 403 unless geofence toggle is deactivated.

### 6. Unregistered Student Walk-In & Immediate Roster Reconciliation
- **Requirements**: When an authorized administrator marks attendance for an unregistered walk-in student:
  1. The system creates a permanent student record in `students` with `is_registered = 1` and calculated `student_id`.
  2. The system records attendance for the current session in `attendance` in the same transaction.
  3. The student becomes immediately available in the registered student manual portal for all subsequent sessions.
- **Verification**: Student is marked present in current session; querying `students` shows the student with `is_registered = 1`; subsequent manual attendance lookup succeeds immediately.

### 7. Export Formatting
- **Requirements**: Generates dynamic filenames formatted as `<Subject>_<Department>_<Year>.<ext>`. Export sorted by Department and Year.
- **Verification**: Exported XLSX/CSV files contain accurate timestamps, USNs, names, departments, and verification metadata.

