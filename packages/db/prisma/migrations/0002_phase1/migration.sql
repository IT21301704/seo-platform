-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('dns', 'meta', 'file');

-- CreateEnum
CREATE TYPE "AiCrawlerIntent" AS ENUM ('allow', 'block');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "aiCrawlerIntent" "AiCrawlerIntent" NOT NULL DEFAULT 'allow',
ADD COLUMN     "detection" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "searchEngine" TEXT NOT NULL DEFAULT 'google',
ADD COLUMN     "verificationMethod" "VerificationMethod" NOT NULL DEFAULT 'dns',
ADD COLUMN     "verificationToken" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "crawls" ADD COLUMN     "healthScore" INTEGER,
ADD COLUMN     "inputRef" TEXT,
ADD COLUMN     "reportHash" TEXT,
ADD COLUMN     "reusedFromCrawlId" TEXT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "discoveredVia" TEXT NOT NULL,
ADD COLUMN     "wasRendered" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "depth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "check_results" ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "category" "Category" NOT NULL,
ADD COLUMN     "severity" "Severity" NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "issue_items" ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lastCrawlId" TEXT;

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_crawlId_key" ON "reports"("crawlId");

-- CreateIndex
CREATE INDEX "reports_organizationId_reportHash_idx" ON "reports"("organizationId", "reportHash");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "crawls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

