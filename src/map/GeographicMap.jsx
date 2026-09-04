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

import MapControls from './MapControls.jsx'
import MapPins from './MapPins.jsx'
import DirectionsPanel from './DirectionsPanel.jsx'

import {
  getDirectRoute,
} from './routeService.js'


setWorkerUrl(
  workerUrl
)


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

        opacity =
          1,

        enhanced =
          false,

        activePinFilter =
          'historic',

        onChangePinFilter,

        historicIssueFilter =
          'all',

        issueAtmosphere =
          'none',

        weatherAtmosphere =
          'clear',

        weatherIsNight =
          false,

        atmosphereEnabled =
          true,

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
          return
        }


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
            selectedLayer.layerType ===
            'aerial',
        })
      }, [
        city,
        layersReady,
        selectedLayer,
        opacity,
      ])


      // ========================================================
      // ATMOSPHERE
      // ========================================================

      useEffect(() => {
        const map =
          mapRef.current


        if (
          !map ||
          !mapReady
        ) {
          return
        }


        const canvas =
          map.getCanvas()


        if (
          !canvas
        ) {
          return
        }


        canvas.style.transition =
          'filter 800ms ease'


        if (
          !atmosphereEnabled
        ) {
          canvas.style.filter =
            ''


          return
        }


        let brightness =
          1

        let saturation =
          1

        let contrast =
          1


        if (
          issueAtmosphere ===
            'halloween'
        ) {
          brightness *=
            0.66

          saturation *=
            0.62

          contrast *=
            1.10
        }


        if (
          issueAtmosphere ===
            'night'
        ) {
          brightness *=
            0.74

          saturation *=
            0.78
        }


        if (
          issueAtmosphere ===
            'winter'
        ) {
          saturation *=
            0.82

          contrast *=
            1.03
        }


        if (
          issueAtmosphere ===
            'rain'
        ) {
          brightness *=
            0.88

          saturation *=
            0.90
        }


        if (
          issueAtmosphere ===
            'archival'
        ) {
          saturation *=
            0.68

          contrast *=
            1.05
        }


        if (
          weatherAtmosphere ===
            'cloudy'
        ) {
          brightness *=
            0.89

          saturation *=
            0.92

          contrast *=
            1.02
        }


        if (
          weatherAtmosphere ===
            'fog'
        ) {
          brightness *=
            0.93

          saturation *=
            0.80

          contrast *=
            0.94
        }


        if (
          weatherAtmosphere ===
            'rain'
        ) {
          brightness *=
            0.88

          saturation *=
            0.90
        }


        if (
          weatherAtmosphere ===
            'snow'
        ) {
          brightness *=
            0.98

          saturation *=
            0.78

          contrast *=
            1.03
        }


        if (
          weatherAtmosphere ===
            'storm'
        ) {
          brightness *=
            0.78

          saturation *=
            0.82

          contrast *=
            1.06
        }


        if (
          weatherIsNight
        ) {
          brightness *=
            0.82

          saturation *=
            0.88
        }


        canvas.style.filter =
          (
            `brightness(${brightness.toFixed(2)}) ` +
            `saturate(${saturation.toFixed(2)}) ` +
            `contrast(${contrast.toFixed(2)})`
          )
      }, [
        mapReady,
        atmosphereEnabled,
        issueAtmosphere,
        weatherAtmosphere,
        weatherIsNight,
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
      // GPS
      // ========================================================

      const getUserLocation =
        useCallback(
          (
            recenter =
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
                    const longitude =
                      position.coords.longitude

                    const latitude =
                      position.coords.latitude


                    const location = {
                      longitude,
                      latitude,
                    }


                    userPositionRef.current =
                      location


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
                            longitude,
                            latitude,
                          ])
                          .addTo(
                            map
                          )
                    } else {
                      userMarkerRef.current
                        .setLngLat([
                          longitude,
                          latitude,
                        ])
                    }


                    if (
                      recenter
                    ) {
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


                    resolve(
                      location
                    )
                  },

                  reject,

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
            )
          },
          []
        )


      function locateUser() {
        return getUserLocation(
          true
        )
      }


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


            setSelectedPinId(
              pin.id
            )


            const targetLayer =
              getHistoricSeeItThenLayer({
                city,
                pin,
              })


            if (
              targetLayer
            ) {
              onSelectHistoricalLayer?.(
                targetLayer
              )
            }


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


            map.flyTo({
              center: [
                longitude,
                latitude,
              ],

              zoom,

              duration:
                900,
            })
          },
          [
            city,
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


        const actions =
          document.createElement(
            'div'
          )


        actions.className =
          'geographic-route-actions'


        const directionsButton =
          document.createElement(
            'button'
          )


        directionsButton.type =
          'button'


        directionsButton.className =
          'geographic-route-action'


        directionsButton.textContent =
          'DIRECTIONS'


        directionsButton.addEventListener(
          'click',
          () => {
            handleDirections({
              ...result,

              longitude,

              latitude,
            })
          }
        )


        actions.appendChild(
          directionsButton
        )


        popupContent.appendChild(
          actions
        )


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


      const mapClassName =
        [
          'map',

          atmosphereEnabled &&
          issueAtmosphere &&
          issueAtmosphere !==
            'none'
            ? `issue-atmosphere-${issueAtmosphere}`
            : '',

          atmosphereEnabled &&
          weatherAtmosphere &&
          weatherAtmosphere !==
            'clear'
            ? `weather-atmosphere-${weatherAtmosphere}`
            : '',

          atmosphereEnabled &&
          weatherIsNight
            ? 'weather-atmosphere-night'
            : '',
        ]
          .filter(
            Boolean
          )
          .join(
            ' '
          )


      return (
        <>
          <div
            ref={
              mapContainerRef
            }
            className={
              mapClassName
            }
          />


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

              historicIssueFilter={
                historicIssueFilter
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

              onDirections={
                handleDirections
              }

              onSeeItThen={
                handleHistoricSeeItThen
              }
            />
          )}


          <MapControls
            onLocate={
              locateUser
            }

            onSearchResult={
              handleSearchResult
            }

            activePinFilter={
              activePinFilter
            }

            onChangePinFilter={
              changePinFilter
            }

            newSubtypeFilter={
              newSubtypeFilter
            }

            onChangeNewSubtypeFilter={
              changeNewSubtypeFilter
            }
          />


          <DirectionsPanel
            route={
              route
            }

            destination={
              routeDestination
            }

            loading={
              routeLoading
            }

            error={
              routeError
            }

            onClear={
              clearRoute
            }

            onStepChange={
              handleStepChange
            }
          />
        </>
      )
    }
  )


export default GeographicMap