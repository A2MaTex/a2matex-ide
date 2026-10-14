import { Search } from 'lucide-react';

import { BUILTIN_NODE_CATALOG } from '@domain/workflow/builtin-node-catalog';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { useEditorStore } from '@presentation/stores/editor-store';

import { NodeIcon } from './node-icons';

export const NODE_DRAG_MIME = 'application/x-a2matex-node';

interface NodePaletteProps {
  onAdd(definition: NodeDefinition): void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  const query = useEditorStore((state) => state.paletteQuery);
  const category = useEditorStore((state) => state.paletteCategory);
  const setQuery = useEditorStore((state) => state.setPaletteQuery);
  const setCategory = useEditorStore((state) => state.setPaletteCategory);
  const categories = ['All', ...new Set(BUILTIN_NODE_CATALOG.map((node) => node.category))];
  const normalizedQuery = query.trim().toLowerCase();
  const nodes = BUILTIN_NODE_CATALOG.filter(
    (node) =>
      (category === 'All' || node.category === category) &&
      (!normalizedQuery ||
        node.displayName.toLowerCase().includes(normalizedQuery) ||
        node.type.toLowerCase().includes(normalizedQuery)),
  );

  return (
    <section className="border-t border-border" aria-label="Node palette">
      <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Node palette
      </div>
      <div className="p-2">
        <label className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5">
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
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={
                'shrink-0 rounded px-2 py-1 text-[9px] ' +
                (category === item
                  ? 'bg-primary/15 text-primary'
                  : 'bg-secondary text-muted-foreground hover:text-foreground')
              }
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-2 space-y-1">
          {nodes.map((node) => {
            return (
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
                className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left hover:border-border hover:bg-accent"
                title={node.description}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-primary group-hover:bg-primary/10">
                  <NodeIcon icon={node.icon} className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium">{node.displayName}</span>
                  <span className="block truncate font-mono text-[9px] text-muted-foreground">
                    {node.type}
                  </span>
                </span>
              </button>
            );
          })}
          {nodes.length === 0 ? (
            <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
              No matching nodes
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
