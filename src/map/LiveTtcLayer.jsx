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
  13.5
const GPS_PROMPT_SESSION_KEY =
  'toronto-geographic-live-ttc-gps-prompted'

const NETWORK_ENDPOINT =
  '/api/geographic/toronto/ttc/live/network'
const VEHICLES_ENDPOINT =
  '/api/geographic/toronto/ttc/live/vehicles'
const ARRIVALS_ENDPOINT =
  '/api/geographic/toronto/ttc/live/arrivals'

const VEHICLE_POLL_MS =
  7000
const VEHICLE_INTERPOLATION_MS =
  10000
const VEHICLE_GRACE_MS =
  90 * 1000
const ANIMATION_FRAME_MS =
  90

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


function currentAnimatedCoordinate(
  animation,
  now
) {
  if (
    !animation
  ) {
    return null
  }

  const duration =
    Math.max(
      1,
      animation.duration ||
      1
    )

  // Do not clamp progress at 1. TTC vehicle positions arrive in discrete
  // updates. For a moving vehicle, continuing along the last measured
  // movement vector prevents the marker from freezing between updates.
  // A genuinely stationary vehicle still remains stationary because
  // animation.from and animation.to are the same coordinate.
  const progress =
    Math.max(
      0,
      (
        now -
        animation.startedAt
      ) /
      duration
    )

  return [
    animation.from[0] +
      (
        animation.to[0] -
        animation.from[0]
      ) *
        progress,
    animation.from[1] +
      (
        animation.to[1] -
        animation.from[1]
      ) *
        progress,
  ]
}


function projectCoordinateFromVehicleMotion(
  longitude,
  latitude,
  bearing,
  speedMetersPerSecond,
  durationMs
) {
  const normalizedBearing =
    Number(
      bearing
    )
  const normalizedSpeed =
    Number(
      speedMetersPerSecond
    )

  if (
    !Number.isFinite(
      longitude
    ) ||
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      normalizedBearing
    ) ||
    !Number.isFinite(
      normalizedSpeed
    ) ||
    normalizedSpeed <=
      0.25
  ) {
    return null
  }

  // GTFS-RT speed is metres/second and bearing is degrees clockwise
  // from true north. Use that first sample immediately so a newly
  // loaded vehicle does not have to wait for a second GPS point before
  // it begins moving. Cap implausible spikes defensively.
  const seconds =
    Math.max(
      0,
      Number(
        durationMs ||
        0
      ) /
      1000
    )
  const distanceMeters =
    Math.min(
      normalizedSpeed,
      35
    ) *
    seconds
  const radians =
    normalizedBearing *
    Math.PI /
    180
  const northMeters =
    Math.cos(
      radians
    ) *
    distanceMeters
  const eastMeters =
    Math.sin(
      radians
    ) *
    distanceMeters
  const latitudeRadians =
    latitude *
    Math.PI /
    180
  const longitudeScale =
    Math.max(
      0.2,
      Math.cos(
        latitudeRadians
      )
    )

  return [
    longitude +
      eastMeters /
      (
        111320 *
        longitudeScale
      ),
    latitude +
      northMeters /
      111320,
  ]
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
      let controlsRoot =
        null
      let routeSelect =
        null
      let routeCatalogById =
        new Map()
      let gpsPrompt =
        null

      function removePopup() {
        popupRef.current
          ?.remove?.()
        popupRef.current =
          null
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
            'LIVE TTC',
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
              '#C8102E',
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
                2.2,
                13,
                4.3,
                17,
                7,
              ],
              'line-opacity':
                0.72,
            },
          })
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
              'line-color': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'routeType',
                  ],
                  0,
                ],
                '#C8102E',
                '#111111',
              ],
              'line-width': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                9,
                1,
                13,
                2.2,
                17,
                4,
              ],
              'line-opacity':
                0.34,
            },
          })
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
                5,
                13,
                7,
                17,
                10,
              ],
              'line-opacity':
                0.96,
            },
          })
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
              'line-color': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'routeType',
                  ],
                  0,
                ],
                '#C8102E',
                '#111111',
              ],
              'line-width': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                9,
                2.4,
                13,
                4.3,
                17,
                7,
              ],
              'line-opacity':
                0.98,
            },
          })
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
                0.42,
                15,
                0.52,
                18,
                0.62,
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
                17,
                1.08,
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
                13.5,
                7,
                16,
                8,
                18,
                9,
              ],
              'text-allow-overlap':
                true,
              'text-ignore-placement':
                true,
            },
            paint: {
              'text-color':
                '#ffffff',
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
                7,
                11,
                8,
                17,
                10,
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
                '#111111',
              'text-halo-color':
                '#ffffff',
              'text-halo-width':
                1,
            },
          })
        }
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
            normalized
              ? 0.10
              : 0.34
          )
        }

        ;[
          VEHICLE_CIRCLE_LAYER_ID,
          VEHICLE_ICON_LAYER_ID,
          VEHICLE_ROUTE_LABEL_LAYER_ID,
        ]
          .forEach(
            (
              layerId
            ) => {
              if (
                !map.getLayer(
                  layerId
                )
              ) {
                return
              }

              map.setFilter(
                layerId,
                normalized
                  ? routeFilter
                  : null
              )
            }
          )

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

          updateRouteSelector(
            payload?.routeCatalog
          )

          if (
            disposed
          ) {
            return
          }

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
              refreshVehicles()
            },
            180
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
              animation,
              vehicleId
            ) => {
              const coordinate =
                currentAnimatedCoordinate(
                  animation,
                  now
                )

              if (
                !coordinate
              ) {
                return
              }

              const properties = {
                ...animation.properties,
              }

              if (
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
          disposed
        ) {
          return
        }

        vehicleAbortRef.current
          ?.abort?.()

        const controller =
          new AbortController()
        vehicleAbortRef.current =
          controller

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

          const now =
            performance.now()

          const nextAnimations =
            new Map()

          ;(
            Array.isArray(
              payload?.vehicles
            )
              ? payload.vehicles
              : []
          )
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

                const previous =
                  vehicleAnimationsRef.current
                    .get(
                      vehicle.id
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

                // If TTC returned the same realtime sample again, keep the
                // current motion vector instead of resetting the vehicle back
                // toward the same GPS coordinate. This prevents startup jitter
                // and lets continuous motion carry through cached feed frames.
                if (
                  previous &&
                  timestamp >
                    0 &&
                  Number(
                    previous?.properties?.timestamp ||
                    0
                  ) ===
                    timestamp
                ) {
                  nextAnimations.set(
                    vehicle.id,
                    {
                      ...previous,
                      lastSeenAt:
                        now,
                    }
                  )
                  return
                }

                const displayed =
                  currentAnimatedCoordinate(
                    previous,
                    now
                  )

                const from =
                  displayed || [
                    longitude,
                    latitude,
                  ]

                const firstSampleProjection =
                  !previous
                    ? projectCoordinateFromVehicleMotion(
                        longitude,
                        latitude,
                        bearing,
                        speed,
                        VEHICLE_INTERPOLATION_MS
                      )
                    : null

                const to =
                  firstSampleProjection || [
                    longitude,
                    latitude,
                  ]

                const unchanged =
                  Math.abs(
                    from[0] -
                    to[0]
                  ) <
                    0.0000005 &&
                  Math.abs(
                    from[1] -
                    to[1]
                  ) <
                    0.0000005

                nextAnimations.set(
                  vehicle.id,
                  {
                    from,
                    to,
                    startedAt:
                      now,
                    lastSeenAt:
                      now,
                    duration:
                      unchanged
                        ? 1
                        : VEHICLE_INTERPOLATION_MS,
                    properties: {
                      id:
                        vehicle.id,
                      vehicleId:
                        vehicle.id,
                      label:
                        vehicle.label ||
                        vehicle.id,
                      routeId:
                        vehicle.routeId ||
                        '',
                      routeShortName:
                        vehicle.routeShortName ||
                        vehicle.routeId ||
                        '',
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
                      stopId:
                        vehicle.stopId ||
                        '',
                      stopName:
                        vehicle.stopName ||
                        '',
                      timestamp,
                      bearing,
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
                    previous?.startedAt ??
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
      }

      function handleVehicleClick(
        event
      ) {
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
            snapPopupToScreen(
              event.lngLat
            )
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
              popup
          ) {
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

      async function handleStationClick(
        event
      ) {
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
        'moveend',
        scheduleNetworkRefresh
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

      refreshNetwork()
      refreshVehicles()
      startAnimationLoop()

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

        removePopup()
        gpsPrompt?.remove?.()
        gpsPrompt =
          null
        controlsRoot?.remove?.()
        controlsRoot =
          null
        routeSelect =
          null
        routeCatalogById =
          new Map()

        map.off(
          'moveend',
          scheduleNetworkRefresh
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

        vehicleAnimationsRef.current =
          new Map()
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
