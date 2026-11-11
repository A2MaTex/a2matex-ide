import { CircleOff, HelpCircle, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkflowNode } from '@domain/project/project';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { canDisableNode, type WorkflowCommand } from '@domain/workflow/workflow-commands';
import { Button } from '@presentation/components/ui/button';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import { useEditorStore } from '@presentation/stores/editor-store';

interface NodeDetailDialogProps {
  node: WorkflowNode | null;
  definition: NodeDefinition | null;
  execute(command: WorkflowCommand): boolean;
  onHelp(): void;
  onDelete(): void;
  onClose(): void;
}

export function NodeDetailDialog({
  node,
  definition,
  execute,
  onHelp,
  onDelete,
  onClose,
}: NodeDetailDialogProps) {
  const helpTarget = useEditorStore((state) => state.helpTarget);
  const [tab, setTab] = useState<'config' | 'description'>('config');
  const [name, setName] = useState(node?.name ?? '');
  const [labelMode, setLabelMode] = useState<'icon' | 'icon-and-name'>(
    node?.labelMode ?? 'icon-and-name',
  );
  const [description, setDescription] = useState(node?.description ?? '');
  const [disabled, setDisabled] = useState(node?.disabled ?? false);

  useEffect(() => {
    if (!node) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (helpTarget) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [helpTarget, node, onClose]);

  if (!node || !definition) return null;
  const disableAllowed = canDisableNode(definition);

  const done = () => {
    if (
      execute({
        type: 'node.updateMetadata',
        payload: { nodeId: node.id, name, labelMode, description, disabled },
      })
    ) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="node-detail-title"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-cyan-400">
            <NodeIcon icon={definition.icon} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="node-detail-title" className="truncate text-base font-semibold">
              {name.trim() || definition.displayName}
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">{definition.type}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onHelp}>
            <HelpCircle /> Help
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel and close node detail"
            className="grid size-8 place-items-center rounded hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex border-b border-border px-5 text-sm">
          {(['config', 'description'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={
                'px-4 pt-3 pb-2 text-xs font-medium capitalize ' +
                (tab === value
                  ? 'border-b-2 border-primary text-foreground'
                  : 'border-transparent text-muted-foreground')
              }
            >
              {value === 'config' ? 'Config' : 'Description'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'config' ? (
            <div className="space-y-5">
              <div className="text-sm">
                <label htmlFor="node-detail-name" className="text-xs font-medium">
                  Name
                </label>
                <input
                  id="node-detail-name"
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={definition.displayName}
                  className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-xs outline-none focus:border-primary"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">{name.length}/100</p>
              </div>
              <fieldset>
                <legend className="text-xs font-medium">Display</legend>
                <div className="mt-2 flex gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="node-label-mode"
                      checked={labelMode === 'icon'}
                      onChange={() => setLabelMode('icon')}
                    />
                    Icon only
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="node-label-mode"
                      checked={labelMode === 'icon-and-name'}
                      onChange={() => setLabelMode('icon-and-name')}
                    />
                    Icon and name
                  </label>
                </div>
              </fieldset>
              <div className="rounded-md border border-border bg-background p-3 text-xs leading-4 text-muted-foreground">
                <Settings2 className="mr-2 inline size-3.5" />
                Execution parameters remain available in the quick configuration drawer.
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <label htmlFor="node-detail-description" className="text-xs font-medium">
                Markdown description
              </label>
              <textarea
                id="node-detail-description"
                value={description}
                maxLength={20_000}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 min-h-60 w-full resize-y rounded-md border border-border bg-background p-3 font-mono leading-5 outline-none focus:border-primary"
                placeholder="Record this node's purpose, assumptions, or operating instructions."
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {description.length}/20,000
              </p>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm">
          <Button
            variant="ghost"
            onClick={() => setDisabled((value) => !value)}
            disabled={!disableAllowed && !disabled}
            aria-pressed={disabled}
            title={
              disableAllowed
                ? disabled
                  ? 'Node will be enabled after Done'
                  : 'Node will be disabled after Done'
                : 'Only nodes with one control input and one control output can be disabled'
            }
          >
            <CircleOff /> {disabled ? 'Disabled' : 'Enabled'}
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            <Trash2 /> Delete node and connections
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={done}>Done</Button>
        </footer>
      </section>
    </div>
  );
}
