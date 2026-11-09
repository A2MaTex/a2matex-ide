import {
  ChevronDown,
  ChevronRight,
  Circle,
  FolderTree,
  Plus,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProjectDocument } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';

interface WorkflowExplorerProps {
  document: ProjectDocument;
  catalog: readonly NodeDefinition[];
  activeWorkflowPath: string;
  onOpenWorkflow(path: string): void;
  onCreate(kind: 'flow' | 'subflow'): void;
}

function flowName(path: string) {
  return path.split('/').at(-1)?.replace('.workflow.json', '') ?? path;
}

export function WorkflowExplorer({
  document,
  catalog,
  activeWorkflowPath,
  onOpenWorkflow,
  onCreate,
}: WorkflowExplorerProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({ flows: true, subflows: true, global: true });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const kinds = document.manifest.workflowKinds ?? {};
  const visiblePaths = useMemo(
    () =>
      document.manifest.workflows.filter((path) => {
        if (!normalizedQuery) return true;
        const workflow = document.workflows[path];
        return (
          flowName(path).toLocaleLowerCase().includes(normalizedQuery) ||
          workflow?.nodes.some((node) => {
            const definition = catalog.find((candidate) => candidate.type === node.type);
            return (node.name || definition?.displayName || node.type)
              .toLocaleLowerCase()
              .includes(normalizedQuery);
          })
        );
      }),
    [catalog, document.manifest.workflows, document.workflows, normalizedQuery],
  );
  const flows = visiblePaths.filter((path) => kinds[path] !== 'subflow');
  const subflows = visiblePaths.filter((path) => kinds[path] === 'subflow');
  const globalNodes = Object.values(document.workflows)
    .flatMap((workflow) => workflow.nodes)
    .filter((node) => node.type.startsWith('global.') || node.type.startsWith('config.'))
    .filter(
      (node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index,
    );

  const renderWorkflow = (path: string) => {
    const workflow = document.workflows[path];
    if (!workflow) return null;
    return (
      <div key={path} className="ml-3">
        <button
          type="button"
          onClick={() => onOpenWorkflow(path)}
          className={
            'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left ' +
            (activeWorkflowPath === path ? 'bg-accent text-foreground' : 'hover:bg-accent/50')
          }
        >
          <FolderTree className="size-3.5 text-cyan-400" />
          <span className="min-w-0 flex-1 truncate">{flowName(path)}</span>
          <Circle className="size-2.5 fill-cyan-400 text-cyan-400" />
        </button>
        <div className="ml-4 border-l border-border/70 pl-1.5">
          {workflow.nodes.map((node) => {
            const definition = catalog.find((candidate) => candidate.type === node.type);
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onOpenWorkflow(path)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                title={node.type}
              >
                <NodeIcon icon={definition?.icon ?? 'workflow'} className="size-3.5" />
                <span className="truncate">
                  {node.name || definition?.displayName || node.type}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const section = (
    key: keyof typeof expanded,
    label: string,
    paths: string[],
    kind?: 'flow' | 'subflow',
  ) => (
    <section>
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={expanded[key]}
          onClick={() => setExpanded((state) => ({ ...state, [key]: !state[key] }))}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left font-medium hover:bg-accent/50"
        >
          {expanded[key] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <span className="truncate">{label}</span>
        </button>
        {kind ? (
          <button
            type="button"
            onClick={() => onCreate(kind)}
            aria-label={`Create ${kind}`}
            title={`Create ${kind}`}
            className="grid size-6 place-items-center rounded hover:bg-accent"
          >
            <Plus className="size-3" />
          </button>
        ) : null}
      </div>
      {expanded[key] ? (
        paths.length > 0 ? (
          paths.map(renderWorkflow)
        ) : (
          <p className="ml-6 py-1 italic text-muted-foreground">empty</p>
        )
      ) : null}
    </section>
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-[11px]">
      <label className="sticky top-0 z-10 mb-1 flex items-center gap-1.5 border-b border-border bg-panel px-1.5 py-2">
        <Search className="size-3.5 text-muted-foreground" />
        <span className="sr-only">Search flows and used nodes</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search flows"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        />
      </label>
      {section('flows', 'Flows', flows, 'flow')}
      {section('subflows', 'Subflows', subflows, 'subflow')}
      <section>
        <button
          type="button"
          aria-expanded={expanded.global}
          onClick={() => setExpanded((state) => ({ ...state, global: !state.global }))}
          className="flex w-full items-center gap-1 rounded px-1 py-1 text-left font-medium hover:bg-accent/50"
        >
          {expanded.global ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
          Global Configuration Nodes
        </button>
        {expanded.global ? (
          globalNodes.length > 0 ? (
            globalNodes.map((node) => (
              <div key={node.id} className="ml-6 truncate py-1 text-muted-foreground">
                {node.name || node.type}
              </div>
            ))
          ) : (
            <p className="ml-6 py-1 italic text-muted-foreground">empty</p>
          )
        ) : null}
      </section>
    </div>
  );
}
