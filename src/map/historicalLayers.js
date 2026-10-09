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
    return
  }


  hideHistoricalLayers({
    map,
    city,
  })


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

    return
  }


  map.setLayoutProperty(
    id,
    'visibility',
    'visible'
  )


  map.setPaintProperty(
    id,
    'raster-opacity',
    opacity
  )
}
