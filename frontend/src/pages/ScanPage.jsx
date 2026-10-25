import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Camera,
  CheckCircle,
  AlertTriangle,
  MapPin,
  Info,
  RotateCcw,
  ArrowRight,
  WifiOff,
  Settings,
  ExternalLink
} from 'lucide-react';
import QRScannerModal from '../components/QRScannerModal';

/* ─────────────────────────────────────────────────────────────
   Location error code → user-facing message + guidance map
───────────────────────────────────────────────────────────── */
const GEO_ERROR = {
  NOT_SUPPORTED: {
    title: 'Location Not Supported',
    body: 'Your browser does not support GPS location access. Please use Chrome or Safari on a modern phone.',
    canRetry: false,
    showSettings: false
  },
  INSECURE_CONTEXT: {
    title: 'Secure Connection Required',
    body: 'GPS requires an HTTPS connection. If you opened this page over HTTP, please use the HTTPS link instead.',
    canRetry: false,
    showSettings: false
  },
  PERMISSION_DENIED: {
    title: 'Location Permission Blocked',
    body: 'You have previously denied location access to this website. To fix this:\n\n• In Chrome: tap the lock icon beside the URL → Site settings → Location → Allow\n• In Samsung Internet: Settings → Sites and downloads → Allow location\n• In Safari: Settings → Safari → Location → Allow\n\nAfter changing the setting, return here and tap Retry.',
    canRetry: true,
    showSettings: true
  },
  POSITION_UNAVAILABLE: {
    title: 'Device Location Unavailable',
    body: 'Your device cannot determine its location. Please:\n1. Enable GPS / Location Services in your phone settings\n2. Move to an area with better signal or open sky if possible\n3. Tap Retry Location below',
    canRetry: true,
    showSettings: true
  },
  TIMEOUT: {
    title: 'GPS Signal Timed Out',
    body: 'Your device took too long to get a GPS fix. This happens indoors or when signal is weak. Please tap Retry — the second attempt uses a faster network-assisted location.',
    canRetry: true,
    showSettings: false
  },
  UNKNOWN: {
    title: 'Location Error',
    body: 'An unexpected error occurred while accessing GPS. Please tap Retry.',
    canRetry: true,
    showSettings: false
  }
};

/* Maps a GeolocationPositionError to our error code */
function classifyGeoError(err) {
  if (!('geolocation' in navigator)) return 'NOT_SUPPORTED';
  if (!window.isSecureContext) return 'INSECURE_CONTEXT';
  if (!err) return 'UNKNOWN';
  switch (err.code) {
    case 1: return 'PERMISSION_DENIED';
    case 2: return 'POSITION_UNAVAILABLE';
    case 3: return 'TIMEOUT';
    default: return 'UNKNOWN';
  }
}

/* Maps a backend geofence error code to student-facing message */
function geofenceErrorMessage(backendError) {
  if (!backendError) return backendError;
  if (backendError.includes('OUTSIDE_BOUNDARY') || backendError.includes('outside the allowed') || backendError.includes('outside the designated')) {
    return backendError; // Already descriptive — show as-is
  }
  if (backendError.includes('LOCATION_MISSING') || backendError.includes('could not be obtained')) {
    return 'Your GPS location could not be confirmed. Please allow location access in your browser and tap Retry GPS, then submit again.';
  }
  if (backendError.includes('VENUE_NOT_CONFIGURED')) {
    return 'The attendance venue has not been configured. Please inform your administrator.';
  }
  if (backendError.includes('POLYGON_INVALID')) {
    return 'The venue boundary configuration has an error. Please inform your administrator.';
  }
  return backendError;
}

export default function ScanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [studentId, setStudentId] = useState('');
  const [uniquePin, setUniquePin] = useState('');

  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'already_marked' | 'error'
  const [resultData, setResultData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  // locationStatus: 'idle' | 'locating' | 'acquired' | 'error'
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationErrorCode, setLocationErrorCode] = useState(null); // key in GEO_ERROR
  const [showLocationHelp, setShowLocationHelp] = useState(false);

  const watchIdRef = useRef(null);
  const acquiredOnceRef = useRef(false); // prevent re-showing error after success

  // ── Sync token from URL ────────────────────────────────────────────────
  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  // ── Fetch token requirements when token changes ────────────────────────
  useEffect(() => {
    if (!token) { setTokenInfo(null); return; }
    axios
      .get(`/api/attendance/token-info?token=${encodeURIComponent(token.trim())}`)
      .then((res) => setTokenInfo(res.data))
      .catch(() => setTokenInfo(null));
  }, [token]);

  // ── Core location acquisition ─────────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('error');
      setLocationErrorCode('NOT_SUPPORTED');
      return;
    }
    if (!window.isSecureContext) {
      setLocationStatus('error');
      setLocationErrorCode('INSECURE_CONTEXT');
      return;
    }

    setLocationStatus('locating');
    setLocationErrorCode(null);

    const onSuccess = (pos) => {
      acquiredOnceRef.current = true;
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationStatus('acquired');
      setLocationErrorCode(null);
      setShowLocationHelp(false);
    };

    // Two-stage acquisition:
    // Stage 1 — high accuracy (GPS chip, ~8s timeout)
    // Stage 2 — network-assisted fallback (faster, ~15s, 60s cache allowed)
    const onHighAccuracyFail = (err) => {
      if (acquiredOnceRef.current) return; // Already have a fix via watchPosition
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (fallbackErr) => {
          if (acquiredOnceRef.current) return;
          setLocationStatus('error');
          setLocationErrorCode(classifyGeoError(fallbackErr));
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onHighAccuracyFail, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    });
  }, []);

  // ── Continuous watch (improves accuracy over time) ────────────────────
  useEffect(() => {
    requestLocation();

    if ('geolocation' in navigator) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            acquiredOnceRef.current = true;
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setLocationStatus('acquired');
            setLocationErrorCode(null);
          },
          () => {}, // Silently ignore watch errors; we already handle via getCurrentPosition
          { enableHighAccuracy: false, maximumAge: 30000 }
        );
      } catch {}
    }

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
        watchIdRef.current = null;
      }
    };
  }, [requestLocation]);

  // ── QR scan success ───────────────────────────────────────────────────
  const handleScanSuccess = (scannedToken) => {
    let cleanToken = scannedToken;
    try {
      if (scannedToken.includes('token=')) {
        const parsedUrl = new URL(scannedToken);
        cleanToken = parsedUrl.searchParams.get('token') || scannedToken;
      }
    } catch {}
    setToken(cleanToken);
    setSearchParams({ token: cleanToken });
  };

  // ── Form submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setErrorMsg('No QR token detected. Please open the scanner and scan the QR code on the screen.');
      return;
    }
    if (!studentId.trim()) {
      setErrorMsg('Please enter your Student ID.');
      return;
    }

    const isPinRequired = tokenInfo ? tokenInfo.pin_required : true;
    if (isPinRequired && !uniquePin.trim()) {
      setErrorMsg('Please enter the 6-digit PIN displayed on the auditorium screen.');
      return;
    }

    // Warn if location not yet acquired but don't hard-block —
    // the backend is authoritative; if geo is required it will reject cleanly
    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        token: token.trim(),
        student_id: studentId.trim().toUpperCase(),
        unique_pin: uniquePin.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null
      };

      const res = await axios.post('/api/attendance/mark', payload);
      setStatus('success');
      setResultData(res.data);
    } catch (err) {
      if (err.response?.status === 409) {
        setStatus('already_marked');
        setResultData(err.response.data);
      } else {
        setStatus('error');
        const rawError = err.response?.data?.error || 'Failed to mark attendance. Please verify your details.';
        setErrorMsg(geofenceErrorMessage(rawError));
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStatus(null);
    setResultData(null);
    setErrorMsg('');
    setUniquePin('');
  };

  // ── Derived state ─────────────────────────────────────────────────────
  const isPinRequired = tokenInfo ? tokenInfo.pin_required : true;
  const locInfo = locationErrorCode ? GEO_ERROR[locationErrorCode] : null;

  // ── SUCCESS STATE ─────────────────────────────────────────────────────
  if (status === 'success' && resultData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] py-12 px-4 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-8 sm:p-10 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle className="h-8 w-8" />
          </div>
          <p className="mt-4 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
            MVJ College of Engineering
          </p>
          <h1 className="mt-1 font-serif text-3xl font-normal text-[#f5f0ea]">
            Attendance <span className="italic text-emerald-400">Marked.</span>
          </h1>
          <p className="mt-2 text-xs text-[#a39b94]">Your presence has been securely verified and recorded.</p>

          <div className="mt-6 divide-y divide-[rgba(255,235,215,0.06)] rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4 text-xs text-left">
            {[
              ['Student Name', resultData.student?.name],
              ['Student ID', resultData.student?.student_id, 'font-mono font-bold text-amber-400'],
              ['USN', resultData.student?.usn, 'font-mono'],
              ['Session / Hour', `${resultData.session?.subject_name} (Hour ${resultData.session?.hour_number})`],
              ['Recorded Time', new Date(resultData.marked_at).toLocaleTimeString(), 'font-mono']
            ].map(([label, value, cls = '']) => (
              <div key={label} className="flex justify-between py-2 text-[#a39b94]">
                <span>{label}</span>
                <span className={`font-medium text-[#f5f0ea] ${cls}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-center text-xs text-[#706860]">
            <p className="font-medium text-[#a39b94]">Session Attendance Locked</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Each attendee must mark attendance exclusively on their own mobile device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── ALREADY MARKED STATE ──────────────────────────────────────────────
  if (status === 'already_marked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] py-12 px-4 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#120f0d] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-normal text-[#f5f0ea]">Already Recorded</h2>
          <p className="mt-2 text-xs text-[#a39b94] leading-relaxed">
            {resultData?.error || 'Attendance for this Student ID has already been recorded for this session.'}
          </p>
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] text-amber-200/90 leading-relaxed">
            Duplicate entries are strictly prevented by the database.
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="mt-6 w-full rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f5f0ea] hover:bg-[#201c18]"
          >
            Back to Submission
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN ATTENDANCE FORM ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080605] flex flex-col justify-center py-12 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a39b94]">
              MVJ College of Engineering
            </span>
            <span className="text-[11px] text-amber-500">•</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
              Spotlight
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#f5f0ea]">
            Mark <span className="italic text-amber-400">Attendance.</span>
          </h1>
          <p className="mt-2 text-xs text-[#a39b94]">
            {isPinRequired
              ? 'Enter your Student ID and the current PIN from the screen.'
              : 'Enter your Student ID to record your attendance.'}
          </p>
        </div>

        {/* Student ID hint */}
        <div className="mb-6 rounded-2xl border border-[rgba(240,150,80,0.25)] bg-gradient-to-r from-[#18130e] to-[#120f0d] p-4 text-xs shadow-lg">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold uppercase tracking-wider text-amber-400 text-[11px]">Student ID Hint:</span>
              <p className="mt-1 text-xs text-[#f5f0ea] font-medium leading-relaxed">
                First 4 letters of your Name (CAPITAL) + Last 4 digits of your Mobile Number.
              </p>
              <p className="text-[11px] text-[#706860] mt-0.5">
                Example: <span className="font-mono text-[#a39b94]">ARJUN</span> + <span className="font-mono text-[#a39b94]">9876543210</span> → <span className="font-mono font-bold text-amber-400">ARJU3210</span>
              </p>
            </div>
          </div>
        </div>

        {/* QR Token Status */}
        <div className="mb-3 flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${token ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-xs text-[#f5f0ea] font-medium">
              {token ? 'Auditorium QR Linked' : 'No QR Token Detected'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-semibold text-amber-400 transition hover:border-amber-500/50 hover:bg-[#201c18]"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{token ? 'Rescan Screen' : 'Open Camera'}</span>
          </button>
        </div>

        {/* Location Status Card */}
        <div className="mb-2 flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {locationStatus === 'acquired' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> GPS Location Acquired
                </span>
              </>
            ) : locationStatus === 'locating' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs text-amber-400 font-medium flex items-center gap-1">
                  <RotateCcw className="h-3.5 w-3.5 animate-spin" /> Acquiring GPS…
                </span>
              </>
            ) : locationStatus === 'error' ? (
              <>
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-xs text-red-300 font-medium flex items-center gap-1">
                  <WifiOff className="h-3.5 w-3.5" />
                  {locInfo?.title || 'Location Unavailable'}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-[#554e48]" />
                <span className="text-xs text-[#a39b94]">GPS not started</span>
              </>
            )}
          </div>

          {locationStatus !== 'acquired' && (
            <div className="flex items-center gap-1.5">
              {locationStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => setShowLocationHelp((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,235,215,0.1)] bg-[#181512] px-2.5 py-1 text-[11px] text-[#a39b94] hover:text-[#f5f0ea]"
                >
                  <Info className="h-3 w-3" />
                  <span>Help</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => { acquiredOnceRef.current = false; requestLocation(); }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Retry GPS</span>
              </button>
            </div>
          )}
        </div>

        {/* Location Help Panel */}
        {showLocationHelp && locInfo && (
          <div className="mb-3 rounded-xl border border-amber-500/25 bg-[#18130e] p-4 text-[11px] text-[#c8b99a] leading-relaxed space-y-2">
            <p className="font-semibold text-amber-300 text-xs">{locInfo.title}</p>
            <p className="whitespace-pre-line">{locInfo.body}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {locInfo.canRetry && (
                <button
                  type="button"
                  onClick={() => { acquiredOnceRef.current = false; setShowLocationHelp(false); requestLocation(); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-[#080605]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry Location
                </button>
              )}
              {locInfo.showSettings && (
                <button
                  type="button"
                  onClick={() => {
                    // Deep-link to browser settings on Android Chrome if possible
                    try { window.open('chrome://settings/content/location', '_blank'); } catch {}
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#201c18] px-4 py-1.5 text-xs font-medium text-[#f5f0ea]"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Open Settings
                </button>
              )}
              <a
                href="https://support.google.com/chrome/answer/142065"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 underline hover:text-amber-300"
              >
                <ExternalLink className="h-3 w-3" />
                How to enable location
              </a>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-xs font-medium text-red-300 leading-relaxed">
            {errorMsg}
            {(errorMsg.includes('GPS') || errorMsg.includes('location') || errorMsg.includes('Location')) && locationStatus !== 'acquired' && (
              <button
                type="button"
                onClick={() => { acquiredOnceRef.current = false; requestLocation(); setErrorMsg(''); }}
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-amber-400 text-[11px] font-semibold"
              >
                <RotateCcw className="h-3 w-3" /> Retry GPS
              </button>
            )}
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Student ID */}
            <div>
              <label htmlFor="student-id-input" className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                1. Student ID <span className="text-amber-500">*</span>
              </label>
              <input
                id="student-id-input"
                type="text"
                required
                maxLength={20}
                autoCapitalize="characters"
                placeholder="E.g. ARJU3210"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                className="w-full h-12 rounded-xl border border-[rgba(255,235,215,0.14)] bg-[#181512] px-4 font-mono text-base font-medium leading-normal tracking-wide text-[#f5f0ea] placeholder:font-mono placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#665e56] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 box-border"
              />
              <p className="mt-1.5 text-[11px] text-[#706860]">
                First 4 letters of name (CAPITALS) + last 4 digits of mobile number.
              </p>
            </div>

            {/* Screen PIN */}
            {isPinRequired && (
              <div>
                <label htmlFor="screen-pin-input" className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                  2. Screen PIN <span className="text-amber-500">*</span>
                </label>
                <input
                  id="screen-pin-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  maxLength={6}
                  placeholder="Enter 6-digit PIN"
                  value={uniquePin}
                  onChange={(e) => setUniquePin(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 rounded-xl border border-[rgba(255,235,215,0.14)] bg-[#181512] px-4 font-mono text-base font-medium leading-normal tracking-wide text-amber-400 placeholder:font-mono placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#665e56] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 box-border"
                />
                <p className="mt-1.5 text-[11px] text-[#706860]">
                  Enter the 6-digit PIN currently displayed on the auditorium screen.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#080605] shadow-amber-glow transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-black" />
                  <span>Verifying Attendance…</span>
                </>
              ) : (
                <>
                  <span>Submit Attendance</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
