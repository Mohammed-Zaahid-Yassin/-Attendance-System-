import React, { useState, useEffect } from 'react';
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
  ShieldCheck,
  Check
} from 'lucide-react';
import QRScannerModal from '../components/QRScannerModal';

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
  const [locationStatus, setLocationStatus] = useState('idle'); // 'idle' | 'acquired' | 'denied'

  // Sync token from URL query params
  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  // When token is set, fetch token requirements (whether PIN is required, geofence, etc.)
  useEffect(() => {
    if (!token) {
      setTokenInfo(null);
      return;
    }

    axios
      .get(`/api/attendance/token-info?token=${encodeURIComponent(token.trim())}`)
      .then((res) => {
        setTokenInfo(res.data);
      })
      .catch(() => {
        setTokenInfo(null);
      });
  }, [token]);

  const [locationError, setLocationError] = useState('');

  // Robust location acquisition with high-accuracy fallback and watchPosition
  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('denied');
      setLocationError('Geolocation not supported on this browser');
      return;
    }

    setLocationStatus('locating');
    setLocationError('');

    const handleSuccess = (pos) => {
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      });
      setLocationStatus('acquired');
      setLocationError('');
    };

    const handleLowAccuracyFallback = (err) => {
      // Fallback to low-accuracy (faster indoors)
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (fallbackErr) => {
          setLocationStatus('denied');
          if (fallbackErr.code === 1) {
            setLocationError('Location permission denied. Please allow location in your browser settings.');
          } else if (fallbackErr.code === 2) {
            setLocationError('Position unavailable. Ensure device GPS/Location service is toggled on.');
          } else {
            setLocationError('GPS signal timed out. Tap Retry Location.');
          }
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    // First attempt: High accuracy
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleLowAccuracyFallback,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  useEffect(() => {
    requestLocation();

    // Also start a watchPosition for continuous lock
    let watchId = null;
    if ('geolocation' in navigator) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            setCoords({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            });
            setLocationStatus('acquired');
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 60000 }
        );
      } catch {}
    }

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {}
      }
    };
  }, []);

  const handleScanSuccess = (scannedToken) => {
    let cleanToken = scannedToken;
    try {
      if (scannedToken.includes('token=')) {
        const parsedUrl = new URL(scannedToken);
        cleanToken = parsedUrl.searchParams.get('token') || scannedToken;
      }
    } catch {
      // scannedToken is raw string
    }
    setToken(cleanToken);
    setSearchParams({ token: cleanToken });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setErrorMsg('No QR token detected. Please scan the current QR code on the auditorium screen.');
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

    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        token: token.trim(),
        student_id: studentId.trim().toUpperCase(),
        unique_pin: uniquePin.trim(),
        lat: coords?.lat,
        lng: coords?.lng
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
        setErrorMsg(err.response?.data?.error || 'Failed to mark attendance. Please verify your details.');
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

  // SUCCESS STATE
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
          <p className="mt-2 text-xs text-[#a39b94]">
            Your presence has been securely verified and recorded.
          </p>

          <div className="mt-6 divide-y divide-[rgba(255,235,215,0.06)] rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-4 text-xs text-left">
            <div className="flex justify-between py-2 text-[#a39b94]">
              <span>Student Name</span>
              <span className="font-semibold text-[#f5f0ea]">{resultData.student?.name}</span>
            </div>
            <div className="flex justify-between py-2 text-[#a39b94]">
              <span>Student ID</span>
              <span className="font-mono font-bold text-amber-400">{resultData.student?.student_id}</span>
            </div>
            <div className="flex justify-between py-2 text-[#a39b94]">
              <span>USN</span>
              <span className="font-mono font-medium text-[#f5f0ea]">{resultData.student?.usn}</span>
            </div>
            <div className="flex justify-between py-2 text-[#a39b94]">
              <span>Session / Hour</span>
              <span className="font-medium text-[#f5f0ea]">
                {resultData.session?.subject_name} (Hour {resultData.session?.hour_number})
              </span>
            </div>
            <div className="flex justify-between py-2 text-[#a39b94]">
              <span>Recorded Time</span>
              <span className="font-mono text-[#f5f0ea]">
                {new Date(resultData.marked_at).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Confirmation Notice */}
          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-center text-xs text-[#706860]">
            <p className="font-medium text-[#a39b94]">Session Attendance Locked</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              Your attendance for this session has been locked. Each attendee must mark attendance exclusively on their own mobile device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ALREADY MARKED STATE
  if (status === 'already_marked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] py-12 px-4 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-[#120f0d] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-normal text-[#f5f0ea]">
            Already Recorded
          </h2>
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

  // MAIN ATTENDANCE FORM
  const isPinRequired = tokenInfo ? tokenInfo.pin_required : true;

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

        {/* User Required Hint Banner: First 4 letters of name (CAPITAL) + last 4 digits of mobile */}
        <div className="mb-6 rounded-2xl border border-[rgba(240,150,80,0.25)] bg-gradient-to-r from-[#18130e] to-[#120f0d] p-4 text-xs shadow-lg">
          <div className="flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold uppercase tracking-wider text-amber-400 text-[11px]">
                Student ID Hint:
              </span>
              <p className="mt-1 text-xs text-[#f5f0ea] font-medium leading-relaxed">
                First 4 letters of your Name (CAPITAL) + Last 4 digits of your Mobile Number.
              </p>
              <p className="text-[11px] text-[#706860] mt-0.5">
                Example: <span className="font-mono text-[#a39b94]">ARJUN</span> + <span className="font-mono text-[#a39b94]">9876543210</span> → <span className="font-mono font-bold text-amber-400">ARJU3210</span>
              </p>
            </div>
          </div>
        </div>

        {/* QR Token Status Card */}
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
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-4 py-2.5">
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
                  <RotateCcw className="h-3.5 w-3.5 animate-spin" /> Acquiring GPS lock...
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-xs text-red-300 font-medium flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Location Unavailable
                </span>
              </>
            )}
          </div>
          {locationStatus !== 'acquired' && (
            <button
              type="button"
              onClick={requestLocation}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Retry GPS</span>
            </button>
          )}
        </div>

        {locationError && locationStatus === 'denied' && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-300/90 leading-relaxed">
            {locationError}
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-xs font-medium text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Student ID */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                1. Student ID <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. ARJU3210"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3 font-mono text-base uppercase tracking-[0.12em] text-[#f5f0ea] placeholder-[#554e48] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* 2. Screen PIN (Only when active) */}
            {isPinRequired && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                  2. Screen PIN <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="6-digit PIN from screen"
                  value={uniquePin}
                  onChange={(e) => setUniquePin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.25em] text-amber-400 placeholder-[#554e48] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            )}

            {/* Spotlight Amber Submit CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#080605] shadow-amber-glow transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-black"></div>
                  <span>Verifying Attendance...</span>
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

      {/* html5-qrcode Camera Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
