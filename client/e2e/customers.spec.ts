import { test, expect } from '@playwright/test';

test.describe('Customers Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login
    await page.goto('/login');
    
    // Login as admin
    await page.locator('input[type="email"]').fill('admin@jahania.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
  });

  test('should display customers listing page and allow adding a customer account', async ({ page }) => {
    // Click on Customers link in sidebar
    await page.locator('aside a[href="/customers"]').click();
    await page.waitForURL('**/customers');
    
    // Check that we are on the customers page
    await expect(page.locator('h1')).toContainText('Customers');
    await expect(page.locator('text=Manage shop accounts')).toBeVisible();

    // Verify filter status bar is visible
    await expect(page.locator('text=Filter Status')).toBeVisible();

    // Click "Add New Account" button to open the create customer modal
    await page.locator('button:has-text("Add New Account")').click();

    // Check modal title
    await expect(page.locator('h2:has-text("Create Customer Account")')).toBeVisible();

    // Fill in the form fields
    await page.locator('input[placeholder="e.g. Al-Madina Poultry"]').fill('E2E Playwright Shop');
    await page.locator('input[placeholder="+92 300 0000000"]').fill('0300-1122334');
    await page.locator('input[type="number"]').fill('150');
    await page.locator('textarea[placeholder="Enter detailed shop address..."]').fill('123 Playwright Lane, Web City');

    // Click the submit button inside the modal
    await page.locator('button:has-text("Create Account")').click();

    // Assert that the modal is closed (no longer visible)
    await expect(page.locator('h2:has-text("Create Customer Account")')).not.toBeVisible();
    
    // Assert that the customer shows up in the data table
    await expect(page.locator('text=E2E Playwright Shop').first()).toBeVisible({ timeout: 10000 });
  });
});
