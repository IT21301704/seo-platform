import type { RuleDefinition } from "../src/types";
import { webVitalRule } from "./web-vital";

export const PRF_001: RuleDefinition = webVitalRule({
  id: "PRF-001",
  metric: "lcp",
  name: "Largest Contentful Paint (LCP)",
  good: "2.5 s or less",
  severity: "high",
  why: "LCP measures how quickly the main content appears. Slow pages lose visitors, and Core Web Vitals are part of Google's page experience signals.",
  fix: [
    "Serve the main image in WebP/AVIF at the displayed size, with fetchpriority=\"high\".",
    "Reduce server response time (caching, a CDN) and remove render-blocking scripts.",
  ],
});
