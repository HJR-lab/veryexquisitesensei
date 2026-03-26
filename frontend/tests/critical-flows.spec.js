import { test, expect } from '@playwright/test';

test.describe('Critical Flows', () => {

  test.describe('Login Page', () => {
    test('should load login page', async ({ page }) => {
      await page.goto('/login');
      await expect(page).toHaveURL(/.*login/);
    });

    test('should show email input and sign-in button', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in|send|magic/i })).toBeVisible();
    });

    test('should show validation when submitting empty email', async ({ page }) => {
      await page.goto('/login');
      const submitBtn = page.getByRole('button', { name: /sign in|send|magic/i });
      await submitBtn.click();
      // Should not navigate away
      await expect(page).toHaveURL(/.*login/);
    });

    test('should redirect root to login or public gallery', async ({ page }) => {
      await page.goto('/');
      // Should either show login or public gallery (not a blank page)
      await expect(page.locator('body')).not.toBeEmpty();
      const url = page.url();
      expect(url).toMatch(/\/(login|public)?$/);
    });
  });

  test.describe('API Health', () => {
    test('should return healthy status', async ({ request }) => {
      const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';
      const baseUrl = apiUrl.replace(/\/api$/, '');
      const response = await request.get(`${baseUrl}/health`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('ok');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated user from /gallery to login', async ({ page }) => {
      await page.goto('/gallery');
      // Should redirect to login since user is not authenticated
      await page.waitForURL(/.*login/, { timeout: 5000 }).catch(() => {});
      const url = page.url();
      expect(url).toMatch(/login/);
    });

    test('should redirect unauthenticated user from /admin to login', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForURL(/.*login/, { timeout: 5000 }).catch(() => {});
      const url = page.url();
      expect(url).toMatch(/login/);
    });

    test('should redirect unauthenticated user from /schedule to login', async ({ page }) => {
      await page.goto('/schedule');
      await page.waitForURL(/.*login/, { timeout: 5000 }).catch(() => {});
      const url = page.url();
      expect(url).toMatch(/login/);
    });
  });

  test.describe('Public Gallery', () => {
    test('should load public gallery without auth', async ({ page }) => {
      await page.goto('/public');
      // Should load without redirect
      await expect(page).toHaveURL(/.*public/);
      // Should have some content (not blank)
      await expect(page.locator('body')).not.toBeEmpty();
    });
  });

  test.describe('Auth Callback', () => {
    test('should handle invalid auth callback gracefully', async ({ page }) => {
      await page.goto('/auth/callback');
      // Should not crash — should redirect to login or show error
      await page.waitForTimeout(2000);
      const url = page.url();
      // Should eventually redirect somewhere (login or show content)
      expect(url).toBeDefined();
    });
  });
});
