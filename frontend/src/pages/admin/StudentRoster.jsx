import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { Users, Search, Trash2, Filter, Edit2, X, Save } from 'lucide-react';
import { MVJCE_SCHOOLS, ALL_MVJCE_DEPARTMENTS } from '../../utils/departments';

export default function StudentRoster() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit student modal state
  const [editingStudent, setEditingStudent] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUsn, setEditUsn] = useState('');
  const [editStudentId, setEditStudentId] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editYear, setEditYear] = useState(1);
  const [editCycle, setEditCycle] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

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
      if (deptFilter) params.department = deptFilter;

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
  }, [yearFilter, deptFilter]);

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

  // Open Edit Modal
  const openEditModal = (student) => {
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditUsn(student.usn || '');
    setEditStudentId(student.student_id || '');
    setEditDept(student.department || '');
    setEditYear(student.year || 1);
    setEditCycle(student.cycle || '');
    setEditMobile(student.mobile || '');
    setEditError('');
  };

  // Save Edit Changes
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;
    setEditLoading(true);
    setEditError('');

    try {
      const res = await axios.put(
        `/api/admin/students/${editingStudent.student_id}`,
        {
          name: editName.trim(),
          usn: editUsn.trim().toUpperCase(),
          new_student_id: editStudentId.trim().toUpperCase(),
          department: editDept.trim(),
          year: parseInt(editYear, 10),
          cycle: editYear === 1 ? editCycle : null,
          mobile: editMobile.trim()
        },
        axiosConfig
      );

      const updated = res.data.student;
      setStudents((prev) =>
        prev.map((s) => (s.id === editingStudent.id ? updated : s))
      );
      setEditingStudent(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update student details');
    } finally {
      setEditLoading(false);
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
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <form onSubmit={handleSearchSubmit} className="relative sm:col-span-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#706860]" />
            <input
              type="text"
              placeholder="Search by Name, USN, Student ID, or Mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] pl-11 pr-4 py-2.5 text-xs text-[#f5f0ea] placeholder-[#554e48] focus:border-amber-500 focus:outline-none"
            />
          </form>

          {/* Department Filter */}
          <div className="sm:col-span-3">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Filter roster by department"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            >
              <option value="">All Departments</option>
              {MVJCE_SCHOOLS.map((school) => (
                <optgroup key={school.school} label={school.school} className="bg-[#120f0d] text-[#a39b94] font-semibold">
                  {school.departments.map((d) => (
                    <option key={d} value={d} className="bg-[#181512] text-[#f5f0ea] font-normal">
                      {d}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="sm:col-span-3">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              aria-label="Filter roster by academic year"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
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
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">#</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">Student Name</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">Student ID</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">USN / Admission No</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">Department / Cycle</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">Year</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap">Mobile</th>
                  <th className="px-4 py-3.5 font-semibold whitespace-nowrap text-right">Actions</th>
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
                        <span className="rounded-full border border-[rgba(255,235,215,0.1)] px-2.5 py-0.5 text-[10px] font-mono text-[#a39b94] whitespace-nowrap">
                          Year {s.year}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[#706860]">{s.mobile}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="rounded-lg p-1.5 text-amber-400 hover:bg-amber-500/10 transition"
                            title="Edit student entry"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(s.student_id, s.name)}
                            className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10 transition"
                            title="Delete student from database"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
              <div>
                <h3 className="font-serif text-lg font-normal text-[#f5f0ea]">
                  Edit Student Details
                </h3>
                <p className="text-[11px] text-[#a39b94]">
                  Update student information in the official roster
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
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

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    USN / Admission No
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsn}
                    onChange={(e) => setEditUsn(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs uppercase text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Student ID
                  </label>
                  <input
                    type="text"
                    required
                    value={editStudentId}
                    onChange={(e) => setEditStudentId(e.target.value.toUpperCase())}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs uppercase text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={editMobile}
                    onChange={(e) => setEditMobile(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Department
                  </label>
                  <select
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Select Department...</option>
                    {editDept && !ALL_MVJCE_DEPARTMENTS.includes(editDept) && (
                      <option value={editDept} className="bg-[#181512] text-[#f5f0ea] font-semibold">
                        {editDept} (Current)
                      </option>
                    )}
                    {MVJCE_SCHOOLS.map((school) => (
                      <optgroup key={school.school} label={school.school} className="bg-[#120f0d] text-[#a39b94] font-semibold">
                        {school.departments.map((d) => (
                          <option key={d} value={d} className="bg-[#181512] text-[#f5f0ea] font-normal">
                            {d}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Academic Year
                  </label>
                  <select
                    value={editYear}
                    onChange={(e) => setEditYear(parseInt(e.target.value, 10))}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  >
                    <option value={1}>1st Year</option>
                    <option value={2}>2nd Year</option>
                    <option value={3}>3rd Year</option>
                    <option value={4}>4th Year</option>
                  </select>
                </div>
              </div>

              {editYear === 1 && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                    Cycle (1st Year Only)
                  </label>
                  <select
                    value={editCycle}
                    onChange={(e) => setEditCycle(e.target.value)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  >
                    <option value="Physics Cycle">Physics Cycle</option>
                    <option value="Chemistry Cycle">Chemistry Cycle</option>
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2 text-xs font-semibold uppercase tracking-wider text-[#a39b94] hover:text-[#f5f0ea]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{editLoading ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
