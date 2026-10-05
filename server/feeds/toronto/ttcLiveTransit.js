// LIVE TTC FAST START V8
// LIVE TTC STABILITY V6 · 2026-09-30 · reject empty realtime feeds + deduped arrivals + resilient vehicle retention
import https from 'node:https'
import { inflateRawSync } from 'node:zlib'

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'


const TTC_SURFACE_GTFS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/bd4809dd-e289-4de8-bbde-c5c00dafbf4f/resource/28514055-d011-4ed7-8bb0-97961dfe2b66/download/SurfaceGTFS.zip'

const TTC_FULL_GTFS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC%20Routes%20and%20Schedules%20Data.zip'

const TTC_VEHICLES_URL =
  'https://gtfsrt.ttc.ca/vehicles/position?format=binary'

const TTC_VEHICLES_FALLBACK_URL =
  'https://bustime.ttc.ca/gtfsrt/vehicles'

const TTC_TRIPS_URL =
  'https://gtfsrt.ttc.ca/trips/update?format=binary'

const TTC_TRIPS_FALLBACK_URL =
  'https://bustime.ttc.ca/gtfsrt/trips'

const TTC_PREDICTIONS_URL =
  'https://retro.umoiq.com/service/publicJSONFeed'

const LIVE_TTC_ENDPOINT =
  '/api/geographic/toronto/ttc/live'

const FETCH_TIMEOUT_MS =
  25 * 1000

const REALTIME_FETCH_TIMEOUT_MS =
  8 * 1000

const REALTIME_STALE_FALLBACK_MS =
  3 * 60 * 1000

const STATIC_CACHE_MS =
  6 * 60 * 60 * 1000

const REALTIME_CACHE_MS =
  4 * 1000
const REALTIME_FOCUSED_CACHE_MS =
  2 * 1000
const REALTIME_STALE_IMMEDIATE_MS =
  45 * 1000

const TORONTO_ATTRIBUTION =
  'Contains information licensed under the Open Government Licence - Toronto'

const SUPPORTED_SURFACE_ROUTE_TYPES =
  new Set([
    0,
    3,
  ])


let surfaceCache = null
let surfacePromise = null
let stationsCache = null
let stationsPromise = null

let vehicleCache = null
let vehiclePromise = null
let tripUpdateCache = null
let tripUpdatePromise = null


// ============================================================
// BASIC HELPERS
// ============================================================

function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\u00a0/g,
      ' '
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
      null ||
    value ===
      undefined ||
    value ===
      ''
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


function hexColor(
  value,
  fallback
) {
  const cleaned =
    cleanText(
      value
    )
      .replace(
        /^#/,
        ''
      )
      .toUpperCase()

  return /^[0-9A-F]{6}$/.test(
    cleaned
  )
    ? `#${cleaned}`
    : fallback
}


function readRequestUrl(
  req
) {
  return new URL(
    req.url ||
      '/',
    'http://localhost'
  )
}


function sendJson(
  res,
  statusCode,
  payload,
  {
    cacheControl =
      'no-store',
  } = {}
) {
  res.statusCode =
    statusCode

  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  )

  res.setHeader(
    'Cache-Control',
    cacheControl
  )

  res.end(
    JSON.stringify(
      payload
    )
  )
}


// ============================================================
// HTTP BUFFER FETCH
// ============================================================

function fetchBuffer(
  url,
  redirectCount =
    0,
  timeoutMs =
    FETCH_TIMEOUT_MS
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      if (
        redirectCount >
        5
      ) {
        reject(
          new Error(
            'Too many redirects while fetching TTC data'
          )
        )
        return
      }

      let settled =
        false

      const finishResolve =
        (value) => {
          if (
            settled
          ) {
            return
          }
          settled =
            true
          resolve(
            value
          )
        }

      const finishReject =
        (error) => {
          if (
            settled
          ) {
            return
          }
          settled =
            true
          reject(
            error
          )
        }

      const request =
        https.get(
          url,
          {
            autoSelectFamily:
              true,
            autoSelectFamilyAttemptTimeout:
              1000,
            headers: {
              Accept:
                '*/*',
              'Accept-Encoding':
                'identity',
              'User-Agent':
                'Mozilla/5.0 (compatible; TorontoGeographic/1.0; +https://torontogeographic.ca)',
            },
          },
          (
            response
          ) => {
            const statusCode =
              Number(
                response.statusCode ||
                0
              )

            if (
              [
                301,
                302,
                303,
                307,
                308,
              ].includes(
                statusCode
              ) &&
              response.headers.location
            ) {
              response.resume()

              const nextUrl =
                new URL(
                  response.headers.location,
                  url
                )
                  .toString()

              fetchBuffer(
                nextUrl,
                redirectCount +
                  1,
                timeoutMs
              )
                .then(
                  finishResolve
                )
                .catch(
                  finishReject
                )

              return
            }

            if (
              statusCode <
                200 ||
              statusCode >=
                300
            ) {
              response.resume()
              finishReject(
                new Error(
                  `TTC request failed (${statusCode}) · ${url}`
                )
              )
              return
            }

            const chunks =
              []

            response.on(
              'data',
              (
                chunk
              ) => {
                chunks.push(
                  chunk
                )
              }
            )

            response.on(
              'end',
              () => {
                finishResolve(
                  Buffer.concat(
                    chunks
                  )
                )
              }
            )

            response.on(
              'error',
              finishReject
            )
          }
        )

      const timeoutId =
        setTimeout(
          () => {
            request.destroy(
              new Error(
                `TTC request timed out after ${timeoutMs}ms · ${url}`
              )
            )
          },
          timeoutMs
        )

      request.on(
        'error',
        (
          error
        ) => {
          clearTimeout(
            timeoutId
          )
          finishReject(
            error
          )
        }
      )

      request.on(
        'close',
        () => {
          clearTimeout(
            timeoutId
          )
        }
      )
    }
  )
}


// ============================================================
// ZIP READER
// Only extracts the few GTFS text files we need. This avoids a
// new ZIP dependency and never touches stop_times.txt.
// ============================================================

function findZipEndOfCentralDirectory(
  buffer
) {
  const minimum =
    Math.max(
      0,
      buffer.length -
        65557
    )

  for (
    let offset =
      buffer.length -
      22;
    offset >=
      minimum;
    offset -=
      1
  ) {
    if (
      buffer.readUInt32LE(
        offset
      ) ===
      0x06054b50
    ) {
      return offset
    }
  }

  return -1
}


function listZipEntries(
  buffer
) {
  const eocdOffset =
    findZipEndOfCentralDirectory(
      buffer
    )

  if (
    eocdOffset <
    0
  ) {
    throw new Error(
      'Invalid TTC GTFS ZIP: central directory not found'
    )
  }

  const totalEntries =
    buffer.readUInt16LE(
      eocdOffset +
      10
    )

  const centralDirectoryOffset =
    buffer.readUInt32LE(
      eocdOffset +
      16
    )

  const entries =
    []

  let cursor =
    centralDirectoryOffset

  for (
    let index =
      0;
    index <
      totalEntries;
    index +=
      1
  ) {
    if (
      buffer.readUInt32LE(
        cursor
      ) !==
      0x02014b50
    ) {
      throw new Error(
        'Invalid TTC GTFS ZIP: bad central directory entry'
      )
    }

    const method =
      buffer.readUInt16LE(
        cursor +
        10
      )

    const compressedSize =
      buffer.readUInt32LE(
        cursor +
        20
      )

    const fileNameLength =
      buffer.readUInt16LE(
        cursor +
        28
      )

    const extraLength =
      buffer.readUInt16LE(
        cursor +
        30
      )

    const commentLength =
      buffer.readUInt16LE(
        cursor +
        32
      )

    const localHeaderOffset =
      buffer.readUInt32LE(
        cursor +
        42
      )

    const fileName =
      buffer
        .subarray(
          cursor +
            46,
          cursor +
            46 +
            fileNameLength
        )
        .toString(
          'utf8'
        )

    entries.push({
      fileName,
      method,
      compressedSize,
      localHeaderOffset,
    })

    cursor +=
      46 +
      fileNameLength +
      extraLength +
      commentLength
  }

  return entries
}


function extractZipText(
  buffer,
  wantedName
) {
  const normalizedWanted =
    wantedName
      .toLowerCase()

  const entry =
    listZipEntries(
      buffer
    )
      .find(
        (
          item
        ) => {
          const normalized =
            item.fileName
              .replace(
                /\\/g,
                '/'
              )
              .toLowerCase()

          return (
            normalized ===
              normalizedWanted ||
            normalized.endsWith(
              `/${normalizedWanted}`
            )
          )
        }
      )

  if (
    !entry
  ) {
    throw new Error(
      `TTC GTFS ZIP is missing ${wantedName}`
    )
  }

  const localOffset =
    entry.localHeaderOffset

  if (
    buffer.readUInt32LE(
      localOffset
    ) !==
    0x04034b50
  ) {
    throw new Error(
      `Invalid TTC GTFS ZIP local header for ${wantedName}`
    )
  }

  const localFileNameLength =
    buffer.readUInt16LE(
      localOffset +
      26
    )

  const localExtraLength =
    buffer.readUInt16LE(
      localOffset +
      28
    )

  const dataStart =
    localOffset +
    30 +
    localFileNameLength +
    localExtraLength

  const compressed =
    buffer.subarray(
      dataStart,
      dataStart +
        entry.compressedSize
    )

  let raw =
    null

  if (
    entry.method ===
    0
  ) {
    raw =
      compressed
  }
  else if (
    entry.method ===
    8
  ) {
    raw =
      inflateRawSync(
        compressed
      )
  }
  else {
    throw new Error(
      `Unsupported TTC GTFS ZIP compression method ${entry.method}`
    )
  }

  return raw
    .toString(
      'utf8'
    )
    .replace(
      /^\uFEFF/,
      ''
    )
}


// ============================================================
// CSV
// ============================================================

function parseCsvLine(
  line
) {
  const fields =
    []

  let current =
    ''
  let quoted =
    false

  for (
    let index =
      0;
    index <
      line.length;
    index +=
      1
  ) {
    const character =
      line[
        index
      ]

    if (
      character ===
      '"'
    ) {
      if (
        quoted &&
        line[
          index +
          1
        ] ===
          '"'
      ) {
        current +=
          '"'
        index +=
          1
      }
      else {
        quoted =
          !quoted
      }
      continue
    }

    if (
      character ===
        ',' &&
      !quoted
    ) {
      fields.push(
        current
      )
      current =
        ''
      continue
    }

    current +=
      character
  }

  fields.push(
    current
  )

  return fields
}


function forEachCsvRow(
  text,
  handler
) {
  const lines =
    text.split(
      /\r?\n/
    )

  if (
    lines.length ===
    0
  ) {
    return
  }

  const headers =
    parseCsvLine(
      lines[0]
    )
      .map(
        (
          item
        ) =>
          cleanText(
            item
          )
      )

  for (
    let lineIndex =
      1;
    lineIndex <
      lines.length;
    lineIndex +=
      1
  ) {
    const line =
      lines[
        lineIndex
      ]

    if (
      !line
    ) {
      continue
    }

    const values =
      parseCsvLine(
        line
      )

    const row =
      {}

    headers.forEach(
      (
        header,
        index
      ) => {
        row[
          header
        ] =
          values[
            index
          ] ??
          ''
      }
    )

    handler(
      row
    )
  }
}


// ============================================================
// GEOMETRY
// ============================================================

function squaredDistance(
  a,
  b
) {
  const dx =
    a[0] -
    b[0]
  const dy =
    a[1] -
    b[1]

  return (
    dx *
      dx +
    dy *
      dy
  )
}


function squaredSegmentDistance(
  point,
  start,
  end
) {
  let x =
    start[0]
  let y =
    start[1]

  let dx =
    end[0] -
    x
  let dy =
    end[1] -
    y

  if (
    dx !==
      0 ||
    dy !==
      0
  ) {
    const t =
      (
        (
          point[0] -
          x
        ) *
          dx +
        (
          point[1] -
          y
        ) *
          dy
      ) /
      (
        dx *
          dx +
        dy *
          dy
      )

    if (
      t >
      1
    ) {
      x =
        end[0]
      y =
        end[1]
    }
    else if (
      t >
      0
    ) {
      x +=
        dx *
        t
      y +=
        dy *
        t
    }
  }

  dx =
    point[0] -
    x
  dy =
    point[1] -
    y

  return (
    dx *
      dx +
    dy *
      dy
  )
}


function simplifyDouglasPeuckerStep(
  points,
  first,
  last,
  squaredTolerance,
  simplified
) {
  let maxSquaredDistance =
    squaredTolerance
  let index =
    null

  for (
    let pointIndex =
      first +
      1;
    pointIndex <
      last;
    pointIndex +=
      1
  ) {
    const distance =
      squaredSegmentDistance(
        points[
          pointIndex
        ],
        points[
          first
        ],
        points[
          last
        ]
      )

    if (
      distance >
      maxSquaredDistance
    ) {
      index =
        pointIndex
      maxSquaredDistance =
        distance
    }
  }

  if (
    index !==
    null
  ) {
    if (
      index -
        first >
      1
    ) {
      simplifyDouglasPeuckerStep(
        points,
        first,
        index,
        squaredTolerance,
        simplified
      )
    }

    simplified.push(
      points[
        index
      ]
    )

    if (
      last -
        index >
      1
    ) {
      simplifyDouglasPeuckerStep(
        points,
        index,
        last,
        squaredTolerance,
        simplified
      )
    }
  }
}


function simplifyLine(
  points,
  tolerance
) {
  if (
    points.length <=
    2
  ) {
    return points
  }

  const squaredTolerance =
    tolerance *
    tolerance

  const radial = [
    points[0],
  ]

  let previous =
    points[0]

  for (
    let index =
      1;
    index <
      points.length;
    index +=
      1
  ) {
    const point =
      points[
        index
      ]

    if (
      squaredDistance(
        point,
        previous
      ) >
        squaredTolerance ||
      index ===
        points.length -
          1
    ) {
      radial.push(
        point
      )
      previous =
        point
    }
  }

  if (
    radial.length <=
    2
  ) {
    return radial
  }

  const simplified = [
    radial[0],
  ]

  simplifyDouglasPeuckerStep(
    radial,
    0,
    radial.length -
      1,
    squaredTolerance,
    simplified
  )

  simplified.push(
    radial[
      radial.length -
      1
    ]
  )

  return simplified
}


function coordinatesBounds(
  coordinates
) {
  let west =
    Infinity
  let south =
    Infinity
  let east =
    -Infinity
  let north =
    -Infinity

  coordinates.forEach(
    (
      coordinate
    ) => {
      west =
        Math.min(
          west,
          coordinate[0]
        )
      south =
        Math.min(
          south,
          coordinate[1]
        )
      east =
        Math.max(
          east,
          coordinate[0]
        )
      north =
        Math.max(
          north,
          coordinate[1]
        )
    }
  )

  return [
    west,
    south,
    east,
    north,
  ]
}


function boundsIntersect(
  a,
  b
) {
  return !(
    a[2] <
      b[0] ||
    a[0] >
      b[2] ||
    a[3] <
      b[1] ||
    a[1] >
      b[3]
  )
}


function pointInBounds(
  longitude,
  latitude,
  bounds
) {
  return (
    longitude >=
      bounds[0] &&
    longitude <=
      bounds[2] &&
    latitude >=
      bounds[1] &&
    latitude <=
      bounds[3]
  )
}


function parseBounds(
  url
) {
  const west =
    numberOrNull(
      url.searchParams.get(
        'west'
      )
    )
  const south =
    numberOrNull(
      url.searchParams.get(
        'south'
      )
    )
  const east =
    numberOrNull(
      url.searchParams.get(
        'east'
      )
    )
  const north =
    numberOrNull(
      url.searchParams.get(
        'north'
      )
    )

  if (
    west ===
      null ||
    south ===
      null ||
    east ===
      null ||
    north ===
      null ||
    west >=
      east ||
    south >=
      north
  ) {
    return [
      -79.75,
      43.48,
      -79.0,
      44.0,
    ]
  }

  const longitudePadding =
    Math.max(
      0.015,
      (
        east -
        west
      ) *
        0.18
    )

  const latitudePadding =
    Math.max(
      0.012,
      (
        north -
        south
      ) *
        0.18
    )

  return [
    west -
      longitudePadding,
    south -
      latitudePadding,
    east +
      longitudePadding,
    north +
      latitudePadding,
  ]
}


// ============================================================
// SURFACE GTFS STATIC NETWORK
// ============================================================

async function buildSurfaceNetwork() {
  const zip =
    await fetchBuffer(
      TTC_SURFACE_GTFS_URL
    )

  const routesText =
    extractZipText(
      zip,
      'routes.txt'
    )

  const stopsText =
    extractZipText(
      zip,
      'stops.txt'
    )

  const tripsText =
    extractZipText(
      zip,
      'trips.txt'
    )

  const shapesText =
    extractZipText(
      zip,
      'shapes.txt'
    )

  const routes =
    new Map()

  forEachCsvRow(
    routesText,
    (
      row
    ) => {
      const id =
        cleanText(
          row.route_id
        )

      if (
        !id
      ) {
        return
      }

      const type =
        numberOrNull(
          row.route_type
        )

      if (
        !SUPPORTED_SURFACE_ROUTE_TYPES.has(
          type ??
          3
        )
      ) {
        return
      }

      routes.set(
        id,
        {
          id,
          shortName:
            cleanText(
              row.route_short_name
            ) ||
            id,
          longName:
            cleanText(
              row.route_long_name
            ),
          type:
            type ??
            3,
          color:
            hexColor(
              row.route_color,
              type ===
                0
                ? '#C8102E'
                : '#111111'
            ),
          textColor:
            hexColor(
              row.route_text_color,
              '#FFFFFF'
            ),
        }
      )
    }
  )

  const trips =
    new Map()

  const shapeMetadata =
    new Map()

  forEachCsvRow(
    tripsText,
    (
      row
    ) => {
      const tripId =
        cleanText(
          row.trip_id
        )
      const routeId =
        cleanText(
          row.route_id
        )
      const shapeId =
        cleanText(
          row.shape_id
        )

      if (
        !tripId
      ) {
        return
      }

      const trip = {
        tripId,
        routeId,
        shapeId,
        directionId:
          numberOrNull(
            row.direction_id
          ),
        headsign:
          cleanText(
            row.trip_headsign
          ),
      }

      trips.set(
        tripId,
        trip
      )

      if (
        shapeId &&
        !shapeMetadata.has(
          shapeId
        )
      ) {
        shapeMetadata.set(
          shapeId,
          trip
        )
      }
    }
  )

  const shapePoints =
    new Map()

  forEachCsvRow(
    shapesText,
    (
      row
    ) => {
      const shapeId =
        cleanText(
          row.shape_id
        )
      const latitude =
        numberOrNull(
          row.shape_pt_lat
        )
      const longitude =
        numberOrNull(
          row.shape_pt_lon
        )
      const sequence =
        numberOrNull(
          row.shape_pt_sequence
        )

      if (
        !shapeId ||
        latitude ===
          null ||
        longitude ===
          null
      ) {
        return
      }

      if (
        !shapePoints.has(
          shapeId
        )
      ) {
        shapePoints.set(
          shapeId,
          []
        )
      }

      shapePoints
        .get(
          shapeId
        )
        .push({
          sequence:
            sequence ??
            0,
          coordinate: [
            longitude,
            latitude,
          ],
        })
    }
  )

  const routeShapes =
    []

  shapePoints.forEach(
    (
      points,
      shapeId
    ) => {
      const metadata =
        shapeMetadata.get(
          shapeId
        )

      const route =
        routes.get(
          metadata?.routeId
        )

      if (
        !metadata ||
        !route
      ) {
        return
      }

      const coordinates =
        points
          .sort(
            (
              a,
              b
            ) =>
              a.sequence -
              b.sequence
          )
          .map(
            (
              item
            ) =>
              item.coordinate
          )

      if (
        coordinates.length <
        2
      ) {
        return
      }

      routeShapes.push({
        shapeId,
        routeId:
          route.id,
        directionId:
          metadata.directionId,
        headsign:
          metadata.headsign,
        route,
        bounds:
          coordinatesBounds(
            coordinates
          ),
        detailCoordinates:
          simplifyLine(
            coordinates,
            0.000025
          ),
        overviewCoordinates:
          simplifyLine(
            coordinates,
            0.00012
          ),
      })
    }
  )

  const stops =
    []
  const stopsById =
    new Map()

  forEachCsvRow(
    stopsText,
    (
      row
    ) => {
      const id =
        cleanText(
          row.stop_id
        )
      const latitude =
        numberOrNull(
          row.stop_lat
        )
      const longitude =
        numberOrNull(
          row.stop_lon
        )

      if (
        !id ||
        latitude ===
          null ||
        longitude ===
          null
      ) {
        return
      }

      const stop = {
        id,
        code:
          cleanText(
            row.stop_code
          ),
        name:
          cleanText(
            row.stop_name
          ),
        latitude,
        longitude,
        locationType:
          numberOrNull(
            row.location_type
          ) ??
          0,
        parentStation:
          cleanText(
            row.parent_station
          ),
      }

      stops.push(
        stop
      )

      stopsById.set(
        id,
        stop
      )
    }
  )

  return {
    loadedAt:
      Date.now(),
    generatedAt:
      new Date()
        .toISOString(),
    routes,
    trips,
    routeShapes,
    stops,
    stopsById,
  }
}


async function getSurfaceNetwork() {
  if (
    surfaceCache &&
    Date.now() -
      surfaceCache.loadedAt <
      STATIC_CACHE_MS
  ) {
    return surfaceCache
  }

  if (
    surfacePromise
  ) {
    return surfacePromise
  }

  surfacePromise =
    buildSurfaceNetwork()
      .then(
        (
          network
        ) => {
          surfaceCache =
            network
          return network
        }
      )
      .finally(
        () => {
          surfacePromise =
            null
        }
      )

  return surfacePromise
}


// ============================================================
// TTC STATIONS FROM COMPLETE STATIC GTFS
// This is separate from the live surface feed. Failure here does
// not prevent buses/streetcars from working.
// ============================================================

async function buildStationIndex() {
  const zip =
    await fetchBuffer(
      TTC_FULL_GTFS_URL
    )

  const stopsText =
    extractZipText(
      zip,
      'stops.txt'
    )

  const stations =
    []

  forEachCsvRow(
    stopsText,
    (
      row
    ) => {
      const id =
        cleanText(
          row.stop_id
        )
      const latitude =
        numberOrNull(
          row.stop_lat
        )
      const longitude =
        numberOrNull(
          row.stop_lon
        )
      const locationType =
        numberOrNull(
          row.location_type
        ) ??
        0
      const name =
        cleanText(
          row.stop_name
        )

      if (
        !id ||
        latitude ===
          null ||
        longitude ===
          null
      ) {
        return
      }

      if (
        locationType !==
        1
      ) {
        return
      }

      stations.push({
        id,
        code:
          cleanText(
            row.stop_code
          ),
        name,
        latitude,
        longitude,
        locationType,
        parentStation:
          cleanText(
            row.parent_station
          ),
      })
    }
  )

  const seen =
    new Set()

  return {
    loadedAt:
      Date.now(),
    stations:
      stations.filter(
        (
          station
        ) => {
          const key =
            `${station.name.toLowerCase()}|${station.longitude.toFixed(5)}|${station.latitude.toFixed(5)}`

          if (
            seen.has(
              key
            )
          ) {
            return false
          }

          seen.add(
            key
          )
          return true
        }
      ),
  }
}


async function getStationIndex() {
  if (
    stationsCache &&
    Date.now() -
      stationsCache.loadedAt <
      STATIC_CACHE_MS
  ) {
    return stationsCache
  }

  if (
    stationsPromise
  ) {
    return stationsPromise
  }

  stationsPromise =
    buildStationIndex()
      .then(
        (
          index
        ) => {
          stationsCache =
            index
          return index
        }
      )
      .catch(
        (
          error
        ) => {
          console.warn(
            'LIVE TTC STATION INDEX:',
            error
          )

          const fallback = {
            loadedAt:
              Date.now(),
            stations:
              [],
          }

          stationsCache =
            fallback
          return fallback
        }
      )
      .finally(
        () => {
          stationsPromise =
            null
        }
      )

  return stationsPromise
}


// ============================================================
// NETWORK RESPONSE
// ============================================================

function routeShapeFeature(
  item,
  useDetail
) {
  return {
    type:
      'Feature',
    id:
      item.shapeId,
    geometry: {
      type:
        'LineString',
      coordinates:
        useDetail
          ? item.detailCoordinates
          : item.overviewCoordinates,
    },
    properties: {
      shapeId:
        item.shapeId,
      routeId:
        item.routeId,
      routeShortName:
        item.route.shortName,
      routeLongName:
        item.route.longName,
      routeType:
        item.route.type,
      routeColor:
        item.route.color,
      routeTextColor:
        item.route.textColor,
      directionId:
        item.directionId ??
        '',
      headsign:
        item.headsign,
    },
  }
}


function stopFeature(
  stop
) {
  return {
    type:
      'Feature',
    id:
      stop.id,
    geometry: {
      type:
        'Point',
      coordinates: [
        stop.longitude,
        stop.latitude,
      ],
    },
    properties: {
      stopId:
        stop.id,
      stopCode:
        stop.code,
      stopName:
        stop.name,
      locationType:
        stop.locationType,
      parentStation:
        stop.parentStation,
    },
  }
}


function stationFeature(
  station
) {
  return {
    type:
      'Feature',
    id:
      station.id,
    geometry: {
      type:
        'Point',
      coordinates: [
        station.longitude,
        station.latitude,
      ],
    },
    properties: {
      stopId:
        station.id,
      stopCode:
        station.code,
      stopName:
        station.name,
      locationType:
        station.locationType,
      parentStation:
        station.parentStation,
      isStation:
        true,
    },
  }
}


async function getNetworkPayload(
  url
) {
  const bounds =
    parseBounds(
      url
    )

  const zoom =
    numberOrNull(
      url.searchParams.get(
        'zoom'
      )
    ) ??
    11

  const [
    surface,
    stationIndex,
  ] =
    await Promise.all([
      getSurfaceNetwork(),
      getStationIndex(),
    ])

  const useDetail =
    zoom >=
    13

  const routeFeatures =
    surface.routeShapes
      .filter(
        (
          item
        ) =>
          boundsIntersect(
            item.bounds,
            bounds
          )
      )
      .map(
        (
          item
        ) =>
          routeShapeFeature(
            item,
            useDetail
          )
      )

  const stopFeatures =
    zoom >=
      12.5
      ? surface.stops
          .filter(
            (
              stop
            ) =>
              pointInBounds(
                stop.longitude,
                stop.latitude,
                bounds
              )
          )
          .map(
            stopFeature
          )
      : []

  const stationFeatures =
    stationIndex.stations
      .filter(
        (
          station
        ) =>
          pointInBounds(
            station.longitude,
            station.latitude,
            bounds
          )
      )
      .map(
        stationFeature
      )

  const routeBounds =
    new Map()

  surface.routeShapes.forEach(
    (
      shape
    ) => {
      const routeId =
        cleanText(
          shape?.routeId
        )
      const bounds =
        shape?.bounds

      if (
        !routeId ||
        !Array.isArray(
          bounds
        ) ||
        bounds.length !==
          4
      ) {
        return
      }

      const current =
        routeBounds.get(
          routeId
        )

      if (
        !current
      ) {
        routeBounds.set(
          routeId,
          [
            bounds[0],
            bounds[1],
            bounds[2],
            bounds[3],
          ]
        )
        return
      }

      current[0] =
        Math.min(
          current[0],
          bounds[0]
        )
      current[1] =
        Math.min(
          current[1],
          bounds[1]
        )
      current[2] =
        Math.max(
          current[2],
          bounds[2]
        )
      current[3] =
        Math.max(
          current[3],
          bounds[3]
        )
    }
  )

  const routeCatalog =
    Array.from(
      surface.routes.values()
    )
      .map(
        (
          route
        ) => ({
          id:
            route.id,
          shortName:
            route.shortName,
          longName:
            route.longName,
          type:
            route.type,
          bounds:
            routeBounds.get(
              route.id
            ) ||
            null,
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          String(
            a.shortName ||
            a.id
          )
            .localeCompare(
              String(
                b.shortName ||
                b.id
              ),
              undefined,
              {
                numeric:
                  true,
                sensitivity:
                  'base',
              }
            )
      )

  return {
    ok:
      true,
    generatedAt:
      new Date()
        .toISOString(),
    staticLoadedAt:
      new Date(
        surface.loadedAt
      )
        .toISOString(),
    attribution:
      TORONTO_ATTRIBUTION,
    routeCatalog,
    routes: {
      type:
        'FeatureCollection',
      features:
        routeFeatures,
    },
    stops: {
      type:
        'FeatureCollection',
      features:
        stopFeatures,
    },
    stations: {
      type:
        'FeatureCollection',
      features:
        stationFeatures,
    },
    counts: {
      routes:
        routeFeatures.length,
      stops:
        stopFeatures.length,
      stations:
        stationFeatures.length,
    },
  }
}


// ============================================================
// GTFS-REALTIME
// ============================================================

function decodeRealtimeFeed(
  buffer
) {
  const decoded =
    GtfsRealtimeBindings
      .transit_realtime
      .FeedMessage
      .decode(
        new Uint8Array(
          buffer
        )
      )

  return GtfsRealtimeBindings
    .transit_realtime
    .FeedMessage
    .toObject(
      decoded,
      {
        longs:
          String,
        enums:
          String,
        bytes:
          String,
        arrays:
          true,
        objects:
          true,
      }
    )
}


async function fetchRealtimeFeed(
  url
) {
  return decodeRealtimeFeed(
    await fetchBuffer(
      url,
      0,
      REALTIME_FETCH_TIMEOUT_MS
    )
  )
}


async function fetchRealtimeFeedWithFallback(
  primaryUrl,
  fallbackUrl
) {
  try {
    return await fetchRealtimeFeed(
      primaryUrl
    )
  }
  catch (
    primaryError
  ) {
    try {
      return await fetchRealtimeFeed(
        fallbackUrl
      )
    }
    catch (
      fallbackError
    ) {
      throw new Error(
        `TTC realtime feeds unavailable · primary: ${primaryError?.message || primaryError} · fallback: ${fallbackError?.message || fallbackError}`
      )
    }
  }
}


function vehicleFeedHasPositions(
  feed
) {
  return (
    Array.isArray(
      feed?.entity
    ) &&
    feed.entity.some(
      (
        entity
      ) => {
        const position =
          entity?.vehicle?.position

        return (
          numberOrNull(
            position?.latitude
          ) !==
            null &&
          numberOrNull(
            position?.longitude
          ) !==
            null
        )
      }
    )
  )
}


async function fetchVehicleRealtimeFeed() {
  let primaryError =
    null

  try {
    const feed =
      await fetchRealtimeFeed(
        TTC_VEHICLES_URL
      )

    if (
      !vehicleFeedHasPositions(
        feed
      )
    ) {
      throw new Error(
        'TTC primary vehicle feed returned no usable positions'
      )
    }

    return feed
  }
  catch (
    error
  ) {
    primaryError =
      error
  }

  try {
    const feed =
      await fetchRealtimeFeed(
        TTC_VEHICLES_FALLBACK_URL
      )

    if (
      !vehicleFeedHasPositions(
        feed
      )
    ) {
      throw new Error(
        'TTC fallback vehicle feed returned no usable positions'
      )
    }

    return feed
  }
  catch (
    fallbackError
  ) {
    throw new Error(
      `TTC vehicle feeds unavailable · primary: ${primaryError?.message || primaryError} · fallback: ${fallbackError?.message || fallbackError}`
    )
  }
}


async function getRawVehicleFeed(
  maxAgeMs =
    REALTIME_CACHE_MS
) {
  const cacheAge =
    vehicleCache
      ? Date.now() -
        vehicleCache.cachedAt
      : Infinity

  if (
    vehicleCache &&
    cacheAge <
      maxAgeMs
  ) {
    return vehicleCache.feed
  }

  if (
    vehiclePromise
  ) {
    if (
      vehicleCache &&
      cacheAge <
        REALTIME_STALE_IMMEDIATE_MS
    ) {
      return vehicleCache.feed
    }

    return vehiclePromise
  }

  vehiclePromise =
    fetchVehicleRealtimeFeed()
      .then(
        (
          feed
        ) => {
          vehicleCache = {
            cachedAt:
              Date.now(),
            feed,
          }
          return feed
        }
      )
      .catch(
        (
          error
        ) => {
          if (
            vehicleCache &&
            Date.now() -
              vehicleCache.cachedAt <
              REALTIME_STALE_FALLBACK_MS
          ) {
            console.warn(
              'LIVE TTC VEHICLES · using recent cached feed after upstream failure:',
              error?.message ||
                error
            )
            return vehicleCache.feed
          }

          throw error
        }
      )
      .finally(
        () => {
          vehiclePromise =
            null
        }
      )

  if (
    vehicleCache &&
    cacheAge <
      REALTIME_STALE_IMMEDIATE_MS
  ) {
    // Serve a recent snapshot immediately while a fresh TTC fetch runs in the
    // background. This removes most open/toggle delay while preserving the
    // actual TTC timestamp on every vehicle.
    return vehicleCache.feed
  }

  return vehiclePromise
}


async function getRawTripUpdateFeed() {
  if (
    tripUpdateCache &&
    Date.now() -
      tripUpdateCache.cachedAt <
      REALTIME_CACHE_MS
  ) {
    return tripUpdateCache.feed
  }

  if (
    tripUpdatePromise
  ) {
    return tripUpdatePromise
  }

  tripUpdatePromise =
    fetchRealtimeFeedWithFallback(
      TTC_TRIPS_URL,
      TTC_TRIPS_FALLBACK_URL
    )
      .then(
        (
          feed
        ) => {
          tripUpdateCache = {
            cachedAt:
              Date.now(),
            feed,
          }
          return feed
        }
      )
      .catch(
        (
          error
        ) => {
          if (
            tripUpdateCache &&
            Date.now() -
              tripUpdateCache.cachedAt <
              REALTIME_STALE_FALLBACK_MS
          ) {
            console.warn(
              'LIVE TTC TRIPS · using recent cached feed after upstream failure:',
              error?.message ||
                error
            )
            return tripUpdateCache.feed
          }

          throw error
        }
      )
      .finally(
        () => {
          tripUpdatePromise =
            null
        }
      )

  return tripUpdatePromise
}


function routeMode(
  routeType
) {
  return Number(
    routeType
  ) ===
    0
    ? 'streetcar'
    : 'bus'
}


async function getVehiclesPayload(
  url
) {
  // Live GPS should never wait for the much larger static SurfaceGTFS ZIP.
  // Return realtime vehicles immediately and enrich route/stop metadata from
  // the static cache once it has warmed in the background. Deep zooms use a
  // shorter shared cache window so the area being inspected gets first crack
  // at each newly published TTC sample.
  const zoom =
    numberOrNull(
      url.searchParams.get(
        'zoom'
      )
    ) ??
    11
  const feed =
    await getRawVehicleFeed(
      zoom >=
        13.5
        ? REALTIME_FOCUSED_CACHE_MS
        : REALTIME_CACHE_MS
    )

  const surface =
    surfaceCache

  if (
    !surface
  ) {
    getSurfaceNetwork()
      .catch(
        (
          error
        ) => {
          console.warn(
            'LIVE TTC STATIC WARMUP:',
            error
          )
        }
      )
  }

  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )

  const bounds =
    parseBounds(
      url
    )

  const vehicles =
    (
      Array.isArray(
        feed?.entity
      )
        ? feed.entity
        : []
    )
      .map(
        (
          entity
        ) => {
          const vehicle =
            entity?.vehicle

          const position =
            vehicle?.position

          const latitude =
            numberOrNull(
              position?.latitude
            )
          const longitude =
            numberOrNull(
              position?.longitude
            )

          if (
            !vehicle ||
            latitude ===
              null ||
            longitude ===
              null
          ) {
            return null
          }

          const tripId =
            cleanText(
              vehicle?.trip?.tripId
            )

          const staticTrip =
            surface?.trips?.get(
              tripId
            )

          const routeId =
            cleanText(
              vehicle?.trip?.routeId
            ) ||
            staticTrip?.routeId ||
            ''

          const route =
            surface?.routes?.get(
              routeId
            )

          const stopId =
            cleanText(
              vehicle?.stopId
            )

          const stop =
            surface?.stopsById?.get(
              stopId
            )

          const timestamp =
            numberOrNull(
              vehicle?.timestamp
            ) ??
            numberOrNull(
              feed?.header?.timestamp
            ) ??
            nowSeconds

          const vehicleDescriptor =
            vehicle?.vehicle ||
            {}

          const id =
            cleanText(
              vehicleDescriptor.id
            ) ||
            cleanText(
              vehicleDescriptor.label
            ) ||
            cleanText(
              entity?.id
            )

          if (
            !id
          ) {
            return null
          }

          const routeType =
            route?.type ??
            (
              /^5\d\d$/.test(
                routeId
              ) ||
              /^3(?:01|04|06)$/.test(
                routeId
              )
                ? 0
                : 3
            )

          return {
            id,
            label:
              cleanText(
                vehicleDescriptor.label
              ) ||
              id,
            licensePlate:
              cleanText(
                vehicleDescriptor.licensePlate
              ),
            tripId,
            routeId,
            routeShortName:
              route?.shortName ||
              routeId,
            routeLongName:
              route?.longName ||
              '',
            routeType,
            mode:
              routeMode(
                routeType
              ),
            headsign:
              staticTrip?.headsign ||
              '',
            directionId:
              numberOrNull(
                vehicle?.trip?.directionId
              ) ??
              staticTrip?.directionId ??
              null,
            latitude,
            longitude,
            bearing:
              numberOrNull(
                position?.bearing
              ),
            speed:
              numberOrNull(
                position?.speed
              ),
            timestamp,
            ageSeconds:
              Math.max(
                0,
                nowSeconds -
                  timestamp
              ),
            currentStopSequence:
              numberOrNull(
                vehicle?.currentStopSequence
              ),
            stopId,
            stopName:
              stop?.name ||
              '',
            currentStatus:
              cleanText(
                vehicle?.currentStatus
              ),
            occupancyStatus:
              cleanText(
                vehicle?.occupancyStatus
              ),
          }
        }
      )
      .filter(
        Boolean
      )
      .filter(
        (
          vehicle
        ) =>
          vehicle.ageSeconds <=
          5 *
            60
      )
      .filter(
        (
          vehicle
        ) =>
          pointInBounds(
            vehicle.longitude,
            vehicle.latitude,
            bounds
          )
      )

  return {
    ok:
      true,
    source:
      'Toronto Transit Commission GTFS-Realtime Vehicle Positions',
    upstream:
      TTC_VEHICLES_URL,
    attribution:
      TORONTO_ATTRIBUTION,
    updatedAt:
      new Date()
        .toISOString(),
    feedTimestamp:
      numberOrNull(
        feed?.header?.timestamp
      ),
    count:
      vehicles.length,
    vehicles,
  }
}


function asArray(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value
  }

  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return []
  }

  return [
    value,
  ]
}


async function fetchJson(
  url,
  timeoutMs =
    REALTIME_FETCH_TIMEOUT_MS
) {
  const buffer =
    await fetchBuffer(
      url,
      0,
      timeoutMs
    )

  return JSON.parse(
    buffer.toString(
      'utf8'
    )
  )
}


function dedupeArrivalsByVehicleOrTrip(
  arrivals
) {
  const seen =
    new Set()
  const deduped =
    []

  ;(
    Array.isArray(
      arrivals
    )
      ? arrivals
      : []
  )
    .sort(
      (
        a,
        b
      ) =>
        Number(
          a?.arrivalTime ??
          a?.minutes ??
          0
        ) -
        Number(
          b?.arrivalTime ??
          b?.minutes ??
          0
        )
    )
    .forEach(
      (
        arrival
      ) => {
        const vehicleId =
          cleanText(
            arrival?.vehicleId
          )
        const tripId =
          cleanText(
            arrival?.tripId
          )
        const routeId =
          cleanText(
            arrival?.routeId
          )

        const key =
          vehicleId
            ? `vehicle:${routeId}:${vehicleId}`
            : tripId
              ? `trip:${routeId}:${tripId}`
              : ''

        if (
          key &&
          seen.has(
            key
          )
        ) {
          return
        }

        if (
          key
        ) {
          seen.add(
            key
          )
        }

        deduped.push(
          arrival
        )
      }
    )

  return deduped
}


async function getUmoArrivalsForStopCode(
  stopCode,
  surface
) {
  const normalizedStopCode =
    cleanText(
      stopCode
    )

  if (
    !normalizedStopCode
  ) {
    return []
  }

  const url =
    new URL(
      TTC_PREDICTIONS_URL
    )
  url.searchParams.set(
    'command',
    'predictions'
  )
  url.searchParams.set(
    'a',
    'ttc'
  )
  url.searchParams.set(
    'stopId',
    normalizedStopCode
  )
  url.searchParams.set(
    'useShortTitles',
    'true'
  )

  const payload =
    await fetchJson(
      url.toString()
    )

  if (
    payload?.Error ||
    payload?.error
  ) {
    throw new Error(
      cleanText(
        payload?.Error?.content ||
        payload?.Error ||
        payload?.error?.content ||
        payload?.error ||
        'TTC prediction feed returned an error'
      )
    )
  }

  const arrivals =
    []

  asArray(
    payload?.predictions
  )
    .forEach(
      (
        predictionGroup
      ) => {
        const routeId =
          cleanText(
            predictionGroup?.routeTag
          )
        const route =
          surface?.routes?.get?.(
            routeId
          )
        const routeTitle =
          cleanText(
            predictionGroup?.routeTitle
          )

        asArray(
          predictionGroup?.direction
        )
          .forEach(
            (
              direction
            ) => {
              const headsign =
                cleanText(
                  direction?.title
                )

              asArray(
                direction?.prediction
              )
                .forEach(
                  (
                    prediction
                  ) => {
                    const minutes =
                      numberOrNull(
                        prediction?.minutes
                      )
                    const seconds =
                      numberOrNull(
                        prediction?.seconds
                      )
                    const epochMilliseconds =
                      numberOrNull(
                        prediction?.epochTime
                      )

                    if (
                      minutes ===
                        null &&
                      seconds ===
                        null &&
                      epochMilliseconds ===
                        null
                    ) {
                      return
                    }

                    const normalizedMinutes =
                      minutes ??
                      Math.max(
                        0,
                        Math.floor(
                          (seconds ?? 0) /
                            60
                        )
                      )

                    arrivals.push({
                      tripId:
                        cleanText(
                          prediction?.tripTag
                        ),
                      routeId,
                      routeShortName:
                        cleanText(
                          prediction?.branch
                        ) ||
                        route?.shortName ||
                        routeId,
                      routeLongName:
                        route?.longName ||
                        routeTitle,
                      routeType:
                        route?.type ??
                        (
                          /^5\d\d$/.test(
                            routeId
                          )
                            ? 0
                            : 3
                        ),
                      mode:
                        routeMode(
                          route?.type ??
                          (
                            /^5\d\d$/.test(
                              routeId
                            )
                              ? 0
                              : 3
                          )
                        ),
                      headsign,
                      directionId:
                        cleanText(
                          prediction?.dirTag
                        ),
                      vehicleId:
                        cleanText(
                          prediction?.vehicle
                        ),
                      stopId:
                        '',
                      stopCode:
                        normalizedStopCode,
                      arrivalTime:
                        epochMilliseconds !==
                          null
                          ? Math.floor(
                              epochMilliseconds /
                              1000
                            )
                          : Math.floor(
                              Date.now() /
                              1000
                            ) +
                            normalizedMinutes *
                              60,
                      minutes:
                        normalizedMinutes,
                      seconds:
                        seconds ??
                        normalizedMinutes *
                          60,
                      branch:
                        cleanText(
                          prediction?.branch
                        ),
                      isDeparture:
                        String(
                          prediction?.isDeparture ||
                          ''
                        ) ===
                          'true',
                      source:
                        'UMO NextBus',
                    })
                  }
                )
            }
          )
      }
    )

  return dedupeArrivalsByVehicleOrTrip(
    arrivals
  )
}


function distanceMeters(
  latitudeA,
  longitudeA,
  latitudeB,
  longitudeB
) {
  const toRadians =
    (value) =>
      value *
      Math.PI /
      180
  const earthRadius =
    6371000
  const dLat =
    toRadians(
      latitudeB -
      latitudeA
    )
  const dLon =
    toRadians(
      longitudeB -
      longitudeA
    )
  const lat1 =
    toRadians(
      latitudeA
    )
  const lat2 =
    toRadians(
      latitudeB
    )
  const a =
    Math.sin(
      dLat /
      2
    ) **
      2 +
    Math.sin(
      dLon /
      2
    ) **
      2 *
      Math.cos(
        lat1
      ) *
      Math.cos(
        lat2
      )

  return earthRadius *
    2 *
    Math.atan2(
      Math.sqrt(
        a
      ),
      Math.sqrt(
        1 -
        a
      )
    )
}


async function getGpsVehicleArrivalsForStop(
  stop,
  surface
) {
  if (
    !stop?.id
  ) {
    return []
  }

  let feed =
    null

  try {
    feed =
      await getRawVehicleFeed(
        REALTIME_FOCUSED_CACHE_MS
      )
  }
  catch (
    error
  ) {
    console.warn(
      'LIVE TTC ARRIVALS · GPS correction unavailable:',
      error?.message ||
        error
    )
    return []
  }

  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )
  const arrivals =
    []

  ;(
    Array.isArray(
      feed?.entity
    )
      ? feed.entity
      : []
  ).forEach(
    (
      entity
    ) => {
      const vehicle =
        entity?.vehicle
      const position =
        vehicle?.position
      const stopId =
        cleanText(
          vehicle?.stopId
        )

      if (
        !vehicle ||
        stopId !==
          stop.id
      ) {
        return
      }

      const latitude =
        numberOrNull(
          position?.latitude
        )
      const longitude =
        numberOrNull(
          position?.longitude
        )

      if (
        latitude ===
          null ||
        longitude ===
          null
      ) {
        return
      }

      const tripId =
        cleanText(
          vehicle?.trip?.tripId
        )
      const staticTrip =
        surface?.trips?.get?.(
          tripId
        )
      const routeId =
        cleanText(
          vehicle?.trip?.routeId
        ) ||
        staticTrip?.routeId ||
        ''
      const route =
        surface?.routes?.get?.(
          routeId
        )
      const timestamp =
        numberOrNull(
          vehicle?.timestamp
        ) ??
        nowSeconds
      const ageSeconds =
        Math.max(
          0,
          nowSeconds -
            timestamp
        )
      const distance =
        distanceMeters(
          latitude,
          longitude,
          stop.latitude,
          stop.longitude
        )
      const reportedSpeed =
        numberOrNull(
          position?.speed
        )
      const movingSpeed =
        reportedSpeed !==
          null &&
        reportedSpeed >
          0.8
          ? reportedSpeed
          : 4.5
      const status =
        cleanText(
          vehicle?.currentStatus
        ).toUpperCase()
      let etaSeconds =
        status.includes(
          'STOPPED'
        )
          ? 0
          : Math.max(
              0,
              distance /
                Math.max(
                  1,
                  movingSpeed
                ) -
                Math.min(
                  ageSeconds,
                  45
                )
            )

      if (
        distance <=
          90
      ) {
        etaSeconds =
          Math.min(
            etaSeconds,
            35
          )
      }

      etaSeconds =
        Math.min(
          etaSeconds,
          5 *
            60
        )

      const vehicleDescriptor =
        vehicle?.vehicle ||
        {}

      arrivals.push({
        tripId,
        routeId,
        routeShortName:
          route?.shortName ||
          routeId,
        routeLongName:
          route?.longName ||
          '',
        routeType:
          route?.type ??
          3,
        mode:
          routeMode(
            route?.type ??
            3
          ),
        headsign:
          staticTrip?.headsign ||
          '',
        directionId:
          numberOrNull(
            vehicle?.trip?.directionId
          ) ??
          staticTrip?.directionId ??
          null,
        vehicleId:
          cleanText(
            vehicleDescriptor?.id
          ) ||
          cleanText(
            vehicleDescriptor?.label
          ),
        stopId:
          stop.id,
        stopCode:
          stop.code ||
          '',
        arrivalTime:
          nowSeconds +
          Math.round(
            etaSeconds
          ),
        minutes:
          etaSeconds <=
            45
            ? 0
            : Math.max(
                1,
                Math.ceil(
                  etaSeconds /
                  60
                )
              ),
        seconds:
          Math.max(
            0,
            Math.round(
              etaSeconds
            )
          ),
        source:
          'TTC GTFS-Realtime vehicle position',
        positionAgeSeconds:
          ageSeconds,
        distanceMeters:
          Math.round(
            distance
          ),
      })
    }
  )

  return arrivals
}


function realtimeStopTime(
  stopTimeUpdate
) {
  return (
    numberOrNull(
      stopTimeUpdate?.arrival?.time
    ) ??
    numberOrNull(
      stopTimeUpdate?.departure?.time
    )
  )
}


async function getGtfsArrivalsPayload(
  stopId
) {
  const normalizedStopId =
    cleanText(
      stopId
    )

  if (
    !normalizedStopId
  ) {
    throw new Error(
      'stopId is required'
    )
  }

  const [
    feed,
    surface,
  ] =
    await Promise.all([
      getRawTripUpdateFeed(),
      getSurfaceNetwork(),
    ])

  const stop =
    surface.stopsById.get(
      normalizedStopId
    )

  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )

  const arrivals =
    []

  ;(
    Array.isArray(
      feed?.entity
    )
      ? feed.entity
      : []
  )
    .forEach(
      (
        entity
      ) => {
        const tripUpdate =
          entity?.tripUpdate

        if (
          !tripUpdate
        ) {
          return
        }

        const tripId =
          cleanText(
            tripUpdate?.trip?.tripId
          )

        const staticTrip =
          surface.trips.get(
            tripId
          )

        const routeId =
          cleanText(
            tripUpdate?.trip?.routeId
          ) ||
          staticTrip?.routeId ||
          ''

        const route =
          surface.routes.get(
            routeId
          )

        if (
          !route
        ) {
          return
        }

        ;(
          Array.isArray(
            tripUpdate?.stopTimeUpdate
          )
            ? tripUpdate.stopTimeUpdate
            : []
        )
          .forEach(
            (
              update
            ) => {
              if (
                cleanText(
                  update?.stopId
                ) !==
                normalizedStopId
              ) {
                return
              }

              const time =
                realtimeStopTime(
                  update
                )

              if (
                time ===
                  null ||
                time <
                  nowSeconds -
                    60
              ) {
                return
              }

              arrivals.push({
                tripId,
                routeId,
                routeShortName:
                  route?.shortName ||
                  routeId,
                routeLongName:
                  route?.longName ||
                  '',
                routeType:
                  route?.type ??
                  3,
                mode:
                  routeMode(
                    route?.type ??
                    3
                  ),
                headsign:
                  staticTrip?.headsign ||
                  '',
                directionId:
                  numberOrNull(
                    tripUpdate?.trip?.directionId
                  ) ??
                  staticTrip?.directionId ??
                  null,
                vehicleId:
                  cleanText(
                    tripUpdate?.vehicle?.id
                  ),
                stopId:
                  normalizedStopId,
                stopSequence:
                  numberOrNull(
                    update?.stopSequence
                  ),
                arrivalTime:
                  time,
                minutes:
                  Math.max(
                    0,
                    Math.floor(
                      (
                        time -
                        nowSeconds +
                        30
                      ) /
                      60
                    )
                  ),
                delaySeconds:
                  numberOrNull(
                    update?.arrival?.delay
                  ) ??
                  numberOrNull(
                    update?.departure?.delay
                  ),
                scheduleRelationship:
                  cleanText(
                    update?.scheduleRelationship
                  ),
              })
            }
          )
      }
    )

  arrivals.sort(
    (
      a,
      b
    ) =>
      a.arrivalTime -
      b.arrivalTime
  )

  return {
    ok:
      true,
    source:
      'Toronto Transit Commission GTFS-Realtime Trip Updates',
    upstream:
      TTC_TRIPS_URL,
    attribution:
      TORONTO_ATTRIBUTION,
    updatedAt:
      new Date()
        .toISOString(),
    feedTimestamp:
      numberOrNull(
        feed?.header?.timestamp
      ),
    stop: stop
      ? {
          id:
            stop.id,
          code:
            stop.code,
          name:
            stop.name,
          latitude:
            stop.latitude,
          longitude:
            stop.longitude,
        }
      : {
          id:
            normalizedStopId,
          code:
            '',
          name:
            '',
          latitude:
            null,
          longitude:
            null,
        },
    count:
      Math.min(
        dedupeArrivalsByVehicleOrTrip(
          arrivals
        ).length,
        16
      ),
    arrivals:
      dedupeArrivalsByVehicleOrTrip(
        arrivals
      ).slice(
        0,
        16
      ),
  }
}


async function getArrivalsPayload({
  stopId,
  stopCode,
}) {
  const surface =
    await getSurfaceNetwork()
  const normalizedStopId =
    cleanText(
      stopId
    )
  const staticStop =
    surface.stopsById.get(
      normalizedStopId
    )
  const normalizedStopCode =
    cleanText(
      stopCode
    ) ||
    cleanText(
      staticStop?.code
    )

  if (
    normalizedStopCode
  ) {
    try {
      const [
        arrivals,
        gpsArrivals,
      ] =
        await Promise.all([
          getUmoArrivalsForStopCode(
            normalizedStopCode,
            surface
          ),
          getGpsVehicleArrivalsForStop(
            staticStop,
            surface
          ),
        ])
      const mergedArrivals =
        dedupeArrivalsByVehicleOrTrip([
          ...gpsArrivals,
          ...arrivals,
        ])

      return {
        ok:
          true,
        source:
          'TTC Next Vehicle Arrival System · UMO NextBus',
        upstream:
          TTC_PREDICTIONS_URL,
        attribution:
          TORONTO_ATTRIBUTION,
        updatedAt:
          new Date()
            .toISOString(),
        stop: staticStop
          ? {
              id:
                staticStop.id,
              code:
                staticStop.code,
              name:
                staticStop.name,
              latitude:
                staticStop.latitude,
              longitude:
                staticStop.longitude,
            }
          : {
              id:
                normalizedStopId,
              code:
                normalizedStopCode,
              name:
                '',
              latitude:
                null,
              longitude:
                null,
            },
        count:
          Math.min(
            mergedArrivals.length,
            18
          ),
        arrivals:
          mergedArrivals.slice(
            0,
            18
          ),
      }
    }
    catch (
      error
    ) {
      console.warn(
        'LIVE TTC ARRIVALS · UMO prediction fallback to GTFS-RT:',
        error?.message ||
        error
      )
    }
  }

  const fallbackPayload =
    await getGtfsArrivalsPayload(
      normalizedStopId
    )
  const gpsArrivals =
    await getGpsVehicleArrivalsForStop(
      staticStop,
      surface
    )
  const mergedArrivals =
    dedupeArrivalsByVehicleOrTrip([
      ...gpsArrivals,
      ...(fallbackPayload.arrivals || []),
    ]).slice(
      0,
      18
    )

  return {
    ...fallbackPayload,
    count:
      mergedArrivals.length,
    arrivals:
      mergedArrivals,
  }
}


async function getNearbyArrivalsPayload(
  latitude,
  longitude,
  name =
    ''
) {
  const centerLatitude =
    numberOrNull(
      latitude
    )
  const centerLongitude =
    numberOrNull(
      longitude
    )

  if (
    centerLatitude ===
      null ||
    centerLongitude ===
      null
  ) {
    throw new Error(
      'latitude and longitude are required'
    )
  }

  const surface =
    await getSurfaceNetwork()

  const nearbyStops =
    surface.stops
      .map(
        (
          stop
        ) => ({
          stop,
          distance:
            distanceMeters(
              centerLatitude,
              centerLongitude,
              stop.latitude,
              stop.longitude
            ),
        })
      )
      .filter(
        (
          item
        ) =>
          item.distance <=
            240 &&
          cleanText(
            item.stop?.code
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          a.distance -
          b.distance
      )

  const uniqueCodes =
    []
  const seenCodes =
    new Set()

  nearbyStops.forEach(
    (
      item
    ) => {
      const code =
        cleanText(
          item.stop.code
        )

      if (
        !code ||
        seenCodes.has(
          code
        ) ||
        uniqueCodes.length >=
          8
      ) {
        return
      }

      seenCodes.add(
        code
      )
      uniqueCodes.push({
        code,
        stop:
          item.stop,
        distance:
          item.distance,
      })
    }
  )

  const results =
    await Promise.allSettled(
      uniqueCodes.map(
        (
          item
        ) =>
          getUmoArrivalsForStopCode(
            item.code,
            surface
          )
      )
    )

  const arrivals =
    []

  results.forEach(
    (
      result,
      index
    ) => {
      if (
        result.status !==
          'fulfilled'
      ) {
        return
      }

      result.value.forEach(
        (
          arrival
        ) => {
          arrivals.push({
            ...arrival,
            stopCode:
              uniqueCodes[index]?.code ||
              arrival.stopCode ||
              '',
            stopName:
              uniqueCodes[index]?.stop?.name ||
              '',
          })
        }
      )
    }
  )

  const deduped =
    dedupeArrivalsByVehicleOrTrip(
      arrivals
    )

  return {
    ok:
      true,
    source:
      'TTC Next Vehicle Arrival System · nearby surface stops',
    upstream:
      TTC_PREDICTIONS_URL,
    attribution:
      TORONTO_ATTRIBUTION,
    updatedAt:
      new Date()
        .toISOString(),
    station: {
      name:
        cleanText(
          name
        ),
      latitude:
        centerLatitude,
      longitude:
        centerLongitude,
    },
    stops:
      uniqueCodes.map(
        (
          item
        ) => ({
          code:
            item.code,
          name:
            item.stop.name,
          distanceMeters:
            Math.round(
              item.distance
            ),
        })
      ),
    count:
      Math.min(
        deduped.length,
        20
      ),
    arrivals:
      deduped.slice(
        0,
        20
      ),
  }
}


// ============================================================
// PUBLIC VITE / PRODUCTION SERVER PLUGIN
// ============================================================

export function ttcLiveTransitFeed() {
  return {
    name:
      'geographic-ttc-live-transit',

    configureServer(
      server
    ) {
      server.middlewares.use(
        LIVE_TTC_ENDPOINT,
        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
            'GET'
          ) {
            next()
            return
          }

          let url =
            null

          try {
            url =
              readRequestUrl(
                req
              )

            const pathname =
              url.pathname

            if (
              pathname ===
                '/network' ||
              pathname ===
                '/network/'
            ) {
              sendJson(
                res,
                200,
                await getNetworkPayload(
                  url
                ),
                {
                  cacheControl:
                    'public, max-age=20, stale-while-revalidate=60',
                }
              )
              return
            }

            if (
              pathname ===
                '/vehicles' ||
              pathname ===
                '/vehicles/'
            ) {
              sendJson(
                res,
                200,
                await getVehiclesPayload(
                  url
                )
              )
              return
            }

            if (
              pathname ===
                '/arrivals/nearby' ||
              pathname ===
                '/arrivals/nearby/'
            ) {
              sendJson(
                res,
                200,
                await getNearbyArrivalsPayload(
                  url.searchParams.get(
                    'latitude'
                  ),
                  url.searchParams.get(
                    'longitude'
                  ),
                  url.searchParams.get(
                    'name'
                  )
                )
              )
              return
            }

            if (
              pathname ===
                '/arrivals' ||
              pathname ===
                '/arrivals/'
            ) {
              const stopId =
                url.searchParams.get(
                  'stopId'
                )
              const stopCode =
                url.searchParams.get(
                  'stopCode'
                )

              sendJson(
                res,
                200,
                await getArrivalsPayload({
                  stopId,
                  stopCode,
                })
              )
              return
            }

            if (
              pathname ===
                '/' ||
              pathname ===
                ''
            ) {
              sendJson(
                res,
                200,
                {
                  ok:
                    true,
                  service:
                    'Toronto Geographic Live TTC',
                  endpoints: [
                    'network',
                    'vehicles',
                    'arrivals?stopId=...&stopCode=...',
                    'arrivals/nearby?latitude=...&longitude=...',
                  ],
                  attribution:
                    TORONTO_ATTRIBUTION,
                }
              )
              return
            }

            next()
          }
          catch (
            error
          ) {
            console.error(
              'LIVE TTC FEED ERROR:',
              error
            )

            sendJson(
              res,
              502,
              {
                ok:
                  false,
                error:
                  cleanText(
                    error?.message ||
                    error
                  ) ||
                  'Live TTC unavailable',
                path:
                  url?.pathname ||
                  '',
              }
            )
          }
        }
      )
    },
  }
}
