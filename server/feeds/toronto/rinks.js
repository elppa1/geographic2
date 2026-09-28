import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


const STATUS_PATH =
  '/api/geographic/toronto/new/community/rinks/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/rinks/sync'


const OUTDOOR_RECREATION_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/69/query' +
    '?where=1%3D1' +
    '&outFields=' +
      'OBJECTID%2CASSET_TYPE%2CASSET_NAME%2CPUBLIC_NAME%2CROLLUP_TO%2C' +
      'ASSETCATEGORY%2CASSETCATEGORY_DESC%2CGIS_ID%2CASSET_ID' +
    '&returnGeometry=true' +
    '&outSR=4326' +
    '&f=json'
  )


const INDOOR_ARENAS_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/3/query' +
    '?where=1%3D1' +
    '&outFields=' +
      'OBJECTID%2CASSET_TYPE%2CASSET_NAME%2CPUBLIC_NAME%2CROLLUP_TO%2C' +
      'ADDRESS%2CARENA_HOCKEY_IND%2CARTIFICIAL_ICE_RINK_BLD_IND%2C' +
      'PUBLIC_USE%2CGIS_ID%2CASSET_ID' +
    '&returnGeometry=true' +
    '&outSR=4326' +
    '&f=json'
  )


const PARKS_AND_CENTRES_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/77/query' +
    '?where=1%3D1' +
    '&outFields=' +
      'LOCATIONID%2CASSET_NAME%2CTYPE%2CADDRESS%2CPHONE%2CURL%2C' +
      'LATITUDE%2CLONGITUDE' +
    '&returnGeometry=false' +
    '&f=json'
  )


const DROP_IN_SCHEDULE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/1a5be46a-4039-48cd-a2d2-8e702abf9516/resource/067b41e7-ac8a-4d3f-ad08-089f8cd70316/download/Drop-in.json'


const SOURCE =
  'City of Toronto Parks & Recreation'


const SOURCE_KEY =
  'toronto-rinks'


const SKATING_PAGE =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/ice-snow-activities/public-leisure-skating/'


const FACILITY_BASE_URL =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id='


const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000


const UPCOMING_LIMIT =
  3


const OUTDOOR_ICE_CATEGORIES =
  new Set([
    1110, // Outdoor Artificial Ice Rink
    1123, // Outdoor Ice Pad
  ])


const SKATEBOARD_CATEGORY =
  1118


const DRY_PAD_CATEGORY =
  1113


// Current City of Toronto skateboarding listings identify these as
// seasonal skateparks associated with rink / ice-pad locations.
// This supplements GIS because temporary wooden skate elements are not
// always represented as permanent Skateboard Pad assets.
const SEASONAL_SKATEPARK_NAMES =
  new Set([
    'dufferin grove',
    'alexandra',
    'dunbat',
    'phil white',
  ])


const MAX_ALT_USE_DISTANCE_METRES =
  90


const MAX_FACILITY_MATCH_DISTANCE_METRES =
  250


const MAX_HOST_MATCH_DISTANCE_METRES =
  120


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

  outdoorRinkCount:
    0,

  indoorArenaCount:
    0,

  facilityCount:
    0,

  standalonePinCount:
    0,

  enrichedCommunityCentreCount:
    0,

  skateboardUseCount:
    0,

  dryPadUseCount:
    0,

  skatingProgramCount:
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
    'rink'
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
      /\b(?:community|recreation|artificial|outdoor|indoor)\b/g,
      ' '
    )
    .replace(
      /\b(?:centre|center|arena|rink|ice|pad|park)\b/g,
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


function isVerifiedSeasonalSkatepark(
  site
) {
  const names =
    [
      site?.title,
      site?.parentFacility?.name,
    ]
      .map(
        normalizeName
      )
      .filter(
        Boolean
      )


  return names.some(
    (name) =>
      [
        ...SEASONAL_SKATEPARK_NAMES,
      ]
        .some(
          (seasonalName) =>
            name ===
              seasonalName ||
            name.includes(
              seasonalName
            ) ||
            seasonalName.includes(
              name
            )
        )
  )
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
    : SKATING_PAGE
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


function parseOutdoorAssets(
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
      (feature) => {
        const attributes =
          feature?.attributes ||
          {}


        const point =
          geometryPoint(
            feature
          )


        const category =
          numberOrNull(
            attributes?.ASSETCATEGORY
          )


        if (
          !point ||
          category ===
            null
        ) {
          return null
        }


        return {
          objectId:
            cleanText(
              attributes?.OBJECTID
            ),

          assetId:
            cleanText(
              attributes?.ASSET_ID
            ),

          gisId:
            cleanText(
              attributes?.GIS_ID
            ),

          category,

          categoryDescription:
            cleanText(
              attributes?.ASSETCATEGORY_DESC
            ),

          assetType:
            cleanText(
              attributes?.ASSET_TYPE
            ),

          assetName:
            cleanText(
              attributes?.ASSET_NAME
            ),

          publicName:
            cleanText(
              attributes?.PUBLIC_NAME
            ),

          rollupTo:
            cleanText(
              attributes?.ROLLUP_TO
            ),

          ...point,
        }
      }
    )
    .filter(
      Boolean
    )
}


function parseIndoorArenas(
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


        return {
          objectId:
            cleanText(
              attributes?.OBJECTID
            ),

          assetId:
            cleanText(
              attributes?.ASSET_ID
            ),

          gisId:
            cleanText(
              attributes?.GIS_ID
            ),

          assetName:
            cleanText(
              attributes?.ASSET_NAME
            ),

          publicName:
            cleanText(
              attributes?.PUBLIC_NAME
            ),

          rollupTo:
            cleanText(
              attributes?.ROLLUP_TO
            ),

          address:
            cleanText(
              attributes?.ADDRESS
            ),

          publicUse:
            cleanText(
              attributes?.PUBLIC_USE
            ),

          ...point,
        }
      }
    )
    .filter(
      (arena) =>
        Boolean(
          arena
        ) &&
        Boolean(
          arena.publicName ||
          arena.assetName ||
          arena.rollupTo
        )
    )
}


function parseFacilities(
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

          type:
            cleanText(
              row?.TYPE
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
      (facility) =>
        Boolean(
          facility?.locationId &&
          facility?.name
        )
    )
}


function outdoorSiteKey(
  asset
) {
  return (
    normalizeName(
      asset?.rollupTo ||
      asset?.publicName ||
      asset?.assetName
    ) ||
    (
      cleanText(
        asset?.gisId ||
        asset?.assetId ||
        asset?.objectId
      )
    )
  )
}


function buildOutdoorSites(
  assets
) {
  const rinks =
    assets.filter(
      (asset) =>
        OUTDOOR_ICE_CATEGORIES.has(
          asset.category
        )
    )


  const alternateAssets =
    assets.filter(
      (asset) =>
        asset.category ===
          SKATEBOARD_CATEGORY ||
        asset.category ===
          DRY_PAD_CATEGORY
    )


  const groups =
    new Map()


  rinks.forEach(
    (rink) => {
      const key =
        outdoorSiteKey(
          rink
        )


      const existing =
        groups.get(
          key
        ) ||
        {
          key,

          rinkAssets:
            [],
        }


      existing.rinkAssets.push(
        rink
      )


      groups.set(
        key,
        existing
      )
    }
  )


  return [
    ...groups.values(),
  ]
    .map(
      (group) => {
        const first =
          group.rinkAssets[0]


        const latitude =
          group.rinkAssets.reduce(
            (
              total,
              asset
            ) =>
              total +
              asset.latitude,
            0
          ) /
          group.rinkAssets.length


        const longitude =
          group.rinkAssets.reduce(
            (
              total,
              asset
            ) =>
              total +
              asset.longitude,
            0
          ) /
          group.rinkAssets.length


        const title =
          cleanText(
            first?.rollupTo ||
            first?.publicName ||
            first?.assetName
          ) ||
          'Outdoor Rink'


        const titleName =
          normalizeName(
            title
          )


        const nearbyAlternates =
          alternateAssets
            .map(
              (alternate) => {
                const metres =
                  Math.min(
                    ...group.rinkAssets.map(
                      (rink) =>
                        distanceMetres(
                          rink,
                          alternate
                        )
                    )
                  )


                const sameRollup =
                  Boolean(
                    normalizeName(
                      alternate.rollupTo
                    )
                  ) &&
                  normalizeName(
                    alternate.rollupTo
                  ) ===
                    normalizeName(
                      first?.rollupTo
                    )


                const samePublicPlace =
                  Boolean(
                    titleName
                  ) &&
                  [
                    alternate.rollupTo,
                    alternate.publicName,
                    alternate.assetName,
                  ]
                    .map(
                      normalizeName
                    )
                    .includes(
                      titleName
                    )


                return {
                  alternate,
                  metres,
                  sameRollup,
                  samePublicPlace,
                }
              }
            )
            .filter(
              (match) =>
                match.metres <=
                  MAX_ALT_USE_DISTANCE_METRES &&
                (
                  match.sameRollup ||
                  match.samePublicPlace
                )
            )


        const hasSkateboard =
          nearbyAlternates.some(
            (match) =>
              match.alternate.category ===
                SKATEBOARD_CATEGORY
          )


        const hasDryPad =
          nearbyAlternates.some(
            (match) =>
              match.alternate.category ===
                DRY_PAD_CATEGORY
          )


        return {
          key:
            `outdoor-${group.key}`,

          title,

          latitude,

          longitude,

          address:
            '',

          hasOutdoorIce:
            true,

          hasIndoorIce:
            false,

          hasSkateboard,

          hasDryPad,

          outdoorAssetIds:
            group.rinkAssets.map(
              (asset) =>
                cleanText(
                  asset.gisId ||
                  asset.assetId ||
                  asset.objectId
                )
            )
              .filter(
                Boolean
              ),

          sourceKinds: [
            'outdoor',
          ],
        }
      }
    )
}


function buildIndoorSites(
  arenas
) {
  return arenas.map(
    (arena) => ({
      key:
        (
          'indoor-' +
          cleanText(
            arena.gisId ||
            arena.assetId ||
            arena.objectId ||
            slugify(
              arena.publicName ||
              arena.assetName
            )
          )
        ),

      title:
        cleanText(
          arena.publicName ||
          arena.assetName ||
          arena.rollupTo
        ) ||
        'Arena',

      latitude:
        arena.latitude,

      longitude:
        arena.longitude,

      address:
        arena.address,

      hasOutdoorIce:
        false,

      hasIndoorIce:
        true,

      hasSkateboard:
        false,

      hasDryPad:
        false,

      indoorAssetIds: [
        cleanText(
          arena.gisId ||
          arena.assetId ||
          arena.objectId
        ),
      ]
        .filter(
          Boolean
        ),

      sourceKinds: [
        'indoor',
      ],
    })
  )
}


function facilityMatchScore(
  site,
  facility
) {
  const siteNames =
    [
      site.title,
    ]
      .map(
        normalizeName
      )
      .filter(
        Boolean
      )


  const facilityName =
    normalizeName(
      facility.name
    )


  let score =
    0


  if (
    facilityName &&
    siteNames.includes(
      facilityName
    )
  ) {
    score =
      100
  }
  else if (
    facilityName &&
    siteNames.some(
      (name) =>
        name.length >=
          5 &&
        (
          facilityName.includes(
            name
          ) ||
          name.includes(
            facilityName
          )
        )
    )
  ) {
    score =
      75
  }


  const metres =
    distanceMetres(
      site,
      facility
    )


  if (
    metres <=
      60
  ) {
    score +=
      30
  }
  else if (
    metres <=
      120
  ) {
    score +=
      20
  }
  else if (
    metres <=
      MAX_FACILITY_MATCH_DISTANCE_METRES
  ) {
    score +=
      10
  }
  else {
    score -=
      100
  }


  return {
    score,
    metres,
  }
}


function matchFacility(
  site,
  facilities
) {
  let best =
    null


  facilities.forEach(
    (facility) => {
      const match =
        facilityMatchScore(
          site,
          facility
        )


      if (
        !best ||
        match.score >
          best.score ||
        (
          match.score ===
            best.score &&
          match.metres <
            best.metres
        )
      ) {
        best = {
          facility,
          ...match,
        }
      }
    }
  )


  if (
    !best ||
    best.score <
      85
  ) {
    return null
  }


  return best.facility
}


function mergeSites(
  sites,
  facilities
) {
  const grouped =
    new Map()


  sites.forEach(
    (site) => {
      const facility =
        matchFacility(
          site,
          facilities
        )


      const locationId =
        cleanText(
          facility?.locationId
        )


      const groupKey =
        locationId
          ? `location-${locationId}`
          : (
              'place-' +
              normalizeName(
                site.title
              ) +
              '-' +
              site.latitude.toFixed(
                4
              ) +
              '-' +
              site.longitude.toFixed(
                4
              )
            )


      const existing =
        grouped.get(
          groupKey
        )


      if (
        !existing
      ) {
        grouped.set(
          groupKey,
          {
            ...site,

            key:
              groupKey,

            parentFacility:
              facility ||
              null,

            locationId,

            title:
              facility?.name ||
              site.title,

            address:
              facility?.address ||
              site.address ||
              '',

            phone:
              facility?.phone ||
              '',

            officialUrl:
              (
                /^https?:\/\//i.test(
                  cleanText(
                    facility?.url
                  )
                )
                  ? facility.url
                  : facilityUrl(
                      locationId
                    )
              ),

            sourceKinds:
              [
                ...site.sourceKinds,
              ],

            indoorAssetIds:
              [
                ...(
                  site.indoorAssetIds ||
                  []
                ),
              ],

            outdoorAssetIds:
              [
                ...(
                  site.outdoorAssetIds ||
                  []
                ),
              ],
          }
        )

        return
      }


      existing.hasIndoorIce =
        existing.hasIndoorIce ||
        site.hasIndoorIce


      existing.hasOutdoorIce =
        existing.hasOutdoorIce ||
        site.hasOutdoorIce


      existing.hasSkateboard =
        existing.hasSkateboard ||
        site.hasSkateboard


      existing.hasDryPad =
        existing.hasDryPad ||
        site.hasDryPad


      existing.sourceKinds =
        [
          ...new Set([
            ...existing.sourceKinds,
            ...site.sourceKinds,
          ]),
        ]


      existing.indoorAssetIds =
        [
          ...new Set([
            ...existing.indoorAssetIds,
            ...(
              site.indoorAssetIds ||
              []
            ),
          ]),
        ]


      existing.outdoorAssetIds =
        [
          ...new Set([
            ...existing.outdoorAssetIds,
            ...(
              site.outdoorAssetIds ||
              []
            ),
          ]),
        ]
    }
  )


  return [
    ...grouped.values(),
  ]
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


function buildIceProgram(
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
    !/\b(?:skate|skating|shinny|hockey)\b/i.test(
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


  let skatingProgramCount =
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
          buildIceProgram(
            row,
            now
          )


        if (
          !program
        ) {
          return
        }


        skatingProgramCount +=
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


        const normalizedName =
          normalizeName(
            program.locationName
          )


        if (
          normalizedName
        ) {
          const programs =
            byName.get(
              normalizedName
            ) ||
            []


          programs.push(
            program
          )


          byName.set(
            normalizedName,
            programs
          )
        }
      }
    )


  return {
    byId,
    byName,
    skatingProgramCount,
  }
}


function selectPrograms(
  site,
  programIndex
) {
  const candidates =
    site.locationId
      ? (
          programIndex.byId.get(
            site.locationId
          ) ||
          []
        )
      : (
          programIndex.byName.get(
            normalizeName(
              site.title
            )
          ) ||
          []
        )


  return candidates
    .slice()
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
          site.officialUrl ||
          SKATING_PAGE,
      })
    )
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


function rinkPresentation(
  site,
  now
) {
  const {
    month,
    day,
  } =
    torontoMonthDay(
      now
    )


  const winterWindow =
    (
      month ===
        12 ||
      month ===
        1 ||
      month ===
        2 ||
      month ===
        3
    )


  const lateNovember =
    month ===
      11 &&
    day >=
      20


  const seasonalSkatepark =
    isVerifiedSeasonalSkatepark(
      site
    )


  if (
    seasonalSkatepark &&
    !winterWindow
  ) {
    return {
      currentUse:
        'skateboarding',

      currentUseLabel:
        'SEASONAL SKATEPARK',

      iceStatus:
        'closed-for-season',

      iceStatusLabel:
        site.hasIndoorIce &&
        !site.hasOutdoorIce
          ? 'ICE DRAINED / OFF SEASON'
          : 'ICE CLOSED FOR SEASON',

      expectedIceLabel:
        site.hasOutdoorIce
          ? 'ICE EXPECTED LATE NOVEMBER'
          : '',

      eventPinIcon:
        'skateboard',

      seasonalSkatepark:
        true,
    }
  }


  if (
    site.hasIndoorIce &&
    !site.hasOutdoorIce
  ) {
    return {
      currentUse:
        'indoor-arena',

      currentUseLabel:
        'INDOOR ARENA',

      iceStatus:
        'indoor',

      iceStatusLabel:
        'ICE FACILITY',

      expectedIceLabel:
        '',

      eventPinIcon:
        'rink',
    }
  }


  if (
    site.hasIndoorIce &&
    site.hasOutdoorIce
  ) {
    return {
      currentUse:
        winterWindow
          ? 'skating'
          : 'indoor-arena',

      currentUseLabel:
        winterWindow
          ? 'ICE / SKATING'
          : 'INDOOR ARENA · OUTDOOR PAD',

      iceStatus:
        winterWindow
          ? 'season'
          : 'outdoor-off-season',

      iceStatusLabel:
        winterWindow
          ? 'OUTDOOR ICE SEASON'
          : 'OUTDOOR ICE CLOSED FOR SEASON',

      expectedIceLabel:
        winterWindow
          ? ''
          : 'OUTDOOR ICE EXPECTED LATE NOVEMBER',

      eventPinIcon:
        'rink',
    }
  }


  if (
    winterWindow
  ) {
    return {
      currentUse:
        'skating',

      currentUseLabel:
        'ICE / SKATING',

      iceStatus:
        'season',

      iceStatusLabel:
        'ICE SEASON',

      expectedIceLabel:
        '',

      eventPinIcon:
        'rink',
    }
  }


  if (
    lateNovember
  ) {
    return {
      currentUse:
        site.hasSkateboard
          ? 'skateboarding'
          : (
              site.hasDryPad
                ? 'dry-pad'
                : 'season-changeover'
            ),

      currentUseLabel:
        site.hasSkateboard
          ? 'SKATEBOARDING / DRY PAD'
          : (
              site.hasDryPad
                ? 'MULTI-USE DRY PAD'
                : 'SEASON CHANGEOVER'
            ),

      iceStatus:
        'opening-soon',

      iceStatusLabel:
        'ICE EXPECTED LATE NOVEMBER',

      expectedIceLabel:
        '',

      eventPinIcon:
        site.hasSkateboard
          ? 'skateboard'
          : (
              site.hasDryPad
                ? 'dry-pad'
                : 'rink'
            ),
    }
  }


  return {
    currentUse:
      site.hasSkateboard
        ? 'skateboarding'
        : (
            site.hasDryPad
              ? 'dry-pad'
              : 'off-season'
          ),

    currentUseLabel:
      site.hasSkateboard
        ? 'SKATEBOARDING / DRY PAD'
        : (
            site.hasDryPad
              ? 'MULTI-USE DRY PAD'
              : 'OUTDOOR RINK / DRY PAD'
          ),

    iceStatus:
      'closed-for-season',

    iceStatusLabel:
      'ICE CLOSED FOR SEASON',

    expectedIceLabel:
      'EXPECTED LATE NOVEMBER',

    eventPinIcon:
      site.hasSkateboard
        ? 'skateboard'
        : (
            site.hasDryPad
              ? 'dry-pad'
              : 'rink'
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


function findHostCommunityCentre(
  site,
  existingRecords
) {
  if (
    site.locationId
  ) {
    const byLocationId =
      existingRecords.find(
        (record) =>
          record?.category ===
            'community-centre' &&
          cleanText(
            record?.recreationLocationId
          ) ===
            site.locationId
      )


    if (
      byLocationId
    ) {
      return byLocationId
    }
  }


  const siteName =
    normalizeName(
      site.title
    )


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
            MAX_HOST_MATCH_DISTANCE_METRES
        ) {
          return
        }


        const recordName =
          normalizeName(
            record?.title
          )


        const namesMatch =
          Boolean(
            siteName &&
            recordName
          ) &&
          (
            siteName ===
              recordName ||
            siteName.includes(
              recordName
            ) ||
            recordName.includes(
              siteName
            )
          )


        if (
          !namesMatch
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


function rinkFacilityPayload({
  site,
  presentation,
}) {
  return {
    hasIndoorIce:
      site.hasIndoorIce,

    hasOutdoorIce:
      site.hasOutdoorIce,

    hasSkateboard:
      site.hasSkateboard,

    hasDryPad:
      site.hasDryPad,

    seasonalSkatepark:
      Boolean(
        presentation.seasonalSkatepark
      ),

    currentUse:
      presentation.currentUse,

    currentUseLabel:
      presentation.currentUseLabel,

    iceStatus:
      presentation.iceStatus,

    iceStatusLabel:
      presentation.iceStatusLabel,

    expectedIceLabel:
      presentation.expectedIceLabel,

    outdoorAssetIds:
      site.outdoorAssetIds ||
      [],

    indoorAssetIds:
      site.indoorAssetIds ||
      [],
  }
}


async function writeHostEnrichment({
  existing,
  site,
  programs,
  presentation,
}) {
  const now =
    new Date()
      .toISOString()


  const identity =
    recordIdentity(
      existing
    )


  if (
    !identity
  ) {
    return null
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

      rinkSource:
        SOURCE_KEY,

      rinkFacility:
        rinkFacilityPayload({
          site,
          presentation,
        }),

      rinkPrograms:
        programs,

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
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
    'rink-'
  )
}


async function writeStandaloneRink({
  site,
  programs,
  presentation,
  existing =
    null,
}) {
  const now =
    new Date()
      .toISOString()


  const externalKey =
    cleanText(
      site.locationId
    ) ||
    slugify(
      site.key
    )


  const record = {
    externalId:
      `toronto-rink-${externalKey}`,

    city:
      'toronto',

    type:
      'new',

    newType:
      'events',

    category:
      'rink',

    communityType:
      'rink',

    communitySource:
      SOURCE_KEY,

    rinkSource:
      SOURCE_KEY,

    eventPinIcon:
      presentation.eventPinIcon,

    title:
      site.title,

    description:
      'City of Toronto rink and seasonal recreation facility.',

    location:
      site.address ||
      site.title,

    address:
      site.address ||
      '',

    telephone:
      site.phone ||
      '',

    latitude:
      site.latitude,

    longitude:
      site.longitude,

    status:
      'open',

    active:
      true,

    lifecycleOverride:
      'keep-live',

    source:
      SOURCE,

    sourceUrl:
      site.officialUrl ||
      SKATING_PAGE,

    sources: [
      {
        name:
          SOURCE,

        url:
          site.officialUrl ||
          SKATING_PAGE,
      },
    ],

    recreationLocationId:
      site.locationId ||
      '',

    rinkFacility:
      rinkFacilityPayload({
        site,
        presentation,
      }),

    upcomingPrograms:
      programs,
  }


  const keepHidden =
    existingStandaloneWasManuallyHidden(
      existing
    )


  const active =
    keepHidden
      ? false
      : true


  const identity =
    recordIdentity(
      record
    )


  const nextRecord = {
    ...existing,
    ...record,

    id:
      existing?.id ||
      (
        'server-new-events-rink-' +
        slugify(
          externalKey
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


async function archiveStandaloneRink(
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
        'rink-facility-not-in-current-feed',

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


async function clearHostRinkEnrichment(
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

      rinkSource:
        '',

      rinkFacility:
        null,

      rinkPrograms:
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
    outdoorPayload,
    indoorPayload,
    facilitiesPayload,
    dropInsPayload,
  ] =
    await Promise.all([
      fetchJson(
        OUTDOOR_RECREATION_URL,
        'Toronto outdoor recreation assets'
      ),

      fetchJson(
        INDOOR_ARENAS_URL,
        'Toronto indoor arenas'
      ),

      fetchJson(
        PARKS_AND_CENTRES_URL,
        'Toronto parks and recreation facilities'
      ),

      fetchJson(
        DROP_IN_SCHEDULE_URL,
        'Toronto recreation drop-in programs'
      ),
    ])


  const outdoorAssets =
    parseOutdoorAssets(
      outdoorPayload
    )


  const indoorArenas =
    parseIndoorArenas(
      indoorPayload
    )


  const facilities =
    parseFacilities(
      facilitiesPayload
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
    outdoorAssets.length ===
      0
  ) {
    throw new Error(
      'Rink sanity check failed: no outdoor recreation assets were parsed.'
    )
  }


  if (
    indoorArenas.length ===
      0
  ) {
    throw new Error(
      'Rink sanity check failed: no indoor arenas were parsed.'
    )
  }


  return {
    outdoorAssets,
    indoorArenas,
    facilities,
    dropIns,
  }
}


export async function syncRinks() {
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
          outdoorAssets,
          indoorArenas,
          facilities,
          dropIns,
        } =
          await loadOfficialData()


        const outdoorSites =
          buildOutdoorSites(
            outdoorAssets
          )


        const indoorSites =
          buildIndoorSites(
            indoorArenas
          )


        const sites =
          mergeSites(
            [
              ...outdoorSites,
              ...indoorSites,
            ],
            facilities
          )


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


        const existingStandalone =
          existingRecords.filter(
            (record) =>
              record?.communitySource ===
                SOURCE_KEY ||
              cleanText(
                record?.externalId
              )
                .startsWith(
                  'toronto-rink-'
                )
          )


        const existingStandaloneById =
          new Map(
            existingStandalone.map(
              (record) => [
                cleanText(
                  record.externalId
                ),
                record,
              ]
            )
          )


        const touchedHostIds =
          new Set()


        const incomingStandaloneIds =
          new Set()


        let standalonePinCount =
          0


        let enrichedCommunityCentreCount =
          0


        let skateboardUseCount =
          0


        let dryPadUseCount =
          0


        let upcomingProgramCount =
          0


        for (
          const site of sites
        ) {
          const presentation =
            rinkPresentation(
              site,
              now
            )


          if (
            presentation.currentUse ===
              'skateboarding'
          ) {
            skateboardUseCount +=
              1
          }


          if (
            presentation.currentUse ===
              'dry-pad'
          ) {
            dryPadUseCount +=
              1
          }


          const programs =
            selectPrograms(
              site,
              programIndex
            )


          upcomingProgramCount +=
            programs.length


          const host =
            findHostCommunityCentre(
              site,
              existingRecords
            )


          if (
            host
          ) {
            await writeHostEnrichment({
              existing:
                host,

              site,

              programs,

              presentation,
            })


            touchedHostIds.add(
              cleanText(
                host.id
              ) ||
              recordIdentity(
                host
              )
            )


            enrichedCommunityCentreCount +=
              1


            continue
          }


          const externalKey =
            cleanText(
              site.locationId
            ) ||
            slugify(
              site.key
            )


          const externalId =
            `toronto-rink-${externalKey}`


          incomingStandaloneIds.add(
            externalId
          )


          await writeStandaloneRink({
            site,

            programs,

            presentation,

            existing:
              existingStandaloneById.get(
                externalId
              ) ||
              null,
          })


          standalonePinCount +=
            1
        }


        let archivedCount =
          0


        for (
          const existing of
          existingStandalone
        ) {
          if (
            !incomingStandaloneIds.has(
              cleanText(
                existing.externalId
              )
            )
          ) {
            const archived =
              await archiveStandaloneRink(
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


        let clearedEnrichmentCount =
          0


        for (
          const existing of
          existingRecords
        ) {
          if (
            cleanText(
              existing?.rinkSource
            ) !==
              SOURCE_KEY ||
            existing?.communitySource ===
              SOURCE_KEY
          ) {
            continue
          }


          const hostKey =
            cleanText(
              existing.id
            ) ||
            recordIdentity(
              existing
            )


          if (
            touchedHostIds.has(
              hostKey
            )
          ) {
            continue
          }


          const cleared =
            await clearHostRinkEnrichment(
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

          outdoorRinkCount:
            outdoorSites.length,

          indoorArenaCount:
            indoorSites.length,

          facilityCount:
            sites.length,

          standalonePinCount,

          enrichedCommunityCentreCount,

          skateboardUseCount,

          dryPadUseCount,

          skatingProgramCount:
            upcomingProgramCount,

          archivedCount,

          clearedEnrichmentCount,

          error:
            '',
        }


        console.log(
          'RINKS · SYNCED',
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
          'RINKS · SYNC FAILED:',
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


export function rinksFeed() {
  return {
    name:
      'toronto-rinks',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          syncRinks()
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

              skatingPage:
                SKATING_PAGE,
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
              await syncRinks()


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
