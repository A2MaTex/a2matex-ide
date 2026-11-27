import { describe, expect, it } from 'vitest';

import type { ProjectDocument } from '@domain/project/project';
import {
  renameWorkflowInputBindings,
  validateWorkflowInputFields,
  workflowInputFieldsFromSchema,
  workflowInputRuntimeIncompatibilities,
  workflowInputSchemaFromFields,
  workflowInputUsage,
  type WorkflowInputField,
} from '@domain/workflow/workflow-inputs';

const field = (patch: Partial<WorkflowInputField>): WorkflowInputField => ({
  name: 'accountName',
  type: 'string',
  required: true,
  min: null,
  max: null,
  ...patch,
});

function documentWith(bindings: Record<string, Record<string, unknown>>): ProjectDocument {
  return {
    workflows: {
      'main.workflow.json': {
        nodes: [
          { id: 'n1', bindings },
          { id: 'n2', bindings: {} },
        ],
      },
    },
  } as unknown as ProjectDocument;
}

describe('workflow inputs', () => {
  it('writes only the keys the Runtime accepts', () => {
    const schema = workflowInputSchemaFromFields([
      field({ name: 'shopName', min: 1, max: 100 }),
      field({ name: 'quantity', type: 'integer', min: 1, max: 99 }),
      field({ name: 'useVip', type: 'boolean', required: false, min: 5 }),
    ]);
    expect(schema).toEqual({
      type: 'object',
      properties: {
        shopName: { type: 'string', minLength: 1, maxLength: 100 },
        quantity: { type: 'integer', minimum: 1, maximum: 99 },
        useVip: { type: 'boolean' },
      },
      required: ['shopName', 'quantity'],
      additionalProperties: false,
    });
    expect(workflowInputRuntimeIncompatibilities(schema)).toEqual([]);
  });

  it('round-trips fields through the schema', () => {
    const fields = [
      field({ name: 'shopName', min: 1 }),
      field({ name: 'price', type: 'number', required: false, max: 10.5 }),
    ];
    expect(workflowInputFieldsFromSchema(workflowInputSchemaFromFields(fields))).toEqual(fields);
  });

  it('flags stored fields the Runtime would reject', () => {
    const schema = {
      type: 'object',
      properties: {
        server: { type: 'string', enum: ['S1'], title: 'Server' },
        quantity: { type: 'integer', minimum: 1 },
      },
      required: [],
      additionalProperties: false,
    };
    expect(workflowInputRuntimeIncompatibilities(schema)).toEqual(['server']);
  });

  it('validates names and bounds', () => {
    const issues = validateWorkflowInputFields([
      field({ name: 'Account' }),
      field({ name: 'shop' }),
      field({ name: 'shop' }),
      field({ name: 'note', min: -1 }),
      field({ name: 'count', type: 'integer', min: 5, max: 2 }),
      field({ name: 'ratio', type: 'number', min: 1.5 }),
    ]);
    expect(issues.map(({ index, field: part }) => `${index}:${part}`)).toEqual([
      '0:name',
      '2:name',
      '3:min',
      '4:max',
    ]);
  });

  it('counts and renames workflow input bindings', () => {
    const document = documentWith({
      text: { kind: 'WORKFLOW_INPUT', inputName: 'accountName' },
      delay: { kind: 'LITERAL', value: 1 },
      label: { kind: 'WORKFLOW_INPUT', inputName: 'accountName' },
    });
    expect(workflowInputUsage(document).get('accountName')).toBe(2);

    const renamed = renameWorkflowInputBindings(
      document,
      new Map([['accountName', 'gameAccount']]),
    );
    expect(workflowInputUsage(renamed).get('gameAccount')).toBe(2);
    expect(workflowInputUsage(renamed).has('accountName')).toBe(false);
    expect(renameWorkflowInputBindings(document, new Map([['other', 'x']]))).toBe(document);
  });
});
