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
  AlertCircle
} from 'lucide-react';

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

  // Manual mark state
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMsg, setManualMsg] = useState('');

  const token = localStorage.getItem('admin_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  // 1. Fetch all sessions for dropdown selector
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await axios.get('/api/admin/sessions', axiosConfig);
        const list = res.data.sessions || [];
        setSessions(list);

        if (!selectedSessionId && list.length > 0) {
          const active = list.find((s) => s.is_active === 1) || list[0];
          setSelectedSessionId(String(active.id));
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

  // Export CSV
  const handleExportCSV = () => {
    if (!selectedSessionId) return;
    const exportUrl = `/api/attendance/export/${selectedSessionId}`;
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Manual Override: Mark student attendance manually
  const handleManualMark = async (e) => {
    e.preventDefault();
    if (!manualStudentId.trim()) return;

    setManualLoading(true);
    setManualMsg('');

    try {
      const res = await axios.post(
        '/api/admin/attendance/manual-mark',
        {
          session_id: parseInt(selectedSessionId, 10),
          student_id: manualStudentId.trim().toUpperCase()
        },
        axiosConfig
      );

      setManualMsg(res.data.message || 'Attendance manually marked!');
      setManualStudentId('');

      // Refresh records
      const freshRes = await axios.get(`/api/attendance/live/${selectedSessionId}`);
      setRecords(freshRes.data.records || []);
    } catch (err) {
      setManualMsg(err.response?.data?.error || 'Failed to mark student manually');
    } finally {
      setManualLoading(false);
    }
  };

  // Delete attendance entry
  const handleDeleteRecord = async (attendanceId) => {
    if (!window.confirm('Are you sure you want to remove this attendance record?')) return;
    try {
      await axios.delete(`/api/admin/attendance/${attendanceId}`, axiosConfig);
      setRecords((prev) => prev.filter((r) => r.id !== attendanceId));
    } catch (err) {
      alert('Failed to delete attendance record: ' + (err.response?.data?.error || err.message));
    }
  };

  // Filter records by search
  const filteredRecords = records.filter((r) => {
    const s = searchTerm.toLowerCase();
    return (
      (r.name || '').toLowerCase().includes(s) ||
      (r.student_id || '').toLowerCase().includes(s) ||
      (r.usn || '').toLowerCase().includes(s) ||
      (r.department || '').toLowerCase().includes(s)
    );
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

            <button
              onClick={handleExportCSV}
              disabled={!records.length}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV (SQLite)</span>
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
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-[#a39b94] block text-[10px] uppercase">Headcount</span>
                    <span className="font-mono text-2xl font-bold text-amber-400">
                      {records.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#a39b94] block text-[10px] uppercase">Last Polled</span>
                    <span className="font-mono text-xs text-[#f5f0ea]">
                      {lastUpdated || 'Connecting...'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Manual Attendance Override */}
          <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
              <UserPlus className="h-4 w-4" />
              <span>Manual Attendance Override</span>
            </div>
            <form onSubmit={handleManualMark} className="space-y-2">
              <input
                type="text"
                placeholder="Student ID (e.g. ARJU3210)"
                value={manualStudentId}
                onChange={(e) => setManualStudentId(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs font-mono uppercase text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={manualLoading || !manualStudentId.trim()}
                className="w-full rounded-full border border-[rgba(240,150,80,0.3)] bg-amber-500/10 py-2 text-xs font-semibold uppercase tracking-wider text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-40"
              >
                {manualLoading ? 'Marking...' : 'Add Attendance'}
              </button>
            </form>
            {manualMsg && (
              <p className="mt-2 text-[11px] text-[#a39b94]">{manualMsg}</p>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#706860]" />
          <input
            type="text"
            placeholder="Search attendees by Name, Student ID, USN, or Department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] pl-11 pr-4 py-3 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Live Attendance Table */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">#</th>
                  <th className="px-5 py-3.5 font-semibold">Student Name</th>
                  <th className="px-5 py-3.5 font-semibold">Student ID</th>
                  <th className="px-5 py-3.5 font-semibold">USN</th>
                  <th className="px-5 py-3.5 font-semibold">Department / Cycle</th>
                  <th className="px-5 py-3.5 font-semibold">Year</th>
                  <th className="px-5 py-3.5 font-semibold">Time Marked</th>
                  <th className="px-5 py-3.5 font-semibold">GPS Verified</th>
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
                      <td className="px-5 py-3.5 font-medium">{r.name}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-amber-400">
                        {r.student_id}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#a39b94]">{r.usn}</td>
                      <td className="px-5 py-3.5 text-[#a39b94]">
                        {r.year === 1 && r.cycle ? `${r.cycle}` : r.department}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full border border-[rgba(255,235,215,0.1)] px-2.5 py-0.5 text-[10px] font-mono text-[#a39b94]">
                          Yr {r.year}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#a39b94]">
                        {new Date(r.marked_at).toLocaleTimeString()}
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
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(r.id)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition"
                          title="Remove record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
