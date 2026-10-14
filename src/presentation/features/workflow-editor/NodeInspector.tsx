import { Copy, Settings2, Trash2 } from 'lucide-react';

import type { WorkflowNode } from '@domain/project/project';
import { findNodeDefinition } from '@domain/workflow/builtin-node-catalog';
import type { PropertyDefinition } from '@domain/workflow/node-definition';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';

import { NodeIcon } from './node-icons';

interface NodeInspectorProps {
  node: WorkflowNode | null;
  issues: WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
  onDuplicate(): void;
  onDelete(): void;
}

function normalizeInput(value: string, property: PropertyDefinition): JsonValue {
  if (property.type === 'integer' || property.type === 'number') {
    if (!value.trim()) return '';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  return value;
}

export function NodeInspector({
  node,
  issues,
  execute,
  onDuplicate,
  onDelete,
}: NodeInspectorProps) {
  if (!node) {
    return (
      <section className="h-full bg-panel" aria-label="Node inspector">
        <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Settings2 className="size-3.5" /> Inspector
        </div>
        <div className="grid h-48 place-items-center p-6 text-center">
          <div>
            <Settings2 className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-xs font-medium">Select a node</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Node properties and validation details appear here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const definition = findNodeDefinition(node.type, node.nodeVersion);
  if (!definition) {
    return (
      <section className="h-full bg-panel p-4" aria-label="Node inspector">
        <p className="text-xs text-destructive">Node definition is unavailable.</p>
      </section>
    );
  }
  const commit = (name: string, value: JsonValue) =>
    execute({
      type: 'node.updateParams',
      payload: { nodeId: node.id, changes: { [name]: value } },
    });

  return (
    <section className="h-full overflow-y-auto bg-panel" aria-label="Node inspector">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Settings2 className="size-3.5" /> Inspector
      </div>
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <NodeIcon icon={definition.icon} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{definition.displayName}</h2>
            <p className="truncate font-mono text-[9px] text-muted-foreground">
              {definition.type}@{definition.version}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{definition.description}</p>
        <div className="mt-3 flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            <Copy /> Duplicate
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
      <div className="space-y-5 p-4">
        {Object.entries(definition.properties.properties)
          .sort(([, left], [, right]) => (left.ui?.order ?? 0) - (right.ui?.order ?? 0))
          .map(([name, property]) => {
            const value = node.params[name] ?? property.default ?? '';
            const fieldIssues = issues.filter(
              (entry) => entry.nodeId === node.id && entry.propertyPath === 'params.' + name,
            );
            const inputClass =
              'mt-2 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary ' +
              (fieldIssues.length > 0 ? 'border-destructive' : 'border-border');
            return (
              <div key={name}>
                <label htmlFor={'property-' + name} className="text-[11px] font-medium">
                  {property.title}
                </label>
                {property.description ? (
                  <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
                    {property.description}
                  </p>
                ) : null}
                {property.enum ? (
                  <select
                    id={'property-' + name}
                    value={String(value)}
                    onChange={(event) => {
                      const selected =
                        property.enum?.find((entry) => String(entry) === event.target.value) ??
                        event.target.value;
                      commit(name, selected);
                    }}
                    className={inputClass + ' h-9'}
                  >
                    {property.enum.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {String(option)}
                      </option>
                    ))}
                  </select>
                ) : property.type === 'boolean' ? (
                  <label className="mt-2 flex items-center gap-2 text-[10px]">
                    <input
                      id={'property-' + name}
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) => commit(name, event.target.checked)}
                    />
                    Enabled
                  </label>
                ) : property.ui?.control === 'textarea' ? (
                  <textarea
                    key={node.id + name + String(value)}
                    id={'property-' + name}
                    defaultValue={String(value)}
                    placeholder={property.ui?.placeholder}
                    onBlur={(event) => {
                      const nextValue = event.target.value;
                      if (!Object.is(value, nextValue)) commit(name, nextValue);
                    }}
                    className={inputClass + ' min-h-20 py-2'}
                  />
                ) : (
                  <input
                    key={node.id + name + String(value)}
                    id={'property-' + name}
                    type={
                      property.type === 'integer' || property.type === 'number' ? 'number' : 'text'
                    }
                    defaultValue={String(value)}
                    min={property.minimum}
                    max={property.maximum}
                    placeholder={property.ui?.placeholder}
                    onBlur={(event) => {
                      const nextValue = normalizeInput(event.target.value, property);
                      if (!Object.is(value, nextValue)) commit(name, nextValue);
                    }}
                    className={inputClass + ' h-9'}
                  />
                )}
                {fieldIssues.map((entry) => (
                  <p key={entry.id} className="mt-1 text-[9px] text-destructive">
                    {entry.message}
                  </p>
                ))}
              </div>
            );
          })}
        {Object.keys(definition.properties.properties).length === 0 ? (
          <p className="text-[10px] leading-4 text-muted-foreground">
            This node has no configurable properties.
          </p>
        ) : null}
      </div>
    </section>
  );
}
