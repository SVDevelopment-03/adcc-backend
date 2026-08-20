import mongoose from 'mongoose';

/** Turn a title into a URL-safe, lowercase, hyphenated slug. */
export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Generate a slug from `title` that's unique within `model`, appending
 * `-2`, `-3`, ... on collision. Pass `excludeId` when regenerating for an
 * existing document so it doesn't collide with itself.
 */
export const generateUniqueSlug = async (
  model: mongoose.Model<any>,
  title: string,
  excludeId?: string,
): Promise<string> => {
  const base = slugify(title) || 'item';
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const query: Record<string, unknown> = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await model.exists(query);
    if (!exists) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
};

/**
 * Build a `findOne` filter that matches a detail route's `:id` param as
 * either a slug or — for links shared/bookmarked before slugs existed — a
 * raw Mongo `_id`. Spread the result into any other filter (status, etc.)
 * and chain `.populate()` on the query as usual.
 */
export const idOrSlugFilter = (idOrSlug: string): Record<string, unknown> =>
  mongoose.Types.ObjectId.isValid(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug };
