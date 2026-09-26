// Live audit progress (screen 02): stage states and a short log, kept in Redis.
import type { Redis } from "ioredis";

export const STAGES = ["discover", "crawl", "render", "performance", "checks", "explain"] as const;
export type Stage = (typeof STAGES)[number];
export type StageState = "waiting" | "running" | "done";

export interface StageInfo {
  state: StageState;
  detail: string;
  done?: number;
  total?: number;
}

export interface ProgressSnapshot {
  stages: Record<Stage, StageInfo>;
  log: { time: string; status: number | null; message: string }[];
}

const LOG_LIMIT = 100;
const TTL_SECONDS = 60 * 60 * 24;
const stagesKey = (crawlId: string) => `crawl:${crawlId}:stages`;
const logKey = (crawlId: string) => `crawl:${crawlId}:log`;

export class ProgressReporter {
  constructor(
    private readonly redis: Redis,
    private readonly crawlId: string,
  ) {}

  async stage(stage: Stage, info: StageInfo): Promise<void> {
    await this.redis.hset(stagesKey(this.crawlId), stage, JSON.stringify(info));
    await this.redis.expire(stagesKey(this.crawlId), TTL_SECONDS);
  }

  async log(message: string, status: number | null = null): Promise<void> {
    const entry = JSON.stringify({ time: new Date().toISOString(), status, message });
    await this.redis.rpush(logKey(this.crawlId), entry);
    await this.redis.ltrim(logKey(this.crawlId), -LOG_LIMIT, -1);
    await this.redis.expire(logKey(this.crawlId), TTL_SECONDS);
  }
}

export async function readProgress(redis: Redis, crawlId: string): Promise<ProgressSnapshot> {
  const [rawStages, rawLog] = await Promise.all([
    redis.hgetall(stagesKey(crawlId)),
    redis.lrange(logKey(crawlId), -30, -1),
  ]);
  const stages = Object.fromEntries(
    STAGES.map((s) => [
      s,
      rawStages[s] ? (JSON.parse(rawStages[s]) as StageInfo) : { state: "waiting", detail: "" },
    ]),
  ) as Record<Stage, StageInfo>;
  const log = rawLog.map((l) => JSON.parse(l) as ProgressSnapshot["log"][number]);
  return { stages, log };
}
