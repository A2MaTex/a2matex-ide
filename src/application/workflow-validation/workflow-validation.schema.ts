import { z } from 'zod';

import { workflowValidationDiagnosticCodes } from '@application/workflow-validation/workflow-validation.constants';

const jsonObjectSchema = z.record(z.string(), z.json());

export const workflowValidationInputSchema = z
  .object({
    editorGraph: jsonObjectSchema,
  })
  .strict();

export const workflowValidationDiagnosticSchema = z
  .object({
    code: z.enum(workflowValidationDiagnosticCodes),
    message: z.string().min(1),
    nodeId: z.string().trim().min(1).max(100).optional(),
    edgeId: z.string().trim().min(1).max(100).optional(),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  })
  .strict();

export const workflowValidationOutputSchema = z
  .object({
    status: z.enum(['INVALID', 'VALID_WITH_WARNINGS', 'VALID']),
    errors: z.array(workflowValidationDiagnosticSchema).max(100),
    warnings: z.array(workflowValidationDiagnosticSchema).max(100),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.errors.length + output.warnings.length > 100) {
      context.addIssue({
        code: 'custom',
        message: 'Validation output cannot contain more than 100 diagnostics.',
      });
    }
    if (output.status === 'VALID' && (output.errors.length > 0 || output.warnings.length > 0)) {
      context.addIssue({
        code: 'custom',
        message: 'VALID output cannot contain diagnostics.',
      });
    }
    if (
      output.status === 'VALID_WITH_WARNINGS' &&
      (output.errors.length > 0 || output.warnings.length === 0)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'VALID_WITH_WARNINGS output must contain warnings and no errors.',
      });
    }
    if (output.status === 'INVALID' && output.errors.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'INVALID output must contain at least one error.',
      });
    }
  });

export const workflowValidationResponseSchema = z
  .object({
    data: workflowValidationOutputSchema,
    statusCode: z.literal(200),
  })
  .strict();
