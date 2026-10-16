import { Request, Response } from 'express';
import mongoose from 'mongoose';
import dayjs from 'dayjs';
import Event from '@/models/event.model';
import EventLead from '@/models/event-lead.model';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { sendSuccess } from '@/utils/response';
import { buildCsv, sendCsv } from '@/utils/csv';
import { idOrSlugFilter } from '@/utils/slug';
import { getEffectiveEventStatus } from '@/utils/event-date';
import type { CreateEventLeadInput } from '@/validators/event-lead.validator';

// Same rule the public page uses: an Open event whose date has passed reads as Closed.
const REGISTRATION_CLOSED_STATUSES = ['Draft', 'Disabled', 'Archived', 'Closed', 'Completed'];

const paramValue = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const findInternalEvent = async (idOrSlug: string) => {
  const event = await Event.findOne(idOrSlugFilter(idOrSlug)).lean();
  if (!event || !event.isInternal) {
    throw new AppError('Event not found', 404);
  }
  return event;
};

const buildFilter = (eventId: mongoose.Types.ObjectId, trackId?: string) => {
  const filter: Record<string, any> = { eventId };
  if (trackId && mongoose.Types.ObjectId.isValid(trackId)) {
    filter['raceTracks.trackId'] = new mongoose.Types.ObjectId(trackId);
  }
  return filter;
};

/**
 * Public: internal event registration form submission.
 * POST /v1/events/:eventId/leads
 */
export const createEventLead = asyncHandler(async (req: Request, res: Response) => {
  const event = await findInternalEvent(paramValue(req.params.eventId));

  const status = getEffectiveEventStatus(event.eventDate, event.status) ?? '';
  if (REGISTRATION_CLOSED_STATUSES.includes(status)) {
    throw new AppError('Registration for this event is closed', 400);
  }

  const { dateOfBirth, raceTrackIds, ...rest } = req.body as CreateEventLeadInput;

  const tracksById = new Map((event.raceTracks ?? []).map((track) => [String(track._id), track]));
  const selectedTracks = raceTrackIds.map((id) => tracksById.get(id));
  if (selectedTracks.some((track) => !track)) {
    throw new AppError('Please select a valid race location', 400);
  }

  const lead = await EventLead.create({
    ...rest,
    eventId: event._id,
    dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
    raceTracks: selectedTracks.map((track) => ({
      trackId: track!._id,
      name: track!.name,
      date: track!.date,
      time: track!.time,
    })),
  });

  sendSuccess(res, { id: lead._id }, 'Your registration has been received.', 201);
});

/**
 * List an internal event's leads (dashboard).
 * GET /v1/events/:eventId/leads?trackId=&page=&limit=
 * Admin only (route-gated)
 */
export const getEventLeads = asyncHandler(async (req: Request, res: Response) => {
  const event = await findInternalEvent(paramValue(req.params.eventId));
  const { trackId, page = 1, limit = 20 } = req.query as {
    trackId?: string;
    page?: string;
    limit?: string;
  };

  const filter = buildFilter(event._id as mongoose.Types.ObjectId, trackId);

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    EventLead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    EventLead.countDocuments(filter),
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
    'Event leads loaded',
    200
  );
});

/**
 * Export an internal event's leads as CSV (same track filter as the list, no pagination).
 * GET /v1/events/:eventId/leads/export?trackId=
 * Admin only (route-gated)
 */
export const exportEventLeads = asyncHandler(async (req: Request, res: Response) => {
  const event = await findInternalEvent(paramValue(req.params.eventId));
  const { trackId } = req.query as { trackId?: string };

  const items = await EventLead.find(buildFilter(event._id as mongoose.Types.ObjectId, trackId))
    .sort({ createdAt: -1 })
    .lean();

  // One Yes/No column per track (in the event's track order) so the sheet can be filtered by location
  const trackColumns = (event.raceTracks ?? []).map((track) => ({
    id: String(track._id),
    name: track.name,
  }));

  const headers = [
    'FirstName',
    'LastName',
    'DateOfBirth',
    'MobileNumber',
    'Email',
    'Gender',
    'Nationality',
    'City',
    'EmergencyContactName',
    'EmergencyContactNumber',
    'RaceLocations',
    ...trackColumns.map((track) => track.name),
    'SubmittedAt',
  ];
  const rows = items.map((item) => {
    const pickedIds = new Set((item.raceTracks ?? []).map((track) => String(track.trackId)));
    return [
      item.firstName ?? '',
      item.lastName ?? '',
      item.dateOfBirth ? new Date(item.dateOfBirth).toISOString().slice(0, 10) : '',
      // Digits only, country code first (e.g. 971501051087)
      String(item.mobileNumber ?? '').replace(/\D/g, ''),
      item.email ?? '',
      item.gender ?? '',
      item.nationality ?? '',
      item.city ?? '',
      item.emergencyContactName ?? '',
      String(item.emergencyContactNumber ?? '').replace(/\D/g, ''),
      (item.raceTracks ?? []).map((track) => track.name).join('; '),
      ...trackColumns.map((track) => (pickedIds.has(track.id) ? 'Yes' : 'No')),
      item.createdAt ? new Date(item.createdAt).toISOString() : '',
    ];
  });

  const fileSlug = String(event.slug || event._id).replace(/[^a-z0-9-]+/gi, '_');
  sendCsv(res, `${fileSlug}_leads_${dayjs().format('YYYY-MM-DD')}.csv`, buildCsv(headers, rows));
});
