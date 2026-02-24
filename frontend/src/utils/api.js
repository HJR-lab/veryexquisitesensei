import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    return data;
  },

  register: async (email, password, firstName, lastName) => {
    const { data } = await api.post('/auth/register', {
      email,
      password,
      firstName,
      lastName,
    });
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    return data;
  },

  logout: async () => {
    await api.post('/auth/logout');
    localStorage.removeItem('token');
  },

  getMe: async () => {
    const { data } = await api.get('/auth/me');
    return data;
  },
};

// Pottery API
export const potteryAPI = {
  getPieces: async () => {
    const { data } = await api.get('/pottery/pieces');
    return data;
  },

  updatePieces: async (pieces) => {
    const { data } = await api.post('/pottery/pieces', { pieces });
    return data;
  },

  getPublicPieces: async () => {
    const { data } = await axios.get(`${API_BASE_URL}/pottery/public`);
    return data;
  },
};

// Classes API
export const classesAPI = {
  getMyBookings: async () => {
    const { data } = await api.get('/classes/my-bookings');
    return data;
  },

  cancelBooking: async (bookingId, advanceNotice = false) => {
    const { data } = await api.post('/classes/cancel', { bookingId, advanceNotice });
    return data;
  },

  downloadCalendar: async (bookingId) => {
    const response = await api.get(`/classes/bookings/${bookingId}/calendar`, {
      responseType: 'blob'
    });
    return response.data;
  },

  downloadAllCalendars: async () => {
    const response = await api.get('/classes/my-bookings/calendar', {
      responseType: 'blob'
    });
    return response.data;
  },

  bookMakeupClass: async (classInstanceId) => {
    const { data } = await api.post('/classes/book-makeup', { classInstanceId });
    return data;
  },

  bookHBSchedule: async (enrollmentId, firstClassId, courseWeeks) => {
    const { data } = await api.post('/classes/book-hb-schedule', {
      enrollmentId, firstClassId, courseWeeks
    });
    return data;
  },
};

export default api;
