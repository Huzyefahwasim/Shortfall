import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('.deploy', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000');
await page.getByRole('heading', { name: 'The exception desk' }).waitFor({ timeout: 60000 });
await page.screenshot({ path: '.deploy/preview-desktop.png', fullPage: true });
const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '.deploy/preview-mobile.png', fullPage: true });
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
await page.getByRole('button', { name: /Northstar Components/ }).click();
await page.screenshot({ path: '.deploy/preview-mobile-case.png', fullPage: true });
console.log(JSON.stringify({ errors, desktopOverflow, mobileOverflow }));
await browser.close();
