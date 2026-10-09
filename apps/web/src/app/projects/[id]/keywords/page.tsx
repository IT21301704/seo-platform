import Link from "next/link";
import type { Intent, KeywordStat } from "@seo/keywords";
import { draftPageBrief, llmClientFromEnv } from "@seo/llm";
import type { PageBrief } from "@seo/llm";
import { DbLlmCache } from "@seo/worker/llm-cache";
import { ActionForm } from "@/components/action-form";
import { PageBody, PageHeader } from "@/components/page-header";
import {
  Button,
  ButtonLink,
  Card,
  CardLabel,
  EmptyState,
  Mono,
  Pill,
  Table,
  Td,
  Th,
} from "@/components/ui";
import type { Tone } from "@/components/ui";
import { briefInput } from "@/lib/keyword-brief";
import { COUNTRY_CODES, LANGUAGES, loadKeywordData } from "@/lib/keywords";
import type { KeywordData } from "@/lib/keywords";
import { canEdit, requireProject, requireUser } from "@/lib/session";
import { formatDate, formatNumber, pathOf } from "@/lib/utils";
import { createPageBrief, removeMapEntry, saveKeywordMap, setPrimaryKeyword } from "./actions";

const TABS = [
  ["ideas", "Ideas"],
  ["clusters", "Clusters"],
  ["map", "Keyword map"],
  ["quick-wins", "Quick wins"],
  ["cannibalization", "Cannibalization"],
  ["gaps", "Content gaps"],
] as const;
type Tab = (typeof TABS)[number][0];

const INTENT_TONE: Record<Intent, Tone> = {
  commercial: "info",
  transactional: "pass",
  informational: "gray",
  navigational: "med",
};
const ROWS = 100;
const field = "h-10 rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm";

export default async function KeywordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; country?: string; lang?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const defaultCountry = COUNTRY_CODES[project.country]?.code ?? "all";
  const country = sp.country ?? defaultCountry;
  const lang = sp.lang ?? project.language;
  const seed = (sp.q ?? "").trim().slice(0, 100);
  const tab: Tab = (TABS.find(([t]) => t === sp.tab)?.[0] ?? "ideas") as Tab;
  const data = await loadKeywordData(db, project, {
    seed,
    country: country === "all" ? null : country,
  });
  const editor = canEdit(user.role);
  const p = `/projects/${project.id}`;
  const countryName =
    Object.values(COUNTRY_CODES).find((c) => c.code === country)?.name ?? "All countries";
  const query = (t: string) =>
    `?${new URLSearchParams({ ...(seed ? { q: seed } : {}), country, lang, tab: t }).toString()}`;
  const gsc = await db.integration.findFirst({ where: { projectId: project.id, type: "gsc" } });

  return (
    <>
      <PageHeader
        eyebrow={`Google · ${countryName} · ${LANGUAGES[lang] ?? lang}${data ? ` · data snapshot ${formatDate(data.snapshot.fetchedAt)}` : ""}${data?.snapshot.provider === "demo" ? " (demo data)" : ""}`}
        title="Keyword research"
        actions={
          data && (
            <>
              <ButtonLink href={`${p}/keywords/export${query(tab)}`} variant="secondary">
                Export
              </ButtonLink>
              {editor && (
                <form action={saveKeywordMap.bind(null, project.id)}>
                  <Button type="submit">Save to keyword map</Button>
                </form>
              )}
            </>
          )
        }
      />
      <PageBody>
        <form method="get" className="flex flex-wrap items-end gap-3" role="search">
          <input type="hidden" name="tab" value={tab} />
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">
            <span className="sr-only">Seed keyword</span>
            <input
              name="q"
              defaultValue={seed}
              placeholder="ceramic mugs"
              className={field}
              aria-label="Seed keyword"
            />
          </label>
          <select name="country" defaultValue={country} className={field} aria-label="Country">
            <option value="all">All countries</option>
            {Object.values(COUNTRY_CODES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="lang" defaultValue={lang} className={field} aria-label="Language">
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <Button type="submit">Find keywords</Button>
        </form>

        {!data ? (
          <EmptyState title="No Search Console query data yet">
            Keyword research starts from the queries people already use to find your site.{" "}
            {gsc?.status === "connected" ? (
              "The first daily sync has not finished yet."
            ) : (
              <Link href={`${p}/integrations`}>Connect Search Console</Link>
            )}
          </EmptyState>
        ) : (
          <>
            <nav aria-label="Keyword views" className="flex flex-wrap gap-1 border-b border-line">
              {TABS.map(([t, label]) => (
                <Link
                  key={t}
                  href={query(t)}
                  aria-current={t === tab ? "page" : undefined}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold no-underline ${t === tab ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {label}
                  {count(t, data) !== null && ` (${count(t, data)})`}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-5 xl:flex-row">
              <div className="min-w-0 flex-1">
                {tab === "ideas" && <Ideas data={data} />}
                {tab === "clusters" && <Clusters data={data} />}
                {tab === "map" && <KeywordMap data={data} projectId={project.id} editor={editor} />}
                {tab === "quick-wins" && (
                  <KeywordTable
                    rows={data.quickWins}
                    data={data}
                    note="Average position 5–20 with high impressions: improve the title, content and internal links of the mapped page first."
                  />
                )}
                {tab === "cannibalization" && <Cannibal data={data} projectId={project.id} />}
                {tab === "gaps" && (
                  <Gaps data={data} projectId={project.id} editor={editor} project={project} />
                )}
              </div>
              {tab === "ideas" && <SideCards data={data} projectId={project.id} />}
            </div>
            <p className="m-0 text-sm text-muted">
              Volume and difficulty need a keyword data provider (—): we never estimate them.{" "}
              <Link href={`${p}/integrations`}>Connect keyword data</Link>. Positions come from
              Search Console ({data.snapshot.startDate} to {data.snapshot.endDate}). Keyword sets
              are saved as dated snapshots so reports stay consistent. Language filtering also needs
              a keyword data provider; Search Console has no language dimension.
            </p>
          </>
        )}
      </PageBody>
    </>
  );
}

function count(tab: Tab, data: KeywordData): number | null {
  switch (tab) {
    case "ideas":
      return data.ideas.length;
    case "clusters":
      return data.clusters.clusters.length;
    case "quick-wins":
      return data.quickWins.length;
    case "cannibalization":
      return data.cannibal.length;
    case "gaps":
      return data.gaps.length;
    default:
      return null;
  }
}

function mappedPage(data: KeywordData, keyword: string) {
  if (data.cannibal.some((c) => c.keyword === keyword)) {
    const n = data.cannibal.find((c) => c.keyword === keyword)?.pages.length ?? 2;
    return <Pill tone="crit">{n} pages</Pill>;
  }
  const entry = data.map.find((m) => m.keyword === keyword);
  return entry ? (
    <Mono className="text-xs">{pathOf(entry.url)}</Mono>
  ) : (
    <Pill tone="med">No page</Pill>
  );
}

function KeywordTable({
  rows,
  data,
  note,
}: {
  rows: KeywordStat[];
  data: KeywordData;
  note?: string;
}) {
  if (rows.length === 0) return <EmptyState title="Nothing here for this filter" />;
  return (
    <Card className="overflow-x-auto px-2 pb-2">
      {note && <p className="m-0 px-3 pt-4 text-sm text-muted">{note}</p>}
      <Table>
        <thead>
          <tr>
            <Th>Keyword</Th>
            <Th>Intent</Th>
            <Th>Volume / mo</Th>
            <Th>Difficulty</Th>
            <Th>Your position</Th>
            <Th>Impressions</Th>
            <Th>Mapped page</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, ROWS).map((s) => (
            <tr key={s.keyword}>
              <Td className="font-semibold">{s.keyword}</Td>
              <Td>
                <Pill tone={INTENT_TONE[s.intent]}>
                  {s.intent.charAt(0).toUpperCase() + s.intent.slice(1)}
                </Pill>
              </Td>
              <Td>
                <Mono title="Needs a keyword data provider">—</Mono>
              </Td>
              <Td>
                <Mono title="Needs a keyword data provider">—</Mono>
              </Td>
              <Td>
                <Mono>{s.position > 0 ? s.position.toFixed(1) : "—"}</Mono>
              </Td>
              <Td>
                <Mono>{formatNumber(s.impressions)}</Mono>
              </Td>
              <Td>{mappedPage(data, s.keyword)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {rows.length > ROWS && (
        <p className="m-0 px-3 py-2 text-sm text-muted">
          Showing {ROWS} of {formatNumber(rows.length)}. Use Export for all.
        </p>
      )}
    </Card>
  );
}

function Ideas({ data }: { data: KeywordData }) {
  return <KeywordTable rows={data.ideas} data={data} />;
}

function SideCards({ data, projectId }: { data: KeywordData; projectId: string }) {
  const p = `/projects/${projectId}/keywords`;
  const cannibal = data.cannibal[0];
  const gap = data.gaps[0];
  return (
    <div className="flex flex-col gap-4 xl:w-[300px]">
      <Card className="flex flex-col gap-2 p-4">
        <CardLabel>Quick wins · positions 5–20</CardLabel>
        {data.quickWins.length === 0 ? (
          <p className="m-0 text-sm text-muted">None right now.</p>
        ) : (
          data.quickWins.slice(0, 3).map((s) => (
            <div key={s.keyword} className="flex justify-between text-sm">
              <span>{s.keyword}</span>
              <Mono>#{Math.round(s.position)}</Mono>
            </div>
          ))
        )}
        <p className="m-0 text-xs text-muted">
          High impressions in Search Console. Improve title and content first.
        </p>
      </Card>
      {cannibal && (
        <Card className="flex flex-col gap-2 border-[#F2C7C0] p-4">
          <CardLabel>Cannibalization</CardLabel>
          <p className="m-0 font-semibold">
            &quot;{cannibal.keyword}&quot; · {cannibal.pages.length} pages compete
          </p>
          {cannibal.pages.map((pg) => (
            <Mono key={pg.url} className="text-xs">
              {pathOf(pg.url)}
            </Mono>
          ))}
          <p className="m-0 text-xs text-muted">
            Suggestion: keep {pathOf(cannibal.pages[0]?.url ?? "")} as the target and link to it
            from the other page.
          </p>
          <Link href={`/projects/${projectId}/issues/KWD-002`} className="text-sm font-semibold">
            Open issue KWD-002
          </Link>
        </Card>
      )}
      {gap && (
        <Card className="flex flex-col gap-2 p-4">
          <CardLabel>Content gap</CardLabel>
          <p className="m-0 font-semibold">&quot;{gap.name}&quot; cluster · no page</p>
          <p className="m-0 text-xs text-muted">
            {gap.keywords.length} keyword{gap.keywords.length === 1 ? "" : "s"} in this cluster. AI
            can draft a page outline for you to review.
          </p>
          <ButtonLink href={`${p}?tab=gaps`} variant="secondary" size="sm" className="self-start">
            Create page brief
          </ButtonLink>
        </Card>
      )}
    </div>
  );
}

function Clusters({ data }: { data: KeywordData }) {
  const byKeyword = new Map(data.stats.map((s) => [s.keyword, s]));
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">
        {data.clusters.source === "ai"
          ? `Grouped by ${data.clusters.modelId} (${data.clusters.promptVersion}); the AI only groups queries, it adds no numbers.`
          : "Grouped by shared words (no AI model configured)."}
      </p>
      {data.clusters.clusters.map((c) => (
        <Card key={c.name} className="flex flex-col gap-2 p-4" aria-label={`Cluster ${c.name}`}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="m-0 text-base font-semibold">{c.name}</h3>
            <span className="text-sm text-muted">
              {c.keywords.length} keywords ·{" "}
              {formatNumber(
                c.keywords.reduce((n, k) => n + (byKeyword.get(k)?.impressions ?? 0), 0),
              )}{" "}
              impressions
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.keywords.map((k) => (
              <Pill key={k} tone="gray">
                {k}
              </Pill>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function KeywordMap({
  data,
  projectId,
  editor,
}: {
  data: KeywordData;
  projectId: string;
  editor: boolean;
}) {
  const pages = [...new Set(data.map.map((m) => m.url))].sort();
  return (
    <Card className="overflow-x-auto px-2 pb-2">
      <p className="m-0 px-3 pt-4 text-sm text-muted">
        One primary keyword per page, plus secondary keywords. On-page check KWD-001 looks for the
        primary keyword in the title, H1 and description (no density targets). &quot;Auto&quot;
        entries follow Search Console; your own entries are never changed automatically.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Page</Th>
            <Th>Primary</Th>
            <Th>Secondary</Th>
            {editor && <Th>Change</Th>}
          </tr>
        </thead>
        <tbody>
          {pages.map((url) => {
            const entries = data.map.filter((m) => m.url === url);
            const primary = entries.find((e) => e.role === "primary");
            return (
              <tr key={url}>
                <Td>
                  <Mono>{pathOf(url)}</Mono>
                </Td>
                <Td>
                  {primary ? (
                    <>
                      <span className="font-semibold">{primary.keyword}</span>{" "}
                      <Pill tone={primary.source === "user" ? "pass" : "gray"}>
                        {primary.source === "user" ? "You" : "Auto"}
                      </Pill>
                    </>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {entries
                      .filter((e) => e.role === "secondary")
                      .map((e) => (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs"
                        >
                          {e.keyword}
                          {editor && (
                            <form action={removeMapEntry.bind(null, projectId, e.id)}>
                              <button
                                type="submit"
                                aria-label={`Remove ${e.keyword}`}
                                className="border-0 bg-transparent p-0 text-muted"
                              >
                                ×
                              </button>
                            </form>
                          )}
                        </span>
                      ))}
                  </div>
                </Td>
                {editor && (
                  <Td>
                    <ActionForm
                      action={setPrimaryKeyword.bind(null, projectId, url)}
                      submitLabel="Save"
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        name="keyword"
                        aria-label={`Keyword for ${pathOf(url)}`}
                        placeholder="keyword"
                        className="h-8 w-40 rounded-lg border border-[#CFCFC8] px-2 text-sm"
                      />
                      <select
                        name="role"
                        aria-label={`Role for ${pathOf(url)}`}
                        className="h-8 rounded-lg border border-[#CFCFC8] px-1 text-sm"
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                    </ActionForm>
                  </Td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}

function Cannibal({ data, projectId }: { data: KeywordData; projectId: string }) {
  if (data.cannibal.length === 0) return <EmptyState title="No pages compete for the same query" />;
  return (
    <div className="flex flex-col gap-3">
      {data.cannibal.map((c) => (
        <Card key={c.keyword} className="flex flex-col gap-2 p-4">
          <h3 className="m-0 text-base font-semibold">
            &quot;{c.keyword}&quot; · {c.pages.length} pages compete · {formatNumber(c.impressions)}{" "}
            impressions
          </h3>
          <Table>
            <thead>
              <tr>
                <Th>Page</Th>
                <Th>Impressions</Th>
                <Th>Clicks</Th>
                <Th>Position</Th>
              </tr>
            </thead>
            <tbody>
              {c.pages.map((pg) => (
                <tr key={pg.url}>
                  <Td>
                    <Mono>{pathOf(pg.url)}</Mono>
                  </Td>
                  <Td>
                    <Mono>{formatNumber(pg.impressions)}</Mono>
                  </Td>
                  <Td>
                    <Mono>{formatNumber(pg.clicks)}</Mono>
                  </Td>
                  <Td>
                    <Mono>{pg.position.toFixed(1)}</Mono>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="m-0 text-sm text-muted">
            Suggestion: keep {pathOf(c.pages[0]?.url ?? "")} as the target (most impressions), make
            it the primary page for this keyword and link to it from the others.{" "}
            <Link href={`/projects/${projectId}/issues/KWD-002`}>Open issue KWD-002</Link>
          </p>
        </Card>
      ))}
    </div>
  );
}

async function Gaps({
  data,
  projectId,
  editor,
  project,
}: {
  data: KeywordData;
  projectId: string;
  editor: boolean;
  project: { id: string; rootUrl: string };
}) {
  if (data.gaps.length === 0)
    return <EmptyState title="No content gaps: every cluster has a page ranking in the top 20" />;
  const { db } = await requireUser();
  const llm = llmClientFromEnv();
  const briefs = new Map<string, PageBrief>();
  if (llm) {
    for (const gap of data.gaps.slice(0, 10)) {
      const cached = await draftPageBrief(await briefInput(db, project, data, gap), {
        llm,
        cache: new DbLlmCache(db),
        cachedOnly: true,
      });
      if (cached) briefs.set(gap.name, cached.output);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {data.gaps.map((gap) => {
        const brief = briefs.get(gap.name);
        return (
          <Card
            key={gap.name}
            className="flex flex-col gap-2 p-4"
            aria-label={`Content gap ${gap.name}`}
          >
            <h3 className="m-0 text-base font-semibold">
              &quot;{gap.name}&quot; cluster · no page
            </h3>
            <p className="m-0 text-sm text-muted">
              {gap.keywords.join(", ")} · {formatNumber(gap.impressions)} impressions · best
              position {gap.bestPosition?.toFixed(1) ?? "—"}
            </p>
            {brief ? (
              <div className="rounded-lg bg-canvas p-3 text-sm">
                <p className="m-0 font-semibold">{brief.workingTitle}</p>
                <p className="m-0 text-muted">{brief.searchIntent}</p>
                <ol className="m-0 mt-2 pl-5">
                  {brief.outline.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
                {brief.questionsToAnswer.length > 0 && (
                  <p className="m-0 mt-2">Questions: {brief.questionsToAnswer.join(" · ")}</p>
                )}
                {brief.notes && <p className="m-0 mt-2 text-muted">{brief.notes}</p>}
                <p className="m-0 mt-2 text-xs text-muted">
                  AI draft for your review. It contains no search volumes or ranking promises.
                </p>
              </div>
            ) : editor ? (
              <ActionForm
                action={createPageBrief.bind(null, projectId, gap.name)}
                submitLabel="Create page brief"
                disabled={!llm}
              >
                {!llm && (
                  <span className="text-sm text-muted">
                    Configure an AI model (ANTHROPIC_API_KEY) to draft page briefs.
                  </span>
                )}
              </ActionForm>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
