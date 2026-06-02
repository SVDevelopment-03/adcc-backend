import { Request, Response } from 'express';
import { t } from "@/utils/i18n";
import Event from '@/models/event.model';
import EventResult from '@/models/eventResult.model';
import Track from '@/models/track.model';
import User from '@/models/user.model';
import { parseTimeToSeconds } from '@/utils/event-results.util';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import {
  incrementStatsOnJoin,
  decrementStatsOnCancel,
  addDistanceOnComplete,
  addPointsOnComplete,
} from '@/services/user-stats.service';
import dayjs from 'dayjs';
import { getEffectiveEventStatus, isEventCalendarDateInPast } from '@/utils/event-date';
import { randomInt } from 'node:crypto';
import mongoose, { type PipelineStage } from 'mongoose';
import { SupportedLanguage } from '@/utils/localization';
import  {localizeEventPayload}  from '@/utils/event-payload';
// import { localizeDocumentFields, SupportedLanguage, localizeEventStatic } from '@/utils/localization';
import {
  notifyAdminEventRegistration,
  notifyAdminTrackRideCompleted,
} from '@/services/admin-notification.service';
import {
  notifyEventPublished,
  notifyEventRegistrationConfirmed,
  notifyEventResultsPublished,
  notifyEventCancelled,
} from '@/services/event-notification.service';
import { notifyCommunityEventCreated } from '@/services/community-notification.service';

// const EVENT_LOCALIZED_FIELDS = {
//   title: 'titleAr',
//   description: 'descriptionAr',
//   address: 'addressAr',
// };

// const SCHEDULE_LOCALIZED_FIELDS = {
//   title: 'titleAr',
//   description: 'descriptionAr',
// };

// const localizeEventPayload = (event: Record<string, any>, lang: SupportedLanguage) => {
//   const payload = { ...event };
//   if (payload.eventDate && isEventCalendarDateInPast(new Date(payload.eventDate))) {
//     if (payload.status === 'Open' || payload.status === 'Full') {
//       payload.status = 'Closed';
//     }
//   }

//   const localizedEvent = localizeDocumentFields(payload, lang, EVENT_LOCALIZED_FIELDS);
  
//   // Localize static values
//   localizeEventStatic(localizedEvent, lang);

//   if (Array.isArray(localizedEvent.schedule)) {
//     localizedEvent.schedule = localizedEvent.schedule.map((item: Record<string, any>) =>
//       localizeDocumentFields(item, lang, SCHEDULE_LOCALIZED_FIELDS)
//     );
//   }

//   if (localizedEvent.communityId && typeof localizedEvent.communityId === 'object') {
//     localizedEvent.communityId = localizeDocumentFields(localizedEvent.communityId, lang, {
//       title: 'titleAr',
//     });
//   }

//   if (localizedEvent.trackId && typeof localizedEvent.trackId === 'object') {
//     localizedEvent.trackId = localizeDocumentFields(localizedEvent.trackId, lang, {
//       title: 'titleAr',
//     });
//   }

//   return localizedEvent;
// };

const normalizeGalleryImagesInput = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    // support form-data where array comes as JSON string
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        return [];
      }
    }

    return [trimmed];
  }

  return [];
};

const attachEventImages = async (req: AuthRequest, data: Record<string, any>) => {
  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  } | undefined;

  if (!files) return data;

  if (files.mainImage?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.mainImage[0].buffer,
      files.mainImage[0].mimetype,
      files.mainImage[0].originalname,
      'events'
    );
    data.mainImage = uploadResult.url;
  }
  if (files.eventImage?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.eventImage[0].buffer,
      files.eventImage[0].mimetype,
      files.eventImage[0].originalname,
      'events'
    );
    data.eventImage = uploadResult.url;
  }

  if (files.galleryImages?.length) {
    const uploadedGallery = await Promise.all(
      files.galleryImages.map(async (file) => {
        const uploaded = await uploadImageBufferToS3(
          file.buffer,
          file.mimetype,
          file.originalname,
          'events-galleries'
        );
        return uploaded.url;
      })
    );
    data.galleryImages = [...(data.galleryImages || []), ...uploadedGallery];
  }

  if(files.badgeImage?.length){
    const uploadResult = await uploadImageBufferToS3(
      files.badgeImage[0].buffer,
      files.badgeImage[0].mimetype,
      files.badgeImage[0].originalname,
      "badge-images"
    )

     data.badgeImage = uploadResult.url
  }

  if (files.galleryImage?.length) {
    const uploadedGallery = await Promise.all(
      files.galleryImage.map(async (file) => {
        const uploaded = await uploadImageBufferToS3(
          file.buffer,
          file.mimetype,
          file.originalname,
          'events-galleries'
        );
        return uploaded.url;
      })
    );
    data.galleryImages = [...(data.galleryImages || []), ...uploadedGallery];
  }

  return data;
};

const EVENT_RESULT_STATUS_ALIASES: Record<string, string> = {
  registered: 'joined',
  'checked-in': 'checked_in',
  checkedin: 'checked_in',
  'no-show': 'no_show',
  noshow: 'no_show',
};

const EVENT_RESULT_STATUSES = new Set([
  'joined',
  'cancelled',
  'completed',
  'checked_in',
  'no_show',
]);

const ACTIVE_PARTICIPANT_STATUSES = ['joined', 'checked_in', 'no_show', 'completed'] as const;

const generateParticipantCode = async (eventId: string): Promise<string> => {
  const code = (): string => randomInt(100000000000, 1000000000000).toString();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = code();
    const existingParticipant = await EventResult.exists({ eventId, participantCode: candidate });
    if (!existingParticipant) {
      return candidate;
    }
  }

  throw new AppError('Unable to generate participant code', 500);
};

const normalizeEventResultStatus = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const normalized = EVENT_RESULT_STATUS_ALIASES[key] ?? key;
  if (!EVENT_RESULT_STATUSES.has(normalized)) return null;
  return normalized;
};

const parseStatusFilter = (value: unknown): string[] | null => {
  if (!value) return null;
  const rawValues = Array.isArray(value) ? value : String(value).split(',');
  const statuses = rawValues
    .map((item) => normalizeEventResultStatus(String(item)))
    .filter((status): status is string => Boolean(status));
  if (statuses.length === 0) return null;
  return Array.from(new Set(statuses));
};

const escapeCsvValue = (value: unknown): string => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const getRouteParam = (value?: string | string[]): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

const normalizeRegistrationFee = (data: Record<string, any>) => {
  const hasType = Object.prototype.hasOwnProperty.call(data, 'registrationFeeType');
  const incomingType = data.registrationFeeType;
  const amountValue = Number(data.registrationFeeAmount);
  const amount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : 0;
  const type = hasType
    ? (incomingType === 'paid' ? 'paid' : 'free')
    : (amount > 0 ? 'paid' : 'free');

  data.registrationFeeType = type;
  data.registrationFeeAmount = type === 'paid' ? amount : 0;
};

const buildEventResultsPipeline = (eventId: string, statuses?: string[]): PipelineStage[] => {
  const matchStage: Record<string, any> = {
    eventId: new mongoose.Types.ObjectId(eventId),
  };
  if (statuses && statuses.length > 0) {
    matchStage.status = { $in: statuses };
  }

  return [
    { $match: matchStage },
    {
      $addFields: {
        eventTimeInSeconds: {
          $cond: {
            if: { $and: [{ $ne: ["$time", null] }, { $ne: ["$time", ""] }] },
            then: {
              $add: [
                {
                  $multiply: [
                    {
                      $convert: {
                        input: { $substr: ["$time", 0, 2] },
                        to: "int",
                        onError: 0,
                        onNull: 0
                      }
                    },
                    3600
                  ]
                },
                {
                  $multiply: [
                    {
                      $convert: {
                        input: { $substr: ["$time", 3, 2] },
                        to: "int",
                        onError: 0,
                        onNull: 0
                      }
                    },
                    60
                  ]
                }
              ]
            },
            else: 0
          }
        }
      }
    },
    { $sort: { eventTimeInSeconds: 1 } },
    {
      $setWindowFields: {
        sortBy: { eventTimeInSeconds: 1 },
        output: {
          rank: {
            $rank: {},
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $lookup: {
        from: 'events',
        localField: 'eventId',
        foreignField: '_id',
        as: 'event',
      },
    },
    {
      $unwind: {
        path: '$event',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'communities',
        localField: 'event.communityId',
        foreignField: '_id',
        as: 'community',
      },
    },
    {
      $unwind: {
        path: '$community',
        preserveNullAndEmptyArrays: true,
      },
    },
  ];
};

const getRegisteredParticipantCount = async (eventId: string): Promise<number> => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) return 0;

  return EventResult.countDocuments({
    eventId: new mongoose.Types.ObjectId(eventId),
    status: { $in: ACTIVE_PARTICIPANT_STATUSES as unknown as string[] },
  } as any);
};

const ensureEventExists = async (eventId: string, lang: SupportedLanguage) => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }
  const event = await Event.findById(eventId).select('title titleAr eventDate communityId');
  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }
  return event;
};

/**
 * Create new event
 * POST /v1/events
 * Admin only
 */
export const createEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const eventData = {
    ...req.body,
    titleAr: req.body.titleAr || req.body.title,
    descriptionAr: req.body.descriptionAr || req.body.description,
    addressAr: req.body.addressAr || req.body.address,
    schedule: Array.isArray(req.body.schedule)
      ? req.body.schedule.map((item: Record<string, any>) => ({
          ...item,
          titleAr: item.titleAr || item.title,
          descriptionAr: item.descriptionAr || item.description,
        }))
      : req.body.schedule,
    eventDate: req.body.eventDate ? new Date(req.body.eventDate) : undefined,
    createdBy: userId,
  };

  normalizeRegistrationFee(eventData);

  await attachEventImages(req, eventData);

  const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
  const bodyGallery = normalizeGalleryImagesInput((req.body as any).gallery);
  const mergedGalleryImages = [
    ...(eventData.galleryImages || []),
    ...bodyGalleryImages,
    ...bodyGallery,
  ];
  if (mergedGalleryImages.length > 0) {
    eventData.galleryImages = mergedGalleryImages;
  }

  if (eventData.eventDate && isEventCalendarDateInPast(eventData.eventDate)) {
    throw new AppError(t(lang, 'event.past_date_not_allowed'), 400);
  }

  const event = await Event.create(eventData);
  const localizedEvent = localizeEventPayload(event.toObject(), lang);

  if (event.status === 'Open') {
    void notifyEventPublished(String(event._id));
    if (event.communityId) {
      void notifyCommunityEventCreated({
        communityId: String(event.communityId),
        eventId: String(event._id),
        eventTitle: event.title,
        url: `/events/${event._id}`,
      });
    }
  }

  sendSuccess(res, localizedEvent, t(lang, "event.created"), 201);
});

/**
 * Get all events
 * GET /v1/events
 * Public – guest-accessible. Optional query filters and pagination.
 */
export const getAllEvents = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { status, page = 1, limit = 10 } = req.query;

  // Build filter object
  const filter: any = {};

  if (status) filter.status = status;

  // Past events should not appear as "open" or "full" in listings
  if (status === 'Open' || status === 'Full') {
    filter.eventDate = { $gte: dayjs().startOf('day').toDate() };
  }

  // Pagination
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const eventsQuery = Event.find(filter as any)
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr')
    .populate('communityId', 'title titleAr')
    .sort({ eventDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Run list + count in parallel to reduce endpoint latency.
  const [events, total] = await Promise.all([eventsQuery, Event.countDocuments(filter as any)]);

  const localizedEvents = await Promise.all(
    events.map(async (event) => {
      const localizedEvent = localizeEventPayload(event as Record<string, any>, lang);
      localizedEvent.currentParticipants = await getRegisteredParticipantCount(String(event._id));
      return localizedEvent;
    })
  );

  sendSuccess(
    res,
    {
      events: localizedEvents,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, "event.allEvents"), 201
  );
});

/**
 * Get completed event analytics for graphing in frontend.
 * GET /v1/events/completed-stats?from=2026-01-01&to=2026-04-01&groupBy=day
 * Staff only.
 */
export const getCompletedEventStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;

  const fromQuery = typeof req.query.from === 'string' ? req.query.from : undefined;
  const toQuery = typeof req.query.to === 'string' ? req.query.to : undefined;
  const groupByQuery = typeof req.query.groupBy === 'string' ? req.query.groupBy : 'day';

  const groupBy = groupByQuery === 'month' ? 'month' : 'day';
  const toDate = toQuery ? new Date(toQuery) : new Date();
  const fromDate = fromQuery
    ? new Date(fromQuery)
    : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppError(t(lang, 'common.bad_request'), 400);
  }
  if (fromDate > toDate) {
    throw new AppError(t(lang, 'common.bad_request'), 400);
  }

  const rangeFilter = {
    status: 'Completed',
    eventDate: {
      $gte: fromDate,
      $lte: toDate,
    },
  };

  const format = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const series = await Event.aggregate([
    { $match: rangeFilter },
    {
      $group: {
        _id: {
          $dateToString: {
            format,
            date: '$eventDate',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const [totalCompletedEvents, rangeCompletedEvents] = await Promise.all([
    Event.countDocuments({ status: 'Completed' } as any),
    Event.countDocuments(rangeFilter as any),
  ]);

  sendSuccess(
    res,
    {
      summary: {
        totalCompletedEvents,
        rangeCompletedEvents,
      },
      range: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        groupBy,
      },
      series: series.map((item) => ({
        label: String(item._id),
        count: Number(item.count || 0),
      })),
    },
    'Completed event stats retrieved',
    200
  );
});

/**
 * Get event by ID
 * GET /v1/events/:id
 * Public – guest-accessible.
 */
export const getEventById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
   console.log("local-e",lang)
  const { id } = req.params;

  const event = await Event.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr')
    .populate('communityId', 'title titleAr');

  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  const localizedEvent = localizeEventPayload(event.toObject(), lang);
  localizedEvent.currentParticipants = await getRegisteredParticipantCount(String(event._id));

  sendSuccess(res, localizedEvent, t(lang, "event.eventDetails"), 201);
});

/**
 * Update event
 * PATCH /v1/events/:id
 * Admin only
 */
export const updateEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  const previousEvent = await Event.findById(id).select('status publishedNotificationSentAt resultsNotificationSentAt cancelledNotificationSentAt').lean();
  const updateData = { ...req.body };
  if ('registrationFeeType' in updateData || 'registrationFeeAmount' in updateData) {
    normalizeRegistrationFee(updateData);
  }

  await attachEventImages(req, updateData);

  const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
  const bodyGallery = normalizeGalleryImagesInput((req.body as any).gallery);
  const mergedGalleryImages = [
    ...(updateData.galleryImages || []),
    ...bodyGalleryImages,
    ...bodyGallery,
  ];
  if (mergedGalleryImages.length > 0) {
    updateData.galleryImages = mergedGalleryImages;
  }

  // Convert eventDate string to Date if provided
  if (updateData.eventDate) {
    updateData.eventDate = new Date(updateData.eventDate);
    if (isEventCalendarDateInPast(updateData.eventDate)) {
      throw new AppError(t(lang, 'event.past_date_not_allowed'), 400);
    }
    updateData.reminder24hSentAt = null;
    updateData.reminder1hSentAt = null;
  }

  if (updateData.title && !updateData.titleAr) {
    updateData.titleAr = updateData.title;
  }
  if (updateData.description && !updateData.descriptionAr) {
    updateData.descriptionAr = updateData.description;
  }
  if (updateData.address && !updateData.addressAr) {
    updateData.addressAr = updateData.address;
  }
  if (Array.isArray(updateData.schedule)) {
    updateData.schedule = updateData.schedule.map((item: Record<string, any>) => ({
      ...item,
      titleAr: item.titleAr || item.title,
      descriptionAr: item.descriptionAr || item.description,
    }));
  }

  const event = await Event.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr')
    .populate('communityId', 'title titleAr');

  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  if (updateData.status === 'Open' && previousEvent?.status !== 'Open') {
    void notifyEventPublished(String(event._id));
    if (event.communityId) {
      void notifyCommunityEventCreated({
        communityId: String(event.communityId),
        eventId: String(event._id),
        eventTitle: event.title,
        url: `/events/${event._id}`,
      });
    }
  }

  if (updateData.status === 'Completed' && previousEvent?.status !== 'Completed') {
    void notifyEventResultsPublished(String(event._id));
  }

  if (updateData.status === 'Disabled' && previousEvent?.status !== 'Disabled') {
    void notifyEventCancelled(String(event._id));
  }

  sendSuccess(res, localizeEventPayload(event.toObject(), lang), t(lang, "event.updated"), 201);
});

/**
 * Delete event
 * DELETE /v1/events/:id
 * Admin only
 */
export const deleteEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  const event = await Event.findByIdAndDelete(id);

  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  sendSuccess(res, null, t(lang, "event.deleted"), 201);
});

const updateEventStatus = async (
  eventId: string,
  status: 'Draft' | 'Open' | 'Full' | 'Closed' | 'Disabled' | 'Completed' | 'Archived',
  lang: SupportedLanguage
) => {
  const previous = await Event.findById(eventId).select('status publishedNotificationSentAt resultsNotificationSentAt cancelledNotificationSentAt').lean();
  const event = await Event.findByIdAndUpdate(
    eventId,
    { status },
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr')
    .populate('communityId', 'title titleAr');

  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  if (status === 'Open' && previous?.status !== 'Open') {
    void notifyEventPublished(String(event._id));
    if (event.communityId) {
      void notifyCommunityEventCreated({
        communityId: String(event.communityId),
        eventId: String(event._id),
        eventTitle: event.title,
        url: `/events/${event._id}`,
      });
    }
  }

  if (status === 'Completed' && previous?.status !== 'Completed') {
    void notifyEventResultsPublished(String(event._id));
  }

  if (status === 'Disabled' && previous?.status !== 'Disabled') {
    void notifyEventCancelled(String(event._id));
  }

  return event;
};

/**
 * Close event registration
 * PATCH /v1/events/:eventId/close-registration
 * Admin only
 */
export const closeEventRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;

  const event = await updateEventStatus(eventId, 'Closed', lang);
  sendSuccess(res, localizeEventPayload(event.toObject(), lang), t(lang, "event.registration_closed"), 200);
});

/**
 * Re-open event registration
 * PATCH /v1/events/:eventId/reopen-registration
 * Admin only
 */
export const reopenEventRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;

  const existing = await Event.findById(eventId).select('eventDate');
  if (!existing) {
    throw new AppError(t(lang, 'event.not_found'), 404);
  }
  if (isEventCalendarDateInPast(existing.eventDate)) {
    throw new AppError(t(lang, 'event.cannot_reopen_past_event'), 400);
  }

  const event = await updateEventStatus(eventId, 'Open', lang);
  sendSuccess(res, localizeEventPayload(event.toObject(), lang), t(lang, "event.registration_reopened"), 200);
});

/**
 * Mark event as completed
 * PATCH /v1/events/:eventId/complete
 * Admin only
 */
export const completeEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;

  const event = await updateEventStatus(eventId, 'Completed', lang);
  sendSuccess(res, localizeEventPayload(event.toObject(), lang), t(lang, "event.marked_completed"), 200);
});

/**
 * Disable event
 * PATCH /v1/events/:eventId/disable
 * Admin only
 */
export const disableEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;

  const event = await updateEventStatus(eventId, 'Disabled', lang);
  sendSuccess(res, localizeEventPayload(event.toObject(), lang), t(lang, "event.disabled"), 200);
});


/*
* Status update event results
*/

export const getEventResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { eventId } = req.params;
  const userId = req.user?.id;
  
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }
  const eventResults = await EventResult.findOne({ eventId, userId });
  if (!eventResults) {
    throw new AppError(t(lang, "event.not_member"), 400);
  }

  if (eventResults.time) {
    throw new AppError(t(lang, 'event.already_submitted'), 400);
  }

  const eventDoc = await Event.findById(eventId).select('trackId title').lean();
  const hasTrack = !!eventDoc?.trackId;

  const distanceKm = Number(req.body.distance) || 0;
  const defaultCompletionPoints = 30;
  const updates: Record<string, unknown> = {
    distance: distanceKm,
    time: req.body.time,
    status: 'completed',
    pointsEarned: defaultCompletionPoints,
  };
  if (eventResults.status === 'no_show') updates.noShowAt = null;
  if (req.body.calories != null) updates.calories = req.body.calories;
  if (req.body.elevationGain != null) updates.elevationGain = String(req.body.elevationGain).trim() || null;
  if (req.body.rating != null) updates.rating = req.body.rating;
  if (req.body.notes != null) updates.notes = String(req.body.notes).trim() || null;
  eventResults.set(updates);

  await eventResults.save();

  await addDistanceOnComplete(userId, distanceKm, hasTrack);
  await addPointsOnComplete(userId, defaultCompletionPoints);

  const userDoc = await User.findById(userId).select('fullName').lean();
  void notifyAdminTrackRideCompleted({
    participantName: userDoc?.fullName?.trim() || 'Member',
    eventTitle: eventDoc?.title || 'Event',
    eventId: String(eventId),
  });

  sendSuccess(res, eventResults, t(lang, "event.submitted"), 201);
});


/*
* Join Event 
*/
export const joinEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;
  // console.log('body', req.body);
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  if (isEventCalendarDateInPast(event.eventDate)) {
    throw new AppError(t(lang, 'event.join_not_available'), 400);
  }
  if (event.status !== 'Open') {
    throw new AppError(t(lang, 'event.join_not_available'), 400);
  }

  const eventJoin = await EventResult.findOne({
    eventId,
    userId,
  });

  if (eventJoin) {
    if (['joined', 'checked_in', 'no_show'].includes(eventJoin.status)) {
      throw new AppError(t(lang, "event.already_joined"), 400);
    }

    if (eventJoin.status === 'completed') {
      throw new AppError(t(lang, "event.completed"), 400);
    }

    if (!eventJoin.participantCode) {
      eventJoin.participantCode = await generateParticipantCode(String(eventId));
    }

    eventJoin.set({
      status: 'joined',
      checkedInAt: null,
      noShowAt: null,
    });
    await eventJoin.save();

    await Event.updateOne({ _id: eventId }, { $inc: { currentParticipants: 1 } });

    await incrementStatsOnJoin(userId);

    void notifyEventRegistrationConfirmed({ eventId: String(eventId), userId });

    const regUser = await User.findById(userId).select('fullName').lean();
    void notifyAdminEventRegistration({
      participantName: regUser?.fullName?.trim() || 'Member',
      eventTitle: event.title || 'Event',
      eventId: String(eventId),
    });

    return sendSuccess(
      res,
      eventJoin,
      t(lang, "event.rejoinEvent"),
      200
    );
  }

  const eventData = await EventResult.create({
    eventId,
    userId,
    status: 'joined',
    participantCode: await generateParticipantCode(String(eventId)),
  });

  await Event.updateOne({ _id: eventId }, { $inc: { currentParticipants: 1 } });

  await incrementStatsOnJoin(userId);

  void notifyEventRegistrationConfirmed({ eventId: String(eventId), userId });

  const joinUser = await User.findById(userId).select('fullName').lean();
  void notifyAdminEventRegistration({
    participantName: joinUser?.fullName?.trim() || 'Member',
    eventTitle: event.title || 'Event',
    eventId: String(eventId),
  });

  return sendSuccess(
    res,
    eventData,
    t(lang, "event.joinEvent"),
    201
  );
});


/**
 * Get event results list
 * GET /v1/events/:eventId/results
 * Public – guest-accessible.
 */
export const getEventResultsList = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventIdParam = getRouteParam(req.params.eventId);
  if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }
  const statusFilter = parseStatusFilter(req.query.status);

  const resultsPipeline: PipelineStage[] = [
    ...buildEventResultsPipeline(eventIdParam, statusFilter || undefined),
    {
      $project: {
        distance: 1,
        time: 1,
        rank: 1,
        participantCode: 1,
        createdAt: 1,
        status: 1,
        checkedInAt: 1,
        noShowAt: 1,
        reason: 1,
        pointsEarned: 1,
        'user._id': 1,
        'user.fullName': 1,
        'user.email': 1,
        'event._id': 1,
        'event.title': 1,
        'event.eventDate': 1,
        'community._id': 1,
        'community.title': 1,
      },
    },
  ];

  const eventResults = await EventResult.aggregate(resultsPipeline);

  sendSuccess(res, eventResults, t(lang, 'event.results_retrieved'), 201);
});

/**
 * Mark participant as checked-in
 * PATCH /v1/events/:eventId/participants/:userId/check-in
 * Admin only
 */
export const markParticipantCheckedIn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = getRouteParam(req.params.eventId);
  const userId = getRouteParam(req.params.userId);

  // console.log('body',req.body);
  await ensureEventExists(eventId, lang);

  const eventResult = await EventResult.findOne({ eventId, userId });
  if (!eventResult) {
    throw new AppError(t(lang, "event.not_member"), 400);
  }

  if (eventResult.status === 'completed') {
    throw new AppError(t(lang, "event.completed"), 400);
  }

  eventResult.set({
    status: 'checked_in',
    checkedInAt: new Date(),
    noShowAt: null,
  });

  await eventResult.save();

  sendSuccess(res, eventResult, t(lang, "event.participant_checked_in"), 200);
});

/**
 * Mark participant as no-show
 * PATCH /v1/events/:eventId/participants/:userId/no-show
 * Admin only
 */
export const markParticipantNoShow = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = getRouteParam(req.params.eventId);
  const userId = getRouteParam(req.params.userId);

  await ensureEventExists(eventId, lang);

  const eventResult = await EventResult.findOne({ eventId, userId });
  if (!eventResult) {
    throw new AppError(t(lang, "event.not_member"), 400);
  }

  if (eventResult.status === 'completed') {
    throw new AppError(t(lang, "event.completed"), 400);
  }

  eventResult.set({
    status: 'no_show',
    noShowAt: new Date(),
    checkedInAt: null,
  });

  await eventResult.save();

  sendSuccess(res, eventResult, t(lang, "event.participant_no_show"), 200);
});

/**
 * Remove participant from event
 * DELETE /v1/events/:eventId/participants/:userId
 * Admin only
 */
export const removeEventParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = getRouteParam(req.params.eventId);
  const userId = getRouteParam(req.params.userId);

  await ensureEventExists(eventId, lang);

  const eventResult = await EventResult.findOne({ eventId, userId });
  if (!eventResult) {
    throw new AppError(t(lang, "event.not_member"), 400);
  }

  if (eventResult.status === 'completed') {
    throw new AppError(t(lang, "event.completed"), 400);
  }

  await EventResult.deleteOne({ _id: eventResult._id });

  if (['joined', 'checked_in', 'no_show'].includes(eventResult.status)) {
    await Event.updateOne(
      { _id: eventId, currentParticipants: { $gt: 0 } },
      { $inc: { currentParticipants: -1 } }
    );
    await decrementStatsOnCancel(userId);
  }

  sendSuccess(res, null, t(lang, "event.participant_removed"), 200);
});

/**
 * Bulk check-in all registered participants
 * PATCH /v1/events/:eventId/participants/check-in-all
 * Admin only
 */
export const checkInAllRegisteredParticipants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = getRouteParam(req.params.eventId);
  
  await ensureEventExists(eventId, lang);

  const now = new Date();
  const result = await EventResult.updateMany(
    { eventId, status: 'joined' },
    { 
      $set: { status: 'checked_in', checkedInAt: now, noShowAt: null }
     }
  );

  let messageKey = "event.participants_checked_in";

  if (result.matchedCount === 0) {
    messageKey = "event.no_joined_users";
  }

  sendSuccess(
    res,
    { matched: result.matchedCount,
      modified: result.modifiedCount
    },
    t(lang, messageKey),
    200
  );
});

/**
 * Bulk mark all registered participants as no-show
 * PATCH /v1/events/:eventId/participants/no-show-all
 * Admin only
 */
export const markAllParticipantsNoShow = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = getRouteParam(req.params.eventId);

  await ensureEventExists(eventId, lang);

  const now = new Date();
  const result = await EventResult.updateMany(
    { eventId, status: 'joined' },
    { 
      $set: { status: 'no_show', noShowAt: now, checkedInAt: null }
    }
  );
  let messageKey = "event.participants_no_show";

  if (result.matchedCount === 0) {
    messageKey = "event.no_joined_users_no_show";
  }

  sendSuccess(
    res,
    { matched: result.matchedCount, modified: result.modifiedCount },
    t(lang, messageKey), 200
  );
});

/**
 * Export event results (CSV)
 * GET /v1/events/:eventId/results/export
 * Admin only
 */
export const exportEventResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventIdParam = getRouteParam(req.params.eventId);

  if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }

  const statusFilter = parseStatusFilter(req.query.status);
  const event = await ensureEventExists(eventIdParam, lang);

  const exportPipeline: PipelineStage[] = [
    ...buildEventResultsPipeline(eventIdParam, statusFilter || undefined),
    {
      $project: {
        distance: 1,
        time: 1,
        rank: 1,
        participantCode: 1,
        createdAt: 1,
        status: 1,
        checkedInAt: 1,
        noShowAt: 1,
        reason: 1,
        pointsEarned: 1,
        'user.fullName': 1,
        'user.email': 1,
        'event.title': 1,
        'event.eventDate': 1,
        'community.title': 1,
      },
    },
  ];

  const rows = await EventResult.aggregate(exportPipeline);

  const headers = [
    'ParticipantID',
    'Name',
    'Email',
    'Status',
    'RegisteredAt',
    'CheckedInAt',
    'NoShowAt',
    'Rank',
    'Time',
    'Distance',
    'Points',
    'Reason',
    'Event',
    'EventDate',
    'Community',
  ];

  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows as any[]) {
    lines.push(
      [
        row.participantCode ?? row._id ?? '',
        row.user?.fullName ?? '',
        row.user?.email ?? '',
        row.status ?? '',
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        row.checkedInAt ? new Date(row.checkedInAt).toISOString() : '',
        row.noShowAt ? new Date(row.noShowAt).toISOString() : '',
        row.rank ?? '',
        row.time ?? '',
        row.distance ?? '',
        row.pointsEarned ?? '',
        row.reason ?? '',
        row.event?.title ?? (lang === 'ar' ? event.titleAr || event.title : event.title),
        row.event?.eventDate ? new Date(row.event.eventDate).toISOString() : '',
        row.community?.title ?? '',
      ].map(escapeCsvValue).join(',')
    );
  }

  const fileNameBase = (event.title || 'event').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const fileName = `${fileNameBase || 'event'}_results.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(lines.join('\n'));
});

/**
 * Add images to event gallery
 * POST /v1/events/:eventId/gallery
 * Admin only
 */
export const addEventGalleryImages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { eventId } = req.params;
  const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, "auth.unauthorized"), 401);
    }

  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  } | undefined;

  const galleryFiles = [
    ...(files?.galleryImages || []),
    ...(files?.galleryImage || []),
  ];

  const uploadedImageUrls = await Promise.all(
    galleryFiles.map(async (file) => {
      const uploaded = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        'events-galleries'
      );
      return uploaded.url;
    })
  );
      
  const bodyImages = normalizeGalleryImagesInput((req.body as any)?.images);
  const bodyImage = normalizeGalleryImagesInput((req.body as any)?.galleryImage);
  const images = [...uploadedImageUrls, ...bodyImages, ...bodyImage];

  if (images.length === 0) {
    throw new AppError('At least one image is required', 400);
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError(t(lang, 'event.not_found'), 404);
  }

  const existingImages = new Set(event.galleryImages || []);
  const newImages = images.filter((imageUrl: string) => !existingImages.has(imageUrl));

  if (newImages.length === 0) {
    throw new AppError('All images already exist in gallery', 400);
  }

  const updatedEvent = await Event.findByIdAndUpdate(
    eventId,
    { $addToSet: { galleryImages: { $each: newImages } } },
    { new: true }
  )
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr')
    .populate('communityId', 'title titleAr');

  if (!updatedEvent) {
    throw new AppError(t(lang, 'event.not_found'), 500);
  }

  sendSuccess(
    res,
    {
      event: localizeEventPayload(updatedEvent.toObject(), lang),
      addedImages: newImages,
      totalImages: updatedEvent.galleryImages?.length || 0,
    },
    'Event gallery images added successfully',
    201
  );
});

/**
 * Cancel event participation
 */
export const cancelRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  // console.log('bodyResponse:', req.body);
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId  = req.params.eventId;
  const reason = req.body.reason || 'No reason provided';
  
  
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  if (!reason || reason.trim().length === 0) {
    throw new AppError(t(lang, "event.reason_required"), 400);
  }

  const event = await EventResult.findOne({ eventId, userId });
  if (!event) {
    throw new AppError(t(lang, "event.not_member"), 400);
  }

  if (event.status === 'cancelled') {
    throw new AppError(t(lang, "event.cancelledEvent"), 400);
  }

  if (event.status === 'completed') {
    throw new AppError(t(lang, "event.completed"), 400);
  }

  const previousStatus = event.status;

  event.set({
    reason,
    status: 'cancelled',
  });
  await event.save();

  if (['joined', 'checked_in', 'no_show'].includes(previousStatus)) {
    await Event.updateOne(
      { _id: eventId, currentParticipants: { $gt: 0 } },
      { $inc: { currentParticipants: -1 } }
    );
  }


  await decrementStatsOnCancel(userId);

  sendSuccess(res, event, t(lang, "event.participationCancelled"), 201);
});


/**
 * Add to calendar
 * GET /v1/events/:id/add-to-calendar
 **/

 export const addToCalendar = asyncHandler(async (req: AuthRequest, res: Response) => {
  
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = req.params.eventId;
  const userId = req.params.userId;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const event = await Event.findById(eventId);
  if (!event) throw new AppError(t(lang, 'event.not_found'), 404);

  // Optional: only allow joined users
  if (userId) {
    const joined = await EventResult.findOne({
      eventId,
      userId: userId,
      status: { $in: ['joined', 'checked_in'] },
    });

    if (!joined) {
      throw new AppError(t(lang, 'event.not_joined'), 403);
    }
  }

  const start = dayjs(event.eventDate);
  const end = start.add(event.distance || 60);

  // Google Calendar URL
  const googleCalendarUrl = `https://www.google.com/calendar/render?action=TEMPLATE
    &text=${encodeURIComponent(lang === 'ar' ? event.titleAr || event.title : event.title)}
    &dates=${start.format('YYYYMMDDTHHmmss')}Z/${end.format('YYYYMMDDTHHmmss')}Z
    &details=${encodeURIComponent(lang === 'ar' ? event.descriptionAr || event.description || '' : event.description || '')}
  `.replace(/\s+/g, '');

  sendSuccess(
    res,
    { googleCalendarUrl },
    t(lang, 'event.calendar_link'),
    200
  );
});

/**
 * Get member event status
 * GET /v1/events/:eventId/member-status
 * Returns whether the authenticated user has joined the event and their status
 */
export const getMemberEventStatus = asyncHandler(async (req: AuthRequest, res: Response) => {

  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventId = req.params.eventId;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  // If userId is not a valid ObjectId (e.g., guest tokens use string ids like 'guest_xxx'),
  // avoid querying EventResult with an invalid ObjectId which causes a CastError.
  const isUserObjectId = mongoose.Types.ObjectId.isValid(String(userId));

  // Check if event exists
  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  // Check user's participation status — only query if userId can be cast to ObjectId
  const eventResult = isUserObjectId
    ? await EventResult.findOne({ eventId, userId })
    : null;

  let status: "joined" | "not_joined" = "not_joined";
  let participationDetails = null;

  if (eventResult) {
    const rawStatus = eventResult.status;

    // Normalize status for frontend
    if (rawStatus === "joined" || rawStatus === "checked_in") {
      status = "joined";
    } else {
      status = "not_joined";
    }

    // status = eventResult.status; // 'joined', 'cancelled', 'completed', 'checked_in', 'no_show'
    participationDetails = {
      joinedAt: eventResult.createdAt?.toISOString(),
      rawStatus,
      distance: eventResult.distance,
      time: eventResult.time,
      reason: eventResult.reason,
      checkedInAt: eventResult.checkedInAt,
      noShowAt: eventResult.noShowAt,
    };
  }

  sendSuccess(
    res,
    {
      eventId,
      userId,
      status,
      participationDetails,
      event: {
        title: lang === 'ar' ? event.titleAr || event.title : event.title,
        eventDate: event.eventDate,
        status: getEffectiveEventStatus(event.eventDate, event.status),
      }
    },
    t(lang, "event.status_retrieved"),
    200
  );
});

/**
 * Get event completed summary (ride summary for "Ride Completed!" screen)
 * GET /v1/events/:eventId/completed-summary
 * Returns distance, duration, avg speed, elevation, badge, etc. for the authenticated user's completed result.
 */
export const getEventCompletedSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventIdParam = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }

  const eventResult = await EventResult.findOne({
    eventId: eventIdParam,
    userId,
    status: 'completed',
  }).lean();

  if (!eventResult || !eventResult.time) {
    throw new AppError(t(lang, 'event.completed_summary_not_found'), 404);
  }

  const event = await Event.findById(eventIdParam)
    .select('title titleAr eventDate trackId')
    .lean();

  if (!event) {
    throw new AppError(t(lang, 'event.not_found'), 404);
  }

  let elevationGain: string | null = eventResult.elevationGain ?? null;
  if (elevationGain == null && event.trackId) {
    const track = await Track.findById(event.trackId).select('elevation').lean();
    if (track?.elevation != null) {
      elevationGain = String(track.elevation);
    }
  }

  const distanceKm = eventResult.distance ?? 0;
  const duration = eventResult.time;
  const seconds = parseTimeToSeconds(eventResult.time);
  const avgSpeedKmh =
    seconds != null && seconds > 0 && distanceKm > 0
      ? Math.round((distanceKm / (seconds / 3600)) * 10) / 10
      : null;

  const eventTitle =
    lang === 'ar' ? (event.titleAr || event.title) : event.title;

  const summary = {
    distance: distanceKm,
    duration,
    avgSpeedKmh,
    calories: eventResult.calories ?? null,
    elevationGain,
    badge: eventResult.badge ?? null,
    pointsEarned: eventResult.pointsEarned ?? null,
    rank: eventResult.rank ?? null,
    rating: eventResult.rating ?? null,
    notes: eventResult.notes ?? null,
    photos: eventResult.photos ?? [],
    event: {
      title: eventTitle,
      eventDate: event.eventDate,
    },
  };

  sendSuccess(
    res,
    summary,
    t(lang, 'event.completed_summary_retrieved'),
    200
  );
});

/**
 * Update post-ride feedback (rating, notes) for a completed result
 * PATCH /v1/events/:eventId/results/feedback
 */
export const updateResultFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventIdParam = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }

  const eventResult = await EventResult.findOne({
    eventId: eventIdParam,
    userId,
    status: 'completed',
  });

  if (!eventResult) {
    throw new AppError(t(lang, 'event.completed_summary_not_found'), 404);
  }

  const updates: Record<string, unknown> = {};
  if (req.body.rating != null) updates.rating = req.body.rating;
  if (req.body.notes != null) updates.notes = String(req.body.notes).trim() || null;
  eventResult.set(updates);
  await eventResult.save();

  sendSuccess(
    res,
    eventResult,
    t(lang, 'event.feedback_updated'),
    200
  );
});

/**
 * Add optional photos to a completed event result (Share your photos)
 * POST /v1/events/:eventId/results/photos
 */
export const addResultPhotos = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const eventIdParam = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
    throw new AppError(t(lang, 'event.invalid_id'), 400);
  }

  const eventResult = await EventResult.findOne({
    eventId: eventIdParam,
    userId,
    status: 'completed',
  });

  if (!eventResult) {
    throw new AppError(t(lang, 'event.completed_summary_not_found'), 404);
  }

  const imageUrls = req.body.imageUrls as string[];
  const maxPhotos = 20;
  const currentCount = (eventResult.photos ?? []).length;
  if (currentCount >= maxPhotos && imageUrls.length > 0) {
    throw new AppError(t(lang, 'event.result_photos_limit'), 400);
  }

  const existing = new Set(eventResult.photos ?? []);
  const newUrls = imageUrls.filter((url) => !existing.has(url));
  const toAdd = newUrls.slice(0, Math.max(0, maxPhotos - currentCount));

  eventResult.photos = [...(eventResult.photos ?? []), ...toAdd];
  await eventResult.save();

  sendSuccess(
    res,
    { photos: eventResult.photos, added: toAdd.length },
    t(lang, 'event.result_photos_added'),
    200
  );
});

export const deleteGalleryImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { eventId } = req.params;

  const imageUrls = [
    ...normalizeGalleryImagesInput((req.body as any)?.imageUrl),
    ...normalizeGalleryImagesInput((req.body as any)?.image),
  ];

  const uniqueImages = Array.from(new Set(imageUrls));
  if (uniqueImages.length === 0) {
    throw new AppError(t(lang, "image.required"), 400);
  }

  const event = await Event.findById(eventId);
  if (!event) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  if (!event.galleryImages || event.galleryImages.length === 0) {
    throw new AppError(t(lang, "image.not_found"), 400);
  }

  const imagesToRemove = new Set(uniqueImages);
  const removedImages = event.galleryImages.filter((img) => imagesToRemove.has(img));

  if (removedImages.length === 0) {
    throw new AppError(t(lang, "image.not_found"), 400);
  }

  const updatedEvent = await Event.findByIdAndUpdate(
    eventId,
    { $pull: { galleryImages: { $in: removedImages } } },
    { new: true }
  );

  if (!updatedEvent) {
    throw new AppError(t(lang, "event.not_found"), 404);
  }

  return sendSuccess(
    res,
    { galleryImages: updatedEvent.galleryImages, removedImages, totalImages: updatedEvent.galleryImages?.length || 0 },
    t(lang, "image.delted"),
    200
  );
});
