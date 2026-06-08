import { Request, Response } from 'express';
import Challenge from '@/models/challenge.model';
import ChallengeJoin from '@/models/challengeJoin.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import challengeNotificationService from '@/services/challenge-notification.service';

const attachChallengeImage = async (req: AuthRequest, data: Record<string, any>) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return data;

  const uploadResult = await uploadImageBufferToS3(
    file.buffer,
    file.mimetype,
    file.originalname,
    'challenges'
  );
  data.image = uploadResult.url;

  return data;
};

/**
 * Create new challenge
 * POST /v1/challenges
 * Admin only
 */
export const createChallenge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const challengeData: Record<string, any> = {
    ...req.body,
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
    createdBy: userId,
  };

  await attachChallengeImage(req, challengeData);

  const challenge = await Challenge.create(challengeData);

  void challengeNotificationService.notifyChallengePublished(String(challenge._id));

  sendSuccess(res, challenge, t(lang, 'challenge.created'), 201);
});

/**
 * Get all challenges
 * GET /v1/challenges
 */
export const getAllChallenges = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { status, type, featured, communityId, search, page = 1, limit = 10 } = req.query as any;

  const filter: any = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (typeof featured === 'boolean') filter.featured = featured;
  if (communityId) filter.communities = communityId;
  if (search && typeof search === 'string') {
    const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { unit: searchRegex },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const challengesQuery = Challenge.find(filter)
    .populate('createdBy', 'fullName email')
    .populate('communities', 'title')
    .populate('rewardBadge', 'name icon image category rarity')
    .sort({ startDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  const [challenges, total] = await Promise.all([
    challengesQuery,
    Challenge.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      challenges,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, 'challenge.allChallenges'),
    200
  );
});

/**
 * Get challenge by ID
 * GET /v1/challenges/:id
 */
export const getChallengeById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const userId = req.user?.id;

  const challenge = await Challenge.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('communities', 'title')
    .populate('rewardBadge', 'name icon image category rarity');

  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  const joinRecord = userId
    ? await ChallengeJoin.findOne({ challengeId: id, userId }).lean()
    : null;

  const payload = {
    ...challenge.toObject(),
    isJoined: joinRecord?.status === 'joined',
    joinedAt: joinRecord?.joinedAt ?? null,
  };

  sendSuccess(res, payload, t(lang, 'challenge.details'));
});

/**
 * Update challenge
 * PATCH /v1/challenges/:id
 * Admin only
 */
export const updateChallenge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const updateData: Record<string, any> = { ...req.body };
  const existingChallenge = await Challenge.findById(id).select('status publishedNotificationSentAt').lean();

  if (updateData.startDate) {
    updateData.startDate = new Date(updateData.startDate);
  }
  if (updateData.endDate) {
    updateData.endDate = new Date(updateData.endDate);
  }

  await attachChallengeImage(req, updateData);

  const challenge = await Challenge.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate('createdBy', 'fullName email')
    .populate('communities', 'title')
    .populate('rewardBadge', 'name icon image category rarity');

  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  const wasPublishable = existingChallenge && ['Active', 'Upcoming'].includes((existingChallenge as any).status);
  const isPublishable = ['Active', 'Upcoming'].includes(String(challenge.status));
  if (!wasPublishable && isPublishable) {
    void challengeNotificationService.notifyChallengePublished(String(challenge._id));
  }

  sendSuccess(res, challenge, t(lang, 'challenge.updated'));
});

/**
 * Delete challenge
 * DELETE /v1/challenges/:id
 * Admin only
 */
export const deleteChallenge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const challenge = await Challenge.findByIdAndDelete(id);

  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'challenge.deleted'));
});

/**
 * Join a challenge
 * POST /v1/challenges/:id/join
 */
export const joinChallenge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const existingJoin = await ChallengeJoin.findOne({ challengeId: id, userId });

  if (existingJoin?.status === 'joined') {
    const challenge = await Challenge.findById(id)
      .populate('createdBy', 'fullName email')
      .populate('communities', 'title')
      .populate('rewardBadge', 'name icon image category rarity');

    if (!challenge) {
      throw new AppError(t(lang, 'challenge.not_found'), 404);
    }

    sendSuccess(res, challenge, t(lang, 'challenge.joined') || 'Joined challenge');
    return;
  }

  const challenge = await Challenge.findByIdAndUpdate(
    id,
    { $inc: { participants: 1 } },
    { new: true }
  )
    .populate('createdBy', 'fullName email')
    .populate('communities', 'title')
    .populate('rewardBadge', 'name icon image category rarity');

  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  await ChallengeJoin.findOneAndUpdate(
    { challengeId: id, userId },
    {
      challengeId: id,
      userId,
      status: 'joined',
      joinedAt: existingJoin?.joinedAt || new Date(),
      leftAt: null,
      progressValue: 0,
      progressPercent: 0,
      milestone25SentAt: null,
      milestone50SentAt: null,
      milestone75SentAt: null,
      completedNotificationSentAt: null,
    },
    { upsert: true, new: true }
  );

  void challengeNotificationService.notifyChallengeJoined({ challengeId: String(id), userId });

  sendSuccess(res, challenge, t(lang, 'challenge.joined') || 'Joined challenge');
});

/**
 * Update challenge progress
 * PATCH /v1/challenges/:id/progress
 */
export const updateChallengeProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const userId = req.user?.id;
  const progressValueInput = req.body?.progress ?? req.body?.progressValue;
  const progressPercentInput = req.body?.progressPercent;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const challenge = await Challenge.findById(id).select('target participants completions title').lean();
  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  const joinRecord = await ChallengeJoin.findOne({ challengeId: id, userId });
  if (!joinRecord || joinRecord.status !== 'joined') {
    throw new AppError(t(lang, 'challenge.not_joined') || 'Join the challenge first', 400);
  }

  const target = Math.max(1, Number((challenge as any).target) || 1);
  const progressValue = Math.max(0, Number(progressValueInput ?? 0));
  const progressPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        progressPercentInput !== undefined
          ? Number(progressPercentInput)
          : (progressValue / target) * 100
      )
    )
  );

  const previousPercent = Number(joinRecord.progressPercent || 0);
  const completedBefore = !!joinRecord.completedNotificationSentAt;

  joinRecord.progressValue = progressValue;
  joinRecord.progressPercent = progressPercent;
  await joinRecord.save();

  const completionTriggered = progressPercent >= 100 && !completedBefore;
  if (completionTriggered) {
    await Challenge.updateOne(
      { _id: id },
      {
        $inc: { completions: 1 },
      }
    );
  }

  if (progressPercent > previousPercent) {
    void challengeNotificationService.notifyChallengeProgressMilestones({
      challengeId: String(id),
      userId,
      progressPercent,
    });
  }

  const updatedChallenge = await Challenge.findById(id)
    .populate('createdBy', 'fullName email')
    .populate('communities', 'title')
    .populate('rewardBadge', 'name icon image category rarity');

  sendSuccess(res, {
    challenge: updatedChallenge,
    progress: {
      progressValue,
      progressPercent,
      completed: completionTriggered,
    },
  }, t(lang, 'challenge.updated_progress') || 'Challenge progress updated');
});

/**
 * Get challenge member status
 * GET /v1/challenges/:id/member-status
 */
export const getChallengeMemberStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const challenge = await Challenge.findById(id);
  if (!challenge) {
    throw new AppError(t(lang, 'challenge.not_found'), 404);
  }

  const joinRecord = await ChallengeJoin.findOne({ challengeId: id, userId });
  const joined = joinRecord?.status === 'joined';

  sendSuccess(res, {
    status: joined ? 'joined' : 'not_joined',
    participationDetails: joinRecord
      ? {
          joinedAt: joinRecord.joinedAt?.toISOString?.() ?? joinRecord.joinedAt,
          leftAt: joinRecord.leftAt?.toISOString?.() ?? joinRecord.leftAt ?? null,
          progressValue: joinRecord.progressValue ?? 0,
          progressPercent: joinRecord.progressPercent ?? 0,
        }
      : null,
  }, t(lang, 'challenge.details'));
});
