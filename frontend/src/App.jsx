import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Pages
import RegisterPage from './pages/RegisterPage';
import ScanPage from './pages/ScanPage';
import DisplayPage from './pages/DisplayPage';

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import LiveAttendance from './pages/admin/LiveAttendance';
import StudentRoster from './pages/admin/StudentRoster';
import AdminSettings from './pages/admin/AdminSettings';

// Protected Route Guard for Admin views
function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Student Registration (Guarded by static secret QR key) */}
        <Route path="/register" element={<RegisterPage />} />

        {/* Student Attendance Marking (StudentID + UniquePIN) */}
        <Route path="/scan" element={<ScanPage />} />

        {/* Classroom Projector Display Screen (Dynamic QR + Rolling PIN) */}
        <Route path="/display" element={<DisplayPage />} />

        {/* Admin Authentication */}
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />


        {/* Admin Management Dashboard */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedAdminRoute>
              <AdminDashboard />
            </ProtectedAdminRoute>
          }
        />

        {/* Real-time Live Attendance Table */}
        <Route
          path="/admin/attendance"
          element={
            <ProtectedAdminRoute>
              <LiveAttendance />
            </ProtectedAdminRoute>
          }
        />

        {/* Student Roster View */}
        <Route
          path="/admin/students"
          element={
            <ProtectedAdminRoute>
              <StudentRoster />
            </ProtectedAdminRoute>
          }
        />

        {/* System Settings & Static QR View */}
        <Route
          path="/admin/settings"
          element={
            <ProtectedAdminRoute>
              <AdminSettings />
            </ProtectedAdminRoute>
          }
        />

        {/* Admin Navigation Alias Routes */}
        <Route path="/admin/overview" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/control-center" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/data" element={<Navigate to="/admin/students" replace />} />
        <Route path="/admin/roster" element={<Navigate to="/admin/students" replace />} />
        <Route path="/admin/student-roster" element={<Navigate to="/admin/students" replace />} />
        <Route path="/admin/live" element={<Navigate to="/admin/attendance" replace />} />
        <Route path="/admin/live-attendance" element={<Navigate to="/admin/attendance" replace />} />
        <Route path="/admin/live-roster" element={<Navigate to="/admin/attendance" replace />} />
        <Route path="/admin/users" element={<Navigate to="/admin/settings" replace />} />
        <Route path="/admin/user-management" element={<Navigate to="/admin/settings" replace />} />

        {/* Default route redirects to Student Scan page */}
        <Route path="/" element={<Navigate to="/scan" replace />} />
        <Route path="*" element={<Navigate to="/scan" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
