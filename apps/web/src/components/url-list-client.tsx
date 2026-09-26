"use client";

import { useOptimistic, useState, useTransition } from "react";

export interface ClientRow {
  id: string;
  url: string;
  path: string;
  reason: string | null;
  foundVia: string | null;
  lastmod: string | null;
  targetFile: string | null;
  sitemapFile: string | null;
  status: number | null;
  added: boolean;
}

const FOUND_VIA: Record<string, { label: string; className: string }> = {
  internal_links: { label: "Internal links", className: "bg-gray-bg text-gray" },
  crawl: { label: "Crawl", className: "bg-gray-bg text-gray" },
  gsc: { label: "Search Console", className: "bg-primary-soft text-primary" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlFor = (rows: ClientRow[]) =>
  rows
    .map(
      (r) =>
        `<url>\n  <loc>${esc(r.url)}</loc>${r.lastmod ? `\n  <lastmod>${r.lastmod}</lastmod>` : ""}\n</url>`,
    )
    .join("\n");

/** Manual-add table with "added" ticks and a live XML preview (screen 14). */
export function ManualUrlList({
  rows,
  editable,
  onToggle,
}: {
  rows: ClientRow[];
  editable: boolean;
  onToggle: (id: string, added: boolean) => Promise<void>;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    rows,
    (state, change: { id: string; added: boolean }) =>
      state.map((r) => (r.id === change.id ? { ...r, added: change.added } : r)),
  );
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const selected = optimistic.filter((r) => r.added);
  const xml = xmlFor(selected.length ? selected : optimistic);

  return (
    <div className="flex flex-col gap-5 xl:flex-row">
      <section className="min-w-0 flex-1 overflow-x-auto rounded-[10px] border border-line bg-white px-2 pb-2">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {[
                "Added",
                "URL",
                "Why it can't be auto-added",
                "Found via",
                "Lastmod",
                "Target file",
              ].map((h, i) => (
                <th
                  key={h}
                  className="border-b border-line px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted"
                >
                  {i === 0 ? <span className="sr-only">{h}</span> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {optimistic.map((r) => (
              <tr key={r.id}>
                <td className="border-b border-[#EDEDE8] px-3 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={r.added}
                    disabled={!editable}
                    aria-label={`Mark ${r.path} as added to the sitemap`}
                    onChange={(e) => {
                      const added = e.target.checked;
                      startTransition(async () => {
                        setOptimistic({ id: r.id, added });
                        await onToggle(r.id, added);
                      });
                    }}
                  />
                </td>
                <td className="border-b border-[#EDEDE8] px-3 py-3 font-mono">{r.path}</td>
                <td className="border-b border-[#EDEDE8] px-3 py-3">{r.reason}</td>
                <td className="border-b border-[#EDEDE8] px-3 py-3">
                  {r.foundVia && FOUND_VIA[r.foundVia] && (
                    <span
                      className={`inline-flex h-6 items-center rounded-xl px-2.5 text-xs font-semibold ${FOUND_VIA[r.foundVia]?.className}`}
                    >
                      {FOUND_VIA[r.foundVia]?.label}
                    </span>
                  )}
                </td>
                <td className="border-b border-[#EDEDE8] px-3 py-3 font-mono">{r.lastmod}</td>
                <td className="border-b border-[#EDEDE8] px-3 py-3 font-mono">
                  {r.targetFile ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-5 xl:w-[330px] xl:shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="label-caps m-0">XML to paste</h2>
          <button
            type="button"
            className="h-8 rounded-lg bg-primary px-3 text-[13px] font-semibold text-white"
            onClick={() => void navigator.clipboard.writeText(xml).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy as XML"}
          </button>
        </div>
        <pre className="m-0 max-h-72 overflow-auto rounded-lg bg-sidebar p-3 font-mono text-[12px] leading-relaxed text-[#E8E8E3]">
          {xml || "No URLs to add."}
        </pre>
        <p className="m-0 text-xs text-muted">
          {selected.length
            ? `For the ${selected.length} ticked rows.`
            : "For all rows (tick rows to narrow it down)."}{" "}
          No priority or changefreq, as Google ignores them.
        </p>
      </section>
    </div>
  );
}
