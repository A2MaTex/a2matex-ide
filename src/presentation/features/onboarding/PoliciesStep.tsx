import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type {
  PolicyDocument,
  PolicyId,
  PolicyManifest,
} from '@application/onboarding/policy-manifest';
import { Button } from '@presentation/components/ui/button';

export interface PolicyChoices {
  accepted: Record<PolicyId, boolean>;
  analyticsOptIn: boolean;
}

interface PoliciesStepProps {
  manifest: PolicyManifest;
  value: PolicyChoices;
  loading?: boolean;
  onChange(value: PolicyChoices): void;
  onOpenDocument(policy: PolicyDocument): void;
  onRetry?(): void;
  onBack(): void;
  onContinue(): void;
  onExit(): void;
}

export function PoliciesStep({
  manifest,
  value,
  loading = false,
  onChange,
  onOpenDocument,
  onRetry,
  onBack,
  onContinue,
  onExit,
}: PoliciesStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const canContinue =
    manifest.configured && manifest.documents.every((policy) => value.accepted[policy.id]);

  return (
    <div className="px-6 py-7 sm:px-10 sm:py-9">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-cyan-400">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            Review policies
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Required policies and optional analytics are kept separate.
          </p>
        </div>
      </div>

      {!manifest.configured ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning"
        >
          <strong>Policies unavailable.</strong> {manifest.error}
          {onRetry ? (
            <Button type="button" size="sm" variant="outline" className="ml-3" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {manifest.documents.map((policy) => (
          <div key={policy.id} className="rounded-xl border border-border bg-background/55 p-4">
            <div className="flex items-start justify-between gap-4 text-sm">
              <div>
                <h2 className="text-sm font-semibold">{policy.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {policy.version || 'not configured'} · Required
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!manifest.configured}
                onClick={() => onOpenDocument(policy)}
              >
                View <ExternalLink aria-hidden="true" />
              </Button>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={value.accepted[policy.id]}
                disabled={!manifest.configured}
                onChange={(event) =>
                  onChange({
                    ...value,
                    accepted: { ...value.accepted, [policy.id]: event.target.checked },
                  })
                }
                className="mt-0.5 size-4 accent-cyan-400"
              />
              <span>I have read and accept the {policy.title}.</span>
            </label>
          </div>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/45 p-4 text-sm">
        <input
          type="checkbox"
          checked={value.analyticsOptIn}
          onChange={(event) => onChange({ ...value, analyticsOptIn: event.target.checked })}
          className="mt-0.5 size-4 accent-cyan-400"
        />
        <span>
          <strong className="block font-medium">Share optional usage analytics</strong>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
            Help improve Studio. This is off by default and can be changed later.
          </span>
        </span>
      </label>

      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button type="button" variant="ghost" onClick={onExit}>
          Exit
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" disabled={!canContinue || loading} onClick={onContinue}>
            {loading ? 'Loading…' : 'Continue'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
