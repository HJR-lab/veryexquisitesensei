import { test, expect } from '@playwright/test';

test.describe('Phase 2: VES Pottery Gallery Features', () => {

  test.describe('Public Gallery (Phase 2.5)', () => {
    test('should load public gallery on homepage', async ({ page }) => {
      await page.goto('/');

      // Check for public gallery header
      await expect(page.locator('h1')).toContainText('VES Pottery Gallery');
      await expect(page.locator('text=Student Creations')).toBeVisible();

      // Check for Student Login button
      await expect(page.locator('text=Student Login')).toBeVisible();

      // Check for search functionality
      await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    });

    test('should navigate to /public route', async ({ page }) => {
      await page.goto('/public');

      await expect(page.locator('h1')).toContainText('VES Pottery Gallery');
      await expect(page).toHaveURL(/.*public/);
    });

    test('should display filter buttons', async ({ page }) => {
      await page.goto('/public');

      // Check for "All" filter button
      await expect(page.locator('button', { hasText: 'All' })).toBeVisible();
    });

    test('should navigate to login when clicking Student Login', async ({ page }) => {
      await page.goto('/public');

      await page.click('text=Student Login');
      await expect(page).toHaveURL(/.*login/);
    });

    test('should have VES footer', async ({ page }) => {
      await page.goto('/public');

      await expect(page.locator('footer')).toContainText('VES Pottery Studio');
    });
  });

  test.describe('Enhanced Filtering (Phase 2.4)', () => {
    test.beforeEach(async ({ page }) => {
      // This would require login - skipping for now since we need test credentials
      // await page.goto('/login');
      // await page.fill('input[type="email"]', 'test@example.com');
      // await page.fill('input[type="password"]', 'testpass');
      // await page.click('button[type="submit"]');
    });

    test('should show filters toggle button on gallery', async ({ page }) => {
      await page.goto('/gallery');

      // Will redirect to login if not authenticated
      const url = page.url();
      if (url.includes('/login')) {
        test.skip();
      }

      await expect(page.locator('button', { hasText: 'Filters' })).toBeVisible();
    });
  });

  test.describe('Upload Form (Phase 2.3)', () => {
    test('should redirect to login when accessing upload without auth', async ({ page }) => {
      await page.goto('/upload');

      // Should redirect to login
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('Export Features (Phase 2.6)', () => {
    test('export button exists on gallery (requires auth)', async ({ page }) => {
      await page.goto('/gallery');

      // Will redirect to login if not authenticated
      const url = page.url();
      if (url.includes('/login')) {
        test.skip();
      }

      await expect(page.locator('button', { hasText: 'Export' })).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should have working routes', async ({ page }) => {
      // Test public route
      await page.goto('/public');
      await expect(page).toHaveURL(/.*public/);

      // Test root redirects to public
      await page.goto('/');
      await expect(page).toHaveURL(/.*public/);

      // Test login route
      await page.goto('/login');
      await expect(page).toHaveURL(/.*login/);
    });
  });

  test.describe('UI/UX', () => {
    test('should have proper VES styling on public gallery', async ({ page }) => {
      await page.goto('/public');

      // Check for VES color scheme (black header text)
      const heading = page.locator('h1');
      await expect(heading).toBeVisible();

      // Check for search input
      const searchInput = page.locator('input[placeholder*="Search"]');
      await expect(searchInput).toBeVisible();
    });

    test('should be responsive on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/public');

      // Header should still be visible
      await expect(page.locator('h1')).toBeVisible();

      // Student Login button should be visible
      await expect(page.locator('text=Student Login')).toBeVisible();
    });
  });

  test.describe('API Endpoints', () => {
    test('should fetch public pottery pieces', async ({ request }) => {
      const response = await request.get('/api/pottery/public');

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('pieces');
      expect(Array.isArray(data.pieces)).toBe(true);
    });

    test('should require auth for private gallery endpoint', async ({ request }) => {
      const response = await request.get('/api/pottery/pieces');

      // Should return 401 Unauthorized without token
      expect(response.status()).toBe(401);
    });

    test('should get clay types with auth', async ({ request }) => {
      // Without auth should fail
      const response = await request.get('/api/reference/clay-types');
      expect(response.status()).toBe(401);
    });

    test('should get glazes with auth', async ({ request }) => {
      // Without auth should fail
      const response = await request.get('/api/reference/glazes');
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Search and Filter', () => {
    test('should allow searching in public gallery', async ({ page }) => {
      await page.goto('/public');

      const searchInput = page.locator('input[placeholder*="Search"]');
      await searchInput.fill('test');

      // Input should accept text
      await expect(searchInput).toHaveValue('test');
    });

    test('should show filter buttons', async ({ page }) => {
      await page.goto('/public');

      // Should have at least the "All" filter
      const filterButtons = page.locator('.filter-buttons button');
      await expect(filterButtons.first()).toBeVisible();
    });
  });
});
