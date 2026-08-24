// ============================================================
// TORONTO SCRAPER CONFIG
// ============================================================
//
// Geographic scraper configuration for Toronto.
//
// Browser requests go through the Vite Toronto proxy:
//
//   /toronto-feed/...
//
// Vite then forwards those requests to:
//
//   https://secure.toronto.ca
//
// Nothing collected here is published automatically.
// Everything goes to the Admin Room review queue first.
//
// ============================================================


export const TORONTO_SCRAPER_CONFIG = {
  city:
    'toronto',

  sources: {
    publicNotices: {
      id:
        'toronto-public-notices',

      name:
        'City of Toronto',

      url:
        '/toronto-feed/nm/notices.json',

      enabled:
        true,
    },
  },
}


// ============================================================
// DEVELOPMENT KEYWORDS
// ============================================================

export const DEVELOPMENT_KEYWORDS = [
  'zoning',
  'rezoning',
  'site plan',
  'development',
  'planning application',
  'official plan',
  'official plan amendment',
  'subdivision',
  'condominium',
  'redevelopment',
  'development application',
  'community consultation',
  'planning act',
  'demolition',
  'construction',
  'mixed-use',
  'mixed use',
  'residential development',
  'housing development',
]


// ============================================================
// STRONG DEVELOPMENT KEYWORDS
// ============================================================

export const STRONG_DEVELOPMENT_KEYWORDS = [
  'zoning by-law amendment',
  'zoning bylaw amendment',
  'official plan amendment',
  'site plan control',
  'plan of subdivision',
  'plan of condominium',
  'development application',
  'planning application',
]