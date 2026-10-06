import axios from 'axios';

const MAIN_API_URL = 'https://api.ipcstalenzo.com';
const RENDER_TEST_API_URL = 'https://ipcs-student-portal-v2.onrender.com';
const pageHost = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();
const isMainPortal = pageHost === 'ipcstalenzo.com' || pageHost === 'www.ipcstalenzo.com';
const isVercelTestPortal = pageHost.endsWith('.vercel.app');

// Keep the public portal on the Hostinger API while Vercel deployments remain
// pointed at Render for testing. Local dev uses its configured API URL.
const API_BASE_URL = isMainPortal
  ? MAIN_API_URL
  : isVercelTestPortal
    ? RENDER_TEST_API_URL
    : import.meta.env.VITE_BACKEND_URL
      || import.meta.env.VITE_API_URL
      || (import.meta.env.PROD ? MAIN_API_URL : 'http://localhost:5000');

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request Interceptor: Attach Token
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('talentino_student_token');
      // Remove extra quotes if they exist (sometimes happens with JSON.stringify)
      const cleanToken = token ? token.replace(/^"(.*)"$/, '$1') : null;
      
      if (cleanToken) {
        config.headers['Authorization'] = `Bearer ${cleanToken}`;
      }
    } catch (e) {
      console.error("Failed to parse token from local storage", e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.code === 'SESSION_REVOKED') {
      try {
        localStorage.removeItem('talentino_student_token');
        localStorage.removeItem('talentino_student_user');
      } catch { /* The API still rejects revoked sessions if browser storage is unavailable. */ }
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) window.location.replace('/');
    }
    return Promise.reject(error);
  }
);

export default api;
