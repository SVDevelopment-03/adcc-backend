import { Router } from 'express';
import exampleRoutes from './example.route';
import authRoutes from './auth.route';
import communityRoutes from './community.route';
import communityPostRoutes from './community-post.module';
import communityRideRoutes from './community-ride.route';
import eventRoutes from './event.route';
import challengeRoutes from './challenge.route';
import badgeRoutes from './badge.route';
import trackRoutes from './track.route';
import uploadRoutes from './upload.route';
import storeRoutes from './store.route';
import storeCompatRoutes from './store-compat.route';
import userRoutes from './user.route';
import feedPostRoutes from './feed-post.route';
import globalSettingRoutes from './global-setting.route';
import pushNotificationRoutes from './push-notification.route';
import rbacRoutes from './rbac.route';
import dashboardRoutes from './dashboard.route';
import adminNotificationRoutes from './admin-notification.route';

const router = Router();

// Register all routes
router.use('/auth', authRoutes);
router.use('/examples', exampleRoutes);
router.use('/communities', communityRoutes);
router.use('/communities/:communityId/community-posts', communityPostRoutes);
router.use('/community-rides', communityRideRoutes);
router.use('/events', eventRoutes);
router.use('/challenges', challengeRoutes);
router.use('/badges', badgeRoutes);
router.use('/tracks', trackRoutes);
router.use('/uploads', uploadRoutes);
router.use('/store', storeRoutes);
router.use('/items', storeCompatRoutes);
router.use('/user', userRoutes);
router.use('/feed-posts', feedPostRoutes);
router.use('/settings', globalSettingRoutes);
router.use('/push-notifications', pushNotificationRoutes);
router.use('/rbac', rbacRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin-notifications', adminNotificationRoutes);

// Add more routes here as you create them
// router.use('/users', userRoutes);
// router.use('/vendors', vendorRoutes);

export default router;
