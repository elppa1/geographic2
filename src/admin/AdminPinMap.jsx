import {
  useEffect,
  useRef,
} from 'react'

import {
  Map,
  Marker,
} from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'


const ROUTE_SOURCE_ID =
  'admin-ttc-route-source'

const ROUTE_LAYER_ID =
  'admin-ttc-route-line'


function hasCoordinate(
  value
) {
  return (
    value !==
      null &&
    value !==
      undefined &&
    value !==
      '' &&
    Number.isFinite(
      Number(
        value
      )
    )
  )
}


function normalizeRouteStops(
  value
) {
  return (
    Array.isArray(
      value
    )
      ? value
      : []
  )
    .map(
      (
        stop,
        index
      ) => {
        const longitude =
          Number(
            stop?.longitude
          )


        const latitude =
          Number(
            stop?.latitude
          )


        if (
          !Number.isFinite(
            longitude
          ) ||
          !Number.isFinite(
            latitude
          )
        ) {
          return null
        }


        return {
          id:
            String(
              stop?.id ||
              `ttc-route-stop-${index + 1}`
            ),

          label:
            String(
              stop?.label ||
              ''
            ),

          longitude,

          latitude,
        }
      }
    )
    .filter(
      Boolean
    )
}


function AdminPinMap({
  city,
  longitude,
  latitude,
  draggable =
    false,
  onChange,
  routeMode =
    false,
  routeStops =
    [],
  onRouteStopsChange,
}) {
  const containerRef =
    useRef(null)


  const mapRef =
    useRef(null)


  const markerRef =
    useRef(null)


  const routeMarkersRef =
    useRef([])


  // ==========================================================
  // CREATE MAP
  // ==========================================================

  useEffect(() => {
    if (
      !containerRef.current ||
      mapRef.current ||
      !city
    ) {
      return
    }


    const hasInitialPin =
      hasCoordinate(
        longitude
      ) &&
      hasCoordinate(
        latitude
      )


    const initialLongitude =
      hasInitialPin
        ? Number(
            longitude
          )
        : Number(
            city.center?.[0] ||
            0
          )


    const initialLatitude =
      hasInitialPin
        ? Number(
            latitude
          )
        : Number(
            city.center?.[1] ||
            0
          )


    const map =
      new Map({
        container:
          containerRef.current,

        style: {
          version:
            8,

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

        center: [
          initialLongitude,
          initialLatitude,
        ],

        zoom:
          hasInitialPin
            ? 16
            : city.zoom ||
              11,
      })


    mapRef.current =
      map


    return () => {
      markerRef.current?.remove()


      markerRef.current =
        null


      routeMarkersRef.current.forEach(
        (
          marker
        ) => {
          marker.remove()
        }
      )


      routeMarkersRef.current =
        []


      map.remove()


      mapRef.current =
        null
    }
  }, [
    city,
  ])


  // ==========================================================
  // CLICK TO PLACE PIN / ADD ROUTE STOP
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current


    if (
      !map
    ) {
      return
    }


    const handleMapClick =
      (
        event
      ) => {
        if (
          routeMode
        ) {
          const currentStops =
            normalizeRouteStops(
              routeStops
            )


          const nextIndex =
            currentStops.length


          onRouteStopsChange?.([
            ...currentStops,
            {
              id:
                `ttc-route-stop-${Date.now()}-${nextIndex + 1}`,

              label:
                '',

              longitude:
                event.lngLat.lng,

              latitude:
                event.lngLat.lat,
            },
          ])


          return
        }


        if (
          !draggable
        ) {
          return
        }


        onChange?.({
          longitude:
            event.lngLat.lng,

          latitude:
            event.lngLat.lat,
        })
      }


    map.on(
      'click',
      handleMapClick
    )


    return () => {
      map.off(
        'click',
        handleMapClick
      )
    }
  }, [
    draggable,
    onChange,
    routeMode,
    routeStops,
    onRouteStopsChange,
  ])


  // ==========================================================
  // SINGLE PIN MARKER
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current


    if (
      !map ||
      routeMode ||
      !hasCoordinate(
        longitude
      ) ||
      !hasCoordinate(
        latitude
      )
    ) {
      markerRef.current?.remove()


      markerRef.current =
        null


      return
    }


    const nextLongitude =
      Number(
        longitude
      )


    const nextLatitude =
      Number(
        latitude
      )


    if (
      !markerRef.current
    ) {
      const element =
        document.createElement(
          'div'
        )


      element.className =
        'admin-pin-marker'


      const marker =
        new Marker({
          element,

          anchor:
            'center',

          draggable,
        })
          .setLngLat([
            nextLongitude,
            nextLatitude,
          ])
          .addTo(
            map
          )


      marker.on(
        'dragend',
        () => {
          const position =
            marker.getLngLat()


          onChange?.({
            longitude:
              position.lng,

            latitude:
              position.lat,
          })
        }
      )


      markerRef.current =
        marker
    } else {
      markerRef.current
        .setLngLat([
          nextLongitude,
          nextLatitude,
        ])


      markerRef.current
        .setDraggable(
          draggable
        )
    }


    map.easeTo({
      center: [
        nextLongitude,
        nextLatitude,
      ],

      zoom:
        Math.max(
          map.getZoom(),
          16
        ),

      duration:
        350,
    })
  }, [
    longitude,
    latitude,
    draggable,
    onChange,
    routeMode,
  ])


  // ==========================================================
  // TTC ROUTE PREVIEW
  // ==========================================================

  useEffect(
    () => {
      const map =
        mapRef.current


      if (
        !map
      ) {
        return
      }


      routeMarkersRef.current.forEach(
        (
          marker
        ) => {
          marker.remove()
        }
      )


      routeMarkersRef.current =
        []


      const removeRouteLine =
        () => {
          if (
            map.getLayer(
              ROUTE_LAYER_ID
            )
          ) {
            map.removeLayer(
              ROUTE_LAYER_ID
            )
          }


          if (
            map.getSource(
              ROUTE_SOURCE_ID
            )
          ) {
            map.removeSource(
              ROUTE_SOURCE_ID
            )
          }
        }


      if (
        !routeMode
      ) {
        removeRouteLine()


        return
      }


      markerRef.current?.remove()


      markerRef.current =
        null


      const stops =
        normalizeRouteStops(
          routeStops
        )


      stops.forEach(
        (
          stop,
          index
        ) => {
          const isEndpoint =
            index ===
              0 ||
            index ===
              stops.length -
                1


          const element =
            document.createElement(
              'div'
            )


          element.textContent =
            String(
              index +
              1
            )


          element.style.width =
            isEndpoint
              ? '24px'
              : '17px'


          element.style.height =
            isEndpoint
              ? '24px'
              : '17px'


          element.style.display =
            'grid'


          element.style.placeItems =
            'center'


          element.style.borderRadius =
            '50%'


          element.style.border =
            '2px solid #111'


          element.style.background =
            isEndpoint
              ? '#111'
              : '#fff'


          element.style.color =
            isEndpoint
              ? '#fff'
              : '#111'


          element.style.fontSize =
            isEndpoint
              ? '9px'
              : '7px'


          element.style.fontWeight =
            '800'


          element.style.lineHeight =
            '1'


          element.style.boxSizing =
            'border-box'


          element.style.cursor =
            'grab'


          const marker =
            new Marker({
              element,

              anchor:
                'center',

              draggable:
                true,
            })
              .setLngLat([
                stop.longitude,
                stop.latitude,
              ])
              .addTo(
                map
              )


          marker.on(
            'dragend',
            () => {
              const position =
                marker.getLngLat()


              const nextStops =
                normalizeRouteStops(
                  routeStops
                )


              if (
                !nextStops[
                  index
                ]
              ) {
                return
              }


              nextStops[
                index
              ] = {
                ...nextStops[
                  index
                ],

                longitude:
                  position.lng,

                latitude:
                  position.lat,
              }


              onRouteStopsChange?.(
                nextStops
              )
            }
          )


          routeMarkersRef.current.push(
            marker
          )
        }
      )


      const drawRouteLine =
        () => {
          removeRouteLine()


          if (
            stops.length <
              2
          ) {
            return
          }


          const data = {
            type:
              'Feature',

            properties:
              {},

            geometry: {
              type:
                'LineString',

              coordinates:
                stops.map(
                  (
                    stop
                  ) => [
                    stop.longitude,
                    stop.latitude,
                  ]
                ),
            },
          }


          map.addSource(
            ROUTE_SOURCE_ID,
            {
              type:
                'geojson',

              data,
            }
          )


          map.addLayer({
            id:
              ROUTE_LAYER_ID,

            type:
              'line',

            source:
              ROUTE_SOURCE_ID,

            layout: {
              'line-cap':
                'round',

              'line-join':
                'round',
            },

            paint: {
              'line-color':
                '#111',

              'line-width':
                4,

              'line-opacity':
                0.82,
            },
          })
        }


      if (
        map.isStyleLoaded()
      ) {
        drawRouteLine()
      }
      else {
        map.once(
          'load',
          drawRouteLine
        )
      }


      if (
        stops.length >
          0
      ) {
        const longitudes =
          stops.map(
            (
              stop
            ) =>
              stop.longitude
          )


        const latitudes =
          stops.map(
            (
              stop
            ) =>
              stop.latitude
          )


        map.fitBounds(
          [
            [
              Math.min(
                ...longitudes
              ),
              Math.min(
                ...latitudes
              ),
            ],
            [
              Math.max(
                ...longitudes
              ),
              Math.max(
                ...latitudes
              ),
            ],
          ],
          {
            padding:
              42,

            maxZoom:
              16,

            duration:
              350,
          }
        )
      }


      return () => {
        map.off(
          'load',
          drawRouteLine
        )


        routeMarkersRef.current.forEach(
          (
            marker
          ) => {
            marker.remove()
          }
        )


        routeMarkersRef.current =
          []


        removeRouteLine()
      }
    },
    [
      routeMode,
      routeStops,
      onRouteStopsChange,
    ]
  )


  return (
    <div
      ref={
        containerRef
      }
      className="admin-pin-map"
    />
  )
}


export default AdminPinMap
