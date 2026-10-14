import { CircleAlert, CircleCheck, Globe2, LoaderCircle } from 'lucide-react';

import { cn } from '@shared/utils/cn';

import { useHostStatus } from './use-host-status';

const states = {
  connected: {
    icon: CircleCheck,
    label: 'Desktop host connected',
    className: 'text-success',
  },
  error: { icon: CircleAlert, label: 'Host unavailable', className: 'text-destructive' },
  loading: { icon: LoaderCircle, label: 'Connecting host', className: 'text-muted-foreground' },
  web: { icon: Globe2, label: 'Web preview', className: 'text-warning' },
} as const;

export function HostConnectionBadge() {
  const { info, status } = useHostStatus();
  const state = states[status];
  const Icon = state.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1 text-[11px] font-medium',
        state.className,
      )}
      title={info ? `${info.platform} · ${info.appVersion}` : state.label}
    >
      <Icon className={cn('size-3.5', status === 'loading' && 'animate-spin')} aria-hidden="true" />
      <span>{state.label}</span>
    </div>
  );
}
