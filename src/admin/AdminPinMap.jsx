import {
  useEffect,
  useRef,
} from 'react'

import {
  Map,
  Marker,
} from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'


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


      map.remove()


      mapRef.current =
        null
    }
  }, [
    city,
  ])


  // ==========================================================
  // CLICK TO PLACE CUSTOM PIN
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
  ])


  // ==========================================================
  // MARKER
  // ==========================================================

  useEffect(() => {
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
