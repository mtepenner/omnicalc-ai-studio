import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './calculator_app.jsx';
import './index.css';

// Bridge Vite environment variables for local execution if not already defined
if (typeof window !== 'undefined') {
  window.__app_id = window.__app_id || import.meta.env.VITE_APP_ID || 'omnicalc-ai-studio';
  window.__firebase_config =
    window.__firebase_config || import.meta.env.VITE_FIREBASE_CONFIG || '{}';
  window.__initial_auth_token =
    window.__initial_auth_token || import.meta.env.VITE_INITIAL_AUTH_TOKEN || '';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
