import { MonitorCog, ShieldCheck, TerminalSquare } from 'lucide-react';

const sections = [
  {
    icon: MonitorCog,
    title: 'Appearance',
    detail: 'Dark-first semantic token system',
    status: 'Configured',
  },
  {
    icon: TerminalSquare,
    title: 'Runtime profiles',
    detail: 'Runtime integration begins in Phase 4',
    status: 'Planned',
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    detail: 'Isolated renderer and allow-listed IPC',
    status: 'Enabled',
  },
];

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-400">Preferences</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Studio settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Foundation settings are visible now; persisted preferences arrive with project resilience.
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border border-border bg-card">
        {sections.map(({ detail, icon: Icon, status, title }) => (
          <div
            key={title}
            className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0"
          >
            <div className="grid size-9 place-items-center rounded-lg bg-secondary text-cyan-400">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">{title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
