import {
  PINS,
} from '../content/pins.js'


import {
  getNewsExpiresAt,
  newsRecordIsCurrent,
} from '../newsPolicy.js'


const NEWS_KEY =
  'elppa-geographic-news'


const NEW_KEY =
  'elppa-geographic-new'


const HISTORIC_KEY =
  'elppa-geographic-historic'


const NEWS_REVIEW_KEY =
  'elppa-geographic-news-review'


const NEW_REVIEW_KEY =
  'elppa-geographic-new-review'


const SCRAPER_PROCESSED_KEY =
  'elppa-geographic-scraper-processed'


// ============================================================
// GENERIC STORE
// ============================================================

function readRecords(
  key
) {
  try {
    const value =
      localStorage.getItem(
        key
      )


    if (
      !value
    ) {
      return []
    }


    const parsed =
      JSON.parse(
        value
      )


    return Array.isArray(
      parsed
    )
      ? parsed
      : []
  } catch (
    error
  ) {
    console.error(
      'ADMIN STORE READ ERROR:',
      error
    )


    return []
  }
}


function writeRecords(
  key,
  records
) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(
        records
      )
    )
  } catch (
    error
  ) {
    console.error(
      'ADMIN STORE WRITE ERROR:',
      error
    )
  }
}


// ============================================================
// EXTERNAL ID
// ============================================================

function sameExternalId(
  recordA,
  recordB
) {
  if (
    !recordA?.externalId ||
    !recordB?.externalId
  ) {
    return false
  }


  return (
    String(
      recordA.externalId
    ) ===
    String(
      recordB.externalId
    )
  )
}


// ============================================================
// NEWSROOM LIFECYCLE
// ============================================================
//
// NEW
//   Brand-new official item.
//
// UPDATE
//   Same externalId as a published pin, but meaningful official
//   information changed.
//
// RESOLVE
//   Same externalId as a published pin, but the official source
//   says the condition has ended / disappeared.
//
// UPDATE and RESOLVE are allowed to coexist with a published item.
// They are proposals for Admin Room review, not public changes.
//
// ============================================================

function normalizeNewsroomAction(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .toLowerCase()
}


function isLifecycleReviewRecord(
  record
) {
  const action =
    normalizeNewsroomAction(
      record?.newsroomAction
    )


  return (
    action ===
      'update' ||
    action ===
      'resolve'
  )
}


function sameLifecycleReview(
  recordA,
  recordB
) {
  if (
    !sameExternalId(
      recordA,
      recordB
    )
  ) {
    return false
  }


  return (
    normalizeNewsroomAction(
      recordA?.newsroomAction
    ) ===
    normalizeNewsroomAction(
      recordB?.newsroomAction
    )
  )
}


// ============================================================
// LIVE NEWS SHELF LIFE
// ============================================================
//
// The raw records stay in localStorage so we do not destroy history.
// getNewsItems() / getNewsReviewItems() expose only items whose central
// live-news policy says they are still current.
//
// Permanent source/editorial history is also written by the server to:
//   server/data/toronto-news-ledger.csv
//
// ============================================================

function currentNewsRecords(
  records
) {
  return (
    Array.isArray(
      records
    )
      ? records
      : []
  )
    .map(
      (
        record
      ) => ({
        ...record,

        expiresAt:
          getNewsExpiresAt(
            record
          ) ||
          record.expiresAt ||
          '',
      })
    )
    .filter(
      newsRecordIsCurrent
    )
}


// ============================================================
// NEWS
// ============================================================

export function getNewsItems() {
  return currentNewsRecords(
    readRecords(
      NEWS_KEY
    )
  )
}


export function saveNewsItems(
  records
) {
  writeRecords(
    NEWS_KEY,
    records
  )
}


// ============================================================
// FIND PUBLISHED NEWS BY EXTERNAL ID
// ============================================================

export function getNewsItemByExternalId(
  externalId
) {
  if (
    !externalId
  ) {
    return null
  }


  return (
    getNewsItems()
      .find(
        (
          record
        ) =>
          String(
            record?.externalId ||
            ''
          ) ===
          String(
            externalId
          )
      ) ||
    null
  )
}


// ============================================================
// APPLY APPROVED NEWS UPDATE
// ============================================================
//
// This is only called AFTER Admin Room approval.
//
// The existing public pin keeps its internal id / creation identity.
// Incoming official fields replace the old public values.
//
// ============================================================

export function applyNewsItemUpdate({
  externalId,
  record,
}) {
  if (
    !externalId ||
    !record
  ) {
    return getNewsItems()
  }


  const current =
    getNewsItems()


  const existingIndex =
    current.findIndex(
      (
        item
      ) =>
        String(
          item?.externalId ||
          ''
        ) ===
        String(
          externalId
        )
    )


  if (
    existingIndex <
    0
  ) {
    return current
  }


  const existing =
    current[
      existingIndex
    ]


  const incoming =
    record.incomingRecord ||
    record


  const incomingHasBetterTtcSourceTime =
    incoming?.ttcSourceTimeKind ===
      'active-period-start' &&
    existing?.ttcSourceTimeKind !==
      'active-period-start'


  const preservedPublishedAt =
    incomingHasBetterTtcSourceTime
      ? (
          incoming.publishedAt ||
          existing.publishedAt ||
          ''
        )
      : (
          existing.publishedAt ||
          incoming.publishedAt ||
          ''
        )


  const preservedTtcSourceTime =
    incomingHasBetterTtcSourceTime
      ? (
          incoming.ttcSourceTime ||
          incoming.publishedAt ||
          existing.ttcSourceTime ||
          ''
        )
      : (
          existing.ttcSourceTime ||
          existing.publishedAt ||
          incoming.ttcSourceTime ||
          incoming.publishedAt ||
          ''
        )


  const nextRecord = {
    ...existing,
    ...incoming,

    publishedAt:
      preservedPublishedAt,

    ttcSourceTime:
      preservedTtcSourceTime,

    ttcSourceTimeKind:
      incomingHasBetterTtcSourceTime
        ? incoming.ttcSourceTimeKind
        : (
            existing.ttcSourceTimeKind ||
            incoming.ttcSourceTimeKind ||
            ''
          ),

    id:
      existing.id,

    externalId:
      existing.externalId ||
      externalId,

    active:
      true,

    createdAt:
      existing.createdAt ||
      incoming.createdAt ||
      new Date()
        .toISOString(),

    firstPublishedAt:
      existing.firstPublishedAt ||
      existing.publishedAt ||
      incoming.firstPublishedAt ||
      incoming.publishedAt ||
      '',

    updatedAt:
      new Date()
        .toISOString(),

    lastNewsroomAction:
      'update',
  }


  const next =
    current.map(
      (
        item,
        index
      ) =>
        index ===
        existingIndex
          ? nextRecord
          : item
    )


  saveNewsItems(
    next
  )


  return next
}


// ============================================================
// APPLY APPROVED NEWS RESOLUTION
// ============================================================
//
// This is only called AFTER Admin Room approval.
//
// RESOLVE removes the matching public pin from the active NEWS store.
// The newsroom record remains the editorial audit trail until the
// Admin Room removes it from the review queue.
//
// ============================================================

export function resolveNewsItemByExternalId(
  externalId
) {
  if (
    !externalId
  ) {
    return getNewsItems()
  }


  const current =
    getNewsItems()


  const next =
    current.filter(
      (
        record
      ) =>
        String(
          record?.externalId ||
          ''
        ) !==
        String(
          externalId
        )
    )


  if (
    next.length !==
    current.length
  ) {
    saveNewsItems(
      next
    )
  }


  return next
}


// ============================================================
// NEW
// ============================================================

export function getNewItems() {
  return readRecords(
    NEW_KEY
  )
}


export function saveNewItems(
  records
) {
  writeRecords(
    NEW_KEY,
    records
  )
}


// ============================================================
// NEWS REVIEW
// ============================================================

export function getNewsReviewItems() {
  return currentNewsRecords(
    readRecords(
      NEWS_REVIEW_KEY
    )
  )
}


export function saveNewsReviewItems(
  records
) {
  writeRecords(
    NEWS_REVIEW_KEY,
    records
  )
}


// ============================================================
// NEW REVIEW
// ============================================================

export function getNewReviewItems() {
  return readRecords(
    NEW_REVIEW_KEY
  )
}


export function saveNewReviewItems(
  records
) {
  writeRecords(
    NEW_REVIEW_KEY,
    records
  )
}


// ============================================================
// SCRAPER PROCESSED HISTORY
// ============================================================
//
// This is separate from published content and review queues.
//
// Once an admin handles a scraped item:
//
// APPROVED
// REJECTED
// EDITED + PUBLISHED
//
// its externalId is saved here.
//
// That means a future scraper run will NOT bring the same item
// back just because it is no longer sitting in REVIEW.
//
// ============================================================

export function getProcessedScraperItems() {
  return readRecords(
    SCRAPER_PROCESSED_KEY
  )
}


export function saveProcessedScraperItems(
  records
) {
  writeRecords(
    SCRAPER_PROCESSED_KEY,
    records
  )
}


// ============================================================
// IS SCRAPER ITEM PROCESSED
// ============================================================

export function isScraperItemProcessed(
  externalId
) {
  if (
    !externalId
  ) {
    return false
  }


  const processed =
    getProcessedScraperItems()


  return processed.some(
    (item) =>
      item.externalId ===
      externalId
  )
}


// ============================================================
// MARK SCRAPER ITEM PROCESSED
// ============================================================

export function markScraperItemProcessed({
  externalId,
  city,
  type,
  action,
  source,
  title,
}) {
  if (
    !externalId
  ) {
    return getProcessedScraperItems()
  }


  const current =
    getProcessedScraperItems()


  const existingIndex =
    current.findIndex(
      (item) =>
        item.externalId ===
        externalId
    )


  const processedRecord = {
    externalId,

    city:
      city ||
      '',

    type:
      type ||
      '',

    action:
      action ||
      'handled',

    source:
      source ||
      '',

    title:
      title ||
      '',

    processedAt:
      new Date()
        .toISOString(),
  }


  let next


  if (
    existingIndex >=
    0
  ) {
    next =
      current.map(
        (
          item,
          index
        ) =>
          index ===
          existingIndex
            ? {
                ...item,
                ...processedRecord,
              }
            : item
      )
  } else {
    next = [
      processedRecord,
      ...current,
    ]
  }


  saveProcessedScraperItems(
    next
  )


  return next
}


// ============================================================
// MARK RECORD PROCESSED
// ============================================================
//
// Convenience function for AdminRoom.
//
// Instead of passing every field manually:
//
// markScraperRecordProcessed(record, 'approved')
//
// ============================================================

export function markScraperRecordProcessed(
  record,
  action =
    'handled'
) {
  if (
    !record?.externalId
  ) {
    return getProcessedScraperItems()
  }


  return markScraperItemProcessed({
    externalId:
      record.externalId,

    city:
      record.city,

    type:
      record.type,

    action,

    source:
      record.source,

    title:
      record.title,
  })
}


// ============================================================
// REMOVE PROCESSED ITEM
// ============================================================
//
// Mainly useful during development.
//
// This lets us intentionally allow something to be scraped
// again later if necessary.
//
// We will NOT expose this prominently in the Admin Room.
//
// ============================================================

export function forgetProcessedScraperItem(
  externalId
) {
  if (
    !externalId
  ) {
    return getProcessedScraperItems()
  }


  const current =
    getProcessedScraperItems()


  const next =
    current.filter(
      (item) =>
        item.externalId !==
        externalId
    )


  saveProcessedScraperItems(
    next
  )


  return next
}


// ============================================================
// ALREADY PUBLISHED
// ============================================================

function scraperItemAlreadyPublished(
  record,
  publishedRecords
) {
  if (
    !record?.externalId
  ) {
    return false
  }


  return publishedRecords.some(
    (item) =>
      sameExternalId(
        item,
        record
      )
  )
}


// ============================================================
// ALREADY IN REVIEW
// ============================================================

function scraperItemAlreadyInReview(
  record,
  reviewRecords
) {
  if (
    !record?.externalId
  ) {
    return false
  }


  if (
    isLifecycleReviewRecord(
      record
    )
  ) {
    return reviewRecords.some(
      (
        item
      ) =>
        sameLifecycleReview(
          item,
          record
        )
    )
  }


  return reviewRecords.some(
    (item) =>
      sameExternalId(
        item,
        record
      )
  )
}


// ============================================================
// SHOULD SCRAPER ITEM BE IGNORED
// ============================================================

function shouldIgnoreScraperItem({
  record,
  reviewRecords,
  publishedRecords,
}) {
  if (
    !record?.externalId
  ) {
    return false
  }


  // UPDATE / RESOLVE are intentionally allowed to reference an
  // already-published and already-processed externalId.
  //
  // The only duplicate we block here is the same lifecycle action
  // already waiting in NEWSROOM.
  if (
    isLifecycleReviewRecord(
      record
    )
  ) {
    return scraperItemAlreadyInReview(
      record,
      reviewRecords
    )
  }


  if (
    isScraperItemProcessed(
      record.externalId
    )
  ) {
    return true
  }


  if (
    scraperItemAlreadyInReview(
      record,
      reviewRecords
    )
  ) {
    return true
  }


  if (
    scraperItemAlreadyPublished(
      record,
      publishedRecords
    )
  ) {
    return true
  }


  return false
}


// ============================================================
// SCRAPER ENTRY POINT · NEWS
// ============================================================
//
// Nothing becomes public automatically.
//
// Candidate records are checked against:
//
// 1. processed history
// 2. current review queue
// 3. already-published items
//
// ============================================================

export function addNewsReviewItem(
  record
) {
  const current =
    getNewsReviewItems()


  const published =
    getNewsItems()


  if (
    shouldIgnoreScraperItem({
      record,

      reviewRecords:
        current,

      publishedRecords:
        published,
    })
  ) {
    return current
  }


  const next = [
    {
      ...record,

      id:
        record.id ||
        createAdminId(
          'news-review'
        ),

      type:
        'news',

      reviewStatus:
        'pending',

      newsroomAction:
        normalizeNewsroomAction(
          record.newsroomAction
        ) ||
        'new',

      deliveryMode:
        record.deliveryMode ||
        'newsroom',

      targetExternalId:
        record.targetExternalId ||
        (
          isLifecycleReviewRecord(
            record
          )
            ? record.externalId
            : ''
        ),

      active:
        false,

      receivedAt:
        record.receivedAt ||
        new Date()
          .toISOString(),
    },

    ...current,
  ]


  saveNewsReviewItems(
    next
  )


  return next
}


// ============================================================
// REMOVE NEWSROOM ITEM
// ============================================================

export function removeNewsReviewItem(
  reviewId
) {
  if (
    !reviewId
  ) {
    return getNewsReviewItems()
  }


  const current =
    getNewsReviewItems()


  const next =
    current.filter(
      (
        record
      ) =>
        record.id !==
        reviewId
    )


  if (
    next.length !==
    current.length
  ) {
    saveNewsReviewItems(
      next
    )
  }


  return next
}


// ============================================================
// SCRAPER ENTRY POINT · NEW
// ============================================================

export function addNewReviewItem(
  record
) {
  const current =
    getNewReviewItems()


  const published =
    getNewItems()


  if (
    shouldIgnoreScraperItem({
      record,

      reviewRecords:
        current,

      publishedRecords:
        published,
    })
  ) {
    return current
  }


  const next = [
    {
      ...record,

      id:
        record.id ||
        createAdminId(
          'new-review'
        ),

      type:
        'new',

      reviewStatus:
        'pending',

      active:
        false,

      receivedAt:
        record.receivedAt ||
        new Date()
          .toISOString(),
    },

    ...current,
  ]


  saveNewReviewItems(
    next
  )


  return next
}


// ============================================================
// HISTORIC
// ============================================================

function convertPinsToHistoric() {
  return PINS
    .filter(
      (pin) =>
        pin.active !== false
    )
    .map(
      (pin) => ({
        id:
          pin.id,

        type:
          'historic',

        city:
          pin.city ||
          'toronto',

        title:
          pin.title ||
          '',

        description:
          pin.description ||
          '',

        location:
          '',

        longitude:
          Number(
            pin.longitude
          ),

        latitude:
          Number(
            pin.latitude
          ),

        year:
          pin.year ||
          '',

        category:
          'place',

        source:
          pin.source ||
          '',

        sourceUrl:
          '',

        active:
          pin.active !== false,

        createdAt:
          new Date()
            .toISOString(),

        migratedFromPins:
          true,
      })
    )
}


export function getHistoricItems() {
  const existing =
    readRecords(
      HISTORIC_KEY
    )


  if (
    existing.length > 0
  ) {
    return existing
  }


  const migrated =
    convertPinsToHistoric()


  if (
    migrated.length > 0
  ) {
    writeRecords(
      HISTORIC_KEY,
      migrated
    )
  }


  return migrated
}


export function saveHistoricItems(
  records
) {
  writeRecords(
    HISTORIC_KEY,
    records
  )
}


// ============================================================
// IDS
// ============================================================

export function createAdminId(
  prefix
) {
  const random =
    Math.random()
      .toString(
        36
      )
      .slice(
        2,
        9
      )


  return (
    `${prefix}-` +
    `${Date.now()}-` +
    random
  )
}