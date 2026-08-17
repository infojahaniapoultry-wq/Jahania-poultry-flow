import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the login page
    await page.goto('/login');
  });

  test('should display the login page correctly', async ({ page }) => {
    // Check that title "PoultryFlow" is present
    await expect(page.locator('h1')).toHaveText('PoultryFlow');
    
    // Check input placeholders
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'name@company.com');
    
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('placeholder', '••••••••');
    
    // Check button text
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText('Sign In to Dashboard');
  });

  test('should fail login with invalid credentials and stay on login page', async ({ page }) => {
    // Input invalid details
    await page.locator('input[type="email"]').fill('admin@jahania.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    
    // Intercept/mock auth call or just wait for failure response if server is running
    await page.locator('button[type="submit"]').click();
    
    // We should still be on /login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('should successfully login and redirect to dashboard with valid admin credentials', async ({ page }) => {
    // Input valid admin details
    await page.locator('input[type="email"]').fill('admin@jahania.com');
    await page.locator('input[type="password"]').fill('admin123');
    
    // Submit login form
    await page.locator('button[type="submit"]').click();
    
    // Wait for URL redirect to dashboard
    await page.waitForURL('**/dashboard');
    await expect(page).toHaveURL(/.*dashboard/);
  });
});
