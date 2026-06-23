import axios from 'axios';

const baseURL = import.meta.env.VITE_BASEURL ?? 'http://localhost:4000';
const apiToken = import.meta.env.VITE_UPLOAD_API_TOKEN ?? '';

export const api = axios.create({
  baseURL,
  headers: apiToken ? { 'x-api-token': apiToken } : undefined,
});
