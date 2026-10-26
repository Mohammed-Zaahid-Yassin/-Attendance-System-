/**
 * Comprehensive MVJCE Academic Schools & Departments
 * Canonical registry shared across Registration, Student Roster, Live Attendance, and Reports.
 */

export const MVJCE_SCHOOLS = [
  {
    school: 'School of Computer Science',
    departments: [
      'Computer Science and Engineering (CSE)',
      'Information Science and Engineering (ISE)',
      'Artificial Intelligence and Machine Learning (AI & ML)',
      'Computer Science and Engineering - Data Science (CSE-DS)',
      'Computer Science and Design (CS & Design)'
    ]
  },
  {
    school: 'School of Electrical Science',
    departments: [
      'Electronics and Communication Engineering (ECE)',
      'Electrical and Electronics Engineering (EEE)',
      'Electronics Engineering - VLSI Design and Technology',
      'Electronics and Communication - Advanced Communication Technology',
      'Industrial IoT'
    ]
  },
  {
    school: 'School of Mechanical Science & Civil Science',
    departments: [
      'Aeronautical Engineering',
      'Aerospace Engineering',
      'Mechanical Engineering',
      'Chemical Engineering',
      'Civil Engineering'
    ]
  },
  {
    school: 'School of Basic Sciences (1st Year Cycles)',
    departments: [
      'Basic Sciences (Physics Cycle)',
      'Basic Sciences (Chemistry Cycle)'
    ]
  },
  {
    school: 'School of Business & PG Studies',
    departments: [
      'Management Studies (MBA)',
      'Master of Computer Applications (MCA)'
    ]
  }
];

export const ALL_MVJCE_DEPARTMENTS = MVJCE_SCHOOLS.flatMap((s) => s.departments);
