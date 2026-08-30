import {
  useEffect,
  useRef,
} from 'react'

import {
  Map,
  Marker,
} from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'


function AdminPinMap({
  city,
  longitude,
  latitude,
  draggable =
    false,
  onChange,
}) {
  const containerRef =
    useRef(null)


  const mapRef =
    useRef(null)


  const markerRef =
    useRef(null)


  const draggableRef =
    useRef(
      draggable
    )


  const onChangeRef =
    useRef(
      onChange
    )


  useEffect(() => {
    draggableRef.current =
      draggable
  }, [
    draggable,
  ])


  useEffect(() => {
    onChangeRef.current =
      onChange
  }, [
    onChange,
  ])


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


    const hasInitialLongitude =
      longitude !==
        null &&
      longitude !==
        undefined &&
      longitude !==
        '' &&
      Number.isFinite(
        Number(
          longitude
        )
      )


    const hasInitialLatitude =
      latitude !==
        null &&
      latitude !==
        undefined &&
      latitude !==
        '' &&
      Number.isFinite(
        Number(
          latitude
        )
      )


    const hasInitialPosition =
      hasInitialLongitude &&
      hasInitialLatitude


    const initialLongitude =
      hasInitialPosition
        ? Number(
            longitude
          )
        : Number(
            city.center?.[0] ||
            0
          )


    const initialLatitude =
      hasInitialPosition
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
          hasInitialPosition
            ? 16
            : city.zoom ||
              11,
      })


    const handleMapClick =
      (
        event
      ) => {
        if (
          !draggableRef.current
        ) {
          return
        }


        onChangeRef.current?.({
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


    mapRef.current =
      map


    return () => {
      markerRef.current?.remove()


      markerRef.current =
        null


      map.off(
        'click',
        handleMapClick
      )


      map.remove()


      mapRef.current =
        null
    }
  }, [
    city,
  ])


  // ==========================================================
  // CUSTOM MODE CURSOR
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current


    if (
      !map
    ) {
      return
    }


    map.getCanvas().style.cursor =
      draggable
        ? 'crosshair'
        : ''
  }, [
    draggable,
  ])


  // ==========================================================
  // MARKER
  // ==========================================================

  useEffect(() => {
    const map =
      mapRef.current


    const hasLongitude =
      longitude !==
        null &&
      longitude !==
        undefined &&
      longitude !==
        '' &&
      Number.isFinite(
        Number(
          longitude
        )
      )


    const hasLatitude =
      latitude !==
        null &&
      latitude !==
        undefined &&
      latitude !==
        '' &&
      Number.isFinite(
        Number(
          latitude
        )
      )


    if (
      !map ||
      !hasLongitude ||
      !hasLatitude
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


          onChangeRef.current?.({
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
  ])


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
