// TTC V18 - disputed stop arrivals stay visibly unresolved until proven passed
// TTC V17 - stable UMO-to-GTFS vehicle/trip/stop association across ETA revisions
// TTC STOP PASSAGE V16 - confirm UMO vehicle progress without equating trip IDs
// TTC STOP TRUTH V15 - distinguish predicted, GPS-confirmed and unverified arrivals
// TTC STOP ARRIVALS V14 - no network waits in passage reconciliation; conservative GPS
// TTC STOP INSTANT V12 - realtime arrivals never wait for static SurfaceGTFS
// TTC STOP POLISH V11 - indexed stop arrivals + explicit live-layer prewarm
// TTC STOP FAST V10 - hot TripUpdate cache for instant stop popups
// TTC STOP SYNC V9 - 2026-10-06 - BusTime TripUpdates paired with BusTime VehiclePositions
// LIVE TTC FAST START V8
// LIVE TTC STABILITY V6 Â· 2026-09-30 Â· reject empty realtime feeds + deduped arrivals + resilient vehicle retention
import https from 'node:https'
import { inflateRawSync } from 'node:zlib'

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'


const TTC_SURFACE_GTFS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/bd4809dd-e289-4de8-bbde-c5c00dafbf4f/resource/28514055-d011-4ed7-8bb0-97961dfe2b66/download/SurfaceGTFS.zip'

const TTC_FULL_GTFS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/7795b45e-e65a-4465-81fc-c36b9dfff169/resource/cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/TTC%20Routes%20and%20Schedules%20Data.zip'

const TTC_VEHICLES_URL =
  'https://bustime.ttc.ca/gtfsrt/vehicles'

const TTC_VEHICLES_FALLBACK_URL =
  'https://gtfsrt.ttc.ca/vehicles/position?format=binary'

const TTC_TRIPS_URL =
  'https://bustime.ttc.ca/gtfsrt/trips'

const TTC_TRIPS_FALLBACK_URL =
  'https://gtfsrt.ttc.ca/trips/update?format=binary'

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
  1400

// TTC STOP FAST V10 - serve the last good TripUpdate feed immediately while
// refreshing it in the background. Stop clicks should never wait on TTC I/O.
const TRIP_UPDATE_SERVE_CACHE_MS =
  10 * 1000

const TRIP_UPDATE_WARM_INTERVAL_MS =
  1800

const UMO_PREDICTION_CACHE_MS =
  10 * 1000

// Do not remove an imminent arrival based on GPS as old as the TTC
// VehiclePosition samples seen in the live stop 3121 diagnostic (~50s).
const ARRIVAL_PASSAGE_MAX_VEHICLE_AGE_SECONDS =
  25

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
let tripUpdateStopIndex = null

const umoPredictionCache =
  new Map()

// Short-lived, bounded in-memory history for each clicked stop. This is NOT
// a claim that a disappeared ETA was served; it makes that uncertainty visible.
const stopArrivalHistory = new Map()
const STOP_UNVERIFIED_GRACE_MS = 150 * 1000
const STOP_HISTORY_LIMIT = 120
const STOP_GPS_MAX_AGE_SECONDS = 25
// Only same-route/same-vehicle BusTime trip progression can retire a UMO ETA.
// Delayed observations may be used to prove a PAST stop, never to claim
// a vehicle is currently at a stop.
const UMO_PASSAGE_MAX_GPS_AGE_SECONDS = 100
const UMO_TRIP_STOP_MEMORY_MS = 12 * 60 * 1000
const UMO_PASSED_SUPPRESSION_MS = 4 * 60 * 1000
const STOP_EXPIRED_ETA_GRACE_SECONDS = 20
const UMO_STOP_TARGET_LIMIT = 3500
const UMO_PASSED_LIMIT = 1500
const umoTripStopTargets = new Map()
const umoConfirmedPassages = new Map()
// Separate, stable association for the UMO prediction's OWN tripTag.
// The UMO tripTag is not a GTFS trip_id; it is never compared as one.
const umoArrivalTripLinks = new Map()
const UMO_ARRIVAL_LINK_MAX = 3000
const UMO_ARRIVAL_LINK_MAX_MS = 12 * 60 * 1000
const UMO_ARRIVAL_INITIAL_TIME_TOLERANCE_SECONDS = 4 * 60


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
                  `TTC request failed (${statusCode}) Â· ${url}`
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
                `TTC request timed out after ${timeoutMs}ms Â· ${url}`
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
  let fetchError =
    null

  try {
    const controller =
      new AbortController()

    const timeoutId =
      setTimeout(
        () => {
          controller.abort()
        },
        REALTIME_FETCH_TIMEOUT_MS
      )

    try {
      const response =
        await fetch(
          url,
          {
            method:
              'GET',
            headers: {
              Accept:
                'application/x-protobuf, application/octet-stream, */*',
              'User-Agent':
                'TorontoGeographic/1.0',
            },
            cache:
              'no-store',
            signal:
              controller.signal,
          }
        )

      if (
        !response.ok
      ) {
        throw new Error(
          `TTC fetch failed (${response.status}) Â· ${url}`
        )
      }

      const arrayBuffer =
        await response.arrayBuffer()

      return decodeRealtimeFeed(
        Buffer.from(
          arrayBuffer
        )
      )
    }
    finally {
      clearTimeout(
        timeoutId
      )
    }
  }
  catch (
    error
  ) {
    fetchError =
      error
  }

  // Retain the original HTTPS code path as a second transport.
  try {
    return decodeRealtimeFeed(
      await fetchBuffer(
        url,
        0,
        REALTIME_FETCH_TIMEOUT_MS
      )
    )
  }
  catch (
    httpsError
  ) {
    throw new Error(
      `TTC realtime fetch failed Â· fetch: ${fetchError?.message || fetchError} Â· https: ${httpsError?.message || httpsError}`
    )
  }
}


// TripUpdate provenance is carried with the decoded data, so a response never
// attributes predictions from the legacy fallback URL to BusTime by mistake.
async function fetchRealtimeFeedWithFallback(
  primaryUrl,
  fallbackUrl
) {
  try {
    return {
      feed: await fetchRealtimeFeed(primaryUrl),
      upstream: primaryUrl,
      usedLegacyFallback: false,
    }
  }
  catch (primaryError) {
    try {
      const feed = await fetchRealtimeFeed(fallbackUrl)
      console.warn(
        'LIVE TTC TRIPS: primary unavailable; using legacy fallback:',
        primaryError?.message || primaryError
      )
      return {
        feed,
        upstream: fallbackUrl,
        usedLegacyFallback: true,
      }
    }
    catch (fallbackError) {
      throw new Error(
        `TTC realtime feeds unavailable: primary: ${primaryError?.message || primaryError}; fallback: ${fallbackError?.message || fallbackError}`
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


async function fetchUsableVehicleFeed(
  url,
  label
) {
  const feed =
    await fetchRealtimeFeed(
      url
    )

  if (
    !vehicleFeedHasPositions(
      feed
    )
  ) {
    throw new Error(
      `${label} vehicle feed returned no usable positions`
    )
  }

  return feed
}


async function fetchVehicleRealtimeFeed() {
  let settled =
    false

  const primaryPromise =
    fetchUsableVehicleFeed(
      TTC_VEHICLES_URL,
      'TTC primary'
    )

  const fallbackPromise =
    new Promise(
      (
        resolve,
        reject
      ) => {
        setTimeout(
          () => {
            if (
              settled
            ) {
              reject(
                new Error(
                  'TTC fallback hedge cancelled'
                )
              )
              return
            }

            fetchUsableVehicleFeed(
              TTC_VEHICLES_FALLBACK_URL,
              'TTC fallback'
            )
              .then(
                resolve,
                reject
              )
          },
          700
        )
      }
    )

  try {
    const feed =
      await Promise.any([
        primaryPromise,
        fallbackPromise,
      ])

    settled =
      true
    return feed
  }
  catch (
    error
  ) {
    settled =
      true

    const details =
      Array.isArray(
        error?.errors
      )
        ? error.errors
            .map(
              (
                item
              ) =>
                item?.message ||
                String(
                  item
                )
            )
            .join(
              ' Â· '
            )
        : error?.message ||
          String(
            error
          )

    throw new Error(
      `TTC vehicle feeds unavailable Â· ${details}`
    )
  }
}


function refreshVehicleFeedInBackground() {
  if (
    vehiclePromise
  ) {
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
              'LIVE TTC VEHICLES Â· keeping cached feed after upstream failure:',
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

  return vehiclePromise
}


async function getRawVehicleFeed({
  preferFresh =
    false,
} = {}) {
  const cacheAge =
    vehicleCache
      ? Date.now() -
        vehicleCache.cachedAt
      : Infinity

  if (
    vehicleCache &&
    cacheAge <
      REALTIME_CACHE_MS
  ) {
    return vehicleCache.feed
  }

  if (
    preferFresh
  ) {
    const refreshPromise =
      refreshVehicleFeedInBackground()

    if (
      vehicleCache
    ) {
      // Live polling prefers the new upstream sample, but never freezes the
      // map behind a slow TTC request. Fall back to the recent cache quickly.
      return Promise.race([
        refreshPromise,
        new Promise(
          (
            resolve
          ) => {
            setTimeout(
              () => {
                resolve(
                  vehicleCache.feed
                )
              },
              900
            )
          }
        ),
      ])
    }

    return refreshPromise
  }

  if (
    vehicleCache &&
    cacheAge <
      REALTIME_STALE_FALLBACK_MS
  ) {
    // Startup/first paint: show a recent fleet immediately and refresh it in
    // the background. Subsequent client polls request fresh=1.
    refreshVehicleFeedInBackground()
      .catch(
        (
          error
        ) => {
          console.warn(
            'LIVE TTC VEHICLES Â· background refresh failed:',
            error?.message ||
              error
          )
        }
      )

    return vehicleCache.feed
  }

  return refreshVehicleFeedInBackground()
}


const VEHICLE_WARM_INTERVAL_MS =
  1800

let vehicleWarmTimer =
  null


function warmVehicleFeed() {
  refreshVehicleFeedInBackground()
    .catch(
      (
        error
      ) => {
        console.warn(
          'LIVE TTC VEHICLE WARMUP:',
          error?.message ||
            error
        )
      }
    )
}


function startVehicleWarmLoop(
  httpServer
) {
  if (
    vehicleWarmTimer
  ) {
    return
  }

  // Start immediately during server boot so the first map visitor normally
  // receives an already-decoded realtime vehicle feed.
  warmVehicleFeed()

  vehicleWarmTimer =
    setInterval(
      warmVehicleFeed,
      VEHICLE_WARM_INTERVAL_MS
    )

  vehicleWarmTimer
    ?.unref?.()

  httpServer
    ?.once?.(
      'close',
      () => {
        if (
          vehicleWarmTimer
        ) {
          clearInterval(
            vehicleWarmTimer
          )
          vehicleWarmTimer =
            null
        }
      }
    )
}



function buildTripUpdateStopIndex(
  feed
) {
  const stopEntitySets =
    new Map()

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
      const updates =
        Array.isArray(
          entity?.tripUpdate?.stopTimeUpdate
        )
          ? entity.tripUpdate.stopTimeUpdate
          : []

      updates.forEach(
        (
          update
        ) => {
          const stopId =
            cleanText(
              update?.stopId
            )

          if (
            !stopId
          ) {
            return
          }

          let bucket =
            stopEntitySets.get(
              stopId
            )

          if (
            !bucket
          ) {
            bucket =
              new Set()
            stopEntitySets.set(
              stopId,
              bucket
            )
          }

          bucket.add(
            entity
          )
        }
      )
    }
  )

  const index =
    new Map()

  stopEntitySets.forEach(
    (
      entities,
      stopId
    ) => {
      index.set(
        stopId,
        [
          ...entities,
        ]
      )
    }
  )

  return index
}


function refreshTripUpdateFeedInBackground() {
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
          result
        ) => {
          const feed = result.feed
          tripUpdateCache = {
            cachedAt:
              Date.now(),
            feed,
            upstream: result.upstream,
            usedLegacyFallback: result.usedLegacyFallback,
          }
          tripUpdateStopIndex =
            buildTripUpdateStopIndex(
              feed
            )
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
              'LIVE TTC TRIPS Â· keeping cached feed after upstream failure:',
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


async function getRawTripUpdateFeed() {
  const cacheAge =
    tripUpdateCache
      ? Date.now() -
        tripUpdateCache.cachedAt
      : Infinity

  // Stop clicks should be instant. If a recent-good TripUpdate feed exists,
  // serve it immediately and refresh asynchronously when it is older than
  // the realtime freshness target.
  if (
    tripUpdateCache &&
    cacheAge <
      TRIP_UPDATE_SERVE_CACHE_MS
  ) {
    if (
      cacheAge >=
        REALTIME_CACHE_MS
    ) {
      refreshTripUpdateFeedInBackground()
        .catch(
          (
            error
          ) => {
            console.warn(
              'LIVE TTC TRIP WARMUP:',
              error?.message ||
                error
            )
          }
        )
    }

    return tripUpdateCache.feed
  }

  // Only the very first server warmup should ever have to await TTC.
  return refreshTripUpdateFeedInBackground()
}


let tripUpdateWarmTimer =
  null


function warmTripUpdateFeed() {
  refreshTripUpdateFeedInBackground()
    .catch(
      (
        error
      ) => {
        console.warn(
          'LIVE TTC TRIP WARMUP:',
          error?.message ||
            error
        )
      }
    )
}


function startTripUpdateWarmLoop(
  httpServer
) {
  if (
    tripUpdateWarmTimer
  ) {
    return
  }

  // Prime TripUpdates at server boot so the first stop click normally has
  // a decoded feed waiting in memory already.
  warmTripUpdateFeed()

  tripUpdateWarmTimer =
    setInterval(
      warmTripUpdateFeed,
      TRIP_UPDATE_WARM_INTERVAL_MS
    )

  tripUpdateWarmTimer
    ?.unref?.()

  httpServer
    ?.once?.(
      'close',
      () => {
        if (
          tripUpdateWarmTimer
        ) {
          clearInterval(
            tripUpdateWarmTimer
          )
          tripUpdateWarmTimer =
            null
        }
      }
    )
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
  // the static cache once it has warmed in the background.
  const preferFresh =
    url.searchParams.get(
      'fresh'
    ) ===
      '1'

  const feed =
    await getRawVehicleFeed({
      preferFresh,
    })

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

  const allVehicles =
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

  const freshVehicles =
    allVehicles.filter(
      (
        vehicle
      ) =>
        vehicle.ageSeconds <=
        15 *
          60
    )

  const candidateVehicles =
    freshVehicles.length >
      0
      ? freshVehicles
      : allVehicles

  const usedStaleTimestampFallback =
    freshVehicles.length ===
      0 &&
    allVehicles.length >
      0


  let vehicles =
    candidateVehicles.filter(
      (
        vehicle
      ) =>
        pointInBounds(
          vehicle.longitude,
          vehicle.latitude,
          bounds
        )
    )

  let usedBoundsFallback =
    false

  if (
    vehicles.length ===
      0 &&
    candidateVehicles.length >
      0
  ) {
    // A healthy TTC feed should never become a blank map because of a bad
    // transient viewport/bounds value. MapLibre will only draw what is in view.
    vehicles =
      candidateVehicles
    usedBoundsFallback =
      true
  }

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
    rawCount:
      allVehicles.length,
    freshCount:
      freshVehicles.length,
    candidateCount:
      candidateVehicles.length,
    usedStaleTimestampFallback,
    usedBoundsFallback,
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
          tripId
            ? `trip:${routeId}:${tripId}:${numberOrNull(arrival?.stopSequence) ?? ''}`
            : vehicleId
              ? `vehicle:${routeId}:${vehicleId}`
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

  const cachedPrediction =
    umoPredictionCache.get(
      normalizedStopCode
    )

  if (
    cachedPrediction &&
    Date.now() -
      cachedPrediction.cachedAt <
      UMO_PREDICTION_CACHE_MS
  ) {
    return cachedPrediction.arrivals
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

  const deduped =
    dedupeArrivalsByVehicleOrTrip(
      arrivals
    )

  umoPredictionCache.set(
    normalizedStopCode,
    {
      cachedAt:
        Date.now(),
      arrivals:
        deduped,
    }
  )

  return deduped
}


// Retire a TripUpdate arrival only on positive evidence from a fresh
// VehiclePosition for the SAME vehicle + SAME GTFS trip. Never join by vehicle
// ID alone: the TripUpdate feed can contain multiple trips for a vehicle.
async function removeArrivalsForVehiclesPastStop(
  arrivals,
  stopId,
  onConfirmedPassed = null
) {
  const candidates = Array.isArray(arrivals) ? arrivals : []
  if (
    !cleanText(stopId) ||
    !candidates.some((arrival) =>
      cleanText(arrival?.vehicleId) &&
      cleanText(arrival?.tripId) &&
      numberOrNull(arrival?.stopSequence) !== null
    )
  ) {
    return candidates
  }

  try {
    // Stop clicks must not wait for a vehicle GPS network request. The
    // vehicle feed has its own warm loop; only use a recent cached snapshot
    // for positive passage evidence. No snapshot means keep the prediction.
    // Legacy GTFS trip identifiers may not match BusTime vehicle trips.
    if (tripUpdateCache?.usedLegacyFallback) return candidates
    const vehicleFeed = vehicleCache &&
      Date.now() - vehicleCache.cachedAt <= REALTIME_STALE_FALLBACK_MS
        ? vehicleCache.feed
        : null
    if (!vehicleFeed) return candidates
    const nowSeconds = Math.floor(Date.now() / 1000)
    const vehiclesByExactTrip = new Map()

    for (const entity of Array.isArray(vehicleFeed?.entity) ? vehicleFeed.entity : []) {
      const vehicle = entity?.vehicle
      const vehicleId = cleanText(vehicle?.vehicle?.id) || cleanText(vehicle?.vehicle?.label)
      const tripId = cleanText(vehicle?.trip?.tripId)
      const timestamp = numberOrNull(vehicle?.timestamp) ??
        numberOrNull(vehicleFeed?.header?.timestamp)
      const sequence = numberOrNull(vehicle?.currentStopSequence)

      // Unknown/old GPS and unassigned trips must never erase an arrival.
      if (!vehicleId || !tripId || timestamp === null || sequence === null) continue
      const ageSeconds = Math.max(0, nowSeconds - timestamp)
      if (ageSeconds > ARRIVAL_PASSAGE_MAX_VEHICLE_AGE_SECONDS) continue

      const key = JSON.stringify([vehicleId, tripId])
      const previous = vehiclesByExactTrip.get(key)
      if (!previous || timestamp > previous.timestamp) {
        vehiclesByExactTrip.set(key, {
          timestamp,
          sequence,
          routeId: cleanText(vehicle?.trip?.routeId),
        })
      }
    }

    return candidates.filter((arrival) => {
      const vehicleId = cleanText(arrival?.vehicleId)
      const tripId = cleanText(arrival?.tripId)
      const targetSequence = numberOrNull(arrival?.stopSequence)
      if (!vehicleId || !tripId || targetSequence === null) return true

      const matched = vehiclesByExactTrip.get(JSON.stringify([vehicleId, tripId]))
      if (!matched) return true

      // A realtime route conflict makes passage ambiguous; preserve the ETA.
      const arrivalRouteId = cleanText(arrival?.routeId)
      if (arrivalRouteId && matched.routeId && arrivalRouteId !== matched.routeId) {
        return true
      }

      if (matched.sequence > targetSequence) {
        if (typeof onConfirmedPassed === 'function') {
          onConfirmedPassed(arrival)
        }
        return false
      }
      return true
    })
  }
  catch (error) {
    console.warn('LIVE TTC ARRIVAL PASSAGE GUARD:', error?.message || error)
    return candidates
  }
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

  const feed =
    await getRawTripUpdateFeed()

  // Stop clicks must never wait on the large static SurfaceGTFS archive.
  // Use static metadata only when it is already warm; otherwise return the
  // realtime TripUpdate result immediately and warm static data in background.
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
            'LIVE TTC ARRIVALS STATIC WARMUP:',
            error?.message ||
              error
          )
        }
      )
  }

  const stop =
    surface?.stopsById?.get(
      normalizedStopId
    )

  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )

  const arrivals =
    []

  const candidateEntities =
    tripUpdateCache?.feed ===
      feed &&
    tripUpdateStopIndex?.has(
      normalizedStopId
    )
      ? tripUpdateStopIndex.get(
          normalizedStopId
        )
      : (
          Array.isArray(
            feed?.entity
          )
            ? feed.entity
            : []
        )

  const primaryDiagnostics = {
    tripFeedUpstream:
      tripUpdateCache?.feed === feed ? (tripUpdateCache.upstream || null) : null,
    usedLegacyTripFeed:
      tripUpdateCache?.feed === feed ? Boolean(tripUpdateCache.usedLegacyFallback) : null,
    tripFeedAgeSeconds:
      numberOrNull(feed?.header?.timestamp) === null
        ? null
        : Math.max(0, nowSeconds - numberOrNull(feed.header.timestamp)),
    rawExactStopUpdates: 0,
    parsedFutureArrivals: 0,
    removedByPassage: 0,
    keptAfterPassage: 0,
    vehicleCacheAgeSeconds:
      vehicleCache ? Math.max(0, Math.round((Date.now() - vehicleCache.cachedAt) / 1000)) : null,
    passageRequiresRecentGpsSeconds:
      ARRIVAL_PASSAGE_MAX_VEHICLE_AGE_SECONDS,
  }

  // Count matching raw updates BEFORE route, time and vehicle filters.
  // This distinguishes "TTC sent no arrivals" from "we discarded arrivals".
  for (const entity of candidateEntities) {
    for (const update of Array.isArray(entity?.tripUpdate?.stopTimeUpdate)
      ? entity.tripUpdate.stopTimeUpdate : []) {
      if (cleanText(update?.stopId) === normalizedStopId) {
        primaryDiagnostics.rawExactStopUpdates += 1
      }
    }
  }

  candidateEntities
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
          surface?.trips?.get(
            tripId
          )

        const routeId =
          cleanText(
            tripUpdate?.trip?.routeId
          ) ||
          staticTrip?.routeId ||
          ''

        const route =
          surface?.routes?.get(
            routeId
          )

        if (
          !routeId
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

  primaryDiagnostics.parsedFutureArrivals = arrivals.length

  const confirmedPassedArrivals = []
  const reconciledArrivals =
    await removeArrivalsForVehiclesPastStop(
      arrivals,
      normalizedStopId,
      (arrival) => confirmedPassedArrivals.push(arrival)
    )

  primaryDiagnostics.keptAfterPassage = reconciledArrivals.length
  primaryDiagnostics.removedByPassage =
    arrivals.length - reconciledArrivals.length

  reconciledArrivals.sort(
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
      primaryDiagnostics.tripFeedUpstream || TTC_TRIPS_URL,
    primaryDiagnostics,
    confirmedPassedArrivals,
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
          reconciledArrivals
        ).length,
        16
      ),
    arrivals:
      dedupeArrivalsByVehicleOrTrip(
        reconciledArrivals
      ).slice(
        0,
        16
      ),
  }
}


async function getArrivalsPayloadUnreconciled({
  stopId,
  stopCode,
}) {
  const arrivalRequestStart = Date.now()
  const normalizedStopId =
    cleanText(
      stopId
    )

  // Do not block an exact-stop GTFS-RT request on static GTFS.
  // Surface metadata is optional for the fast path and warms independently.
  let surface =
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
            'LIVE TTC ARRIVALS STATIC WARMUP:',
            error?.message ||
              error
          )
        }
      )
  }

  const staticStop =
    surface?.stopsById?.get(
      normalizedStopId
    )

  let normalizedStopCode =
    cleanText(
      stopCode
    ) ||
    cleanText(
      staticStop?.code
    )

  // TTC TRUTH MODE Â· Exact-stop ETA authority is GTFS-Realtime first.
  // VehiclePosition + TripUpdate share GTFS trip/vehicle/stop identities.
  // Never delete a UMO prediction using a GTFS stop sequence: UMO tripTag is
  // a separate identifier system and cross-splicing the two can drop the
  // actually-nearest vehicle.
  let gtfsPayload =
    null
  let gtfsError =
    null

  if (
    normalizedStopId
  ) {
    try {
      gtfsPayload =
        await getGtfsArrivalsPayload(
          normalizedStopId
        )

      if (
        Array.isArray(
          gtfsPayload?.arrivals
        ) &&
        gtfsPayload.arrivals.length >
          0
      ) {
        return {
          ...gtfsPayload,
          predictionAuthority:
            'GTFS-RT',
          requestElapsedMs: Date.now() - arrivalRequestStart,
        }
      }
    }
    catch (
      error
    ) {
      gtfsError =
        error
      console.warn(
        'LIVE TTC ARRIVALS Â· GTFS-RT primary unavailable:',
        error?.message ||
        error
      )
    }
  }

  if (
    !normalizedStopCode &&
    normalizedStopId
  ) {
    try {
      surface =
        surface ||
        await getSurfaceNetwork()
      normalizedStopCode =
        cleanText(
          surface?.stopsById?.get(
            normalizedStopId
          )?.code
        )
    }
    catch (
      error
    ) {
      console.warn(
        'LIVE TTC ARRIVALS FALLBACK STATIC LOOKUP:',
        error?.message ||
          error
      )
    }
  }

  if (
    normalizedStopCode
  ) {
    try {
      // The caller already has the stopCode. Never delay a UMO fallback on
      // loading the huge SurfaceGTFS archive; route metadata is optional.
      const fallbackSurface = surface

      const arrivals =
        await getUmoArrivalsForStopCode(
          normalizedStopCode,
          fallbackSurface
        )
      const sortedArrivals =
        [
          ...arrivals,
        ].sort(
          (
            a,
            b
          ) =>
            Number(
              a?.arrivalTime ||
              0
            ) -
            Number(
              b?.arrivalTime ||
              0
            )
        )

      return {
        ok:
          true,
        source:
          'TTC Next Vehicle Arrival System Â· UMO NextBus Â· fallback',
        upstream:
          TTC_PREDICTIONS_URL,
        predictionAuthority:
          'UMO_FALLBACK',
        requestElapsedMs: Date.now() - arrivalRequestStart,
        primaryDiagnostics: gtfsPayload?.primaryDiagnostics || {
          status: gtfsError ? 'GTFS_FETCH_ERROR' : 'GTFS_NO_RESULT',
          error: gtfsError ? String(gtfsError.message || gtfsError).slice(0, 220) : null,
        },
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
            sortedArrivals.length,
            18
          ),
        arrivals:
          sortedArrivals.slice(
            0,
            18
          ),
      }
    }
    catch (
      error
    ) {
      console.warn(
        'LIVE TTC ARRIVALS Â· UMO fallback unavailable:',
        error?.message ||
        error
      )
    }
  }

  if (
    gtfsPayload
  ) {
    return {
      ...gtfsPayload,
      predictionAuthority:
        'GTFS-RT_EMPTY',
      requestElapsedMs: Date.now() - arrivalRequestStart,
    }
  }

  if (
    gtfsError
  ) {
    throw gtfsError
  }

  return getGtfsArrivalsPayload(
    normalizedStopId
  )
}


// TTC V18 - Check previously-listed arrivals for positive passage even if the
// upstream TripUpdate / UMO row has already disappeared. This is evidence-only;
// expiration, a missing prediction, and spatial proximity are NOT proof.
function provePreviouslyListedArrivalPassed(arrival, authority, stopId, vehicleIndex, nowSeconds) {
  if (authority === 'UMO_FALLBACK') {
    return proveUmoVehiclePassedStop(arrival, stopId, vehicleIndex, nowSeconds)
  }
  if (authority !== 'GTFS-RT' || tripUpdateCache?.usedLegacyFallback) return false
  const vehicleId = cleanText(arrival?.vehicleId)
  const tripId = cleanText(arrival?.tripId)
  const target = numberOrNull(arrival?.stopSequence)
  if (!vehicleId || !tripId || target === null) return false
  const vehicle = vehicleIndex.get(JSON.stringify([vehicleId, tripId]))
  if (!vehicle || vehicle.sequence === null) return false
  const age = nowSeconds - vehicle.timestamp
  if (!Number.isFinite(age) || age < -15 || age > ARRIVAL_PASSAGE_MAX_VEHICLE_AGE_SECONDS) return false
  if (vehicle.routeId && cleanText(arrival.routeId) && vehicle.routeId !== cleanText(arrival.routeId)) return false
  return vehicle.sequence > target
}

// Stop truth: absence from a prediction feed is NOT evidence of passage.
// A short history is maintained only for stops someone has queried. It is
// bounded in time and size, and never fabricates an updated ETA.
function arrivalTruthKey(arrival, authority) {
  const tripId = cleanText(arrival?.tripId)
  const vehicleId = cleanText(arrival?.vehicleId)
  const routeId = cleanText(arrival?.routeId)
  const directionId = cleanText(arrival?.directionId)
  if (!tripId && !vehicleId) return ''
  // GTFS trip+stop is stable even if TTC reassigns the vehicle or omits
  // direction metadata on a subsequent update. UMO uses a different identity.
  return authority === 'GTFS-RT'
    ? JSON.stringify([authority, routeId, tripId, numberOrNull(arrival?.stopSequence)])
    : JSON.stringify([authority, routeId, directionId, tripId, vehicleId])
}

function arrivalTruthVehicleIndex(nowSeconds) {
  const index = new Map()
  const feed = vehicleCache?.feed
  // Never let old cached GPS pretend to be a live observation.
  if (!feed || Date.now() - vehicleCache.cachedAt > REALTIME_STALE_FALLBACK_MS) {
    return index
  }
  for (const entity of Array.isArray(feed.entity) ? feed.entity : []) {
    const vehicle = entity?.vehicle
    const id = cleanText(vehicle?.vehicle?.id) || cleanText(vehicle?.vehicle?.label)
    const trip = cleanText(vehicle?.trip?.tripId)
    const timestamp = numberOrNull(vehicle?.timestamp)
    if (!id || !trip || timestamp === null) continue
    const key = JSON.stringify([id, trip])
    const prev = index.get(key)
    if (!prev || timestamp > prev.timestamp) {
      index.set(key, {
        timestamp,
        routeId: cleanText(vehicle?.trip?.routeId),
        sequence: numberOrNull(vehicle?.currentStopSequence),
        stopId: cleanText(vehicle?.stopId),
        status: numberOrNull(vehicle?.currentStatus),
        latitude: numberOrNull(vehicle?.position?.latitude),
        longitude: numberOrNull(vehicle?.position?.longitude),
      })
    }
  }
  return index
}

// Capture proof that a particular BusTime trip SERVES this precise GTFS stop.
// Keep the last known sequence briefly because TTC can omit a served stop
// from the very next TripUpdate; this is not a static stop proximity guess.
function rememberUmoTripStopTargets(stopId, nowMs) {
  const normalizedStop = cleanText(stopId)
  for (const [key, record] of umoTripStopTargets) {
    if (nowMs - record.observedAt > UMO_TRIP_STOP_MEMORY_MS) {
      umoTripStopTargets.delete(key)
    }
  }
  if (!normalizedStop || !tripUpdateCache || tripUpdateCache.usedLegacyFallback ||
      nowMs - tripUpdateCache.cachedAt > 90 * 1000) return
  const feedTimestamp = numberOrNull(tripUpdateCache.feed?.header?.timestamp)
  if (feedTimestamp === null ||
      Math.abs(Math.floor(nowMs / 1000) - feedTimestamp) > 120) return
  const entities = tripUpdateStopIndex?.get(normalizedStop) || []
  for (const entity of entities) {
    const update = entity?.tripUpdate
    const vehicleId = cleanText(update?.vehicle?.id)
    const tripId = cleanText(update?.trip?.tripId)
    const routeId = cleanText(update?.trip?.routeId)
    if (!vehicleId || !tripId || !routeId) continue
    const stopSequences = (Array.isArray(update?.stopTimeUpdate) ? update.stopTimeUpdate : [])
      .filter((item) => cleanText(item?.stopId) === normalizedStop)
      .map((item) => numberOrNull(item?.stopSequence))
      .filter((sequence) => sequence !== null)
    const key = JSON.stringify([normalizedStop, vehicleId, tripId])
    // A stop can occur twice on a loop. Never guess which occurrence UMO means.
    if (stopSequences.length !== 1) {
      umoTripStopTargets.delete(key)
      continue
    }
    const matchingTimeUpdate = update.stopTimeUpdate.find((item) =>
      cleanText(item?.stopId) === normalizedStop &&
      numberOrNull(item?.stopSequence) === stopSequences[0])
    const predictedVisitTime = realtimeStopTime(matchingTimeUpdate)
    // Route and vehicle alone cannot identify the same scheduled VISIT:
    // UMO may show this vehicle's next trip on the same line.
    if (predictedVisitTime === null) continue
    umoTripStopTargets.delete(key)
    umoTripStopTargets.set(key, {
      routeId, sequence: stopSequences[0],
      predictedVisitTime, observedAt: nowMs,
    })
  }
  while (umoTripStopTargets.size > UMO_STOP_TARGET_LIMIT) {
    umoTripStopTargets.delete(umoTripStopTargets.keys().next().value)
  }
}

// The physical TTC vehicle ID is shared by UMO and BusTime. We can connect
// their DIFFERENT trip IDs only when the current BusTime trip lists this exact
// scheduled stop and the two initial visit-time predictions are compatible.
// Once established, keep the link across ETA revisions: a change from 1 to
// 4 minutes must not make a known approaching vehicle suddenly unmatched.
function umoArrivalLinkKey(arrival, stopId) {
  const vehicleId = cleanText(arrival?.vehicleId)
  const tripTag = cleanText(arrival?.tripId)
  const routeId = cleanText(arrival?.routeId)
  const directionId = cleanText(arrival?.directionId)
  const stop = cleanText(stopId)
  return vehicleId && tripTag && routeId && stop
    ? JSON.stringify([stop, vehicleId, routeId, directionId, tripTag])
    : ''
}

function pruneUmoArrivalLinks(nowMs) {
  for (const [key, link] of umoArrivalTripLinks) {
    if (nowMs - link.observedAt > UMO_ARRIVAL_LINK_MAX_MS) {
      umoArrivalTripLinks.delete(key)
    }
  }
  while (umoArrivalTripLinks.size > UMO_ARRIVAL_LINK_MAX) {
    umoArrivalTripLinks.delete(umoArrivalTripLinks.keys().next().value)
  }
}

function bindUmoArrivalsToActiveTrips(arrivals, stopId, vehicleIndex, nowSeconds) {
  const nowMs = nowSeconds * 1000
  const stop = cleanText(stopId)
  pruneUmoArrivalLinks(nowMs)
  if (!stop || !Array.isArray(arrivals)) return
  for (const arrival of arrivals) {
    const key = umoArrivalLinkKey(arrival, stop)
    if (!key) continue
    const vehicleId = cleanText(arrival.vehicleId)
    const routeId = cleanText(arrival.routeId)
    const existing = umoArrivalTripLinks.get(key)
    if (existing) {
      const currentVehicle = vehicleIndex.get(JSON.stringify([vehicleId, existing.gtfsTripId]))
      // A vehicle assigned to a DIFFERENT live trip is not proof this
      // prediction still belongs to the old trip; leave the ETA unverified.
      if (!currentVehicle) {
        // A transiently empty/stale VehiclePositions cache is not a trip change.
        // Keep the exact UMO -> GTFS association briefly; matching is suspended
        // until the SAME vehicle+GTFS trip becomes visible again.
        continue
      }
      if (!currentVehicle.routeId || currentVehicle.routeId === routeId) {
        existing.observedAt = nowMs
        continue
      }
      umoArrivalTripLinks.delete(key)
    }
    const umoTime = numberOrNull(arrival.arrivalTime)
    if (umoTime === null) continue
    const candidates = []
    for (const [vehicleKey, currentVehicle] of vehicleIndex) {
      let pair
      try { pair = JSON.parse(vehicleKey) } catch { continue }
      if (!Array.isArray(pair) || pair[0] !== vehicleId) continue
      const gtfsTripId = cleanText(pair[1])
      if (!gtfsTripId) continue
      const target = umoTripStopTargets.get(JSON.stringify([stop, vehicleId, gtfsTripId]))
      if (!target || target.routeId !== routeId ||
          (currentVehicle.routeId && currentVehicle.routeId !== routeId)) continue
      const age = nowSeconds - currentVehicle.timestamp
      if (!Number.isFinite(age) || age < -15 || age > UMO_PASSAGE_MAX_GPS_AGE_SECONDS) continue
      // Never make a NEW link to a trip that already passed this stop.
      // Already-established links are handled above.
      if (currentVehicle.sequence !== null && currentVehicle.sequence > target.sequence) continue
      const difference = Math.abs(umoTime - target.predictedVisitTime)
      if (difference > UMO_ARRIVAL_INITIAL_TIME_TOLERANCE_SECONDS) continue
      candidates.push({gtfsTripId, sequence:target.sequence, difference})
    }
    candidates.sort((a,b) => a.difference-b.difference)
    // If two different trip identities fit equally well, do not guess.
    if (!candidates.length || (candidates.length > 1 &&
        candidates[1].difference - candidates[0].difference < 60)) continue
    umoArrivalTripLinks.set(key, {
      gtfsTripId:candidates[0].gtfsTripId, routeId, vehicleId,
      stopSequence:candidates[0].sequence, observedAt:nowMs,
    })
  }
  pruneUmoArrivalLinks(nowMs)
}

function matchedUmoVehicle(arrival, stopId, vehicleIndex) {
  const key = umoArrivalLinkKey(arrival, stopId)
  const link = key ? umoArrivalTripLinks.get(key) : null
  if (!link) return null
  const vehicle = vehicleIndex.get(JSON.stringify([link.vehicleId, link.gtfsTripId]))
  if (!vehicle || (vehicle.routeId && vehicle.routeId !== link.routeId)) return null
  return {link, vehicle}
}

function proveUmoVehiclePassedStop(arrival, stopId, vehicleIndex, nowSeconds) {
  const matched = matchedUmoVehicle(arrival, stopId, vehicleIndex)
  if (!matched) return false
  const {vehicle, link} = matched
  const age = nowSeconds - vehicle.timestamp
  if (!Number.isFinite(age) || age < -15 || age > UMO_PASSAGE_MAX_GPS_AGE_SECONDS) return false
  return vehicle.sequence !== null && vehicle.sequence > link.stopSequence
}

function pruneUmoPassageHistory(nowMs) {
  for (const [key, expiry] of umoConfirmedPassages) {
    if (expiry <= nowMs) umoConfirmedPassages.delete(key)
  }
  while (umoConfirmedPassages.size > UMO_PASSED_LIMIT) {
    umoConfirmedPassages.delete(umoConfirmedPassages.keys().next().value)
  }
}

function addArrivalEvidence(arrival, authority, stop, nowSeconds, vehicleIndex) {
  const time = numberOrNull(arrival?.arrivalTime)
  const secondsUntil = time === null ? null : time - nowSeconds
  const output = { ...arrival, etaState: 'predicted', gpsAgeSeconds: null }
  // UMO tripTag and GTFS trip_id are different. Only use a previously
  // established vehicle+route+scheduled-stop association (above) to corroborate
  // position; never treat a matching route number alone as proof.
  if (authority === 'UMO_FALLBACK') {
    const paired = matchedUmoVehicle(arrival, stop?.id, vehicleIndex)
    if (!paired) {
      output.positionNote = 'TTC ETA estimate; vehicle/trip not matched'
      return output
    }
    const {vehicle, link} = paired
    const age = Math.max(0, nowSeconds - vehicle.timestamp)
    output.gpsAgeSeconds = Math.round(age)
    output.linkedVehicleId = link.vehicleId
    output.linkedGtfsTripId = link.gtfsTripId
    if (age > STOP_GPS_MAX_AGE_SECONDS) {
      output.positionNote = `Bus ${link.vehicleId} linked; GPS ${Math.round(age)}s old`
      return output
    }
    if (vehicle.sequence === null || vehicle.sequence !== link.stopSequence) {
      output.etaState = 'tracking'
      output.positionNote = `Bus ${link.vehicleId} tracked; scheduled stop not yet confirmed`
      return output
    }
    const lat = numberOrNull(stop?.latitude)
    const lon = numberOrNull(stop?.longitude)
    const canMeasure = lat !== null && lon !== null &&
      vehicle.latitude !== null && vehicle.longitude !== null
    const distance = canMeasure
      ? distanceMeters(lat, lon, vehicle.latitude, vehicle.longitude) : null
    output.gpsDistanceMeters = distance === null ? null : Math.round(distance)
    const sameTarget = !vehicle.stopId || !cleanText(stop?.id) ||
      vehicle.stopId === cleanText(stop.id)
    if (sameTarget && vehicle.status === 1 && distance !== null && distance <= 90) {
      output.etaState = 'at_stop'
      output.positionNote = `Bus ${link.vehicleId} at stop (GPS confirmed)`
    } else if (sameTarget && distance !== null && distance <= 130) {
      output.etaState = 'approaching'
      output.positionNote = `Bus ${link.vehicleId} approaching (${Math.round(distance)}m away)`
    } else {
      output.etaState = 'tracking'
      output.positionNote = distance === null
        ? `Bus ${link.vehicleId} tracked; location unavailable`
        : `Bus ${link.vehicleId} tracked; ${Math.round(distance)}m from stop`
    }
    return output
  }
  if (authority !== 'GTFS-RT') {
    output.positionNote = 'TTC prediction; vehicle location not verified'
    return output
  }
  const vehicleId = cleanText(arrival?.vehicleId)
  const tripId = cleanText(arrival?.tripId)
  const matched = vehicleId && tripId
    ? vehicleIndex.get(JSON.stringify([vehicleId, tripId]))
    : null
  if (!matched || (matched.routeId && cleanText(arrival.routeId) &&
    matched.routeId !== cleanText(arrival.routeId))) {
    output.positionNote = 'Vehicle location not verified'
    return output
  }
  const age = Math.max(0, nowSeconds - matched.timestamp)
  output.gpsAgeSeconds = age
  if (age > STOP_GPS_MAX_AGE_SECONDS) {
    output.positionNote = 'Vehicle GPS delayed'
    return output
  }
  const target = numberOrNull(arrival?.stopSequence)
  if (target === null || matched.sequence === null || matched.sequence !== target) {
    output.positionNote = 'Location tracked; stop arrival not confirmed'
    return output
  }
  // A TTC vehicle can report INCOMING_AT (0) while still a long way away.
  // Only the exact trip/stop + a near position, or STOPPED_AT (1), warrants
  // an approaching/at-stop claim. Do not infer this from the ETA clock.
  const lat = numberOrNull(stop?.latitude)
  const lon = numberOrNull(stop?.longitude)
  const canMeasure = lat !== null && lon !== null &&
    matched.latitude !== null && matched.longitude !== null
  const distance = canMeasure
    ? distanceMeters(lat, lon, matched.latitude, matched.longitude)
    : null
  output.gpsDistanceMeters = distance === null ? null : Math.round(distance)
  const sameTarget = !matched.stopId || !cleanText(stop?.id) ||
    matched.stopId === cleanText(stop.id)
  if (sameTarget && matched.status === 1 && (distance === null || distance <= 90)) {
    output.etaState = 'at_stop'
    output.positionNote = 'TTC reports vehicle at this stop'
  } else if (sameTarget && distance !== null && distance <= 130) {
    output.etaState = 'approaching'
    output.positionNote = 'Vehicle located near stop'
  } else {
    output.etaState = 'tracking'
    output.positionNote = secondsUntil !== null && secondsUntil <= 90
      ? 'ETA not confirmed by vehicle position'
      : 'Location tracked'
  }
  return output
}

function applyArrivalTruth(payload, stopId, stopCode) {
  if (!payload || !Array.isArray(payload.arrivals)) return payload
  const nowMs = Date.now()
  const nowSeconds = Math.floor(nowMs / 1000)
  const authority = cleanText(payload.predictionAuthority || 'GTFS-RT')
  const key = cleanText(stopId) || `code:${cleanText(stopCode)}`
  if (!key) return payload
  const previousState = stopArrivalHistory.get(key)
  const sameAuthority = previousState?.authority === authority
  // A source switch (BusTime -> UMO, or back) must NOT silently imply the
  // prior imminent bus passed. Preserve history with the original authority
  // per entry; never cross-join GTFS and UMO trip identifiers.
  const previousEntries = previousState?.entries || new Map()
  const fresh = new Map()
  const records = []
  const ghost = []
  const vehicleIndex = arrivalTruthVehicleIndex(nowSeconds)
  const passed = new Set((payload.confirmedPassedArrivals || [])
    .map((arrival) => arrivalTruthKey(arrival, authority))
    .filter(Boolean))
  const fallback = authority === 'UMO_FALLBACK'
  if (fallback) {
    rememberUmoTripStopTargets(stopId, nowMs)
    bindUmoArrivalsToActiveTrips(payload.arrivals, stopId, vehicleIndex, nowSeconds)
    pruneUmoPassageHistory(nowMs)
  }
  let newlyProvenUmoPassages = 0
  let expiredEstimateCount = 0
  let previouslyMissingPassagesConfirmed = 0

  for (const arrival of payload.arrivals) {
    const observed = addArrivalEvidence(arrival, authority, payload.stop, nowSeconds, vehicleIndex)
    const id = arrivalTruthKey(observed, authority)
    const passageKey = id ? JSON.stringify([key, id]) : ''
    if (fallback && id) {
      if (proveUmoVehiclePassedStop(arrival, stopId, vehicleIndex, nowSeconds)) {
        umoConfirmedPassages.delete(passageKey)
        umoConfirmedPassages.set(passageKey, nowMs + UMO_PASSED_SUPPRESSION_MS)
        newlyProvenUmoPassages++
      }
      if ((umoConfirmedPassages.get(passageKey) || 0) > nowMs) {
        passed.add(id)
        continue
      }
    }

    // Even if TTC continues publishing an already-expired row, the *only*
    // valid retirement signal is this exact vehicle/trip moving to a later
    // scheduled stop. An expired countdown by itself cannot retire it.
    if (id && provePreviouslyListedArrivalPassed(observed, authority, stopId, vehicleIndex, nowSeconds)) {
      passed.add(id)
      previouslyMissingPassagesConfirmed++
      continue
    }
    const eta = numberOrNull(observed.arrivalTime)
    const previouslyUnverifiedAt = id ? previousEntries.get(id)?.firstUnverifiedAt : null
    // An expired prediction is NOT a served stop. Remove its countdown, and
    // show it briefly under unverified instead of presenting a phantom bus.
    if (eta !== null && eta < nowSeconds - STOP_EXPIRED_ETA_GRACE_SECONDS &&
        observed.etaState !== 'at_stop') {
      expiredEstimateCount++
      const firstUnverifiedAt = previouslyUnverifiedAt ?? nowMs
      if (nowMs - firstUnverifiedAt <= STOP_UNVERIFIED_GRACE_MS) {
        const uncertain = {
          ...observed,
          etaState: 'unverified',
          unverifiedReason: 'ETA_EXPIRED',
          positionNote: 'ETA expired; stop visit not confirmed',
          lastPredictedTime: eta,
          arrivalTime: null,
          minutes: null,
        }
        ghost.push(uncertain)
        if (id) {
          fresh.set(id, {arrival: uncertain, lastSeen: nowMs,
            missingSince: nowMs, firstUnverifiedAt, sourceAuthority: authority})
        }
      }
      continue
    }
    records.push(observed)
    if (id) fresh.set(id, {arrival: observed, lastSeen: nowMs, missingSince: null, sourceAuthority: authority})
  }

  if (previousEntries.size) {
    for (const [id, previous] of previousEntries) {
      if (fresh.has(id) || passed.has(id)) continue
      const sourceAuthority = previous.sourceAuthority || previousState.authority
      if (!sameAuthority && payload.arrivals.some((next) =>
        cleanText(next?.vehicleId) && cleanText(next.vehicleId) === cleanText(previous.arrival?.vehicleId) &&
        cleanText(next.routeId) === cleanText(previous.arrival?.routeId))) {
        // Same physical bus + route remains in the new source. No duplicate
        // "missing" banner just because the trip-ID schemes differ.
        continue
      }
      if (provePreviouslyListedArrivalPassed(previous.arrival, sourceAuthority, stopId, vehicleIndex, nowSeconds)) {
        passed.add(id)
        previouslyMissingPassagesConfirmed++
        continue
      }
      const missingSince = previous.missingSince ?? nowMs
      const ageSinceSeen = nowMs - previous.lastSeen
      const eta = numberOrNull(previous.arrival?.arrivalTime) ??
        numberOrNull(previous.arrival?.lastPredictedTime)
      const near = eta !== null && eta <= Math.floor(previous.lastSeen / 1000) + 150 &&
        eta >= Math.floor(previous.lastSeen / 1000) - 90
      if (!near || nowMs - missingSince > STOP_UNVERIFIED_GRACE_MS ||
          ageSinceSeen > 2 * STOP_UNVERIFIED_GRACE_MS ||
          (previous.firstUnverifiedAt && nowMs - previous.firstUnverifiedAt > STOP_UNVERIFIED_GRACE_MS)) continue
      const pending = {
        ...previous.arrival,
        etaState: 'unverified',
        unverifiedReason: !sameAuthority ? 'FEED_SWITCHED' :
          (previous.firstUnverifiedAt ? 'ETA_EXPIRED' : 'PREDICTION_WITHDRAWN'),
        positionNote: !sameAuthority
          ? 'TTC prediction source changed; previous stop visit not confirmed'
          : (previous.firstUnverifiedAt
              ? 'ETA expired; stop visit not confirmed'
              : 'TTC estimate changed or disappeared; stop visit not confirmed'),
        lastPredictedTime: eta,
        arrivalTime: null,
        minutes: null,
      }
      ghost.push(pending)
      fresh.set(id, { ...previous, arrival: pending, missingSince })
    }
  }

  stopArrivalHistory.delete(key)
  stopArrivalHistory.set(key, {
    authority,
    entries: new Map([...fresh].slice(0, 32)),
  })
  while (stopArrivalHistory.size > STOP_HISTORY_LIMIT) {
    stopArrivalHistory.delete(stopArrivalHistory.keys().next().value)
  }
  const uniqueUnverified = Array.from(new Map(ghost.map((arrival) =>
    [arrivalTruthKey(arrival, authority) || String(arrival.lastPredictedTime), arrival]
  )).values())
  return {
    ...payload,
    arrivals: records,
    // Earliest unresolved near-term arrival appears first. These are status
    // notices, NOT active ETAs; the client renders them above later buses.
    unverifiedArrivals: uniqueUnverified.sort((a,b) =>
      (numberOrNull(a.lastPredictedTime) || 0) - (numberOrNull(b.lastPredictedTime) || 0)).slice(0,2),
    passageConfirmedCount: passed.size,
    passageDiagnostics: {
      umoNewlyConfirmed: newlyProvenUmoPassages,
      expiredEstimatesRemoved: expiredEstimateCount,
      storedArrivalsConfirmedPassed: previouslyMissingPassagesConfirmed,
      unresolvedArrivals: uniqueUnverified.length,
      knownGtfsTripStopTargets: fallback ? umoTripStopTargets.size : null,
      linkedUmoVehicleTrips: fallback ? umoArrivalTripLinks.size : null,
      vehicleCacheAgeSeconds: vehicleCache
        ? Math.round((nowMs - vehicleCache.cachedAt) / 1000) : null,
    },
    arrivalStateVersion: 18,
  }
}

async function getArrivalsPayload({ stopId, stopCode }) {
  const payload = await getArrivalsPayloadUnreconciled({ stopId, stopCode })
  return applyArrivalTruth(payload, stopId, stopCode)
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
      'TTC Next Vehicle Arrival System Â· nearby surface stops',
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
      startVehicleWarmLoop(
        server?.httpServer
      )

      startTripUpdateWarmLoop(
        server?.httpServer
      )

      // Warm static metadata in parallel at server start, but never make live
      // vehicle or stop-arrival responses wait for it.
      getSurfaceNetwork()
        .catch(
          (
            error
          ) => {
            console.warn(
              'LIVE TTC STATIC BOOT WARMUP:',
              error?.message ||
                error
            )
          }
        )

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
              if (
                url.searchParams.get(
                  'warm'
                ) ===
                  '1'
              ) {
                warmTripUpdateFeed()
                  .catch(
                    () => {}
                  )
                warmVehicleFeed()

                if (
                  !surfaceCache
                ) {
                  getSurfaceNetwork()
                    .catch(
                      (
                        error
                      ) => {
                        console.warn(
                          'LIVE TTC ARRIVALS PREWARM:',
                          error?.message ||
                            error
                        )
                      }
                    )
                }

                sendJson(
                  res,
                  200,
                  {
                    ok:
                      true,
                    warming:
                      true,
                    tripUpdatesReady:
                      Boolean(
                        tripUpdateCache
                      ),
                    surfaceReady:
                      Boolean(
                        surfaceCache
                      ),
                  }
                )
                return
              }

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
