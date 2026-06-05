import express from 'express';
import {
  createEvent,
  getAllEvents,
  getCompletedEventStats,
  getEventById,
  updateEvent,
  deleteEvent,
  joinEvent,
  cancelRegistration,
  getEventResults,
  getEventResultsList,
  markParticipantCheckedIn,
  markParticipantNoShow,
  removeEventParticipant,
  exportEventResults,
  checkInAllRegisteredParticipants,
  markAllParticipantsNoShow,
  addToCalendar,
  getMemberEventStatus,
  deleteGalleryImage,
  addEventGalleryImages,
  closeEventRegistration,
  reopenEventRegistration,
  completeEvent,
  disableEvent

} from '@/controllers/event.controller';
import { validate, validateParams } from '@/middleware/validate.middleware';
import {
  createEventSchema,
  updateEventSchema,
  getEventsQuerySchema,
} from '@/validators/event.validator';
import { joinEventSchema } from '@/validators/event-result.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { requireParsedMultipartBody, uploadEventImagesIfMultipart } from '@/middleware/upload.middleware';

const router = express.Router();


// Public routes – guest-accessible (no auth required)

router.get('/', validate(getEventsQuerySchema), getAllEvents);
router.get(
  '/completed-stats',
  authenticate,
  // requireStaffPermission('manage_events'),
  getCompletedEventStats
);
router.get('/:id', authenticate, getEventById);
router.post('/:eventId/results', authenticate, getEventResults);
router.get('/:eventId/results',  authenticate, getEventResultsList);
router.get('/:eventId/results/export', authenticate, requireStaffPermission('manage_events'), exportEventResults);
router.post('/:eventId/joinEvent', authenticate, validateParams(joinEventSchema), joinEvent);
router.post('/:eventId/cancel', authenticate, cancelRegistration);
router.post('/:eventId/add-to-calendar', authenticate, addToCalendar);
router.get('/:eventId/member-status', authenticate, getMemberEventStatus);
router.post(
  '/:eventId/gallery',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadEventImagesIfMultipart,
  requireParsedMultipartBody,
  addEventGalleryImages
);
router.delete(
  '/:eventId/gallery',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadEventImagesIfMultipart,
  requireParsedMultipartBody,
  deleteGalleryImage
);
router.patch('/:eventId/participants/check-in-all', authenticate, requireStaffPermission('manage_events'), checkInAllRegisteredParticipants);
router.patch('/:eventId/participants/no-show-all', authenticate, requireStaffPermission('manage_events'), markAllParticipantsNoShow);
router.patch('/:eventId/participants/:userId/check-in', authenticate, requireStaffPermission('manage_events'), markParticipantCheckedIn);
router.patch('/:eventId/participants/:userId/no-show', authenticate, requireStaffPermission('manage_events'), markParticipantNoShow);
router.delete('/:eventId/participants/:userId', authenticate, requireStaffPermission('manage_events'), removeEventParticipant);


// Admin only routes

router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadEventImagesIfMultipart,
  requireParsedMultipartBody,
  validate(createEventSchema),
  createEvent
);

router.patch(
  '/:id',
  authenticate,
  requireStaffPermission('manage_events'),
  uploadEventImagesIfMultipart,
  requireParsedMultipartBody,
  validate(updateEventSchema),
  updateEvent
);
router.delete('/:id', authenticate, requireStaffPermission('manage_events'), deleteEvent);
router.patch('/:eventId/close-registration', authenticate, requireStaffPermission('manage_events'), closeEventRegistration);
router.patch('/:eventId/reopen-registration', authenticate, requireStaffPermission('manage_events'), reopenEventRegistration);
router.patch('/:eventId/complete', authenticate, requireStaffPermission('manage_events'), completeEvent);
router.patch('/:eventId/disable', authenticate, requireStaffPermission('manage_events'), disableEvent);

export default router;
