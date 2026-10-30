import { z } from 'zod';

export const loginResponseSchema = z
  .union([
    z.object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
    }),
    z.object({
      data: z.object({
        accessToken: z.string().min(1),
        refreshToken: z.string().min(1),
      }),
      statusCode: z.number().int(),
    }),
  ])
  .transform((response) => ('data' in response ? response.data : response));