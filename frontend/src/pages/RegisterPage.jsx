import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
  ShieldAlert, 
  CheckCircle2, 
  Copy, 
  Check, 
  ArrowRight, 
  Sparkles
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

import { MVJCE_SCHOOLS, ALL_MVJCE_DEPARTMENTS as MVJCE_DEPARTMENTS } from '../utils/departments';

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';

  const [isVerifyingKey, setIsVerifyingKey] = useState(true);
  const [isKeyValid, setIsKeyValid] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    usn: '',
    department: 'Computer Science and Engineering (CSE)',
    year: '1',
    cycle: 'Physics Cycle',
    mobile: ''
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [registeredStudent, setRegisteredStudent] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Verify registration key on page load
  useEffect(() => {
    if (!key) {
      setIsVerifyingKey(false);
      setIsKeyValid(false);
      return;
    }

    axios
      .get(`/api/registration-key/verify?key=${encodeURIComponent(key)}`)
      .then((res) => {
        if (res.data.valid) {
          setIsKeyValid(true);
        }
      })
      .catch(() => {
        setIsKeyValid(false);
      })
      .finally(() => {
        setIsVerifyingKey(false);
      });
  }, [key]);

  // Dynamic live generation: First 4 letters of name in CAPITAL + last 4 digits of mobile
  const dynamicStudentID = useMemo(() => {
    const cleanName = (formData.name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    const namePart = cleanName.length >= 4 
      ? cleanName.substring(0, 4) 
      : (cleanName ? cleanName.padEnd(4, '•') : '••••');

    const cleanMobile = (formData.mobile || '').replace(/\D/g, '');
    const mobilePart = cleanMobile.length >= 4 
      ? cleanMobile.slice(-4) 
      : (cleanMobile ? cleanMobile.padStart(4, '•') : '••••');

    return `${namePart}${mobilePart}`;
  }, [formData.name, formData.mobile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCopyId = async () => {
    if (registeredStudent?.student_id) {
      const ok = await copyToClipboard(registeredStudent.student_id);
      if (ok) {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2500);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const cleanMobile = formData.mobile.replace(/\D/g, '');
      if (cleanMobile.length !== 10) {
        setErrorMsg('Please enter a valid 10-digit mobile number.');
        setLoading(false);
        return;
      }

      if (formData.name.trim().length < 2) {
        setErrorMsg('Please enter your full official name.');
        setLoading(false);
        return;
      }

      if (!formData.usn.trim()) {
        setErrorMsg(formData.year === '1' ? 'Please enter your Admission Number or USN.' : 'Please enter your USN.');
        setLoading(false);
        return;
      }

      const payload = {
        key,
        name: formData.name.trim(),
        usn: formData.usn.trim().toUpperCase(),
        department: formData.year === '1' ? 'First Year Basic Sciences' : formData.department,
        year: parseInt(formData.year, 10),
        cycle: formData.year === '1' ? formData.cycle : null,
        mobile: cleanMobile
      };

      const res = await axios.post('/api/register', payload);
      setRegisteredStudent(res.data.student);
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed. Please check your entered details.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // 1. Verifying key state
  if (isVerifyingKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] p-6 text-center">
        <div className="flex flex-col items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500"></div>
          <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-[#a39b94]">
            Authenticating Registration Portal...
          </p>
        </div>
      </div>
    );
  }

  // 2. Access Denied (Must be scanned via official Admin Static QR)
  if (!isKeyValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] p-6">
        <div className="w-full max-w-md rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-serif text-2xl font-normal text-[#f5f0ea]">
            Restricted Portal Access
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-[#a39b94]">
            Student registration is strictly controlled. You must scan the authorized physical <strong className="text-[#f5f0ea]">Admin Static QR Code</strong> to access this page.
          </p>
          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860]">
            Please contact event staff or the faculty in charge at the auditorium desk to obtain the official registration code.
          </div>
        </div>
      </div>
    );
  }

  // 3. Success View
  if (registeredStudent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] py-12 px-4 sm:px-6">
        <div className="w-full max-w-lg rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#120f0d] p-8 sm:p-10 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <p className="mt-4 text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">
            MVJ College of Engineering
          </p>
          <h1 className="mt-1 text-center font-serif text-3xl font-normal text-[#f5f0ea]">
            Registration <span className="italic font-normal text-amber-400">Confirmed.</span>
          </h1>
          <p className="mt-2 text-center text-xs text-[#a39b94]">
            Your profile has been registered in the official database.
          </p>

          {/* Student ID / Unique Password Display Card */}
          <div className="mt-8 rounded-xl border border-[rgba(240,150,80,0.3)] bg-gradient-to-b from-[#1c1713] to-[#120f0d] p-6 text-center shadow-lg">
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#a39b94]">
              Your Student ID / Attendance Password
            </span>
            <div className="mt-2 font-mono text-3xl sm:text-4xl font-bold tracking-[0.18em] text-[#f5f0ea]">
              {registeredStudent.student_id}
            </div>
            <p className="mt-2 text-[11px] text-[#a39b94]">
              First 4 letters of your Name (CAPITAL) + Last 4 digits of your Mobile Number.
            </p>

            <button
              type="button"
              onClick={handleCopyId}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-4 py-2 text-xs font-medium text-[#f5f0ea] transition hover:border-amber-500 hover:text-amber-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
            >
              {copiedId ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Student ID</span>
                </>
              )}
            </button>
          </div>

          {/* Registration Details Summary */}
          <div className="mt-6 divide-y divide-[rgba(255,235,215,0.06)] rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-xs text-[#a39b94]">
            <div className="flex justify-between py-2">
              <span>Full Name</span>
              <span className="font-medium text-[#f5f0ea]">{registeredStudent.name}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>USN / Admission No</span>
              <span className="font-mono font-medium text-[#f5f0ea]">{registeredStudent.usn}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Academic Year</span>
              <span className="font-medium text-[#f5f0ea]">Year {registeredStudent.year}</span>
            </div>
            {registeredStudent.cycle && (
              <div className="flex justify-between py-2">
                <span>Cycle</span>
                <span className="font-medium text-amber-400">{registeredStudent.cycle}</span>
              </div>
            )}
            {registeredStudent.year > 1 && (
              <div className="flex justify-between py-2">
                <span>Department</span>
                <span className="font-medium text-[#f5f0ea] text-right max-w-[220px]">{registeredStudent.department}</span>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span>Mobile</span>
              <span className="font-mono font-medium text-[#f5f0ea]">{registeredStudent.mobile}</span>
            </div>
          </div>

          {/* Important instructions */}
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-[12px] text-amber-200/90 leading-relaxed">
            <strong className="text-amber-400">Important:</strong> Please take a screenshot of this screen. When attendance opens, you will scan the projector QR code and enter this <span className="font-mono font-semibold text-[#f5f0ea] underline">{registeredStudent.student_id}</span> along with the displayed PIN.
          </div>

          {/* Anti-Proxy Device Registration Notice */}
          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-center text-xs text-[#706860]">
            <p className="font-medium text-[#a39b94]">Device Registration Complete</p>
            <p className="mt-1 text-[11px] leading-relaxed">
              This profile has been locked to this session. Each attendee must register exclusively on their own personal device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 4. Main Registration Form
  return (
    <div className="min-h-screen bg-[#080605] py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-xl">
        {/* Header matching Spotlight style */}
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
            Student <span className="italic text-amber-400">Registration.</span>
          </h1>
          <p className="mt-2 text-xs text-[#a39b94] max-w-md mx-auto leading-relaxed">
            Register your participant profile for automated dynamic attendance. This portal is strictly protected via the official static QR code.
          </p>
        </div>

        {/* Live Dynamic Student ID Card */}
        <div className="mb-6 rounded-2xl border border-[rgba(240,150,80,0.22)] bg-gradient-to-br from-[#16120e] to-[#0f0c0a] p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                Live Unique Student ID
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[#706860] font-mono">
              Real-Time
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.2em] text-[#f5f0ea]">
                {dynamicStudentID}
              </div>
              <p className="mt-1.5 text-[11px] text-[#a39b94]">
                Derived from first 4 letters of your Name (CAPITAL) + last 4 digits of your Mobile.
              </p>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-xs font-medium text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Registration Form Card */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Full Name (Compulsory) */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                Full Name <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. Arjun Sharma"
                value={formData.name}
                onChange={handleChange}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3 text-sm text-[#f5f0ea] placeholder-[#554e48] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="mt-1.5 block text-[11px] text-[#706860]">
                First 4 letters will form the prefix of your unique Student ID.
              </span>
            </div>

            {/* 2. Mobile Number (Compulsory) */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                Mobile Number <span className="text-amber-500">*</span>
              </label>
              <input
                type="tel"
                name="mobile"
                required
                maxLength={10}
                placeholder="10-digit mobile number"
                value={formData.mobile}
                onChange={handleChange}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3 font-mono text-sm text-[#f5f0ea] placeholder-[#554e48] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <span className="mt-1.5 block text-[11px] text-[#706860]">
                Last 4 digits will form the suffix of your unique Student ID.
              </span>
            </div>

            {/* 3. Year of Study (Compulsory) */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                Year of Study <span className="text-amber-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {['1', '2', '3', '4'].map((yr) => {
                  const isSelected = formData.year === yr;
                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, year: yr }))}
                      className={`min-h-[44px] rounded-xl border py-2.5 text-xs font-medium transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/15 text-amber-400 font-semibold'
                          : 'border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] hover:border-[rgba(255,235,215,0.2)] hover:text-[#f5f0ea]'
                      }`}
                    >
                      {yr === '1' ? '1st Year' : yr === '2' ? '2nd Year' : yr === '3' ? '3rd Year' : '4th Year'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Conditional Options based on Year */}
            {formData.year === '1' ? (
              /* If First Year: Cycle Selection (Physics / Chemistry) */
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400 mb-2">
                  Academic Cycle (1st Year) <span className="text-amber-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['Physics Cycle', 'Chemistry Cycle'].map((cyc) => {
                    const isSelected = formData.cycle === cyc;
                    return (
                      <button
                        key={cyc}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, cycle: cyc }))}
                        className={`min-h-[44px] rounded-xl border p-3 text-xs font-medium text-left transition flex items-center justify-between ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500/15 text-[#f5f0ea]'
                            : 'border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] hover:border-[rgba(255,235,215,0.18)]'
                        }`}
                      >
                        <span>{cyc}</span>
                        {isSelected && <span className="h-2 w-2 rounded-full bg-amber-400"></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* If 2nd, 3rd, 4th Year: Department Dropdown (MVJCE List) */
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                  Department <span className="text-amber-500">*</span>
                </label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3 text-sm text-[#f5f0ea] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {MVJCE_SCHOOLS.map((group) => (
                    <optgroup key={group.school} label={group.school} className="bg-[#120f0d] text-amber-400 font-semibold">
                      {group.departments.map((dept) => (
                        <option key={dept} value={dept} className="bg-[#181512] text-[#f5f0ea] font-normal pl-4">
                          {dept}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {/* 5. Admission Number / USN (Label adapts to Year) */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a39b94] mb-2">
                {formData.year === '1' ? 'Admission Number / USN' : 'USN (University Seat Number)'}{' '}
                <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                name="usn"
                required
                placeholder={formData.year === '1' ? 'e.g. MVJ26AI001 or 1MJ26CS001' : 'e.g. 1MJ23CS045'}
                value={formData.usn}
                onChange={handleChange}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-3 font-mono text-sm uppercase text-[#f5f0ea] placeholder-[#554e48] transition focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Information Notice */}
            <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860] leading-relaxed">
              <span className="font-semibold text-[#a39b94]">Confidential:</span> By submitting this form, your Student ID will be generated in the official database. You do not need any username or account login — your attendance will be recorded by scanning the rotating QR code on the auditorium screen and verifying your Student ID.
            </div>

            {/* Spotlight Amber Submit CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#080605] shadow-amber-glow transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-black"></div>
                  <span>Registering Profile...</span>
                </>
              ) : (
                <>
                  <span>Complete Registration</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
