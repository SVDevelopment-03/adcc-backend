import express from 'express';
import { validate } from '@/middleware/validate.middleware';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { requireMultipartFormData, uploadTrackImages, requireParsedMultipartBody } from '@/middleware/upload.middleware';

import {  
    createTrackSchema,
    updateTrackSchema
 } from '@/validators/track.validator';
import {
    createTrack,
    getAllTracks,
    getTrackById,
    getTrackEvents,
    updateTrack,
    deleteTrack,
    getTrackResults,
    trackCommunityPhotos,
    trackCommunityResults,
    archiveTrack,
    disableTrack,
    enableTrack,
    deleteGalleryImage,
    addTrackGalleryImages
} from '@/controllers/track.controller';

const router = express.Router();

const normalizeTrackFormData = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    const body: any = req.body;

    if (body['facilities[]'] !== undefined && body.facilities === undefined) {
      body.facilities = body['facilities[]'];
    }

    if (body.type !== undefined && body.trackType === undefined) {
      body.trackType = body.type;
    }
  }

  next();
};

router.get('/', getAllTracks);
router.get('/:trackId', getTrackById);
router.get('/:trackId/events', getTrackEvents);
router.get('/:trackId/events/results', authenticate, getTrackResults);  // Track-related event results
router.get('/:trackId/events/:eventId/communities/:Id/photos', authenticate, trackCommunityPhotos); // Track-related event results with photos for a community
router.get('/:trackId/communities/results', authenticate, trackCommunityResults); // Track-related event results with photos for a community

// Admin only routes
router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadTrackImages,
  requireParsedMultipartBody,
  normalizeTrackFormData,
  validate(createTrackSchema),
  createTrack
);
router.patch('/:trackId', authenticate, requireStaffPermission('manage_events'), uploadTrackImages, normalizeTrackFormData, validate(updateTrackSchema) , updateTrack);
router.delete('/:trackId', authenticate, requireStaffPermission('manage_events'), deleteTrack);
router.post(
  '/:trackId/gallery',
  authenticate,
  requireStaffPermission('manage_events'),
  requireMultipartFormData,
  uploadTrackImages,
  requireParsedMultipartBody,
  addTrackGalleryImages
);
router.delete(
  '/:trackId/gallery',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadTrackImages,
  requireParsedMultipartBody,
  deleteGalleryImage
);
router.patch(
  '/:trackId/archive',
  authenticate,
  requireStaffPermission('manage_events'),
  archiveTrack
);
router.patch(
  '/:trackId/disable',
  authenticate,
  requireStaffPermission('manage_events'),
  disableTrack
);
router.patch(
  '/:trackId/enable',
  authenticate,
  requireStaffPermission('manage_events'),
  enableTrack
);

export default router;
