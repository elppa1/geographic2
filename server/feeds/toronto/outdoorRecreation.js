import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


const STATUS_PATH =
  '/api/geographic/toronto/new/community/outdoor-recreation/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/outdoor-recreation/sync'


const PLAYING_COURTS_URL =
  (
    'https://gis.toronto.ca/arcgis/rest/services/' +
    'cot_geospatial13/FeatureServer/53/query'
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


const SOURCE =
  'City of Toronto Parks & Recreation'


const SOURCE_KEY =
  'toronto-outdoor-recreation'


const FACILITY_MAP_URL =
  'https://www.toronto.ca/data/parks/maps/index.html'


const FACILITY_BASE_URL =
  'https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id='


const SYNC_INTERVAL_MS =
  6 * 60 * 60 * 1000


const ARCGIS_PAGE_SIZE =
  2000


const SAME_CATEGORY_GROUP_METRES =
  45


const EXACT_MULTI_USE_METRES =
  7


const EXISTING_RINK_MATCH_METRES =
  18


const FACILITY_MATCH_METRES =
  300


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

  sourceAssetCount:
    0,

  siteCount:
    0,

  standalonePinCount:
    0,

  enrichedExistingCount:
    0,

  skateparkCount:
    0,

  basketballCount:
    0,

  tennisCount:
    0,

  pickleballCount:
    0,

  bikeParkCount:
    0,

  sportsCourtCount:
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
    'outdoor-recreation'
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
      /\b(?:community|recreation|outdoor|public)\b/g,
      ' '
    )
    .replace(
      /\b(?:centre|center|court|courts|area|pad|park)\b/g,
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


function sourceText(
  attributes
) {
  return [
    attributes?.ASSET_TYPE,
    attributes?.ASSET_NAME,
    attributes?.PUBLIC_NAME,
    attributes?.ROLLUP_TO,
    attributes?.ASSETCATEGORY_DESC,
  ]
    .map(
      cleanText
    )
    .filter(
      Boolean
    )
    .join(
      ' · '
    )
}


function classifyAsset(
  attributes
) {
  const text =
    sourceText(
      attributes
    )
      .toLowerCase()


  if (
    /\bpickleball\b/.test(
      text
    )
  ) {
    return {
      code:
        'pickleball-court',

      label:
        'Pickleball',

      icon:
        'pickleball',
    }
  }


  if (
    /\bbasketball\b/.test(
      text
    )
  ) {
    return {
      code:
        'basketball-court',

      label:
        'Basketball',

      icon:
        'basketball',
    }
  }


  if (
    /\bskateboard\b|\bskate park\b|\bskatepark\b/.test(
      text
    )
  ) {
    return {
      code:
        'skatepark',

      label:
        'Skateboarding',

      icon:
        'skateboard',
    }
  }


  if (
    /\bbmx\b|\bbike park\b|\bbike area\b/.test(
      text
    )
  ) {
    return {
      code:
        'bike-park',

      label:
        'Bike Park',

      icon:
        'bike-park',
    }
  }


  if (
    /\btennis\b/.test(
      text
    )
  ) {
    return {
      code:
        'tennis-court',

      label:
        'Tennis',

      icon:
        'tennis',
    }
  }


  if (
    /\bball hockey\b/.test(
      text
    )
  ) {
    return {
      code:
        'sports-court',

      label:
        'Ball Hockey',

      icon:
        'sports-court',
    }
  }


  if (
    /\bvolleyball\b/.test(
      text
    )
  ) {
    return {
      code:
        'sports-court',

      label:
        'Volleyball',

      icon:
        'sports-court',
    }
  }


  if (
    /\bhand ball\b|\bhandball\b/.test(
      text
    )
  ) {
    return {
      code:
        'sports-court',

      label:
        'Handball',

      icon:
        'sports-court',
    }
  }


  if (
    /\bbocce\b/.test(
      text
    )
  ) {
    return {
      code:
        'sports-court',

      label:
        'Bocce',

      icon:
        'sports-court',
    }
  }


  if (
    /\bsportspad\b|\bsports pad\b|\bmulti[- ]?use\b/.test(
      text
    )
  ) {
    return {
      code:
        'sports-court',

      label:
        'Multi-use Sports Pad',

      icon:
        'sports-court',
    }
  }


  return null
}


function genericFacilityWords(
  value
) {
  return /^(?:basketball|tennis|pickleball|skateboard|skatepark|bmx|bike|ball hockey|volleyball|handball|bocce|sports?|outdoor|court|pad|area)(?:\s+(?:court|courts|pad|area|park))?$/i.test(
    cleanText(
      value
    )
  )
}


function placeName(
  attributes
) {
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


  return (
    candidates.find(
      (value) =>
        !genericFacilityWords(
          value
        )
    ) ||
    candidates[0] ||
    'Outdoor Recreation'
  )
}


function buildCandidate({
  feature,
  sourceLayer,
}) {
  const attributes =
    feature?.attributes ||
    {}


  const classification =
    classifyAsset(
      attributes
    )


  const point =
    geometryPoint(
      feature
    )


  if (
    !classification ||
    !point
  ) {
    return null
  }


  const name =
    placeName(
      attributes
    )


  return {
    id:
      cleanText(
        attributes?.GIS_ID ||
        attributes?.ASSET_ID ||
        attributes?.OBJECTID
      ),

    sourceLayer,

    name,

    nameKey:
      normalizeName(
        name
      ),

    code:
      classification.code,

    label:
      classification.label,

    icon:
      classification.icon,

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

    lighting:
      cleanText(
        attributes?.LIGHTING_IND
      ),

    hoopCount:
      cleanText(
        attributes?.BASKETBALL_HOOP_COUNT
      ),

    categoryDescription:
      cleanText(
        attributes?.ASSETCATEGORY_DESC
      ),

    latitude:
      point.latitude,

    longitude:
      point.longitude,
  }
}


function sameNamedPlace(
  a,
  b
) {
  return Boolean(
    a?.nameKey &&
    b?.nameKey &&
    (
      a.nameKey ===
        b.nameKey ||
      a.nameKey.includes(
        b.nameKey
      ) ||
      b.nameKey.includes(
        a.nameKey
      )
    )
  )
}


function groupSameCategory(
  candidates
) {
  const groups =
    []


  candidates.forEach(
    (candidate) => {
      const existing =
        groups.find(
          (group) =>
            group.code ===
              candidate.code &&
            sameNamedPlace(
              group,
              candidate
            ) &&
            distanceMetres(
              group,
              candidate
            ) <=
              SAME_CATEGORY_GROUP_METRES
        )


      if (
        existing
      ) {
        existing.items.push(
          candidate
        )


        const itemCount =
          existing.items.length


        existing.latitude =
          (
            (
              existing.latitude *
              (
                itemCount -
                1
              )
            ) +
            candidate.latitude
          ) /
          itemCount


        existing.longitude =
          (
            (
              existing.longitude *
              (
                itemCount -
                1
              )
            ) +
            candidate.longitude
          ) /
          itemCount


        existing.labels.add(
          candidate.label
        )


        existing.assetIds.push(
          candidate.id
        )


        existing.lighting =
          existing.lighting ||
          candidate.lighting


        existing.hoopCount =
          existing.hoopCount ||
          candidate.hoopCount


        return
      }


      groups.push({
        code:
          candidate.code,

        icon:
          candidate.icon,

        name:
          candidate.name,

        nameKey:
          candidate.nameKey,

        latitude:
          candidate.latitude,

        longitude:
          candidate.longitude,

        labels:
          new Set([
            candidate.label,
          ]),

        items: [
          candidate,
        ],

        assetIds: [
          candidate.id,
        ],

        lighting:
          candidate.lighting,

        hoopCount:
          candidate.hoopCount,
      })
    }
  )


  return groups
}


function mergeExactMultiUse(
  groups
) {
  const output =
    []


  groups.forEach(
    (group) => {
      const existing =
        output.find(
          (candidate) =>
            sameNamedPlace(
              candidate,
              group
            ) &&
            distanceMetres(
              candidate,
              group
            ) <=
              EXACT_MULTI_USE_METRES
        )


      if (
        !existing
      ) {
        output.push({
          ...group,

          labels:
            new Set(
              group.labels
            ),

          codes:
            new Set([
              group.code,
            ]),
        })

        return
      }


      existing.codes.add(
        group.code
      )


      group.labels.forEach(
        (label) =>
          existing.labels.add(
            label
          )
      )


      existing.items.push(
        ...group.items
      )


      existing.assetIds.push(
        ...group.assetIds
      )


      const totalItems =
        existing.items.length


      const groupItems =
        group.items.length


      const previousItems =
        totalItems -
        groupItems


      existing.latitude =
        (
          (
            existing.latitude *
            previousItems
          ) +
          (
            group.latitude *
            groupItems
          )
        ) /
        totalItems


      existing.longitude =
        (
          (
            existing.longitude *
            previousItems
          ) +
          (
            group.longitude *
            groupItems
          )
        ) /
        totalItems


      existing.lighting =
        existing.lighting ||
        group.lighting


      existing.hoopCount =
        existing.hoopCount ||
        group.hoopCount
    }
  )


  return output.map(
    (site) => {
      const codes =
        [
          ...site.codes,
        ]


      const multipleActivities =
        site.labels.size >
          1 ||
        codes.length >
          1


      if (
        multipleActivities
      ) {
        return {
          ...site,

          code:
            'sports-court',

          icon:
            'sports-court',
        }
      }


      return site
    }
  )
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


      const namesMatch =
        sameNamedPlace(
          site,
          facility
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
          facility,
          metres,
        }
      }
    }
  )


  return best?.facility ||
    null
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
    : FACILITY_MAP_URL
}


function siteCategoryLabel(
  code
) {
  const labels = {
    'skatepark':
      'Skatepark',

    'basketball-court':
      'Basketball Court',

    'tennis-court':
      'Tennis Court',

    'pickleball-court':
      'Pickleball Court',

    'bike-park':
      'Bike Park',

    'sports-court':
      'Outdoor Sports Court',
  }


  return labels[
    code
  ] ||
    'Outdoor Recreation'
}


function siteTitle(
  site
) {
  const facilityLabel =
    siteCategoryLabel(
      site.code
    )


  const name =
    cleanText(
      site.name
    )


  if (
    name
      .toLowerCase()
      .includes(
        facilityLabel
          .toLowerCase()
      )
  ) {
    return name
  }


  return (
    name +
    ' · ' +
    facilityLabel
  )
}


function activityLabels(
  site
) {
  return [
    ...site.labels,
  ]
    .filter(
      Boolean
    )
    .sort(
      (
        a,
        b
      ) =>
        a.localeCompare(
          b
        )
    )
}


function siteDescription(
  site
) {
  const parts = [
    activityLabels(
      site
    )
      .join(
        ' · '
      ),
  ]


  if (
    site.hoopCount
  ) {
    parts.push(
      `${site.hoopCount} hoop${site.hoopCount === '1' ? '' : 's'}`
    )
  }


  if (
    /^(?:y|yes|true|1)$/i.test(
      cleanText(
        site.lighting
      )
    )
  ) {
    parts.push(
      'Lighted'
    )
  }


  return parts
    .filter(
      Boolean
    )
    .join(
      ' · '
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


function findExistingHost(
  site,
  existingRecords
) {
  let best =
    null


  existingRecords
    .filter(
      (record) =>
        (
          record?.category ===
            'rink' ||
          record?.rinkFacility
        ) &&
        record?.communitySource !==
          SOURCE_KEY
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
            EXISTING_RINK_MATCH_METRES
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


function sitePayload(
  site
) {
  return {
    id:
      slugify(
        [
          site.nameKey,
          site.code,
          site.latitude.toFixed(
            5
          ),
          site.longitude.toFixed(
            5
          ),
        ]
          .join(
            '-'
          )
      ),

    category:
      site.code,

    title:
      siteTitle(
        site
      ),

    activities:
      activityLabels(
        site
      ),

    lighting:
      cleanText(
        site.lighting
      ),

    hoopCount:
      cleanText(
        site.hoopCount
      ),

    latitude:
      site.latitude,

    longitude:
      site.longitude,

    assetIds:
      [
        ...new Set(
          site.assetIds
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
    'outdoor-recreation-'
  )
}


async function writeStandalone({
  site,
  existing =
    null,
}) {
  const now =
    new Date()
      .toISOString()


  const facility =
    site.facility ||
    null


  const payload =
    sitePayload(
      site
    )


  const externalId =
    `toronto-outdoor-recreation-${payload.id}`


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
      site.code,

    communityType:
      site.code,

    communitySource:
      SOURCE_KEY,

    outdoorRecreationSource:
      SOURCE_KEY,

    eventPinIcon:
      site.icon,

    title:
      payload.title,

    description:
      siteDescription(
        site
      ),

    location:
      facility?.address ||
      site.name,

    address:
      facility?.address ||
      '',

    telephone:
      facility?.phone ||
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
        facility
      ),

    sources: [
      {
        name:
          SOURCE,

        url:
          facilityUrl(
            facility
          ),
      },
    ],

    recreationLocationId:
      facility?.locationId ||
      '',

    outdoorActivities:
      payload.activities,

    outdoorRecreationFacilities: [
      payload,
    ],

    id:
      existing?.id ||
      (
        'server-new-events-outdoor-recreation-' +
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


  const now =
    new Date()
      .toISOString()


  const facilities =
    sites.map(
      sitePayload
    )


  const activities =
    [
      ...new Set(
        facilities.flatMap(
          (facility) =>
            facility.activities
        )
      ),
    ]
      .sort(
        (
          a,
          b
        ) =>
          a.localeCompare(
            b
          )
      )


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

      outdoorRecreationSource:
        SOURCE_KEY,

      outdoorActivities:
        activities,

      outdoorRecreationFacilities:
        facilities,

      serverUpdatedAt:
        now,

      updatedAt:
        now,
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
        'outdoor-recreation-facility-not-in-current-feed',

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

      outdoorRecreationSource:
        '',

      outdoorActivities:
        [],

      outdoorRecreationFacilities:
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
    playingCourtFeatures,
    outdoorFeatures,
    facilityFeatures,
  ] =
    await Promise.all([
      fetchArcGisFeatures({
        baseUrl:
          PLAYING_COURTS_URL,

        label:
          'Toronto playing courts',

        outFields:
          (
            'OBJECTID,ASSET_TYPE,ASSET_NAME,PUBLIC_NAME,ROLLUP_TO,' +
            'LIGHTING_IND,BASKETBALL_HOOP_COUNT,ASSETCATEGORY,' +
            'ASSETCATEGORY_DESC,GIS_ID,ASSET_ID'
          ),
      }),

      fetchArcGisFeatures({
        baseUrl:
          OUTDOOR_RECREATION_URL,

        label:
          'Toronto outdoor recreation areas',

        outFields:
          (
            'OBJECTID,ASSET_TYPE,ASSET_NAME,PUBLIC_NAME,ROLLUP_TO,' +
            'LIGHTING_IND,ASSETCATEGORY,ASSETCATEGORY_DESC,GIS_ID,ASSET_ID'
          ),
      }),

      fetchArcGisFeatures({
        baseUrl:
          PARKS_AND_CENTRES_URL,

        label:
          'Toronto parks and recreation facilities',

        outFields:
          (
            'LOCATIONID,ASSET_NAME,TYPE,ADDRESS,PHONE,URL,' +
            'LATITUDE,LONGITUDE'
          ),

        returnGeometry:
          false,
      }),
    ])


  const candidates =
    [
      ...playingCourtFeatures.map(
        (feature) =>
          buildCandidate({
            feature,

            sourceLayer:
              'playing-court',
          })
      ),

      ...outdoorFeatures.map(
        (feature) =>
          buildCandidate({
            feature,

            sourceLayer:
              'outdoor-recreation',
          })
      ),
    ]
      .filter(
        Boolean
      )


  if (
    candidates.length ===
      0
  ) {
    throw new Error(
      'Outdoor recreation sanity check failed: no usable assets were parsed.'
    )
  }


  const sameCategoryGroups =
    groupSameCategory(
      candidates
    )


  const sites =
    mergeExactMultiUse(
      sameCategoryGroups
    )


  const facilities =
    parseFacilities(
      facilityFeatures
    )


  sites.forEach(
    (site) => {
      site.facility =
        matchFacility(
          site,
          facilities
        )
    }
  )


  return {
    candidates,
    sites,
  }
}


function countByCode(
  sites,
  code
) {
  return sites.filter(
    (site) =>
      site.code ===
        code
  )
    .length
}


export async function syncOutdoorRecreation() {
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
          candidates,
          sites,
        } =
          await loadOfficialData()


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
                  'toronto-outdoor-recreation-'
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


        const hostSites =
          new Map()


        let standalonePinCount =
          0


        sites.forEach(
          (site) => {
            const host =
              findExistingHost(
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


              const existing =
                hostSites.get(
                  key
                ) ||
                {
                  host,

                  sites:
                    [],
                }


              existing.sites.push(
                site
              )


              hostSites.set(
                key,
                existing
              )


              return
            }


            const payload =
              sitePayload(
                site
              )


            const externalId =
              `toronto-outdoor-recreation-${payload.id}`


            incomingStandaloneIds.add(
              externalId
            )
          }
        )


        for (
          const site of sites
        ) {
          const host =
            findExistingHost(
              site,
              existingRecords
            )


          if (
            host
          ) {
            continue
          }


          const payload =
            sitePayload(
              site
            )


          const externalId =
            `toronto-outdoor-recreation-${payload.id}`


          await writeStandalone({
            site,

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
          const {
            host,
            sites:
              matchedSites,
          } of hostSites.values()
        ) {
          await writeHostEnrichment({
            existing:
              host,

            sites:
              matchedSites,
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
              ...hostSites.values(),
            ]
              .map(
                ({
                  host,
                }) =>
                  hostKey(
                    host
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
              existing?.outdoorRecreationSource
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

          sourceAssetCount:
            candidates.length,

          siteCount:
            sites.length,

          standalonePinCount,

          enrichedExistingCount:
            hostSites.size,

          skateparkCount:
            countByCode(
              sites,
              'skatepark'
            ),

          basketballCount:
            countByCode(
              sites,
              'basketball-court'
            ),

          tennisCount:
            countByCode(
              sites,
              'tennis-court'
            ),

          pickleballCount:
            countByCode(
              sites,
              'pickleball-court'
            ),

          bikeParkCount:
            countByCode(
              sites,
              'bike-park'
            ),

          sportsCourtCount:
            countByCode(
              sites,
              'sports-court'
            ),

          archivedCount,

          clearedEnrichmentCount,

          error:
            '',
        }


        console.log(
          'OUTDOOR RECREATION · SYNCED',
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
          'OUTDOOR RECREATION · SYNC FAILED:',
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


export function outdoorRecreationFeed() {
  return {
    name:
      'toronto-outdoor-recreation',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          syncOutdoorRecreation()
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

              facilityMap:
                FACILITY_MAP_URL,
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
              await syncOutdoorRecreation()


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
