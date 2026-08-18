import { localizeDocumentFields, SupportedLanguage, localizeTrackStatic } from '@/utils/localization';

const TRACK_LOCALIZED_FIELDS = {
  title: 'titleAr',
  description: 'descriptionAr',
};

/** Shared with track APIs and dashboard ranked track list. */
export const localizeTrack = (track: Record<string, any>, lang: SupportedLanguage) => {
  const localized = localizeDocumentFields(track, lang, TRACK_LOCALIZED_FIELDS);
  localizeTrackStatic(localized, lang);
  return localized;
};
