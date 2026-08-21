import { isEventCalendarDateInPast } from '@/utils/event-date';
import { localizeDocumentFields, SupportedLanguage, localizeEventStatic } from '@/utils/localization';

const EVENT_LOCALIZED_FIELDS = {
  title: 'titleAr',
  description: 'descriptionAr',
  address: 'addressAr',
};

const SCHEDULE_LOCALIZED_FIELDS = {
  title: 'titleAr',
  description: 'descriptionAr',
};

const normalizeRefValue = (value: unknown): any => {
  if (value == null || value === '') return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeRefValue(item)).filter((item) => item != null && item !== '');
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value);
    return { _id: id, id, title: '' };
  }

  if (typeof value === 'object') {
    const ref = { ...(value as Record<string, any>) };
    if (ref._id && !ref.id) ref.id = String(ref._id);
    if (ref.id && !ref._id) ref._id = String(ref.id);
    return ref;
  }

  return value;
};

export const normalizeEventRelationPayload = (event: Record<string, any>) => {
  if (event.communityId !== undefined && event.communityId !== null) {
    event.communityId = normalizeRefValue(event.communityId);
  }

  if (event.trackId !== undefined && event.trackId !== null) {
    event.trackId = normalizeRefValue(event.trackId);
  }

  if (event.trackId != null) {
    const trackValue = Array.isArray(event.trackId) ? event.trackId : [event.trackId];
    const normalizedTrackIds = trackValue
      .map((item: any) => {
        if (!item || typeof item === 'string') return item;
        if (typeof item === 'object') return item._id ?? item.id ?? null;
        return null;
      })
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    event.trackIds = [...new Set(normalizedTrackIds)];
  }

  return event;
};

/** Shared with event listing/detail APIs and dashboard upcoming event. */
export const localizeEventPayload = (event: Record<string, any>, lang: SupportedLanguage) => {
  const payload = normalizeEventRelationPayload({ ...event });
  if (payload.eventDate && isEventCalendarDateInPast(new Date(payload.eventDate))) {
    if (payload.status === 'Open' || payload.status === 'Full') {
      payload.status = 'Closed';
    }
  }

  const localizedEvent = localizeDocumentFields(payload, lang, EVENT_LOCALIZED_FIELDS);

  localizeEventStatic(localizedEvent, lang);

  if (Array.isArray(localizedEvent.schedule)) {
    localizedEvent.schedule = localizedEvent.schedule.map((item: Record<string, any>) =>
      localizeDocumentFields(item, lang, SCHEDULE_LOCALIZED_FIELDS)
    );
  }

  if (localizedEvent.communityId && typeof localizedEvent.communityId === 'object') {
    localizedEvent.communityId = localizeDocumentFields(localizedEvent.communityId, lang, {
      title: 'titleAr',
    });
  }

  if (localizedEvent.trackId && typeof localizedEvent.trackId === 'object') {
    localizedEvent.trackId = localizeDocumentFields(localizedEvent.trackId, lang, {
      title: 'titleAr',
    });
  }

  return localizedEvent;
};
