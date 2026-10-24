import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App.jsx';
import './index.css';

// Configure Axios baseURL:
// 1. Explicit VITE_API_URL if provided
// 2. If running on production (Vercel / any non-localhost host), point directly to live Render backend
// 3. If running locally (localhost / 127.0.0.1), use relative /api paths to leverage local Vite dev proxy
const isLocal = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const apiBase = import.meta.env.VITE_API_URL || 
  (!isLocal ? 'https://attendance-backend-tzil.onrender.com' : '');

if (apiBase) {
  axios.defaults.baseURL = apiBase.replace(/\/+$/, '');
  console.log(`[API] Base URL configured to: ${axios.defaults.baseURL}`);
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

