import { Braces } from 'lucide-react';

import {
  androidSelectorToJsonValue,
  isAndroidSelectorV1,
  type AndroidSelectorV1,
} from '@domain/android-inspector/android-selector';
import type { JsonValue } from '@shared/types/json-value';

interface AndroidSelectorControlProps {
  id: string;
  value: JsonValue;
  onCommit(value: JsonValue): void;
}

function sameSelector(left: AndroidSelectorV1 | null, right: AndroidSelectorV1) {
  return left ? JSON.stringify(left) === JSON.stringify(right) : false;
}

export function AndroidSelectorControl({ id, value, onCommit }: AndroidSelectorControlProps) {
  const selector = isAndroidSelectorV1(value) ? value : null;
  const inputClass =
    'mt-1 h-8 w-full rounded-md border border-border bg-background px-2.5 font-mono text-[10px] outline-none focus:border-primary';

  const commitResourceId = (resourceId: string) => {
    const normalized = resourceId.trim();
    if (!normalized) return;
    const next: AndroidSelectorV1 = {
      schemaVersion: 1,
      strategy: 'resourceId',
      value: normalized,
      ...(selector?.packageName ? { packageName: selector.packageName } : {}),
    };
    if (!sameSelector(selector, next)) onCommit(androidSelectorToJsonValue(next));
  };

  const commitPackageName = (packageName: string) => {
    if (!selector) return;
    const normalized = packageName.trim();
    const next: AndroidSelectorV1 = {
      schemaVersion: 1,
      strategy: 'resourceId',
      value: selector.value,
      ...(normalized ? { packageName: normalized } : {}),
    };
    if (!sameSelector(selector, next)) onCommit(androidSelectorToJsonValue(next));
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-editor-canvas/50 p-2.5">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Braces className="size-3" />
        <span>Android selector v1 · resourceId</span>
      </div>
      <label className="block text-[10px] text-muted-foreground" htmlFor={id}>
        Resource ID
        <input
          key={`${id}:resource:${selector?.value ?? ''}`}
          id={id}
          defaultValue={selector?.value ?? ''}
          placeholder="com.example:id/submit"
          onBlur={(event) => commitResourceId(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-[10px] text-muted-foreground" htmlFor={`${id}-package`}>
        Package (optional)
        <input
          key={`${id}:package:${selector?.packageName ?? ''}`}
          id={`${id}-package`}
          defaultValue={selector?.packageName ?? ''}
          placeholder="com.example"
          disabled={!selector}
          onBlur={(event) => commitPackageName(event.target.value)}
          className={inputClass}
        />
      </label>
      {!selector && value !== '' ? (
        <p className="text-[10px] leading-4 text-destructive">
          Stored selector is invalid. Enter a Resource ID to replace it.
        </p>
      ) : null}
    </div>
  );
}
