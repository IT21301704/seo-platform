"use client";

import { useActionState, useState, useTransition } from "react";
import type { Detection } from "@seo/crawler";
import { cn } from "@/lib/utils";
import { checkVerification, createProjectAndAudit, detect } from "./actions";
import type { VerifyState } from "./actions";

const card = "flex flex-col gap-4 rounded-[10px] border border-line bg-white p-5 sm:p-6";
const heading = "label-caps m-0";
const input =
  "h-10 w-full rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm focus:border-primary focus:outline-none";
const chip = "inline-flex h-7 items-center rounded-xl px-2.5 text-xs font-semibold";

const COUNTRIES = [
  ["LK", "Sri Lanka"],
  ["IN", "India"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["AU", "Australia"],
  ["SG", "Singapore"],
  ["AE", "United Arab Emirates"],
  ["CA", "Canada"],
];
const LANGUAGES = [
  ["en", "English"],
  ["si", "Sinhala"],
  ["ta", "Tamil"],
];
const METHODS = [
  {
    value: "dns",
    label: "DNS TXT record",
    hint: "Add a TXT record with this value to your domain.",
  },
  {
    value: "meta",
    label: "HTML meta tag",
    hint: 'Add <meta name="seo-platform-verification" content="…"> to your home page <head>.',
  },
  {
    value: "file",
    label: "Upload a verification file",
    hint: "Upload /seo-platform-verification.txt containing only this value.",
  },
] as const;

function Chips({ detection }: { detection: Detection }) {
  const cms = detection.cms === "unknown" || detection.cms === "other" ? null : detection.cms;
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={cn(chip, detection.sitemaps ? "bg-pass-bg text-pass" : "bg-crit-bg text-crit")}
      >
        {detection.sitemaps
          ? `sitemap.xml · ${detection.sitemapUrls.toLocaleString("en-US")} URLs`
          : "No sitemap found"}
      </span>
      <span
        className={cn(chip, detection.robots ? "bg-pass-bg text-pass" : "bg-gray-bg text-gray")}
      >
        {detection.robots ? "robots.txt" : "No robots.txt"}
      </span>
      <span className={cn(chip, detection.https ? "bg-pass-bg text-pass" : "bg-crit-bg text-crit")}>
        {detection.https ? "HTTPS valid" : "No HTTPS"}
      </span>
      {cms && (
        <span className={cn(chip, "bg-primary-soft text-primary")}>
          CMS:{" "}
          {cms === "wordpress"
            ? "WordPress"
            : cms === "nextjs"
              ? "Next.js"
              : cms[0]?.toUpperCase() + cms.slice(1)}
        </span>
      )}
    </div>
  );
}

export function OnboardingForm({ token }: { token: string }) {
  const [inputType, setInputType] = useState<"url" | "code">("url");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("dns");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [createState, createAction, creating] = useActionState(createProjectAndAudit, {
    error: null,
  });

  const runDetect = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("url", url);
      const result = await detect({ detection: null, error: null }, fd);
      setDetection(result.detection);
      setDetectError(result.error);
    });
  const runVerify = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("url", detection?.rootUrl ?? url);
      fd.set("verificationMethod", method);
      fd.set("verificationToken", token);
      setVerify(await checkVerification(null, fd));
    });

  return (
    <form action={createAction} className="flex flex-col gap-5">
      <input type="hidden" name="inputType" value={inputType} />
      <input type="hidden" name="verificationToken" value={token} />
      <input type="hidden" name="searchEngine" value="google" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className={card} aria-labelledby="step1">
          <h2 id="step1" className={heading}>
            Step 1 · Website
          </h2>
          <div
            role="tablist"
            aria-label="Input type"
            className="grid grid-cols-2 rounded-[10px] bg-[#E9E9E4] p-1"
          >
            {(["url", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={inputType === t}
                onClick={() => setInputType(t)}
                className={cn(
                  "rounded-lg py-2 text-sm font-semibold",
                  inputType === t ? "bg-white shadow-sm" : "text-muted",
                )}
              >
                {t === "url" ? "Live URL" : "Upload code (ZIP)"}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-sm font-semibold">
              Website URL
            </label>
            <div className="flex gap-2">
              <input
                id="url"
                name="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => inputType === "url" && url && !detection && runDetect()}
                placeholder="https://example-store.com"
                className={input}
              />
              {inputType === "url" && (
                <button
                  type="button"
                  onClick={runDetect}
                  disabled={!url || pending}
                  className="h-10 shrink-0 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold disabled:opacity-50"
                >
                  Check
                </button>
              )}
            </div>
          </div>
          {inputType === "code" && (
            <div className="flex flex-col gap-2">
              <label htmlFor="upload" className="text-sm font-semibold">
                ZIP of your site (max 100 MB)
              </label>
              <input
                id="upload"
                name="upload"
                type="file"
                accept=".zip,application/zip"
                className="text-sm"
              />
            </div>
          )}
          {inputType === "url" && (detection || detectError || pending) && (
            <div className="flex flex-col gap-2" aria-live="polite">
              <span className="text-sm font-semibold">We found</span>
              {pending && !detection && <span className="text-sm text-muted">Checking…</span>}
              {detection?.reachable && <Chips detection={detection} />}
              {detectError && <span className="text-sm text-crit">{detectError}</span>}
            </div>
          )}
          <p className="m-0 text-xs leading-relaxed text-muted">
            Code uploads skip server checks such as redirects and real speed. Those show as
            &quot;Not applicable&quot;, never as failed. Uploaded code is never executed and is
            deleted after the audit.
          </p>
        </section>

        <section className={card} aria-labelledby="step2">
          <h2 id="step2" className={heading}>
            Step 2 · Verify ownership
          </h2>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Choose a method</legend>
            {METHODS.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 text-sm",
                  method === m.value ? "border-primary" : "border-line",
                )}
              >
                <input
                  type="radio"
                  name="verificationMethod"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                />
                {m.label}
                {m.value === "dns" && (
                  <span className="ml-auto rounded-xl bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                    Recommended
                  </span>
                )}
              </label>
            ))}
          </fieldset>
          <p className="m-0 text-xs text-muted">{METHODS.find((m) => m.value === method)?.hint}</p>
          <div className="flex gap-2">
            <code className="flex h-10 flex-1 items-center truncate rounded-lg bg-canvas px-3 font-mono text-sm">
              {token}
            </code>
            <button
              type="button"
              className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold"
              onClick={() => {
                void navigator.clipboard.writeText(token).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex items-center gap-3" aria-live="polite">
            <span
              className={cn(chip, verify?.verified ? "bg-pass-bg text-pass" : "bg-med-bg text-med")}
            >
              {verify?.verified ? "Verified" : (verify?.detail ?? "Not checked yet")}
            </span>
            <button
              type="button"
              onClick={runVerify}
              disabled={!url || pending}
              className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold disabled:opacity-50"
            >
              Check now
            </button>
          </div>
          <p className="m-0 text-xs text-muted">
            Verification is needed before auto-fix and Search Console data. You can finish it later.
          </p>
        </section>

        <section className={card} aria-labelledby="step3">
          <h2 id="step3" className={heading}>
            Step 3 · Connect data (optional)
          </h2>
          {[
            ["Google Search Console", "Indexing status, search queries, links", "After setup"],
            ["Google Analytics 4", "Traffic per page, to rank issue impact", "After setup"],
            ["WordPress plugin", "Lets approved fixes be published", "Phase 3"],
          ].map(([name, desc, phase]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-3 border-b border-[#EDEDE8] pb-4 last:border-0 last:pb-0"
            >
              <div>
                <div className="text-[15px] font-semibold">{name}</div>
                <div className="text-xs text-muted">{desc}</div>
              </div>
              <button
                type="button"
                disabled
                className="h-10 rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold opacity-60"
                title={
                  phase === "After setup"
                    ? "Connect from Sitemap check or Monitoring once the audit has started"
                    : `Available in ${phase}`
                }
              >
                {phase}
              </button>
            </div>
          ))}
          <p className="m-0 text-xs text-muted">
            Google accounts are connected from the Sitemap check or Monitoring screen after this
            form, with read-only access.
          </p>
        </section>

        <section className={card} aria-labelledby="step4">
          <h2 id="step4" className={heading}>
            Step 4 · Audit settings
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Target country
              <select name="country" defaultValue="LK" className={input}>
                {COUNTRIES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Language
              <select name="language" defaultValue="en" className={input}>
                {LANGUAGES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Search engine
              <select name="searchEngineDisplay" defaultValue="google" className={input} disabled>
                <option value="google">Google</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold">
              Crawl frequency
              <select name="crawlFrequency" defaultValue="weekly" className={input}>
                <option value="manual">Manual</option>
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Page limit
            <select name="pageLimit" defaultValue="1000" className={input}>
              <option value="100">100 pages (Free plan)</option>
              <option value="1000">1,000 pages (Starter plan)</option>
              <option value="10000">10,000 pages (Pro plan)</option>
              <option value="50000">50,000 pages (Agency plan)</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            AI crawlers (GPTBot, ClaudeBot, PerplexityBot…)
            <select name="aiCrawlerIntent" defaultValue="allow" className={input}>
              <option value="allow">Allow them to read my site</option>
              <option value="block">Block them</option>
            </select>
          </label>
        </section>
      </div>

      {createState.error && (
        <p role="alert" className="m-0 rounded-lg bg-crit-bg p-3 text-sm text-crit">
          {createState.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-muted">
          We respect robots.txt and crawl politely (2 requests per second).
        </p>
        <div className="flex gap-3">
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold text-ink no-underline hover:text-ink"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {creating ? "Starting…" : "Start first audit"}
          </button>
        </div>
      </div>
    </form>
  );
}
