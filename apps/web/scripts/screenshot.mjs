// Dev helper: sign in with the development login and screenshot pages.
// Usage: node scripts/screenshot.mjs <outDir> <path> [path...]
import { chromium } from "playwright";

const [outDir, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/signin`);
await page.getByRole("button", { name: "Sign in without email" }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 60_000 });
await page.goto(`${base}/`);
await page.waitForURL(/\/(projects|onboarding)/, { timeout: 120_000 });
const projectUrl = new URL(page.url()).pathname;
for (const p of paths) {
  const target = p.replace("{project}", projectUrl);
  await page.goto(`${base}${target}`, { waitUntil: "networkidle", timeout: 120_000 });
  const name = target.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`${target} -> ${name}.png`);
}
await browser.close();
