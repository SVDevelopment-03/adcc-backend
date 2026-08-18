import en from "../locales/en.json";
import ar from "../locales/ar.json";

const translations: any = { en, ar };

export const t = (lang: string, key: string, params?: Record<string, string | number>): string => {
  const keys = key.split(".");
  let value: any = translations[lang] || translations["en"];

  for (const k of keys) {
    value = value?.[k];
  }

  if (typeof value === 'string' && params) {
    Object.entries(params).forEach(([k, v]) => {
      value = value.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
    });
  }

  return value || key;
};