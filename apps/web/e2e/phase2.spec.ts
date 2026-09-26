import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("Phase 2: Google data, monitoring, sitemap API, issue manager", () => {
  test("sitemap check (screen 13) shows checks, quota and runs a new check", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/sitemap`);
    await expect(page.getByRole("heading", { name: "Sitemap check", exact: true })).toBeVisible();
    await expect(page.getByText("Google index status (URL Inspection)")).toBeVisible();
    await expect(page.getByText(/limit 2,000 per day/)).toBeVisible();
    await expect(page.getByText("Demo data").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /automatically/ })).toBeDisabled();
    await page.getByRole("button", { name: "Run check" }).click();
    await expect(page.getByRole("button", { name: "Check running…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run check" })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("Sitemap files")).toBeVisible();
  });

  test("sitemap URL lists (screen 14) have both tabs and downloads", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/sitemap/urls`);
    await expect(page.getByRole("heading", { name: "Sitemap URL lists", exact: true })).toBeVisible();
    await page.getByRole("link", { name: /Remove from sitemap \(\d+\)/ }).click();
    await expect(page).toHaveURL(/tab=remove/);
    const csv = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
    const response = await page.request.get(csv ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
  });

  test("REST API: key auth, scopes and check status", async ({ page, request }) => {
    const project = await signIn(page);
    const projectId = project.split("/").pop() ?? "";
    await page.goto(`${project}/api`);
    await expect(page.getByRole("heading", { name: "API & webhooks", exact: true })).toBeVisible();
    await page.getByLabel("Name").fill(`e2e ${Date.now()}`);
    await page.getByRole("button", { name: "Create API key" }).click();
    const key = (await page.getByRole("status").locator("code").textContent()) ?? "";
    expect(key).toMatch(/^seo_live_/);

    expect((await request.post(`/v1/projects/${projectId}/sitemap-checks`)).status()).toBe(401);
    const auth = { authorization: `Bearer ${key}` };
    // Read-only key: starting a check needs sitemap:write.
    expect(
      (await request.post(`/v1/projects/${projectId}/sitemap-checks`, { headers: auth })).status(),
    ).toBe(403);

    await page.goto(`${project}/sitemap`);
    const href =
      (await page.getByRole("link", { name: "View API response" }).getAttribute("href")) ?? "";
    const check = await request.get(href, { headers: auth });
    expect(check.status()).toBe(200);
    const body = (await check.json()) as { checkId: string; status: string };
    expect(body.checkId).toMatch(/^smc_/);
    expect((await request.get(`${href}/issues`, { headers: auth })).status()).toBe(200);
    expect(
      (await request.get(`${href}/manual-urls?format=xml`, { headers: auth })).headers()[
        "content-type"
      ],
    ).toContain("xml");
    expect((await request.post(`${href}/fixes`, { headers: auth })).status()).toBe(501);
  });

  test("webhooks must use https", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/api`);
    await page.getByLabel("Endpoint URL (https)").fill("http://example.com/hook");
    await page.getByRole("button", { name: "Add webhook" }).click();
    await expect(page.getByRole("status")).toContainText(/https/i);
  });

  test("monitoring (screen 10) shows history, schedule and alerts", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/monitoring?range=26`);
    await expect(page.getByRole("heading", { name: "Monitoring", exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /Health score history/ })).toBeVisible();
    await expect(page.getByText("Changes detected · newest first")).toBeVisible();
    await expect(page.getByText(/next run .*02:00/)).toBeVisible();
    await expect(page.getByRole("img", { name: /LNK-002 per audit/ })).toBeVisible();
    await expect(page.getByLabel("Alert email addresses")).toBeVisible();
  });

  test("issue manager: views, filters and saved views", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/issues?status=all`);
    for (const view of ["Flat list", "By page", "Board", "By source", "Grouped"]) {
      await page
        .getByRole("navigation", { name: "Views" })
        .getByRole("link", { name: view })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: view }),
      ).toHaveAttribute("aria-current", "page");
    }
    await page.getByLabel("Source").selectOption("sitemap_api");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/source=sitemap_api/);

    const name = `Sitemap ${Date.now()}`;
    await page.getByText(/^Saved view:/).click();
    await page.getByLabel("Saved view name").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Saved view: ${name}`)).toBeVisible();

    const excel = await page.request.get(`${project}/issues/export/xlsx?status=all`);
    expect(excel.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("issue detail: visits, history and comments", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/issues/LNK-002`);
    await expect(page.getByText(/Visits: Google Analytics sessions/)).toBeVisible();
    const text = `Checked by e2e ${Date.now()}`;
    await page.getByLabel("Comment").fill(text);
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.getByText(text)).toBeVisible();
  });

  test("notifications page lists notifications", async ({ page }) => {
    const project = await signIn(page);
    await page.getByRole("link", { name: /Notifications, \d+ unread/ }).click();
    await expect(page).toHaveURL(`${project}/notifications`);
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  });
});
