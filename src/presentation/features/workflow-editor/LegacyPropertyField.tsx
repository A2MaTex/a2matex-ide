import type { NodeConfigurationDraft } from '@domain/workflow/node-configuration-draft';
import type { PropertyDefinition } from '@domain/workflow/node-definition';
import { isLiteralBinding } from '@domain/workflow/workflow-binding';
import type { JsonValue } from '@shared/types/json-value';
import { AndroidSelectorControl } from '@presentation/features/android-inspector/AndroidSelectorControl';

interface LegacyPropertyFieldProps {
  draft: NodeConfigurationDraft;
  name: string;
  property: PropertyDefinition;
  onChange(value: JsonValue | undefined): void;
}

export function LegacyPropertyField({ draft, name, property, onChange }: LegacyPropertyFieldProps) {
  const binding = draft.bindings[name];
  const value =
    property.storage === 'config'
      ? (draft.config[name] ?? property.default)
      : isLiteralBinding(binding)
        ? binding.value
        : property.default;
  if (property.ui?.control === 'android-selector') {
    return (
      <div className="text-sm">
        <label htmlFor={`property-${name}`} className="text-xs font-medium">
          {property.title}
        </label>
        <AndroidSelectorControl id={`property-${name}`} value={value ?? null} onCommit={onChange} />
      </div>
    );
  }
  const inputClass =
    'mt-2 h-9 w-full rounded-md border border-border bg-background px-2.5 text-xs outline-none focus:border-primary';
  return (
    <div className="text-sm">
      <label htmlFor={`property-${name}`} className="text-xs font-medium">
        {property.title}
      </label>
      {property.enum ? (
        <select
          id={`property-${name}`}
          value={value === undefined ? '' : String(value)}
          onChange={(event) => onChange(event.target.value || undefined)}
          className={inputClass}
        >
          <option value="">Select…</option>
          {property.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      ) : property.type === 'boolean' ? (
        <input
          id={`property-${name}`}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : (
        <input
          id={`property-${name}`}
          type={property.type === 'integer' || property.type === 'number' ? 'number' : 'text'}
          value={value === undefined ? '' : String(value)}
          min={property.minimum}
          max={property.maximum}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw) return onChange(undefined);
            if (property.type === 'integer' || property.type === 'number') {
              const numeric = Number(raw);
              return onChange(Number.isFinite(numeric) ? numeric : undefined);
            }
            onChange(raw);
          }}
          className={inputClass}
        />
      )}
    </div>
  );
}
