import { Request, Response } from 'express';
import { t } from "@/utils/i18n";
import Event from '@/models/event.model';
import Track from '@/models/track.model';
import Community from '@models/community.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import mongoose from 'mongoose';
import { SupportedLanguage } from '@/utils/localization';
import { localizeTrack } from '@/utils/track-payload';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';

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

const attachTrackImages = async (req: AuthRequest, data: Record<string, any>) => {
  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  } | undefined;

  if (!files) return data;

  if (files.image?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.image[0].buffer,
      files.image[0].mimetype,
      files.image[0].originalname,
      'tracks'
    );
    data.image = uploadResult.url;
  }

  if (files.coverImage?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.coverImage[0].buffer,
      files.coverImage[0].mimetype,
      files.coverImage[0].originalname,
      'tracks'
    );
    data.coverImage = uploadResult.url;
  }

  if (files.galleryImages?.length) {
    const uploadedGallery = await Promise.all(
      files.galleryImages.map(async (file) => {
        const uploaded = await uploadImageBufferToS3(
          file.buffer,
          file.mimetype,
          file.originalname,
          'tracks-galleries'
        );
        return uploaded.url;
      })
    );
    data.galleryImages = [...(data.galleryImages || []), ...uploadedGallery];
  }

  return data;
};

/**
 * Create new event
 * POST /v1/events
 * Admin only
 */
export const createTrack = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const userId = req.user?.id;
  // console.log(userId);
    if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
    }
    const teackData = {
    ...req.body,
    titleAr: req.body.titleAr || req.body.title,
    descriptionAr: req.body.descriptionAr || req.body.description,
    teackData: req.body.teackData ? new Date(req.body.teackData) : undefined,
    createdBy: userId,
    };
    await attachTrackImages(req, teackData);
    const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
    const mergedGalleryImages = [...(teackData.galleryImages || []), ...bodyGalleryImages];
    if (mergedGalleryImages.length > 0) {
      teackData.galleryImages = mergedGalleryImages;
    }
    const event = await Track.create(teackData);
    sendSuccess(res, localizeTrack(event.toObject(), lang), t(lang, "track.created"), 201);
});

/**
 * Get all events
 * GET /v1/events
 * Public - with optional filters
 * */
    export const getAllTracks = asyncHandler(async (req: Request, res: Response) => {
      const lang = ((req as any).lang || 'en') as SupportedLanguage;
    const { status, city, type, difficulty, visibility, publicOnly, page = 1, limit = 10 } = req.query;
    
    const query: any = {};
    if (status) query.status = status;
    if (city) query.city = city;
    if (type && ['circuit', 'road', 'costal', 'coastal', 'desert', 'urban', 'loop', 'mixed', 'out-and-back', 'point-to-point'].includes(type as string)) {
      query.trackType = type === 'coastal' ? 'costal' : type;
    }
    if (difficulty) query.difficulty = difficulty;
    if (visibility) query.visibility = visibility;
    if (publicOnly === 'true') {
      query.status = { $nin: ['archived', 'disabled'] };
      query.visibility = { $ne: 'private' };
    }
    // Pagination
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const tracks = await Track.find(query)
    .populate('createdBy', 'fullName email')
    .sort({ eventDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum);
    const localizedTracks = tracks.map((track) => localizeTrack(track.toObject(), lang));

    const trackIds = tracks.map((track) => track._id).filter(Boolean);
    const trackIdStrings = trackIds.map((id) => id.toString());

    const [eventCounts, communityCounts] = await Promise.all([
      Event.aggregate([
        {
          $match: {
            $or: [
              { trackId: { $in: trackIds } },
              { trackId: { $in: trackIdStrings } },
              { trackId: { $elemMatch: { $in: trackIds } } },
              { trackId: { $elemMatch: { $in: trackIdStrings } } },
            ],
          },
        },
        {
          $project: {
            trackIdStr: {
              $toString: {
                $cond: [
                  { $isArray: '$trackId' },
                  { $arrayElemAt: ['$trackId', 0] },
                  '$trackId',
                ],
              },
            },
          },
        },
        { $group: { _id: '$trackIdStr', count: { $sum: 1 } } },
      ]),
      Community.aggregate([
        {
          $match: {
            $or: [
              { trackId: { $in: trackIds } },
              { trackId: { $in: trackIdStrings } },
              { trackIds: { $in: trackIds } },
              { trackIds: { $in: trackIdStrings } },
            ],
          },
        },
        {
          $project: {
            mergedRefs: {
              $concatArrays: [
                {
                  $cond: [
                    { $isArray: '$trackId' },
                    { $ifNull: ['$trackId', []] },
                    { $cond: [{ $ifNull: ['$trackId', false] }, ['$trackId'], []] },
                  ],
                },
                { $ifNull: ['$trackIds', []] },
              ],
            },
          },
        },
        { $unwind: '$mergedRefs' },
        {
          $match: {
            mergedRefs: {
              $in: [...trackIds, ...trackIdStrings],
            },
          },
        },
        { $group: { _id: { $toString: '$mergedRefs' }, count: { $sum: 1 } } },
      ]),
    ]);

    const eventCountMap = new Map<string, number>();
    for (const item of eventCounts) {
      if (item?._id) eventCountMap.set(String(item._id), item.count ?? 0);
    }

    const communityCountMap = new Map<string, number>();
    for (const item of communityCounts) {
      if (item?._id) communityCountMap.set(String(item._id), item.count ?? 0);
    }

    const tracksWithCounts = localizedTracks.map((track, index) => {
      const id = trackIdStrings[index];
      return {
        ...track,
        eventCount: eventCountMap.get(id) ?? 0,
        communityCount: communityCountMap.get(id) ?? 0,
      };
    });

    // Get total count
    const total = await Track.countDocuments(query);
    sendSuccess(
      res,
      {
        tracks: tracksWithCounts,
        total,
        page: pageNum,
        limit: limitNum,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum) || 1,
        },
      },
      t(lang, "track.allTracks"),
      200
    );
});

/**
 * Get track by ID
 * GET /v1/tracks/:trackId
 * Public – guest-accessible.
 */
export const getTrackById = asyncHandler(async (req: Request, res: Response) => {
    const lang = ((req as any).lang || 'en') as SupportedLanguage;

    const trackId = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;

    const track = await Track.findById(trackId);
    if (!track) {
        throw new AppError(t(lang, "track.not_found"), 404);
    }
    return sendSuccess(res, localizeTrack(track.toObject(), lang), t(lang, "track.trackDetails"), 201);
});

/**
 * Get events for a track
 * GET /v1/tracks/:trackId/events
 * Public – guest-accessible.
 * Optional query params:
 * - page, limit
 */
export const getTrackEvents = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const trackIdParam = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;

  if (!mongoose.Types.ObjectId.isValid(trackIdParam)) {
    throw new AppError(t(lang, "track.not_found"), 400);
  }

  const { page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const filter: Record<string, any> = {
    trackId: {
      $in: [new mongoose.Types.ObjectId(trackIdParam), trackIdParam],
    },
  };

  filter.status = {$nin: ['Completed', 'Closed', 'Draft', 'Disabled', 'Archived']} 
  const eventsQuery = Event.find(filter)
    .populate('createdBy', 'fullName email')
    .populate('communityId', 'title titleAr')
    .populate('trackId', 'title titleAr')
    .sort({ eventDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const [events, total] = await Promise.all([
    eventsQuery,
    Event.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      events,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, "event.allEvents"),
    200
  );
});

/**
 * Update track
 * PATCH /v1/tracks/:id
 * Admin only
 * */
export const updateTrack = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const trackId = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;
    
    if (req.body.title && !req.body.titleAr) {
      req.body.titleAr = req.body.title;
    }
    if (req.body.description && !req.body.descriptionAr) {
      req.body.descriptionAr = req.body.description;
    }

    const updateData = { ...req.body };
    await attachTrackImages(req, updateData);

    // console.log('req.body:', req.body);
    const track = await Track.findByIdAndUpdate(trackId, updateData, { new: true });
    if (!track) {
         throw new AppError(t(lang, "track.not_found"), 404);
    }

    return sendSuccess(res, localizeTrack(track.toObject(), lang), t(lang, "track.updated"), 201);
});

/**
 * Delete track
 * DELETE /v1/tracks/:trackId
 * Admin only
 * */
export const deleteTrack = asyncHandler(async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as SupportedLanguage;
    const trackId = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;

    const track = await Track.findByIdAndDelete(trackId);
    if (!track) {
            throw new AppError(t(lang, "track.not_found"), 404);
    }
    return sendSuccess(res, null, t(lang, "track.deleted"), 201);
});


/**
 * Disable track
 * Disable /v1/tracks/:id
 * Admin only
 * */
export const disableTrack = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const supportedLang = ((req as any).lang || 'en') as SupportedLanguage;
    const { trackId } = req.params;

    const track = await Track.findByIdAndUpdate(
      trackId,
      { status: 'disabled' },
      { new: true }
    );

    if (!track) {
      throw new AppError(t(supportedLang, "track.not_found"), 404);
    }

    return sendSuccess(res, localizeTrack(track.toObject(), supportedLang), t(supportedLang, "track.disabled"), 200);
  }
);

/**
 * Enable track
 * Enable /v1/tracks/:id
 * Admin only
 * */

export const enableTrack = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as SupportedLanguage;
    const { trackId } = req.params;

    const track = await Track.findByIdAndUpdate(
      trackId,
      { status: 'active' },
      { new: true }
    );

    if (!track) {
      throw new AppError(t(lang, "track.not_found"), 404);
    }

    return sendSuccess(res, localizeTrack(track.toObject(), lang), t(lang, "track.enabled"), 200);
  }
);


/**
 * Get track-related event results
 * GET /v1/tracks/:trackId/events/results
 * Public – guest-accessible.
 */
export const getTrackResults = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;

  const trackIdParam = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;

    if (!mongoose.Types.ObjectId.isValid(trackIdParam)) {
        throw new AppError(t(lang, "track.not_found"), 400);
      }

  const results = await Event.aggregate([
  {
    $match: {
      trackId: new mongoose.Types.ObjectId(trackIdParam),
    },
  },
  {
    $addFields: {
      safeTime: { $ifNull: ['$time', Number.MAX_SAFE_INTEGER] },
    },
  },
  { $sort: { safeTime: 1 } },
  {
    $setWindowFields: {
      sortBy: { safeTime: 1 },
      output: { rank: { $rank: {} } },
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
]);


  sendSuccess(res, results, t(lang, "track.trackResult"), 200);
});


/**
 * Get track community photos for an event
 * GET /v1/tracks/:trackId/events/:eventId/communities/:Id/photos
 * Public – guest-accessible.
 */
export const trackCommunityPhotos = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const trackIdParam = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;
    if (!mongoose.Types.ObjectId.isValid(trackIdParam)) {
        throw new AppError(t(lang, "track.not_found"), 400);
      }

  const eventIdParam = Array.isArray(req.params.eventId)
    ? req.params.eventId[0]
    : req.params.eventId;
    if (!mongoose.Types.ObjectId.isValid(eventIdParam)) {
        throw new AppError(t(lang, "event.not_found"), 400);
      }

  const communityIdParam = Array.isArray(req.params.Id)
    ? req.params.Id[0]
    : req.params.Id;
    if (!mongoose.Types.ObjectId.isValid(communityIdParam)) {
        throw new AppError(t(lang, "community.not_found"), 400);
      }

  const photos = await Event.findOne({
    _id: new mongoose.Types.ObjectId(eventIdParam),
    trackId: new mongoose.Types.ObjectId(trackIdParam),
    communityId: new mongoose.Types.ObjectId(communityIdParam),
  }).select('communityPhotos');

  sendSuccess(res, photos, t(lang, "community.community_photos"), 200);

});

/**
 * Get track-related community results
 * GET /v1/tracks/:trackId/communities/results
 * Public – guest-accessible.
 */
export const trackCommunityResults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;

  const trackIdParam = Array.isArray(req.params.trackId)
    ? req.params.trackId[0]
    : req.params.trackId;

  if (!mongoose.Types.ObjectId.isValid(trackIdParam)) {
    throw new AppError(t(lang, "track.not_found"), 400);
  }

  // Pagination params
  const page = Math.max(1, parseInt((req.query.page as string) || '1'));
  const limit = Math.max(1, parseInt((req.query.limit as string) || '10'));
  const skip = (page - 1) * limit;

  const trackObjectId = new mongoose.Types.ObjectId(trackIdParam);

  const results = await Community.aggregate([
    {
      $match: {
        trackId: trackObjectId, // FIXED (no $in)
      },
    },

    // Use facet for pagination + total count
    {
      $facet: {
        data: [
          {
            $lookup: {
              from: 'users',
              let: { userId: '$createdBy' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$_id', '$$userId'] },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    fullName: 1,
                    email: 1,
                    role: 1,
                  },
                },
              ],
              as: 'user',
            },
          },
          {
            $unwind: {
              path: '$user',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $sort: { createdAt: -1 }, // latest first
          },
          {
            $skip: skip,
          },
          {
            $limit: limit,
          },
        ],

        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    },
  ]);

  const communities = results[0]?.data || [];
  const total = results[0]?.totalCount[0]?.count || 0;

  sendSuccess(
    res,
    {
      communities,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    t(lang, "track.communityResult"),
    200
  );
});

export const archiveTrack = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const supportedLang = ((req as any).lang || 'en') as SupportedLanguage;
    // console.log('archive-params',req.params);
    const { trackId } = req.params;
    const track = await Track.findByIdAndUpdate(
      trackId,
      { status: 'archived' },
      { new: true }
    );

    if (!track) {
      throw new AppError(t(supportedLang, "track.not_found"), 404);
    }

    return sendSuccess(res, localizeTrack(track.toObject(), supportedLang), t(supportedLang, "track.archived"), 200);
  }
);

export const deleteGalleryImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { trackId } = req.params;

  const imageUrls = [
    ...normalizeGalleryImagesInput((req.body as any).imageUrl),
    ...normalizeGalleryImagesInput((req.body as any).images),
    ...normalizeGalleryImagesInput((req.body as any).image),
  ];

  const uniqueImages = Array.from(new Set(imageUrls));
  if (uniqueImages.length === 0) {
    throw new AppError(t(lang, "image.required"), 400);
  }

  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError(t(lang, "track.not_found"), 404);
  }

  if (!track.galleryImages || track.galleryImages.length === 0) {
    throw new AppError(t(lang, "image.not_found"), 400);
  }

  const imagesToRemove = new Set(uniqueImages);
  const removedImages = track.galleryImages.filter((img) => imagesToRemove.has(img));

  if (removedImages.length === 0) {
    throw new AppError(t(lang, "image.not_found"), 400);
  }

  const updatedTrack = await Track.findByIdAndUpdate(
    trackId,
    { $pull: { galleryImages: { $in: removedImages } } },
    { new: true }
  );

  if (!updatedTrack) {
    throw new AppError(t(lang, "track.not_found"), 404);
  }

  return sendSuccess(
    res,
    { galleryImages: updatedTrack.galleryImages, removedImages, totalImages: updatedTrack.galleryImages?.length || 0 },
    t(lang, "image.delted"),
    200
  );
});

/**
 * Add images to track gallery
 * POST /v1/tracks/:trackId/gallery
 * Admin only
 */
export const addTrackGalleryImages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { trackId } = req.params;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  };

  const galleryFiles = files?.galleryImages || [];
  const uploadedImageUrls = await Promise.all(
    galleryFiles.map(async (file) => {
      const uploaded = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        'tracks-galleries'
      );
      return uploaded.url;
    })
  );

  const bodyImages = normalizeGalleryImagesInput((req.body as any).images);
  const bodyImage = normalizeGalleryImagesInput((req.body as any).image);
  const images = [...uploadedImageUrls, ...bodyImages, ...bodyImage];

  if (images.length === 0) {
    throw new AppError('At least one image is required', 400);
  }

  const track = await Track.findById(trackId);
  if (!track) {
    throw new AppError(t(lang, 'track.not_found'), 404);
  }

  const existingImages = new Set(track.galleryImages || []);
  const newImages = images.filter((imageUrl: string) => !existingImages.has(imageUrl));

  if (newImages.length === 0) {
    throw new AppError('All images already exist in gallery', 400);
  }

  const updatedTrack = await Track.findByIdAndUpdate(
    trackId,
    { $addToSet: { galleryImages: { $each: newImages } } },
    { new: true }
  ).populate('createdBy', 'fullName email');

  if (!updatedTrack) {
    throw new AppError(t(lang, 'track.not_found'), 500);
  }

  sendSuccess(
    res,
    {
      track: localizeTrack(updatedTrack.toObject(), lang),
      addedImages: newImages,
      totalImages: updatedTrack.galleryImages?.length || 0,
    },
    'Track gallery images added successfully',
    201
  );
});
