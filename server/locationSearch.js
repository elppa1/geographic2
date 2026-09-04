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
//   City of Toronto centreline intersections first
//   Overpass as intersection fallback
//   Nominatim for places and final intersection fallback
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

const TORONTO_INTERSECTION_ENDPOINT =
  'https://gis.toronto.ca/arcgis/rest/services/cot_geospatial/FeatureServer/19/query'

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
      /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl)\b\.?/gi,
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
      /\s+(East|West|North|South|E|W|N|S)$/i
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


  if (
    clean ===
      'east' ||
    clean ===
      'e'
  ) {
    return '(East|E)'
  }


  if (
    clean ===
      'west' ||
    clean ===
      'w'
  ) {
    return '(West|W)'
  }


  if (
    clean ===
      'north' ||
    clean ===
      'n'
  ) {
    return '(North|N)'
  }


  if (
    clean ===
      'south' ||
    clean ===
      's'
  ) {
    return '(South|S)'
  }


  return '(East|West|North|South|E|W|N|S)'
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
      '( (Street|St|Avenue|Ave|Road|Rd|' +
      'Boulevard|Blvd|Drive|Dr|Lane|Ln|' +
      'Court|Ct|Place|Pl))?'
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
          '( (East|West|North|South|E|W|N|S))?'
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


function intersectionLookupToken(
  value
) {
  const search =
    getIntersectionStreetSearch(
      value
    )


  const genericTokens =
    new Set([
      'the',
      'street',
      'st',
      'avenue',
      'ave',
      'road',
      'rd',
      'boulevard',
      'blvd',
      'drive',
      'dr',
      'lane',
      'ln',
      'court',
      'ct',
      'place',
      'pl',
      'way',
      'highway',
      'hwy',
      'route',
      'parkway',
      'expressway',
      'north',
      'south',
      'east',
      'west',
      'n',
      's',
      'e',
      'w',
    ])


  const tokens =
    String(
      search.name ||
      value ||
      ''
    )
      .toLowerCase()
      .match(
        /[a-z0-9]+/g
      ) ||
    []


  const routeNumber =
    tokens.find(
      (token) =>
        /\d/.test(
          token
        )
    )


  if (
    routeNumber
  ) {
    return routeNumber
  }


  const useful =
    tokens.filter(
      (token) =>
        !genericTokens.has(
          token
        )
    )


  const candidates =
    useful.length >
      0
      ? useful
      : tokens


  return candidates
    .slice()
    .sort(
      (
        a,
        b
      ) =>
        b.length -
        a.length
    )[0] ||
    ''
}


async function searchTorontoIntersection({
  streetA,
  streetB,
  deadline,
}) {
  const tokenA =
    intersectionLookupToken(
      streetA
    )


  const tokenB =
    intersectionLookupToken(
      streetB
    )


  if (
    !tokenA ||
    !tokenB
  ) {
    return []
  }


  const cacheKey =
    (
      'toronto-intersection:' +
      tokenA.toLowerCase() +
      '|' +
      tokenB.toLowerCase()
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
        const upperA =
          tokenA.toUpperCase()


        const upperB =
          tokenB.toUpperCase()


        const params =
          new URLSearchParams({
            where:
              (
                `UPPER(INTERSECTION_DESC) LIKE '%${upperA}%'` +
                ' AND ' +
                `UPPER(INTERSECTION_DESC) LIKE '%${upperB}%'`
              ),

            outFields:
              (
                'INTERSECTION_ID,' +
                'INTERSECTION_DESC,' +
                'LONGITUDE,' +
                'LATITUDE'
              ),

            returnGeometry:
              'false',

            resultRecordCount:
              '12',

            f:
              'json',
          })


        const response =
          await fetch(
            (
              TORONTO_INTERSECTION_ENDPOINT +
              '?' +
              params.toString()
            ),
            {
              headers: {
                Accept:
                  'application/json',

                'User-Agent':
                  'ELPPA-Geographic/1.0 (Toronto Geographic)',
              },

              signal:
                AbortSignal.timeout(
                  Math.max(
                    1,
                    Math.min(
                      4000,
                      remainingTime(
                        deadline,
                        4000
                      )
                    )
                  )
                ),
            }
          )


        if (
          !response.ok
        ) {
          throw new Error(
            `TORONTO INTERSECTION ${response.status}`
          )
        }


        const data =
          await response.json()


        if (
          data?.error
        ) {
          throw new Error(
            data.error.message ||
            'TORONTO INTERSECTION QUERY FAILED'
          )
        }


        const elements =
          (
            Array.isArray(
              data?.features
            )
              ? data.features
              : []
          )
            .map(
              (
                feature,
                index
              ) => {
                const attributes =
                  feature?.attributes ||
                  {}


                return {
                  type:
                    'node',

                  id:
                    (
                      attributes.INTERSECTION_ID ||
                      `toronto-${index}`
                    ),

                  lon:
                    Number(
                      attributes.LONGITUDE
                    ),

                  lat:
                    Number(
                      attributes.LATITUDE
                    ),

                  description:
                    attributes.INTERSECTION_DESC ||
                    '',
                }
              }
            )
            .filter(
              (item) =>
                Number.isFinite(
                  item.lon
                ) &&
                Number.isFinite(
                  item.lat
                )
            )
            .slice(
              0,
              6
            )


        setLocationCache(
          cacheKey,
          elements
        )


        return elements
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
  return String(
    value ||
    ''
  )
    .toLowerCase()
    .replace(
      /\./g,
      ''
    )
    .replace(
      /^st\s+/,
      'saint '
    )
    .replace(
      /\s+(east|west|north|south|e|w|n|s)$/,
      ''
    )
    .replace(
      /\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl)$/,
      ''
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


function streetNamesMatch(
  actual,
  requested
) {
  const actualClean =
    normalizeStreetForMatch(
      actual
    )


  const requestedClean =
    normalizeStreetForMatch(
      requested
    )


  if (
    !actualClean ||
    !requestedClean
  ) {
    return false
  }


  return (
    actualClean ===
      requestedClean ||
    actualClean.includes(
      requestedClean
    ) ||
    requestedClean.includes(
      actualClean
    )
  )
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
            const deadline =
              Date.now() +
              INTERSECTION_TIME_BUDGET_MS


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


              let elements =
                []


              try {
                elements =
                  await waitForSearch({
                    promise:
                      searchTorontoIntersection({
                        streetA,
                        streetB,
                        deadline,
                      }),

                    deadline,

                    signal:
                      requestController.signal,
                  })
              }
              catch (
                error
              ) {
                console.warn(
                  'LOCATION SEARCH · TORONTO INTERSECTION FAILED, USING OVERPASS:',
                  String(
                    error?.message ||
                    error
                  )
                )
              }


              if (
                elements.length ===
                0
              ) {
                try {
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

                          deadline,
                        }),

                      deadline,

                      signal:
                        requestController.signal,
                    })
                }
                catch (
                  error
                ) {
                  console.warn(
                    'LOCATION SEARCH · OVERPASS INTERSECTION FAILED, USING NOMINATIM:',
                    String(
                      error?.message ||
                      error
                    )
                  )
                }
              }


              if (
                elements.length ===
                0
              ) {
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


                const ampersandParams =
                  makeNominatimParams({
                    ...searchOptions,

                    query:
                      `${fallbackStreetA} & ${fallbackStreetB}`,
                  })


                let results =
                  await waitForSearch({
                    promise:
                      fetchNominatim(
                        ampersandParams,
                        {
                          deadline,
                        }
                      ),

                    deadline,

                    signal:
                      requestController.signal,
                  })


                if (
                  results.length ===
                  0
                ) {
                  const andParams =
                    makeNominatimParams({
                      ...searchOptions,

                      query:
                        `${fallbackStreetA} and ${fallbackStreetB}`,
                    })


                  results =
                    await waitForSearch({
                      promise:
                        fetchNominatim(
                          andParams,
                          {
                            deadline,
                          }
                        ),

                      deadline,

                      signal:
                        requestController.signal,
                    })
                }


                elements =
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
              }


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
