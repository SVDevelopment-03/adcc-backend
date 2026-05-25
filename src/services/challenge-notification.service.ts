import Challenge from '@/models/challenge.model';
import ChallengeJoin from '@/models/challengeJoin.model';
import CommunityMembership from '@/models/communityMembership.model';
import User from '@/models/user.model';
import notificationService from '@/services/notification.service';

const REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const STARTED_FLAG = Symbol.for('adcc.challengeNotificationSchedulerStarted');

async function getAllUserIds(): Promise<string[]> {
  const users = await User.find({}).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function getCommunityRecipientIds(communityIds: Array<string | any>): Promise<string[]> {
  if (!communityIds.length) return [];

  const memberships = await CommunityMembership.find({
    communityId: { $in: communityIds },
    status: 'active',
  })
    .select('userId')
    .lean();

  return Array.from(new Set(memberships.map((membership: any) => String(membership.userId))));
}

async function getChallengeAudienceIds(challengeId: string): Promise<string[]> {
  const challenge = await Challenge.findById(challengeId).select('communities').lean();
  if (!challenge) return [];

  const communityIds = Array.isArray((challenge as any).communities)
    ? (challenge as any).communities.map((communityId: any) => String(communityId))
    : [];

  if (communityIds.length > 0) {
    const communityRecipients = await getCommunityRecipientIds(communityIds);
    if (communityRecipients.length > 0) return communityRecipients;
  }

  return getAllUserIds();
}

async function getParticipantIds(challengeId: string): Promise<string[]> {
  const rows = await ChallengeJoin.find({ challengeId, status: 'joined' }).select('userId').lean();
  return Array.from(new Set(rows.map((row: any) => String(row.userId))));
}

async function sendToUsers(
  userIds: string[],
  title: string,
  body: string,
  url?: string
): Promise<{ successCount: number; failureCount: number }> {
  if (userIds.length === 0) return { successCount: 0, failureCount: 0 };
  try {
    const results = await notificationService.sendNotificationToUsers(userIds, { title, body }, { url });
    return results.reduce(
      (totals, entry) => {
        const result = entry.result as { successCount?: number; failureCount?: number } | undefined;
        totals.successCount += result?.successCount ?? 0;
        totals.failureCount += result?.failureCount ?? 0;
        return totals;
      },
      { successCount: 0, failureCount: 0 }
    );
  } catch (error) {
    console.error('[challenge-notification] sendToUsers failed', error);
    return { successCount: 0, failureCount: 0 };
  }
}

export async function notifyChallengePublished(challengeId: string): Promise<boolean> {
  const challenge = await Challenge.findById(challengeId)
    .select('title status publishedNotificationSentAt communities')
    .lean();

  if (!challenge) return false;
  if ((challenge as any).publishedNotificationSentAt) return false;
  if (!['Active', 'Upcoming'].includes((challenge as any).status)) return false;

  const recipientIds = await getChallengeAudienceIds(challengeId);
  const result = await sendToUsers(
    recipientIds,
    'New challenge available',
    `🏁 ${challenge.title} is now open. Join now and start tracking your progress!`,
    `/challenges/${challengeId}`
  );

  if (result.successCount || result.failureCount) {
    await Challenge.updateOne({ _id: challengeId }, { $set: { publishedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function notifyChallengeJoined(params: { challengeId: string; userId: string }): Promise<boolean> {
  const challenge = await Challenge.findById(params.challengeId).select('title').lean();
  if (!challenge) return false;

  const result = await sendToUsers(
    [params.userId],
    'Challenge joined',
    `✅ You joined ${challenge.title}. Start riding to hit your milestones!`,
    `/challenges/${params.challengeId}`
  );

  return result.successCount > 0 || result.failureCount > 0;
}

export async function notifyChallengeProgressMilestones(params: {
  challengeId: string;
  userId: string;
  progressPercent: number;
}): Promise<{ milestoneReached: boolean; completed: boolean }> {
  const challenge = await Challenge.findById(params.challengeId).select('title rewardBadge').lean();
  const joinRecord = await ChallengeJoin.findOne({ challengeId: params.challengeId, userId: params.userId });
  if (!challenge || !joinRecord) return { milestoneReached: false, completed: false };

  const updates: Record<string, Date> = {};
  let milestoneReached = false;
  const percent = Math.max(0, Math.min(100, Math.round(params.progressPercent)));

  if (percent >= 25 && !joinRecord.milestone25SentAt) {
    await sendToUsers([params.userId], 'Challenge milestone reached', `🎯 You hit 25% of ${challenge.title}. Keep going!`, `/challenges/${params.challengeId}`);
    updates.milestone25SentAt = new Date();
    milestoneReached = true;
  }

  if (percent >= 50 && !joinRecord.milestone50SentAt) {
    await sendToUsers([params.userId], 'Challenge milestone reached', `🔥 You hit 50% of ${challenge.title}. Halfway there!`, `/challenges/${params.challengeId}`);
    updates.milestone50SentAt = new Date();
    milestoneReached = true;
  }

  if (percent >= 75 && !joinRecord.milestone75SentAt) {
    await sendToUsers([params.userId], 'Challenge milestone reached', `🏆 You hit 75% of ${challenge.title}. Almost done!`, `/challenges/${params.challengeId}`);
    updates.milestone75SentAt = new Date();
    milestoneReached = true;
  }

  const completed = percent >= 100 && !joinRecord.completedNotificationSentAt;
  if (completed) {
    const rewardText = challenge.rewardBadge ? ' Your badge is ready.' : ' You finished the challenge.';
    await sendToUsers(
      [params.userId],
      'Challenge completed',
      `🎉 You completed ${challenge.title}.${rewardText}`,
      `/challenges/${params.challengeId}`
    );
    updates.completedNotificationSentAt = new Date();
  }

  if (Object.keys(updates).length > 0) {
    await ChallengeJoin.updateOne({ _id: joinRecord._id }, { $set: updates });
  }

  return { milestoneReached, completed };
}

export async function notifyChallengeEndingSoon(challengeId: string): Promise<boolean> {
  const challenge = await Challenge.findById(challengeId)
    .select('title endDate endingSoonNotificationSentAt status')
    .lean();

  if (!challenge) return false;
  if ((challenge as any).endingSoonNotificationSentAt) return false;
  if (!['Active', 'Upcoming'].includes((challenge as any).status)) return false;

  const endDate = new Date((challenge as any).endDate);
  if (Number.isNaN(endDate.getTime())) return false;

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const withinWindow = diffMs > 0 && diffMs <= 72 * 60 * 60 * 1000;
  if (!withinWindow) return false;

  const recipientIds = await getParticipantIds(challengeId);
  const result = await sendToUsers(
    recipientIds,
    'Challenge ending soon',
    `⏰ ${challenge.title} ends soon. Finish strong before the deadline.`,
    `/challenges/${challengeId}`
  );

  if (result.successCount || result.failureCount) {
    await Challenge.updateOne({ _id: challengeId }, { $set: { endingSoonNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function sweepChallengeNotifications(): Promise<void> {
  const challenges = await Challenge.find({
    status: { $in: ['Active', 'Upcoming'] },
  })
    .select('title status startDate endDate publishedNotificationSentAt endingSoonNotificationSentAt communities rewardBadge')
    .lean();

  for (const challenge of challenges as any[]) {
    if (!challenge.publishedNotificationSentAt) {
      await notifyChallengePublished(String(challenge._id));
    }

    await notifyChallengeEndingSoon(String(challenge._id));
  }
}

export function startChallengeNotificationScheduler(): void {
  if ((globalThis as any)[STARTED_FLAG]) return;
  (globalThis as any)[STARTED_FLAG] = true;

  const runSweep = async () => {
    try {
      await sweepChallengeNotifications();
    } catch (error) {
      console.error('[challenge-notification] sweep failed', error);
    }
  };

  void runSweep();
  setInterval(runSweep, REMINDER_SWEEP_INTERVAL_MS);
}

export default {
  notifyChallengePublished,
  notifyChallengeJoined,
  notifyChallengeProgressMilestones,
  notifyChallengeEndingSoon,
  sweepChallengeNotifications,
  startChallengeNotificationScheduler,
};