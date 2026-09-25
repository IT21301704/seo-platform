import type { PrismaClient } from "./generated/prisma/client";

const READS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);
const UNIQUE_OPS = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
/** Models without an organizationId column (Organization itself and Auth.js identity tables). */
const UNSCOPED_MODELS = new Set(["Organization", "Account", "Session", "VerificationToken"]);

type Args = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: unknown };

function withOrg(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => withOrg(d, organizationId));
  if (data && typeof data === "object") return { ...(data as object), organizationId };
  return data;
}

/**
 * Prisma client that adds `organizationId` to every query on tenant tables (CLAUDE.md rule 7):
 * filters on reads/updates/deletes, and the value on creates. Unique lookups get the
 * organizationId added to their where clause too, so another tenant's ID finds nothing.
 */
export function forOrganization(prisma: PrismaClient, organizationId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (UNSCOPED_MODELS.has(model)) return query(args);
          const a = { ...(args as Args) };
          if (READS.has(operation) || UNIQUE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), organizationId };
          }
          if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn") {
            a.data = withOrg(a.data, organizationId);
          }
          if (operation === "upsert") a.create = withOrg(a.create, organizationId);
          return query(a as typeof args);
        },
      },
    },
  });
}

export type ScopedPrisma = ReturnType<typeof forOrganization>;
