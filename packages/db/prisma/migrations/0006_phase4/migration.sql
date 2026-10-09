-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('free', 'starter', 'pro', 'agency');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationType" ADD VALUE 'shopify';
ALTER TYPE "IntegrationType" ADD VALUE 'webflow';
ALTER TYPE "IntegrationType" ADD VALUE 'github';
ALTER TYPE "IntegrationType" ADD VALUE 'keyword_data';
ALTER TYPE "IntegrationType" ADD VALUE 'backlink_data';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProvider" ADD VALUE 'shopify';
ALTER TYPE "IntegrationProvider" ADD VALUE 'webflow';
ALTER TYPE "IntegrationProvider" ADD VALUE 'github';
ALTER TYPE "IntegrationProvider" ADD VALUE 'dataforseo';

-- AlterEnum
ALTER TYPE "FixBatchState" ADD VALUE 'awaiting_merge';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FixTarget" ADD VALUE 'shopify';
ALTER TYPE "FixTarget" ADD VALUE 'webflow';
ALTER TYPE "FixTarget" ADD VALUE 'github';

-- AlterTable
ALTER TABLE "fix_batches" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "revertRef" TEXT;

-- AlterTable
ALTER TABLE "keyword_snapshots" ADD COLUMN     "metrics" JSONB;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "provider" TEXT NOT NULL DEFAULT 'demo',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "modelId" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlink_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "domains" JSONB NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "backlink_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_stripeEventId_key" ON "billing_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "billing_events_organizationId_createdAt_idx" ON "billing_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_conversations_organizationId_projectId_userId_updat_idx" ON "copilot_conversations"("organizationId", "projectId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "copilot_messages_organizationId_conversationId_createdAt_idx" ON "copilot_messages"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "copilot_messages_organizationId_role_createdAt_idx" ON "copilot_messages"("organizationId", "role", "createdAt");

-- CreateIndex
CREATE INDEX "backlink_snapshots_organizationId_projectId_fetchedAt_idx" ON "backlink_snapshots"("organizationId", "projectId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "copilot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlink_snapshots" ADD CONSTRAINT "backlink_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

