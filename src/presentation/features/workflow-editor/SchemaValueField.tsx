import type { FieldValueSchema } from '@domain/schema/object-value-schema';
import type { JsonValue } from '@shared/types/json-value';

interface SchemaValueFieldProps {
  id: string;
  name: string;
  schema: FieldValueSchema;
  value: JsonValue | undefined;
  errors: readonly string[];
  onChange(value: JsonValue | undefined): void;
}

function titleFromName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function enumLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function SchemaValueField({
  id,
  name,
  schema,
  value,
  errors,
  onChange,
}: SchemaValueFieldProps) {
  const inputClass =
    'mt-2 h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary ' +
    (errors.length > 0 ? 'border-destructive' : 'border-border');
  return (
    <div className="text-sm">
      <label htmlFor={id} className="text-xs font-medium">
        {schema.title ?? titleFromName(name)}
      </label>
      {schema.description ? (
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{schema.description}</p>
      ) : null}
      {schema.type === 'string' && schema.enum ? (
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value || undefined)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {schema.enum.map((option) => (
            <option key={option} value={option}>
              {enumLabel(option)}
            </option>
          ))}
        </select>
      ) : schema.type === 'boolean' ? (
        <label className="mt-2 flex items-center gap-2 text-[10px]">
          <input
            id={id}
            type="checkbox"
            checked={typeof value === 'boolean' ? value : (schema.default ?? false)}
            onChange={(event) => onChange(event.target.checked)}
          />
          Enabled
        </label>
      ) : (
        <input
          id={id}
          type={schema.type === 'integer' ? 'number' : 'text'}
          value={value === undefined ? '' : String(value)}
          min={schema.type === 'integer' ? schema.minimum : undefined}
          max={schema.type === 'integer' ? schema.maximum : undefined}
          minLength={schema.type === 'string' ? schema.minLength : undefined}
          maxLength={schema.type === 'string' ? schema.maxLength : undefined}
          pattern={schema.type === 'string' ? schema.pattern : undefined}
          onChange={(event) => {
            if (!event.target.value) return onChange(undefined);
            if (schema.type === 'integer') {
              const number = Number(event.target.value);
              return onChange(Number.isSafeInteger(number) ? number : undefined);
            }
            onChange(event.target.value);
          }}
          className={inputClass}
        />
      )}
      {errors.map((message) => (
        <p key={message} className="mt-1 text-[10px] text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
