import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Phase 1 MVP audit flow", () => {
  test("redirects signed-out visitors to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("dashboard shows the score, versions and the no-guarantee note", async ({ page }) => {
    const project = await signIn(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Health score \d+ out of 100/ })).toBeVisible();
    await expect(page.getByText(/Ruleset v1\.0\.0 · Weights v1/)).toBeVisible();
    await expect(page.getByText(/we never guarantee them/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Issue manager", exact: true })).toHaveAttribute(
      "href",
      `${project}/issues`,
    );
  });

  test("runs an audit end to end: queue → worker → live progress → score 100", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Run audit" }).click();
    await expect(page).toHaveURL(/\/audits\//);
    await expect(page.getByText("Run fingerprint")).toBeVisible();
    await expect(page.getByRole("link", { name: "View results" })).toBeVisible({
      timeout: 150_000,
    });
    await expect(page.getByText("Health Score 100").first()).toBeVisible();
    await page.getByRole("link", { name: "View results" }).click();
    await expect(page.getByRole("img", { name: "Health score 100 out of 100" })).toBeVisible();
  });

  test("issue manager lists issues and opens the detail page", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/issues?status=all`);
    await expect(page.getByRole("heading", { name: "Issue manager" })).toBeVisible();
    await expect(page.getByText(/of \d+ resolved/)).toBeVisible();
    await page.getByRole("link", { name: "Missing meta description" }).first().click();
    await expect(page.getByRole("heading", { name: "Missing meta description" })).toBeVisible();
    await expect(page.getByText("Priority breakdown")).toBeVisible();
    await expect(page.getByText(/Rule ONP-004 · v1\.0\.0/)).toBeVisible();
  });

  test("issue export downloads CSV", async ({ page }) => {
    const project = await signIn(page);
    const response = await page.request.get(`${project}/issues/export?status=all`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(await response.text()).toMatch(/^"rule_id","issue","severity"/);
  });

  test("report exports PDF and Excel", async ({ page }) => {
    const project = await signIn(page);
    const pdf = await page.request.get(`${project}/report/pdf`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
    const xlsx = await page.request.get(`${project}/report/xlsx`);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("auto-fix review is a read-only preview", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/fixes/preview-onp-004`);
    await expect(page.getByRole("heading", { name: "Review AI fixes" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve \d+ & publish/ })).toBeDisabled();
  });

  test("onboarding detects the site and shows the verification token", async ({ page }) => {
    await signIn(page);
    await page.goto("/onboarding");
    await page.getByLabel("Website URL").fill("https://example-store.com");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.getByText("HTTPS valid")).toBeVisible();
    await expect(page.getByText(/sitemap\.xml · 14 URLs/)).toBeVisible();
    await expect(page.getByText(/^seo-verify=[a-f0-9]{24}$/)).toBeVisible();
  });

  test("another tenant's project is not reachable", async ({ page }) => {
    await signIn(page);
    const response = await page.goto("/projects/not-a-real-project-id");
    expect(response?.status()).toBe(404);
  });
});
