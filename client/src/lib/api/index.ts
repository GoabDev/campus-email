import axios from "axios";

const SERVER_URL = "http://localhost:5000";
const API_URL = `${SERVER_URL}/api`;

export const api = axios.create({
  baseURL: API_URL,
});

export function getAvatarUrl(avatarPath: string | null | undefined): string | null {
  if (!avatarPath) return null;
  return `${SERVER_URL}${avatarPath}`;
}

// Add token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
