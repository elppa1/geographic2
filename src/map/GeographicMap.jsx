import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  LngLatBounds,
  Map,
  Marker,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  CITIES,
} from '../cities/index.js'
import {
  addHistoricalLayers,
  showHistoricalLayer,
} from './historicalLayers.js'
import {
  addStreetLabels,
  setStreetLabelsVisible,
} from './streetLabels.js'
import MapPins from './MapPins.jsx'
import LiveTtcLayer from './LiveTtcLayer.jsx'
import {
  getDirectRoute,
} from './routeService.js'
setWorkerUrl(
  workerUrl
)
const TORONTO_WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=43.6532&longitude=-79.3832&current=temperature_2m,is_day,precipitation,rain,snowfall,weather_code,cloud_cover&daily=sunrise,sunset&timezone=America%2FToronto&forecast_days=1'
function clamp01(
  value
) {
  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  )
}
function getAtmosphere(
  weather
) {
  const now =
    Date.now()
  const sunrise =
    weather?.daily
      ?.sunrise?.[0]
      ? new Date(
          weather.daily
            .sunrise[0]
        ).getTime()
      : null
  const sunset =
    weather?.daily
      ?.sunset?.[0]
      ? new Date(
          weather.daily
            .sunset[0]
        ).getTime()
      : null
  let night =
    weather?.current
      ?.is_day === 0
      ? 1
      : 0
  if (
    sunrise &&
    sunset
  ) {
    const dawnStart =
      sunrise -
      45 * 60 * 1000
    const dawnEnd =
      sunrise +
      35 * 60 * 1000
    const duskStart =
      sunset -
      60 * 60 * 1000
    const duskEnd =
      sunset +
      50 * 60 * 1000
    if (
      now <
      dawnStart
    ) {
      night = 1
    } else if (
      now <
      dawnEnd
    ) {
      night =
        1 -
        clamp01(
          (
            now -
            dawnStart
          ) /
          (
            dawnEnd -
            dawnStart
          )
        )
    } else if (
      now <
      duskStart
    ) {
      night = 0
    } else if (
      now <
      duskEnd
    ) {
      night =
        clamp01(
          (
            now -
            duskStart
          ) /
          (
            duskEnd -
            duskStart
          )
        )
    } else {
      night = 1
    }
  }
  const cloud =
    clamp01(
      (
        weather?.current
          ?.cloud_cover ||
        0
      ) /
      100
    )
  const rain =
    Number(
      weather?.current
        ?.rain ||
      0
    )
  const precipitation =
    Number(
      weather?.current
        ?.precipitation ||
      0
    )
  const snowfall =
    Number(
      weather?.current
        ?.snowfall ||
      0
    )
  const code =
    Number(
      weather?.current
        ?.weather_code ||
      0
    )
  const fog =
    [
      45,
      48,
    ].includes(
      code
    )
  const darkness =
    clamp01(
      night * 0.56 +
      cloud * 0.12
    )
  return {
    darkness,
    cloud,
    fog,
    rain:
      rain > 0 ||
      (
        precipitation >
          0 &&
        snowfall <=
          0
      ),
    snow:
      snowfall >
      0,
  }
}
function AtmosphereLayer({
  atmosphere,
}) {
  if (
    !atmosphere
  ) {
    return null
  }
  const style = {
    '--atmosphere-darkness':
      atmosphere.darkness,
    '--atmosphere-cloud':
      atmosphere.cloud,
  }
  return (
    <div
      className={[
        'geographic-atmosphere',
        atmosphere.storm
          ? 'geographic-atmosphere-storm'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-hidden="true"
    >
      <div className="geographic-atmosphere-shade" />
      <div className="geographic-atmosphere-cloud-veil" />
      {atmosphere.fog && (
        <div className="geographic-atmosphere-fog">
          <span />
          <span />
          <span />
        </div>
      )}
      {atmosphere.rain && (
        <>
          <div className="geographic-atmosphere-rain geographic-atmosphere-rain-back" />
          <div className="geographic-atmosphere-rain geographic-atmosphere-rain-mid" />
          <div className="geographic-atmosphere-rain geographic-atmosphere-rain-front" />
          <div className="geographic-atmosphere-rain-mist" />
        </>
      )}
      {atmosphere.snow && (
        <>
          <div className="geographic-atmosphere-snow geographic-atmosphere-snow-back">
            <span />
          </div>
          <div className="geographic-atmosphere-snow geographic-atmosphere-snow-mid">
            <span />
          </div>
          <div className="geographic-atmosphere-snow geographic-atmosphere-snow-front">
            <span />
          </div>
          <div className="geographic-atmosphere-snow-gust" />
        </>
      )}
      {atmosphere.storm && (
        <div className="geographic-atmosphere-lightning" />
      )}
    </div>
  )
}
function HalloweenHistoricLayer({
  active,
}) {
  if (
    !active
  ) {
    return null
  }
  return (
    <div
      className="halloween-historic-atmosphere"
      aria-hidden="true"
    >
      <div className="halloween-historic-cold-shade" />
      <div className="halloween-historic-fog halloween-historic-fog-one" />
      <div className="halloween-historic-fog halloween-historic-fog-two" />
      <div className="halloween-historic-fog halloween-historic-fog-three" />
      <div className="halloween-historic-wind halloween-historic-wind-one" />
      <div className="halloween-historic-wind halloween-historic-wind-two" />
      <div className="halloween-historic-blue-lightning halloween-historic-blue-lightning-one" />
      <div className="halloween-historic-blue-lightning halloween-historic-blue-lightning-two" />
    </div>
  )
}
const ROUTE_SOURCE_ID =
  'geographic-route'
const ROUTE_LAYER_ID =
  'geographic-route-line'
function getEnhancedTileUrl({
  cityKey,
  layerType,
  year,
}) {
  return (
    `/api/enhance/` +
    `${cityKey}/` +
    `${layerType}/` +
    `${year}/` +
    '{z}/{x}/{y}.png'
  )
}
function getHistoricLayerFromCity({
  city,
  layerType,
  year,
}) {
  const numericYear =
    Number(
      year
    )
  if (
    !city ||
    !Number.isFinite(
      numericYear
    )
  ) {
    return null
  }
  const collection =
    layerType ===
      'map'
      ? city.maps
      : layerType ===
          'aerial'
        ? city.aerials
        : null
  const item =
    collection?.[
      numericYear
    ]
  if (
    !item?.url
  ) {
    return null
  }
  return {
    year:
      numericYear,
    layerType,
    ...item,
  }
}
function getClosestHistoricLayer({
  city,
  year,
}) {
  const numericYear =
    Number(
      year
    )
  if (
    !city ||
    !Number.isFinite(
      numericYear
    )
  ) {
    return null
  }
  const layers = [
    ...Object.entries(
      city.maps ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([
          layerYear,
          item,
        ]) => ({
          year:
            Number(
              layerYear
            ),
          layerType:
            'map',
          ...item,
        })
      ),
    ...Object.entries(
      city.aerials ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([
          layerYear,
          item,
        ]) => ({
          year:
            Number(
              layerYear
            ),
          layerType:
            'aerial',
          ...item,
        })
      ),
  ]
    .filter(
      (layer) =>
        Number.isFinite(
          layer.year
        )
    )
  return layers.reduce(
    (
      closest,
      layer
    ) => {
      if (
        !closest
      ) {
        return layer
      }
      const difference =
        Math.abs(
          layer.year -
          numericYear
        )
      const closestDifference =
        Math.abs(
          closest.year -
          numericYear
        )
      if (
        difference <
        closestDifference
      ) {
        return layer
      }
      if (
        difference >
        closestDifference
      ) {
        return closest
      }
      const preferredType =
        city.defaultMode ||
        'aerial'
      if (
        layer.layerType ===
          preferredType &&
        closest.layerType !==
          preferredType
      ) {
        return layer
      }
      if (
        layer.year >
        closest.year
      ) {
        return layer
      }
      return closest
    },
    null
  )
}
function getHistoricSeeItThenLayer({
  city,
  pin,
}) {
  if (
    pin?.layerPlacementMode ===
      'manual'
  ) {
    const manualLayer =
      getHistoricLayerFromCity({
        city,
        layerType:
          pin.layerOverrideType,
        year:
          pin.layerOverrideYear,
      })
    if (
      manualLayer
    ) {
      return manualLayer
    }
  }
  const storedAutoLayer =
    Array.isArray(
      pin?.autoLayers
    )
      ? pin.autoLayers[0]
      : null
  if (
    storedAutoLayer
  ) {
    const autoLayer =
      getHistoricLayerFromCity({
        city,
        layerType:
          storedAutoLayer.layerType,
        year:
          storedAutoLayer.year,
      })
    if (
      autoLayer
    ) {
      return autoLayer
    }
  }
  const eventYear =
    String(
      pin?.eventDate ||
      ''
    )
      .match(
        /^(\d{4})-/
      )?.[1] ||
    pin?.year ||
    pin?.startYear
  return getClosestHistoricLayer({
    city,
    year:
      eventYear,
  })
}
const GeographicMap =
  forwardRef(
    function GeographicMap(
      {
        cityKey =
          'toronto',
        selectedLayer,
        homeLayer,
        opacity =
          1,
        enhanced =
          false,
        activePinFilter =
          'historic',
        liveBusesEnabled =
          false,
        onChangePinFilter,
        historicIssueFilter =
          'all',
        historicCategoryFilter =
          'all',
        historicLayerFilter =
          'all',
        onSelectHistoricalLayer,
        newsRangeFilter =
          'curated',
        newSubtypeFilter =
          'all',
        onChangeNewSubtypeFilter,
        newBusinessRangeFilter =
          '30',
      },
      ref
    ) {
      const mapContainerRef =
        useRef(null)
      const mapRef =
        useRef(null)
      const userMarkerRef =
        useRef(null)
      const searchMarkerRef =
        useRef(null)
      const searchPopupRef =
        useRef(null)
      const routeStepMarkerRef =
        useRef(null)
      const userPositionRef =
        useRef(null)

      const displayedUserPositionRef =
        useRef(null)
      const userWatchIdRef =
        useRef(null)
      const followUserRef =
        useRef(false)
      const manualCameraUntilRef =
        useRef(0)
      const compassHandlerRef =
        useRef(null)
      const compassHeadingRef =
        useRef(null)
      const compassLastUpdateRef =
        useRef(0)
      const compassSensorLastSeenRef =
        useRef(0)
      const enhancedSourceRef =
        useRef(null)
      const [
        layersReady,
        setLayersReady,
      ] =
        useState(false)
      const [
        mapReady,
        setMapReady,
      ] =
        useState(false)

      const [
        locationTrackingActive,
        setLocationTrackingActive,
      ] =
        useState(false)
      const [
        selectedPinId,
        setSelectedPinId,
      ] =
        useState(null)
      const [
        route,
        setRoute,
      ] =
        useState(null)
      const [
        routeDestination,
        setRouteDestination,
      ] =
        useState(null)
      const [
        routeLoading,
        setRouteLoading,
      ] =
        useState(false)
      const [
        routeError,
        setRouteError,
      ] =
        useState('')
      const city =
        CITIES[
          cityKey
        ]
      useImperativeHandle(
        ref,
        () => ({
          getMap() {
            return mapRef.current
          },
          getUserPosition() {
            return userPositionRef.current
          },
          clearSelectedPin() {
            setSelectedPinId(
              null
            )
          },
          startLocationTracking() {
            return startLocationTracking()
          },
          stopLocationTracking() {
            stopLocationTracking()
          },
          toggleLocationTracking() {
            return toggleLocationTracking()
          },
          toggleOrientationTracking() {
            return toggleOrientationTracking()
          },
          handleSearchResult(
            result
          ) {
            handleSearchResult(
              result
            )
          },
        }),
        []
      )
      // ========================================================
      // CONTENT FILTER
      // ========================================================
      function changePinFilter(
        nextFilter
      ) {
        onChangePinFilter?.(
          nextFilter
        )
        setSelectedPinId(
          null
        )
      }
      function changeNewSubtypeFilter(
        nextSubtype
      ) {
        onChangeNewSubtypeFilter?.(
          nextSubtype
        )
        setSelectedPinId(
          null
        )
      }
      // ========================================================
      // CREATE MAP
      // ========================================================
      const [
    atmosphere,
    setAtmosphere,
  ] =
    useState(null)
      const [
        atmosphereTest,
        setAtmosphereTest,
      ] =
        useState('live')
      const [
        atmosphereEnabled,
        setAtmosphereEnabled,
      ] =
        useState(false)
  useEffect(() => {
    let cancelled =
      false
    let weatherData =
      null
    async function refreshWeather() {
      try {
        const response =
          await fetch(
            TORONTO_WEATHER_URL,
            {
              cache:
                'no-store',
            }
          )
        if (
          !response.ok
        ) {
          throw new Error(
            `Weather request failed: ${response.status}`
          )
        }
        weatherData =
          await response.json()
        if (
          !cancelled
        ) {
          setAtmosphere(
            getAtmosphere(
              weatherData
            )
          )
        }
      } catch (
        error
      ) {
        console.warn(
          'ATMOSPHERE WEATHER:',
          error
        )
      }
    }
    refreshWeather()
    const weatherTimer =
      window.setInterval(
        refreshWeather,
        15 * 60 * 1000
      )
    const lightTimer =
      window.setInterval(
        () => {
          if (
            weatherData &&
            !cancelled
          ) {
            setAtmosphere(
              getAtmosphere(
                weatherData
              )
            )
          }
        },
        60 * 1000
      )
    return () => {
      cancelled =
        true
      window.clearInterval(
        weatherTimer
      )
      window.clearInterval(
        lightTimer
      )
    }
  }, [])
  useEffect(() => {
    window.setAtmosphereTest =
      (
        mode =
          'live'
      ) => {
        const normalized =
          String(
            mode ||
            'live'
          )
            .trim()
            .toLowerCase()
        const allowed = [
          'live',
          'snow',
          'rain',
          'fog',
          'storm',
          'night',
          'halloween',
        ]
        if (
          !allowed.includes(
            normalized
          )
        ) {
          console.warn(
            'ATMOSPHERE TEST: use live, snow, rain, fog, storm, night, or halloween'
          )
          return
        }
        setAtmosphereTest(
          normalized
        )
        console.log(
          `ATMOSPHERE TEST: ${normalized.toUpperCase()}`
        )
      }
    return () => {
      delete window.setAtmosphereTest
    }
  }, [])
  const displayedAtmosphere =
    atmosphereTest ===
      'halloween'
      ? null
      : atmosphereTest ===
          'live'
        ? atmosphere
      : atmosphereTest ===
          'snow'
        ? {
            darkness:
              0.28,
            cloud:
              0.92,
            fog:
              true,
            rain:
              false,
            snow:
              true,
            storm:
              false,
          }
        : atmosphereTest ===
            'rain'
          ? {
              darkness:
                0.38,
              cloud:
                1,
              fog:
                true,
              rain:
                true,
              snow:
                false,
              storm:
                false,
            }
          : atmosphereTest ===
              'fog'
            ? {
                darkness:
                  0.18,
                cloud:
                  0.88,
                fog:
                  true,
                rain:
                  false,
                snow:
                  false,
                storm:
                  false,
              }
            : atmosphereTest ===
                'storm'
              ? {
                  darkness:
                    0.62,
                  cloud:
                    1,
                  fog:
                    true,
                  rain:
                    true,
                  snow:
                    false,
                  storm:
                    true,
                }
              : {
                  darkness:
                    0.72,
                  cloud:
                    0.35,
                  fog:
                    false,
                  rain:
                    false,
                  snow:
                    false,
                  storm:
                    false,
                }
  useEffect(() => {
        if (
          !mapContainerRef.current ||
          mapRef.current ||
          !city
        ) {
          return
        }
        const map =
          new Map({
            container:
              mapContainerRef.current,
            attributionControl:
              false,

            // Keep already-requested raster tiles around longer and do not
            // cancel lower-zoom tile requests while the user is zooming.
            // This reduces the empty "square" effect during normal movement
            // without changing map interaction, camera, pins or layer order.
            maxTileCacheZoomLevels:
              8,
            cancelPendingTileRequestsWhileZooming:
              false,

            style: {
              version:
                8,
              glyphs:
                'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
              sources: {
                osm: {
                  type:
                    'raster',
                  tiles: [
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  ],
                  tileSize:
                    256,
                  attribution:
                    '© OpenStreetMap contributors',
                },
              },
              layers: [
                {
                  id:
                    'osm',
                  type:
                    'raster',
                  source:
                    'osm',
                  paint: {
                    'raster-fade-duration':
                      0,
                  },
                },
              ],
            },
            center:
              city.center,
            zoom:
              city.zoom,
          })
        mapRef.current =
          map

        // Keep map interaction feeling immediate. These only tune MapLibre's
        // native gesture handlers; they do not animate or recenter the camera.
        map.scrollZoom?.setWheelZoomRate?.(
          1 / 240
        )

        map.scrollZoom?.setZoomRate?.(
          1 / 45
        )

        map.touchZoomRotate?.setZoomRate?.(
          1.5
        )

        map.touchZoomRotate?.setZoomThreshold?.(
          0.035
        )
        map.on(
          'load',
          () => {
            addHistoricalLayers({
              map,
              city,
            })
            addStreetLabels({
              map,
            })
            setLayersReady(
              true
            )
            setMapReady(
              true
            )
          }
        )
        map.on(
          'error',
          (event) => {
            console.error(
              'GEOGRAPHIC MAP ERROR:',
              event.error
            )
          }
        )
        return () => {
          setLayersReady(
            false
          )
          setMapReady(
            false
          )
          stopLocationTracking()
          userMarkerRef.current?.remove()
          searchMarkerRef.current?.remove()
          searchPopupRef.current?.remove()
          routeStepMarkerRef.current?.remove()
          map.remove()
          mapRef.current =
            null
        }
      }, [
        city,
      ])
      // ========================================================
      // HISTORICAL LAYER
      // ========================================================
      useEffect(() => {
        const map =
          mapRef.current


        if (
          !map ||
          !city ||
          !layersReady ||
          !selectedLayer
        ) {
          return undefined
        }


        const cleanupHistoricalTransition =
          showHistoricalLayer({
            map,
            city,
            layerType:
              selectedLayer.layerType,
            year:
              selectedLayer.year,
            opacity,
          })


        setStreetLabelsVisible({
          map,
          visible:
            liveBusesEnabled ||
            selectedLayer.layerType ===
              'aerial',
        })


        return () => {
          cleanupHistoricalTransition?.()
        }
      }, [
        city,
        layersReady,
        selectedLayer,
        opacity,
        liveBusesEnabled,
      ])
      // ========================================================
      // ENHANCE
      // ========================================================
      useEffect(() => {
        const map =
          mapRef.current
        if (
          !map ||
          !city ||
          !layersReady ||
          !selectedLayer
        ) {
          return
        }
        const restorePreviousEnhancedSource =
          () => {
            const previous =
              enhancedSourceRef.current
            if (
              !previous
            ) {
              return
            }
            const previousSource =
              map.getSource(
                previous.sourceId
              )
            if (
              previousSource &&
              typeof previousSource.setTiles ===
                'function'
            ) {
              previousSource.setTiles([
                previous.originalUrl,
              ])
            }
            enhancedSourceRef.current =
              null
          }
        const sourceId =
          `${city.key}-${selectedLayer.layerType}-${selectedLayer.year}`
        // Normal historical browsing should NOT call setTiles().
        // The source already has selectedLayer.url from addHistoricalLayers().
        // Calling setTiles() again invalidates MapLibre's raster tile cache
        // every time a year is selected, forcing previously loaded imagery
        // to download again.
        if (
          !enhanced
        ) {
          restorePreviousEnhancedSource()
          return
        }
        const previous =
          enhancedSourceRef.current
        if (
          previous &&
          previous.sourceId !==
            sourceId
        ) {
          restorePreviousEnhancedSource()
        }
        const source =
          map.getSource(
            sourceId
          )
        if (
          !source ||
          typeof source.setTiles !==
            'function'
        ) {
          return
        }
        source.setTiles([
          getEnhancedTileUrl({
            cityKey:
              city.key,
            layerType:
              selectedLayer.layerType,
            year:
              selectedLayer.year,
          }),
        ])
        enhancedSourceRef.current = {
          sourceId,
          originalUrl:
            selectedLayer.url,
        }
        map.triggerRepaint()
      }, [
        city,
        layersReady,
        selectedLayer,
        enhanced,
      ])
      // ========================================================
      // GPS + WALKING FOLLOW + COMPASS
      // ========================================================

      function normalizeHeading(
        heading
      ) {
        return (
          (heading % 360) +
          360
        ) % 360
      }


      function headingDelta(
        from,
        to
      ) {
        return (
          (
            to -
            from +
            540
          ) % 360
        ) -
        180
      }


      function smoothHeading(
        nextHeading
      ) {
        const normalized =
          normalizeHeading(
            nextHeading
          )

        const previous =
          compassHeadingRef.current


        if (
          previous === null ||
          !Number.isFinite(
            previous
          )
        ) {
          compassHeadingRef.current =
            normalized

          return normalized
        }


        const delta =
          headingDelta(
            previous,
            normalized
          )


        // Ignore tiny hand tremors. This keeps the map from constantly
        // twitching while the phone is being held still.
        if (
          Math.abs(
            delta
          ) <
            6
        ) {
          return previous
        }


        const smoothed =
          normalizeHeading(
            previous +
            delta * 0.10
          )


        compassHeadingRef.current =
          smoothed


        return smoothed
      }


      function pauseAutomaticCamera(
        milliseconds =
          8000
      ) {
        manualCameraUntilRef.current =
          Date.now() +
          milliseconds
      }


      function automaticCameraAllowed() {
        return (
          followUserRef.current &&
          Date.now() >=
            manualCameraUntilRef.current
        )
      }


      function applyMapHeading(
        rawHeading
      ) {
        const map =
          mapRef.current


        if (
          !map ||
          !Number.isFinite(
            rawHeading
          ) ||
          !automaticCameraAllowed()
        ) {
          return
        }


        const now =
          performance.now()


        // Device orientation can fire dozens of times each second.
        // Throttling it makes pinch/zoom and drag gestures much calmer.
        if (
          now -
          compassLastUpdateRef.current <
          350
        ) {
          return
        }


        const heading =
          smoothHeading(
            rawHeading
          )

        const currentBearing =
          normalizeHeading(
            map.getBearing()
          )

        const delta =
          headingDelta(
            currentBearing,
            heading
          )


        // Do not animate for tiny bearing changes.
        if (
          Math.abs(
            delta
          ) <
            8
        ) {
          return
        }


        compassLastUpdateRef.current =
          now


        map.easeTo({
          bearing:
            heading,

          duration:
            360,

          easing:
            (value) =>
              value,

          essential:
            true,
        })
      }


      function getDeviceHeading(
        event
      ) {
        if (
          Number.isFinite(
            event?.webkitCompassHeading
          )
        ) {
          return normalizeHeading(
            event.webkitCompassHeading
          )
        }


        if (
          !event?.absolute ||
          !Number.isFinite(
            event?.alpha
          )
        ) {
          return null
        }


        const screenAngle =
          Number(
            window.screen
              ?.orientation
              ?.angle ??
            window.orientation ??
            0
          ) ||
          0


        return normalizeHeading(
          360 -
          event.alpha +
          screenAngle
        )
      }


      function stopCompassTracking(
        resetBearing =
          false
      ) {
        const handler =
          compassHandlerRef.current


        if (
          handler
        ) {
          window.removeEventListener(
            'deviceorientationabsolute',
            handler,
            true
          )

          window.removeEventListener(
            'deviceorientation',
            handler,
            true
          )
        }


        compassHandlerRef.current =
          null

        compassHeadingRef.current =
          null

        compassLastUpdateRef.current =
          0

        compassSensorLastSeenRef.current =
          0


        if (
          resetBearing
        ) {
          mapRef.current?.easeTo({
            bearing:
              0,

            duration:
              280,

            essential:
              true,
          })
        }
      }


      async function startCompassTracking() {
        if (
          !followUserRef.current ||
          typeof window ===
            'undefined' ||
          !window.DeviceOrientationEvent
        ) {
          return false
        }


        const DeviceOrientation =
          window.DeviceOrientationEvent


        if (
          typeof DeviceOrientation
            .requestPermission ===
            'function'
        ) {
          try {
            const permission =
              await DeviceOrientation
                .requestPermission()


            if (
              permission !==
                'granted'
            ) {
              return false
            }
          } catch (
            error
          ) {
            console.warn(
              'COMPASS PERMISSION ERROR:',
              error
            )

            return false
          }
        }


        stopCompassTracking()

        manualCameraUntilRef.current =
          0


        const handler =
          (event) => {
            const heading =
              getDeviceHeading(
                event
              )


            if (
              heading ===
                null
            ) {
              return
            }


            compassSensorLastSeenRef.current =
              Date.now()


            applyMapHeading(
              heading
            )
          }


        compassHandlerRef.current =
          handler


        window.addEventListener(
          'deviceorientationabsolute',
          handler,
          true
        )

        window.addEventListener(
          'deviceorientation',
          handler,
          true
        )


        return true
      }


      async function toggleOrientationTracking() {
        if (
          compassHandlerRef.current
        ) {
          stopCompassTracking(
            true
          )

          return false
        }


        return Boolean(
          await startCompassTracking()
        )
      }


      function distanceMetres(
        from,
        to
      ) {
        if (
          !from ||
          !to
        ) {
          return Infinity
        }


        const earthRadius =
          6371000

        const toRadians =
          (degrees) =>
            degrees *
            Math.PI /
            180

        const lat1 =
          toRadians(
            from.latitude
          )

        const lat2 =
          toRadians(
            to.latitude
          )

        const deltaLat =
          toRadians(
            to.latitude -
            from.latitude
          )

        const deltaLng =
          toRadians(
            to.longitude -
            from.longitude
          )

        const a =
          Math.sin(
            deltaLat /
            2
          ) ** 2 +
          Math.cos(
            lat1
          ) *
          Math.cos(
            lat2
          ) *
          Math.sin(
            deltaLng /
            2
          ) ** 2


        return (
          earthRadius *
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
        )
      }


      function updateUserMarker(
        location
      ) {
        const map =
          mapRef.current


        if (
          !map ||
          !location
        ) {
          return
        }


        if (
          !userMarkerRef.current
        ) {
          const element =
            document.createElement(
              'div'
            )


          element.className =
            'user-location-dot'


          userMarkerRef.current =
            new Marker({
              element,

              anchor:
                'center',
            })
              .setLngLat([
                location.longitude,
                location.latitude,
              ])
              .addTo(
                map
              )
        } else {
          userMarkerRef.current
            .setLngLat([
              location.longitude,
              location.latitude,
            ])
        }


        displayedUserPositionRef.current =
          location
      }


      function locationNearScreenEdge(
        location
      ) {
        const map =
          mapRef.current


        if (
          !map ||
          !location
        ) {
          return false
        }


        const canvas =
          map.getCanvas()

        const width =
          canvas?.clientWidth ||
          0

        const height =
          canvas?.clientHeight ||
          0


        if (
          width <=
            0 ||
          height <=
            0
        ) {
          return false
        }


        const point =
          map.project([
            location.longitude,
            location.latitude,
          ])


        return (
          point.x <
            width * 0.15 ||
          point.x >
            width * 0.85 ||
          point.y <
            height * 0.18 ||
          point.y >
            height * 0.82
        )
      }


      function gentlyFollowUser(
        location
      ) {
        const map =
          mapRef.current


        if (
          !map ||
          !automaticCameraAllowed() ||
          !locationNearScreenEdge(
            location
          )
        ) {
          return
        }


        // Re-centre only when the dot is actually drifting toward an edge.
        // Critically, do NOT set zoom here. The user's pinch zoom wins.
        map.easeTo({
          center: [
            location.longitude,
            location.latitude,
          ],

          duration:
            380,

          essential:
            true,
        })
      }


      function applyUserPosition(
        position,
        recenter =
          false,
        walkingZoom =
          false
      ) {
        const map =
          mapRef.current


        if (
          !map ||
          !position?.coords
        ) {
          throw new Error(
            'Location unavailable'
          )
        }


        const longitude =
          Number(
            position.coords.longitude
          )

        const latitude =
          Number(
            position.coords.latitude
          )

        const accuracy =
          Number(
            position.coords.accuracy
          )


        if (
          !Number.isFinite(
            longitude
          ) ||
          !Number.isFinite(
            latitude
          )
        ) {
          throw new Error(
            'Location unavailable'
          )
        }


        const location = {
          longitude,
          latitude,
        }


        // Always keep the newest real GPS reading for routing.
        userPositionRef.current =
          location


        const previousDisplayed =
          displayedUserPositionRef.current

        const movement =
          distanceMetres(
            previousDisplayed,
            location
          )

        const veryNoisyReading =
          Boolean(
            previousDisplayed
          ) &&
          Number.isFinite(
            accuracy
          ) &&
          accuracy >
            60

        const tinyJitter =
          Boolean(
            previousDisplayed
          ) &&
          movement <
            5 &&
          (
            !Number.isFinite(
              accuracy
            ) ||
            accuracy <=
              45
          )


        if (
          !veryNoisyReading &&
          !tinyJitter
        ) {
          updateUserMarker(
            location
          )
        }


        // GPS heading is only a fallback. If the phone compass has reported
        // recently, do not let GPS course and compass fight each other.
        if (
          compassHandlerRef.current &&
          Number.isFinite(
            position.coords.heading
          ) &&
          Number.isFinite(
            position.coords.speed
          ) &&
          position.coords.speed >
            1.2 &&
          (
            Date.now() -
            compassSensorLastSeenRef.current
          ) >
            1500
        ) {
          applyMapHeading(
            position.coords.heading
          )
        }


        if (
          recenter
        ) {
          map.stop()


          map.easeTo({
            center: [
              longitude,
              latitude,
            ],

            bearing:
              0,

            // Start at a neighbourhood scale instead of dropping almost
            // onto the user's building. After this first lock, manual zoom wins.
            zoom:
              walkingZoom
                ? 15.6
                : Math.max(
                    map.getZoom(),
                    15.6
                  ),

            duration:
              650,

            essential:
              true,
          })
        }
        else if (
          !veryNoisyReading &&
          !tinyJitter
        ) {
          gentlyFollowUser(
            location
          )
        }


        return location
      }


      const getUserLocation =
        useCallback(
          (
            recenter =
              false,
            walkingZoom =
              false
          ) => {
            return new Promise(
              (
                resolve,
                reject
              ) => {
                const map =
                  mapRef.current


                if (
                  !map ||
                  !navigator.geolocation
                ) {
                  reject(
                    new Error(
                      'Location unavailable'
                    )
                  )

                  return
                }


                navigator.geolocation.getCurrentPosition(
                  (
                    position
                  ) => {
                    try {
                      resolve(
                        applyUserPosition(
                          position,
                          recenter,
                          walkingZoom
                        )
                      )
                    } catch (
                      error
                    ) {
                      reject(
                        error
                      )
                    }
                  },

                  reject,

                  {
                    enableHighAccuracy:
                      true,

                    timeout:
                      12000,

                    maximumAge:
                      3000,
                  }
                )
              }
            )
          },
          []
        )


      function stopLocationTracking() {
        followUserRef.current =
          false


        stopCompassTracking(
          true
        )


        if (
          userWatchIdRef.current !==
            null &&
          navigator.geolocation
        ) {
          navigator.geolocation.clearWatch(
            userWatchIdRef.current
          )
        }


        userWatchIdRef.current =
          null

        displayedUserPositionRef.current =
          null

        userMarkerRef.current?.remove()

        userMarkerRef.current =
          null

        setLocationTrackingActive(
          false
        )
      }


      async function startLocationTracking() {
        if (
          !navigator.geolocation
        ) {
          throw new Error(
            'Location unavailable'
          )
        }


        stopLocationTracking()


        followUserRef.current =
          true

        manualCameraUntilRef.current =
          0


        try {
          const location =
            await getUserLocation(
              true,
              true
            )


          userWatchIdRef.current =
            navigator.geolocation.watchPosition(
            (
              position
            ) => {
              try {
                applyUserPosition(
                  position,
                  false,
                  false
                )
              } catch (
                error
              ) {
                console.error(
                  'GPS WATCH UPDATE ERROR:',
                  error
                )
              }
            },

            (
              error
            ) => {
              console.error(
                'GPS WATCH ERROR:',
                error
              )
            },

            {
              enableHighAccuracy:
                true,

              maximumAge:
                1000,

              timeout:
                20000,
            }
          )


          setLocationTrackingActive(
            true
          )


          return location
        } catch (
          error
        ) {
          stopLocationTracking()
          throw error
        }
      }


      async function toggleLocationTracking() {
        if (
          followUserRef.current
        ) {
          stopLocationTracking()
          return false
        }


        await startLocationTracking()
        return true
      }


      useEffect(
        () => {
          const map =
            mapRef.current


          if (
            !mapReady ||
            !map
          ) {
            return undefined
          }


          const handleManualCamera =
            (event) => {
              if (
                event?.originalEvent
              ) {
                // The map belongs to the user's fingers first. Do not call
                // map.stop() here because doing so can damp a wheel/pinch gesture.
                // Instead, suspend GPS/compass camera updates until GPS is restarted.
                manualCameraUntilRef.current =
                  Number.POSITIVE_INFINITY
              }
            }


          map.on(
            'dragstart',
            handleManualCamera
          )

          map.on(
            'zoomstart',
            handleManualCamera
          )

          map.on(
            'rotatestart',
            handleManualCamera
          )

          map.on(
            'pitchstart',
            handleManualCamera
          )


          return () => {
            map.off(
              'dragstart',
              handleManualCamera
            )

            map.off(
              'zoomstart',
              handleManualCamera
            )

            map.off(
              'rotatestart',
              handleManualCamera
            )

            map.off(
              'pitchstart',
              handleManualCamera
            )
          }
        },
        [
          mapReady,
        ]
      )


      // ========================================================
      // DRAW ROUTE
      // ========================================================
      function drawRoute(
        nextRoute
      ) {
        const map =
          mapRef.current
        if (
          !map ||
          !Array.isArray(
            nextRoute?.coordinates
          ) ||
          nextRoute.coordinates.length ===
            0
        ) {
          return
        }
        const geojson = {
          type:
            'Feature',
          properties:
            {},
          geometry: {
            type:
              'LineString',
            coordinates:
              nextRoute.coordinates,
          },
        }
        const existingSource =
          map.getSource(
            ROUTE_SOURCE_ID
          )
        if (
          existingSource
        ) {
          existingSource.setData(
            geojson
          )
        } else {
          map.addSource(
            ROUTE_SOURCE_ID,
            {
              type:
                'geojson',
              data:
                geojson,
            }
          )
          map.addLayer({
            id:
              ROUTE_LAYER_ID,
            type:
              'line',
            source:
              ROUTE_SOURCE_ID,
            paint: {
              'line-color':
                '#2f80ed',
              'line-width':
                5,
              'line-opacity':
                0.9,
            },
            layout: {
              'line-cap':
                'round',
              'line-join':
                'round',
            },
          })
        }
        const bounds =
          new LngLatBounds()
        nextRoute.coordinates.forEach(
          (coordinate) => {
            bounds.extend(
              coordinate
            )
          }
        )
        map.fitBounds(
          bounds,
          {
            padding:
              70,
            duration:
              900,
            maxZoom:
              17,
          }
        )
      }
      // ========================================================
      // CURRENT MANEUVER
      // ========================================================
      const handleStepChange =
        useCallback(
          (
            step
          ) => {
            const map =
              mapRef.current
            if (
              !map
            ) {
              return
            }
            if (
              !step ||
              !Array.isArray(
                step.coordinate
              )
            ) {
              routeStepMarkerRef.current?.remove()
              routeStepMarkerRef.current =
                null
              return
            }
            const [
              longitude,
              latitude,
            ] =
              step.coordinate
            if (
              !Number.isFinite(
                Number(
                  longitude
                )
              ) ||
              !Number.isFinite(
                Number(
                  latitude
                )
              )
            ) {
              return
            }
            if (
              !routeStepMarkerRef.current
            ) {
              const element =
                document.createElement(
                  'div'
                )
              element.className =
                'route-step-marker'
              routeStepMarkerRef.current =
                new Marker({
                  element,
                  anchor:
                    'center',
                })
                  .setLngLat([
                    longitude,
                    latitude,
                  ])
                  .addTo(
                    map
                  )
            } else {
              routeStepMarkerRef.current
                .setLngLat([
                  longitude,
                  latitude,
                ])
            }
            map.easeTo({
              center: [
                longitude,
                latitude,
              ],
              zoom:
                Math.max(
                  map.getZoom(),
                  17
                ),
              duration:
                550,
            })
          },
          []
        )
      // ========================================================
      // ROUTING
      // ========================================================
      const startRoute =
        useCallback(
          async (
            destination
          ) => {
            try {
              routeStepMarkerRef.current?.remove()
              routeStepMarkerRef.current =
                null
              setRouteLoading(
                true
              )
              setRouteError(
                ''
              )
              setRouteDestination(
                destination
              )
              const start =
                await getUserLocation(
                  false
                )
              const nextRoute =
                await getDirectRoute({
                  start,
                  destination,
                })
              setRoute(
                nextRoute
              )
              drawRoute(
                nextRoute
              )
            } catch (
              error
            ) {
              console.error(
                'ROUTE ERROR:',
                error
              )
              setRouteError(
                'ROUTE UNAVAILABLE'
              )
              setRoute(
                null
              )
            } finally {
              setRouteLoading(
                false
              )
            }
          },
          [
            getUserLocation,
          ]
        )
      const handleDirections =
        useCallback(
          (
            destination
          ) => {
            startRoute(
              destination
            )
          },
          [
            startRoute,
          ]
        )
      function clearRoute() {
        const map =
          mapRef.current
        routeStepMarkerRef.current?.remove()
        routeStepMarkerRef.current =
          null
        if (
          map?.getLayer(
            ROUTE_LAYER_ID
          )
        ) {
          map.removeLayer(
            ROUTE_LAYER_ID
          )
        }
        if (
          map?.getSource(
            ROUTE_SOURCE_ID
          )
        ) {
          map.removeSource(
            ROUTE_SOURCE_ID
          )
        }
        setRoute(
          null
        )
        setRouteDestination(
          null
        )
        setRouteError(
          ''
        )
      }
      // ========================================================
      // HISTORIC · SEE IT THEN
      // ========================================================
      const handleHistoricSeeItThen =
        useCallback(
          (
            pin
          ) => {
            const map =
              mapRef.current


            if (
              !map ||
              !pin
            ) {
              return
            }


            const longitude =
              Number(
                pin.longitude
              )

            const latitude =
              Number(
                pin.latitude
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


            const targetLayer =
              getHistoricSeeItThenLayer({
                city,
                pin,
              })


            const requestedZoom =
              Number(
                pin.seeItThenZoom ||
                16
              )

            const zoom =
              Number.isFinite(
                requestedZoom
              )
                ? Math.min(
                    19,
                    Math.max(
                      12,
                      requestedZoom
                    )
                  )
                : 16


            // One camera owner at a time. Popup snap corrections and an older
            // historic flight must never queue behind a new SEE IT THEN click.
            map.stop?.()


            if (
              targetLayer
            ) {
              onSelectHistoricalLayer?.(
                targetLayer
              )
            }


            // Always issue a fresh close-up camera snap, even when targetLayer
            // is already the currently selected Time Machine layer.
            map.easeTo({
              center: [
                longitude,
                latitude,
              ],
              zoom,
              duration:
                460,
              essential:
                true,
            })


            if (
              pin.id
            ) {
              setSelectedPinId(
                pin.id
              )
            }
          },
          [
            city,
            onSelectHistoricalLayer,
          ]
        )
      // ========================================================
      // HISTORIC · ISSUE HOME
      // ========================================================
      const handleHistoricIssueHome =
        useCallback(
          () => {
            const map =
              mapRef.current
            if (
              !map ||
              !city
            ) {
              return
            }
            if (
              homeLayer
            ) {
              onSelectHistoricalLayer?.(
                homeLayer
              )
            }
            setSelectedPinId(
              null
            )
            map.flyTo({
              center:
                city.center,
              zoom:
                city.zoom,
              duration:
                900,
            })
          },
          [
            city,
            homeLayer,
            onSelectHistoricalLayer,
          ]
        )
      // ========================================================
      // SEARCH RESULT
      // ========================================================
      function handleSearchResult(
        result
      ) {
        const map =
          mapRef.current
        if (
          !map ||
          !result
        ) {
          return
        }
        const longitude =
          Number(
            result.longitude
          )
        const latitude =
          Number(
            result.latitude
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
        if (
          result.type ===
          'geographic'
        ) {
          searchMarkerRef.current?.remove()
          searchPopupRef.current?.remove()
          searchMarkerRef.current =
            null
          searchPopupRef.current =
            null
          if (
            result.pinType ===
              'historic' &&
            activePinFilter !==
              'historic'
          ) {
            onChangePinFilter?.(
              'historic'
            )
          }
          else if (
            result.pinType ===
              'new'
          ) {
            if (
              activePinFilter !==
                'new'
            ) {
              onChangePinFilter?.(
                'new'
              )
            }
            onChangeNewSubtypeFilter?.(
              'all'
            )
          }
          else if (
            result.pinType ===
              'news' &&
            activePinFilter !==
              'news'
          ) {
            onChangePinFilter?.(
              'news'
            )
          }
          setSelectedPinId(
            result.id
          )
          map.flyTo({
            center: [
              longitude,
              latitude,
            ],
            zoom:
              Math.max(
                map.getZoom(),
                16
              ),
            duration:
              900,
          })
          return
        }
        setSelectedPinId(
          null
        )
        searchMarkerRef.current?.remove()
        searchPopupRef.current?.remove()
        searchMarkerRef.current =
          null
        searchPopupRef.current =
          null
        const markerElement =
          document.createElement(
            'div'
          )
        markerElement.className =
          'search-location-marker'
        const popupContent =
          document.createElement(
            'div'
          )
        popupContent.className =
          'geographic-pin-card'
        const title =
          document.createElement(
            'div'
          )
        title.className =
          'geographic-pin-title'
        title.textContent =
          result.name
        popupContent.appendChild(
          title
        )
        if (
          result.subtitle
        ) {
          const subtitle =
            document.createElement(
              'div'
            )
          subtitle.className =
            'geographic-pin-description'
          subtitle.textContent =
            result.subtitle
          popupContent.appendChild(
            subtitle
          )
        }
        const popup =
          new Popup({
            closeButton:
              true,
            offset:
              14,
            maxWidth:
              '280px',
          })
            .setDOMContent(
              popupContent
            )
        searchPopupRef.current =
          popup
        searchMarkerRef.current =
          new Marker({
            element:
              markerElement,
            anchor:
              'center',
          })
            .setLngLat([
              longitude,
              latitude,
            ])
            .setPopup(
              popup
            )
            .addTo(
              map
            )
        popup.addTo(
          map
        )
        map.flyTo({
          center: [
            longitude,
            latitude,
          ],
          zoom:
            Math.max(
              map.getZoom(),
              16
            ),
          duration:
            900,
        })
      }
      return (
        <>
          <div
            ref={
              mapContainerRef
            }
            className="map"
          />
          <AtmosphereLayer
            atmosphere={
              atmosphereEnabled
                ? displayedAtmosphere
                : null
            }
          />
          <HalloweenHistoricLayer
            active={
              atmosphereEnabled &&
              atmosphereTest ===
                'halloween'
            }
          />
          {mapReady && (
            <LiveTtcLayer
              map={
                mapRef.current
              }
              active={
                liveBusesEnabled
              }
            />
          )}
          {mapReady && (
            <MapPins
              map={
                mapRef.current
              }
              cityKey={
                cityKey
              }
              selectedLayer={
                selectedLayer
              }
              selectedPinId={
                selectedPinId
              }
              activePinFilter={
                activePinFilter
              }
              liveTtcAlertsVisible={
                liveBusesEnabled
              }
              historicIssueFilter={
                historicIssueFilter
              }
              historicCategoryFilter={
                historicCategoryFilter
              }
              historicLayerFilter={
                historicLayerFilter
              }
              newsRangeFilter={
                newsRangeFilter
              }
              newSubtypeFilter={
                newSubtypeFilter
              }
              newBusinessRangeFilter={
                newBusinessRangeFilter
              }
              homeLayer={
                homeLayer
              }
              onSeeItThen={
                handleHistoricSeeItThen
              }
              onReturnToHistoricIssueHome={
                handleHistoricIssueHome
              }
            />
          )}
        </>
      )
    }
  )
export default GeographicMap
