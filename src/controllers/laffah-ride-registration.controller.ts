import { Request, Response } from 'express';
import LaffahRideRegistration, {
  LAFFAH_RIDE_LOCATIONS,
} from '@/models/laffah-ride-registration.model';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { buildCsv, sendCsv } from '@/utils/csv';
import type { CreateLaffahRideRegistrationInput } from '@/validators/laffah-ride-registration.validator';
import dayjs from 'dayjs';

const buildFilter = (query: { location?: string }) => {
  const filter: Record<string, any> = {};
  if (query.location && (LAFFAH_RIDE_LOCATIONS as readonly string[]).includes(query.location)) {
    filter.raceLocations = query.location;
  }
  return filter;
};

/**
 * Public: Laffah Ride registration form submission.
 * POST /v1/laffah-ride-registrations
 */
export const createLaffahRideRegistration = asyncHandler(async (req: Request, res: Response) => {
  const { dateOfBirth, ...rest } = req.body as CreateLaffahRideRegistrationInput;

  const registration = await LaffahRideRegistration.create({
    ...rest,
    dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
  });

  sendSuccess(res, { id: registration._id }, 'Your registration has been received.', 201);
});

/**
 * List Laffah Ride registrations (dashboard).
 * GET /v1/laffah-ride-registrations?location=&page=&limit=
 * Admin only (route-gated)
 */
export const getLaffahRideRegistrations = asyncHandler(async (req: Request, res: Response) => {
  const { location, page = 1, limit = 20 } = req.query as {
    location?: string;
    page?: string;
    limit?: string;
  };

  const filter = buildFilter({ location });

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    LaffahRideRegistration.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    LaffahRideRegistration.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    'Laffah Ride registrations loaded',
    200
  );
});

/**
 * Export Laffah Ride registrations as CSV (same location filter as the list, no pagination).
 * GET /v1/laffah-ride-registrations/export?location=
 * Admin only (route-gated)
 */
export const exportLaffahRideRegistrations = asyncHandler(async (req: Request, res: Response) => {
  const { location } = req.query as { location?: string };

  const items = await LaffahRideRegistration.find(buildFilter({ location }))
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'FirstName',
    'LastName',
    'DateOfBirth',
    'MobileNumber',
    'Email',
    'Gender',
    'Nationality',
    'RegionCity',
    'RaceLocations',
    'SubmittedAt',
  ];
  const rows = items.map((item: any) => [
    item.firstName ?? '',
    item.lastName ?? '',
    item.dateOfBirth ? new Date(item.dateOfBirth).toISOString().slice(0, 10) : '',
    // Digits only, country code first (e.g. 971501051087)
    String(item.mobileNumber ?? '').replace(/\D/g, ''),
    item.email ?? '',
    item.gender ?? '',
    item.nationality ?? '',
    item.city ?? '',
    (item.raceLocations ?? []).join('; '),
    item.createdAt ? new Date(item.createdAt).toISOString() : '',
  ]);

  sendCsv(
    res,
    `laffah_ride_registrations_${dayjs().format('YYYY-MM-DD')}.csv`,
    buildCsv(headers, rows)
  );
});
