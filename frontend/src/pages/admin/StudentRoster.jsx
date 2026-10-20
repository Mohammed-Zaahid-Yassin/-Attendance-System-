import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { Users, Search, Trash2, Filter } from 'lucide-react';

export default function StudentRoster() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('admin_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (yearFilter) params.year = yearFilter;

      const res = await axios.get('/api/admin/students', {
        ...axiosConfig,
        params
      });
      setStudents(res.data.students || []);
    } catch (err) {
      console.error('Failed to load roster', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [yearFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchStudents();
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to delete student "${studentName}" (${studentId}) from the roster?`)) return;

    try {
      await axios.delete(`/api/admin/students/${studentId}`, axiosConfig);
      setStudents((prev) => prev.filter((s) => s.student_id !== studentId));
    } catch (err) {
      alert('Failed to delete student: ' + (err.response?.data?.error || err.message));
    }
  };

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
                Database Roster
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Registered <span className="italic text-amber-400">Students.</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[rgba(240,150,80,0.25)] bg-[#18130e] px-4 py-2 text-xs">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm font-bold text-[#f5f0ea]">{students.length}</span>
            <span className="text-[#a39b94] text-[11px] uppercase tracking-wider">Total Enrolled</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#706860]" />
            <input
              type="text"
              placeholder="Search by Name, USN, Student ID, or Mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] pl-11 pr-4 py-2.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
            />
          </form>

          {/* Year Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-[#706860] shrink-0" />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              aria-label="Filter roster by academic year"
              className="w-full sm:w-auto rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            >
              <option value="">All Academic Years</option>
              <option value="1">1st Year Only</option>
              <option value="2">2nd Year Only</option>
              <option value="3">3rd Year Only</option>
              <option value="4">4th Year Only</option>
            </select>
          </div>
        </div>

        {/* Students Table */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">#</th>
                  <th className="px-5 py-3.5 font-semibold">Student Name</th>
                  <th className="px-5 py-3.5 font-semibold">Student ID</th>
                  <th className="px-5 py-3.5 font-semibold">USN / Admission No</th>
                  <th className="px-5 py-3.5 font-semibold">Department / Cycle</th>
                  <th className="px-5 py-3.5 font-semibold">Year</th>
                  <th className="px-5 py-3.5 font-semibold">Mobile</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,235,215,0.06)] text-[#f5f0ea]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-[#706860]">
                      Loading student roster...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-[#706860]">
                      No students found in the roster matching criteria.
                    </td>
                  </tr>
                ) : (
                  students.map((s, index) => (
                    <tr key={s.id} className="hover:bg-[#181512]/60 transition">
                      <td className="px-5 py-3.5 font-mono text-[#706860]">{index + 1}</td>
                      <td className="px-5 py-3.5 font-medium">{s.name}</td>
                      <td className="px-5 py-3.5 font-mono font-bold text-amber-400">
                        {s.student_id}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#a39b94]">{s.usn}</td>
                      <td className="px-5 py-3.5 text-[#a39b94]">
                        {s.year === 1 && s.cycle ? `${s.cycle}` : s.department}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full border border-[rgba(255,235,215,0.1)] px-2.5 py-0.5 text-[10px] font-mono text-[#a39b94]">
                          Year {s.year}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#706860]">{s.mobile}</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(s.student_id, s.name)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition"
                          title="Delete student from database"
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
