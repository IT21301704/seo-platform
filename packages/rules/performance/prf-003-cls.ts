import type { RuleDefinition } from "../src/types";
import { webVitalRule } from "./web-vital";

export const PRF_003: RuleDefinition = webVitalRule({
  id: "PRF-003",
  metric: "cls",
  name: "Cumulative Layout Shift (CLS)",
  good: "0.1 or less",
  severity: "medium",
  why: "CLS measures how much the layout jumps while loading, which causes mis-taps and frustration.",
  fix: ["Set width and height on images and embeds.", "Reserve space for banners and ads before they load."],
});
