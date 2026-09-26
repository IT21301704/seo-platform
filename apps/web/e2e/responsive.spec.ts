import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("sidebar collapses on mobile and opens from the menu button", async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  await expect(nav).not.toBeInViewport();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(nav).toBeInViewport();
  const width = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(width).toBeLessThanOrEqual(1);
});
