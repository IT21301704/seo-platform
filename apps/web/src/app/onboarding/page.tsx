import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

const STEPS = [
  ["Website", "URL or code upload"],
  ["Verify ownership", "Needed for auto-fix"],
  ["Connect data", "Optional"],
  ["Audit settings", "Country, language, schedule"],
];

export const metadata = { title: "Add your website" };

export default async function OnboardingPage() {
  await requireUser();
  const token = `seo-verify=${randomBytes(12).toString("hex")}`;
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex flex-col gap-6 border-line bg-white p-6 lg:w-[340px] lg:shrink-0 lg:border-r lg:p-7">
        <a href="/" className="flex items-center gap-2.5 text-ink no-underline">
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-primary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 17l5-5 4 4 7-8" />
            </svg>
          </span>
          <span className="text-base font-bold">SEO Platform</span>
        </a>
        <div>
          <h1 className="m-0 text-[28px] font-bold">Add your website</h1>
          <p className="mb-0 mt-2 text-sm text-muted">
            Four quick steps. You can skip the optional ones and connect them later.
          </p>
        </div>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {STEPS.map(([title, sub], i) => (
            <li
              key={title}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 first:bg-primary-soft"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-sm font-semibold">
                {i + 1}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{title}</span>
                <span className="block text-xs text-muted">{sub}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-auto rounded-[10px] border border-line bg-canvas p-4">
          <h2 className="label-caps m-0 mb-2">What happens next</h2>
          <p className="m-0 text-sm leading-relaxed text-muted">
            We crawl up to your plan&apos;s page limit, run every check, and show your Health Score.
            A first audit usually takes 5–10 minutes.
          </p>
        </div>
      </aside>
      <main className="flex-1 p-4 sm:p-10">
        <OnboardingForm token={token} />
      </main>
    </div>
  );
}
