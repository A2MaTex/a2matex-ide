import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';

import type { ProjectDocument } from '@domain/project/project';
import {
  validateWorkflowInputFields,
  WORKFLOW_INPUT_TYPES,
  workflowInputFieldsFromSchema,
  workflowInputRuntimeIncompatibilities,
  workflowInputSchemaFromFields,
  workflowInputUsage,
  type WorkflowInputField,
  type WorkflowInputType,
} from '@domain/workflow/workflow-inputs';
import type { JsonValue } from '@shared/types/json-value';
import { Button } from '@presentation/components/ui/button';

interface WorkflowInputsDialogProps {
  document: ProjectDocument;
  inputSchema: JsonValue;
  onOpenChange(open: boolean): void;
  onSave(inputSchema: JsonValue, renames: ReadonlyMap<string, string>): void;
  open: boolean;
}

interface InputRow {
  key: number;
  /** Name stored in the draft when the dialog opened; null for rows added here. */
  originalName: string | null;
  name: string;
  type: WorkflowInputType;
  required: boolean;
  min: string;
  max: string;
}

const typeLabels: Record<WorkflowInputType, string> = {
  string: 'Text',
  integer: 'Whole number',
  number: 'Number',
  boolean: 'Yes / No',
};

function rowsFrom(schema: JsonValue): InputRow[] {
  return workflowInputFieldsFromSchema(schema).map((field, index) => ({
    key: index,
    originalName: field.name,
    name: field.name,
    type: field.type,
    required: field.required,
    min: field.min === null ? '' : String(field.min),
    max: field.max === null ? '' : String(field.max),
  }));
}

function parseBound(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isNaN(number) ? Number.NaN : number;
}

function fieldOf(row: InputRow): WorkflowInputField {
  return {
    name: row.name.trim(),
    type: row.type,
    required: row.required,
    min: row.type === 'boolean' ? null : parseBound(row.min),
    max: row.type === 'boolean' ? null : parseBound(row.max),
  };
}

export function WorkflowInputsDialog(props: WorkflowInputsDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(94vw,880px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card shadow-2xl outline-none">
          {/* Mounted only while open, so every opening starts from the current draft. */}
          {props.open ? <WorkflowInputsEditor {...props} /> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WorkflowInputsEditor({
  document,
  inputSchema,
  onOpenChange,
  onSave,
}: WorkflowInputsDialogProps) {
  const [rows, setRows] = useState<InputRow[]>(() => rowsFrom(inputSchema));
  const [nextKey, setNextKey] = useState(() => rows.length);
  const usage = useMemo(() => workflowInputUsage(document), [document]);
  const incompatible = useMemo(
    () => workflowInputRuntimeIncompatibilities(inputSchema),
    [inputSchema],
  );

  const fields = rows.map(fieldOf);
  const issues = validateWorkflowInputFields(fields);
  const issueFor = (index: number, field: 'name' | 'min' | 'max') =>
    issues.find((issue) => issue.index === index && issue.field === field)?.message;
  const keptNames = new Set(rows.map((row) => row.originalName).filter(Boolean));
  const removedInUse = [...usage.entries()].filter(
    ([name]) =>
      workflowInputFieldsFromSchema(inputSchema).some((field) => field.name === name) &&
      !keptNames.has(name),
  );

  const update = (key: number, patch: Partial<InputRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    setRows((current) => [
      ...current,
      {
        key: nextKey,
        originalName: null,
        name: '',
        type: 'string',
        required: true,
        min: '',
        max: '',
      },
    ]);
    setNextKey((key) => key + 1);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (issues.length > 0) return;
    const renames = new Map(
      rows
        .filter((row) => row.originalName !== null && row.originalName !== row.name.trim())
        .map((row) => [row.originalName!, row.name.trim()] as const),
    );
    onSave(workflowInputSchemaFromFields(fields), renames);
    onOpenChange(false);
  };

  return (
    <>
      <div className="flex items-start gap-3 p-6 pb-4">
        <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-cyan-400">
          <SlidersHorizontal className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="text-lg font-semibold">Workflow inputs</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
            Values the person running the workflow enters for each device, such as an account or a
            shop name. Nodes read them with the &ldquo;Workflow input&rdquo; source.
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <Button size="icon" variant="ghost" aria-label="Close Workflow inputs dialog">
            <X />
          </Button>
        </Dialog.Close>
      </div>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {incompatible.length > 0 ? (
            <div className="mb-4 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                {incompatible.join(', ')} {incompatible.length === 1 ? 'has' : 'have'} settings the
                Runtime does not accept (such as a title, default value or list of options). Saving
                keeps only the supported settings.
              </p>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              This workflow has no inputs yet. Add one for each value that changes from device to
              device.
            </p>
          ) : (
            <table className="w-full table-fixed border-separate border-spacing-y-2 text-xs">
              <thead className="text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-[30%] font-medium">Name</th>
                  <th className="w-[18%] font-medium">Type</th>
                  <th className="w-[10%] text-center font-medium">Required</th>
                  <th className="w-[13%] font-medium">Min</th>
                  <th className="w-[13%] font-medium">Max</th>
                  <th className="w-[10%] font-medium">Used by</th>
                  <th className="w-[6%]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const nameIssue = issueFor(index, 'name');
                  const minIssue = issueFor(index, 'min');
                  const maxIssue = issueFor(index, 'max');
                  const used = row.originalName ? (usage.get(row.originalName) ?? 0) : 0;
                  const text = row.type === 'string';
                  const inputClass = (invalid: boolean) =>
                    'h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-primary disabled:opacity-50 ' +
                    (invalid ? 'border-destructive' : 'border-border');
                  return (
                    <tr key={row.key} className="align-top">
                      <td className="pr-2">
                        <input
                          aria-label={`Input ${index + 1} name`}
                          className={inputClass(Boolean(nameIssue)) + ' font-mono'}
                          placeholder="accountName"
                          value={row.name}
                          onChange={(event) => update(row.key, { name: event.target.value })}
                        />
                        {nameIssue ? (
                          <p className="mt-1 text-[11px] leading-4 text-destructive">{nameIssue}</p>
                        ) : row.originalName && row.originalName !== row.name.trim() && used > 0 ? (
                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                            Nodes using {row.originalName} will follow the new name.
                          </p>
                        ) : null}
                      </td>
                      <td className="pr-2">
                        <select
                          aria-label={`Input ${index + 1} type`}
                          className={inputClass(false)}
                          value={row.type}
                          onChange={(event) =>
                            update(row.key, { type: event.target.value as WorkflowInputType })
                          }
                        >
                          {WORKFLOW_INPUT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {typeLabels[type]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="pt-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Input ${index + 1} required`}
                          checked={row.required}
                          onChange={(event) => update(row.key, { required: event.target.checked })}
                        />
                      </td>
                      {(['min', 'max'] as const).map((bound) => (
                        <td key={bound} className="pr-2">
                          <input
                            aria-label={`Input ${index + 1} ${bound}${text ? ' length' : ''}`}
                            inputMode="decimal"
                            disabled={row.type === 'boolean'}
                            className={inputClass(Boolean(bound === 'min' ? minIssue : maxIssue))}
                            placeholder={
                              row.type === 'boolean' ? '—' : text ? `${bound} length` : bound
                            }
                            value={row.type === 'boolean' ? '' : row[bound]}
                            onChange={(event) => update(row.key, { [bound]: event.target.value })}
                          />
                          {(bound === 'min' ? minIssue : maxIssue) ? (
                            <p className="mt-1 text-[11px] leading-4 text-destructive">
                              {bound === 'min' ? minIssue : maxIssue}
                            </p>
                          ) : null}
                        </td>
                      ))}
                      <td className="pt-2 text-[11px] text-muted-foreground">
                        {used === 0 ? 'Not used' : `${used} field${used === 1 ? '' : 's'}`}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove input ${row.name || index + 1}`}
                          onClick={() =>
                            setRows((current) => current.filter((item) => item.key !== row.key))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={addRow}>
            <Plus /> Add input
          </Button>

          {removedInUse.length > 0 ? (
            <div className="mt-4 flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Removing{' '}
                {removedInUse.map(([name, count]) => `${name} (used by ${count})`).join(', ')}{' '}
                leaves those node fields without a source. They will show in Problems until you pick
                another source.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-[11px] text-muted-foreground">
            {issues.length > 0
              ? `Fix ${issues.length} problem${issues.length === 1 ? '' : 's'} before saving.`
              : `${rows.length} input${rows.length === 1 ? '' : 's'}. Min / Max are lengths for Text and values for numbers.`}
          </p>
          <div className="flex gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={issues.length > 0}>
              Save inputs
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
