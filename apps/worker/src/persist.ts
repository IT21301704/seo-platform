import type { SiteFacts } from "@seo/crawler";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import { RULES } from "@seo/rules";
import type { AuditReport } from "@seo/scoring";
import { RULESET_VERSION, SCORED_CATEGORIES } from "@seo/shared";
import { syncIssues } from "./issues";

const MAX_LINKS_PER_PAGE = 500;

/** Registers the built-in rule catalog for this ruleset version (shared by all tenants). */
export async function registerRules(prisma: PrismaClient): Promise<void> {
  for (const r of RULES) {
    const data = {
      version: r.version,
      category: r.category,
      severity: r.severity,
      title: r.title,
      appliesTo: r.appliesTo,
      autoFixable: r.autoFixable,
      riskLevel: r.riskLevel,
    };
    await prisma.rule.upsert({
      where: { ruleId_rulesetVersion: { ruleId: r.id, rulesetVersion: RULESET_VERSION } },
      create: { ruleId: r.id, rulesetVersion: RULESET_VERSION, organizationId: null, ...data },
      update: data,
    });
  }
}

export interface PersistArgs {
  crawlId: string;
  projectId: string;
  site: SiteFacts;
  report: AuditReport;
  reportHash: string;
  snapshotPaths: Map<string, string>;
  now: Date;
}

/** Writes pages, facts, links, check results, scores, the report and issues for one crawl. */
export async function persistAudit(db: ScopedPrisma, args: PersistArgs): Promise<void> {
  const { crawlId, site, report } = args;
  await db.$transaction(
    async (tx) => {
      // Idempotent: a retried job replaces its own rows.
      await tx.checkResult.deleteMany({ where: { crawlId } });
      await tx.score.deleteMany({ where: { crawlId } });
      await tx.page.deleteMany({ where: { crawlId } });
      await tx.report.deleteMany({ where: { crawlId } });

      const pages = await tx.page.createManyAndReturn({
        data: site.pages.map((p) => ({
          crawlId,
          url: p.url,
          normalizedUrl: p.url,
          statusCode: p.record.status,
          redirectChain: p.record.chain as unknown as Prisma.InputJsonValue,
          contentHash: p.record.renderedHash ?? p.record.rawHash,
          rawHash: p.record.rawHash,
          renderedHash: p.record.renderedHash,
          depth: p.depth,
          isIndexable: p.isIndexable,
          contentType: p.record.contentType,
          discoveredVia: p.record.discoveredVia,
          wasRendered: p.record.renderedHtml !== null,
          snapshotPath: args.snapshotPaths.get(p.url) ?? null,
        })) as Prisma.PageCreateManyInput[],
        select: { id: true, url: true },
      });
      const pageId = new Map(pages.map((p) => [p.url, p.id]));

      const facts: Prisma.PageFactCreateManyInput[] = [];
      const links: Prisma.LinkCreateManyInput[] = [];
      for (const p of site.pages) {
        const id = pageId.get(p.url);
        if (!id || !p.facts) continue;
        const f = p.facts;
        const values: Record<string, Prisma.InputJsonValue> = {
          title: f.title ?? "",
          metaDescription: f.metaDescription ?? "",
          canonical: f.canonical ?? "",
          robots: f.robotsDirectives,
          h1: f.h1,
          headings: f.headings.slice(0, 50).map((h) => `H${h.level} ${h.text}`),
          wordCount: f.wordCount,
          lang: f.lang ?? "",
          inboundLinks: p.inboundFrom.length,
        };
        for (const [key, value] of Object.entries(values)) {
          facts.push({ pageId: id, key, value } as Prisma.PageFactCreateManyInput);
        }
        for (const l of f.links.slice(0, MAX_LINKS_PER_PAGE)) {
          if (!l.url) continue;
          links.push({
            fromPageId: id,
            toUrl: l.url,
            anchorText: l.text.slice(0, 500),
            isInternal: new URL(l.url).origin === site.origin,
            rel: l.rel.join(" ") || null,
          } as Prisma.LinkCreateManyInput);
        }
      }
      if (facts.length) await tx.pageFact.createMany({ data: facts });
      if (links.length) await tx.link.createMany({ data: links });

      await tx.checkResult.createMany({
        data: report.rules.flatMap((r) =>
          r.outcomes.map((o) => ({
            crawlId,
            ruleId: r.ruleId,
            ruleVersion: r.version,
            pageId: o.url ? (pageId.get(o.url) ?? null) : null,
            url: o.url,
            result: o.result,
            evidence: o.evidence as Prisma.InputJsonValue,
          })),
        ) as Prisma.CheckResultCreateManyInput[],
      });

      const scoreRows = [
        { category: null, value: report.score.health },
        ...SCORED_CATEGORIES.map((c) => ({ category: c, value: report.score.categories[c] })),
        { category: "sitemap" as const, value: report.score.sitemap },
      ].filter((s): s is { category: (typeof s)["category"]; value: number } => s.value !== null);
      await tx.score.createMany({
        data: scoreRows.map((s) => ({
          crawlId,
          category: s.category,
          value: s.value,
          weightsVersion: report.versions.weightsVersion,
        })) as Prisma.ScoreCreateManyInput[],
      });

      await tx.report.create({
        data: {
          crawlId,
          reportHash: args.reportHash,
          reportJson: report as unknown as Prisma.InputJsonValue,
        } as Prisma.ReportUncheckedCreateInput,
      });

      await syncIssues(tx, { projectId: args.projectId, crawlId, report, now: args.now });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}
