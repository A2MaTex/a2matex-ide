import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { NodeDefinition } from '@domain/workflow/node-definition';
import { useEditorStore } from '@presentation/stores/editor-store';

import { NodeIcon } from './node-icons';

export const NODE_DRAG_MIME = 'application/x-a2matex-node';

interface NodePaletteProps {
  catalog: readonly NodeDefinition[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  onRetry(): void;
  onAdd(definition: NodeDefinition): void;
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

export function NodePalette({
  catalog,
  status,
  error,
  onRetry,
  onAdd,
  expanded,
  onExpandedChange,
}: NodePaletteProps) {
  const query = useEditorStore((state) => state.paletteQuery);
  const setQuery = useEditorStore((state) => state.setPaletteQuery);
  const categories = useMemo(() => [...new Set(catalog.map((node) => node.category))], [catalog]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const matchingNodes = catalog.filter(
    (node) =>
      !normalizedQuery ||
      node.displayName.toLowerCase().includes(normalizedQuery) ||
      node.description.toLowerCase().includes(normalizedQuery) ||
      node.type.toLowerCase().includes(normalizedQuery),
  );

  const toggleCategory = (category: string) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-panel"
      aria-label="Node palette"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="node-palette-content"
        onClick={() => onExpandedChange(!expanded)}
        className="flex h-9 w-full shrink-0 items-center gap-1.5 px-2.5 text-left uppercase text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-semibold text-xs">Node palette</span>
      </button>

      {expanded ? (
        <div id="node-palette-content" className="min-h-0 flex-1 overflow-y-auto px-2 text-sm">
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 focus-within:border-primary">
            <Search className="size-3.5 text-muted-foreground" />
            <span className="sr-only">Search nodes</span>
            <input
              id="node-palette-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes"
              className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
            />
          </label>

          <div className="mt-2 space-y-1">
            {status === 'loading' ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                Loading node catalog…
              </p>
            ) : null}
            {status === 'error' ? (
              <div className="px-2 py-4 text-center text-[10px]">
                <p className="text-destructive">{error ?? 'Unable to load node catalog.'}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 rounded border border-border px-2 py-1 text-foreground hover:bg-accent"
                >
                  Retry
                </button>
              </div>
            ) : null}
            {categories.map((category) => {
              const nodes = matchingNodes.filter((node) => node.category === category);
              if (normalizedQuery && nodes.length === 0) return null;

              const expanded = normalizedQuery ? true : !collapsedCategories.has(category);
              const contentId = `node-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

              return (
                <div key={category} className="overflow-hidden rounded-md">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => toggleCategory(category)}
                    className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-left font-semibold text-secondary-foreground transition-colors hover:bg-accent/50"
                  >
                    {expanded ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="flex-1 text-xs font-medium">{category}</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
                      {nodes.length}
                    </span>
                  </button>

                  {expanded ? (
                    <div id={contentId} className="space-y-1 pb-1 pl-2">
                      {nodes.map((node) => (
                        <button
                          key={node.type}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'copy';
                            event.dataTransfer.setData(
                              NODE_DRAG_MIME,
                              JSON.stringify({ type: node.type, version: node.version }),
                            );
                          }}
                          onClick={() => onAdd(node)}
                          className="group flex w-full items-center gap-2 rounded-md bg-background px-2 py-2 text-left transition-colors hover:border-primary/45 hover:bg-accent"
                          title={node.description}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-cyan-400 group-hover:bg-primary/10">
                            <NodeIcon icon={node.icon} className="size-3.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {node.displayName}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {node.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {status === 'ready' && matchingNodes.length === 0 ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                No matching nodes
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
