import { Copy, HelpCircle, Save, Settings2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { WorkflowNode } from '@domain/project/project';
import {
  configurationCommitPayload,
  createNodeConfigurationDraft,
  selectDraftTargetMode,
  setDraftBindingValue,
  setDraftConfigValue,
  validateNodeConfigurationDraft,
  type NodeConfigurationDraft,
} from '@domain/workflow/node-configuration-draft';
import type { NodeDefinition } from '@domain/workflow/node-definition';
import { isLiteralBinding } from '@domain/workflow/workflow-binding';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';
import { LegacyPropertyField } from '@presentation/features/workflow-editor/LegacyPropertyField';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import { SchemaValueField } from '@presentation/features/workflow-editor/SchemaValueField';
import { useEditorStore } from '@presentation/stores/editor-store';

interface NodeConfigurationInspectorProps {
  catalog: readonly NodeDefinition[];
  node: WorkflowNode | null;
  revision: number;
  issues: readonly WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
  onDirtyChange(nodeId: string | null): void;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
}

function InspectorHeader({ onClose }: { onClose(): void }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      <Settings2 className="size-3.5" />
      <span className="flex-1">Node configuration</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close node configuration"
        className="grid size-6 place-items-center rounded hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ConfiguredInspector(props: {
  definition: NodeDefinition;
  node: WorkflowNode;
  revision: number;
  issues: readonly WorkflowIssue[];
  execute(command: WorkflowCommand): boolean;
  onDirtyChange(nodeId: string | null): void;
  onDuplicate(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const {
    definition,
    node,
    revision,
    issues: committedIssues,
    execute,
    onDirtyChange,
    onDuplicate,
    onDelete,
    onClose,
  } = props;
  const openHelp = useEditorStore((state) => state.openHelp);
  const committedDraft = useMemo(
    () => createNodeConfigurationDraft(node, revision, definition),
    [definition, node, revision],
  );
  const [pendingDraft, setDraft] = useState(committedDraft);
  const [dirty, setDirty] = useState(false);
  const draft = dirty ? pendingDraft : committedDraft;
  const draftIssues = useMemo(
    () => validateNodeConfigurationDraft(draft, definition),
    [definition, draft],
  );
  const stale = dirty && revision !== draft.baseRevision;

  useEffect(() => {
    onDirtyChange(dirty ? node.id : null);
    return () => onDirtyChange(null);
  }, [dirty, node.id, onDirtyChange]);

  const update = (next: NodeConfigurationDraft) => {
    setDraft(next);
    setDirty(true);
  };
  const updateValue = (storage: 'binding' | 'config', name: string, value: JsonValue | undefined) =>
    update(
      storage === 'config'
        ? setDraftConfigValue(draft, name, value)
        : setDraftBindingValue(draft, name, value),
    );
  const cancel = () => {
    setDraft(committedDraft);
    setDirty(false);
    onDirtyChange(null);
    onClose();
  };
  const save = () => {
    if (!dirty || stale || draftIssues.length > 0) return;
    const applied = execute({
      type: 'node.commitConfiguration',
      payload: configurationCommitPayload(draft, definition),
    });
    if (applied) setDirty(false);
  };

  const schemaIssues = (storage: 'binding' | 'config', field: string) =>
    draftIssues
      .filter((entry) => entry.storage === storage && entry.field === field)
      .map((entry) => entry.message);

  return (
    <section className="flex h-full flex-col bg-panel" aria-label="Node configuration">
      <InspectorHeader onClose={onClose} />
      <div className="overflow-y-auto">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-cyan-400">
              <NodeIcon icon={definition.icon} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">
                {node.name?.trim() || definition.displayName}
              </h2>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {definition.type}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-4 text-muted-foreground">{definition.description}</p>
          <div className="mt-3 flex gap-1 text-sm">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openHelp({ type: definition.type, version: definition.version })}
            >
              <HelpCircle /> Help
            </Button>
            <Button size="sm" variant="ghost" onClick={onDuplicate}>
              <Copy /> Duplicate
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
        </div>
        <div className="space-y-5 p-4">
          {definition.configSchema
            ? Object.entries(definition.configSchema.properties).map(([name, schema]) => (
                <SchemaValueField
                  key={`config-${name}`}
                  id={`property-${name}`}
                  name={name}
                  schema={schema}
                  value={draft.config[name] ?? schema.default}
                  errors={schemaIssues('config', name)}
                  onChange={(value) =>
                    name === 'targetMode' && typeof value === 'string' && definition.targeting
                      ? update(selectDraftTargetMode(draft, definition, value))
                      : update(setDraftConfigValue(draft, name, value))
                  }
                />
              ))
            : Object.entries(definition.properties.properties).map(([name, property]) => (
                <LegacyPropertyField
                  key={name}
                  draft={draft}
                  name={name}
                  property={property}
                  onChange={(value) => updateValue(property.storage, name, value)}
                />
              ))}
          {definition.configSchema
            ? Object.entries(draft.inputSchema.properties).map(([name, schema]) => {
                const binding = draft.bindings[name];
                return (
                  <SchemaValueField
                    key={`binding-${name}`}
                    id={`property-${name}`}
                    name={name}
                    schema={schema}
                    value={isLiteralBinding(binding) ? binding.value : schema.default}
                    errors={schemaIssues('binding', name)}
                    onChange={(value) => update(setDraftBindingValue(draft, name, value))}
                  />
                );
              })
            : null}
          {stale ? (
            <p className="text-[10px] text-destructive">
              This node changed while the form was open. Cancel and reopen it before saving.
            </p>
          ) : null}
          {!dirty && committedIssues.length > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              {committedIssues.length} committed validation issue(s).
            </p>
          ) : null}
          {definition.configSchema &&
          Object.keys(definition.configSchema.properties).length === 0 &&
          Object.keys(draft.inputSchema.properties).length === 0 ? (
            <p className="text-[10px] leading-4 text-muted-foreground">
              This node has no configurable properties.
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-auto flex justify-end gap-2 border-t border-border p-3">
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={cancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!dirty || stale || draftIssues.length > 0} onClick={save}>
          <Save /> Save
        </Button>
      </div>
    </section>
  );
}

export function NodeConfigurationInspector({
  catalog,
  node,
  revision,
  issues,
  execute,
  onDirtyChange,
  onDuplicate,
  onDelete,
  onClose,
}: NodeConfigurationInspectorProps) {
  const definition = node ? catalog.find((candidate) => candidate.type === node.type) : undefined;
  if (!node || !definition) {
    return (
      <section className="h-full bg-panel" aria-label="Node configuration">
        <InspectorHeader onClose={onClose} />
        <p className="p-4 text-xs text-muted-foreground">
          {node ? 'Node definition is unavailable.' : 'Select a node to configure.'}
        </p>
      </section>
    );
  }
  return (
    <ConfiguredInspector
      key={node.id}
      definition={definition}
      node={node}
      revision={revision}
      issues={issues}
      execute={execute}
      onDirtyChange={onDirtyChange}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
}
