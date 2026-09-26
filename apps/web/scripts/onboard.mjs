// Dev helper: walk through onboarding (screen 01) and start an audit.
import { chromium } from "playwright";

const outDir = process.argv[2];
const base = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${base}/signin`);
await page.getByRole("button", { name: "Sign in without email" }).click();
await page.waitForURL(/\/projects\//, { timeout: 120_000 });
await page.goto(`${base}/onboarding`);
await page.getByLabel("Website URL").fill("https://example-store.com");
await page.getByRole("button", { name: "Check", exact: true }).click();
await page.getByText("HTTPS valid").waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: "Check now" }).click();
await page.getByText("Waiting for DNS").waitFor({ timeout: 60_000 });
await page.screenshot({ path: `${outDir}/onboarding.png`, fullPage: true });
await page.getByRole("button", { name: "Start first audit" }).click();
await page.waitForURL(/\/audits\//, { timeout: 120_000 });
await page.getByRole("link", { name: "View results" }).waitFor({ timeout: 180_000 });
console.log("onboarding audit finished:", page.url());
await browser.close();
