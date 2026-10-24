import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import VenueMapPicker from '../../components/VenueMapPicker';
import { 
  QrCode, 
  KeyRound, 
  Download, 
  Copy, 
  Check, 
  Lock, 
  Sparkles,
  Printer,
  MapPin,
  Navigation,
  Save,
  CheckCircle2,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

export default function AdminSettings() {
  const [regData, setRegData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Persistent Venue Config state
  const [venueName, setVenueName] = useState('MVJCE Central Auditorium');
  const [geoLat, setGeoLat] = useState(12.983020);
  const [geoLng, setGeoLng] = useState(77.759970);
  const [geoRadius, setGeoRadius] = useState(100);
  const [mapplsKey, setMapplsKey] = useState('');
  const [venueLoading, setVenueLoading] = useState(true);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueMsg, setVenueMsg] = useState('');
  const [venueError, setVenueError] = useState('');

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loadingPass, setLoadingPass] = useState(false);

  const token = localStorage.getItem('admin_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  useEffect(() => {
    // 1. Fetch Registration QR
    axios
      .get('/api/admin/registration-qr', axiosConfig)
      .then((res) => setRegData(res.data))
      .catch((err) => console.error('Failed to load registration QR', err));

    // 2. Fetch Persistent Venue Config
    axios
      .get('/api/admin/venue-config', axiosConfig)
      .then((res) => {
        if (res.data?.config) {
          const c = res.data.config;
          setVenueName(c.venue_name || 'MVJCE Central Auditorium');
          setGeoLat(c.geo_lat || 12.983020);
          setGeoLng(c.geo_lng || 77.759970);
          setGeoRadius(c.geo_radius_m || 100);
          setMapplsKey(c.mappls_api_key || '');
        }
      })
      .catch((err) => console.error('Failed to load venue config', err))
      .finally(() => setVenueLoading(false));
  }, []);

  const handleCopyLink = async () => {
    if (regData?.url) {
      const ok = await copyToClipboard(regData.url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  // Save Persistent Venue Configuration
  const handleSaveVenue = async (e) => {
    e.preventDefault();
    setVenueSaving(true);
    setVenueMsg('');
    setVenueError('');

    try {
      const res = await axios.post(
        '/api/admin/venue-config',
        {
          venue_name: venueName,
          geo_lat: geoLat,
          geo_lng: geoLng,
          geo_radius_m: geoRadius,
          mappls_api_key: mapplsKey
        },
        axiosConfig
      );
      setVenueMsg(res.data.message || 'Venue configuration saved successfully');
    } catch (err) {
      setVenueError(err.response?.data?.error || 'Failed to save venue configuration');
    } finally {
      setVenueSaving(false);
    }
  };

  // Use Current GPS Location
  const handleUseCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setVenueError('Geolocation not supported by this browser');
      return;
    }
    setVenueMsg('');
    setVenueError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setGeoLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setVenueMsg('Acquired current GPS coordinates and updated map.');
      },
      (err) => {
        setVenueError('Could not acquire location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Reset to MVJCE Default
  const handleResetDefaults = () => {
    setGeoLat(12.983020);
    setGeoLng(77.759970);
    setGeoRadius(100);
    setVenueName('MVJCE Central Auditorium');
    setVenueMsg('Reset to MVJCE Central Auditorium coordinates.');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setLoadingPass(true);

    try {
      await axios.post(
        '/api/admin/change-password',
        {
          current_password: currentPassword,
          new_password: newPassword
        },
        axiosConfig
      );
      setPasswordMsg('Admin password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoadingPass(false);
    }
  };

  const handlePrintQR = () => {
    window.print();
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">
                System Administration
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Settings & <span className="italic text-amber-400">Venue Configuration.</span>
            </h1>
          </div>
        </div>

        {/* Section 1: Persistent Venue Geofence Configuration */}
        <div className="rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <MapPin className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Persistent Location & Geofence
                </span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">
                Auditorium & Venue Map
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500 transition"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>Use Current GPS</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#a39b94] hover:text-[#f5f0ea] transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>MVJCE Default</span>
              </button>
            </div>
          </div>

          {venueMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{venueMsg}</span>
            </div>
          )}

          {venueError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{venueError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Interactive Map */}
            <div className="lg:col-span-7 space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                Interactive Geofence Boundary Map
              </label>
              <VenueMapPicker
                lat={geoLat}
                lng={geoLng}
                radius={geoRadius}
                onLocationChange={({ lat, lng }) => {
                  setGeoLat(lat);
                  setGeoLng(lng);
                }}
                height="360px"
              />
              <p className="text-[11px] text-[#706860]">
                All classroom and event sessions automatically inherit this venue location and geofence radius.
              </p>
            </div>

            {/* Right: Coordinates & Radius Form */}
            <form onSubmit={handleSaveVenue} className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Venue Name
                </label>
                <input
                  type="text"
                  required
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={geoLat}
                    onChange={(e) => setGeoLat(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={geoLng}
                    onChange={(e) => setGeoLng(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  <span>Geofence Radius</span>
                  <span className="font-mono text-amber-400">{geoRadius} meters</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="400"
                  step="5"
                  value={geoRadius}
                  onChange={(e) => setGeoRadius(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500 h-1.5 rounded-lg bg-[#181512] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#706860] mt-1 font-mono">
                  <span>30m (Room)</span>
                  <span>100m (Auditorium)</span>
                  <span>400m (Campus)</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={venueSaving}
                className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                <span>{venueSaving ? 'Saving...' : 'Save Venue Configuration'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Section 2: Confidential Static Student Registration QR */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <QrCode className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Official Static Registration Code
                </span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">
                Student Roster QR Card
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintQR}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#f5f0ea] hover:border-amber-500"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print QR Sheet</span>
              </button>

              {regData?.qr_code && (
                <a
                  href={regData.qr_code}
                  download="MVJCE_Student_Registration_Static_QR.png"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Image</span>
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            {/* QR Image Display */}
            <div className="flex flex-col items-center text-center">
              {regData?.qr_code ? (
                <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-xl">
                  <img
                    src={regData.qr_code}
                    alt="Student Registration Static QR Code"
                    className="h-56 w-56 object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-[#181512] text-xs text-[#706860]">
                  Loading QR Code...
                </div>
              )}
              <span className="mt-3 text-[11px] uppercase tracking-widest text-[#a39b94]">
                Permanent Static QR
              </span>
            </div>

            {/* Description & URL */}
            <div className="md:col-span-2 space-y-4 text-xs">
              <p className="text-[#a39b94] leading-relaxed">
                This is the static registration QR code. Print or display this QR code at the registration desk. Students scanning this QR code arrive directly at the <strong className="text-[#f5f0ea]">Student Registration</strong> page.
              </p>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Confidential Registration URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={regData?.url || ''}
                    className="flex-1 rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 font-mono text-xs text-[#f5f0ea] select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-xl border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-2.5 text-xs font-semibold text-amber-400 hover:border-amber-500 transition"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860] leading-relaxed">
                <strong className="text-[#f5f0ea]">Page Isolation Guard:</strong> Students who access this registration URL can only view the registration form. No links exist to attendance or administrator control panels.
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Administrator Credentials Update */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl max-w-xl">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Security Credentials
            </span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-[#f5f0ea]">
            Change Admin Password
          </h2>
          <p className="mt-1 text-xs text-[#a39b94] mb-6">
            Update the master password for the Spotlight administrator portal.
          </p>

          {passwordMsg && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium">
              {passwordMsg}
            </div>
          )}

          {passwordError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
              {passwordError}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingPass}
              className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {loadingPass ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
