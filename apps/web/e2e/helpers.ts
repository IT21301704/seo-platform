import type { Page } from "@playwright/test";

const switcher = (page: Page) => page.getByLabel(/, switch project$/);

/**
 * Signs in as the seeded owner with the development login (AUTH_DEV_LOGIN) and opens a project
 * (default example-store.com; `pnpm wp:setup` adds "localhost:8088" to the same organization).
 */
export async function signIn(page: Page, project = "example-store.com"): Promise<string> {
  // "/" opens the latest project when signed in, or redirects to the sign-in page.
  await page.goto("/");
  await page.waitForURL(/\/projects\/[^/]+$|\/signin/);
  if (new URL(page.url()).pathname.startsWith("/signin")) {
    await page.getByLabel("Development login (AUTH_DEV_LOGIN)").fill("owner@example-store.com");
    await page.getByRole("button", { name: "Sign in without email" }).click();
    await page.waitForURL(/\/projects\/[^/]+$/);
  }
  if (((await switcher(page).textContent()) ?? "").includes(project)) {
    return new URL(page.url()).pathname;
  }
  const before = new URL(page.url()).pathname;
  await switcher(page).click();
  await page
    .getByRole("list", { name: "Switch project" })
    .getByRole("link", { name: project, exact: true })
    .click();
  await page.waitForURL(
    (url) => url.pathname !== before && /^\/projects\/[^/]+$/.test(url.pathname),
  );
  return new URL(page.url()).pathname;
}

/** True when a project with this name exists for the seeded owner (e.g. after pnpm wp:setup). */
export async function hasProject(page: Page, project: string): Promise<boolean> {
  await signIn(page);
  if (((await switcher(page).textContent()) ?? "").includes(project)) return true;
  await switcher(page).click();
  const link = page
    .getByRole("list", { name: "Switch project" })
    .getByRole("link", { name: project, exact: true });
  return (await link.count()) > 0;
}
