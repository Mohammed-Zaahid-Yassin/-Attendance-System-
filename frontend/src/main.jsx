import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App.jsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

// Configure Axios baseURL:
// Default to relative /api paths so requests go through Vercel's same-origin proxy (in prod)
// or Vite proxy (in dev). This eliminates CORS preflights and Brave Shields / adblocker issues.
const apiBase = import.meta.env.VITE_API_URL || '';
if (apiBase) {
  axios.defaults.baseURL = apiBase.replace(/\/+$/, '');
  console.log(`[API] Base URL configured to: ${axios.defaults.baseURL}`);
}



ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

