"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

import type { NavGroup } from "@/lib/nav";

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  groups,
  projectName,
  user,
}: {
  groups: NavGroup[];
  projectName: string | null;
  user: { name: string; role: string };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dashboardHref = groups[0]?.items[0]?.href ?? "";
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        className="fixed left-3 top-3 z-30 rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white lg:hidden"
        aria-expanded={open}
        aria-controls="main-navigation"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close menu" : "Menu"}
      </button>
      <nav
        id="main-navigation"
        aria-label="Main navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-20 flex w-60 shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar px-3.5 py-[18px] text-[#E8E8E3] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-2 max-lg:mt-10">
          <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-primary">
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
          </div>
          <span className="text-base font-bold">SEO Platform</span>
        </div>
        {projectName && (
          <div className="flex flex-col gap-0.5 rounded-lg bg-sidebar-card px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.06em] text-[#A3A7AD]">Project</span>
            <span className="text-sm font-semibold">{projectName}</span>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1 text-[11px] uppercase tracking-[0.08em] text-[#8D9197]">
                {group.label}
              </span>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, item.href === dashboardHref);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-[34px] items-center justify-between rounded-md px-3 text-sm no-underline",
                      active
                        ? "bg-primary font-semibold text-white hover:text-white"
                        : "font-medium text-[#C9CCD1] hover:bg-sidebar-card hover:text-white",
                    )}
                  >
                    {item.label}
                    {item.phase && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8D9197]">
                        Soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2.5 border-t border-[#2C3038] px-2 pt-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3A3F48] text-[13px] font-semibold">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold">{user.name}</span>
            <span className="text-xs capitalize text-[#A3A7AD]">{user.role}</span>
          </div>
        </div>
      </nav>
    </>
  );
}
