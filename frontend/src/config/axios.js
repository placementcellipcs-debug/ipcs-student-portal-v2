import axios from 'axios';

// Automatically points to your Render backend in production, or localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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

export default api;