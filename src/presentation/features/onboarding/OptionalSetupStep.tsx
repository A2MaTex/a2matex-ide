import { Smartphone } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AdbSetupStatus } from '@application/onboarding/onboarding';
import { Button } from '@presentation/components/ui/button';

const statusText: Record<AdbSetupStatus, string> = {
  'not-checked': 'Not checked yet',
  available: 'ADB is available and a device is ready',
  'no-device': 'ADB is available, but no device was found',
  'permission-issue': 'A device needs authorization or permission',
  'not-found': 'Android Platform Tools (ADB) was not found',
  error: 'ADB could not be checked',
};

interface OptionalSetupStepProps {
  status: AdbSetupStatus;
  busy: boolean;
  onCheck(): void;
  onBack(): void;
  onContinue(): void;
  onExit(): void;
}

export function OptionalSetupStep(props: OptionalSetupStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="px-6 py-7 sm:px-10 sm:py-9">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-cyan-400">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            Optional Android setup
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            ADB is only needed to inspect a connected Android device. You can configure it later.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-background/55 p-5 text-sm">
        <h2 className="text-sm font-semibold">Android Debug Bridge</h2>
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {statusText[props.status]}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={props.busy}
          onClick={props.onCheck}
        >
          {props.busy ? 'Checking…' : props.status === 'not-checked' ? 'Check ADB' : 'Check again'}
        </Button>
      </section>

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button type="button" variant="ghost" onClick={props.onExit}>
          Exit
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={props.onBack}>
            Back
          </Button>
          <Button type="button" onClick={props.onContinue}>
            {props.status === 'not-checked' ? 'Set up later' : 'Continue'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
