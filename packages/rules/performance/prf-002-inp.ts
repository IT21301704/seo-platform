import type { RuleDefinition } from "../src/types";
import { webVitalRule } from "./web-vital";

export const PRF_002: RuleDefinition = webVitalRule({
  id: "PRF-002",
  metric: "inp",
  name: "Interaction to Next Paint (INP)",
  good: "200 ms or less",
  severity: "high",
  why: "INP measures how quickly the page responds to taps and clicks. Slow responses feel broken to visitors.",
  fix: [
    "Break up long JavaScript tasks and remove unused third-party scripts.",
    "Defer non-essential widgets until after the page loads.",
  ],
});
