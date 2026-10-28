import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import VenueMapPicker from '../../components/VenueMapPicker';
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
import { QrNicOverlay } from '../../components/Branding';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // New Session Form State
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [hourNumber, setHourNumber] = useState('1');
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [pinRequired, setPinRequired] = useState(true);
  const [startStaticQr, setStartStaticQr] = useState(false);

  // Saved Locations for Geofencing (Choose from 4-5 preset locations or custom map)
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedSavedLocId, setSelectedSavedLocId] = useState('');
  const [useCustomLocation, setUseCustomLocation] = useState(false);
  const [customGeoType, setCustomGeoType] = useState('circle'); // 'circle' | 'polygon'
  const [customLat, setCustomLat] = useState(12.985300);
  const [customLng, setCustomLng] = useState(77.762465);
  const [customRadius, setCustomRadius] = useState(100);
  const [saveCustomAsPreset, setSaveCustomAsPreset] = useState(false);
  const [customPresetName, setCustomPresetName] = useState('');

  // Active session being edited for Geofence (3 options: 1. Saved locations, 2. Map, 3. GPS)
  const [editingGeofenceSession, setEditingGeofenceSession] = useState(null);
  const [geofenceEditTab, setGeofenceEditTab] = useState('saved'); // 'saved' | 'map' | 'gps'
  const [editSavedLocId, setEditSavedLocId] = useState('');
  const [editMapLat, setEditMapLat] = useState(12.985300);
  const [editMapLng, setEditMapLng] = useState(77.762465);
  const [editMapRadius, setEditMapRadius] = useState(100);
  const [editMapType, setEditMapType] = useState('circle');
  const [editGpsLat, setEditGpsLat] = useState(null);
  const [editGpsLng, setEditGpsLng] = useState(null);
  const [editGpsRadius, setEditGpsRadius] = useState(100);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [saveEditAsPreset, setSaveEditAsPreset] = useState(false);
  const [editPresetName, setEditPresetName] = useState('');

  // Static QR Code data for student registration
  const [staticQrData, setStaticQrData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

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

  const fetchSavedLocations = async () => {
    try {
      const res = await axios.get('/api/admin/saved-locations', axiosConfig);
      const list = res.data.locations || [];
      setSavedLocations(list);
      if (list.length > 0 && !selectedSavedLocId) {
        const def = list.find((l) => l.is_default) || list[0];
        setSelectedSavedLocId(String(def.id));
        setEditSavedLocId(String(def.id));
      }
    } catch (err) {
      console.error('Error fetching saved locations:', err);
    }
  };

  const fetchStaticRegistrationQR = async () => {
    try {
      const originParam = encodeURIComponent(window.location.origin);
      const res = await axios.get(`/api/admin/registration-qr?origin=${originParam}`, axiosConfig);
      setStaticQrData(res.data);
    } catch (err) {
      console.error('Error fetching registration QR:', err);
    }
  };

  useEffect(() => {
    fetchStatsAndSessions();
    fetchSavedLocations();
    fetchStaticRegistrationQR();
    const interval = setInterval(fetchStatsAndSessions, 4000);
    return () => clearInterval(interval);
  }, []);

  // Capture current GPS for Tab 3 in Geofence Editor
  const handleCaptureCurrentGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your browser');
      return;
    }

    setIsCapturingGps(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setEditGpsLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setEditGpsLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setIsCapturingGps(false);
      },
      (err) => {
        setIsCapturingGps(false);
        setGpsError('Failed to capture GPS: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Start new session
  const handleStartSession = async (e) => {
    e.preventDefault();
    if (!subjectName.trim()) return;

    setCreating(true);
    setMsg('');

    try {
      let payload = {
        subject_name: subjectName.trim(),
        subject_code: subjectCode.trim(),
        hour_number: parseInt(hourNumber, 10),
        geo_fence_enabled: geoEnabled ? 1 : 0,
        pin_required: pinRequired,
        static_qr_mode: startStaticQr ? 1 : 0
      };

      if (geoEnabled) {
        if (useCustomLocation) {
          payload.geo_lat = customLat;
          payload.geo_lng = customLng;
          payload.geo_radius_m = customRadius;

          // Save custom location as a new preset if selected
          if (saveCustomAsPreset && customPresetName.trim()) {
            await axios.post(
              '/api/admin/saved-locations',
              {
                name: customPresetName.trim(),
                type: customGeoType,
                geo_lat: customLat,
                geo_lng: customLng,
                geo_radius_m: customRadius
              },
              axiosConfig
            );
            fetchSavedLocations();
          }
        } else {
          payload.saved_location_id = parseInt(selectedSavedLocId, 10);
        }
      }

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

  // Toggle 3: On-the-fly Static QR Mode Toggle
  const handleToggleStaticQr = async (session) => {
    try {
      const isCurrentlyStatic = Number(session.static_qr_mode) === 1 || session.static_qr_mode === true;
      await axios.patch(`/api/admin/sessions/${session.id}/toggle-static-qr`, {
        enabled: !isCurrentlyStatic
      }, axiosConfig);
      fetchStatsAndSessions();
    } catch (err) {
      alert('Error toggling static QR mode: ' + (err.response?.data?.error || err.message));
    }
  };

  // Open Geofence Editor for an active session with 3 options:
  // 1. Saved locations, 2. Interactive Map, 3. Current GPS Location
  const handleOpenGeofenceEditor = (session) => {
    setEditingGeofenceSession(session);
    setGeofenceEditTab('saved');
    if (savedLocations.length > 0) {
      setEditSavedLocId(String(savedLocations[0].id));
    }
    setEditMapLat(session.geo_lat || 12.985300);
    setEditMapLng(session.geo_lng || 77.762465);
    setEditMapRadius(session.geo_radius_m || 100);
    setEditMapType(session.geo_corners ? 'polygon' : 'circle');
    setEditGpsLat(null);
    setEditGpsLng(null);
    setEditGpsRadius(session.geo_radius_m || 100);
    setSaveEditAsPreset(false);
    setEditPresetName('');
    setGpsError('');
  };

  // Save Geofence changes to active session
  const handleSaveActiveGeofence = async () => {
    if (!editingGeofenceSession) return;
    try {
      let payload = { enabled: true };

      if (geofenceEditTab === 'saved') {
        payload.saved_location_id = parseInt(editSavedLocId, 10);
      } else if (geofenceEditTab === 'map') {
        payload.lat = editMapLat;
        payload.lng = editMapLng;
        payload.radius = editMapRadius;
        if (editMapType === 'polygon' && editingGeofenceSession.geo_corners) {
          payload.corners = editingGeofenceSession.geo_corners;
        }

        if (saveEditAsPreset && editPresetName.trim()) {
          await axios.post(
            '/api/admin/saved-locations',
            {
              name: editPresetName.trim(),
              type: editMapType,
              geo_lat: editMapLat,
              geo_lng: editMapLng,
              geo_radius_m: editMapRadius
            },
            axiosConfig
          );
          fetchSavedLocations();
        }
      } else if (geofenceEditTab === 'gps') {
        if (!editGpsLat || !editGpsLng) {
          alert('Please click "Capture My Current GPS" first to acquire coordinates.');
          return;
        }
        payload.lat = editGpsLat;
        payload.lng = editGpsLng;
        payload.radius = editGpsRadius;

        if (saveEditAsPreset && editPresetName.trim()) {
          await axios.post(
            '/api/admin/saved-locations',
            {
              name: editPresetName.trim(),
              type: 'circle',
              geo_lat: editGpsLat,
              geo_lng: editGpsLng,
              geo_radius_m: editGpsRadius
            },
            axiosConfig
          );
          fetchSavedLocations();
        }
      }

      await axios.patch(`/api/admin/sessions/${editingGeofenceSession.id}/geofence`, payload, axiosConfig);
      setEditingGeofenceSession(null);
      fetchStatsAndSessions();
      alert('Geofence updated successfully!');
    } catch (err) {
      alert('Failed to update geofence: ' + (err.response?.data?.error || err.message));
    }
  };

  // Guaranteed static registration link and QR data
  const effectiveRegUrl = staticQrData?.url || (typeof window !== 'undefined' ? `${window.location.origin}/register?key=STATIC_REG_QR_KEY_SECRET_7890` : 'https://attendance-system-mvjce.vercel.app/register?key=STATIC_REG_QR_KEY_SECRET_7890');
  const displayQrSrc = staticQrData?.qr_code || `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(effectiveRegUrl)}`;

  // Copy Static QR URL
  const handleCopyLink = async () => {
    if (!effectiveRegUrl) return;
    const ok = await copyToClipboard(effectiveRegUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
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
              30 Seconds
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
                const isStaticQr = Number(session.static_qr_mode) === 1 || session.static_qr_mode === true;

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
                          href={`/display?session=${session.id}`}
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

                    {/* On-The-Fly Emergency Toggles */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-[rgba(255,235,215,0.06)]">
                      {/* TOGGLE 1: GEOFENCE ON/OFF */}
                      <div className="flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#f5f0ea]">
                              Geofence
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
                            {isGeoOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </div>

                      {/* TOGGLE 2: UNIQUE PIN ON/OFF */}
                      <div className="flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-amber-400" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#f5f0ea]">
                              Screen PIN
                            </span>
                          </div>
                          <p className="text-[11px] text-[#a39b94]">
                            {isPinOn
                              ? 'Active (6-digit screen PIN required)'
                              : 'Bypassed (QR scan only)'}
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
                            {isPinOn ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      </div>

                      {/* TOGGLE 3: STATIC QR MODE */}
                      <div className={`flex items-center justify-between rounded-xl border p-4 ${
                        isStaticQr
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-[rgba(255,235,215,0.08)] bg-[#181512]'
                      }`}>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <QrCode className={`h-4 w-4 ${isStaticQr ? 'text-emerald-400' : 'text-amber-400'}`} />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[#f5f0ea]">
                              Static QR
                            </span>
                          </div>
                          <p className="text-[11px] text-[#a39b94]">
                            {isStaticQr
                              ? 'Frozen — QR not rotating on screen'
                              : 'Dynamic — rotating every ~30s'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStaticQr(session)}
                            className={`min-h-[36px] rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                              isStaticQr
                                ? 'bg-emerald-500 text-[#080605]'
                                : 'bg-[#201c18] border border-[rgba(255,235,215,0.15)] text-[#a39b94]'
                            }`}
                          >
                            {isStaticQr ? 'FROZEN' : 'DYNAMIC'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Geofence Configuration & Edit Button */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleOpenGeofenceEditor(session)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>Configure / Edit Geofence (Presets, Map, or GPS)</span>
                      </button>

                      <span className="text-[11px] text-[#706860]">
                        {session.geo_fence_enabled ? 'Geofence active' : 'Geofence bypassed'} • If students report issues, toggle above
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: Edit Geofence for Active Session (3 Options) */}
        {editingGeofenceSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-2xl rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-6 my-8">
              <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-4">
                <div>
                  <h3 className="font-serif text-xl font-normal text-[#f5f0ea]">
                    Configure Geofence for Active Session
                  </h3>
                  <p className="text-xs text-[#a39b94] mt-0.5">
                    {editingGeofenceSession.subject_name} {editingGeofenceSession.subject_code ? `(${editingGeofenceSession.subject_code})` : ''} • Hour {editingGeofenceSession.hour_number}
                  </p>
                </div>
                <button
                  onClick={() => setEditingGeofenceSession(null)}
                  className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#1f1b17] hover:text-[#f5f0ea] transition"
                >
                  ✕
                </button>
              </div>

              {/* 3 Tab Switchers */}
              <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[#181512] border border-[rgba(255,235,215,0.08)]">
                <button
                  type="button"
                  onClick={() => setGeofenceEditTab('saved')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    geofenceEditTab === 'saved'
                      ? 'bg-amber-500 text-[#080605] shadow-sm'
                      : 'text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>1. Saved Locations</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGeofenceEditTab('map')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    geofenceEditTab === 'map'
                      ? 'bg-amber-500 text-[#080605] shadow-sm'
                      : 'text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>2. Pick on Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => setGeofenceEditTab('gps')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    geofenceEditTab === 'gps'
                      ? 'bg-amber-500 text-[#080605] shadow-sm'
                      : 'text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>3. Use Current GPS</span>
                </button>
              </div>

              {/* Tab 1: Saved Locations */}
              {geofenceEditTab === 'saved' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#a39b94]">
                    Select any pre-configured college venue or auditorium preset:
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {savedLocations.map((loc) => {
                      const isSelected = String(loc.id) === String(editSavedLocId);
                      return (
                        <div
                          key={loc.id}
                          onClick={() => setEditSavedLocId(String(loc.id))}
                          className={`cursor-pointer rounded-xl border p-3.5 transition flex items-center justify-between ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10'
                              : 'border-[rgba(255,235,215,0.08)] bg-[#181512] hover:border-[rgba(255,235,215,0.18)]'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#f5f0ea]">{loc.name}</span>
                              <span className="rounded-full bg-[#201c18] border border-[rgba(255,235,215,0.1)] px-2 py-0.5 text-[10px] uppercase font-semibold text-amber-400">
                                {loc.type || 'circle'}
                              </span>
                              {loc.is_default ? (
                                <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
                                  Default
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] font-mono text-[#a39b94]">
                              {loc.geo_lat}, {loc.geo_lng} • Radius: {loc.geo_radius_m || 100}m
                            </p>
                          </div>
                          <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-amber-500 bg-amber-500' : 'border-[rgba(255,235,215,0.2)]'
                          }`}>
                            {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-[#080605]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 2: Interactive Map */}
              {geofenceEditTab === 'map' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#a39b94]">Click or drag pin to choose center location:</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditMapType('circle')}
                        className={`px-2.5 py-1 text-xs rounded-lg border font-semibold ${
                          editMapType === 'circle'
                            ? 'bg-amber-500 text-[#080605] border-amber-500'
                            : 'border-[rgba(255,235,215,0.1)] text-[#a39b94]'
                        }`}
                      >
                        Circle Radius
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditMapType('polygon')}
                        className={`px-2.5 py-1 text-xs rounded-lg border font-semibold ${
                          editMapType === 'polygon'
                            ? 'bg-amber-500 text-[#080605] border-amber-500'
                            : 'border-[rgba(255,235,215,0.1)] text-[#a39b94]'
                        }`}
                      >
                        Campus Polygon
                      </button>
                    </div>
                  </div>

                  <div className="h-64 rounded-xl overflow-hidden border border-[rgba(255,235,215,0.12)]">
                    <VenueMapPicker
                      initialLat={editMapLat}
                      initialLng={editMapLng}
                      initialRadius={editMapRadius}
                      mode={editMapType}
                      onLocationChange={(coords) => {
                        setEditMapLat(coords.lat);
                        setEditMapLng(coords.lng);
                        if (coords.radius) setEditMapRadius(coords.radius);
                      }}
                    />
                  </div>

                  {editMapType === 'circle' && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-[#a39b94]">Geofence Radius:</span>
                        <span className="font-mono text-amber-400 font-bold">{editMapRadius} meters</span>
                      </div>
                      <input
                        type="range"
                        min="25"
                        max="500"
                        step="5"
                        value={editMapRadius}
                        onChange={(e) => setEditMapRadius(parseInt(e.target.value, 10))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#f5f0ea]">
                      <input
                        type="checkbox"
                        checked={saveEditAsPreset}
                        onChange={(e) => setSaveEditAsPreset(e.target.checked)}
                        className="rounded accent-amber-500"
                      />
                      <span>Save this location as a new preset</span>
                    </label>
                    {saveEditAsPreset && (
                      <input
                        type="text"
                        placeholder="Preset Name (e.g. MVJCE Mechanical Workshop)"
                        value={editPresetName}
                        onChange={(e) => setEditPresetName(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(255,235,215,0.12)] bg-[#120f0d] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Current GPS Location */}
              {geofenceEditTab === 'gps' && (
                <div className="space-y-4">
                  <p className="text-xs text-[#a39b94]">
                    Set the geofence to the exact physical coordinates where you are currently standing:
                  </p>

                  <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4 text-center space-y-3">
                    <button
                      type="button"
                      disabled={isCapturingGps}
                      onClick={handleCaptureCurrentGps}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
                    >
                      <Navigation className={`h-4 w-4 ${isCapturingGps ? 'animate-spin' : ''}`} />
                      <span>{isCapturingGps ? 'Acquiring GPS...' : 'Capture My Current GPS'}</span>
                    </button>

                    {editGpsLat && editGpsLng ? (
                      <div className="rounded-lg bg-[#120f0d] p-3 text-xs font-mono text-emerald-400 border border-emerald-500/20">
                        Latitude: <span className="text-[#f5f0ea]">{editGpsLat}</span> | Longitude: <span className="text-[#f5f0ea]">{editGpsLng}</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#706860]">
                        Click the button above to acquire high-accuracy GPS coordinates
                      </p>
                    )}

                    {gpsError && (
                      <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                        {gpsError}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#a39b94]">Geofence Radius:</span>
                      <span className="font-mono text-amber-400 font-bold">{editGpsRadius} meters</span>
                    </div>
                    <input
                      type="range"
                      min="25"
                      max="500"
                      step="5"
                      value={editGpsRadius}
                      onChange={(e) => setEditGpsRadius(parseInt(e.target.value, 10))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#f5f0ea]">
                      <input
                        type="checkbox"
                        checked={saveEditAsPreset}
                        onChange={(e) => setSaveEditAsPreset(e.target.checked)}
                        className="rounded accent-amber-500"
                      />
                      <span>Save this location as a new preset</span>
                    </label>
                    {saveEditAsPreset && (
                      <input
                        type="text"
                        placeholder="Preset Name (e.g. My Current Classroom)"
                        value={editPresetName}
                        onChange={(e) => setEditPresetName(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(255,235,215,0.12)] bg-[#120f0d] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[rgba(255,235,215,0.08)]">
                <button
                  type="button"
                  onClick={() => setEditingGeofenceSession(null)}
                  className="rounded-full border border-[rgba(255,235,215,0.1)] px-5 py-2 text-xs font-medium text-[#a39b94] hover:bg-[#181512]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveActiveGeofence}
                  className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95"
                >
                  Apply to Active Session
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {/* Geofence Toggle */}
                <button
                  type="button"
                  onClick={() => setGeoEnabled((prev) => !prev)}
                  className={`flex items-center justify-between text-left rounded-xl border p-4 transition cursor-pointer select-none ${
                    geoEnabled
                      ? 'border-amber-500/50 bg-amber-500/10 shadow-amber-glow'
                      : 'border-[rgba(255,235,215,0.08)] bg-[#181512] hover:border-[rgba(255,235,215,0.2)]'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-[#f5f0ea] block">
                      Enable GPS Geofence
                    </span>
                    <p className="text-[11px] text-[#706860]">
                      Validate coordinates against chosen venue preset
                    </p>
                  </div>
                  {/* Visual Pill Switch with ON/OFF label */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      geoEnabled ? 'bg-amber-500' : 'bg-[#2a2420]'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        geoEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-wider ${
                      geoEnabled ? 'text-amber-400' : 'text-[#706860]'
                    }`}>
                      {geoEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </button>

                {/* Unique PIN Toggle */}
                <button
                  type="button"
                  onClick={() => setPinRequired((prev) => !prev)}
                  className={`flex items-center justify-between text-left rounded-xl border p-4 transition cursor-pointer select-none ${
                    pinRequired
                      ? 'border-amber-500/50 bg-amber-500/10 shadow-amber-glow'
                      : 'border-[rgba(255,235,215,0.08)] bg-[#181512] hover:border-[rgba(255,235,215,0.2)]'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-[#f5f0ea] block">
                      Require Screen PIN
                    </span>
                    <p className="text-[11px] text-[#706860]">
                      Students must enter the rotating 6-digit key
                    </p>
                  </div>
                  {/* Visual Pill Switch with ON/OFF label */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      pinRequired ? 'bg-amber-500' : 'bg-[#2a2420]'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        pinRequired ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-wider ${
                      pinRequired ? 'text-amber-400' : 'text-[#706860]'
                    }`}>
                      {pinRequired ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </button>

                {/* Static QR Toggle */}
                <button
                  type="button"
                  onClick={() => setStartStaticQr((prev) => !prev)}
                  className={`flex items-center justify-between text-left rounded-xl border p-4 transition cursor-pointer select-none ${
                    startStaticQr
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-lg'
                      : 'border-[rgba(255,235,215,0.08)] bg-[#181512] hover:border-[rgba(255,235,215,0.2)]'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <span className={`text-xs font-semibold block ${
                      startStaticQr ? 'text-emerald-400 font-bold' : 'text-[#f5f0ea]'
                    }`}>
                      Static QR Mode
                    </span>
                    <p className="text-[11px] text-[#706860]">
                      Frozen QR & PIN (no 30s rotation)
                    </p>
                  </div>
                  {/* Visual Pill Switch with ON/OFF label */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      startStaticQr ? 'bg-emerald-500' : 'bg-[#2a2420]'
                    }`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        startStaticQr ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </div>
                    <span className={`text-[10px] font-bold tracking-wider ${
                      startStaticQr ? 'text-emerald-400 font-bold' : 'text-[#706860]'
                    }`}>
                      {startStaticQr ? 'ON' : 'OFF'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Geofence Location Selection for New Session */}
              {geoEnabled && (
                <div className="rounded-xl border border-[rgba(240,150,80,0.25)] bg-[#18130e] p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[rgba(255,235,215,0.06)] pb-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                        Venue Geofence Location
                      </span>
                      <p className="text-[11px] text-[#a39b94]">
                        Select from 4-5 saved college presets or specify a custom map boundary
                      </p>
                    </div>

                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-[#f5f0ea] self-start sm:self-auto bg-[#120f0d] px-3 py-1.5 rounded-lg border border-[rgba(255,235,215,0.1)]">
                      <input
                        type="checkbox"
                        checked={useCustomLocation}
                        onChange={(e) => setUseCustomLocation(e.target.checked)}
                        className="rounded accent-amber-500"
                      />
                      <span>Custom Map / GPS</span>
                    </label>
                  </div>

                  {!useCustomLocation ? (
                    <div className="space-y-3">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                        Select Saved Location Preset
                      </label>
                      <select
                        value={selectedSavedLocId}
                        onChange={(e) => setSelectedSavedLocId(e.target.value)}
                        className="w-full rounded-xl border border-[rgba(255,235,215,0.15)] bg-[#120f0d] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                      >
                        {savedLocations.map((loc) => (
                          <option key={loc.id} value={loc.id} className="bg-[#120f0d] text-[#f5f0ea]">
                            {loc.name} ({loc.type === 'polygon' ? 'Polygon' : 'Circle'} • {loc.geo_radius_m || 100}m) {loc.is_default ? '★ Default' : ''}
                          </option>
                        ))}
                      </select>

                      {/* Details of chosen preset */}
                      {(() => {
                        const sel = savedLocations.find((l) => String(l.id) === String(selectedSavedLocId));
                        if (!sel) return null;
                        return (
                          <div className="rounded-lg bg-[#120f0d] p-3 text-[11px] text-[#a39b94] border border-[rgba(255,235,215,0.06)] flex items-center justify-between">
                            <div>
                              <span className="text-[#f5f0ea] font-medium">{sel.name}</span>
                              <p className="font-mono mt-0.5 text-[#88817a]">
                                Lat: {sel.geo_lat}, Lng: {sel.geo_lng}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-amber-400 font-bold">{sel.geo_radius_m || 100} meters</span>
                              <p className="text-[10px] uppercase font-semibold text-[#88817a]">{sel.type || 'circle'}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#a39b94]">Set custom boundary on map:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCustomGeoType('circle')}
                            className={`px-2.5 py-1 text-xs rounded-lg border font-semibold ${
                              customGeoType === 'circle'
                                ? 'bg-amber-500 text-[#080605] border-amber-500'
                                : 'border-[rgba(255,235,215,0.1)] text-[#a39b94]'
                            }`}
                          >
                            Circle
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomGeoType('polygon')}
                            className={`px-2.5 py-1 text-xs rounded-lg border font-semibold ${
                              customGeoType === 'polygon'
                                ? 'bg-amber-500 text-[#080605] border-amber-500'
                                : 'border-[rgba(255,235,215,0.1)] text-[#a39b94]'
                            }`}
                          >
                            Polygon
                          </button>
                        </div>
                      </div>

                      <div className="h-56 rounded-xl overflow-hidden border border-[rgba(255,235,215,0.1)]">
                        <VenueMapPicker
                          initialLat={customLat}
                          initialLng={customLng}
                          initialRadius={customRadius}
                          mode={customGeoType}
                          onLocationChange={(coords) => {
                            setCustomLat(coords.lat);
                            setCustomLng(coords.lng);
                            if (coords.radius) setCustomRadius(coords.radius);
                          }}
                        />
                      </div>

                      {customGeoType === 'circle' && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#a39b94]">Geofence Radius:</span>
                            <span className="font-mono text-amber-400 font-bold">{customRadius} meters</span>
                          </div>
                          <input
                            type="range"
                            min="25"
                            max="500"
                            step="5"
                            value={customRadius}
                            onChange={(e) => setCustomRadius(parseInt(e.target.value, 10))}
                            className="w-full accent-amber-500 cursor-pointer"
                          />
                        </div>
                      )}

                      <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer text-xs text-[#f5f0ea]">
                          <input
                            type="checkbox"
                            checked={saveCustomAsPreset}
                            onChange={(e) => setSaveCustomAsPreset(e.target.checked)}
                            className="rounded accent-amber-500"
                          />
                          <span>Save this location as a new preset</span>
                        </label>
                        {saveCustomAsPreset && (
                          <input
                            type="text"
                            placeholder="Preset Name (e.g. MVJCE Seminar Hall 3)"
                            value={customPresetName}
                            onChange={(e) => setCustomPresetName(e.target.value)}
                            className="w-full rounded-lg border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full min-h-[46px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
              >
                {creating ? 'Starting Session...' : (startStaticQr ? 'Start Session & Launch Static QR (Frozen)' : 'Start Session & Launch Dynamic QR')}
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
                <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-lg">
                  <div className="relative flex items-center justify-center">
                    <img
                      src={displayQrSrc}
                      alt="Confidential Student Registration Static QR"
                      className="h-44 w-44 object-contain block"
                    />
                    <QrNicOverlay />
                  </div>
                </div>
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

              <a
                href={displayQrSrc}
                download="MVJCE_Student_Registration_Static_QR.png"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-full border border-[rgba(240,150,80,0.3)] bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Print-Ready QR</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
