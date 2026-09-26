// Dev helper: sign in, click "Run audit" and screenshot the live progress and the result.
import { chromium } from "playwright";

const outDir = process.argv[2];
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/signin`);
await page.getByRole("button", { name: "Sign in without email" }).click();
await page.waitForURL(/\/projects\//, { timeout: 120_000 });
await page.getByRole("button", { name: "Run audit" }).click();
await page.waitForURL(/\/audits\//, { timeout: 120_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/audit-running.png`, fullPage: true });
await page.getByRole("link", { name: "View results" }).waitFor({ timeout: 180_000 });
await page.screenshot({ path: `${outDir}/audit-done.png`, fullPage: true });
console.log("audit finished:", page.url());
await browser.close();
