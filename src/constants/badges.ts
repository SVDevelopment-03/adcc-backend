export const BADGE_ICONS = [
  { key: 'trophy', emoji: '🏆', label: 'Trophy' },
  { key: 'gold_medal', emoji: '🥇', label: 'Gold Medal' },
  { key: 'silver_medal', emoji: '🥈', label: 'Silver Medal' },
  { key: 'bronze_medal', emoji: '🥉', label: 'Bronze Medal' },
  { key: 'star', emoji: '⭐', label: 'Star' },
  { key: 'glowing_star', emoji: '🌟', label: 'Glowing Star' },
  { key: 'dizzy', emoji: '💫', label: 'Dizzy' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'lightning', emoji: '⚡', label: 'Lightning' },
  { key: 'bicyclist', emoji: '🚴', label: 'Cyclist' },
  { key: 'medal', emoji: '🏅', label: 'Medal' },
  { key: 'crown', emoji: '👑', label: 'Crown' },
  { key: 'diamond', emoji: '💎', label: 'Diamond' },
  { key: 'award', emoji: '🎖️', label: 'Award' },
  { key: 'flag_checkered', emoji: '🏁', label: 'Checkered Flag' },
] as const;

export type BadgeIconKey = (typeof BADGE_ICONS)[number]['key'];
export const BADGE_ICON_KEYS = BADGE_ICONS.map((icon) => icon.key);

export const BADGE_CATEGORIES = [
  'Distance',
  'Event',
  'Social',
  'Achievement',
  'Special',
] as const;

export const BADGE_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;

export type BadgeIcon = (typeof BADGE_ICON_KEYS)[number];
export type BadgeCategory = (typeof BADGE_CATEGORIES)[number];
export type BadgeRarity = (typeof BADGE_RARITIES)[number];
