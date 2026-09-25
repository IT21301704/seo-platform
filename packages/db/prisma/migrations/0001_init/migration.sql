-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "CmsType" AS ENUM ('wordpress', 'shopify', 'webflow', 'nextjs', 'static', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "CrawlFrequency" AS ENUM ('manual', 'weekly', 'daily');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('url', 'code');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('queued', 'discovering', 'crawling', 'rendering', 'performance', 'checking', 'explaining', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('technical', 'indexing', 'onpage', 'performance', 'links', 'schema', 'ai', 'sitemap', 'a11y', 'offpage');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "AppliesTo" AS ENUM ('url', 'code', 'both');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CheckResultValue" AS ENUM ('pass', 'fail', 'na');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('site_audit', 'sitemap_api', 'keywords', 'monitoring');

-- CreateEnum
CREATE TYPE "IssueItemStatus" AS ENUM ('open', 'in_progress', 'fixed', 'verified', 'reopened', 'ignored');

-- CreateEnum
CREATE TYPE "AuditTag" AS ENUM ('new', 'still_open', 'resolved', 'regressed');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('ai', 'user', 'system');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootUrl" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "cmsType" "CmsType" NOT NULL DEFAULT 'unknown',
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "crawlFrequency" "CrawlFrequency" NOT NULL DEFAULT 'manual',
    "pageLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "inputType" "InputType" NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'queued',
    "crawlerVersion" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "weightsVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "llmModelId" TEXT NOT NULL,
    "snapshotSetHash" TEXT,
    "pagesFound" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "pagesRendered" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "redirectChain" JSONB NOT NULL DEFAULT '[]',
    "contentHash" TEXT,
    "rawHash" TEXT,
    "renderedHash" TEXT,
    "depth" INTEGER NOT NULL,
    "isIndexable" BOOLEAN NOT NULL,
    "snapshotPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_facts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "page_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromPageId" TEXT NOT NULL,
    "toUrl" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL,
    "rel" TEXT,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "ruleId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "appliesTo" "AppliesTo" NOT NULL,
    "autoFixable" BOOLEAN NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_results" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "pageId" TEXT,
    "result" "CheckResultValue" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "category" "Category",
    "value" INTEGER NOT NULL,
    "weightsVersion" TEXT NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "source" "IssueSource" NOT NULL DEFAULT 'site_audit',
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "priority" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "lastCrawlId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "IssueItemStatus" NOT NULL DEFAULT 'open',
    "auditTag" "AuditTag" NOT NULL DEFAULT 'new',
    "ignoredReason" TEXT,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "regressedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_outputs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "source" "ChangeSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_rootUrl_key" ON "projects"("organizationId", "rootUrl");

-- CreateIndex
CREATE INDEX "crawls_organizationId_projectId_createdAt_idx" ON "crawls"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "crawls_organizationId_snapshotSetHash_idx" ON "crawls"("organizationId", "snapshotSetHash");

-- CreateIndex
CREATE INDEX "pages_organizationId_crawlId_idx" ON "pages"("organizationId", "crawlId");

-- CreateIndex
CREATE UNIQUE INDEX "pages_crawlId_normalizedUrl_key" ON "pages"("crawlId", "normalizedUrl");

-- CreateIndex
CREATE INDEX "page_facts_organizationId_pageId_idx" ON "page_facts"("organizationId", "pageId");

-- CreateIndex
CREATE UNIQUE INDEX "page_facts_pageId_key_key" ON "page_facts"("pageId", "key");

-- CreateIndex
CREATE INDEX "links_organizationId_fromPageId_idx" ON "links"("organizationId", "fromPageId");

-- CreateIndex
CREATE INDEX "links_organizationId_toUrl_idx" ON "links"("organizationId", "toUrl");

-- CreateIndex
CREATE INDEX "rules_organizationId_idx" ON "rules"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "rules_ruleId_rulesetVersion_key" ON "rules"("ruleId", "rulesetVersion");

-- CreateIndex
CREATE INDEX "check_results_organizationId_crawlId_ruleId_idx" ON "check_results"("organizationId", "crawlId", "ruleId");

-- CreateIndex
CREATE INDEX "check_results_organizationId_pageId_idx" ON "check_results"("organizationId", "pageId");

-- CreateIndex
CREATE INDEX "scores_organizationId_crawlId_idx" ON "scores"("organizationId", "crawlId");

-- CreateIndex
CREATE UNIQUE INDEX "scores_crawlId_category_key" ON "scores"("crawlId", "category");

-- CreateIndex
CREATE INDEX "issues_organizationId_projectId_priority_idx" ON "issues"("organizationId", "projectId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "issues_projectId_ruleId_key" ON "issues"("projectId", "ruleId");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_projectId_status_idx" ON "issue_items"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_issueId_idx" ON "issue_items"("organizationId", "issueId");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_assigneeId_idx" ON "issue_items"("organizationId", "assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_items_projectId_stableKey_key" ON "issue_items"("projectId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "llm_outputs_organizationId_cacheKey_key" ON "llm_outputs"("organizationId", "cacheKey");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_entityType_entityId_idx" ON "audit_log"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_organizationId_createdAt_idx" ON "audit_log"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawls" ADD CONSTRAINT "crawls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawls" ADD CONSTRAINT "crawls_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "crawls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_facts" ADD CONSTRAINT "page_facts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_facts" ADD CONSTRAINT "page_facts_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_fromPageId_fkey" FOREIGN KEY ("fromPageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "crawls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "crawls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_outputs" ADD CONSTRAINT "llm_outputs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

