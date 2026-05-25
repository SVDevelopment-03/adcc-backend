import { Request, Response } from 'express';
import CommunityRide from '@/models/community-ride.model';
import CommunityRideParticipation from '@/models/community-ride-participation.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { localizeDocumentFields, SupportedLanguage, localizeCommunityRideStatic } from '@/utils/localization';
import communityRideNotificationService from '@/services/community-ride-notification.service';

const COMMUNITY_RIDE_LOCALIZED_FIELDS = {
  title: 'titleAr',
  description: 'descriptionAr',
  address: 'addressAr',
};

const localizeCommunityRide = (ride: Record<string, any>, lang: SupportedLanguage) => {
  const localized = localizeDocumentFields(ride, lang, COMMUNITY_RIDE_LOCALIZED_FIELDS);
  localizeCommunityRideStatic(localized, lang);
  return localized;
};

/**
 * Create new community ride
 * POST /v1/community-rides
 * Admin only
 */
export const createCommunityRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const rideData = {
    ...req.body,
    titleAr: req.body.titleAr || req.body.title,
    descriptionAr: req.body.descriptionAr || req.body.description,
    addressAr: req.body.addressAr || req.body.address,
    date: req.body.date ? new Date(req.body.date) : undefined,
    createdBy: userId,
  };

  const ride = await CommunityRide.create(rideData);

  void communityRideNotificationService.notifyCommunityRidePublished(String(ride._id));

  sendSuccess(res, localizeCommunityRide(ride.toObject(), lang), t(lang, 'communityRide.created'), 201);
});

/**
 * Get all community rides
 * GET /v1/community-rides
 * Public - with optional filters
 */
export const getAllCommunityRides = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { status, page = 1, limit = 10 } = req.query;

  // Build filter object
  const filter: any = {};

  if (status) filter.status = status;

  // Pagination
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  // Get community rides
  const rides = await CommunityRide.find(filter)
    .populate('createdBy', 'fullName email')
    .sort({ date: 1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const localizedRides = rides.map((ride) => localizeCommunityRide(ride.toObject(), lang));

  // Get total count
  const total = await CommunityRide.countDocuments(filter);

  sendSuccess(
    res,
    {
      rides: localizedRides,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, 'communityRide.allRides')
  );
});

/**
 * Get community ride by ID
 * GET /v1/community-rides/:id
 * Public
 */
export const getCommunityRideById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  const ride = await CommunityRide.findById(id).populate('createdBy', 'fullName email');

  if (!ride) {
    throw new AppError(t(lang, 'communityRide.not_found'), 404);
  }

  sendSuccess(res, localizeCommunityRide(ride.toObject(), lang), t(lang, 'communityRide.retrieved'));
});

/**
 * Update community ride
 * PATCH /v1/community-rides/:id
 * Admin only
 */
export const updateCommunityRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  const updateData = { ...req.body };

  // Convert date string to Date if provided
  if (updateData.date) {
    updateData.date = new Date(updateData.date);
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

  const ride = await CommunityRide.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).populate('createdBy', 'fullName email');

  if (!ride) {
    throw new AppError(t(lang, 'communityRide.not_found'), 404);
  }

  if (ride.status === 'active') {
    void communityRideNotificationService.notifyCommunityRidePublished(String(ride._id));
  }

  sendSuccess(res, localizeCommunityRide(ride.toObject(), lang), t(lang, 'communityRide.updated'));
});

/**
 * Delete community ride
 * DELETE /v1/community-rides/:id
 * Admin only
 */
export const deleteCommunityRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  const ride = await CommunityRide.findByIdAndDelete(id);

  if (!ride) {
    throw new AppError(t(lang, 'communityRide.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'communityRide.deleted'));
});

/**
 * Join a community ride
 * POST /v1/community-rides/:id/join
 */
export const joinCommunityRide = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const ride = await CommunityRide.findById(id);
  if (!ride) {
    throw new AppError(t(lang, 'communityRide.not_found'), 404);
  }

  const existingJoin = await CommunityRideParticipation.findOne({ rideId: id, userId });
  if (existingJoin?.status === 'joined') {
    sendSuccess(res, localizeCommunityRide(ride.toObject(), lang), t(lang, 'communityRide.joined') || 'Joined community ride');
    return;
  }

  if (ride.maxParticipants && ride.maxParticipants > 0 && ride.currentParticipants >= ride.maxParticipants) {
    throw new AppError(t(lang, 'communityRide.full') || 'This community ride is full', 400);
  }

  const updatedRide = await CommunityRide.findByIdAndUpdate(
    id,
    { $inc: { currentParticipants: 1 } },
    { new: true }
  );

  if (!updatedRide) {
    throw new AppError(t(lang, 'communityRide.not_found'), 404);
  }

  await CommunityRideParticipation.findOneAndUpdate(
    { rideId: id, userId },
    {
      rideId: id,
      userId,
      status: 'joined',
      joinedAt: existingJoin?.joinedAt || new Date(),
      leftAt: null,
    },
    { upsert: true, new: true }
  );

  void communityRideNotificationService.notifyCommunityRideJoined({ rideId: String(id), userId });

  sendSuccess(res, localizeCommunityRide(updatedRide.toObject(), lang), t(lang, 'communityRide.joined') || 'Joined community ride');
});


/**
 * Community Member Join-Status ride
 * Member Join-Status /v1/community-rides/:id
 * Admin only
 */
export const communityMemberStatus = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as SupportedLanguage;
    const { id: rideId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }


    const ride = await CommunityRide.findById(rideId);
    if (!ride) {
      throw new AppError(t(lang, 'communityRide.not_found'), 404);
    }

    const participation = await CommunityRideParticipation.findOne({ rideId, userId });

    let status = "not_joined";
    let participationDetails = null;

    if (participation) {
      status = participation.status;

      if (participation.status === "joined") {
        status = "joined";
      }

      participationDetails = {
        joinedAt: participation.joinedAt,
        leftAt: participation.leftAt,
      };
    }

    return sendSuccess(res, {
      rideId,
      userId,
      status,
      participationDetails,
      ride: localizeCommunityRide(ride.toObject(), lang),
    }, t(lang, 'community.status_retrieved'), 200);
  }
);
