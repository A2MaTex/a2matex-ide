import { FolderKanban, LogOut, Settings, UserRound, Workflow } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '@presentation/features/auth/use-auth';
import { cn } from '@shared/utils/cn';

const navItems = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/workspace/local-sandbox', label: 'Workspace', icon: Workflow },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { logout, session, status } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex h-screen min-h-130 overflow-hidden bg-background text-foreground">
      <aside
        aria-label="Application sidebar"
        className="group/sidebar flex w-17 shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar py-3 transition-[width] duration-300 ease-out hover:w-48 focus-within:w-48 motion-reduce:transition-none"
      >
        <nav className="flex w-full flex-col gap-2 px-2" aria-label="Primary">
          {navItems.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                cn(
                  'group/nav relative flex h-11 w-full shrink-0 items-center overflow-hidden rounded-lg text-xs font-medium text-muted-foreground outline-none transition-[background-color,border-color,color,box-shadow] hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70',
                  isActive
                    ? 'nav-active text-cyan-300 shadow-[inset_0_0_6px_var(--color-brand-blue)]'
                    : undefined,
                )
              }
            >
              <span className="absolute left-4.25 grid size-4.5 shrink-0 place-items-center">
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <span className="ml-12 translate-x-2 whitespace-nowrap opacity-0 transition-[opacity,transform] duration-200 group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100 group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100 motion-reduce:transition-none">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto h-8 w-full shrink-0" aria-label="Host connected">
          <span className="absolute left-7.5 top-3 size-2 rounded-full bg-success shadow-[0_0_10px_var(--success)]" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel/90 px-4 backdrop-blur">
          <div className="flex items-center">
            <img src="/full-logo.webp" alt="" aria-hidden="true" className="object-contain w-32" />
            <div className="truncate text-xl mt-1.5 font-medium tracking-tight text-white/60">
              Studio
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session.status === 'authenticated' ? (
              <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
                <UserRound className="size-3.5 text-primary" aria-hidden="true" />
                <span className="max-w-40 truncate">{session.account}</span>
              </div>
            ) : null}
            <button
              type="button"
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void handleLogout()}
              disabled={status === 'submitting'}
              className="grid size-7 place-items-center rounded-full border border-border/70 bg-secondary/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
