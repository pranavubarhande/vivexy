import axios from 'axios';
import { camelToSnake, snakeToCamel } from '@vivexy/core/lib/caseConverters';

// Create axios instance with base configuration
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — auth token + camelCase→snake_case body conversion
axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    // Convert outgoing JSON body from camelCase → snake_case.
    // Skip FormData (file uploads) — those should not be transformed.
    if (config.data && !(config.data instanceof FormData)) {
      config.data = camelToSnake(config.data);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — snake_case→camelCase conversion + common error handling
axiosInstance.interceptors.response.use(
  (response) => {
    // Convert incoming response data from snake_case → camelCase.
    // Skip if the response is a Blob (e.g. for file downloads)
    if (response.data && !(response.data instanceof Blob)) {
      response.data = snakeToCamel(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        // window.location.href = '/login'
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
