import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('shows the PDF export action on the invoices register', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('admin@jahania.com');
  await page.locator('input[type="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard');

  await page.goto('/invoices');

  const exportButton = page.getByRole('button', { name: 'Export PDF' });
  await expect(exportButton).toBeVisible();
  await expect(exportButton).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^invoices-purchases-report-\d{4}-\d{2}-\d{2}\.pdf$/);
  const pdfPath = await download.path();
  expect(pdfPath).not.toBeNull();
  const pdfText = await fs.readFile(pdfPath!, 'latin1');
  expect(pdfText).toContain('POULTRYFLOW');
});
