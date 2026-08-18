import Lookup from '@/models/lookup.model';

/**
 * Synchronous, in-memory snapshot of active lookup entries per type, keyed by
 * English `value`. `localizeEventStatic`/`localizeCommunityStatic`/
 * `localizeTrackStatic` need to resolve a label -> Arabic label mapping
 * synchronously while building a response, so we keep a warmed cache here
 * instead of querying Mongo per record. The cache is refreshed on lookup
 * mutations and lazily on read if it has never been warmed.
 */
type LookupCacheEntry = { label: string; labelAr: string };

const cache = new Map<string, Record<string, LookupCacheEntry>>();
const warmed = new Set<string>();

const buildMap = async (type: string): Promise<Record<string, LookupCacheEntry>> => {
  const entries = await Lookup.find({ type, active: true }).lean();
  const map: Record<string, LookupCacheEntry> = {};
  for (const entry of entries) {
    map[entry.value] = { label: entry.label, labelAr: entry.labelAr };
  }
  return map;
};

export const refreshLookupCache = async (type: string): Promise<void> => {
  const map = await buildMap(type);
  cache.set(type, map);
  warmed.add(type);
};

/** Synchronous read used by response localization. Empty until first warm. */
export const getCachedLookupMap = (type: string): Record<string, LookupCacheEntry> => {
  return cache.get(type) || {};
};

/** Ensures the cache has been populated at least once (call during startup). */
export const warmLookupCache = async (type: string): Promise<void> => {
  if (warmed.has(type)) return;
  await refreshLookupCache(type);
};

// ─── Lookup types ────────────────────────────────────────────────────────
// Every dashboard-manageable dropdown/filter list in the app is one of these.
export const LOOKUP_TYPE_EVENT_CATEGORY = 'event_category';
export const LOOKUP_TYPE_COMMUNITY_CATEGORY = 'community_category';
export const LOOKUP_TYPE_COMMUNITY_PURPOSE = 'community_purpose';
export const LOOKUP_TYPE_COMMUNITY_TERRAIN = 'community_terrain';
export const LOOKUP_TYPE_COUNTRY = 'country';
export const LOOKUP_TYPE_CITY = 'city';
export const LOOKUP_TYPE_TRACK_FACILITY = 'track_facility';
export const LOOKUP_TYPE_EVENT_AMENITY = 'event_amenity';
export const LOOKUP_TYPE_CHALLENGE_TYPE = 'challenge_type';
export const LOOKUP_TYPE_CHALLENGE_UNIT = 'challenge_unit';
export const LOOKUP_TYPE_NEWS_CATEGORY = 'news_category';

export const ALL_LOOKUP_TYPES = [
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
];

// ─── Seed data ───────────────────────────────────────────────────────────
// Ports the values that used to be hardcoded in frontend/src/constants and
// frontend/src/data into dashboard-editable rows, using the Arabic strings
// that already existed in the locale files where available.

type SeedEntry = { value?: string; label: string; labelAr: string; parentValue?: string; order: number };

const EVENT_CATEGORY_SEED: SeedEntry[] = [
  { label: 'Race', labelAr: 'سباق', order: 0 },
  { label: 'Community Ride', labelAr: 'ركوب المجتمع', order: 1 },
  { label: 'Training & Clinics', labelAr: 'التدريب والعيادات', order: 2 },
  { label: 'Awareness Rides', labelAr: 'جولات التوعية', order: 3 },
  { label: 'Family & Kids', labelAr: 'العائلة والأطفال', order: 4 },
  { label: 'Corporate Events', labelAr: 'فعاليات الشركات', order: 5 },
  { label: 'National Events', labelAr: 'الفعاليات الوطنية', order: 6 },
];

const COMMUNITY_CATEGORY_SEED: SeedEntry[] = [
  { label: 'City Communities', labelAr: 'مجتمعات المدن', order: 0 },
  { label: 'Group Communities', labelAr: 'مجتمعات المجموعات', order: 1 },
  { label: 'Racing & Performance', labelAr: 'السباق والأداء', order: 2 },
  { label: 'Family & Leisure', labelAr: 'العائلة والترفيه', order: 3 },
  { label: 'Women (SheRides)', labelAr: 'نساء (شيريدز)', order: 4 },
  { label: 'Youth', labelAr: 'الشباب', order: 5 },
  { label: 'Social / Weekend', labelAr: 'اجتماعي / نهاية الأسبوع', order: 6 },
  { label: 'Night Riders', labelAr: 'راكبو الليل', order: 7 },
  { label: 'MTB / Trail', labelAr: 'دراجات جبلية / مسارات', order: 8 },
  { label: 'Training & Clinics', labelAr: 'التدريب والعيادات', order: 9 },
  { label: 'Awareness & Charity', labelAr: 'التوعية والأعمال الخيرية', order: 10 },
  { label: 'Corporate', labelAr: 'شركات', order: 11 },
  { label: 'Education', labelAr: 'تعليم', order: 12 },
  { label: 'Health', labelAr: 'صحة', order: 13 },
];

const COMMUNITY_PURPOSE_SEED: SeedEntry[] = [
  { label: 'Awareness', labelAr: 'توعية', order: 0 },
  { label: 'Charity', labelAr: 'أعمال خيرية', order: 1 },
  { label: 'Corporate', labelAr: 'شركات', order: 2 },
  { label: 'Education', labelAr: 'تعليم', order: 3 },
  { label: 'Health', labelAr: 'صحة', order: 4 },
  { label: 'National', labelAr: 'وطني', order: 5 },
];

const COMMUNITY_TERRAIN_SEED: SeedEntry[] = [
  { label: 'Paved Road', labelAr: 'طريق معبد', order: 0 },
  { label: 'Gravel', labelAr: 'حصى', order: 1 },
  { label: 'Mixed', labelAr: 'مختلط', order: 2 },
  { label: 'Mountain', labelAr: 'جبل', order: 3 },
];

const COUNTRY_SEED: SeedEntry[] = [
  { value: 'UAE', label: 'United Arab Emirates', labelAr: 'الإمارات العربية المتحدة', order: 0 },
  { value: 'Saudi Arabia', label: 'Saudi Arabia', labelAr: 'المملكة العربية السعودية', order: 1 },
  { value: 'Qatar', label: 'Qatar', labelAr: 'قطر', order: 2 },
  { value: 'Oman', label: 'Oman', labelAr: 'عُمان', order: 3 },
  { value: 'Kuwait', label: 'Kuwait', labelAr: 'الكويت', order: 4 },
  { value: 'Bahrain', label: 'Bahrain', labelAr: 'البحرين', order: 5 },
];

const CITY_SEED: SeedEntry[] = [
  // UAE
  { label: 'Abu Dhabi', labelAr: 'أبوظبي', parentValue: 'UAE', order: 0 },
  { label: 'Dubai', labelAr: 'دبي', parentValue: 'UAE', order: 1 },
  { label: 'Sharjah', labelAr: 'الشارقة', parentValue: 'UAE', order: 2 },
  { label: 'Ajman', labelAr: 'عجمان', parentValue: 'UAE', order: 3 },
  { label: 'Ras Al Khaimah', labelAr: 'رأس الخيمة', parentValue: 'UAE', order: 4 },
  { label: 'Fujairah', labelAr: 'الفجيرة', parentValue: 'UAE', order: 5 },
  { label: 'Umm Al Quwain', labelAr: 'أم القيوين', parentValue: 'UAE', order: 6 },
  { label: 'Al Ain', labelAr: 'العين', parentValue: 'UAE', order: 7 },
  // Saudi Arabia
  { label: 'Riyadh', labelAr: 'الرياض', parentValue: 'Saudi Arabia', order: 0 },
  { label: 'Jeddah', labelAr: 'جدة', parentValue: 'Saudi Arabia', order: 1 },
  { label: 'Mecca', labelAr: 'مكة المكرمة', parentValue: 'Saudi Arabia', order: 2 },
  { label: 'Medina', labelAr: 'المدينة المنورة', parentValue: 'Saudi Arabia', order: 3 },
  { label: 'Dammam', labelAr: 'الدمام', parentValue: 'Saudi Arabia', order: 4 },
  { label: 'Khobar', labelAr: 'الخبر', parentValue: 'Saudi Arabia', order: 5 },
  { label: 'Dhahran', labelAr: 'الظهران', parentValue: 'Saudi Arabia', order: 6 },
  { label: 'Taif', labelAr: 'الطائف', parentValue: 'Saudi Arabia', order: 7 },
  { label: 'Tabuk', labelAr: 'تبوك', parentValue: 'Saudi Arabia', order: 8 },
  { label: 'Abha', labelAr: 'أبها', parentValue: 'Saudi Arabia', order: 9 },
  { label: 'Jubail', labelAr: 'الجبيل', parentValue: 'Saudi Arabia', order: 10 },
  { label: 'Yanbu', labelAr: 'ينبع', parentValue: 'Saudi Arabia', order: 11 },
  // Qatar
  { label: 'Doha', labelAr: 'الدوحة', parentValue: 'Qatar', order: 0 },
  { label: 'Al Wakrah', labelAr: 'الوكرة', parentValue: 'Qatar', order: 1 },
  { label: 'Al Khor', labelAr: 'الخور', parentValue: 'Qatar', order: 2 },
  { label: 'Al Rayyan', labelAr: 'الريان', parentValue: 'Qatar', order: 3 },
  { label: 'Mesaieed', labelAr: 'مسيعيد', parentValue: 'Qatar', order: 4 },
  { label: 'Dukhan', labelAr: 'دخان', parentValue: 'Qatar', order: 5 },
  // Oman
  { label: 'Muscat', labelAr: 'مسقط', parentValue: 'Oman', order: 0 },
  { label: 'Salalah', labelAr: 'صلالة', parentValue: 'Oman', order: 1 },
  { label: 'Sohar', labelAr: 'صحار', parentValue: 'Oman', order: 2 },
  { label: 'Nizwa', labelAr: 'نزوى', parentValue: 'Oman', order: 3 },
  { label: 'Sur', labelAr: 'صور', parentValue: 'Oman', order: 4 },
  { label: 'Ibri', labelAr: 'عبري', parentValue: 'Oman', order: 5 },
  { label: 'Barka', labelAr: 'بركاء', parentValue: 'Oman', order: 6 },
  { label: 'Rustaq', labelAr: 'الرستاق', parentValue: 'Oman', order: 7 },
  // Kuwait
  { label: 'Kuwait City', labelAr: 'مدينة الكويت', parentValue: 'Kuwait', order: 0 },
  { label: 'Hawalli', labelAr: 'حولي', parentValue: 'Kuwait', order: 1 },
  { label: 'Salmiya', labelAr: 'السالمية', parentValue: 'Kuwait', order: 2 },
  { label: 'Farwaniya', labelAr: 'الفروانية', parentValue: 'Kuwait', order: 3 },
  { label: 'Jahra', labelAr: 'الجهراء', parentValue: 'Kuwait', order: 4 },
  { label: 'Ahmadi', labelAr: 'الأحمدي', parentValue: 'Kuwait', order: 5 },
  { label: 'Mangaf', labelAr: 'المنقف', parentValue: 'Kuwait', order: 6 },
  { label: 'Fahaheel', labelAr: 'الفحيحيل', parentValue: 'Kuwait', order: 7 },
  // Bahrain
  { label: 'Manama', labelAr: 'المنامة', parentValue: 'Bahrain', order: 0 },
  { label: 'Muharraq', labelAr: 'المحرق', parentValue: 'Bahrain', order: 1 },
  { label: 'Riffa', labelAr: 'الرفاع', parentValue: 'Bahrain', order: 2 },
  { label: 'Hamad Town', labelAr: 'مدينة حمد', parentValue: 'Bahrain', order: 3 },
  { label: 'Isa Town', labelAr: 'مدينة عيسى', parentValue: 'Bahrain', order: 4 },
  { label: 'Sitra', labelAr: 'سترة', parentValue: 'Bahrain', order: 5 },
  { label: 'Budaiya', labelAr: 'البديع', parentValue: 'Bahrain', order: 6 },
  { label: 'Jidhafs', labelAr: 'جدحفص', parentValue: 'Bahrain', order: 7 },
];

// Track facilities: value matches the lowercase text already stored on
// existing Track documents (was previously a Mongoose enum) so no data
// migration is needed.
const TRACK_FACILITY_SEED: SeedEntry[] = [
  { value: 'lighting', label: 'Lighting', labelAr: 'إضاءة', order: 0 },
  { value: 'water stations', label: 'Water Stations', labelAr: 'محطات المياه', order: 1 },
  { value: 'parking', label: 'Parking', labelAr: 'موقف سيارات', order: 2 },
  { value: 'restrooms', label: 'Restrooms', labelAr: 'دورات المياه', order: 3 },
  { value: 'cafes', label: 'Cafes', labelAr: 'مقاهي', order: 4 },
  { value: 'bike rental', label: 'Bike Rental', labelAr: 'تأجير الدراجات', order: 5 },
  { value: 'first aid', label: 'First Aid', labelAr: 'الإسعافات الأولية', order: 6 },
  { value: 'changing rooms', label: 'Changing Rooms', labelAr: 'غرف تبديل الملابس', order: 7 },
];

// Event amenities: value matches the exact text stored on existing Event
// documents' `amenities` array (see EventCreate.tsx's predefinedAmenities).
const EVENT_AMENITY_SEED: SeedEntry[] = [
  { value: 'water', label: 'Water', labelAr: 'ماء', order: 0 },
  { value: 'toilets', label: 'Toilets', labelAr: 'دورات المياه', order: 1 },
  { value: 'parking', label: 'Parking', labelAr: 'موقف سيارات', order: 2 },
  { value: 'lighting', label: 'Lighting', labelAr: 'إضاءة', order: 3 },
  { value: 'medical support', label: 'Medical Support', labelAr: 'الدعم الطبي', order: 4 },
  { value: 'bike service', label: 'Bike Service', labelAr: 'خدمة الدراجات', order: 5 },
];

// Challenge types: value matches the exact text already stored on existing
// Challenge documents (was previously a Mongoose enum) so no migration is needed.
const CHALLENGE_TYPE_SEED: SeedEntry[] = [
  { label: 'Distance', labelAr: 'المسافة', order: 0 },
  { label: 'Frequency', labelAr: 'التكرار', order: 1 },
  { label: 'Duration', labelAr: 'المدة', order: 2 },
  { label: 'Social', labelAr: 'اجتماعي', order: 3 },
  { label: 'Event', labelAr: 'فعالية', order: 4 },
];

// Challenge units: value matches the exact text already stored on existing
// Challenge documents' `unit` field (previously free text set from these 4 defaults).
const CHALLENGE_UNIT_SEED: SeedEntry[] = [
  { value: 'km', label: 'km', labelAr: 'كم', order: 0 },
  { value: 'hours', label: 'Hours', labelAr: 'ساعات', order: 1 },
  { value: 'rides', label: 'Rides', labelAr: 'جولات', order: 2 },
  { value: 'events', label: 'Events', labelAr: 'فعاليات', order: 3 },
];

const NEWS_CATEGORY_SEED: SeedEntry[] = [
  { label: 'Club News', labelAr: 'أخبار النادي', order: 0 },
  { label: 'Rides & Events', labelAr: 'الجولات والفعاليات', order: 1 },
  { label: 'Challenges', labelAr: 'التحديات', order: 2 },
  { label: 'Community', labelAr: 'المجتمع', order: 3 },
  { label: 'Cycling Tips', labelAr: 'نصائح ركوب الدراجات', order: 4 },
  { label: 'Announcements', labelAr: 'إعلانات', order: 5 },
];

const SEED_BY_TYPE: Record<string, SeedEntry[]> = {
  [LOOKUP_TYPE_EVENT_CATEGORY]: EVENT_CATEGORY_SEED,
  [LOOKUP_TYPE_COMMUNITY_CATEGORY]: COMMUNITY_CATEGORY_SEED,
  [LOOKUP_TYPE_COMMUNITY_PURPOSE]: COMMUNITY_PURPOSE_SEED,
  [LOOKUP_TYPE_COMMUNITY_TERRAIN]: COMMUNITY_TERRAIN_SEED,
  [LOOKUP_TYPE_COUNTRY]: COUNTRY_SEED,
  [LOOKUP_TYPE_CITY]: CITY_SEED,
  [LOOKUP_TYPE_TRACK_FACILITY]: TRACK_FACILITY_SEED,
  [LOOKUP_TYPE_EVENT_AMENITY]: EVENT_AMENITY_SEED,
  [LOOKUP_TYPE_CHALLENGE_TYPE]: CHALLENGE_TYPE_SEED,
  [LOOKUP_TYPE_CHALLENGE_UNIT]: CHALLENGE_UNIT_SEED,
  [LOOKUP_TYPE_NEWS_CATEGORY]: NEWS_CATEGORY_SEED,
};

/**
 * One-time, idempotent seed per type so the app works out of the box.
 * Only inserts into a type that has zero entries — never overwrites or
 * adds to a list an admin has already started managing.
 */
export const seedDefaultLookups = async (): Promise<void> => {
  for (const type of ALL_LOOKUP_TYPES) {
    const count = await Lookup.countDocuments({ type });
    if (count > 0) continue;

    const seed = SEED_BY_TYPE[type] || [];
    if (seed.length === 0) continue;

    await Lookup.insertMany(
      seed.map((entry) => ({
        type,
        value: entry.value || entry.label,
        label: entry.label,
        labelAr: entry.labelAr,
        parentValue: entry.parentValue,
        order: entry.order,
        active: true,
      }))
    );
  }
};

/** Warms the synchronous cache for every type used by response localization. */
export const warmAllLookupCaches = async (): Promise<void> => {
  await Promise.all(ALL_LOOKUP_TYPES.map((type) => warmLookupCache(type)));
};
