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
  'https://www.toronto.ca/wp-content/uploads/2017/11/9775-actiefireincidents.html'


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
    1,

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

export async function queueLiveNewsroomRecord({
  sourceKey =
    'police',
  record,
  action =
    '',
}) {
  const rawAction =
    cleanText(
      action ||
      record?.newsroomAction ||
      ''
    )
      .toLowerCase()


  const requestedAction =
    rawAction ===
      'resolve' ||
    record?.category ===
      'located'
      ? 'resolve'
      : ''


  return observeRecord({
    sourceKey,
    record,
    forceAction:
      requestedAction,
  })
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
      '4-hours',

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

function parseFireRows(
  html
) {
  const rows =
    []


  const rowPattern =
    /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi


  let rowMatch


  while (
    (
      rowMatch =
        rowPattern.exec(
          html
        )
    )
  ) {
    const cells =
      []


    const cellPattern =
      /<td\b[^>]*>([\s\S]*?)<\/td>/gi


    let cellMatch


    while (
      (
        cellMatch =
          cellPattern.exec(
            rowMatch[1]
          )
      )
    ) {
      cells.push(
        decodeHtml(
          cellMatch[1]
        )
      )
    }


    if (
      cells.length >=
        8
    ) {
      rows.push(
        cells
      )
    }
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


function normalizeFireRow(
  cells
) {
  const primeStreet =
    cleanText(
      cells[0]
    )


  const crossStreet =
    cleanText(
      cells[1]
    )


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
    !primeStreet &&
    !crossStreet
  ) {
    return null
  }


  const location =
    primeStreet &&
    crossStreet
      ? (
          primeStreet +
          ' & ' +
          crossStreet
        )
      : (
          primeStreet ||
          crossStreet
        )


  const descriptionParts =
    []


  if (
    dispatchTime
  ) {
    descriptionParts.push(
      'Dispatch ' +
      dispatchTime
    )
  }


  if (
    alarmLevel
  ) {
    descriptionParts.push(
      'Alarm ' +
      alarmLevel
    )
  }


  if (
    area
  ) {
    descriptionParts.push(
      'Area ' +
      area
    )
  }


  if (
    dispatchedUnits
  ) {
    descriptionParts.push(
      'Units ' +
      dispatchedUnits
    )
  }


  if (
    incidentNumber
  ) {
    descriptionParts.push(
      'Incident ' +
      incidentNumber
    )
  }


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
          crossStreet,
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
      descriptionParts.join(
        ' · '
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
            'text/html,application/xhtml+xml',

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


  const html =
    await response.text()


  return parseFireRows(
    html
  )
    .map(
      normalizeFireRow
    )
    .filter(
      Boolean
    )
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