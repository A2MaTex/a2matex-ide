import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@shared/utils/cn';

import { useThemeStore, type ThemePreference } from './theme-store';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Segmented Light / Dark / System control for the Settings page. */
export function ThemeSelector() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg border border-border bg-secondary p-0.5"
    >
      {OPTIONS.map(({ icon: Icon, label, value }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => setPreference(value)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
            preference === value && 'bg-card text-foreground shadow-sm',
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
