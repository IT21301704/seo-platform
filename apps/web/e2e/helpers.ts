import type { Page } from "@playwright/test";

/**
 * Signs in as the seeded owner with the development login (AUTH_DEV_LOGIN) and opens a project
 * (default example-store.com; `pnpm wp:setup` adds "localhost:8088" to the same organization).
 */
export async function signIn(page: Page, project = "example-store.com"): Promise<string> {
  await page.goto("/signin");
  await page.getByLabel("Development login (AUTH_DEV_LOGIN)").fill("owner@example-store.com");
  await page.getByRole("button", { name: "Sign in without email" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const switcher = page.getByLabel(/switch project/);
  if (!((await switcher.textContent()) ?? "").includes(project)) {
    await switcher.click();
    await page
      .getByRole("list", { name: "Switch project" })
      .getByRole("link", { name: project, exact: true })
      .click();
    await page.waitForURL(/\/projects\/[^/]+$/);
  }
  return new URL(page.url()).pathname;
}

/** True when a project with this name exists for the seeded owner (e.g. after pnpm wp:setup). */
export async function hasProject(page: Page, project: string): Promise<boolean> {
  await signIn(page);
  await page.getByLabel(/switch project/).click();
  const link = page
    .getByRole("list", { name: "Switch project" })
    .getByRole("link", { name: project, exact: true });
  return (await link.count()) > 0;
}
