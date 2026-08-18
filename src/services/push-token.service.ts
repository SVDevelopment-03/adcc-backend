import User from '@/models/user.model';

export type PushPlatform = 'web' | 'android' | 'ios';

export interface RegisterFcmTokenPayload {
  token: string;
  userAgent?: string;
  platform?: PushPlatform;
  deviceId?: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  appBuild?: string;
}

export const upsertUserFcmToken = async (
  userId: string,
  payload: RegisterFcmTokenPayload
): Promise<void> => {
  const {
    token,
    userAgent,
    platform,
    deviceId,
    deviceModel,
    osVersion,
    appVersion,
    appBuild,
  } = payload;

  const now = new Date();

  // Ensure a token belongs to only one user
  await User.updateMany(
    { _id: { $ne: userId }, 'fcmTokens.token': token },
    { $pull: { fcmTokens: { token } } }
  );

  const setFields: Record<string, unknown> = {
    'fcmTokens.$.lastSeenAt': now,
  };
  if (userAgent !== undefined) setFields['fcmTokens.$.userAgent'] = userAgent;
  if (platform !== undefined) setFields['fcmTokens.$.platform'] = platform;
  if (deviceId !== undefined) setFields['fcmTokens.$.deviceId'] = deviceId;
  if (deviceModel !== undefined) setFields['fcmTokens.$.deviceModel'] = deviceModel;
  if (osVersion !== undefined) setFields['fcmTokens.$.osVersion'] = osVersion;
  if (appVersion !== undefined) setFields['fcmTokens.$.appVersion'] = appVersion;
  if (appBuild !== undefined) setFields['fcmTokens.$.appBuild'] = appBuild;

  const updateByToken = await User.updateOne(
    { _id: userId, 'fcmTokens.token': token },
    { $set: setFields }
  );

  let updated = updateByToken.matchedCount > 0;

  if (!updated && deviceId) {
    const deviceFilter: Record<string, unknown> = {
      _id: userId,
      'fcmTokens.deviceId': deviceId,
    };
    if (platform) {
      deviceFilter['fcmTokens.platform'] = platform;
    }

    const setByDevice: Record<string, unknown> = {
      ...setFields,
      'fcmTokens.$.token': token,
      'fcmTokens.$.createdAt': now,
    };

    const updateByDevice = await User.updateOne(deviceFilter, { $set: setByDevice });
    updated = updateByDevice.matchedCount > 0;
  }

  if (!updated) {
    const entry: Record<string, unknown> = {
      token,
      createdAt: now,
      lastSeenAt: now,
    };
    if (userAgent !== undefined) entry.userAgent = userAgent;
    if (platform !== undefined) entry.platform = platform;
    if (deviceId !== undefined) entry.deviceId = deviceId;
    if (deviceModel !== undefined) entry.deviceModel = deviceModel;
    if (osVersion !== undefined) entry.osVersion = osVersion;
    if (appVersion !== undefined) entry.appVersion = appVersion;
    if (appBuild !== undefined) entry.appBuild = appBuild;

    await User.findByIdAndUpdate(userId, { $push: { fcmTokens: entry } }, { new: true });
  }
};
