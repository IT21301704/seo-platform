import { crc32 } from "node:zlib";
import { buildSiteFacts, crawlSite } from "@seo/crawler";
import { runAudit } from "@seo/scoring";
import { describe, expect, it } from "vitest";
import { codeFetcher, readZip } from "./code-upload";

/** Minimal ZIP writer (stored, no compression) for tests. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title><link rel="canonical" href="https://shop.example/"></head><body><main><h1>${title}</h1>${body}</main></body></html>`;

describe("code upload", () => {
  it("strips a shared top folder and drops disallowed files", async () => {
    const files = await readZip(
      zip({
        "site/index.html": "<p>hi</p>",
        "site/about/index.html": "<p>a</p>",
        "site/run.sh": "rm -rf /",
      }),
    );
    expect([...files.keys()].sort()).toEqual(["/about/index.html", "/index.html"]);
  });

  it("rejects path traversal", async () => {
    await expect(readZip(zip({ "../evil.html": "x", "ok.html": "y" }))).rejects.toThrow(
      /Unsafe path|invalid relative path/,
    );
  });

  it("audits uploaded files statically: server-only checks are not applicable, never failed", async () => {
    const files = await readZip(
      zip({
        "index.html": page("Home", '<a href="/missing/">Missing</a>'),
        "robots.txt": "User-agent: *\nAllow: /\n",
      }),
    );
    const snapshot = await crawlSite({
      rootUrl: "https://shop.example/",
      fetcher: codeFetcher(files, "https://shop.example"),
      pageLimit: 10,
      crawledAt: "2026-09-25T00:00:00Z",
      inputType: "code",
    });
    const { report } = runAudit(snapshot);
    const byId = new Map(report.rules.map((r) => [r.ruleId, r]));
    for (const id of ["TEC-006", "TEC-007", "TEC-009", "PRF-001", "PRF-008", "SMP-007", "AI-001"]) {
      expect(byId.get(id)?.status, id).toBe("na");
    }
    // Static checks still run: the link to a missing file is broken.
    expect(byId.get("LNK-002")?.status).toBe("fail");
    expect(buildSiteFacts(snapshot).inputType).toBe("code");
  });
});
