import { Boxes, FolderKanban, Settings, Workflow } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { HostConnectionBadge } from '@presentation/features/host-status/HostConnectionBadge';
import { cn } from '@shared/utils/cn';

const navItems = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/workspace/local-sandbox', label: 'Workspace', icon: Workflow },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  return (
    <div className="flex h-screen min-h-130 overflow-hidden bg-background text-foreground">
      <aside className="flex w-17 shrink-0 flex-col items-center border-r border-border bg-sidebar py-3">
        <div
          className="mb-5 grid size-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary shadow-[0_0_24px_var(--primary-glow)]"
          aria-label="A2MaTeX Studio"
        >
          <Boxes className="size-5" aria-hidden="true" />
        </div>

        <nav className="flex w-full flex-col items-center gap-1 px-2" aria-label="Primary">
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'group flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70',
                  isActive && 'bg-accent text-foreground',
                )
              }
            >
              <Icon className="size-4.5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto size-2 rounded-full bg-success shadow-[0_0_10px_var(--success)]" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-panel/90 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">A2MaTeX Studio</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Automation workspace
              </div>
            </div>
          </div>
          <HostConnectionBadge />
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
