import { useCallback, useMemo, useState } from 'react';

import { validateObjectValue } from '@domain/schema/object-value-schema';
import type { WorkflowInputsState } from '@presentation/features/test-run/useWorkflowInputs';
import {
  initialWorkflowInputs,
  useWorkflowInputs,
} from '@presentation/features/test-run/useWorkflowInputs';
import type { JsonValue } from '@shared/types/json-value';

interface VersionedDeviceValues {
  schemaFingerprint: string;
  valuesBySerial: Record<string, Record<string, JsonValue>>;
}

export interface MultiDeviceWorkflowInputsState {
  applySharedDefaults(): void;
  deviceStates: Record<string, WorkflowInputsState>;
  shared: WorkflowInputsState;
  valid: boolean;
  valuesFor(adbSerial: string): Record<string, JsonValue>;
}

function cloneValues(values: Record<string, JsonValue>) {
  return structuredClone(values);
}

export function useMultiDeviceWorkflowInputs(
  inputSchema: JsonValue,
  selectedAdbSerials: readonly string[],
): MultiDeviceWorkflowInputsState {
  const schemaFingerprint = JSON.stringify(inputSchema);
  const shared = useWorkflowInputs(inputSchema);
  const [versionedValues, setVersionedValues] = useState<VersionedDeviceValues>(() => ({
    schemaFingerprint,
    valuesBySerial: {},
  }));
  const defaultDeviceValues = useMemo(() => initialWorkflowInputs(shared.schema), [shared.schema]);

  const effectiveValuesFor = useCallback(
    (adbSerial: string) =>
      versionedValues.schemaFingerprint === schemaFingerprint &&
      versionedValues.valuesBySerial[adbSerial] !== undefined
        ? versionedValues.valuesBySerial[adbSerial]
        : defaultDeviceValues,
    [defaultDeviceValues, schemaFingerprint, versionedValues],
  );

  const setDeviceValue = useCallback(
    (adbSerial: string, name: string, value: JsonValue | undefined) => {
      setVersionedValues((current) => {
        const valuesBySerial =
          current.schemaFingerprint === schemaFingerprint ? current.valuesBySerial : {};
        const currentValues = valuesBySerial[adbSerial] ?? defaultDeviceValues;
        const nextValues = { ...currentValues };
        if (value === undefined) delete nextValues[name];
        else nextValues[name] = value;
        return {
          schemaFingerprint,
          valuesBySerial: { ...valuesBySerial, [adbSerial]: nextValues },
        };
      });
    },
    [defaultDeviceValues, schemaFingerprint],
  );

  const deviceStates = useMemo(
    () =>
      Object.fromEntries(
        selectedAdbSerials.map((adbSerial) => {
          const values = effectiveValuesFor(adbSerial);
          const issues = shared.schema ? validateObjectValue(shared.schema, values) : [];
          const state: WorkflowInputsState = {
            issues,
            schema: shared.schema,
            schemaError: shared.schemaError,
            setValue: (name, value) => setDeviceValue(adbSerial, name, value),
            valid: shared.schema !== null && issues.length === 0,
            values,
          };
          return [adbSerial, state];
        }),
      ),
    [effectiveValuesFor, selectedAdbSerials, setDeviceValue, shared.schema, shared.schemaError],
  );

  const applySharedDefaults = useCallback(() => {
    setVersionedValues((current) => {
      const valuesBySerial =
        current.schemaFingerprint === schemaFingerprint ? { ...current.valuesBySerial } : {};
      for (const adbSerial of selectedAdbSerials) {
        valuesBySerial[adbSerial] = cloneValues(shared.values);
      }
      return { schemaFingerprint, valuesBySerial };
    });
  }, [schemaFingerprint, selectedAdbSerials, shared.values]);

  return {
    applySharedDefaults,
    deviceStates,
    shared,
    valid:
      selectedAdbSerials.length > 0 &&
      selectedAdbSerials.every((adbSerial) => deviceStates[adbSerial]?.valid === true),
    valuesFor: (adbSerial) => cloneValues(effectiveValuesFor(adbSerial)),
  };
}
