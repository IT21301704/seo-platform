-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('gsc', 'ga4');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('google', 'demo');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('needs_property', 'connected', 'error');

-- CreateEnum
CREATE TYPE "CrawlTrigger" AS ENUM ('manual', 'scheduled', 'api');

-- CreateEnum
CREATE TYPE "SitemapCheckStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SitemapListType" AS ENUM ('ok', 'manual_add', 'remove');

-- CreateEnum
CREATE TYPE "AlertChannelType" AS ENUM ('email', 'slack');

-- CreateEnum
CREATE TYPE "AlertRuleType" AS ENUM ('score_drop', 'new_critical', 'noindex', 'weekly_summary');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "nextCrawlAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- AlterTable
ALTER TABLE "crawls" ADD COLUMN     "gscSnapshotId" TEXT,
ADD COLUMN     "trigger" "CrawlTrigger" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL DEFAULT 'google',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'needs_property',
    "encryptedToken" TEXT,
    "scopes" TEXT[],
    "externalId" TEXT,
    "externalName" TEXT,
    "connectedById" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gsc_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "dataDate" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "searchAnalytics" JSONB NOT NULL,
    "sitemaps" JSONB NOT NULL,

    CONSTRAINT "gsc_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ga4_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "propertyId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "ga4_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crux_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "crux_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_inspections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "verdict" TEXT NOT NULL,
    "coverageState" TEXT NOT NULL,
    "indexingState" TEXT,
    "robotsTxtState" TEXT,
    "lastCrawlTime" TIMESTAMP(3),
    "googleCanonical" TEXT,
    "raw" JSONB NOT NULL,

    CONSTRAINT "url_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_checks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "crawlId" TEXT,
    "status" "SitemapCheckStatus" NOT NULL DEFAULT 'queued',
    "trigger" "CrawlTrigger" NOT NULL DEFAULT 'manual',
    "crawlerVersion" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "score" INTEGER,
    "sitemapsCount" INTEGER NOT NULL DEFAULT 0,
    "urlsInSitemaps" INTEGER NOT NULL DEFAULT 0,
    "issueCounts" JSONB NOT NULL DEFAULT '{}',
    "autoFixable" INTEGER NOT NULL DEFAULT 0,
    "manualUrls" INTEGER NOT NULL DEFAULT 0,
    "urlsToRemove" INTEGER NOT NULL DEFAULT 0,
    "gsc" JSONB,
    "results" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sitemap_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" INTEGER,
    "urlCount" INTEGER NOT NULL,
    "generator" TEXT NOT NULL,
    "discoveredVia" TEXT NOT NULL,
    "gscLastDownloaded" TIMESTAMP(3),
    "gscErrors" INTEGER,
    "gscWarnings" INTEGER,

    CONSTRAINT "sitemap_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_urls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "listType" "SitemapListType" NOT NULL,
    "inSitemap" BOOLEAN NOT NULL,
    "sitemapFile" TEXT,
    "status" INTEGER,
    "indexable" BOOLEAN NOT NULL,
    "gscState" TEXT,
    "reason" TEXT,
    "foundVia" TEXT,
    "suggestedLastmod" TEXT,
    "targetFile" TEXT,
    "added" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sitemap_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_channels" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AlertChannelType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "target" TEXT NOT NULL,
    "encryptedSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AlertRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ruleType" "AlertRuleType" NOT NULL,
    "channel" "AlertChannelType" NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "itemId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integrations_organizationId_projectId_idx" ON "integrations"("organizationId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_projectId_type_key" ON "integrations"("projectId", "type");

-- CreateIndex
CREATE INDEX "gsc_snapshots_organizationId_projectId_fetchedAt_idx" ON "gsc_snapshots"("organizationId", "projectId", "fetchedAt");

-- CreateIndex
CREATE INDEX "ga4_snapshots_organizationId_projectId_fetchedAt_idx" ON "ga4_snapshots"("organizationId", "projectId", "fetchedAt");

-- CreateIndex
CREATE INDEX "crux_snapshots_organizationId_projectId_fetchedAt_idx" ON "crux_snapshots"("organizationId", "projectId", "fetchedAt");

-- CreateIndex
CREATE INDEX "url_inspections_organizationId_projectId_inspectedAt_idx" ON "url_inspections"("organizationId", "projectId", "inspectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "url_inspections_projectId_url_key" ON "url_inspections"("projectId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_organizationId_key_day_key" ON "usage_counters"("organizationId", "key", "day");

-- CreateIndex
CREATE INDEX "sitemap_checks_organizationId_projectId_createdAt_idx" ON "sitemap_checks"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE INDEX "sitemap_files_organizationId_checkId_idx" ON "sitemap_files"("organizationId", "checkId");

-- CreateIndex
CREATE INDEX "sitemap_urls_organizationId_checkId_listType_idx" ON "sitemap_urls"("organizationId", "checkId", "listType");

-- CreateIndex
CREATE INDEX "monitoring_events_organizationId_projectId_createdAt_idx" ON "monitoring_events"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alert_channels_projectId_type_key" ON "alert_channels"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "alert_rules_projectId_type_key" ON "alert_rules"("projectId", "type");

-- CreateIndex
CREATE INDEX "alerts_organizationId_projectId_createdAt_idx" ON "alerts"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashedKey_key" ON "api_keys"("hashedKey");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_projectId_idx" ON "api_keys"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "webhooks_organizationId_projectId_idx" ON "webhooks"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organizationId_webhookId_createdAt_idx" ON "webhook_deliveries"("organizationId", "webhookId", "createdAt");

-- CreateIndex
CREATE INDEX "issue_comments_organizationId_issueId_createdAt_idx" ON "issue_comments"("organizationId", "issueId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_organizationId_userId_createdAt_idx" ON "notifications"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_projectId_userId_name_key" ON "saved_views"("projectId", "userId", "name");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_projectId_url_idx" ON "issue_items"("organizationId", "projectId", "url");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_projectId_auditTag_idx" ON "issue_items"("organizationId", "projectId", "auditTag");

-- CreateIndex
CREATE INDEX "issue_items_organizationId_projectId_firstSeen_idx" ON "issue_items"("organizationId", "projectId", "firstSeen");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_snapshots" ADD CONSTRAINT "gsc_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gsc_snapshots" ADD CONSTRAINT "gsc_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga4_snapshots" ADD CONSTRAINT "ga4_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ga4_snapshots" ADD CONSTRAINT "ga4_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crux_snapshots" ADD CONSTRAINT "crux_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crux_snapshots" ADD CONSTRAINT "crux_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_inspections" ADD CONSTRAINT "url_inspections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_inspections" ADD CONSTRAINT "url_inspections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_checks" ADD CONSTRAINT "sitemap_checks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_checks" ADD CONSTRAINT "sitemap_checks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_files" ADD CONSTRAINT "sitemap_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_files" ADD CONSTRAINT "sitemap_files_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "sitemap_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_urls" ADD CONSTRAINT "sitemap_urls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_urls" ADD CONSTRAINT "sitemap_urls_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "sitemap_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channels" ADD CONSTRAINT "alert_channels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "issue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

