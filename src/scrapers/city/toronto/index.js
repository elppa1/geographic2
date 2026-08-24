import {
  runReviewScraper,
} from '../../shared/runReviewScraper.js'

import {
  scrapeTorontoDevelopments,
} from './torontoDevelopmentScraper.js'

import {
  scrapeBlogToNew,
} from './blogToScraper.js'

import {
  scrapeTorontoFireNews,
} from './torontoFireNewsScraper.js'

import {
  scrapeTtcServiceAlerts,
} from './ttcServiceAlertsScraper.js'


// ============================================================
// TORONTO · NEWS
// ============================================================
//
// Geographic NEWS is one unified official live layer.
//
// Active sources:
//
//   Toronto Police Service
//       → separate email/webhook newsroom pipeline
//
//   Toronto Fire Services
//       → official active-incidents feed
//
//   TTC
//       → official GTFS-Realtime Service Alerts feed
//
// Fire + TTC are both live feeds, but they are reconciled
// SEPARATELY.
//
// That separation is important:
//
// If TTC temporarily fails, TTC failure must not make Fire pins look
// resolved.
//
// If Fire temporarily fails, Fire failure must not make TTC pins look
// resolved.
//
// TPS remains separate because its email/webhook lifecycle handles
// case updates, missing-person resolution and original expiry.
//
// CP24, Beach Metro and other editorial news sources remain in the
// project but are intentionally disconnected from automatic NEWS.
//
// ============================================================


// ============================================================
// RESULT HELPERS
// ============================================================

function emptyNewsResult(
  source
) {
  return {
    city:
      'toronto',

    type:
      'news',

    source,

    found:
      0,

    eligible:
      0,

    added:
      0,

    updated:
      0,

    resolved:
      0,

    skipped:
      0,

    processed:
      0,

    duplicate:
      0,

    tooOld:
      0,

    items:
      [],

    updatedItems:
      [],

    resolvedItems:
      [],

    ranAt:
      new Date()
        .toISOString(),
  }
}


function normalizeNewsResult(
  result,
  source
) {
  if (
    !result ||
    typeof result !==
      'object'
  ) {
    return emptyNewsResult(
      source
    )
  }


  return {
    ...emptyNewsResult(
      source
    ),
    ...result,

    source:
      result.source ||
      source,

    items:
      Array.isArray(
        result.items
      )
        ? result.items
        : [],

    updatedItems:
      Array.isArray(
        result.updatedItems
      )
        ? result.updatedItems
        : [],

    resolvedItems:
      Array.isArray(
        result.resolvedItems
      )
        ? result.resolvedItems
        : [],
  }
}


function combineNewsResults(
  results
) {
  const normalized =
    results.map(
      (
        result
      ) =>
        normalizeNewsResult(
          result.result,
          result.source
        )
    )


  return {
    city:
      'toronto',

    type:
      'news',

    source:
      'toronto-official-live-news',

    found:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.found ||
            0
          ),
        0
      ),

    eligible:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.eligible ||
            0
          ),
        0
      ),

    added:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.added ||
            0
          ),
        0
      ),

    updated:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.updated ||
            0
          ),
        0
      ),

    resolved:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.resolved ||
            0
          ),
        0
      ),

    skipped:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.skipped ||
            0
          ),
        0
      ),

    processed:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.processed ||
            0
          ),
        0
      ),

    duplicate:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.duplicate ||
            0
          ),
        0
      ),

    tooOld:
      normalized.reduce(
        (
          total,
          result
        ) =>
          total +
          Number(
            result.tooOld ||
            0
          ),
        0
      ),

    items:
      normalized.flatMap(
        (
          result
        ) =>
          result.items
      ),

    updatedItems:
      normalized.flatMap(
        (
          result
        ) =>
          result.updatedItems
      ),

    resolvedItems:
      normalized.flatMap(
        (
          result
        ) =>
          result.resolvedItems
      ),

    sources:
      normalized.map(
        (
          result
        ) => ({
          source:
            result.source,

          found:
            result.found,

          added:
            result.added,

          updated:
            result.updated,

          resolved:
            result.resolved,
        })
      ),

    ranAt:
      new Date()
        .toISOString(),
  }
}


// ============================================================
// TORONTO FIRE · LIVE NEWS
// ============================================================
//
// Lifecycle:
//
// NEW
//   New incident externalId → NEWSROOM.
//
// UPDATE
//   Same published externalId + meaningful changed fields
//   → NEWSROOM UPDATE.
//
// RESOLVE
//   Published Fire incident disappears from the official live
//   incident feed for 2 consecutive successful polls
//   → NEWSROOM RESOLVE.
//
// IMPORTANT:
// If the Fire request throws/fails, runReviewScraper never reaches
// its resolve reconciliation. A network failure therefore does NOT
// count as a missing incident.
//
// ============================================================

function runTorontoFireNewsScraper() {
  return runReviewScraper({
    city:
      'toronto',

    type:
      'news',

    source:
      'toronto-fire-active-incidents',

    scrape:
      scrapeTorontoFireNews,

    maxAgeDays:
      30,

    includeUndated:
      false,

    reviewPublishedUpdates:
      true,

    resolveMissing:
      true,

    resolveMissingAfterRuns:
      2,

    managedExternalIdPrefixes: [
      'toronto-fire-',
    ],
  })
}


// ============================================================
// TTC · LIVE NEWS
// ============================================================
//
// Lifecycle:
//
// NEW
//   New TTC alert externalId → NEWSROOM.
//
// UPDATE
//   Same published externalId + meaningful changed fields
//   → NEWSROOM UPDATE.
//
// RESOLVE
//   Published TTC alert disappears from the official GTFS-RT
//   alert feed for 2 consecutive successful polls
//   → NEWSROOM RESOLVE.
//
// IMPORTANT:
// If the TTC request throws/fails, runReviewScraper never reaches
// its resolve reconciliation. A feed/network failure therefore does
// NOT count as a missing TTC alert.
//
// ============================================================

function runTorontoTtcNewsScraper() {
  return runReviewScraper({
    city:
      'toronto',

    type:
      'news',

    source:
      'ttc-gtfs-rt-alerts',

    scrape:
      scrapeTtcServiceAlerts,

    maxAgeDays:
      30,

    includeUndated:
      false,

    reviewPublishedUpdates:
      true,

    resolveMissing:
      true,

    resolveMissingAfterRuns:
      2,

    managedExternalIdPrefixes: [
      'ttc-alert-',
    ],
  })
}


// ============================================================
// TORONTO · NEWS SCRAPER
// ============================================================
//
// Fire and TTC run independently.
//
// Promise.allSettled means one official source can fail without
// blocking the other source from reaching NEWSROOM.
//
// Failed sources are reported in the combined result but are NOT
// treated as an empty successful feed.
//
// ============================================================

export async function runTorontoNewsScraper() {
  const [
    fireResult,
    ttcResult,
  ] =
    await Promise.allSettled([
      runTorontoFireNewsScraper(),
      runTorontoTtcNewsScraper(),
    ])


  const results = []


  if (
    fireResult.status ===
      'fulfilled'
  ) {
    results.push({
      source:
        'toronto-fire-active-incidents',

      result:
        fireResult.value,
    })
  }
  else {
    console.warn(
      'TORONTO NEWS SOURCE FAILED · TORONTO FIRE',
      fireResult.reason
    )


    results.push({
      source:
        'toronto-fire-active-incidents',

      result:
        emptyNewsResult(
          'toronto-fire-active-incidents'
        ),
    })
  }


  if (
    ttcResult.status ===
      'fulfilled'
  ) {
    results.push({
      source:
        'ttc-gtfs-rt-alerts',

      result:
        ttcResult.value,
    })
  }
  else {
    console.warn(
      'TORONTO NEWS SOURCE FAILED · TTC',
      ttcResult.reason
    )


    results.push({
      source:
        'ttc-gtfs-rt-alerts',

      result:
        emptyNewsResult(
          'ttc-gtfs-rt-alerts'
        ),
    })
  }


  return combineNewsResults(
    results
  )
}


// ============================================================
// TORONTO · ALL NEW SOURCES
// ============================================================
//
// NEW remains separate from NEWS.
//
// These sources are NOT affected by the official NEWS lifecycle.
//
// ============================================================

async function scrapeTorontoNewSources() {
  const [
    developmentRecords,
    blogToRecords,
  ] =
    await Promise.all([
      scrapeTorontoDevelopments(),
      scrapeBlogToNew(),
    ])


  return [
    ...developmentRecords,
    ...blogToRecords,
  ]
}


// ============================================================
// TORONTO · NEW
// ============================================================

export function runTorontoNewScraper() {
  return runReviewScraper({
    city:
      'toronto',

    type:
      'new',

    source:
      'toronto-new-sources',

    scrape:
      scrapeTorontoNewSources,

    maxAgeDays:
      30,

    includeUndated:
      false,
  })
}