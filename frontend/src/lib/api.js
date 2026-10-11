import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getCookie = (n) => {
  const c = document.cookie.split("; ").find((x) => x.startsWith(n + "="));
  return c ? decodeURIComponent(c.split("=")[1]) : null;
};

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((cfg) => {
  const t = getCookie("csrf_token");
  if (t) cfg.headers["X-CSRF-Token"] = t;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const cfg = err.config || {};
    const url = cfg.url || "";
    if (err.response?.status === 401 && !cfg._retry && !url.startsWith("/auth/") && !url.startsWith("/public/")) {
      cfg._retry = true;
      try {
        await api.post("/auth/refresh");
        return api(cfg);
      } catch (e) {
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export const idemKey = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function errMsg(e) {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "حدث خطأ، حاول مرة أخرى";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => (x && x.msg) || JSON.stringify(x)).join(" ، ");
  return d.msg || String(d);
}
