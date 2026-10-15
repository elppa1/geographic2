// ============================================================
// LOCATION SEARCH API
// ============================================================
//
// Same-origin server endpoint for browser location searches.
//
// Browser:
//   /api/geographic/location-search/place
//   /api/geographic/location-search/intersection
//
// Server:
//   Nominatim full-string intersection lookup first
//   City of Toronto centreline lookup as a short fallback
//   Overpass geometry as the final intersection fallback
//
// External requests stay server-side so the browser never calls
// Overpass or Nominatim directly.
//
// ============================================================

const LOCATION_CACHE_TTL_MS =
  24 * 60 * 60 * 1000

const LOCATION_CACHE_MAX =
  500

const NOMINATIM_MIN_INTERVAL_MS =
  1100

const INTERSECTION_TIME_BUDGET_MS =
  9000

const OVERPASS_ATTEMPT_MAX_MS =
  3500

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const TORONTO_INTERSECTION_ENDPOINTS = [
  'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial/FeatureServer/19/query',
  'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial/MapServer/19/query',
]


// Independent ArcGIS Online hosted copy of Toronto's intersection point dataset.
// Uses a separate host so a timeout on gis.toronto.ca does not break all search.
const TORONTO_HOSTED_INTERSECTION_ENDPOINT =
  'https://services.arcgis.com/a3UyP711tRR4O2v8/ArcGIS/rest/services/Bike_Lanes_Existing_RA/FeatureServer/0/query'

const ARCGIS_GEOCODER_ENDPOINT =
  'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'

const TORONTO_SEARCH_BOUNDS = {
  west:
    -79.6393,

  north:
    43.8555,

  east:
    -79.115,

  south:
    43.581,
}

const locationSearchCache =
  new Map()

const locationSearchInFlight =
  new Map()

let nominatimQueue =
  Promise.resolve()

let lastNominatimRequestAt =
  0


function sleep(
  milliseconds
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      )
    }
  )
}


function getLocationCache(
  key
) {
  const entry =
    locationSearchCache.get(
      key
    )


  if (
    !entry
  ) {
    return null
  }


  if (
    entry.expiresAt <=
    Date.now()
  ) {
    locationSearchCache.delete(
      key
    )

    return null
  }


  return entry.value
}


function setLocationCache(
  key,
  value
) {
  locationSearchCache.set(
    key,
    {
      value,

      expiresAt:
        Date.now() +
        LOCATION_CACHE_TTL_MS,
    }
  )


  while (
    locationSearchCache.size >
    LOCATION_CACHE_MAX
  ) {
    const oldestKey =
      locationSearchCache
        .keys()
        .next()
        .value


    if (
      oldestKey ===
      undefined
    ) {
      break
    }


    locationSearchCache.delete(
      oldestKey
    )
  }
}


async function fetchNominatim(
  params,
  {
    deadline =
      null,
  } =
    {}
) {
  const cacheKey =
    params.toString()


  const cached =
    getLocationCache(
      cacheKey
    )


  if (
    cached !==
    null
  ) {
    return cached
  }


  const existing =
    locationSearchInFlight.get(
      cacheKey
    )


  if (
    existing
  ) {
    return existing
  }


  const request =
    nominatimQueue
      .catch(
        () => {}
      )
      .then(
        async () => {
          if (
            remainingTime(
              deadline,
              1
            ) <=
              0
          ) {
            throw new Error(
              'INTERSECTION SEARCH TIME BUDGET EXCEEDED'
            )
          }


          const elapsed =
            Date.now() -
            lastNominatimRequestAt


          if (
            elapsed <
            NOMINATIM_MIN_INTERVAL_MS
          ) {
            await sleep(
              NOMINATIM_MIN_INTERVAL_MS -
              elapsed
            )
          }


          lastNominatimRequestAt =
            Date.now()


          const requestUrl =
            (
              'https://nominatim.openstreetmap.org/search?' +
              params.toString()
            )


          const requestOptions = {
            headers: {
              Accept:
                'application/json',

              'Accept-Language':
                'en',

              'User-Agent':
                'ELPPA-Geographic/1.0 (Toronto Geographic)',
            },

            signal:
              AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(
                    15000,
                    remainingTime(
                      deadline,
                      15000
                    )
                  )
                )
              ),
          }


          let response =
            await fetch(
              requestUrl,
              requestOptions
            )


          if (
            response.status ===
            429
          ) {
            const retryAfterHeader =
              Number(
                response.headers.get(
                  'retry-after'
                )
              )


            const retryDelay =
              Number.isFinite(
                retryAfterHeader
              ) &&
              retryAfterHeader >
                0
                ? Math.max(
                    2000,
                    retryAfterHeader *
                      1000
                  )
                : 3000


            if (
              remainingTime(
                deadline,
                retryDelay +
                  1
              ) <=
                retryDelay
            ) {
              throw new Error(
                'INTERSECTION SEARCH TIME BUDGET EXCEEDED'
              )
            }


            await sleep(
              retryDelay
            )


            lastNominatimRequestAt =
              Date.now()


            response =
              await fetch(
                requestUrl,
                {
                  ...requestOptions,

                  signal:
                    AbortSignal.timeout(
                      Math.max(
                        1,
                        Math.min(
                          15000,
                          remainingTime(
                            deadline,
                            15000
                          )
                        )
                      )
                    ),
                }
              )
          }


          if (
            !response.ok
          ) {
            throw new Error(
              `NOMINATIM ${response.status}`
            )
          }


          const data =
            await response.json()


          const results =
            Array.isArray(
              data
            )
              ? data
              : []


          setLocationCache(
            cacheKey,
            results
          )


          return results
        }
      )


  nominatimQueue =
    request


  locationSearchInFlight.set(
    cacheKey,
    request
  )


  try {
    return await request
  }
  finally {
    locationSearchInFlight.delete(
      cacheKey
    )
  }
}


function sendLocationJson(
  res,
  status,
  data
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
      data
    )
  )
}


function finiteNumber(
  value
) {
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


function cleanIntersectionStreet(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' '
    )
}


function stripStreetSuffix(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .replace(
      /\s+(street|st|avenue|ave|av|road|rd|boulevard|blvd|drive|dr|lane|ln|court|crt|ct|place|pl|crescent|cres|cr|trail|trl|terrace|terr|parkway|pkwy|circle|cir|highway|hwy|expressway|expy|way|square|sq|gardens|garden|gdns|grove|grv|heights|hts|hill|path|row|gate|mews|close|cl)\.?$/i,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function escapeRegex(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )
}


function getStreetDirection(
  value
) {
  const clean =
    cleanIntersectionStreet(
      value
    )


  const match =
    clean.match(
      /\s+(East|West|North|South|E|W|N|S)\.?$/i
    )


  if (
    !match
  ) {
    return {
      base:
        clean,

      direction:
        '',
    }
  }


  return {
    base:
      clean
        .slice(
          0,
          match.index
        )
        .trim(),

    direction:
      match[1],
  }
}


function makeDirectionRegex(
  direction
) {
  const clean =
    String(
      direction ||
      ''
    )
      .toLowerCase()
      .replace(
        /\./g,
        ''
      )


  if (
    clean ===
      'east' ||
    clean ===
      'e'
  ) {
    return '(East|E\\.?)'
  }


  if (
    clean ===
      'west' ||
    clean ===
      'w'
  ) {
    return '(West|W\\.?)'
  }


  if (
    clean ===
      'north' ||
    clean ===
      'n'
  ) {
    return '(North|N\\.?)'
  }


  if (
    clean ===
      'south' ||
    clean ===
      's'
  ) {
    return '(South|S\\.?)'
  }


  return '(East|West|North|South|E\\.?|W\\.?|N\\.?|S\\.?)'
}


function makeStreetNameRegex(
  value
) {
  const normalized =
    String(
      value ||
      ''
    )
      .replace(
        /\./g,
        ''
      )
      .trim()
      .replace(
        /\s+/g,
        ' '
      )


  return normalized
    .split(
      ' '
    )
    .filter(
      Boolean
    )
    .map(
      (part) => {
        const clean =
          String(
            part
          )
            .toLowerCase()


        if (
          clean ===
            'st' ||
          clean ===
            'saint'
        ) {
          return '(St\\.?|Saint)'
        }


        return escapeRegex(
          part
        )
      }
    )
    .join(
      '[ .]+'
    )
}


function makeStreetRegex(
  value
) {
  const {
    base,
    direction,
  } =
    getStreetDirection(
      value
    )


  const streetName =
    makeStreetNameRegex(
      stripStreetSuffix(
        base
      )
    )


  const streetType =
    (
      '( (Street|St\\.?|Avenue|Ave\\.?|Av\\.?|Road|Rd\\.?|' +
      'Boulevard|Blvd\\.?|Drive|Dr\\.?|Lane|Ln\\.?|' +
      'Court|Crt\\.?|Ct\\.?|Place|Pl\\.?|Crescent|Cres\\.?|Cr\\.?|' +
      'Trail|Trl\\.?|Terrace|Terr\\.?|Parkway|Pkwy\\.?|' +
      'Circle|Cir\\.?|Highway|Hwy\\.?|Expressway|Expy\\.?|' +
      'Way|Square|Sq\\.?|Gardens|Garden|Gdns\\.?|' +
      'Grove|Grv\\.?|Heights|Hts\\.?|Hill|Path|Row|' +
      'Gate|Mews|Close|Cl\\.?))?'
    )


  const directionRegex =
    direction
      ? (
          ' ' +
          makeDirectionRegex(
            direction
          )
        )
      : (
          '( (East|West|North|South|E\\.?|W\\.?|N\\.?|S\\.?))?'
        )


  return (
    '^' +
    streetName +
    streetType +
    directionRegex +
    '$'
  )
}


function getIntersectionStreetSearch(
  value
) {
  const clean =
    cleanIntersectionStreet(
      value
    )


  const routeMatch =
    clean.match(
      /^(?:(?:ontario|on)\s+)?(?:(?:highway|hwy|route)\s+)?(\d+[a-z]?)$/i
    )


  if (
    routeMatch
  ) {
    const routeNumber =
      routeMatch[1]
        .toUpperCase()


    return {
      name:
        `Highway ${routeNumber}`,

      refRegex:
        (
          '^(ON[ .-]*)?' +
          escapeRegex(
            routeNumber
          ) +
          '$'
        ),
    }
  }


  const shorthand =
    clean
      .toLowerCase()
      .replace(
        /\./g,
        ''
      )


  if (
    shorthand ===
      'dvp'
  ) {
    return {
      name:
        'Don Valley Parkway',

      refRegex:
        '',
    }
  }


  if (
    shorthand ===
      'gardiner'
  ) {
    return {
      name:
        'Gardiner Expressway',

      refRegex:
        '',
    }
  }


  if (
    shorthand ===
      'qew'
  ) {
    return {
      name:
        'Queen Elizabeth Way',

      refRegex:
        '^QEW$',
    }
  }


  return {
    name:
      clean,

    refRegex:
      '',
  }
}


const STREET_TYPE_ALIASES =
  new Map(
    Object.entries({
      street: 'street',
      st: 'street',
      avenue: 'avenue',
      ave: 'avenue',
      av: 'avenue',
      road: 'road',
      rd: 'road',
      boulevard: 'boulevard',
      blvd: 'boulevard',
      drive: 'drive',
      dr: 'drive',
      lane: 'lane',
      ln: 'lane',
      court: 'court',
      ct: 'court',
      crt: 'court',
      place: 'place',
      pl: 'place',
      crescent: 'crescent',
      cres: 'crescent',
      cr: 'crescent',
      trail: 'trail',
      trl: 'trail',
      terrace: 'terrace',
      terr: 'terrace',
      parkway: 'parkway',
      pkwy: 'parkway',
      circle: 'circle',
      cir: 'circle',
      highway: 'highway',
      hwy: 'highway',
      expressway: 'expressway',
      expy: 'expressway',
      way: 'way',
      square: 'square',
      sq: 'square',
      gardens: 'gardens',
      garden: 'gardens',
      gdns: 'gardens',
      grove: 'grove',
      grv: 'grove',
      heights: 'heights',
      hts: 'heights',
      hill: 'hill',
      path: 'path',
      row: 'row',
      gate: 'gate',
      mews: 'mews',
      close: 'close',
      cl: 'close',
    })
  )


const DIRECTION_ALIASES =
  new Map([
    ['e', 'east'],
    ['east', 'east'],
    ['w', 'west'],
    ['west', 'west'],
    ['n', 'north'],
    ['north', 'north'],
    ['s', 'south'],
    ['south', 'south'],
  ])


function streetWords(
  value
) {
  return String(
    value ||
    ''
  )
    .toLowerCase()
    .replace(
      /[’']/g,
      ''
    )
    .replace(
      /\./g,
      ''
    )
    .match(
      /[a-z0-9]+/g
    ) ||
    []
}


function getStreetParts(
  value
) {
  const words =
    streetWords(
      value
    )


  let direction =
    ''


  if (
    words.length >
      0
  ) {
    const maybeDirection =
      DIRECTION_ALIASES.get(
        words[
          words.length -
          1
        ]
      ) ||
      ''


    if (
      maybeDirection
    ) {
      direction =
        maybeDirection

      words.pop()
    }
  }


  let streetType =
    ''


  if (
    words.length >
      0
  ) {
    const maybeType =
      STREET_TYPE_ALIASES.get(
        words[
          words.length -
          1
        ]
      ) ||
      ''


    if (
      maybeType
    ) {
      streetType =
        maybeType

      words.pop()
    }
  }


  if (
    words[0] ===
      'st'
  ) {
    words[0] =
      'saint'
  }


  if (
    words[0] ===
      'the' &&
    words.length >
      1
  ) {
    words.shift()
  }


  return {
    core:
      words,

    coreText:
      words.join(
        ' '
      ),

    direction,
    streetType,
  }
}


function intersectionSearchTerms(
  value
) {
  const search =
    getIntersectionStreetSearch(
      value
    )


  const parts =
    getStreetParts(
      search.name
    )


  const useful =
    parts.core
      .filter(
        (token) =>
          token !==
            'saint' &&
          token !==
            'the'
      )


  const numeric =
    useful.find(
      (token) =>
        /\d/.test(
          token
        )
    )


  if (
    numeric
  ) {
    return [
      numeric,
    ]
  }


  return useful
    .slice(
      0,
      3
    )
}


function escapeArcSqlText(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /'/g,
      "''"
    )
    .toUpperCase()
}


function splitIntersectionDescription(
  value
) {
  return String(
    value ||
    ''
  )
    .trim()
    .split(
      /\s*\/\s*|\s*\|\s*|\s+&\s+|\s+@\s+|\s+AT\s+|\s+AND\s+/i
    )
    .map(
      (part) =>
        part.trim()
    )
    .filter(
      Boolean
    )
}


function intersectionDescriptionMatches({
  description,
  streetA,
  streetB,
}) {
  const parts =
    splitIntersectionDescription(
      description
    )


  if (
    parts.length <
      2
  ) {
    // FAIL CLOSED: a description mentioning both roads does not
    // prove that these roads actually intersect at this point.
    return false
  }


  for (
    let aIndex =
      0;
    aIndex <
      parts.length;
    aIndex++
  ) {
    for (
      let bIndex =
        0;
      bIndex <
        parts.length;
      bIndex++
    ) {
      if (
        aIndex ===
          bIndex
      ) {
        continue
      }


      if (
        streetNamesMatch(
          parts[aIndex],
          streetA
        ) &&
        streetNamesMatch(
          parts[bIndex],
          streetB
        )
      ) {
        return true
      }
    }
  }


  return false
}


function textContainsStreetCore(
  text,
  requested
) {
  const haystack =
    streetWords(
      text
    )


  const requestedParts =
    getStreetParts(
      requested
    )


  if (
    requestedParts.core.length ===
      0
  ) {
    return false
  }


  return requestedParts.core.every(
    (token) => {
      if (
        token ===
          'saint'
      ) {
        return (
          haystack.includes(
            'saint'
          ) ||
          haystack.includes(
            'st'
          )
        )
      }


      return haystack.includes(
        token
      )
    }
  )
}


function nominatimResultMatchesIntersection(
  item,
  streetA,
  streetB
) {
  const text =
    (
      item?.display_name ||
      item?.name ||
      ''
    )


  return (
    textContainsStreetCore(
      text,
      streetA
    ) &&
    textContainsStreetCore(
      text,
      streetB
    )
  )
}


async function searchNominatimIntersection({
  streetA,
  streetB,
  searchOptions,
  signal,
}) {
  const deadline =
    Date.now() +
    8000


  const fallbackStreetA =
    getIntersectionStreetSearch(
      streetA
    )
      .name


  const fallbackStreetB =
    getIntersectionStreetSearch(
      streetB
    )
      .name


  const queries = [
    `${fallbackStreetA} & ${fallbackStreetB}`,
    `${fallbackStreetA} and ${fallbackStreetB}`,
    `${fallbackStreetA} at ${fallbackStreetB}`,
  ]


  for (
    const query
    of queries
  ) {
    if (
      remainingTime(
        deadline,
        0
      ) <=
        0
    ) {
      break
    }


    try {
      const params =
        makeNominatimParams({
          ...searchOptions,

          query,
        })


      const results =
        await waitForSearch({
          promise:
            fetchNominatim(
              params,
              {
                deadline,
              }
            ),

          deadline,

          signal,
        })


      const elements =
        results
          .filter(
            (item) =>
              Number.isFinite(
                Number(
                  item?.lon
                )
              ) &&
              Number.isFinite(
                Number(
                  item?.lat
                )
              ) &&
              nominatimResultMatchesIntersection(
                item,
                streetA,
                streetB
              )
          )
          .slice(
            0,
            6
          )
          .map(
            (
              item,
              index
            ) => ({
              type:
                'node',

              id:
                (
                  item.osm_id ||
                  item.place_id ||
                  index
                ),

              lon:
                Number(
                  item.lon
                ),

              lat:
                Number(
                  item.lat
                ),
            })
          )


      if (
        elements.length >
          0
      ) {
        return elements
      }
    }
    catch (
      error
    ) {
      if (
        error?.name ===
          'AbortError'
      ) {
        throw error
      }


      console.warn(
        'LOCATION SEARCH · NOMINATIM INTERSECTION ATTEMPT FAILED:',
        query,
        String(
          error?.message ||
          error
        )
      )
    }
  }


  return []
}


// Accept only descriptions that explicitly identify BOTH crossing roads.
// A nearby POI or a text match on one road is not an intersection.
function validatedCityIntersection(feature, streetA, streetB) {
  const attributes = feature?.attributes || {}
  const description = String(attributes.INTERSECTION_DESC || '')
  const lon = Number(attributes.LONGITUDE ?? feature?.geometry?.x)
  const lat = Number(attributes.LATITUDE ?? feature?.geometry?.y)

  if (!intersectionDescriptionMatches({ description, streetA, streetB }) ||
      !Number.isFinite(lon) || !Number.isFinite(lat) ||
      lon < TORONTO_SEARCH_BOUNDS.west || lon > TORONTO_SEARCH_BOUNDS.east ||
      lat < TORONTO_SEARCH_BOUNDS.south || lat > TORONTO_SEARCH_BOUNDS.north) {
    return null
  }

  return {
    type: 'node',
    id: `toronto-${attributes.INTERSECTION_ID ?? attributes.OBJECTID}`,
    lon,
    lat,
    description,
    verifiedBy: 'toronto-centreline-intersection',
  }
}

async function searchTorontoIntersection({ streetA, streetB, deadline }) {
  const termsA = intersectionSearchTerms(streetA)
  const termsB = intersectionSearchTerms(streetB)
  if (!termsA.length || !termsB.length) return []

  const cacheKey = `toronto-intersection-v2:${[streetA, streetB]
    .map((s) => cleanIntersectionStreet(s).toLowerCase()).sort().join('|')}`
  const cached = getLocationCache(cacheKey)
  if (cached !== null) return cached
  const existing = locationSearchInFlight.get(cacheKey)
  if (existing) return existing

  const request = (async () => {
    // Official GIS data is authoritative. Search both road names, including
    // case-insensitive SQL variants, then VERIFY the individual road names.
    const words = [...new Set([...termsA, ...termsB])]
    const clauses = words.map((term) =>
      `UPPER(INTERSECTION_DESC) LIKE '%${escapeArcSqlText(term)}%'`
    ).join(' AND ')
    const simpleClauses = words.map((term) =>
      `INTERSECTION_DESC LIKE '%${escapeArcSqlText(term)}%'`
    ).join(' AND ')

    for (const endpoint of TORONTO_INTERSECTION_ENDPOINTS) {
      for (const where of [clauses, simpleClauses]) {
        if (remainingTime(deadline, 0) < 500) break
        const params = new URLSearchParams({
          where,
          outFields: 'INTERSECTION_ID,OBJECTID,INTERSECTION_DESC,LONGITUDE,LATITUDE',
          returnGeometry: 'true',
          outSR: '4326',
          resultRecordCount: '300',
          f: 'json',
        })
        try {
          const response = await fetch(`${endpoint}?${params}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'ELPPA-Geographic/1.0' },
            signal: AbortSignal.timeout(Math.max(1, Math.min(3200, remainingTime(deadline, 3200)))),
          })
          if (!response.ok) throw new Error(`City GIS HTTP ${response.status}`)
          const payload = await response.json()
          if (payload?.error) throw new Error(payload.error.message || 'City GIS query error')
          const results = (Array.isArray(payload?.features) ? payload.features : [])
            .map((feature) => validatedCityIntersection(feature, streetA, streetB))
            .filter(Boolean)
            .slice(0, 6)
          if (results.length) {
            setLocationCache(cacheKey, results)
            return results
          }
        } catch (error) {
          console.warn('LOCATION SEARCH · CITY INTERSECTION ATTEMPT:', String(error?.message || error))
        }
      }
    }
    // Do not cache a failed official lookup. It may be temporary.
    return []
  })()

  locationSearchInFlight.set(cacheKey, request)
  try { return await request }
  finally { locationSearchInFlight.delete(cacheKey) }
}


// Verify an intersection from the independently hosted Toronto Centreline copy.
// The source geometry is MULTIPOINT, with geographic (longitude, latitude)
// coordinates. We never accept text-only places or a fuzzy geocode.
async function searchHostedTorontoIntersection({ streetA, streetB, deadline }) {
  const termsA = intersectionSearchTerms(streetA)
  const termsB = intersectionSearchTerms(streetB)
  if (!termsA.length || !termsB.length) return []

  const cacheKey = `toronto-hosted-crossing:${[streetA,streetB].map(s => cleanIntersectionStreet(s).toLowerCase()).sort().join('|')}`
  const cached = getLocationCache(cacheKey)
  if (cached !== null) return cached
  const existing = locationSearchInFlight.get(cacheKey)
  if (existing) return existing

  const request = (async () => {
    // Query candidate point FEATURES using both street-name cores, but
    // only accept results whose separate road names match the request.
    const allTerms = [...new Set([...termsA, ...termsB])]
    const where = allTerms.map(term =>
      `UPPER(INTERSE6) LIKE '%${escapeArcSqlText(term)}%'`
    ).join(' AND ')
    const params = new URLSearchParams({
      where,
      outFields: 'FID,INTERSE6',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '200',
      f: 'json',
    })
    const response = await fetch(`${TORONTO_HOSTED_INTERSECTION_ENDPOINT}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'ELPPA-Geographic/1.0' },
      signal: AbortSignal.timeout(Math.max(1, Math.min(6000, remainingTime(deadline, 6000)))),
    })
    if (!response.ok) throw new Error(`Hosted Toronto intersections HTTP ${response.status}`)
    const payload = await response.json()
    if (payload?.error) throw new Error(payload.error.message || 'Hosted Toronto intersections GIS error')

    const points = (Array.isArray(payload?.features) ? payload.features : []).flatMap(feature => {
      const description = String(feature?.attributes?.INTERSE6 || '')
      if (!intersectionDescriptionMatches({ description, streetA, streetB })) return []
      const geometry = feature?.geometry || {}
      const candidates = Array.isArray(geometry.points) ? geometry.points
        : Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))
          ? [[geometry.x,geometry.y]] : []
      return candidates.filter(pair => Array.isArray(pair) && pair.length >= 2)
        .map((pair,index) => ({
          type: 'node', id: `hosted-toronto-${feature.attributes?.FID ?? 'unknown'}-${index}`,
          lon: Number(pair[0]), lat: Number(pair[1]),
          description, verifiedBy: 'toronto-hosted-centreline-intersection',
        }))
        .filter(node => Number.isFinite(node.lon) && Number.isFinite(node.lat) &&
          node.lon >= TORONTO_SEARCH_BOUNDS.west && node.lon <= TORONTO_SEARCH_BOUNDS.east &&
          node.lat >= TORONTO_SEARCH_BOUNDS.south && node.lat <= TORONTO_SEARCH_BOUNDS.north)
    }).slice(0,6)
    if (points.length) setLocationCache(cacheKey,points)
    return points
  })()
  locationSearchInFlight.set(cacheKey, request)
  try { return await request }
  finally { locationSearchInFlight.delete(cacheKey) }
}

// Second independent provider: only its actual STREET INTERSECTION feature
// type is allowed. Generic address/POI matches are rejected even if the
// label happens to mention both street names.
async function searchArcgisVerifiedIntersection({ streetA, streetB, deadline }) {
  const searchA = getIntersectionStreetSearch(streetA).name
  const searchB = getIntersectionStreetSearch(streetB).name
  for (const [a, b] of [[searchA, searchB], [searchB, searchA]]) {
    if (remainingTime(deadline, 0) < 500) break
    const params = new URLSearchParams({
      SingleLine: `${a} & ${b}, Toronto, Ontario, Canada`,
      outFields: 'Addr_type,City,Region,Country',
      maxLocations: '6',
      f: 'json',
    })
    try {
      const response = await fetch(`${ARCGIS_GEOCODER_ENDPOINT}?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'ELPPA-Geographic/1.0' },
        signal: AbortSignal.timeout(Math.max(1, Math.min(3200, remainingTime(deadline, 3200)))),
      })
      if (!response.ok) throw new Error(`ArcGIS HTTP ${response.status}`)
      const payload = await response.json()
      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
      const verified = candidates.flatMap((candidate, index) => {
        const attributeType = String(candidate?.attributes?.Addr_type || '')
        const address = String(candidate?.address || '')
        const lon = Number(candidate?.location?.x)
        const lat = Number(candidate?.location?.y)
        const score = Number(candidate?.score)
        // Hard gate: ArcGIS must explicitly classify it as a street intersection.
        if (attributeType.toLowerCase() !== 'streetint' || score < 90 ||
            !intersectionDescriptionMatches({ description: address.split(/,\s*Toronto/i)[0], streetA, streetB }) ||
            !Number.isFinite(lon) || !Number.isFinite(lat) ||
            lon < TORONTO_SEARCH_BOUNDS.west || lon > TORONTO_SEARCH_BOUNDS.east ||
            lat < TORONTO_SEARCH_BOUNDS.south || lat > TORONTO_SEARCH_BOUNDS.north) return []
        return [{ type: 'node', id: `arcgis-intersection-${index}`, lon, lat,
          description: address, verifiedBy: 'arcgis-street-intersection' }]
      })
      if (verified.length) return verified
    } catch (error) {
      console.warn('LOCATION SEARCH · ARCGIS INTERSECTION ATTEMPT:', String(error?.message || error))
    }
  }
  return []
}


function makeOverpassStreetClauses(
  search,
  bbox
) {
  const nameRegex =
    escapeOverpassString(
      makeStreetRegex(
        search.name
      )
    )


  const clauses =
    [
      (
        '  way\n' +
        '    ["highway"]\n' +
        `    ["name"~"${nameRegex}",i]\n` +
        `    (${bbox});`
      ),
    ]


  if (
    search.refRegex
  ) {
    clauses.push(
      (
        '  way\n' +
        '    ["highway"]\n' +
        `    ["ref"~"${escapeOverpassString(search.refRegex)}",i]\n` +
        `    (${bbox});`
      )
    )
  }


  return clauses.join(
    '\n\n'
  )
}


function streetWayMatchesSearch(
  way,
  search
) {
  if (
    streetNamesMatch(
      way?.tags?.name,
      search.name
    )
  ) {
    return true
  }


  if (
    !search.refRegex
  ) {
    return false
  }


  const refPattern =
    new RegExp(
      search.refRegex,
      'i'
    )


  return String(
    way?.tags?.ref ||
    ''
  )
    .split(
      /[;,]/
    )
    .some(
      (ref) =>
        refPattern.test(
          ref.trim()
        )
    )
}


function escapeOverpassString(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /\\/g,
      '\\\\'
    )
    .replace(
      /"/g,
      '\\"'
    )
}


async function fetchOverpass(
  query,
  {
    deadline =
      null,
  } =
    {}
) {
  const cacheKey =
    (
      'overpass:' +
      query
    )


  const cached =
    getLocationCache(
      cacheKey
    )


  if (
    cached !==
    null
  ) {
    return cached
  }


  const existing =
    locationSearchInFlight.get(
      cacheKey
    )


  if (
    existing
  ) {
    return existing
  }


  const request =
    (
      async () => {
        let lastError =
          null


        for (
          const endpoint
          of OVERPASS_ENDPOINTS
        ) {
          try {
            const attemptTimeout =
              Math.min(
                OVERPASS_ATTEMPT_MAX_MS,
                remainingTime(
                  deadline,
                  OVERPASS_ATTEMPT_MAX_MS
                )
              )


            if (
              attemptTimeout <=
                0
            ) {
              break
            }


            const response =
              await fetch(
                endpoint,
                {
                  method:
                    'POST',

                  headers: {
                    Accept:
                      'application/json',

                    'Content-Type':
                      'application/x-www-form-urlencoded; charset=UTF-8',

                    'User-Agent':
                      'ELPPA-Geographic/1.0 (Toronto Geographic)',
                  },

                  body:
                    new URLSearchParams({
                      data:
                        query,
                    })
                      .toString(),

                  signal:
                    AbortSignal.timeout(
                      Math.max(
                        1,
                        attemptTimeout
                      )
                    ),
                }
              )


            if (
              !response.ok
            ) {
              throw new Error(
                `OVERPASS ${response.status}`
              )
            }


            const data =
              await response.json()


            const normalized = {
              ...data,

              elements:
                Array.isArray(
                  data?.elements
                )
                  ? data.elements
                  : [],
            }


            setLocationCache(
              cacheKey,
              normalized
            )


            return normalized
          }
          catch (
            error
          ) {
            lastError =
              error

            console.warn(
              'LOCATION SEARCH · OVERPASS ENDPOINT FAILED:',
              endpoint,
              String(
                error?.message ||
                error
              )
            )
          }
        }


        throw (
          lastError ||
          new Error(
            'OVERPASS UNAVAILABLE'
          )
        )
      }
    )()


  locationSearchInFlight.set(
    cacheKey,
    request
  )


  try {
    return await request
  }
  finally {
    locationSearchInFlight.delete(
      cacheKey
    )
  }
}


function normalizeStreetForMatch(
  value
) {
  const parts =
    getStreetParts(
      value
    )


  return {
    core:
      parts.coreText,

    direction:
      parts.direction,

    streetType:
      parts.streetType,
  }
}


function streetNamesMatch(
  actual,
  requested
) {
  const actualParts =
    normalizeStreetForMatch(
      actual
    )


  const requestedParts =
    normalizeStreetForMatch(
      requested
    )


  if (
    !actualParts.core ||
    !requestedParts.core ||
    actualParts.core !==
      requestedParts.core
  ) {
    return false
  }


  // E/W/N/S is part of the street identity when the source provides it.
  // "W" and "West" normalize to the same value. If the requested street
  // specifies a direction and the source also specifies one, they must match.
  if (
    requestedParts.direction &&
    actualParts.direction &&
    requestedParts.direction !==
      actualParts.direction
  ) {
    return false
  }


  // If both source and query specify a street type, it must agree.
  // WOODBINE ROAD is not WOODBINE AVENUE.
  if (
    requestedParts.streetType &&
    actualParts.streetType &&
    requestedParts.streetType !== actualParts.streetType
  ) {
    return false
  }

  return true
}


function lineSegmentIntersection({
  a1,
  a2,
  b1,
  b2,
}) {
  const x1 =
    Number(
      a1.lon
    )

  const y1 =
    Number(
      a1.lat
    )

  const x2 =
    Number(
      a2.lon
    )

  const y2 =
    Number(
      a2.lat
    )

  const x3 =
    Number(
      b1.lon
    )

  const y3 =
    Number(
      b1.lat
    )

  const x4 =
    Number(
      b2.lon
    )

  const y4 =
    Number(
      b2.lat
    )


  const denominator =
    (
      (x1 - x2) *
        (y3 - y4) -
      (y1 - y2) *
        (x3 - x4)
    )


  if (
    !Number.isFinite(
      denominator
    ) ||
    Math.abs(
      denominator
    ) <
      1e-12
  ) {
    return null
  }


  const t =
    (
      (
        (x1 - x3) *
          (y3 - y4) -
        (y1 - y3) *
          (x3 - x4)
      ) /
      denominator
    )


  const u =
    (
      -(
        (x1 - x2) *
          (y1 - y3) -
        (y1 - y2) *
          (x1 - x3)
      ) /
      denominator
    )


  const tolerance =
    1e-8


  if (
    t <
      -tolerance ||
    t >
      1 +
      tolerance ||
    u <
      -tolerance ||
    u >
      1 +
      tolerance
  ) {
    return null
  }


  return {
    lon:
      x1 +
      t *
      (x2 - x1),

    lat:
      y1 +
      t *
      (y2 - y1),
  }
}


function distanceMeters(
  a,
  b
) {
  const latitude =
    (
      (
        Number(
          a.lat
        ) +
        Number(
          b.lat
        )
      ) /
      2
    ) *
    Math.PI /
    180


  const dx =
    (
      Number(
        a.lon
      ) -
      Number(
        b.lon
      )
    ) *
    111320 *
    Math.cos(
      latitude
    )


  const dy =
    (
      Number(
        a.lat
      ) -
      Number(
        b.lat
      )
    ) *
    110540


  return Math.sqrt(
    dx * dx +
    dy * dy
  )
}


function dedupeIntersectionPoints(
  points
) {
  const unique =
    []


  for (
    const point
    of points
  ) {
    if (
      !unique.some(
        (existing) =>
          distanceMeters(
            existing,
            point
          ) <
          20
      )
    ) {
      unique.push(
        point
      )
    }
  }


  return unique
}


async function searchOverpassIntersection({
  streetA,
  streetB,
  west,
  north,
  east,
  south,
  deadline,
}) {
  const bounds = {
    west:
      west ??
      TORONTO_SEARCH_BOUNDS.west,

    north:
      north ??
      TORONTO_SEARCH_BOUNDS.north,

    east:
      east ??
      TORONTO_SEARCH_BOUNDS.east,

    south:
      south ??
      TORONTO_SEARCH_BOUNDS.south,
  }


  const streetASearch =
    getIntersectionStreetSearch(
      streetA
    )


  const streetBSearch =
    getIntersectionStreetSearch(
      streetB
    )


  const bbox =
    [
      bounds.south,
      bounds.west,
      bounds.north,
      bounds.east,
    ]
      .join(',')


  const streetAClauses =
    makeOverpassStreetClauses(
      streetASearch,
      bbox
    )


  const streetBClauses =
    makeOverpassStreetClauses(
      streetBSearch,
      bbox
    )


  const query =
    `
[out:json][timeout:4];

(
${streetAClauses}

${streetBClauses}
);

out tags geom;
    `.trim()


  const data =
    await fetchOverpass(
      query,
      {
        deadline,
      }
    )


  const ways =
    (
      Array.isArray(
        data?.elements
      )
        ? data.elements
        : []
    )
      .filter(
        (item) =>
          item?.type ===
            'way' &&
          Array.isArray(
            item?.geometry
          ) &&
          item.geometry.length >=
            2
      )


  const streetAWays =
    ways.filter(
      (way) =>
        streetWayMatchesSearch(
          way,
          streetASearch
        )
    )


  const streetBWays =
    ways.filter(
      (way) =>
        streetWayMatchesSearch(
          way,
          streetBSearch
        )
    )


  const points =
    []


  for (
    const wayA
    of streetAWays
  ) {
    for (
      let aIndex =
        0;
      aIndex <
        wayA.geometry.length -
        1;
      aIndex++
    ) {
      const a1 =
        wayA.geometry[
          aIndex
        ]

      const a2 =
        wayA.geometry[
          aIndex +
          1
        ]


      for (
        const wayB
        of streetBWays
      ) {
        for (
          let bIndex =
            0;
          bIndex <
            wayB.geometry.length -
            1;
          bIndex++
        ) {
          const b1 =
            wayB.geometry[
              bIndex
            ]

          const b2 =
            wayB.geometry[
              bIndex +
              1
            ]


          const intersection =
            lineSegmentIntersection({
              a1,
              a2,
              b1,
              b2,
            })


          if (
            intersection
          ) {
            points.push(
              intersection
            )
          }
        }
      }
    }
  }


  return dedupeIntersectionPoints(
    points
  )
    .slice(
      0,
      6
    )
    .map(
      (
        point,
        index
      ) => ({
        type:
          'node',

        id:
          (
            'geometry-' +
            index +
            '-' +
            Math.round(
              point.lat *
              1e6
            ) +
            '-' +
            Math.round(
              point.lon *
              1e6
            )
          ),

        lon:
          Number(
            point.lon
          ),

        lat:
          Number(
            point.lat
          ),
      })
    )
}

function makeNominatimParams({
  query,
  querySuffix =
    '',
  countryCode =
    '',
  west =
    null,
  north =
    null,
  east =
    null,
  south =
    null,
  bounded =
    true,
  limit =
    8,
}) {
  const values = {
    q:
      querySuffix
        ? `${query}, ${querySuffix}`
        : query,

    format:
      'jsonv2',

    addressdetails:
      '1',

    namedetails:
      '1',

    limit:
      String(
        Math.min(
          10,
          Math.max(
            1,
            Number(
              limit
            ) ||
              8
          )
        )
      ),
  }


  if (
    countryCode
  ) {
    values.countrycodes =
      countryCode
  }


  if (
    bounded &&
    west !==
      null &&
    north !==
      null &&
    east !==
      null &&
    south !==
      null
  ) {
    values.viewbox =
      (
        `${west},` +
        `${north},` +
        `${east},` +
        `${south}`
      )


    values.bounded =
      '1'
  }


  return new URLSearchParams(
    values
  )
}


export function locationSearchApi() {
  return {
    name:
      'geographic-location-search-api',


    configureServer(
      server
    ) {
      server.middlewares.use(
        async (
          req,
          res,
          next
        ) => {
          let url


          try {
            url =
              new URL(
                req.url ||
                  '/',
                'http://localhost'
              )
          }
          catch {
            next()

            return
          }


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


          if (
            url.pathname ===
            '/api/geographic/location-search/place'
          ) {
            try {
              const query =
                String(
                  url.searchParams.get(
                    'q'
                  ) ||
                    ''
                )
                  .trim()


              if (
                !query
              ) {
                sendLocationJson(
                  res,
                  400,
                  {
                    ok:
                      false,

                    error:
                      'Missing q',
                  }
                )

                return
              }


              const params =
                makeNominatimParams({
                  query,

                  querySuffix:
                    String(
                      url.searchParams.get(
                        'querySuffix'
                      ) ||
                        ''
                    )
                      .trim(),

                  countryCode:
                    String(
                      url.searchParams.get(
                        'countryCode'
                      ) ||
                        ''
                    )
                      .trim(),

                  west:
                    finiteNumber(
                      url.searchParams.get(
                        'west'
                      )
                    ),

                  north:
                    finiteNumber(
                      url.searchParams.get(
                        'north'
                      )
                    ),

                  east:
                    finiteNumber(
                      url.searchParams.get(
                        'east'
                      )
                    ),

                  south:
                    finiteNumber(
                      url.searchParams.get(
                        'south'
                      )
                    ),

                  bounded:
                    url.searchParams.get(
                      'bounded'
                    ) ===
                      '1',

                  limit:
                    url.searchParams.get(
                      'limit'
                    ) ||
                      8,
                })


              const results =
                await fetchNominatim(
                  params
                )


              sendLocationJson(
                res,
                200,
                {
                  ok:
                    true,

                  results,
                }
              )


              return
            }
            catch (
              error
            ) {
              console.error(
                'LOCATION SEARCH · PLACE FAILED:',
                error
              )


              sendLocationJson(
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


              return
            }
          }


          if (
            url.pathname ===
            '/api/geographic/location-search/intersection'
          ) {
            const requestController =
              new AbortController()


            const cancelRequest = () =>
              requestController.abort()


            req.once(
              'aborted',
              cancelRequest
            )


            res.once(
              'finish',
              () =>
                req.off(
                  'aborted',
                  cancelRequest
                )
            )


            try {
              const streetA =
                cleanIntersectionStreet(
                  url.searchParams.get(
                    'streetA'
                  )
                )


              const streetB =
                cleanIntersectionStreet(
                  url.searchParams.get(
                    'streetB'
                  )
                )


              if (
                !streetA ||
                !streetB
              ) {
                sendLocationJson(
                  res,
                  400,
                  {
                    ok:
                      false,

                    error:
                      'Invalid intersection parameters',
                  }
                )

                return
              }


              const searchOptions = {
                querySuffix:
                  'Toronto, Ontario, Canada',

                countryCode:
                  'ca',

                west:
                  finiteNumber(
                    url.searchParams.get(
                      'west'
                    )
                  ),

                north:
                  finiteNumber(
                    url.searchParams.get(
                      'north'
                    )
                  ),

                east:
                  finiteNumber(
                    url.searchParams.get(
                      'east'
                    )
                  ),

                south:
                  finiteNumber(
                    url.searchParams.get(
                      'south'
                    )
                  ),

                bounded:
                  true,

                limit:
                  6,
              }


              const intersectionCacheKey =
                (
                  'intersection-final:' +
                  [
                    cleanIntersectionStreet(
                      streetA
                    )
                      .toLowerCase(),

                    cleanIntersectionStreet(
                      streetB
                    )
                      .toLowerCase(),
                  ]
                    .sort()
                    .join('|')
                )


              const cachedIntersection =
                getLocationCache(
                  intersectionCacheKey
                )


              if (
                cachedIntersection !==
                  null
              ) {
                sendLocationJson(
                  res,
                  200,
                  {
                    ok:
                      true,

                    elements:
                      cachedIntersection,
                  }
                )

                return
              }


              let elements =
                []


              // --------------------------------------------------
              // 1. ARCGIS WORLD GEOCODER (STRICT STREETINT ONLY)
              // --------------------------------------------------
              // Fast provider first. City GIS often times out; don't hold
              // the entire lookup hostage to it before trying other sources.
              try {
                const deadline = Date.now() + 6000
                elements = await waitForSearch({
                  promise: searchArcgisVerifiedIntersection({streetA,streetB,deadline}),
                  deadline, signal: requestController.signal,
                })
              } catch (error) {
                if (error?.name === 'AbortError') throw error
                console.warn('LOCATION SEARCH · VERIFIED ARCGIS FAILED:', String(error?.message || error))
              }

              // --------------------------------------------------
              // 2. TORONTO CENTRELINE HOSTED COPY (VERIFIED GEOMETRY)
              // --------------------------------------------------
              if (elements.length === 0) {
                try {
                  const deadline = Date.now() + 6500
                  elements = await waitForSearch({
                    promise: searchHostedTorontoIntersection({streetA,streetB,deadline}),
                    deadline, signal: requestController.signal,
                  })
                } catch (error) {
                  if (error?.name === 'AbortError') throw error
                  console.warn('LOCATION SEARCH · HOSTED TORONTO INTERSECTION FAILED:', String(error?.message || error))
                }
              }

              // --------------------------------------------------
              // 3. TORONTO OFFICIAL GIS (STRICT VERIFIED INTERSECTION)
              // --------------------------------------------------
              if (elements.length === 0) {
                try {
                  const deadline = Date.now() + 6500
                  elements = await waitForSearch({
                    promise: searchTorontoIntersection({streetA,streetB,deadline}),
                    deadline, signal: requestController.signal,
                  })
                } catch (error) {
                  if (error?.name === 'AbortError') throw error
                  console.warn('LOCATION SEARCH · TORONTO INTERSECTION FAILED:', String(error?.message || error))
                }
              }

              // --------------------------------------------------
              // 4. OVERPASS VERIFIED CROSSING GEOMETRY FALLBACK
              // --------------------------------------------------

              if (
                elements.length ===
                  0
              ) {
                try {
                  const overpassDeadline =
                    Date.now() +
                    5000


                  elements =
                    await waitForSearch({
                      promise:
                        searchOverpassIntersection({
                          streetA,
                          streetB,

                          west:
                            searchOptions.west,

                          north:
                            searchOptions.north,

                          east:
                            searchOptions.east,

                          south:
                            searchOptions.south,

                          deadline:
                            overpassDeadline,
                        }),

                      deadline:
                        overpassDeadline,

                      signal:
                        requestController.signal,
                    })
                }
                catch (
                  error
                ) {
                  if (
                    error?.name ===
                      'AbortError'
                  ) {
                    throw error
                  }


                  console.warn(
                    'LOCATION SEARCH · OVERPASS INTERSECTION FAILED:',
                    String(
                      error?.message ||
                      error
                    )
                  )
                }
              }


              if (
                elements.length >
                  0
              ) {
                setLocationCache(
                  intersectionCacheKey,
                  elements
                )
              }


              // External lookup failures are not a broken API response.
              // Return an empty successful result so Admin can say
              // INTERSECTION NOT FOUND instead of throwing a 502.
              sendLocationJson(
                res,
                200,
                {
                  ok:
                    true,

                  elements,
                }
              )


              return
            }
            catch (
              error
            ) {
              if (
                requestController.signal.aborted
              ) {
                return
              }


              console.error(
                'LOCATION SEARCH · INTERSECTION FAILED:',
                error
              )


              sendLocationJson(
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


              return
            }
          }


          next()
        }
      )
    },
  }
}


function remainingTime(
  deadline,
  fallback
) {
  return Number.isFinite(
    deadline
  )
    ? Math.max(
        0,
        deadline -
          Date.now()
      )
    : fallback
}


function waitForSearch({
  promise,
  deadline,
  signal,
}) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let settled =
        false


      const finish = (
        callback,
        value
      ) => {
        if (
          settled
        ) {
          return
        }


        settled =
          true


        clearTimeout(
          timeoutId
        )


        signal?.removeEventListener(
          'abort',
          abort
        )


        callback(
          value
        )
      }


      const abort = () => {
        const error =
          new Error(
            'LOCATION SEARCH CANCELLED'
          )


        error.name =
          'AbortError'


        finish(
          reject,
          error
        )
      }


      const timeoutId =
        setTimeout(
          () => {
            finish(
              reject,
              new Error(
                'INTERSECTION SEARCH TIME BUDGET EXCEEDED'
              )
            )
          },
          Math.max(
            1,
            remainingTime(
              deadline,
              INTERSECTION_TIME_BUDGET_MS
            )
          )
        )


      if (
        signal?.aborted
      ) {
        abort()

        return
      }


      signal?.addEventListener(
        'abort',
        abort,
        {
          once:
            true,
        }
      )


      promise.then(
        (value) =>
          finish(
            resolve,
            value
          ),
        (error) =>
          finish(
            reject,
            error
          )
      )
    }
  )
}
