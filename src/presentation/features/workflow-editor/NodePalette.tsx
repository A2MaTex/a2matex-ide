import {
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Search,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { NodeDefinition } from '@domain/workflow/node-definition';
import { useEditorStore } from '@presentation/stores/editor-store';

import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';

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

interface PaletteTooltipState {
  node: NodeDefinition;
  left: number;
  top: number;
  maxWidth: number;
}

function matchesQuery(node: NodeDefinition, query: string) {
  if (!query) return true;
  return [
    node.displayName,
    node.description,
    node.type,
    node.category,
    ...Object.keys(node.properties.properties),
    ...Object.values(node.properties.properties).map((property) => property.title),
  ].some((value) => value.toLocaleLowerCase().includes(query));
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
  const openHelp = useEditorStore((state) => state.openHelp);
  const categories = useMemo(
    () => [...new Set(catalog.map((node) => node.category))].sort((a, b) => a.localeCompare(b)),
    [catalog],
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<PaletteTooltipState | null>(null);
  const tooltipTimer = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingNodes = useMemo(
    () => catalog.filter((node) => matchesQuery(node, normalizedQuery)),
    [catalog, normalizedQuery],
  );

  const toggleCategory = (category: string) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const hideTooltip = () => {
    if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    tooltipTimer.current = null;
    setTooltip(null);
  };

  const showTooltip = (target: HTMLElement, node: NodeDefinition) => {
    if (tooltipTimer.current !== null) window.clearTimeout(tooltipTimer.current);
    const bounds = target.getBoundingClientRect();
    tooltipTimer.current = window.setTimeout(() => {
      setTooltip({
        node,
        left: bounds.right + 8,
        top: Math.min(Math.max(8, bounds.top), Math.max(8, window.innerHeight - 104)),
        maxWidth: Math.max(160, window.innerWidth - bounds.right - 16),
      });
      tooltipTimer.current = null;
    }, 150);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-panel"
      aria-label="Node palette"
    >
      <div className="flex h-9 shrink-0 items-center">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="node-palette-content"
          onClick={() => onExpandedChange(!expanded)}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left uppercase text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span className="font-semibold text-xs">Node palette</span>
        </button>
        {expanded ? (
          <div className="flex pr-1">
            <button
              type="button"
              onClick={() => setCollapsedCategories(new Set(categories))}
              aria-label="Collapse all node categories"
              title="Collapse all"
              className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronsDownUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsedCategories(new Set())}
              aria-label="Expand all node categories"
              title="Expand all"
              className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronsUpDown className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div
          id="node-palette-content"
          className="min-h-0 flex-1 overflow-y-auto px-2 text-sm"
          onScroll={hideTooltip}
        >
          <div className="sticky top-0 z-20 bg-panel pb-2 pt-1 text-xs">
            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 focus-within:border-primary">
              <Search className="size-3.5 text-muted-foreground" />
              <span className="sr-only">Search nodes</span>
              <input
                id="node-palette-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  if (query) setQuery('');
                  else {
                    event.currentTarget.blur();
                    document.querySelector<HTMLElement>('.react-flow')?.focus();
                  }
                }}
                placeholder="Search nodes"
                className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

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
              const nodes = matchingNodes
                .filter((node) => node.category === category)
                .sort((left, right) => left.displayName.localeCompare(right.displayName));
              if (nodes.length === 0) return null;

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
                        <div
                          key={node.type + ':' + node.version}
                          className="group relative flex rounded-md bg-background hover:bg-accent focus-within:bg-accent"
                          onPointerEnter={(event) => showTooltip(event.currentTarget, node)}
                          onPointerLeave={hideTooltip}
                          onFocus={(event) => showTooltip(event.currentTarget, node)}
                          onBlur={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget)) return;
                            hideTooltip();
                          }}
                        >
                          <button
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
                            className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                            aria-describedby={`node-tip-${node.type}-${node.version}`}
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-cyan-400 group-hover:bg-primary/10">
                              <NodeIcon icon={node.icon} className="size-3.5" />
                            </span>
                            <span className="truncate text-xs font-medium">{node.displayName}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openHelp({ type: node.type, version: node.version })}
                            aria-label={'Help for ' + node.displayName}
                            className="grid w-8 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
                          >
                            <HelpCircle className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {status === 'ready' && catalog.length === 0 ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                The catalog is empty
              </p>
            ) : null}
            {status === 'ready' && catalog.length > 0 && matchingNodes.length === 0 ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                No matching nodes
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tooltip
        ? createPortal(
            <div
              id={`node-tip-${tooltip.node.type}-${tooltip.node.version}`}
              role="tooltip"
              className="pointer-events-none fixed ms-6 z-100 w-56 rounded-md border border-border bg-black p-2 text-xs leading-4 shadow-xl space-y-1"
              style={{ left: tooltip.left, top: tooltip.top, maxWidth: tooltip.maxWidth }}
            >
              <strong className="block text-foreground">{tooltip.node.displayName}</strong>
              <span className="text-muted-foreground">{tooltip.node.description || ''}</span>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
