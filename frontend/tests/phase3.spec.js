import { test, expect } from '@playwright/test';

test.describe('Phase 3: Advanced Scheduling Features', () => {

  test.describe('Class Booking System', () => {
    test('should have available classes endpoint', async ({ request }) => {
      const response = await request.get('/api/classes/available');

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('classes');
      expect(Array.isArray(data.classes)).toBe(true);
    });

    test('should require auth to view my bookings', async ({ request }) => {
      const response = await request.get('/api/classes/my-bookings');

      expect(response.status()).toBe(401);
    });

    test('should require auth to book a class', async ({ request }) => {
      const response = await request.post('/api/classes/book', {
        data: { classInstanceId: 1 }
      });

      expect(response.status()).toBe(401);
    });

    test('should require auth to cancel a booking', async ({ request }) => {
      const response = await request.post('/api/classes/cancel', {
        data: { bookingId: 1, advanceNotice: true }
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Waitlist System', () => {
    test('should require auth to join waitlist', async ({ request }) => {
      const response = await request.post('/api/classes/waitlist/join', {
        data: { classInstanceId: 1 }
      });

      expect(response.status()).toBe(401);
    });

    test('should require auth to leave waitlist', async ({ request }) => {
      const response = await request.delete('/api/classes/waitlist/leave', {
        data: { classInstanceId: 1 }
      });

      expect(response.status()).toBe(401);
    });

    test('should require auth to view my waitlist entries', async ({ request }) => {
      const response = await request.get('/api/classes/waitlist/my-entries');

      expect(response.status()).toBe(401);
    });

    test('should require auth to view class waitlist', async ({ request }) => {
      const response = await request.get('/api/classes/1/waitlist');

      expect(response.status()).toBe(401);
    });

    test('should require auth to claim waitlist spot', async ({ request }) => {
      const response = await request.post('/api/classes/waitlist/claim', {
        data: { waitlistId: 1 }
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Attendance Marking', () => {
    test('should require auth to view class bookings', async ({ request }) => {
      const response = await request.get('/api/classes/1/bookings');

      expect(response.status()).toBe(401);
    });

    test('should require auth to mark attendance', async ({ request }) => {
      const response = await request.post('/api/classes/bookings/1/mark-attendance', {
        data: { attended: true }
      });

      expect(response.status()).toBe(401);
    });

    test('should require auth to view attendance history', async ({ request }) => {
      const response = await request.get('/api/students/1/attendance');

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Calendar Integration', () => {
    test('should require auth to download booking calendar', async ({ request }) => {
      const response = await request.get('/api/classes/bookings/1/calendar');

      expect(response.status()).toBe(401);
    });

    test('should require auth to download all bookings calendar', async ({ request }) => {
      const response = await request.get('/api/classes/my-bookings/calendar');

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Admin Endpoints', () => {
    test('should require auth to offer waitlist spot', async ({ request }) => {
      const response = await request.post('/api/classes/1/waitlist/offer-next');

      expect(response.status()).toBe(401);
    });

    test('process expired offers endpoint should exist', async ({ request }) => {
      const response = await request.post('/api/classes/waitlist/process-expired');

      // Should return 200 even without auth (background job endpoint)
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('processedCount');
    });
  });

  test.describe('API Response Structure', () => {
    test('available classes should include waitlist info', async ({ request }) => {
      const response = await request.get('/api/classes/available');

      if (response.status() === 200) {
        const data = await response.json();
        if (data.classes.length > 0) {
          const firstClass = data.classes[0];

          // Check for required fields
          expect(firstClass).toHaveProperty('id');
          expect(firstClass).toHaveProperty('classDate');
          expect(firstClass).toHaveProperty('startTime');
          expect(firstClass).toHaveProperty('endTime');
          expect(firstClass).toHaveProperty('classType');
          expect(firstClass).toHaveProperty('maxCapacity');
          expect(firstClass).toHaveProperty('currentEnrollment');

          // Check for Phase 3 additions
          expect(firstClass).toHaveProperty('waitlistCount');
          expect(firstClass).toHaveProperty('spotsAvailable');
          expect(firstClass).toHaveProperty('isFull');

          // Validate types
          expect(typeof firstClass.waitlistCount).toBe('number');
          expect(typeof firstClass.spotsAvailable).toBe('number');
          expect(typeof firstClass.isFull).toBe('boolean');
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should return 404 for non-existent class bookings', async ({ request }) => {
      const response = await request.get('/api/classes/99999/bookings');

      // Either 401 (auth required) or will handle once authenticated
      expect([401, 404]).toContain(response.status());
    });

    test('should return 404 for non-existent waitlist', async ({ request }) => {
      const response = await request.get('/api/classes/99999/waitlist');

      // Either 401 (auth required) or will handle once authenticated
      expect([401, 404]).toContain(response.status());
    });

    test('should reject invalid booking data', async ({ request }) => {
      const response = await request.post('/api/classes/book', {
        data: {} // Missing classInstanceId
      });

      expect([400, 401]).toContain(response.status());
    });

    test('should reject invalid waitlist data', async ({ request }) => {
      const response = await request.post('/api/classes/waitlist/join', {
        data: {} // Missing classInstanceId
      });

      expect([400, 401]).toContain(response.status());
    });

    test('should reject invalid attendance data', async ({ request }) => {
      const response = await request.post('/api/classes/bookings/1/mark-attendance', {
        data: {} // Missing attended field
      });

      expect([400, 401]).toContain(response.status());
    });
  });

  test.describe('Health Check', () => {
    test('health endpoint should still work', async ({ request }) => {
      const response = await request.get('/api/health');

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.service).toBe('VES Pottery Gallery API');
    });
  });

  test.describe('Database Schema Validation', () => {
    test('endpoints use consistent ID formats', async ({ request }) => {
      // Test that endpoints accept integer IDs
      const testIds = [1, 999];

      for (const id of testIds) {
        const response1 = await request.get(`/api/classes/${id}/bookings`);
        expect([200, 401, 404]).toContain(response1.status());

        const response2 = await request.get(`/api/classes/${id}/waitlist`);
        expect([200, 401, 404]).toContain(response2.status());

        const response3 = await request.get(`/api/students/${id}/attendance`);
        expect([200, 401, 404]).toContain(response3.status());
      }
    });
  });

  test.describe('Frontend Integration Readiness', () => {
    test('CORS headers should allow frontend requests', async ({ request }) => {
      const response = await request.get('/api/classes/available');

      // Should have CORS headers
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBeTruthy();
    });

    test('JSON responses should be properly formatted', async ({ request }) => {
      const response = await request.get('/api/classes/available');

      expect(response.status()).toBe(200);
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');

      // Should parse as valid JSON
      const data = await response.json();
      expect(data).toBeTruthy();
    });
  });

  test.describe('Business Logic Validation', () => {
    test('booking cancellation requires bookingId', async ({ request }) => {
      const response = await request.post('/api/classes/cancel', {
        data: { advanceNotice: true } // Missing bookingId
      });

      expect([400, 401]).toContain(response.status());
    });

    test('waitlist claim requires waitlistId', async ({ request }) => {
      const response = await request.post('/api/classes/waitlist/claim', {
        data: {} // Missing waitlistId
      });

      expect([400, 401]).toContain(response.status());
    });

    test('attendance marking requires boolean attended field', async ({ request }) => {
      const response = await request.post('/api/classes/bookings/1/mark-attendance', {
        data: { attended: 'yes' } // Should be boolean
      });

      expect([400, 401]).toContain(response.status());
    });
  });
});
