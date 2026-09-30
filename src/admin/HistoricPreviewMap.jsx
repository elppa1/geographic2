import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Map,
  Marker,
} from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'

import {
  addHistoricalLayers,
  showHistoricalLayer,
} from '../map/historicalLayers.js'


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


function HistoricPreviewMap({
  city,
  layer,
  longitude,
  latitude,
  onChange,
}) {
  const containerRef =
    useRef(null)

  const mapRef =
    useRef(null)

  const markerRef =
    useRef(null)

  const [
    layersReady,
    setLayersReady,
  ] =
    useState(
      false
    )


  // ==========================================================
  // CREATE HISTORIC-ONLY PREVIEW MAP
  // ==========================================================

  useEffect(
    () => {
      if (
        !containerRef.current ||
        mapRef.current ||
        !city
      ) {
        return undefined
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
              ? 17
              : city.zoom ||
                11,
        })


      mapRef.current =
        map


      const handleLoad =
        () => {
          addHistoricalLayers({
            map,
            city,
          })

          setLayersReady(
            true
          )
        }


      map.on(
        'load',
        handleLoad
      )


      return () => {
        map.off(
          'load',
          handleLoad
        )

        markerRef.current?.remove()

        markerRef.current =
          null

        setLayersReady(
          false
        )

        map.remove()

        mapRef.current =
          null
      }
    },
    [
      city,
    ]
  )


  // ==========================================================
  // SHOW THE SAME HISTORICAL LAYER AS THE PUBLIC MAP
  // ==========================================================

  useEffect(
    () => {
      const map =
        mapRef.current


      if (
        !map ||
        !city ||
        !layersReady ||
        !layer
      ) {
        return
      }


      showHistoricalLayer({
        map,
        city,

        layerType:
          layer.layerType,

        year:
          layer.year,

        opacity:
          1,
      })
    },
    [
      city,
      layer,
      layersReady,
    ]
  )


  // ==========================================================
  // CLICK TO FINE-TUNE PIN
  // ==========================================================

  useEffect(
    () => {
      const map =
        mapRef.current


      if (
        !map
      ) {
        return undefined
      }


      const handleMapClick =
        (event) => {
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
    },
    [
      onChange,
    ]
  )


  // ==========================================================
  // DRAGGABLE PIN
  // ==========================================================

  useEffect(
    () => {
      const map =
        mapRef.current


      if (
        !map ||
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

            draggable:
              true,
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
      }


      map.easeTo({
        center: [
          nextLongitude,
          nextLatitude,
        ],

        zoom:
          Math.max(
            map.getZoom(),
            17
          ),

        duration:
          250,
      })
    },
    [
      longitude,
      latitude,
      onChange,
    ]
  )


  return (
    <div
      ref={
        containerRef
      }
      className="historic-admin-preview-map"
    />
  )
}


export default HistoricPreviewMap
