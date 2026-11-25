import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleAlert,
  Copy,
  CopyPlus,
  GitBranch,
  HelpCircle,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type { WorkflowDocument, WorkflowNode } from '@domain/project/project';
import {
  configurationCommitPayload,
  createNodeConfigurationDraft,
  selectDraftTargetMode,
  setDraftBinding,
  setDraftBindingValue,
  setDraftConfigValue,
  validateNodeConfigurationDraft,
  type NodeConfigurationDraft,
} from '@domain/workflow/node-configuration-draft';
import { switchRules, type NodeDefinition } from '@domain/workflow/node-definition';
import { defaultBindingFor } from '@domain/workflow/workflow-binding';
import type { WorkflowCommand } from '@domain/workflow/workflow-commands';
import type { WorkflowIssue } from '@domain/workflow/workflow-validator';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';
import { toast } from '@presentation/components/ui/toast-store';
import { LegacyPropertyField } from '@presentation/features/workflow-editor/LegacyPropertyField';
import { BindingSourceField } from '@presentation/features/workflow-editor/BindingSourceField';
import { NodeIcon } from '@presentation/features/workflow-editor/node-icons';
import { SchemaValueField } from '@presentation/features/workflow-editor/SchemaValueField';
import { useEditorStore } from '@presentation/stores/editor-store';

interface NodeConfigurationInspectorProps {
  catalog: readonly NodeDefinition[];
  workflow: WorkflowDocument;
  workflowInputSchema: JsonValue;
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
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/80 bg-panel/95 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
      <Settings2 className="size-3.5" />
      <span className="flex-1">Configure node</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close node configuration"
        className="grid size-6 place-items-center transition-colors hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function InspectorSection({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: string | number;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-accent/[0.12] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.9)]">
      <div className="flex items-start gap-3 bg-accent/20 px-3.5 py-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {badge !== undefined ? (
          <span className="rounded-full bg-background/60 px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-4 p-3.5">{children}</div>
    </section>
  );
}

function ConfiguredInspector(props: {
  definition: NodeDefinition;
  catalog: readonly NodeDefinition[];
  workflow: WorkflowDocument;
  workflowInputSchema: JsonValue;
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
    catalog,
    workflow,
    workflowInputSchema,
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
  const switchLiteralValue = draft.bindings.value?.value;
  const switchLiteralType =
    typeof switchLiteralValue === 'string'
      ? 'string'
      : typeof switchLiteralValue === 'number'
        ? 'number'
        : typeof switchLiteralValue === 'boolean'
          ? 'boolean'
          : undefined;
  const switchOperators =
    definition.switch?.operators.filter(
      (operator) => !switchLiteralType || operator.supportedTypes.includes(switchLiteralType),
    ) ?? [];

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
  const updateSwitchRules = (
    rules: Array<{ id: string; operator: string }>,
    bindings = draft.bindings,
  ) =>
    update({
      ...setDraftConfigValue(draft, 'rules', rules),
      bindings: structuredClone(bindings),
    });
  const addSwitchRule = () => {
    const switchDefinition = definition.switch;
    const operator = switchOperators[0];
    if (!switchDefinition || !operator) return;
    const id = crypto.randomUUID();
    const rules = [...switchRules(draft.config), { id, operator: operator.value }];
    const bindings = { ...draft.bindings };
    if (operator.operandCount === 1) {
      const kind = Object.keys(switchDefinition.operand.bindingKinds)[0] as
        keyof typeof switchDefinition.operand.bindingKinds | undefined;
      if (kind) bindings[id] = defaultBindingFor(switchDefinition.operand, kind);
    }
    updateSwitchRules(rules, bindings);
  };
  const changeSwitchOperator = (ruleId: string, operatorValue: string) => {
    if (!definition.switch) return;
    const operator = definition.switch.operators.find(({ value }) => value === operatorValue);
    if (!operator) return;
    const rules = switchRules(draft.config).map((rule) =>
      rule.id === ruleId ? { ...rule, operator: operatorValue } : rule,
    );
    const bindings = { ...draft.bindings };
    if (operator.operandCount === 0) delete bindings[ruleId];
    updateSwitchRules(rules, bindings);
  };
  const deleteSwitchRule = (ruleId: string) => {
    const rules = switchRules(draft.config).filter(({ id }) => id !== ruleId);
    const bindings = { ...draft.bindings };
    delete bindings[ruleId];
    updateSwitchRules(rules, bindings);
  };
  const duplicateSwitchRule = (ruleId: string) => {
    const rules = switchRules(draft.config);
    const index = rules.findIndex(({ id }) => id === ruleId);
    if (index < 0) return;
    const id = crypto.randomUUID();
    const next = [...rules];
    next.splice(index + 1, 0, { ...rules[index]!, id });
    const bindings = { ...draft.bindings };
    if (bindings[ruleId]) bindings[id] = structuredClone(bindings[ruleId]);
    updateSwitchRules(next, bindings);
  };
  const moveSwitchRule = (index: number, direction: -1 | 1) => {
    const rules = [...switchRules(draft.config)];
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    [rules[index], rules[target]] = [rules[target]!, rules[index]!];
    updateSwitchRules(rules);
  };
  const cancel = () => {
    setDraft(committedDraft);
    setDirty(false);
    onDirtyChange(null);
  };
  const save = () => {
    if (!dirty || stale || draftIssues.length > 0) return;
    const applied = execute({
      type: 'node.commitConfiguration',
      payload: configurationCommitPayload(draft, definition),
    });
    if (applied) {
      setDirty(false);
      toast.success('Node configuration saved');
    } else {
      toast.error('Unable to save node configuration');
    }
  };

  const schemaIssues = (storage: 'binding' | 'config', field: string) =>
    draftIssues
      .filter((entry) => entry.storage === storage && entry.field === field)
      .map((entry) => entry.message);
  const nodeCommittedIssues = committedIssues.filter((entry) => entry.nodeId === node.id);
  const configFields = definition.configSchema
    ? Object.entries(definition.configSchema.properties).filter(
        ([name]) => !(definition.switch && name === 'rules'),
      )
    : [];
  const bindingFields = Object.entries(draft.bindingInputs);
  const hasErrorPolicy = definition.outputPortKeys?.includes('error') ?? false;

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Node configuration">
      <InspectorHeader onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto bg-background/25">
        <div className="border-b border-border/80 bg-[radial-gradient(circle_at_top_right,var(--primary-glow),transparent_48%)] px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-cyan-400 shadow-[0_10px_28px_-18px_var(--primary-glow)]">
              <NodeIcon icon={definition.icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {node.editor.name?.trim() || definition.displayName}
                </h2>
                {nodeCommittedIssues.length > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] font-medium text-destructive">
                    <CircleAlert className="size-3" /> {nodeCommittedIssues.length}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className="rounded bg-secondary px-1.5 py-0.5 font-medium uppercase tracking-wider">
                  {definition.category}
                </span>
                <span className="font-mono">{definition.type}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
            {definition.description}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openHelp({ type: definition.type, version: definition.version })}
              className="h-8 bg-background/25"
            >
              <HelpCircle /> Help
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDuplicate}
              className="h-8 bg-background/25"
            >
              <Copy /> Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-8 bg-background/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 /> Delete
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-3.5">
          {stale ? (
            <div className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-[10px] leading-4 text-destructive">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              This node changed while the form was open. Discard this draft and reopen the panel.
            </div>
          ) : null}

          {!dirty && nodeCommittedIssues.length > 0 ? (
            <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-[10px] leading-4 text-warning">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              This node has {nodeCommittedIssues.length} validation issue
              {nodeCommittedIssues.length === 1 ? '' : 's'}. Fields requiring attention are marked
              below.
            </div>
          ) : null}

          {definition.configSchema && configFields.length > 0 ? (
            <InspectorSection
              icon={SlidersHorizontal}
              title={definition.targeting ? 'Target and configuration' : 'Configuration'}
              description={
                definition.targeting
                  ? 'Choose how this node locates and interacts with its target.'
                  : 'Static values that control how this node behaves.'
              }
              badge={configFields.length}
            >
              {configFields.map(([name, schema]) => (
                <SchemaValueField
                  key={`config-${name}`}
                  id={`property-${name}`}
                  name={name}
                  schema={schema}
                  value={draft.config[name]}
                  errors={schemaIssues('config', name)}
                  onChange={(value) =>
                    name === 'targetMode' && typeof value === 'string' && definition.targeting
                      ? update(selectDraftTargetMode(draft, definition, value))
                      : update(setDraftConfigValue(draft, name, value))
                  }
                />
              ))}
            </InspectorSection>
          ) : !definition.configSchema ? (
            <InspectorSection
              icon={SlidersHorizontal}
              title="Configuration"
              description="Node-specific configuration values."
            >
              {Object.entries(definition.properties.properties).map(([name, property]) => (
                <LegacyPropertyField
                  key={name}
                  draft={draft}
                  name={name}
                  property={property}
                  onChange={(value) => updateValue(property.storage, name, value)}
                />
              ))}
            </InspectorSection>
          ) : null}

          {definition.configSchema && bindingFields.length > 0 ? (
            <InspectorSection
              icon={Zap}
              title={definition.targeting ? 'Target values' : 'Inputs'}
              description="Choose where each value comes from. Required inputs must be complete before saving."
              badge={bindingFields.length}
            >
              {bindingFields.map(([name, input]) => (
                <BindingSourceField
                  key={`binding-${name}`}
                  id={`property-${name}`}
                  input={input}
                  binding={draft.bindings[name]}
                  workflow={workflow}
                  workflowInputSchema={workflowInputSchema}
                  consumerNodeId={node.id}
                  catalog={catalog}
                  errors={schemaIssues('binding', name)}
                  onChange={(binding) => update(setDraftBinding(draft, name, binding))}
                />
              ))}
            </InspectorSection>
          ) : null}

          {definition.switch ? (
            <InspectorSection
              icon={GitBranch}
              title="Routing rules"
              description="Rules are evaluated from top to bottom. Each rule creates one output branch."
              badge={switchRules(draft.config).length}
            >
              <div className="space-y-2.5">
                {switchRules(draft.config).map((rule, index, rules) => {
                  const operator = definition.switch!.operators.find(
                    ({ value }) => value === rule.operator,
                  );
                  return (
                    <div
                      key={rule.id}
                      className="overflow-hidden rounded-lg bg-background/45 shadow-[0_8px_24px_-22px_rgba(0,0,0,0.95)]"
                    >
                      <div className="flex items-center gap-2 bg-accent/20 px-2.5 py-2">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[9px] font-semibold text-primary">
                          {index + 1}
                        </span>
                        <select
                          aria-label={`Rule ${index + 1} operator`}
                          value={rule.operator}
                          onChange={(event) => changeSwitchOperator(rule.id, event.target.value)}
                          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                        >
                          {definition
                            .switch!.operators.filter(
                              (option) =>
                                option.value === rule.operator ||
                                !switchLiteralType ||
                                option.supportedTypes.includes(switchLiteralType),
                            )
                            .map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value}
                              </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            title="Move rule up"
                            aria-label={`Move rule ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => moveSwitchRule(index, -1)}
                            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Move rule down"
                            aria-label={`Move rule ${index + 1} down`}
                            disabled={index === rules.length - 1}
                            onClick={() => moveSwitchRule(index, 1)}
                            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Duplicate rule"
                            aria-label={`Duplicate rule ${index + 1}`}
                            onClick={() => duplicateSwitchRule(rule.id)}
                            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <CopyPlus className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete rule"
                            aria-label={`Delete rule ${index + 1}`}
                            disabled={rules.length <= definition.switch!.minimumRules}
                            onClick={() => deleteSwitchRule(rule.id)}
                            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 p-2.5">
                        {operator?.operandCount === 1 ? (
                          <BindingSourceField
                            id={`switch-${rule.id}`}
                            input={{ ...definition.switch!.operand, name: 'Operand' }}
                            binding={draft.bindings[rule.id]}
                            workflow={workflow}
                            workflowInputSchema={workflowInputSchema}
                            consumerNodeId={node.id}
                            catalog={catalog}
                            errors={schemaIssues('binding', rule.id)}
                            onChange={(binding) => update(setDraftBinding(draft, rule.id, binding))}
                          />
                        ) : (
                          <p className="text-[10px] text-muted-foreground">
                            This operator does not require an operand.
                          </p>
                        )}
                        <p className="truncate font-mono text-[9px] text-muted-foreground/70">
                          Branch port · {rule.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full bg-background/25"
                disabled={switchRules(draft.config).length >= definition.switch.maximumRules}
                onClick={addSwitchRule}
              >
                <Plus /> Add rule
              </Button>
            </InspectorSection>
          ) : null}

          <InspectorSection
            icon={Settings2}
            title="Behavior and execution"
            description="Control failure behavior, timeout and retry overrides."
          >
            {hasErrorPolicy ? (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium">On error</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Stop the workflow or expose a dedicated error branch.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-background/60 p-1 text-xs">
                  {(
                    [
                      ['STOP', 'Stop workflow'],
                      ['ERROR_BRANCH', 'Use error branch'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update({ ...draft, errorPolicy: value })}
                      className={`h-8 rounded-md border px-2 text-[10px] font-medium transition-colors ${
                        draft.errorPolicy === value
                          ? 'border-primary/50 bg-primary/15 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <details className="group rounded-lg bg-background/35">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
                Execution overrides
                <span className="ml-auto text-[9px] font-normal text-muted-foreground">
                  Optional
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 bg-background/20 p-3">
                <label className="block text-[10px] font-medium">
                  Timeout
                  <span className="ml-1 font-normal text-muted-foreground">
                    milliseconds
                    {definition.defaultTimeoutMs ? ` · default ${definition.defaultTimeoutMs}` : ''}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600000}
                    value={draft.timeoutMs === undefined ? '' : String(draft.timeoutMs)}
                    placeholder={definition.defaultTimeoutMs?.toString() ?? 'Runtime default'}
                    onChange={(event) =>
                      update({
                        ...draft,
                        timeoutMs:
                          event.target.value === '' ? undefined : Number(event.target.value),
                      })
                    }
                    className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    ['Max attempts', 'maxAttempts', draft.retryPolicy?.maxAttempts, '1'],
                    ['Retry delay', 'delayMs', draft.retryPolicy?.delayMs, '0 ms'],
                  ].map(([label, field, value, placeholder]) => (
                    <label key={String(field)} className="text-[10px] font-medium">
                      {label}
                      <input
                        type="number"
                        value={value === undefined ? '' : String(value)}
                        placeholder={String(placeholder)}
                        onChange={(event) => {
                          const next =
                            event.target.value === '' ? undefined : Number(event.target.value);
                          update({
                            ...draft,
                            retryPolicy: { ...draft.retryPolicy, [String(field)]: next },
                          });
                        }}
                        className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
                      />
                    </label>
                  ))}
                </div>
                {draftIssues
                  .filter((entry) => entry.storage === 'execution')
                  .map((entry) => (
                    <p
                      key={`${entry.field}-${entry.message}`}
                      className="text-[10px] text-destructive"
                    >
                      {entry.message}
                    </p>
                  ))}
              </div>
            </details>
          </InspectorSection>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border/80 bg-panel/95 px-3.5 py-3 backdrop-blur text-xs">
        <div className="min-w-0 flex-1">
          {stale ? (
            <p className="truncate text-[10px] font-medium text-destructive">
              Draft is out of date
            </p>
          ) : draftIssues.length > 0 ? (
            <p className="truncate text-[10px] font-medium text-destructive">
              {draftIssues.length} {draftIssues.length === 1 ? 'field needs' : 'fields need'}{' '}
              attention
            </p>
          ) : dirty ? (
            <p className="truncate text-[10px] font-medium text-warning">Unsaved changes</p>
          ) : (
            <p className="truncate text-[10px] text-muted-foreground">No unsaved changes</p>
          )}
        </div>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={cancel}>
          Discard
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
  workflow,
  workflowInputSchema,
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
      catalog={catalog}
      workflow={workflow}
      workflowInputSchema={workflowInputSchema}
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
