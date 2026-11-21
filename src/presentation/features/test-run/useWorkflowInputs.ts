import { useCallback, useMemo, useState } from 'react';

import {
  objectValueSchema,
  validateObjectValue,
  type ObjectValueIssue,
  type ObjectValueSchema,
} from '@domain/schema/object-value-schema';
import type { JsonValue } from '@shared/types/json-value';

function initialInputs(schema: ObjectValueSchema | null): Record<string, JsonValue> {
  if (!schema) return {};
  return Object.fromEntries(
    Object.entries(schema.properties).flatMap(([name, property]) => {
      if (property.default !== undefined) return [[name, property.default]];
      if (property.type === 'boolean' && schema.required.includes(name)) return [[name, false]];
      return [];
    }),
  );
}

export interface WorkflowInputsState {
  issues: ObjectValueIssue[];
  schema: ObjectValueSchema | null;
  schemaError: string | null;
  setValue(name: string, value: JsonValue | undefined): void;
  valid: boolean;
  values: Record<string, JsonValue>;
}

interface VersionedInputValues {
  schemaFingerprint: string;
  values: Record<string, JsonValue>;
}

export function useWorkflowInputs(inputSchema: JsonValue): WorkflowInputsState {
  const schemaFingerprint = JSON.stringify(inputSchema);
  const parsedSchema = useMemo(
    () => objectValueSchema.safeParse(JSON.parse(schemaFingerprint) as JsonValue),
    [schemaFingerprint],
  );
  const schema = parsedSchema.success ? parsedSchema.data : null;
  const [versionedValues, setVersionedValues] = useState<VersionedInputValues>(() => ({
    schemaFingerprint,
    values: initialInputs(schema),
  }));
  const values =
    versionedValues.schemaFingerprint === schemaFingerprint
      ? versionedValues.values
      : initialInputs(schema);

  const issues = useMemo(
    () => (schema ? validateObjectValue(schema, values) : []),
    [schema, values],
  );
  const setValue = useCallback(
    (name: string, value: JsonValue | undefined) => {
      setVersionedValues((current) => {
        const currentValues =
          current.schemaFingerprint === schemaFingerprint ? current.values : initialInputs(schema);
        if (value === undefined) {
          if (!Object.hasOwn(currentValues, name)) {
            return { schemaFingerprint, values: currentValues };
          }
          const next = { ...currentValues };
          delete next[name];
          return { schemaFingerprint, values: next };
        }
        return { schemaFingerprint, values: { ...currentValues, [name]: value } };
      });
    },
    [schema, schemaFingerprint],
  );

  return {
    issues,
    schema,
    schemaError: parsedSchema.success
      ? null
      : 'The Draft workflow input schema is invalid and cannot be used for a Test Run.',
    setValue,
    valid: schema !== null && issues.length === 0,
    values,
  };
}
