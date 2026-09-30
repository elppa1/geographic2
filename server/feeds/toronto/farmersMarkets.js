import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'

import {
  readPostgresDocument,
  writePostgresDocument,
} from '../../db/postgresMirror.js'


const INCOMING_PATH =
  '/api/geographic/toronto/new/community/farmers-markets/incoming'

const SYNC_PATH =
  '/api/geographic/toronto/new/community/farmers-markets/sync'

const REJECT_PATH =
  '/api/geographic/toronto/new/community/farmers-markets/reject'

const STATUS_PATH =
  '/api/geographic/toronto/new/community/farmers-markets/status'

const STORE_KEY =
  'toronto-farmers-markets-source-v1'

const FMO_DIRECTORY_URL =
  'https://farmersmarketsontario.com/markets/'

const CITY_DIRECTORY_URL =
  'https://www.toronto.ca/business-economy/industry-sector-support/public-markets/public-markets-in-toronto/'

const SOURCE =
  "Farmers' Markets Ontario"

const SOURCE_KEY =
  'farmers-markets-ontario'

const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000

const DIRECTORY_FALLBACK_SLUGS = [
  'allan-gardens-saturday-farmers-market-toronto',
  'annette-village-farmers-market',
  'bloorborden-farmers-market',
  'cabbagetown-farmers-market',
  'dufferin-grove-organic-farmers-market',
  'east-york-farmers-market',
  'junction-farmers-market',
  'st-lawrence-farmers-market',
  'trinity-bellwoods-farmers-market',
]

let syncPromise =
  null

let lastStatus = {
  ok:
    false,

  syncing:
    false,

  lastAttemptAt:
    '',

  lastSuccessAt:
    '',

  discoveredCount:
    0,

  torontoCount:
    0,

  pendingCount:
    0,

  approvedScheduleUpdateCount:
    0,

  needsReviewCount:
    0,

  rejectedCount:
    0,

  error:
    '',
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /<[^>]*>/g,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&#8217;|&#39;|&apos;/gi,
      "'"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function sendJson(
  res,
  status,
  value
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
      value
    )
  )
}


async function readJsonBody(
  req
) {
  let raw =
    ''

  for await (
    const chunk
    of req
  ) {
    raw +=
      chunk.toString(
        'utf8'
      )

    if (
      raw.length >
      250_000
    ) {
      throw new Error(
        'Request body is too large.'
      )
    }
  }

  return raw.trim()
    ? JSON.parse(
        raw
      )
    : {}
}


function slugFromUrl(
  value
) {
  try {
    const parsed =
      new URL(
        value
      )

    const parts =
      parsed.pathname
        .split(
          '/'
        )
        .filter(
          Boolean
        )

    const marketsIndex =
      parts.findIndex(
        (part) =>
          part ===
          'markets'
      )

    return marketsIndex >=
      0
      ? cleanText(
          parts[
            marketsIndex +
            1
          ]
        )
      : ''
  }
  catch {
    return ''
  }
}


function discoverMarketUrls(
  html
) {
  const urls =
    new Set()

  const pattern =
    /href=["']([^"']*\/markets\/[^"'?#]+)["']/gi

  let match

  while (
    (
      match =
        pattern.exec(
          html
        )
    )
  ) {
    try {
      const absolute =
        new URL(
          match[1],
          FMO_DIRECTORY_URL
        )

      const slug =
        slugFromUrl(
          absolute.href
        )

      if (
        slug
      ) {
        urls.add(
          `https://farmersmarketsontario.com/markets/${slug}`
        )
      }
    }
    catch {
      // Ignore malformed links from source HTML.
    }
  }

  if (
    urls.size ===
      0
  ) {
    DIRECTORY_FALLBACK_SLUGS.forEach(
      (slug) =>
        urls.add(
          `https://farmersmarketsontario.com/markets/${slug}`
        )
    )
  }

  return Array.from(
    urls
  )
}


function extractMetaContent(
  html,
  key
) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["']`,
      'i'
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["']`,
      'i'
    ),
  ]

  for (
    const pattern of patterns
  ) {
    const match =
      html.match(
        pattern
      )

    if (
      match?.[1]
    ) {
      return cleanText(
        match[1]
      )
    }
  }

  return ''
}


function extractSectionValue(
  html,
  label
) {
  const escaped =
    label.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )

  const patterns = [
    new RegExp(
      `<h[1-6][^>]*>\\s*${escaped}\\s*<\\/h[1-6]>\\s*<[^>]+>([\\s\\S]*?)<\\/[^>]+>`,
      'i'
    ),

    new RegExp(
      `>${escaped}<[^>]*>[\\s\\S]{0,300}?<[^>]+>([\\s\\S]*?)<\\/[^>]+>`,
      'i'
    ),
  ]

  for (
    const pattern of patterns
  ) {
    const match =
      html.match(
        pattern
      )

    const value =
      cleanText(
        match?.[1] ||
        ''
      )

    if (
      value
    ) {
      return value
    }
  }

  const text =
    cleanText(
      html
    )

  const textPattern =
    new RegExp(
      `${escaped}\\s+(.{1,180}?)(?=\\s+(?:Year Founded|Number of Vendors|Operating Season|Opening Date|Closing Date|Days Open|Hours|Reach Us|Telephone|Facebook|$))`,
      'i'
    )

  return cleanText(
    text.match(
      textPattern
    )?.[1] ||
    ''
  )
}


function parseDateValue(
  value
) {
  const text =
    cleanText(
      value
    )

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

  return date
    .toISOString()
    .slice(
      0,
      10
    )
}


function parseTimeRange(
  value
) {
  const text =
    cleanText(
      value
    )
      .replace(
        /(\d{1,2}):\s*(a\.?m\.?|p\.?m\.?)/gi,
        '$1 $2'
      )

  const matches =
    Array.from(
      text.matchAll(
        /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/gi
      )
    )

  function normalizeTime(
    match,
    inheritedSuffix =
      ''
  ) {
    if (
      !match
    ) {
      return ''
    }

    let hour =
      Number(
        match[1]
      )

    const minute =
      Number(
        match[2] ||
        0
      )

    const suffix =
      cleanText(
        match[3] ||
        inheritedSuffix
      )
        .replace(
          /\./g,
          ''
        )
        .toLowerCase()

    if (
      suffix ===
        'pm' &&
      hour <
        12
    ) {
      hour +=
        12
    }

    if (
      suffix ===
        'am' &&
      hour ===
        12
    ) {
      hour =
        0
    }

    if (
      hour >
        23 ||
      minute >
        59
    ) {
      return ''
    }

    return (
      String(
        hour
      )
        .padStart(
          2,
          '0'
        ) +
      ':' +
      String(
        minute
      )
        .padStart(
          2,
          '0'
        )
    )
  }

  if (
    matches.length <
      2
  ) {
    return {
      openTime:
        '',

      closeTime:
        '',
    }
  }

  const secondSuffix =
    cleanText(
      matches[1]?.[3]
    )


  return {
    openTime:
      normalizeTime(
        matches[0],
        secondSuffix
      ),

    closeTime:
      normalizeTime(
        matches[1]
      ),
  }
}


function normalizeWeekdays(
  value
) {
  const names = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]

  const text =
    cleanText(
      value
    )
      .toLowerCase()

  return names.filter(
    (name) =>
      text.includes(
        name.toLowerCase()
      )
  )
}


function monthFromDate(
  value
) {
  const parsed =
    parseDateValue(
      value
    )

  return parsed
    ? Number(
        parsed.slice(
          5,
          7
        )
      )
    : null
}


function parseJsonLd(
  html
) {
  const blocks =
    Array.from(
      html.matchAll(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      )
    )

  for (
    const block of blocks
  ) {
    try {
      const parsed =
        JSON.parse(
          block[1]
        )

      const values =
        Array.isArray(
          parsed
        )
          ? parsed
          : parsed?.['@graph']
            ? parsed['@graph']
            : [
                parsed,
              ]

      const useful =
        values.find(
          (item) =>
            item?.address ||
            item?.geo ||
            item?.name
        )

      if (
        useful
      ) {
        return useful
      }
    }
    catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  return null
}


function formatAddressFromJsonLd(
  item
) {
  const address =
    item?.address

  if (
    typeof address ===
      'string'
  ) {
    return cleanText(
      address
    )
  }

  return [
    address?.streetAddress,
    address?.addressLocality,
    address?.addressRegion,
    address?.postalCode,
  ]
    .map(
      cleanText
    )
    .filter(
      Boolean
    )
    .join(
      ', '
    )
}


function isTorontoAddress(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()

  return (
    text.includes(
      'toronto'
    ) ||
    text.includes(
      'east york'
    ) ||
    text.includes(
      'etobicoke'
    ) ||
    text.includes(
      'north york'
    ) ||
    text.includes(
      'scarborough'
    ) ||
    text.includes(
      'york, ontario'
    )
  )
}


function calculateNextCheckAt(
  record,
  now =
    new Date()
) {
  const seasonType =
    cleanText(
      record?.seasonType
    )
      .toLowerCase()

  if (
    seasonType ===
      'year-round'
  ) {
    return new Date(
      now.getTime() +
      30 *
        24 *
        60 *
        60 *
        1000
    )
      .toISOString()
  }

  const seasonStart =
    parseDateValue(
      record?.seasonStart
    )

  const seasonEnd =
    parseDateValue(
      record?.seasonEnd
    )

  const today =
    now
      .toISOString()
      .slice(
        0,
        10
      )

  if (
    seasonStart &&
    seasonEnd &&
    today >=
      seasonStart &&
    today <=
      seasonEnd
  ) {
    return new Date(
      now.getTime() +
      7 *
        24 *
        60 *
        60 *
        1000
    )
      .toISOString()
  }

  const reopenMonth =
    Number(
      record?.expectedReopenMonth
    )

  if (
    !Number.isFinite(
      reopenMonth
    )
  ) {
    return new Date(
      now.getTime() +
      30 *
        24 *
        60 *
        60 *
        1000
    )
      .toISOString()
  }

  let expected =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        reopenMonth -
          1,
        15,
        12,
        0,
        0
      )
    )

  if (
    expected.getTime() <=
      now.getTime()
  ) {
    expected =
      new Date(
        Date.UTC(
          now.getUTCFullYear() +
            1,
          reopenMonth -
            1,
          15,
          12,
          0,
          0
        )
      )
  }

  const daysUntil =
    (
      expected.getTime() -
      now.getTime()
    ) /
    (
      24 *
      60 *
      60 *
      1000
    )

  const days =
    daysUntil <=
      60
      ? 3
      : daysUntil <=
          120
        ? 7
        : 30

  return new Date(
    now.getTime() +
    days *
      24 *
      60 *
      60 *
      1000
  )
    .toISOString()
}


function normalizeMarketRecord({
  url,
  html,
  previous =
    null,
}) {
  const slug =
    slugFromUrl(
      url
    )

  const jsonLd =
    parseJsonLd(
      html
    )

  const title =
    cleanText(
      jsonLd?.name ||
      extractMetaContent(
        html,
        'og:title'
      ) ||
      html.match(
        /<h1[^>]*>([\s\S]*?)<\/h1>/i
      )?.[1] ||
      slug
    )

  const description =
    cleanText(
      jsonLd?.description ||
      extractMetaContent(
        html,
        'og:description'
      )
    )

  const address =
    cleanText(
      formatAddressFromJsonLd(
        jsonLd
      ) ||
      extractSectionValue(
        html,
        'Address'
      )
    )

  if (
    !isTorontoAddress(
      address
    )
  ) {
    return null
  }

  const operatingSeason =
    extractSectionValue(
      html,
      'Operating Season'
    )

  const seasonType =
    /year[ -]?round/i.test(
      operatingSeason
    )
      ? 'year-round'
      : 'seasonal'

  const seasonStart =
    parseDateValue(
      extractSectionValue(
        html,
        'Opening Date'
      )
    )

  const seasonEnd =
    parseDateValue(
      extractSectionValue(
        html,
        'Closing Date'
      )
    )

  const weekdays =
    normalizeWeekdays(
      extractSectionValue(
        html,
        'Days Open'
      )
    )

  const hoursText =
    extractSectionValue(
      html,
      'Hours'
    )

  const times =
    parseTimeRange(
      hoursText
    )

  const latitude =
    Number(
      jsonLd?.geo?.latitude
    )

  const longitude =
    Number(
      jsonLd?.geo?.longitude
    )

  const now =
    new Date()
      .toISOString()

  const sourceId =
    slug

  const externalId =
    `${SOURCE_KEY}:${sourceId}`

  const record = {
    ...previous,

    externalId,

    sourceId,

    source:
      SOURCE,

    sourceUrl:
      url,

    citySourceDirectoryUrl:
      CITY_DIRECTORY_URL,

    citySourceId:
      cleanText(
        previous?.citySourceId
      ),

    citySourceUrl:
      cleanText(
        previous?.citySourceUrl
      ),

    citySourceStatus:
      cleanText(
        previous?.citySourceId
      )
        ? 'linked'
        : 'not-linked',

    city:
      'toronto',

    type:
      'new',

    newType:
      'events',

    category:
      'market',

    communityType:
      'farmers-market',

    communityIcon:
      'market',

    lifecycleOverride:
      'keep-live',

    active:
      false,

    title,

    description,

    address,

    location:
      address,

    latitude:
      Number.isFinite(
        latitude
      )
        ? latitude
        : previous?.latitude ??
          null,

    longitude:
      Number.isFinite(
        longitude
      )
        ? longitude
        : previous?.longitude ??
          null,

    seasonType,

    seasonStart,

    seasonEnd,

    previousSeasonStart:
      previous?.seasonStart ||
      previous?.previousSeasonStart ||
      '',

    previousSeasonEnd:
      previous?.seasonEnd ||
      previous?.previousSeasonEnd ||
      '',

    weekdays,

    hoursText,

    openTime:
      times.openTime,

    closeTime:
      times.closeTime,

    expectedReopenMonth:
      monthFromDate(
        seasonStart
      ) ||
      previous?.expectedReopenMonth ||
      null,

    sourceStatus:
      'seen',

    approvalStatus:
      previous?.approvalStatus ||
      'new',

    firstSeenAt:
      previous?.firstSeenAt ||
      now,

    lastSeenAt:
      now,

    lastCheckedAt:
      now,

    displayOverrides:
      previous?.displayOverrides ||
      {},
  }

  record.nextCheckAt =
    calculateNextCheckAt(
      record
    )

  return record
}


async function readState() {
  const result =
    await readPostgresDocument({
      storeKey:
        STORE_KEY,
    })

  const payload =
    result?.found &&
    result?.payload &&
    typeof result.payload ===
      'object'
      ? result.payload
      : {}

  return {
    records:
      Array.isArray(
        payload.records
      )
        ? payload.records
        : [],

    rejectedSourceIds:
      Array.isArray(
        payload.rejectedSourceIds
      )
        ? payload.rejectedSourceIds
        : [],

    lastSyncAt:
      cleanText(
        payload.lastSyncAt
      ),
  }
}


async function writeState(
  state
) {
  await writePostgresDocument({
    storeKey:
      STORE_KEY,

    payload:
      state,
  })
}


function sourceIdentity(
  record
) {
  return cleanText(
    record?.sourceId ||
    record?.externalId
  )
}


async function getPublishedMarkets() {
  const records =
    await getGeographicPins({
      city:
        'toronto',

      type:
        'new',

      subtype:
        'events',

      status:
        'all',
    })

  return records.filter(
    (record) =>
      cleanText(
        record?.communityType
      )
        .toLowerCase() ===
        'farmers-market'
  )
}


function sameMarketLocation(
  published,
  source
) {
  const publishedAddress =
    cleanText(
      published?.address ||
      published?.location
    )
      .toLowerCase()

  const sourceAddress =
    cleanText(
      source?.address ||
      source?.location
    )
      .toLowerCase()

  if (
    publishedAddress &&
    sourceAddress &&
    publishedAddress !==
      sourceAddress
  ) {
    return false
  }

  const publishedLat =
    Number(
      published?.latitude
    )

  const publishedLng =
    Number(
      published?.longitude
    )

  const sourceLat =
    Number(
      source?.latitude
    )

  const sourceLng =
    Number(
      source?.longitude
    )

  if (
    Number.isFinite(
      publishedLat
    ) &&
    Number.isFinite(
      publishedLng
    ) &&
    Number.isFinite(
      sourceLat
    ) &&
    Number.isFinite(
      sourceLng
    ) &&
    (
      Math.abs(
        publishedLat -
        sourceLat
      ) >
        0.002 ||
      Math.abs(
        publishedLng -
        sourceLng
      ) >
        0.002
    )
  ) {
    return false
  }

  return true
}


async function syncApprovedSchedules(
  sourceRecords
) {
  const published =
    await getPublishedMarkets()

  const publishedByExternalId =
    new Map(
      published
        .map(
          (record) => [
            cleanText(
              record?.externalId
            ),
            record,
          ]
        )
        .filter(
          ([externalId]) =>
            Boolean(
              externalId
            )
        )
    )

  const scheduleFields = [
    'seasonType',
    'seasonStart',
    'seasonEnd',
    'previousSeasonStart',
    'previousSeasonEnd',
    'weekdays',
    'hoursText',
    'openTime',
    'closeTime',
    'expectedReopenMonth',
    'lastSeenAt',
    'lastCheckedAt',
    'nextCheckAt',
    'sourceStatus',
    'citySourceDirectoryUrl',
    'citySourceId',
    'citySourceUrl',
    'citySourceStatus',
  ]

  let updatedCount =
    0

  let needsReviewCount =
    0

  for (
    const source of sourceRecords
  ) {
    const publishedRecord =
      publishedByExternalId.get(
        cleanText(
          source?.externalId
        )
      )

    if (
      !publishedRecord
    ) {
      continue
    }

    if (
      !sameMarketLocation(
        publishedRecord,
        source
      )
    ) {
      source.approvalStatus =
        'update'

      source.updateReason =
        'location-change'

      needsReviewCount +=
        1

      continue
    }

    const next = {
      ...publishedRecord,
    }

    scheduleFields.forEach(
      (field) => {
        next[field] =
          source[field]
      }
    )

    next.lifecycleOverride =
      'keep-live'

    next.communityType =
      'farmers-market'

    next.category =
      'market'

    next.updatedAt =
      new Date()
        .toISOString()

    await upsertGeographicPin({
      city:
        'toronto',

      type:
        'new',

      subtype:
        'events',

      identity:
        'external:' +
        cleanText(
          next.externalId
        ),

      previousIdentity:
        'external:' +
        cleanText(
          next.externalId
        ),

      record:
        next,
    })

    source.approvalStatus =
      'active'

    updatedCount +=
      1
  }

  return {
    updatedCount,
    needsReviewCount,
  }
}


async function syncMarkets({
  force =
    false,
} = {}) {
  if (
    syncPromise
  ) {
    return syncPromise
  }

  syncPromise =
    (async () => {
      const now =
        new Date()

      const nowIso =
        now.toISOString()

      lastStatus = {
        ...lastStatus,

        syncing:
          true,

        lastAttemptAt:
          nowIso,

        error:
          '',
      }

      try {
        const state =
          await readState()

        if (
          !force &&
          state.lastSyncAt
        ) {
          const lastSync =
            new Date(
              state.lastSyncAt
            )

          if (
            !Number.isNaN(
              lastSync.getTime()
            ) &&
            now.getTime() -
              lastSync.getTime() <
              SYNC_INTERVAL_MS
          ) {
            lastStatus = {
              ...lastStatus,

              ok:
                true,

              syncing:
                false,

              lastSuccessAt:
                state.lastSyncAt,

              torontoCount:
                state.records.length,

              rejectedCount:
                state.rejectedSourceIds.length,
            }

            return state
          }
        }

        const directoryResponse =
          await fetch(
            FMO_DIRECTORY_URL,
            {
              headers: {
                'User-Agent':
                  'TorontoGeographic/1.0 farmers-market sync',
              },
            }
          )

        if (
          !directoryResponse.ok
        ) {
          throw new Error(
            `Farmers' Markets Ontario directory returned ${directoryResponse.status}.`
          )
        }

        const directoryHtml =
          await directoryResponse.text()

        const urls =
          discoverMarketUrls(
            directoryHtml
          )

        const existingBySource =
          new Map(
            state.records.map(
              (record) => [
                sourceIdentity(
                  record
                ),
                record,
              ]
            )
          )

        const nextBySource =
          new Map(
            existingBySource
          )

        let torontoCount =
          0

        for (
          const url of urls
        ) {
          const slug =
            slugFromUrl(
              url
            )

          const previous =
            existingBySource.get(
              slug
            ) ||
            null

          if (
            !force &&
            previous?.nextCheckAt
          ) {
            const due =
              new Date(
                previous.nextCheckAt
              )

            if (
              !Number.isNaN(
                due.getTime()
              ) &&
              due.getTime() >
                now.getTime()
            ) {
              continue
            }
          }

          let response

          try {
            response =
              await fetch(
                url,
                {
                  headers: {
                    'User-Agent':
                      'TorontoGeographic/1.0 farmers-market sync',
                  },
                }
              )
          }
          catch {
            continue
          }

          if (
            !response.ok
          ) {
            continue
          }

          const html =
            await response.text()

          const record =
            normalizeMarketRecord({
              url,
              html,
              previous,
            })

          if (
            !record
          ) {
            continue
          }

          torontoCount +=
            1

          nextBySource.set(
            record.sourceId,
            record
          )
        }

        const nextState = {
          records:
            Array.from(
              nextBySource.values()
            ),

          rejectedSourceIds:
            state.rejectedSourceIds,

          lastSyncAt:
            nowIso,
        }


        const approvedSync =
          await syncApprovedSchedules(
            nextState.records
          )


        await writeState(
          nextState
        )

        lastStatus = {
          ...lastStatus,

          ok:
            true,

          syncing:
            false,

          lastSuccessAt:
            nowIso,

          discoveredCount:
            urls.length,

          torontoCount:
            nextState.records.length ||
            torontoCount,

          approvedScheduleUpdateCount:
            approvedSync.updatedCount,

          needsReviewCount:
            approvedSync.needsReviewCount,

          rejectedCount:
            nextState.rejectedSourceIds.length,

          error:
            '',
        }

        return nextState
      }
      catch (
        error
      ) {
        lastStatus = {
          ...lastStatus,

          ok:
            false,

          syncing:
            false,

          error:
            error?.message ||
            String(
              error
            ),
        }

        throw error
      }
    })()
      .finally(
        () => {
          syncPromise =
            null
        }
      )

  return syncPromise
}


async function getIncoming() {
  let state

  try {
    state =
      await syncMarkets()
  }
  catch {
    state =
      await readState()
  }

  const published =
    await getPublishedMarkets()

  const publishedIds =
    new Set(
      published
        .map(
          (record) =>
            cleanText(
              record?.externalId
            )
        )
        .filter(
          Boolean
        )
    )

  const rejected =
    new Set(
      state.rejectedSourceIds
    )

  const records =
    state.records
      .filter(
        (record) =>
          !rejected.has(
            record.sourceId
          )
      )
      .filter(
        (record) =>
          !publishedIds.has(
            record.externalId
          )
      )
      .map(
        (record) => ({
          ...record,

          id:
            '',

          active:
            false,

          reviewStatus:
            'pending',

          approvalStatus:
            'new',
        })
      )

  lastStatus = {
    ...lastStatus,

    pendingCount:
      records.length,
  }

  return records
}


async function rejectSourceId(
  sourceId
) {
  const cleanId =
    cleanText(
      sourceId
    )

  if (
    !cleanId
  ) {
    return false
  }

  const state =
    await readState()

  const rejected =
    new Set(
      state.rejectedSourceIds
    )

  rejected.add(
    cleanId
  )

  await writeState({
    ...state,

    rejectedSourceIds:
      Array.from(
        rejected
      ),
  })

  return true
}


export function farmersMarketsFeed() {
  return {
    name:
      'toronto-farmers-markets',

    async handle(
      req,
      res,
      url
    ) {
      if (
        url.pathname ===
          STATUS_PATH &&
        req.method ===
          'GET'
      ) {
        sendJson(
          res,
          200,
          lastStatus
        )

        return true
      }

      if (
        url.pathname ===
          INCOMING_PATH &&
        req.method ===
          'GET'
      ) {
        const records =
          await getIncoming()

        sendJson(
          res,
          200,
          {
            ok:
              true,

            records,

            status:
              lastStatus,
          }
        )

        return true
      }

      if (
        url.pathname ===
          SYNC_PATH &&
        (
          req.method ===
            'POST' ||
          req.method ===
            'GET'
        )
      ) {
        const state =
          await syncMarkets({
            force:
              true,
          })

        const records =
          await getIncoming()

        sendJson(
          res,
          200,
          {
            ok:
              true,

            sourceCount:
              state.records.length,

            records,

            status:
              lastStatus,
          }
        )

        return true
      }

      if (
        url.pathname ===
          REJECT_PATH &&
        req.method ===
          'POST'
      ) {
        const body =
          await readJsonBody(
            req
          )

        const rejected =
          await rejectSourceId(
            body?.sourceId
          )

        sendJson(
          res,
          rejected
            ? 200
            : 400,
          {
            ok:
              rejected,
          }
        )

        return true
      }

      return false
    },
  }
}
