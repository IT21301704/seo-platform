// Sidebar navigation (wireframe groups: Analyse, Fix, Grow, Settings).
export interface NavItem {
  label: string;
  href: string;
  /** Delivery phase when the screen is not built yet. */
  phase?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export function projectNav(projectId: string): NavGroup[] {
  const p = `/projects/${projectId}`;
  return [
    {
      label: "Analyse",
      items: [
        { label: "Dashboard", href: p },
        { label: "Issue manager", href: `${p}/issues` },
        { label: "Sitemap check", href: `${p}/sitemap` },
        { label: "AI Copilot", href: `${p}/copilot`, phase: 4 },
      ],
    },
    {
      label: "Fix",
      items: [
        { label: "Auto-fix review", href: `${p}/fixes` },
        { label: "Sitemap URL lists", href: `${p}/sitemap/urls` },
        { label: "Change log", href: `${p}/changes`, phase: 3 },
      ],
    },
    {
      label: "Grow",
      items: [
        { label: "Keyword research", href: `${p}/keywords`, phase: 3 },
        { label: "Monitoring", href: `${p}/monitoring` },
        { label: "Authority (off-page)", href: `${p}/authority`, phase: 4 },
      ],
    },
    {
      label: "Settings",
      items: [
        { label: "Integrations", href: `${p}/integrations`, phase: 3 },
        { label: "API & webhooks", href: `${p}/api` },
        { label: "Plans & billing", href: `${p}/billing`, phase: 4 },
        { label: "Add website", href: "/onboarding" },
      ],
    },
  ];
}
