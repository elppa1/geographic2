import {
  runTorontoNewsScraper,
  runTorontoNewScraper,
} from './city/toronto/index.js'


// ============================================================
// SCRAPER REGISTRY
// ============================================================

const CITY_SCRAPERS = {
  toronto: {
    news:
      runTorontoNewsScraper,

    new:
      runTorontoNewScraper,
  },
}


// ============================================================
// CAN RUN
// ============================================================

export function hasCityScraper({
  cityKey,
  type,
}) {
  return Boolean(
    CITY_SCRAPERS[
      cityKey
    ]?.[
      type
    ]
  )
}


// ============================================================
// RUN
// ============================================================

export async function runCityScraper({
  cityKey,
  type,
}) {
  const scraper =
    CITY_SCRAPERS[
      cityKey
    ]?.[
      type
    ]


  if (
    !scraper
  ) {
    throw new Error(
      (
        'NO SCRAPER CONFIGURED · ' +
        `${cityKey} · ${type}`
      )
    )
  }


  return scraper()
}