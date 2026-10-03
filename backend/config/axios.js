import axios from 'axios';

const instance = axios.create({
  // Automatically switches based on how you run the app (local vs production)
  baseURL: import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://ipcs-student-portal-v2.onrender.com',
  // ... any other existing configurations you have (like headers or credentials)
});

export default instance;
