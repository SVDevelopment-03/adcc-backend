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

/** Shared with event listing/detail APIs and dashboard upcoming event. */
export const localizeEventPayload = (event: Record<string, any>, lang: SupportedLanguage) => {
  const payload = { ...event };
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
