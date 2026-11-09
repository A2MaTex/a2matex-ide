import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AdbSetupStatus } from '@application/onboarding/onboarding';
import { Button } from '@presentation/components/ui/button';

interface FinishStepProps {
  termsVersion: string;
  privacyVersion: string;
  analytics: boolean;
  workspaceLabel: string;
  adbStatus: AdbSetupStatus;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onFinish(): void;
  onExit(): void;
}

export function FinishStep(props: FinishStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const rows = [
    ['Policies', `Terms ${props.termsVersion} · Privacy ${props.privacyVersion}`],
    ['Usage analytics', props.analytics ? 'Enabled' : 'Disabled'],
    ['Default export', props.workspaceLabel],
    ['ADB setup', props.adbStatus.replaceAll('-', ' ')],
  ];

  return (
    <div className="px-6 py-7 sm:px-10 sm:py-9">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            Ready to finish
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Review your choices. Studio saves them only after you finish setup.
          </p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-border rounded-xl border border-border bg-background/55 px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="break-all text-sm">{value}</dd>
          </div>
        ))}
      </dl>

      {props.error ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 p-3 text-xs">
          {props.error}
        </p>
      ) : null}

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button type="button" variant="ghost" onClick={props.onExit}>
          Exit
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onBack}>
            Back
          </Button>
          <Button type="button" disabled={props.busy} onClick={props.onFinish}>
            {props.busy ? 'Saving…' : props.error ? 'Retry' : 'Finish setup'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
