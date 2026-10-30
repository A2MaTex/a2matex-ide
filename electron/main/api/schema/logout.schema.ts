import { z } from 'zod';

export const logoutResponseSchema = z
  .union([
    z.object({ message: z.string().min(1) }),
    z.object({
      data: z.object({ message: z.string().min(1) }),
      statusCode: z.number().int(),
    }),
  ])
  .transform((response) => ('data' in response ? response.data : response));