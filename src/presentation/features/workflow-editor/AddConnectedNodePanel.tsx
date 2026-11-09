import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  connectionInputsFor,
  type NodeDefinition,
  type PortDefinition,
} from '@domain/workflow/node-definition';
import { portsAreCompatible } from '@domain/workflow/workflow-commands';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';

export interface ConnectedNodeChoice {
  definition: NodeDefinition;
  input: PortDefinition;
}

interface AddConnectedNodePanelProps {
  sourcePort: PortDefinition;
  catalog: readonly NodeDefinition[];
  position: { x: number; y: number };
  onChoose(choice: ConnectedNodeChoice): void;
  onClose(): void;
}

export function AddConnectedNodePanel({
  sourcePort,
  catalog,
  position,
  onChoose,
  onClose,
}: AddConnectedNodePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const choices = useMemo(
    () =>
      catalog
        .filter((definition) => !definition.deprecation)
        .flatMap((definition) =>
          connectionInputsFor(definition)
            .filter((input) => portsAreCompatible(sourcePort, input))
            .map((input) => ({ definition, input })),
        )
        .sort((left, right) =>
          left.definition.displayName.localeCompare(right.definition.displayName),
        ),
    [catalog, sourcePort],
  );
  const filteredChoices = choices.filter((choice) =>
    [choice.definition.displayName, choice.definition.category, choice.input.label].some((value) =>
      value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ),
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as globalThis.Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add connected node"
      className="absolute z-40 w-72 overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <strong className="flex-1 text-xs">Add connected node</strong>
        <button type="button" onClick={onClose} aria-label="Close connected node suggestions">
          <X className="size-3.5" />
        </button>
      </div>
      <label className="m-2 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 focus-within:border-primary">
        <Search className="size-3.5 text-muted-foreground" />
        <span className="sr-only">Search compatible nodes</span>
        <input
          autoFocus
          value={query}
          placeholder="Search compatible nodes"
          className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="max-h-72 space-y-1 overflow-y-auto p-2 pt-0">
        {filteredChoices.map((choice) => (
          <button
            key={`${choice.definition.type}:${choice.definition.version}:${choice.input.name}`}
            type="button"
            onClick={() => onChoose(choice)}
            className="group flex w-full items-center gap-2 rounded-md bg-background px-2 py-2 text-left hover:bg-accent"
            title={choice.definition.description}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded bg-secondary text-cyan-400">
              <NodeIcon icon={choice.definition.icon} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {choice.definition.displayName}
              </span>
              {connectionInputsFor(choice.definition).filter((input) =>
                portsAreCompatible(sourcePort, input),
              ).length > 1 ? (
                <span className="block truncate text-[9px] text-muted-foreground">
                  Connect to {choice.input.label}
                </span>
              ) : null}
            </span>
          </button>
        ))}
        {filteredChoices.length === 0 ? (
          <p className="p-3 text-center text-[10px] text-muted-foreground">
            No compatible nodes are available.
          </p>
        ) : null}
      </div>
    </div>
  );
}
