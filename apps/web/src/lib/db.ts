import "server-only";
import { createPrismaClient } from "@seo/db";
import type { PrismaClient } from "@seo/db";
import { redisConnection } from "@seo/worker/queue";
import type { Redis } from "ioredis";

const globals = globalThis as unknown as { prisma?: PrismaClient; redis?: Redis };

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url;
}

/** Unscoped client: only for auth and tenant resolution. Use requireUser().db for app data. */
export const prisma: PrismaClient = globals.prisma ?? createPrismaClient(databaseUrl());
export const redis: Redis = globals.redis ?? redisConnection();

if (process.env.NODE_ENV !== "production") {
  globals.prisma = prisma;
  globals.redis = redis;
}
