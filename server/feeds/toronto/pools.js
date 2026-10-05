import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


import {
  queueCommunitySync,
} from './communitySyncQueue.js'

const STATUS_PATH =
  '/api/geographic/toronto/new/community/pools/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/pools/sync'


const AQUATIC_CENTRES_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/2/query'
  )


const OUTDOOR_RECREATION_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/69/query'
  )


const PARKS_AND_CENTRES_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/77/query'
  )


const DROP_IN_SCHEDULE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/Drop-in.json'


const SOURCE =
  'City of Toronto Parks & Recreation'


const SOURCE_KEY =
  'toronto-aquatics'


const SWIM_MAP_URL =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/swim-water-activities/swimming-water-play/'


const FACILITY_BASE_URL =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id='


const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000


const UPCOMING_LIMIT =
  3


const ARCGIS_PAGE_SIZE =
  2000


const OUTDOOR_POOL_CATEGORY =
  1112


const SPLASH_PAD_CATEGORY =
  1120


const WADING_POOL_CATEGORY =
  1121


const WATER_PARK_CATEGORY =
  1122


const OUTDOOR_GROUP_METRES =
  80


const HOST_MATCH_METRES =
  160


const FACILITY_MATCH_METRES =
  350


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

  indoorPoolCount:
    0,

  outdoorPoolCount:
    0,

  splashPadCount:
    0,

  wadingPoolCount:
    0,

  waterParkCount:
    0,

  siteCount:
    0,

  standalonePinCount:
    0,

  enrichedCommunityCentreCount:
    0,

  matchedDropInCount:
    0,

  upcomingSwimProgramCount:
    0,

  archivedCount:
    0,

  clearedEnrichmentCount:
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
    'pool'
}


function normalizeName(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /&/g,
      ' and '
    )
    .replace(
      /\b(?:indoor|outdoor|aquatic|swimming|splash|spray|wading|water)\b/g,
      ' '
    )
    .replace(
      /\b(?:community|recreation)\b/g,
      ' '
    )
    .replace(
      /\b(?:centre|center|pool|pools|park|pad|area|tank|deck|facility|facilities)\b/g,
      ' '
    )
    .replace(
      /\bhealth club\b/g,
      ' '
    )
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


function geometryPoint(
  feature
) {
  const longitude =
    numberOrNull(
      feature?.geometry?.x
    )


  const latitude =
    numberOrNull(
      feature?.geometry?.y
    )


  if (
    latitude ===
      null ||
    longitude ===
      null
  ) {
    return null
  }


  return {
    latitude,
    longitude,
  }
}


function distanceMetres(
  a,
  b
) {
  if (
    !a ||
    !b
  ) {
    return Infinity
  }


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


  const payload =
    await response.json()


  if (
    payload?.error
  ) {
    throw new Error(
      `${label} returned ArcGIS error: ${cleanText(
        payload.error?.message
      )}`
    )
  }


  return payload
}


async function fetchArcGisFeatures({
  baseUrl,
  label,
  outFields,
  returnGeometry =
    true,
}) {
  const features =
    []


  for (
    let offset =
      0;
    ;
    offset +=
      ARCGIS_PAGE_SIZE
  ) {
    const url =
      new URL(
        baseUrl
      )


    url.searchParams.set(
      'where',
      '1=1'
    )


    url.searchParams.set(
      'outFields',
      outFields
    )


    url.searchParams.set(
      'returnGeometry',
      returnGeometry
        ? 'true'
        : 'false'
    )


    if (
      returnGeometry
    ) {
      url.searchParams.set(
        'outSR',
        '4326'
      )
    }


    url.searchParams.set(
      'resultOffset',
      String(
        offset
      )
    )


    url.searchParams.set(
      'resultRecordCount',
      String(
        ARCGIS_PAGE_SIZE
      )
    )


    url.searchParams.set(
      'f',
      'json'
    )


    const payload =
      await fetchJson(
        url.toString(),
        label
      )


    const page =
      Array.isArray(
        payload?.features
      )
        ? payload.features
        : []


    features.push(
      ...page
    )


    if (
      page.length ===
        0 ||
      (
        payload?.exceededTransferLimit !==
          true &&
        page.length <
          ARCGIS_PAGE_SIZE
      )
    ) {
      break
    }
  }


  return features
}


function aquaticTypeConfig(
  type
) {
  const configs = {
    'indoor-pool': {
      label:
        'Indoor Pool',

      icon:
        'pool',

      seasonal:
        false,

      seasonLabel:
        'YEAR-ROUND · CHECK CURRENT SCHEDULE',
    },

    'outdoor-pool': {
      label:
        'Outdoor Pool',

      icon:
        'pool',

      seasonal:
        true,

      seasonLabel:
        'TYPICALLY MID-JUNE–MID-SEPTEMBER',
    },

    'splash-pad': {
      label:
        'Splash Pad',

      icon:
        'splash-pad',

      seasonal:
        true,

      seasonLabel:
        'TYPICALLY MID-MAY–MID-SEPTEMBER',
    },

    'wading-pool': {
      label:
        'Wading Pool',

      icon:
        'wading-pool',

      seasonal:
        true,

      seasonLabel:
        'TYPICALLY LATE JUNE–EARLY SEPTEMBER',
    },

    'water-park': {
      label:
        'Water Park',

      icon:
        'water-park',

      seasonal:
        true,

      seasonLabel:
        'TYPICALLY LATE JUNE–EARLY SEPTEMBER',
    },
  }


  return configs[
    type
  ] ||
    configs[
      'indoor-pool'
    ]
}


function torontoMonthDay(
  now
) {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        month:
          'numeric',

        day:
          'numeric',
      }
    )
      .formatToParts(
        now
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


  return {
    month:
      values.month,

    day:
      values.day,
  }
}


function dateCode({
  month,
  day,
}) {
  return (
    month *
    100 +
    day
  )
}


function seasonalWindow(
  type
) {
  const windows = {
    'outdoor-pool': {
      start:
        615,

      end:
        915,
    },

    'splash-pad': {
      start:
        516,

      end:
        913,
    },

    'wading-pool': {
      start:
        626,

      end:
        906,
    },

    'water-park': {
      start:
        620,

      end:
        910,
    },
  }


  return windows[
    type
  ] ||
    null
}


function aquaticPresentation(
  type,
  now
) {
  const config =
    aquaticTypeConfig(
      type
    )


  if (
    !config.seasonal
  ) {
    return {
      typeLabel:
        config.label,

      currentStatus:
        'YEAR-ROUND FACILITY',

      seasonLabel:
        config.seasonLabel,

      icon:
        config.icon,
    }
  }


  const window =
    seasonalWindow(
      type
    )


  const currentCode =
    dateCode(
      torontoMonthDay(
        now
      )
    )


  const inTypicalSeason =
    Boolean(
      window
    ) &&
    currentCode >=
      window.start &&
    currentCode <=
      window.end


  return {
    typeLabel:
      config.label,

    currentStatus:
      inTypicalSeason
        ? 'SEASONAL · CHECK CITY SCHEDULE'
        : 'CLOSED FOR SEASON',

    seasonLabel:
      config.seasonLabel,

    icon:
      config.icon,
  }
}


function indoorSites(
  features
) {
  return (
    Array.isArray(
      features
    )
      ? features
      : []
  )
    .map(
      (feature) => {
        const attributes =
          feature?.attributes ||
          {}


        const point =
          geometryPoint(
            feature
          )


        if (
          !point
        ) {
          return null
        }


        const title =
          cleanText(
            attributes?.PUBLIC_NAME ||
            attributes?.ASSET_NAME ||
            attributes?.ROLLUP_TO
          ) ||
          'Indoor Pool'


        return {
          key:
            (
              'indoor-' +
              cleanText(
                attributes?.GIS_ID ||
                attributes?.ASSET_ID ||
                attributes?.OBJECTID
              )
            ),

          type:
            'indoor-pool',

          title,

          nameKey:
            normalizeName(
              title
            ),

          latitude:
            point.latitude,

          longitude:
            point.longitude,

          address:
            cleanText(
              attributes?.ADDRESS
            ),

          assetIds: [
            cleanText(
              attributes?.GIS_ID ||
              attributes?.ASSET_ID ||
              attributes?.OBJECTID
            ),
          ]
            .filter(
              Boolean
            ),
        }
      }
    )
    .filter(
      Boolean
    )
}


function outdoorType(
  category
) {
  if (
    category ===
      OUTDOOR_POOL_CATEGORY
  ) {
    return 'outdoor-pool'
  }


  if (
    category ===
      SPLASH_PAD_CATEGORY
  ) {
    return 'splash-pad'
  }


  if (
    category ===
      WADING_POOL_CATEGORY
  ) {
    return 'wading-pool'
  }


  if (
    category ===
      WATER_PARK_CATEGORY
  ) {
    return 'water-park'
  }


  return ''
}


function outdoorSiteName(
  attributes,
  type
) {
  const config =
    aquaticTypeConfig(
      type
    )


  const candidates =
    [
      attributes?.ROLLUP_TO,
      attributes?.PUBLIC_NAME,
      attributes?.ASSET_NAME,
    ]
      .map(
        cleanText
      )
      .filter(
        Boolean
      )


  const specific =
    candidates.find(
      (value) =>
        !new RegExp(
          (
            '^' +
            config.label
              .replace(
                /[-/\\^$*+?.()|[\]{}]/g,
                '\\$&'
              ) +
            '$'
          ),
          'i'
        )
          .test(
            value
          )
    )


  return (
    specific ||
    candidates[0] ||
    config.label
  )
}


function buildOutdoorSites(
  features
) {
  const candidates =
    (
      Array.isArray(
        features
      )
        ? features
        : []
    )
      .map(
        (feature) => {
          const attributes =
            feature?.attributes ||
            {}


          const category =
            numberOrNull(
              attributes?.ASSETCATEGORY
            )


          const type =
            outdoorType(
              category
            )


          const point =
            geometryPoint(
              feature
            )


          if (
            !type ||
            !point
          ) {
            return null
          }


          const title =
            outdoorSiteName(
              attributes,
              type
            )


          return {
            key:
              cleanText(
                attributes?.GIS_ID ||
                attributes?.ASSET_ID ||
                attributes?.OBJECTID
              ),

            type,

            title,

            nameKey:
              normalizeName(
                title
              ),

            latitude:
              point.latitude,

            longitude:
              point.longitude,

            assetId:
              cleanText(
                attributes?.GIS_ID ||
                attributes?.ASSET_ID ||
                attributes?.OBJECTID
              ),
          }
        }
      )
      .filter(
        Boolean
      )


  const groups =
    []


  candidates.forEach(
    (candidate) => {
      const existing =
        groups.find(
          (group) =>
            group.type ===
              candidate.type &&
            Boolean(
              group.nameKey &&
              candidate.nameKey
            ) &&
            (
              group.nameKey ===
                candidate.nameKey ||
              group.nameKey.includes(
                candidate.nameKey
              ) ||
              candidate.nameKey.includes(
                group.nameKey
              )
            ) &&
            distanceMetres(
              group,
              candidate
            ) <=
              OUTDOOR_GROUP_METRES
        )


      if (
        !existing
      ) {
        groups.push({
          ...candidate,

          assetIds: [
            candidate.assetId,
          ]
            .filter(
              Boolean
            ),

          itemCount:
            1,
        })

        return
      }


      const nextCount =
        existing.itemCount +
        1


      existing.latitude =
        (
          (
            existing.latitude *
            existing.itemCount
          ) +
          candidate.latitude
        ) /
        nextCount


      existing.longitude =
        (
          (
            existing.longitude *
            existing.itemCount
          ) +
          candidate.longitude
        ) /
        nextCount


      existing.itemCount =
        nextCount


      if (
        candidate.assetId
      ) {
        existing.assetIds.push(
          candidate.assetId
        )
      }
    }
  )


  return groups
}


function parseFacilities(
  features
) {
  return (
    Array.isArray(
      features
    )
      ? features
      : []
  )
    .map(
      (feature) =>
        feature?.attributes ||
        {}
    )
    .map(
      (row) => {
        const latitude =
          numberOrNull(
            row?.LATITUDE
          )


        const longitude =
          numberOrNull(
            row?.LONGITUDE
          )


        if (
          latitude ===
            null ||
          longitude ===
            null
        ) {
          return null
        }


        return {
          locationId:
            cleanText(
              row?.LOCATIONID
            ),

          name:
            cleanText(
              row?.ASSET_NAME
            ),

          nameKey:
            normalizeName(
              row?.ASSET_NAME
            ),

          type:
            cleanText(
              row?.TYPE
            ),

          amenities:
            cleanText(
              row?.AMENITIES
            ),

          address:
            cleanText(
              row?.ADDRESS
            ),

          phone:
            cleanText(
              row?.PHONE
            ),

          url:
            cleanText(
              row?.URL
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


function facilityTypeMatches(
  site,
  facility
) {
  const text =
    (
      cleanText(
        facility?.type
      ) +
      ' ' +
      cleanText(
        facility?.amenities
      )
    )
      .toLowerCase()


  if (
    site.type ===
      'indoor-pool'
  ) {
    return /\bindoor\b.*\bpool\b|\bpool\b.*\bindoor\b|\baquatic\b/.test(
      text
    )
  }


  if (
    site.type ===
      'outdoor-pool'
  ) {
    return /\boutdoor\b.*\bpool\b|\bpool\b.*\boutdoor\b/.test(
      text
    )
  }


  if (
    site.type ===
      'splash-pad'
  ) {
    return /\bsplash\b|\bspray\b/.test(
      text
    )
  }


  if (
    site.type ===
      'wading-pool'
  ) {
    return /\bwading\b/.test(
      text
    )
  }


  if (
    site.type ===
      'water-park'
  ) {
    return /\bwater\b.*\bpark\b/.test(
      text
    )
  }


  return false
}


function namesMatch(
  a,
  b
) {
  const left =
    normalizeName(
      a
    )


  const right =
    normalizeName(
      b
    )


  return Boolean(
    left &&
    right &&
    (
      left ===
        right ||
      left.includes(
        right
      ) ||
      right.includes(
        left
      )
    )
  )
}


function matchFacility(
  site,
  facilities
) {
  let best =
    null


  facilities.forEach(
    (facility) => {
      const metres =
        distanceMetres(
          site,
          facility
        )


      if (
        metres >
          FACILITY_MATCH_METRES
      ) {
        return
      }


      let score =
        0


      if (
        namesMatch(
          site.title,
          facility.name
        )
      ) {
        score +=
          100
      }


      if (
        facilityTypeMatches(
          site,
          facility
        )
      ) {
        score +=
          50
      }


      if (
        metres <=
          60
      ) {
        score +=
          40
      }
      else if (
        metres <=
          160
      ) {
        score +=
          25
      }
      else {
        score +=
          10
      }


      if (
        !best ||
        score >
          best.score ||
        (
          score ===
            best.score &&
          metres <
            best.metres
        )
      ) {
        best = {
          facility,
          score,
          metres,
        }
      }
    }
  )


  if (
    !best ||
    best.score <
      80
  ) {
    return null
  }


  return best.facility
}


function facilityUrl(
  facility
) {
  const explicit =
    cleanText(
      facility?.url
    )


  if (
    /^https?:\/\//i.test(
      explicit
    )
  ) {
    return explicit
  }


  const locationId =
    cleanText(
      facility?.locationId
    )


  return locationId
    ? (
        FACILITY_BASE_URL +
        encodeURIComponent(
          locationId
        )
      )
    : SWIM_MAP_URL
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


  return (
    Date.UTC(
      values.year,
      values.month -
        1,
      values.day,
      values.hour,
      values.minute,
      values.second
    ) -
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


function buildAquaticProgram(
  row,
  now
) {
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


  const category =
    cleanText(
      firstValue(
        row,
        [
          'Category',
          'CATEGORY',
          'Program Area',
          'ProgramArea',
        ]
      )
    )


  if (
    !/\b(?:swim|swimming|aquatic|water play|lifeguard club)\b/i.test(
      `${title} ${category}`
    )
  ) {
    return null
  }


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


  const locationName =
    cleanText(
      firstValue(
        row,
        [
          'Location Name',
          'LocationName',
          'Facility Name',
          'FacilityName',
          'Location',
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


  let endTime =
    torontoLocalToIso({
      dateText,

      hour:
        endHour ===
          null
          ? startHour
          : endHour,

      minute:
        endMinute,
    }) ||
    startTime


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

    category,

    ageMin:
      cleanText(
        firstValue(
          row,
          [
            'Age Min',
            'AgeMin',
          ]
        )
      ),

    ageMax:
      cleanText(
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

    locationName,
  }
}


function programsByLocation(
  dropIns,
  now
) {
  const byId =
    new Map()


  const byName =
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
          buildAquaticProgram(
            row,
            now
          )


        if (
          !program
        ) {
          return
        }


        matchedDropInCount +=
          1


        if (
          program.locationId
        ) {
          const programs =
            byId.get(
              program.locationId
            ) ||
            []


          programs.push(
            program
          )


          byId.set(
            program.locationId,
            programs
          )
        }


        const nameKey =
          normalizeName(
            program.locationName
          )


        if (
          nameKey
        ) {
          const programs =
            byName.get(
              nameKey
            ) ||
            []


          programs.push(
            program
          )


          byName.set(
            nameKey,
            programs
          )
        }
      }
    )


  return {
    byId,
    byName,
    matchedDropInCount,
  }
}


function selectPrograms(
  site,
  programIndex
) {
  const byId =
    site.facility?.locationId
      ? (
          programIndex.byId.get(
            site.facility.locationId
          ) ||
          []
        )
      : []


  const byName =
    programIndex.byName.get(
      normalizeName(
        site.facility?.name ||
        site.title
      )
    ) ||
    []


  return [
    ...byId,
    ...byName,
  ]
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
    .map(
      (program) => ({
        ...program,

        url:
          facilityUrl(
            site.facility
          ),
      })
    )
}


function siteTitle(
  site
) {
  const label =
    aquaticTypeConfig(
      site.type
    )
      .label


  const title =
    cleanText(
      site.facility?.name ||
      site.title
    )


  if (
    title
      .toLowerCase()
      .includes(
        label
          .toLowerCase()
      )
  ) {
    return title
  }


  return (
    title +
    ' · ' +
    label
  )
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


function hostKey(
  record
) {
  return (
    cleanText(
      record?.id
    ) ||
    recordIdentity(
      record
    )
  )
}


function findCommunityCentreHost(
  site,
  existingRecords
) {
  if (
    site.type !==
      'indoor-pool'
  ) {
    return null
  }


  const facilityId =
    cleanText(
      site.facility?.locationId
    )


  if (
    facilityId
  ) {
    const direct =
      existingRecords.find(
        (record) =>
          record?.category ===
            'community-centre' &&
          cleanText(
            record?.recreationLocationId
          ) ===
            facilityId
      )


    if (
      direct
    ) {
      return direct
    }
  }


  let best =
    null


  existingRecords
    .filter(
      (record) =>
        record?.category ===
          'community-centre'
    )
    .forEach(
      (record) => {
        const latitude =
          numberOrNull(
            record?.latitude
          )


        const longitude =
          numberOrNull(
            record?.longitude
          )


        if (
          latitude ===
            null ||
          longitude ===
            null
        ) {
          return
        }


        const metres =
          distanceMetres(
            site,
            {
              latitude,
              longitude,
            }
          )


        if (
          metres >
            HOST_MATCH_METRES
        ) {
          return
        }


        const matches =
          namesMatch(
            site.facility?.name ||
            site.title,
            record?.title
          ) ||
          namesMatch(
            site.title,
            record?.title
          )


        if (
          !matches
        ) {
          return
        }


        if (
          !best ||
          metres <
            best.metres
        ) {
          best = {
            record,
            metres,
          }
        }
      }
    )


  return best?.record ||
    null
}


function aquaticPayload({
  site,
  presentation,
}) {
  return {
    id:
      slugify(
        [
          site.type,
          site.facility?.locationId ||
            '',
          site.key,
        ]
          .join(
            '-'
          )
      ),

    type:
      site.type,

    typeLabel:
      presentation.typeLabel,

    currentStatus:
      presentation.currentStatus,

    seasonLabel:
      presentation.seasonLabel,

    latitude:
      site.latitude,

    longitude:
      site.longitude,

    assetIds:
      [
        ...new Set(
          (
            site.assetIds ||
            []
          )
            .filter(
              Boolean
            )
        ),
      ],
  }
}


function existingStandaloneWasManuallyHidden(
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
    'aquatics-'
  )
}


async function writeStandalone({
  site,
  programs,
  presentation,
  existing =
    null,
}) {
  const now =
    new Date()
      .toISOString()


  const payload =
    aquaticPayload({
      site,
      presentation,
    })


  const externalId =
    `toronto-aquatics-${payload.id}`


  const active =
    existingStandaloneWasManuallyHidden(
      existing
    )
      ? false
      : true


  const record = {
    ...existing,

    externalId,

    city:
      'toronto',

    type:
      'new',

    newType:
      'events',

    category:
      'pool',

    communityType:
      site.type,

    communitySource:
      SOURCE_KEY,

    aquaticsSource:
      SOURCE_KEY,

    eventPinIcon:
      presentation.icon,

    title:
      siteTitle(
        site
      ),

    description:
      'City of Toronto swimming and water-play facility.',

    location:
      site.facility?.address ||
      site.address ||
      site.title,

    address:
      site.facility?.address ||
      site.address ||
      '',

    telephone:
      site.facility?.phone ||
      '',

    latitude:
      site.latitude,

    longitude:
      site.longitude,

    status:
      'open',

    active,

    lifecycleOverride:
      'keep-live',

    source:
      SOURCE,

    sourceUrl:
      facilityUrl(
        site.facility
      ),

    sources: [
      {
        name:
          SOURCE,

        url:
          facilityUrl(
            site.facility
          ),
      },
    ],

    recreationLocationId:
      site.facility?.locationId ||
      '',

    aquaticFacilities: [
      payload,
    ],

    poolPrograms:
      programs,

    id:
      existing?.id ||
      (
        'server-new-events-aquatics-' +
        payload.id
      ),

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

    identity:
      `external:${externalId}`,

    previousIdentity:
      existing
        ? recordIdentity(
            existing
          )
        : '',

    record,
  })
}


async function writeHostEnrichment({
  existing,
  sites,
  programs,
  now,
}) {
  const identity =
    recordIdentity(
      existing
    )


  if (
    !identity
  ) {
    return null
  }


  const aquaticFacilities =
    sites.map(
      (site) =>
        aquaticPayload({
          site,

          presentation:
            aquaticPresentation(
              site.type,
              now
            ),
        })
    )


  const timestamp =
    new Date()
      .toISOString()


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

      aquaticsSource:
        SOURCE_KEY,

      aquaticFacilities,

      poolPrograms:
        programs,

      serverUpdatedAt:
        timestamp,

      updatedAt:
        timestamp,
    },
  })
}


async function archiveStandalone(
  existing
) {
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


  const now =
    new Date()
      .toISOString()


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
        'aquatics-facility-not-in-current-feed',

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


async function clearHostEnrichment(
  existing
) {
  const identity =
    recordIdentity(
      existing
    )


  if (
    !identity
  ) {
    return null
  }


  const now =
    new Date()
      .toISOString()


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

      aquaticsSource:
        '',

      aquaticFacilities:
        [],

      poolPrograms:
        [],

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


async function loadOfficialData() {
  const [
    aquaticFeatures,
    outdoorFeatures,
    facilityFeatures,
    dropInsPayload,
  ] =
    await Promise.all([
      fetchArcGisFeatures({
        baseUrl:
          AQUATIC_CENTRES_URL,

        label:
          'Toronto aquatic centres',

        outFields:
          (
            'OBJECTID,ASSET_TYPE,ASSET_NAME,PUBLIC_NAME,ROLLUP_TO,' +
            'AQUATIC_CENTRE_IND,OUTDOOR_POOL_BUILDING_IND,ADDRESS,' +
            'GIS_ID,ASSET_ID,PUBLIC_USE'
          ),
      }),

      fetchArcGisFeatures({
        baseUrl:
          OUTDOOR_RECREATION_URL,

        label:
          'Toronto outdoor aquatic recreation assets',

        outFields:
          (
            'OBJECTID,ASSET_TYPE,ASSET_NAME,PUBLIC_NAME,ROLLUP_TO,' +
            'ASSETCATEGORY,ASSETCATEGORY_DESC,GIS_ID,ASSET_ID'
          ),
      }),

      fetchArcGisFeatures({
        baseUrl:
          PARKS_AND_CENTRES_URL,

        label:
          'Toronto parks and recreation facilities',

        outFields:
          (
            'LOCATIONID,ASSET_NAME,TYPE,AMENITIES,ADDRESS,PHONE,URL,' +
            'LATITUDE,LONGITUDE'
          ),

        returnGeometry:
          false,
      }),

      fetchJson(
        DROP_IN_SCHEDULE_URL,
        'Toronto recreation drop-in programs'
      ),
    ])


  const indoor =
    indoorSites(
      aquaticFeatures
    )


  const outdoor =
    buildOutdoorSites(
      outdoorFeatures
    )


  const facilities =
    parseFacilities(
      facilityFeatures
    )


  const sites = [
    ...indoor,
    ...outdoor,
  ]


  sites.forEach(
    (site) => {
      site.facility =
        matchFacility(
          site,
          facilities
        )
    }
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
    indoor.length ===
      0
  ) {
    throw new Error(
      'Aquatics sanity check failed: no indoor aquatic centres were parsed.'
    )
  }


  if (
    outdoor.length ===
      0
  ) {
    throw new Error(
      'Aquatics sanity check failed: no outdoor water facilities were parsed.'
    )
  }


  return {
    sites,
    dropIns,
  }
}


function countType(
  sites,
  type
) {
  return sites.filter(
    (site) =>
      site.type ===
        type
  )
    .length
}


export async function syncPools() {
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
          sites,
          dropIns,
        } =
          await loadOfficialData()


        const now =
          new Date()


        const programIndex =
          programsByLocation(
            dropIns,
            now
          )


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


        const sourceRecords =
          existingRecords.filter(
            (record) =>
              record?.communitySource ===
                SOURCE_KEY ||
              cleanText(
                record?.externalId
              )
                .startsWith(
                  'toronto-aquatics-'
                )
          )


        const sourceByExternalId =
          new Map(
            sourceRecords.map(
              (record) => [
                cleanText(
                  record.externalId
                ),

                record,
              ]
            )
          )


        const incomingStandaloneIds =
          new Set()


        const hostGroups =
          new Map()


        let standalonePinCount =
          0


        let upcomingSwimProgramCount =
          0


        for (
          const site of sites
        ) {
          const presentation =
            aquaticPresentation(
              site.type,
              now
            )


          const programs =
            selectPrograms(
              site,
              programIndex
            )


          upcomingSwimProgramCount +=
            programs.length


          const host =
            findCommunityCentreHost(
              site,
              existingRecords
            )


          if (
            host
          ) {
            const key =
              hostKey(
                host
              )


            const group =
              hostGroups.get(
                key
              ) ||
              {
                host,

                sites:
                  [],

                programs:
                  [],
              }


            group.sites.push(
              site
            )


            group.programs.push(
              ...programs
            )


            hostGroups.set(
              key,
              group
            )


            continue
          }


          const payload =
            aquaticPayload({
              site,
              presentation,
            })


          const externalId =
            `toronto-aquatics-${payload.id}`


          incomingStandaloneIds.add(
            externalId
          )


          await writeStandalone({
            site,

            programs,

            presentation,

            existing:
              sourceByExternalId.get(
                externalId
              ) ||
              null,
          })


          standalonePinCount +=
            1
        }


        for (
          const group of
          hostGroups.values()
        ) {
          const programs =
            group.programs
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


          await writeHostEnrichment({
            existing:
              group.host,

            sites:
              group.sites,

            programs,

            now,
          })
        }


        let archivedCount =
          0


        for (
          const existing of
          sourceRecords
        ) {
          if (
            !incomingStandaloneIds.has(
              cleanText(
                existing.externalId
              )
            )
          ) {
            const archived =
              await archiveStandalone(
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


        const touchedHosts =
          new Set(
            [
              ...hostGroups.values(),
            ]
              .map(
                (group) =>
                  hostKey(
                    group.host
                  )
              )
          )


        let clearedEnrichmentCount =
          0


        for (
          const existing of
          existingRecords
        ) {
          if (
            cleanText(
              existing?.aquaticsSource
            ) !==
              SOURCE_KEY ||
            existing?.communitySource ===
              SOURCE_KEY
          ) {
            continue
          }


          if (
            touchedHosts.has(
              hostKey(
                existing
              )
            )
          ) {
            continue
          }


          const cleared =
            await clearHostEnrichment(
              existing
            )


          if (
            cleared
          ) {
            clearedEnrichmentCount +=
              1
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

          indoorPoolCount:
            countType(
              sites,
              'indoor-pool'
            ),

          outdoorPoolCount:
            countType(
              sites,
              'outdoor-pool'
            ),

          splashPadCount:
            countType(
              sites,
              'splash-pad'
            ),

          wadingPoolCount:
            countType(
              sites,
              'wading-pool'
            ),

          waterParkCount:
            countType(
              sites,
              'water-park'
            ),

          siteCount:
            sites.length,

          standalonePinCount,

          enrichedCommunityCentreCount:
            hostGroups.size,

          matchedDropInCount:
            programIndex.matchedDropInCount,

          upcomingSwimProgramCount,

          archivedCount,

          clearedEnrichmentCount,

          error:
            '',
        }


        console.log(
          'POOLS · SYNCED',
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
          'POOLS · SYNC FAILED:',
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


export function poolsFeed() {
  return {
    name:
      'toronto-pools',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          queueCommunitySync(
            'POOLS',
            syncPools
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

              swimMap:
                SWIM_MAP_URL,
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
              await syncPools()


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
