import type { WorkflowInputsState } from '@presentation/features/test-run/useWorkflowInputs';

function titleFromName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

interface WorkflowInputsFormProps {
  disabled?: boolean;
  state: WorkflowInputsState;
}

export function WorkflowInputsForm({ disabled = false, state }: WorkflowInputsFormProps) {
  if (!state.schema) {
    return (
      <section aria-labelledby="test-run-inputs-heading">
        <h3 id="test-run-inputs-heading" className="text-sm font-semibold">
          Workflow inputs
        </h3>
        <p role="alert" className="mt-3 text-xs text-destructive">
          {state.schemaError}
        </p>
      </section>
    );
  }

  const entries = Object.entries(state.schema.properties);
  return (
    <section aria-labelledby="test-run-inputs-heading">
      <h3 id="test-run-inputs-heading" className="text-sm font-semibold">
        Workflow inputs
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Values are validated locally against the current Project Draft schema.
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground">
          This workflow has no inputs. Runtime will receive an empty object.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {entries.map(([name, property]) => {
            const id = `test-run-input-${name}`;
            const required = state.schema!.required.includes(name);
            const fieldIssues = state.issues.filter((issue) => issue.field === name);
            const value = state.values[name];
            const inputClass =
              'mt-2 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary disabled:opacity-60 ' +
              (fieldIssues.length > 0 ? 'border-destructive' : 'border-border');
            return (
              <div key={name} className="text-sm">
                <label htmlFor={id} className="text-xs font-medium">
                  {property.title ?? titleFromName(name)}
                  {required ? <span className="ml-1 text-destructive">*</span> : null}
                </label>
                {property.description ? (
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    {property.description}
                  </p>
                ) : null}
                {property.type === 'string' && property.enum ? (
                  <select
                    id={id}
                    value={typeof value === 'string' ? value : ''}
                    disabled={disabled}
                    onChange={(event) => state.setValue(name, event.target.value || undefined)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {property.enum.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : property.type === 'boolean' && !required ? (
                  <select
                    id={id}
                    value={typeof value === 'boolean' ? String(value) : ''}
                    disabled={disabled}
                    onChange={(event) =>
                      state.setValue(
                        name,
                        event.target.value === '' ? undefined : event.target.value === 'true',
                      )
                    }
                    className={inputClass}
                  >
                    <option value="">Not set</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : property.type === 'boolean' ? (
                  <label className="mt-2 flex h-9 items-center gap-2 text-xs">
                    <input
                      id={id}
                      type="checkbox"
                      checked={value === true}
                      disabled={disabled}
                      onChange={(event) => state.setValue(name, event.target.checked)}
                    />
                    {value === true ? 'True' : 'False'}
                  </label>
                ) : (
                  <input
                    id={id}
                    type={
                      property.type === 'integer' || property.type === 'number' ? 'number' : 'text'
                    }
                    step={
                      property.type === 'integer'
                        ? 1
                        : property.type === 'number'
                          ? 'any'
                          : undefined
                    }
                    value={value === undefined ? '' : String(value)}
                    disabled={disabled}
                    min={
                      property.type === 'integer' || property.type === 'number'
                        ? property.minimum
                        : undefined
                    }
                    max={
                      property.type === 'integer' || property.type === 'number'
                        ? property.maximum
                        : undefined
                    }
                    minLength={property.type === 'string' ? property.minLength : undefined}
                    maxLength={property.type === 'string' ? property.maxLength : undefined}
                    onChange={(event) => {
                      if (event.target.value === '') return state.setValue(name, undefined);
                      if (property.type === 'integer' || property.type === 'number') {
                        const number = Number(event.target.value);
                        return state.setValue(
                          name,
                          property.type === 'integer'
                            ? Number.isSafeInteger(number)
                              ? number
                              : undefined
                            : Number.isFinite(number)
                              ? number
                              : undefined,
                        );
                      }
                      state.setValue(name, event.target.value);
                    }}
                    className={inputClass}
                  />
                )}
                {fieldIssues.map((issue) => (
                  <p
                    key={`${issue.code}-${issue.message}`}
                    className="mt-1 text-[10px] text-destructive"
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
