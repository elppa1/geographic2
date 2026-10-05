import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


import {
  queueCommunitySync,
} from './communitySyncQueue.js'

const STATUS_PATH =
  '/api/geographic/toronto/new/community/recreation/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/recreation/sync'


const DROP_IN_SCHEDULE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/Drop-in.json'


const COMMUNITY_CENTRES_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/77/query' +
    '?where=1%3D1' +
    '&outFields=' +
      'LOCATIONID%2CASSET_NAME%2CTYPE%2CAMENITIES%2CADDRESS%2C' +
      'PHONE%2CURL%2CLATITUDE%2CLONGITUDE%2CDISTRICT_CCA%2CFREE_CENTRE' +
    '&returnGeometry=false' +
    '&f=json'
  )


const DATASET_PAGE =
  'https://open.toronto.ca/dataset/registered-programs-and-drop-in-courses-offering/'


const PARKS_RECREATION_PAGE =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/'


const FACILITY_BASE_URL =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id='


const SOURCE =
  'City of Toronto Parks & Recreation'


const COMMUNITY_SOURCE_KEY =
  'toronto-recreation-community-centres'


const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000


const UPCOMING_LIMIT =
  3


const MIN_EXPECTED_CENTRES =
  50


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

  centreCount:
    0,

  matchedDropInCount:
    0,

  upcomingProgramCount:
    0,

  archivedCount:
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
      /\s+/g,
      ' '
    )
    .trim()
}


function cleanNullableText(
  value
) {
  const text =
    cleanText(
      value
    )


  return /^none$/i.test(
    text
  )
    ? ''
    : text
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
    ) ||
    'community-centre'
}


function numberOrNull(
  value
) {
  if (
    value ===
      '' ||
    value ===
      null ||
    value ===
      undefined
  ) {
    return null
  }


  const number =
    Number(
      value
    )


  return Number.isFinite(
    number
  )
    ? number
    : null
}


function firstValue(
  object,
  keys
) {
  for (
    const key of keys
  ) {
    const value =
      object?.[
        key
      ]


    if (
      value !==
        undefined &&
      value !==
        null &&
      cleanText(
        value
      )
    ) {
      return value
    }
  }


  return ''
}


async function fetchJson(
  url,
  label
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            'application/json',

          'Accept-Language':
            'en-CA,en;q=0.9',

          'User-Agent':
            'Toronto-Geographic/1.0',
        },

        redirect:
          'follow',

        signal:
          AbortSignal.timeout(
            30000
          ),
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      `${label} failed with HTTP ${response.status}.`
    )
  }


  return response.json()
}


function facilityUrl(
  locationId
) {
  const id =
    cleanText(
      locationId
    )


  return id
    ? (
        FACILITY_BASE_URL +
        encodeURIComponent(
          id
        )
      )
    : PARKS_RECREATION_PAGE
}


function looksLikeCommunityCentre({
  type,
  name,
}) {
  const typeText =
    cleanText(
      type
    )
      .toLowerCase()


  const nameText =
    cleanText(
      name
    )
      .toLowerCase()


  if (
    /\bcommunity\b.*\bcent(?:re|er)\b/.test(
      typeText
    ) ||
    /\brecreation\b.*\bcent(?:re|er)\b/.test(
      typeText
    )
  ) {
    return true
  }


  return (
    /\bcommunity\b.*\bcent(?:re|er)\b/.test(
      nameText
    ) ||
    /\brecreation\b.*\bcent(?:re|er)\b/.test(
      nameText
    )
  )
}


function parseCommunityCentres(
  payload
) {
  const features =
    Array.isArray(
      payload?.features
    )
      ? payload.features
      : []


  return features
    .map(
      (feature) =>
        feature?.attributes ||
        {}
    )
    .map(
      (row) => {
        const locationId =
          cleanText(
            firstValue(
              row,
              [
                'LOCATIONID',
                'Location ID',
                'LocationID',
              ]
            )
          )


        const name =
          cleanText(
            firstValue(
              row,
              [
                'ASSET_NAME',
                'Location Name',
                'LocationName',
                'NAME',
                'Name',
              ]
            )
          )


        const type =
          cleanText(
            firstValue(
              row,
              [
                'TYPE',
                'Location Type',
                'LocationType',
              ]
            )
          )


        const latitude =
          numberOrNull(
            firstValue(
              row,
              [
                'LATITUDE',
                'Latitude',
                'latitude',
                'Lat',
                'lat',
              ]
            )
          )


        const longitude =
          numberOrNull(
            firstValue(
              row,
              [
                'LONGITUDE',
                'Longitude',
                'longitude',
                'Long',
                'long',
                'Lng',
                'lng',
              ]
            )
          )


        if (
          !locationId ||
          !name ||
          latitude ===
            null ||
          longitude ===
            null ||
          !looksLikeCommunityCentre({
            type,
            name,
          })
        ) {
          return null
        }


        const officialUrl =
          cleanText(
            firstValue(
              row,
              [
                'URL',
                'Website',
                'website',
              ]
            )
          )


        return {
          locationId,

          name,

          type,

          address:
            cleanNullableText(
              firstValue(
                row,
                [
                  'ADDRESS',
                  'Address',
                  'address',
                ]
              )
            ),

          telephone:
            cleanNullableText(
              firstValue(
                row,
                [
                  'PHONE',
                  'Phone',
                  'phone',
                ]
              )
            ),

          district:
            cleanNullableText(
              firstValue(
                row,
                [
                  'DISTRICT_CCA',
                  'District',
                  'district',
                ]
              )
            ),

          amenities:
            cleanNullableText(
              firstValue(
                row,
                [
                  'AMENITIES',
                  'Amenities',
                  'amenities',
                ]
              )
            ),

          freeCentre:
            cleanNullableText(
              firstValue(
                row,
                [
                  'FREE_CENTRE',
                  'Free Centre',
                  'freeCentre',
                ]
              )
            ),

          officialUrl:
            /^https?:\/\//i.test(
              officialUrl
            )
              ? officialUrl
              : facilityUrl(
                  locationId
                ),

          latitude,

          longitude,
        }
      }
    )
    .filter(
      Boolean
    )
}


function normalizeDateOnly(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text
  }


  const compact =
    text.match(
      /^(\d{4})(\d{2})(\d{2})$/
    )


  if (
    compact
  ) {
    return (
      compact[1] +
      '-' +
      compact[2] +
      '-' +
      compact[3]
    )
  }


  return ''
}


function timeZoneOffsetMs(
  date,
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hourCycle:
          'h23',
      }
    )
      .formatToParts(
        date
      )


  const values = {}


  parts.forEach(
    (part) => {
      if (
        part.type !==
          'literal'
      ) {
        values[
          part.type
        ] =
          Number(
            part.value
          )
      }
    }
  )


  const asUtc =
    Date.UTC(
      values.year,
      values.month -
        1,
      values.day,
      values.hour,
      values.minute,
      values.second
    )


  return (
    asUtc -
    date.getTime()
  )
}


function torontoLocalToIso({
  dateText,
  hour,
  minute,
}) {
  const match =
    normalizeDateOnly(
      dateText
    )
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      )


  if (
    !match ||
    !Number.isFinite(
      hour
    ) ||
    !Number.isFinite(
      minute
    )
  ) {
    return ''
  }


  const wallClockUtc =
    Date.UTC(
      Number(
        match[1]
      ),
      Number(
        match[2]
      ) -
        1,
      Number(
        match[3]
      ),
      hour,
      minute,
      0
    )


  let candidate =
    new Date(
      wallClockUtc
    )


  let offset =
    timeZoneOffsetMs(
      candidate,
      'America/Toronto'
    )


  candidate =
    new Date(
      wallClockUtc -
      offset
    )


  const correctedOffset =
    timeZoneOffsetMs(
      candidate,
      'America/Toronto'
    )


  if (
    correctedOffset !==
      offset
  ) {
    candidate =
      new Date(
        wallClockUtc -
        correctedOffset
      )
  }


  return Number.isNaN(
    candidate.getTime()
  )
    ? ''
    : candidate.toISOString()
}


function buildDropInProgram(
  row,
  now
) {
  const locationId =
    cleanText(
      firstValue(
        row,
        [
          'Location ID',
          'LocationID',
          'LOCATIONID',
        ]
      )
    )


  const title =
    cleanText(
      firstValue(
        row,
        [
          'Course Title',
          'CourseTitle',
          'Title',
        ]
      )
    )


  const dateText =
    normalizeDateOnly(
      firstValue(
        row,
        [
          'First Date',
          'FirstDate',
          'Date From',
          'DateFrom',
        ]
      )
    )


  const startHour =
    numberOrNull(
      firstValue(
        row,
        [
          'Start Hour',
          'StartHour',
        ]
      )
    )


  const startMinute =
    numberOrNull(
      firstValue(
        row,
        [
          'Start Minute',
          'StartMinute',
        ]
      )
    ) ??
    0


  const endHour =
    numberOrNull(
      firstValue(
        row,
        [
          'End Hour',
          'EndHour',
        ]
      )
    )


  const endMinute =
    numberOrNull(
      firstValue(
        row,
        [
          'End Min',
          'End Minute',
          'EndMinute',
        ]
      )
    ) ??
    0


  if (
    !locationId ||
    !title ||
    !dateText ||
    startHour ===
      null
  ) {
    return null
  }


  const startTime =
    torontoLocalToIso({
      dateText,

      hour:
        startHour,

      minute:
        startMinute,
    })


  if (
    !startTime
  ) {
    return null
  }


  const resolvedEndHour =
    endHour ===
      null
      ? startHour
      : endHour


  let endTime =
    torontoLocalToIso({
      dateText,

      hour:
        resolvedEndHour,

      minute:
        endMinute,
    })


  if (
    !endTime
  ) {
    endTime =
      startTime
  }


  let endDate =
    new Date(
      endTime
    )


  const startDate =
    new Date(
      startTime
    )


  if (
    endDate.getTime() <
      startDate.getTime()
  ) {
    endDate =
      new Date(
        endDate.getTime() +
        24 *
        60 *
        60 *
        1000
      )


    endTime =
      endDate.toISOString()
  }


  if (
    endDate.getTime() <
      now.getTime()
  ) {
    return null
  }


  const courseId =
    cleanText(
      firstValue(
        row,
        [
          'Course_ID',
          'Course ID',
          'CourseID',
        ]
      )
    )


  return {
    eventId:
      (
        courseId ||
        slugify(
          title
        )
      ) +
      '|' +
      startTime,

    courseId,

    title,

    startTime,

    endTime,

    category:
      cleanNullableText(
        firstValue(
          row,
          [
            'Category',
            'CATEGORY',
          ]
        )
      ),

    ageMin:
      cleanNullableText(
        firstValue(
          row,
          [
            'Age Min',
            'AgeMin',
          ]
        )
      ),

    ageMax:
      cleanNullableText(
        firstValue(
          row,
          [
            'Age Max',
            'AgeMax',
          ]
        )
      ),

    isFull:
      false,

    locationId,
  }
}


export function buildCommunityCentreRecords({
  centres,
  dropIns,
  now =
    new Date(),
}) {
  const cleanCentres =
    Array.isArray(
      centres
    )
      ? centres
      : []


  const centreByLocationId =
    new Map(
      cleanCentres.map(
        (centre) => [
          cleanText(
            centre.locationId
          ),
          centre,
        ]
      )
    )


  const programsByLocationId =
    new Map()


  let matchedDropInCount =
    0


  ;(
    Array.isArray(
      dropIns
    )
      ? dropIns
      : []
  )
    .forEach(
      (row) => {
        const program =
          buildDropInProgram(
            row,
            now
          )


        if (
          !program ||
          !centreByLocationId.has(
            program.locationId
          )
        ) {
          return
        }


        matchedDropInCount +=
          1


        const programs =
          programsByLocationId.get(
            program.locationId
          ) ||
          []


        programs.push(
          program
        )


        programsByLocationId.set(
          program.locationId,
          programs
        )
      }
    )


  let upcomingProgramCount =
    0


  const records =
    cleanCentres.map(
      (centre) => {
        const programs =
          (
            programsByLocationId.get(
              centre.locationId
            ) ||
            []
          )
            .sort(
              (
                a,
                b
              ) =>
                new Date(
                  a.startTime
                ) -
                new Date(
                  b.startTime
                )
            )
            .filter(
              (
                program,
                index,
                all
              ) =>
                all.findIndex(
                  (candidate) =>
                    candidate.eventId ===
                    program.eventId
                ) ===
                  index
            )
            .slice(
              0,
              UPCOMING_LIMIT
            )


        upcomingProgramCount +=
          programs.length


        const locationId =
          cleanText(
            centre.locationId
          )


        const sourceUrl =
          centre.officialUrl ||
          facilityUrl(
            locationId
          )


        return {
          externalId:
            `toronto-recreation-centre-${locationId}`,

          city:
            'toronto',

          type:
            'new',

          newType:
            'events',

          category:
            'community-centre',

          communityType:
            'community-centre',

          communitySource:
            COMMUNITY_SOURCE_KEY,

          eventPinIcon:
            'community-centre',

          title:
            centre.name,

          description:
            'City of Toronto community recreation centre.',

          location:
            centre.address ||
            centre.name,

          address:
            centre.address ||
            '',

          telephone:
            centre.telephone ||
            '',

          district:
            centre.district ||
            '',

          amenities:
            centre.amenities ||
            '',

          freeCentre:
            centre.freeCentre ||
            '',

          latitude:
            centre.latitude,

          longitude:
            centre.longitude,

          status:
            'open',

          active:
            true,

          lifecycleOverride:
            'keep-live',

          source:
            SOURCE,

          sourceUrl,

          sources: [
            {
              name:
                SOURCE,

              url:
                sourceUrl,
            },
          ],

          attribution:
            'Contains information licensed under the Open Government Licence – Toronto.',

          recreationLocationId:
            locationId,

          upcomingPrograms:
            programs.map(
              (program) => ({
                ...program,

                url:
                  sourceUrl,
              })
            ),
        }
      }
    )


  return {
    records,

    matchedDropInCount,

    upcomingProgramCount,
  }
}


async function loadOfficialData() {
  const [
    centresPayload,
    dropInsPayload,
  ] =
    await Promise.all([
      fetchJson(
        COMMUNITY_CENTRES_URL,
        'Toronto Parks and Community Centres'
      ),

      fetchJson(
        DROP_IN_SCHEDULE_URL,
        'Toronto recreation drop-in programs'
      ),
    ])


  const centres =
    parseCommunityCentres(
      centresPayload
    )


  const dropIns =
    Array.isArray(
      dropInsPayload
    )
      ? dropInsPayload
      : (
          Array.isArray(
            dropInsPayload?.records
          )
            ? dropInsPayload.records
            : []
        )


  if (
    centres.length <
      MIN_EXPECTED_CENTRES
  ) {
    throw new Error(
      `Community centre sanity check failed: only ${centres.length} centres were parsed.`
    )
  }


  if (
    dropIns.length ===
      0
  ) {
    throw new Error(
      'Community centre drop-in sanity check failed: no drop-in rows were parsed.'
    )
  }


  return {
    centres,
    dropIns,
  }
}


function recordIdentity(
  record
) {
  const externalId =
    cleanText(
      record?.externalId
    )


  return externalId
    ? `external:${externalId}`
    : ''
}


function existingWasManuallyHidden(
  existing
) {
  if (
    existing?.active !==
      false
  ) {
    return false
  }


  const reason =
    cleanText(
      existing?.archiveReason
    )
      .toLowerCase()


  return !reason.startsWith(
    'recreation-'
  )
}


async function writeCommunityCentreRecord({
  record,
  existing =
    null,
}) {
  const now =
    new Date()
      .toISOString()


  const identity =
    recordIdentity(
      record
    )


  const keepHidden =
    existingWasManuallyHidden(
      existing
    )


  const active =
    keepHidden
      ? false
      : true


  const nextRecord = {
    ...existing,
    ...record,

    id:
      existing?.id ||
      (
        'server-new-events-recreation-' +
        slugify(
          record.recreationLocationId ||
          record.title
        )
      ),

    active,

    firstPublishedAt:
      existing?.firstPublishedAt ||
      existing?.publishedAt ||
      now,

    publishedAt:
      existing?.publishedAt ||
      now,

    serverPublishedAt:
      existing?.serverPublishedAt ||
      now,

    serverUpdatedAt:
      now,

    updatedAt:
      now,

    archivedAt:
      active
        ? ''
        : (
            existing?.archivedAt ||
            now
          ),

    archiveReason:
      active
        ? ''
        : (
            existing?.archiveReason ||
            'removed-from-live-map'
          ),
  }


  return upsertGeographicPin({
    city:
      'toronto',

    type:
      'new',

    subtype:
      'events',

    identity,

    previousIdentity:
      existing
        ? recordIdentity(
            existing
          )
        : '',

    record:
      nextRecord,
  })
}


async function archiveMissingCommunityCentreRecord(
  existing
) {
  const now =
    new Date()
      .toISOString()


  const identity =
    recordIdentity(
      existing
    )


  if (
    !identity ||
    existing?.active ===
      false
  ) {
    return existing
  }


  return upsertGeographicPin({
    city:
      'toronto',

    type:
      'new',

    subtype:
      'events',

    identity,

    previousIdentity:
      identity,

    record: {
      ...existing,

      active:
        false,

      archivedAt:
        now,

      archiveReason:
        'recreation-centre-not-in-current-feed',

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


export async function syncCommunityCentres() {
  if (
    syncPromise
  ) {
    return syncPromise
  }


  syncPromise =
    (async () => {
      const attemptAt =
        new Date()
          .toISOString()


      lastStatus = {
        ...lastStatus,

        syncing:
          true,

        lastAttemptAt:
          attemptAt,

        error:
          '',
      }


      try {
        const {
          centres,
          dropIns,
        } =
          await loadOfficialData()


        const built =
          buildCommunityCentreRecords({
            centres,
            dropIns,
          })


        const existingRecords =
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


        const existingCentres =
          existingRecords.filter(
            (record) =>
              record?.communitySource ===
                COMMUNITY_SOURCE_KEY ||
              cleanText(
                record?.externalId
              )
                .startsWith(
                  'toronto-recreation-centre-'
                )
          )


        const existingByExternalId =
          new Map(
            existingCentres.map(
              (record) => [
                cleanText(
                  record.externalId
                ),
                record,
              ]
            )
          )


        const incomingIds =
          new Set()


        for (
          const record of
          built.records
        ) {
          incomingIds.add(
            record.externalId
          )


          await writeCommunityCentreRecord({
            record,

            existing:
              existingByExternalId.get(
                record.externalId
              ) ||
              null,
          })
        }


        let archivedCount =
          0


        for (
          const existing of
          existingCentres
        ) {
          if (
            !incomingIds.has(
              cleanText(
                existing.externalId
              )
            )
          ) {
            const archived =
              await archiveMissingCommunityCentreRecord(
                existing
              )


            if (
              archived
            ) {
              archivedCount +=
                1
            }
          }
        }


        const successAt =
          new Date()
            .toISOString()


        lastStatus = {
          ok:
            true,

          syncing:
            false,

          lastAttemptAt:
            attemptAt,

          lastSuccessAt:
            successAt,

          centreCount:
            built.records.length,

          matchedDropInCount:
            built.matchedDropInCount,

          upcomingProgramCount:
            built.upcomingProgramCount,

          archivedCount,

          error:
            '',
        }


        console.log(
          'COMMUNITY CENTRES · SYNCED',
          lastStatus
        )


        return lastStatus
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
            String(
              error?.message ||
              error
            ),
        }


        console.error(
          'COMMUNITY CENTRES · SYNC FAILED:',
          error
        )


        throw error
      }
    })()


  try {
    return await syncPromise
  }
  finally {
    syncPromise =
      null
  }
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


export function communityCentresFeed() {
  return {
    name:
      'toronto-community-centres',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          queueCommunitySync(
            'COMMUNITY CENTRES',
            syncCommunityCentres
          )
            .catch(
              () => {}
            )
        }


      runScheduledSync()


      const interval =
        setInterval(
          runScheduledSync,
          SYNC_INTERVAL_MS
        )


      interval.unref?.()


      server.httpServer?.once(
        'close',
        () => {
          clearInterval(
            interval
          )
        }
      )


      server.middlewares.use(
        STATUS_PATH,
        (
          req,
          res,
          next
        ) => {
          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'GET'
          ) {
            next()

            return
          }


          sendJson(
            res,
            200,
            {
              ...lastStatus,

              source:
                SOURCE,

              refreshMinutes:
                SYNC_INTERVAL_MS /
                60000,

              upcomingLimit:
                UPCOMING_LIMIT,

              dataset:
                DATASET_PAGE,
            }
          )
        }
      )


      server.middlewares.use(
        SYNC_PATH,
        async (
          req,
          res,
          next
        ) => {
          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'POST'
          ) {
            next()

            return
          }


          try {
            const status =
              await syncCommunityCentres()


            sendJson(
              res,
              200,
              status
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              502,
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
    },
  }
}
