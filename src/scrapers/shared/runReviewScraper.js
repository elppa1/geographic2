import {
  addNewsReviewItem,
  addNewReviewItem,
  getNewsItems,
  getNewsReviewItems,
  getNewItems,
  getNewReviewItems,
  isScraperItemProcessed,
  saveNewsItems,
  saveNewsReviewItems,
  saveNewItems,
  saveNewReviewItems,
} from '../../admin/adminStore.js'


// ============================================================
// TEXT
// ============================================================

function normalizeText(
  value
) {
  return String(
    value ||
    ''
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// DATE
// ============================================================

function getRecordDate(
  record,
  type
) {
  if (
    type ===
    'news'
  ) {
    return (
      record.publishedAt ||
      record.receivedAt ||
      ''
    )
  }


  return (
    record.announcedAt ||
    record.receivedAt ||
    ''
  )
}


function getDateTimestamp(
  value
) {
  if (
    !value
  ) {
    return null
  }


  const date =
    new Date(
      value
    )


  const timestamp =
    date.getTime()


  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return null
  }


  return timestamp
}


// ============================================================
// RECENCY
// ============================================================

function recordIsRecent({
  record,
  type,
  maxAgeDays,
  includeUndated,
}) {
  if (
    maxAgeDays ===
    null ||
    maxAgeDays ===
    undefined
  ) {
    return true
  }


  const value =
    getRecordDate(
      record,
      type
    )


  const timestamp =
    getDateTimestamp(
      value
    )


  if (
    timestamp ===
    null
  ) {
    return Boolean(
      includeUndated
    )
  }


  const now =
    Date.now()


  const maximumAge =
    (
      Number(
        maxAgeDays
      ) *
      24 *
      60 *
      60 *
      1000
    )


  return (
    timestamp >=
    now -
    maximumAge
  )
}


// ============================================================
// SORT
// ============================================================

function sortNewestFirst(
  records,
  type
) {
  return [
    ...records,
  ]
    .sort(
      (
        a,
        b
      ) => {
        const timestampA =
          getDateTimestamp(
            getRecordDate(
              a,
              type
            )
          ) ||
          0


        const timestampB =
          getDateTimestamp(
            getRecordDate(
              b,
              type
            )
          ) ||
          0


        return (
          timestampB -
          timestampA
        )
      }
    )
}


// ============================================================
// EXTERNAL ID
// ============================================================

function sameExternalId(
  candidate,
  record
) {
  if (
    !candidate.externalId ||
    !record.externalId
  ) {
    return false
  }


  return (
    String(
      candidate.externalId
    ) ===
    String(
      record.externalId
    )
  )
}


// ============================================================
// REVIEW EXTERNAL ID
// ============================================================

function findReviewByExternalId(
  candidate,
  reviewRecords
) {
  if (
    !candidate.externalId
  ) {
    return null
  }


  return (
    reviewRecords.find(
      (
        record
      ) =>
        sameExternalId(
          candidate,
          record
        )
    ) ||
    null
  )
}


// ============================================================
// PLANNING APPLICATION NUMBER
// ============================================================
//
// This is generic enough to live here.
//
// Toronto uses these now.
// Other cities can populate the same canonical field later.
//
// ============================================================

function samePlanningApplication(
  candidate,
  record
) {
  const candidateNumbers =
    Array.isArray(
      candidate.planningApplicationNumbers
    )
      ? candidate.planningApplicationNumbers
      : []


  const recordNumbers =
    Array.isArray(
      record.planningApplicationNumbers
    )
      ? record.planningApplicationNumbers
      : []


  if (
    candidateNumbers.length ===
      0 ||
    recordNumbers.length ===
      0
  ) {
    return false
  }


  return candidateNumbers.some(
    (
      candidateNumber
    ) =>
      recordNumbers.some(
        (
          recordNumber
        ) =>
          normalizeText(
            candidateNumber
          ) ===
          normalizeText(
            recordNumber
          )
      )
  )
}


// ============================================================
// TITLE + LOCATION
// ============================================================
//
// Conservative fallback.
//
// We only consider this a duplicate when BOTH title and
// location match exactly after normalization.
//
// ============================================================

function sameTitleAndLocation(
  candidate,
  record
) {
  const candidateTitle =
    normalizeText(
      candidate.title
    )


  const candidateLocation =
    normalizeText(
      candidate.location
    )


  if (
    !candidateTitle ||
    !candidateLocation
  ) {
    return false
  }


  const recordTitle =
    normalizeText(
      record.title
    )


  const recordLocation =
    normalizeText(
      record.location
    )


  return (
    candidateTitle ===
      recordTitle &&
    candidateLocation ===
      recordLocation
  )
}


// ============================================================
// DUPLICATE
// ============================================================

function isDuplicate(
  candidate,
  knownRecords
) {
  return knownRecords.some(
    (
      record
    ) => (
      sameExternalId(
        candidate,
        record
      ) ||
      samePlanningApplication(
        candidate,
        record
      ) ||
      sameTitleAndLocation(
        candidate,
        record
      )
    )
  )
}


// ============================================================
// REFRESH REVIEW RECORD
// ============================================================
//
// A scraper can learn more about a story on a later run.
//
// Example:
//
// First run:
//   location: Scarborough Southwest
//
// Later run after article enrichment:
//   location: 313 Pharmacy Ave.
//
// If the record is still pending in REVIEW, replace the scraper
// fields while preserving the Admin Room's own review identity.
//
// ============================================================

function refreshReviewRecord(
  existingRecord,
  candidate
) {
  const candidateHasBetterTtcSourceTime =
    candidate?.ttcSourceTimeKind ===
      'active-period-start' &&
    existingRecord?.ttcSourceTimeKind !==
      'active-period-start'


  const preservedPublishedAt =
    candidateHasBetterTtcSourceTime
      ? (
          candidate.publishedAt ||
          existingRecord.publishedAt ||
          ''
        )
      : (
          existingRecord.publishedAt ||
          candidate.publishedAt ||
          ''
        )


  const preservedTtcSourceTime =
    candidateHasBetterTtcSourceTime
      ? (
          candidate.ttcSourceTime ||
          candidate.publishedAt ||
          existingRecord.ttcSourceTime ||
          ''
        )
      : (
          existingRecord.ttcSourceTime ||
          existingRecord.publishedAt ||
          candidate.ttcSourceTime ||
          candidate.publishedAt ||
          ''
        )


  return {
    ...existingRecord,
    ...candidate,

    id:
      existingRecord.id,

    // A repeated live-feed poll must not move the original alert time.
    //
    // Exception: if a later TTC payload finally supplies an actual
    // active_period.start, upgrade the fallback feed timestamp once.
    publishedAt:
      preservedPublishedAt,

    ttcSourceTime:
      preservedTtcSourceTime,

    ttcSourceTimeKind:
      candidateHasBetterTtcSourceTime
        ? candidate.ttcSourceTimeKind
        : (
            existingRecord.ttcSourceTimeKind ||
            candidate.ttcSourceTimeKind ||
            ''
          ),

    reviewStatus:
      existingRecord.reviewStatus ||
      'pending',

    active:
      existingRecord.active ===
      true
        ? true
        : false,

    receivedAt:
      existingRecord.receivedAt ||
      candidate.receivedAt ||
      new Date()
        .toISOString(),

    refreshedAt:
      new Date()
        .toISOString(),
  }
}


// ============================================================
// LIVE NEWSROOM LIFECYCLE
// ============================================================
//
// Ordinary scrapers are still one-way:
// NEW → REVIEW → handled.
//
// Official live feeds can opt into a second mode:
//
// NEW
// UPDATE
// RESOLVE
//
// Nothing here changes public content automatically.
// UPDATE and RESOLVE are only queued for Admin Room review.
//
// ============================================================

const LIVE_LIFECYCLE_STATE_KEY =
  'geographic-live-lifecycle-state-v1'


const MEANINGFUL_UPDATE_FIELDS = [
  'category',
  'title',
  'description',
  'location',
  'intersection',
  'sourceUrl',
  'imageUrl',
  'ttcEffect',
  'ttcCause',
  'ttcRoutes',
  'alarmLevel',
  'area',
  'dispatchedUnits',
]


function safeLifecycleStorage() {
  try {
    return globalThis
      .localStorage ||
      null
  }
  catch (
    error
  ) {
    return null
  }
}


function readLifecycleState() {
  const storage =
    safeLifecycleStorage()


  if (
    !storage
  ) {
    return {}
  }


  try {
    const raw =
      storage.getItem(
        LIVE_LIFECYCLE_STATE_KEY
      )


    if (
      !raw
    ) {
      return {}
    }


    const parsed =
      JSON.parse(
        raw
      )


    return (
      parsed &&
      typeof parsed ===
        'object' &&
      !Array.isArray(
        parsed
      )
    )
      ? parsed
      : {}
  }
  catch (
    error
  ) {
    return {}
  }
}


function writeLifecycleState(
  state
) {
  const storage =
    safeLifecycleStorage()


  if (
    !storage
  ) {
    return
  }


  try {
    storage.setItem(
      LIVE_LIFECYCLE_STATE_KEY,
      JSON.stringify(
        state
      )
    )
  }
  catch (
    error
  ) {
    // Lifecycle state is a safety aid only.
    // A storage failure must never break ingestion.
  }
}


function buildLifecycleStateId({
  city,
  type,
  source,
  externalId,
}) {
  return [
    city ||
      '',
    type ||
      '',
    source ||
      '',
    externalId ||
      '',
  ]
    .join(
      '::'
    )
}


function normalizeComparableValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .map(
        (
          item
        ) =>
          normalizeComparableValue(
            item
          )
      )
      .sort()
  }


  if (
    value &&
    typeof value ===
      'object'
  ) {
    const next =
      {}


    Object.keys(
      value
    )
      .sort()
      .forEach(
        (
          key
        ) => {
          next[
            key
          ] =
            normalizeComparableValue(
              value[
                key
              ]
            )
        }
      )


    return next
  }


  if (
    typeof value ===
      'string'
  ) {
    return value
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
  }


  return value ??
    null
}


// ============================================================
// SOURCE SNAPSHOT
// ============================================================
//
// Public pins can be edited or geocoded after approval.
//
// That means we must NOT compare a fresh official-feed record to the
// public display record. Doing so would create fake UPDATE cards just
// because an editor changed wording or Geographic improved a location.
//
// Instead, every official live item keeps a sourceSnapshot containing
// ONLY the meaningful fields supplied by the official source.
//
// Timestamps are deliberately excluded.
//
// ============================================================

function buildSourceSnapshot(
  record
) {
  const snapshot =
    {}


  MEANINGFUL_UPDATE_FIELDS
    .forEach(
      (
        field
      ) => {
        snapshot[
          field
        ] =
          record?.[
            field
          ] ??
          null
      }
    )


  return snapshot
}


function buildSourceFingerprint(
  record
) {
  return JSON.stringify(
    normalizeComparableValue(
      buildSourceSnapshot(
        record
      )
    )
  )
}


function getMeaningfulChanges(
  currentRecord,
  incomingRecord
) {
  // Existing pins created before this lifecycle upgrade do not have a
  // source snapshot yet. The first successful poll establishes the
  // baseline silently instead of manufacturing an UPDATE.
  if (
    !currentRecord?.sourceSnapshot &&
    !currentRecord?.sourceFingerprint
  ) {
    return []
  }


  const currentSnapshot =
    currentRecord.sourceSnapshot ||
    {}


  const incomingSnapshot =
    buildSourceSnapshot(
      incomingRecord
    )


  return MEANINGFUL_UPDATE_FIELDS
    .filter(
      (
        field
      ) => {
        const currentValue =
          normalizeComparableValue(
            currentSnapshot[
              field
            ]
          )


        const incomingValue =
          normalizeComparableValue(
            incomingSnapshot[
              field
            ]
          )


        return (
          JSON.stringify(
            currentValue
          ) !==
          JSON.stringify(
            incomingValue
          )
        )
      }
    )
}


// ============================================================
// LIVE TIMESTAMPS
// ============================================================
//
// firstSeenAt
//   First time Geographic observed this official item.
//
// lastSeenAt
//   Most recent successful feed poll where this item existed.
//
// lastCheckedAt
//   Most recent successful lifecycle check for this item.
//
// sourceUpdatedAt
//   When Geographic observed the official source CONTENT change.
//
// IMPORTANT:
// Poll timestamps NEVER count as meaningful content changes.
//
// ============================================================

function prepareLiveCandidate({
  candidate,
  previousRecord =
    null,
  meaningfulChange =
    false,
}) {
  const now =
    new Date()
      .toISOString()


  const firstSeenAt =
    previousRecord?.firstSeenAt ||
    candidate?.firstSeenAt ||
    now


  return {
    ...candidate,

    firstSeenAt,

    lastSeenAt:
      now,

    lastCheckedAt:
      now,

    sourceUpdatedAt:
      meaningfulChange
        ? now
        : (
            previousRecord?.sourceUpdatedAt ||
            candidate?.sourceUpdatedAt ||
            firstSeenAt
          ),

    sourceSnapshot:
      buildSourceSnapshot(
        candidate
      ),

    sourceFingerprint:
      buildSourceFingerprint(
        candidate
      ),
  }
}


function refreshPublishedObservation({
  store,
  published,
  publishedRecord,
  candidate,
  establishSourceBaseline =
    false,
}) {
  const now =
    new Date()
      .toISOString()


  const nextRecord = {
    ...publishedRecord,

    firstSeenAt:
      publishedRecord.firstSeenAt ||
      candidate.firstSeenAt ||
      now,

    lastSeenAt:
      now,

    lastCheckedAt:
      now,
  }


  if (
    establishSourceBaseline
  ) {
    nextRecord.sourceSnapshot =
      buildSourceSnapshot(
        candidate
      )


    nextRecord.sourceFingerprint =
      buildSourceFingerprint(
        candidate
      )


    nextRecord.sourceUpdatedAt =
      publishedRecord.sourceUpdatedAt ||
      publishedRecord.firstSeenAt ||
      candidate.firstSeenAt ||
      now
  }


  const nextPublished =
    published.map(
      (
        record
      ) =>
        record.id ===
          publishedRecord.id
          ? nextRecord
          : record
    )


  store.savePublished(
    nextPublished
  )


  return {
    published:
      nextPublished,

    record:
      nextRecord,
  }
}


function findPublishedByExternalId(
  candidate,
  publishedRecords
) {
  if (
    !candidate?.externalId
  ) {
    return null
  }


  return (
    publishedRecords.find(
      (
        record
      ) =>
        sameExternalId(
          candidate,
          record
        )
    ) ||
    null
  )
}


function createLifecycleReviewId(
  action,
  externalId
) {
  const safeExternalId =
    normalizeText(
      externalId
    )
      .replace(
        /\s+/g,
        '-'
      )
      .slice(
        0,
        80
      )


  return (
    `news-review-${action}-` +
    `${Date.now()}-` +
    (
      safeExternalId ||
      'item'
    )
  )
}


function queuePublishedUpdate({
  store,
  review,
  publishedRecord,
  candidate,
  type,
  changes =
    null,
}) {
  const meaningfulChanges =
    Array.isArray(
      changes
    )
      ? changes
      : getMeaningfulChanges(
          publishedRecord,
          candidate
        )


  if (
    meaningfulChanges.length ===
      0
  ) {
    return {
      review,
      queued:
        false,
      record:
        null,
    }
  }


  const existingReview =
    findReviewByExternalId(
      candidate,
      review
    )


  const updateRecord = {
    ...candidate,

    id:
      existingReview?.id ||
      createLifecycleReviewId(
        'update',
        candidate.externalId
      ),

    type:
      type ||
      'news',

    active:
      false,

    reviewStatus:
      'pending',

    newsroomAction:
      'update',

    deliveryMode:
      'newsroom',

    targetId:
      publishedRecord.id ||
      '',

    targetExternalId:
      publishedRecord.externalId ||
      candidate.externalId ||
      '',

    previousRecord:
      publishedRecord,

    incomingRecord:
      candidate,

    changedFields:
      meaningfulChanges,

    receivedAt:
      existingReview?.receivedAt ||
      candidate.receivedAt ||
      new Date()
        .toISOString(),

    refreshedAt:
      new Date()
        .toISOString(),
  }


  const nextReview =
    existingReview
      ? review.map(
          (
            record
          ) =>
            record.id ===
            existingReview.id
              ? updateRecord
              : record
        )
      : [
          updateRecord,
          ...review,
        ]


  store.saveReview(
    nextReview
  )


  return {
    review:
      nextReview,

    queued:
      true,

    record:
      updateRecord,
  }
}


function matchesManagedPrefix(
  record,
  prefixes
) {
  if (
    !Array.isArray(
      prefixes
    ) ||
    prefixes.length ===
      0
  ) {
    return false
  }


  const externalId =
    String(
      record?.externalId ||
      ''
    )


  if (
    !externalId
  ) {
    return false
  }


  return prefixes.some(
    (
      prefix
    ) =>
      externalId.startsWith(
        String(
          prefix ||
          ''
        )
      )
  )
}


function removePendingResolve({
  store,
  review,
  externalId,
}) {
  const nextReview =
    review.filter(
      (
        record
      ) =>
        !(
          String(
            record?.externalId ||
            ''
          ) ===
            String(
              externalId ||
              ''
            ) &&
          record?.newsroomAction ===
            'resolve'
        )
    )


  if (
    nextReview.length !==
      review.length
  ) {
    store.saveReview(
      nextReview
    )
  }


  return nextReview
}


function queueResolveReview({
  store,
  review,
  publishedRecord,
  type,
  missingPolls,
}) {
  const existingReview =
    review.find(
      (
        record
      ) =>
        String(
          record?.externalId ||
          ''
        ) ===
          String(
            publishedRecord?.externalId ||
            ''
          ) &&
        record?.newsroomAction ===
          'resolve'
    )


  if (
    existingReview
  ) {
    return {
      review,
      queued:
        false,
      record:
        existingReview,
    }
  }


  const resolveRecord = {
    ...publishedRecord,

    id:
      createLifecycleReviewId(
        'resolve',
        publishedRecord.externalId
      ),

    type:
      type ||
      'news',

    active:
      false,

    reviewStatus:
      'pending',

    newsroomAction:
      'resolve',

    deliveryMode:
      'newsroom',

    targetId:
      publishedRecord.id ||
      '',

    targetExternalId:
      publishedRecord.externalId ||
      '',

    previousRecord:
      publishedRecord,

    incomingRecord:
      null,

    changedFields:
      [],

    resolutionReason:
      'missing-from-live-feed',

    missingPolls,

    resolutionDetectedAt:
      new Date()
        .toISOString(),

    lastCheckedAt:
      new Date()
        .toISOString(),

    receivedAt:
      new Date()
        .toISOString(),
  }


  const nextReview = [
    resolveRecord,
    ...review,
  ]


  store.saveReview(
    nextReview
  )


  return {
    review:
      nextReview,

    queued:
      true,

    record:
      resolveRecord,
  }
}


// ============================================================
// STORE CONFIG
// ============================================================

function getStoreConfig(
  type
) {
  if (
    type ===
    'news'
  ) {
    return {
      getPublished:
        getNewsItems,

      savePublished:
        saveNewsItems,

      getReview:
        getNewsReviewItems,

      addReview:
        addNewsReviewItem,

      saveReview:
        saveNewsReviewItems,
    }
  }


  if (
    type ===
    'new'
  ) {
    return {
      getPublished:
        getNewItems,

      savePublished:
        saveNewItems,

      getReview:
        getNewReviewItems,

      addReview:
        addNewReviewItem,

      saveReview:
        saveNewReviewItems,
    }
  }


  throw new Error(
    (
      'UNSUPPORTED SCRAPER TYPE · ' +
      type
    )
  )
}


// ============================================================
// RUN REVIEW SCRAPER
// ============================================================
//
// Universal ingestion engine.
//
// Every city scraper should eventually return the same basic
// Geographic record shape.
//
// City-specific code stops before this point.
//
// Rules:
//
// 1. Previously approved/rejected/handled item → SKIP
// 2. Already published item → SKIP
// 3. Same externalId still in REVIEW → REFRESH
// 4. Other duplicate in REVIEW → SKIP
// 5. Brand-new item → ADD TO REVIEW
//
// ============================================================

export async function runReviewScraper({
  city,
  type,
  source,
  scrape,
  maxAgeDays =
    30,
  includeUndated =
    false,

  // ----------------------------------------------------------
  // OPTIONAL LIVE-FEED LIFECYCLE
  // ----------------------------------------------------------
  //
  // reviewPublishedUpdates:
  //   Same externalId + changed public information queues UPDATE.
  //
  // resolveMissing:
  //   A published managed item missing from the current live feed
  //   can queue RESOLVE after N consecutive missing polls.
  //
  // managedExternalIdPrefixes:
  //   Safety scope. Only published IDs beginning with one of these
  //   prefixes are eligible for missing-feed resolution.
  //
  // All defaults preserve the old one-way scraper behavior.
  //
  reviewPublishedUpdates =
    false,
  resolveMissing =
    false,
  resolveMissingAfterRuns =
    2,
  managedExternalIdPrefixes =
    [],
}) {
  if (
    !city
  ) {
    throw new Error(
      'SCRAPER CITY REQUIRED'
    )
  }


  if (
    !source
  ) {
    throw new Error(
      'SCRAPER SOURCE REQUIRED'
    )
  }


  if (
    typeof scrape !==
    'function'
  ) {
    throw new Error(
      'SCRAPER FUNCTION REQUIRED'
    )
  }


  const store =
    getStoreConfig(
      type
    )


  // ==========================================================
  // FETCH + NORMALIZE
  // ==========================================================

  const scrapedRecords =
    await scrape()


  const candidates =
    Array.isArray(
      scrapedRecords
    )
      ? scrapedRecords
      : []


  // ==========================================================
  // DATE FILTER
  // ==========================================================

  const recentCandidates =
    candidates.filter(
      (
        record
      ) =>
        recordIsRecent({
          record,

          type,

          maxAgeDays,

          includeUndated,
        })
    )


  const tooOld =
    candidates.length -
    recentCandidates.length


  // ==========================================================
  // NEWEST FIRST
  // ==========================================================

  const sortedCandidates =
    sortNewestFirst(
      recentCandidates,
      type
    )


  // ==========================================================
  // EXISTING CONTENT
  // ==========================================================

  let published =
    store.getPublished()


  let review =
    store.getReview()


  // ==========================================================
  // RESULT ITEMS
  // ==========================================================

  const addedItems =
    []


  const updatedItems =
    []


  const resolvedItems =
    []


  // ==========================================================
  // COUNTERS
  // ==========================================================

  let added =
    0


  let updated =
    0


  let refreshed =
    0


  let resolved =
    0


  let skipped =
    0


  let processed =
    0


  let duplicate =
    0


  // ==========================================================
  // LIVE LIFECYCLE STATE
  // ==========================================================

  let lifecycleState =
    readLifecycleState()


  const activeExternalIds =
    new Set(
      sortedCandidates
        .map(
          (
            candidate
          ) =>
            String(
              candidate?.externalId ||
              ''
            )
        )
        .filter(
          Boolean
        )
    )


  // ==========================================================
  // INGEST
  // ==========================================================

  for (
    const rawCandidate
    of sortedCandidates
  ) {
    const externalId =
      String(
        rawCandidate?.externalId ||
        ''
      )


    let publishedMatch =
      findPublishedByExternalId(
        rawCandidate,
        published
      )


    let candidate =
      prepareLiveCandidate({
        candidate:
          rawCandidate,

        previousRecord:
          publishedMatch,
      })


    // --------------------------------------------------------
    // LIVE ITEM CAME BACK
    //
    // If a feed temporarily omitted an item and it now exists
    // again, cancel any pending automatic RESOLVE proposal.
    // --------------------------------------------------------

    if (
      externalId
    ) {
      review =
        removePendingResolve({
          store,
          review,
          externalId,
        })


      const stateId =
        buildLifecycleStateId({
          city,
          type,
          source,
          externalId,
        })


      if (
        lifecycleState[
          stateId
        ]
      ) {
        delete lifecycleState[
          stateId
        ]
      }
    }


    // --------------------------------------------------------
    // PUBLISHED LIVE ITEM
    //
    // SAME externalId does NOT automatically mean UPDATE.
    //
    // We compare the new official source snapshot against the
    // previously approved official source snapshot.
    //
    // Poll timestamps are not part of that comparison.
    // --------------------------------------------------------

    if (
      reviewPublishedUpdates &&
      publishedMatch
    ) {
      const hadSourceBaseline =
        Boolean(
          publishedMatch.sourceSnapshot ||
          publishedMatch.sourceFingerprint
        )


      const changes =
        getMeaningfulChanges(
          publishedMatch,
          rawCandidate
        )


      const meaningfulChange =
        changes.length >
        0


      // Always refresh observation timestamps silently.
      //
      // For older published pins with no sourceSnapshot yet, the
      // first successful poll establishes a baseline silently.
      const observation =
        refreshPublishedObservation({
          store,
          published,
          publishedRecord:
            publishedMatch,
          candidate,
          establishSourceBaseline:
            !hadSourceBaseline,
        })


      published =
        observation.published


      publishedMatch =
        observation.record


      candidate =
        prepareLiveCandidate({
          candidate:
            rawCandidate,

          previousRecord:
            publishedMatch,

          meaningfulChange,
        })


      if (
        !meaningfulChange
      ) {
        duplicate++


        skipped++


        continue
      }


      const result =
        queuePublishedUpdate({
          store,
          review,
          publishedRecord:
            publishedMatch,
          candidate,
          type,
          changes,
        })


      review =
        result.review


      if (
        result.queued
      ) {
        updatedItems.push(
          result.record
        )


        updated++
      }
      else {
        duplicate++


        skipped++
      }


      continue
    }


    // --------------------------------------------------------
    // HANDLED BEFORE
    //
    // Approved / rejected / edited-published ordinary scraper
    // records must never reappear.
    // --------------------------------------------------------

    if (
      candidate.externalId &&
      isScraperItemProcessed(
        candidate.externalId
      )
    ) {
      processed++


      skipped++


      continue
    }


    // --------------------------------------------------------
    // ALREADY PUBLISHED
    //
    // Ordinary scraper behavior remains unchanged unless
    // reviewPublishedUpdates was explicitly enabled above.
    // --------------------------------------------------------

    if (
      isDuplicate(
        candidate,
        published
      )
    ) {
      duplicate++


      skipped++


      continue
    }


    // --------------------------------------------------------
    // SAME SCRAPER ITEM STILL IN REVIEW
    //
    // Refresh pending NEW records with new observation timestamps,
    // but this is NOT a NEWSROOM UPDATE action.
    // --------------------------------------------------------

    const existingReview =
      findReviewByExternalId(
        candidate,
        review
      )


    if (
      existingReview
    ) {
      candidate =
        prepareLiveCandidate({
          candidate:
            rawCandidate,

          previousRecord:
            existingReview,
        })


      const refreshedRecord =
        refreshReviewRecord(
          existingReview,
          candidate
        )


      review =
        review.map(
          (
            record
          ) =>
            record.id ===
            existingReview.id
              ? refreshedRecord
              : record
        )


      store.saveReview(
        review
      )


      // This is only a silent refresh of a still-pending NEW item.
      // It is NOT a NEWSROOM UPDATE.
      refreshed++


      continue
    }


    // --------------------------------------------------------
    // OTHER DUPLICATE CURRENTLY IN REVIEW
    // --------------------------------------------------------

    if (
      isDuplicate(
        candidate,
        review
      )
    ) {
      duplicate++


      skipped++


      continue
    }


    // --------------------------------------------------------
    // ADD BRAND-NEW ITEM TO REVIEW
    //
    // The NEW record begins its own timestamp history here.
    // --------------------------------------------------------

    candidate =
      prepareLiveCandidate({
        candidate:
          rawCandidate,
      })


    const beforeCount =
      review.length


    store.addReview(
      candidate
    )


    review =
      store.getReview()


    const afterCount =
      review.length


    if (
      afterCount <=
      beforeCount
    ) {
      skipped++


      continue
    }


    const addedRecord =
      findReviewByExternalId(
        candidate,
        review
      ) ||
      candidate


    addedItems.push(
      addedRecord
    )


    added++
  }


  // ==========================================================
  // LIVE-FEED RESOLUTION WATCH
  // ==========================================================
  //
  // Only explicitly managed external-ID prefixes participate.
  //
  // One missing poll does nothing public and queues nothing.
  // The default threshold is two consecutive missing polls.
  //
  // ==========================================================

  if (
    resolveMissing &&
    Array.isArray(
      managedExternalIdPrefixes
    ) &&
    managedExternalIdPrefixes.length >
      0
  ) {
    const threshold =
      Math.max(
        2,
        Number(
          resolveMissingAfterRuns
        ) ||
        2
      )


    for (
      const publishedRecord
      of published
    ) {
      if (
        !matchesManagedPrefix(
          publishedRecord,
          managedExternalIdPrefixes
        )
      ) {
        continue
      }


      const externalId =
        String(
          publishedRecord?.externalId ||
          ''
        )


      if (
        !externalId
      ) {
        continue
      }


      const stateId =
        buildLifecycleStateId({
          city,
          type,
          source,
          externalId,
        })


      if (
        activeExternalIds.has(
          externalId
        )
      ) {
        delete lifecycleState[
          stateId
        ]


        continue
      }


      const previous =
        lifecycleState[
          stateId
        ]


      const missingPolls =
        (
          Number(
            previous?.missingPolls
          ) ||
          0
        ) +
        1


      lifecycleState[
        stateId
      ] = {
        externalId,

        missingPolls,

        lastMissingAt:
          new Date()
            .toISOString(),
      }


      if (
        missingPolls <
        threshold
      ) {
        continue
      }


      const result =
        queueResolveReview({
          store,
          review,
          publishedRecord,
          type,
          missingPolls,
        })


      review =
        result.review


      if (
        result.queued
      ) {
        resolvedItems.push(
          result.record
        )


        resolved++
      }
    }
  }


  writeLifecycleState(
    lifecycleState
  )


  // ==========================================================
  // RESULT
  // ==========================================================

  return {
    city,

    type,

    source,

    found:
      candidates.length,

    eligible:
      sortedCandidates.length,

    added,

    updated,

    refreshed,

    resolved,

    skipped,

    processed,

    duplicate,

    tooOld,

    maxAgeDays,

    items:
      addedItems,

    updatedItems,

    resolvedItems,

    ranAt:
      new Date()
        .toISOString(),
  }
}