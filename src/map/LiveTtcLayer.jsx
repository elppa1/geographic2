import {
  useEffect,
  useRef,
} from 'react'

import {
  Popup,
} from 'maplibre-gl'


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
const STATIONS_LAYER_ID =
  'ttc-live-stations'
const STATION_LABELS_LAYER_ID =
  'ttc-live-station-labels'
const VEHICLE_CIRCLE_LAYER_ID =
  'ttc-live-vehicle-circles'
const VEHICLE_ROUTE_LABEL_LAYER_ID =
  'ttc-live-vehicle-route-labels'
const VEHICLE_DIRECTION_LAYER_ID =
  'ttc-live-vehicle-direction'

const NETWORK_ENDPOINT =
  '/api/geographic/toronto/ttc/live/network'
const VEHICLES_ENDPOINT =
  '/api/geographic/toronto/ttc/live/vehicles'
const ARRIVALS_ENDPOINT =
  '/api/geographic/toronto/ttc/live/arrivals'

const VEHICLE_POLL_MS =
  7000
const ANIMATION_FRAME_MS =
  180

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
      'TTC STOP · LIVE',
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

  const progress =
    Math.max(
      0,
      Math.min(
        1,
        (
          now -
          animation.startedAt
        ) /
        duration
      )
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

      function removePopup() {
        popupRef.current
          ?.remove?.()
        popupRef.current =
          null
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
              'circle',
            source:
              STOPS_SOURCE_ID,
            minzoom:
              13,
            paint: {
              'circle-radius': [
                'interpolate',
                [
                  'linear',
                ],
                [
                  'zoom',
                ],
                13,
                2.2,
                17,
                4,
              ],
              'circle-color':
                '#ffffff',
              'circle-stroke-color':
                '#111111',
              'circle-stroke-width':
                1.25,
              'circle-opacity':
                0.92,
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
                7,
                14,
                10,
                17,
                12,
              ],
              'circle-color': [
                'case',
                [
                  '==',
                  [
                    'get',
                    'mode',
                  ],
                  'streetcar',
                ],
                '#C8102E',
                '#111111',
              ],
              'circle-stroke-color':
                '#ffffff',
              'circle-stroke-width':
                2,
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
              10,
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
                10,
                8,
                15,
                10,
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
              13,
            filter: [
              'has',
              'bearing',
            ],
            layout: {
              'text-field':
                '▲',
              'text-size':
                8,
              'text-offset': [
                0,
                -2.15,
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

        const filter = [
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
            filter
          )
        }

        if (
          map.getLayer(
            SELECTED_ROUTE_LAYER_ID
          )
        ) {
          map.setFilter(
            SELECTED_ROUTE_LAYER_ID,
            filter
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
              ? 0.12
              : 0.34
          )
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

                const to = [
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
                    duration:
                      unchanged
                        ? 1
                        : VEHICLE_POLL_MS,
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
                      timestamp:
                        Number(
                          vehicle.timestamp ||
                          0
                        ),
                      bearing:
                        Number.isFinite(
                          Number(
                            vehicle.bearing
                          )
                        )
                          ? Number(
                              vehicle.bearing
                            )
                          : null,
                      speed:
                        Number.isFinite(
                          Number(
                            vehicle.speed
                          )
                        )
                          ? Number(
                              vehicle.speed
                            )
                          : null,
                      occupancyStatus:
                        vehicle.occupancyStatus ||
                        '',
                    },
                  }
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

        popupRef.current =
          new Popup({
            closeButton:
              true,
            closeOnClick:
              false,
            offset:
              16,
            maxWidth:
              '300px',
          })
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

        if (
          !stopId
        ) {
          return
        }

        removePopup()

        const shell =
          createStopPopupLoading(
            properties
          )

        const popup =
          new Popup({
            closeButton:
              true,
            closeOnClick:
              false,
            offset:
              13,
            maxWidth:
              '310px',
          })
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
              `${ARRIVALS_ENDPOINT}?stopId=${encodeURIComponent(stopId)}`,
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

      function handleStationClick(
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

        popupRef.current =
          new Popup({
            closeButton:
              true,
            closeOnClick:
              false,
            offset:
              14,
            maxWidth:
              '290px',
          })
            .setLngLat(
              event.lngLat
            )
            .setDOMContent(
              createStationPopup(
                feature.properties ||
                {}
              )
            )
            .addTo(
              map
            )
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
        STOPS_LAYER_ID,
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
        STOPS_LAYER_ID,
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
          STOPS_LAYER_ID,
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
          STOPS_LAYER_ID,
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
          VEHICLE_CIRCLE_LAYER_ID,
          STATION_LABELS_LAYER_ID,
          STATIONS_LAYER_ID,
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
