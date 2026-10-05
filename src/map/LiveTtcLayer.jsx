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
const VEHICLE_ROUTE_LABEL_LAYER_ID =
  'ttc-live-vehicle-route-labels'
const VEHICLE_DIRECTION_LAYER_ID =
  'ttc-live-vehicle-direction'

const BUS_MARKER_IMAGE_ID =
  'ttc-live-bus-marker'
const STREETCAR_MARKER_IMAGE_ID =
  'ttc-live-streetcar-marker'
const STOP_MARKER_IMAGE_ID =
  'ttc-live-stop-marker'
const VEHICLE_DOT_MIN_ZOOM =
  5.5
const VEHICLE_ICON_MIN_ZOOM =
  5.5
const VEHICLE_LABEL_MIN_ZOOM =
  10.5
const GPS_PROMPT_SESSION_KEY =
  'toronto-geographic-live-ttc-gps-prompted'

const NETWORK_ENDPOINT =
  '/api/geographic/toronto/ttc/live/network'
const VEHICLES_ENDPOINT =
  '/api/geographic/toronto/ttc/live/vehicles'
const VEHICLES_STREAM_ENDPOINT =
  '/api/geographic/toronto/ttc/live/vehicles/stream'
const ARRIVALS_ENDPOINT =
  '/api/geographic/toronto/ttc/live/arrivals'

const VEHICLE_POLL_MS =
  5000
const VEHICLE_FOCUSED_POLL_MS =
  2500
const VEHICLE_DEEP_FOCUS_POLL_MS =
  1800
const VEHICLE_FOCUSED_ZOOM =
  13.5
const VEHICLE_DEEP_FOCUS_ZOOM =
  15
const VEHICLE_VISUAL_MAX_SPEED_MPS =
  8.5
const VEHICLE_DEFAULT_MOVING_SPEED_MPS =
  3.2
const VEHICLE_MIN_CONTINUOUS_SPEED_MPS =
  0.85
const VEHICLE_ROUTE_LOCK_MAX_METERS =
  160
const VEHICLE_STALE_SLOWDOWN_MS =
  40 * 1000
const VEHICLE_STALE_STOP_MS =
  85 * 1000
const VEHICLE_GRACE_MS =
  90 * 1000
const VEHICLE_TIMESTAMP_COMPENSATION_MIN_AGE_SECONDS =
  2
const VEHICLE_TIMESTAMP_COMPENSATION_MAX_SECONDS =
  45
const VEHICLE_TIMESTAMP_COMPENSATION_MAX_METERS =
  220
const VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS =
  0.7
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


function fillStopArrivals({
  shell,
  payload,
}) {
  shell
    .querySelectorAll(
      '.ttc-live-stop-loading, .ttc-live-stop-arrivals'
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

        addTextLine({
          parent:
            row,
          text:
            arrival.minutes <=
              0
              ? 'DUE'
              : `${arrival.minutes} min`,
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
  directionId,
  bearing,
  routePathsByRoute,
}) {
  const normalizedRouteId =
    String(
      routeId ||
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

  const directionalCandidates =
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
    directionalCandidates.length >
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


function routeEngineTargetSpeed({
  previous,
  realProgress,
  sampleTimestamp,
  ttcSpeed,
  currentStatus,
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

  let targetSpeed =
    observedSpeed !==
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
      ? 0.34
      : 0.18
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
  path,
  sampleProgress,
  sampleTimestamp,
  reportedAgeSeconds,
  ttcSpeed,
  speedState,
  previous,
  now,
}) {
  if (
    !path ||
    !Number.isFinite(
      Number(
        sampleProgress
      )
    ) ||
    speedState?.stopped
  ) {
    return sampleProgress
  }

  const timestampSeconds =
    Number(
      sampleTimestamp ||
      0
    )
  const clientAgeSeconds =
    timestampSeconds >
      0
      ? Math.max(
          0,
          Date.now() /
            1000 -
            timestampSeconds
        )
      : 0
  const serverAgeSeconds =
    Number.isFinite(
      Number(
        reportedAgeSeconds
      )
    )
      ? Math.max(
          0,
          Number(
            reportedAgeSeconds
          )
        )
      : 0
  const ageSeconds =
    clampNumber(
      Math.max(
        clientAgeSeconds,
        serverAgeSeconds
      ),
      0,
      VEHICLE_TIMESTAMP_COMPENSATION_MAX_SECONDS
    )

  if (
    ageSeconds <
      VEHICLE_TIMESTAMP_COMPENSATION_MIN_AGE_SECONDS
  ) {
    return sampleProgress
  }

  const observedSpeed =
    Number.isFinite(
      Number(
        speedState?.observedSpeed
      )
    )
      ? clampNumber(
          Number(
            speedState.observedSpeed
          ),
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
      : null
  const reportedSpeed =
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
  const filteredSpeed =
    Number.isFinite(
      Number(
        speedState?.filteredSpeed
      )
    )
      ? clampNumber(
          Number(
            speedState.filteredSpeed
          ),
          0,
          VEHICLE_VISUAL_MAX_SPEED_MPS
        )
      : 0

  let compensationSpeed =
    null
  let confidenceFactor =
    1

  if (
    observedSpeed !==
      null &&
    observedSpeed >=
      VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS &&
    reportedSpeed !==
      null &&
    reportedSpeed >=
      VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS
  ) {
    compensationSpeed =
      observedSpeed *
        0.72 +
      reportedSpeed *
        0.28
  }
  else if (
    observedSpeed !==
      null &&
    observedSpeed >=
      VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS
  ) {
    compensationSpeed =
      observedSpeed
  }
  else if (
    reportedSpeed !==
      null &&
    reportedSpeed >=
      VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS
  ) {
    compensationSpeed =
      reportedSpeed
    confidenceFactor =
      0.9
  }
  else if (
    observedSpeed ===
      null &&
    reportedSpeed ===
      null
  ) {
    const previousMovingRecently =
      previous &&
      Number(
        speedState?.lastMovingAt ||
        0
      ) >
        0 &&
      Number(
        now ||
        0
      ) -
        Number(
          speedState.lastMovingAt
        ) <
        15 *
          1000

    if (
      previousMovingRecently &&
      filteredSpeed >=
        VEHICLE_TIMESTAMP_COMPENSATION_MIN_SPEED_MPS
    ) {
      compensationSpeed =
        filteredSpeed
      confidenceFactor =
        0.8
    }
  }

  if (
    compensationSpeed ===
      null
  ) {
    return sampleProgress
  }

  const compensationMeters =
    Math.min(
      VEHICLE_TIMESTAMP_COMPENSATION_MAX_METERS,
      compensationSpeed *
        ageSeconds *
        confidenceFactor
    )

  return clampNumber(
    Number(
      sampleProgress
    ) +
      compensationMeters,
    0,
    path.totalMeters
  )
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
  context.lineWidth =
    3

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
      let popupRefreshTimer =
        null
      let networkTimer =
        null
      let controlsRoot =
        null
      let routeSelect =
        null
      let accuracyHint =
        null
      let vehicleRefreshInFlight =
        false
      let vehicleRefreshQueued =
        false
      let vehicleStream =
        null
      let vehicleStreamOpen =
        false
      let vehicleStreamReconnectTimer =
        null
      let lastVehicleStreamMessageAt =
        0
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

      function removePopup() {
        if (
          popupRefreshTimer
        ) {
          window.clearInterval(
            popupRefreshTimer
          )
          popupRefreshTimer =
            null
        }

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

      function vehiclePollDelay() {
        const zoom =
          Number(
            map.getZoom()
          )

        if (
          zoom >=
            VEHICLE_DEEP_FOCUS_ZOOM
        ) {
          return VEHICLE_DEEP_FOCUS_POLL_MS
        }

        if (
          zoom >=
            VEHICLE_FOCUSED_ZOOM
        ) {
          return VEHICLE_FOCUSED_POLL_MS
        }

        return VEHICLE_POLL_MS
      }

      function updateAccuracyHint() {
        if (
          !accuracyHint
        ) {
          return
        }

        const focused =
          Number(
            map.getZoom()
          ) >=
          VEHICLE_FOCUSED_ZOOM

        accuracyHint.textContent =
          focused
            ? 'FOCUSED LIVE STREAM'
            : 'ZOOM IN FOR MORE ACCURATE LIVE POSITIONS'

        accuracyHint.style.opacity =
          focused
            ? '0.72'
            : '0.9'
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
        container.appendChild(
          controlsRoot
        )

        accuracyHint =
          document.createElement(
            'div'
          )
        accuracyHint.dataset.ttcAccuracyHint =
          '1'
        Object.assign(
          accuracyHint.style,
          {
            position:
              'absolute',
            top:
              '112px',
            left:
              '50%',
            transform:
              'translateX(-50%)',
            zIndex:
              '18',
            maxWidth:
              'calc(100% - 30px)',
            background:
              'rgba(255,255,255,0.94)',
            color:
              '#111',
            border:
              '1px solid rgba(0,0,0,0.16)',
            borderRadius:
              '999px',
            padding:
              '5px 9px',
            fontSize:
              '8px',
            fontWeight:
              '900',
            letterSpacing:
              '0.08em',
            whiteSpace:
              'nowrap',
            boxShadow:
              '0 2px 8px rgba(0,0,0,0.10)',
            pointerEvents:
              'none',
          }
        )
        container.appendChild(
          accuracyHint
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

      function addSourcesAndLayers() {
        const streetLabelLayerId =
          getStreetLabelInsertionLayerId(
            map
          )

        if (
          !map.hasImage(
            BUS_MARKER_IMAGE_ID
          )
        ) {
          const busMarker =
            createVehicleMarkerImage(
              '#111111'
            )

          if (
            busMarker
          ) {
            map.addImage(
              BUS_MARKER_IMAGE_ID,
              busMarker,
              {
                pixelRatio:
                  2,
              }
            )
          }
        }

        if (
          !map.hasImage(
            STREETCAR_MARKER_IMAGE_ID
          )
        ) {
          const streetcarMarker =
            createVehicleMarkerImage(
              '#111111',
              {
                streetcar:
                  true,
              }
            )

          if (
            streetcarMarker
          ) {
            map.addImage(
              STREETCAR_MARKER_IMAGE_ID,
              streetcarMarker,
              {
                pixelRatio:
                  2,
              }
            )
          }
        }

        if (
          !map.hasImage(
            STOP_MARKER_IMAGE_ID
          )
        ) {
          const stopMarker =
            createStopMarkerImage()

          if (
            stopMarker
          ) {
            map.addImage(
              STOP_MARKER_IMAGE_ID,
              stopMarker,
              {
                pixelRatio:
                  2,
              }
            )
          }
        }

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
              // Keep the casing layer structurally present, but make it
              // non-contributing so every visible TTC route is one clean,
              // solid-black line with no grey/transparent halo.
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
                0.7,
                13,
                1.3,
                17,
                2.0,
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
          map.addLayer({
            id:
              VEHICLE_ICON_LAYER_ID,
            type:
              'symbol',
            source:
              VEHICLES_SOURCE_ID,
            minzoom:
              VEHICLE_ICON_MIN_ZOOM,
            layout: {

              'icon-image': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'mode',
                  ],
                  'streetcar',
                ],
                STREETCAR_MARKER_IMAGE_ID,
                BUS_MARKER_IMAGE_ID,
              ],
              'icon-size': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'mode',
                  ],
                  'streetcar',
                ],
                [
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
                [
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
                  15,
                  1.08,
                  17,
                  1.20,
                  18,
                  1.26,
                ],
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
                10.5,
                7,
                13,
                8,
                16,
                9,
                18,
                10,
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
              VEHICLE_ICON_MIN_ZOOM,
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
              'text-color': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'mode',
                  ],
                  'streetcar',
                ],
                '#111111',
                '#111111',
              ],
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
            1
          )
          map.setPaintProperty(
            SELECTED_ROUTE_LAYER_ID,
            'line-width',
            [
              'interpolate',
              [
                'linear',
              ],
              [
                'zoom',
              ],
              9,
              0.7,
              13,
              1.3,
              17,
              2.0,
            ]
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
            1
          )
          map.setPaintProperty(
            SELECTED_ROUTE_CASING_LAYER_ID,
            'line-width',
            0
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

              // Keep selected-route emphasis black and fully opaque.
              // Pulse only its width slightly; never fade it or add a grey halo.
              if (
                map.getLayer(
                  SELECTED_ROUTE_LAYER_ID
                )
              ) {
                const pulseMultiplier =
                  1 +
                  wave *
                  0.18

                map.setPaintProperty(
                  SELECTED_ROUTE_LAYER_ID,
                  'line-opacity',
                  1
                )
                map.setPaintProperty(
                  SELECTED_ROUTE_LAYER_ID,
                  'line-width',
                  [
                    'interpolate',
                    [
                      'linear',
                    ],
                    [
                      'zoom',
                    ],
                    9,
                    0.7 *
                      pulseMultiplier,
                    13,
                    1.3 *
                      pulseMultiplier,
                    17,
                    2.0 *
                      pulseMultiplier,
                  ]
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
            220
          )
      }

      function renderAnimatedVehicles() {
        if (
          disposed
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
                  visualSpeed +=
                    Math.min(
                      1.8,
                      progressError *
                      0.055
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

                const nextProgress =
                  Math.max(
                    Number(
                      vehicleState.displayProgress
                    ),
                    Math.min(
                      vehicleState.path.totalMeters,
                      Number(
                        vehicleState.displayProgress
                      ) +
                      visualSpeed *
                      elapsedSeconds
                    )
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

      function applyVehiclePayload(
        payload
      ) {
        if (
          disposed
        ) {
          return
        }

        const now =
          performance.now()
        const nextVehicles =
          Array.isArray(
            payload?.vehicles
          )
            ? payload.vehicles
            : []
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
                previous?.path
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

              if (
                pathMatchesPrevious &&
                Number.isFinite(
                  Number(
                    previousSampleProgress
                  )
                ) &&
                Number.isFinite(
                  Number(
                    sampleProgress
                  )
                ) &&
                sampleProgress <
                  Number(
                    previousSampleProgress
                  ) -
                  5
              ) {
                // GPS jitter must never make a bus reverse visually. A real
                // direction/trip change selects a new shape above instead.
                sampleProgress =
                  Number(
                    previousSampleProgress
                  )
              }

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
                  filteredSpeed:
                    speedState.filteredSpeed,
                  stopped:
                    speedState.stopped,
                  sampleTimestamp:
                    timestamp,
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
                    stopName:
                      vehicle.stopName ||
                      '',
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

        renderAnimatedVehicles()
      }


      function vehicleViewportParams() {
        const bounds =
          map.getBounds()

        return new URLSearchParams({
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
      }


      function stopVehicleStream() {
        if (
          vehicleStreamReconnectTimer
        ) {
          window.clearTimeout(
            vehicleStreamReconnectTimer
          )
          vehicleStreamReconnectTimer =
            null
        }

        if (
          vehicleStream
        ) {
          vehicleStream.close()
          vehicleStream =
            null
        }

        vehicleStreamOpen =
          false
      }


      function startVehicleStream() {
        if (
          disposed ||
          typeof window.EventSource !==
            'function'
        ) {
          return false
        }

        stopVehicleStream()

        const generationStream =
          new window.EventSource(
            `${VEHICLES_STREAM_ENDPOINT}?${vehicleViewportParams().toString()}`
          )

        vehicleStream =
          generationStream

        generationStream.onopen =
          () => {
            if (
              disposed ||
              vehicleStream !==
                generationStream
            ) {
              return
            }

            vehicleStreamOpen =
              true
          }

        generationStream.onmessage =
          (
            event
          ) => {
            if (
              disposed ||
              vehicleStream !==
                generationStream
            ) {
              return
            }

            try {
              const payload =
                JSON.parse(
                  event.data
                )

              lastVehicleStreamMessageAt =
                Date.now()
              vehicleStreamOpen =
                true
              applyVehiclePayload(
                payload
              )
            }
            catch (
              error
            ) {
              console.warn(
                'LIVE TTC STREAM PAYLOAD:',
                error
              )
            }
          }

        generationStream.onerror =
          () => {
            if (
              disposed ||
              vehicleStream !==
                generationStream
            ) {
              return
            }

            generationStream.close()
            vehicleStream =
              null
            vehicleStreamOpen =
              false

            // Immediately use the ordinary JSON endpoint as a fallback, then
            // reconnect the pushed stream. The server endpoint is backed by
            // the same always-hot ingest cache, so fallback is still fast.
            refreshVehicles({
              priority:
                true,
            })

            vehicleStreamReconnectTimer =
              window.setTimeout(
                startVehicleStream,
                1800
              )
          }

        return true
      }


      async function refreshVehicles({
        priority =
          false,
      } = {}) {
        if (
          disposed
        ) {
          return
        }

        if (
          vehicleRefreshInFlight
        ) {
          if (
            priority
          ) {
            vehicleRefreshQueued =
              true
          }
          return
        }

        vehicleRefreshInFlight =
          true

        const controller =
          new AbortController()
        vehicleAbortRef.current =
          controller

        try {
          const params =
            vehicleViewportParams()

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

          const payload =
            await response.json()

          if (
            disposed
          ) {
            return
          }

          applyVehiclePayload(
            payload
          )
        }
        catch (
          error
        ) {
          if (
            error?.name !==
            'AbortError'
          ) {
            console.warn(
              'LIVE TTC VEHICLES:',
              error
            )
          }
        }
        finally {
          vehicleRefreshInFlight =
            false

          if (
            !disposed &&
            vehicleRefreshQueued
          ) {
            vehicleRefreshQueued =
              false
            window.setTimeout(
              () => {
                refreshVehicles()
              },
              0
            )
          }
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

        const refreshStopArrivals =
          async () => {
            try {
              const response =
                await fetch(
                  `${ARRIVALS_ENDPOINT}?stopId=${encodeURIComponent(stopId)}&stopCode=${encodeURIComponent(stopCode)}`,
                  {
                    cache:
                      'no-store',
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
                popupRef.current ===
                  popup
              ) {
                fillStopArrivals({
                  shell,
                  payload,
                })
              }
            }
            catch (
              error
            ) {
              console.warn(
                'LIVE TTC ARRIVALS:',
                error
              )

              if (
                popupRef.current ===
                  popup &&
                !shell.querySelector(
                  '.ttc-live-stop-arrivals'
                )
              ) {
                shell
                  .querySelectorAll(
                    '.ttc-live-stop-loading'
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
          }

        await refreshStopArrivals()

        if (
          popupRef.current ===
            popup
        ) {
          popupRefreshTimer =
            window.setInterval(
              refreshStopArrivals,
              Math.max(
                2500,
                vehiclePollDelay()
              )
            )
        }
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

      function handleViewportSettled() {
        scheduleNetworkRefresh()
        updateAccuracyHint()
        startVehicleStream()
        refreshVehicles({
          priority:
            true,
        })
      }

      map.on(
        'moveend',
        handleViewportSettled
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
      refreshVehicles()
      startVehicleStream()

      window.requestAnimationFrame(
        () => {
          if (
            !disposed
          ) {
            refreshNetwork()
          }
        }
      )

      const scheduleVehiclePoll =
        () => {
          window.clearTimeout(
            vehicleTimer
          )

          const streamFresh =
            vehicleStreamOpen &&
            Date.now() -
              lastVehicleStreamMessageAt <
              12 * 1000

          vehicleTimer =
            window.setTimeout(
              async () => {
                if (
                  !streamFresh
                ) {
                  await refreshVehicles()
                }

                if (
                  !disposed
                ) {
                  scheduleVehiclePoll()
                }
              },
              streamFresh
                ? 10 * 1000
                : vehiclePollDelay()
            )
        }

      scheduleVehiclePoll()

      return () => {
        disposed =
          true

        networkAbortRef.current
          ?.abort?.()
        vehicleAbortRef.current
          ?.abort?.()
        stopVehicleStream()

        window.clearTimeout(
          networkTimer
        )
        window.clearTimeout(
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
        accuracyHint?.remove?.()
        accuracyHint =
          null
        routeSelect =
          null
        routeCatalogById =
          new Map()

        map.off(
          'moveend',
          handleViewportSettled
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
