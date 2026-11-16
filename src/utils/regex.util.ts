/** Escape user text so it is matched literally inside a RegExp / Mongo $regex. */
export const escapeRegex = (value: string) =>
  String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
