// ============================================================
// SHARED BROWSER HEADERS
// ============================================================

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0',

  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',

  'Accept-Language':
    'en-CA,en;q=0.9',
}


// ============================================================
// TORONTO PROXIES
// ============================================================

export const TORONTO_PROXIES = {
  // ==========================================================
  // UNIVERSITY OF TORONTO MAPS
  // ==========================================================

  '/utoronto': {
    target:
      'https://maps.library.utoronto.ca',

    changeOrigin:
      true,

    secure:
      true,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/utoronto/,
        ''
      ),
  },


  // ==========================================================
  // CITY OF TORONTO
  // ==========================================================

  '/toronto-feed': {
    target:
      'https://secure.toronto.ca',

    changeOrigin:
      true,

    secure:
      true,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/toronto-feed/,
        ''
      ),
  },


  // ==========================================================
  // BLOGTO
  // ==========================================================

  '/api/toronto/blogto': {
    target:
      'https://feeds.feedburner.com',

    changeOrigin:
      true,

    secure:
      true,

    rewrite: () =>
      '/blogto',
  },


  // ==========================================================
  // CP24
  // ==========================================================

  '/api/toronto/cp24': {
    target:
      'https://www.cp24.com',

    changeOrigin:
      true,

    secure:
      true,

    headers:
      BROWSER_HEADERS,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/api\/toronto\/cp24/,
        ''
      ),
  },


  // ==========================================================
  // BEACH METRO COMMUNITY NEWS
  // ==========================================================

  '/api/toronto/beachmetro': {
    target:
      'https://beachmetro.com',

    changeOrigin:
      true,

    secure:
      true,

    headers:
      BROWSER_HEADERS,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/api\/toronto\/beachmetro/,
        ''
      ),
  },


  // ==========================================================
  // STREETS OF TORONTO / POST CITY
  // ==========================================================

  '/api/toronto/streetsoftoronto': {
    target:
      'https://streetsoftoronto.com',

    changeOrigin:
      true,

    secure:
      true,

    headers:
      BROWSER_HEADERS,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/api\/toronto\/streetsoftoronto/,
        ''
      ),
  },


  // ==========================================================
  // TORONTO POLICE SERVICE
  // ==========================================================
  //
  // Parked for now because TPS returns 403.
  //
  // ==========================================================

  '/api/toronto/tps': {
    target:
      'https://www.tps.ca',

    changeOrigin:
      true,

    secure:
      true,

    headers:
      BROWSER_HEADERS,

    rewrite: (
      path
    ) =>
      path.replace(
        /^\/api\/toronto\/tps/,
        ''
      ),
  },
}