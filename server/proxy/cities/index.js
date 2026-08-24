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
  //
  // Proxy retained, but we can stop running this scraper
  // in the NEWS aggregator.
  //
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
  // WEST END PHOENIX
  // ==========================================================
  //
  // Proxy retained, but we can stop running this scraper
  // in the NEWS aggregator.
  //
  // ==========================================================

  '/api/toronto/westendphoenix': {
    target:
      'https://www.westendphoenix.com',

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
        /^\/api\/toronto\/westendphoenix/,
        ''
      ),
  },


  // ==========================================================
  // TORONTO FIRE SERVICES · ACTIVE INCIDENTS
  // ==========================================================
  //
  // LIVE DATA ONLY.
  //
  // City of Toronto's Active Incidents listing is refreshed
  // approximately every five minutes from the Fire Services
  // CAD / dispatch system.
  //
  // ==========================================================

  '/api/toronto/fire': {
    target:
      'https://www.toronto.ca',

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
        /^\/api\/toronto\/fire/,
        ''
      ),
  },


  // ==========================================================
  // TORONTO POLICE SERVICE
  // ==========================================================
  //
  // TPS direct requests previously returned 403.
  //
  // Keep the proxy route while we build a safer recent-release
  // scraper strategy.
  //
  // Geographic should eventually keep only very recent TPS
  // releases rather than building a historical police archive.
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