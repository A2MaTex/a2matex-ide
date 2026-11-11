import { HelpCircle, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import {
  connectionInputsFor,
  connectionOutputsFor,
  type NodeDefinition,
  type PropertyDefinition,
} from '@domain/workflow/node-definition';
import { Button } from '@presentation/components/ui/button';

interface NodeHelpDialogProps {
  target: { type: string; version: number } | null;
  definition: NodeDefinition | null;
  onClose(): void;
}

function propertyDetails(property: PropertyDefinition, required: boolean) {
  const details = [property.type, required ? 'required' : 'optional'];
  if (property.default !== undefined) details.push('default: ' + JSON.stringify(property.default));
  if (property.minimum !== undefined) details.push('min: ' + property.minimum);
  if (property.maximum !== undefined) details.push('max: ' + property.maximum);
  if (property.pattern) details.push('pattern: ' + property.pattern);
  return details.join(' · ');
}

export function NodeHelpDialog({ target, definition, onClose }: NodeHelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!target) return;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, target]);

  if (!target) return null;
  const required = new Set(definition?.properties.required ?? []);
  const properties = Object.entries(definition?.properties.properties ?? {});
  const connectionPorts = definition
    ? [...connectionInputsFor(definition), ...connectionOutputsFor(definition)]
    : [];
  const inputVariables = Object.entries(definition?.inputVariables?.properties ?? {});
  const outputVariables = Object.entries(definition?.outputVariables?.properties ?? {});

  return (
    <div className="fixed inset-0 z-60 grid place-items-center bg-black/65 p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-help-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <HelpCircle className="size-5 text-cyan-400" />
          <div className="min-w-0 flex-1">
            <h2 id="node-help-title" className="truncate text-base font-semibold">
              {definition?.displayName ?? target.type}
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              {target.type}
              {definition ? ' · ' + definition.category : ''}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close node help"
            className="grid size-8 place-items-center rounded hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </header>

        {definition ? (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 text-xs">
            <p className="leading-5 text-muted-foreground">{definition.description || ''}</p>

            <section>
              <h3 className="mb-2 font-semibold">Connection handles</h3>
              {connectionPorts.length > 0 ? (
                <div className="space-y-2">
                  {connectionPorts.map((port) => (
                    <div
                      key={port.direction + ':' + port.name}
                      className="rounded-md bg-background p-3"
                    >
                      <div className="font-medium">{port.label}</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {port.direction} · {port.kind} · {JSON.stringify(port.valueType)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No ports declared.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Input and output variables</h3>
              {inputVariables.length + outputVariables.length > 0 ? (
                <div className="space-y-2">
                  {[
                    ...inputVariables.map(([key, property]) => ['input', key, property] as const),
                    ...outputVariables.map(([key, property]) => ['output', key, property] as const),
                  ].map(([direction, key, property]) => (
                    <div key={`${direction}:${key}`} className="rounded-md bg-background p-3">
                      <div className="font-medium">{property.title}</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {direction} variable · {key} · {property.type}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No data variables declared.</p>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-semibold">Properties</h3>
              {properties.length > 0 ? (
                <div className="space-y-2">
                  {properties.map(([key, property]) => (
                    <div key={key} className="rounded-md bg-background p-3">
                      <div className="font-medium">{property.title}</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {key} · {propertyDetails(property, required.has(key))}
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {property.description || ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No configurable properties.</p>
              )}
            </section>

            {definition.requiredCapabilities.length > 0 ||
            definition.requiredPermissions.length > 0 ? (
              <section>
                <h3 className="mb-2 font-semibold">Capabilities and permissions</h3>
                <div className="space-y-2">
                  {definition.requiredCapabilities.map((capability) => (
                    <div key={capability.code} className="rounded-md bg-background p-3">
                      <div className="flex justify-between items-center gap-2 font-medium">
                        <span>{capability.name}</span>
                        {capability.isSensitive ? (
                          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] uppercase text-warning">
                            Sensitive
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                        Code: {capability.code}
                      </div>
                      <p className="mt-1 text-xs leading-4 text-muted-foreground">
                        {capability.description}
                      </p>
                    </div>
                  ))}
                  {definition.requiredPermissions.map((permission) => (
                    <div key={permission} className="rounded-md bg-background p-3">
                      <div className="font-medium">Permission</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {permission}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {definition.deprecation ? (
              <section className="rounded-md border border-warning/30 bg-warning/10 p-3">
                <h3 className="font-semibold text-warning">Deprecated</h3>
                <p className="mt-1 text-muted-foreground">{definition.deprecation.message}</p>
                {definition.deprecation.replacement ? (
                  <p className="mt-1 font-mono text-[10px]">
                    Replacement: {definition.deprecation.replacement.type}@
                    {definition.deprecation.replacement.version}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 p-5 text-sm text-muted-foreground">
            The exact node definition is not present in the current catalog.
          </div>
        )}
        <footer className="flex justify-end border-t border-border px-5 py-3">
          <Button onClick={onClose}>Close</Button>
        </footer>
      </section>
    </div>
  );
}
