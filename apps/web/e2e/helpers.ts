import type { Page } from "@playwright/test";

/** Signs in as the seeded owner with the development login (AUTH_DEV_LOGIN). */
export async function signIn(page: Page): Promise<string> {
  await page.goto("/signin");
  await page.getByLabel("Development login (AUTH_DEV_LOGIN)").fill("owner@example-store.com");
  await page.getByRole("button", { name: "Sign in without email" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  return new URL(page.url()).pathname;
}
