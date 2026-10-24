import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import VenueMapPicker from '../../components/VenueMapPicker';
import {
  QrCode,
  Download,
  Copy,
  Check,
  Lock,
  Printer,
  MapPin,
  Navigation,
  Save,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Star,
  X,
  BookmarkCheck
} from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

const MVJCE_DEFAULT = { lat: 12.985300, lng: 77.762465, name: 'MVJCE Central Auditorium', radius: 100 };

/* ─── Saved Location Modal ─────────────────────────────────────────────────── */
function SavedLocationModal({ location, onSave, onClose }) {
  const isNew = !location?.id;
  const [name, setName] = useState(location?.name || '');
  const [description, setDescription] = useState(location?.description || '');
  const [type, setType] = useState(location?.type || 'circle');
  const [lat, setLat] = useState(location?.geo_lat ?? MVJCE_DEFAULT.lat);
  const [lng, setLng] = useState(location?.geo_lng ?? MVJCE_DEFAULT.lng);
  const [radius, setRadius] = useState(location?.geo_radius_m ?? 100);
  const [corners, setCorners] = useState(
    location?.geo_corners ? (typeof location.geo_corners === 'string'
      ? JSON.parse(location.geo_corners) : location.geo_corners) : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleGPS = () => {
    if (!('geolocation' in navigator)) { setError('GPS not supported'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setGpsLoading(false);
      },
      (err) => { setError('GPS error: ' + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Preset name is required'); return; }
    if (isNaN(lat) || isNaN(lng)) { setError('Valid coordinates required'); return; }
    if (type === 'polygon' && corners.length < 3) { setError('Polygon requires at least 3 corners'); return; }

    setSaving(true);
    try {
      await onSave({
        id: location?.id,
        name: name.trim(),
        description: description.trim(),
        type,
        geo_lat: lat,
        geo_lng: lng,
        geo_radius_m: radius,
        geo_corners: type === 'polygon' ? corners : null
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl text-[#f5f0ea]">
            {isNew ? 'New Location Preset' : 'Edit Preset'}
          </h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#181512]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Preset Name *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSE Seminar Hall 2B"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-sm text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Description (optional)</label>
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Ground floor, capacity 120"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Geofence Type */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-2">Geofence Type</label>
            <div className="flex gap-2">
              {['circle', 'polygon'].map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold uppercase tracking-wider transition ${
                    type === t ? 'bg-amber-500 text-[#080605]' : 'border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                >
                  {t === 'circle' ? '⬤ Circle' : '⬡ Polygon'}
                </button>
              ))}
            </div>
          </div>

          {/* Map */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Location on Map</label>
            <VenueMapPicker
              lat={lat} lng={lng} radius={radius}
              onLocationChange={({ lat: newLat, lng: newLng }) => { setLat(newLat); setLng(newLng); }}
              onRadiusChange={(r) => setRadius(r)}
              height="240px"
            />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Latitude</label>
              <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Longitude</label>
              <input type="number" step="0.000001" value={lng} onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Radius (m)</label>
              <input type="number" min={20} max={500} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10) || 100)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* GPS Button */}
          <button type="button" onClick={handleGPS} disabled={gpsLoading}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500 disabled:opacity-50"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>{gpsLoading ? 'Acquiring GPS…' : 'Use My Current Location'}</span>
          </button>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2.5 text-xs font-semibold text-[#a39b94] hover:text-[#f5f0ea]"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] disabled:opacity-50"
            >
              {saving ? 'Saving…' : (isNew ? 'Create Preset' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ────────────────────────────────────────────────────── */
export default function AdminSettings() {
  const [regData, setRegData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Venue config state
  const [venueName, setVenueName] = useState(MVJCE_DEFAULT.name);
  const [geoLat, setGeoLat] = useState(MVJCE_DEFAULT.lat);
  const [geoLng, setGeoLng] = useState(MVJCE_DEFAULT.lng);
  const [geoRadius, setGeoRadius] = useState(MVJCE_DEFAULT.radius);
  const [geoType, setGeoType] = useState('circle');
  const [mapplsKey, setMapplsKey] = useState('');
  const [venueLoading, setVenueLoading] = useState(true);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueMsg, setVenueMsg] = useState('');
  const [venueError, setVenueError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Saved Locations state
  const [savedLocations, setSavedLocations] = useState([]);
  const [locsLoading, setLocsLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState(null);  // null=closed, {}=new, {id,...}=edit
  const [previewLocation, setPreviewLocation] = useState(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loadingPass, setLoadingPass] = useState(false);

  const token = localStorage.getItem('admin_token');
  const axiosConfig = { headers: { Authorization: `Bearer ${token}` } };

  // ── Initial data load ──────────────────────────────────────────────────
  const loadVenueConfig = useCallback(() => {
    axios.get('/api/admin/venue-config', axiosConfig)
      .then((res) => {
        if (res.data?.config) {
          const c = res.data.config;
          setVenueName(c.venue_name || MVJCE_DEFAULT.name);
          setGeoLat(c.geo_lat || MVJCE_DEFAULT.lat);
          setGeoLng(c.geo_lng || MVJCE_DEFAULT.lng);
          setGeoRadius(c.geo_radius_m || MVJCE_DEFAULT.radius);
          setGeoType(c.geo_type || 'circle');
          setMapplsKey(c.mappls_api_key || '');
        }
      })
      .catch(() => {})
      .finally(() => setVenueLoading(false));
  }, []);

  const loadSavedLocations = useCallback(() => {
    setLocsLoading(true);
    axios.get('/api/admin/saved-locations', axiosConfig)
      .then((res) => setSavedLocations(res.data?.locations || []))
      .catch(() => {})
      .finally(() => setLocsLoading(false));
  }, []);

  useEffect(() => {
    const originParam = encodeURIComponent(window.location.origin);
    axios.get(`/api/admin/registration-qr?origin=${originParam}`, axiosConfig)
      .then((res) => setRegData(res.data))
      .catch(() => {});
    loadVenueConfig();
    loadSavedLocations();
  }, []);

  // ── Venue config handlers ──────────────────────────────────────────────
  const handleSaveVenue = async (e) => {
    e.preventDefault();
    setVenueSaving(true);
    setVenueMsg('');
    setVenueError('');
    try {
      const res = await axios.post('/api/admin/venue-config', {
        venue_name: venueName,
        geo_lat: geoLat,
        geo_lng: geoLng,
        geo_radius_m: geoRadius,
        geo_type: geoType,
        mappls_api_key: mapplsKey
      }, axiosConfig);
      setVenueMsg(res.data.message || 'Venue configuration saved');
      setIsDirty(false);
    } catch (err) {
      setVenueError(err.response?.data?.error || 'Failed to save venue configuration');
    } finally {
      setVenueSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!('geolocation' in navigator)) { setVenueError('Geolocation not supported'); return; }
    setVenueMsg('');
    setVenueError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setGeoLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setVenueMsg('Updated to current GPS coordinates');
        setIsDirty(true);
      },
      (err) => setVenueError('Could not acquire location: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleResetDefaults = () => {
    setGeoLat(MVJCE_DEFAULT.lat);
    setGeoLng(MVJCE_DEFAULT.lng);
    setGeoRadius(MVJCE_DEFAULT.radius);
    setVenueName(MVJCE_DEFAULT.name);
    setGeoType('circle');
    setVenueMsg('Reset to MVJCE campus defaults (unsaved)');
    setIsDirty(true);
  };

  // ── Apply preset to active venue config ───────────────────────────────
  const applyPresetToVenue = (loc) => {
    setVenueName(loc.name);
    setGeoLat(loc.geo_lat);
    setGeoLng(loc.geo_lng);
    setGeoRadius(loc.geo_radius_m || 100);
    setGeoType(loc.type || 'circle');
    setVenueMsg(`Loaded preset "${loc.name}" — click Save to apply.`);
    setIsDirty(true);
    setPreviewLocation(null);
  };

  // ── Saved location CRUD ────────────────────────────────────────────────
  const handleSaveLocation = async (data) => {
    if (data.id) {
      await axios.put(`/api/admin/saved-locations/${data.id}`, data, axiosConfig);
    } else {
      await axios.post('/api/admin/saved-locations', data, axiosConfig);
    }
    loadSavedLocations();
  };

  const handleDeleteLocation = async (id, name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try {
      await axios.delete(`/api/admin/saved-locations/${id}`, axiosConfig);
      loadSavedLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete preset');
    }
  };

  // ── Password handler ──────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters'); return; }
    setLoadingPass(true);
    try {
      await axios.post('/api/admin/change-password', {
        current_password: currentPassword, new_password: newPassword
      }, axiosConfig);
      setPasswordMsg('Admin password updated successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoadingPass(false);
    }
  };

  const handleCopyLink = async () => {
    if (regData?.url) {
      const ok = await copyToClipboard(regData.url);
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">MVJ College of Engineering</span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">System Administration</span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Settings & <span className="italic text-amber-400">Venue Configuration.</span>
            </h1>
          </div>
        </div>

        {/* ── SECTION 1: Active Venue Geofence ───────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <MapPin className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Active Venue Geofence</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Venue Configuration</h2>
              {isDirty && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                  ● Unsaved changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleUseCurrentLocation}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500 transition"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>Use GPS</span>
              </button>
              <button type="button" onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#a39b94] hover:text-[#f5f0ea] transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>MVJCE Default</span>
              </button>
            </div>
          </div>

          {venueMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{venueMsg}
            </div>
          )}
          {venueError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{venueError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Map */}
            <div className="lg:col-span-7 space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                Interactive Map
              </label>
              <VenueMapPicker
                lat={geoLat} lng={geoLng} radius={geoRadius}
                onLocationChange={({ lat, lng }) => { setGeoLat(lat); setGeoLng(lng); setIsDirty(true); }}
                onRadiusChange={(r) => { setGeoRadius(r); setIsDirty(true); }}
                height="360px"
              />
              <p className="text-[11px] text-[#706860]">
                Drag the marker to reposition. Sessions inherit this venue unless overridden.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveVenue} className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Venue Name</label>
                <input type="text" required value={venueName}
                  onChange={(e) => { setVenueName(e.target.value); setIsDirty(true); }}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Geofence type selector */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-2">Geofence Type</label>
                <div className="flex gap-2">
                  {[{ key: 'circle', label: '⬤ Circle' }, { key: 'polygon', label: '⬡ Polygon' }].map(({ key, label }) => (
                    <button key={key} type="button"
                      onClick={() => { setGeoType(key); setIsDirty(true); }}
                      className={`flex-1 rounded-xl py-2 text-xs font-semibold uppercase tracking-wider transition ${
                        geoType === key ? 'bg-amber-500 text-[#080605]' : 'border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] hover:text-[#f5f0ea]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Latitude</label>
                  <input type="number" step="0.000001" required value={geoLat}
                    onChange={(e) => { setGeoLat(parseFloat(e.target.value) || 0); setIsDirty(true); }}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Longitude</label>
                  <input type="number" step="0.000001" required value={geoLng}
                    onChange={(e) => { setGeoLng(parseFloat(e.target.value) || 0); setIsDirty(true); }}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {geoType === 'circle' && (
                <div>
                  <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    <span>Radius</span>
                    <span className="font-mono text-amber-400">{geoRadius} m</span>
                  </div>
                  <input type="range" min="20" max="500" step="5" value={geoRadius}
                    onChange={(e) => { setGeoRadius(parseInt(e.target.value, 10)); setIsDirty(true); }}
                    className="w-full accent-amber-500 h-1.5 rounded-lg bg-[#181512] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#706860] mt-1 font-mono">
                    <span>20m</span><span>150m</span><span>500m</span>
                  </div>
                </div>
              )}

              <button type="submit" disabled={venueSaving || venueLoading}
                className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                <span>{venueSaving ? 'Saving…' : 'Save Venue Configuration'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* ── SECTION 2: Saved Location Presets ─────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <BookmarkCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Saved Location Presets</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Quick-Select Venues</h2>
              <p className="text-xs text-[#a39b94] mt-1">
                Create reusable location presets that you can quickly apply to the active venue.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingLocation({})}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Preset</span>
            </button>
          </div>

          {locsLoading ? (
            <div className="flex items-center justify-center py-8 text-[#a39b94] text-xs">
              <RotateCcw className="h-4 w-4 animate-spin mr-2" /> Loading presets…
            </div>
          ) : savedLocations.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-6 text-center text-xs text-[#706860]">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-[#554e48]" />
              <p>No location presets yet. Create one to quickly apply venue configurations.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {savedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className={`rounded-xl border bg-[#181512] p-4 space-y-2 transition ${
                    previewLocation?.id === loc.id
                      ? 'border-amber-500/50 shadow-amber-glow'
                      : 'border-[rgba(255,235,215,0.08)] hover:border-[rgba(255,235,215,0.15)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                          loc.type === 'polygon' ? 'bg-violet-500/20 text-violet-400' : 'bg-amber-500/15 text-amber-400'
                        }`}>
                          {loc.type === 'polygon' ? 'Polygon' : 'Circle'}
                        </span>
                        {loc.is_default === 1 && <Star className="h-3 w-3 text-amber-400" fill="currentColor" />}
                      </div>
                      <h4 className="text-sm font-semibold text-[#f5f0ea] mt-1 truncate">{loc.name}</h4>
                      {loc.description && (
                        <p className="text-[11px] text-[#706860] truncate">{loc.description}</p>
                      )}
                      <p className="font-mono text-[10px] text-[#554e48] mt-1">
                        {loc.geo_lat?.toFixed(5)}, {loc.geo_lng?.toFixed(5)}
                        {loc.type === 'circle' && <span className="ml-1 text-amber-500/60">• {loc.geo_radius_m}m</span>}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        title="Preview on map"
                        onClick={() => setPreviewLocation(previewLocation?.id === loc.id ? null : loc)}
                        className={`p-1.5 rounded-lg transition ${
                          previewLocation?.id === loc.id ? 'bg-amber-500/20 text-amber-400' : 'text-[#a39b94] hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Edit preset"
                        onClick={() => setEditingLocation(loc)}
                        className="p-1.5 rounded-lg text-[#a39b94] hover:text-[#f5f0ea] hover:bg-[#201c18] transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete preset"
                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                        className="p-1.5 rounded-lg text-[#a39b94] hover:text-red-400 hover:bg-red-500/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => applyPresetToVenue(loc)}
                    className="w-full rounded-lg border border-amber-500/25 bg-amber-500/5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/15 transition"
                  >
                    Apply to Active Venue
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Preview panel */}
          {previewLocation && (
            <div className="rounded-xl border border-amber-500/25 bg-[#18130e] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-400">
                  Previewing: {previewLocation.name}
                </p>
                <button onClick={() => setPreviewLocation(null)} className="text-[#a39b94] hover:text-[#f5f0ea]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <VenueMapPicker
                lat={previewLocation.geo_lat}
                lng={previewLocation.geo_lng}
                radius={previewLocation.geo_radius_m || 100}
                readOnly
                height="240px"
              />
              <p className="text-[11px] text-[#706860]">
                Coordinates: {previewLocation.geo_lat?.toFixed(6)}, {previewLocation.geo_lng?.toFixed(6)}
                {previewLocation.type === 'circle' && ` • Radius: ${previewLocation.geo_radius_m}m`}
              </p>
              <button
                type="button"
                onClick={() => applyPresetToVenue(previewLocation)}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-[#080605]"
              >
                <Check className="h-3.5 w-3.5" /> Apply This Preset
              </button>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Registration QR ────────────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <QrCode className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Official Static Registration Code</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Student Roster QR Card</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#f5f0ea] hover:border-amber-500"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print QR</span>
              </button>
              {regData?.qr_code && (
                <a href={regData.qr_code} download="MVJCE_Student_Registration_QR.png"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#080605]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div className="flex flex-col items-center text-center">
              {regData?.qr_code ? (
                <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-xl">
                  <img src={regData.qr_code} alt="Student Registration Static QR Code" className="h-56 w-56 object-contain" />
                </div>
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-[#181512] text-xs text-[#706860]">
                  Loading QR…
                </div>
              )}
              <span className="mt-3 text-[11px] uppercase tracking-widest text-[#a39b94]">Permanent Static QR</span>
            </div>
            <div className="md:col-span-2 space-y-4 text-xs">
              <p className="text-[#a39b94] leading-relaxed">
                Print or display this QR code at the registration desk. Students scan this to reach the
                <strong className="text-[#f5f0ea]"> Student Registration</strong> page.
                The URL is encoded with the server-configured production domain.
              </p>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Registration URL</label>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={regData?.url || ''}
                    className="flex-1 rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 font-mono text-xs text-[#f5f0ea] select-all focus:outline-none"
                  />
                  <button type="button" onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-xl border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-2.5 text-xs font-semibold text-amber-400 hover:border-amber-500 transition"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860] leading-relaxed">
                <strong className="text-[#f5f0ea]">Page Isolation Guard:</strong> Students who access this URL can only view the registration form. No links exist to attendance or admin panels.
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Change Password ────────────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl max-w-xl space-y-5">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Security Credentials</span>
            </div>
            <h2 className="font-serif text-2xl font-normal text-[#f5f0ea]">Change Admin Password</h2>
            <p className="mt-1 text-xs text-[#a39b94]">Update the master password for the Spotlight admin portal.</p>
          </div>

          {passwordMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium">{passwordMsg}</div>
          )}
          {passwordError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">{passwordError}</div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {[
              ['Current Password', currentPassword, setCurrentPassword],
              ['New Password', newPassword, setNewPassword],
              ['Confirm New Password', confirmPassword, setConfirmPassword]
            ].map(([label, val, setter]) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">{label}</label>
                <input type="password" required value={val} onChange={(e) => setter(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
            ))}
            <button type="submit" disabled={loadingPass}
              className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {loadingPass ? 'Updating…' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Saved Location Modal ────────────────────────────────────────── */}
      {editingLocation !== null && (
        <SavedLocationModal
          location={Object.keys(editingLocation).length > 0 ? editingLocation : null}
          onSave={handleSaveLocation}
          onClose={() => setEditingLocation(null)}
        />
      )}
    </AdminLayout>
  );
}
