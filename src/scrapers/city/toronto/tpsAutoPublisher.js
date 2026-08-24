import {
  CITIES,
} from '../../../cities/index.js'

import {
  getNewsItems,
  saveNewsItems,
} from '../../../admin/adminStore.js'

import {
  searchLocation,
} from '../../../admin/locationSearchUtils.js'


// ============================================================
// TORONTO POLICE · AUTO PUBLISH
// ============================================================
//
// Trusted Toronto Police records:
//
//   TPS official email
//       ↓
//   secured TPS webhook
//       ↓
//   geographic location
//       ↓
//   automatic geocoding
//       ↓
//   NEWS
//
// The browser checks the webhook every 60 seconds.
//
// High-confidence TPS records bypass Admin.
//
// ============================================================


// ============================================================
// SETTINGS
// ============================================================

const TPS_ENDPOINT =
  '/api/geographic/toronto/police/incoming'


const CITY_KEY =
  'toronto'


const TPS_POLL_INTERVAL_MS =
  60 * 1000


const TPS_DEFAULT_EXPIRY_HOURS =
  24


let tpsPollTimer =
  null


let tpsSyncInFlight =
  null


// ============================================================
// COORDINATE VALUE
// ============================================================
//
// Important:
//
//   Number(null) === 0
//   Number('')   === 0
//
// So null / blank coordinates must be rejected BEFORE
// converting them to numbers.
//
// ============================================================

function coordinateValueIsPresent(
  value
) {
  return (
    value !==
      null &&
    value !==
      undefined &&
    String(
      value
    )
      .trim() !==
      ''
  )
}


// ============================================================
// VALID COORDINATES
// ============================================================

function hasCoordinates(
  record,
  city
) {
  const rawLongitude =
    record?.longitude


  const rawLatitude =
    record?.latitude


  if (
    !coordinateValueIsPresent(
      rawLongitude
    ) ||
    !coordinateValueIsPresent(
      rawLatitude
    )
  ) {
    return false
  }


  const longitude =
    Number(
      rawLongitude
    )


  const latitude =
    Number(
      rawLatitude
    )


  if (
    !Number.isFinite(
      longitude
    ) ||
    !Number.isFinite(
      latitude
    )
  ) {
    return false
  }


  const bounds =
    city?.search?.bounds


  if (
    bounds
  ) {
    if (
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
    ) {
      return false
    }
  }


  return true
}


// ============================================================
// TPS RECORD
// ============================================================

function isTpsRecord(
  record
) {
  return (
    record?.source ===
      'Toronto Police Service' ||
    String(
      record?.externalId ||
      ''
    )
      .startsWith(
        'toronto-police-'
      )
  )
}


// ============================================================
// SAME POLICE INCIDENT
// ============================================================

function samePoliceIncident({
  existing,
  incoming,
}) {
  if (
    incoming.externalId &&
    existing.externalId ===
      incoming.externalId
  ) {
    return true
  }


  if (
    incoming.goNumber &&
    existing.goNumber &&
    String(
      existing.goNumber
    ) ===
      String(
        incoming.goNumber
      )
  ) {
    return true
  }


  return false
}


// ============================================================
// FIND PUBLISHED INCIDENT
// ============================================================

function findPublishedIncidentIndex({
  records,
  incoming,
}) {
  return records.findIndex(
    (
      existing
    ) =>
      samePoliceIncident({
        existing,
        incoming,
      })
  )
}


// ============================================================
// GET TPS RECORDS
// ============================================================

async function getIncomingTpsRecords() {
  const response =
    await fetch(
      TPS_ENDPOINT,
      {
        cache:
          'no-store',
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TPS incoming feed failed: ' +
        response.status
      )
    )
  }


  const data =
    await response.json()


  if (
    !Array.isArray(
      data?.records
    )
  ) {
    return []
  }


  return data.records
}


// ============================================================
// RESOLVE LOCATION
// ============================================================

async function resolveTpsLocation({
  record,
  city,
}) {
  if (
    hasCoordinates(
      record,
      city
    )
  ) {
    return {
      longitude:
        Number(
          record.longitude
        ),

      latitude:
        Number(
          record.latitude
        ),

      location:
        record.location ||
        '',

      intersection:
        record.intersection ||
        '',
    }
  }


  const query =
    String(
      record.intersection ||
      record.location ||
      ''
    )
      .trim()


  if (
    !query
  ) {
    return null
  }


  const results =
    await searchLocation({
      value:
        query,

      city,
    })


  if (
    !Array.isArray(
      results
    ) ||
    results.length ===
      0
  ) {
    return null
  }


  const result =
    results.find(
      (
        candidate
      ) =>
        hasCoordinates(
          candidate,
          city
        )
    )


  if (
    !result
  ) {
    return null
  }


  return {
    longitude:
      Number(
        result.longitude
      ),

    latitude:
      Number(
        result.latitude
      ),

    location:
      result.location ||
      result.name ||
      record.location ||
      query,

    intersection:
      result.intersection ||
      record.intersection ||
      query,
  }
}


// ============================================================
// TPS MAP EXPIRY
// ============================================================
//
// Missing-person pins remain active until a matching LOCATED
// update arrives.
//
// All other TPS NEWS pins expire 24 hours after publication.
//
// ============================================================

function getPublishedTpsExpiry(
  record
) {
  if (
    record?.category ===
      'missing'
  ) {
    return ''
  }


  const suppliedExpiry =
    new Date(
      record?.expiresAt ||
      ''
    )
      .getTime()


  if (
    Number.isFinite(
      suppliedExpiry
    )
  ) {
    return new Date(
      suppliedExpiry
    )
      .toISOString()
  }


  const publishedTimestamp =
    new Date(
      record?.publishedAt ||
      ''
    )
      .getTime()


  if (
    Number.isFinite(
      publishedTimestamp
    )
  ) {
    return new Date(
      publishedTimestamp +
      (
        TPS_DEFAULT_EXPIRY_HOURS *
        60 *
        60 *
        1000
      )
    )
      .toISOString()
  }


  return new Date(
    Date.now() +
    (
      TPS_DEFAULT_EXPIRY_HOURS *
      60 *
      60 *
      1000
    )
  )
    .toISOString()
}


// ============================================================
// RECORD TEXT
// ============================================================

function comparableText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase()
}


// ============================================================
// SAME REPORTED LOCATION
// ============================================================

function sameReportedLocation({
  existing,
  incoming,
}) {
  const existingLocation =
    comparableText(
      existing?.intersection ||
      existing?.location
    )


  const incomingLocation =
    comparableText(
      incoming?.intersection ||
      incoming?.location
    )


  if (
    !incomingLocation
  ) {
    return true
  }


  return (
    existingLocation ===
    incomingLocation
  )
}


// ============================================================
// INCOMING HAS NEW INFORMATION
// ============================================================

function incomingHasNewInformation({
  existing,
  incoming,
}) {
  const fields = [
    'title',
    'description',
    'category',
    'publishedAt',
    'expiresAt',
    'location',
    'intersection',
    'locationPrecision',
    'caseNumber',
    'incidentNumber',
    'goNumber',
  ]


  return fields.some(
    (
      field
    ) =>
      comparableText(
        existing?.[field]
      ) !==
      comparableText(
        incoming?.[field]
      )
  )
}


// ============================================================
// BUILD UPDATED NEWS RECORD
// ============================================================
//
// A later TPS email with the same Case # updates the existing
// pin instead of creating a duplicate.
//
// The pin keeps:
//   • its original id
//   • its original created/auto-published time
//   • its original 24-hour expiry clock
//
// The pin receives:
//   • latest title
//   • latest description
//   • latest TPS publication time
//   • latest category / metadata
//
// Coordinates are changed only when the new reported location
// can actually be geocoded.
//
// ============================================================

function buildUpdatedPublishedRecord({
  existing,
  record,
  resolved,
}) {
  const now =
    new Date()
      .toISOString()


  const isMissing =
    record.category ===
      'missing'


  const expiresAt =
    isMissing
      ? ''
      : (
          record.expiresAt ||
          existing.expiresAt ||
          getPublishedTpsExpiry(
            record
          )
        )


  const longitude =
    resolved
      ? resolved.longitude
      : existing.longitude


  const latitude =
    resolved
      ? resolved.latitude
      : existing.latitude


  const location =
    resolved
      ? resolved.location
      : existing.location


  const intersection =
    resolved
      ? resolved.intersection
      : existing.intersection


  return {
    ...existing,
    ...record,

    id:
      existing.id,

    city:
      CITY_KEY,

    type:
      'news',

    category:
      record.category ||
      existing.category ||
      'police',

    longitude,

    latitude,

    searchedLongitude:
      longitude,

    searchedLatitude:
      latitude,

    location,

    intersection,

    locationPrecision:
      record.locationPrecision ||
      existing.locationPrecision ||
      'intersection',

    pinPositionMode:
      'auto',

    active:
      true,

    expiresAt,

    source:
      'Toronto Police Service',

    origin:
      'trusted-feed',

    autoPublished:
      true,

    autoPublishedAt:
      existing.autoPublishedAt ||
      existing.createdAt ||
      now,

    createdAt:
      existing.createdAt ||
      existing.autoPublishedAt ||
      now,

    firstPublishedAt:
      record.firstPublishedAt ||
      existing.firstPublishedAt ||
      existing.publishedAt ||
      record.publishedAt,

    updatedAt:
      now,
  }
}


// ============================================================
// BUILD PUBLISHED NEWS RECORD
// ============================================================

function buildPublishedRecord({
  record,
  resolved,
}) {
  const now =
    new Date()
      .toISOString()


  return {
    ...record,

    id:
      record.externalId ||
      (
        'toronto-police-' +
        Date.now()
      ),

    city:
      CITY_KEY,

    type:
      'news',

    category:
      record.category ||
      'police',

    longitude:
      resolved.longitude,

    latitude:
      resolved.latitude,

    searchedLongitude:
      resolved.longitude,

    searchedLatitude:
      resolved.latitude,

    location:
      resolved.location,

    intersection:
      resolved.intersection,

    locationPrecision:
      record.locationPrecision ||
      'intersection',

    pinPositionMode:
      'auto',

    active:
      true,

    expiresAt:
      getPublishedTpsExpiry(
        record
      ),

    source:
      'Toronto Police Service',

    origin:
      'trusted-feed',

    autoPublished:
      true,

    autoPublishedAt:
      now,

    createdAt:
      record.createdAt ||
      now,

    updatedAt:
      now,
  }
}


// ============================================================
// REMOVE EXPIRED TPS RECORDS
// ============================================================

function removeExpiredTpsRecords(
  records
) {
  const now =
    Date.now()


  return records.filter(
    (
      record
    ) => {
      if (
        !isTpsRecord(
          record
        ) ||
        !record.autoPublished
      ) {
        return true
      }


      if (
        !record.expiresAt
      ) {
        return true
      }


      const expiry =
        new Date(
          record.expiresAt
        )
          .getTime()


      if (
        !Number.isFinite(
          expiry
        )
      ) {
        return true
      }


      return expiry >
        now
    }
  )
}


// ============================================================
// RESOLVE / REMOVE
// ============================================================

function applyResolution({
  records,
  incoming,
}) {
  if (
    incoming.action !==
      'resolve'
  ) {
    return {
      records,

      changed:
        false,
    }
  }


  if (
    !incoming.goNumber
  ) {
    return {
      records,

      changed:
        false,
    }
  }


  const next =
    records.filter(
      (
        record
      ) =>
        !(
          isTpsRecord(
            record
          ) &&
          record.goNumber &&
          String(
            record.goNumber
          ) ===
            String(
              incoming.goNumber
            )
        )
    )


  return {
    records:
      next,

    changed:
      next.length !==
        records.length,
  }
}


// ============================================================
// TPS AUTO PUBLISH
// ============================================================

async function executeTpsPoliceNewsSync() {
  try {
    const city =
      CITIES[
        CITY_KEY
      ]


    if (
      !city
    ) {
      console.warn(
        'TPS AUTO PUBLISH · TORONTO CITY CONFIG MISSING'
      )


      return {
        published:
          0,

        incoming:
          0,
      }
    }


    const incoming =
      await getIncomingTpsRecords()


    const currentNews =
      getNewsItems()


    let published =
      removeExpiredTpsRecords(
        currentNews
      )


    let changed =
      published.length !==
      currentNews.length


    let publishCount =
      0


    // ========================================================
    // RESOLUTIONS FIRST
    // ========================================================

    for (
      const record of
      incoming
    ) {
      const result =
        applyResolution({
          records:
            published,

          incoming:
            record,
        })


      if (
        result.changed
      ) {
        published =
          result.records


        changed =
          true
      }
    }


    // ========================================================
    // NEW POLICE RECORDS
    // ========================================================

    for (
      const record of
      incoming
    ) {
      if (
        record.action !==
          'publish' ||
        record.active ===
          false ||
        !record.trustedSender
      ) {
        continue
      }


      if (
        !record.location &&
        !record.intersection &&
        !hasCoordinates(
          record,
          city
        )
      ) {
        continue
      }


      const incomingExpiry =
        getPublishedTpsExpiry(
          record
        )


      if (
        incomingExpiry
      ) {
        const expiry =
          new Date(
            incomingExpiry
          )
            .getTime()


        if (
          Number.isFinite(
            expiry
          ) &&
          expiry <=
            Date.now()
        ) {
          continue
        }
      }


      const existingIndex =
        findPublishedIncidentIndex({
          records:
            published,

          incoming:
            record,
        })


      if (
        existingIndex >=
        0
      ) {
        const existing =
          published[
            existingIndex
          ]


        const existingHasCoordinates =
          hasCoordinates(
            existing,
            city
          )


        const locationChanged =
          !sameReportedLocation({
            existing,
            incoming:
              record,
          })


        const hasNewInformation =
          incomingHasNewInformation({
            existing,
            incoming:
              record,
          })


        if (
          existingHasCoordinates &&
          !locationChanged &&
          !hasNewInformation
        ) {
          continue
        }


        let updatedLocation =
          null


        if (
          !existingHasCoordinates ||
          locationChanged
        ) {
          try {
            updatedLocation =
              await resolveTpsLocation({
                record,
                city,
              })
          }
          catch (
            error
          ) {
            console.warn(
              'TPS AUTO UPDATE · LOCATION FAILED:',
              (
                record.intersection ||
                record.location
              ),
              error
            )
          }
        }


        if (
          !existingHasCoordinates &&
          !updatedLocation
        ) {
          console.warn(
            'TPS AUTO UPDATE · NO LOCATION:',
            record.title
          )


          continue
        }


        const updatedRecord =
          buildUpdatedPublishedRecord({
            existing,
            record,
            resolved:
              updatedLocation,
          })


        published = [
          ...published.slice(
            0,
            existingIndex
          ),
          updatedRecord,
          ...published.slice(
            existingIndex +
            1
          ),
        ]


        changed =
          true


        console.log(
          'TPS AUTO UPDATED:',
          updatedRecord.title,
          '· CASE',
          (
            updatedRecord.caseNumber ||
            updatedRecord.incidentNumber ||
            updatedRecord.goNumber ||
            'UNKNOWN'
          )
        )


        continue
      }


      let resolved


      try {
        resolved =
          await resolveTpsLocation({
            record,
            city,
          })
      }
      catch (
        error
      ) {
        console.warn(
          'TPS AUTO PUBLISH · LOCATION FAILED:',
          (
            record.intersection ||
            record.location
          ),
          error
        )


        continue
      }


      if (
        !resolved
      ) {
        console.warn(
          'TPS AUTO PUBLISH · NO LOCATION:',
          record.title
        )


        continue
      }


      const nextRecord =
        buildPublishedRecord({
          record,
          resolved,
        })


      published = [
        nextRecord,
        ...published,
      ]


      publishCount++


      changed =
        true


      console.log(
        'TPS AUTO PUBLISHED:',
        nextRecord.title,
        '→',
        nextRecord.location,
        '·',
        nextRecord.longitude,
        nextRecord.latitude
      )
    }


    if (
      changed
    ) {
      saveNewsItems(
        published
      )


      window.dispatchEvent(
        new Event(
          'storage'
        )
      )
    }


    console.log(
      'TPS AUTO SYNC COMPLETE:',
      incoming.length,
      'incoming ·',
      publishCount,
      'published'
    )


    return {
      incoming:
        incoming.length,

      published:
        publishCount,

      changed,
    }
  }
  catch (
    error
  ) {
    console.error(
      'TPS AUTO PUBLISH ERROR:',
      error
    )


    return {
      incoming:
        0,

      published:
        0,

      changed:
        false,

      error,
    }
  }
}
// ============================================================
// GUARDED SYNC
// ============================================================
//
// React StrictMode can call the mount effect twice in
// development. Reuse the same in-flight request.
//
// ============================================================

async function runTpsPoliceNewsSync() {
  if (
    tpsSyncInFlight
  ) {
    return tpsSyncInFlight
  }


  tpsSyncInFlight =
    executeTpsPoliceNewsSync()


  try {
    return await tpsSyncInFlight
  }
  finally {
    tpsSyncInFlight =
      null
  }
}


// ============================================================
// START TPS POLLING
// ============================================================

function ensureTpsPollingStarted() {
  if (
    typeof window ===
      'undefined' ||
    tpsPollTimer
  ) {
    return
  }


  tpsPollTimer =
    window.setInterval(
      () => {
        runTpsPoliceNewsSync()
      },
      TPS_POLL_INTERVAL_MS
    )


  console.log(
    'TPS WEBHOOK POLLING STARTED · 60 SECONDS'
  )
}


// ============================================================
// PUBLIC SYNC
// ============================================================
//
// App.jsx already calls this once on mount.
//
// That first call now:
//   1. starts polling
//   2. immediately checks the secured webhook
//
// ============================================================

export async function syncTpsPoliceNews() {
  ensureTpsPollingStarted()


  return runTpsPoliceNewsSync()
}


// ============================================================
// STOP TPS POLLING
// ============================================================

export function stopTpsPoliceNewsPolling() {
  if (
    typeof window ===
      'undefined' ||
    !tpsPollTimer
  ) {
    return
  }


  window.clearInterval(
    tpsPollTimer
  )


  tpsPollTimer =
    null
}


// ============================================================
// VITE HMR CLEANUP
// ============================================================

if (
  import.meta.hot
) {
  import.meta.hot.dispose(
    () => {
      stopTpsPoliceNewsPolling()
    }
  )
}