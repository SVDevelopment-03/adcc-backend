import { z } from 'zod';

export const createExampleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Valid email is required').min(1, 'Email is required'),
}).strict();

export type CreateExampleInput = z.infer<typeof createExampleSchema>;