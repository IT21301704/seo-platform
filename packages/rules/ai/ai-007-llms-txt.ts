import { defineRule, fail, na, pass } from "../src/define";

export const AI_007 = defineRule(
  {
    id: "AI-007",
    category: "ai",
    severity: "low",
    title: "llms.txt is malformed",
    passCondition:
      "Optional: not applicable when there is no /llms.txt. When present, passes if it starts with a '# ' title, has at least one Markdown link, and its links to this site point to working pages.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.8,
    effort: 1,
    explanation: {
      why: "llms.txt is an emerging, optional convention that gives AI tools a short map of your most useful pages. A broken one is worse than none.",
      fix: [
        "Start the file with '# Your business name', then list key pages as '- [Name](https://…): description'.",
      ],
    },
  },
  (site) => {
    const { url, status, body } = site.llmsTxt;
    if (status !== 200 || body === null) return [na(url, "No llms.txt (optional)")];
    const problems: string[] = [];
    if (!/^#\s+\S/.test(body.trimStart())) problems.push("does not start with a '# ' title");
    const links = [...body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1] ?? "");
    if (links.length === 0) problems.push("no Markdown links");
    const broken = links.filter((l) => {
      const page = site.pageByUrl.get(l);
      return page !== undefined && (page.record.status ?? 0) >= 400;
    });
    if (broken.length) problems.push(`broken links: ${broken.join(", ")}`);
    return [problems.length ? fail(url, { problems }) : pass(url, { links: links.length })];
  },
);
