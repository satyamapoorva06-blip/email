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
    // Defensive: never surface "[object Object]" — pull a human string out of
    // whatever shape the error arrived in (server {error}, axios, or platform JSON).
    const data = err.response?.data;
    let message = 'Something went wrong';
    if (data && typeof data === 'object') {
      const e = data.error ?? data.message ?? data.detail ?? data.title;
      message = typeof e === 'string' && e.trim() ? e
        : e && typeof e === 'object' ? (e.message || e.reason || JSON.stringify(e)).slice(0, 300)
        : JSON.stringify(data).slice(0, 300);
    } else if (typeof data === 'string' && data.trim()) {
      // HTML error pages (e.g. an SSO wall or platform 500) are not useful — collapse them.
      message = data.trim().startsWith('<') ? `The service returned an unexpected page (HTTP ${status ?? '???'}).` : data.slice(0, 300);
    } else if (err.message) {
      // Axios timeouts (ECONNABORTED) — say it in human terms, keep the code for debugging.
      message = err.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(err.message)
        ? 'The server took too long to respond. Check your connection and try again — if it persists, the database may be asleep.'
        : err.message;
    }
    return Promise.reject(new Error(message));
  }
);

export default api;
