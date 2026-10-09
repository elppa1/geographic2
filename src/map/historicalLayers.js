function getHistoricalCollections(
  city
) {
  return [
    {
      layerType:
        'map',

      records:
        city?.maps,
    },

    {
      layerType:
        'aerial',

      records:
        city?.aerials,
    },
  ]
}


function forEachHistoricalLayerId({
  city,
  callback,
}) {
  getHistoricalCollections(
    city
  )
    .forEach(
      ({
        layerType,
        records,
      }) => {
        Object.keys(
          records ||
          {}
        )
          .forEach(
            (
              year
            ) => {
              callback(
                `${city.key}-${layerType}-${year}`
              )
            }
          )
      }
    )
}


export function addHistoricalLayers({
  map,
  city,
}) {
  if (
    !map ||
    !city
  ) {
    return
  }


  getHistoricalCollections(
    city
  )
    .forEach(
      ({
        layerType,
        records,
      }) => {
        Object.entries(
          records ||
          {}
        )
          .forEach(
            ([
              year,
              item,
            ]) => {
              if (
                !item ||
                !item.url
              ) {
                return
              }


              const id =
                `${city.key}-${layerType}-${year}`


              if (
                map.getSource(
                  id
                )
              ) {
                return
              }


              map.addSource(
                id,
                {
                  type:
                    'raster',

                  tiles: [
                    item.url,
                  ],

                  tileSize:
                    256,
                }
              )


              map.addLayer({
                id,

                type:
                  'raster',

                source:
                  id,

                layout: {
                  visibility:
                    'none',
                },

                paint: {
                  'raster-opacity':
                    1,

                  'raster-fade-duration':
                    0,
                },
              })
            }
          )
      }
    )
}


export function hideHistoricalLayers({
  map,
  city,
  exceptLayerId =
    null,
}) {
  if (
    !map ||
    !city
  ) {
    return
  }


  forEachHistoricalLayerId({
    city,
    callback:
      (
        id
      ) => {
        if (
          id ===
            exceptLayerId
        ) {
          return
        }


        if (
          map.getLayer(
            id
          )
        ) {
          map.setLayoutProperty(
            id,
            'visibility',
            'none'
          )
        }
      },
  })
}


export function showHistoricalLayer({
  map,
  city,
  layerType,
  year,
  opacity = 1,
}) {
  if (
    !map ||
    !city ||
    !layerType ||
    !year
  ) {
    return undefined
  }


  const id =
    `${city.key}-${layerType}-${year}`


  if (
    !map.getLayer(
      id
    )
  ) {
    console.warn(
      'HISTORICAL LAYER NOT FOUND:',
      id
    )

    return undefined
  }


  // Smooth Time Machine transition:
  //
  // Keep the currently visible historical year fully on screen while the
  // requested year loads invisibly. Only swap years after MapLibre reports
  // the requested raster source loaded.
  //
  // This prevents the checkerboard / tile-by-tile mosaic of mixed years.
  map.setLayoutProperty(
    id,
    'visibility',
    'visible'
  )


  // Preload the requested year without revealing individual arriving tiles.
  map.setPaintProperty(
    id,
    'raster-opacity',
    0
  )


  let finished =
    false


  const finishTransition =
    () => {
      if (
        finished
      ) {
        return
      }


      finished =
        true


      map.off(
        'sourcedata',
        handleSourceData
      )


      // Reveal the fully loaded requested year in one clean swap.
      map.setPaintProperty(
        id,
        'raster-opacity',
        opacity
      )


      hideHistoricalLayers({
        map,
        city,
        exceptLayerId:
          id,
      })


      map.triggerRepaint?.()
    }


  const handleSourceData =
    (
      event
    ) => {
      if (
        finished ||
        event?.sourceId !==
          id
      ) {
        return
      }


      if (
        event?.isSourceLoaded ||
        map.isSourceLoaded?.(
          id
        )
      ) {
        finishTransition()
      }
    }


  if (
    map.isSourceLoaded?.(
      id
    )
  ) {
    finishTransition()

    return undefined
  }


  map.on(
    'sourcedata',
    handleSourceData
  )


  // If the user chooses another year before this one finishes loading,
  // stop this transition and hide only the abandoned target layer.
  return () => {
    if (
      finished
    ) {
      return
    }


    finished =
      true


    map.off(
      'sourcedata',
      handleSourceData
    )


    if (
      map.getLayer(
        id
      )
    ) {
      map.setLayoutProperty(
        id,
        'visibility',
        'none'
      )
    }
  }
}
