import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


import {
  queueCommunitySync,
} from './communitySyncQueue.js'

const STATUS_PATH =
  '/api/geographic/toronto/new/community/learn4life/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/learn4life/sync'


const TYPESENSE_SEARCH_URL =
  'https://xbz9rq3n5lsp6y4gp-1.a1.typesense.net/collections/tdsb-programs/documents/search'


// Public search-only key used by the public TDSB eBase catalogue.
// Railway can override this if TDSB rotates the browser key.
const TYPESENSE_API_KEY =
  process.env.TDSB_LEARN4LIFE_TYPESENSE_KEY ||
  'Ic7WjOHLytxy5keJaxA8qU7j4gzacAxc'


const TDSB_SCHOOLS_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial28/MapServer/18/query' +
    '?where=1%3D1' +
    '&outFields=' +
      'SCH_NAME%2CADDRESS%2CADDRESS_FULL%2CCITY%2CPOSTAL_CODE%2C' +
      'LATITUDE%2CLONGITUDE' +
    '&returnGeometry=false' +
    '&f=json'
  )


const SOURCE =
  'Toronto District School Board Learn4Life'


const SOURCE_URL =
  'https://www.tdsb.on.ca/adult-learners/learn4life'


const REGISTRATION_URL =
  'https://tdsb.ebasefm.com/programs/welcome/browse'


const COMMUNITY_SOURCE_KEY =
  'tdsb-learn4life'


const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000


const UPCOMING_LIMIT =
  3


const TYPESENSE_PAGE_SIZE =
  250


const TYPESENSE_MAX_PAGES =
  20


const MIN_EXPECTED_PROGRAMS =
  1


const SCHOOL_MATCH_MAX_METRES =
  150


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

  programCount:
    0,

  physicalProgramCount:
    0,

  venueCount:
    0,

  upcomingProgramCount:
    0,

  schoolAddressMatchCount:
    0,

  excludedRemoteCount:
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
    'learn4life'
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


function moneyOrEmpty(
  value
) {
  const number =
    numberOrNull(
      value
    )


  if (
    number ===
      null
  ) {
    return ''
  }


  return number.toFixed(
    2
  )
}


async function fetchJson(
  url,
  label,
  headers =
    {}
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

          ...headers,
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


function torontoWallClockToIso(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
    )


  if (
    !match
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
      Number(
        match[4]
      ),
      Number(
        match[5]
      ),
      Number(
        match[6] ||
        0
      )
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


function isExcludedLocationName(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()


  return (
    !text ||
    text.includes(
      'remote course offering'
    ) ||
    text ===
      'off-site' ||
    text ===
      'off site' ||
    text ===
      'online'
  )
}


function bookingVenue(
  booking
) {
  const school =
    booking?.school


  const facility =
    school?.facility


  const name =
    cleanText(
      school?.name ||
      facility?.name
    )


  const latitude =
    numberOrNull(
      facility?.coordinates?.latitude
    )


  const longitude =
    numberOrNull(
      facility?.coordinates?.longitude
    )


  if (
    !school ||
    isExcludedLocationName(
      name
    ) ||
    latitude ===
      null ||
    longitude ===
      null
  ) {
    return null
  }


  const facilityId =
    cleanText(
      facility?.id
    )


  const schoolId =
    cleanText(
      school?.id ||
      booking?.school_id
    )


  const venueKey =
    facilityId ||
    schoolId ||
    (
      slugify(
        name
      ) +
      '-' +
      latitude.toFixed(
        6
      ) +
      '-' +
      longitude.toFixed(
        6
      )
    )


  return {
    venueKey,

    facilityId,

    schoolId,

    name,

    latitude,

    longitude,
  }
}


function coursePrice(
  document
) {
  const promoted =
    document?.promoted_fee


  const full =
    moneyOrEmpty(
      promoted?.full
    )


  const discounted =
    moneyOrEmpty(
      promoted?.discounted
    )


  if (
    full ||
    discounted
  ) {
    return {
      price:
        full,

      seniorPrice:
        discounted,

      seniorDiscountText:
        cleanText(
          promoted?.promotedDiscountText
        ),
    }
  }


  const mandatory =
    Array.isArray(
      document?.costs?.mandatory
    )
      ? document.costs.mandatory
      : []


  const registrationFee =
    mandatory.find(
      (item) =>
        /registration fee/i.test(
          cleanText(
            item?.name
          )
        )
    ) ||
    mandatory[0]


  return {
    price:
      moneyOrEmpty(
        registrationFee?.promoted_fee?.full
      ),

    seniorPrice:
      moneyOrEmpty(
        registrationFee?.promoted_fee?.discounted
      ),

    seniorDiscountText:
      cleanText(
        registrationFee?.promoted_fee?.promotedDiscountText
      ),
  }
}


function buildCourseOccurrences(
  document,
  now
) {
  if (
    !document ||
    document.public_available ===
      false
  ) {
    return []
  }


  const bookings =
    Array.isArray(
      document?.bookings
    )
      ? document.bookings
      : []


  const byVenue =
    new Map()


  bookings.forEach(
    (booking) => {
      if (
        String(
          booking?.visible_public ??
          '1'
        ) ===
          '0'
      ) {
        return
      }


      const venue =
        bookingVenue(
          booking
        )


      if (
        !venue
      ) {
        return
      }


      const startTime =
        torontoWallClockToIso(
          booking?.start
        )


      const endTime =
        torontoWallClockToIso(
          booking?.end
        ) ||
        startTime


      if (
        !startTime ||
        !endTime
      ) {
        return
      }


      const endDate =
        new Date(
          endTime
        )


      if (
        Number.isNaN(
          endDate.getTime()
        ) ||
        endDate.getTime() <
          now.getTime()
      ) {
        return
      }


      const existing =
        byVenue.get(
          venue.venueKey
        )


      if (
        existing &&
        new Date(
          existing.startTime
        ).getTime() <=
          new Date(
            startTime
          ).getTime()
      ) {
        return
      }


      const remainingPlaces =
        numberOrNull(
          document?.remaining_places
        )


      const pricing =
        coursePrice(
          document
        )


      byVenue.set(
        venue.venueKey,
        {
          venue,

          eventId:
            (
              cleanText(
                document?.id
              ) ||
              cleanText(
                document?.program_number
              ) ||
              slugify(
                document?.program_name
              )
            ) +
            '|' +
            startTime,

          courseId:
            cleanText(
              document?.id
            ),

          courseNumber:
            cleanText(
              document?.program_number
            ),

          title:
            cleanText(
              document?.program_name
            ),

          startTime,

          endTime,

          category:
            cleanText(
              document?.category_name
            ),

          ageMin:
            cleanText(
              document?.min_age
            ),

          ageMax:
            '',

          isFull:
            remainingPlaces ===
              0,

          remainingPlaces,

          sessionName:
            cleanText(
              document?.session_name
            ),

          price:
            pricing.price,

          seniorPrice:
            pricing.seniorPrice,

          seniorDiscountText:
            pricing.seniorDiscountText,

          url:
            REGISTRATION_URL,
        }
      )
    }
  )


  return [
    ...byVenue.values(),
  ]
}


function parseTdsbSchools(
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
      (row) => ({
        name:
          cleanText(
            row?.SCH_NAME
          ),

        address:
          cleanText(
            row?.ADDRESS_FULL ||
            row?.ADDRESS
          ),

        city:
          cleanText(
            row?.CITY
          ),

        postalCode:
          cleanText(
            row?.POSTAL_CODE
          ),

        latitude:
          numberOrNull(
            row?.LATITUDE
          ),

        longitude:
          numberOrNull(
            row?.LONGITUDE
          ),
      })
    )
    .filter(
      (school) =>
        school.name &&
        school.latitude !==
          null &&
        school.longitude !==
          null
    )
}


function distanceMetres(
  a,
  b
) {
  const toRadians =
    (value) =>
      value *
      Math.PI /
      180


  const earthRadius =
    6371000


  const lat1 =
    toRadians(
      a.latitude
    )


  const lat2 =
    toRadians(
      b.latitude
    )


  const dLat =
    toRadians(
      b.latitude -
      a.latitude
    )


  const dLon =
    toRadians(
      b.longitude -
      a.longitude
    )


  const sinLat =
    Math.sin(
      dLat /
      2
    )


  const sinLon =
    Math.sin(
      dLon /
      2
    )


  const h =
    sinLat *
      sinLat +
    Math.cos(
      lat1
    ) *
    Math.cos(
      lat2
    ) *
    sinLon *
    sinLon


  return (
    2 *
    earthRadius *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          h
        )
      )
    )
  )
}


function nearestSchool(
  venue,
  schools
) {
  let best =
    null


  for (
    const school of schools
  ) {
    const metres =
      distanceMetres(
        venue,
        school
      )


    if (
      !best ||
      metres <
        best.metres
    ) {
      best = {
        school,
        metres,
      }
    }
  }


  if (
    !best ||
    best.metres >
      SCHOOL_MATCH_MAX_METRES
  ) {
    return null
  }


  return best.school
}


export function buildLearn4LifeRecords({
  documents,
  schools =
    [],
  now =
    new Date(),
}) {
  const cleanDocuments =
    Array.isArray(
      documents
    )
      ? documents
      : []


  const cleanSchools =
    Array.isArray(
      schools
    )
      ? schools
      : []


  const programsByVenue =
    new Map()


  let excludedRemoteCount =
    0


  let physicalProgramCount =
    0


  cleanDocuments.forEach(
    (document) => {
      const locationNames =
        Array.isArray(
          document?.location_names
        )
          ? document.location_names
          : []


      const onlyExcluded =
        locationNames.length >
          0 &&
        locationNames.every(
          isExcludedLocationName
        )


      if (
        onlyExcluded
      ) {
        excludedRemoteCount +=
          1
      }


      const occurrences =
        buildCourseOccurrences(
          document,
          now
        )


      if (
        occurrences.length >
          0
      ) {
        physicalProgramCount +=
          1
      }


      occurrences.forEach(
        (program) => {
          const key =
            program.venue.venueKey


          const existing =
            programsByVenue.get(
              key
            ) ||
            {
              venue:
                program.venue,

              programs:
                [],
            }


          existing.programs.push(
            program
          )


          programsByVenue.set(
            key,
            existing
          )
        }
      )
    }
  )


  let upcomingProgramCount =
    0


  let schoolAddressMatchCount =
    0


  const records =
    [
      ...programsByVenue.values(),
    ]
      .map(
        ({
          venue,
          programs,
        }) => {
          const selectedPrograms =
            programs
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
                      cleanText(
                        candidate.title
                      )
                        .toLowerCase() ===
                      cleanText(
                        program.title
                      )
                        .toLowerCase()
                  ) ===
                    index
              )
              .slice(
                0,
                UPCOMING_LIMIT
              )


          if (
            selectedPrograms.length ===
              0
          ) {
            return null
          }


          upcomingProgramCount +=
            selectedPrograms.length


          const matchedSchool =
            nearestSchool(
              venue,
              cleanSchools
            )


          if (
            matchedSchool?.address
          ) {
            schoolAddressMatchCount +=
              1
          }


          const address =
            matchedSchool?.address ||
            ''


          return {
            externalId:
              `toronto-learn4life-${venue.venueKey}`,

            city:
              'toronto',

            type:
              'new',

            newType:
              'events',

            // Use the existing Community category until MapPins gets
            // a dedicated Learn4Life/school icon.
            category:
              'community-place',

            communityType:
              'learn4life',

            communitySource:
              COMMUNITY_SOURCE_KEY,

            eventPinIcon:
              'community',

            title:
              venue.name,

            description:
              'TDSB Learn4Life adult general-interest course venue.',

            location:
              address ||
              venue.name,

            address,

            latitude:
              venue.latitude,

            longitude:
              venue.longitude,

            status:
              'open',

            active:
              true,

            lifecycleOverride:
              'keep-live',

            source:
              SOURCE,

            sourceUrl:
              SOURCE_URL,

            sources: [
              {
                name:
                  SOURCE,

                url:
                  SOURCE_URL,
              },
            ],

            learn4LifeVenueId:
              venue.venueKey,

            tdsbFacilityId:
              venue.facilityId,

            tdsbSchoolId:
              venue.schoolId,

            registrationUrl:
              REGISTRATION_URL,

            upcomingPrograms:
              selectedPrograms.map(
                (program) => {
                  const {
                    venue:
                      _venue,

                    ...publicProgram
                  } =
                    program


                  return publicProgram
                }
              ),
          }
        }
      )
      .filter(
        Boolean
      )


  return {
    records,

    physicalProgramCount,

    upcomingProgramCount,

    schoolAddressMatchCount,

    excludedRemoteCount,
  }
}


async function fetchTypesensePrograms() {
  const documents =
    []


  let found =
    null


  for (
    let page =
      1;
    page <=
      TYPESENSE_MAX_PAGES;
    page +=
      1
  ) {
    const url =
      new URL(
        TYPESENSE_SEARCH_URL
      )


    url.searchParams.set(
      'q',
      '*'
    )


    url.searchParams.set(
      'query_by',
      'program_number, program_name, description'
    )


    url.searchParams.set(
      'filter_by',
      ''
    )


    url.searchParams.set(
      'sort_by',
      'start_date_ts:asc'
    )


    url.searchParams.set(
      'num_typos',
      '0'
    )


    url.searchParams.set(
      'page',
      String(
        page
      )
    )


    url.searchParams.set(
      'per_page',
      String(
        TYPESENSE_PAGE_SIZE
      )
    )


    const payload =
      await fetchJson(
        url.toString(),
        'TDSB Learn4Life catalogue',
        {
          'x-typesense-api-key':
            TYPESENSE_API_KEY,
        }
      )


    if (
      found ===
        null
    ) {
      found =
        numberOrNull(
          payload?.found
        )
    }


    const hits =
      Array.isArray(
        payload?.hits
      )
        ? payload.hits
        : []


    hits.forEach(
      (hit) => {
        if (
          hit?.document
        ) {
          documents.push(
            hit.document
          )
        }
      }
    )


    if (
      hits.length ===
        0 ||
      (
        found !==
          null &&
        documents.length >=
          found
      ) ||
      hits.length <
        TYPESENSE_PAGE_SIZE
    ) {
      break
    }
  }


  return {
    documents,

    found:
      found ??
      documents.length,
  }
}


async function loadOfficialData() {
  const [
    catalogue,
    schoolsPayload,
  ] =
    await Promise.all([
      fetchTypesensePrograms(),

      fetchJson(
        TDSB_SCHOOLS_URL,
        'Toronto TDSB school locations'
      ),
    ])


  if (
    catalogue.documents.length <
      MIN_EXPECTED_PROGRAMS
  ) {
    throw new Error(
      `Learn4Life sanity check failed: only ${catalogue.documents.length} programs were returned.`
    )
  }


  return {
    documents:
      catalogue.documents,

    found:
      catalogue.found,

    schools:
      parseTdsbSchools(
        schoolsPayload
      ),
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
    'learn4life-'
  )
}


async function writeLearn4LifeRecord({
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
        'server-new-events-learn4life-' +
        slugify(
          record.learn4LifeVenueId ||
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


async function archiveMissingLearn4LifeRecord(
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
        'learn4life-venue-not-in-current-feed',

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


export async function syncLearn4Life() {
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
          documents,
          found,
          schools,
        } =
          await loadOfficialData()


        const built =
          buildLearn4LifeRecords({
            documents,
            schools,
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


        const existingLearn4Life =
          existingRecords.filter(
            (record) =>
              record?.communitySource ===
                COMMUNITY_SOURCE_KEY ||
              cleanText(
                record?.externalId
              )
                .startsWith(
                  'toronto-learn4life-'
                )
          )


        const existingByExternalId =
          new Map(
            existingLearn4Life.map(
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


          await writeLearn4LifeRecord({
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
          existingLearn4Life
        ) {
          if (
            !incomingIds.has(
              cleanText(
                existing.externalId
              )
            )
          ) {
            const archived =
              await archiveMissingLearn4LifeRecord(
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

          programCount:
            found,

          physicalProgramCount:
            built.physicalProgramCount,

          venueCount:
            built.records.length,

          upcomingProgramCount:
            built.upcomingProgramCount,

          schoolAddressMatchCount:
            built.schoolAddressMatchCount,

          excludedRemoteCount:
            built.excludedRemoteCount,

          archivedCount,

          error:
            '',
        }


        console.log(
          'LEARN4LIFE · SYNCED',
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
          'LEARN4LIFE · SYNC FAILED:',
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


export function learn4LifeFeed() {
  return {
    name:
      'tdsb-learn4life',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          queueCommunitySync(
            'LEARN4LIFE',
            syncLearn4Life
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

              sourceUrl:
                SOURCE_URL,

              registrationUrl:
                REGISTRATION_URL,
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
              await syncLearn4Life()


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
