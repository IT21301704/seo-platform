import Link from "next/link";
import { RULES } from "@seo/rules";
import { COUNTRY_TIMEZONE } from "@seo/worker/schedule";
import { ActionForm } from "@/components/action-form";
import { GoogleConnections } from "@/components/google-connections";
import { IssueHistory, QuerySelect, ScoreHistory } from "@/components/monitoring-charts";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardLabel, EmptyState, Mono, Pill } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDateTime, formatShortDate, formatZoned, hostOf } from "@/lib/utils";
import { saveChannels, saveRules, saveSchedule } from "./actions";

const LEVEL: Record<string, { label: string; tone: Tone }> = {
  critical: { label: "Critical", tone: "crit" },
  alert: { label: "Alert", tone: "high" },
  high: { label: "High", tone: "high" },
  ok: { label: "OK", tone: "pass" },
  info: { label: "Info", tone: "gray" },
};

const EVENT_LINK: Record<string, string> = {
  became_noindex: "issues/IDX-003",
  new_broken_links: "issues/LNK-002",
  new_critical: "issues?severity=critical",
  score_drop: "",
};

const RANGES = [
  { value: "4", label: "Last 4 weeks" },
  { value: "12", label: "Last 12 weeks" },
  { value: "26", label: "Last 26 weeks" },
];

const input = "h-9 rounded-lg border border-[#CFCFC8] bg-white px-2 text-sm";

export default async function MonitoringPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; rule?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const range = RANGES.some((r) => r.value === sp.range) ? (sp.range as string) : "12";
  const ruleId = RULES.some((r) => r.id === sp.rule) ? (sp.rule as string) : "LNK-002";
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const editable = canEdit(user.role);
  const since = new Date(Date.now() - Number(range) * 7 * 86_400_000);

  const [crawls, events, channels, rules, integrations, crux, alerts] = await Promise.all([
    db.crawl.findMany({ where: { projectId: project.id, status: "completed", healthScore: { not: null }, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { id: true, createdAt: true, healthScore: true } }),
    db.monitoringEvent.findMany({ where: { projectId: project.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 20 }),
    db.alertChannel.findMany({ where: { projectId: project.id } }),
    db.alertRule.findMany({ where: { projectId: project.id } }),
    db.integration.findMany({ where: { projectId: project.id } }),
    db.cruxSnapshot.findFirst({ where: { projectId: project.id }, orderBy: { fetchedAt: "desc" } }),
    db.alert.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  // Score history; mark the biggest drop between two audits.
  const points = crawls.map((c) => ({ date: c.createdAt.toISOString(), label: formatShortDate(c.createdAt), score: c.healthScore ?? 0 }));
  let drop: { label: string; score: number; text: string } | null = null;
  let worst = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && p.score - prev.score < worst) {
      worst = p.score - prev.score;
      drop = { label: p.label, score: p.score, text: `−${prev.score - p.score}` };
    }
  });
  const scores = points.map((p) => p.score);

  // M11: failing items of one rule per audit (last 6 audits).
  const recent = crawls.slice(-6);
  const counts = await db.checkResult.groupBy({ by: ["crawlId"], where: { crawlId: { in: recent.map((c) => c.id) }, ruleId, result: "fail" }, _count: { _all: true } });
  const countByCrawl = new Map(counts.map((c) => [c.crawlId, c._count._all]));
  const history = recent.map((c) => ({ label: formatShortDate(c.createdAt), count: countByCrawl.get(c.id) ?? 0 }));
  const rule = RULES.find((r) => r.id === ruleId);

  const email = channels.find((c) => c.type === "email");
  const slack = channels.find((c) => c.type === "slack");
  const ruleOn = (type: string, fallback: boolean) => rules.find((r) => r.type === type)?.enabled ?? fallback;
  const threshold = rules.find((r) => r.type === "score_drop")?.threshold ?? 5;
  const frequencyLabel = project.crawlFrequency === "manual" ? "Manual crawls" : `${project.crawlFrequency === "weekly" ? "Weekly" : "Daily"} crawl`;
  const cruxMetrics = crux?.metrics as { lcp: { p75: number; band: string } | null; inp: { p75: number; band: string } | null; cls: { p75: number; band: string } | null } | undefined;

  return (
    <>
      <PageHeader
        eyebrow={`${frequencyLabel}${project.nextCrawlAt ? ` · next run ${formatZoned(project.nextCrawlAt, project.timezone)}` : ""}`}
        title="Monitoring"
        actions={<QuerySelect name="range" label="Range" value={range} options={RANGES} />}
      />
      <PageBody>
        <div className="flex flex-col gap-5 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <Card className="p-5">
              <div className="mb-2 flex items-baseline justify-between">
                <CardLabel>Health score · {points.length} audits</CardLabel>
                {scores.length > 0 && (
                  <span className="text-sm text-muted">
                    Latest {scores.at(-1)} · high {Math.max(...scores)}
                  </span>
                )}
              </div>
              {points.length ? <ScoreHistory points={points} drop={drop} /> : <p className="m-0 py-8 text-sm text-muted">No completed audits in this range.</p>}
            </Card>

            <Card className="p-5">
              <CardLabel>Changes detected · newest first</CardLabel>
              {events.length === 0 ? (
                <p className="m-0 mt-3 text-sm text-muted">Changes appear here after the second audit.</p>
              ) : (
                <ul className="m-0 mt-2 list-none p-0">
                  {events.map((e) => {
                    const level = LEVEL[e.level] ?? { label: e.level, tone: "gray" as const };
                    const link = EVENT_LINK[e.type];
                    return (
                      <li key={e.id} className="flex items-center gap-4 border-b border-[#EDEDE8] py-3 text-sm last:border-0">
                        <span className="w-16 shrink-0 font-mono text-muted">{formatShortDate(e.createdAt)}</span>
                        <Pill tone={level.tone} className="w-[90px] justify-center">
                          {level.label}
                        </Pill>
                        <span className="flex-1">{e.message}</span>
                        {link !== undefined && (
                          <Link href={`/projects/${project.id}${link ? `/${link}` : ""}`} className="font-semibold">
                            View
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Scheduled crawls</CardLabel>
              <ActionForm action={saveSchedule.bind(null, project.id)} submitLabel="Save schedule" disabled={!editable}>
                <div className="flex flex-wrap gap-4">
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Frequency
                    <select name="crawlFrequency" defaultValue={project.crawlFrequency} className={input}>
                      <option value="manual">Manual</option>
                      <option value="weekly">Weekly (Monday 02:00)</option>
                      <option value="daily">Daily (02:00)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-semibold">
                    Site time zone
                    <select name="timezone" defaultValue={project.timezone} className={input}>
                      {[...new Set(["UTC", project.timezone, ...Object.values(COUNTRY_TIMEZONE)])].map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </ActionForm>
            </Card>
          </div>

          <div className="flex flex-col gap-5 xl:w-[340px] xl:shrink-0">
            <Card className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <CardLabel>Issue history</CardLabel>
                <QuerySelect name="rule" label="" value={ruleId} options={RULES.map((r) => ({ value: r.id, label: r.id }))} />
              </div>
              <span className="text-xs text-muted">{rule?.title}</span>
              {history.length ? <IssueHistory points={history} rule={ruleId} /> : <p className="m-0 text-sm text-muted">No audits yet.</p>}
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Alert channels</CardLabel>
              <ActionForm action={saveChannels.bind(null, project.id)} submitLabel="Save channels" disabled={!editable}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="emailEnabled" defaultChecked={email?.enabled ?? false} className="h-4 w-4" /> Email
                </label>
                <input name="emailTargets" defaultValue={email?.target ?? user.email} aria-label="Alert email addresses" className={input} placeholder="you@example.com, team@example.com" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="slackEnabled" defaultChecked={slack?.enabled ?? false} className="h-4 w-4" /> Slack{slack ? ` · ${slack.target}` : ""}
                </label>
                <input name="slackChannel" defaultValue={slack?.target ?? "#seo-alerts"} aria-label="Slack channel name" className={input} />
                <input name="slackUrl" type="url" aria-label="Slack incoming-webhook URL" className={input} placeholder={slack?.encryptedSecret ? "Webhook URL saved (enter a new one to replace)" : "https://hooks.slack.com/services/…"} />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" disabled className="h-4 w-4" /> WhatsApp (later)
                </label>
              </ActionForm>
            </Card>

            <Card className="flex flex-col gap-3 p-5">
              <CardLabel>Alert me when</CardLabel>
              <ActionForm action={saveRules.bind(null, project.id)} submitLabel="Save rules" disabled={!editable}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="score_drop" defaultChecked={ruleOn("score_drop", true)} className="h-4 w-4" /> Score drops more than
                  <input name="threshold" type="number" min={0} max={100} defaultValue={threshold} aria-label="Points" className="h-8 w-14 rounded border border-[#CFCFC8] px-1 text-sm" /> points
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="new_critical" defaultChecked={ruleOn("new_critical", true)} className="h-4 w-4" /> Any new Critical issue
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="noindex" defaultChecked={ruleOn("noindex", true)} className="h-4 w-4" /> Pages become noindex
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="weekly_summary" defaultChecked={ruleOn("weekly_summary", false)} className="h-4 w-4" /> Weekly summary (Monday 08:00)
                </label>
              </ActionForm>
              {alerts.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 border-t border-line p-0 pt-3 text-xs text-muted">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      {formatDateTime(a.createdAt)} · {a.channel} · {a.status === "sent" ? "sent" : `failed: ${a.error}`} · {a.message}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <GoogleConnections projectId={project.id} integrations={integrations} editable={editable} back="monitoring" />
            {cruxMetrics && crux && (
              <Card className="flex flex-col gap-2 p-5">
                <CardLabel>Core Web Vitals (CrUX, 28 days)</CardLabel>
                {(["lcp", "inp", "cls"] as const).map((m) => {
                  const v = cruxMetrics[m];
                  return (
                    <div key={m} className="flex items-center justify-between text-sm">
                      <span className="uppercase">{m}</span>
                      {v ? (
                        <span className="flex items-center gap-2">
                          <Mono>{m === "cls" ? v.p75.toFixed(2) : `${Math.round(v.p75)} ms`}</Mono>
                          <Pill tone={v.band === "good" ? "pass" : v.band === "poor" ? "crit" : "med"}>{v.band}</Pill>
                        </span>
                      ) : (
                        <span className="text-muted">No data</span>
                      )}
                    </div>
                  );
                })}
                <span className="text-xs text-muted">Origin-level real-user data from {formatDateTime(crux.fetchedAt)}</span>
              </Card>
            )}
          </div>
        </div>
        {points.length === 0 && events.length === 0 && (
          <EmptyState title="Nothing to monitor yet">
            <p className="m-0 text-muted">Turn on scheduled crawls above, or run an audit from the dashboard.</p>
          </EmptyState>
        )}
        <p className="m-0 text-xs text-muted">{hostOf(project.rootUrl)} · alerts report changes we measured. Rankings and indexing are decided by search engines.</p>
      </PageBody>
    </>
  );
}
