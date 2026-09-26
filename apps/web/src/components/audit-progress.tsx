"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuditStatus } from "@/lib/audit-status";
import { STAGE_INFO, TERMINAL } from "@/lib/audit-status";
import { cn, formatNumber, formatTime } from "@/lib/utils";

const STATE_PILL = {
  done: "bg-pass-bg text-pass",
  running: "bg-primary-soft text-primary",
  waiting: "bg-gray-bg text-gray",
} as const;

export function AuditProgress({
  initial,
  resultsHref,
  ruleCount,
}: {
  initial: AuditStatus;
  resultsHref: string;
  ruleCount: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [openWhenDone, setOpenWhenDone] = useState(false);
  const finished = TERMINAL.has(status.status);

  useEffect(() => {
    if (TERMINAL.has(initial.status)) return;
    const source = new EventSource(`/api/audits/${initial.id}/events`);
    source.onmessage = (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as AuditStatus;
      setStatus(next);
      if (TERMINAL.has(next.status)) source.close();
    };
    return () => source.close();
  }, [initial.id, initial.status]);

  useEffect(() => {
    if (status.status === "completed" && openWhenDone) router.push(resultsHref);
  }, [status.status, openWhenDone, resultsHref, router]);

  const currentIndex = Math.max(
    0,
    STAGE_INFO.findIndex((s) => s.status === status.status),
  );
  const stepNumber = status.status === "completed" ? 6 : currentIndex + 1;
  const stepTitle =
    status.status === "completed" ? "Done" : (STAGE_INFO[currentIndex]?.title ?? "Queued");
  const percent =
    status.status === "completed"
      ? 100
      : Math.round(
          ((stepNumber - 1) / 6) * 100 +
            (status.status === "crawling"
              ? (status.pagesCrawled / Math.max(1, status.pageLimit)) * 16
              : 0),
        );
  const crawled = status.progress.stages.crawl.done ?? status.pagesCrawled;
  const stageState = (i: number): "done" | "running" | "waiting" => {
    const stored = status.progress.stages[STAGE_INFO[i]?.key ?? "discover"].state;
    if (status.status === "completed") return "done";
    if (stored !== "waiting") return stored;
    return i < currentIndex
      ? "done"
      : i === currentIndex && status.status !== "queued"
        ? "running"
        : "waiting";
  };

  return (
    <div className="flex flex-col gap-5 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <section className="rounded-[10px] border border-line bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold" aria-live="polite">
              {status.status === "queued"
                ? "Waiting for a worker"
                : `Step ${stepNumber} of 6 · ${stepTitle}`}
            </h2>
            {status.status === "completed" && (
              <span className="text-sm text-muted">Health Score {status.healthScore ?? "—"}</span>
            )}
          </div>
          <div
            className="h-2.5 overflow-hidden rounded bg-line-soft"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mb-0 mt-3 text-sm text-muted">
            {formatNumber(crawled)} of {formatNumber(status.pageLimit)} pages crawled (plan limit) ·{" "}
            {formatNumber(status.progress.stages.render.done ?? status.pagesRendered)} rendered with
            a headless browser
          </p>
          {status.status === "failed" && (
            <p className="mb-0 mt-3 rounded-lg bg-crit-bg p-3 text-sm text-crit">
              Audit failed: {status.error}
            </p>
          )}
          {status.status === "cancelled" && (
            <p className="mb-0 mt-3 rounded-lg bg-gray-bg p-3 text-sm text-gray">
              Audit cancelled.
            </p>
          )}
        </section>

        <section className="rounded-[10px] border border-line bg-white px-5">
          <ol className="m-0 list-none p-0">
            {STAGE_INFO.map((stage, i) => {
              const state = stageState(i);
              const info = status.progress.stages[stage.key];
              return (
                <li
                  key={stage.key}
                  className="flex items-center gap-4 border-b border-[#EDEDE8] py-4 last:border-0"
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-[100px] shrink-0 items-center justify-center rounded-xl text-xs font-semibold capitalize",
                      STATE_PILL[state],
                    )}
                  >
                    {state}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {i + 1} · {stage.title}
                    </div>
                    <div className="text-[13px] text-muted">
                      {info.detail ||
                        (stage.key === "checks"
                          ? `${ruleCount} ${stage.description}`
                          : stage.description)}
                    </div>
                  </div>
                  {info.total !== undefined && info.done !== undefined && (
                    <span className="font-mono text-[13px]">
                      {formatNumber(info.done)} / {formatNumber(info.total)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <p className="m-0 text-[13px] text-muted">
          Crawler identifies itself as SEOPlatformBot/1.0, respects robots.txt and limits speed to 2
          requests per second.
        </p>
        <div className="flex gap-3">
          {finished && status.status === "completed" ? (
            <a
              href={resultsHref}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white no-underline hover:bg-primary-dark hover:text-white"
            >
              View results
            </a>
          ) : (
            !finished && (
              <button
                type="button"
                onClick={() => setOpenWhenDone(true)}
                disabled={openWhenDone}
                className="inline-flex h-10 items-center rounded-lg border border-[#CFCFC8] bg-white px-4 text-sm font-semibold disabled:opacity-60"
              >
                {openWhenDone ? "Results will open when done" : "View results when done"}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5 xl:w-[340px] xl:shrink-0">
        <section className="rounded-[10px] border border-line bg-white p-5">
          <h2 className="label-caps m-0 mb-3">Run fingerprint</h2>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted">Input</dt>
            <dd className="m-0 text-right">
              {status.inputType === "code" ? "Code upload" : "Live URL"}
            </dd>
            <dt className="text-muted">Snapshot hash</dt>
            <dd
              className="m-0 truncate text-right font-mono"
              title={status.snapshotSetHash ?? undefined}
            >
              {status.snapshotSetHash ? `${status.snapshotSetHash.slice(0, 12)}…` : "computing…"}
            </dd>
            <dt className="text-muted">Crawler</dt>
            <dd className="m-0 text-right font-mono">v{status.versions.crawler}</dd>
            <dt className="text-muted">Ruleset</dt>
            <dd className="m-0 text-right font-mono">v{status.versions.ruleset}</dd>
            <dt className="text-muted">Weights</dt>
            <dd className="m-0 text-right font-mono">{status.versions.weights}</dd>
            <dt className="text-muted">AI model / prompt</dt>
            <dd className="m-0 text-right font-mono">
              {status.versions.model} / {status.versions.prompt}
            </dd>
          </dl>
          <p className="mb-0 mt-3 rounded-lg bg-primary-soft p-3 text-sm text-ink">
            If your site has not changed, you get exactly the same result as last time.
          </p>
        </section>
        <section className="rounded-[10px] border border-line bg-white p-5">
          <h2 className="label-caps m-0 mb-3">Live log</h2>
          <ol
            className="m-0 flex max-h-80 list-none flex-col gap-1.5 overflow-y-auto p-0 font-mono text-[13px]"
            aria-live="off"
          >
            {status.progress.log.length === 0 && (
              <li className="text-muted">Waiting for the first request…</li>
            )}
            {status.progress.log.map((line, i) => (
              <li
                key={`${line.time}-${i}`}
                className={cn(
                  (line.status ?? 0) >= 400
                    ? "text-crit"
                    : (line.status ?? 0) >= 300
                      ? "text-high"
                      : "text-ink",
                )}
              >
                {formatTime(line.time)} {line.message}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
