import axios from 'axios';

const instance = axios.create({
  // Automatically switches based on how you run the app (local vs production)
  baseURL: import.meta.env.VITE_BACKEND_URL || 'https://api-placement.ipcsglobal.info',
  // ... any other existing configurations you have (like headers or credentials)
});

export default instance;