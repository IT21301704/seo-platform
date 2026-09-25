import type { ReactNode } from "react";

/** Top bar: site name + page title left, actions right (REQUIREMENTS Part G). */
export function PageHeader({ eyebrow, title, actions }: { eyebrow: ReactNode; title: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 max-lg:pl-24 sm:px-8">
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted">{eyebrow}</span>
        <h1 className="m-0 text-xl font-semibold">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <main className="flex flex-col gap-5 px-4 py-6 sm:px-8">{children}</main>;
}
