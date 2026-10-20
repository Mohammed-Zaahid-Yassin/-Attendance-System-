import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
  Users, 
  Radio, 
  StopCircle, 
  ExternalLink, 
  MapPin, 
  Sparkles,
  QrCode,
  Copy,
  Check,
  Download,
  KeyRound,
  Shield,
  Layers,
  ChevronDown,
  Navigation
} from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // New Session Form State
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [hourNumber, setHourNumber] = useState('1');
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [pinRequired, setPinRequired] = useState(true);

  // 4 Coordinates for Auditorium Geofence
  const [corners, setCorners] = useState([
    { name: 'Corner 1 (NW)', lat: '', lng: '' },
    { name: 'Corner 2 (NE)', lat: '', lng: '' },
    { name: 'Corner 3 (SE)', lat: '', lng: '' },
    { name: 'Corner 4 (SW)', lat: '', lng: '' }
  ]);

  // Static QR Code data for student registration
  const [staticQrData, setStaticQrData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Active session being edited for 4-corner coordinates
  const [editingCornersSessionId, setEditingCornersSessionId] = useState(null);
  const [activeSessionCorners, setActiveSessionCorners] = useState([
    { name: 'Corner 1 (NW)', lat: '', lng: '' },
    { name: 'Corner 2 (NE)', lat: '', lng: '' },
    { name: 'Corner 3 (SE)', lat: '', lng: '' },
    { name: 'Corner 4 (SW)', lat: '', lng: '' }
  ]);

  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');

  const token = localStorage.getItem('admin_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  const fetchStatsAndSessions = async () => {
    try {
      const res = await axios.get('/api/admin/stats', axiosConfig);
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStaticRegistrationQR = async () => {
    try {
      const res = await axios.get('/api/admin/registration-qr', axiosConfig);
      setStaticQrData(res.data);
    } catch (err) {
      console.error('Error fetching registration QR:', err);
    }
  };

  useEffect(() => {
    fetchStatsAndSessions();
    fetchStaticRegistrationQR();
    const interval = setInterval(fetchStatsAndSessions, 4000);
    return () => clearInterval(interval);
  }, []);

  // Helper to capture current GPS for a specific corner in the creation form
  const handleCaptureGpsForCorner = (index) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCorners((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              lat: pos.coords.latitude.toFixed(6),
              lng: pos.coords.longitude.toFixed(6)
            };
            return next;
          });
          setGeoEnabled(true);
        },
        (err) => {
          alert('GPS error: ' + err.message);
        },
        { enableHighAccuracy: true }
      );
    }
  };

  // Helper to capture current GPS for a corner in the active session editor
  const handleCaptureGpsForActiveCorner = (index) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setActiveSessionCorners((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              lat: pos.coords.latitude.toFixed(6),
              lng: pos.coords.longitude.toFixed(6)
            };
            return next;
          });
        },
        (err) => {
          alert('GPS error: ' + err.message);
        },
        { enableHighAccuracy: true }
      );
    }
  };

  // Start new session
  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!subjectName.trim()) return;

    setCreating(true);
    setMsg('');

    try {
      // Validate corners if geoEnabled
      const validCorners = corners.filter((c) => c.lat && c.lng);

      const payload = {
        subject_name: subjectName.trim(),
        subject_code: subjectCode.trim(),
        hour_number: parseInt(hourNumber, 10),
        geo_fence_enabled: geoEnabled,
        geo_corners: validCorners.length >= 3 ? validCorners : null,
        geo_lat: validCorners.length > 0 ? validCorners[0].lat : null,
        geo_lng: validCorners.length > 0 ? validCorners[0].lng : null,
        geo_radius_m: 100,
        pin_required: pinRequired
      };

      await axios.post('/api/admin/sessions/start', payload, axiosConfig);
      setMsg(`Session started: ${subjectName} (Hour ${hourNumber})`);
      setSubjectName('');
      setSubjectCode('');
      fetchStatsAndSessions();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to start session');
    } finally {
      setCreating(false);
    }
  };

  // Stop session
  const handleStopSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to end this attendance session?')) return;
    try {
      await axios.post(`/api/admin/sessions/${sessionId}/stop`, {}, axiosConfig);
      fetchStatsAndSessions();
    } catch (err) {
      alert('Failed to stop session: ' + (err.response?.data?.error || err.message));
    }
  };

  // Toggle 1: On-the-fly Geofence Toggle
  const handleToggleGeofence = async (session) => {
    try {
      const res = await axios.patch(`/api/admin/sessions/${session.id}/toggle-geofence`, {}, axiosConfig);
      fetchStatsAndSessions();
    } catch (err) {
      alert('Error toggling geofence: ' + (err.response?.data?.error || err.message));
    }
  };

  // Toggle 2: On-the-fly Unique PIN Toggle
  const handleTogglePin = async (session) => {
    try {
      const res = await axios.patch(`/api/admin/sessions/${session.id}/toggle-pin`, {}, axiosConfig);
      fetchStatsAndSessions();
    } catch (err) {
      alert('Error toggling PIN requirement: ' + (err.response?.data?.error || err.message));
    }
  };

  // Open 4-corner modal / editor for an active session
  const handleOpenCornerEditor = (session) => {
    setEditingCornersSessionId(session.id);
    if (session.geo_corners) {
      try {
        const parsed = typeof session.geo_corners === 'string' ? JSON.parse(session.geo_corners) : session.geo_corners;
        if (Array.isArray(parsed) && parsed.length >= 4) {
          setActiveSessionCorners(parsed);
          return;
        }
      } catch {}
    }
    setActiveSessionCorners([
      { name: 'Corner 1 (NW)', lat: session.geo_lat || '', lng: session.geo_lng || '' },
      { name: 'Corner 2 (NE)', lat: '', lng: '' },
      { name: 'Corner 3 (SE)', lat: '', lng: '' },
      { name: 'Corner 4 (SW)', lat: '', lng: '' }
    ]);
  };

  // Save 4-corner polygon to active session
  const handleSaveActiveCorners = async () => {
    if (!editingCornersSessionId) return;
    try {
      await axios.patch(`/api/admin/sessions/${editingCornersSessionId}/geofence`, {
        enabled: true,
        corners: activeSessionCorners
      }, axiosConfig);
      setEditingCornersSessionId(null);
      fetchStatsAndSessions();
      alert('Auditorium 4-corner coordinates updated successfully!');
    } catch (err) {
      alert('Failed to update coordinates: ' + (err.response?.data?.error || err.message));
    }
  };

  // Copy Static QR URL
  const handleCopyLink = async () => {
    if (staticQrData?.url) {
      const ok = await copyToClipboard(staticQrData.url);
      if (ok) {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  };

  const activeSessions = (stats?.recent_sessions || []).filter((s) => s.is_active === 1);

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">
                Control Center
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Lecture & Event <span className="italic text-amber-400">Dashboard.</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/display"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(240,150,80,0.35)] bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Projector Screen</span>
            </a>
          </div>
        </div>

        {/* Stats Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
              Total Enrolled Students
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-[#f5f0ea]">
              {loading ? '...' : stats?.total_students || 0}
            </div>
            <p className="mt-1 text-[11px] text-[#706860]">
              In database roster
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#15110d] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
              Active Sessions
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-amber-400">
              {loading ? '...' : stats?.active_sessions || 0}
            </div>
            <p className="mt-1 text-[11px] text-[#706860]">
              Currently broadcasting dynamic QR
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
              Today's Attendance Logs
            </div>
            <div className="mt-2 font-mono text-3xl font-bold text-emerald-400">
              {loading ? '...' : stats?.today_attendance || 0}
            </div>
            <p className="mt-1 text-[11px] text-[#706860]">
              Verified attendee entries
            </p>
          </div>

          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
              Anti-Proxy Cycle
            </div>
            <div className="mt-2 font-mono text-2xl font-bold text-[#f5f0ea]">
              20 Seconds
            </div>
            <p className="mt-1 text-[11px] text-[#706860]">
              Dynamic token & PIN rotation
            </p>
          </div>
        </div>

        {/* Section 1: Active Sessions & Quick On-The-Fly Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-2xl font-normal text-[#f5f0ea]">
              Active Auditorium Sessions ({activeSessions.length})
            </h2>
            <span className="text-xs text-[#a39b94]">
              Instant controls for Geofence & PIN requirement
            </span>
          </div>

          {activeSessions.length === 0 ? (
            <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 text-center text-xs text-[#a39b94]">
              No active sessions running right now. Use the form below to start an Hour 1–5 session.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activeSessions.map((session) => {
                const isGeoOn = session.geo_fence_enabled === 1;
                const isPinOn = session.pin_required !== 0;

                return (
                  <div
                    key={session.id}
                    className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#14110e] p-5 sm:p-6 shadow-xl space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                            Broadcasting Live
                          </span>
                          <span className="font-mono text-xs text-amber-400 font-bold">
                            Hour {session.hour_number}
                          </span>
                        </div>
                        <h3 className="font-serif text-xl font-normal text-[#f5f0ea] mt-1">
                          {session.subject_name}
                          {session.subject_code && (
                            <span className="ml-2 font-mono text-xs text-[#a39b94]">
                              [{session.subject_code}]
                            </span>
                          )}
                        </h3>
                      </div>

                      {/* Headcount & Stop Action */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 rounded-full border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3.5 py-1.5 text-xs text-[#f5f0ea]">
                          <Users className="h-3.5 w-3.5 text-amber-400" />
                          <span className="font-mono font-bold">{session.attendance_count || 0}</span>
                          <span className="text-[#a39b94]">Attended</span>
                        </div>

                        <a
                          href="/display"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500/50"
                        >
                          Projector View ↗
                        </a>

                        <button
                          type="button"
                          onClick={() => handleStopSession(session.id)}
                          className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                        >
                          <StopCircle className="h-3.5 w-3.5" />
                          <span>End Session</span>
                        </button>
                      </div>
                    </div>

                    {/* On-The-Fly Emergency Toggles (As requested by user!) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-[rgba(255,235,215,0.06)]">
                      {/* TOGGLE 1: GEOFENCE ON/OFF */}
                      <div className="flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#f5f0ea]">
                              Toggle 1: Auditorium Geofence
                            </span>
                          </div>
                          <p className="text-[11px] text-[#a39b94]">
                            {isGeoOn
                              ? 'Active (4-corner boundary enforced)'
                              : 'Disabled (GPS bypassed for students)'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleGeofence(session)}
                            className={`min-h-[36px] rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                              isGeoOn
                                ? 'bg-amber-500 text-[#080605] shadow-amber-glow'
                                : 'bg-[#201c18] border border-[rgba(255,235,215,0.15)] text-[#a39b94]'
                            }`}
                          >
                            {isGeoOn ? 'ENABLED' : 'DISABLED'}
                          </button>
                        </div>
                      </div>

                      {/* TOGGLE 2: UNIQUE PIN ON/OFF */}
                      <div className="flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#f5f0ea]">
                              Toggle 2: Screen PIN Key
                            </span>
                          </div>
                          <p className="text-[11px] text-[#a39b94]">
                            {isPinOn
                              ? 'Active (6-digit screen PIN required)'
                              : 'Bypassed (Students submit with QR only)'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleTogglePin(session)}
                            className={`min-h-[36px] rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                              isPinOn
                                ? 'bg-amber-500 text-[#080605] shadow-amber-glow'
                                : 'bg-[#201c18] border border-[rgba(255,235,215,0.15)] text-[#a39b94]'
                            }`}
                          >
                            {isPinOn ? 'ENABLED' : 'BYPASSED'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Geofence Corner Coordinates Management Button */}
                    <div className="flex items-center justify-between pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenCornerEditor(session)}
                        className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-medium underline"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>Manage 4-Corner Polygon Coordinates for this Auditorium</span>
                      </button>

                      <span className="text-[11px] text-[#706860]">
                        If students inside report GPS issues, click "DISABLED" above and ask them to refresh!
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: Edit 4 Corners for Active Session */}
        {editingCornersSessionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-4">
                <div>
                  <h3 className="font-serif text-xl font-normal text-[#f5f0ea]">
                    Auditorium 4-Corner Coordinates
                  </h3>
                  <p className="text-xs text-[#a39b94]">
                    Define the 4 boundary vertices of the auditorium / venue
                  </p>
                </div>
                <button
                  onClick={() => setEditingCornersSessionId(null)}
                  className="rounded-full p-1 text-[#a39b94] hover:text-[#f5f0ea]"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {activeSessionCorners.map((corner, idx) => (
                  <div key={idx} className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-400">{corner.name}</span>
                      <button
                        type="button"
                        onClick={() => handleCaptureGpsForActiveCorner(idx)}
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,235,215,0.12)] bg-[#120f0d] px-2.5 py-1 text-[11px] text-[#f5f0ea] hover:border-amber-500"
                      >
                        <Navigation className="h-3 w-3 text-amber-400" />
                        <span>Use My GPS</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Latitude (e.g. 12.985640)"
                        value={corner.lat}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSessionCorners((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], lat: val };
                            return next;
                          });
                        }}
                        className="rounded-lg border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3 py-1.5 text-xs font-mono text-[#f5f0ea]"
                      />
                      <input
                        type="text"
                        placeholder="Longitude (e.g. 77.760120)"
                        value={corner.lng}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveSessionCorners((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], lng: val };
                            return next;
                          });
                        }}
                        className="rounded-lg border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3 py-1.5 text-xs font-mono text-[#f5f0ea]"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCornersSessionId(null)}
                  className="rounded-full border border-[rgba(255,235,215,0.1)] px-4 py-2 text-xs font-medium text-[#a39b94] hover:bg-[#181512]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveActiveCorners}
                  className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow"
                >
                  Save Coordinates
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Two Columns - Create Session Form & Static QR Code Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Session Form (2 Cols) */}
          <div className="lg:col-span-2 rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl">
            <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mb-1">
              Start a New Session
            </h2>
            <p className="text-xs text-[#a39b94] mb-6">
              Initialize dynamic anti-proxy QR code rotation for lecture or event attendance.
            </p>

            {msg && (
              <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs font-medium text-amber-300">
                {msg}
              </div>
            )}

            <form onSubmit={handleStartSession} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1.5">
                    Subject / Event Name <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Design & Analysis of Algorithms"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-sm text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1.5">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 21CS42"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 font-mono text-sm uppercase text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Hour Selection (1 to 5) */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1.5">
                  Class Hour (1 to 5)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {['1', '2', '3', '4', '5'].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHourNumber(h)}
                      className={`min-h-[40px] rounded-xl border py-2 text-xs font-semibold transition ${
                        hourNumber === h
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-bold'
                          : 'border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] hover:border-[rgba(255,235,215,0.2)] hover:text-[#f5f0ea]'
                      }`}
                    >
                      Hour {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Security Toggles for New Session */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Geofence Checkbox */}
                <label className="flex items-center gap-3 rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={geoEnabled}
                    onChange={(e) => setGeoEnabled(e.target.checked)}
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-[#f5f0ea]">Enable GPS Geofence</span>
                    <p className="text-[11px] text-[#706860]">Validate coordinates against 4 auditorium corners</p>
                  </div>
                </label>

                {/* Unique PIN Checkbox */}
                <label className="flex items-center gap-3 rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinRequired}
                    onChange={(e) => setPinRequired(e.target.checked)}
                    className="h-4 w-4 rounded accent-amber-500"
                  />
                  <div>
                    <span className="text-xs font-semibold text-[#f5f0ea]">Require Screen PIN</span>
                    <p className="text-[11px] text-[#706860]">Students must enter the rotating 6-digit key</p>
                  </div>
                </label>
              </div>

              {/* Optional 4-Corner Inputs in New Session Form */}
              {geoEnabled && (
                <div className="rounded-xl border border-[rgba(240,150,80,0.2)] bg-[#18130e] p-4 space-y-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 block">
                    Auditorium 4 Corners (GPS Coordinates)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {corners.map((c, i) => (
                      <div key={i} className="rounded-lg border border-[rgba(255,235,215,0.06)] bg-[#120f0d] p-2.5">
                        <div className="flex justify-between items-center text-[11px] mb-1.5">
                          <span className="text-[#a39b94] font-medium">{c.name}</span>
                          <button
                            type="button"
                            onClick={() => handleCaptureGpsForCorner(i)}
                            className="text-amber-400 hover:underline text-[10px]"
                          >
                            Set to Current GPS
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            placeholder="Lat"
                            value={c.lat}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCorners((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], lat: v };
                                return next;
                              });
                            }}
                            className="rounded border border-[rgba(255,235,215,0.08)] bg-[#181512] px-2 py-1 text-[11px] font-mono text-[#f5f0ea]"
                          />
                          <input
                            type="text"
                            placeholder="Lng"
                            value={c.lng}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCorners((prev) => {
                                const next = [...prev];
                                next[i] = { ...next[i], lng: v };
                                return next;
                              });
                            }}
                            className="rounded border border-[rgba(255,235,215,0.08)] bg-[#181512] px-2 py-1 text-[11px] font-mono text-[#f5f0ea]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full min-h-[46px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
              >
                {creating ? 'Starting Session...' : 'Start Session & Launch Dynamic QR'}
              </button>
            </form>
          </div>

          {/* Static Student Registration QR Card (User Requirement!) */}
          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-400 mb-2">
                <QrCode className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Static Registration QR
                </span>
              </div>
              <h3 className="font-serif text-xl font-normal text-[#f5f0ea]">
                Student Enrollment Code
              </h3>
              <p className="mt-1 text-xs text-[#a39b94] leading-relaxed">
                This is the single permanent static QR code for students to register their profile. It is visible only in this Admin Control Center.
              </p>

              <div className="mt-6 flex flex-col items-center">
                {staticQrData?.qr_code ? (
                  <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-lg">
                    <img
                      src={staticQrData.qr_code}
                      alt="Confidential Student Registration Static QR"
                      className="h-44 w-44 object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-[#181512] text-xs text-[#706860]">
                    Generating static QR...
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] py-2.5 text-xs font-semibold text-[#f5f0ea] hover:border-amber-500 transition"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Copy Registration Link'}</span>
              </button>

              {staticQrData?.qr_code && (
                <a
                  href={staticQrData.qr_code}
                  download="MVJCE_Student_Registration_Static_QR.png"
                  className="w-full flex items-center justify-center gap-2 rounded-full border border-[rgba(240,150,80,0.3)] bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Print-Ready QR</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
