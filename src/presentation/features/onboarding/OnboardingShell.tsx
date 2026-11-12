import type { ReactNode } from 'react';

import fullLogoUrl from '@/assets/full-logo.webp';

interface OnboardingShellProps {
  children: ReactNode;
  step: 1 | 2 | 3 | 4 | 5;
}

export function OnboardingShell({ children, step }: OnboardingShellProps) {
  return (
    <main className="relative grid min-h-screen overflow-y-auto bg-background px-5 py-8 text-foreground sm:place-items-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgb(24_216_248/0.16),transparent_32rem),radial-gradient(circle_at_90%_90%,rgb(18_59_216/0.12),transparent_36rem)]" />
      <section className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border/80 bg-panel/95 shadow-[0_30px_120px_rgb(0_0_0/0.58)]">
        <header className="flex items-center justify-between border-b border-border px-6 py-2">
          <div className="flex items-center">
            <img
              src={fullLogoUrl}
              alt=""
              className="w-36 rounded-md"
              aria-hidden="true"
            />
            <div className="truncate text-2xl mt-1.5 font-medium tracking-tight text-white/60">
              Studio
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Step {step} of 5</span>
        </header>
        <div className="grid grid-cols-5 gap-1 px-6 pt-5" aria-label={`Step ${step} of 5`}>
          {[1, 2, 3, 4, 5].map((item) => (
            <span
              key={item}
              className={`h-1 rounded-full ${item <= step ? 'bg-primary' : 'bg-secondary'}`}
            />
          ))}
        </div>
        {children}
      </section>
    </main>
  );
}
