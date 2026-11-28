import type { WorkflowBinding, WorkflowDocument } from '@domain/project/project';
import type {
  BindingInputDefinition,
  NodeDefinition,
  WorkflowBindingKind,
} from '@domain/workflow/node-definition';
import {
  defaultBindingFor,
  preferredBindingKind,
  workflowBindingKind,
} from '@domain/workflow/workflow-binding';
import { nodeOutputOptions, variableSuggestions } from '@domain/workflow/binding-options';
import {
  compatibleWorkflowInputNames,
  WORKFLOW_INPUT_NAME_PATTERN,
  workflowInputFieldsFromSchema,
  type WorkflowInputField,
  type WorkflowInputType,
} from '@domain/workflow/workflow-inputs';
import type { JsonValue } from '@shared/types/json-value';
import { SchemaValueField } from '@presentation/features/workflow-editor/SchemaValueField';

interface BindingSourceFieldProps {
  id: string;
  input: BindingInputDefinition;
  binding?: WorkflowBinding;
  workflow: WorkflowDocument;
  workflowInputSchema: JsonValue;
  consumerNodeId: string;
  catalog: readonly NodeDefinition[];
  errors: readonly string[];
  onChange(binding: WorkflowBinding | undefined): void;
  onCreateWorkflowInput(input: WorkflowInputField): void;
}

const labels: Record<WorkflowBindingKind, string> = {
  LITERAL: 'Literal',
  WORKFLOW_INPUT: 'Workflow input',
  NODE_OUTPUT: 'Node output',
  FLOW_VARIABLE: 'Flow variable',
  GLOBAL_VARIABLE: 'Run-group variable',
};

function titleFromName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function availableWorkflowInputName(schema: JsonValue, label: string) {
  const properties =
    schema && typeof schema === 'object' && !Array.isArray(schema) ? schema.properties : undefined;
  const existing = new Set(
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? Object.keys(properties)
      : [],
  );
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  const joined = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
  const base = WORKFLOW_INPUT_NAME_PATTERN.test(joined) ? joined : 'inputValue';
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base.slice(0, 100 - String(suffix).length)}${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `input${Date.now()}`.slice(0, 100);
}

function workflowInputType(input: BindingInputDefinition): WorkflowInputType {
  if (input.valueSchema) return input.valueSchema.type;
  const literalType = input.bindingKinds.LITERAL?.literalTypes?.[0];
  return literalType === 'number' || literalType === 'boolean' ? literalType : 'string';
}

function newWorkflowInput(schema: JsonValue, input: BindingInputDefinition): WorkflowInputField {
  const type = workflowInputType(input);
  const valueSchema = input.valueSchema;
  const textSchema = valueSchema?.type === 'string' ? valueSchema : undefined;
  const numberSchema =
    valueSchema?.type === 'integer' || valueSchema?.type === 'number' ? valueSchema : undefined;
  return {
    name: availableWorkflowInputName(schema, input.name),
    type,
    required: input.required,
    min: textSchema?.minLength ?? numberSchema?.minimum ?? null,
    max: textSchema?.maxLength ?? numberSchema?.maximum ?? null,
  };
}

export function BindingSourceField({
  id,
  input,
  binding,
  workflow,
  workflowInputSchema,
  consumerNodeId,
  catalog,
  errors,
  onChange,
  onCreateWorkflowInput,
}: BindingSourceFieldProps) {
  const kinds = Object.keys(input.bindingKinds) as WorkflowBindingKind[];
  const kind =
    workflowBindingKind(binding) ?? (input.required ? preferredBindingKind(input) : undefined);
  const selectedBinding = binding ?? (kind ? defaultBindingFor(input, kind) : undefined);
  const inputClass =
    'h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary';
  const outputOptions = nodeOutputOptions(workflow, consumerNodeId, input, catalog);
  const workflowInputs = compatibleWorkflowInputNames(workflowInputSchema, input);
  const workflowInputCount = workflowInputFieldsFromSchema(workflowInputSchema).length;
  const suggestedWorkflowInput = newWorkflowInput(workflowInputSchema, input);
  const selectedOutput =
    kind === 'NODE_OUTPUT' &&
    typeof selectedBinding?.nodeId === 'string' &&
    typeof selectedBinding.field === 'string'
      ? `${selectedBinding.nodeId}\u0000${selectedBinding.field}`
      : '';
  const suggestions =
    kind === 'FLOW_VARIABLE'
      ? variableSuggestions(workflow, consumerNodeId, 'FLOW')
      : kind === 'GLOBAL_VARIABLE'
        ? variableSuggestions(workflow, consumerNodeId, 'RUN_GROUP')
        : [];
  const literalTypes = input.bindingKinds.LITERAL?.literalTypes ?? ['string'];
  const literalType =
    typeof selectedBinding?.value === 'boolean'
      ? 'boolean'
      : typeof selectedBinding?.value === 'number'
        ? 'number'
        : (literalTypes[0] ?? 'string');
  const emptyLiteralBinding = input.required ? { kind: 'LITERAL' } : undefined;

  return (
    <div className="binding-field min-w-0 space-y-1.5 text-sm" data-invalid={errors.length > 0}>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-literal`} className="min-w-0 flex-1 truncate text-xs font-medium">
          {titleFromName(input.name)}
          {input.required ? (
            <span className="ml-0.5 text-destructive" aria-label="required">
              *
            </span>
          ) : null}
        </label>
        <select
          id={`${id}-kind`}
          aria-label={`${titleFromName(input.name)} value source`}
          title="Value source"
          value={kind ?? ''}
          onChange={(event) => {
            const next = event.target.value as WorkflowBindingKind;
            if (next === 'WORKFLOW_INPUT') {
              if (workflowInputs.length === 0) {
                onCreateWorkflowInput(suggestedWorkflowInput);
                return;
              }
              if (workflowInputs.length === 1) {
                onChange({ kind: next, inputName: workflowInputs[0]! });
                return;
              }
            }
            onChange(next ? defaultBindingFor(input, next) : undefined);
          }}
          className="binding-source-select h-6 max-w-[55%] shrink-0 cursor-pointer rounded-md border-0 bg-transparent pr-1 text-right text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {!input.required ? <option value="">Not set</option> : null}
          {kinds.map((entry) => (
            <option key={entry} value={entry}>
              {labels[entry]}
            </option>
          ))}
        </select>
      </div>

      {kind === 'LITERAL' && input.valueSchema ? (
        <div>
          <SchemaValueField
            hideLabel
            id={`${id}-literal`}
            name={input.name}
            schema={input.valueSchema}
            value={selectedBinding?.value}
            errors={[]}
            onChange={(value) =>
              onChange(value === undefined ? emptyLiteralBinding : { kind, value })
            }
          />
        </div>
      ) : kind === 'LITERAL' ? (
        <div className="flex gap-2">
          {literalTypes.length > 1 ? (
            <select
              aria-label={`${input.name} literal type`}
              value={literalType}
              onChange={(event) => {
                const type = event.target.value;
                onChange({
                  kind,
                  value: type === 'boolean' ? false : type === 'number' ? 0 : '',
                });
              }}
              className={`${inputClass} w-28`}
            >
              {literalTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          ) : null}
          {literalType === 'boolean' ? (
            <label className="flex h-9 flex-1 items-center gap-2 rounded border border-border px-2 text-xs">
              <input
                type="checkbox"
                checked={selectedBinding?.value === true}
                onChange={(event) => onChange({ kind, value: event.target.checked })}
              />
              True
            </label>
          ) : (
            <input
              aria-label={`${input.name} value`}
              type={literalType === 'number' ? 'number' : 'text'}
              value={
                typeof selectedBinding?.value === 'string' ||
                typeof selectedBinding?.value === 'number'
                  ? String(selectedBinding.value)
                  : ''
              }
              onChange={(event) => {
                if (literalType === 'number' && event.target.value === '') {
                  onChange(emptyLiteralBinding);
                  return;
                }
                onChange({
                  kind,
                  value: literalType === 'number' ? Number(event.target.value) : event.target.value,
                });
              }}
              className={inputClass}
            />
          )}
        </div>
      ) : kind === 'WORKFLOW_INPUT' ? (
        <div className="space-y-1.5">
          {workflowInputs.length === 0 ? (
            <button
              type="button"
              onClick={() => onCreateWorkflowInput(suggestedWorkflowInput)}
              className={`${inputClass} text-left text-foreground hover:border-primary`}
            >
              Create run input &ldquo;{suggestedWorkflowInput.name}&rdquo;
            </button>
          ) : (
            <select
              aria-label={`${input.name} workflow input`}
              value={
                typeof selectedBinding?.inputName === 'string' ? selectedBinding.inputName : ''
              }
              onChange={(event) => onChange({ kind, inputName: event.target.value })}
              className={inputClass}
            >
              <option value="">Select workflow input…</option>
              {workflowInputs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <p className="text-[10px] leading-4 text-muted-foreground">
            {workflowInputs.length > 0
              ? 'The user enters this value for each device when starting a Test Run.'
              : workflowInputCount === 0
                ? 'No run inputs exist yet. Creating this input adds it to the Test Run form.'
                : input.valueSchema
                  ? `No ${input.required ? 'required ' : ''}${input.valueSchema.type} run input exists. Create a compatible one here.`
                  : 'No compatible run input exists. Create one here.'}
          </p>
        </div>
      ) : kind === 'NODE_OUTPUT' ? (
        <div>
          <select
            aria-label={`${input.name} node output`}
            value={selectedOutput}
            onChange={(event) => {
              const [nodeId, field] = event.target.value.split('\u0000');
              onChange({ kind, nodeId: nodeId ?? '', field: field ?? '' });
            }}
            className={inputClass}
          >
            <option value="">Select node output…</option>
            {outputOptions.map((option) => (
              <option
                key={`${option.nodeId}:${option.field}`}
                value={`${option.nodeId}\u0000${option.field}`}
              >
                {option.nodeLabel} · {option.field}
              </option>
            ))}
          </select>
        </div>
      ) : kind === 'FLOW_VARIABLE' || kind === 'GLOBAL_VARIABLE' ? (
        <div>
          <input
            aria-label={`${input.name} variable name`}
            list={`${id}-variables`}
            value={typeof selectedBinding?.name === 'string' ? selectedBinding.name : ''}
            onChange={(event) => onChange({ kind, name: event.target.value })}
            className={inputClass}
          />
          <datalist id={`${id}-variables`}>
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      ) : null}
      {errors.map((message) => (
        <p key={message} className="text-[11px] leading-4 text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
