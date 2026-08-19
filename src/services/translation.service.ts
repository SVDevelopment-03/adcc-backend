import translate from 'translate';

/**
 * Free, best-effort auto-translation for user/content-generated English text
 * into Arabic.
 *
 * Strategy:
 *  1. Primary: the `translate` package (Google Translate's free public
 *     endpoint — no API key required).
 *  2. Fallback: MyMemory free REST API (https://api.mymemory.translated.net).
 *
 * Translations are cached in memory (plus the `translate` package's own
 * cache) so the same phrase isn't retranslated on every write. The helper is
 * deliberately non-throwing: on any failure it returns `undefined`, so the
 * English text stays as the canonical fallback and nothing breaks.
 */

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';

const MIN_TRANSLATABLE_LENGTH = 2;
const MAX_TRANSLATABLE_LENGTH = 5000;

// In-memory LRU-ish cache: text -> Arabic translation.
const cache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 5000;

const isTranslatable = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed.length < MIN_TRANSLATABLE_LENGTH) return false;
  if (trimmed.length > MAX_TRANSLATABLE_LENGTH) return false;
  // Skip strings that are already Arabic or are purely numeric/symbols.
  if (/[\u0600-\u06FF]/.test(trimmed)) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  return true;
};

const cacheGet = (key: string): string | undefined => cache.get(key);

const cacheSet = (key: string, value: string): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest (Map preserves insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
};

const translateViaMyMemory = async (text: string): Promise<string> => {
  const params = new URLSearchParams({
    q: text,
    langpair: 'en|ar',
  });
  const url = `${MYMEMORY_ENDPOINT}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);
    const data = (await response.json()) as {
      responseStatus?: string | number;
      responseData?: { translatedText?: string };
    };
    const translated = data?.responseData?.translatedText;
    if (typeof translated === 'string' && translated.trim().length > 0) {
      return translated;
    }
    throw new Error('MyMemory returned no translation');
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Translate English text to Arabic. Returns the Arabic string, or `undefined`
 * if translation is not possible/fails (so callers keep the English value).
 *
 * @param preferTranslation - when `false` (e.g. the request language is
 *   already 'ar' and the source text itself is English), the function still
 *   attempts translation. Callers decide whether to persist the result.
 */
export const translateToArabic = async (text?: string | null): Promise<string | undefined> => {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!isTranslatable(trimmed)) return undefined;

  const cached = cacheGet(trimmed);
  if (cached) return cached;

  try {
    const translated = await translate(trimmed, { from: 'en', to: 'ar' });
    if (typeof translated === 'string' && translated.trim().length > 0) {
      cacheSet(trimmed, translated);
      return translated;
    }
  } catch {
    // ignore — fall through to MyMemory
  }

  try {
    const translated = await translateViaMyMemory(trimmed);
    cacheSet(trimmed, translated);
    return translated;
  } catch {
    return undefined;
  }
};

/**
 * Translate a list of fields (English) into Arabic in parallel and return a
 * map keyed by field name. Best-effort: any missing/failed translation simply
 * omits its key.
 */
export const translateFieldsToArabic = async (
  fields: Record<string, string | null | undefined>
): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};

  await Promise.all(
    Object.entries(fields).map(async ([key, value]) => {
      const translated = await translateToArabic(value);
      if (translated) {
        const arKey = key.endsWith('Ar') ? key : `${key}Ar`;
        result[arKey] = translated;
      }
    })
  );

  return result;
};

/** Clears the in-memory translation cache (mainly for tests). */
export const clearTranslationCache = (): void => {
  cache.clear();
};
