import { Check, Copy } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import type { InspectorNode, InspectorSnapshot } from '@domain/android-inspector/android-inspector';
import { createAndroidSelectorV1 } from '@domain/android-inspector/android-selector';
import {
  boundsCenter,
  getInspectorCandidates,
  type InspectorPoint,
} from '@domain/android-inspector/geometry';
import { copyText } from '@infrastructure/clipboard/copy-text';
import { Button } from '@presentation/components/ui/button';
import { toast } from '@presentation/components/ui/toast-store';
import { shortClassName } from '@presentation/features/android-inspector/inspector-format';

function formatBounds(node: InspectorNode) {
  const { left, top, right, bottom } = node.bounds;
  return `[${left},${top}][${right},${bottom}]`;
}

function formatCenter(node: InspectorNode) {
  const center = boundsCenter(node.bounds);
  return `[${center.x},${center.y}]`;
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const actionLabel = copied ? `Copied ${label}` : `Copy ${label}`;
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
          toast.success(`${label[0].toUpperCase()}${label.slice(1)} copied`);
        } else {
          toast.error(`Unable to copy ${label}`);
        }
      }}
      aria-label={actionLabel}
      title={actionLabel}
      className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  let action: ReactNode = null;
  if (copy && value) action = <CopyButton label={copy} value={value} />;
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start gap-1 font-mono text-foreground">
        <span className="min-w-0 break-all">{value || '—'}</span>
        {action}
      </dd>
    </div>
  );
}

/**
 * Elements stacked under the clicked point (deepest first) and the details of the chosen one:
 * package, resource ID, class, text, bounds, … with copy buttons and the android-selector-v1 JSON.
 */
export function ElementInspector({
  snapshot,
  point,
  selectedId,
  onSelect,
}: {
  snapshot: InspectorSnapshot;
  point: InspectorPoint | null;
  selectedId: string | null;
  onSelect(node: InspectorNode): void;
}) {
  const candidates = useMemo(
    () => (point ? getInspectorCandidates(snapshot.nodes, point) : []),
    [point, snapshot.nodes],
  );
  const selected = candidates.find((node) => node.nodeId === selectedId) ?? null;
  const selector = selected ? createAndroidSelectorV1(selected) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium">
          <span>Elements at this point</span>
          <span
            aria-label={`${candidates.length} matching elements`}
            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]"
          >
            {candidates.length}
          </span>
        </div>
        {!point ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            Click the screen to list the elements under that point.
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            No inspectable element at ({Math.round(point.x)}, {Math.round(point.y)}).
          </p>
        ) : (
          <div className="max-h-44 space-y-0.5 overflow-y-auto" role="listbox">
            {candidates.map((candidate, index) => (
              <button
                key={candidate.nodeId}
                type="button"
                role="option"
                aria-selected={candidate.nodeId === selectedId}
                onClick={() => onSelect(candidate)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                  candidate.nodeId === selectedId
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                <span className="font-mono text-[10px]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">
                    {shortClassName(candidate.className)}
                    {candidate.text ? ` · “${candidate.text}”` : ''}
                  </span>
                  <span className="block truncate font-mono text-[10px]">
                    {candidate.resourceId ?? 'No resource ID'}
                  </span>
                </span>
                <span className="font-mono text-[10px]">d{candidate.depth}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <div className="space-y-2 border-t border-border pt-3">
          <dl className="space-y-1.5">
            <DetailRow label="Package" value={selected.packageName ?? ''} copy="package" />
            <DetailRow label="Resource ID" value={selected.resourceId ?? ''} copy="resource ID" />
            <DetailRow label="Class" value={selected.className} copy="class" />
            <DetailRow label="Text" value={selected.text ?? ''} copy="text" />
            <DetailRow
              label="Content desc"
              value={selected.contentDescription ?? ''}
              copy="content description"
            />
            <DetailRow label="Bounds" value={formatBounds(selected)} />
            <DetailRow label="[x, y]" value={formatCenter(selected)} copy="center" />
            <DetailRow label="Clickable" value={String(selected.clickable)} />
            <DetailRow label="Enabled" value={String(selected.enabled)} />
            <DetailRow label="Depth" value={String(selected.depth)} />
          </dl>
          <Button
            className="w-full"
            size="sm"
            variant="secondary"
            disabled={!selector}
            onClick={async () => {
              if (!selector) return;
              if (await copyText(JSON.stringify(selector, null, 2))) {
                toast.success('Android selector copied');
              } else {
                toast.error('Unable to copy Android selector');
              }
            }}
          >
            <Copy /> Copy selector
          </Button>
          {!selector ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              This element has no resource ID, so it has no Android selector.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
