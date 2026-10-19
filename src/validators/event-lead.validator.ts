import { z } from 'zod';
import mongoose from 'mongoose';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { EVENT_LEAD_CITIES, EVENT_LEAD_GENDERS } from '@/models/event-lead.model';

const phoneField = (requiredMessage: string, invalidMessage: string, tooLongMessage: string) =>
  z
    .string()
    .trim()
    .min(6, requiredMessage)
    .max(30, tooLongMessage)
    .regex(/^[0-9\s\-+()]+$/, invalidMessage)
    // "+971 501234567": must be a valid number for its country code
    .refine((value) => isValidPhoneNumber(value), invalidMessage);

export const createEventLeadSchema = z
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
    mobileNumber: phoneField(
      'Mobile number is required',
      'Please enter a valid mobile number',
      'Mobile number is too long'
    ),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(254, 'Email is too long')
      .email('Please enter a valid email address')
      .transform((value) => value.toLowerCase()),
    gender: z.enum(EVENT_LEAD_GENDERS),
    nationality: z.string().trim().min(1, 'Nationality is required').max(120, 'Nationality is too long'),
    city: z.enum(EVENT_LEAD_CITIES, { message: 'Please select a valid Region/City' }),
    emergencyContactName: z
      .string()
      .trim()
      .min(1, 'Emergency contact name is required')
      .max(120, 'Emergency contact name is too long'),
    emergencyContactNumber: phoneField(
      'Emergency contact mobile number is required',
      'Please enter a valid emergency contact mobile number',
      'Emergency contact mobile number is too long'
    ),
    // _ids of the picked entries in the event's raceTracks
    raceTrackIds: z
      .array(z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), 'Invalid race location'))
      .min(1, 'Select at least one race location')
      .transform((values) => Array.from(new Set(values))),
  })
  .strict();

export type CreateEventLeadInput = z.infer<typeof createEventLeadSchema>;
