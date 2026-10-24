import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App.jsx';
import './index.css';

// Configure Axios baseURL for Vercel / production deployment:
// If VITE_API_URL is provided in environment variables, use it; otherwise use relative /api paths
const apiBase = import.meta.env.VITE_API_URL;
if (apiBase) {
  axios.defaults.baseURL = apiBase.replace(/\/+$/, '');
  console.log(`[API] Configured API Base URL: ${axios.defaults.baseURL}`);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

