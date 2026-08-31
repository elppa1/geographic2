import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  CITIES,
} from '../cities/index.js'

import {
  applyNewsItemUpdate,
  createAdminId,
  getHistoricItems,
  getNewsItems,
  getNewsReviewItems,
  getNewItems,
  getNewReviewItems,
  markScraperRecordProcessed,
  saveHistoricItems,
  saveNewsItems,
  saveNewsReviewItems,
  saveNewItems,
  saveNewReviewItems,
} from './adminStore.js'

import {
  hasCityScraper,
  runCityScraper,
} from '../scrapers/index.js'

import LocationSearch from './LocationSearch.jsx'
import AdminPinMap from './AdminPinMap.jsx'

import {
  searchLocation,
} from './locationSearchUtils.js'

import {
  getNewsExpiresAt,
  getNewsSourceTimestamp,
  getNewsTimeRemainingMs,
} from '../newsPolicy.js'

import './AdminRoom.css'


// ============================================================
// TPS NEWSROOM
// ============================================================

const TPS_NEWSROOM_ENDPOINT =
  '/api/geographic/toronto/police/incoming'


const TPS_NEWSROOM_POLL_MS =
  30 * 1000


// Toronto's official live NEWS sources (Fire + TTC)
// are pulled automatically while Admin Room is open.
const TORONTO_OFFICIAL_NEWS_POLL_MS =
  2 * 60 * 1000


const PERSISTENT_NEWSROOM_PENDING_ENDPOINT =
  '/api/geographic/toronto/newsroom/pending'


const PERSISTENT_NEWSROOM_SYNC_ENDPOINT =
  '/api/geographic/toronto/newsroom/sync'


const PERSISTENT_NEWSROOM_ACK_ENDPOINT =
  '/api/geographic/toronto/newsroom/ack'


const PERSISTENT_NEWSROOM_LOG_ENDPOINT =
  '/api/geographic/toronto/newsroom/log'


const PUBLISHED_NEWS_ENDPOINT =
  '/api/geographic/toronto/news/published'


const PUBLISHED_NEWS_UPSERT_ENDPOINT =
  '/api/geographic/toronto/newsroom/published/upsert'


const PUBLISHED_NEWS_ARCHIVE_ENDPOINT =
  '/api/geographic/toronto/newsroom/published/archive'


const PERSISTENT_NEWSROOM_PULL_MS =
  15 * 1000


const TPS_NEWSROOM_PROCESSED_KEY =
  'elppa-geographic-tps-newsroom-processed-v1'


function isTpsNewsroomRecord(
  record
) {
  const source =
    String(
      record?.source ||
      record?.scraperSource ||
      ''
    )
      .toLowerCase()


  return (
    record?.origin ===
      'tps-email' ||
    record?.newsroomSource ===
      'tps-email' ||
    source.includes(
      'toronto police'
    )
  )
}


function formatRemainingNewsTime(
  record
) {
  const remaining =
    getNewsTimeRemainingMs(
      record
    )


  if (
    remaining ===
      null
  ) {
    return ''
  }


  if (
    remaining <=
      0
  ) {
    return 'EXPIRED'
  }


  const totalMinutes =
    Math.ceil(
      remaining /
      60000
    )


  if (
    totalMinutes <
      60
  ) {
    return (
      `${totalMinutes}m left`
    )
  }


  const hours =
    Math.floor(
      totalMinutes /
      60
    )


  const minutes =
    totalMinutes %
      60


  if (
    hours <
      24
  ) {
    return (
      `${hours}h` +
      (
        minutes
          ? ` ${minutes}m`
          : ''
      ) +
      ' left'
    )
  }


  const days =
    Math.floor(
      hours /
      24
    )


  const leftoverHours =
    hours %
      24


  return (
    `${days}d` +
    (
      leftoverHours
        ? ` ${leftoverHours}h`
        : ''
    ) +
    ' left'
  )
}


function normalizeTpsIdentityPart(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .toLowerCase()
}


function getTpsIncidentIdentity(
  record
) {
  return (
    normalizeTpsIdentityPart(
      record?.externalId
    ) ||
    normalizeTpsIdentityPart(
      record?.caseNumber
    ) ||
    normalizeTpsIdentityPart(
      record?.incidentNumber
    ) ||
    normalizeTpsIdentityPart(
      record?.goNumber
    )
  )
}


function sameTpsIncident(
  a,
  b
) {
  const aIdentity =
    getTpsIncidentIdentity(
      a
    )


  const bIdentity =
    getTpsIncidentIdentity(
      b
    )


  if (
    aIdentity &&
    bIdentity
  ) {
    return (
      aIdentity ===
      bIdentity
    )
  }


  return false
}


function getTpsSourceSnapshot(
  record
) {
  return {
    category:
      record?.category ??
      null,

    title:
      record?.title ??
      null,

    description:
      record?.description ??
      null,

    location:
      record?.location ??
      null,

    intersection:
      record?.intersection ??
      null,

    sourceUrl:
      record?.sourceUrl ??
      null,

    imageUrl:
      record?.imageUrl ??
      null,
  }
}


function getTpsRecordVersion(
  record
) {
  const snapshot =
    getTpsSourceSnapshot(
      record
    )


  const normalized =
    Object.keys(
      snapshot
    )
      .sort()
      .reduce(
        (
          next,
          key
        ) => {
          next[
            key
          ] =
            normalizeTpsIdentityPart(
              snapshot[
                key
              ]
            )


          return next
        },
        {}
      )


  return JSON.stringify(
    normalized
  )
}


function getTpsProcessedVersionKey(
  record
) {
  const identity =
    getTpsIncidentIdentity(
      record
    )


  const version =
    getTpsRecordVersion(
      record
    )


  if (
    !identity ||
    !version
  ) {
    return ''
  }


  return (
    identity +
    '::' +
    version
  )
}


function getProcessedTpsVersions() {
  try {
    const raw =
      window.localStorage.getItem(
        TPS_NEWSROOM_PROCESSED_KEY
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


    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      )
    ) {
      return {}
    }


    return parsed
  }
  catch (
    error
  ) {
    console.warn(
      'TPS NEWSROOM PROCESSED READ FAILED:',
      error
    )


    return {}
  }
}


function hasProcessedTpsVersion(
  record
) {
  const key =
    getTpsProcessedVersionKey(
      record
    )


  if (
    !key
  ) {
    return false
  }


  return Boolean(
    getProcessedTpsVersions()[
      key
    ]
  )
}


function markTpsVersionProcessed(
  record,
  status
) {
  const key =
    getTpsProcessedVersionKey(
      record
    )


  if (
    !key
  ) {
    return
  }


  const existing =
    getProcessedTpsVersions()


  const next = {
    ...existing,

    [key]: {
      status,

      at:
        new Date()
          .toISOString(),
    },
  }


  const entries =
    Object.entries(
      next
    )
      .sort(
        (
          a,
          b
        ) => {
          const aTime =
            new Date(
              a[1]?.at ||
              0
            )
              .getTime()


          const bTime =
            new Date(
              b[1]?.at ||
              0
            )
              .getTime()


          return (
            bTime -
            aTime
          )
        }
      )
      .slice(
        0,
        500
      )


  try {
    window.localStorage.setItem(
      TPS_NEWSROOM_PROCESSED_KEY,
      JSON.stringify(
        Object.fromEntries(
          entries
        )
      )
    )
  }
  catch (
    error
  ) {
    console.warn(
      'TPS NEWSROOM PROCESSED WRITE FAILED:',
      error
    )
  }
}


function isUsableCoordinate(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return false
  }


  return Number.isFinite(
    Number(
      value
    )
  )
}


function hasRecordCoordinates(
  record
) {
  return (
    isUsableCoordinate(
      record?.longitude
    ) &&
    isUsableCoordinate(
      record?.latitude
    )
  )
}


// ============================================================
// DATE INPUT
// ============================================================
//
// TPS records keep their precise ISO broadcast timestamp.
// HTML date inputs only accept YYYY-MM-DD, so format the value
// for display without overwriting the stored timestamp.
//
// ============================================================

function toTorontoDateInputValue(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .trim()


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text
  }


  if (
    !text
  ) {
    return ''
  }


  const date =
    new Date(
      text
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return ''
  }


  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      }
    )
      .formatToParts(
        date
      )


  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            'literal'
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    )


  if (
    !values.year ||
    !values.month ||
    !values.day
  ) {
    return ''
  }


  return (
    values.year +
    '-' +
    values.month +
    '-' +
    values.day
  )
}


// ============================================================
// NEWS DATE DISPLAY
// ============================================================

function formatTorontoNewsTimestamp(
  value
) {
  if (
    !value
  ) {
    return ''
  }


  const date =
    new Date(
      value
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    )
  }


  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        year:
          'numeric',

        month:
          'short',

        day:
          'numeric',

        hour:
          'numeric',

        minute:
          '2-digit',

        hour12:
          true,
      }
    )
      .formatToParts(
        date
      )


  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            'literal'
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    )


  const dateLabel =
    (
      `${values.month || ''} ` +
      `${values.day || ''}, ` +
      `${values.year || ''}`
    )
      .trim()


  const hour =
    Number(
      values.hour
    )


  const minute =
    Number(
      values.minute
    )


  // The webhook uses local midnight when a TPS release has a date
  // but no reliable broadcast time. Do not present that as a real
  // 12:00 AM publication time.
  if (
    hour ===
      12 &&
    minute ===
      0 &&
    String(
      values.dayPeriod ||
      ''
    )
      .toUpperCase() ===
      'AM'
  ) {
    return dateLabel
      .toUpperCase()
  }


  return (
    (
      `${values.month || ''} ` +
      `${values.day || ''}` +
      ' · ' +
      `${values.hour || ''}:` +
      `${values.minute || '00'} ` +
      `${values.dayPeriod || ''}`
    )
      .trim()
      .toUpperCase()
  )
}


// ============================================================
// BASE RECORD
// ============================================================

const BASE_RECORD = {
  id:
    '',

  city:
    '',

  title:
    '',

  description:
    '',

  location:
    '',

  intersection:
    '',

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
    '',

  sourceUrl:
    '',

  imageUrl:
    '',

  active:
    true,
}


// ============================================================
// EMPTY TYPES
// ============================================================

const EMPTY_NEWS = {
  ...BASE_RECORD,

  type:
    'news',

  category:
    'city',

  publishedAt:
    '',

  expiresAt:
    '',
}


const EMPTY_NEW = {
  ...BASE_RECORD,

  type:
    'new',

  category:
    'development',

  status:
    'proposed',

  announcedAt:
    '',

  expectedAt:
    '',
}


const EMPTY_HISTORIC = {
  ...BASE_RECORD,

  type:
    'historic',

  category:
    'place',

  year:
    '',

  timeMode:
    'event',

  startYear:
    '',

  endYear:
    '',

  layerPlacementMode:
    'auto',

  layerOverrideType:
    '',

  layerOverrideYear:
    '',
}


// ============================================================
// DATE
// ============================================================

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10
    )
}


function getRecordReviewDate(
  record,
  tab
) {
  if (
    tab ===
      'news'
  ) {
    const action =
      getNewsroomAction(
        record
      )


    if (
      action ===
        'resolve'
    ) {
      return (
        record.resolutionDetectedAt ||
        record.resolvedAt ||
        record.sourceUpdatedAt ||
        record.publishedAt ||
        record.receivedAt ||
        ''
      )
    }


    if (
      action ===
        'update'
    ) {
      return (
        record.sourceUpdatedAt ||
        record.updatedAt ||
        record.publishedAt ||
        record.receivedAt ||
        ''
      )
    }


    return (
      record.publishedAt ||
      record.firstSeenAt ||
      record.receivedAt ||
      ''
    )
  }


  return (
    record.announcedAt ||
    record.updatedAt ||
    record.receivedAt ||
    ''
  )
}


function getPublishedActivityTimestamp(
  record,
  tab
) {
  if (
    tab ===
      'historic'
  ) {
    return 0
  }


  const value =
    tab ===
      'news'
      ? (
          record.sourceUpdatedAt ||
          record.updatedAt ||
          record.publishedAt ||
          record.firstSeenAt ||
          record.createdAt ||
          ''
        )
      : (
          record.updatedAt ||
          record.announcedAt ||
          record.publishedAt ||
          record.createdAt ||
          ''
        )


  return (
    getDateTimestamp(
      value
    ) ||
    0
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


function startOfTodayTimestamp() {
  const date =
    new Date()


  date.setHours(
    0,
    0,
    0,
    0
  )


  return date.getTime()
}


function reviewRecordMatchesRange({
  record,
  tab,
  range,
}) {
  if (
    range ===
    'all'
  ) {
    return true
  }


  const value =
    getRecordReviewDate(
      record,
      tab
    )


  const timestamp =
    getDateTimestamp(
      value
    )


  if (
    timestamp ===
    null
  ) {
    return false
  }


  const days =
    Number(
      range
    )


  if (
    !Number.isFinite(
      days
    )
  ) {
    return true
  }


  const cutoff =
    startOfTodayTimestamp() -
    (
      (
        days -
        1
      ) *
      24 *
      60 *
      60 *
      1000
    )


  return (
    timestamp >=
    cutoff
  )
}


// ============================================================
// NEW TYPE FILTER
// ============================================================

function newRecordMatchesType(
  record,
  filter
) {
  if (
    filter ===
    'all'
  ) {
    return true
  }


  const category =
    String(
      record.category ||
      ''
    )
      .toLowerCase()


  const businessCategories = [
    'store',
    'restaurant',
    'business',
  ]


  const isBusiness =
    businessCategories.includes(
      category
    )


  if (
    filter ===
    'business'
  ) {
    return isBusiness
  }


  if (
    filter ===
    'development'
  ) {
    return !isBusiness
  }


  return true
}


// ============================================================
// NEW STATUS FILTER
// ============================================================

function newRecordMatchesStatus(
  record,
  filter
) {
  if (
    filter ===
    'all'
  ) {
    return true
  }


  const status =
    String(
      record.status ||
      'proposed'
    )
      .toLowerCase()


  return (
    status ===
    filter
  )
}


// ============================================================
// OFFICIAL NEWSROOM SOURCE
// ============================================================

function getNewsroomSourceKey(
  record
) {
  const source =
    String(
      record?.source ||
      record?.scraperSource ||
      record?.newsroomSource ||
      record?.origin ||
      ''
    )
      .toLowerCase()


  if (
    isTpsNewsroomRecord(
      record
    ) ||
    source.includes(
      'toronto police'
    ) ||
    source.includes(
      'tps'
    )
  ) {
    return 'police'
  }


  if (
    record?.category ===
      'fire' ||
    source.includes(
      'fire services'
    ) ||
    source.includes(
      'toronto fire'
    )
  ) {
    return 'fire'
  }


  if (
    record?.category ===
      'ttc' ||
    source.includes(
      'transit commission'
    ) ||
    source.includes(
      'ttc'
    )
  ) {
    return 'transit'
  }


  return 'other'
}


function getNewsroomSourceLabel(
  record
) {
  const sourceKey =
    getNewsroomSourceKey(
      record
    )


  if (
    sourceKey ===
      'police'
  ) {
    return 'POLICE'
  }


  if (
    sourceKey ===
      'fire'
  ) {
    return 'FIRE'
  }


  if (
    sourceKey ===
      'transit'
  ) {
    return 'TRANSIT'
  }


  return 'OTHER'
}


function getNewsroomSourceIcon(
  record
) {
  const sourceKey =
    getNewsroomSourceKey(
      record
    )


  if (
    sourceKey ===
      'police'
  ) {
    return '🚔'
  }


  if (
    sourceKey ===
      'fire'
  ) {
    return '🚒'
  }


  if (
    sourceKey ===
      'transit'
  ) {
    return '🚌'
  }


  return '•'
}


function newsroomRecordMatchesSource(
  record,
  filter
) {
  if (
    filter ===
      'all'
  ) {
    return true
  }


  return (
    getNewsroomSourceKey(
      record
    ) ===
    filter
  )
}


function newsroomRecordMatchesAction(
  record,
  filter
) {
  if (
    filter ===
      'all'
  ) {
    return true
  }


  return (
    getNewsroomAction(
      record
    ) ===
    filter
  )
}


// ============================================================
// REVIEW SOURCE LABEL
// ============================================================

function getReviewSourceLabel(
  record
) {
  const officialSource =
    getNewsroomSourceKey(
      record
    )


  if (
    officialSource !==
      'other'
  ) {
    return getNewsroomSourceLabel(
      record
    )
  }


  const source =
    String(
      record.source ||
      record.scraperSource ||
      ''
    )
      .toLowerCase()


  if (
    source.includes(
      'blogto'
    )
  ) {
    return 'BLOGTO'
  }


  if (
    source.includes(
      'toronto'
    ) ||
    source.includes(
      'public notice'
    )
  ) {
    return 'CITY'
  }


  if (
    record.source
  ) {
    return String(
      record.source
    )
      .toUpperCase()
  }


  return 'SOURCE'
}


// ============================================================
// NEWSROOM ACTION
// ============================================================

function getNewsroomAction(
  record
) {
  const action =
    String(
      record?.newsroomAction ||
      ''
    )
      .trim()
      .toLowerCase()


  if (
    action ===
      'resolve'
  ) {
    return 'resolve'
  }


  if (
    action ===
      'update'
  ) {
    return 'update'
  }


  return 'new'
}


function getNewsroomActionLabel(
  record
) {
  const action =
    getNewsroomAction(
      record
    )


  if (
    action ===
      'resolve'
  ) {
    return 'RESOLVE'
  }


  if (
    action ===
      'update'
  ) {
    return 'UPDATE'
  }


  return 'NEW'
}


function getNewsroomApproveLabel(
  record
) {
  const action =
    getNewsroomAction(
      record
    )


  // Official-source UPDATE / RESOLVE cards are audit notices.
  // The server has already applied the factual change to the public
  // NEWS record, so Admin only acknowledges that the editor saw it.
  if (
    action ===
      'resolve' ||
    action ===
      'update'
  ) {
    return 'ACKNOWLEDGE'
  }


  return 'APPROVE'
}


// ============================================================
// NEWSROOM CHANGES
// ============================================================

const NEWSROOM_COMPARE_FIELDS = [
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


function normalizeNewsroomComparable(
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
          String(
            item ??
            ''
          )
            .trim()
      )
      .sort()
      .join(
        ' | '
      )
  }


  return String(
    value ??
    ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function getNewsroomChangedFields(
  currentRecord,
  incomingRecord
) {
  if (
    !currentRecord ||
    !incomingRecord
  ) {
    return []
  }


  return NEWSROOM_COMPARE_FIELDS
    .filter(
      (
        field
      ) =>
        normalizeNewsroomComparable(
          currentRecord[
            field
          ]
        ) !==
        normalizeNewsroomComparable(
          incomingRecord[
            field
          ]
        )
    )
}


function buildNewsroomSourceSnapshot(
  record
) {
  const snapshot =
    {}


  NEWSROOM_COMPARE_FIELDS
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


function getNewsroomSourceFingerprint(
  record
) {
  const snapshot =
    buildNewsroomSourceSnapshot(
      record
    )


  const normalized =
    Object.keys(
      snapshot
    )
      .sort()
      .reduce(
        (
          next,
          key
        ) => {
          next[
            key
          ] =
            normalizeNewsroomComparable(
              snapshot[
                key
              ]
            )


          return next
        },
        {}
      )


  return JSON.stringify(
    normalized
  )
}


function getOfficialSourceChanges(
  publishedRecord,
  incomingRecord
) {
  if (
    !publishedRecord ||
    !incomingRecord
  ) {
    return []
  }


  if (
    !publishedRecord.sourceSnapshot
  ) {
    return []
  }


  return getNewsroomChangedFields(
    publishedRecord.sourceSnapshot,
    incomingRecord
  )
}


function stampIncomingOfficialRecord({
  incomingRecord,
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
    incomingRecord?.firstSeenAt ||
    now


  return {
    ...incomingRecord,

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
            incomingRecord?.sourceUpdatedAt ||
            firstSeenAt
          ),

    sourceSnapshot:
      buildNewsroomSourceSnapshot(
        incomingRecord
      ),

    sourceFingerprint:
      getNewsroomSourceFingerprint(
        incomingRecord
      ),
  }
}


function formatNewsroomFieldLabel(
  field
) {
  const labels = {
    category:
      'CATEGORY',

    title:
      'TITLE',

    description:
      'DESCRIPTION',

    location:
      'LOCATION',

    intersection:
      'INTERSECTION',

    sourceUrl:
      'SOURCE',

    imageUrl:
      'IMAGE',

    ttcEffect:
      'SERVICE STATUS',

    ttcCause:
      'CAUSE',

    ttcRoutes:
      'ROUTES',

    alarmLevel:
      'ALARM LEVEL',

    area:
      'AREA',

    dispatchedUnits:
      'UNITS',
  }


  return (
    labels[
      field
    ] ||
    String(
      field ||
      ''
    )
      .replace(
        /([a-z])([A-Z])/g,
        '$1 $2'
      )
      .toUpperCase()
  )
}


function getNewsroomDisplayRecord(
  record
) {
  const action =
    getNewsroomAction(
      record
    )


  if (
    action ===
      'resolve'
  ) {
    return (
      record.previousRecord ||
      record
    )
  }


  if (
    action ===
      'update'
  ) {
    return (
      record.incomingRecord ||
      record
    )
  }


  return record
}


// ============================================================
// DATE GROUPING
// ============================================================

function dateKey(
  value
) {
  const timestamp =
    getDateTimestamp(
      value
    )


  if (
    timestamp ===
    null
  ) {
    return 'undated'
  }


  const date =
    new Date(
      timestamp
    )


  const year =
    date.getFullYear()


  const month =
    String(
      date.getMonth() +
      1
    )
      .padStart(
        2,
        '0'
      )


  const day =
    String(
      date.getDate()
    )
      .padStart(
        2,
        '0'
      )


  return (
    `${year}-` +
    `${month}-` +
    `${day}`
  )
}


function formatReviewDateHeading(
  key
) {
  if (
    key ===
    'undated'
  ) {
    return 'DATE UNKNOWN'
  }


  const [
    year,
    month,
    day,
  ] =
    key
      .split('-')
      .map(
        Number
      )


  const date =
    new Date(
      year,
      month -
      1,
      day
    )


  const todayDate =
    new Date()


  todayDate.setHours(
    0,
    0,
    0,
    0
  )


  const yesterday =
    new Date(
      todayDate
    )


  yesterday.setDate(
    yesterday.getDate() -
    1
  )


  if (
    date.getTime() ===
    todayDate.getTime()
  ) {
    return 'TODAY'
  }


  if (
    date.getTime() ===
    yesterday.getTime()
  ) {
    return 'YESTERDAY'
  }


  return date
    .toLocaleDateString(
      'en-CA',
      {
        year:
          'numeric',

        month:
          'long',

        day:
          'numeric',
      }
    )
    .toUpperCase()
}


// ============================================================
// DRAFTS
// ============================================================

function makeNewsDraft(
  cityKey
) {
  return {
    ...EMPTY_NEWS,

    city:
      cityKey,

    publishedAt:
      today(),
  }
}


function makeNewDraft(
  cityKey
) {
  return {
    ...EMPTY_NEW,

    city:
      cityKey,

    announcedAt:
      today(),
  }
}


function makeHistoricDraft(
  cityKey
) {
  return {
    ...EMPTY_HISTORIC,

    city:
      cityKey,
  }
}


function makeDraft(
  tab,
  cityKey
) {
  if (
    tab ===
    'news'
  ) {
    return makeNewsDraft(
      cityKey
    )
  }


  if (
    tab ===
    'new'
  ) {
    return makeNewDraft(
      cityKey
    )
  }


  return makeHistoricDraft(
    cityKey
  )
}


// ============================================================
// LABEL
// ============================================================

function tabLabel(
  tab
) {
  if (
    tab ===
    'historic'
  ) {
    return 'HISTORIC'
  }


  return String(
    tab
  )
    .toUpperCase()
}


// ============================================================
// CITY HELPERS
// ============================================================

function belongsToCity(
  record,
  cityKey
) {
  const recordCity =
    record.city ||
    'toronto'


  return (
    recordCity ===
    cityKey
  )
}


function replaceCityRecords({
  allRecords,
  cityKey,
  nextCityRecords,
}) {
  const otherCities =
    allRecords.filter(
      (record) =>
        !belongsToCity(
          record,
          cityKey
        )
    )


  return [
    ...nextCityRecords,
    ...otherCities,
  ]
}


// ============================================================
// HISTORICAL LAYERS
// ============================================================

function getHistoricalLayers(
  city
) {
  if (
    !city
  ) {
    return []
  }


  const mapLayers =
    Object.entries(
      city.maps ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([
          year,
          item,
        ]) => ({
          year:
            Number(
              year
            ),

          layerType:
            'map',

          label:
            `${year} · MAP`,

          item,
        })
      )


  const aerialLayers =
    Object.entries(
      city.aerials ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([
          year,
          item,
        ]) => ({
          year:
            Number(
              year
            ),

          layerType:
            'aerial',

          label:
            `${year} · AERIAL`,

          item,
        })
      )


  return [
    ...mapLayers,
    ...aerialLayers,
  ]
    .filter(
      (layer) =>
        Number.isFinite(
          layer.year
        )
    )
    .sort(
      (
        a,
        b
      ) =>
        a.year -
        b.year
    )
}


// ============================================================
// HISTORIC YEAR
// ============================================================

function getHistoricAnchorYear(
  record
) {
  if (
    record.timeMode ===
      'range' ||
    record.timeMode ===
      'present'
  ) {
    return Number(
      record.startYear ||
      record.year ||
      0
    )
  }


  return Number(
    record.year ||
    record.startYear ||
    0
  )
}


// ============================================================
// CLOSEST HISTORICAL LAYER
// ============================================================

function getClosestHistoricalLayer({
  city,
  year,
}) {
  const numericYear =
    Number(
      year
    )


  if (
    !Number.isFinite(
      numericYear
    ) ||
    numericYear <=
      0
  ) {
    return null
  }


  const layers =
    getHistoricalLayers(
      city
    )


  if (
    layers.length ===
    0
  ) {
    return null
  }


  return layers.reduce(
    (
      closest,
      layer
    ) => {
      if (
        !closest
      ) {
        return layer
      }


      const currentDifference =
        Math.abs(
          layer.year -
          numericYear
        )


      const closestDifference =
        Math.abs(
          closest.year -
          numericYear
        )


      if (
        currentDifference <
        closestDifference
      ) {
        return layer
      }


      if (
        currentDifference ===
          closestDifference &&
        layer.year >
          closest.year
      ) {
        return layer
      }


      return closest
    },
    null
  )
}


// ============================================================
// AUTO HISTORIC LAYERS
// ============================================================

function getAutomaticHistoricLayers({
  city,
  record,
}) {
  const layers =
    getHistoricalLayers(
      city
    )


  if (
    layers.length ===
    0
  ) {
    return []
  }


  const timeMode =
    record.timeMode ||
    'event'


  if (
    timeMode ===
    'range'
  ) {
    const start =
      Number(
        record.startYear
      )


    const end =
      Number(
        record.endYear
      )


    if (
      !Number.isFinite(
        start
      ) ||
      !Number.isFinite(
        end
      )
    ) {
      return []
    }


    return layers.filter(
      (layer) =>
        layer.year >=
          start &&
        layer.year <=
          end
    )
  }


  if (
    timeMode ===
    'present'
  ) {
    const start =
      Number(
        record.startYear
      )


    if (
      !Number.isFinite(
        start
      )
    ) {
      return []
    }


    return layers.filter(
      (layer) =>
        layer.year >=
        start
    )
  }


  const closest =
    getClosestHistoricalLayer({
      city,

      year:
        record.year ||
        record.startYear,
    })


  return closest
    ? [
        closest,
      ]
    : []
}


// ============================================================
// HISTORIC PLACEMENT TEXT
// ============================================================

function getHistoricPlacementSummary({
  city,
  record,
}) {
  if (
    record.layerPlacementMode ===
    'manual'
  ) {
    const year =
      Number(
        record.layerOverrideYear
      )


    if (
      !Number.isFinite(
        year
      ) ||
      !record.layerOverrideType
    ) {
      return {
        title:
          'MANUAL',

        detail:
          'Choose a historical layer.',
      }
    }


    return {
      title:
        (
          `${year} · ` +
          `${record.layerOverrideType.toUpperCase()}`
        ),

      detail:
        'Manual override',
    }
  }


  const automaticLayers =
    getAutomaticHistoricLayers({
      city,
      record,
    })


  if (
    automaticLayers.length ===
    0
  ) {
    return {
      title:
        'AUTO',

      detail:
        'Enter the historical year first.',
    }
  }


  if (
    automaticLayers.length ===
    1
  ) {
    return {
      title:
        automaticLayers[0]
          .label,

      detail:
        'Closest available historical view',
    }
  }


  return {
    title:
      (
        `${automaticLayers.length} ` +
        'HISTORICAL VIEWS'
      ),

    detail:
      (
        `${automaticLayers[0].year}` +
        ' → ' +
        `${automaticLayers[
          automaticLayers.length -
          1
        ].year}`
      ),
  }
}


// ============================================================
// NORMALIZE SOURCE URL
// ============================================================

function normalizeSourceUrl(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .trim()


  const markdownMatch =
    text.match(
      /^\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)$/
    )


  if (
    markdownMatch
  ) {
    return (
      markdownMatch[2] ||
      markdownMatch[1]
    )
  }


  return text
}


// ============================================================
// NORMALIZE PIN
// ============================================================

function normalizePinRecord(
  record
) {
  return {
    ...record,

    sourceUrl:
      normalizeSourceUrl(
        record.sourceUrl
      ),

    imageUrl:
      normalizeSourceUrl(
        record.imageUrl
      ),

    pinPositionMode:
      record.pinPositionMode ||
      'auto',

    searchedLongitude:
      record.searchedLongitude ??
      record.longitude ??
      null,

    searchedLatitude:
      record.searchedLatitude ??
      record.latitude ??
      null,
  }
}


// ============================================================
// NORMALIZE HISTORIC
// ============================================================

function normalizeHistoricRecord(
  record
) {
  if (
    record.type !==
    'historic'
  ) {
    return record
  }


  const pinRecord =
    normalizePinRecord(
      record
    )


  const existingYear =
    pinRecord.year ||
    pinRecord.startYear ||
    ''


  return {
    ...EMPTY_HISTORIC,
    ...pinRecord,

    timeMode:
      pinRecord.timeMode ||
      'event',

    year:
      existingYear,

    startYear:
      pinRecord.startYear ||
      (
        pinRecord.timeMode ===
          'range' ||
        pinRecord.timeMode ===
          'present'
          ? existingYear
          : ''
      ),

    layerPlacementMode:
      pinRecord.layerPlacementMode ||
      'auto',

    layerOverrideType:
      pinRecord.layerOverrideType ||
      '',

    layerOverrideYear:
      pinRecord.layerOverrideYear ||
      '',

    pinPositionMode:
      pinRecord.pinPositionMode ||
      'auto',

    searchedLongitude:
      pinRecord.searchedLongitude ??
      pinRecord.longitude ??
      null,

    searchedLatitude:
      pinRecord.searchedLatitude ??
      pinRecord.latitude ??
      null,
  }
}


// ============================================================
// COMPONENT
// ============================================================

function AdminRoom() {
  const cityKeys =
    Object.keys(
      CITIES
    )


  const initialCityKey =
    cityKeys.includes(
      'toronto'
    )
      ? 'toronto'
      : cityKeys[0]


  const [
    cityKey,
    setCityKey,
  ] =
    useState(
      initialCityKey
    )


  const city =
    CITIES[
      cityKey
    ]


  const historicalLayers =
    useMemo(
      () =>
        getHistoricalLayers(
          city
        ),
      [
        city,
      ]
    )


  const [
    tab,
    setTab,
  ] =
    useState(
      'news'
    )


  const [
    reviewRange,
    setReviewRange,
  ] =
    useState(
      '30'
    )


  const [
    newsroomSourceFilter,
    setNewsroomSourceFilter,
  ] =
    useState(
      'all'
    )


  const [
    newsroomActionFilter,
    setNewsroomActionFilter,
  ] =
    useState(
      'all'
    )


  const [
    publishedNewsSourceFilter,
    setPublishedNewsSourceFilter,
  ] =
    useState(
      'all'
    )


  const [
    publishedNewsStatusFilter,
    setPublishedNewsStatusFilter,
  ] =
    useState(
      'live'
    )


  const [
    publishedNewsSort,
    setPublishedNewsSort,
  ] =
    useState(
      'activity'
    )


  const [
    publishedNewsSearch,
    setPublishedNewsSearch,
  ] =
    useState(
      ''
    )


  const [
    newTypeFilter,
    setNewTypeFilter,
  ] =
    useState(
      'all'
    )


  const [
    newStatusFilter,
    setNewStatusFilter,
  ] =
    useState(
      'all'
    )


  const [
    allNewsItems,
    setAllNewsItems,
  ] =
    useState(
      () =>
        getNewsItems()
          .map(
            normalizePinRecord
          )
    )


  const [
    allNewItems,
    setAllNewItems,
  ] =
    useState(
      () =>
        getNewItems()
          .map(
            normalizePinRecord
          )
    )


  const [
    allHistoricItems,
    setAllHistoricItems,
  ] =
    useState(
      () =>
        getHistoricItems()
          .map(
            normalizeHistoricRecord
          )
    )


  const [
    allNewsReviewItems,
    setAllNewsReviewItems,
  ] =
    useState(
      () =>
        getNewsReviewItems()
          .map(
            normalizePinRecord
          )
    )


  const [
    allNewReviewItems,
    setAllNewReviewItems,
  ] =
    useState(
      () =>
        getNewReviewItems()
          .map(
            normalizePinRecord
          )
    )


  const newsItems =
    allNewsItems.filter(
      (record) =>
        belongsToCity(
          record,
          cityKey
        )
    )


  const newItems =
    allNewItems.filter(
      (record) =>
        belongsToCity(
          record,
          cityKey
        )
    )


  const historicItems =
    allHistoricItems.filter(
      (record) =>
        belongsToCity(
          record,
          cityKey
        )
    )


  const newsReviewItems =
    allNewsReviewItems.filter(
      (record) =>
        belongsToCity(
          record,
          cityKey
        )
    )


  const newReviewItems =
    allNewReviewItems.filter(
      (record) =>
        belongsToCity(
          record,
          cityKey
        )
    )


  const [
    draft,
    setDraft,
  ] =
    useState(
      () =>
        makeNewsDraft(
          initialCityKey
        )
    )


  const [
    editingId,
    setEditingId,
  ] =
    useState(null)


  const [
    editingReviewId,
    setEditingReviewId,
  ] =
    useState(null)


  const [
    approvingReviewId,
    setApprovingReviewId,
  ] =
    useState(null)


  const [
    scraperRunning,
    setScraperRunning,
  ] =
    useState(false)


  const [
    scraperResult,
    setScraperResult,
  ] =
    useState(null)


  const [
    scraperError,
    setScraperError,
  ] =
    useState('')


  const [
    tpsInboxRunning,
    setTpsInboxRunning,
  ] =
    useState(false)


  const [
    tpsInboxResult,
    setTpsInboxResult,
  ] =
    useState(null)


  const [
    tpsInboxError,
    setTpsInboxError,
  ] =
    useState('')


  const [
    recordsPanel,
    setRecordsPanel,
  ] =
    useState(
      'review'
    )


  const records =
    tab === 'news'
      ? newsItems
      : tab === 'new'
        ? newItems
        : historicItems


  const reviewItems =
    tab === 'news'
      ? newsReviewItems
      : tab === 'new'
        ? newReviewItems
        : []


  const scraperAvailable =
    hasCityScraper({
      cityKey,

      type:
        tab,
    })


  const historicPlacement =
    useMemo(
      () => {
        if (
          tab !==
          'historic'
        ) {
          return null
        }


        return getHistoricPlacementSummary({
          city,

          record:
            draft,
        })
      },
      [
        tab,
        city,
        draft,
      ]
    )


  const attentionByCity =
    useMemo(
      () => {
        return cityKeys
          .map(
            (key) => {
              const news =
                allNewsReviewItems.filter(
                  (record) =>
                    belongsToCity(
                      record,
                      key
                    )
                )
                  .length


              const newCount =
                allNewReviewItems.filter(
                  (record) =>
                    belongsToCity(
                      record,
                      key
                    )
                )
                  .length


              return {
                cityKey:
                  key,

                city:
                  CITIES[
                    key
                  ],

                news,

                newCount,

                total:
                  news +
                  newCount,
              }
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              b.total -
              a.total
          )
      },
      [
        allNewsReviewItems,
        allNewReviewItems,
        cityKeys,
      ]
    )


  const sortedRecords =
    useMemo(
      () => {
        return [
          ...records,
        ]
          .sort(
            (
              a,
              b
            ) => {
              if (
                tab ===
                'historic'
              ) {
                return (
                  getHistoricAnchorYear(
                    b
                  ) -
                  getHistoricAnchorYear(
                    a
                  )
                )
              }


              const dateA =
                getPublishedActivityTimestamp(
                  a,
                  tab
                )


              const dateB =
                getPublishedActivityTimestamp(
                  b,
                  tab
                )


              return (
                dateB -
                dateA
              )
            }
          )
      },
      [
        records,
        tab,
      ]
    )


  // ==========================================================
  // PUBLISHED NEWS DESK
  // ==========================================================

  const publishedNewsSourceCounts =
    useMemo(
      () => {
        const counts = {
          all:
            0,

          police:
            0,

          fire:
            0,

          transit:
            0,

          other:
            0,
        }


        if (
          tab !==
            'news'
        ) {
          return counts
        }


        sortedRecords.forEach(
          (
            record
          ) => {
            counts.all++


            const key =
              getNewsroomSourceKey(
                record
              )


            if (
              Object.prototype.hasOwnProperty.call(
                counts,
                key
              )
            ) {
              counts[
                key
              ]++
            }
          }
        )


        return counts
      },
      [
        tab,
        sortedRecords,
      ]
    )


  const publishedNewsStatusCounts =
    useMemo(
      () => {
        const sourceFiltered =
          tab ===
            'news' &&
          publishedNewsSourceFilter !==
            'all'
            ? sortedRecords.filter(
                (
                  record
                ) =>
                  newsroomRecordMatchesSource(
                    record,
                    publishedNewsSourceFilter
                  )
              )
            : sortedRecords


        return {
          all:
            sourceFiltered.length,

          live:
            sourceFiltered.filter(
              (
                record
              ) =>
                record.active !==
                  false
            )
              .length,

          unpublished:
            sourceFiltered.filter(
              (
                record
              ) =>
                record.active ===
                  false
            )
              .length,
        }
      },
      [
        tab,
        sortedRecords,
        publishedNewsSourceFilter,
      ]
    )


  const filteredPublishedRecords =
    useMemo(
      () => {
        let next = [
          ...sortedRecords,
        ]


        if (
          tab ===
            'news' &&
          publishedNewsSourceFilter !==
            'all'
        ) {
          next =
            next.filter(
              (
                record
              ) =>
                newsroomRecordMatchesSource(
                  record,
                  publishedNewsSourceFilter
                )
            )
        }


        if (
          tab ===
            'news' &&
          publishedNewsStatusFilter ===
            'live'
        ) {
          next =
            next.filter(
              (
                record
              ) =>
                record.active !==
                  false
            )
        }
        else if (
          tab ===
            'news' &&
          publishedNewsStatusFilter ===
            'unpublished'
        ) {
          next =
            next.filter(
              (
                record
              ) =>
                record.active ===
                  false
            )
        }


        const search =
          String(
            publishedNewsSearch ||
            ''
          )
            .trim()
            .toLowerCase()


        if (
          tab ===
            'news' &&
          search
        ) {
          next =
            next.filter(
              (
                record
              ) =>
                [
                  record.title,
                  record.description,
                  record.location,
                  record.intersection,
                  record.source,
                  record.category,
                  record.caseNumber,
                  record.incidentNumber,
                  record.ttcRoutes,
                ]
                  .flat()
                  .filter(
                    Boolean
                  )
                  .join(
                    ' '
                  )
                  .toLowerCase()
                  .includes(
                    search
                  )
            )
        }


        if (
          tab ===
            'news'
        ) {
          next.sort(
            (
              a,
              b
            ) => {
              if (
                publishedNewsSort ===
                  'newest'
              ) {
                return (
                  new Date(
                    getNewsSourceTimestamp(
                      b
                    ) ||
                    0
                  )
                    .getTime() -
                  new Date(
                    getNewsSourceTimestamp(
                      a
                    ) ||
                    0
                  )
                    .getTime()
                )
              }


              if (
                publishedNewsSort ===
                  'expires'
              ) {
                const aExpiry =
                  new Date(
                    getNewsExpiresAt(
                      a
                    ) ||
                    '9999-12-31T23:59:59.999Z'
                  )
                    .getTime()


                const bExpiry =
                  new Date(
                    getNewsExpiresAt(
                      b
                    ) ||
                    '9999-12-31T23:59:59.999Z'
                  )
                    .getTime()


                return (
                  aExpiry -
                  bExpiry
                )
              }


              if (
                publishedNewsSort ===
                  'title'
              ) {
                return String(
                  a.title ||
                  ''
                )
                  .localeCompare(
                    String(
                      b.title ||
                      ''
                    )
                  )
              }


              return (
                getPublishedActivityTimestamp(
                  b,
                  tab
                ) -
                getPublishedActivityTimestamp(
                  a,
                  tab
                )
              )
            }
          )
        }


        return next
      },
      [
        tab,
        sortedRecords,
        publishedNewsSourceFilter,
        publishedNewsStatusFilter,
        publishedNewsSort,
        publishedNewsSearch,
      ]
    )


  // ==========================================================
  // FILTERED REVIEW ITEMS
  // ==========================================================

  const filteredReviewItems =
    useMemo(
      () => {
        return reviewItems
          .filter(
            (record) =>
              reviewRecordMatchesRange({
                record,

                tab,

                range:
                  reviewRange,
              })
          )
          .filter(
            (record) => {
              if (
                tab !==
                  'news'
              ) {
                return true
              }


              return newsroomRecordMatchesSource(
                record,
                newsroomSourceFilter
              )
            }
          )
          .filter(
            (record) => {
              if (
                tab !==
                  'news'
              ) {
                return true
              }


              return newsroomRecordMatchesAction(
                record,
                newsroomActionFilter
              )
            }
          )
          .filter(
            (record) => {
              if (
                tab !==
                'new'
              ) {
                return true
              }


              return newRecordMatchesType(
                record,
                newTypeFilter
              )
            }
          )
          .filter(
            (record) => {
              if (
                tab !==
                'new'
              ) {
                return true
              }


              return newRecordMatchesStatus(
                record,
                newStatusFilter
              )
            }
          )
          .sort(
            (
              a,
              b
            ) => {
              const dateA =
                getDateTimestamp(
                  getRecordReviewDate(
                    a,
                    tab
                  )
                ) ||
                0


              const dateB =
                getDateTimestamp(
                  getRecordReviewDate(
                    b,
                    tab
                  )
                ) ||
                0


              return (
                dateB -
                dateA
              )
            }
          )
      },
      [
        reviewItems,
        reviewRange,
        newsroomSourceFilter,
        newsroomActionFilter,
        newTypeFilter,
        newStatusFilter,
        tab,
      ]
    )


  // ==========================================================
  // NEWSROOM SOURCE COUNTS
  // ==========================================================

  const newsroomSourceCounts =
    useMemo(
      () => {
        const counts = {
          all:
            0,

          police:
            0,

          fire:
            0,

          transit:
            0,

          other:
            0,
        }


        if (
          tab !==
            'news'
        ) {
          return counts
        }


        const dateFiltered =
          reviewItems.filter(
            (record) =>
              reviewRecordMatchesRange({
                record,

                tab,

                range:
                  reviewRange,
              })
          )


        dateFiltered.forEach(
          (
            record
          ) => {
            counts.all++


            const key =
              getNewsroomSourceKey(
                record
              )


            if (
              Object.prototype.hasOwnProperty.call(
                counts,
                key
              )
            ) {
              counts[
                key
              ]++
            }
          }
        )


        return counts
      },
      [
        tab,
        reviewItems,
        reviewRange,
      ]
    )


  // ==========================================================
  // NEWSROOM ACTION COUNTS
  // ==========================================================

  const newsroomActionCounts =
    useMemo(
      () => {
        const counts = {
          all:
            0,

          new:
            0,

          update:
            0,

          resolve:
            0,
        }


        if (
          tab !==
            'news'
        ) {
          return counts
        }


        reviewItems
          .filter(
            (record) =>
              reviewRecordMatchesRange({
                record,

                tab,

                range:
                  reviewRange,
              })
          )
          .filter(
            (record) =>
              newsroomRecordMatchesSource(
                record,
                newsroomSourceFilter
              )
          )
          .forEach(
            (
              record
            ) => {
              counts.all++


              const action =
                getNewsroomAction(
                  record
                )


              if (
                Object.prototype.hasOwnProperty.call(
                  counts,
                  action
                )
              ) {
                counts[
                  action
                ]++
              }
            }
          )


        return counts
      },
      [
        tab,
        reviewItems,
        reviewRange,
        newsroomSourceFilter,
      ]
    )


  // ==========================================================
  // NEW TYPE COUNTS
  // ==========================================================

  const newTypeCounts =
    useMemo(
      () => {
        if (
          tab !==
          'new'
        ) {
          return {
            all:
              0,

            development:
              0,

            business:
              0,
          }
        }


        const dateFiltered =
          reviewItems.filter(
            (record) =>
              reviewRecordMatchesRange({
                record,

                tab,

                range:
                  reviewRange,
              })
          )


        const business =
          dateFiltered.filter(
            (record) =>
              newRecordMatchesType(
                record,
                'business'
              )
          )
            .length


        const development =
          dateFiltered.filter(
            (record) =>
              newRecordMatchesType(
                record,
                'development'
              )
          )
            .length


        return {
          all:
            dateFiltered.length,

          development,

          business,
        }
      },
      [
        tab,
        reviewItems,
        reviewRange,
      ]
    )


  // ==========================================================
  // NEW STATUS COUNTS
  // ==========================================================

  const newStatusCounts =
    useMemo(
      () => {
        const emptyCounts = {
          all:
            0,

          proposed:
            0,

          approved:
            0,

          construction:
            0,

          cancelled:
            0,

          'opening-soon':
            0,

          open:
            0,
        }


        if (
          tab !==
          'new'
        ) {
          return emptyCounts
        }


        const dateAndTypeFiltered =
          reviewItems
            .filter(
              (record) =>
                reviewRecordMatchesRange({
                  record,

                  tab,

                  range:
                    reviewRange,
                })
            )
            .filter(
              (record) =>
                newRecordMatchesType(
                  record,
                  newTypeFilter
                )
            )


        const counts = {
          ...emptyCounts,

          all:
            dateAndTypeFiltered.length,
        }


        dateAndTypeFiltered.forEach(
          (record) => {
            const status =
              String(
                record.status ||
                'proposed'
              )
                .toLowerCase()


            if (
              Object.prototype.hasOwnProperty.call(
                counts,
                status
              )
            ) {
              counts[
                status
              ]++
            }
          }
        )


        return counts
      },
      [
        tab,
        reviewItems,
        reviewRange,
        newTypeFilter,
      ]
    )


  // ==========================================================
  // GROUP REVIEW ITEMS BY DATE
  // ==========================================================

  const groupedReviewItems =
    useMemo(
      () => {
        const groups =
          []


        const groupMap =
          new Map()


        filteredReviewItems.forEach(
          (record) => {
            const key =
              dateKey(
                getRecordReviewDate(
                  record,
                  tab
                )
              )


            if (
              !groupMap.has(
                key
              )
            ) {
              const group = {
                key,

                label:
                  formatReviewDateHeading(
                    key
                  ),

                records:
                  [],
              }


              groupMap.set(
                key,
                group
              )


              groups.push(
                group
              )
            }


            groupMap
              .get(
                key
              )
              .records
              .push(
                record
              )
          }
        )


        return groups
      },
      [
        filteredReviewItems,
        tab,
      ]
    )


  // ==========================================================
  // TPS NEWSROOM INBOX
  // ==========================================================

  async function syncTpsNewsroom({
    silent =
      false,
  } = {}) {
    if (
      !silent &&
      tpsInboxRunning
    ) {
      return
    }


    if (
      !silent
    ) {
      setTpsInboxRunning(
        true
      )


      setTpsInboxError(
        ''
      )
    }


    try {
      const response =
        await fetch(
          TPS_NEWSROOM_ENDPOINT,
          {
            method:
              'GET',

            headers: {
              Accept:
                'application/json',
            },
          }
        )


      if (
        !response.ok
      ) {
        throw new Error(
          (
            'TPS newsroom request failed · ' +
            response.status
          )
        )
      }


      const payload =
        await response.json()


      const incoming =
        Array.isArray(
          payload?.records
        )
          ? payload.records
          : []


      const latestAllReview =
        getNewsReviewItems()
          .map(
            normalizePinRecord
          )


      const latestPublished =
        getNewsItems()
          .map(
            normalizePinRecord
          )


      const torontoReview =
        latestAllReview.filter(
          (
            record
          ) =>
            belongsToCity(
              record,
              'toronto'
            )
        )


      const otherReview =
        latestAllReview.filter(
          (
            record
          ) =>
            !belongsToCity(
              record,
              'toronto'
            )
        )


      let nextTorontoReview = [
        ...torontoReview,
      ]


      let nextPublished = [
        ...latestPublished,
      ]


      let publishedTouched =
        false


      let added =
        0


      let updated =
        0


      let refreshed =
        0


      let skipped =
        0


      incoming.forEach(
        (
          rawIncomingRecord
        ) => {
          if (
            !rawIncomingRecord ||
            rawIncomingRecord.city !==
              'toronto' ||
            rawIncomingRecord.type !==
              'news' ||
            rawIncomingRecord.trustedSender ===
              false
          ) {
            skipped++


            return
          }


          const existingReviewIndex =
            nextTorontoReview.findIndex(
              (
                reviewRecord
              ) =>
                isTpsNewsroomRecord(
                  reviewRecord
                ) &&
                sameTpsIncident(
                  reviewRecord,
                  rawIncomingRecord
                )
            )


          const matchingPublishedIndex =
            nextPublished.findIndex(
              (
                publishedRecord
              ) =>
                belongsToCity(
                  publishedRecord,
                  'toronto'
                ) &&
                isTpsNewsroomRecord(
                  publishedRecord
                ) &&
                sameTpsIncident(
                  publishedRecord,
                  rawIncomingRecord
                )
            )


          let matchingPublished =
            matchingPublishedIndex >=
              0
              ? nextPublished[
                  matchingPublishedIndex
                ]
              : null


          const serverAction =
            rawIncomingRecord.action ||
            'review'


          const requestedNewsroomAction =
            rawIncomingRecord.newsroomAction ||
            (
              rawIncomingRecord.category ===
                'located'
                ? 'resolve'
                : ''
            )


          const isResolve =
            requestedNewsroomAction ===
              'resolve' ||
            rawIncomingRecord.category ===
              'located'


          // --------------------------------------------------
          // EXISTING PUBLISHED TPS PIN · SILENT CHECK
          // --------------------------------------------------
          //
          // Same incident + same meaningful source content:
          //   update lastSeenAt / lastCheckedAt ONLY.
          //
          // Timestamps never create a NEWSROOM UPDATE.
          //
          // Old pins without a sourceSnapshot establish their
          // first baseline silently.
          //
          // --------------------------------------------------

          let meaningfulChanges =
            matchingPublished
              ? getOfficialSourceChanges(
                  matchingPublished,
                  rawIncomingRecord
                )
              : []


          const hadSourceBaseline =
            Boolean(
              matchingPublished?.sourceSnapshot
            )


          if (
            matchingPublished
          ) {
            const now =
              new Date()
                .toISOString()


            const observedPublished = {
              ...matchingPublished,

              firstSeenAt:
                matchingPublished.firstSeenAt ||
                now,

              lastSeenAt:
                now,

              lastCheckedAt:
                now,
            }


            if (
              !hadSourceBaseline
            ) {
              observedPublished.sourceSnapshot =
                buildNewsroomSourceSnapshot(
                  rawIncomingRecord
                )


              observedPublished.sourceFingerprint =
                getNewsroomSourceFingerprint(
                  rawIncomingRecord
                )


              observedPublished.sourceUpdatedAt =
                matchingPublished.sourceUpdatedAt ||
                matchingPublished.firstSeenAt ||
                now


              meaningfulChanges =
                []
            }


            nextPublished[
              matchingPublishedIndex
            ] =
              observedPublished


            matchingPublished =
              observedPublished


            publishedTouched =
              true
          }


          // --------------------------------------------------
          // EXACT VERSION ALREADY HANDLED
          // --------------------------------------------------
          //
          // This key is content-based now. A new email timestamp
          // with identical content does not create a new version.
          //
          // --------------------------------------------------

          if (
            existingReviewIndex <
              0 &&
            hasProcessedTpsVersion(
              rawIncomingRecord
            ) &&
            !isResolve
          ) {
            skipped++


            return
          }


          // --------------------------------------------------
          // PUBLISHED + NO MEANINGFUL CHANGE
          // --------------------------------------------------

          if (
            matchingPublished &&
            !isResolve &&
            meaningfulChanges.length ===
              0
          ) {
            skipped++


            return
          }


          const existingReview =
            existingReviewIndex >=
              0
              ? nextTorontoReview[
                  existingReviewIndex
                ]
              : null


          const newsroomAction =
            isResolve
              ? 'resolve'
              : matchingPublished
                ? 'update'
                : 'new'


          const comparisonRecord =
            matchingPublished ||
            existingReview ||
            null


          const stampedIncoming =
            stampIncomingOfficialRecord({
              incomingRecord:
                normalizePinRecord(
                  rawIncomingRecord
                ),

              previousRecord:
                comparisonRecord,

              meaningfulChange:
                Boolean(
                  matchingPublished &&
                  meaningfulChanges.length >
                    0
                ),
            })


          const normalized = {
            ...existingReview,
            ...stampedIncoming,

            id:
              existingReview?.id ||
              createAdminId(
                'news-review'
              ),

            city:
              'toronto',

            type:
              'news',

            active:
              false,

            origin:
              'tps-email',

            newsroomSource:
              'tps-email',

            newsroomAction,

            serverAction,

            previousRecord:
              matchingPublished ||
              existingReview?.previousRecord ||
              null,

            incomingRecord:
              stampedIncoming,

            changedFields:
              matchingPublished
                ? meaningfulChanges
                : [],

            newsroomVersion:
              getTpsRecordVersion(
                rawIncomingRecord
              ),

            imageUrl:
              normalizeSourceUrl(
                rawIncomingRecord.imageUrl ||
                existingReview?.imageUrl ||
                matchingPublished?.imageUrl ||
                ''
              ),

            reviewStatus:
              'pending',

            receivedAt:
              existingReview?.receivedAt ||
              stampedIncoming.firstSeenAt,
          }


          if (
            existingReviewIndex >=
              0
          ) {
            const previousFingerprint =
              existingReview.sourceFingerprint ||
              getNewsroomSourceFingerprint(
                existingReview.incomingRecord ||
                existingReview
              )


            const nextFingerprint =
              normalized.sourceFingerprint ||
              getNewsroomSourceFingerprint(
                normalized.incomingRecord ||
                normalized
              )


            nextTorontoReview[
              existingReviewIndex
            ] =
              normalized


            if (
              previousFingerprint !==
                nextFingerprint ||
              existingReview.newsroomAction !==
                normalized.newsroomAction
            ) {
              if (
                newsroomAction ===
                  'update' ||
                newsroomAction ===
                  'resolve'
              ) {
                updated++
              }
              else {
                refreshed++
              }
            }
            else {
              refreshed++
            }


            return
          }


          nextTorontoReview.unshift(
            normalized
          )


          if (
            newsroomAction ===
              'update' ||
            newsroomAction ===
              'resolve'
          ) {
            updated++
          }
          else {
            added++
          }
        }
      )


      if (
        publishedTouched
      ) {
        saveNewsItems(
          nextPublished
        )


        setAllNewsItems(
          nextPublished
        )
      }


      const nextAllReview = [
        ...nextTorontoReview,
        ...otherReview,
      ]


      saveNewsReviewItems(
        nextAllReview
      )


      setAllNewsReviewItems(
        nextAllReview
      )


      setTpsInboxResult({
        received:
          incoming.length,

        added,

        updated,

        refreshed,

        skipped,

        checkedAt:
          new Date()
            .toISOString(),
      })


      if (
        !silent
      ) {
        setTpsInboxError(
          ''
        )
      }
    }
    catch (
      error
    ) {
      console.error(
        'TPS NEWSROOM SYNC ERROR:',
        error
      )


      if (
        !silent
      ) {
        setTpsInboxError(
          error?.message ||
          'TPS newsroom sync failed.'
        )
      }
    }
    finally {
      if (
        !silent
      ) {
        setTpsInboxRunning(
          false
        )
      }
    }
  }


  // ==========================================================
  // PERSISTENT SERVER NEWSROOM
  // ==========================================================
  //
  // The browser no longer collects TTC / Fire / Police.
  //
  // The server does that independently and writes every NEW / UPDATE /
  // RESOLVE event to server/data/toronto-live-newsroom.json.
  //
  // Admin Room only pulls pending editorial work from that queue.
  //
  // ==========================================================

  async function acknowledgePersistentNewsroom({
    record,
    outcome,
  }) {
    const queueId =
      record?.serverQueueId ||
      (
        String(
          record?.id ||
          ''
        )
          .startsWith(
            'live-newsroom-'
          )
          ? record.id
          : ''
      )


    if (
      !queueId
    ) {
      return
    }


    try {
      await fetch(
        PERSISTENT_NEWSROOM_ACK_ENDPOINT,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json',
          },

          body:
            JSON.stringify({
              ids: [
                queueId,
              ],

              outcome,

              record,
            }),
        }
      )
    }
    catch (
      error
    ) {
      console.warn(
        'PERSISTENT NEWSROOM ACK FAILED:',
        error
      )
    }
  }


  async function logPersistentNewsAction({
    action,
    record,
  }) {
    if (
      cityKey !==
        'toronto' ||
      tab !==
        'news' ||
      !record
    ) {
      return
    }


    try {
      await fetch(
        PERSISTENT_NEWSROOM_LOG_ENDPOINT,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json',
          },

          body:
            JSON.stringify({
              action,
              record,
            }),
        }
      )
    }
    catch (
      error
    ) {
      console.warn(
        'PERSISTENT NEWS LEDGER LOG FAILED:',
        error
      )
    }
  }


  // ==========================================================
  // SERVER-OWNED PUBLISHED NEWS
  // ==========================================================
  //
  // Toronto NEWS is now canonical on the server.
  //
  // Browser storage remains as a local cache so the existing Admin Room
  // and map code can keep working while the public map is migrated.
  //
  // ==========================================================

  async function postPublishedNewsRecords(
    records
  ) {
    const normalizedRecords =
      (
        Array.isArray(
          records
        )
          ? records
          : [
              records,
            ]
      )
        .filter(
          Boolean
        )
        .map(
          normalizePinRecord
        )


    if (
      normalizedRecords.length ===
        0
    ) {
      return []
    }


    const response =
      await fetch(
        PUBLISHED_NEWS_UPSERT_ENDPOINT,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            Accept:
              'application/json',
          },

          body:
            JSON.stringify({
              records:
                normalizedRecords,
            }),
        }
      )


    const payload =
      await response.json()


    if (
      !response.ok ||
      payload?.ok !==
        true
    ) {
      throw new Error(
        payload?.error ||
        (
          'Published NEWS save failed · ' +
          response.status
        )
      )
    }


    return (
      Array.isArray(
        payload.records
      )
        ? payload.records
            .map(
              normalizePinRecord
            )
        : normalizedRecords
    )
  }


  async function publishNewsRecordOnServer(
    record,
    {
      silent =
        false,
    } = {}
  ) {
    try {
      const records =
        await postPublishedNewsRecords(
          [
            record,
          ]
        )


      return (
        records[0] ||
        normalizePinRecord(
          record
        )
      )
    }
    catch (
      error
    ) {
      console.error(
        'PUBLISHED NEWS SERVER SAVE FAILED:',
        error
      )


      if (
        !silent
      ) {
        window.alert(
          'Could not save this NEWS pin to the server. Nothing was published. Please try again.'
        )
      }


      return null
    }
  }


  async function archiveNewsRecordOnServer(
    record,
    reason =
      'removed-from-live-map',
    {
      silent =
        false,
    } = {}
  ) {
    if (
      !record
    ) {
      return null
    }


    try {
      const response =
        await fetch(
          PUBLISHED_NEWS_ARCHIVE_ENDPOINT,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json',
            },

            body:
              JSON.stringify({
                id:
                  record.id ||
                  '',

                externalId:
                  record.externalId ||
                  '',

                record,

                reason,
              }),
          }
        )


      const payload =
        await response.json()


      if (
        !response.ok ||
        payload?.ok !==
          true ||
        !payload?.record
      ) {
        throw new Error(
          payload?.error ||
          (
            'Published NEWS archive failed · ' +
            response.status
          )
        )
      }


      return normalizePinRecord(
        payload.record
      )
    }
    catch (
      error
    ) {
      console.error(
        'PUBLISHED NEWS SERVER ARCHIVE FAILED:',
        error
      )


      if (
        !silent
      ) {
        window.alert(
          'Could not update this NEWS pin on the server. The live map was not changed. Please try again.'
        )
      }


      return null
    }
  }


  async function refreshPublishedNewsFromServer({
    allowBootstrap =
      true,
  } = {}) {
    try {
      const response =
        await fetch(
          (
            PUBLISHED_NEWS_ENDPOINT +
            '?status=all'
          ),
          {
            method:
              'GET',

            headers: {
              Accept:
                'application/json',
            },
          }
        )


      const payload =
        await response.json()


      if (
        !response.ok ||
        payload?.ok !==
          true
      ) {
        throw new Error(
          payload?.error ||
          (
            'Published NEWS request failed · ' +
            response.status
          )
        )
      }


      let serverRecords =
        Array.isArray(
          payload.records
        )
          ? payload.records
              .map(
                normalizePinRecord
              )
          : []


      const latestLocal =
        getNewsItems()
          .map(
            normalizePinRecord
          )


      const localToronto =
        latestLocal.filter(
          (
            record
          ) =>
            belongsToCity(
              record,
              'toronto'
            )
        )


      const otherCities =
        latestLocal.filter(
          (
            record
          ) =>
            !belongsToCity(
              record,
              'toronto'
            )
        )


      // One-time migration:
      //
      // If the new server store is still empty, preserve the Toronto NEWS
      // already published in this browser by seeding the server with it.
      if (
        allowBootstrap &&
        serverRecords.length ===
          0 &&
        localToronto.length >
          0
      ) {
        serverRecords =
          await postPublishedNewsRecords(
            localToronto
          )
      }


      const nextAll = [
        ...serverRecords,
        ...otherCities,
      ]


      saveNewsItems(
        nextAll
      )


      setAllNewsItems(
        nextAll
      )


      return serverRecords
    }
    catch (
      error
    ) {
      console.warn(
        'PUBLISHED NEWS SERVER REFRESH FAILED:',
        error
      )


      return null
    }
  }


  async function pullPersistentNewsroom({
    silent =
      false,
  } = {}) {
    try {
      const response =
        await fetch(
          PERSISTENT_NEWSROOM_PENDING_ENDPOINT,
          {
            method:
              'GET',

            headers: {
              Accept:
                'application/json',
            },
          }
        )


      if (
        !response.ok
      ) {
        throw new Error(
          (
            'Persistent newsroom request failed · ' +
            response.status
          )
        )
      }


      const payload =
        await response.json()


      const incoming =
        Array.isArray(
          payload?.records
        )
          ? payload.records
              .map(
                normalizePinRecord
              )
          : []


      const latestReview =
        getNewsReviewItems()
          .map(
            normalizePinRecord
          )


      const latestPublished =
        getNewsItems()
          .map(
            normalizePinRecord
          )


      const torontoReview =
        latestReview.filter(
          (
            record
          ) =>
            belongsToCity(
              record,
              'toronto'
            )
        )


      const otherReview =
        latestReview.filter(
          (
            record
          ) =>
            !belongsToCity(
              record,
              'toronto'
            )
        )


      let nextTorontoReview = [
        ...torontoReview,
      ]


      const autoAck = []


      incoming.forEach(
        (
          serverRecord
        ) => {
          if (
            !serverRecord ||
            serverRecord.city !==
              'toronto' ||
            serverRecord.type !==
              'news'
          ) {
            return
          }


          const queueId =
            serverRecord.serverQueueId ||
            serverRecord.id


          const action =
            getNewsroomAction(
              serverRecord
            )


          const externalId =
            String(
              serverRecord.externalId ||
              ''
            )
              .trim()


          const matchingPublished =
            externalId
              ? latestPublished.find(
                  (
                    record
                  ) =>
                    String(
                      record?.externalId ||
                      ''
                    ) ===
                    externalId
                ) ||
                null
              : null


          // The persistent server was introduced after some TTC / Fire
          // pins may already have been approved in browser storage.
          //
          // Reconcile those initial server NEW cards automatically instead
          // of asking the editor to publish the same pin twice.
          if (
            action ===
              'new' &&
            matchingPublished
          ) {
            autoAck.push(
              queueId
            )


            return
          }


          // A server RESOLVE for something that is not public is stale
          // editorial work. There is nothing for the editor to remove.
          if (
            action ===
              'resolve' &&
            !matchingPublished
          ) {
            autoAck.push(
              queueId
            )


            nextTorontoReview =
              nextTorontoReview.filter(
                (
                  record
                ) =>
                  !(
                    record.externalId ===
                      externalId &&
                    getNewsroomAction(
                      record
                    ) ===
                      'new'
                  )
              )


            return
          }


          const normalized = {
            ...serverRecord,

            id:
              queueId,

            serverQueueId:
              queueId,

            city:
              'toronto',

            type:
              'news',

            active:
              false,

            reviewStatus:
              'pending',

            newsroomAction:
              action,
          }


          const existingByQueue =
            nextTorontoReview.findIndex(
              (
                record
              ) =>
                (
                  record.serverQueueId ||
                  record.id
                ) ===
                queueId
            )


          if (
            existingByQueue >=
              0
          ) {
            nextTorontoReview[
              existingByQueue
            ] =
              normalized


            return
          }


          // One current pending card per source incident / action.
          //
          // This prevents an older local browser-poll card from sitting
          // beside the authoritative persistent server card.
          nextTorontoReview =
            nextTorontoReview.filter(
              (
                record
              ) =>
                !(
                  externalId &&
                  String(
                    record.externalId ||
                    ''
                  ) ===
                    externalId &&
                  getNewsroomAction(
                    record
                  ) ===
                    action
                )
            )


          nextTorontoReview.unshift(
            normalized
          )
        }
      )


      const nextAllReview = [
        ...nextTorontoReview,
        ...otherReview,
      ]


      saveNewsReviewItems(
        nextAllReview
      )


      setAllNewsReviewItems(
        nextAllReview
      )


      if (
        autoAck.length >
          0
      ) {
        try {
          await fetch(
            PERSISTENT_NEWSROOM_ACK_ENDPOINT,
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Accept:
                  'application/json',
              },

              body:
                JSON.stringify({
                  ids:
                    autoAck,

                  outcome:
                    'already-published',
                }),
            }
          )
        }
        catch (
          error
        ) {
          console.warn(
            'PERSISTENT NEWSROOM AUTO ACK FAILED:',
            error
          )
        }
      }


      if (
        !silent
      ) {
        setTpsInboxResult({
          received:
            incoming.length,

          added:
            incoming.filter(
              (
                record
              ) =>
                getNewsroomAction(
                  record
                ) ===
                  'new'
            )
              .length,

          updated:
            incoming.filter(
              (
                record
              ) =>
                getNewsroomAction(
                  record
                ) ===
                  'update' ||
                getNewsroomAction(
                  record
                ) ===
                  'resolve'
            )
              .length,

          refreshed:
            0,

          skipped:
            autoAck.length,

          checkedAt:
            new Date()
              .toISOString(),
        })
      }


      return payload
    }
    catch (
      error
    ) {
      console.error(
        'PERSISTENT NEWSROOM PULL ERROR:',
        error
      )


      if (
        !silent
      ) {
        setTpsInboxError(
          error?.message ||
          'Persistent newsroom sync failed.'
        )
      }


      return null
    }
  }


  useEffect(
    () => {
      let disposed =
        false


      async function pull() {
        if (
          disposed
        ) {
          return
        }


        await refreshPublishedNewsFromServer({
          allowBootstrap:
            true,
        })


        if (
          disposed
        ) {
          return
        }


        await pullPersistentNewsroom({
          silent:
            true,
        })
      }


      pull()


      const intervalId =
        window.setInterval(
          pull,
          PERSISTENT_NEWSROOM_PULL_MS
        )


      return () => {
        disposed =
          true


        window.clearInterval(
          intervalId
        )
      }
    },
    []
  )


  // ==========================================================
  // SYNC OFFICIAL TORONTO NEWS SOURCES
  // ==========================================================
  //
  // One control for the editor:
  //
  //   POLICE  → TPS inbox
  //   FIRE    → official active incidents
  //   TRANSIT → TTC GTFS-RT
  //
  // Keep the underlying pipelines separate; this is only a cleaner
  // Admin Room control.
  //
  // ==========================================================

  async function syncOfficialTorontoNews() {
    if (
      cityKey !==
        'toronto' ||
      tab !==
        'news' ||
      tpsInboxRunning
    ) {
      return
    }


    setTpsInboxRunning(
      true
    )


    setTpsInboxError(
      ''
    )


    try {
      const response =
        await fetch(
          PERSISTENT_NEWSROOM_SYNC_ENDPOINT,
          {
            method:
              'POST',

            headers: {
              Accept:
                'application/json',
            },
          }
        )


      if (
        !response.ok
      ) {
        throw new Error(
          (
            'Background newsroom sync failed · ' +
            response.status
          )
        )
      }


      await response.json()


      await refreshPublishedNewsFromServer({
        allowBootstrap:
          true,
      })


      await pullPersistentNewsroom()
    }
    catch (
      error
    ) {
      console.error(
        'BACKGROUND NEWSROOM MANUAL SYNC ERROR:',
        error
      )


      setTpsInboxError(
        error?.message ||
        'Background newsroom sync failed.'
      )
    }
    finally {
      setTpsInboxRunning(
        false
      )
    }
  }


  // ==========================================================
  // SCRAPER
  // ==========================================================

  async function updateCurrentCity() {
    if (
      scraperRunning ||
      !scraperAvailable
    ) {
      return
    }


    setScraperRunning(
      true
    )


    setScraperError(
      ''
    )


    setScraperResult(
      null
    )


    try {
      const result =
        await runCityScraper({
          cityKey,

          type:
            tab,
        })


      setAllNewsReviewItems(
        getNewsReviewItems()
          .map(
            normalizePinRecord
          )
      )


      setAllNewReviewItems(
        getNewReviewItems()
          .map(
            normalizePinRecord
          )
      )


      setScraperResult(
        result
      )
    } catch (
      error
    ) {
      console.error(
        'CITY SCRAPER ERROR:',
        error
      )


      setScraperError(
        error?.message ||
        `${city.name} scraper failed.`
      )
    } finally {
      setScraperRunning(
        false
      )
    }
  }


  // ==========================================================
  // CHANGE CITY
  // ==========================================================

  function changeCity(
    nextCityKey
  ) {
    if (
      !CITIES[
        nextCityKey
      ]
    ) {
      return
    }


    setScraperResult(
      null
    )


    setScraperError(
      ''
    )


    setReviewRange(
      '30'
    )


    setNewsroomSourceFilter(
      'all'
    )


    setNewsroomActionFilter(
      'all'
    )


    setPublishedNewsSourceFilter(
      'all'
    )


    setPublishedNewsStatusFilter(
      'live'
    )


    setPublishedNewsSort(
      'activity'
    )


    setPublishedNewsSearch(
      ''
    )


    setNewTypeFilter(
      'all'
    )


    setNewStatusFilter(
      'all'
    )


    setRecordsPanel(
      tab ===
      'historic'
        ? 'published'
        : 'review'
    )


    setCityKey(
      nextCityKey
    )


    setEditingId(
      null
    )


    setEditingReviewId(
      null
    )


    setDraft(
      makeDraft(
        tab,
        nextCityKey
      )
    )
  }


  // ==========================================================
  // CHANGE TAB
  // ==========================================================

  function changeTab(
    nextTab
  ) {
    setScraperResult(
      null
    )


    setScraperError(
      ''
    )


    setReviewRange(
      '30'
    )


    setNewsroomSourceFilter(
      'all'
    )


    setNewsroomActionFilter(
      'all'
    )


    setPublishedNewsSourceFilter(
      'all'
    )


    setPublishedNewsStatusFilter(
      'live'
    )


    setPublishedNewsSort(
      'activity'
    )


    setPublishedNewsSearch(
      ''
    )


    setNewTypeFilter(
      'all'
    )


    setNewStatusFilter(
      'all'
    )


    setRecordsPanel(
      nextTab ===
      'historic'
        ? 'published'
        : 'review'
    )


    setTab(
      nextTab
    )


    setEditingId(
      null
    )


    setEditingReviewId(
      null
    )


    setDraft(
      makeDraft(
        nextTab,
        cityKey
      )
    )
  }


  // ==========================================================
  // DRAFT
  // ==========================================================

  function updateDraft(
    field,
    value
  ) {
    setDraft(
      (
        current
      ) => ({
        ...current,

        [field]:
          value,
      })
    )
  }


  function resetDraft() {
    setEditingId(
      null
    )


    setEditingReviewId(
      null
    )


    setDraft(
      makeDraft(
        tab,
        cityKey
      )
    )
  }


  // ==========================================================
  // HISTORIC
  // ==========================================================

  function changeHistoricTimeMode(
    nextMode
  ) {
    setDraft(
      (
        current
      ) => {
        const anchorYear =
          current.year ||
          current.startYear ||
          ''


        if (
          nextMode ===
          'event'
        ) {
          return {
            ...current,

            timeMode:
              'event',

            year:
              anchorYear,

            startYear:
              '',

            endYear:
              '',
          }
        }


        if (
          nextMode ===
          'range'
        ) {
          return {
            ...current,

            timeMode:
              'range',

            year:
              anchorYear,

            startYear:
              anchorYear,

            endYear:
              current.endYear ||
              '',
          }
        }


        return {
          ...current,

          timeMode:
            'present',

          year:
            anchorYear,

          startYear:
            anchorYear,

          endYear:
            '',
        }
      }
    )
  }


  function changeHistoricEventYear(
    value
  ) {
    updateDraft(
      'year',
      value
    )
  }


  function changeHistoricStartYear(
    value
  ) {
    setDraft(
      (
        current
      ) => ({
        ...current,

        startYear:
          value,

        year:
          value,
      })
    )
  }


  function changeHistoricPlacementMode(
    mode
  ) {
    setDraft(
      (
        current
      ) => ({
        ...current,

        layerPlacementMode:
          mode,

        layerOverrideType:
          mode ===
          'auto'
            ? ''
            : current.layerOverrideType,

        layerOverrideYear:
          mode ===
          'auto'
            ? ''
            : current.layerOverrideYear,
      })
    )
  }


  function changeHistoricManualLayer(
    value
  ) {
    const [
      layerType,
      year,
    ] =
      String(
        value
      )
        .split(':')


    setDraft(
      (
        current
      ) => ({
        ...current,

        layerOverrideType:
          layerType ||
          '',

        layerOverrideYear:
          year ||
          '',
      })
    )
  }


  // ==========================================================
  // PIN POSITION
  // ==========================================================

  function changePinPositionMode(
    mode
  ) {
    setDraft(
      (
        current
      ) => {
        if (
          mode ===
          'auto'
        ) {
          return {
            ...current,

            pinPositionMode:
              'auto',

            longitude:
              current.searchedLongitude ??
              current.longitude,

            latitude:
              current.searchedLatitude ??
              current.latitude,
          }
        }


        return {
          ...current,

          pinPositionMode:
            'custom',
        }
      }
    )
  }


  function changeCustomPinPosition({
    longitude,
    latitude,
  }) {
    setDraft(
      (
        current
      ) => ({
        ...current,

        longitude,

        latitude,

        pinPositionMode:
          'custom',
      })
    )
  }


  // ==========================================================
  // LOCATION
  // ==========================================================

  function changeLocationSearch(
    value
  ) {
    setDraft(
      (
        current
      ) => {
        const keepCustomPin =
          current.pinPositionMode ===
            'custom' &&
          hasRecordCoordinates(
            current
          )


        return {
          ...current,

          location:
            value,

          intersection:
            '',

          longitude:
            keepCustomPin
              ? current.longitude
              : null,

          latitude:
            keepCustomPin
              ? current.latitude
              : null,

          searchedLongitude:
            null,

          searchedLatitude:
            null,

          pinPositionMode:
            keepCustomPin
              ? 'custom'
              : 'auto',

          locationOverridden:
            true,
        }
      }
    )
  }


  function selectLocation(
    result
  ) {
    const longitude =
      Number(
        result.longitude
      )


    const latitude =
      Number(
        result.latitude
      )


    setDraft(
      (
        current
      ) => {
        const keepCustomPin =
          current.pinPositionMode ===
            'custom' &&
          hasRecordCoordinates(
            current
          )


        return {
          ...current,

          location:
            result.location ||
            result.name,

          intersection:
            result.intersection ||
            result.name,

          searchedLongitude:
            longitude,

          searchedLatitude:
            latitude,

          longitude:
            keepCustomPin
              ? current.longitude
              : longitude,

          latitude:
            keepCustomPin
              ? current.latitude
              : latitude,

          pinPositionMode:
            keepCustomPin
              ? 'custom'
              : 'auto',

          locationOverridden:
            true,
        }
      }
    )
  }


  // ==========================================================
  // PERSIST PUBLISHED
  // ==========================================================

  function persistRecords(
    nextCityRecords
  ) {
    if (
      tab ===
      'news'
    ) {
      const latestAll =
        getNewsItems()
          .map(
            normalizePinRecord
          )


      const nextAll =
        replaceCityRecords({
          allRecords:
            latestAll,

          cityKey,

          nextCityRecords,
        })


      setAllNewsItems(
        nextAll
      )


      saveNewsItems(
        nextAll
      )


      return
    }


    if (
      tab ===
      'new'
    ) {
      const latestAll =
        getNewItems()
          .map(
            normalizePinRecord
          )


      const nextAll =
        replaceCityRecords({
          allRecords:
            latestAll,

          cityKey,

          nextCityRecords,
        })


      setAllNewItems(
        nextAll
      )


      saveNewItems(
        nextAll
      )


      return
    }


    const latestAll =
      getHistoricItems()
        .map(
          normalizeHistoricRecord
        )


    const nextAll =
      replaceCityRecords({
        allRecords:
          latestAll,

        cityKey,

        nextCityRecords,
      })


    setAllHistoricItems(
      nextAll
    )


    saveHistoricItems(
      nextAll
    )
  }


  // ==========================================================
  // PERSIST REVIEW
  // ==========================================================

  function persistReview(
    nextCityReview
  ) {
    if (
      tab ===
      'news'
    ) {
      const latestAll =
        getNewsReviewItems()
          .map(
            normalizePinRecord
          )


      const nextAll =
        replaceCityRecords({
          allRecords:
            latestAll,

          cityKey,

          nextCityRecords:
            nextCityReview,
        })


      setAllNewsReviewItems(
        nextAll
      )


      saveNewsReviewItems(
        nextAll
      )


      return
    }


    if (
      tab ===
      'new'
    ) {
      const latestAll =
        getNewReviewItems()
          .map(
            normalizePinRecord
          )


      const nextAll =
        replaceCityRecords({
          allRecords:
            latestAll,

          cityKey,

          nextCityRecords:
            nextCityReview,
        })


      setAllNewReviewItems(
        nextAll
      )


      saveNewReviewItems(
        nextAll
      )
    }
  }


  // ==========================================================
  // BUILD RECORD
  // ==========================================================

  function buildRecord() {
    const title =
      String(
        draft.title ||
        ''
      )
        .trim()


    if (
      !title
    ) {
      window.alert(
        'Add a title first.'
      )


      return null
    }


    let record = {
      ...draft,

      title,

      city:
        cityKey,

      sourceUrl:
        normalizeSourceUrl(
          draft.sourceUrl
        ),

      imageUrl:
        normalizeSourceUrl(
          draft.imageUrl
        ),

      longitude:
        Number.isFinite(
          Number(
            draft.longitude
          )
        )
          ? Number(
              draft.longitude
            )
          : null,

      latitude:
        Number.isFinite(
          Number(
            draft.latitude
          )
        )
          ? Number(
              draft.latitude
            )
          : null,

      searchedLongitude:
        Number.isFinite(
          Number(
            draft.searchedLongitude
          )
        )
          ? Number(
              draft.searchedLongitude
            )
          : null,

      searchedLatitude:
        Number.isFinite(
          Number(
            draft.searchedLatitude
          )
        )
          ? Number(
              draft.searchedLatitude
            )
          : null,

      pinPositionMode:
        draft.pinPositionMode ||
        'auto',

      active:
        true,

      updatedAt:
        new Date()
          .toISOString(),
    }


    if (
      tab ===
      'historic'
    ) {
      const automaticLayers =
        getAutomaticHistoricLayers({
          city,
          record,
        })


      record = {
        ...record,

        autoLayers:
          automaticLayers.map(
            (layer) => ({
              year:
                layer.year,

              layerType:
                layer.layerType,
            })
          ),
      }


      if (
        record.timeMode ===
        'event'
      ) {
        record.startYear =
          ''

        record.endYear =
          ''
      }


      if (
        record.timeMode ===
        'range'
      ) {
        record.year =
          record.startYear
      }


      if (
        record.timeMode ===
        'present'
      ) {
        record.year =
          record.startYear

        record.endYear =
          ''
      }
    }


    return record
  }


  // ==========================================================
  // SAVE
  // ==========================================================

  async function saveDraft(
    event
  ) {
    event.preventDefault()


    const record =
      buildRecord()


    if (
      !record
    ) {
      return
    }


    if (
      editingReviewId
    ) {
      const sourceReview =
        reviewItems.find(
          (item) =>
            item.id ===
            editingReviewId
        )


      if (
        tab ===
          'news' &&
        sourceReview &&
        (
          getNewsroomAction(
            sourceReview
          ) ===
            'update' ||
          getNewsroomAction(
            sourceReview
          ) ===
            'resolve'
        )
      ) {
        await approveLiveNewsroomRecord(
          sourceReview
        )


        return
      }


      if (
        tab ===
          'news' &&
        sourceReview &&
        isTpsNewsroomRecord(
          sourceReview
        )
      ) {
        await approveTpsNewsroomRecord(
          sourceReview,
          record
        )


        return
      }


      let publishedRecord = {
        ...record,

        id:
          createAdminId(
            tab
          ),

        city:
          cityKey,

        origin:
          'scraper',

        reviewSourceId:
          editingReviewId,

        createdAt:
          new Date()
            .toISOString(),
      }


      if (
        tab ===
          'news' &&
        cityKey ===
          'toronto'
      ) {
        const serverRecord =
          await publishNewsRecordOnServer(
            publishedRecord
          )


        if (
          !serverRecord
        ) {
          return
        }


        publishedRecord =
          serverRecord
      }


      persistRecords([
        publishedRecord,
        ...records,
      ])


      persistReview(
        reviewItems.filter(
          (item) =>
            item.id !==
            editingReviewId
        )
      )


      if (
        sourceReview
      ) {
        markScraperRecordProcessed(
          sourceReview,
          'edited-published'
        )


        await acknowledgePersistentNewsroom({
          record:
            sourceReview,

          outcome:
            'publish-approved',
        })
      }


      resetDraft()


      return
    }


    if (
      editingId
    ) {
      let updatedRecord = {
        ...record,

        id:
          editingId,
      }


      if (
        tab ===
          'news' &&
        cityKey ===
          'toronto'
      ) {
        const serverRecord =
          await publishNewsRecordOnServer(
            updatedRecord
          )


        if (
          !serverRecord
        ) {
          return
        }


        updatedRecord =
          serverRecord
      }


      persistRecords(
        records.map(
          (item) =>
            item.id ===
            editingId
              ? updatedRecord
              : item
        )
      )


      resetDraft()


      return
    }


    let nextRecord = {
      ...record,

      id:
        createAdminId(
          tab
        ),

      city:
        cityKey,

      createdAt:
        new Date()
          .toISOString(),

      origin:
        'manual',
    }


    if (
      tab ===
        'news' &&
      cityKey ===
        'toronto'
    ) {
      const serverRecord =
        await publishNewsRecordOnServer(
          nextRecord
        )


      if (
        !serverRecord
      ) {
        return
      }


      nextRecord =
        serverRecord
    }


    persistRecords([
      nextRecord,
      ...records,
    ])


    resetDraft()
  }


  // ==========================================================
  // EDIT
  // ==========================================================

  function editRecord(
    record
  ) {
    setEditingReviewId(
      null
    )


    setEditingId(
      record.id
    )


    const normalizedRecord =
      tab ===
      'historic'
        ? normalizeHistoricRecord(
            record
          )
        : normalizePinRecord(
            record
          )


    setDraft({
      ...makeDraft(
        tab,
        cityKey
      ),

      ...normalizedRecord,

      city:
        cityKey,
    })


    window.scrollTo({
      top:
        0,

      behavior:
        'smooth',
    })
  }


  function editReview(
    record
  ) {
    setEditingId(
      null
    )


    setEditingReviewId(
      record.id
    )


    setDraft({
      ...makeDraft(
        tab,
        cityKey
      ),

      ...normalizePinRecord(
        record
      ),

      id:
        '',

      city:
        cityKey,

      active:
        true,
    })


    window.scrollTo({
      top:
        0,

      behavior:
        'smooth',
    })
  }


  // ==========================================================
  // TPS NEWSROOM APPROVAL
  // ==========================================================

  async function approveTpsNewsroomRecord(
    reviewRecord,
    editedRecord =
      null
  ) {
    const latestReviewItems =
      getNewsReviewItems()
        .map(
          normalizePinRecord
        )


    const latestReviewRecord =
      latestReviewItems.find(
        (item) =>
          item.id ===
          reviewRecord.id
      ) ||
      normalizePinRecord(
        reviewRecord
      )


    let candidate =
      normalizePinRecord({
        ...latestReviewRecord,
        ...(editedRecord ||
          {}),

        id:
          latestReviewRecord.id,

        city:
          'toronto',

        type:
          'news',

        origin:
          'tps-email',

        newsroomSource:
          'tps-email',
      })


    const latestPublishedItems =
      getNewsItems()
        .map(
          normalizePinRecord
        )


    const latestCityRecords =
      latestPublishedItems.filter(
        (record) =>
          belongsToCity(
            record,
            'toronto'
          )
      )


    const existingIndex =
      latestCityRecords.findIndex(
        (publishedRecord) =>
          isTpsNewsroomRecord(
            publishedRecord
          ) &&
          sameTpsIncident(
            publishedRecord,
            candidate
          )
      )


    const existingPublished =
      existingIndex >=
        0
        ? latestCityRecords[
            existingIndex
          ]
        : null


    const newsroomAction =
      (
        candidate.newsroomAction ===
          'resolve' ||
        candidate.serverAction ===
          'resolve' ||
        candidate.category ===
          'located'
      )
        ? 'resolve'
        : (
            candidate.newsroomAction ===
              'update' ||
            existingPublished
          )
          ? 'update'
          : 'publish'


    if (
      newsroomAction ===
        'resolve'
    ) {
      let archivedRecord =
        null


      if (
        existingPublished
      ) {
        archivedRecord =
          await archiveNewsRecordOnServer(
            existingPublished,
            'official-source-resolution'
          )


        if (
          !archivedRecord
        ) {
          return
        }
      }


      const nextCityRecords =
        archivedRecord
          ? latestCityRecords.map(
              (
                publishedRecord
              ) =>
                (
                  isTpsNewsroomRecord(
                    publishedRecord
                  ) &&
                  sameTpsIncident(
                    publishedRecord,
                    candidate
                  )
                )
                  ? archivedRecord
                  : publishedRecord
            )
          : latestCityRecords


      persistRecords(
        nextCityRecords
      )


      const nextCityReview =
        latestReviewItems
          .filter(
            (item) =>
              belongsToCity(
                item,
                'toronto'
              )
          )
          .filter(
            (item) =>
              item.id !==
              latestReviewRecord.id
          )


      persistReview(
        nextCityReview
      )


      markTpsVersionProcessed(
        candidate,
        'resolved-approved'
      )


      await acknowledgePersistentNewsroom({
        record:
          latestReviewRecord,

        outcome:
          'resolved-approved',
      })


      if (
        editingReviewId ===
        latestReviewRecord.id
      ) {
        resetDraft()
      }


      return
    }


    if (
      existingPublished
    ) {
      const existingLocation =
        String(
          existingPublished.intersection ||
          existingPublished.location ||
          ''
        )
          .trim()
          .toLowerCase()


      const nextLocation =
        String(
          candidate.intersection ||
          candidate.location ||
          ''
        )
          .trim()
          .toLowerCase()


      if (
        existingLocation &&
        nextLocation &&
        existingLocation ===
          nextLocation &&
        hasRecordCoordinates(
          existingPublished
        ) &&
        !hasRecordCoordinates(
          candidate
        )
      ) {
        candidate = {
          ...candidate,

          longitude:
            existingPublished.longitude,

          latitude:
            existingPublished.latitude,

          searchedLongitude:
            existingPublished.searchedLongitude ??
            existingPublished.longitude,

          searchedLatitude:
            existingPublished.searchedLatitude ??
            existingPublished.latitude,

          pinPositionMode:
            existingPublished.pinPositionMode ||
            'auto',
        }
      }
    }


    if (
      !hasRecordCoordinates(
        candidate
      )
    ) {
      const searchValue =
        candidate.intersection ||
        candidate.location ||
        ''


      if (
        searchValue
      ) {
        try {
          const locationResults =
            await searchLocation({
              value:
                searchValue,

              city:
                CITIES.toronto,
            })


          const firstResult =
            locationResults?.[0]


          if (
            firstResult &&
            Number.isFinite(
              Number(
                firstResult.longitude
              )
            ) &&
            Number.isFinite(
              Number(
                firstResult.latitude
              )
            )
          ) {
            candidate = {
              ...candidate,

              location:
                firstResult.location ||
                candidate.location,

              intersection:
                firstResult.intersection ||
                candidate.intersection ||
                firstResult.name,

              longitude:
                Number(
                  firstResult.longitude
                ),

              latitude:
                Number(
                  firstResult.latitude
                ),

              searchedLongitude:
                Number(
                  firstResult.longitude
                ),

              searchedLatitude:
                Number(
                  firstResult.latitude
                ),

              pinPositionMode:
                'auto',
            }
          }
        }
        catch (
          error
        ) {
          console.warn(
            'TPS NEWSROOM LOCATION SEARCH FAILED:',
            error
          )
        }
      }
    }


    if (
      !hasRecordCoordinates(
        candidate
      )
    ) {
      window.alert(
        'Could not place this TPS item on the map. Click EDIT and choose its location before publishing.'
      )


      return
    }


    const now =
      new Date()
        .toISOString()


    const firstPublishedAt =
      existingPublished?.firstPublishedAt ||
      existingPublished?.publishedAt ||
      candidate.firstPublishedAt ||
      candidate.publishedAt ||
      now


    const isMissing =
      candidate.category ===
      'missing'


    const approvedSourceRecord =
      candidate.incomingRecord ||
      candidate


    let publishedRecord = {
      ...existingPublished,
      ...candidate,

      firstSeenAt:
        existingPublished?.firstSeenAt ||
        candidate.firstSeenAt ||
        now,

      lastSeenAt:
        candidate.lastSeenAt ||
        now,

      lastCheckedAt:
        candidate.lastCheckedAt ||
        now,

      sourceUpdatedAt:
        candidate.sourceUpdatedAt ||
        existingPublished?.sourceUpdatedAt ||
        candidate.firstSeenAt ||
        now,

      sourceSnapshot:
        buildNewsroomSourceSnapshot(
          approvedSourceRecord
        ),

      sourceFingerprint:
        getNewsroomSourceFingerprint(
          approvedSourceRecord
        ),

      id:
        existingPublished?.id ||
        createAdminId(
          'news'
        ),

      city:
        'toronto',

      type:
        'news',

      active:
        true,

      origin:
        'tps-email',

      newsroomSource:
        'tps-email',

      tpsWorkflowAction:
        newsroomAction,

      reviewSourceId:
        latestReviewRecord.id,

      createdAt:
        existingPublished?.createdAt ||
        now,

      firstPublishedAt,

      expiresAt:
        isMissing
          ? ''
          : (
              existingPublished?.expiresAt ||
              candidate.expiresAt ||
              ''
            ),

      updatedAt:
        now,
    }


    delete publishedRecord.reviewStatus
    delete publishedRecord.receivedAt
    delete publishedRecord.newsroomAction
    delete publishedRecord.serverAction
    delete publishedRecord.action
    delete publishedRecord.previousRecord
    delete publishedRecord.incomingRecord
    delete publishedRecord.changedFields
    delete publishedRecord.targetId
    delete publishedRecord.targetExternalId
    delete publishedRecord.resolutionReason
    delete publishedRecord.missingPolls


    const serverPublishedRecord =
      await publishNewsRecordOnServer(
        publishedRecord
      )


    if (
      !serverPublishedRecord
    ) {
      return
    }


    publishedRecord =
      serverPublishedRecord


    const nextCityRecords =
      existingIndex >=
        0
        ? latestCityRecords.map(
            (
              record,
              index
            ) =>
              index ===
              existingIndex
                ? publishedRecord
                : record
          )
        : [
            publishedRecord,
            ...latestCityRecords,
          ]


    persistRecords(
      nextCityRecords
    )


    const nextCityReview =
      latestReviewItems
        .filter(
          (item) =>
            belongsToCity(
              item,
              'toronto'
            )
        )
        .filter(
          (item) =>
            item.id !==
            latestReviewRecord.id
        )


    persistReview(
      nextCityReview
    )


    markTpsVersionProcessed(
      candidate,
      existingPublished
        ? 'update-approved'
        : 'publish-approved'
    )


    await acknowledgePersistentNewsroom({
      record:
        latestReviewRecord,

      outcome:
        existingPublished
          ? 'update-approved'
          : 'publish-approved',
    })


    if (
      editingReviewId ===
      latestReviewRecord.id
    ) {
      resetDraft()
    }
  }


  // ==========================================================
  // PLACE NEWSROOM PIN
  // ==========================================================
  //
  // UPDATE already had a location-search path. NEW did not.
  // That split is why UPDATE records could become map pins while
  // ordinary NEW TTC / Fire records could be published with null
  // coordinates.
  //
  // NEW and UPDATE now use the same placement rule.
  //
  // ==========================================================

  function getNewsroomPlacementQueries(
    record
  ) {
    const values =
      []


    function add(
      value
    ) {
      const clean =
        String(
          value ||
          ''
        )
          .replace(
            /\s+/g,
            ' '
          )
          .trim()


      if (
        !clean
      ) {
        return
      }


      if (
        values.some(
          (
            existing
          ) =>
            existing.toLowerCase() ===
            clean.toLowerCase()
        )
      ) {
        return
      }


      values.push(
        clean
      )
    }


    add(
      record?.intersection
    )


    add(
      record?.location
    )


    const text =
      [
        record?.title,
        record?.description,
        record?.location,
        record?.intersection,
      ]
        .filter(
          Boolean
        )
        .join(
          ' '
        )


    // TTC alerts often name a station in the prose rather than in the
    // short location field. Give the geocoder a clean station query too.
    const stationMatches =
      text.match(
        /\b[A-Za-z0-9.'’\- ]{2,55}\s+Station\b/gi
      ) ||
      []


    stationMatches
      .slice(
        0,
        4
      )
      .forEach(
        add
      )


    // TTC detours commonly arrive as "X St at Y Ave" or "X St & Y Ave".
    // Pull that out of the full message in case the scraper's first
    // location phrase was less useful to the geocoder.
    const streetPattern =
      /\b([A-Za-z0-9.'’\- ]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\s+(?:at|&|and)\s+([A-Za-z0-9.'’\- ]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\b/gi


    let streetMatch


    while (
      (
        streetMatch =
          streetPattern.exec(
            text
          )
      ) &&
      values.length <
        8
    ) {
      add(
        (
          streetMatch[1] +
          ' & ' +
          streetMatch[2]
        )
      )
    }


    return values
  }


  async function searchArcgisNewsroomLocation({
    value,
    targetCity,
  }) {
    const clean =
      String(
        value ||
        ''
      )
        .replace(
          /\s+/g,
          ' '
        )
        .trim()


    if (
      clean.length <
        2 ||
      !targetCity
    ) {
      return null
    }


    const searchConfig =
      targetCity.search ||
      {}


    const bounds =
      searchConfig.bounds ||
      null


    const querySuffix =
      searchConfig.querySuffix ||
      targetCity.name ||
      'Toronto, Ontario, Canada'


    const rawCountryCode =
      String(
        searchConfig.countryCode ||
        'CA'
      )
        .trim()
        .toUpperCase()


    const countryCode =
      rawCountryCode ===
        'CA'
        ? 'CAN'
        : rawCountryCode


    const params =
      new URLSearchParams({
        f:
          'json',

        SingleLine:
          `${clean}, ${querySuffix}`,

        outFields:
          'Match_addr,Addr_type',

        outSR:
          '4326',

        maxLocations:
          '6',

        forStorage:
          'false',

        countryCode,
      })


    if (
      bounds &&
      Number.isFinite(
        Number(
          bounds.west
        )
      ) &&
      Number.isFinite(
        Number(
          bounds.south
        )
      ) &&
      Number.isFinite(
        Number(
          bounds.east
        )
      ) &&
      Number.isFinite(
        Number(
          bounds.north
        )
      )
    ) {
      params.set(
        'searchExtent',
        [
          bounds.west,
          bounds.south,
          bounds.east,
          bounds.north,
        ]
          .join(
            ','
          )
      )
    }


    const response =
      await fetch(
        (
          'https://geocode.arcgis.com/arcgis/rest/services/' +
          'World/GeocodeServer/findAddressCandidates?' +
          params.toString()
        )
      )


    if (
      !response.ok
    ) {
      throw new Error(
        (
          'ArcGIS location search failed · ' +
          response.status
        )
      )
    }


    const payload =
      await response.json()


    const candidates =
      Array.isArray(
        payload?.candidates
      )
        ? payload.candidates
        : []


    const valid =
      candidates
        .map(
          (
            candidate
          ) => {
            const longitude =
              Number(
                candidate?.location?.x
              )


            const latitude =
              Number(
                candidate?.location?.y
              )


            if (
              !Number.isFinite(
                longitude
              ) ||
              !Number.isFinite(
                latitude
              )
            ) {
              return null
            }


            if (
              bounds &&
              (
                longitude <
                  Number(
                    bounds.west
                  ) ||
                longitude >
                  Number(
                    bounds.east
                  ) ||
                latitude <
                  Number(
                    bounds.south
                  ) ||
                latitude >
                  Number(
                    bounds.north
                  )
              )
            ) {
              return null
            }


            return {
              name:
                candidate.address ||
                clean,

              location:
                candidate.address ||
                clean,

              intersection:
                candidate?.attributes?.Addr_type ===
                  'StreetInt'
                  ? (
                      candidate.address ||
                      clean
                    )
                  : '',

              longitude,

              latitude,

              score:
                Number(
                  candidate.score ||
                  0
                ),
            }
          }
        )
        .filter(
          Boolean
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        )


    return (
      valid[0] ||
      null
    )
  }


  async function placeNewsroomPin(
    record
  ) {
    let candidate =
      normalizePinRecord(
        record
      )


    if (
      hasRecordCoordinates(
        candidate
      )
    ) {
      return candidate
    }


    const placementQueries =
      getNewsroomPlacementQueries(
        candidate
      )


    const targetCity =
      CITIES[
        candidate.city ||
        cityKey
      ] ||
      city


    for (
      const searchValue
      of placementQueries
    ) {
      let firstResult =
        null


      try {
        const locationResults =
          await searchLocation({
            value:
              searchValue,

            city:
              targetCity,
          })


        firstResult =
          locationResults?.[
            0
          ] ||
          null
      }
      catch (
        error
      ) {
        console.warn(
          'PRIMARY NEWSROOM LOCATION SEARCH FAILED:',
          searchValue,
          error
        )
      }


      if (
        !firstResult
      ) {
        try {
          firstResult =
            await searchArcgisNewsroomLocation({
              value:
                searchValue,

              targetCity,
            })
        }
        catch (
          error
        ) {
          console.warn(
            'ARCGIS NEWSROOM LOCATION SEARCH FAILED:',
            searchValue,
            error
          )
        }
      }


      if (
        !firstResult ||
        !Number.isFinite(
          Number(
            firstResult.longitude
          )
        ) ||
        !Number.isFinite(
          Number(
            firstResult.latitude
          )
        )
      ) {
        continue
      }


      candidate = {
        ...candidate,

        // Preserve the official wording. The geocoder supplies coordinates.
        location:
          candidate.location ||
          firstResult.location ||
          searchValue,

        intersection:
          candidate.intersection ||
          candidate.location ||
          firstResult.intersection ||
          firstResult.name ||
          searchValue,

        longitude:
          Number(
            firstResult.longitude
          ),

        latitude:
          Number(
            firstResult.latitude
          ),

        searchedLongitude:
          Number(
            firstResult.longitude
          ),

        searchedLatitude:
          Number(
            firstResult.latitude
          ),

        pinPositionMode:
          'auto',
      }


      return candidate
    }


    return candidate
  }


  // ==========================================================
  // AUTOMATIC OFFICIAL UPDATE / RESOLVE ACKNOWLEDGEMENT
  // ==========================================================
  //
  // UPDATE / RESOLVE cards are audit notices, not publication gates.
  //
  // The server applies an official factual update immediately to the
  // canonical public NEWS record, then leaves the corresponding card in
  // NEWSROOM so the editor can see exactly what changed.
  //
  // Acknowledging the card only clears the audit notice. It must never
  // re-apply, reject, geocode, archive, or otherwise mutate the public pin.
  //
  // NEW items still require normal editorial approval.
  //
  // ==========================================================

  async function approveLiveNewsroomRecord(
    reviewRecord
  ) {
    const latestReviewItems =
      getNewsReviewItems()
        .map(
          normalizePinRecord
        )


    const latestReviewRecord =
      latestReviewItems.find(
        (
          item
        ) =>
          item.id ===
          reviewRecord.id
      ) ||
      normalizePinRecord(
        reviewRecord
      )


    const action =
      getNewsroomAction(
        latestReviewRecord
      )


    if (
      action !==
        'update' &&
      action !==
        'resolve'
    ) {
      return false
    }


    // Pull the canonical server state first so the Admin published desk
    // and browser cache immediately reflect the update / resolution that
    // was already applied by the official-source pipeline.
    await refreshPublishedNewsFromServer({
      allowBootstrap:
        false,
    })


    const nextCityReview =
      latestReviewItems
        .filter(
          (
            item
          ) =>
            belongsToCity(
              item,
              cityKey
            )
        )
        .filter(
          (
            item
          ) =>
            item.id !==
            latestReviewRecord.id
        )


    persistReview(
      nextCityReview
    )


    if (
      isTpsNewsroomRecord(
        latestReviewRecord
      )
    ) {
      markTpsVersionProcessed(
        latestReviewRecord,
        action ===
          'resolve'
          ? 'resolve-acknowledged'
          : 'update-acknowledged'
      )
    }


    await acknowledgePersistentNewsroom({
      record:
        latestReviewRecord,

      outcome:
        action ===
          'resolve'
          ? 'resolve-acknowledged'
          : 'update-acknowledged',
    })


    if (
      editingReviewId ===
      latestReviewRecord.id
    ) {
      resetDraft()
    }


    return true
  }


  // ==========================================================
  // APPROVE
  // ==========================================================

  async function approveReview(
    reviewRecord
  ) {
    if (
      tab ===
        'news' &&
      (
        getNewsroomAction(
          reviewRecord
        ) ===
          'update' ||
        getNewsroomAction(
          reviewRecord
        ) ===
          'resolve'
      )
    ) {
      await approveLiveNewsroomRecord(
        reviewRecord
      )


      return
    }


    if (
      tab ===
        'news' &&
      isTpsNewsroomRecord(
        reviewRecord
      )
    ) {
      await approveTpsNewsroomRecord(
        reviewRecord
      )


      return
    }


    const latestReviewItems =
      tab ===
      'news'
        ? getNewsReviewItems()
            .map(
              normalizePinRecord
            )
        : getNewReviewItems()
            .map(
              normalizePinRecord
            )


    const latestReviewRecord =
      latestReviewItems.find(
        (item) =>
          item.id ===
          reviewRecord.id
      ) ||
      normalizePinRecord(
        reviewRecord
      )


    let publishCandidate =
      normalizePinRecord(
        latestReviewRecord
      )


    if (
      tab ===
        'news'
    ) {
      setApprovingReviewId(
        latestReviewRecord.id
      )


      publishCandidate =
        await placeNewsroomPin(
          publishCandidate
        )


      if (
        !hasRecordCoordinates(
          publishCandidate
        )
      ) {
        // NEW is still NEW. Do not convert it into UPDATE, do not mark it
        // processed, and do not remove it from NEWSROOM.
        //
        // If the official wording cannot be auto-geocoded, open the normal
        // editor with the record intact so the editor can choose the pin
        // position and publish it manually.
        editReview(
          latestReviewRecord
        )


        setApprovingReviewId(
          null
        )


        window.alert(
          'This NEW item is valid, but its location could not be placed automatically. The editor is open so you can choose the pin location and publish it.'
        )


        return
      }
    }


    const latestPublishedItems =
      tab ===
        'news'
        ? getNewsItems()
            .map(
              normalizePinRecord
            )
        : getNewItems()
            .map(
              normalizePinRecord
            )


    const latestCityRecords =
      latestPublishedItems.filter(
        (record) =>
          belongsToCity(
            record,
            cityKey
          )
      )


    const now =
      new Date()
        .toISOString()


    const liveNewsSource =
      tab ===
        'news'
        ? (
            publishCandidate.incomingRecord ||
            publishCandidate
          )
        : null


    let publishedRecord = {
      ...makeDraft(
        tab,
        cityKey
      ),

      ...publishCandidate,

      ...(tab ===
        'news'
        ? {
            firstSeenAt:
              publishCandidate.firstSeenAt ||
              now,

            lastSeenAt:
              publishCandidate.lastSeenAt ||
              now,

            lastCheckedAt:
              publishCandidate.lastCheckedAt ||
              now,

            sourceUpdatedAt:
              publishCandidate.sourceUpdatedAt ||
              publishCandidate.firstSeenAt ||
              now,

            sourceSnapshot:
              buildNewsroomSourceSnapshot(
                liveNewsSource
              ),

            sourceFingerprint:
              getNewsroomSourceFingerprint(
                liveNewsSource
              ),
          }
        : {}),

      sourceUrl:
        normalizeSourceUrl(
          publishCandidate.sourceUrl
        ),

      id:
        createAdminId(
          tab
        ),

      city:
        cityKey,

      active:
        true,

      origin:
        'scraper',

      reviewSourceId:
        latestReviewRecord.id,

      createdAt:
        new Date()
          .toISOString(),

      updatedAt:
        new Date()
          .toISOString(),
    }


    delete publishedRecord.reviewStatus
    delete publishedRecord.receivedAt
    delete publishedRecord.newsroomAction
    delete publishedRecord.deliveryMode
    delete publishedRecord.previousRecord
    delete publishedRecord.incomingRecord
    delete publishedRecord.changedFields
    delete publishedRecord.targetId
    delete publishedRecord.targetExternalId
    delete publishedRecord.resolutionReason
    delete publishedRecord.missingPolls


    if (
      tab ===
        'news' &&
      cityKey ===
        'toronto'
    ) {
      const serverRecord =
        await publishNewsRecordOnServer(
          publishedRecord
        )


      if (
        !serverRecord
      ) {
        setApprovingReviewId(
          null
        )


        return
      }


      publishedRecord =
        serverRecord
    }


    persistRecords([
      publishedRecord,
      ...latestCityRecords,
    ])


    const nextCityReview =
      latestReviewItems
        .filter(
          (item) =>
            belongsToCity(
              item,
              cityKey
            )
        )
        .filter(
          (item) =>
            item.id !==
            latestReviewRecord.id
        )


    persistReview(
      nextCityReview
    )


    markScraperRecordProcessed(
      latestReviewRecord,
      'approved'
    )


    await acknowledgePersistentNewsroom({
      record:
        latestReviewRecord,

      outcome:
        'publish-approved',
    })


    setApprovingReviewId(
      null
    )
  }


  // ==========================================================
  // REJECT
  // ==========================================================

  async function rejectReview(
    reviewRecord
  ) {
    const isTps =
      tab ===
        'news' &&
      isTpsNewsroomRecord(
        reviewRecord
      )


    const newsroomAction =
      tab ===
        'news'
        ? getNewsroomAction(
            reviewRecord
          )
        : 'new'


    const confirmText =
      isTps
        ? 'Reject this TPS newsroom item?'
        : newsroomAction ===
            'update'
          ? 'Reject this update?'
          : newsroomAction ===
              'resolve'
            ? 'Reject this close request and keep the pin live?'
            : 'Reject this scraped item?'


    if (
      !window.confirm(
        confirmText
      )
    ) {
      return
    }


    if (
      isTps
    ) {
      markTpsVersionProcessed(
        reviewRecord,
        'rejected'
      )
    }


    persistReview(
      reviewItems.filter(
        (item) =>
          item.id !==
          reviewRecord.id
      )
    )


    // NEW records use the original processed-history behavior.
    //
    // UPDATE / RESOLVE records deliberately do NOT mark the base
    // externalId as permanently processed. The underlying live pin
    // must remain eligible for future official changes.
    if (
      isTps ||
      newsroomAction ===
        'new'
    ) {
      markScraperRecordProcessed(
        reviewRecord,
        'rejected'
      )
    }


    await acknowledgePersistentNewsroom({
      record:
        reviewRecord,

      outcome:
        newsroomAction ===
          'resolve'
          ? 'resolve-rejected'
          : newsroomAction ===
              'update'
            ? 'update-rejected'
            : 'new-rejected',
    })


    if (
      editingReviewId ===
      reviewRecord.id
    ) {
      resetDraft()
    }
  }


  // ==========================================================
  // DELETE
  // ==========================================================

  async function deleteRecord(
    id
  ) {
    const target =
      records.find(
        (
          item
        ) =>
          item.id ===
          id
      ) ||
      null


    const isNews =
      tab ===
        'news'


    if (
      !window.confirm(
        isNews
          ? 'Remove this NEWS pin from the live map? It will remain in the archive.'
          : 'Delete this item?'
      )
    ) {
      return
    }


    if (
      isNews &&
      cityKey ===
        'toronto' &&
      target
    ) {
      const archivedRecord =
        await archiveNewsRecordOnServer(
          target,
          'manual-remove'
        )


      if (
        !archivedRecord
      ) {
        return
      }


      persistRecords(
        records.map(
          (
            item
          ) =>
            item.id ===
              id
              ? archivedRecord
              : item
        )
      )


      await logPersistentNewsAction({
        action:
          'manual-archive',

        record:
          archivedRecord,
      })


      if (
        editingId ===
          id
      ) {
        resetDraft()
      }


      return
    }


    persistRecords(
      records.filter(
        (item) =>
          item.id !==
          id
      )
    )


    if (
      target
    ) {
      await logPersistentNewsAction({
        action:
          'manual-delete',

        record:
          target,
      })
    }


    if (
      editingId ===
      id
    ) {
      resetDraft()
    }
  }

  // ==========================================================
  // PUBLISH / UNPUBLISH
  // ==========================================================

  async function toggleRecord(
    id
  ) {
    const target =
      records.find(
        (
          item
        ) =>
          item.id ===
          id
      ) ||
      null


    if (
      !target
    ) {
      return
    }


    const nextActive =
      target.active ===
        false


    let updatedRecord = {
      ...target,

      active:
        nextActive,

      manuallyUnpublishedAt:
        nextActive
          ? ''
          : new Date()
              .toISOString(),

      manuallyRepublishedAt:
        nextActive
          ? new Date()
              .toISOString()
          : (
              target.manuallyRepublishedAt ||
              ''
            ),
    }


    if (
      tab ===
        'news' &&
      cityKey ===
        'toronto'
    ) {
      const serverRecord =
        nextActive
          ? await publishNewsRecordOnServer(
              updatedRecord
            )
          : await archiveNewsRecordOnServer(
              updatedRecord,
              'manual-unpublish'
            )


      if (
        !serverRecord
      ) {
        return
      }


      updatedRecord =
        serverRecord
    }


    persistRecords(
      records.map(
        (
          item
        ) =>
          item.id ===
            id
            ? updatedRecord
            : item
      )
    )


    await logPersistentNewsAction({
      action:
        nextActive
          ? 'manual-publish'
          : 'manual-unpublish',

      record:
        updatedRecord,
    })
  }


  // ==========================================================
  // LABELS
  // ==========================================================

  function formHeading() {
    if (
      editingReviewId
    ) {
      const sourceReview =
        reviewItems.find(
          (
            item
          ) =>
            item.id ===
            editingReviewId
        )


      const action =
        tab ===
          'news' &&
        sourceReview
          ? getNewsroomAction(
              sourceReview
            )
          : 'new'


      if (
        action ===
          'update'
      ) {
        return 'OFFICIAL UPDATE · ALREADY APPLIED'
      }


      if (
        action ===
          'resolve'
      ) {
        return 'OFFICIAL RESOLUTION · ALREADY APPLIED'
      }


      return (
        `REVIEW + PUBLISH ${tabLabel(tab)}`
      )
    }


    if (
      editingId
    ) {
      return (
        `EDIT ${tabLabel(tab)}`
      )
    }


    return (
      `ADD ${tabLabel(tab)}`
    )
  }


  function formSubmitLabel() {
    if (
      editingReviewId
    ) {
      const sourceReview =
        reviewItems.find(
          (
            item
          ) =>
            item.id ===
            editingReviewId
        )


      const action =
        tab ===
          'news' &&
        sourceReview
          ? getNewsroomAction(
              sourceReview
            )
          : 'new'


      if (
        action ===
          'update'
      ) {
        return 'ACKNOWLEDGE'
      }


      if (
        action ===
          'resolve'
      ) {
        return 'ACKNOWLEDGE'
      }


      return 'PUBLISH REVIEW'
    }


    if (
      editingId
    ) {
      return 'SAVE CHANGES'
    }


    return 'PUBLISH'
  }


  function historicDateLabel(
    record
  ) {
    const normalized =
      normalizeHistoricRecord(
        record
      )


    if (
      normalized.timeMode ===
      'range'
    ) {
      return (
        `${normalized.startYear || '?'}` +
        '–' +
        `${normalized.endYear || '?'}`
      )
    }


    if (
      normalized.timeMode ===
      'present'
    ) {
      return (
        `${normalized.startYear || normalized.year || '?'}` +
        '–PRESENT'
      )
    }


    return (
      normalized.year ||
      '?'
    )
  }


  const hasPinLocation =
    hasRecordCoordinates(
      draft
    )


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main
      className="admin-room"
      style={{
        position:
          'fixed',

        inset:
          0,

        width:
          '100vw',

        height:
          '100vh',

        overflowX:
          'auto',

        overflowY:
          'auto',

        WebkitOverflowScrolling:
          'touch',
      }}
    >
      <header className="admin-header">
        <div>
          <div className="admin-eyebrow">
            ELPPA
          </div>

          <h1 className="admin-title">
            GEOGRAPHIC ADMIN
          </h1>
        </div>

        <a
          className="admin-map-link"
          href="/"
        >
          ← MAP
        </a>
      </header>


      <section className="admin-city-shell">
        <div className="admin-city-current">
          <div className="admin-city-label">
            WORKING IN
          </div>

          <select
            className="admin-city-select"
            value={
              cityKey
            }
            onChange={
              (event) =>
                changeCity(
                  event.target.value
                )
            }
          >
            {cityKeys.map(
              (key) => (
                <option
                  key={
                    key
                  }
                  value={
                    key
                  }
                >
                  {
                    CITIES[
                      key
                    ].name
                  }
                </option>
              )
            )}
          </select>
        </div>


        <div className="admin-attention">
          <div className="admin-city-label">
            NEEDS ATTENTION
          </div>

          <div className="admin-attention-cities">
            {attentionByCity.map(
              (item) => (
                <button
                  type="button"
                  className={
                    item.cityKey ===
                    cityKey
                      ? 'admin-attention-city admin-attention-city-active'
                      : 'admin-attention-city'
                  }
                  key={
                    item.cityKey
                  }
                  onClick={() =>
                    changeCity(
                      item.cityKey
                    )
                  }
                >
                  <span className="admin-attention-name">
                    {
                      item.city.name
                    }
                  </span>

                  <span className="admin-attention-breakdown">
                    NEWS {item.news}
                    {' · '}
                    NEW {item.newCount}
                  </span>

                  <strong>
                    {
                      item.total
                    }
                  </strong>
                </button>
              )
            )}
          </div>
        </div>
      </section>


      <nav className="admin-tabs">
        <button
          type="button"
          className={
            tab ===
            'news'
              ? 'admin-tab admin-tab-active'
              : 'admin-tab'
          }
          onClick={() =>
            changeTab(
              'news'
            )
          }
        >
          NEWS

          <span>
            {newsItems.length}
            {' / '}
            {newsReviewItems.length}
          </span>
        </button>


        <button
          type="button"
          className={
            tab ===
            'new'
              ? 'admin-tab admin-tab-active'
              : 'admin-tab'
          }
          onClick={() =>
            changeTab(
              'new'
            )
          }
        >
          NEW

          <span>
            {newItems.length}
            {' / '}
            {newReviewItems.length}
          </span>
        </button>


        <button
          type="button"
          className={
            tab ===
            'historic'
              ? 'admin-tab admin-tab-active'
              : 'admin-tab'
          }
          onClick={() =>
            changeTab(
              'historic'
            )
          }
        >
          HISTORIC

          <span>
            {
              historicItems.length
            }
          </span>
        </button>
      </nav>


      <div className="admin-layout">
        <section className="admin-editor">
          <div className="admin-section-heading">
            {
              formHeading()
            }

            {' · '}

            {
              city.name
            }
          </div>


          <form
            className="admin-form"
            onSubmit={
              saveDraft
            }
          >
            <label className="admin-field admin-field-wide">
              <span>
                TITLE
              </span>

              <input
                value={
                  draft.title
                }
                onChange={
                  (event) =>
                    updateDraft(
                      'title',
                      event.target.value
                    )
                }
                placeholder={
                  tab ===
                  'news'
                    ? 'What is happening?'
                    : tab ===
                        'new'
                      ? 'What is new or proposed?'
                      : 'What happened here?'
                }
              />
            </label>


            <label className="admin-field admin-field-wide">
              <span>
                DESCRIPTION
              </span>

              <textarea
                value={
                  draft.description
                }
                onChange={
                  (event) =>
                    updateDraft(
                      'description',
                      event.target.value
                    )
                }
                rows={
                  5
                }
                placeholder="Short description"
              />
            </label>


            <div className="admin-field admin-field-wide">
              <span>
                LOCATION
              </span>

              <LocationSearch
                city={
                  city
                }
                value={
                  draft.location
                }
                selectedLocation={
                  draft
                }
                autoSearch={
                  Boolean(
                    editingReviewId &&
                    draft.location &&
                    !hasPinLocation
                  )
                }
                onChange={
                  changeLocationSearch
                }
                onSelect={
                  selectLocation
                }
              />

              {draft.intersection && (
                <div className="admin-location-intersection">
                  MAP LABEL · {
                    draft.intersection
                  }
                </div>
              )}
            </div>


            <div className="admin-field admin-field-wide">
              <span>
                PIN POSITION
              </span>

                <div className="admin-pin-position-controls">
                  <button
                    type="button"
                    className={
                      draft.pinPositionMode ===
                      'auto'
                        ? 'admin-pin-position-button admin-pin-position-button-active'
                        : 'admin-pin-position-button'
                    }
                    onClick={() =>
                      changePinPositionMode(
                        'auto'
                      )
                    }
                  >
                    AUTO
                  </button>

                  <button
                    type="button"
                    className={
                      draft.pinPositionMode ===
                      'custom'
                        ? 'admin-pin-position-button admin-pin-position-button-active'
                        : 'admin-pin-position-button'
                    }
                    onClick={() =>
                      changePinPositionMode(
                        'custom'
                      )
                    }
                  >
                    CUSTOM
                  </button>
                </div>

                <AdminPinMap
                  city={
                    city
                  }
                  longitude={
                    draft.longitude
                  }
                  latitude={
                    draft.latitude
                  }
                  draggable={
                    draft.pinPositionMode ===
                    'custom'
                  }
                  onChange={
                    changeCustomPinPosition
                  }
                />

              <div className="admin-pin-position-note">
                {draft.pinPositionMode ===
                'custom'
                  ? (
                      hasPinLocation
                        ? 'CLICK THE MAP OR DRAG THE PIN TO ITS EXACT LOCATION.'
                        : 'CLICK THE MAP TO PLACE THE PIN.'
                    )
                  : (
                      hasPinLocation
                        ? 'USING THE SEARCHED LOCATION.'
                        : 'SEARCH FOR A LOCATION OR CHOOSE CUSTOM TO PLACE IT YOURSELF.'
                    )}
              </div>
            </div>


            {tab ===
              'news' && (
              <>
                <label className="admin-field">
                  <span>
                    CATEGORY
                  </span>

                  <select
                    value={
                      draft.category
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'category',
                          event.target.value
                        )
                    }
                  >
                    <option value="collision">
                      COLLISION
                    </option>

                    <option value="shooting">
                      SHOOTING / FIREARM
                    </option>

                    <option value="missing">
                      MISSING PERSON
                    </option>

                    <option value="road-closure">
                      ROAD CLOSURE
                    </option>

                    <option value="wanted">
                      WANTED PERSON
                    </option>

                    <option value="break-enter">
                      BREAK AND ENTER
                    </option>

                    <option value="mischief">
                      MISCHIEF
                    </option>

                    <option value="homicide">
                      HOMICIDE
                    </option>

                    <option value="sexual-assault">
                      SEXUAL ASSAULT
                    </option>

                    <option value="criminal-harassment">
                      CRIMINAL HARASSMENT
                    </option>

                    <option value="fraud">
                      FRAUD
                    </option>

                    <option value="arson">
                      ARSON
                    </option>

                    <option value="fire">
                      FIRE
                    </option>

                    <option value="ttc">
                      TTC
                    </option>

                    <option value="theft">
                      THEFT
                    </option>

                    <option value="police">
                      POLICE
                    </option>

                    <option value="stabbing">
                      STABBING
                    </option>

                    <option value="robbery">
                      ROBBERY
                    </option>

                    <option value="assault">
                      ASSAULT
                    </option>

                    <option value="city">
                      CITY
                    </option>

                    <option value="culture">
                      CULTURE
                    </option>

                    <option value="event">
                      EVENT
                    </option>

                    <option value="environment">
                      ENVIRONMENT
                    </option>

                    <option value="politics">
                      POLITICS
                    </option>

                    <option value="community">
                      COMMUNITY
                    </option>

                    <option value="transit">
                      TRANSIT
                    </option>
                  </select>
                </label>

                <label className="admin-field">
                  <span>
                    PUBLISHED
                  </span>

                  <input
                    type="date"
                    value={
                      toTorontoDateInputValue(
                        draft.publishedAt
                      )
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'publishedAt',
                          event.target.value
                        )
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>
                    EXPIRES
                  </span>

                  <input
                    type="date"
                    value={
                      toTorontoDateInputValue(
                        draft.expiresAt
                      )
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'expiresAt',
                          event.target.value
                        )
                    }
                  />
                </label>
              </>
            )}


            {tab ===
              'new' && (
              <>
                <label className="admin-field">
                  <span>
                    TYPE
                  </span>

                  <select
                    value={
                      draft.category
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'category',
                          event.target.value
                        )
                    }
                  >
                    <option value="development">
                      DEVELOPMENT
                    </option>

                    <option value="store">
                      STORE / BUSINESS
                    </option>

                    <option value="restaurant">
                      RESTAURANT
                    </option>

                    <option value="construction">
                      CONSTRUCTION
                    </option>

                    <option value="transit">
                      TRANSIT
                    </option>

                    <option value="public-space">
                      PUBLIC SPACE
                    </option>

                    <option value="housing">
                      HOUSING
                    </option>

                    <option value="other">
                      OTHER
                    </option>
                  </select>
                </label>

                <label className="admin-field">
                  <span>
                    STATUS
                  </span>

                  <select
                    value={
                      draft.status
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'status',
                          event.target.value
                        )
                    }
                  >
                    <option value="proposed">
                      PROPOSED
                    </option>

                    <option value="approved">
                      APPROVED
                    </option>

                    <option value="construction">
                      UNDER CONSTRUCTION
                    </option>

                    <option value="opening-soon">
                      OPENING SOON
                    </option>

                    <option value="open">
                      OPEN
                    </option>

                    <option value="cancelled">
                      CANCELLED
                    </option>
                  </select>
                </label>

                <label className="admin-field">
                  <span>
                    ANNOUNCED
                  </span>

                  <input
                    type="date"
                    value={
                      draft.announcedAt
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'announcedAt',
                          event.target.value
                        )
                    }
                  />
                </label>

                <label className="admin-field">
                  <span>
                    EXPECTED / OPENING
                  </span>

                  <input
                    type="date"
                    value={
                      draft.expectedAt
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'expectedAt',
                          event.target.value
                        )
                    }
                  />
                </label>
              </>
            )}


            {tab ===
              'historic' && (
              <>
                <div className="admin-field admin-field-wide">
                  <span>
                    TIME TYPE
                  </span>

                  <div className="historic-time-options">
                    <button
                      type="button"
                      className={
                        draft.timeMode ===
                        'event'
                          ? 'historic-time-button historic-time-button-active'
                          : 'historic-time-button'
                      }
                      onClick={() =>
                        changeHistoricTimeMode(
                          'event'
                        )
                      }
                    >
                      EVENT
                    </button>

                    <button
                      type="button"
                      className={
                        draft.timeMode ===
                        'range'
                          ? 'historic-time-button historic-time-button-active'
                          : 'historic-time-button'
                      }
                      onClick={() =>
                        changeHistoricTimeMode(
                          'range'
                        )
                      }
                    >
                      RANGE
                    </button>

                    <button
                      type="button"
                      className={
                        draft.timeMode ===
                        'present'
                          ? 'historic-time-button historic-time-button-active'
                          : 'historic-time-button'
                      }
                      onClick={() =>
                        changeHistoricTimeMode(
                          'present'
                        )
                      }
                    >
                      STILL HERE
                    </button>
                  </div>
                </div>


                {draft.timeMode ===
                  'event' && (
                  <label className="admin-field">
                    <span>
                      YEAR
                    </span>

                    <input
                      type="number"
                      value={
                        draft.year
                      }
                      onChange={
                        (event) =>
                          changeHistoricEventYear(
                            event.target.value
                          )
                      }
                      placeholder="1931"
                    />
                  </label>
                )}


                {draft.timeMode ===
                  'range' && (
                  <>
                    <label className="admin-field">
                      <span>
                        START YEAR
                      </span>

                      <input
                        type="number"
                        value={
                          draft.startYear
                        }
                        onChange={
                          (event) =>
                            changeHistoricStartYear(
                              event.target.value
                            )
                        }
                        placeholder="1931"
                      />
                    </label>

                    <label className="admin-field">
                      <span>
                        END YEAR
                      </span>

                      <input
                        type="number"
                        value={
                          draft.endYear
                        }
                        onChange={
                          (event) =>
                            updateDraft(
                              'endYear',
                              event.target.value
                            )
                        }
                        placeholder="1989"
                      />
                    </label>
                  </>
                )}


                {draft.timeMode ===
                  'present' && (
                  <label className="admin-field">
                    <span>
                      START YEAR
                    </span>

                    <input
                      type="number"
                      value={
                        draft.startYear
                      }
                      onChange={
                        (event) =>
                          changeHistoricStartYear(
                            event.target.value
                          )
                      }
                      placeholder="1931"
                    />
                  </label>
                )}


                <label className="admin-field">
                  <span>
                    TYPE
                  </span>

                  <select
                    value={
                      draft.category
                    }
                    onChange={
                      (event) =>
                        updateDraft(
                          'category',
                          event.target.value
                        )
                    }
                  >
                    <option value="place">
                      PLACE
                    </option>

                    <option value="event">
                      EVENT
                    </option>

                    <option value="building">
                      BUILDING
                    </option>

                    <option value="business">
                      BUSINESS
                    </option>

                    <option value="infrastructure">
                      INFRASTRUCTURE
                    </option>

                    <option value="person">
                      PERSON
                    </option>

                    <option value="neighbourhood">
                      NEIGHBOURHOOD
                    </option>

                    <option value="other">
                      OTHER
                    </option>
                  </select>
                </label>


                <div className="admin-field admin-field-wide">
                  <span>
                    HISTORICAL LAYER
                  </span>

                  <div className="historic-placement">
                    <div className="historic-placement-modes">
                      <button
                        type="button"
                        className={
                          draft.layerPlacementMode ===
                          'auto'
                            ? 'historic-placement-mode historic-placement-mode-active'
                            : 'historic-placement-mode'
                        }
                        onClick={() =>
                          changeHistoricPlacementMode(
                            'auto'
                          )
                        }
                      >
                        AUTO
                      </button>

                      <button
                        type="button"
                        className={
                          draft.layerPlacementMode ===
                          'manual'
                            ? 'historic-placement-mode historic-placement-mode-active'
                            : 'historic-placement-mode'
                        }
                        onClick={() =>
                          changeHistoricPlacementMode(
                            'manual'
                          )
                        }
                      >
                        MANUAL
                      </button>
                    </div>


                    {draft.layerPlacementMode ===
                      'auto' && (
                      <div className="historic-placement-preview">
                        <strong>
                          {
                            historicPlacement?.title
                          }
                        </strong>

                        <span>
                          {
                            historicPlacement?.detail
                          }
                        </span>
                      </div>
                    )}


                    {draft.layerPlacementMode ===
                      'manual' && (
                      <>
                        <select
                          className="historic-layer-select"
                          value={
                            draft.layerOverrideType &&
                            draft.layerOverrideYear
                              ? (
                                  `${draft.layerOverrideType}:` +
                                  `${draft.layerOverrideYear}`
                                )
                              : ''
                          }
                          onChange={
                            (event) =>
                              changeHistoricManualLayer(
                                event.target.value
                              )
                          }
                        >
                          <option value="">
                            CHOOSE HISTORICAL VIEW
                          </option>

                          {historicalLayers.map(
                            (layer) => (
                              <option
                                key={
                                  (
                                    `${layer.layerType}-` +
                                    `${layer.year}`
                                  )
                                }
                                value={
                                  (
                                    `${layer.layerType}:` +
                                    `${layer.year}`
                                  )
                                }
                              >
                                {
                                  layer.label
                                }
                              </option>
                            )
                          )}
                        </select>

                        <div className="historic-placement-preview">
                          <strong>
                            {
                              historicPlacement?.title
                            }
                          </strong>

                          <span>
                            {
                              historicPlacement?.detail
                            }
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}


            <label className="admin-field">
              <span>
                SOURCE
              </span>

              <input
                value={
                  draft.source
                }
                onChange={
                  (event) =>
                    updateDraft(
                      'source',
                      event.target.value
                    )
                }
                placeholder="Source name"
              />
            </label>


            <label className="admin-field">
              <span>
                SOURCE URL
              </span>

              <input
                type="url"
                value={
                  draft.sourceUrl
                }
                onChange={
                  (event) =>
                    updateDraft(
                      'sourceUrl',
                      event.target.value
                    )
                }
                placeholder="https://..."
              />
            </label>



            {tab ===
              'news' && (
              <div className="admin-field admin-field-wide">
                <span>
                  IMAGE URL
                </span>

                <input
                  type="url"
                  value={
                    draft.imageUrl ||
                    ''
                  }
                  onChange={
                    (event) =>
                      updateDraft(
                        'imageUrl',
                        event.target.value
                      )
                  }
                  placeholder="Paste direct TPS image URL"
                />

                {draft.sourceUrl && (
                  <a
                    href={
                      normalizeSourceUrl(
                        draft.sourceUrl
                      )
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display:
                        'inline-block',

                      marginTop:
                        '10px',

                      fontSize:
                        '12px',

                      fontWeight:
                        700,

                      letterSpacing:
                        '0.06em',

                      textDecoration:
                        'underline',
                    }}
                  >
                    OPEN TPS SOURCE ↗
                  </a>
                )}

                {draft.imageUrl && (
                  <img
                    key={
                      draft.imageUrl
                    }
                    src={
                      normalizeSourceUrl(
                        draft.imageUrl
                      )
                    }
                    alt="News preview"
                    onError={
                      (event) => {
                        event.currentTarget.style.display =
                          'none'
                      }
                    }
                    style={{
                      display:
                        'block',

                      width:
                        '100%',

                      maxWidth:
                        '520px',

                      maxHeight:
                        '340px',

                      objectFit:
                        'contain',

                      marginTop:
                        '12px',

                      borderRadius:
                        '4px',
                    }}
                  />
                )}
              </div>
            )}


            <div className="admin-form-actions">
              <button
                type="submit"
                className="admin-save"
              >
                {
                  formSubmitLabel()
                }
              </button>

              {(editingId ||
                editingReviewId) && (
                <button
                  type="button"
                  className="admin-cancel"
                  onClick={
                    resetDraft
                  }
                >
                  CANCEL
                </button>
              )}
            </div>
          </form>
        </section>


        {/* ====================================================
            RECORDS
            ==================================================== */}

        <section className="admin-records">
          <div className="admin-review-type-filters">
            {(tab ===
              'news' ||
              tab ===
                'new') && (
              <button
                type="button"
                className={
                  recordsPanel ===
                  'review'
                    ? 'admin-review-type-filter admin-review-type-filter-active'
                    : 'admin-review-type-filter'
                }
                onClick={() =>
                  setRecordsPanel(
                    'review'
                  )
                }
              >
                {tab ===
                  'news'
                  ? 'NEWSROOM'
                  : 'REVIEW'}
                <span>
                  {
                    reviewItems.length
                  }
                </span>
              </button>
            )}

            <button
              type="button"
              className={
                recordsPanel ===
                'published'
                  ? 'admin-review-type-filter admin-review-type-filter-active'
                  : 'admin-review-type-filter'
              }
              onClick={() =>
                setRecordsPanel(
                  'published'
                )
              }
            >
              PUBLISHED
              <span>
                {
                  records.length
                }
              </span>
            </button>
          </div>


          {recordsPanel ===
            'review' &&
            (tab ===
              'news' ||
              tab ===
                'new') && (
            <div className="admin-review-section">
              <div className="admin-section-heading">
                {tab ===
                  'news'
                  ? 'NEWSROOM'
                  : 'REVIEW'} · {
                  filteredReviewItems.length
                }

                {filteredReviewItems.length !==
                  reviewItems.length && (
                  <>
                    {' / '}
                    {
                      reviewItems.length
                    }
                  </>
                )}
              </div>


              {tab ===
                'news' &&
                cityKey ===
                  'toronto' && (
                <div
                  style={{
                    border:
                      '1px solid rgba(0,0,0,0.18)',

                    padding:
                      '12px',

                    marginBottom:
                      '12px',
                  }}
                >
                  <div
                    style={{
                      display:
                        'flex',

                      alignItems:
                        'center',

                      justifyContent:
                        'space-between',

                      gap:
                        '12px',

                      flexWrap:
                        'wrap',
                    }}
                  >
                    <div>
                      <div
                        className="admin-record-meta"
                        style={{
                          fontWeight:
                            700,
                        }}
                      >
                        OFFICIAL LIVE SOURCES
                      </div>

                      <div className="admin-record-meta">
                        🚔 POLICE · 🚒 FIRE · 🚌 TRANSIT
                      </div>
                    </div>

                    <button
                      type="button"
                      className="admin-save"
                      disabled={
                        tpsInboxRunning ||
                        scraperRunning
                      }
                      onClick={
                        syncOfficialTorontoNews
                      }
                    >
                      {(tpsInboxRunning ||
                        scraperRunning)
                        ? 'SYNCING…'
                        : 'SYNC OFFICIAL SOURCES'}
                    </button>
                  </div>


                  {(tpsInboxError ||
                    scraperError) && (
                    <div
                      className="admin-record-meta"
                      style={{
                        marginTop:
                          '10px',
                      }}
                    >
                      {tpsInboxError
                        ? `POLICE ERROR · ${tpsInboxError}`
                        : ''}

                      {tpsInboxError &&
                        scraperError
                        ? ' · '
                        : ''}

                      {scraperError
                        ? `FIRE / TRANSIT ERROR · ${scraperError}`
                        : ''}
                    </div>
                  )}
                </div>
              )}


              {/* NEWSROOM SOURCE */}

              {tab ===
                'news' && (
                <div className="admin-review-type-filters">
                  {[
                    [
                      'all',
                      'ALL',
                      '',
                    ],

                    [
                      'police',
                      'POLICE',
                      '🚔',
                    ],

                    [
                      'fire',
                      'FIRE',
                      '🚒',
                    ],

                    [
                      'transit',
                      'TRANSIT',
                      '🚌',
                    ],
                  ].map(
                    ([
                      value,
                      label,
                      icon,
                    ]) => (
                      <button
                        type="button"
                        className={
                          newsroomSourceFilter ===
                          value
                            ? 'admin-review-type-filter admin-review-type-filter-active'
                            : 'admin-review-type-filter'
                        }
                        key={
                          value
                        }
                        onClick={() =>
                          setNewsroomSourceFilter(
                            value
                          )
                        }
                      >
                        {icon
                          ? `${icon} ${label}`
                          : label}

                        <span>
                          {
                            newsroomSourceCounts[
                              value
                            ] ||
                            0
                          }
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}


              {/* NEWSROOM ACTION */}

              {tab ===
                'news' && (
                <div className="admin-review-type-filters">
                  {[
                    [
                      'all',
                      'ALL ACTIVITY',
                    ],

                    [
                      'new',
                      'NEW',
                    ],

                    [
                      'update',
                      'UPDATES',
                    ],

                    [
                      'resolve',
                      'RESOLVE',
                    ],
                  ].map(
                    ([
                      value,
                      label,
                    ]) => (
                      <button
                        type="button"
                        className={
                          newsroomActionFilter ===
                          value
                            ? 'admin-review-type-filter admin-review-type-filter-active'
                            : 'admin-review-type-filter'
                        }
                        key={
                          value
                        }
                        onClick={() =>
                          setNewsroomActionFilter(
                            value
                          )
                        }
                      >
                        {label}

                        <span>
                          {
                            newsroomActionCounts[
                              value
                            ] ||
                            0
                          }
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}


              {/* NEW TYPE */}

              {tab ===
                'new' && (
                <div className="admin-review-type-filters">
                  <button
                    type="button"
                    className={
                      newTypeFilter ===
                      'all'
                        ? 'admin-review-type-filter admin-review-type-filter-active'
                        : 'admin-review-type-filter'
                    }
                    onClick={() =>
                      setNewTypeFilter(
                        'all'
                      )
                    }
                  >
                    ALL
                    <span>
                      {
                        newTypeCounts.all
                      }
                    </span>
                  </button>


                  <button
                    type="button"
                    className={
                      newTypeFilter ===
                      'development'
                        ? 'admin-review-type-filter admin-review-type-filter-active'
                        : 'admin-review-type-filter'
                    }
                    onClick={() =>
                      setNewTypeFilter(
                        'development'
                      )
                    }
                  >
                    DEVELOPMENTS
                    <span>
                      {
                        newTypeCounts.development
                      }
                    </span>
                  </button>


                  <button
                    type="button"
                    className={
                      newTypeFilter ===
                      'business'
                        ? 'admin-review-type-filter admin-review-type-filter-active'
                        : 'admin-review-type-filter'
                    }
                    onClick={() =>
                      setNewTypeFilter(
                        'business'
                      )
                    }
                  >
                    BUSINESSES
                    <span>
                      {
                        newTypeCounts.business
                      }
                    </span>
                  </button>
                </div>
              )}


              {/* NEW STATUS */}

              {tab ===
                'new' && (
                <div className="admin-review-type-filters">
                  {[
                    [
                      'all',
                      'ALL STATUS',
                    ],

                    [
                      'proposed',
                      'PROPOSED',
                    ],

                    [
                      'approved',
                      'APPROVED',
                    ],

                    [
                      'construction',
                      'CONSTRUCTION',
                    ],

                    [
                      'cancelled',
                      'CANCELLED',
                    ],

                    [
                      'opening-soon',
                      'OPENING SOON',
                    ],

                    [
                      'open',
                      'OPEN',
                    ],
                  ].map(
                    ([
                      value,
                      label,
                    ]) => (
                      <button
                        type="button"
                        className={
                          newStatusFilter ===
                          value
                            ? 'admin-review-type-filter admin-review-type-filter-active'
                            : 'admin-review-type-filter'
                        }
                        key={
                          value
                        }
                        onClick={() =>
                          setNewStatusFilter(
                            value
                          )
                        }
                      >
                        {label}

                        <span>
                          {
                            newStatusCounts[
                              value
                            ] ||
                            0
                          }
                        </span>
                      </button>
                    )
                  )}
                </div>
              )}


              {/* DATE */}

              <div className="admin-review-date-filters">
                <button
                  type="button"
                  className={
                    reviewRange ===
                    '7'
                      ? 'admin-review-date-filter admin-review-date-filter-active'
                      : 'admin-review-date-filter'
                  }
                  onClick={() =>
                    setReviewRange(
                      '7'
                    )
                  }
                >
                  7 DAYS
                </button>


                <button
                  type="button"
                  className={
                    reviewRange ===
                    '30'
                      ? 'admin-review-date-filter admin-review-date-filter-active'
                      : 'admin-review-date-filter'
                  }
                  onClick={() =>
                    setReviewRange(
                      '30'
                    )
                  }
                >
                  30 DAYS
                </button>


                <button
                  type="button"
                  className={
                    reviewRange ===
                    '90'
                      ? 'admin-review-date-filter admin-review-date-filter-active'
                      : 'admin-review-date-filter'
                  }
                  onClick={() =>
                    setReviewRange(
                      '90'
                    )
                  }
                >
                  90 DAYS
                </button>


                <button
                  type="button"
                  className={
                    reviewRange ===
                    'all'
                      ? 'admin-review-date-filter admin-review-date-filter-active'
                      : 'admin-review-date-filter'
                  }
                  onClick={() =>
                    setReviewRange(
                      'all'
                    )
                  }
                >
                  ALL
                </button>
              </div>


              {filteredReviewItems.length ===
                0 && (
                <div className="admin-empty">
                  {tab ===
                    'news'
                    ? 'NOTHING IN THE NEWSROOM.'
                    : 'NOTHING IN THIS VIEW.'}
                </div>
              )}


              {groupedReviewItems.map(
                (group) => (
                  <div
                    className="admin-review-date-group"
                    key={
                      group.key
                    }
                  >
                    <div className="admin-review-date-heading">
                      <span>
                        {
                          group.label
                        }
                      </span>

                      <span>
                        {
                          group.records.length
                        }
                      </span>
                    </div>


                    {group.records.map(
                      (
                        record
                      ) => {
                        const newsroomAction =
                          tab ===
                            'news'
                            ? getNewsroomAction(
                                record
                              )
                            : 'new'


                        const previousRecord =
                          record.previousRecord ||
                          null


                        const incomingRecord =
                          record.incomingRecord ||
                          record


                        const displayRecord =
                          getNewsroomDisplayRecord(
                            record
                          )


                        const changedFields =
                          Array.isArray(
                            record.changedFields
                          ) &&
                          record.changedFields.length >
                            0
                            ? record.changedFields
                            : getNewsroomChangedFields(
                                previousRecord,
                                incomingRecord
                              )


                        return (
                          <article
                            className="admin-review-record"
                            key={
                              record.id
                            }
                          >
                            <div className="admin-record-top">
                              <span className="admin-record-type">
                                {tab ===
                                  'news'
                                  ? (
                                      `${getNewsroomSourceIcon(
                                        record
                                      )} ` +
                                      `${getNewsroomSourceLabel(
                                        record
                                      )} · ` +
                                      `${getNewsroomActionLabel(
                                        record
                                      )}`
                                    )
                                  : (
                                      record.category ||
                                      tabLabel(
                                        tab
                                      )
                                    )}
                              </span>

                              <div className="admin-record-meta">
                                {tab ===
                                  'news'
                                  ? (
                                      record.category &&
                                      record.category !==
                                        'ttc' &&
                                      record.category !==
                                        'fire'
                                        ? String(
                                            record.category
                                          )
                                            .replace(
                                              /-/g,
                                              ' '
                                            )
                                            .toUpperCase()
                                        : ''
                                    )
                                  : getReviewSourceLabel(
                                      record
                                    )}

                                {tab ===
                                  'new' &&
                                  record.status && (
                                  <>
                                    {' · '}
                                    {
                                      String(
                                        record.status
                                      )
                                        .toUpperCase()
                                    }
                                  </>
                                )}
                              </div>
                            </div>


                            {tab ===
                              'news' &&
                              newsroomAction ===
                                'update' && (
                              <>
                                <div
                                  className="admin-record-meta"
                                  style={{
                                    marginTop:
                                      '10px',

                                    fontWeight:
                                      700,
                                  }}
                                >
                                  CHANGED · {
                                    changedFields.length >
                                      0
                                      ? changedFields
                                          .map(
                                            formatNewsroomFieldLabel
                                          )
                                          .join(
                                            ' · '
                                          )
                                      : 'OFFICIAL SOURCE UPDATE'
                                  }
                                </div>

                                <div
                                  style={{
                                    display:
                                      'grid',

                                    gap:
                                      '12px',

                                    margin:
                                      '12px 0',
                                  }}
                                >
                                  <div
                                    style={{
                                      border:
                                        '1px solid currentColor',

                                      padding:
                                        '12px',
                                    }}
                                  >
                                    <div className="admin-record-meta">
                                      CURRENT PIN
                                    </div>

                                    <h2>
                                      {
                                        previousRecord?.title ||
                                        record.title
                                      }
                                    </h2>

                                    {(previousRecord?.intersection ||
                                      previousRecord?.location) && (
                                      <div className="admin-record-location">
                                        {
                                          previousRecord.intersection ||
                                          previousRecord.location
                                        }
                                      </div>
                                    )}

                                    {previousRecord?.description && (
                                      <p>
                                        {
                                          previousRecord.description
                                        }
                                      </p>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      border:
                                        '2px solid currentColor',

                                      padding:
                                        '12px',
                                    }}
                                  >
                                    <div className="admin-record-meta">
                                      NEW INFORMATION
                                    </div>

                                    <h2>
                                      {
                                        incomingRecord.title ||
                                        record.title
                                      }
                                    </h2>

                                    {(incomingRecord.intersection ||
                                      incomingRecord.location) && (
                                      <div className="admin-record-location">
                                        {
                                          incomingRecord.intersection ||
                                          incomingRecord.location
                                        }
                                      </div>
                                    )}

                                    {incomingRecord.description && (
                                      <p>
                                        {
                                          incomingRecord.description
                                        }
                                      </p>
                                    )}

                                    {incomingRecord.ttcEffect && (
                                      <div className="admin-record-meta">
                                        TTC STATUS · {
                                          String(
                                            incomingRecord.ttcEffect
                                          )
                                            .replace(
                                              /_/g,
                                              ' '
                                            )
                                        }
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}


                            {tab ===
                              'news' &&
                              newsroomAction ===
                                'resolve' && (
                              <>
                                <div
                                  style={{
                                    border:
                                      '2px solid currentColor',

                                    padding:
                                      '12px',

                                    margin:
                                      '12px 0',
                                  }}
                                >
                                  <div className="admin-record-meta">
                                    CURRENT PIN TO CLOSE
                                  </div>

                                  <h2>
                                    {
                                      displayRecord.title ||
                                      record.title
                                    }
                                  </h2>

                                  {(displayRecord.intersection ||
                                    displayRecord.location) && (
                                    <div className="admin-record-location">
                                      {
                                        displayRecord.intersection ||
                                        displayRecord.location
                                      }
                                    </div>
                                  )}

                                  {displayRecord.description && (
                                    <p>
                                      {
                                        displayRecord.description
                                      }
                                    </p>
                                  )}
                                </div>

                                <div className="admin-record-meta">
                                  {isTpsNewsroomRecord(
                                    record
                                  )
                                    ? 'OFFICIAL TPS RESOLUTION / LOCATED UPDATE'
                                    : (
                                        record.resolutionReason ===
                                          'missing-from-live-feed'
                                          ? (
                                              `NO LONGER PRESENT IN OFFICIAL LIVE FEED` +
                                              (
                                                record.missingPolls
                                                  ? ` · ${record.missingPolls} CONSECUTIVE CHECKS`
                                                  : ''
                                              )
                                            )
                                          : 'OFFICIAL SOURCE REQUESTS RESOLUTION'
                                      )}
                                </div>
                              </>
                            )}


                            {(
                              tab !==
                                'news' ||
                              newsroomAction ===
                                'new'
                            ) && (
                              <>
                                <h2>
                                  {
                                    record.title
                                  }
                                </h2>

                                {(record.intersection ||
                                  record.location) && (
                                  <div className="admin-record-location">
                                    {
                                      record.intersection ||
                                      record.location
                                    }
                                  </div>
                                )}

                                {record.description && (
                                  <p>
                                    {
                                      record.description
                                    }
                                  </p>
                                )}
                              </>
                            )}


                            {record.announcedAt && (
                              <div className="admin-record-meta">
                                ANNOUNCED · {
                                  record.announcedAt
                                }
                              </div>
                            )}


                            {(record.planningApplicationNumber ||
                              (Array.isArray(
                                record.planningApplicationNumbers
                              ) &&
                                record.planningApplicationNumbers[0])) && (
                              <div className="admin-record-meta">
                                APPLICATION · {
                                  record.planningApplicationNumber ||
                                  record.planningApplicationNumbers[0]
                                }
                              </div>
                            )}


                            {tab ===
                              'news' && (
                              <>
                                {(record.category ===
                                  'ttc'
                                  ? (
                                      record.ttcSourceTime ||
                                      record.publishedAt
                                    )
                                  : (
                                      record.publishedAt ||
                                      record.firstSeenAt ||
                                      record.receivedAt
                                    )) && (
                                  <div className="admin-record-meta">
                                    SOURCE TIME · {
                                      formatTorontoNewsTimestamp(
                                        record.category ===
                                          'ttc'
                                          ? (
                                              record.ttcSourceTime ||
                                              record.publishedAt
                                            )
                                          : (
                                              record.publishedAt ||
                                              record.firstSeenAt ||
                                              record.receivedAt
                                            )
                                      )
                                    }
                                  </div>
                                )}

                                {newsroomAction ===
                                  'update' &&
                                  record.sourceUpdatedAt && (
                                  <div className="admin-record-meta">
                                    UPDATED · {
                                      formatTorontoNewsTimestamp(
                                        record.sourceUpdatedAt
                                      )
                                    }
                                  </div>
                                )}

                                {(record.lastCheckedAt ||
                                  record.lastSeenAt) && (
                                  <div className="admin-record-meta">
                                    LAST CHECKED · {
                                      formatTorontoNewsTimestamp(
                                        record.lastCheckedAt ||
                                        record.lastSeenAt
                                      )
                                    }
                                  </div>
                                )}

                                {record.resolutionDetectedAt && (
                                  <div className="admin-record-meta">
                                    RESOLUTION DETECTED · {
                                      formatTorontoNewsTimestamp(
                                        record.resolutionDetectedAt
                                      )
                                    }
                                  </div>
                                )}
                              </>
                            )}


                            {tab !==
                              'news' &&
                              record.publishedAt && (
                              <div className="admin-record-meta">
                                PUBLISHED · {
                                  formatTorontoNewsTimestamp(
                                    record.publishedAt
                                  )
                                }
                              </div>
                            )}


                            {isTpsNewsroomRecord(
                              record
                            ) &&
                              (record.caseNumber ||
                                record.incidentNumber ||
                                record.goNumber) && (
                              <div className="admin-record-meta">
                                CASE # {
                                  record.caseNumber ||
                                  record.incidentNumber ||
                                  record.goNumber
                                }
                              </div>
                            )}


                            {displayRecord.imageUrl && (
                              <img
                                src={
                                  normalizeSourceUrl(
                                    displayRecord.imageUrl
                                  )
                                }
                                alt=""
                                loading="lazy"
                                onError={
                                  (
                                    event
                                  ) => {
                                    event.currentTarget.style.display =
                                      'none'
                                  }
                                }
                                style={{
                                  display:
                                    'block',

                                  width:
                                    '100%',

                                  maxWidth:
                                    '420px',

                                  maxHeight:
                                    '260px',

                                  objectFit:
                                    'cover',

                                  margin:
                                    '12px 0',

                                  borderRadius:
                                    '4px',
                                }}
                              />
                            )}


                            {tab ===
                              'news' &&
                              newsroomAction ===
                                'new' && (
                              <div className="admin-record-meta">
                                PIN · {
                                  hasRecordCoordinates(
                                    record
                                  )
                                    ? 'READY'
                                    : 'AUTO PLACE ON APPROVE'
                                }
                              </div>
                            )}


                            {tab ===
                              'news' &&
                              (
                                newsroomAction ===
                                  'update' ||
                                newsroomAction ===
                                  'resolve'
                              ) && (
                              <div className="admin-record-meta">
                                AUTOMATIC · {
                                  newsroomAction ===
                                    'resolve'
                                    ? 'PUBLIC PIN ALREADY CLOSED'
                                    : 'PUBLIC PIN ALREADY UPDATED'
                                }
                              </div>
                            )}


                            {(displayRecord.source ||
                              record.source) && (
                              <div className="admin-record-meta">
                                SOURCE · {(displayRecord.sourceUrl ||
                                  record.sourceUrl)
                                  ? (
                                      <a
                                        href={
                                          displayRecord.sourceUrl ||
                                          record.sourceUrl
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {
                                          displayRecord.source ||
                                          record.source
                                        }
                                      </a>
                                    )
                                  : (
                                      displayRecord.source ||
                                      record.source
                                    )}
                              </div>
                            )}


                            <div className="admin-record-actions">
                              <button
                                type="button"
                                className="admin-review-approve"
                                disabled={
                                  approvingReviewId ===
                                  record.id
                                }
                                onClick={() =>
                                  approveReview(
                                    record
                                  )
                                }
                              >
                                {
                                  approvingReviewId ===
                                  record.id
                                    ? 'PLACING…'
                                    : tab ===
                                        'news'
                                      ? getNewsroomApproveLabel(
                                          record
                                        )
                                      : 'APPROVE'
                                }
                              </button>

                              {!(
                                tab ===
                                  'news' &&
                                (
                                  newsroomAction ===
                                    'update' ||
                                  newsroomAction ===
                                    'resolve'
                                )
                              ) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      editReview(
                                        record
                                      )
                                    }
                                  >
                                    EDIT
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      rejectReview(
                                        record
                                      )
                                    }
                                  >
                                    REJECT
                                  </button>
                                </>
                              )}
                            </div>
                          </article>
                        )
                      }
                    )}

                  </div>
                )
              )}
            </div>
          )}


          {recordsPanel ===
            'published' && (
            <div className="admin-published-section">
              <div className="admin-section-heading">
              PUBLISHED · {
                filteredPublishedRecords.length
              }

              {tab ===
                'news' &&
                filteredPublishedRecords.length !==
                  sortedRecords.length && (
                <>
                  {' / '}
                  {
                    sortedRecords.length
                  }
                </>
              )}
            </div>


            {tab ===
              'news' && (
              <div className="admin-review-type-filters">
                {[
                  [
                    'all',
                    'ALL',
                    '',
                  ],

                  [
                    'police',
                    'POLICE',
                    '🚔',
                  ],

                  [
                    'fire',
                    'FIRE',
                    '🚒',
                  ],

                  [
                    'transit',
                    'TRANSIT',
                    '🚌',
                  ],

                  [
                    'other',
                    'OTHER',
                    '•',
                  ],
                ].map(
                  ([
                    value,
                    label,
                    icon,
                  ]) => (
                    <button
                      type="button"
                      className={
                        publishedNewsSourceFilter ===
                        value
                          ? 'admin-review-type-filter admin-review-type-filter-active'
                          : 'admin-review-type-filter'
                      }
                      key={
                        value
                      }
                      onClick={() =>
                        setPublishedNewsSourceFilter(
                          value
                        )
                      }
                    >
                      {icon
                        ? `${icon} ${label}`
                        : label}

                      <span>
                        {
                          publishedNewsSourceCounts[
                            value
                          ] ||
                          0
                        }
                      </span>
                    </button>
                  )
                )}
              </div>
            )}


            {tab ===
              'news' && (
              <>
                <div className="admin-review-type-filters">
                  {[
                    [
                      'all',
                      'ALL STATUS',
                    ],

                    [
                      'live',
                      'LIVE',
                    ],

                    [
                      'unpublished',
                      'UNPUBLISHED',
                    ],
                  ].map(
                    ([
                      value,
                      label,
                    ]) => (
                      <button
                        type="button"
                        className={
                          publishedNewsStatusFilter ===
                          value
                            ? 'admin-review-type-filter admin-review-type-filter-active'
                            : 'admin-review-type-filter'
                        }
                        key={
                          value
                        }
                        onClick={() =>
                          setPublishedNewsStatusFilter(
                            value
                          )
                        }
                      >
                        {label}

                        <span>
                          {
                            publishedNewsStatusCounts[
                              value
                            ] ||
                            0
                          }
                        </span>
                      </button>
                    )
                  )}
                </div>


                <div
                  style={{
                    display:
                      'grid',

                    gridTemplateColumns:
                      'minmax(180px, 1fr) minmax(150px, 220px)',

                    gap:
                      '8px',

                    margin:
                      '8px 0 14px',
                  }}
                >
                  <input
                    type="search"
                    value={
                      publishedNewsSearch
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPublishedNewsSearch(
                          event.target.value
                        )
                    }
                    placeholder="Search published stories…"
                    aria-label="Search published stories"
                  />


                  <select
                    value={
                      publishedNewsSort
                    }
                    onChange={
                      (
                        event
                      ) =>
                        setPublishedNewsSort(
                          event.target.value
                        )
                    }
                    aria-label="Sort published stories"
                  >
                    <option value="activity">
                      LATEST ACTIVITY
                    </option>

                    <option value="newest">
                      NEWEST SOURCE TIME
                    </option>

                    <option value="expires">
                      EXPIRES SOONEST
                    </option>

                    <option value="title">
                      TITLE A–Z
                    </option>
                  </select>
                </div>
              </>
            )}


            {filteredPublishedRecords.length ===
              0 && (
              <div className="admin-empty">
                NOTHING PUBLISHED YET.
              </div>
            )}


            {filteredPublishedRecords.map(
              (record) => (
                <article
                  className={
                    record.active ===
                    false
                      ? 'admin-record admin-record-inactive'
                      : 'admin-record'
                  }
                  key={
                    record.id
                  }
                >
                  <div className="admin-record-top">
                    <span className="admin-record-type">
                      {tab ===
                        'news'
                        ? (
                            `${getNewsroomSourceIcon(
                              record
                            )} ` +
                            `${getNewsroomSourceLabel(
                              record
                            )}` +
                            (
                              record.category &&
                              record.category !==
                                'ttc' &&
                              record.category !==
                                'fire'
                                ? (
                                    ' · ' +
                                    String(
                                      record.category
                                    )
                                      .replace(
                                        /-/g,
                                        ' '
                                      )
                                      .toUpperCase()
                                  )
                                : ''
                            )
                          )
                        : (
                            record.category ||
                            tabLabel(
                              tab
                            )
                          )}
                    </span>

                    <span className="admin-record-status">
                      {record.active ===
                      false
                        ? 'DRAFT'
                        : 'LIVE'}
                    </span>
                  </div>


                  <h2>
                    {
                      record.title
                    }
                  </h2>


                  {(record.intersection ||
                    record.location) && (
                    <div className="admin-record-location">
                      {
                        record.intersection ||
                        record.location
                      }
                    </div>
                  )}


                  {record.description && (
                    <p>
                      {
                        record.description
                      }
                    </p>
                  )}



                  {record.imageUrl && (
                    <img
                      src={
                        normalizeSourceUrl(
                          record.imageUrl
                        )
                      }
                      alt=""
                      loading="lazy"
                      onError={
                        (event) => {
                          event.currentTarget.style.display =
                            'none'
                        }
                      }
                      style={{
                        display:
                          'block',

                        width:
                          '100%',

                        maxWidth:
                          '420px',

                        maxHeight:
                          '260px',

                        objectFit:
                          'cover',

                        margin:
                          '12px 0',

                        borderRadius:
                          '4px',
                      }}
                    />
                  )}


                  <div className="admin-record-meta">
                    {tab ===
                      'news' &&
                      formatTorontoNewsTimestamp(
                        record.publishedAt
                      )}

                    {tab ===
                      'news' &&
                      record.lastNewsroomAction ===
                        'update' &&
                      record.sourceUpdatedAt && (
                      <>
                        {' · UPDATED '}
                        {
                          formatTorontoNewsTimestamp(
                            record.sourceUpdatedAt
                          )
                        }
                      </>
                    )}

                    {tab ===
                      'new' &&
                      record.status}

                    {tab ===
                      'historic' &&
                      historicDateLabel(
                        record
                      )}
                  </div>


                  {tab ===
                    'news' &&
                    getNewsExpiresAt(
                      record
                    ) && (
                    <div className="admin-record-meta">
                      EXPIRES · {
                        formatTorontoNewsTimestamp(
                          getNewsExpiresAt(
                            record
                          )
                        )
                      }
                      {' · '}
                      {
                        formatRemainingNewsTime(
                          record
                        )
                      }
                    </div>
                  )}


                  {tab ===
                    'historic' && (
                    <div className="admin-record-placement">
                      {
                        getHistoricPlacementSummary({
                          city,

                          record:
                            normalizeHistoricRecord(
                              record
                            ),
                        })
                          .title
                      }
                    </div>
                  )}


                  {record.pinPositionMode ===
                    'custom' && (
                    <div className="admin-record-placement">
                      CUSTOM PIN
                    </div>
                  )}


                  <div className="admin-record-actions">
                    <button
                      type="button"
                      className={
                        record.active ===
                          false
                          ? 'admin-review-approve'
                          : 'admin-review-reject'
                      }
                      onClick={() =>
                        toggleRecord(
                          record.id
                        )
                      }
                    >
                      {record.active ===
                      false
                        ? 'PUBLISH'
                        : 'UNPUBLISH'}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        editRecord(
                          record
                        )
                      }
                    >
                      EDIT
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        deleteRecord(
                          record.id
                        )
                      }
                    >
                      DELETE
                    </button>
                  </div>
                </article>
              )
            )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}


export default AdminRoom