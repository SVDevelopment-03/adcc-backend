import { Request } from 'express';
import { t } from './i18n';
import {
  getCachedLookupMap,
  LOOKUP_TYPE_EVENT_CATEGORY,
  LOOKUP_TYPE_COMMUNITY_CATEGORY,
  LOOKUP_TYPE_COMMUNITY_PURPOSE,
  LOOKUP_TYPE_COMMUNITY_TERRAIN,
  LOOKUP_TYPE_COUNTRY,
  LOOKUP_TYPE_CITY,
  LOOKUP_TYPE_TRACK_FACILITY,
  LOOKUP_TYPE_EVENT_AMENITY,
  LOOKUP_TYPE_CHALLENGE_TYPE,
  LOOKUP_TYPE_CHALLENGE_UNIT,
  LOOKUP_TYPE_NEWS_CATEGORY,
} from '@/services/lookup.service';

/**
 * Resolve a dashboard-managed lookup value to its *current* label (English or
 * Arabic, per `lang`) — so editing a category/city/... in Static Data is
 * reflected immediately on already-created records, not just new ones.
 * Returns the original stored value unchanged if it isn't found in the cache.
 */
const resolveDynamicLabel = (type: string, value: string, lang: SupportedLanguage): string => {
  const entry = getCachedLookupMap(type)[value];
  if (!entry) return value;
  return lang === 'ar' ? entry.labelAr || value : entry.label || value;
};

export type SupportedLanguage = 'en' | 'ar';

const SUPPORTED_LANGUAGES = new Set(['en', 'ar']);

const sanitizeLanguageInput = (value?: string | string[]): string | undefined => {
  if (!value) return undefined;
  const source = Array.isArray(value) ? value[0] : value;
  return source?.trim().toLowerCase();
};

export const normalizeLanguageCode = (value?: string | string[]): SupportedLanguage => {
  const normalized = sanitizeLanguageInput(value);
  if (!normalized) return 'en';

  if (SUPPORTED_LANGUAGES.has(normalized)) {
    return normalized as SupportedLanguage;
  }

  // Handles values like ar-AE, en-US, ar_SA.
  const shortCode = normalized.split(/[-_]/)[0];
  return shortCode === 'ar' ? 'ar' : 'en';
};

export const resolveRequestLanguage = (req: Request): SupportedLanguage => {
  const urlLanguageMatch = req.originalUrl.match(/^\/[^/]+\/(en|ar)(\/|$)/i);
  if (urlLanguageMatch?.[1]) {
    return normalizeLanguageCode(urlLanguageMatch[1]);
  }

  const paramsLang = (req.params as Record<string, unknown>)?.lang;
  if (typeof paramsLang === 'string') {
    return normalizeLanguageCode(paramsLang);
  }

  const queryLang = req.query?.lang;
  if (typeof queryLang === 'string') {
    return normalizeLanguageCode(queryLang);
  }
  if (Array.isArray(queryLang)) {
    const firstString = queryLang.find((value): value is string => typeof value === 'string');
    if (firstString) {
      return normalizeLanguageCode(firstString);
    }
  }

  const xLanguage = req.headers['x-language'];
  if (typeof xLanguage === 'string' || Array.isArray(xLanguage)) {
    return normalizeLanguageCode(xLanguage);
  }

  const acceptLanguage = req.headers['accept-language'];
  if (typeof acceptLanguage === 'string' || Array.isArray(acceptLanguage)) {
    return normalizeLanguageCode(acceptLanguage);
  }

  return 'en';
};

export const localizeText = (
  englishValue?: string,
  arabicValue?: string,
  lang: SupportedLanguage = 'en'
): string | undefined => {
  if (lang === 'ar' && arabicValue) {
    return arabicValue;
  }
  return englishValue;
};

export const localizeDocumentFields = <T extends Record<string, any>>(
  source: T,
  lang: SupportedLanguage,
  fieldMap: Record<string, string>
): T => {
  const localized = { ...source } as Record<string, any>;
  if (lang !== 'ar') return localized as T;

  Object.entries(fieldMap).forEach(([englishField, arabicField]) => {
    if (localized[arabicField]) {
      localized[englishField] = localized[arabicField];
    } 
  });

  return localized as T;
};

/**
 * Translate static enum values like community types, locations, statuses, etc.
 */
export const translateStaticValue = (value: string, category: string, lang: SupportedLanguage): string => {
  if (lang === 'ar') {
    const normalizedKey = value
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[&]/g, '')
      .split('_')
      .map((word, idx) => idx === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    const translatedValue = t(lang, `${category}.${normalizedKey}`);
    return translatedValue || value;
  }
  return value;
};

/**
 * Translate array of static values
 */
export const translateStaticArray = (
  values: string[] | undefined,
  category: string,
  lang: SupportedLanguage
): string[] | undefined => {
  if (!values) return values;
  return values.map(val => translateStaticValue(val, category, lang));
};

/**
 * Localize community document with static values
 */
export const localizeCommunityStatic = (community: Record<string, any>, lang: SupportedLanguage): void => {
  // Dashboard-managed lookup fields resolve to their current label for both
  // languages (see resolveDynamicLabel) — this runs regardless of `lang`.
  // `type` (multi-select tags) and `category` (comma-joined string, same
  // underlying picklist — see CommunityCreate/CommunityEdit) both draw
  // from the dashboard-managed community_category lookup list.
  if (community.type && Array.isArray(community.type)) {
    community.type = community.type.map((value: string) =>
      resolveDynamicLabel(LOOKUP_TYPE_COMMUNITY_CATEGORY, value, lang)
    );
  }
  if (community.category) {
    community.category = String(community.category)
      .split(',')
      .map((value) => resolveDynamicLabel(LOOKUP_TYPE_COMMUNITY_CATEGORY, value.trim(), lang))
      .join(', ');
  }
  if (community.location) {
    community.location = resolveDynamicLabel(LOOKUP_TYPE_CITY, community.location, lang);
  }
  if (community.city) {
    community.city = resolveDynamicLabel(LOOKUP_TYPE_CITY, community.city, lang);
  }
  if (community.country) {
    community.country = resolveDynamicLabel(LOOKUP_TYPE_COUNTRY, community.country, lang);
  }
  if (community.purposeType) {
    community.purposeType = resolveDynamicLabel(LOOKUP_TYPE_COMMUNITY_PURPOSE, community.purposeType, lang);
  }
  if (community.terrain) {
    community.terrain = resolveDynamicLabel(LOOKUP_TYPE_COMMUNITY_TERRAIN, community.terrain, lang);
  }
};

/**
 * Localize event document with static values
 */
export const localizeEventStatic = (event: Record<string, any>, lang: SupportedLanguage): void => {
  // Dashboard-managed lookup fields resolve to their current label for both
  // languages — this runs regardless of `lang` so an English rename in
  // Static Data shows up immediately on already-created events too.
  if (event.city) {
    event.city = resolveDynamicLabel(LOOKUP_TYPE_CITY, event.city, lang);
  }
  if (event.country) {
    event.country = resolveDynamicLabel(LOOKUP_TYPE_COUNTRY, event.country, lang);
  }
  if (event.amenities && Array.isArray(event.amenities)) {
    // Event amenities are dashboard-managed (see lookup.service.ts); fall back
    // to the legacy hardcoded amenities keys (Arabic only) for values not
    // (yet) in the cache, e.g. right after a fresh deploy before it's warmed.
    event.amenities = event.amenities.map((amenity: string) => {
      const dynamicEntry = getCachedLookupMap(LOOKUP_TYPE_EVENT_AMENITY)[amenity];
      const dynamicLabel = lang === 'ar' ? dynamicEntry?.labelAr : dynamicEntry?.label;
      if (dynamicLabel) return dynamicLabel;
      if (lang !== 'ar') return amenity;

      const amenityKey = amenity.toLowerCase().replace(/\s+/g, '');
      if (amenityKey === 'medicalsupport') {
        return t(lang, 'amenities.medicalSupport');
      } else if (amenityKey === 'bikeservice') {
        return t(lang, 'amenities.bikeService');
      } else if (amenityKey === 'bikerental') {
        return t(lang, 'amenities.bikeRental');
      } else if (amenityKey === 'firstaid') {
        return t(lang, 'amenities.firstAid');
      } else if (amenityKey === 'changingrooms') {
        return t(lang, 'amenities.changingRooms');
      }
      return t(lang, `amenities.${amenityKey}`) || amenity;
    });
  }
  if (event.category) {
    // Event categories are dashboard-managed (see lookup.service.ts); fall back
    // to the legacy hardcoded map (Arabic only) only for categories not (yet)
    // in the cache, e.g. right after a fresh deploy before it's warmed.
    const dynamicEntry = getCachedLookupMap(LOOKUP_TYPE_EVENT_CATEGORY)[event.category];
    const dynamicLabel = lang === 'ar' ? dynamicEntry?.labelAr : dynamicEntry?.label;
    if (dynamicLabel) {
      event.category = dynamicLabel;
    } else if (lang === 'ar') {
      const legacyCategoryMap: Record<string, string> = {
        'Race': 'race',
        'Community Ride': 'communityRide',
        'Training & Clinics': 'trainingClinics',
        'Awareness Rides': 'awarenessRides',
        'Family & Kids': 'familyKids',
        'Corporate Events': 'corporateEvents',
        'National Events': 'nationalEvents',
      };
      const categoryKey = legacyCategoryMap[event.category];
      if (categoryKey) {
        event.category = t(lang, `eventCategories.${categoryKey}`);
      }
    }
  }

  if (lang === 'ar') {
    if (event.status) {
      event.status = t(lang, `statuses.${event.status.toLowerCase()}`);
    }
    if (event.difficulty) {
      event.difficulty = translateStaticValue(event.difficulty, 'difficulties', lang);
    }
    if (event.eligibility) {
      if (Array.isArray(event.eligibility)) {
        event.eligibility.forEach((elig: any) => {
          if (elig.experienceLevel) {
            elig.experienceLevel = t(lang, `experienceLevels.${elig.experienceLevel.toLowerCase()}`);
          }
          if (elig.gender) {
            elig.gender = t(lang, `genders.${elig.gender.toLowerCase()}`);
          }
        });
      } else {
        if (event.eligibility.experienceLevel) {
          event.eligibility.experienceLevel = t(lang, `experienceLevels.${event.eligibility.experienceLevel.toLowerCase()}`);
        }
        if (event.eligibility.gender) {
          event.eligibility.gender = t(lang, `genders.${event.eligibility.gender.toLowerCase()}`);
        }
      }
    }
  }
};

/**
 * Localize track document with static values
 */
export const localizeTrackStatic = (track: Record<string, any>, lang: SupportedLanguage): void => {
  // Dashboard-managed lookup fields resolve to their current label for both
  // languages — runs regardless of `lang`, see resolveDynamicLabel.
  if (track.country) {
    track.country = resolveDynamicLabel(LOOKUP_TYPE_COUNTRY, track.country, lang);
  }
  if (track.city) {
    track.city = resolveDynamicLabel(LOOKUP_TYPE_CITY, track.city, lang);
  }
  if (track.facilities && Array.isArray(track.facilities)) {
    // Facilities are dashboard-managed (see lookup.service.ts); fall back to the
    // legacy hardcoded amenities keys (Arabic only) for values not (yet) in the cache.
    track.facilities = track.facilities.map((facility: string) => {
      const dynamicEntry = getCachedLookupMap(LOOKUP_TYPE_TRACK_FACILITY)[facility];
      const dynamicLabel = lang === 'ar' ? dynamicEntry?.labelAr : dynamicEntry?.label;
      if (dynamicLabel) return dynamicLabel;
      if (lang !== 'ar') return facility;

      const facilityKey = facility.toLowerCase().replace(/\s+/g, '');
      if (facilityKey === 'bikerental') {
        return t(lang, 'amenities.bikeRental');
      } else if (facilityKey === 'firstaid') {
        return t(lang, 'amenities.firstAid');
      } else if (facilityKey === 'changingrooms') {
        return t(lang, 'amenities.changingRooms');
      }
      return t(lang, `amenities.${facilityKey}`) || facility;
    });
  }

  if (lang === 'ar') {
    if (track.trackType) {
      track.trackType = t(lang, `trackTypes.${track.trackType.toLowerCase()}`);
    }
    if (track.status) {
      track.status = t(lang, `statuses.${track.status.toLowerCase()}`);
    }
    if (track.surfaceType) {
      track.surfaceType = t(lang, `surfaceTypes.${track.surfaceType.toLowerCase()}`);
    }
    if (track.category) {
      track.category = translateStaticValue(track.category, 'categories', lang);
    }
    if (track.visibility) {
      track.visibility = translateStaticValue(track.visibility, 'visibilities', lang);
    }
    if (track.difficulty) {
      track.difficulty = translateStaticValue(track.difficulty, 'difficulties', lang);
    }
  }
};

/**
 * Localize community ride document with static values
 */
export const localizeCommunityRideStatic = (ride: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (ride.status) {
      ride.status = t(lang, `statuses.${ride.status.toLowerCase()}`);
    }
  }
};

/**
 * Localize challenge document: swaps title/description for their Arabic
 * counterparts when present, and resolves `type` via the dashboard-managed
 * challenge_type lookup (see lookup.service.ts).
 */
export const localizeChallengeStatic = (challenge: Record<string, any>, lang: SupportedLanguage): void => {
  // Dashboard-managed lookup fields resolve to their current label for both
  // languages — runs regardless of `lang`, see resolveDynamicLabel.
  if (challenge.type) {
    challenge.type = resolveDynamicLabel(LOOKUP_TYPE_CHALLENGE_TYPE, challenge.type, lang);
  }
  if (challenge.unit) {
    challenge.unit = resolveDynamicLabel(LOOKUP_TYPE_CHALLENGE_UNIT, challenge.unit, lang);
  }

  if (lang === 'ar') {
    if (challenge.titleAr) {
      challenge.title = challenge.titleAr;
    }
    if (challenge.descriptionAr) {
      challenge.description = challenge.descriptionAr;
    }
    if (challenge.rewardBadge && typeof challenge.rewardBadge === 'object') {
      localizeBadgeStatic(challenge.rewardBadge, lang);
    }
  }
};

/**
 * Localize badge document: swaps name/description for their Arabic
 * counterparts when present. Works on both a top-level badge document and a
 * populated `rewardBadge` sub-object (e.g. on a Challenge response).
 */
export const localizeBadgeStatic = (badge: Record<string, any> | null | undefined, lang: SupportedLanguage): void => {
  if (!badge || lang !== 'ar') return;
  if (badge.nameAr) {
    badge.name = badge.nameAr;
  }
  if (badge.descriptionAr) {
    badge.description = badge.descriptionAr;
  }
};

/**
 * Localize news document: swaps title/content for their Arabic
 * counterparts when present, and resolves `category` via the
 * dashboard-managed news_category lookup (see lookup.service.ts).
 */
export const localizeNewsStatic = (news: Record<string, any>, lang: SupportedLanguage): void => {
  // Dashboard-managed lookup fields resolve to their current label for both
  // languages — runs regardless of `lang`, see resolveDynamicLabel.
  if (news.category) {
    news.category = resolveDynamicLabel(LOOKUP_TYPE_NEWS_CATEGORY, news.category, lang);
  }

  if (lang === 'ar') {
    if (news.titleAr) {
      news.title = news.titleAr;
    }
    if (news.contentAr) {
      news.content = news.contentAr;
    }
  }
};

/**
 * Localize a marketplace/store item: swaps title/description/category/
 * condition/city for their Arabic counterparts when present.
 */
export const localizeStoreItemStatic = (item: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (item.titleAr) item.title = item.titleAr;
    if (item.descriptionAr) item.description = item.descriptionAr;
    if (item.categoryAr) item.category = item.categoryAr;
    if (item.conditionAr) item.condition = item.conditionAr;
    if (item.cityAr) item.city = item.cityAr;
  }
};

/**
 * Localize a merchandise product: swaps name/description for their Arabic
 * counterparts when present.
 */
export const localizeMerchandiseStatic = (product: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (product.nameAr) product.name = product.nameAr;
    if (product.descriptionAr) product.description = product.descriptionAr;
  }
};

/**
 * Localize a merchandise category: swaps name (and subcategory names) for
 * their Arabic counterparts when present.
 */
export const localizeMerchandiseCategoryStatic = (category: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (category.nameAr) category.name = category.nameAr;
    if (Array.isArray(category.subcategories)) {
      category.subcategories = category.subcategories.map((sub: Record<string, any>) => ({
        ...sub,
        name: sub.nameAr || sub.name,
      }));
    }
  }
};

/**
 * Localize a feed post: swaps title/description for their Arabic counterparts
 * when present.
 */
export const localizeFeedPostStatic = (post: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (post.titleAr) post.title = post.titleAr;
    if (post.descriptionAr) post.description = post.descriptionAr;
  }
};

/**
 * Localize a community post: swaps title/caption for their Arabic
 * counterparts when present.
 */
export const localizeCommunityPostStatic = (post: Record<string, any>, lang: SupportedLanguage): void => {
  if (lang === 'ar') {
    if (post.titleAr) post.title = post.titleAr;
    if (post.captionAr) post.caption = post.captionAr;
  }
};
