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
//   Nominatim
//
// Requests are serialized, spaced, cached, and deduplicated so
// the browser never calls Nominatim directly.
//
// ============================================================

const LOCATION_CACHE_TTL_MS =
  24 * 60 * 60 * 1000

const LOCATION_CACHE_MAX =
  500

const NOMINATIM_MIN_INTERVAL_MS =
  1100

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
                      )
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