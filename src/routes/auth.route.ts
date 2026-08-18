import express from 'express';
import {
  verifyFirebaseAuth,
  registerUser,
  refreshAccessToken,
  logout,
  deleteMyAccount,
  getCurrentUser,
  getCurrentUserStats,
  getCurrentUserMonthlyStats,
  getMyJoinedCommunities,
  getMyJoinedEvents,
  getMyActiveParticipations,
  getMyUpcomingEvents,
  getMyCancelledEvents,
  getMyCompletedEvents,
  getPerformanceInsights,
  updateMyProfile,
  guestLogin
} from '@/controllers/auth.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  verifyFirebaseAuthSchema,
  registerUserSchema,
  refreshTokenSchema,
  logoutSchema,
  updateProfileSchema,
} from '@/validators/auth.validator';
import { authenticate } from '@/middleware/auth.middleware';

const router = express.Router();

// Public routes
router.post('/verify', validate(verifyFirebaseAuthSchema), verifyFirebaseAuth);

router.post(
  '/register',
  authenticate,
  validate(registerUserSchema),
  registerUser
);
router.post('/refresh', validate(refreshTokenSchema), refreshAccessToken);
router.post('/guestLogin', guestLogin);

// Protected routes
router.post('/logout', authenticate, validate(logoutSchema), logout);
router.delete('/delete-account', authenticate, deleteMyAccount);
router.get('/me/stats', authenticate, getCurrentUserStats);
router.get('/me/monthly-stats', authenticate, getCurrentUserMonthlyStats);
router.get('/me/performance-insights', authenticate, getPerformanceInsights);
router.get('/me/joined-communities', authenticate, getMyJoinedCommunities);
router.get('/me/joined-events', authenticate, getMyJoinedEvents);
router.get('/me/active-participations', authenticate,getMyActiveParticipations);
router.get('/me/upcoming-events', authenticate, getMyUpcomingEvents);
router.get('/me/cancelled-events', authenticate, getMyCancelledEvents);
router.get('/me/completed-events', authenticate, getMyCompletedEvents);
router.patch('/me', authenticate, validate(updateProfileSchema), updateMyProfile);
router.get('/me', authenticate, getCurrentUser);

export default router;
