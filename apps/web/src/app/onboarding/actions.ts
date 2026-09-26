"use server";

import { join } from "node:path";
import {
  HttpFetcher,
  detectSite,
  isVerificationToken,
  loadFixtureSite,
  verifyOwnership,
} from "@seo/crawler";
import type { Detection, Fetcher, VerificationMethod } from "@seo/crawler";
import type { Prisma } from "@seo/db";
import { createCrawl } from "@seo/worker/crawls";
import { enqueueAudit } from "@seo/worker/queue";
import { COUNTRY_TIMEZONE } from "@seo/worker/schedule";
import { S3BlobStore, uploadKey } from "@seo/worker/storage";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertCanEdit, logAction, requireUser } from "@/lib/session";

// The web app runs from apps/web (next dev/start); fixtures live at the repo root.
const FIXTURES = join(process.cwd(), "..", "..", "fixtures", "golden-site");
const MAX_UPLOAD = 100 * 1024 * 1024;

/** SSRF-guarded fetcher; in local dev (FIXTURE_SITES=true) example-store.com is served from fixtures/. */
async function fetcherFor(url: string): Promise<{ fetcher: Fetcher; close: () => Promise<void> }> {
  const host = (() => {
    try {
      return new URL(url.includes("://") ? url : `https://${url}`).hostname;
    } catch {
      return "";
    }
  })();
  if (process.env["FIXTURE_SITES"] === "true" && host === "example-store.com") {
    return { fetcher: loadFixtureSite(FIXTURES).fetcher, close: async () => undefined };
  }
  const http = new HttpFetcher({ timeoutMs: 10_000 });
  return { fetcher: http, close: () => http.close() };
}

export type DetectState = { detection: Detection | null; error: string | null };

export async function detect(_prev: DetectState, formData: FormData): Promise<DetectState> {
  await requireUser();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { detection: null, error: "Enter your website address" };
  const { fetcher, close } = await fetcherFor(url);
  try {
    const detection = await detectSite(url, fetcher);
    return { detection, error: detection.reachable ? detection.error : detection.error };
  } catch (error) {
    return { detection: null, error: (error as Error).message };
  } finally {
    await close();
  }
}

export type VerifyState = { verified: boolean; detail: string } | null;

export async function checkVerification(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  await requireUser();
  const url = String(formData.get("url") ?? "");
  const method = String(formData.get("verificationMethod") ?? "dns") as VerificationMethod;
  const token = String(formData.get("verificationToken") ?? "");
  if (!url || !isVerificationToken(token) || !["dns", "meta", "file"].includes(method))
    return { verified: false, detail: "Enter the website first" };
  const { fetcher, close } = await fetcherFor(url);
  try {
    return await verifyOwnership(method, url.includes("://") ? url : `https://${url}`, token, {
      fetcher,
    });
  } finally {
    await close();
  }
}

const ProjectSchema = z.object({
  inputType: z.enum(["url", "code"]),
  url: z.string().trim().min(3, "Enter your website address").max(2000),
  verificationMethod: z.enum(["dns", "meta", "file"]),
  verificationToken: z.string().refine(isVerificationToken, "Invalid verification token"),
  country: z.string().regex(/^[A-Z]{2}$/),
  language: z.string().regex(/^[a-z]{2}$/),
  searchEngine: z.literal("google"),
  crawlFrequency: z.enum(["manual", "weekly", "daily"]),
  pageLimit: z.coerce
    .number()
    .int()
    .refine((n) => [100, 1000, 10000, 50000].includes(n)),
  aiCrawlerIntent: z.enum(["allow", "block"]),
});

export type CreateState = { error: string | null };

/** "Start first audit": creates (or reuses) the project, queues the audit and opens screen 02. */
export async function createProjectAndAudit(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const parsed = ProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const input = parsed.data;
  const upload = formData.get("upload");
  const zip = upload instanceof File && upload.size > 0 ? upload : null;
  if (input.inputType === "code") {
    if (!zip) return { error: "Choose a ZIP file to upload" };
    if (zip.size > MAX_UPLOAD) return { error: "The ZIP is larger than 100 MB" };
  }

  // The root URL must be a real http(s) address even for code uploads (canonical URLs refer to it).
  let rootUrl: string;
  try {
    const u = new URL(input.url.includes("://") ? input.url : `https://${input.url}`);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    rootUrl = `${u.origin}/`;
  } catch {
    return { error: "Enter a valid website address" };
  }

  let detection: Detection | null = null;
  let verified = false;
  if (input.inputType === "url") {
    const { fetcher, close } = await fetcherFor(rootUrl);
    try {
      detection = await detectSite(rootUrl, fetcher);
      if (!detection.reachable) return { error: detection.error ?? "The site did not respond" };
      rootUrl = detection.rootUrl;
      verified = (
        await verifyOwnership(input.verificationMethod, rootUrl, input.verificationToken, {
          fetcher,
        })
      ).verified;
    } finally {
      await close();
    }
  }

  const data = {
    name: new URL(rootUrl).host,
    rootUrl,
    country: input.country,
    language: input.language,
    searchEngine: input.searchEngine,
    crawlFrequency: input.crawlFrequency,
    pageLimit: input.pageLimit,
    aiCrawlerIntent: input.aiCrawlerIntent,
    verificationMethod: input.verificationMethod,
    verificationToken: input.verificationToken,
    cmsType: detection?.cms ?? "unknown",
    detection: (detection ?? {}) as Prisma.InputJsonValue,
    ...(verified ? { verifiedAt: new Date() } : {}),
  };
  const existing = await db.project.findFirst({ where: { rootUrl } });
  const project = existing
    ? await db.project.update({ where: { id: existing.id }, data })
    : await db.project.create({
        // The schedule runs in the site owner's local time; editable on the Monitoring screen.
        data: {
          ...data,
          timezone: COUNTRY_TIMEZONE[input.country] ?? "UTC",
        } as Prisma.ProjectUncheckedCreateInput,
      });
  await logAction(db, user, {
    action: existing ? "project.update" : "project.create",
    entityType: "project",
    entityId: project.id,
  });

  const crawl = await createCrawl(db, {
    projectId: project.id,
    inputType: input.inputType,
    inputRef: zip ? zip.name.slice(0, 200) : null,
  });
  if (zip) {
    // Stored only until the worker has read it (deleted after the audit).
    await S3BlobStore.fromEnv().put(
      uploadKey(user.organizationId, crawl.id),
      Buffer.from(await zip.arrayBuffer()),
      "application/zip",
    );
  }
  await enqueueAudit({ crawlId: crawl.id, organizationId: user.organizationId });
  await logAction(db, user, {
    action: "audit.start",
    entityType: "crawl",
    entityId: crawl.id,
    after: { inputType: input.inputType },
  });
  redirect(`/projects/${project.id}/audits/${crawl.id}`);
}
