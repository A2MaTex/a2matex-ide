import { Database, FolderOpen } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { WorkspaceChoice } from '@application/onboarding/onboarding';
import { Button } from '@presentation/components/ui/button';

interface WorkspaceStepProps {
  useDefault: boolean;
  workspace: WorkspaceChoice | null;
  busy: boolean;
  error: string | null;
  onUseDefault(): void;
  onChoose(): void;
  onBack(): void;
  onContinue(): void;
  onExit(): void;
}

export function WorkspaceStep(props: WorkspaceStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <div className="px-6 py-7 sm:px-10 sm:py-9">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-cyan-400">
          <Database className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            Choose an export location
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Projects use private local storage. This folder is only the default destination for
            exported projects.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={props.useDefault}
          onClick={props.onUseDefault}
          className={`rounded-xl border p-4 text-left transition-colors ${props.useDefault ? 'border-primary bg-primary/10' : 'border-border bg-background/55 hover:bg-accent'}`}
        >
          <strong className="text-sm">Use default location</strong>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Recommended. Studio asks where to save when you export.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={!props.useDefault}
          onClick={props.onChoose}
          disabled={props.busy}
          className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-50 ${!props.useDefault ? 'border-primary bg-primary/10' : 'border-border bg-background/55 hover:bg-accent'}`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FolderOpen className="size-4" aria-hidden="true" />
            {props.busy ? 'Opening picker…' : 'Choose folder'}
          </span>
          <span className="mt-1 block truncate text-xs leading-5 text-muted-foreground">
            {props.workspace?.label ?? 'No custom folder selected'}
          </span>
        </button>
      </div>

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
          <Button type="button" variant="outline" onClick={props.onBack}>
            Back
          </Button>
          <Button type="button" disabled={props.busy} onClick={props.onContinue}>
            Continue
          </Button>
        </div>
      </footer>
    </div>
  );
}
