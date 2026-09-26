import "server-only";
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import type { AuditReport } from "@seo/scoring";
import { CATEGORY_WEIGHTS_V1 } from "@seo/shared";
import { CATEGORY_LABEL, CATEGORY_ORDER, NO_GUARANTEE, SEVERITY_LABEL } from "./labels";
import { failingRules } from "./queries";
import { formatDateTime, hostOf, pathOf } from "./utils";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ExportInput {
  rootUrl: string;
  report: AuditReport;
  llmModelId: string;
  promptVersion: string;
  createdAt: Date;
}

export function reportHtml({
  rootUrl,
  report,
  llmModelId,
  promptVersion,
  createdAt,
}: ExportInput): string {
  const failing = failingRules(report);
  const rows = failing
    .map(
      (r) =>
        `<tr><td><b>${esc(r.title)}</b><br><span class="m">${r.ruleId}</span></td><td>${SEVERITY_LABEL[r.severity]}</td><td class="m">${r.counts.fail}</td><td class="m">${r.priority.priority.toFixed(1)}</td><td>${r.outcomes
          .filter((o) => o.result === "fail")
          .slice(0, 8)
          .map((o) => `<span class="m">${esc(pathOf(o.url))}</span>`)
          .join(
            "<br>",
          )}${r.counts.fail > 8 ? `<br>… and ${r.counts.fail - 8} more` : ""}</td></tr>`,
    )
    .join("");
  const cats = CATEGORY_ORDER.map(
    (c) =>
      `<tr><td>${CATEGORY_LABEL[c]} (${CATEGORY_WEIGHTS_V1[c]}%)</td><td class="m">${report.score.categories[c] ?? "—"}</td></tr>`,
  ).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SEO report ${esc(hostOf(rootUrl))}</title>
<style>
body{font-family:"IBM Plex Sans",Arial,sans-serif;color:#1A1D21;font-size:12px;margin:0}
h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#5C6066}
.m{font-family:"IBM Plex Mono",monospace}.muted{color:#5C6066}
.score{font-size:48px;font-weight:700;color:#2446C7}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #E1E1DC;padding:6px 8px;text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;color:#5C6066}
</style></head><body>
<h1>SEO audit report · ${esc(hostOf(rootUrl))}</h1>
<p class="muted">Audit of ${formatDateTime(createdAt)} · ${report.pages.crawled} URLs crawled · ${report.pages.indexable} indexable</p>
<div class="score">${report.score.health ?? "—"}<span class="muted" style="font-size:16px"> / 100 SEO Health Score</span></div>
<p>Failing checks: ${report.counts.critical} critical, ${report.counts.high} high, ${report.counts.medium} medium, ${report.counts.low} low · ${report.counts.passed} checks passing${report.score.sitemap === null ? "" : ` · Sitemap score ${report.score.sitemap}`}</p>
<h2>Score by category</h2><table>${cats}</table>
<h2>Issues by priority</h2>
${failing.length ? `<table><thead><tr><th>Issue</th><th>Severity</th><th>Pages</th><th>Priority</th><th>Affected URLs</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>No failing checks.</p>"}
<h2>Reproducibility</h2>
<p class="m">snapshot ${report.versions.snapshotSetHash} · crawler v${report.versions.crawlerVersion} · ruleset v${report.versions.rulesetVersion} · weights ${report.versions.weightsVersion} · AI ${esc(llmModelId)} / ${esc(promptVersion)}</p>
<p class="muted">Same input + same versions = same score. ${esc(NO_GUARANTEE)}</p>
</body></html>`;
}

export async function reportPdf(input: ExportInput): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Static HTML only; no network access is needed.
    await page.route("**/*", (route) => route.abort());
    await page.setContent(reportHtml(input), { waitUntil: "domcontentloaded" });
    return await page.pdf({
      format: "A4",
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}

export async function reportXlsx({ rootUrl, report, createdAt }: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SEO Platform";
  const summary = wb.addWorksheet("Summary");
  summary.addRows([
    ["Site", rootUrl],
    ["Audit", createdAt.toISOString()],
    ["Health score", report.score.health],
    ["Sitemap score", report.score.sitemap],
    ...CATEGORY_ORDER.map((c) => [
      `${CATEGORY_LABEL[c]} (${CATEGORY_WEIGHTS_V1[c]}%)`,
      report.score.categories[c],
    ]),
    ["Snapshot hash", report.versions.snapshotSetHash],
    ["Ruleset", report.versions.rulesetVersion],
    ["Weights", report.versions.weightsVersion],
  ]);
  summary.getColumn(1).width = 28;
  summary.getColumn(2).width = 70;

  const issues = wb.addWorksheet("Issues");
  issues.columns = [
    { header: "Rule", key: "rule", width: 10 },
    { header: "Issue", key: "title", width: 48 },
    { header: "Severity", key: "severity", width: 10 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "URL", key: "url", width: 60 },
    { header: "Evidence", key: "evidence", width: 80 },
  ];
  for (const r of failingRules(report)) {
    for (const o of r.outcomes.filter((x) => x.result === "fail")) {
      issues.addRow({
        rule: r.ruleId,
        title: r.title,
        severity: r.severity,
        priority: r.priority.priority,
        url: o.url ?? "whole site",
        evidence: JSON.stringify(o.evidence),
      });
    }
  }

  const checks = wb.addWorksheet("Checks");
  checks.columns = [
    { header: "Rule", key: "rule", width: 10 },
    { header: "Title", key: "title", width: 52 },
    { header: "Category", key: "category", width: 16 },
    { header: "Status", key: "status", width: 10 },
    { header: "Pass", key: "pass", width: 8 },
    { header: "Fail", key: "fail", width: 8 },
    { header: "N/A", key: "na", width: 8 },
  ];
  for (const r of report.rules) {
    checks.addRow({
      rule: r.ruleId,
      title: r.title,
      category: r.category,
      status: r.status,
      pass: r.counts.pass,
      fail: r.counts.fail,
      na: r.counts.na,
    });
  }
  for (const ws of [issues, checks]) ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
