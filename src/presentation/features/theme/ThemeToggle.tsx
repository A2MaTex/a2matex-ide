import { Moon, Sun } from 'lucide-react';

import { cn } from '@shared/utils/cn';

import { useThemeStore } from './theme-store';

/** Light / dark switch button. */
export function ThemeToggle({ className }: { className?: string }) {
  const resolved = useThemeStore((state) => state.resolved);
  const toggle = useThemeStore((state) => state.toggle);
  const label = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const Icon = resolved === 'dark' ? Sun : Moon;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={toggle}
      className={cn(
        'grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
