import { createInstance } from 'i18next';
import frCommon from './locales/fr/common.json' with { type: 'json' };
import enCommon from './locales/en/common.json' with { type: 'json' };
import frHome from './locales/fr/home.json' with { type: 'json' };
import enHome from './locales/en/home.json' with { type: 'json' };
import frProfile from './locales/fr/profile.json' with { type: 'json' };
import enProfile from './locales/en/profile.json' with { type: 'json' };
import frResults from './locales/fr/results.json' with { type: 'json' };
import enResults from './locales/en/results.json' with { type: 'json' };
import frReviews from './locales/fr/reviews.json' with { type: 'json' };
import enReviews from './locales/en/reviews.json' with { type: 'json' };
import frCriteria from './locales/fr/criteria.json' with { type: 'json' };
import enCriteria from './locales/en/criteria.json' with { type: 'json' };
import frConsultation from './locales/fr/consultation.json' with { type: 'json' };
import enConsultation from './locales/en/consultation.json' with { type: 'json' };
import frSearch from './locales/fr/search.json' with { type: 'json' };
import enSearch from './locales/en/search.json' with { type: 'json' };

export const resources = {
  fr: {
    translation: {
      common: frCommon,
      home: frHome,
      profile: frProfile,
      results: frResults,
      reviews: frReviews,
      criteria: frCriteria,
      consultation: frConsultation,
      search: frSearch,
    },
  },
  en: {
    translation: {
      common: enCommon,
      home: enHome,
      profile: enProfile,
      results: enResults,
      reviews: enReviews,
      criteria: enCriteria,
      consultation: enConsultation,
      search: enSearch,
    },
  },
};
// Bundled resources initialize synchronously before browser or server rendering.
// https://www.i18next.com/overview/configuration-options
const i18n = createInstance();
i18n.init({
  resources,
  lng: 'fr',
  supportedLngs: ['fr', 'en'],
  fallbackLng: 'fr',
  initAsync: false,
  // UI uses textContent; source-template interpolation escapes HTML at its boundary.
  interpolation: { escapeValue: false },
});
export const getTranslator = (language = 'fr') => i18n.getFixedT(language === 'en' ? 'en' : 'fr');
export const hasTranslation = (key, language = 'fr') =>
  i18n.exists(key, { lng: language, fallbackLng: false });
