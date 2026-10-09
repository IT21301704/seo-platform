import { expect, test } from "@playwright/test";
import { hasProject, signIn } from "./helpers";

const WP = "localhost:8088";

test.describe("Phase 3: auto-fix, change log, integrations, keyword research", () => {
  test("integrations (screen 09) list Google, platforms and alerts; WordPress gives a key and the plugin", async ({
    page,
  }) => {
    const project = await signIn(page);
    await page.goto(`${project}/integrations`);
    await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
    for (const name of [
      "Search Console",
      "Analytics 4",
      "PageSpeed / CrUX",
      "WordPress",
      "Shopify",
      "Slack",
      "Cloudflare",
    ]) {
      await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Access tokens are encrypted/)).toBeVisible();
    await page
      .getByRole("region", { name: "Shopify", exact: true })
      .getByRole("button", { name: "Notify me" })
      .click();
    await expect(
      page.getByRole("region", { name: "Shopify", exact: true }).getByRole("status"),
    ).toContainText("Shopify");

    await page.getByRole("region", { name: "WordPress", exact: true }).getByRole("link").click();
    await expect(page.getByRole("heading", { name: "WordPress", exact: true })).toBeVisible();
    const zip = await page.request.get(`${project}/integrations/wordpress/plugin.zip`);
    expect(zip.headers()["content-type"]).toBe("application/zip");
    expect((await zip.body()).subarray(0, 2).toString()).toBe("PK");
    await page.getByRole("button", { name: /Create (connection key|a new key)/ }).click();
    await expect(page.getByRole("status").locator("code")).toHaveText(/^seowp_/);
  });

  test("keyword research (screen 15): ideas, quick wins, cannibalization, map and gaps", async ({
    page,
  }) => {
    const project = await signIn(page);
    await page.goto(`${project}/keywords`);
    await expect(
      page.getByRole("heading", { name: "Keyword research", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/data snapshot .* \(demo data\)/)).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Keyword views" });
    await expect(tabs.getByRole("link", { name: /^Ideas \(\d+\)$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // No keyword provider: volume and difficulty are never invented.
    await expect(page.getByRole("columnheader", { name: "Volume / mo" })).toBeVisible();
    await expect(page.getByText("Quick wins · positions 5–20")).toBeVisible();
    await page.getByLabel("Seed keyword").fill("gift");
    await page.getByRole("button", { name: "Find keywords" }).click();
    await expect(page).toHaveURL(/q=gift/);
    await expect(page.getByRole("cell", { name: "gift mugs", exact: true })).toBeVisible();

    await tabs.getByRole("link", { name: /^Cannibalization/ }).click();
    await expect(page.getByText(/pages compete/).first()).toBeVisible();
    await page.getByRole("link", { name: "Open issue KWD-002" }).first().click();
    await expect(page.getByRole("heading", { name: /Keyword cannibalization/ })).toBeVisible();
    await expect(page.getByText("Keywords · not in the Health Score")).toBeVisible();

    await page.goto(`${project}/keywords?tab=gaps`);
    await expect(
      page.getByRole("region", { name: /Content gap .*personalised/ }).first(),
    ).toBeVisible();

    await page.goto(`${project}/keywords?tab=map`);
    const keyword = `ceramic mug care ${Date.now() % 1000}`;
    await page.getByLabel("Keyword for /blog/care-guide/").fill(keyword);
    await page
      .getByLabel("Keyword for /blog/care-guide/")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByText(`Saved "${keyword}" as primary.`)).toBeVisible();

    const csv = await page.request.get(`${project}/keywords/export`);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toMatch(/^"keyword","intent","volume"/);
  });

  test("auto-fix review (screen 07): preview, rule re-check, edit, manual download", async ({
    page,
  }) => {
    const project = await signIn(page);
    await page.goto(`${project}/fixes`);
    await expect(page.getByRole("heading", { name: "Auto-fix review", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate and preview fix for ONP-004" }).click();
    await expect(page.getByRole("heading", { name: "Review AI fixes" })).toBeVisible();
    await expect(page.getByText(/need your edit/)).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("list", { name: "Fix steps" }).getByRole("listitem").nth(2),
    ).toHaveAttribute("aria-current", "step");
    // example-store.com has no publishing target: publishing is disabled, values can be downloaded.
    await expect(page.getByText(/No publishing target connected/).first()).toBeVisible();

    await page.getByText("Edit", { exact: true }).first().click();
    await page
      .getByLabel(/^New value for /)
      .first()
      .fill("Too short");
    await page.getByRole("button", { name: "Save and re-check" }).first().click();
    await expect(
      page.getByRole("status").filter({ hasText: /re-check: Too short \(min 70\)/ }),
    ).toBeVisible();
    await page
      .getByLabel(/^New value for /)
      .first()
      .fill(
        "Meet the small team behind our handmade mugs and see where our island workshop is based.",
      );
    await page.getByRole("button", { name: "Save and re-check" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "passes the re-check" })).toBeVisible();
    const csv = await page.request.get(`${new URL(page.url()).pathname}/export`);
    expect(await csv.text()).toContain("island workshop");
  });

  test("issue manager bulk Auto-fix opens a preview for the selection", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/issues?status=all`);
    await page
      .getByRole("checkbox", { name: /Select all open items of Missing meta description/ })
      .check();
    await page.getByRole("button", { name: "Auto-fix" }).click();
    await expect(page).toHaveURL(/\/fixes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Review AI fixes" })).toBeVisible();
  });

  test("change log (screen 08) explains when nothing was published", async ({ page }) => {
    const project = await signIn(page);
    await page.goto(`${project}/changes`);
    await expect(page.getByRole("heading", { name: "Change log", exact: true })).toBeVisible();
    await expect(page.getByLabel("Source")).toBeVisible();
    await expect(page.getByText(/Each entry stores: who, what, when/)).toBeVisible();
  });

  test("WordPress (Docker): approve → publish → verify → roll back from the UI", async ({
    page,
  }) => {
    test.skip(
      !(await hasProject(page, WP)),
      "Run `pnpm wp:setup` to create the WordPress test site project",
    );
    test.setTimeout(240_000);
    const project = await signIn(page, WP);
    await page.goto(`${project}/issues/ONP-004`);
    await page.getByRole("button", { name: "Generate & preview fix" }).first().click();
    await expect(page.getByText(/need your edit/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Publishing to WordPress/)).toBeVisible();

    const text = `Meet the small team of potters behind our handmade ceramic mugs (e2e ${Date.now() % 100000}).`;
    await page.getByText("Edit", { exact: true }).first().click();
    await page
      .getByLabel(/^New value for /)
      .first()
      .fill(text);
    await page.getByRole("button", { name: "Save and re-check" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "passes the re-check" })).toBeVisible();
    // Publish only this change.
    await page.reload();
    const boxes = page.getByRole("checkbox", { name: /^Approve / });
    for (let i = 0; i < (await boxes.count()); i++) {
      const box = boxes.nth(i);
      if ((await box.isEnabled()) && (await box.isChecked())) await box.uncheck();
    }
    await boxes.first().check();
    await page.getByRole("button", { name: /Approve 1 & publish|Approve \d+ & publish/ }).click();
    await expect(page.getByText(/Published and verified/)).toBeVisible({ timeout: 120_000 });

    await page.goto(`${project}/changes`);
    const card = page.getByRole("region", { name: /^Batch B-/ }).first();
    await expect(card.getByText("Verified 1 / 1")).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await card.getByRole("button", { name: /^Roll back/ }).click();
    // Rolled back: the saved old value is restored and "Re-apply" is offered.
    await expect(card.getByText("Rolled back", { exact: true }).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(card.getByRole("button", { name: "Re-apply" })).toBeVisible();
  });
});
