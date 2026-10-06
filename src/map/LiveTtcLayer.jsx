// TTC SYNC V4 · bounded smooth motion + exact trip-shape locking
// LIVE TTC ROUTE ENGINE V17 · timestamp-age compensation + priority route indexing
// Vehicles advance by distance along their TTC route shape; realtime GPS only corrects the route progress.
// LIVE TTC FAST START V8
// LIVE TTC STABILITY V6 · 2026-09-30 · stable vehicle retention + continuous interpolation + direction arrows + deduped arrivals
import {
  useEffect,
  useRef,
} from 'react'

import {
  Popup,
} from 'maplibre-gl'

// LIVE TTC CONTINUOUS MOTION V7


const ROUTES_SOURCE_ID =
  'ttc-live-routes-source'
const STOPS_SOURCE_ID =
  'ttc-live-stops-source'
const STATIONS_SOURCE_ID =
  'ttc-live-stations-source'
const VEHICLES_SOURCE_ID =
  'ttc-live-vehicles-source'

const ROUTES_CASING_LAYER_ID =
  'ttc-live-routes-casing'
const ROUTES_LAYER_ID =
  'ttc-live-routes'
const SELECTED_ROUTE_CASING_LAYER_ID =
  'ttc-live-selected-route-casing'
const SELECTED_ROUTE_LAYER_ID =
  'ttc-live-selected-route'
const STOPS_LAYER_ID =
  'ttc-live-stops'
const STOPS_HIT_LAYER_ID =
  'ttc-live-stops-hit'
const STATIONS_LAYER_ID =
  'ttc-live-stations'
const STATION_LABELS_LAYER_ID =
  'ttc-live-station-labels'
const VEHICLE_CIRCLE_LAYER_ID =
  'ttc-live-vehicle-circles'
const VEHICLE_ICON_LAYER_ID =
  'ttc-live-vehicle-icons'
const STREETCAR_ICON_LAYER_ID =
  'ttc-live-streetcar-icons'
const VEHICLE_ROUTE_LABEL_LAYER_ID =
  'ttc-live-vehicle-route-labels'
const VEHICLE_DIRECTION_LAYER_ID =
  'ttc-live-vehicle-direction'

const BUS_MARKER_IMAGE_ID =
  'ttc-live-bus-marker-v3'
const STREETCAR_MARKER_IMAGE_ID =
  'ttc-live-streetcar-marker-v3'
const STOP_MARKER_IMAGE_ID =
  'ttc-live-stop-marker'
const VEHICLE_DOT_MIN_ZOOM =
  0
const VEHICLE_ICON_MIN_ZOOM =
  0
const VEHICLE_DIRECTION_MIN_ZOOM =
  5.5
const VEHICLE_LABEL_MIN_ZOOM =
  13.5
const GPS_PROMPT_SESSION_KEY =
  'toronto-geographic-live-ttc-gps-prompted'

const NETWORK_ENDPOINT =
  '/api/geographic/toronto/ttc/live/network'
const VEHICLES_ENDPOINT =
  '/api/geographic/toronto/ttc/live/vehicles'
const ARRIVALS_ENDPOINT =
  '/api/geographic/toronto/ttc/live/arrivals'

const STOP_ARRIVAL_REFRESH_MS =
  2500

const VEHICLE_PRELOAD_MAX_AGE_MS =
  20 * 1000
const BUS_ACCURACY_ZOOM_THRESHOLD =
  14

let initialVehiclePreloadPayload =
  null
let initialVehiclePreloadAt =
  0
let initialVehiclePreloadPromise =
  null


function validVehiclePayload(
  payload
) {
  return (
    Array.isArray(
      payload?.vehicles
    ) &&
    payload.vehicles.length >
      0
  )
}


function acceptInitialVehiclePayload(
  payload
) {
  if (
    validVehiclePayload(
      payload
    )
  ) {
    initialVehiclePreloadPayload =
      payload
    initialVehiclePreloadAt =
      Date.now()
  }

  return payload
}


function startInitialVehiclePreload() {
  if (
    typeof window ===
      'undefined' ||
    initialVehiclePreloadPromise
  ) {
    return
  }

  const earlyPromise =
    window
      .__TG_TTC_EARLY_VEHICLES__
      ?.promise

  initialVehiclePreloadPromise =
    (
      earlyPromise
        ? Promise.resolve(
            earlyPromise
          )
        : fetch(
            VEHICLES_ENDPOINT,
            {
              cache:
                'no-store',
            }
          )
            .then(
              async (
                response
              ) => {
                if (
                  !response.ok
                ) {
                  return null
                }

                return response.json()
              }
            )
    )
      .then(
        acceptInitialVehiclePayload
      )
      .catch(
        (
          error
        ) => {
          console.warn(
            'LIVE TTC PRELOAD:',
            error
          )
          return null
        }
      )
      .finally(
        () => {
          initialVehiclePreloadPromise =
            null
        }
      )
}


function takeInitialVehiclePreloadSnapshot() {
  if (
    initialVehiclePreloadPayload &&
    Date.now() -
      initialVehiclePreloadAt <=
      VEHICLE_PRELOAD_MAX_AGE_MS
  ) {
    const payload =
      initialVehiclePreloadPayload

    initialVehiclePreloadPayload =
      null
    initialVehiclePreloadAt =
      0

    return payload
  }

  return null
}


// Adopt the page-level preload. It is memory-only: never stringify the full
// fleet into localStorage during live operation, which was causing main-thread
// stalls while the user panned/zoomed the map.
startInitialVehiclePreload()


const VEHICLE_POLL_MS =
  2000
const VEHICLE_VISUAL_MAX_SPEED_MPS =
  8.5
const VEHICLE_DEFAULT_MOVING_SPEED_MPS =
  3.2
// TTC TRUTH MODE · do not force a vehicle to crawl without a new TTC sample.
const VEHICLE_MIN_CONTINUOUS_SPEED_MPS =
  0
const VEHICLE_ROUTE_LOCK_MAX_METERS =
  90
const VEHICLE_STALE_SLOWDOWN_MS =
  15 * 1000
const VEHICLE_STALE_STOP_MS =
  75 * 1000
const VEHICLE_GRACE_MS =
  90 * 1000
const VEHICLE_TIMESTAMP_COMPENSATION_MIN_AGE_SECONDS =
  2
const VEHICLE_TIMESTAMP_COMPENSATION_MAX_SECONDS =
  24
const VEHICLE_TIMESTAMP_COMPENSATION_MAX_METERS =
  120
const VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS =
  0.7
// Accuracy-first smoothing: project only a short distance beyond the most
// recent TTC GPS sample, and never through TTC's reported next stop.
const VEHICLE_MAX_FORWARD_LEAD_METERS =
  32
const VEHICLE_MAX_FORWARD_LEAD_SECONDS =
  8
const VEHICLE_IN_TRANSIT_STOP_BUFFER_METERS =
  10
const ANIMATION_FRAME_MS =
  50
const ROUTE_INDEX_ROUTE_BATCH_SIZE =
  4
const SELECTED_ROUTE_PULSE_MS =
  50

const EMPTY_FEATURE_COLLECTION = {
  type:
    'FeatureCollection',
  features:
    [],
}


function escapeText(
  value
) {
  return String(
    value ??
    ''
  )
}


function secondsAgo(
  timestamp
) {
  const seconds =
    Math.max(
      0,
      Math.floor(
        Date.now() /
        1000 -
        Number(
          timestamp ||
          0
        )
      )
    )

  if (
    seconds <
    60
  ) {
    return `${seconds} sec ago`
  }

  return `${Math.floor(seconds / 60)} min ago`
}


function occupancyLabel(
  value
) {
  const normalized =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase()

  if (
    normalized ===
      'MANY_SEATS_AVAILABLE' ||
    normalized ===
      'EMPTY'
  ) {
    return 'NOT BUSY'
  }

  if (
    normalized ===
      'FEW_SEATS_AVAILABLE' ||
    normalized ===
      'STANDING_ROOM_ONLY'
  ) {
    return 'BUSY'
  }

  if (
    normalized ===
      'CRUSHED_STANDING_ROOM_ONLY' ||
    normalized ===
      'FULL'
  ) {
    return 'VERY BUSY'
  }

  return ''
}


function addTextLine({
  parent,
  text,
  className,
  style,
}) {
  const element =
    document.createElement(
      'div'
    )

  if (
    className
  ) {
    element.className =
      className
  }

  element.textContent =
    escapeText(
      text
    )

  if (
    style
  ) {
    Object.assign(
      element.style,
      style
    )
  }

  parent.appendChild(
    element
  )

  return element
}


function popupShell() {
  const shell =
    document.createElement(
      'div'
    )

  Object.assign(
    shell.style,
    {
      minWidth:
        '210px',
      maxWidth:
        '280px',
      color:
        '#111',
      fontFamily:
        'Arial, Helvetica, sans-serif',
      lineHeight:
        '1.25',
    }
  )

  return shell
}


function createVehiclePopup(
  properties
) {
  const shell =
    popupShell()

  const modeLabel =
    properties.mode ===
      'streetcar'
      ? 'STREETCAR'
      : 'BUS'

  addTextLine({
    parent:
      shell,
    text:
      `${modeLabel} · LIVE`,
    style: {
      fontSize:
        '9px',
      fontWeight:
        '800',
      letterSpacing:
        '0.12em',
      opacity:
        '0.58',
      marginBottom:
        '4px',
    },
  })

  addTextLine({
    parent:
      shell,
    text:
      `${properties.routeShortName || properties.routeId || 'TTC'}${properties.routeLongName ? ` · ${properties.routeLongName}` : ''}`,
    style: {
      fontSize:
        '16px',
      fontWeight:
        '900',
      marginBottom:
        '5px',
    },
  })

  if (
    properties.headsign
  ) {
    addTextLine({
      parent:
        shell,
      text:
        `→ ${properties.headsign}`,
      style: {
        fontSize:
          '12px',
        fontWeight:
          '700',
        marginBottom:
          '8px',
      },
    })
  }

  if (
    properties.stopName
  ) {
    addTextLine({
      parent:
        shell,
      text:
        `Next stop · ${properties.stopName}`,
      style: {
        fontSize:
          '11px',
        marginBottom:
          '5px',
      },
    })
  }

  const occupancy =
    occupancyLabel(
      properties.occupancyStatus
    )

  if (
    occupancy
  ) {
    addTextLine({
      parent:
        shell,
      text:
        occupancy,
      style: {
        display:
          'inline-block',
        border:
          '1px solid rgba(0,0,0,0.22)',
        padding:
          '3px 5px',
        margin:
          '2px 0 7px',
        fontSize:
          '9px',
        fontWeight:
          '800',
        letterSpacing:
          '0.08em',
      },
    })
  }

  addTextLine({
    parent:
      shell,
    text:
      `Vehicle ${properties.label || properties.vehicleId || properties.id || ''}`,
    style: {
      fontSize:
        '10px',
      opacity:
        '0.68',
      marginTop:
        '4px',
    },
  })

  addTextLine({
    parent:
      shell,
    text:
      `Position updated ${secondsAgo(properties.timestamp)}`,
    style: {
      fontSize:
        '10px',
      opacity:
        '0.56',
      marginTop:
        '2px',
    },
  })

  return shell
}


function createStationPopup(
  properties
) {
  const shell =
    popupShell()

  addTextLine({
    parent:
      shell,
    text:
      'TTC STATION',
    style: {
      fontSize:
        '9px',
      fontWeight:
        '800',
      letterSpacing:
        '0.12em',
      opacity:
        '0.58',
      marginBottom:
        '4px',
    },
  })

  addTextLine({
    parent:
      shell,
    text:
      properties.stopName ||
      'TTC Station',
    style: {
      fontSize:
        '15px',
      fontWeight:
        '900',
      marginBottom:
        '6px',
    },
  })

  addTextLine({
    parent:
      shell,
    text:
      'Live buses and streetcars serving nearby surface stops are shown on the map.',
    style: {
      fontSize:
        '10px',
      lineHeight:
        '1.4',
      opacity:
        '0.68',
    },
  })

  return shell
}


function createStopPopupLoading(
  properties
) {
  const shell =
    popupShell()

  addTextLine({
    parent:
      shell,
    text:
      properties.isStation
        ? 'TTC STATION · LIVE'
        : 'TTC STOP · LIVE',
    style: {
      fontSize:
        '9px',
      fontWeight:
        '800',
      letterSpacing:
        '0.12em',
      opacity:
        '0.58',
      marginBottom:
        '4px',
    },
  })

  addTextLine({
    parent:
      shell,
    text:
      properties.stopName ||
      'TTC Stop',
    style: {
      fontSize:
        '14px',
      fontWeight:
        '900',
      marginBottom:
        '3px',
    },
  })

  if (
    properties.stopCode
  ) {
    addTextLine({
      parent:
        shell,
      text:
        `Stop ${properties.stopCode}`,
      style: {
        fontSize:
          '9px',
        opacity:
          '0.54',
        marginBottom:
          '8px',
      },
    })
  }

  addTextLine({
    parent:
      shell,
    className:
      'ttc-live-stop-loading',
    text:
      'Loading approaching vehicles…',
    style: {
      fontSize:
        '10px',
      opacity:
        '0.65',
    },
  })

  return shell
}


function liveArrivalMinutes(
  arrival
) {
  const arrivalTime =
    Number(
      arrival?.arrivalTime
    )

  if (
    Number.isFinite(
      arrivalTime
    ) &&
    arrivalTime >
      0
  ) {
    return Math.max(
      0,
      Math.floor(
        (
          arrivalTime *
            1000 -
          Date.now()
        ) /
        60000
      )
    )
  }

  const minutes =
    Number(
      arrival?.minutes
    )

  return Number.isFinite(
    minutes
  )
    ? Math.max(
        0,
        Math.floor(
          minutes
        )
      )
    : 0
}


function fillStopArrivals({
  shell,
  payload,
}) {
  shell
    .querySelectorAll(
      '.ttc-live-stop-loading, .ttc-live-stop-arrivals, .ttc-live-stop-empty, .ttc-live-stop-error'
    )
    .forEach(
      (
        child
      ) =>
        child.remove()
    )

  const arrivals =
    Array.isArray(
      payload?.arrivals
    )
      ? payload.arrivals
      : []

  if (
    arrivals.length ===
    0
  ) {
    addTextLine({
      parent:
        shell,
      className:
        'ttc-live-stop-empty',
      text:
        'No approaching surface vehicles are currently reported.',
      style: {
        fontSize:
          '10px',
        opacity:
          '0.65',
        marginTop:
          '6px',
      },
    })
    return
  }

  const list =
    document.createElement(
      'div'
    )

  list.className =
    'ttc-live-stop-arrivals'

  Object.assign(
    list.style,
    {
      marginTop:
        '7px',
      borderTop:
        '1px solid rgba(0,0,0,0.12)',
    }
  )

  arrivals
    .slice(
      0,
      8
    )
    .forEach(
      (
        arrival
      ) => {
        const row =
          document.createElement(
            'div'
          )

        Object.assign(
          row.style,
          {
            display:
              'grid',
            gridTemplateColumns:
              '42px 1fr auto',
            alignItems:
              'center',
            gap:
              '7px',
            padding:
              '7px 0',
            borderBottom:
              '1px solid rgba(0,0,0,0.08)',
          }
        )

        addTextLine({
          parent:
            row,
          text:
            arrival.routeShortName ||
            arrival.routeId,
          style: {
            fontSize:
              '12px',
            fontWeight:
              '900',
          },
        })

        addTextLine({
          parent:
            row,
          text:
            arrival.headsign ||
            arrival.routeLongName ||
            '',
          style: {
            fontSize:
              '9px',
            lineHeight:
              '1.25',
          },
        })

        const minutes =
          liveArrivalMinutes(
            arrival
          )

        const vehicleStatus =
          String(
            arrival?.vehicleCurrentStatus ||
            ''
          )
            .toUpperCase()
        const rawVehicleSequence =
          arrival?.vehicleCurrentStopSequence
        const rawArrivalSequence =
          arrival?.stopSequence
        const vehicleSequence =
          rawVehicleSequence ===
            null ||
          rawVehicleSequence ===
            undefined ||
          rawVehicleSequence ===
            ''
            ? null
            : Number(
                rawVehicleSequence
              )
        const arrivalSequence =
          rawArrivalSequence ===
            null ||
          rawArrivalSequence ===
            undefined ||
          rawArrivalSequence ===
            ''
            ? null
            : Number(
                rawArrivalSequence
              )
        const vehicleIsAtArrivalStop =
          Number.isFinite(
            vehicleSequence
          ) &&
          Number.isFinite(
            arrivalSequence
          ) &&
          vehicleSequence ===
            arrivalSequence &&
          (
            vehicleStatus.includes(
              'INCOMING'
            ) ||
            vehicleStatus.includes(
              'STOPPED'
            )
          )

        addTextLine({
          parent:
            row,
          text:
            minutes <=
              0
              ? vehicleIsAtArrivalStop
                ? 'DUE'
                : '<1 min'
              : `${minutes} min`,
          style: {
            fontSize:
              '11px',
            fontWeight:
              '900',
            whiteSpace:
              'nowrap',
          },
        })

        list.appendChild(
          row
        )
      }
    )

  shell.appendChild(
    list
  )
}


function featureCollection(
  features
) {
  return {
    type:
      'FeatureCollection',
    features,
  }
}


function distanceMetersBetweenCoordinates(
  a,
  b
) {
  if (
    !Array.isArray(
      a
    ) ||
    !Array.isArray(
      b
    )
  ) {
    return Infinity
  }

  const latitude =
    (
      Number(
        a[1]
      ) +
      Number(
        b[1]
      )
    ) /
    2
  const longitudeScale =
    Math.max(
      0.2,
      Math.cos(
        latitude *
        Math.PI /
        180
      )
    )
  const east =
    (
      Number(
        b[0]
      ) -
      Number(
        a[0]
      )
    ) *
    111320 *
    longitudeScale
  const north =
    (
      Number(
        b[1]
      ) -
      Number(
        a[1]
      )
    ) *
    111320

  return Math.hypot(
    east,
    north
  )
}


function bearingBetweenCoordinates(
  from,
  to
) {
  if (
    !Array.isArray(
      from
    ) ||
    !Array.isArray(
      to
    )
  ) {
    return null
  }

  const latitude =
    (
      Number(
        from[1]
      ) +
      Number(
        to[1]
      )
    ) /
    2
  const longitudeScale =
    Math.max(
      0.2,
      Math.cos(
        latitude *
        Math.PI /
        180
      )
    )
  const east =
    (
      Number(
        to[0]
      ) -
      Number(
        from[0]
      )
    ) *
    longitudeScale
  const north =
    Number(
      to[1]
    ) -
    Number(
      from[1]
    )

  if (
    Math.abs(
      east
    ) +
    Math.abs(
      north
    ) <
      0.00000001
  ) {
    return null
  }

  return (
    Math.atan2(
      east,
      north
    ) *
    180 /
    Math.PI +
    360
  ) %
    360
}


function nearestPointOnSegment(
  point,
  start,
  end
) {
  const latitude =
    Number(
      point[1]
    )
  const longitudeScale =
    Math.max(
      0.2,
      Math.cos(
        latitude *
        Math.PI /
        180
      )
    )
  const px =
    Number(
      point[0]
    ) *
    longitudeScale
  const py =
    Number(
      point[1]
    )
  const ax =
    Number(
      start[0]
    ) *
    longitudeScale
  const ay =
    Number(
      start[1]
    )
  const bx =
    Number(
      end[0]
    ) *
    longitudeScale
  const by =
    Number(
      end[1]
    )
  const dx =
    bx -
    ax
  const dy =
    by -
    ay
  const denominator =
    dx *
      dx +
    dy *
      dy
  const t =
    denominator >
      0
      ? Math.max(
          0,
          Math.min(
            1,
            (
              (
                px -
                ax
              ) *
                dx +
              (
                py -
                ay
              ) *
                dy
            ) /
            denominator
          )
        )
      : 0
  const longitude =
    Number(
      start[0]
    ) +
    (
      Number(
        end[0]
      ) -
      Number(
        start[0]
      )
    ) *
      t
  const resultLatitude =
    Number(
      start[1]
    ) +
    (
      Number(
        end[1]
      ) -
      Number(
        start[1]
      )
    ) *
      t
  const coordinate = [
    longitude,
    resultLatitude,
  ]

  return {
    coordinate,
    distanceMeters:
      distanceMetersBetweenCoordinates(
        point,
        coordinate
      ),
    t,
  }
}


function snapCoordinateToRoute(
  coordinate,
  routeId,
  routeFeatures
) {
  const normalizedRouteId =
    String(
      routeId ||
      ''
    )

  if (
    !normalizedRouteId ||
    !Array.isArray(
      routeFeatures
    ) ||
    routeFeatures.length ===
      0
  ) {
    return coordinate
  }

  let best =
    null

  routeFeatures.forEach(
    (
      feature
    ) => {
      if (
        String(
          feature?.properties?.routeId ||
          ''
        ) !==
          normalizedRouteId ||
        feature?.geometry?.type !==
          'LineString' ||
        !Array.isArray(
          feature?.geometry?.coordinates
        )
      ) {
        return
      }

      const coordinates =
        feature.geometry.coordinates

      for (
        let index =
          1;
        index <
          coordinates.length;
        index +=
          1
      ) {
        const candidate =
          nearestPointOnSegment(
            coordinate,
            coordinates[
              index -
              1
            ],
            coordinates[
              index
            ]
          )

        if (
          !best ||
          candidate.distanceMeters <
            best.distanceMeters
        ) {
          best =
            candidate
        }
      }
    }
  )

  // Never drag a vehicle across the map to an unrelated route segment if the
  // visible route geometry has not loaded yet. Within 140 m, route-lock it.
  return best &&
    best.distanceMeters <=
      140
    ? best.coordinate
    : coordinate
}


function clampNumber(
  value,
  minimum,
  maximum
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      Number(
        value
      )
    )
  )
}


function normalizeDirectionId(
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
    return ''
  }

  const number =
    Number(
      value
    )

  return Number.isFinite(
    number
  )
    ? String(
        number
      )
    : String(
        value
      )
}


function buildRouteProgressPath(
  feature
) {
  if (
    feature?.geometry?.type !==
      'LineString' ||
    !Array.isArray(
      feature?.geometry?.coordinates
    ) ||
    feature.geometry.coordinates.length <
      2
  ) {
    return null
  }

  const coordinates =
    feature.geometry.coordinates
      .filter(
        (
          coordinate
        ) =>
          Array.isArray(
            coordinate
          ) &&
          Number.isFinite(
            Number(
              coordinate[0]
            )
          ) &&
          Number.isFinite(
            Number(
              coordinate[1]
            )
          )
      )
      .map(
        (
          coordinate
        ) => [
          Number(
            coordinate[0]
          ),
          Number(
            coordinate[1]
          ),
        ]
      )

  if (
    coordinates.length <
      2
  ) {
    return null
  }

  const cumulativeMeters = [
    0,
  ]
  const segmentMeters = []
  let totalMeters =
    0

  for (
    let index =
      1;
    index <
      coordinates.length;
    index +=
      1
  ) {
    const distance =
      distanceMetersBetweenCoordinates(
        coordinates[
          index -
          1
        ],
        coordinates[
          index
        ]
      )

    const safeDistance =
      Number.isFinite(
        distance
      )
        ? Math.max(
            0,
            distance
          )
        : 0

    segmentMeters.push(
      safeDistance
    )
    totalMeters +=
      safeDistance
    cumulativeMeters.push(
      totalMeters
    )
  }

  if (
    totalMeters <=
      0
  ) {
    return null
  }

  return {
    shapeId:
      String(
        feature?.properties?.shapeId ||
        feature?.id ||
        ''
      ),
    routeId:
      String(
        feature?.properties?.routeId ||
        ''
      ),
    directionId:
      normalizeDirectionId(
        feature?.properties?.directionId
      ),
    headsign:
      String(
        feature?.properties?.headsign ||
        ''
      ),
    coordinates,
    cumulativeMeters,
    segmentMeters,
    totalMeters,
  }
}


function buildRouteProgressIndex(
  features
) {
  const index =
    new Map()

  ;(
    Array.isArray(
      features
    )
      ? features
      : []
  )
    .forEach(
      (
        feature
      ) => {
        const path =
          buildRouteProgressPath(
            feature
          )

        if (
          !path ||
          !path.routeId
        ) {
          return
        }

        if (
          !index.has(
            path.routeId
          )
        ) {
          index.set(
            path.routeId,
            []
          )
        }

        index
          .get(
            path.routeId
          )
          .push(
            path
          )
      }
    )

  return index
}


function projectCoordinateOntoRoutePath(
  coordinate,
  path
) {
  if (
    !path ||
    !Array.isArray(
      path.coordinates
    ) ||
    path.coordinates.length <
      2
  ) {
    return null
  }

  let best =
    null

  for (
    let index =
      1;
    index <
      path.coordinates.length;
    index +=
      1
  ) {
    const candidate =
      nearestPointOnSegment(
        coordinate,
        path.coordinates[
          index -
          1
        ],
        path.coordinates[
          index
        ]
      )

    const segmentDistance =
      path.segmentMeters[
        index -
        1
      ] ||
      0
    const progressMeters =
      path.cumulativeMeters[
        index -
        1
      ] +
      segmentDistance *
        clampNumber(
          candidate.t ??
          0,
          0,
          1
        )
    const segmentBearing =
      bearingBetweenCoordinates(
        path.coordinates[
          index -
          1
        ],
        path.coordinates[
          index
        ]
      )

    if (
      !best ||
      candidate.distanceMeters <
        best.distanceMeters
    ) {
      best = {
        coordinate:
          candidate.coordinate,
        distanceMeters:
          candidate.distanceMeters,
        progressMeters,
        segmentIndex:
          index -
          1,
        bearing:
          segmentBearing,
      }
    }
  }

  return best
}


function routeSegmentIndexAtProgress(
  path,
  progressMeters
) {
  if (
    !path ||
    !Array.isArray(
      path.cumulativeMeters
    ) ||
    path.cumulativeMeters.length <
      2
  ) {
    return 0
  }

  const progress =
    clampNumber(
      progressMeters,
      0,
      path.totalMeters
    )
  let low =
    0
  let high =
    path.cumulativeMeters.length -
    2

  while (
    low <=
    high
  ) {
    const middle =
      Math.floor(
        (
          low +
          high
        ) /
        2
      )
    const start =
      path.cumulativeMeters[
        middle
      ]
    const end =
      path.cumulativeMeters[
        middle +
        1
      ]

    if (
      progress <
        start
    ) {
      high =
        middle -
        1
    }
    else if (
      progress >
        end
    ) {
      low =
        middle +
        1
    }
    else {
      return middle
    }
  }

  return Math.max(
    0,
    Math.min(
      path.segmentMeters.length -
      1,
      low
    )
  )
}


function coordinateAtRouteProgress(
  path,
  progressMeters
) {
  if (
    !path ||
    !Array.isArray(
      path.coordinates
    ) ||
    path.coordinates.length ===
      0
  ) {
    return null
  }

  const progress =
    clampNumber(
      progressMeters,
      0,
      path.totalMeters
    )
  const segmentIndex =
    routeSegmentIndexAtProgress(
      path,
      progress
    )
  const start =
    path.coordinates[
      segmentIndex
    ]
  const end =
    path.coordinates[
      segmentIndex +
      1
    ] ||
    start
  const segmentStart =
    path.cumulativeMeters[
      segmentIndex
    ] ||
    0
  const segmentLength =
    path.segmentMeters[
      segmentIndex
    ] ||
    0
  const t =
    segmentLength >
      0
      ? clampNumber(
          (
            progress -
            segmentStart
          ) /
          segmentLength,
          0,
          1
        )
      : 0

  return [
    start[0] +
      (
        end[0] -
        start[0]
      ) *
      t,
    start[1] +
      (
        end[1] -
        start[1]
      ) *
      t,
  ]
}


function bearingAtRouteProgress(
  path,
  progressMeters
) {
  if (
    !path ||
    !Array.isArray(
      path.coordinates
    ) ||
    path.coordinates.length <
      2
  ) {
    return null
  }

  const segmentIndex =
    routeSegmentIndexAtProgress(
      path,
      progressMeters
    )

  return bearingBetweenCoordinates(
    path.coordinates[
      segmentIndex
    ],
    path.coordinates[
      segmentIndex +
      1
    ] ||
    path.coordinates[
      segmentIndex
    ]
  )
}


function bearingDifferenceDegrees(
  a,
  b
) {
  if (
    !Number.isFinite(
      Number(
        a
      )
    ) ||
    !Number.isFinite(
      Number(
        b
      )
    )
  ) {
    return 0
  }

  const difference =
    Math.abs(
      (
        Number(
          a
        ) -
        Number(
          b
        ) +
        540
      ) %
        360 -
      180
    )

  return difference
}


function selectRouteProgressPath({
  coordinate,
  routeId,
  shapeId,
  directionId,
  bearing,
  routePathsByRoute,
}) {
  const normalizedRouteId =
    String(
      routeId ||
      ''
    )
  const normalizedShapeId =
    String(
      shapeId ||
      ''
    )
  const normalizedDirectionId =
    normalizeDirectionId(
      directionId
    )
  const candidates =
    routePathsByRoute
      ?.get?.(
        normalizedRouteId
      ) ||
    []

  if (
    candidates.length ===
      0
  ) {
    return null
  }

  const shapeCandidates =
    normalizedShapeId
      ? candidates.filter(
          (
            path
          ) =>
            path.shapeId ===
            normalizedShapeId
        )
      : []

  // If static GTFS gave this vehicle an exact trip shape, never snap it onto
  // a different shape merely because that geometry is geographically close.
  if (
    normalizedShapeId &&
    shapeCandidates.length ===
      0
  ) {
    return null
  }

  const directionalCandidates =
    !normalizedShapeId &&
    normalizedDirectionId
      ? candidates.filter(
          (
            path
          ) =>
            path.directionId ===
            normalizedDirectionId
        )
      : []
  const pool =
    shapeCandidates.length >
      0
      ? shapeCandidates
      : directionalCandidates.length >
          0
        ? directionalCandidates
        : candidates

  let best =
    null

  pool.forEach(
    (
      path
    ) => {
      const projection =
        projectCoordinateOntoRoutePath(
          coordinate,
          path
        )

      if (
        !projection
      ) {
        return
      }

      const bearingPenalty =
        Number.isFinite(
          Number(
            bearing
          )
        ) &&
        Number.isFinite(
          Number(
            projection.bearing
          )
        )
          ? bearingDifferenceDegrees(
              bearing,
              projection.bearing
            ) *
            0.35
          : 0
      const score =
        projection.distanceMeters +
        bearingPenalty

      if (
        !best ||
        score <
          best.score
      ) {
        best = {
          path,
          projection,
          score,
        }
      }
    }
  )

  return best &&
    best.projection.distanceMeters <=
      VEHICLE_ROUTE_LOCK_MAX_METERS
    ? best
    : null
}


function medianNumber(
  values
) {
  const numbers =
    (
      Array.isArray(
        values
      )
        ? values
        : []
    )
      .map(
        Number
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )

  if (
    numbers.length ===
      0
  ) {
    return null
  }

  const middle =
    Math.floor(
      numbers.length /
      2
    )

  return numbers.length %
    2
    ? numbers[
        middle
      ]
    : (
        numbers[
          middle -
          1
        ] +
        numbers[
          middle
        ]
      ) /
      2
}


function appendVehicleSampleHistory({
  previous,
  progress,
  timestamp,
  samePath,
}) {
  const history =
    samePath &&
    Array.isArray(
      previous?.sampleHistory
    )
      ? [
          ...previous.sampleHistory,
        ]
      : []

  const normalizedTimestamp =
    Number(
      timestamp ||
      0
    )
  const normalizedProgress =
    Number(
      progress
    )

  if (
    normalizedTimestamp >
      0 &&
    Number.isFinite(
      normalizedProgress
    )
  ) {
    const last =
      history[
        history.length -
        1
      ]

    if (
      !last ||
      Number(
        last.timestamp
      ) !==
        normalizedTimestamp
    ) {
      history.push({
        timestamp:
          normalizedTimestamp,
        progress:
          normalizedProgress,
      })
    }
  }

  return history.slice(
    -5
  )
}


function medianVehicleHistorySpeed(
  history
) {
  const samples =
    Array.isArray(
      history
    )
      ? history
      : []
  const speeds =
    []

  for (
    let index = 1;
    index <
      samples.length;
    index +=
      1
  ) {
    const previous =
      samples[
        index -
        1
      ]
    const current =
      samples[
        index
      ]
    const elapsed =
      Number(
        current?.timestamp
      ) -
      Number(
        previous?.timestamp
      )
    const distance =
      Number(
        current?.progress
      ) -
      Number(
        previous?.progress
      )

    if (
      elapsed >=
        1 &&
      elapsed <=
        90 &&
      distance >=
        -3
    ) {
      speeds.push(
        clampNumber(
          Math.max(
            0,
            distance
          ) /
            elapsed,
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
      )
    }
  }

  return medianNumber(
    speeds
  )
}


function routeEngineTargetSpeed({
  previous,
  realProgress,
  sampleTimestamp,
  ttcSpeed,
  currentStatus,
  historySpeed,
  now,
}) {
  const normalizedTtcSpeed =
    Number.isFinite(
      Number(
        ttcSpeed
      )
    )
      ? clampNumber(
          Number(
            ttcSpeed
          ),
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
      : null
  const normalizedStatus =
    String(
      currentStatus ||
      ''
    )
      .toUpperCase()
  const stopped =
    normalizedStatus.includes(
      'STOPPED'
    )

  let observedSpeed =
    null

  if (
    previous &&
    Number.isFinite(
      Number(
        previous.realProgress
      )
    ) &&
    Number.isFinite(
      Number(
        previous.sampleTimestamp
      )
    ) &&
    Number.isFinite(
      Number(
        sampleTimestamp
      )
    )
  ) {
    const elapsedSeconds =
      Number(
        sampleTimestamp
      ) -
      Number(
        previous.sampleTimestamp
      )
    const previousSampleProgress =
      Number(
        previous.sampleProgress ??
        previous.realProgress
      )
    const progressDelta =
      Number(
        realProgress
      ) -
      previousSampleProgress

    if (
      elapsedSeconds >
        0.5 &&
      elapsedSeconds <
        60 &&
      progressDelta >=
        -4
    ) {
      observedSpeed =
        clampNumber(
          Math.max(
            0,
            progressDelta
          ) /
            elapsedSeconds,
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
    }
  }

  const robustHistorySpeed =
    Number.isFinite(
      Number(
        historySpeed
      )
    )
      ? clampNumber(
          Number(
            historySpeed
          ),
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
      : null

  let targetSpeed =
    robustHistorySpeed !==
      null &&
    normalizedTtcSpeed !==
      null
      ? robustHistorySpeed *
          0.68 +
        normalizedTtcSpeed *
          0.32
      : robustHistorySpeed !==
          null
        ? robustHistorySpeed
        : observedSpeed !==
            null &&
          normalizedTtcSpeed !==
            null
          ? observedSpeed *
              0.72 +
            normalizedTtcSpeed *
              0.28
          : observedSpeed !==
              null
            ? observedSpeed
            : normalizedTtcSpeed !==
                null
              ? normalizedTtcSpeed
              : previous?.filteredSpeed ??
                VEHICLE_DEFAULT_MOVING_SPEED_MPS

  // TTC sometimes publishes a fresh timestamp while the GPS coordinate is
  // unchanged. If its own speed still says the vehicle is moving, do not let
  // that one repeated point collapse the visual speed toward zero.
  if (
    !stopped &&
    observedSpeed !==
      null &&
    observedSpeed <
      0.45 &&
    normalizedTtcSpeed !==
      null &&
    normalizedTtcSpeed >
      0.8
  ) {
    targetSpeed =
      Math.max(
        targetSpeed,
        normalizedTtcSpeed *
        0.78
      )
  }

  if (
    stopped &&
    (
      observedSpeed ===
        null ||
      observedSpeed <
        0.6
    ) &&
    (
      normalizedTtcSpeed ===
        null ||
      normalizedTtcSpeed <
        0.6
    )
  ) {
    targetSpeed =
      0
  }

  const previousSpeed =
    Number.isFinite(
      Number(
        previous?.filteredSpeed
      )
    )
      ? Number(
          previous.filteredSpeed
        )
      : targetSpeed
  const smoothing =
    targetSpeed >
      previousSpeed
      ? 0.58
      : 0.34
  let filteredSpeed =
    previous
      ? previousSpeed +
        (
          targetSpeed -
          previousSpeed
        ) *
        smoothing
      : targetSpeed

  const movementEvidence =
    (
      observedSpeed !==
        null &&
      observedSpeed >
        0.65
    ) ||
    (
      normalizedTtcSpeed !==
        null &&
      normalizedTtcSpeed >
        0.65
    ) ||
    normalizedStatus.includes(
      'IN_TRANSIT'
    ) ||
    normalizedStatus.includes(
      'INCOMING'
    )
  const lastMovingAt =
    movementEvidence
      ? now
      : previous?.lastMovingAt ??
        0

  if (
    !stopped &&
    lastMovingAt >
      0 &&
    now -
      lastMovingAt <
      15 *
      1000 &&
    filteredSpeed <
      VEHICLE_MIN_CONTINUOUS_SPEED_MPS
  ) {
    filteredSpeed =
      VEHICLE_MIN_CONTINUOUS_SPEED_MPS
  }

  return {
    filteredSpeed:
      clampNumber(
        filteredSpeed,
        0,
        VEHICLE_VISUAL_MAX_SPEED_MPS
      ),
    lastMovingAt,
    stopped,
    observedSpeed,
    movementEvidence,
  }
}


function timestampCompensatedRouteProgress({
  sampleProgress,
}) {
  // TTC TRUTH MODE · Never extrapolate a vehicle beyond TTC's latest GPS
  // route projection. Smoothing happens only while catching up to this point.
  return sampleProgress
}

function createVehicleMarkerImage(
  color,
  {
    streetcar =
      false,
  } = {}
) {
  const size =
    48
  const canvas =
    document.createElement(
      'canvas'
    )

  canvas.width =
    size
  canvas.height =
    size

  const context =
    canvas.getContext(
      '2d'
    )

  if (
    !context
  ) {
    return null
  }

  context.clearRect(
    0,
    0,
    size,
    size
  )

  context.lineJoin =
    'round'
  context.lineCap =
    'round'

  context.fillStyle =
    color
  context.strokeStyle =
    '#ffffff'
  // Strong white casing keeps a black vehicle visible on top of black TTC
  // route lines and dark aerial imagery.
  context.lineWidth =
    5

  context.beginPath()
  context.moveTo(
    13,
    6
  )
  context.lineTo(
    35,
    6
  )
  context.quadraticCurveTo(
    40,
    6,
    40,
    11
  )
  context.lineTo(
    40,
    34
  )
  context.quadraticCurveTo(
    40,
    38,
    36,
    38
  )
  context.lineTo(
    12,
    38
  )
  context.quadraticCurveTo(
    8,
    38,
    8,
    34
  )
  context.lineTo(
    8,
    11
  )
  context.quadraticCurveTo(
    8,
    6,
    13,
    6
  )
  context.closePath()
  context.fill()
  context.stroke()

  context.fillStyle =
    'rgba(255,255,255,0.94)'
  context.fillRect(
    13,
    11,
    22,
    streetcar
      ? 8
      : 10
  )

  if (
    streetcar
  ) {
    context.strokeStyle =
      '#ffffff'
    context.lineWidth =
      2
    context.beginPath()
    context.moveTo(
      18,
      5
    )
    context.lineTo(
      24,
      1
    )
    context.lineTo(
      30,
      5
    )
    context.stroke()
  }

  context.fillStyle =
    '#ffffff'
  context.beginPath()
  context.arc(
    14,
    31,
    2.2,
    0,
    Math.PI *
      2
  )
  context.arc(
    34,
    31,
    2.2,
    0,
    Math.PI *
      2
  )
  context.fill()

  context.fillStyle =
    '#111111'
  context.beginPath()
  context.arc(
    14,
    40,
    3.2,
    0,
    Math.PI *
      2
  )
  context.arc(
    34,
    40,
    3.2,
    0,
    Math.PI *
      2
  )
  context.fill()

  return context.getImageData(
    0,
    0,
    size,
    size
  )
}


function createStopMarkerImage() {
  const size =
    48
  const canvas =
    document.createElement(
      'canvas'
    )

  canvas.width =
    size
  canvas.height =
    size

  const context =
    canvas.getContext(
      '2d'
    )

  if (
    !context
  ) {
    return null
  }

  context.clearRect(
    0,
    0,
    size,
    size
  )
  context.fillStyle =
    '#ffffff'
  context.strokeStyle =
    '#111111'
  context.lineWidth =
    3
  context.beginPath()
  context.arc(
    24,
    18,
    14,
    Math.PI,
    0
  )
  context.quadraticCurveTo(
    38,
    29,
    24,
    45
  )
  context.quadraticCurveTo(
    10,
    29,
    10,
    18
  )
  context.closePath()
  context.fill()
  context.stroke()

  context.fillStyle =
    '#111111'
  context.font =
    '900 16px Arial, Helvetica, sans-serif'
  context.textAlign =
    'center'
  context.textBaseline =
    'middle'
  context.fillText(
    'T',
    24,
    18
  )

  return context.getImageData(
    0,
    0,
    size,
    size
  )
}


function getStreetLabelInsertionLayerId(
  map
) {
  const layers =
    map?.getStyle?.()
      ?.layers ||
    []


  const preferred =
    layers.find(
      (layer) => {
        if (
          layer?.type !==
            'symbol' ||
          String(
            layer?.id ||
            ''
          )
            .startsWith(
              'ttc-live-'
            )
        ) {
          return false
        }


        return Boolean(
          layer?.layout?.[
            'text-field'
          ]
        )
      }
    )


  return (
    preferred?.id ||
    undefined
  )
}

function LiveTtcLayer({
  map,
  active =
    false,
}) {
  const popupRef =
    useRef(null)
  const selectedRouteRef =
    useRef('')
  const vehicleAnimationsRef =
    useRef(
      new Map()
    )
  const animationTimerRef =
    useRef(null)
  const networkAbortRef =
    useRef(null)
  const vehicleAbortRef =
    useRef(null)
  const routeFeaturesRef =
    useRef([])
  const routePathsByRouteRef =
    useRef(
      new Map()
    )


  useEffect(
    () => {
      if (
        !map ||
        !active
      ) {
        return undefined
      }

      let disposed =
        false
      let vehicleTimer =
        null
      let networkTimer =
        null
      let stopArrivalRefreshTimer =
        null
      let stopArrivalAbortController =
        null
      let controlsRoot =
        null
      let routeSelect =
        null
      let accuracyHint =
        null
      let routeCatalogById =
        new Map()
      let gpsPrompt =
        null
      let routeIndexBuildTimer =
        null
      let routeIndexBuildIdle =
        null
      let routeIndexBuildGeneration =
        0
      let selectedRoutePulseTimer =
        null
      let mapIsMoving =
        false
      let accuracyHintVisible =
        null
      let firstVehicleRefresh =
        true
      let vehicleRefreshInFlight =
        false
      let didPrioritizeRouteIndexForVehicles =
        false

      function stopArrivalRefresh() {
        window.clearTimeout(
          stopArrivalRefreshTimer
        )
        stopArrivalRefreshTimer =
          null

        stopArrivalAbortController
          ?.abort?.()
        stopArrivalAbortController =
          null
      }


      function removePopup() {
        stopArrivalRefresh()

        popupRef.current
          ?.remove?.()
        popupRef.current =
          null
      }


      function clickStartedOnGeographicPin(
        event
      ) {
        const target =
          event?.originalEvent?.target

        return Boolean(
          target?.closest?.(
            '.geographic-pin, ' +
            '.geographic-pin-emoji-marker, ' +
            '.geographic-pin-historic-stack'
          )
        )
      }


      function popupOptions({
        offset =
          14,
        maxWidth =
          '310px',
      } = {}) {
        return {
          closeButton:
            true,
          closeOnClick:
            false,
          offset,
          maxWidth,
          padding: {
            top:
              92,
            right:
              18,
            bottom:
              92,
            left:
              18,
          },
        }
      }

      function snapPopupToScreen(
        lngLat
      ) {
        if (
          !lngLat
        ) {
          return
        }

        map.easeTo({
          center:
            lngLat,
          duration:
            220,
          essential:
            true,
        })
      }

      function requestGpsCenter() {
        if (
          !navigator?.geolocation
        ) {
          if (
            controlsRoot
          ) {
            const button =
              controlsRoot.querySelector(
                '[data-ttc-gps]'
              )
            if (
              button
            ) {
              button.textContent =
                'GPS UNAVAILABLE'
            }
          }
          return
        }

        const button =
          controlsRoot?.querySelector(
            '[data-ttc-gps]'
          )

        if (
          button
        ) {
          button.textContent =
            'LOCATING…'
        }

        navigator.geolocation.getCurrentPosition(
          (
            position
          ) => {
            const longitude =
              Number(
                position?.coords?.longitude
              )
            const latitude =
              Number(
                position?.coords?.latitude
              )

            if (
              !Number.isFinite(
                longitude
              ) ||
              !Number.isFinite(
                latitude
              )
            ) {
              return
            }

            map.easeTo({
              center: [
                longitude,
                latitude,
              ],
              zoom:
                Math.max(
                  13.5,
                  map.getZoom()
                ),
              duration:
                650,
              essential:
                true,
            })

            if (
              button
            ) {
              button.textContent =
                'GPS ✓'
            }

            gpsPrompt?.remove?.()
            gpsPrompt =
              null
          },
          () => {
            if (
              button
            ) {
              button.textContent =
                'GPS'
            }
          },
          {
            enableHighAccuracy:
              true,
            timeout:
              10000,
            maximumAge:
              15000,
          }
        )
      }

      function updateRouteSelector(
        catalog
      ) {
        if (
          !routeSelect ||
          routeSelect.dataset.loaded ===
            '1' ||
          !Array.isArray(
            catalog
          )
        ) {
          return
        }

        routeCatalogById =
          new Map()

        const fragment =
          document.createDocumentFragment()

        catalog.forEach(
          (
            route
          ) => {
            const id =
              String(
                route?.id ||
                ''
              )

            if (
              !id
            ) {
              return
            }

            routeCatalogById.set(
              id,
              route
            )

            const option =
              document.createElement(
                'option'
              )
            option.value =
              id
            option.textContent =
              `${route.shortName || id}${route.longName ? ` · ${route.longName}` : ''}`
            fragment.appendChild(
              option
            )
          }
        )

        routeSelect.appendChild(
          fragment
        )
        routeSelect.dataset.loaded =
          '1'
        routeSelect.value =
          selectedRouteRef.current ||
          ''
      }

      function updateAccuracyHint() {
        if (
          !accuracyHint
        ) {
          return
        }

        const showHint =
          Number(
            map.getZoom()
          ) <
          BUS_ACCURACY_ZOOM_THRESHOLD

        if (
          accuracyHintVisible ===
            showHint
        ) {
          return
        }

        accuracyHintVisible =
          showHint

        accuracyHint.textContent =
          'ZOOM IN FOR MORE BUS ACCURACY'
        accuracyHint.style.display =
          showHint
            ? 'block'
            : 'none'
      }


      function createLiveTtcControls() {
        const container =
          map.getContainer()

        if (
          !container
        ) {
          return
        }

        controlsRoot =
          document.createElement(
            'div'
          )
        controlsRoot.dataset.ttcLiveControls =
          '1'

        Object.assign(
          controlsRoot.style,
          {
            position:
              'absolute',
            top:
              '72px',
            left:
              '50%',
            transform:
              'translateX(-50%)',
            zIndex:
              '18',
            display:
              'flex',
            gap:
              '6px',
            alignItems:
              'center',
            maxWidth:
              'calc(100% - 24px)',
            pointerEvents:
              'auto',
          }
        )

        routeSelect =
          document.createElement(
            'select'
          )
        routeSelect.setAttribute(
          'aria-label',
          'Select TTC route'
        )
        Object.assign(
          routeSelect.style,
          {
            height:
              '34px',
            minWidth:
              '170px',
            maxWidth:
              '62vw',
            border:
              '1px solid rgba(0,0,0,0.22)',
            borderRadius:
              '8px',
            background:
              '#fff',
            color:
              '#111',
            padding:
              '0 30px 0 10px',
            fontSize:
              '11px',
            fontWeight:
              '800',
            boxShadow:
              '0 2px 8px rgba(0,0,0,0.14)',
          }
        )

        const allOption =
          document.createElement(
            'option'
          )
        allOption.value =
          ''
        allOption.textContent =
          'ALL TTC ROUTES'
        routeSelect.appendChild(
          allOption
        )
        routeSelect.addEventListener(
          'change',
          () => {
            const routeId =
              routeSelect.value
            setSelectedRoute(
              routeId
            )

            const route =
              routeCatalogById.get(
                routeId
              )
            const bounds =
              route?.bounds

            if (
              routeId &&
              Array.isArray(
                bounds
              ) &&
              bounds.length ===
                4 &&
              bounds.every(
                Number.isFinite
              )
            ) {
              map.fitBounds(
                [
                  [
                    bounds[0],
                    bounds[1],
                  ],
                  [
                    bounds[2],
                    bounds[3],
                  ],
                ],
                {
                  padding: {
                    top:
                      115,
                    right:
                      55,
                    bottom:
                      70,
                    left:
                      55,
                  },
                  maxZoom:
                    13,
                  duration:
                    650,
                }
              )
            }
          }
        )

        const gpsButton =
          document.createElement(
            'button'
          )
        gpsButton.type =
          'button'
        gpsButton.dataset.ttcGps =
          '1'
        gpsButton.textContent =
          'GPS'
        Object.assign(
          gpsButton.style,
          {
            height:
              '34px',
            border:
              '1px solid rgba(0,0,0,0.22)',
            borderRadius:
              '8px',
            background:
              '#111',
            color:
              '#fff',
            padding:
              '0 11px',
            fontSize:
              '10px',
            fontWeight:
              '900',
            letterSpacing:
              '0.06em',
            boxShadow:
              '0 2px 8px rgba(0,0,0,0.14)',
            cursor:
              'pointer',
          }
        )
        gpsButton.addEventListener(
          'click',
          requestGpsCenter
        )

        controlsRoot.appendChild(
          routeSelect
        )
        controlsRoot.appendChild(
          gpsButton
        )

        accuracyHint =
          document.createElement(
            'div'
          )
        accuracyHint.setAttribute(
          'aria-live',
          'polite'
        )
        Object.assign(
          accuracyHint.style,
          {
            position:
              'absolute',
            top:
              '40px',
            left:
              '50%',
            transform:
              'translateX(-50%)',
            display:
              'none',
            whiteSpace:
              'nowrap',
            background:
              'rgba(255,255,255,0.94)',
            color:
              '#000',
            border:
              '1px solid rgba(0,0,0,0.2)',
            borderRadius:
              '999px',
            padding:
              '4px 7px',
            fontSize:
              '8px',
            fontWeight:
              '900',
            letterSpacing:
              '0.07em',
            boxShadow:
              '0 1px 5px rgba(0,0,0,0.12)',
            pointerEvents:
              'none',
          }
        )
        controlsRoot.appendChild(
          accuracyHint
        )

        container.appendChild(
          controlsRoot
        )
        updateAccuracyHint()

        let alreadyPrompted =
          false
        try {
          alreadyPrompted =
            sessionStorage.getItem(
              GPS_PROMPT_SESSION_KEY
            ) ===
              '1'
        }
        catch {
          alreadyPrompted =
            false
        }

        if (
          alreadyPrompted
        ) {
          return
        }

        gpsPrompt =
          document.createElement(
            'div'
          )
        Object.assign(
          gpsPrompt.style,
          {
            position:
              'absolute',
            left:
              '50%',
            top:
              '50%',
            transform:
              'translate(-50%, -50%)',
            zIndex:
              '22',
            width:
              'min(330px, calc(100% - 34px))',
            background:
              '#fff',
            color:
              '#111',
            border:
              '1px solid rgba(0,0,0,0.2)',
            borderRadius:
              '12px',
            padding:
              '16px',
            boxShadow:
              '0 10px 36px rgba(0,0,0,0.24)',
            fontFamily:
              'Arial, Helvetica, sans-serif',
          }
        )

        addTextLine({
          parent:
            gpsPrompt,
          text:
            'LIVE BUSES',
          style: {
            fontSize:
              '10px',
            fontWeight:
              '900',
            letterSpacing:
              '0.12em',
            opacity:
              '0.55',
            marginBottom:
              '5px',
          },
        })
        addTextLine({
          parent:
            gpsPrompt,
          text:
            'Browse the map, or use GPS to jump to live buses and streetcars around you.',
          style: {
            fontSize:
              '14px',
            lineHeight:
              '1.35',
            fontWeight:
              '800',
            marginBottom:
              '13px',
          },
        })

        const actions =
          document.createElement(
            'div'
          )
        Object.assign(
          actions.style,
          {
            display:
              'flex',
            gap:
              '7px',
          }
        )

        const useGps =
          document.createElement(
            'button'
          )
        useGps.type =
          'button'
        useGps.textContent =
          'USE GPS'
        Object.assign(
          useGps.style,
          {
            flex:
              '1',
            height:
              '36px',
            border:
              '0',
            borderRadius:
              '8px',
            background:
              '#111',
            color:
              '#fff',
            fontSize:
              '11px',
            fontWeight:
              '900',
            cursor:
              'pointer',
          }
        )

        const browse =
          document.createElement(
            'button'
          )
        browse.type =
          'button'
        browse.textContent =
          'BROWSE MAP'
        Object.assign(
          browse.style,
          {
            flex:
              '1',
            height:
              '36px',
            border:
              '1px solid rgba(0,0,0,0.22)',
            borderRadius:
              '8px',
            background:
              '#fff',
            color:
              '#111',
            fontSize:
              '11px',
            fontWeight:
              '900',
            cursor:
              'pointer',
          }
        )

        const rememberPrompt =
          () => {
            try {
              sessionStorage.setItem(
                GPS_PROMPT_SESSION_KEY,
                '1'
              )
            }
            catch {
              // Session storage can be unavailable in strict privacy modes.
            }
          }

        useGps.addEventListener(
          'click',
          () => {
            rememberPrompt()
            requestGpsCenter()
          }
        )
        browse.addEventListener(
          'click',
          () => {
            rememberPrompt()
            gpsPrompt?.remove?.()
            gpsPrompt =
              null
          }
        )

        actions.appendChild(
          useGps
        )
        actions.appendChild(
          browse
        )
        gpsPrompt.appendChild(
          actions
        )
        container.appendChild(
          gpsPrompt
        )
      }

      function safeRemoveLayer(
        layerId
      ) {
        if (
          map.getLayer(
            layerId
          )
        ) {
          map.removeLayer(
            layerId
          )
        }
      }

      function safeRemoveImage(
        imageId
      ) {
        if (
          map.hasImage(
            imageId
          )
        ) {
          map.removeImage(
            imageId
          )
        }
      }

      function safeRemoveSource(
        sourceId
      ) {
        if (
          map.getSource(
            sourceId
          )
        ) {
          map.removeSource(
            sourceId
          )
        }
      }

      function ensureLiveTtcImage(
        imageId
      ) {
        let image =
          null

        if (
          imageId ===
            BUS_MARKER_IMAGE_ID
        ) {
          image =
            createVehicleMarkerImage(
              '#000000'
            )
        }
        else if (
          imageId ===
            STREETCAR_MARKER_IMAGE_ID
        ) {
          image =
            createVehicleMarkerImage(
              '#000000',
              {
                streetcar:
                  true,
              }
            )
        }
        else if (
          imageId ===
            STOP_MARKER_IMAGE_ID
        ) {
          image =
            createStopMarkerImage()
        }

        if (
          !image
        ) {
          return
        }

        try {
          if (
            map.hasImage(
              imageId
            )
          ) {
            map.updateImage(
              imageId,
              image
            )
          }
          else {
            map.addImage(
              imageId,
              image,
              {
                pixelRatio:
                  2,
                sdf:
                  false,
              }
            )
          }
        }
        catch (
          error
        ) {
          console.warn(
            'LIVE TTC IMAGE:',
            imageId,
            error
          )
        }
      }

      function ensureLiveTtcImages() {
        ;[
          BUS_MARKER_IMAGE_ID,
          STREETCAR_MARKER_IMAGE_ID,
          STOP_MARKER_IMAGE_ID,
        ]
          .forEach(
            ensureLiveTtcImage
          )
      }

      function handleStyleImageMissing(
        event
      ) {
        const imageId =
          String(
            event?.id ||
            ''
          )

        if (
          imageId ===
            BUS_MARKER_IMAGE_ID ||
          imageId ===
            STREETCAR_MARKER_IMAGE_ID ||
          imageId ===
            STOP_MARKER_IMAGE_ID
        ) {
          ensureLiveTtcImage(
            imageId
          )
        }
      }

      function handleStyleData() {
        if (
          disposed
        ) {
          return
        }

        ensureLiveTtcImages()
      }

      function addSourcesAndLayers() {
        const streetLabelLayerId =
          getStreetLabelInsertionLayerId(
            map
          )

        ensureLiveTtcImages()

        if (
          !map.getSource(
            ROUTES_SOURCE_ID
          )
        ) {
          map.addSource(
            ROUTES_SOURCE_ID,
            {
              type:
                'geojson',
              data:
                EMPTY_FEATURE_COLLECTION,
              attribution:
                'Contains information licensed under the Open Government Licence - Toronto',
            }
          )
        }

        if (
          !map.getSource(
            STOPS_SOURCE_ID
          )
        ) {
          map.addSource(
            STOPS_SOURCE_ID,
            {
              type:
                'geojson',
              data:
                EMPTY_FEATURE_COLLECTION,
            }
          )
        }

        if (
          !map.getSource(
            STATIONS_SOURCE_ID
          )
        ) {
          map.addSource(
            STATIONS_SOURCE_ID,
            {
              type:
                'geojson',
              data:
                EMPTY_FEATURE_COLLECTION,
            }
          )
        }

        if (
          !map.getSource(
            VEHICLES_SOURCE_ID
          )
        ) {
          map.addSource(
            VEHICLES_SOURCE_ID,
            {
              type:
                'geojson',
              data:
                EMPTY_FEATURE_COLLECTION,
            }
          )
        }

        if (
          !map.getLayer(
            ROUTES_CASING_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              ROUTES_CASING_LAYER_ID,
            type:
              'line',
            source:
              ROUTES_SOURCE_ID,
            paint: {
              'line-color':
                '#000000',
              'line-width':
                0,
              'line-opacity':
                1,
            },
          },
            streetLabelLayerId
          )
        }

        if (
          !map.getLayer(
            ROUTES_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              ROUTES_LAYER_ID,
            type:
              'line',
            source:
              ROUTES_SOURCE_ID,
            paint: {
              'line-color':
                '#000000',
              'line-width': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                9,
                0.55,
                13,
                1.05,
                17,
                1.7,
              ],
              'line-opacity':
                1,
            },
          },
            streetLabelLayerId
          )
        }

        if (
          !map.getLayer(
            SELECTED_ROUTE_CASING_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              SELECTED_ROUTE_CASING_LAYER_ID,
            type:
              'line',
            source:
              ROUTES_SOURCE_ID,
            filter: [
              '==',
              [
                'get',
                'routeId',
              ],
              '__none__',
            ],
            paint: {
              'line-color':
                '#ffffff',
              'line-width': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                9,
                5.8,
                13,
                8.4,
                17,
                11.8,
              ],
              'line-opacity':
                0.92,
            },
          },
            streetLabelLayerId
          )
        }

        if (
          !map.getLayer(
            SELECTED_ROUTE_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              SELECTED_ROUTE_LAYER_ID,
            type:
              'line',
            source:
              ROUTES_SOURCE_ID,
            filter: [
              '==',
              [
                'get',
                'routeId',
              ],
              '__none__',
            ],
            paint: {
              'line-color':
                '#1677ff',
              'line-width': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                9,
                3.4,
                13,
                5.8,
                17,
                9.2,
              ],
              'line-opacity':
                0.96,
            },
          },
            streetLabelLayerId
          )
        }

        if (
          !map.getLayer(
            STOPS_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              STOPS_LAYER_ID,
            type:
              'symbol',
            source:
              STOPS_SOURCE_ID,
            minzoom:
              12.5,
            layout: {
              'icon-image':
                STOP_MARKER_IMAGE_ID,
              'icon-size': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                12.5,
                0.36,
                15,
                0.45,
                18,
                0.54,
              ],
              'icon-allow-overlap':
                false,
              'icon-ignore-placement':
                false,
            },
          })
        }

        if (
          !map.getLayer(
            STOPS_HIT_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              STOPS_HIT_LAYER_ID,
            type:
              'circle',
            source:
              STOPS_SOURCE_ID,
            minzoom:
              12.5,
            paint: {
              'circle-radius': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                12.5,
                12,
                16,
                16,
                18,
                19,
              ],
              'circle-color':
                '#000000',
              'circle-opacity':
                0.01,
              'circle-stroke-opacity':
                0,
            },
          })
        }

        if (
          !map.getLayer(
            STATIONS_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              STATIONS_LAYER_ID,
            type:
              'circle',
            source:
              STATIONS_SOURCE_ID,
            minzoom:
              10,
            paint: {
              'circle-radius': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                10,
                4,
                15,
                7,
              ],
              'circle-color':
                '#111111',
              'circle-stroke-color':
                '#ffffff',
              'circle-stroke-width':
                2,
            },
          })
        }

        if (
          !map.getLayer(
            STATION_LABELS_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              STATION_LABELS_LAYER_ID,
            type:
              'symbol',
            source:
              STATIONS_SOURCE_ID,
            minzoom:
              13.2,
            layout: {
              'text-field': [
                'get',
                'stopName',
              ],
              'text-size':
                10,
              'text-offset': [
                0,
                1.35,
              ],
              'text-anchor':
                'top',
              'text-allow-overlap':
                false,
            },
            paint: {
              'text-color':
                '#111111',
              'text-halo-color':
                '#ffffff',
              'text-halo-width':
                1.5,
            },
          })
        }

        if (
          !map.getLayer(
            VEHICLE_CIRCLE_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              VEHICLE_CIRCLE_LAYER_ID,
            type:
              'circle',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_DOT_MIN_ZOOM,
            paint: {
              'circle-radius': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                7.5,
                6,
                13,
                8,
                18,
                10,
              ],
              'circle-color':
                '#000000',
              'circle-opacity':
                0.01,
              'circle-stroke-opacity':
                0,
            },
          })
        }

        if (
          !map.getLayer(
            VEHICLE_ICON_LAYER_ID
          )
        ) {
          // Use a literal runtime image ID for buses. TTC stop icons already
          // prove this exact MapLibre addImage -> literal icon-image path works.
          // Avoid the previous data-driven icon-image expression entirely.
          map.addLayer({
            id:
              VEHICLE_ICON_LAYER_ID,
            type:
              'symbol',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_ICON_MIN_ZOOM,
            filter: [
              '!=',
              [
                'get',
                'mode',
              ],
              'streetcar',
            ],
            layout: {
              'icon-image':
                BUS_MARKER_IMAGE_ID,
              'icon-size': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                5.5,
                0.68,
                9,
                0.78,
                13,
                0.94,
                15,
                1.30,
                17,
                1.48,
                18,
                1.58,
              ],
              'icon-rotate': [
                'coalesce',
                [
                  'get',
                  'bearing',
                ],
                0,
              ],
              'icon-rotation-alignment':
                'map',
              'icon-allow-overlap':
                true,
              'icon-ignore-placement':
                true,
              'icon-padding':
                0,
            },
            paint: {
              'icon-opacity':
                1,
            },
          })
        }

        if (
          !map.getLayer(
            STREETCAR_ICON_LAYER_ID
          )
        ) {
          // Streetcars get their own literal icon layer for the same reason.
          map.addLayer({
            id:
              STREETCAR_ICON_LAYER_ID,
            type:
              'symbol',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_ICON_MIN_ZOOM,
            filter: [
              '==',
              [
                'get',
                'mode',
              ],
              'streetcar',
            ],
            layout: {
              'icon-image':
                STREETCAR_MARKER_IMAGE_ID,
              'icon-size': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                5.5,
                0.58,
                9,
                0.68,
                13,
                0.82,
                17,
                0.94,
              ],
              'icon-rotate': [
                'coalesce',
                [
                  'get',
                  'bearing',
                ],
                0,
              ],
              'icon-rotation-alignment':
                'map',
              'icon-allow-overlap':
                true,
              'icon-ignore-placement':
                true,
              'icon-padding':
                0,
            },
            paint: {
              'icon-opacity':
                1,
            },
          })
        }

        if (
          !map.getLayer(
            VEHICLE_ROUTE_LABEL_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              VEHICLE_ROUTE_LABEL_LAYER_ID,
            type:
              'symbol',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_LABEL_MIN_ZOOM,
            layout: {
              'text-field': [
                'get',
                'routeShortName',
              ],
              'text-size': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                13.5,
                8,
                15,
                9,
                17,
                10,
                18,
                11,
              ],
              'text-anchor':
                'bottom',
              'text-offset': [
                0,
                -2.6,
              ],
              'text-allow-overlap':
                true,
              'text-ignore-placement':
                true,
            },
            paint: {
              'text-color':
                '#111111',
              'text-halo-color':
                '#ffffff',
              'text-halo-width':
                1.6,
              'text-halo-blur':
                0.25,
            },
          })
        }

        if (
          !map.getLayer(
            VEHICLE_DIRECTION_LAYER_ID
          )
        ) {
          map.addLayer({
            id:
              VEHICLE_DIRECTION_LAYER_ID,
            type:
              'symbol',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_DIRECTION_MIN_ZOOM,
            filter: [
              'has',
              'bearing',
            ],
            layout: {
              'text-field':
                '▲',
              'text-size': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                5.5,
                6,
                11,
                7,
                17,
                9,
              ],
              'text-offset': [
                0,
                -1.55,
              ],
              'text-rotate': [
                'get',
                'bearing',
              ],
              'text-rotation-alignment':
                'map',
              'text-allow-overlap':
                true,
              'text-ignore-placement':
                true,
            },
            paint: {
              'text-color':
                '#000000',
              'text-halo-color':
                '#ffffff',
              'text-halo-width':
                1,
            },
          })
        }
      }

      function selectedRouteCoreWidthExpression(
        multiplier =
          1
      ) {
        return [
          'interpolate',
          [
            'linear',
          ],
          [
            'zoom',
          ],
          9,
          3.4 * multiplier,
          13,
          5.8 * multiplier,
          17,
          9.2 * multiplier,
        ]
      }

      function selectedRouteCasingWidthExpression(
        multiplier =
          1
      ) {
        return [
          'interpolate',
          [
            'linear',
          ],
          [
            'zoom',
          ],
          9,
          5.8 * multiplier,
          13,
          8.4 * multiplier,
          17,
          11.8 * multiplier,
        ]
      }


      function stopSelectedRoutePulse() {
        window.clearInterval(
          selectedRoutePulseTimer
        )
        selectedRoutePulseTimer =
          null

        if (
          map.getLayer(
            SELECTED_ROUTE_LAYER_ID
          )
        ) {
          map.setPaintProperty(
            SELECTED_ROUTE_LAYER_ID,
            'line-opacity',
            0.96
          )
          map.setPaintProperty(
            SELECTED_ROUTE_LAYER_ID,
            'line-width',
            selectedRouteCoreWidthExpression(
              1
            )
          )
        }

        if (
          map.getLayer(
            SELECTED_ROUTE_CASING_LAYER_ID
          )
        ) {
          map.setPaintProperty(
            SELECTED_ROUTE_CASING_LAYER_ID,
            'line-opacity',
            0.92
          )
          map.setPaintProperty(
            SELECTED_ROUTE_CASING_LAYER_ID,
            'line-width',
            selectedRouteCasingWidthExpression(
              1
            )
          )
        }
      }

      function startSelectedRoutePulse() {
        stopSelectedRoutePulse()

        const startedAt =
          performance.now()

        selectedRoutePulseTimer =
          window.setInterval(
            () => {
              if (
                disposed ||
                !selectedRouteRef.current
              ) {
                return
              }

              const phase =
                (
                  performance.now() -
                  startedAt
                ) /
                1250
              const wave =
                (
                  Math.sin(
                    phase *
                    Math.PI *
                    2
                  ) +
                  1
                ) /
                2

              if (
                map.getLayer(
                  SELECTED_ROUTE_CASING_LAYER_ID
                )
              ) {
                map.setPaintProperty(
                  SELECTED_ROUTE_CASING_LAYER_ID,
                  'line-opacity',
                  0.78 +
                    wave *
                    0.18
                )
                map.setPaintProperty(
                  SELECTED_ROUTE_CASING_LAYER_ID,
                  'line-width',
                  selectedRouteCasingWidthExpression(
                    1 +
                      wave *
                      0.10
                  )
                )
              }

              if (
                map.getLayer(
                  SELECTED_ROUTE_LAYER_ID
                )
              ) {
                map.setPaintProperty(
                  SELECTED_ROUTE_LAYER_ID,
                  'line-opacity',
                  0.74 +
                    wave *
                    0.26
                )
                map.setPaintProperty(
                  SELECTED_ROUTE_LAYER_ID,
                  'line-width',
                  selectedRouteCoreWidthExpression(
                    0.94 +
                      wave *
                      0.16
                  )
                )
              }
            },
            SELECTED_ROUTE_PULSE_MS
          )
      }

      function cancelRouteIndexBuild() {
        routeIndexBuildGeneration +=
          1

        window.clearTimeout(
          routeIndexBuildTimer
        )
        routeIndexBuildTimer =
          null

        if (
          routeIndexBuildIdle !==
            null &&
          typeof window.cancelIdleCallback ===
            'function'
        ) {
          window.cancelIdleCallback(
            routeIndexBuildIdle
          )
        }
        routeIndexBuildIdle =
          null
      }

      function promoteWaitingVehiclesToRouteProgress(
        routeIndex
      ) {
        const index =
          routeIndex ||
          routePathsByRouteRef.current
        const now =
          performance.now()
        let promoted =
          false

        vehicleAnimationsRef.current
          .forEach(
            (
              vehicleState
            ) => {
              if (
                vehicleState?.path ||
                !Array.isArray(
                  vehicleState?.realCoordinate
                )
              ) {
                return
              }

              const routeId =
                String(
                  vehicleState?.properties?.routeId ||
                  ''
                )

              if (
                !routeId ||
                !index?.has?.(
                  routeId
                )
              ) {
                return
              }

              const directionId =
                normalizeDirectionId(
                  vehicleState?.properties?.directionId
                )
              const bearing =
                Number.isFinite(
                  Number(
                    vehicleState?.properties?.bearing
                  )
                )
                  ? Number(
                      vehicleState.properties.bearing
                    )
                  : Number.isFinite(
                      Number(
                        vehicleState?.displayBearing
                      )
                    )
                    ? Number(
                        vehicleState.displayBearing
                      )
                    : null
              const selection =
                selectRouteProgressPath({
                  coordinate:
                    vehicleState.realCoordinate,
                  routeId,
                  shapeId:
                    vehicleState?.properties?.shapeId ||
                    '',
                  directionId,
                  bearing,
                  routePathsByRoute:
                    index,
                })

              if (
                !selection
              ) {
                return
              }

              const sampleProgress =
                selection.projection.progressMeters
              const speedState =
                routeEngineTargetSpeed({
                  previous:
                    null,
                  realProgress:
                    sampleProgress,
                  sampleTimestamp:
                    vehicleState.sampleTimestamp,
                  ttcSpeed:
                    vehicleState?.properties?.speed,
                  currentStatus:
                    vehicleState?.properties?.currentStatus,
                  now,
                })
              const realProgress =
                timestampCompensatedRouteProgress({
                  path:
                    selection.path,
                  sampleProgress,
                  sampleTimestamp:
                    vehicleState.sampleTimestamp,
                  reportedAgeSeconds:
                    vehicleState?.properties?.ageSeconds,
                  ttcSpeed:
                    vehicleState?.properties?.speed,
                  speedState,
                  previous:
                    null,
                  now,
                })
              const routeBearing =
                bearingAtRouteProgress(
                  selection.path,
                  realProgress
                )

              vehicleState.path =
                selection.path
              vehicleState.sampleProgress =
                sampleProgress
              vehicleState.realProgress =
                realProgress
              vehicleState.displayProgress =
                realProgress
              vehicleState.filteredSpeed =
                speedState.filteredSpeed
              vehicleState.stopped =
                speedState.stopped
              vehicleState.lastMovingAt =
                speedState.lastMovingAt
              vehicleState.lastFrameAt =
                now
              vehicleState.lastRenderedCoordinate =
                selection.projection.coordinate
              vehicleState.displayBearing =
                Number.isFinite(
                  Number(
                    routeBearing
                  )
                )
                  ? Number(
                      routeBearing
                    )
                  : bearing

              vehicleState.properties = {
                ...vehicleState.properties,
                bearing:
                  vehicleState.displayBearing,
              }

              promoted =
                true
            }
          )

        if (
          promoted
        ) {
          renderAnimatedVehicles()
        }
      }

      function scheduleRouteIndexBuild(
        features
      ) {
        cancelRouteIndexBuild()

        const generation =
          routeIndexBuildGeneration
        const activeRouteCounts =
          new Map()

        vehicleAnimationsRef.current
          .forEach(
            (
              vehicleState
            ) => {
              const routeId =
                String(
                  vehicleState?.properties?.routeId ||
                  ''
                )

              if (
                !routeId
              ) {
                return
              }

              activeRouteCounts.set(
                routeId,
                (
                  activeRouteCounts.get(
                    routeId
                  ) ||
                  0
                ) +
                  1
              )
            }
          )

        const groupedFeatures =
          new Map()

        ;(
          Array.isArray(
            features
          )
            ? features
            : []
        ).forEach(
          (
            feature
          ) => {
            const routeId =
              String(
                feature?.properties?.routeId ||
                ''
              )

            if (
              !routeId
            ) {
              return
            }

            if (
              !groupedFeatures.has(
                routeId
              )
            ) {
              groupedFeatures.set(
                routeId,
                []
              )
            }

            groupedFeatures
              .get(
                routeId
              )
              .push(
                feature
              )
          }
        )

        const routeGroups =
          Array.from(
            groupedFeatures.entries()
          )
            .map(
              ([
                routeId,
                routeFeatures,
              ]) => ({
                routeId,
                features:
                  routeFeatures,
                priority:
                  (
                    selectedRouteRef.current ===
                      routeId
                      ? 100000
                      : 0
                  ) +
                  (
                    activeRouteCounts.get(
                      routeId
                    ) ||
                    0
                  ),
              })
            )
            .sort(
              (
                a,
                b
              ) =>
                b.priority -
                a.priority
            )

        const nextIndex =
          new Map()
        let cursor =
          0

        const processBatch =
          () => {
            routeIndexBuildIdle =
              null
            routeIndexBuildTimer =
              null

            if (
              disposed ||
              generation !==
                routeIndexBuildGeneration
            ) {
              return
            }

            const end =
              Math.min(
                routeGroups.length,
                cursor +
                ROUTE_INDEX_ROUTE_BATCH_SIZE
              )

            for (
              ;
              cursor <
                end;
              cursor +=
                1
            ) {
              const group =
                routeGroups[
                  cursor
                ]
              const paths =
                group.features
                  .map(
                    (
                      feature
                    ) =>
                      buildRouteProgressPath(
                        feature
                      )
                  )
                  .filter(
                    (
                      path
                    ) =>
                      path &&
                      path.routeId
                  )

              if (
                paths.length >
                  0
              ) {
                // A route is published only after every visible shape for that
                // route is indexed, so a bus cannot lock onto the wrong
                // direction merely because the opposite shape was processed
                // first.
                nextIndex.set(
                  group.routeId,
                  paths
                )
              }
            }

            // Publish complete route groups immediately. Routes carrying the
            // most currently visible vehicles are processed first, so buses
            // begin moving without waiting for the citywide index to finish.
            routePathsByRouteRef.current =
              nextIndex
            promoteWaitingVehiclesToRouteProgress(
              nextIndex
            )

            if (
              cursor <
                routeGroups.length
            ) {
              routeIndexBuildTimer =
                window.setTimeout(
                  processBatch,
                  0
                )
              return
            }
          }

        // Start priority routes immediately instead of waiting for an idle
        // callback. Each following batch yields back to the browser.
        routeIndexBuildTimer =
          window.setTimeout(
            processBatch,
            0
          )
      }

      function setSelectedRoute(
        routeId
      ) {
        const normalized =
          String(
            routeId ||
            ''
          )

        selectedRouteRef.current =
          normalized

        const routeFilter = [
          '==',
          [
            'get',
            'routeId',
          ],
          normalized ||
            '__none__',
        ]

        if (
          map.getLayer(
            SELECTED_ROUTE_CASING_LAYER_ID
          )
        ) {
          map.setFilter(
            SELECTED_ROUTE_CASING_LAYER_ID,
            routeFilter
          )
        }

        if (
          map.getLayer(
            SELECTED_ROUTE_LAYER_ID
          )
        ) {
          map.setFilter(
            SELECTED_ROUTE_LAYER_ID,
            routeFilter
          )
        }

        if (
          map.getLayer(
            ROUTES_LAYER_ID
          )
        ) {
          map.setPaintProperty(
            ROUTES_LAYER_ID,
            'line-opacity',
            1
          )
        }

        if (
          normalized
        ) {
          startSelectedRoutePulse()
        }
        else {
          stopSelectedRoutePulse()
        }


        if (
          routeSelect &&
          routeSelect.value !==
            normalized
        ) {
          routeSelect.value =
            normalized
        }
      }

      async function refreshNetwork() {
        if (
          disposed
        ) {
          return
        }

        networkAbortRef.current
          ?.abort?.()

        const controller =
          new AbortController()
        networkAbortRef.current =
          controller

        const bounds =
          map.getBounds()
        const zoom =
          map.getZoom()

        const params =
          new URLSearchParams({
            west:
              String(
                bounds.getWest()
              ),
            south:
              String(
                bounds.getSouth()
              ),
            east:
              String(
                bounds.getEast()
              ),
            north:
              String(
                bounds.getNorth()
              ),
            zoom:
              String(
                zoom
              ),
          })

        try {
          const response =
            await fetch(
              `${NETWORK_ENDPOINT}?${params.toString()}`,
              {
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
              `Live TTC network request failed: ${response.status}`
            )
          }

          const payload =
            await response.json()

          routeFeaturesRef.current =
            Array.isArray(
              payload?.routes?.features
            )
              ? payload.routes.features
              : []

          updateRouteSelector(
            payload?.routeCatalog
          )

          if (
            disposed
          ) {
            return
          }

          // Paint the network first. Building the route-progress index can be
          // expensive at citywide zoom, so do it incrementally after the map
          // has had a chance to render the first frame.
          map
            .getSource(
              ROUTES_SOURCE_ID
            )
            ?.setData(
              payload.routes ||
              EMPTY_FEATURE_COLLECTION
            )

          map
            .getSource(
              STOPS_SOURCE_ID
            )
            ?.setData(
              payload.stops ||
              EMPTY_FEATURE_COLLECTION
            )

          map
            .getSource(
              STATIONS_SOURCE_ID
            )
            ?.setData(
              payload.stations ||
              EMPTY_FEATURE_COLLECTION
            )

          scheduleRouteIndexBuild(
            routeFeaturesRef.current
          )
        }
        catch (
          error
        ) {
          if (
            error?.name ===
            'AbortError'
          ) {
            return
          }

          console.warn(
            'LIVE TTC NETWORK:',
            error
          )
        }
      }

      function scheduleNetworkRefresh() {
        window.clearTimeout(
          networkTimer
        )

        networkTimer =
          window.setTimeout(
            () => {
              refreshNetwork()
            },
            380
          )
      }


      function handleMapMoveStart() {
        mapIsMoving =
          true
      }


      function handleMapMoveEnd() {
        mapIsMoving =
          false
        scheduleNetworkRefresh()
        updateAccuracyHint()

        // Paint the latest interpolated vehicle frame immediately after the
        // camera settles. Normal 2 s polling handles fresh GPS requests; we
        // do not launch an extra network request for every pan/zoom.
        renderAnimatedVehicles()
      }


      function renderAnimatedVehicles() {
        if (
          disposed ||
          mapIsMoving
        ) {
          return
        }

        const source =
          map.getSource(
            VEHICLES_SOURCE_ID
          )

        if (
          !source
        ) {
          return
        }

        const now =
          performance.now()
        const features =
          []

        vehicleAnimationsRef.current
          .forEach(
            (
              vehicleState,
              vehicleId
            ) => {
              let coordinate =
                null
              let displayBearing =
                vehicleState.displayBearing

              if (
                vehicleState.path &&
                Number.isFinite(
                  Number(
                    vehicleState.displayProgress
                  )
                ) &&
                Number.isFinite(
                  Number(
                    vehicleState.realProgress
                  )
                )
              ) {
                const previousFrameAt =
                  Number(
                    vehicleState.lastFrameAt ||
                    now
                  )
                const elapsedSeconds =
                  Math.max(
                    0,
                    Math.min(
                      0.25,
                      (
                        now -
                        previousFrameAt
                      ) /
                      1000
                    )
                  )
                vehicleState.lastFrameAt =
                  now

                const staleMs =
                  Math.max(
                    0,
                    now -
                    Number(
                      vehicleState.lastSeenAt ||
                      now
                    )
                  )

                if (
                  staleMs >
                    VEHICLE_GRACE_MS
                ) {
                  return
                }

                let staleFactor =
                  1

                if (
                  staleMs >
                    VEHICLE_STALE_SLOWDOWN_MS
                ) {
                  staleFactor =
                    1 -
                    clampNumber(
                      (
                        staleMs -
                        VEHICLE_STALE_SLOWDOWN_MS
                      ) /
                      Math.max(
                        1,
                        VEHICLE_STALE_STOP_MS -
                        VEHICLE_STALE_SLOWDOWN_MS
                      ),
                      0,
                      1
                    ) *
                    0.9
                }

                if (
                  staleMs >=
                    VEHICLE_STALE_STOP_MS
                ) {
                  staleFactor =
                    0
                }

                const progressError =
                  Number(
                    vehicleState.realProgress
                  ) -
                  Number(
                    vehicleState.displayProgress
                  )
                let visualSpeed =
                  Number(
                    vehicleState.filteredSpeed ||
                    0
                  ) *
                  staleFactor

                // Catch up gently when the real TTC sample is ahead. If the
                // display is slightly ahead, slow down instead of ever moving
                // the marker backwards.
                if (
                  progressError >
                    3
                ) {
                  // A fresh TTC sample should visibly affect the vehicle now,
                  // not several seconds later. Keep it smooth, but allow a
                  // stronger catch-up while staying route constrained.
                  visualSpeed +=
                    Math.min(
                      4.5,
                      progressError *
                      0.12
                    )
                }
                else if (
                  progressError <
                    -5
                ) {
                  visualSpeed *=
                    Math.max(
                      0.16,
                      1 -
                      Math.min(
                        0.84,
                        (
                          -progressError -
                          5
                        ) /
                        50
                      )
                    )
                }

                const recentlyMoving =
                  Number(
                    vehicleState.lastMovingAt ||
                    0
                  ) >
                    0 &&
                  now -
                    Number(
                      vehicleState.lastMovingAt
                    ) <
                    15 *
                    1000

                if (
                  recentlyMoving &&
                  !vehicleState.stopped &&
                  staleFactor >
                    0.2 &&
                  visualSpeed <
                    VEHICLE_MIN_CONTINUOUS_SPEED_MPS
                ) {
                  visualSpeed =
                    VEHICLE_MIN_CONTINUOUS_SPEED_MPS
                }

                visualSpeed =
                  clampNumber(
                    visualSpeed,
                    0,
                    VEHICLE_VISUAL_MAX_SPEED_MPS
                  )

                const currentDisplayProgress =
                  clampNumber(
                    Number(
                      vehicleState.displayProgress
                    ),
                    0,
                    vehicleState.path.totalMeters
                  )
                const sampleProgress =
                  Number.isFinite(
                    Number(
                      vehicleState.sampleProgress
                    )
                  )
                    ? Number(
                        vehicleState.sampleProgress
                      )
                    : Number(
                        vehicleState.realProgress
                      )
                const sampleTimestamp =
                  Number(
                    vehicleState.sampleTimestamp ||
                    0
                  )
                const sampleAgeSeconds =
                  sampleTimestamp >
                    0
                    ? clampNumber(
                        Date.now() /
                          1000 -
                          sampleTimestamp,
                        0,
                        VEHICLE_MAX_FORWARD_LEAD_SECONDS
                      )
                    : 0
                const projectedLeadMeters =
                  Math.min(
                    VEHICLE_MAX_FORWARD_LEAD_METERS,
                    Math.max(
                      0,
                      visualSpeed *
                        sampleAgeSeconds
                    )
                  )
                let targetProgress =
                  clampNumber(
                    sampleProgress +
                      projectedLeadMeters,
                    0,
                    vehicleState.path.totalMeters
                  )

                const nextStopProgress =
                  Number(
                    vehicleState.nextStopProgress
                  )
                const normalizedStatus =
                  String(
                    vehicleState?.properties?.currentStatus ||
                    ''
                  )
                    .toUpperCase()

                if (
                  Number.isFinite(
                    nextStopProgress
                  ) &&
                  nextStopProgress >=
                    sampleProgress -
                      25
                ) {
                  const stopBarrier =
                    (
                      !normalizedStatus ||
                      normalizedStatus.includes(
                        'IN_TRANSIT'
                      )
                    )
                      ? Math.max(
                          sampleProgress,
                          nextStopProgress -
                            VEHICLE_IN_TRANSIT_STOP_BUFFER_METERS
                        )
                      : nextStopProgress

                  targetProgress =
                    Math.min(
                      targetProgress,
                      stopBarrier
                    )
                }

                const nextProgress =
                  currentDisplayProgress >
                    targetProgress
                    ? targetProgress
                    : Math.min(
                        targetProgress,
                        currentDisplayProgress +
                          visualSpeed *
                          elapsedSeconds
                      )

                vehicleState.displayProgress =
                  nextProgress
                coordinate =
                  coordinateAtRouteProgress(
                    vehicleState.path,
                    nextProgress
                  )
                const routeBearing =
                  bearingAtRouteProgress(
                    vehicleState.path,
                    nextProgress
                  )

                if (
                  Number.isFinite(
                    Number(
                      routeBearing
                    )
                  )
                ) {
                  displayBearing =
                    Number(
                      routeBearing
                    )
                  vehicleState.displayBearing =
                    displayBearing
                }
              }
              else {
                // The live vehicle feed can arrive before the static route
                // geometry. Show the real TTC coordinate immediately; once the
                // network arrives, the next poll promotes this vehicle into the
                // route-progress engine without clearing the layer.
                coordinate =
                  vehicleState.realCoordinate ||
                  vehicleState.lastRenderedCoordinate
              }

              if (
                !Array.isArray(
                  coordinate
                )
              ) {
                return
              }

              vehicleState.lastRenderedCoordinate =
                coordinate

              const properties = {
                ...vehicleState.properties,
              }

              if (
                Number.isFinite(
                  Number(
                    displayBearing
                  )
                )
              ) {
                properties.bearing =
                  Number(
                    displayBearing
                  )
              }
              else if (
                properties.bearing ===
                  null ||
                !Number.isFinite(
                  Number(
                    properties.bearing
                  )
                )
              ) {
                delete properties.bearing
              }

              features.push({
                type:
                  'Feature',
                id:
                  vehicleId,
                geometry: {
                  type:
                    'Point',
                  coordinates:
                    coordinate,
                },
                properties,
              })
            }
          )

        source.setData(
          featureCollection(
            features
          )
        )
      }

      function startAnimationLoop() {
        window.clearInterval(
          animationTimerRef.current
        )

        animationTimerRef.current =
          window.setInterval(
            renderAnimatedVehicles,
            ANIMATION_FRAME_MS
          )
      }

      async function refreshVehicles() {
        if (
          disposed ||
          vehicleRefreshInFlight
        ) {
          return
        }

        vehicleRefreshInFlight =
          true

        const controller =
          new AbortController()
        vehicleAbortRef.current =
          controller

        // Do not abort a healthy request every time the 2-second poll ticks.
        // If Railway/TTC takes >2 s, overlapping ticks simply skip.
        const requestTimeout =
          window.setTimeout(
            () => {
              controller.abort()
            },
            12000
          )

        try {
          const bounds =
            map.getBounds()
          const params =
            new URLSearchParams({
              west:
                String(
                  bounds.getWest()
                ),
              south:
                String(
                  bounds.getSouth()
                ),
              east:
                String(
                  bounds.getEast()
                ),
              north:
                String(
                  bounds.getNorth()
                ),
              zoom:
                String(
                  map.getZoom()
                ),
            })

          const fetchLivePayload =
            async (
              preferFresh =
                false
            ) => {
              if (
                preferFresh
              ) {
                params.set(
                  'fresh',
                  '1'
                )
              }

              const response =
                await fetch(
                  `${VEHICLES_ENDPOINT}?${params.toString()}`,
                  {
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
                  `Live TTC vehicle request failed: ${response.status}`
                )
              }

              return response.json()
            }

          let payload =
            firstVehicleRefresh
              ? takeInitialVehiclePreloadSnapshot()
              : null

          if (
            !payload &&
            firstVehicleRefresh &&
            initialVehiclePreloadPromise
          ) {
            // The page-level preload and a bounded request are already in
            // flight. Use whichever valid payload arrives first; do not wait
            // behind a slow preload just because it started earlier.
            const boundedPromise =
              fetchLivePayload(
                false
              )

            try {
              payload =
                await Promise.any([
                  initialVehiclePreloadPromise
                    .then(
                      (
                        value
                      ) => {
                        if (
                          !validVehiclePayload(
                            value
                          )
                        ) {
                          throw new Error(
                            'Empty TTC preload'
                          )
                        }

                        return value
                      }
                    ),
                  boundedPromise
                    .then(
                      (
                        value
                      ) => {
                        if (
                          !validVehiclePayload(
                            value
                          )
                        ) {
                          throw new Error(
                            'Empty TTC vehicle response'
                          )
                        }

                        return value
                      }
                    ),
                ])
            }
            catch {
              payload =
                await boundedPromise
            }
          }

          if (
            !payload
          ) {
            payload =
              await fetchLivePayload(
                !firstVehicleRefresh
              )
          }

          firstVehicleRefresh =
            false

          if (
            disposed
          ) {
            return
          }

          let nextVehicles =
            Array.isArray(
              payload?.vehicles
            )
              ? payload.vehicles
              : []

          if (
            nextVehicles.length ===
              0
          ) {
            try {
              const fallbackResponse =
                await fetch(
                  VEHICLES_ENDPOINT,
                  {
                    cache:
                      'no-store',
                    signal:
                      controller.signal,
                  }
                )

              if (
                fallbackResponse.ok
              ) {
                const fallbackPayload =
                  await fallbackResponse.json()

                const fallbackVehicles =
                  Array.isArray(
                    fallbackPayload?.vehicles
                  )
                    ? fallbackPayload.vehicles
                    : []

                if (
                  fallbackVehicles.length >
                    0
                ) {
                  payload =
                    fallbackPayload
                  nextVehicles =
                    fallbackVehicles
                }
              }
            }
            catch (
              fallbackError
            ) {
              if (
                fallbackError?.name !==
                  'AbortError'
              ) {
                console.warn(
                  'LIVE TTC VEHICLES FALLBACK:',
                  fallbackError
                )
              }
            }
          }

          if (
            nextVehicles.length ===
              0
          ) {
            console.warn(
              'LIVE TTC VEHICLES EMPTY:',
              {
                count:
                  payload?.count,
                rawCount:
                  payload?.rawCount,
                freshCount:
                  payload?.freshCount,
                candidateCount:
                  payload?.candidateCount,
                usedStaleTimestampFallback:
                  payload?.usedStaleTimestampFallback,
                usedBoundsFallback:
                  payload?.usedBoundsFallback,
                upstream:
                  payload?.upstream,
              }
            )
          }
          const now =
            performance.now()
          const nextAnimations =
            new Map()

          nextVehicles
            .forEach(
              (
                vehicle
              ) => {
                const longitude =
                  Number(
                    vehicle.longitude
                  )
                const latitude =
                  Number(
                    vehicle.latitude
                  )
                const vehicleId =
                  String(
                    vehicle.id ||
                    ''
                  )

                if (
                  !vehicleId ||
                  !Number.isFinite(
                    longitude
                  ) ||
                  !Number.isFinite(
                    latitude
                  )
                ) {
                  return
                }

                const previous =
                  vehicleAnimationsRef.current
                    .get(
                      vehicleId
                    )
                const routeId =
                  String(
                    vehicle.routeId ||
                    ''
                  )
                const tripId =
                  String(
                    vehicle.tripId ||
                    ''
                  )
                const shapeId =
                  String(
                    vehicle.shapeId ||
                    ''
                  )
                const rawStopLongitude =
                  vehicle.stopLongitude
                const rawStopLatitude =
                  vehicle.stopLatitude
                const stopLongitude =
                  rawStopLongitude ===
                    null ||
                  rawStopLongitude ===
                    undefined ||
                  rawStopLongitude ===
                    ''
                    ? null
                    : Number(
                        rawStopLongitude
                      )
                const stopLatitude =
                  rawStopLatitude ===
                    null ||
                  rawStopLatitude ===
                    undefined ||
                  rawStopLatitude ===
                    ''
                    ? null
                    : Number(
                        rawStopLatitude
                      )
                const stopCoordinate =
                  Number.isFinite(
                    Number(
                      stopLongitude
                    )
                  ) &&
                  Number.isFinite(
                    Number(
                      stopLatitude
                    )
                  )
                    ? [
                        stopLongitude,
                        stopLatitude,
                      ]
                    : null
                const directionId =
                  normalizeDirectionId(
                    vehicle.directionId
                  )
                const bearing =
                  Number.isFinite(
                    Number(
                      vehicle.bearing
                    )
                  )
                    ? Number(
                        vehicle.bearing
                      )
                    : null
                const speed =
                  Number.isFinite(
                    Number(
                      vehicle.speed
                    )
                  )
                    ? Number(
                        vehicle.speed
                      )
                    : null
                const timestamp =
                  Number(
                    vehicle.timestamp ||
                    0
                  )
                const currentStatus =
                  String(
                    vehicle.currentStatus ||
                    ''
                  )
                const realCoordinate = [
                  longitude,
                  latitude,
                ]

                const sameRealtimeSample =
                  previous &&
                  timestamp >
                    0 &&
                  Number(
                    previous.sampleTimestamp ||
                    0
                  ) ===
                    timestamp

                if (
                  sameRealtimeSample &&
                  previous?.path &&
                  (
                    !shapeId ||
                    previous.path.shapeId ===
                      shapeId
                  )
                ) {
                  nextAnimations.set(
                    vehicleId,
                    {
                      ...previous,
                      // A repeated feed timestamp is cached data, not a new
                      // position sample. Keep lastSeenAt unchanged so stale
                      // feeds naturally slow instead of driving forever.
                      properties: {
                        ...previous.properties,
                        routeShortName:
                          vehicle.routeShortName ||
                          previous.properties?.routeShortName ||
                          routeId,
                        routeLongName:
                          vehicle.routeLongName ||
                          previous.properties?.routeLongName ||
                          '',
                        shapeId:
                          shapeId ||
                          previous.properties?.shapeId ||
                          '',
                        stopLongitude:
                          Number.isFinite(stopLongitude)
                            ? stopLongitude
                            : previous.properties?.stopLongitude ??
                              null,
                        stopLatitude:
                          Number.isFinite(stopLatitude)
                            ? stopLatitude
                            : previous.properties?.stopLatitude ??
                              null,
                        headsign:
                          vehicle.headsign ||
                          previous.properties?.headsign ||
                          '',
                        stopId:
                          vehicle.stopId ||
                          previous.properties?.stopId ||
                          '',
                        stopName:
                          vehicle.stopName ||
                          previous.properties?.stopName ||
                          '',
                        occupancyStatus:
                          vehicle.occupancyStatus ||
                          previous.properties?.occupancyStatus ||
                          '',
                      },
                    }
                  )
                  return
                }

                let path =
                  null
                let projection =
                  null
                const previousPathReusable =
                  previous?.path &&
                  previous.path.routeId ===
                    routeId &&
                  (
                    !shapeId ||
                    previous.path.shapeId ===
                      shapeId
                  ) &&
                  (
                    !directionId ||
                    !previous.path.directionId ||
                    previous.path.directionId ===
                      directionId
                  ) &&
                  (
                    !tripId ||
                    !previous?.properties?.tripId ||
                    previous.properties.tripId ===
                      tripId
                  )

                if (
                  previousPathReusable
                ) {
                  const previousProjection =
                    projectCoordinateOntoRoutePath(
                      realCoordinate,
                      previous.path
                    )

                  if (
                    previousProjection &&
                    previousProjection.distanceMeters <=
                      VEHICLE_ROUTE_LOCK_MAX_METERS
                  ) {
                    path =
                      previous.path
                    projection =
                      previousProjection
                  }
                }

                if (
                  !path
                ) {
                  const selection =
                    selectRouteProgressPath({
                      coordinate:
                        realCoordinate,
                      routeId,
                      shapeId,
                      directionId,
                      bearing,
                      routePathsByRoute:
                        routePathsByRouteRef.current,
                    })

                  if (
                    selection
                  ) {
                    path =
                      selection.path
                    projection =
                      selection.projection
                  }
                }

                const pathMatchesPrevious =
                  path &&
                  previous?.path &&
                  path.shapeId ===
                    previous.path.shapeId &&
                  path.directionId ===
                    previous.path.directionId
                let sampleProgress =
                  projection?.progressMeters ??
                  null
                const previousSampleProgress =
                  previous?.sampleProgress ??
                  previous?.realProgress
                const stopProjection =
                  path &&
                  stopCoordinate
                    ? projectCoordinateOntoRoutePath(
                        stopCoordinate,
                        path
                      )
                    : null
                const nextStopProgress =
                  stopProjection &&
                  Number.isFinite(
                    Number(
                      stopProjection.progressMeters
                    )
                  ) &&
                  Number.isFinite(
                    Number(
                      sampleProgress
                    )
                  ) &&
                  stopProjection.distanceMeters <=
                    80 &&
                  Number(
                    stopProjection.progressMeters
                  ) >=
                    Number(
                      sampleProgress
                    ) -
                      25 &&
                  Number(
                    stopProjection.progressMeters
                  ) <=
                    Number(
                      sampleProgress
                    ) +
                      2000
                    ? Number(
                        stopProjection.progressMeters
                      )
                    : null

                // TTC TRUTH MODE · accept a fresh TTC route-projected GPS correction even
                // when it moves backward. A brief correction is preferable to preserving
                // a confidently wrong forward position.

                const sampleHistory =
                  path &&
                  Number.isFinite(
                    Number(
                      sampleProgress
                    )
                  )
                    ? appendVehicleSampleHistory({
                        previous:
                          pathMatchesPrevious
                            ? previous
                            : null,
                        progress:
                          sampleProgress,
                        timestamp,
                        samePath:
                          pathMatchesPrevious,
                      })
                    : []

                const historySpeed =
                  medianVehicleHistorySpeed(
                    sampleHistory
                  )

                const speedState =
                  path &&
                  Number.isFinite(
                    Number(
                      sampleProgress
                    )
                  )
                    ? routeEngineTargetSpeed({
                        previous:
                          pathMatchesPrevious
                            ? previous
                            : null,
                        realProgress:
                          sampleProgress,
                        sampleTimestamp:
                          timestamp,
                        ttcSpeed:
                          speed,
                        currentStatus,
                        historySpeed,
                        now,
                      })
                    : {
                        filteredSpeed:
                          Number.isFinite(
                            Number(
                              speed
                            )
                          )
                            ? clampNumber(
                                speed,
                                0,
                                VEHICLE_VISUAL_MAX_SPEED_MPS
                              )
                            : 0,
                        lastMovingAt:
                          previous?.lastMovingAt ??
                          0,
                        stopped:
                          currentStatus
                            .toUpperCase()
                            .includes(
                              'STOPPED'
                            ),
                      }

                const realProgress =
                  path &&
                  Number.isFinite(
                    Number(
                      sampleProgress
                    )
                  )
                    ? timestampCompensatedRouteProgress({
                        path,
                        sampleProgress,
                        sampleTimestamp:
                          timestamp,
                        reportedAgeSeconds:
                          vehicle.ageSeconds,
                        ttcSpeed:
                          speed,
                        speedState,
                        previous:
                          pathMatchesPrevious
                            ? previous
                            : null,
                        now,
                      })
                    : sampleProgress

                let displayProgress =
                  null

                if (
                  path &&
                  Number.isFinite(
                    Number(
                      realProgress
                    )
                  )
                ) {
                  if (
                    pathMatchesPrevious &&
                    Number.isFinite(
                      Number(
                        previous.displayProgress
                      )
                    )
                  ) {
                    displayProgress =
                      clampNumber(
                        previous.displayProgress,
                        0,
                        path.totalMeters
                      )
                  }
                  else {
                    displayProgress =
                      clampNumber(
                        realProgress,
                        0,
                        path.totalMeters
                      )
                  }
                }

                const routeBearing =
                  path &&
                  Number.isFinite(
                    Number(
                      displayProgress
                    )
                  )
                    ? bearingAtRouteProgress(
                        path,
                        displayProgress
                      )
                    : bearing

                nextAnimations.set(
                  vehicleId,
                  {
                    path,
                    sampleProgress,
                    realProgress,
                    displayProgress,
                    nextStopProgress,
                    filteredSpeed:
                      speedState.filteredSpeed,
                    stopped:
                      speedState.stopped,
                    sampleTimestamp:
                      timestamp,
                    sampleHistory,
                    lastSeenAt:
                      now,
                    lastMovingAt:
                      speedState.lastMovingAt,
                    lastFrameAt:
                      previous?.lastFrameAt ||
                      now,
                    lastRenderedCoordinate:
                      previous?.lastRenderedCoordinate ||
                      projection?.coordinate ||
                      realCoordinate,
                    realCoordinate,
                    displayBearing:
                      Number.isFinite(
                        Number(
                          routeBearing
                        )
                      )
                        ? Number(
                            routeBearing
                          )
                        : previous?.displayBearing ??
                          bearing,
                    properties: {
                      id:
                        vehicleId,
                      vehicleId,
                      label:
                        vehicle.label ||
                        vehicleId,
                      tripId,
                      routeId,
                      shapeId,
                      routeShortName:
                        vehicle.routeShortName ||
                        routeId,
                      routeLongName:
                        vehicle.routeLongName ||
                        '',
                      routeType:
                        Number(
                          vehicle.routeType ??
                          3
                        ),
                      mode:
                        vehicle.mode ||
                        'bus',
                      headsign:
                        vehicle.headsign ||
                        '',
                      directionId,
                      stopId:
                        vehicle.stopId ||
                        '',
                      currentStopSequence:
                        Number.isFinite(
                          Number(
                            vehicle.currentStopSequence
                          )
                        )
                          ? Number(
                              vehicle.currentStopSequence
                            )
                          : null,
                      stopName:
                        vehicle.stopName ||
                        '',
                      stopLongitude:
                        Number.isFinite(stopLongitude)
                          ? stopLongitude
                          : null,
                      stopLatitude:
                        Number.isFinite(stopLatitude)
                          ? stopLatitude
                          : null,
                      currentStatus,
                      timestamp,
                      ageSeconds:
                        Number.isFinite(
                          Number(
                            vehicle.ageSeconds
                          )
                        )
                          ? Number(
                              vehicle.ageSeconds
                            )
                          : 0,
                      bearing:
                        routeBearing,
                      speed,
                      occupancyStatus:
                        vehicle.occupancyStatus ||
                        '',
                    },
                  }
                )
              }
            )

          vehicleAnimationsRef.current
            .forEach(
              (
                previous,
                vehicleId
              ) => {
                if (
                  nextAnimations.has(
                    vehicleId
                  )
                ) {
                  return
                }

                const lastSeenAt =
                  Number(
                    previous?.lastSeenAt ??
                    0
                  )

                if (
                  lastSeenAt <=
                    0 ||
                  now -
                    lastSeenAt >
                    VEHICLE_GRACE_MS
                ) {
                  return
                }

                nextAnimations.set(
                  vehicleId,
                  previous
                )
              }
            )

          vehicleAnimationsRef.current =
            nextAnimations

          if (
            !didPrioritizeRouteIndexForVehicles &&
            routeFeaturesRef.current.length >
              0 &&
            nextAnimations.size >
              0
          ) {
            didPrioritizeRouteIndexForVehicles =
              true

            // If route geometry arrived before vehicles, rebuild once with
            // actually visible routes at the front of the index queue.
            scheduleRouteIndexBuild(
              routeFeaturesRef.current
            )
          }

          renderAnimatedVehicles()
        }
        catch (
          error
        ) {
          if (
            error?.name ===
            'AbortError'
          ) {
            return
          }

          console.warn(
            'LIVE TTC VEHICLES:',
            error
          )
        }
        finally {
          window.clearTimeout(
            requestTimeout
          )

          if (
            vehicleAbortRef.current ===
              controller
          ) {
            vehicleAbortRef.current =
              null
          }

          vehicleRefreshInFlight =
            false
        }
      }

      function handleVehicleClick(
        event
      ) {
        if (
          clickStartedOnGeographicPin(
            event
          )
        ) {
          return
        }

        const feature =
          event.features?.[0]

        if (
          !feature
        ) {
          return
        }

        removePopup()
        snapPopupToScreen(
          event.lngLat
        )

        popupRef.current =
          new Popup(
            popupOptions({
              offset:
                16,
              maxWidth:
                '300px',
            })
          )
            .setLngLat(
              event.lngLat
            )
            .setDOMContent(
              createVehiclePopup(
                feature.properties ||
                {}
              )
            )
            .addTo(
              map
            )
      }

      async function handleStopClick(
        event
      ) {
        if (
          clickStartedOnGeographicPin(
            event
          )
        ) {
          return
        }

        const feature =
          event.features?.[0]

        if (
          !feature
        ) {
          return
        }

        const properties =
          feature.properties ||
          {}

        const stopId =
          String(
            properties.stopId ||
            ''
          )
        const stopCode =
          String(
            properties.stopCode ||
            ''
          )

        if (
          !stopId &&
          !stopCode
        ) {
          return
        }

        removePopup()
        snapPopupToScreen(
          event.lngLat
        )

        const shell =
          createStopPopupLoading(
            properties
          )

        const popup =
          new Popup(
            popupOptions({
              offset:
                13,
              maxWidth:
                '330px',
            })
          )
            .setLngLat(
              event.lngLat
            )
            .setDOMContent(
              shell
            )
            .addTo(
              map
            )

        popupRef.current =
          popup

        popup.on(
          'close',
          () => {
            if (
              popupRef.current ===
                popup
            ) {
              stopArrivalRefresh()
              popupRef.current =
                null
            }
          }
        )

        let hasLoadedArrivals =
          false

        async function refreshStopArrivals() {
          if (
            disposed ||
            popupRef.current !==
              popup
          ) {
            return
          }

          const controller =
            new AbortController()
          stopArrivalAbortController =
            controller

          try {
            const response =
              await fetch(
                `${ARRIVALS_ENDPOINT}?stopId=${encodeURIComponent(stopId)}&stopCode=${encodeURIComponent(stopCode)}`,
                {
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
                `TTC arrivals request failed: ${response.status}`
              )
            }

            const payload =
              await response.json()

            if (
              popupRef.current !==
                popup
            ) {
              return
            }

            fillStopArrivals({
              shell,
              payload,
            })

            if (
              !hasLoadedArrivals
            ) {
              hasLoadedArrivals =
                true
              snapPopupToScreen(
                event.lngLat
              )
            }
          }
          catch (
            error
          ) {
            if (
              error?.name ===
                'AbortError'
            ) {
              return
            }

            console.warn(
              'LIVE TTC ARRIVALS:',
              error
            )

            if (
              !hasLoadedArrivals &&
              popupRef.current ===
                popup
            ) {
              shell
                .querySelectorAll(
                  '.ttc-live-stop-loading, .ttc-live-stop-error'
                )
                .forEach(
                  (
                    child
                  ) =>
                    child.remove()
                )

              addTextLine({
                parent:
                  shell,
                className:
                  'ttc-live-stop-error',
                text:
                  'Live arrivals are temporarily unavailable.',
                style: {
                  fontSize:
                    '10px',
                  marginTop:
                    '7px',
                  opacity:
                    '0.65',
                },
              })
            }
          }
          finally {
            if (
              stopArrivalAbortController ===
                controller
            ) {
              stopArrivalAbortController =
                null
            }

            if (
              !disposed &&
              popupRef.current ===
                popup
            ) {
              window.clearTimeout(
                stopArrivalRefreshTimer
              )
              stopArrivalRefreshTimer =
                window.setTimeout(
                  refreshStopArrivals,
                  STOP_ARRIVAL_REFRESH_MS
                )
            }
          }
        }

        refreshStopArrivals()
      }

      async function handleStationClick(
        event
      ) {
        if (
          clickStartedOnGeographicPin(
            event
          )
        ) {
          return
        }

        const feature =
          event.features?.[0]

        if (
          !feature
        ) {
          return
        }

        const properties =
          feature.properties ||
          {}
        const coordinates =
          Array.isArray(
            feature.geometry?.coordinates
          )
            ? feature.geometry.coordinates
            : [
                event.lngLat.lng,
                event.lngLat.lat,
              ]

        removePopup()
        snapPopupToScreen(
          event.lngLat
        )

        const shell =
          createStopPopupLoading({
            stopName:
              properties.stopName ||
              'TTC Station',
            stopCode:
              '',
            isStation:
              true,
          })

        const popup =
          new Popup(
            popupOptions({
              offset:
                14,
              maxWidth:
                '340px',
            })
          )
            .setLngLat(
              event.lngLat
            )
            .setDOMContent(
              shell
            )
            .addTo(
              map
            )

        popupRef.current =
          popup

        try {
          const params =
            new URLSearchParams({
              latitude:
                String(
                  coordinates[1]
                ),
              longitude:
                String(
                  coordinates[0]
                ),
              name:
                String(
                  properties.stopName ||
                  ''
                ),
            })

          const response =
            await fetch(
              `${ARRIVALS_ENDPOINT}/nearby?${params.toString()}`,
              {
                cache:
                  'no-store',
              }
            )

          if (
            !response.ok
          ) {
            throw new Error(
              `TTC station arrivals request failed: ${response.status}`
            )
          }

          const payload =
            await response.json()

          if (
            popupRef.current ===
              popup
          ) {
            fillStopArrivals({
              shell,
              payload,
            })
            snapPopupToScreen(
              event.lngLat
            )
          }
        }
        catch (
          error
        ) {
          console.warn(
            'LIVE TTC STATION ARRIVALS:',
            error
          )

          if (
            popupRef.current ===
              popup
          ) {
            addTextLine({
              parent:
                shell,
              text:
                'Nearby live arrivals are temporarily unavailable.',
              style: {
                fontSize:
                  '10px',
                marginTop:
                  '7px',
                opacity:
                  '0.65',
              },
            })
          }
        }
      }

      function handleRouteClick(
        event
      ) {
        if (
          clickStartedOnGeographicPin(
            event
          )
        ) {
          return
        }

        const feature =
          event.features?.[0]

        const routeId =
          String(
            feature?.properties?.routeId ||
            ''
          )

        if (
          !routeId
        ) {
          return
        }

        setSelectedRoute(
          selectedRouteRef.current ===
            routeId
            ? ''
            : routeId
        )
      }

      function handleMapBackgroundClick(
        event
      ) {
        const popupLayers =
          [
            VEHICLE_CIRCLE_LAYER_ID,
            STOPS_HIT_LAYER_ID,
            STATIONS_LAYER_ID,
          ]
            .filter(
              (
                layerId
              ) =>
                Boolean(
                  map.getLayer(
                    layerId
                  )
                )
            )

        if (
          popupLayers.length >
            0 &&
          map
            .queryRenderedFeatures(
              event.point,
              {
                layers:
                  popupLayers,
              }
            )
            .length >
            0
        ) {
          return
        }

        removePopup()
      }

      function handleMapPinClick() {
        removePopup()
      }


      function pointerCursor() {
        map.getCanvas().style.cursor =
          'pointer'
      }

      function clearPointerCursor() {
        map.getCanvas().style.cursor =
          ''
      }

      addSourcesAndLayers()
      createLiveTtcControls()
      setSelectedRoute(
        ''
      )

      map.on(
        'movestart',
        handleMapMoveStart
      )

      map.on(
        'moveend',
        handleMapMoveEnd
      )

      map.on(
        'zoom',
        updateAccuracyHint
      )

      map.on(
        'styleimagemissing',
        handleStyleImageMissing
      )

      map.on(
        'styledata',
        handleStyleData
      )

      map.on(
        'click',
        VEHICLE_CIRCLE_LAYER_ID,
        handleVehicleClick
      )

      map.on(
        'click',
        STOPS_HIT_LAYER_ID,
        handleStopClick
      )

      map.on(
        'click',
        STATIONS_LAYER_ID,
        handleStationClick
      )

      map.on(
        'click',
        ROUTES_LAYER_ID,
        handleRouteClick
      )

      map.on(
        'click',
        handleMapBackgroundClick
      )

      map
        .getContainer()
        .addEventListener(
          'geographic:map-pin-click',
          handleMapPinClick
        )

      ;[
        VEHICLE_CIRCLE_LAYER_ID,
        STOPS_HIT_LAYER_ID,
        STATIONS_LAYER_ID,
        ROUTES_LAYER_ID,
      ]
        .forEach(
          (
            layerId
          ) => {
            map.on(
              'mouseenter',
              layerId,
              pointerCursor
            )
            map.on(
              'mouseleave',
              layerId,
              clearPointerCursor
            )
          }
        )

      // Live vehicles are the first-paint priority. Reuse any recent frame
      // immediately, start animation, fetch fresh positions, then warm the
      // heavier route network/index in the background.
      renderAnimatedVehicles()
      startAnimationLoop()

      // Start realtime vehicles and route geometry together so the first
      // vehicle frame can lock to route geometry as soon as either arrives.
      refreshVehicles()
      refreshNetwork()

      vehicleTimer =
        window.setInterval(
          refreshVehicles,
          VEHICLE_POLL_MS
        )

      return () => {
        disposed =
          true

        networkAbortRef.current
          ?.abort?.()
        vehicleAbortRef.current
          ?.abort?.()

        window.clearTimeout(
          networkTimer
        )
        window.clearInterval(
          vehicleTimer
        )
        window.clearInterval(
          animationTimerRef.current
        )
        stopSelectedRoutePulse()
        cancelRouteIndexBuild()

        removePopup()
        gpsPrompt?.remove?.()
        gpsPrompt =
          null
        controlsRoot?.remove?.()
        controlsRoot =
          null
        routeSelect =
          null
        accuracyHint =
          null
        routeCatalogById =
          new Map()

        map.off(
          'movestart',
          handleMapMoveStart
        )

        map.off(
          'moveend',
          handleMapMoveEnd
        )

        map.off(
          'zoom',
          updateAccuracyHint
        )

        map.off(
          'styleimagemissing',
          handleStyleImageMissing
        )

        map.off(
          'styledata',
          handleStyleData
        )

        map.off(
          'click',
          VEHICLE_CIRCLE_LAYER_ID,
          handleVehicleClick
        )

        map.off(
          'click',
          STOPS_HIT_LAYER_ID,
          handleStopClick
        )

        map.off(
          'click',
          STATIONS_LAYER_ID,
          handleStationClick
        )

        map.off(
          'click',
          ROUTES_LAYER_ID,
          handleRouteClick
        )

        map.off(
          'click',
          handleMapBackgroundClick
        )

        map
          .getContainer()
          .removeEventListener(
            'geographic:map-pin-click',
            handleMapPinClick
          )

        ;[
          VEHICLE_CIRCLE_LAYER_ID,
          STOPS_HIT_LAYER_ID,
          STATIONS_LAYER_ID,
          ROUTES_LAYER_ID,
        ]
          .forEach(
            (
              layerId
            ) => {
              map.off(
                'mouseenter',
                layerId,
                pointerCursor
              )
              map.off(
                'mouseleave',
                layerId,
                clearPointerCursor
              )
            }
          )

        clearPointerCursor()

        ;[
          VEHICLE_DIRECTION_LAYER_ID,
          VEHICLE_ROUTE_LABEL_LAYER_ID,
          STREETCAR_ICON_LAYER_ID,
          VEHICLE_ICON_LAYER_ID,
          VEHICLE_CIRCLE_LAYER_ID,
          STATION_LABELS_LAYER_ID,
          STATIONS_LAYER_ID,
          STOPS_HIT_LAYER_ID,
          STOPS_LAYER_ID,
          SELECTED_ROUTE_LAYER_ID,
          SELECTED_ROUTE_CASING_LAYER_ID,
          ROUTES_LAYER_ID,
          ROUTES_CASING_LAYER_ID,
        ]
          .forEach(
            safeRemoveLayer
          )

        ;[
          STOP_MARKER_IMAGE_ID,
          STREETCAR_MARKER_IMAGE_ID,
          BUS_MARKER_IMAGE_ID,
        ]
          .forEach(
            safeRemoveImage
          )

        ;[
          VEHICLES_SOURCE_ID,
          STATIONS_SOURCE_ID,
          STOPS_SOURCE_ID,
          ROUTES_SOURCE_ID,
        ]
          .forEach(
            safeRemoveSource
          )

        // Keep the most recent vehicle and route-progress state in refs so
        // re-entering LIVE BUSES can paint immediately. Stale vehicles naturally
        // age out through VEHICLE_GRACE_MS.
        selectedRouteRef.current =
          ''
      }
    },
    [
      map,
      active,
    ]
  )


  return null
}


export default LiveTtcLayer
