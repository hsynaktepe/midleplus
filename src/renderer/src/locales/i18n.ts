import tr from './tr.json';
import en from './en.json';

export type TranslationSchema = typeof tr;

export function getTranslations(lang: 'tr' | 'en'): TranslationSchema {
  return lang === 'en' ? (en as TranslationSchema) : (tr as TranslationSchema);
}
