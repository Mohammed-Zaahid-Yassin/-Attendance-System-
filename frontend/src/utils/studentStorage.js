/**
 * Safe local storage utility for remembering verified Student IDs on the device.
 * 
 * Rules:
 * - Only stores canonical, verified Student IDs (e.g. from server response).
 * - Never stores passwords, tokens, cookies, or sensitive authentication secrets.
 * - Fails gracefully if localStorage is disabled, restricted, or quota-exceeded.
 * - Does not send Student IDs to any external services.
 */

const STORAGE_KEY = 'mvjce_student_id';

/**
 * Retrieve the saved Student ID from local storage.
 * @returns {string} The remembered Student ID or an empty string.
 */
export function getSavedStudentId() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && typeof saved === 'string') {
        const cleaned = saved.trim().toUpperCase();
        if (cleaned.length >= 4) {
          return cleaned;
        }
      }
    }
  } catch (err) {
    // Graceful fallback if localStorage is disabled or restricted (e.g. iOS Private Browsing)
    console.debug('[Storage] Unable to read saved student ID:', err);
  }
  return '';
}

/**
 * Save a verified canonical Student ID to local storage.
 * @param {string} studentId The verified Student ID to save.
 */
export function saveStudentId(studentId) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && studentId) {
      const canonical = String(studentId).trim().toUpperCase();
      if (canonical.length >= 4) {
        window.localStorage.setItem(STORAGE_KEY, canonical);
      }
    }
  } catch (err) {
    // Graceful fallback if localStorage is unavailable or write quota is exceeded
    console.debug('[Storage] Unable to save student ID:', err);
  }
}
