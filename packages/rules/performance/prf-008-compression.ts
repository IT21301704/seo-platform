import { defineRule, fail, forPages, indexable, pass } from "../src/define";

const COMPRESSED = new Set(["br", "gzip", "deflate", "zstd"]);

export const PRF_008 = defineRule(
  {
    id: "PRF-008",
    category: "performance",
    severity: "medium",
    title: "HTML is not compressed",
    passCondition: "Passes when HTML responses use Brotli, gzip, deflate or zstd compression (Content-Encoding).",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Compression usually shrinks HTML by 70–80%, so pages download much faster.",
      fix: ["Enable Brotli or gzip in your host, web server or CDN settings."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const encoding = (p.record.headers["content-encoding"] ?? "").toLowerCase().trim();
      return COMPRESSED.has(encoding) ? pass(p.url, { encoding }) : fail(p.url, { encoding: encoding || null });
    }),
);
