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
//   Overpass for true street intersections
//   Nominatim for places and intersection fallback
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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

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
  params
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
                15000
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


            await sleep(
              retryDelay
            )


            lastNominatimRequestAt =
              Date.now()


            response =
              await fetch(
                requestUrl,
                requestOptions
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
  query
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
                      15000
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


  const streetARegex =
    escapeOverpassString(
      makeStreetRegex(
        streetA
      )
    )


  const streetBRegex =
    escapeOverpassString(
      makeStreetRegex(
        streetB
      )
    )


  const bbox =
    [
      bounds.south,
      bounds.west,
      bounds.north,
      bounds.east,
    ]
      .join(',')


  const query =
    `
[out:json][timeout:15];

(
  way
    ["highway"]
    ["name"~"${streetARegex}",i]
    (${bbox});

  way
    ["highway"]
    ["name"~"${streetBRegex}",i]
    (${bbox});
);

out tags geom;
    `.trim()


  const data =
    await fetchOverpass(
      query
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
        streetNamesMatch(
          way?.tags?.name,
          streetA
        )
    )


  const streetBWays =
    ways.filter(
      (way) =>
        streetNamesMatch(
          way?.tags?.name,
          streetB
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
                  await searchOverpassIntersection({
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


              if (
                elements.length ===
                0
              ) {
                const ampersandParams =
                  makeNominatimParams({
                    ...searchOptions,

                    query:
                      `${streetA} & ${streetB}`,
                  })


                let results =
                  await fetchNominatim(
                    ampersandParams
                  )


                if (
                  results.length ===
                  0
                ) {
                  const andParams =
                    makeNominatimParams({
                      ...searchOptions,

                      query:
                        `${streetA} and ${streetB}`,
                    })


                  results =
                    await fetchNominatim(
                      andParams
                    )
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