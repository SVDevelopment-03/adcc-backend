import User from '@/models/user.model';

/**
 * Increment user stats when they join (or rejoin) an event.
 * Call after creating or updating EventResult to status 'joined'.
 */
export async function incrementStatsOnJoin(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $inc: { 'stats.totalEventsParticipated': 1 },
  });
}

/**
 * Decrement user stats when they cancel event participation.
 * Call after updating EventResult to status 'cancelled'.
 */
export async function decrementStatsOnCancel(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $inc: { 'stats.totalEventsParticipated': -1 },
  });
}

/**
 * Add completed distance, increment totalRides if event has a track, and increment completedCount.
 * Call after updating EventResult to status 'completed' with distance.
 */
export async function addDistanceOnComplete(
  userId: string,
  distanceKm: number,
  hasTrack: boolean
): Promise<void> {
  const inc: Record<string, number> = {
    'stats.completedCount': 1,
  };
  if (distanceKm > 0) {
    inc['stats.totalDistanceKm'] = distanceKm;
  }
  if (hasTrack) {
    inc['stats.totalRides'] = 1;
  }
  await User.findByIdAndUpdate(userId, { $inc: inc });
}

/**
 * Add points to user's total when an EventResult is completed with pointsEarned.
 * Call after setting EventResult to status 'completed' with pointsEarned (e.g. on submit with default points or after admin save/publish).
 */
export async function addPointsOnComplete(userId: string, points: number): Promise<void> {
  if (points > 0) {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalPoints': points },
    });
  }
}

export async function adjustPointsOnComplete(userId: string, points: number): Promise<void> {
  if (points !== 0) {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalPoints': points },
    });
  }
}

export async function adjustDistanceOnComplete(userId: string, kilometers: number): Promise<void> {
  if (kilometers !== 0) {
    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalDistanceKm': kilometers },
    });
  }
}
