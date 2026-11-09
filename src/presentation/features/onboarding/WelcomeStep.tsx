import { Cloud, FolderLock, Smartphone } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Button } from '@presentation/components/ui/button';

interface WelcomeStepProps {
  version?: string;
  onContinue(): void;
  onExit(): void;
}

const highlights = [
  {
    icon: FolderLock,
    title: 'Local-first projects',
    text: 'Your working copy stays on this device.',
  },
  {
    icon: Smartphone,
    title: 'Android tooling',
    text: 'Inspect devices and build visual workflows.',
  },
  { icon: Cloud, title: 'Optional cloud sync', text: 'You decide when a local draft is synced.' },
];

export function WelcomeStep({ version, onContinue, onExit }: WelcomeStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="px-6 py-8 sm:px-10 sm:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
        Welcome{version ? ` · v${version}` : ''}
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 text-3xl font-bold outline-none sm:text-4xl"
      >
        Build Android workflows with confidence.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
        A short setup will review policies and prepare your local workspace. You can change optional
        preferences later in Settings.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {highlights.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-xl border border-border bg-background/55 p-4">
            <Icon className="size-5 text-cyan-400" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
          </article>
        ))}
      </div>

      <footer className="mt-9 flex items-center justify-between gap-3 border-t border-border pt-5 font-medium">
        <Button type="button" variant="ghost" onClick={onExit}>
          Exit
        </Button>
        <Button type="button" onClick={onContinue}>
          Get started
        </Button>
      </footer>
    </div>
  );
}
