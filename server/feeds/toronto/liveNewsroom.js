import {
  appendFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'

import {
  dirname,
  join,
} from 'node:path'

import {
  fileURLToPath,
} from 'node:url'

import {
  getTtcAlertsSnapshot,
} from './ttcAlerts.js'


import {
  getNewsExpiresAt,
  getNewsSourceTimestamp,
  newsRecordIsCurrent,
} from '../../../src/newsPolicy.js'


const __filename =
  fileURLToPath(
    import.meta.url
  )


const __dirname =
  dirname(
    __filename
  )


const DEFAULT_DATA_DIR =
  join(
    __dirname,
    '..',
    '..',
    'data'
  )


const DATA_DIR =
  String(
    process.env.GEOGRAPHIC_DATA_DIR ||
    ''
  )
    .trim() ||
  DEFAULT_DATA_DIR


const STORE_PATH =
  join(
    DATA_DIR,
    'toronto-live-newsroom.json'
  )


const NEWS_LEDGER_PATH =
  join(
    DATA_DIR,
    'toronto-news-ledger.csv'
  )


const NEWS_LEDGER_COLUMNS = [
  'loggedAt',
  'eventType',
  'outcome',
  'queueId',
  'externalId',
  'sourceKey',
  'source',
  'category',
  'title',
  'description',
  'location',
  'latitude',
  'longitude',
  'sourcePublishedAt',
  'firstSeenAt',
  'lastSeenAt',
  'sourceUpdatedAt',
  'approvedAt',
  'expiresAt',
  'resolvedAt',
  'newsroomAction',
  'status',
  'caseNumber',
  'incidentNumber',
  'ttcRoutes',
  'ttcEffect',
  'sourceUrl',
]


const TTC_PUBLIC_URL =
  'https://www.ttc.ca/en/service-advisories/all-service-alerts'


const FIRE_PUBLIC_URL =
  'https://www.toronto.ca/community-people/public-safety-alerts/alerts-notifications/toronto-fire-active-incidents/'


const FIRE_UPSTREAM =
  'https://www.toronto.ca/data/fire/livecad.xml'


const POLL_MS =
  2 * 60 * 1000


const MISSING_POLLS_TO_RESOLVE =
  2


const MAX_EVENTS =
  1500


const MEANINGFUL_FIELDS = [
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


let storeLoaded =
  false


let store = {
  version:
    2,

  events:
    [],

  sources: {
    ttc:
      {},

    fire:
      {},

    police:
      {},
  },

  // Every NEWS pin ever published lives here.
  //
  // Live pins:
  //   active === true
  //
  // Archive:
  //   active === false
  //
  // Records are never deleted from this server store.
  publishedNews:
    {},

  updatedAt:
    '',
}


let writeChain =
  Promise.resolve()


let ledgerWriteChain =
  Promise.resolve()


let syncRunning =
  false


// ============================================================
// TEXT
// ============================================================

function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        hex
      ) =>
        String.fromCodePoint(
          parseInt(
            hex,
            16
          )
        )
    )
    .replace(
      /&#(\d+);/g,
      (
        _match,
        decimal
      ) =>
        String.fromCodePoint(
          parseInt(
            decimal,
            10
          )
        )
    )
    .replace(
      /\u00a0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function slugify(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
}


function decodeHtml(
  value
) {
  return cleanText(
    String(
      value ??
      ''
    )
      .replace(
        /<br\s*\/?>/gi,
        ' '
      )
      .replace(
        /<[^>]+>/g,
        ' '
      )
      .replace(
        /&nbsp;/gi,
        ' '
      )
      .replace(
        /&amp;/gi,
        '&'
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /&apos;/gi,
        "'"
      )
      .replace(
        /&ndash;/gi,
        '–'
      )
      .replace(
        /&mdash;/gi,
        '—'
      )
  )
}


// ============================================================
// PERMANENT CSV DATA SHEET
// ============================================================
//
// This is append-only editorial/source history. A pin can disappear from
// the live map when its shelf life ends without disappearing from this
// dataset.
//
// File:
//   server/data/toronto-news-ledger.csv
//
// ============================================================

function csvCell(
  value
) {
  let text


  if (
    Array.isArray(
      value
    )
  ) {
    text =
      value.join(
        ' | '
      )
  }
  else if (
    value &&
    typeof value ===
      'object'
  ) {
    text =
      JSON.stringify(
        value
      )
  }
  else {
    text =
      String(
        value ??
        ''
      )
  }


  return (
    '"' +
    text.replace(
      /"/g,
      '""'
    ) +
    '"'
  )
}


async function ensureLedgerHeader() {
  await mkdir(
    dirname(
      NEWS_LEDGER_PATH
    ),
    {
      recursive:
        true,
    }
  )


  try {
    const existing =
      await readFile(
        NEWS_LEDGER_PATH,
        'utf8'
      )


    if (
      existing.trim()
    ) {
      return
    }
  }
  catch (
    error
  ) {
    if (
      error?.code !==
        'ENOENT'
    ) {
      throw error
    }
  }


  await writeFile(
    NEWS_LEDGER_PATH,
    NEWS_LEDGER_COLUMNS
      .map(
        csvCell
      )
      .join(
        ','
      ) +
      '\n',
    'utf8'
  )
}


function ledgerRow({
  eventType,
  outcome =
    '',
  record,
}) {
  const sourceTime =
    getNewsSourceTimestamp(
      record
    )


  const values = {
    loggedAt:
      new Date()
        .toISOString(),

    eventType,

    outcome,

    queueId:
      record?.serverQueueId ||
      record?.id ||
      '',

    externalId:
      record?.externalId ||
      '',

    sourceKey:
      record?.sourceKey ||
      '',

    source:
      record?.source ||
      '',

    category:
      record?.category ||
      '',

    title:
      record?.title ||
      '',

    description:
      record?.description ||
      '',

    location:
      record?.intersection ||
      record?.location ||
      '',

    latitude:
      record?.latitude ??
      '',

    longitude:
      record?.longitude ??
      '',

    sourcePublishedAt:
      sourceTime ||
      record?.publishedAt ||
      '',

    firstSeenAt:
      record?.firstSeenAt ||
      '',

    lastSeenAt:
      record?.lastSeenAt ||
      '',

    sourceUpdatedAt:
      record?.sourceUpdatedAt ||
      '',

    approvedAt:
      record?.approvedAt ||
      '',

    expiresAt:
      getNewsExpiresAt(
        record
      ) ||
      record?.expiresAt ||
      '',

    resolvedAt:
      record?.resolvedAt ||
      '',

    newsroomAction:
      record?.newsroomAction ||
      '',

    status:
      record?.status ||
      record?.reviewStatus ||
      '',

    caseNumber:
      record?.caseNumber ||
      record?.policeCaseNumber ||
      '',

    incidentNumber:
      record?.incidentNumber ||
      record?.goNumber ||
      '',

    ttcRoutes:
      record?.ttcRoutes ||
      [],

    ttcEffect:
      record?.ttcEffect ||
      '',

    sourceUrl:
      record?.sourceUrl ||
      '',
  }


  return NEWS_LEDGER_COLUMNS
    .map(
      (
        key
      ) =>
        csvCell(
          values[
            key
          ]
        )
    )
    .join(
      ','
    ) +
    '\n'
}


async function appendLedgerEvent({
  eventType,
  outcome =
    '',
  record,
}) {
  if (
    !record
  ) {
    return
  }


  ledgerWriteChain =
    ledgerWriteChain.then(
      async () => {
        await ensureLedgerHeader()


        await appendFile(
          NEWS_LEDGER_PATH,
          ledgerRow({
            eventType,
            outcome,
            record,
          }),
          'utf8'
        )
      }
    )


  return ledgerWriteChain
}


// ============================================================
// STORAGE
// ============================================================

async function ensureLoaded() {
  if (
    storeLoaded
  ) {
    return
  }


  storeLoaded =
    true


  try {
    const raw =
      await readFile(
        STORE_PATH,
        'utf8'
      )


    const parsed =
      JSON.parse(
        raw
      )


    if (
      parsed &&
      typeof parsed ===
        'object'
    ) {
      store = {
        ...store,
        ...parsed,

        events:
          Array.isArray(
            parsed.events
          )
            ? parsed.events
            : [],

        sources: {
          ttc:
            parsed.sources?.ttc ||
            {},

          fire:
            parsed.sources?.fire ||
            {},

          police:
            parsed.sources?.police ||
            {},
        },

        publishedNews:
          parsed.publishedNews &&
          typeof parsed.publishedNews ===
            'object' &&
          !Array.isArray(
            parsed.publishedNews
          )
            ? parsed.publishedNews
            : {},
      }
    }
  }
  catch (
    error
  ) {
    if (
      error?.code !==
        'ENOENT'
    ) {
      console.warn(
        'LIVE NEWSROOM · STORE READ FAILED:',
        error
      )
    }
  }
}


async function persistStore() {
  store.updatedAt =
    new Date()
      .toISOString()


  writeChain =
    writeChain.then(
      async () => {
        await mkdir(
          dirname(
            STORE_PATH
          ),
          {
            recursive:
              true,
          }
        )


        await writeFile(
          STORE_PATH,
          JSON.stringify(
            store,
            null,
            2
          ),
          'utf8'
        )
      }
    )


  return writeChain
}


// ============================================================
// FINGERPRINT
// ============================================================

function normalizeComparable(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value
      .map(
        normalizeComparable
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
            normalizeComparable(
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
    return cleanText(
      value
    )
  }


  return value ??
    null
}


function sourceSnapshot(
  record
) {
  const snapshot =
    {}


  MEANINGFUL_FIELDS
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


function fingerprint(
  record
) {
  return JSON.stringify(
    normalizeComparable(
      sourceSnapshot(
        record
      )
    )
  )
}


function changedFields(
  previous,
  incoming
) {
  const before =
    sourceSnapshot(
      previous
    )


  const after =
    sourceSnapshot(
      incoming
    )


  return MEANINGFUL_FIELDS
    .filter(
      (
        field
      ) =>
        JSON.stringify(
          normalizeComparable(
            before[
              field
            ]
          )
        ) !==
        JSON.stringify(
          normalizeComparable(
            after[
              field
            ]
          )
        )
    )
}


// ============================================================
// EVENT IDS
// ============================================================

function smallHash(
  value
) {
  let hash =
    2166136261


  const text =
    String(
      value ||
      ''
    )


  for (
    let index =
      0;
    index <
      text.length;
    index++
  ) {
    hash ^=
      text.charCodeAt(
        index
      )


    hash =
      Math.imul(
        hash,
        16777619
      )
  }


  return (
    hash >>> 0
  )
    .toString(
      36
    )
}


function eventId({
  sourceKey,
  action,
  externalId,
  version,
}) {
  return [
    'live-newsroom',
    sourceKey,
    action,
    slugify(
      externalId
    ),
    smallHash(
      version
    ),
  ]
    .join(
      '-'
    )
}


// ============================================================
// QUEUE
// ============================================================

function findPendingEvent({
  sourceKey,
  action,
  externalId,
  version,
}) {
  return store.events.find(
    (
      event
    ) =>
      event.status ===
        'pending' &&
      event.sourceKey ===
        sourceKey &&
      event.newsroomAction ===
        action &&
      event.externalId ===
        externalId &&
      event.sourceFingerprint ===
        version
  )
}


async function addEvent({
  sourceKey,
  action,
  record,
  previousRecord =
    null,
  incomingRecord =
    null,
  changes =
    [],
  resolutionReason =
    '',
}) {
  await ensureLoaded()


  const externalId =
    cleanText(
      record?.externalId
    )


  if (
    !externalId
  ) {
    return null
  }


  const incoming =
    incomingRecord ||
    record


  const version =
    fingerprint(
      incoming
    )


  const duplicate =
    findPendingEvent({
      sourceKey,
      action,
      externalId,
      version,
    })


  if (
    duplicate
  ) {
    return duplicate
  }


  const now =
    new Date()
      .toISOString()


  const event = {
    ...record,

    id:
      eventId({
        sourceKey,
        action,
        externalId,
        version,
      }),

    serverQueueId:
      eventId({
        sourceKey,
        action,
        externalId,
        version,
      }),

    sourceKey,

    newsroomAction:
      action,

    reviewStatus:
      'pending',

    active:
      false,

    status:
      'pending',

    previousRecord,

    incomingRecord:
      incoming,

    changedFields:
      changes,

    resolutionReason,

    sourceSnapshot:
      sourceSnapshot(
        incoming
      ),

    sourceFingerprint:
      version,

    receivedAt:
      record.receivedAt ||
      now,

    queuedAt:
      now,
  }


  store.events.unshift(
    event
  )


  if (
    store.events.length >
      MAX_EVENTS
  ) {
    store.events =
      store.events.slice(
        0,
        MAX_EVENTS
      )
  }


  await persistStore()


  await appendLedgerEvent({
    eventType:
      'newsroom-queued',

    outcome:
      action,

    record:
      event,
  })


  return event
}


// ============================================================
// SOURCE UPSERT
// ============================================================

async function observeRecord({
  sourceKey,
  record,
  forceAction =
    '',
}) {
  await ensureLoaded()


  const externalId =
    cleanText(
      record?.externalId
    )


  if (
    !externalId
  ) {
    return {
      action:
        'skip',
    }
  }


  const now =
    new Date()
      .toISOString()


  const sourceState =
    store.sources[
      sourceKey
    ] ||
    {}


  const existing =
    sourceState[
      externalId
    ] ||
    null


  const currentFingerprint =
    fingerprint(
      record
    )


  const previousFingerprint =
    existing?.sourceFingerprint ||
    ''


  let action =
    forceAction


  if (
    !action
  ) {
    if (
      !existing
    ) {
      action =
        'new'
    }
    else if (
      previousFingerprint !==
        currentFingerprint
    ) {
      action =
        existing.published ===
          true
          ? 'update'
          : 'new'
    }
    else {
      action =
        'seen'
    }
  }


  const firstSeenAt =
    existing?.firstSeenAt ||
    record.firstSeenAt ||
    record.publishedAt ||
    now


  let stableRecord = {
    ...record,

    firstSeenAt,
  }


  // TTC sometimes omits active_period.start. In that case the server's
  // first observation is the timestamp and MUST NOT slide forward every
  // two-minute GTFS poll. If a later payload supplies a real active start,
  // we allow that one-time upgrade.
  if (
    sourceKey ===
      'ttc' &&
    existing
  ) {
    const existingKind =
      existing.ttcSourceTimeKind ||
      ''


    const incomingKind =
      record.ttcSourceTimeKind ||
      ''


    if (
      existingKind ===
        'feed-first-observed' &&
      incomingKind !==
        'active-period-start'
    ) {
      stableRecord = {
        ...stableRecord,

        publishedAt:
          existing.publishedAt ||
          existing.ttcSourceTime ||
          firstSeenAt,

        ttcSourceTime:
          existing.ttcSourceTime ||
          existing.publishedAt ||
          firstSeenAt,

        ttcSourceTimeKind:
          'feed-first-observed',
      }
    }
  }


  const observed = {
    ...existing,
    ...stableRecord,

    externalId,

    firstSeenAt,

    lastSeenAt:
      now,

    lastCheckedAt:
      now,

    sourceUpdatedAt:
      action ===
        'update'
        ? now
        : (
            existing?.sourceUpdatedAt ||
            record.sourceUpdatedAt ||
            firstSeenAt
          ),

    sourceSnapshot:
      sourceSnapshot(
        record
      ),

    sourceFingerprint:
      currentFingerprint,

    missingPolls:
      0,

    published:
      existing?.published ===
        true,

    resolved:
      action ===
        'resolve'
        ? true
        : false,

    expiresAt:
      getNewsExpiresAt({
        ...existing,
        ...stableRecord,
        firstSeenAt,
      }) ||
      existing?.expiresAt ||
      record.expiresAt ||
      '',
  }


  sourceState[
    externalId
  ] =
    observed


  store.sources[
    sourceKey
  ] =
    sourceState


  if (
    action ===
      'new'
  ) {
    await addEvent({
      sourceKey,
      action:
        'new',
      record:
        observed,
      incomingRecord:
        observed,
    })
  }
  else if (
    action ===
      'update'
  ) {
    await addEvent({
      sourceKey,
      action:
        'update',
      record:
        observed,
      previousRecord:
        existing,
      incomingRecord:
        observed,
      changes:
        changedFields(
          existing,
          record
        ),
    })
  }
  else if (
    action ===
      'resolve'
  ) {
    await addEvent({
      sourceKey,
      action:
        'resolve',
      record:
        observed,
      previousRecord:
        existing,
      incomingRecord:
        observed,
      changes:
        changedFields(
          existing ||
          {},
          record
        ),
      resolutionReason:
        record.resolutionReason ||
        'official-source-resolution',
    })
  }
  else {
    await persistStore()
  }


  return {
    action,
    record:
      observed,
  }
}


// ============================================================
// PUBLIC TPS HOOK
// ============================================================
//
// Trusted TPS emails have two different jobs:
//
// 1. A brand-new incident still goes to the NEWSROOM for approval.
// 2. Once that incident has been published, later official TPS
//    releases for the same Case # become source-of-truth updates:
//      - ordinary update -> update the existing public pin
//      - LOCATED        -> archive/remove the existing public pin
//
// The stable externalId generated by tpsWebhook.js is based on the
// TPS Case # / GO number whenever one is available. We also fall back
// to the stored case fields here so older published records still match.
//
// Manual removals/suppressions are never automatically resurrected.
// A naturally shelf-life-expired record may be republished by a fresh
// official TPS update because the update itself is new information.
//
// ============================================================

function hasStoredValue(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return false
  }


  if (
    typeof value ===
      'string'
  ) {
    return Boolean(
      value.trim()
    )
  }


  return true
}


function policeCaseKeys(
  record
) {
  return [
    record?.caseNumber,
    record?.policeCaseNumber,
    record?.incidentNumber,
    record?.goNumber,
  ]
    .map(
      cleanText
    )
    .filter(
      Boolean
    )
}


function findPublishedPoliceRecord(
  record
) {
  const externalId =
    cleanText(
      record?.externalId
    )


  const published =
    Object.values(
      store.publishedNews ||
      {}
    )


  if (
    externalId
  ) {
    const exact =
      published.find(
        (
          item
        ) =>
          cleanText(
            item?.externalId
          ) ===
          externalId
      )


    if (
      exact
    ) {
      return exact
    }
  }


  const incomingCaseKeys =
    new Set(
      policeCaseKeys(
        record
      )
    )


  if (
    incomingCaseKeys.size ===
      0
  ) {
    return null
  }


  return published.find(
    (
      item
    ) =>
      policeCaseKeys(
        item
      )
        .some(
          (
            key
          ) =>
            incomingCaseKeys.has(
              key
            )
        )
  ) ||
    null
}


function publishedRecordAllowsAutomaticOfficialUpdate(
  record
) {
  if (
    !record
  ) {
    return false
  }


  if (
    record.active !==
      false
  ) {
    return true
  }


  return cleanText(
    record.archiveReason
  )
    .toLowerCase() ===
    'expired-shelf-life'
}


function mergeOfficialPoliceUpdate({
  existing,
  incoming,
}) {
  const now =
    new Date()
      .toISOString()


  const merged = {
    ...existing,
    ...incoming,

    id:
      existing?.id ||
      incoming?.id,

    externalId:
      existing?.externalId ||
      incoming?.externalId,

    active:
      true,

    firstPublishedAt:
      existing?.firstPublishedAt ||
      existing?.publishedAt ||
      incoming?.firstPublishedAt ||
      incoming?.publishedAt ||
      now,

    approvedAt:
      existing?.approvedAt ||
      incoming?.approvedAt ||
      now,

    serverPublishedAt:
      existing?.serverPublishedAt ||
      incoming?.serverPublishedAt ||
      now,

    // An update does not restart the original citywide shelf-life clock.
    expiresAt:
      existing?.expiresAt ||
      incoming?.expiresAt ||
      '',

    automaticOfficialUpdate:
      true,

    automaticOfficialUpdateAt:
      now,
  }


  // TPS webhook records deliberately arrive without map coordinates.
  // Never wipe the editor/geocoder's already-approved pin placement
  // when a later official release updates the story text.
  const placementFields = [
    'longitude',
    'latitude',
    'searchedLongitude',
    'searchedLatitude',
    'pinPositionMode',
    'manualLongitude',
    'manualLatitude',
  ]


  placementFields.forEach(
    (
      field
    ) => {
      if (
        hasStoredValue(
          existing?.[
            field
          ]
        )
      ) {
        merged[
          field
        ] =
          existing[
            field
          ]
      }
    }
  )


  // Keep previously approved imagery unless the new source release
  // actually supplies a replacement.
  ;[
    'imageUrl',
    'photoUrl',
    'thumbnailUrl',
  ]
    .forEach(
      (
        field
      ) => {
        if (
          !hasStoredValue(
            incoming?.[
              field
            ]
          ) &&
          hasStoredValue(
            existing?.[
              field
            ]
          )
        ) {
          merged[
            field
          ] =
            existing[
              field
            ]
        }
      }
    )


  return merged
}


async function acknowledgeAutomaticSourceEvents({
  sourceKey,
  externalId,
  actions,
  outcome,
}) {
  const now =
    new Date()
      .toISOString()


  const actionSet =
    new Set(
      actions
    )


  const acknowledged =
    []


  store.events =
    store.events.map(
      (
        event
      ) => {
        if (
          event.status !==
            'pending' ||
          event.sourceKey !==
            sourceKey ||
          event.externalId !==
            externalId ||
          !actionSet.has(
            event.newsroomAction
          )
        ) {
          return event
        }


        const next = {
          ...event,

          status:
            'acked',

          reviewStatus:
            'acked',

          outcome,

          ackedAt:
            now,

          automaticOfficialAction:
            true,
        }


        acknowledged.push(
          next
        )


        return next
      }
    )


  if (
    acknowledged.length ===
      0
  ) {
    return 0
  }


  await persistStore()


  for (
    const event
    of acknowledged
  ) {
    await appendLedgerEvent({
      eventType:
        'automatic-official-action',

      outcome,

      record:
        event,
    })
  }


  return acknowledged.length
}


export async function queueLiveNewsroomRecord({
  sourceKey =
    'police',
  record,
  action =
    '',
}) {
  await ensureLoaded()


  const rawAction =
    cleanText(
      action ||
      record?.newsroomAction ||
      ''
    )
      .toLowerCase()


  const isResolve =
    rawAction ===
      'resolve' ||
    record?.category ===
      'located'


  const isPolice =
    sourceKey ===
      'police'


  const publishedMatch =
    isPolice
      ? findPublishedPoliceRecord(
          record
        )
      : null


  const automaticUpdateAllowed =
    publishedRecordAllowsAutomaticOfficialUpdate(
      publishedMatch
    )


  const sourceExternalId =
    cleanText(
      record?.externalId
    )


  const existingSourceRecord =
    sourceExternalId
      ? (
          store.sources?.[
            sourceKey
          ]?.[
            sourceExternalId
          ] ||
          null
        )
      : null


  let requestedAction =
    isResolve
      ? 'resolve'
      : ''


  // Older published records may predate the persistent source-state
  // "published" flag. If the canonical public store proves this case
  // is already published, force this delivery down the UPDATE path.
  if (
    isPolice &&
    publishedMatch &&
    automaticUpdateAllowed &&
    !isResolve &&
    (
      !existingSourceRecord ||
      existingSourceRecord.published !==
        true
    )
  ) {
    requestedAction =
      'update'
  }


  const observed =
    await observeRecord({
      sourceKey,
      record,
      forceAction:
        requestedAction,
    })


  // Brand-new TPS incidents still require editorial approval.
  if (
    !isPolice ||
    !publishedMatch ||
    !automaticUpdateAllowed
  ) {
    return observed
  }


  const externalId =
    cleanText(
      observed?.record?.externalId ||
      record?.externalId
    )


  if (
    isResolve
  ) {
    const archived =
      await archivePublishedNewsRecord({
        id:
          publishedMatch.id ||
          '',

        externalId:
          publishedMatch.externalId ||
          externalId,

        record: {
          ...publishedMatch,
          ...observed.record,

          // Keep the existing approved map position in archive.
          longitude:
            publishedMatch.longitude,

          latitude:
            publishedMatch.latitude,

          searchedLongitude:
            publishedMatch.searchedLongitude,

          searchedLatitude:
            publishedMatch.searchedLatitude,

          pinPositionMode:
            publishedMatch.pinPositionMode,

          active:
            false,

          resolved:
            true,

          resolvedAt:
            observed.record?.resolvedAt ||
            new Date()
              .toISOString(),

          resolutionReason:
            'official-tps-resolution',
        },

        reason:
          'official-tps-resolution',
      })


    const sourceState =
      store.sources[
        sourceKey
      ] ||
      {}


    if (
      externalId &&
      sourceState[
        externalId
      ]
    ) {
      sourceState[
        externalId
      ] = {
        ...sourceState[
          externalId
        ],

        published:
          true,

        active:
          false,

        resolved:
          true,

        resolvedAt:
          archived?.resolvedAt ||
          new Date()
            .toISOString(),

        resolutionReason:
          'official-tps-resolution',
      }


      store.sources[
        sourceKey
      ] =
        sourceState


      await persistStore()
    }


    await acknowledgeAutomaticSourceEvents({
      sourceKey,

      externalId,

      actions: [
        'resolve',
        'update',
        'new',
      ],

      outcome:
        'auto-resolved-official-tps',
    })


    return {
      ...observed,

      autoApplied:
        true,

      autoAction:
        'resolve',

      publishedRecord:
        archived,
    }
  }


  if (
    observed.action !==
      'update' &&
    observed.action !==
      'new'
  ) {
    return observed
  }


  const merged =
    mergeOfficialPoliceUpdate({
      existing:
        publishedMatch,

      incoming:
        observed.record,
    })


  const updated =
    await upsertPublishedNewsRecord({
      record:
        merged,
    })


  const sourceState =
    store.sources[
      sourceKey
    ] ||
    {}


  if (
    externalId &&
    sourceState[
      externalId
    ]
  ) {
    sourceState[
      externalId
    ] = {
      ...sourceState[
        externalId
      ],

      published:
        true,

      active:
        true,

      resolved:
        false,

      lastAutomaticOfficialUpdateAt:
        new Date()
          .toISOString(),
    }


    store.sources[
      sourceKey
    ] =
      sourceState


    await persistStore()
  }


  await acknowledgeAutomaticSourceEvents({
    sourceKey,

    externalId,

    actions: [
      'update',
      'new',
    ],

    outcome:
      'auto-updated-official-tps',
  })


  return {
    ...observed,

    autoApplied:
      true,

    autoAction:
      'update',

    publishedRecord:
      updated,
  }
}


// ============================================================
// TTC NORMALIZATION
// ============================================================

function inferTtcEffect(
  record
) {
  const feedEffect =
    cleanText(
      record?.effect
    )
      .toUpperCase()


  if (
    feedEffect &&
    ![
      'UNKNOWN_EFFECT',
      'NO_EFFECT',
    ]
      .includes(
        feedEffect
      )
  ) {
    return feedEffect
  }


  const text =
    (
      cleanText(
        record?.headerText
      ) +
      ' ' +
      cleanText(
        record?.descriptionText
      )
    )
      .toLowerCase()


  if (
    /\bno service\b/.test(
      text
    )
  ) {
    return 'NO_SERVICE'
  }


  if (
    /\bdetour\b/.test(
      text
    )
  ) {
    return 'DETOUR'
  }


  if (
    /\bbypass\b/.test(
      text
    ) ||
    /\bnot stopping\b/.test(
      text
    )
  ) {
    return 'BYPASS'
  }


  if (
    /\bdelay\b/.test(
      text
    ) ||
    /\bdelays\b/.test(
      text
    )
  ) {
    return 'SIGNIFICANT_DELAYS'
  }


  if (
    /\bstop moved\b/.test(
      text
    ) ||
    /\btemporary stop\b/.test(
      text
    )
  ) {
    return 'STOP_MOVED'
  }


  if (
    /\breduced service\b/.test(
      text
    )
  ) {
    return 'REDUCED_SERVICE'
  }


  if (
    /\bservice change\b/.test(
      text
    ) ||
    /\bshort turn\b/.test(
      text
    )
  ) {
    return 'MODIFIED_SERVICE'
  }


  return ''
}


function usefulTtcRecord(
  record
) {
  const text =
    (
      cleanText(
        record?.headerText
      ) +
      ' ' +
      cleanText(
        record?.descriptionText
      )
    )
      .toLowerCase()


  if (
    /\belevator\b/.test(
      text
    ) ||
    /\bescalator\b/.test(
      text
    ) ||
    /\bproof of payment\b/.test(
      text
    ) ||
    /\blook both ways\b/.test(
      text
    )
  ) {
    return false
  }


  return Boolean(
    inferTtcEffect(
      record
    )
  )
}


function ttcRoutes(
  record
) {
  const routes =
    []


  const entities =
    Array.isArray(
      record?.informedEntities
    )
      ? record.informedEntities
      : []


  entities.forEach(
    (
      entity
    ) => {
      [
        entity?.routeId,
        entity?.trip?.routeId,
      ]
        .forEach(
          (
            value
          ) => {
            const route =
              cleanText(
                value
              )


            if (
              route &&
              !routes.includes(
                route
              )
            ) {
              routes.push(
                route
              )
            }
          }
        )
    }
  )


  return routes
}


function cleanLocationPiece(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /^[,;:\-–—\s]+/,
      ''
    )
    .replace(
      /[,;:\-–—\s]+$/,
      ''
    )
    .replace(
      /\s+(?:due to|while we|because of|for the duration).*$/i,
      ''
    )
    .trim()
}


function ttcLocation(
  record
) {
  const text =
    (
      cleanText(
        record?.descriptionText
      ) +
      ' ' +
      cleanText(
        record?.headerText
      )
    )
      .trim()


  const near =
    text.match(
      /\bnear\s+(.{3,90}?)(?:\s+at\s+bus bay\b|\s+while\b|\s+due to\b|[.;]|$)/i
    )


  if (
    near
  ) {
    return cleanLocationPiece(
      near[1]
    )
  }


  const between =
    text.match(
      /\bbetween\s+(.{2,100}?)\s+and\s+(.{2,100}?)(?:\s+due to\b|\s+while\b|[.;]|$)/i
    )


  if (
    between
  ) {
    return cleanLocationPiece(
      between[1]
    )
  }


  const via =
    text.match(
      /\bvia\s+(.{3,150}?)(?:\s+due to\b|\s+while\b|[.;]|$)/i
    )


  if (
    via
  ) {
    const pieces =
      cleanLocationPiece(
        via[1]
      )
        .split(
          /\s*,\s*|\s+and\s+/i
        )
        .map(
          cleanLocationPiece
        )
        .filter(
          Boolean
        )


    if (
      pieces.length >=
        2
    ) {
      return (
        pieces[0] +
        ' & ' +
        pieces[1]
      )
    }


    return (
      pieces[0] ||
      ''
    )
  }


  const street =
    text.match(
      /\b([A-Za-z0-9.'’ -]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\s+(?:at|&|and)\s+([A-Za-z0-9.'’ -]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\b/i
    )


  if (
    street
  ) {
    return (
      cleanLocationPiece(
        street[1]
      ) +
      ' & ' +
      cleanLocationPiece(
        street[2]
      )
    )
  }


  const station =
    text.match(
      /\b([A-Za-z0-9.'’ -]{2,55}\s+Station)\b/i
    )


  return station
    ? cleanLocationPiece(
        station[1]
      )
    : ''
}


function ttcEffectLabel(
  effect
) {
  const labels = {
    NO_SERVICE:
      'No service',

    REDUCED_SERVICE:
      'Reduced service',

    SIGNIFICANT_DELAYS:
      'Delay',

    DETOUR:
      'Detour',

    BYPASS:
      'Bypass',

    STOP_MOVED:
      'Stop moved',

    MODIFIED_SERVICE:
      'Service change',
  }


  return (
    labels[
      effect
    ] ||
    'Service alert'
  )
}


function ttcSourceTime(
  record,
  payload
) {
  const starts =
    (
      Array.isArray(
        record?.activePeriods
      )
        ? record.activePeriods
        : []
    )
      .map(
        (
          period
        ) =>
          Number(
            period?.start
          )
      )
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            value
          ) &&
          value >
            0
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )


  if (
    starts.length >
      0
  ) {
    return {
      value:
        new Date(
          starts[0] *
          1000
        )
          .toISOString(),

      kind:
        'active-period-start',
    }
  }


  const feedTimestamp =
    Number(
      payload?.feedTimestamp
    )


  if (
    Number.isFinite(
      feedTimestamp
    ) &&
    feedTimestamp >
      0
  ) {
    return {
      value:
        new Date(
          feedTimestamp *
          1000
        )
          .toISOString(),

      kind:
        'feed-first-observed',
    }
  }


  return {
    value:
      payload?.updatedAt ||
      new Date()
        .toISOString(),

    kind:
      'feed-first-observed',
  }
}


function normalizeTtcRecord(
  raw,
  payload
) {
  if (
    !usefulTtcRecord(
      raw
    )
  ) {
    return null
  }


  const location =
    ttcLocation(
      raw
    )


  if (
    !location
  ) {
    return null
  }


  const routes =
    ttcRoutes(
      raw
    )


  const effect =
    inferTtcEffect(
      raw
    )


  const sourceTime =
    ttcSourceTime(
      raw,
      payload
    )


  const routeLabel =
    routes.length >
      0
      ? routes.join(
          ', '
        )
      : 'TTC'


  const title =
    (
      routeLabel +
      ' · ' +
      ttcEffectLabel(
        effect
      ) +
      ' · ' +
      location
    )


  return {
    externalId:
      'ttc-alert-' +
      slugify(
        raw?.id ||
        [
          routeLabel,
          effect,
          location,
          raw?.headerText,
        ]
          .join(
            '-'
          )
      ),

    scraperSource:
      'ttc-gtfs-rt-alerts',

    origin:
      'ttc-gtfs-rt',

    newsroomSource:
      'ttc-gtfs-rt',

    city:
      'toronto',

    type:
      'news',

    category:
      'ttc',

    title,

    description:
      cleanText(
        raw?.descriptionText ||
        raw?.headerText
      ),

    location,

    intersection:
      location,

    longitude:
      null,

    latitude:
      null,

    pinPositionMode:
      'auto',

    searchedLongitude:
      null,

    searchedLatitude:
      null,

    source:
      'Toronto Transit Commission',

    sourceUrl:
      cleanText(
        raw?.url
      ) ||
      TTC_PUBLIC_URL,

    officialSource:
      true,

    publishedAt:
      sourceTime.value,

    ttcSourceTime:
      sourceTime.value,

    ttcSourceTimeKind:
      sourceTime.kind,

    newsShelfLife:
      'feed-controlled',

    active:
      true,

    ttcEffect:
      effect,

    ttcCause:
      cleanText(
        raw?.cause
      ),

    ttcRoutes:
      routes,
  }
}


// ============================================================
// FIRE NORMALIZATION
// ============================================================

function decodeXmlText(
  value
) {
  return cleanText(
    String(
      value ??
      ''
    )
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        '$1'
      )
      .replace(
        /&nbsp;/gi,
        ' '
      )
      .replace(
        /&amp;/gi,
        '&'
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /&apos;/gi,
        "'"
      )
      .replace(
        /&lt;/gi,
        '<'
      )
      .replace(
        /&gt;/gi,
        '>'
      )
  )
}


function fireXmlTag(
  block,
  tag
) {
  const match =
    String(
      block ??
      ''
    )
      .match(
        new RegExp(
          `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
          'i'
        )
      )


  return decodeXmlText(
    match?.[1] ||
    ''
  )
}


function parseFireRows(
  xml
) {
  const rows =
    []


  const eventPattern =
    /<event\b[^>]*>([\s\S]*?)<\/event>/gi


  let eventMatch


  while (
    (
      eventMatch =
        eventPattern.exec(
          String(
            xml ??
            ''
          )
        )
    )
  ) {
    const block =
      eventMatch[1]


    rows.push([
      fireXmlTag(
        block,
        'prime_street'
      ),

      fireXmlTag(
        block,
        'cross_streets'
      ),

      fireXmlTag(
        block,
        'dispatch_time'
      ),

      fireXmlTag(
        block,
        'event_num'
      ),

      fireXmlTag(
        block,
        'event_type'
      ),

      fireXmlTag(
        block,
        'alarm_lev'
      ),

      fireXmlTag(
        block,
        'beat'
      ),

      fireXmlTag(
        block,
        'units_disp'
      ),
    ])
  }


  return rows
}


function parseTorontoFireTime(
  value
) {
  const clean =
    cleanText(
      value
    )


  if (
    !clean
  ) {
    return new Date()
      .toISOString()
  }


  const direct =
    new Date(
      clean
    )


  if (
    !Number.isNaN(
      direct.getTime()
    )
  ) {
    return direct
      .toISOString()
  }


  // Common Toronto Fire display: YYYY-MM-DD HH:mm:ss
  const match =
    clean.match(
      /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
    )


  if (
    match
  ) {
    const isoLike =
      (
        `${match[1]}-${match[2]}-${match[3]}T` +
        `${match[4].padStart(2, '0')}:${match[5]}:${match[6] || '00'}`
      )


    const parsed =
      new Date(
        isoLike
      )


    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed
        .toISOString()
    }
  }


  return new Date()
    .toISOString()
}


function normalizeFireLocationPiece(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /\s*,\s*(?:NY|EY|SC|ET|YK|TO|TT)\b/gi,
      ''
    )
    .replace(
      /^\/+|\/+$/g,
      ''
    )
    .replace(
      /\s*\/\s*/g,
      ' / '
    )
    .trim()
}


function fireLocationPieceIsCadNoise(
  value
) {
  const piece =
    normalizeFireLocationPiece(
      value
    )


  if (
    !piece
  ) {
    return true
  }


  if (
    /^(?:TT|NY|EY|SC|ET|YK|TO|TTC)$/i.test(
      piece
    )
  ) {
    return true
  }


  // Toronto Fire cross-street data sometimes includes CAD routing
  // notes rather than a street name, for example:
  //   LN W PETER S ADELAIDE
  // These should never become part of the public intersection label.
  if (
    /^(?:LN\s+[NSEW]\b|[NSEW]\s+OF\b|NB\b|SB\b|EB\b|WB\b)/i.test(
      piece
    )
  ) {
    return true
  }


  return false
}


function getFireCrossStreetCandidates(
  value
) {
  const normalized =
    normalizeFireLocationPiece(
      value
    )


  if (
    !normalized
  ) {
    return []
  }


  const candidates =
    normalized
      .split(
        /\s*\/\s*|\s*&\s*/
      )
      .map(
        normalizeFireLocationPiece
      )
      .filter(
        (piece) =>
          !fireLocationPieceIsCadNoise(
            piece
          )
      )


  return candidates.filter(
    (piece, index) =>
      candidates.findIndex(
        (candidate) =>
          candidate.toLowerCase() ===
          piece.toLowerCase()
      ) ===
      index
  )
}


function fireIncidentShouldBeReviewed({
  incidentType,
  alarmLevel,
}) {
  const type =
    cleanText(
      incidentType
    )
      .toLowerCase()


  const alarm =
    Number(
      cleanText(
        alarmLevel
      )
    )


  if (
    Number.isFinite(
      alarm
    ) &&
    alarm >=
      1
  ) {
    return true
  }


  const blockedPatterns = [
    /^medical\b/i,
    /^alarm single source\b/i,
    /^check call\b/i,
    /^rescue - elevator\b/i,
    /^water problem\b/i,
    /^public assist\b/i,
    /^assist - /i,
    /^alarm - /i,
  ]


  if (
    blockedPatterns.some(
      (
        pattern
      ) =>
        pattern.test(
          type
        )
    )
  ) {
    return false
  }


  const reviewPatterns = [
    /\bfire\b/i,
    /\bsmoke\b/i,
    /\bexplosion\b/i,
    /\bhazmat\b/i,
    /\bhazardous\b/i,
    /\bvehicle accident\b/i,
    /\btrapped\b/i,
    /\bextrication\b/i,
    /\bwater rescue\b/i,
    /\bmarine rescue\b/i,
    /\btechnical rescue\b/i,
    /\bconfined space\b/i,
    /\btrench\b/i,
    /\bhigh angle\b/i,
    /\bstructural collapse\b/i,
    /\bgas leak\b/i,
    /\bcarbon monoxide\b/i,
    /\bchemical\b/i,
  ]


  return reviewPatterns.some(
    (
      pattern
    ) =>
      pattern.test(
        type
      )
  )
}


function normalizeFireRow(
  cells
) {
  const primeStreet =
    normalizeFireLocationPiece(
      cells[0]
    )


  const crossStreetSource =
    normalizeFireLocationPiece(
      cells[1]
    )


  const crossStreetCandidates =
    getFireCrossStreetCandidates(
      crossStreetSource
    )


  const crossStreet =
    crossStreetCandidates.find(
      (candidate) =>
        candidate.toLowerCase() !==
        primeStreet.toLowerCase()
    ) ||
    ''


  const dispatchTime =
    cleanText(
      cells[2]
    )


  const incidentNumber =
    cleanText(
      cells[3]
    )


  const incidentType =
    cleanText(
      cells[4]
    )


  const alarmLevel =
    cleanText(
      cells[5]
    )


  const area =
    cleanText(
      cells[6]
    )


  const dispatchedUnits =
    cleanText(
      cells[7]
    )


  if (
    !fireIncidentShouldBeReviewed({
      incidentType,
      alarmLevel,
    })
  ) {
    return null
  }


  if (
    !primeStreet &&
    crossStreetCandidates.length ===
      0
  ) {
    return null
  }


  let location =
    ''


  if (
    primeStreet &&
    crossStreet
  ) {
    location =
      (
        primeStreet +
        ' & ' +
        crossStreet
      )
  }
  else if (
    primeStreet
  ) {
    location =
      primeStreet
  }
  else if (
    crossStreetCandidates.length >=
      2
  ) {
    location =
      (
        crossStreetCandidates[0] +
        ' & ' +
        crossStreetCandidates[1]
      )
  }
  else {
    location =
      crossStreetCandidates[0] ||
      ''
  }


  const dispatchTimeMatch =
    dispatchTime.match(
      /(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/
    )


  let dispatchTimeLabel =
    ''


  if (
    dispatchTimeMatch
  ) {
    const hour24 =
      Number(
        dispatchTimeMatch[1]
      )


    if (
      Number.isFinite(
        hour24
      ) &&
      hour24 >=
        0 &&
      hour24 <=
        23
    ) {
      const hour12 =
        hour24 %
          12 ||
        12


      const suffix =
        hour24 >=
          12
          ? 'p.m.'
          : 'a.m.'


      dispatchTimeLabel =
        (
          hour12 +
          ':' +
          dispatchTimeMatch[2] +
          ' ' +
          suffix
        )
    }
  }


  const publicDescription =
    dispatchTimeLabel
      ? (
          'Toronto Fire crews were dispatched to this call at ' +
          dispatchTimeLabel +
          '.'
        )
      : 'Toronto Fire crews were dispatched to this call.'


  const publishedAt =
    parseTorontoFireTime(
      dispatchTime
    )


  return {
    externalId:
      'toronto-fire-' +
      slugify(
        incidentNumber ||
        [
          primeStreet,
          crossStreetSource,
          dispatchTime,
          incidentType,
        ]
          .join(
            '-'
          )
      ),

    scraperSource:
      'toronto-fire-active-incidents',

    origin:
      'toronto-fire-active-incidents',

    newsroomSource:
      'toronto-fire-active-incidents',

    city:
      'toronto',

    type:
      'news',

    category:
      'fire',

    title:
      (
        (
          incidentType ||
          'Toronto Fire incident'
        ) +
        ' · ' +
        location
      ),

    description:
      publicDescription,

    location,

    intersection:
      location,

    longitude:
      null,

    latitude:
      null,

    pinPositionMode:
      'auto',

    searchedLongitude:
      null,

    searchedLatitude:
      null,

    source:
      'Toronto Fire Services',

    sourceUrl:
      FIRE_PUBLIC_URL,

    officialSource:
      true,

    publishedAt,

    active:
      true,

    alarmLevel,

    area,

    dispatchedUnits,

    incidentNumber,
  }
}



// ============================================================
// POLL SOURCES
// ============================================================

async function resolveMissing({
  sourceKey,
  seenIds,
  resolvePublishedMissing =
    true,
}) {
  await ensureLoaded()


  const sourceState =
    store.sources[
      sourceKey
    ] ||
    {}


  for (
    const [
      externalId,
      existing,
    ]
    of Object.entries(
      sourceState
    )
  ) {
    if (
      existing.resolved ||
      seenIds.has(
        externalId
      )
    ) {
      continue
    }


    const missingPolls =
      Number(
        existing.missingPolls ||
        0
      ) +
      1


    sourceState[
      externalId
    ] = {
      ...existing,

      missingPolls,

      lastCheckedAt:
        new Date()
          .toISOString(),
    }


    if (
      missingPolls <
        MISSING_POLLS_TO_RESOLVE
    ) {
      continue
    }


    if (
      existing.published !==
        true
    ) {
      const now =
        new Date()
          .toISOString()


      sourceState[
        externalId
      ] = {
        ...existing,

        missingPolls,

        active:
          false,

        published:
          false,

        resolved:
          true,

        resolvedAt:
          now,

        resolutionReason:
          'missing-before-publication',
      }


      // Remove stale NEW / UPDATE cards that were never published.
      store.events =
        store.events.map(
          (
            event
          ) =>
            event.status ===
              'pending' &&
            event.sourceKey ===
              sourceKey &&
            event.externalId ===
              externalId
              ? {
                  ...event,

                  status:
                    'acked',

                  outcome:
                    'expired-before-review',

                  ackedAt:
                    now,
                }
              : event
        )


      continue
    }


    // TTC should resolve when an alert disappears from the official
    // feed. Fire is different: live CAD only describes incidents that
    // are currently active. Once a published Fire incident leaves CAD,
    // the public story keeps running until its NEWS shelf life expires.
    if (
      resolvePublishedMissing !==
        true
    ) {
      continue
    }


    const resolvedRecord = {
      ...existing,

      active:
        false,

      resolved:
        true,

      resolvedAt:
        new Date()
          .toISOString(),

      resolutionReason:
        'missing-from-live-feed',
    }


    sourceState[
      externalId
    ] =
      resolvedRecord


    // TTC is feed-controlled. Once an alert is absent for the required
    // consecutive polls, the official feed has resolved it. Archive the
    // public pin immediately instead of waiting for an editor to approve
    // a separate RESOLVE card.
    if (
      sourceKey ===
        'ttc'
    ) {
      await archivePublishedNewsRecord({
        externalId,

        record:
          resolvedRecord,

        reason:
          'missing-from-live-feed',
      })


      // Any still-pending TTC newsroom cards for an alert that no longer
      // exists are stale. Close them automatically with the source resolve.
      store.events =
        store.events.map(
          (
            event
          ) =>
            event.status ===
              'pending' &&
            event.sourceKey ===
              'ttc' &&
            event.externalId ===
              externalId
              ? {
                  ...event,

                  status:
                    'acked',

                  outcome:
                    'source-resolved',

                  ackedAt:
                    resolvedRecord.resolvedAt,
                }
              : event
        )


      continue
    }


    await addEvent({
      sourceKey,
      action:
        'resolve',
      record:
        resolvedRecord,
      previousRecord:
        existing,
      incomingRecord:
        resolvedRecord,
      resolutionReason:
        'missing-from-live-feed',
    })
  }


  store.sources[
    sourceKey
  ] =
    sourceState


  await persistStore()
}


async function syncTtc() {
  const payload =
    await getTtcAlertsSnapshot()


  const records =
    (
      Array.isArray(
        payload?.records
      )
        ? payload.records
        : []
    )
      .map(
        (
          raw
        ) =>
          normalizeTtcRecord(
            raw,
            payload
          )
      )
      .filter(
        Boolean
      )
      .filter(
        newsRecordIsCurrent
      )


  const seenIds =
    new Set()


  const counts = {
    found:
      records.length,

    new:
      0,

    update:
      0,

    seen:
      0,

    resolve:
      0,
  }


  for (
    const record
    of records
  ) {
    seenIds.add(
      record.externalId
    )


    const result =
      await observeRecord({
        sourceKey:
          'ttc',

        record,
      })


    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        result.action
      )
    ) {
      counts[
        result.action
      ]++
    }
  }


  const beforeResolveEvents =
    store.events.filter(
      (
        event
      ) =>
        event.sourceKey ===
          'ttc' &&
        event.newsroomAction ===
          'resolve' &&
        event.status ===
          'pending'
    )
      .length


  await resolveMissing({
    sourceKey:
      'ttc',

    seenIds,
  })


  const afterResolveEvents =
    store.events.filter(
      (
        event
      ) =>
        event.sourceKey ===
          'ttc' &&
        event.newsroomAction ===
          'resolve' &&
        event.status ===
          'pending'
    )
      .length


  counts.resolve =
    Math.max(
      0,
      afterResolveEvents -
      beforeResolveEvents
    )


  return counts
}


async function fetchFireSnapshot() {
  const response =
    await fetch(
      FIRE_UPSTREAM,
      {
        headers: {
          Accept:
            'application/xml,text/xml,*/*',

          'User-Agent':
            'ELPPA-Geographic/1.0',
        },

        cache:
          'no-store',
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TORONTO FIRE REQUEST FAILED · ' +
        response.status
      )
    )
  }


  const xml =
    await response.text()


  const records =
    parseFireRows(
      xml
    )
      .map(
        normalizeFireRow
      )
      .filter(
        Boolean
      )


  console.log(
    'TORONTO FIRE · LIVE CAD:',
    {
      status:
        response.status,

      bytes:
        Buffer.byteLength(
          xml,
          'utf8'
        ),

      events:
        records.length,
    }
  )


  return records
}


async function syncFire() {
  const records =
    await fetchFireSnapshot()


  const seenIds =
    new Set()


  const counts = {
    found:
      records.length,

    new:
      0,

    update:
      0,

    seen:
      0,

    resolve:
      0,
  }


  for (
    const record
    of records
  ) {
    seenIds.add(
      record.externalId
    )


    const result =
      await observeRecord({
        sourceKey:
          'fire',

        record,
      })


    if (
      Object.prototype.hasOwnProperty.call(
        counts,
        result.action
      )
    ) {
      counts[
        result.action
      ]++
    }
  }


  const beforeResolveEvents =
    store.events.filter(
      (
        event
      ) =>
        event.sourceKey ===
          'fire' &&
        event.newsroomAction ===
          'resolve' &&
        event.status ===
          'pending'
    )
      .length


  await resolveMissing({
    sourceKey:
      'fire',

    seenIds,

    resolvePublishedMissing:
      false,
  })


  const afterResolveEvents =
    store.events.filter(
      (
        event
      ) =>
        event.sourceKey ===
          'fire' &&
        event.newsroomAction ===
          'resolve' &&
        event.status ===
          'pending'
    )
      .length


  counts.resolve =
    Math.max(
      0,
      afterResolveEvents -
      beforeResolveEvents
    )


  return counts
}


export async function syncTorontoLiveNewsroom() {
  await ensureLoaded()


  if (
    syncRunning
  ) {
    return {
      ok:
        true,

      running:
        true,
    }
  }


  syncRunning =
    true


  const startedAt =
    new Date()
      .toISOString()


  try {
    const [
      ttc,
      fire,
    ] =
      await Promise.allSettled([
        syncTtc(),
        syncFire(),
      ])


    const result = {
      ok:
        true,

      startedAt,

      finishedAt:
        new Date()
          .toISOString(),

      ttc:
        ttc.status ===
          'fulfilled'
          ? ttc.value
          : {
              error:
                String(
                  ttc.reason?.message ||
                  ttc.reason
                ),

              name:
                String(
                  ttc.reason?.name ||
                  ''
                ),

              code:
                String(
                  ttc.reason?.code ||
                  ttc.reason?.cause?.code ||
                  ''
                ),

              cause:
                String(
                  ttc.reason?.cause?.message ||
                  ttc.reason?.cause ||
                  ''
                ),
            },

      fire:
        fire.status ===
          'fulfilled'
          ? fire.value
          : {
              error:
                String(
                  fire.reason?.message ||
                  fire.reason
                ),

              name:
                String(
                  fire.reason?.name ||
                  ''
                ),

              code:
                String(
                  fire.reason?.code ||
                  fire.reason?.cause?.code ||
                  ''
                ),

              cause:
                String(
                  fire.reason?.cause?.message ||
                  fire.reason?.cause ||
                  ''
                ),
            },
    }


    console.log(
      'LIVE NEWSROOM · BACKGROUND SYNC:',
      result
    )


    return result
  }
  finally {
    syncRunning =
      false
  }
}


// ============================================================
// PUBLISHED NEWS + ARCHIVE
// ============================================================
//
// This is the canonical server-owned public NEWS dataset.
//
// A published pin is never physically deleted:
//
//   active: true   → live public NEWS layer
//   active: false  → archive
//
// The full record, including imageUrl, coordinates, source data,
// timestamps, and editorial metadata, remains in /data.
//
// ============================================================

function publishedNewsIdentity(
  record
) {
  const externalId =
    cleanText(
      record?.externalId
    )


  if (
    externalId
  ) {
    return (
      'external:' +
      externalId
    )
  }


  const id =
    cleanText(
      record?.id
    )


  if (
    id
  ) {
    return (
      'id:' +
      id
    )
  }


  const fallback =
    [
      record?.city ||
        'toronto',
      record?.title ||
        '',
      record?.intersection ||
        record?.location ||
        '',
      record?.publishedAt ||
        record?.createdAt ||
        '',
    ]
      .map(
        cleanText
      )
      .join(
        '|'
      )


  if (
    !fallback.replace(
      /\|/g,
      ''
    )
  ) {
    return ''
  }


  return (
    'fallback:' +
    smallHash(
      fallback
    )
  )
}


function stripPublishedWorkflowFields(
  record
) {
  const next = {
    ...record,
  }


  delete next.reviewStatus
  delete next.newsroomAction
  delete next.serverAction
  delete next.action
  delete next.previousRecord
  delete next.incomingRecord
  delete next.changedFields
  delete next.targetId
  delete next.targetExternalId
  delete next.missingPolls
  delete next.status


  return next
}


function normalizePublishedNewsRecord({
  record,
  existing =
    null,
  active =
    null,
  archiveReason =
    '',
}) {
  const now =
    new Date()
      .toISOString()


  const cleaned =
    stripPublishedWorkflowFields(
      record ||
      {}
    )


  const identity =
    publishedNewsIdentity(
      {
        ...existing,
        ...cleaned,
      }
    )


  if (
    !identity
  ) {
    throw new Error(
      'Published NEWS record requires an id, externalId, or usable identity fields.'
    )
  }


  const isActive =
    active ===
      null
      ? cleaned.active !==
          false
      : Boolean(
          active
        )


  const firstPublishedAt =
    existing?.firstPublishedAt ||
    cleaned.firstPublishedAt ||
    cleaned.publishedAt ||
    existing?.publishedAt ||
    now


  const id =
    cleanText(
      existing?.id ||
      cleaned.id
    ) ||
    (
      'server-news-' +
      smallHash(
        identity
      )
    )


  const normalized = {
    ...existing,
    ...cleaned,

    id,

    city:
      cleanText(
        cleaned.city ||
        existing?.city
      ) ||
      'toronto',

    type:
      'news',

    active:
      isActive,

    firstPublishedAt,

    approvedAt:
      existing?.approvedAt ||
      cleaned.approvedAt ||
      now,

    serverPublishedAt:
      existing?.serverPublishedAt ||
      now,

    serverUpdatedAt:
      now,

    updatedAt:
      cleaned.updatedAt ||
      now,

    archivedAt:
      isActive
        ? ''
        : (
            existing?.archivedAt ||
            cleaned.archivedAt ||
            cleaned.manuallyUnpublishedAt ||
            cleaned.resolvedAt ||
            now
          ),

    archiveReason:
      isActive
        ? ''
        : (
            cleanText(
              archiveReason ||
              cleaned.archiveReason ||
              cleaned.resolutionReason
            ) ||
            'removed-from-live-map'
          ),

    republishedAt:
      isActive &&
      existing?.active ===
        false
        ? now
        : (
            cleaned.republishedAt ||
            cleaned.manuallyRepublishedAt ||
            existing?.republishedAt ||
            ''
          ),
  }


  return {
    identity,
    record:
      normalized,
  }
}


async function upsertPublishedNewsRecord({
  record,
  archiveReason =
    '',
}) {
  await ensureLoaded()


  const identity =
    publishedNewsIdentity(
      record
    )


  const existing =
    identity
      ? (
          store.publishedNews[
            identity
          ] ||
          null
        )
      : null


  const normalized =
    normalizePublishedNewsRecord({
      record,
      existing,

      active:
        record?.active ===
          false
          ? false
          : true,

      archiveReason,
    })


  const previous =
    store.publishedNews[
      normalized.identity
    ] ||
    null


  store.publishedNews[
    normalized.identity
  ] =
    normalized.record


  await persistStore()


  let eventType =
    previous
      ? 'published-news-updated'
      : 'published-news-created'


  if (
    previous?.active ===
      false &&
    normalized.record.active ===
      true
  ) {
    eventType =
      'published-news-republished'
  }


  if (
    normalized.record.active ===
      false
  ) {
    eventType =
      'published-news-archived'
  }


  await appendLedgerEvent({
    eventType,

    outcome:
      normalized.record.active
        ? 'published'
        : normalized.record.archiveReason,

    record:
      normalized.record,
  })


  return normalized.record
}


async function archivePublishedNewsRecord({
  id =
    '',
  externalId =
    '',
  record =
    null,
  reason =
    '',
}) {
  await ensureLoaded()


  const requestedIdentity =
    publishedNewsIdentity({
      id,
      externalId,
    })


  let identity =
    requestedIdentity


  if (
    !identity &&
    record
  ) {
    identity =
      publishedNewsIdentity(
        record
      )
  }


  let existing =
    identity
      ? (
          store.publishedNews[
            identity
          ] ||
          null
        )
      : null


  // If the caller only has one identifier but the record was originally
  // keyed by the other, find it without deleting or re-keying history.
  if (
    !existing
  ) {
    const values =
      Object.values(
        store.publishedNews ||
        {}
      )


    existing =
      values.find(
        (item) =>
          (
            externalId &&
            cleanText(
              item?.externalId
            ) ===
              cleanText(
                externalId
              )
          ) ||
          (
            id &&
            cleanText(
              item?.id
            ) ===
              cleanText(
                id
              )
          )
      ) ||
      null


    if (
      existing
    ) {
      identity =
        publishedNewsIdentity(
          existing
        )
    }
  }


  if (
    !existing &&
    !record
  ) {
    return null
  }


  const source =
    {
      ...existing,
      ...(record ||
        {}),
      active:
        false,
    }


  const normalized =
    normalizePublishedNewsRecord({
      record:
        source,

      existing,

      active:
        false,

      archiveReason:
        reason,
    })


  const finalIdentity =
    identity ||
    normalized.identity


  store.publishedNews[
    finalIdentity
  ] =
    normalized.record


  await persistStore()


  await appendLedgerEvent({
    eventType:
      'published-news-archived',

    outcome:
      normalized.record.archiveReason,

    record:
      normalized.record,
  })


  return normalized.record
}


async function expirePublishedNewsShelfLife() {
  await ensureLoaded()


  const now =
    new Date()
      .toISOString()


  const expiredRecords =
    []


  for (
    const [
      identity,
      record,
    ]
    of Object.entries(
      store.publishedNews ||
      {}
    )
  ) {
    if (
      record?.active ===
        false ||
      newsRecordIsCurrent(
        record
      )
    ) {
      continue
    }


    const expiresAt =
      getNewsExpiresAt(
        record
      ) ||
      record?.expiresAt ||
      ''


    const archivedRecord = {
      ...record,

      active:
        false,

      expiresAt,

      archivedAt:
        record?.archivedAt ||
        expiresAt ||
        now,

      archiveReason:
        'expired-shelf-life',

      serverUpdatedAt:
        now,
    }


    store.publishedNews[
      identity
    ] =
      archivedRecord


    expiredRecords.push(
      archivedRecord
    )
  }


  if (
    expiredRecords.length ===
      0
  ) {
    return 0
  }


  await persistStore()


  for (
    const record
    of expiredRecords
  ) {
    await appendLedgerEvent({
      eventType:
        'published-news-archived',

      outcome:
        'expired-shelf-life',

      record,
    })
  }


  return expiredRecords.length
}


async function getPublishedNewsRecords({
  status =
    'live',
} = {}) {
  await ensureLoaded()


  await expirePublishedNewsShelfLife()


  const normalizedStatus =
    cleanText(
      status
    )
      .toLowerCase()


  let records =
    Object.values(
      store.publishedNews ||
      {}
    )


  if (
    normalizedStatus ===
      'live'
  ) {
    records =
      records.filter(
        (record) =>
          record.active !==
            false
      )
  }
  else if (
    normalizedStatus ===
      'archive' ||
    normalizedStatus ===
      'archived'
  ) {
    records =
      records.filter(
        (record) =>
          record.active ===
            false
      )
  }


  return records.sort(
    (
      a,
      b
    ) =>
      new Date(
        b.serverUpdatedAt ||
        b.updatedAt ||
        b.publishedAt ||
        b.firstPublishedAt ||
        0
      )
        .getTime() -
      new Date(
        a.serverUpdatedAt ||
        a.updatedAt ||
        a.publishedAt ||
        a.firstPublishedAt ||
        0
      )
        .getTime()
  )
}


async function publishedNewsCounts() {
  const all =
    await getPublishedNewsRecords({
      status:
        'all',
    })


  return {
    all:
      all.length,

    live:
      all.filter(
        (record) =>
          record.active !==
            false
      )
        .length,

    archive:
      all.filter(
        (record) =>
          record.active ===
            false
      )
        .length,
  }
}


// ============================================================
// API
// ============================================================

function sendJson(
  res,
  status,
  payload
) {
  res.statusCode =
    status


  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  )


  res.setHeader(
    'Cache-Control',
    'no-store'
  )


  res.end(
    JSON.stringify(
      payload
    )
  )
}


async function readJsonBody(
  req
) {
  const chunks =
    []


  for await (
    const chunk
    of req
  ) {
    chunks.push(
      chunk
    )
  }


  const raw =
    Buffer.concat(
      chunks
    )
      .toString(
        'utf8'
      )


  if (
    !raw
  ) {
    return {}
  }


  return JSON.parse(
    raw
  )
}


async function pendingEvents() {
  await ensureLoaded()


  const now =
    new Date()
      .toISOString()


  const expiredEvents =
    []


  store.events =
    store.events.map(
      (
        event
      ) => {
        if (
          event.status !==
            'pending' ||
          newsRecordIsCurrent(
            event
          )
        ) {
          return event
        }


        const expired = {
          ...event,

          status:
            'acked',

          outcome:
            'expired-shelf-life',

          ackedAt:
            now,

          expiresAt:
            getNewsExpiresAt(
              event
            ) ||
            event.expiresAt ||
            '',
        }


        expiredEvents.push(
          expired
        )


        return expired
      }
    )


  if (
    expiredEvents.length >
      0
  ) {
    await persistStore()


    for (
      const event
      of expiredEvents
    ) {
      await appendLedgerEvent({
        eventType:
          'shelf-life-expired',

        outcome:
          'expired-shelf-life',

        record:
          event,
      })
    }
  }


  return store.events
    .filter(
      (
        event
      ) =>
        event.status ===
          'pending'
    )
    .sort(
      (
        a,
        b
      ) =>
        new Date(
          b.sourceUpdatedAt ||
          b.queuedAt ||
          b.receivedAt ||
          0
        )
          .getTime() -
        new Date(
          a.sourceUpdatedAt ||
          a.queuedAt ||
          a.receivedAt ||
          0
        )
          .getTime()
    )
}


async function acknowledgeEvents({
  ids,
  outcome,
  editorialRecord =
    null,
}) {
  await ensureLoaded()


  const idSet =
    new Set(
      (
        Array.isArray(
          ids
        )
          ? ids
          : []
      )
        .map(
          cleanText
        )
        .filter(
          Boolean
        )
    )


  if (
    idSet.size ===
      0
  ) {
    return 0
  }


  let changed =
    0


  const acknowledged =
    []


  const now =
    new Date()
      .toISOString()


  const normalizedOutcome =
    cleanText(
      outcome
    )
      .toLowerCase() ||
    'processed'


  store.events =
    store.events.map(
      (
        event
      ) => {
        const queueId =
          event.serverQueueId ||
          event.id


        if (
          !idSet.has(
            queueId
          )
        ) {
          return event
        }


        changed++


        const sourceState =
          store.sources[
            event.sourceKey
          ] ||
          {}


        const current =
          sourceState[
            event.externalId
          ] ||
          null


        const approved =
          normalizedOutcome.includes(
            'approved'
          ) ||
          normalizedOutcome ===
            'already-published'


        const rejected =
          normalizedOutcome.includes(
            'rejected'
          )


        if (
          current
        ) {
          if (
            approved
          ) {
            if (
              event.newsroomAction ===
                'resolve'
            ) {
              sourceState[
                event.externalId
              ] = {
                ...current,

                published:
                  false,

                resolved:
                  true,

                resolvedAt:
                  current.resolvedAt ||
                  now,

                lastEditorialAction:
                  normalizedOutcome,

                lastEditorialActionAt:
                  now,
              }
            }
            else {
              sourceState[
                event.externalId
              ] = {
                ...current,

                published:
                  true,

                resolved:
                  false,

                lastEditorialAction:
                  normalizedOutcome,

                lastEditorialActionAt:
                  now,
              }
            }
          }
          else if (
            rejected
          ) {
            sourceState[
              event.externalId
            ] = {
              ...current,

              published:
                event.newsroomAction ===
                  'new'
                  ? false
                  : current.published ===
                      true,

              resolved:
                event.newsroomAction ===
                  'resolve'
                  ? false
                  : current.resolved ===
                      true,

              lastEditorialAction:
                normalizedOutcome,

              lastEditorialActionAt:
                now,
            }
          }


          store.sources[
            event.sourceKey
          ] =
            sourceState
        }


        const acked = {
          ...event,

          ...(editorialRecord &&
          String(
            editorialRecord.externalId ||
            ''
          ) ===
          String(
            event.externalId ||
            ''
          )
            ? editorialRecord
            : {}),

          serverQueueId:
            queueId,

          status:
            'acked',

          outcome:
            normalizedOutcome,

          approvedAt:
            approved
              ? now
              : (
                  editorialRecord?.approvedAt ||
                  event.approvedAt ||
                  ''
                ),

          ackedAt:
            now,

          expiresAt:
            getNewsExpiresAt({
              ...event,
              ...(editorialRecord ||
                {}),
            }) ||
            editorialRecord?.expiresAt ||
            event.expiresAt ||
            '',
        }


        acknowledged.push(
          acked
        )


        return acked
      }
    )


  if (
    changed >
      0
  ) {
    await persistStore()


    for (
      const event
      of acknowledged
    ) {
      await appendLedgerEvent({
        eventType:
          'editorial-action',

        outcome:
          normalizedOutcome,

        record:
          event,
      })
    }
  }


  return changed
}


async function logManualEditorialAction({
  action,
  record,
}) {
  const normalizedAction =
    cleanText(
      action
    ) ||
    'manual-action'


  const ledgerRecord = {
    ...record,

    expiresAt:
      getNewsExpiresAt(
        record
      ) ||
      record?.expiresAt ||
      '',
  }


  await appendLedgerEvent({
    eventType:
      'manual-editorial-action',

    outcome:
      normalizedAction,

    record:
      ledgerRecord,
  })


  return ledgerRecord
}


// ============================================================
// VITE PLUGIN
// ============================================================

export function liveNewsroomFeed() {
  let intervalId =
    null


  let initialTimeoutId =
    null


  return {
    name:
      'geographic-live-newsroom-background',


    configureServer(
      server
    ) {
      // --------------------------------------------------------
      // PUBLIC PUBLISHED NEWS
      // --------------------------------------------------------
      //
      // GET:
      //   /api/geographic/toronto/news/published
      //   /api/geographic/toronto/news/published?status=archive
      //   /api/geographic/toronto/news/published?status=all
      //
      // The public map will use status=live (the default).
      //
      // --------------------------------------------------------

      server.middlewares.use(
        '/api/geographic/toronto/news/published',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'GET'
          ) {
            next()
            return
          }


          try {
            const url =
              new URL(
                req.url ||
                '/',
                'http://localhost'
              )


            const status =
              cleanText(
                url.searchParams.get(
                  'status'
                )
              ) ||
              'live'


            const records =
              await getPublishedNewsRecords({
                status,
              })


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                status,

                count:
                  records.length,

                updatedAt:
                  store.updatedAt,

                records,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              500,
              {
                ok:
                  false,

                records:
                  [],

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      // --------------------------------------------------------
      // ADMIN PUBLISHED NEWS UPSERT
      // --------------------------------------------------------
      //
      // POST:
      //   /api/geographic/toronto/newsroom/published/upsert
      //
      // Body:
      //   { record: {...} }
      //   { records: [{...}, {...}] }
      //
      // This route lives under /newsroom/ so the existing Admin
      // server authentication protects mutations.
      //
      // --------------------------------------------------------

      server.middlewares.use(
        '/api/geographic/toronto/newsroom/published/upsert',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'POST'
          ) {
            next()
            return
          }


          try {
            const body =
              await readJsonBody(
                req
              )


            const incoming =
              Array.isArray(
                body.records
              )
                ? body.records
                : (
                    body.record
                      ? [
                          body.record,
                        ]
                      : []
                  )


            if (
              incoming.length ===
                0
            ) {
              sendJson(
                res,
                400,
                {
                  ok:
                    false,

                  error:
                    'Missing published NEWS record.',
                }
              )

              return
            }


            const records =
              []


            for (
              const record
              of incoming
            ) {
              records.push(
                await upsertPublishedNewsRecord({
                  record,

                  archiveReason:
                    body.archiveReason ||
                    '',
                })
              )
            }


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                count:
                  records.length,

                records,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              400,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      // --------------------------------------------------------
      // ADMIN ARCHIVE / REMOVE FROM LIVE MAP
      // --------------------------------------------------------
      //
      // POST:
      //   /api/geographic/toronto/newsroom/published/archive
      //
      // This NEVER deletes the historical record. It only sets
      // active:false and records archivedAt/archiveReason.
      //
      // --------------------------------------------------------

      server.middlewares.use(
        '/api/geographic/toronto/newsroom/published/archive',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'POST'
          ) {
            next()
            return
          }


          try {
            const body =
              await readJsonBody(
                req
              )


            const record =
              await archivePublishedNewsRecord({
                id:
                  body.id ||
                  body.record?.id ||
                  '',

                externalId:
                  body.externalId ||
                  body.record?.externalId ||
                  '',

                record:
                  body.record ||
                  null,

                reason:
                  body.reason ||
                  'removed-from-live-map',
              })


            if (
              !record
            ) {
              sendJson(
                res,
                404,
                {
                  ok:
                    false,

                  error:
                    'Published NEWS record not found.',
                }
              )

              return
            }


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                record,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              400,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/pending',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'GET'
          ) {
            next()
            return
          }


          try {
            const records =
              await pendingEvents()


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                count:
                  records.length,

                updatedAt:
                  store.updatedAt,

                records,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              500,
              {
                ok:
                  false,

                records:
                  [],

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/sync',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'POST'
          ) {
            next()
            return
          }


          try {
            const result =
              await syncTorontoLiveNewsroom()


            sendJson(
              res,
              200,
              result
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              500,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/ack',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'POST'
          ) {
            next()
            return
          }


          try {
            const body =
              await readJsonBody(
                req
              )


            const changed =
              await acknowledgeEvents({
                ids:
                  body.ids,

                outcome:
                  body.outcome,

                editorialRecord:
                  body.record ||
                  null,
              })


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                changed,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              400,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/log',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'POST'
          ) {
            next()
            return
          }


          try {
            const body =
              await readJsonBody(
                req
              )


            const record =
              await logManualEditorialAction({
                action:
                  body.action,

                record:
                  body.record ||
                  {},
              })


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                record,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              400,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/ledger.csv',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'GET'
          ) {
            next()
            return
          }


          try {
            await ensureLedgerHeader()


            const csv =
              await readFile(
                NEWS_LEDGER_PATH,
                'utf8'
              )


            res.statusCode =
              200


            res.setHeader(
              'Content-Type',
              'text/csv; charset=utf-8'
            )


            res.setHeader(
              'Content-Disposition',
              'inline; filename="toronto-news-ledger.csv"'
            )


            res.setHeader(
              'Cache-Control',
              'no-store'
            )


            res.end(
              csv
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              500,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )


      server.middlewares.use(
        '/api/geographic/toronto/newsroom/status',

        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'GET'
          ) {
            next()
            return
          }


          await ensureLoaded()


          const pending =
            await pendingEvents()


          sendJson(
            res,
            200,
            {
              ok:
                true,

              storePath:
                STORE_PATH,

              ledgerPath:
                NEWS_LEDGER_PATH,

              pending:
                pending.length,

              totalEvents:
                store.events.length,

              sources: {
                ttc:
                  Object.keys(
                    store.sources.ttc ||
                    {}
                  )
                    .length,

                fire:
                  Object.keys(
                    store.sources.fire ||
                    {}
                  )
                    .length,

                police:
                  Object.keys(
                    store.sources.police ||
                    {}
                  )
                    .length,
              },

              publishedNews:
                await publishedNewsCounts(),

              updatedAt:
                store.updatedAt,

              syncRunning,
            }
          )
        }
      )


      initialTimeoutId =
        setTimeout(
          () => {
            syncTorontoLiveNewsroom()
              .catch(
                (
                  error
                ) => {
                  console.warn(
                    'LIVE NEWSROOM · INITIAL SYNC FAILED:',
                    error
                  )
                }
              )
          },
          2000
        )


      intervalId =
        setInterval(
          () => {
            syncTorontoLiveNewsroom()
              .catch(
                (
                  error
                ) => {
                  console.warn(
                    'LIVE NEWSROOM · BACKGROUND SYNC FAILED:',
                    error
                  )
                }
              )
          },
          POLL_MS
        )


      server.httpServer?.once(
        'close',
        () => {
          if (
            initialTimeoutId
          ) {
            clearTimeout(
              initialTimeoutId
            )
          }


          if (
            intervalId
          ) {
            clearInterval(
              intervalId
            )
          }
        }
      )
    },
  }
}