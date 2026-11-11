import { z } from 'zod';

const fieldNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

const presentationFields = {
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10_000).optional(),
};

export const fieldValueSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('string'),
      ...presentationFields,
      minLength: z.number().int().nonnegative().max(10_000).optional(),
      maxLength: z.number().int().nonnegative().max(10_000).optional(),
      pattern: z.string().min(1).max(1_000).optional(),
      enum: z.array(z.string()).min(1).max(100).optional(),
      default: z.string().optional(),
    })
    .strict()
    .superRefine((schema, context) => {
      if (
        schema.minLength !== undefined &&
        schema.maxLength !== undefined &&
        schema.minLength > schema.maxLength
      ) {
        context.addIssue({ code: 'custom', message: 'minLength must not exceed maxLength' });
      }
      if (schema.enum && new Set(schema.enum).size !== schema.enum.length) {
        context.addIssue({ code: 'custom', message: 'enum values must be unique' });
      }
      if (schema.pattern) {
        try {
          new RegExp(schema.pattern);
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'pattern must be a valid regular expression',
          });
        }
      }
      if (schema.default !== undefined && !fieldValueIsValid(schema, schema.default)) {
        context.addIssue({ code: 'custom', message: 'default must satisfy the field constraints' });
      }
    }),
  z
    .object({
      type: z.literal('integer'),
      ...presentationFields,
      minimum: z.number().int().safe().optional(),
      maximum: z.number().int().safe().optional(),
      default: z.number().int().safe().optional(),
    })
    .strict()
    .superRefine((schema, context) => {
      if (
        schema.minimum !== undefined &&
        schema.maximum !== undefined &&
        schema.minimum > schema.maximum
      ) {
        context.addIssue({ code: 'custom', message: 'minimum must not exceed maximum' });
      }
      if (schema.default !== undefined && !fieldValueIsValid(schema, schema.default)) {
        context.addIssue({ code: 'custom', message: 'default must satisfy the field constraints' });
      }
    }),
  z
    .object({
      type: z.literal('boolean'),
      ...presentationFields,
      default: z.boolean().optional(),
    })
    .strict(),
]);

export const objectValueSchema = z
  .object({
    type: z.literal('object'),
    properties: z.record(z.string().regex(fieldNamePattern), fieldValueSchema),
    required: z.array(z.string().regex(fieldNamePattern)).max(100),
    additionalProperties: z.literal(false),
  })
  .strict()
  .superRefine(({ properties, required }, context) => {
    const requiredNames = new Set<string>();
    for (const [index, name] of required.entries()) {
      if (requiredNames.has(name)) {
        context.addIssue({
          code: 'custom',
          message: `Required field '${name}' must be unique`,
          path: ['required', index],
        });
      }
      requiredNames.add(name);
      if (!Object.hasOwn(properties, name)) {
        context.addIssue({
          code: 'custom',
          message: `Required field '${name}' must exist in properties`,
          path: ['required', index],
        });
      }
    }
  });

export type FieldValueSchema = z.infer<typeof fieldValueSchema>;
export type ObjectValueSchema = z.infer<typeof objectValueSchema>;

export interface ObjectValueIssue {
  field: string;
  code: 'invalid' | 'required' | 'unknown';
  message: string;
}

function matchesPattern(pattern: string | undefined, value: string) {
  if (!pattern) return true;
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

export function fieldValueIsValid(schema: FieldValueSchema, value: unknown): boolean {
  switch (schema.type) {
    case 'string':
      return (
        typeof value === 'string' &&
        (schema.minLength === undefined || value.length >= schema.minLength) &&
        (schema.maxLength === undefined || value.length <= schema.maxLength) &&
        (!schema.enum || schema.enum.includes(value)) &&
        matchesPattern(schema.pattern, value)
      );
    case 'integer':
      return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        (schema.minimum === undefined || value >= schema.minimum) &&
        (schema.maximum === undefined || value <= schema.maximum)
      );
    case 'boolean':
      return typeof value === 'boolean';
  }
}

export function validateObjectValue(
  schema: ObjectValueSchema,
  value: Readonly<Record<string, unknown>>,
): ObjectValueIssue[] {
  const issues: ObjectValueIssue[] = [];
  for (const field of schema.required) {
    if (!Object.hasOwn(value, field)) {
      issues.push({ field, code: 'required', message: `${field} is required` });
    }
  }
  for (const [field, fieldValue] of Object.entries(value)) {
    const property = schema.properties[field];
    if (!property) {
      issues.push({ field, code: 'unknown', message: `${field} is not supported` });
    } else if (!fieldValueIsValid(property, fieldValue)) {
      issues.push({ field, code: 'invalid', message: `${field} has an invalid value` });
    }
  }
  return issues;
}

function canonicalSchemaValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSchemaValue).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalSchemaValue(entry)}`)
    .join(',')}}`;
}

export function objectValueSchemasEqual(left: ObjectValueSchema, right: ObjectValueSchema) {
  return canonicalSchemaValue(left) === canonicalSchemaValue(right);
}

export function emptyObjectValueSchema(): ObjectValueSchema {
  return { type: 'object', properties: {}, required: [], additionalProperties: false };
}
