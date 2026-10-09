-- CreateEnum
CREATE TYPE "FixBatchState" AS ENUM ('generating', 'preview', 'publishing', 'verifying', 'rechecking', 'verified', 'verify_failed', 'rolled_back', 'failed');

-- CreateEnum
CREATE TYPE "FixState" AS ENUM ('draft', 'applied', 'verified', 'verify_failed', 'rolled_back', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "FixTarget" AS ENUM ('wordpress', 'manual');

-- AlterEnum
ALTER TYPE "VerificationMethod" ADD VALUE 'plugin';

-- AlterEnum
ALTER TYPE "IntegrationType" ADD VALUE 'wordpress';

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'plugin';

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "details" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "fix_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "ruleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "risk" "RiskLevel" NOT NULL,
    "source" "ChangeSource" NOT NULL,
    "target" "FixTarget" NOT NULL,
    "targetDetail" TEXT NOT NULL,
    "state" "FixBatchState" NOT NULL DEFAULT 'generating',
    "crawlId" TEXT,
    "sitemapCheckId" TEXT,
    "modelId" TEXT,
    "promptVersion" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackById" TEXT,
    "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextVerifyAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fix_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetRef" JSONB NOT NULL DEFAULT '{}',
    "currentValue" JSONB,
    "suggestedValue" JSONB,
    "newValue" JSONB,
    "oldValue" JSONB,
    "oldValueRead" BOOLEAN NOT NULL DEFAULT false,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "recheck" TEXT NOT NULL,
    "recheckDetail" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "state" "FixState" NOT NULL DEFAULT 'draft',
    "appliedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "verification" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "rows" JSONB NOT NULL,
    "clusters" JSONB,

    CONSTRAINT "keyword_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_page_map" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyword_page_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fix_batches_organizationId_projectId_createdAt_idx" ON "fix_batches"("organizationId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "fix_batches_projectId_number_key" ON "fix_batches"("projectId", "number");

-- CreateIndex
CREATE INDEX "fixes_organizationId_batchId_idx" ON "fixes"("organizationId", "batchId");

-- CreateIndex
CREATE INDEX "fixes_organizationId_projectId_url_idx" ON "fixes"("organizationId", "projectId", "url");

-- CreateIndex
CREATE INDEX "keyword_snapshots_organizationId_projectId_fetchedAt_idx" ON "keyword_snapshots"("organizationId", "projectId", "fetchedAt");

-- CreateIndex
CREATE INDEX "keyword_page_map_organizationId_projectId_keyword_idx" ON "keyword_page_map"("organizationId", "projectId", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_page_map_projectId_url_keyword_key" ON "keyword_page_map"("projectId", "url", "keyword");

-- AddForeignKey
ALTER TABLE "fix_batches" ADD CONSTRAINT "fix_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fix_batches" ADD CONSTRAINT "fix_batches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixes" ADD CONSTRAINT "fixes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixes" ADD CONSTRAINT "fixes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixes" ADD CONSTRAINT "fixes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fix_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_snapshots" ADD CONSTRAINT "keyword_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_snapshots" ADD CONSTRAINT "keyword_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_page_map" ADD CONSTRAINT "keyword_page_map_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_page_map" ADD CONSTRAINT "keyword_page_map_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

