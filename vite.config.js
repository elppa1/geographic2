import {
  defineConfig,
  loadEnv,
} from 'vite'

import react from '@vitejs/plugin-react'

import {
  timingSafeEqual,
} from 'node:crypto'

import {
  cleanToronto1995Tiles,
} from './server/tiles/toronto/clean1995.js'

import {
  enhanceHistoricalTiles,
} from './server/tiles/enhanceRaster.js'

import {
  createGeographicProxy,
} from './server/proxy/index.js'

import {
  tpsWebhookFeed,
} from './server/feeds/toronto/tpsWebhook.js'

import {
  ttcAlertsFeed,
} from './server/feeds/toronto/ttcAlerts.js'

import {
  liveNewsroomFeed,
} from './server/feeds/toronto/liveNewsroom.js'

import {
  locationSearchApi as serverLocationSearchApi,
} from './server/locationSearch.js'

import {
  nowServingFeed,
} from './server/feeds/toronto/nowServing.js'


// ============================================================
// ADMIN AUTH
// ============================================================

function safeEqual(
  actual,
  expected
) {
  const actualBuffer =
    Buffer.from(
      String(
        actual ||
        ''
      )
    )


  const expectedBuffer =
    Buffer.from(
      String(
        expected ||
        ''
      )
    )


  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
    return false
  }


  return timingSafeEqual(
    actualBuffer,
    expectedBuffer
  )
}


function getBasicCredentials(
  req
) {
  const authorization =
    String(
      req.headers.authorization ||
      ''
    )


  if (
    !authorization.startsWith(
      'Basic '
    )
  ) {
    return null
  }


  try {
    const decoded =
      Buffer.from(
        authorization.slice(
          6
        ),
        'base64'
      )
        .toString(
          'utf8'
        )


    const separatorIndex =
      decoded.indexOf(
        ':'
      )


    if (
      separatorIndex <
      0
    ) {
      return null
    }


    return {
      username:
        decoded.slice(
          0,
          separatorIndex
        ),

      password:
        decoded.slice(
          separatorIndex +
          1
        ),
    }
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN AUTH HEADER ERROR:',
      error
    )


    return null
  }
}


function requestNeedsAdminAuth(
  req
) {
  let pathname =
    ''


  try {
    pathname =
      new URL(
        req.url ||
        '/',
        'http://localhost'
      )
        .pathname
  }
  catch {
    pathname =
      String(
        req.url ||
        ''
      )
  }


  if (
    pathname ===
      '/admin' ||
    pathname.startsWith(
      '/admin/'
    )
  ) {
    return true
  }


  if (
    pathname.startsWith(
      '/api/geographic/toronto/newsroom/'
    )
  ) {
    return true
  }


  if (
    pathname ===
      '/api/geographic/toronto/police/incoming' &&
    String(
      req.method ||
      'GET'
    )
      .toUpperCase() ===
      'GET'
  ) {
    return true
  }


  return false
}


function adminAuth(
  env
) {
  return {
    name:
      'geographic-admin-auth',


    configureServer(
      server
    ) {
      server.middlewares.use(
        (
          req,
          res,
          next
        ) => {
          if (
            !requestNeedsAdminAuth(
              req
            )
          ) {
            next()

            return
          }


          const expectedUsername =
            String(
              env.GEOGRAPHIC_ADMIN_USER ||
              ''
            )


          const expectedPassword =
            String(
              env.GEOGRAPHIC_ADMIN_PASSWORD ||
              ''
            )


          if (
            !expectedUsername ||
            !expectedPassword
          ) {
            console.error(
              'ADMIN AUTH · GEOGRAPHIC_ADMIN_USER / GEOGRAPHIC_ADMIN_PASSWORD are not configured.'
            )


            res.statusCode =
              503


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.end(
              'Admin access is not configured.'
            )


            return
          }


          const credentials =
            getBasicCredentials(
              req
            )


          const valid =
            credentials &&
            safeEqual(
              credentials.username,
              expectedUsername
            ) &&
            safeEqual(
              credentials.password,
              expectedPassword
            )


          if (
            !valid
          ) {
            res.statusCode =
              401


            res.setHeader(
              'WWW-Authenticate',
              'Basic realm="Toronto Geographic Admin", charset="UTF-8"'
            )


            res.setHeader(
              'Cache-Control',
              'no-store'
            )


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.end(
              'Admin authentication required.'
            )


            return
          }


          next()
        }
      )
    },
  }
}


// ============================================================
// PUBLIC LOCATION SEARCH API
// ============================================================
//
// Browser -> same-origin Vite/Railway endpoint -> Nominatim.
//
// This avoids browser CORS failures and protects the public
// Nominatim service by:
// - serializing upstream requests
// - spacing requests at least 1.1 seconds apart
// - caching repeated searches for 24 hours
// - sharing identical requests already in flight
//
// Intersections use the same geocoder rather than Overpass.
// The endpoint still returns an `elements` array so existing
// SearchControl / Admin search code does not need to change.
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


          let response =
            await fetch(
              requestUrl,
              {
                headers: {
                  Accept:
                    'application/json',

                  'Accept-Language':
                    'en',

                  'User-Agent':
                    'ELPPA-Geographic/1.0',
                },

                signal:
                  AbortSignal.timeout(
                    15000
                  ),
              }
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
                {
                  headers: {
                    Accept:
                      'application/json',

                    'Accept-Language':
                      'en',

                    'User-Agent':
                      'ELPPA-Geographic/1.0',
                  },

                  signal:
                    AbortSignal.timeout(
                      15000
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
  let clean =
    String(
      value ||
      ''
    )
      .trim()
      .replace(
        /^\^/,
        ''
      )
      .replace(
        /\$$/,
        ''
      )


  const streetTypeMarker =
    clean.indexOf(
      '( (Street|'
    )


  if (
    streetTypeMarker >=
    0
  ) {
    clean =
      clean.slice(
        0,
        streetTypeMarker
      )
  }


  clean =
    clean
      .replace(
        /\[ \.\]\+/g,
        ' '
      )
      .replace(
        /\\([.*+?^${}()|[\]\\])/g,
        '$1'
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()


  return clean
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


function locationSearchApi() {
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


              const params =
                makeNominatimParams({
                  query:
                    `${streetA} and ${streetB}`,

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
                })


              const results =
                await fetchNominatim(
                  params
                )


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


export default defineConfig(
  ({
    mode,
  }) => {
    const env =
      loadEnv(
        mode,
        process.cwd(),
        ''
      )


    return {
      plugins: [
        adminAuth(
          env
        ),
        serverLocationSearchApi(),
        react(),
        cleanToronto1995Tiles(),
        enhanceHistoricalTiles(),
        tpsWebhookFeed(),
        ttcAlertsFeed(),
        liveNewsroomFeed(),
        nowServingFeed(),
      ],


      optimizeDeps: {
        exclude: [
          'maplibre-gl',
        ],
      },


      server: {
        allowedHosts: [
          'floating-racks-industrial-submissions.trycloudflare.com',
        ],

        watch: {
          ignored: [
            '**/tools/superres/**',
          ],
        },


        proxy:
          createGeographicProxy(),
      },
    }
  }
)
