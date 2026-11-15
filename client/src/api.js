// Single axios instance for the whole app. API logic stays out of components.
import axios from 'axios';

const api = axios.create({ baseURL: '/', timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('relay_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('relay_token');
      localStorage.removeItem('relay_user');
      window.location.assign('/login');
    }
    const message = err.response?.data?.error || err.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
