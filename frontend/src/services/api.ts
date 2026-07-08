import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { ApiResponse, ApiErrorResponse, PaginatedResponse } from '../types';

// Use production API URL if available, otherwise relative path for proxy
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/v1`
  : '/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<never>>) => {
    const originalRequest = error.config;

    // Handle 401 - Token expired
    if (error.response?.status === 401 && originalRequest) {
      // Try to refresh the token
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data.data;

          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          // Retry original request
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed - logout user
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    // Handle other errors
    const apiError = error.response?.data as ApiErrorResponse | undefined;
    const errorMessage = apiError?.error?.message ||
      error.message ||
      'An unexpected error occurred';

    return Promise.reject(new Error(errorMessage));
  }
);

// Auth API
export const authApi = {
  login: async (credentials: { email: string; password: string }) => {
    const response = await api.post('/auth/login', credentials);
    return response.data.data;
  },

  register: async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    acceptTerms: boolean;
  }) => {
    const response = await api.post('/auth/register', data);
    return response.data.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data.data;
  },

  forgotPassword: async (email: string) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await api.post('/auth/reset-password', { token, password });
    return response.data;
  },
};

// Loads API
export const loadsApi = {
  list: async (params: Record<string, string | number | undefined>) => {
    const response = await api.get('/loads', { params });
    return response.data as PaginatedResponse<import('../types').Load>;
  },

  get: async (id: string) => {
    const response = await api.get(`/loads/${id}`);
    return response.data.data;
  },

  create: async (data: Record<string, unknown>) => {
    const response = await api.post('/loads', data);
    return response.data.data;
  },

  update: async (id: string, data: Record<string, unknown>) => {
    const response = await api.patch(`/loads/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/loads/${id}`);
    return response.data;
  },

  getMy: async (params: Record<string, string | number | undefined>) => {
    const response = await api.get('/loads/my', { params });
    return response.data as PaginatedResponse<import('../types').Load>;
  },

  getStats: async () => {
    const response = await api.get('/loads/stats');
    return response.data.data;
  },

  moderate: async (id: string, action: 'approve' | 'reject' | 'mark_fraud', notes?: string) => {
    const response = await api.post(`/loads/${id}/moderate`, { action, notes });
    return response.data.data;
  },

  getModeration: async (params: Record<string, string | number | undefined>) => {
    const response = await api.get('/loads/moderation', { params });
    return response.data as PaginatedResponse<import('../types').Load>;
  },

  suggestPrice: async (data: { origin: string; destination: string; cargoType?: string; weightKg?: number }) => {
    const response = await api.post('/loads/suggest-price', data);
    return response.data.data;
  },
};

// Unlock API
export const unlockApi = {
  getPrice: async () => {
    const response = await api.get('/unlock/pricing');
    return response.data.data;
  },

  unlock: async (loadId: string) => {
    const response = await api.post(`/unlock/${loadId}`);
    return response.data.data;
  },

  getStatus: async (loadId: string) => {
    const response = await api.get(`/unlock/${loadId}/status`);
    return response.data.data;
  },

  getMy: async (params: { page?: number; limit?: number; activeOnly?: boolean }) => {
    const response = await api.get('/unlock/my', { params });
    return response.data as PaginatedResponse<import('../types').UnlockResult>;
  },
};

// Pricing API
export const pricingApi = {
  getPricing: async () => {
    const response = await api.get('/pricing');
    return response.data.data as import('../types').PricingInfo;
  },

  getCredits: async () => {
    const response = await api.get('/pricing/credits');
    return response.data.data as import('../types').UserCredits;
  },

  purchaseBundle: async (data: {
    bundleType: string;
    paymentMethod: 'ecocash' | 'onemoney' | 'zipit' | 'card' | 'wallet';
    phoneNumber?: string;
    idempotencyKey?: string;
  }) => {
    const response = await api.post('/pricing/purchase', data);
    return response.data.data as import('../types').BundlePurchaseResult;
  },
};

// Wallet API (placeholder)
export const walletApi = {
  getBalance: async () => {
    const response = await api.get('/wallet/balance');
    return response.data.data;
  },

  getTransactions: async (params: { page?: number; limit?: number }) => {
    const response = await api.get('/wallet/transactions', { params });
    return response.data;
  },

  topup: async (amount: number, paymentMethod: string, phoneNumber?: string) => {
    const response = await api.post('/wallet/topup', { amount, paymentMethod, phoneNumber });
    return response.data.data;
  },
};

// Admin API (placeholder)
export const adminApi = {
  getUsers: async (params: Record<string, string | number | undefined>) => {
    const response = await api.get('/admin/users', { params });
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data.data;
  },
};

export default api;