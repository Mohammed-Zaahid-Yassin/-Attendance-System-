import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
  Download, 
  Search, 
  Trash2, 
  UserPlus, 
  RefreshCw, 
  Radio,
  MapPin,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Filter,
  ArrowUpDown,
  X,
  Edit2
} from 'lucide-react';
import { MVJCE_SCHOOLS, ALL_MVJCE_DEPARTMENTS } from '../../utils/departments';

// Helper to extract short department code or clean name
export function getShortDept(dept) {
  if (!dept || dept === 'ALL') return '';
  const match = dept.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    return match[1].replace(/[^a-zA-Z0-9_-]/g, '').trim();
  }
  return dept.replace(/[^a-zA-Z0-9]/g, '').trim();
}

// Helper to format year suffix (e.g. 2 -> 2ndYear)
export function getYearSuffix(yr) {
  if (!yr || yr === 'ALL') return '';
  const y = String(yr).trim();
  if (y === '1') return '1stYear';
  if (y === '2') return '2ndYear';
  if (y === '3') return '3rdYear';
  if (y === '4') return '4thYear';
  if (/^\d+$/.test(y)) return `${y}Year`;
  return y.replace(/[^a-zA-Z0-9]/g, '');
}

// Helper to compute clean export filename
export function computeExportFilename({ department, year, subjectName, hourNumber, ext }) {
  let cleanEvent = (subjectName || '').replace(/[/\\?%*:|"<>]/g, '').trim();
  if (!cleanEvent) {
    cleanEvent = hourNumber ? `Attendance-Hour${hourNumber}` : 'Attendance';
  }

  const deptStr = getShortDept(department);
  const yearStr = getYearSuffix(year);

  const parts = [cleanEvent];
  if (deptStr) parts.push(deptStr);
  if (yearStr) parts.push(yearStr);

  return `${parts.join('-')}.${ext}`;
}

export default function LiveAttendance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionFromUrl = searchParams.get('session');

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionFromUrl || '');
  const [sessionData, setSessionData] = useState(null);
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Manual mark state: 'registered' | 'unregistered'
  const [manualMode, setManualMode] = useState('registered');
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualRemarks, setManualRemarks] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMsg, setManualMsg] = useState('');
  const [manualMsgType, setManualMsgType] = useState('info'); // 'success' | 'error' | 'info'

  // Unregistered student form fields
  const [unregName, setUnregName] = useState('');
  const [unregUsn, setUnregUsn] = useState('');
  const [unregYear, setUnregYear] = useState('2');
  const [unregCycle, setUnregCycle] = useState('Physics Cycle');
  const [unregDept, setUnregDept] = useState('Computer Science and Engineering (CSE)');
  const [unregMobile, setUnregMobile] = useState('');
  const [unregRemarks, setUnregRemarks] = useState('');

  // Edit attendance record state
  const [editingRecord, setEditingRecord] = useState(null);
  const [editStudentId, setEditStudentId] = useState('');
  const [editGeoVerified, setEditGeoVerified] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const getAuthHeaders = () => {
    const currentToken = localStorage.getItem('admin_token') || localStorage.getItem('token') || '';
    return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
  };
  const axiosConfig = {
    get headers() {
      return getAuthHeaders();
    }
  };

  // Pre-fill student lookup if passed via URL (?lookup=ID or ?student=ID)
  useEffect(() => {
    const lookupParam = searchParams.get('lookup') || searchParams.get('student');
    if (lookupParam) {
      setManualStudentId(lookupParam.trim().toUpperCase());
    }
  }, [searchParams]);

  // 1. Fetch all sessions for dropdown selector
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await axios.get('/api/admin/sessions', { headers: getAuthHeaders() });
        const list = res.data.sessions || [];
        setSessions(list);

        if (list.length > 0) {
          const matching = list.find((s) => String(s.id) === String(selectedSessionId));
          if (!matching) {
            const active = list.find((s) => s.is_active === 1) || list[0];
            setSelectedSessionId(String(active.id));
          }
        }
      } catch (err) {
        console.error('Failed to load sessions', err);
      }
    };
    fetchSessions();
  }, []);

  // 2. Poll live attendance for selected session
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchAttendance = async () => {
      try {
        const res = await axios.get(`/api/attendance/live/${selectedSessionId}`);
        setSessionData(res.data.session);
        setRecords(res.data.records || []);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Failed to poll attendance', err);
      }
    };

    fetchAttendance();

    if (isLivePolling) {
      const interval = setInterval(fetchAttendance, 2500);
      return () => clearInterval(interval);
    }
  }, [selectedSessionId, isLivePolling]);

  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState('ALL');
  const [sortBy, setSortBy] = useState('time_desc'); // 'time_desc' | 'time_asc' | 'name_asc' | 'usn_asc'
  const [exportingFormat, setExportingFormat] = useState(null); // 'csv' | 'xlsx' | null

  // Export CSV or XLSX with applied department & year filters and authenticated blob download
  const handleExport = async (format = 'csv') => {
    if (!selectedSessionId || exportingFormat) return;
    setExportingFormat(format);

    try {
      const currentToken = localStorage.getItem('admin_token') || localStorage.getItem('token') || '';
      const params = new URLSearchParams();
      if (selectedDept !== 'ALL') params.append('department', selectedDept);
      if (selectedYear !== 'ALL') params.append('year', selectedYear);
      if (currentToken) params.append('token', currentToken);

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const endpoint = format === 'xlsx'
        ? `/api/attendance/export-xlsx/${selectedSessionId}${queryStr}`
        : `/api/attendance/export/${selectedSessionId}${queryStr}`;

      const res = await axios.get(endpoint, {
        headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {},
        responseType: 'blob'
      });

      // Authoritative client-side filename matching user format:
      // Event name-Department-Year.csv/xlsx
      // Event name-Year.csv/xlsx
      // Event name-Department.csv/xlsx
      // Event name.csv/xlsx
      const currentSession = sessions.find((s) => String(s.id) === String(selectedSessionId)) || sessionData;
      const fileName = computeExportFilename({
        department: selectedDept,
        year: selectedYear,
        subjectName: currentSession?.subject_name || sessionData?.subject_name,
        hourNumber: currentSession?.hour_number || sessionData?.hour_number,
        ext: format
      });

      const mimeType = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8;';
      const blob = new Blob([res.data], { type: mimeType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('[Export Error]', err);
      let errMsg = 'Failed to download attendance file.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          if (json.error) errMsg = `Failed: ${json.error}`;
        } catch (_) {}
      } else if (err.response?.data?.error) {
        errMsg = `Failed: ${err.response.data.error}`;
      } else if (err.message) {
        errMsg = `Failed: ${err.message}`;
      }
      alert(errMsg);
    } finally {
      setExportingFormat(null);
    }
  };

  // Force update existing attendance record when conflict occurs
  const handleForceUpdateAttendance = async () => {
    if (!selectedSessionId) return;
    setManualLoading(true);
    try {
      if (manualMode === 'registered') {
        const res = await axios.post(
          '/api/admin/attendance/manual-mark',
          {
            session_id: parseInt(selectedSessionId, 10),
            student_id: manualStudentId.trim().toUpperCase(),
            remarks: manualRemarks.trim() || 'Manual override updated by administrator',
            force: true
          },
          { headers: getAuthHeaders() }
        );
        setManualMsg(res.data.message || 'Attendance record updated!');
        setManualMsgType('success');
      } else {
        const res = await axios.post(
          '/api/admin/attendance/manual-unregistered',
          {
            session_id: parseInt(selectedSessionId, 10),
            name: unregName.trim(),
            usn: unregUsn.trim().toUpperCase(),
            remarks: unregRemarks.trim() || 'Walk-in record updated by administrator',
            force: true
          },
          { headers: getAuthHeaders() }
        );
        setManualMsg(res.data.message || 'Attendance record updated!');
        setManualMsgType('success');
      }
      const freshRes = await axios.get(`/api/attendance/live/${selectedSessionId}`);
      setRecords(freshRes.data.records || []);
    } catch (err) {
      setManualMsg(err.response?.data?.error || 'Failed to update attendance record');
      setManualMsgType('error');
    } finally {
      setManualLoading(false);
    }
  };

  // Manual Override: Mark registered student attendance manually
  const handleManualMark = async (e) => {
    e.preventDefault();
    if (!manualStudentId.trim() || !selectedSessionId) return;

    setManualLoading(true);
    setManualMsg('');
    setManualMsgType('info');

    try {
      const res = await axios.post(
        '/api/admin/attendance/manual-mark',
        {
          session_id: parseInt(selectedSessionId, 10),
          student_id: manualStudentId.trim().toUpperCase(),
          remarks: manualRemarks.trim() || 'Manual entry by administrator'
        },
        { headers: getAuthHeaders() }
      );

      setManualMsg(res.data.message || 'Attendance manually marked!');
      setManualMsgType('success');
      setManualStudentId('');
      setManualRemarks('');

      // Refresh records
      const freshRes = await axios.get(`/api/attendance/live/${selectedSessionId}`);
      setRecords(freshRes.data.records || []);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to mark student manually';
      setManualMsg(errMsg);
      setManualMsgType(err.response?.status === 409 ? 'warning' : 'error');
    } finally {
      setManualLoading(false);
    }
  };

  // Manual Entry: Add and mark attendance for an unregistered / walk-in student
  const handleManualUnregistered = async (e) => {
    e.preventDefault();
    if (!unregName.trim() || !unregUsn.trim() || !selectedSessionId) {
      setManualMsg('Please fill in required fields (Student Full Name and USN).');
      setManualMsgType('error');
      return;
    }

    const yr = parseInt(unregYear, 10);
    let finalDept = unregDept.trim();
    let finalCycle = null;

    if (yr === 1) {
      finalCycle = unregCycle || 'Physics Cycle';
      finalDept = `Basic Sciences (${finalCycle})`;
    } else {
      if (!finalDept || finalDept === 'ALL') {
        setManualMsg('Please select an engineering department for Year 2, 3, or 4.');
        setManualMsgType('error');
        return;
      }
    }

    if (unregMobile.trim()) {
      const cleanMob = unregMobile.replace(/\D/g, '');
      if (cleanMob.length < 10) {
        setManualMsg('Mobile number must be at least 10 digits if provided.');
        setManualMsgType('error');
        return;
      }
    }

    setManualLoading(true);
    setManualMsg('');
    setManualMsgType('info');

    try {
      const res = await axios.post(
        '/api/admin/attendance/manual-unregistered',
        {
          session_id: parseInt(selectedSessionId, 10),
          name: unregName.trim(),
          usn: unregUsn.trim().toUpperCase(),
          year: yr,
          cycle: finalCycle,
          department: finalDept,
          mobile: unregMobile.trim(),
          remarks: unregRemarks.trim() || 'Unregistered walk-in attendee'
        },
        { headers: getAuthHeaders() }
      );

      setManualMsg(res.data.message || 'Unregistered student attendance recorded successfully!');
      setManualMsgType('success');

      // Clear fields on success
      setUnregName('');
      setUnregUsn('');
      setUnregMobile('');
      setUnregRemarks('');

      // Refresh records
      const freshRes = await axios.get(`/api/attendance/live/${selectedSessionId}`);
      setRecords(freshRes.data.records || []);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to record unregistered student attendance';
      setManualMsg(errMsg);
      setManualMsgType(err.response?.status === 409 ? 'warning' : 'error');
    } finally {
      setManualLoading(false);
    }
  };

  // Delete attendance entry
  const handleDeleteRecord = async (attendanceId) => {
    if (!window.confirm('Are you sure you want to remove this attendance record?')) return;
    try {
      await axios.delete(`/api/admin/attendance/${attendanceId}`, { headers: getAuthHeaders() });
      setRecords((prev) => prev.filter((r) => r.id !== attendanceId));
    } catch (err) {
      alert('Failed to delete attendance record: ' + (err.response?.data?.error || err.message));
    }
  };

  // Open Edit Modal
  const openEditModal = (rec) => {
    setEditingRecord(rec);
    setEditStudentId(rec.student_id);
    setEditGeoVerified(rec.geo_verified === 1 || rec.geo_verified === true);
    setEditError('');
  };

  // Save Edit Changes
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    setEditLoading(true);
    setEditError('');

    try {
      const res = await axios.put(
        `/api/admin/attendance/${editingRecord.id}`,
        {
          student_id: editStudentId.trim().toUpperCase(),
          geo_verified: editGeoVerified ? 1 : 0
        },
        { headers: getAuthHeaders() }
      );

      const updated = res.data.record;
      setRecords((prev) => prev.map((r) => (r.id === editingRecord.id ? { ...r, ...updated } : r)));
      setEditingRecord(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update attendance record');
    } finally {
      setEditLoading(false);
    }
  };

  // Unique departments present in current records
  const availableDepts = Array.from(new Set(records.map(r => r.department).filter(Boolean))).sort();

  // Filter and sort records
  const filteredRecords = records
    .filter((r) => {
      const s = searchTerm.toLowerCase();
      const matchesSearch =
        (r.name || '').toLowerCase().includes(s) ||
        (r.student_id || '').toLowerCase().includes(s) ||
        (r.usn || '').toLowerCase().includes(s) ||
        (r.department || '').toLowerCase().includes(s) ||
        (r.remarks || '').toLowerCase().includes(s) ||
        (s === 'unregistered' && r.is_registered === 0) ||
        (s === 'walk-in' && r.is_registered === 0) ||
        (s === 'registered' && (r.is_registered === 1 || r.is_registered === null));

      const matchesDept = selectedDept === 'ALL' || r.department === selectedDept;
      const matchesYear = selectedYear === 'ALL' || String(r.year) === String(selectedYear);

      return matchesSearch && matchesDept && matchesYear;
    })
    .sort((a, b) => {
      if (sortBy === 'time_desc') return b.id - a.id;
      if (sortBy === 'time_asc') return a.id - b.id;
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'usn_asc') return (a.usn || '').localeCompare(b.usn || '');
      return 0;
    });

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">
                Attendance Registry
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Live <span className="italic text-amber-400">Attendance Feed.</span>
            </h1>
          </div>

          {/* Export CSV & Polling Status */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsLivePolling(!isLivePolling)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                isLivePolling
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94]'
              }`}
            >
              <Radio className={`h-3.5 w-3.5 ${isLivePolling ? 'animate-pulse' : ''}`} />
              <span>{isLivePolling ? 'Live Feed ON' : 'Paused'}</span>
            </button>

            {/* Export CSV & XLSX buttons */}
            <button
              onClick={() => handleExport('csv')}
              disabled={!records.length || !!exportingFormat}
              className="flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#f5f0ea] hover:border-amber-500/50 hover:bg-[#201c18] transition disabled:opacity-40"
              title={`Export filtered records to CSV (${computeExportFilename({ department: selectedDept, year: selectedYear, subjectName: sessionData?.subject_name, hourNumber: sessionData?.hour_number, ext: 'csv' })})`}
            >
              {exportingFormat === 'csv' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
              ) : (
                <Download className="h-3.5 w-3.5 text-amber-400" />
              )}
              <span>{exportingFormat === 'csv' ? 'Exporting...' : 'CSV'}</span>
            </button>

            <button
              onClick={() => handleExport('xlsx')}
              disabled={!records.length || !!exportingFormat}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-40"
              title={`Export filtered records to Excel XLSX (${computeExportFilename({ department: selectedDept, year: selectedYear, subjectName: sessionData?.subject_name, hourNumber: sessionData?.hour_number, ext: 'xlsx' })})`}
            >
              {exportingFormat === 'xlsx' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              <span>{exportingFormat === 'xlsx' ? 'Exporting...' : 'Excel (.XLSX)'}</span>
            </button>
          </div>
        </div>

        {/* Session Selector & Manual Mark Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Session Picker & Stats */}
          <div className="lg:col-span-2 rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Select Classroom / Event Session:
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => {
                    setSelectedSessionId(e.target.value);
                    setSearchParams({ session: e.target.value });
                  }}
                  className="rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-sm text-[#f5f0ea] focus:border-amber-500 focus:outline-none min-w-[280px]"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#120f0d]">
                      {s.is_active ? '🟢 [LIVE] ' : '⚪ '}Hour {s.hour_number}: {s.subject_name}
                    </option>
                  ))}
                </select>
              </div>

              {sessionData && (
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-[#a39b94] block text-[10px] uppercase tracking-wider">Headcount</span>
                    <span className="font-mono text-2xl font-bold text-amber-400">
                      {records.length}
                    </span>
                  </div>
                  <div className="border-l border-[rgba(255,235,215,0.1)] pl-3">
                    <span className="text-[#a39b94] block text-[10px] uppercase tracking-wider">Registered</span>
                    <span className="font-mono text-base font-semibold text-emerald-400">
                      {records.filter(r => r.is_registered === 1 || r.is_registered === null).length}
                    </span>
                  </div>
                  <div className="border-l border-[rgba(255,235,215,0.1)] pl-3">
                    <span className="text-[#a39b94] block text-[10px] uppercase tracking-wider">Walk-ins</span>
                    <span className="font-mono text-base font-semibold text-amber-400">
                      {records.filter(r => r.is_registered === 0).length}
                    </span>
                  </div>
                  <div className="border-l border-[rgba(255,235,215,0.1)] pl-3">
                    <span className="text-[#a39b94] block text-[10px] uppercase tracking-wider">Last Polled</span>
                    <span className="font-mono text-xs text-[#f5f0ea]">
                      {lastUpdated || 'Connecting...'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Manual Attendance (Registered & Unregistered / Walk-ins) */}
          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <UserPlus className="h-4 w-4" />
                <span>Manual Attendance</span>
              </div>
              <span className="text-[10px] text-[#706860]">
                {manualMode === 'registered' ? 'Registered Roster' : 'Walk-in / Unregistered'}
              </span>
            </div>

            {/* Mode Switch Tabs */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-[#181512] border border-[rgba(255,235,215,0.08)] text-[11px] font-medium">
              <button
                type="button"
                onClick={() => {
                  setManualMode('registered');
                  setManualMsg('');
                }}
                className={`py-1.5 rounded-lg transition text-center ${
                  manualMode === 'registered'
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                    : 'text-[#a39b94] hover:text-[#f5f0ea]'
                }`}
              >
                Registered Student
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualMode('unregistered');
                  setManualMsg('');
                }}
                className={`py-1.5 rounded-lg transition text-center ${
                  manualMode === 'unregistered'
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                    : 'text-[#a39b94] hover:text-[#f5f0ea]'
                }`}
              >
                + Add Unregistered
              </button>
            </div>

            {/* Warning if no session is selected */}
            {!selectedSessionId && (
              <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                <span>Please select a classroom or event session in the selector above to record attendance.</span>
              </div>
            )}

            {/* Registered Student Form */}
            {manualMode === 'registered' ? (
              <form onSubmit={handleManualMark} className="space-y-2.5">
                <div>
                  <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                    Student ID, USN, or Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ARJU9870, 1MJ24EC094, or Arjun"
                    value={manualStudentId}
                    onChange={(e) => setManualStudentId(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 text-xs font-mono uppercase text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                    Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Device dead, Scan issue"
                    value={manualRemarks}
                    onChange={(e) => setManualRemarks(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={manualLoading || !manualStudentId.trim() || !selectedSessionId}
                  className="w-full rounded-full border border-[rgba(240,150,80,0.3)] bg-amber-500/10 py-2 text-xs font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40"
                >
                  {manualLoading ? 'Marking...' : !selectedSessionId ? 'Select Session First' : 'Mark Registered Attendance'}
                </button>
              </form>
            ) : (
              /* Unregistered / Walk-in Student Form */
              <form onSubmit={handleManualUnregistered} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={unregName}
                      onChange={(e) => setUnregName(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                      USN / Student ID *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 1MJ23CS099"
                      value={unregUsn}
                      onChange={(e) => setUnregUsn(e.target.value.toUpperCase())}
                      className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs font-mono uppercase text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                      Year *
                    </label>
                    <select
                      value={unregYear}
                      onChange={(e) => setUnregYear(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-2.5 py-1.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                    >
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>

                  {unregYear === '1' ? (
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                        Cycle *
                      </label>
                      <select
                        value={unregCycle}
                        onChange={(e) => setUnregCycle(e.target.value)}
                        className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-2.5 py-1.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                      >
                        <option value="Physics Cycle">Physics Cycle</option>
                        <option value="Chemistry Cycle">Chemistry Cycle</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                        Department *
                      </label>
                      <select
                        value={unregDept}
                        onChange={(e) => setUnregDept(e.target.value)}
                        className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-2.5 py-1.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none truncate"
                      >
                        {MVJCE_SCHOOLS.filter(s => s.school !== 'School of Basic Sciences (1st Year Cycles)').map(school => (
                          <optgroup key={school.school} label={school.school} className="bg-[#120f0d] text-amber-400 font-semibold">
                            {school.departments.map(dept => (
                              <option key={dept} value={dept} className="bg-[#181512] text-[#f5f0ea] font-normal">
                                {dept}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                      Mobile (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="10-digit number"
                      value={unregMobile}
                      onChange={(e) => setUnregMobile(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-[#a39b94] mb-1">
                      Remarks (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Unregistered walk-in"
                      value={unregRemarks}
                      onChange={(e) => setUnregRemarks(e.target.value)}
                      className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-1.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={manualLoading || !unregName.trim() || !unregUsn.trim() || !selectedSessionId}
                  className="w-full rounded-full border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-amber-600/20 py-2 text-xs font-semibold uppercase tracking-wider text-amber-300 hover:from-amber-500/30 hover:to-amber-600/30 transition disabled:opacity-40"
                >
                  {manualLoading ? 'Saving & Marking...' : !selectedSessionId ? 'Select Session First' : 'Mark Unregistered Attendance'}
                </button>
              </form>
            )}

            {/* Status / Feedback alert */}
            {manualMsg && (
              <div
                className={`p-3 rounded-xl border text-xs flex flex-col gap-2 ${
                  manualMsgType === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : manualMsgType === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {manualMsgType === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  )}
                  <span className="flex-1 text-[11px] leading-tight">{manualMsg}</span>
                </div>

                {/* If student wasn't found in registered roster, offer 1-click switch to + Add Unregistered */}
                {manualMode === 'registered' && (manualMsg.includes('not found') || manualMsg.includes('Unregistered') || manualMsg.includes('+ Add Unregistered')) && (
                  <button
                    type="button"
                    onClick={() => {
                      setManualMode('unregistered');
                      setUnregUsn(manualStudentId.trim().toUpperCase());
                      setManualMsg('');
                    }}
                    className="self-start inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition"
                  >
                    <span>+ Add as Unregistered / Walk-in ({manualStudentId.trim().toUpperCase()})</span>
                  </button>
                )}

                {/* If attendance was already marked in this session, allow force update of remarks/status */}
                {manualMsg.includes('already marked') && (
                  <button
                    type="button"
                    onClick={handleForceUpdateAttendance}
                    disabled={manualLoading}
                    className="self-start inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 transition disabled:opacity-50"
                  >
                    <span>Force Update Record & Remarks</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="relative md:col-span-5">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#706860]" />
              <input
                type="text"
                placeholder="Search by Name, Student ID, USN, Department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#181512] pl-10 pr-3.5 py-2 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#706860] hover:text-[#f5f0ea]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Department Filter */}
            <div className="md:col-span-3">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                aria-label="Filter by department"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Departments</option>
                {MVJCE_SCHOOLS.map((school) => (
                  <optgroup key={school.school} label={school.school} className="bg-[#120f0d] text-[#a39b94] font-semibold">
                    {school.departments.map((d) => (
                      <option key={d} value={d} className="bg-[#181512] text-[#f5f0ea] font-normal">
                        {d}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {records.some(r => r.department && !ALL_MVJCE_DEPARTMENTS.includes(r.department)) && (
                  <optgroup label="Other in Session" className="bg-[#120f0d] text-[#a39b94] font-semibold">
                    {Array.from(new Set(records.map(r => r.department).filter(d => d && !ALL_MVJCE_DEPARTMENTS.includes(d)))).map(d => (
                      <option key={d} value={d} className="bg-[#181512] text-[#f5f0ea] font-normal">
                        {d}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Academic Year Filter */}
            <div className="md:col-span-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                aria-label="Filter by academic year"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            {/* Sort Options */}
            <div className="md:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort attendance list"
                className="w-full min-h-[44px] rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              >
                <option value="time_desc">Newest First</option>
                <option value="time_asc">Oldest First</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="usn_asc">USN / Admission</option>
              </select>
            </div>
          </div>

          {/* Active Filter Badges & Count */}
          <div className="flex flex-wrap items-center justify-between text-xs text-[#a39b94] pt-1 border-t border-[rgba(255,235,215,0.04)]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">
                Showing <strong className="text-amber-400 font-bold">{filteredRecords.length}</strong> of {records.length} records
              </span>
              {(selectedDept !== 'ALL' || selectedYear !== 'ALL' || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDept('ALL');
                    setSelectedYear('ALL');
                    setSearchTerm('');
                  }}
                  className="text-amber-400 hover:underline text-[11px] ml-2"
                >
                  Reset Filters
                </button>
              )}
            </div>
            {(selectedDept !== 'ALL' || selectedYear !== 'ALL') && (
              <span className="text-[11px] text-[#706860]">
                Exports will include filtered results ({selectedDept !== 'ALL' ? selectedDept : 'All Depts'}, {selectedYear !== 'ALL' ? `Yr ${selectedYear}` : 'All Years'})
              </span>
            )}
          </div>
        </div>

        {/* Live Attendance Table */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">#</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">Student Name</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">Student ID</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">USN</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">Department / Cycle</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">Year</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">Time Marked</th>
                  <th className="px-5 py-3.5 font-semibold whitespace-nowrap">GPS Verified</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,235,215,0.06)] text-[#f5f0ea]">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-[#706860] text-xs">
                      {records.length === 0
                        ? 'No attendance records logged yet for this session.'
                        : 'No records matching your search.'}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, i) => (
                    <tr key={r.id} className="hover:bg-[#181512]/60 transition">
                      <td className="px-5 py-3.5 font-mono text-[#706860]">{i + 1}</td>
                      <td className="px-5 py-3.5 font-medium">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{r.name}</span>
                          {r.is_registered === 0 ? (
                            <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-semibold text-amber-300 uppercase tracking-wider">
                              Unregistered
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                              Registered
                            </span>
                          )}
                          {(r.is_manual === 1 || (r.token_used && r.token_used.startsWith('MANUAL'))) && (
                            <span className="inline-flex items-center rounded-full bg-zinc-800 border border-zinc-700/60 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300">
                              Manual
                            </span>
                          )}
                        </div>
                        {r.remarks && (
                          <div className="text-[10px] text-[#8c827a] italic mt-0.5 max-w-[200px] truncate" title={r.remarks}>
                            {r.remarks}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-bold text-amber-400">
                        {r.student_id}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#a39b94]">{r.usn}</td>
                      <td className="px-5 py-3.5 text-[#a39b94]">
                        {r.year === 1 && r.cycle ? `${r.cycle}` : r.department}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full border border-[rgba(255,235,215,0.1)] px-2.5 py-0.5 text-[10px] font-mono text-[#a39b94] whitespace-nowrap">
                          Yr {r.year}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#a39b94]">
                        {(() => {
                          // SQLite CURRENT_TIMESTAMP returns 'YYYY-MM-DD HH:MM:SS' in UTC without 'Z'.
                          // Normalise to ISO 8601 so all browsers parse it as UTC.
                          const raw = r.marked_at || '';
                          const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z');
                          const d = new Date(iso);
                          return isNaN(d) ? raw : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        {r.geo_verified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Inside
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#706860]">Bypassed</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-2 text-amber-400 hover:bg-amber-500/10 transition active:scale-95"
                            title="Edit attendance entry"
                            aria-label={`Edit attendance for ${r.name}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(r.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg p-2 text-red-400 hover:bg-red-500/10 transition active:scale-95"
                            title="Remove record"
                            aria-label={`Delete record for ${r.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Attendance Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm safe-top safe-bottom overflow-y-auto">
          <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
              <div>
                <h3 className="font-serif text-lg font-normal text-[#f5f0ea]">
                  Edit Attendance Entry
                </h3>
                <p className="text-[11px] text-[#a39b94]">
                  {editingRecord.name} • {editingRecord.usn}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Student ID
                </label>
                <input
                  type="text"
                  required
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs uppercase text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Geofence GPS Status
                </label>
                <select
                  value={editGeoVerified ? '1' : '0'}
                  onChange={(e) => setEditGeoVerified(e.target.value === '1')}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                >
                  <option value="1">🟢 Verified Inside Geofence</option>
                  <option value="0">⚪ Bypassed / Manual Admin Entry</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2 text-xs font-semibold uppercase tracking-wider text-[#a39b94] hover:text-[#f5f0ea]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow hover:opacity-95 disabled:opacity-50"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
