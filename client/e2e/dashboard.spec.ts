import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Attempt to go to dashboard directly
    await page.goto('/dashboard');
    
    // We should be redirected to the /login page
    await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
  });

  test('should display dashboard UI for authenticated Admin', async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    
    // Perform login
    await page.locator('input[type="email"]').fill('admin@jahania.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    // Verify redirected to dashboard
    await page.waitForURL('**/dashboard');
    
    // Check top header profile text shows our Admin name
    const headerProfile = page.locator('header');
    await expect(headerProfile).toContainText('Jahania Admin');
    await expect(headerProfile).toContainText('ADMIN');

    // Verify sidebar navigation links are present
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText('Dashboard');
    await expect(sidebar).toContainText('Customers');
    await expect(sidebar).toContainText('Drivers');
    await expect(sidebar).toContainText('Vendors');
    
    // Check that some statistics cards are loaded
    await expect(page.locator('text=Stock on Hand')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Financial Position')).toBeVisible();
  });
});
