// Small shadcn-style primitives styled with the wireframe tokens (REQUIREMENTS Part G).
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Severity } from "@seo/shared";
import { SEVERITY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-dark hover:text-white",
        secondary: "border border-[#CFCFC8] bg-white text-ink hover:bg-canvas hover:text-ink",
        ghost: "text-primary underline hover:text-[#16308F]",
      },
      size: { md: "h-10", sm: "h-8 px-3 text-[13px]" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & ButtonVariants) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<typeof Link> & ButtonVariants) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[10px] border border-line bg-white", className)} {...props} />;
}

export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn("label-caps m-0", className)}>{children}</h2>;
}

export type Tone = "crit" | "high" | "med" | "pass" | "info" | "gray";

const TONE: Record<Tone, string> = {
  crit: "bg-crit-bg text-crit",
  high: "bg-high-bg text-high",
  med: "bg-med-bg text-med",
  pass: "bg-pass-bg text-pass",
  info: "bg-primary-soft text-primary",
  gray: "bg-gray-bg text-gray",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold", TONE[tone], className)}>
      {children}
    </span>
  );
}

export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "crit", high: "high", medium: "med", low: "pass" };

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Pill>;
}

export function Bar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "pass" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 overflow-hidden rounded bg-line-soft", className)} role="presentation">
      <div className={cn("h-full rounded", tone === "pass" ? "bg-pass" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Health score donut (wireframe 03). */
export function ScoreDonut({ score }: { score: number | null }) {
  const r = 66;
  const circumference = 2 * Math.PI * r;
  const filled = score === null ? 0 : (score / 100) * circumference;
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={score === null ? "No score yet" : `Health score ${score} out of 100`}>
      <circle cx="80" cy="80" r={r} fill="none" stroke="#EDEDE8" strokeWidth="14" />
      <circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke="#2446C7"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(1)} ${circumference.toFixed(1)}`}
        transform="rotate(-90 80 80)"
      />
      <text x="80" y="86" textAnchor="middle" fontSize="42" fontWeight="700" fill="#1A1D21">
        {score ?? "—"}
      </text>
      <text x="80" y="108" textAnchor="middle" fontSize="13" fill="#5C6066">
        out of 100
      </text>
    </svg>
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("border-b border-line px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-muted", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-[#EDEDE8] px-3 py-[11px] align-middle", className)} {...props} />;
}

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-mono", className)} {...props} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-8">
      <h2 className="m-0 text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}
