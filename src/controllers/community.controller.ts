import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { t } from "@/utils/i18n";
import Community from '@/models/community.model';
import Event from '@/models/event.model';
import Track from '@/models/track.model';
import CommunityMembership from '@/models/communityMembership.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { idOrSlugFilter } from '@/utils/slug';
import { AuthRequest } from '@/middleware/auth.middleware';
import { communityMembershipService } from '@/services';
import { localizeDocumentFields, SupportedLanguage, localizeCommunityStatic } from '@/utils/localization';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { notifyCommunityGalleryAdded } from '@/services/community-notification.service';

interface JoinCommunityParams {
  communityId: string;
}

const COMMUNITY_LOCALIZED_FIELDS = {
  title: 'titleAr',
  description: 'descriptionAr',
};

const localizeCommunity = (community: Record<string, any>, lang: SupportedLanguage) => {
  const localized = localizeDocumentFields(community, lang, COMMUNITY_LOCALIZED_FIELDS);
  localizeCommunityStatic(localized, lang);
  return localized;
};

const uniqueObjectIds = (ids: mongoose.Types.ObjectId[]) => {
  const seen = new Set<string>();
  const out: mongoose.Types.ObjectId[] = [];
  for (const id of ids) {
    if (!(id instanceof mongoose.Types.ObjectId)) continue;
    const s = id.toString();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(id);
    }
  }
  return out;
};

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
};

export const AVAILABLE_CITIES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Ras Al Khaimah',
  'Fujairah',
  'Umm Al Quwain',
  'Al Ain',
  'Riyadh',
  'Jeddah',
  'Mecca',
  'Medina',
  'Dammam',
  'Khobar',
  'Dhahran',
  'Taif',
  'Tabuk',
  'Abha',
  'Jubail',
  'Yanbu',
  'Doha',
  'Al Wakrah',
  'Al Khor',
  'Al Rayyan',
  'Mesaieed',
  'Dukhan',
  'Muscat',
  'Salalah',
  'Sohar',
  'Nizwa',
  'Sur',
  'Ibri',
  'Barka',
  'Rustaq',
  'Kuwait City',
  'Hawalli',
  'Salmiya',
  'Farwaniya',
  'Jahra',
  'Ahmadi',
  'Mangaf',
  'Fahaheel',
  'Manama',
  'Muharraq',
  'Riffa',
  'Hamad Town',
  'Isa Town',
  'Sitra',
  'Budaiya',
  'Jidhafs',
];

/** Normalizes track refs from either `trackId` or `trackIds` payloads. */
const resolveTrackIdFromBody = (body: Record<string, any>): mongoose.Types.ObjectId[] | undefined => {
  const rawValues = [
    body.trackId,
    body.trackIds,
  ].filter((value) => value !== undefined && value !== null);

  if (rawValues.length === 0) return undefined;

  const values = rawValues.flatMap((value) => {
    if (Array.isArray(value)) return value;
    return [value];
  });

  const objectIds = values.filter((id: unknown): id is mongoose.Types.ObjectId => id instanceof mongoose.Types.ObjectId);
  const idStrings = values
    .filter((id: unknown): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  return uniqueObjectIds([...objectIds, ...idStrings]);
};

const normalizeGalleryImagesInput = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
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

const isUrlString = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const uploadImageStringToS3 = async (value: unknown): Promise<string | undefined> => {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isUrlString(trimmed)) {
    throw new AppError('Image must be a valid URL', 400);
  }
  return trimmed;
};

export const getAvailableCities = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, AVAILABLE_CITIES);
});

const attachCommunityGalleryFiles = async (req: AuthRequest): Promise<string[]> => {
  const files = req.files as
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | undefined;

  if (!files) return [];

  const galleryFiles = [
    ...(files.gallery || []),
    ...(files.galleryImages || []),
  ];

  if (galleryFiles.length === 0) return [];

  const uploaded = await Promise.all(
    galleryFiles.map(async (file) => {
      const result = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        'galleries'
      );
      return result.url;
    })
  );

  return uploaded;
};

const attachCommunityImages = async (req: AuthRequest, data: Record<string, any>) => {
  const files = req.files as
    | {
        [fieldname: string]: Express.Multer.File[];
      }
    | undefined;

  if (!files) return data;

  if (files.image?.length) {
    const uploaded = await uploadImageBufferToS3(
      files.image[0].buffer,
      files.image[0].mimetype,
      files.image[0].originalname,
      'community'
    );
    data.image = uploaded.url;
  } else if (files.coverImage?.length) {
    const uploaded = await uploadImageBufferToS3(
      files.coverImage[0].buffer,
      files.coverImage[0].mimetype,
      files.coverImage[0].originalname,
      'community'
    );
    data.image = uploaded.url;
  }

  if (files.logo?.length) {
    const uploaded = await uploadImageBufferToS3(
      files.logo[0].buffer,
      files.logo[0].mimetype,
      files.logo[0].originalname,
      'community'
    );
    data.logo = uploaded.url;
  }

  return data;
};

/**
 * Create new community
 * POST /v1/communities
 * Admin only
 */
export const createCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const imageInput = req.body.image || req.body.coverImage;
  const imageUrl = await uploadImageStringToS3(imageInput);
  const logoUrl = await uploadImageStringToS3(req.body.logo);

  const communityData: Record<string, any> = {
    ...req.body,
    image: imageUrl || imageInput,
    logo: logoUrl || req.body.logo,
    titleAr: req.body.titleAr || req.body.title,
    descriptionAr: req.body.descriptionAr || req.body.description,
    createdBy: userId,
    members: [], // Start with no members
    memberCount: 0,
  };

  delete (communityData as any).coverImage;
  const resolvedTrackId = resolveTrackIdFromBody(req.body as Record<string, any>);
  delete communityData.trackId;
  delete communityData.trackIds;
  if (resolvedTrackId !== undefined) {
    communityData.trackId = resolvedTrackId;
  }

  await attachCommunityImages(req, communityData);

  const uploadedGalleryFiles = await attachCommunityGalleryFiles(req);
  const bodyGallery = normalizeGalleryImagesInput((req.body as any).gallery);
  const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
  const allBodyGallery = [...bodyGallery, ...bodyGalleryImages];
  const mergedGallery = uniqueStrings([
    ...uploadedGalleryFiles,
    ...allBodyGallery,
  ]);
  if (mergedGallery.length > 0) {
    communityData.gallery = mergedGallery;
  }

  const community = await Community.create(communityData);
  const localizedCommunity = localizeCommunity(community.toObject(), lang);

  sendSuccess(res, localizedCommunity, t(lang,"community.created"), 201);
});

/**
 * Get all communities
 * GET /v1/communities
 * Public – guest-accessible. Optional query filters and pagination.
 */
export const getAllCommunities = asyncHandler(async (req: Request, res: Response ) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { type, location, category, search, page = 1, limit = 10, isActive, isPublic, isFeatured } = req.query;

  const query: any = {};

  const VALID_TYPES = [
    'Family Rides',
    'Racing & Performance',
    'Women (SheRides)',
    'Youth Cycling',
    'Weekend Social',
    'Night Riders',
    'MTB/Trail',
    'Training & Clinics',
  ];
  const VALID_LOCATIONS = ['Abu Dhabi', 'Dubai', 'Al Ain', 'Sharjah', 'Al Dhafra'];

  // Filter by type (stored as string array on the model)
  if (type && VALID_TYPES.includes(type as string)) {
    query.type = { $in: [type] };
  }

  // Filter by location
  if (location && VALID_LOCATIONS.includes(location as string)) {
    query.$or = [{ location }, { city: location }];
  }

  // Filter by category (check if category array contains the query value)
  if (category) {
    query.category = { $in: [category] };
  }

  // Filter by active status
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Filter by public status
  if (isPublic !== undefined) {
    query.isPublic = isPublic === 'true';
  }

  // Filter by featured status
  if (isFeatured !== undefined) {
    query.isFeatured = isFeatured === 'true';
  }

  // Text search
  if (search && typeof search === 'string') {
    query.$text = { $search: search };
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const communities = await Community.find(query)
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr distance difficulty trackType category image city')
    // members array is not populated here to reduce payload; use memberCount instead
    .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const total = await Community.countDocuments(query);

  // attach upcoming event counts for each community
  const now = new Date();
  const communitiesWithCounts = await Promise.all(
    communities.map(async (comm) => {
      const upcomingEvents = await Event.countDocuments({
        communityId: comm._id,
        eventDate: { $gte: now },
      });
      const memberCount = await CommunityMembership.countDocuments({
        communityId: comm._id,
        status: 'active',
      });
      const commObj: any = comm.toObject();
      commObj.upcomingEventCount = upcomingEvents;
      commObj.memberCount = memberCount;
      return localizeCommunity(commObj, lang);
    })
  );

  sendSuccess(
    res,
    {
      communities: communitiesWithCounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, "community.all_communities"), 200
  );
});

/**
 * Get community by ID
 * GET /v1/communities/:id
 * Public – guest-accessible.
 */
export const getCommunityById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  if (Array.isArray(id) || !id) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  const community = await Community.findOne(idOrSlugFilter(id))
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr distance difficulty trackType category image city description descriptionAr')
    .populate('members', 'fullName email age gender');

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  // include upcoming event count and accurate member count from membership collection
  const now = new Date();
  const upcomingEvents = await Event.countDocuments({
    communityId: community._id,
    eventDate: { $gte: now },
  });
  const memberCount = await CommunityMembership.countDocuments({
    communityId: community._id,
    status: 'active',
  });

  const communityObj: any = community.toObject();
  communityObj.upcomingEventCount = upcomingEvents;
  communityObj.memberCount = memberCount;

  // Include tracks referenced by community events so clients (mobile) can
  // render event-associated tracks along with explicitly assigned ones.
  try {
    const eventTrackIdsRaw = await Event.distinct('trackId', { communityId: community._id });
    const trackIdStrings = new Set<string>();

    // Add explicit community track ids (may be populated or raw)
    const commTrackField = (community as any).trackId;
    if (Array.isArray(commTrackField)) {
      for (const item of commTrackField) {
        if (!item) continue;
        const s = (item instanceof mongoose.Types.ObjectId) ? item.toString() : (item._id ? item._id.toString() : String(item));
        if (s) trackIdStrings.add(s);
      }
    }

    // Add distinct event track ids
    for (const idVal of eventTrackIdsRaw) {
      if (!idVal) continue;
      const s = (idVal instanceof mongoose.Types.ObjectId) ? idVal.toString() : String(idVal);
      if (s) trackIdStrings.add(s);
    }

    if (trackIdStrings.size > 0) {
      const ids = Array.from(trackIdStrings).map((s) => new mongoose.Types.ObjectId(s));
      const tracks = await Track.find({ _id: { $in: ids } }).select('title titleAr distance difficulty trackType category image city description descriptionAr');
      // Replace the `trackId` field in the response with the merged track docs
      communityObj.trackId = tracks.map((t) => t.toObject());
    }
  } catch (err) {
    // Non-fatal: ignore errors while enriching with event tracks
  }
  const localizedCommunity = localizeCommunity(communityObj, lang);

  return sendSuccess(res, localizedCommunity, t(lang,"community.details_retrieved"), 201);
});

/**
 * Update community
 * PATCH /v1/communities/:id
 * Admin only
 */
export const updateCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
  
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  // console.log('id',id);

  const community = await Community.findById(id);

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  // Update fields
  if (req.body.title && !req.body.titleAr && !community.titleAr) {
    req.body.titleAr = req.body.title;
  }
  if (req.body.description && !req.body.descriptionAr && !community.descriptionAr) {
    req.body.descriptionAr = req.body.description;
  }
  if (req.body.coverImage && !req.body.image) {
    req.body.image = req.body.coverImage;
  }
  delete (req.body as any).coverImage;

  if (req.body.image) {
    req.body.image = await uploadImageStringToS3(req.body.image);
  }
  if (req.body.logo) {
    req.body.logo = await uploadImageStringToS3(req.body.logo);
  }

  const resolvedTrackId = resolveTrackIdFromBody(req.body as Record<string, any>);
  if (resolvedTrackId !== undefined) {
    (req.body as any).trackId = resolvedTrackId;
    delete (req.body as any).trackIds;
  }

  if (req.body.image) {
    req.body.image = await uploadImageStringToS3(req.body.image);
  }
  if (req.body.logo) {
    req.body.logo = await uploadImageStringToS3(req.body.logo);
  }

  await attachCommunityImages(req, req.body);

  const uploadedGalleryFiles = await attachCommunityGalleryFiles(req);
  const bodyGallery = normalizeGalleryImagesInput((req.body as any).gallery);
  const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
  const allBodyGallery = [...bodyGallery, ...bodyGalleryImages];
  const newGalleryItems = [
    ...uploadedGalleryFiles,
    ...allBodyGallery,
  ];
  const hasExplicitGallery = Object.prototype.hasOwnProperty.call(req.body, 'gallery');
  if (newGalleryItems.length > 0) {
    if (hasExplicitGallery) {
      req.body.gallery = uniqueStrings(newGalleryItems);
    } else {
      req.body.gallery = uniqueStrings([...(community.gallery || []), ...newGalleryItems]);
    }
  }
  delete (req.body as any).galleryImages;

  Object.assign(community, req.body);
  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('trackId', 'title titleAr distance difficulty trackType category image city description descriptionAr')
    .populate('members', 'fullName email');

  const localizedCommunity = updatedCommunity
    ? localizeCommunity(updatedCommunity.toObject(), lang)
    : updatedCommunity;

  sendSuccess(res, localizedCommunity, t(lang,"community.updated"), 201);
});

/**
 * Set or unset featured status for a community
 * PATCH /v1/communities/:id/feature
 * Admin only
 */
 export const featureCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
   const { id } = req.params;
   const { isFeatured } = req.body as { isFeatured: boolean };

   const community = await Community.findById(id);
   if (!community) {
     throw new AppError('Community not found', 404);
   }

   community.isFeatured = isFeatured;
   await community.save();

   const updatedCommunity = await Community.findById(id)
     .populate('createdBy', 'fullName email')
     .populate('members', 'fullName email');

   sendSuccess(res, updatedCommunity, `Community ${isFeatured ? 'marked as' : 'removed from'} featured`, 200);
 });

/**
 * Get communities highlighted for homepage
 * GET /v1/communities/featured
 * Public
 */
 export const getFeaturedCommunities = asyncHandler(async (req: Request, res: Response) => {
   const {
     type,
     location,
     category,
     search,
     page = 1,
     limit = 10,
     isActive,
     isPublic,
   } = req.query as any;

   const query: any = { isFeatured: true };

   if (type && ['Club', 'Shop', 'Women', 'Youth', 'Family', 'Corporate'].includes(type as string)) {
     query.type = type;
   }
   if (location && ['Abu Dhabi', 'Dubai', 'Al Ain', 'Sharjah'].includes(location as string)) {
     query.location = location;
   }
   if (category) {
     query.category = { $in: [category] };
   }
   if (isActive !== undefined) {
     query.isActive = isActive === 'true';
   }
   if (isPublic !== undefined) {
     query.isPublic = isPublic === 'true';
   }
   if (search && typeof search === 'string') {
     query.$text = { $search: search };
   }

   const pageNum = Number(page);
   const limitNum = Number(limit);
   const skip = (pageNum - 1) * limitNum;

   const communities = await Community.find(query)
     .populate('createdBy', 'fullName email')
     .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
     .skip(skip)
     .limit(limitNum);

   const total = await Community.countDocuments(query);

   const now = new Date();
   const communitiesWithCounts = await Promise.all(
     communities.map(async (comm) => {
       const upcomingEvents = await Event.countDocuments({
         communityId: comm._id,
         eventDate: { $gte: now },
       });
       const memberCount = await CommunityMembership.countDocuments({
         communityId: comm._id,
         status: 'active',
       });
       const commObj: any = comm.toObject();
       commObj.upcomingEventCount = upcomingEvents;
       commObj.memberCount = memberCount;
       return commObj;
     })
   );

   sendSuccess(
     res,
     {
       communities: communitiesWithCounts,
       pagination: {
         page: pageNum,
         limit: limitNum,
         total,
         pages: Math.ceil(total / limitNum),
       },
     },
     'Featured communities retrieved successfully',
     200
   );
 });
 
 /* Delete community
 * DELETE /v1/communities/:id
 * Admin only
 */
export const deleteCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  const community = await Community.findByIdAndDelete(id);

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  sendSuccess(res, null, t(lang, "community.deleted"), 201);
});

/**
 * Join community
 * POST /v1/communities/:id/join
 * Authenticated users only
 */
export const joinCommunity = asyncHandler(async (req: AuthRequest & { params: JoinCommunityParams }, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const communityId = req.params.id;
  const userId = req.user?.id;
  const isGuest = req.user?.isGuest;
  
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  if (isGuest) {
    throw new AppError(t(lang, "guest.access_denied"), 403);
  }

  const membership = await communityMembershipService.joinCommunity(userId, communityId);

  const communityDoc = await Community.findById(communityId).select('title titleAr location type');

  // message based on resulting status
  const message = membership.status === 'active' ?
    t(lang, "community.joined") :
    t(lang, "community.leave");

  const localizedCommunity = communityDoc ? localizeCommunity(communityDoc.toObject(), lang) : null;

  sendSuccess(res, { community: localizedCommunity, membership }, message, 201);
});

/**
 * Leave community
 * POST /v1/communities/:id/leave
 * Authenticated users only
 */
export const leaveCommunity = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as SupportedLanguage;
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(t(lang, "auth.unauthorized"), 401);
    }

    const result = await communityMembershipService.leaveCommunity(userId, id);

    sendSuccess(res, result, t(lang, "community.leave"), 200);
  }
);

/**
 * Get community members
 * GET /v1/communities/:id/communityMembers
 * Public – guest-accessible.
 */
export const getCommunityMembers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const id = req.params.id as string;
  
  const { page = 1, limit = 10 } = req.query;


  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 10);

  const members = await communityMembershipService.getCommunityMembers(id, pageNum, limitNum);

  sendSuccess(res, members, t(lang,"community.memberRetrieved"), 201);
});


/*
* Get user community count
*/
export const getUserCommunityCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;

  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }
  const count = await communityMembershipService.getUserCommunities(userId);
  sendSuccess(res, { count }, t(lang,"community.memberCount"), 201);
});


/*
* Get baned users in a community
*/
export const getBannedUsersInCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }

  const bannedUsers = await communityMembershipService.getBannedMembers(id);
  sendSuccess(res, bannedUsers, t(lang, "community.bannedUsers"), 201);
});

/*
* is member of community
*/
export const isMemberOfCommunity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id: communityId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, "auth.unauthorized"), 401);
  }
  const memberships = await communityMembershipService.isMember(userId, communityId);
  sendSuccess(res, { isMember: memberships }, t(lang, "community.status_retrieved"), 201);
});

/**
 * Add images to community gallery
 * POST /v1/communities/:id/gallery
 * Admin only
 */
export const addGalleryImages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
// console.log('body', req.body);
  const allFiles: Express.Multer.File[] = Array.isArray(req.files)
    ? req.files
    : req.files
      ? Object.values(req.files as Record<string, Express.Multer.File[]>).flat()
      : [];

  const uploadedImageUrls =
    allFiles.length > 0
      ? await Promise.all(
          allFiles.map(async (file) => {
            const uploaded = await uploadImageBufferToS3(
              file.buffer,
              file.mimetype,
              file.originalname,
              'galleries'
            );
            return uploaded.url;
          })
        )
      : [];

  const bodyImages = normalizeGalleryImagesInput((req.body as any).images);
  const bodyImage = normalizeGalleryImagesInput((req.body as any).image);
  const bodyGallery = normalizeGalleryImagesInput((req.body as any).gallery);
  const bodyGalleryImages = normalizeGalleryImagesInput((req.body as any).galleryImages);
  const images = [...uploadedImageUrls, ...bodyImages, ...bodyImage, ...bodyGallery, ...bodyGalleryImages];

  if (images.length === 0) {
    throw new AppError('At least one image is required', 400);
  }

  const community = await Community.findById(id);

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  // Initialize gallery array if it doesn't exist
  if (!community.gallery) {
    community.gallery = [];
  }

  // Add new images, avoiding duplicates
  const existingImages = new Set(community.gallery);
  const newImages = images.filter((imageUrl: string) => !existingImages.has(imageUrl));
  
  if (newImages.length === 0) {
    throw new AppError(t(lang, "community.gallery_all_exist"), 400);
  }

  community.gallery = [...community.gallery, ...newImages];
  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('members', 'fullName email');

  if (!updatedCommunity) {
    throw new AppError(t(lang, "community.not_found"), 500);
  }

  const localizedCommunity = localizeCommunity(updatedCommunity.toObject(), lang);

  void notifyCommunityGalleryAdded({
    communityId: String(id),
    imageCount: newImages.length,
    url: `/communities/${id}`,
  });

  sendSuccess(
    res,
    {
      community: localizedCommunity,
      addedImages: newImages,
      totalImages: updatedCommunity.gallery?.length || 0,
    },
    t(lang, "community.gallery_added", { count: newImages.length }),
    201
  );
});

/**
 * Remove images from community gallery
 * DELETE /v1/communities/:id/gallery
 * Admin only
 */
export const removeGalleryImages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;
  const { imageUrls } = req.body;
  
  const community = await Community.findById(id);

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  // Initialize gallery array if it doesn't exist
  if (!community.gallery || community.gallery.length === 0) {
    throw new AppError(t(lang, "community.gallery_empty"), 400);
  }

  // Remove images that exist in the gallery
  const imagesToRemove = new Set(imageUrls);
  const removedImages = community.gallery.filter((imageUrl) => imagesToRemove.has(imageUrl));
  
  community.gallery = community.gallery.filter((imageUrl) => !imagesToRemove.has(imageUrl));
  
  const removedCount = removedImages.length;

  if (removedCount === 0) {
    throw new AppError(t(lang, "community.gallery_none_found"), 400);
  }

  await community.save();

  const updatedCommunity = await Community.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('members', 'fullName email');

  if (!updatedCommunity) {
    throw new AppError(t(lang, "community.not_found"), 500);
  }

  const localizedCommunity = localizeCommunity(updatedCommunity.toObject(), lang);

  sendSuccess(
    res,
    {
      community: localizedCommunity,
      removedImages,
      removedCount,
      totalImages: updatedCommunity.gallery?.length || 0,
    },
    t(lang, "community.gallery_removed", { count: removedCount }),
    201
  );
});

/**
 * Get community gallery images
 * GET /v1/communities/:id/gallery
 * Public – guest-accessible.
 */
export const getGalleryImages = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as SupportedLanguage;
  const { id } = req.params;

  const community = await Community.findById(id).select('gallery title titleAr');

  if (!community) {
    throw new AppError(t(lang, "community.not_found"), 404);
  }

  sendSuccess(
    res,
    {
      communityId: id,
      communityTitle: lang === 'ar' ? community.titleAr || community.title : community.title,
      gallery: community.gallery || [],
      imageCount: community.gallery?.length || 0,
    },
    t(lang, "community.gallery_retrieved"),
    200
  );
});
