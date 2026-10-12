import { z } from 'zod';
import { LAFFAH_RIDE_CITIES, LAFFAH_RIDE_GENDERS, LAFFAH_RIDE_LOCATIONS } from '@/models/laffah-ride-registration.model';

export const createLaffahRideRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(120, 'First name is too long'),
    lastName: z.string().trim().min(1, 'Last name is required').max(120, 'Last name is too long'),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
      }, 'Please enter a valid date of birth'),
    mobileNumber: z
      .string()
      .trim()
      .min(6, 'Mobile number is required')
      .max(30, 'Mobile number is too long')
      .regex(/^[0-9\s\-+()]+$/, 'Please enter a valid mobile number'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(254, 'Email is too long')
      .email('Please enter a valid email address')
      .transform((value) => value.toLowerCase()),
    gender: z.enum(LAFFAH_RIDE_GENDERS),
    nationality: z.string().trim().min(1, 'Nationality is required').max(120, 'Nationality is too long'),
    city: z.enum(LAFFAH_RIDE_CITIES, { message: 'Please select a valid Region/City' }),
    raceLocations: z
      .array(z.enum(LAFFAH_RIDE_LOCATIONS))
      .min(1, 'Select at least one race location')
      .transform((values) => Array.from(new Set(values))),
  })
  .strict();

export type CreateLaffahRideRegistrationInput = z.infer<typeof createLaffahRideRegistrationSchema>;
