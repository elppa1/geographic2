import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import GeographicMap from './map/GeographicMap.jsx'
import TimeMachine from './map/TimeMachine.jsx'
import LayerInfo from './map/LayerInfo.jsx'

import AdminRoom from './admin/AdminRoom.jsx'

import {
  CITIES,
} from './cities/index.js'


function GeographicApp() {
  const cityKey =
    'toronto'


  const city =
    CITIES[
      cityKey
    ]


  const timelineLayers =
    useMemo(
      () => {
        const mapLayers =
          Object.entries(
            city.maps
          )
            .filter(
              ([
                ,
                item,
              ]) =>
                Boolean(
                  item.url
                )
            )
            .map(
              ([
                year,
                item,
              ]) => ({
                year:
                  Number(
                    year
                  ),

                layerType:
                  'map',

                ...item,
              })
            )


        const aerialLayers =
          Object.entries(
            city.aerials
          )
            .filter(
              ([
                ,
                item,
              ]) =>
                Boolean(
                  item.url
                )
            )
            .map(
              ([
                year,
                item,
              ]) => ({
                year:
                  Number(
                    year
                  ),

                layerType:
                  'aerial',

                ...item,
              })
            )


        return [
          ...mapLayers,
          ...aerialLayers,
        ]
          .sort(
            (
              a,
              b
            ) =>
              a.year -
              b.year
          )
      },
      [
        city,
      ]
    )


  const defaultLayer =
    timelineLayers.find(
      (
        item
      ) =>
        item.year ===
        city.defaultYear
    ) ||
    timelineLayers[
      timelineLayers.length -
      1
    ]


  const [
    selectedLayer,
    setSelectedLayer,
  ] =
    useState(
      defaultLayer
    )


  const [
    activePinFilter,
    setActivePinFilter,
  ] =
    useState(
      'historic'
    )


  const [
    newSubtypeFilter,
    setNewSubtypeFilter,
  ] =
    useState(
      'all'
    )


  const [
    newBusinessRangeFilter,
    setNewBusinessRangeFilter,
  ] =
    useState(
      '30'
    )


  const [
    opacity,
    setOpacity,
  ] =
    useState(
      1
    )


  const [
    enhanced,
    setEnhanced,
  ] =
    useState(
      false
    )


  useEffect(
    () => {
      setEnhanced(
        false
      )
    },
    [
      selectedLayer,
    ]
  )


  // ==========================================================
  // CONTENT MODE
  // ==========================================================

  function chooseContentMode(
    mode
  ) {
    setActivePinFilter(
      mode
    )
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="app">
      <GeographicMap
        cityKey={
          cityKey
        }

        selectedLayer={
          selectedLayer
        }

        opacity={
          opacity
        }

        enhanced={
          enhanced
        }

        activePinFilter={
          activePinFilter
        }

        onChangePinFilter={
          setActivePinFilter
        }

        newSubtypeFilter={
          newSubtypeFilter
        }

        onChangeNewSubtypeFilter={
          setNewSubtypeFilter
        }

        newBusinessRangeFilter={
          newBusinessRangeFilter
        }
      />


      <div
        className="brand"
        style={{
          display:
            'flex',

          flexDirection:
            'column',

          gap:
            '7px',
        }}
      >
        <div
          style={{
            display:
              'flex',

            alignItems:
              'center',

            gap:
              '12px',
          }}
        >
          <span>
            {city.name}
            {' GEOGRAPHIC'}
          </span>


          <div
            style={{
              display:
                'flex',

              gap:
                '2px',
            }}
          >
            <button
              type="button"
              onClick={() =>
                chooseContentMode(
                  'historic'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.18)',

                padding:
                  '5px 8px',

                background:
                  activePinFilter ===
                  'historic'
                    ? '#111'
                    : '#fff',

                color:
                  activePinFilter ===
                  'historic'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '8px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              HISTORIC
            </button>


            <button
              type="button"
              onClick={() =>
                chooseContentMode(
                  'news'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.18)',

                padding:
                  '5px 8px',

                background:
                  activePinFilter ===
                  'news'
                    ? '#111'
                    : '#fff',

                color:
                  activePinFilter ===
                  'news'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '8px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              NEWS
            </button>


            <button
              type="button"
              onClick={() =>
                chooseContentMode(
                  'new'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.18)',

                padding:
                  '5px 8px',

                background:
                  activePinFilter ===
                  'new'
                    ? '#111'
                    : '#fff',

                color:
                  activePinFilter ===
                  'new'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '8px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              NEW
            </button>
          </div>
        </div>


        {activePinFilter ===
          'new' && (
          <div
            style={{
              display:
                'flex',

              gap:
                '2px',

              marginLeft:
                '0',
            }}
          >
            <button
              type="button"
              onClick={() =>
                setNewSubtypeFilter(
                  'all'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newSubtypeFilter ===
                  'all'
                    ? '#111'
                    : '#fff',

                color:
                  newSubtypeFilter ===
                  'all'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              ALL
            </button>


            <button
              type="button"
              onClick={() =>
                setNewSubtypeFilter(
                  'businesses'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newSubtypeFilter ===
                  'businesses'
                    ? '#111'
                    : '#fff',

                color:
                  newSubtypeFilter ===
                  'businesses'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              BUSINESSES
            </button>


            <button
              type="button"
              onClick={() =>
                setNewSubtypeFilter(
                  'developments'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newSubtypeFilter ===
                  'developments'
                    ? '#111'
                    : '#fff',

                color:
                  newSubtypeFilter ===
                  'developments'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              DEVELOPMENTS
            </button>
          </div>
        )}


        {activePinFilter ===
          'new' &&
          newSubtypeFilter ===
            'businesses' && (
          <div
            style={{
              display:
                'flex',

              gap:
                '2px',

              marginLeft:
                '0',
            }}
          >
            <button
              type="button"
              onClick={() =>
                setNewBusinessRangeFilter(
                  '15'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newBusinessRangeFilter ===
                  '15'
                    ? '#111'
                    : '#fff',

                color:
                  newBusinessRangeFilter ===
                  '15'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              15 DAYS
            </button>


            <button
              type="button"
              onClick={() =>
                setNewBusinessRangeFilter(
                  '30'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newBusinessRangeFilter ===
                  '30'
                    ? '#111'
                    : '#fff',

                color:
                  newBusinessRangeFilter ===
                  '30'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              1 MONTH
            </button>


            <button
              type="button"
              onClick={() =>
                setNewBusinessRangeFilter(
                  '60'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newBusinessRangeFilter ===
                  '60'
                    ? '#111'
                    : '#fff',

                color:
                  newBusinessRangeFilter ===
                  '60'
                    ? '#fff'
                    : '#111',

                font:
                  'inherit',

                fontSize:
                  '7px',

                fontWeight:
                  '700',

                letterSpacing:
                  '0.08em',

                cursor:
                  'pointer',
              }}
            >
              2 MONTHS
            </button>
          </div>
        )}
      </div>


      <div className="timeline-shell">
        <TimeMachine
          layers={
            timelineLayers
          }

          selectedYear={
            selectedLayer?.year
          }

          onSelectYear={
            setSelectedLayer
          }

          opacity={
            opacity
          }

          onOpacityChange={
            (
              event
            ) =>
              setOpacity(
                Number(
                  event.target.value
                )
              )
          }
        />


        <LayerInfo
          layer={
            selectedLayer
          }

          enhanced={
            enhanced
          }

          onToggleEnhance={
            () =>
              setEnhanced(
                (
                  current
                ) =>
                  !current
              )
          }
        />
      </div>
    </main>
  )
}


function App() {
  const pathname =
    window.location.pathname


  if (
    pathname ===
      '/admin' ||
    pathname.startsWith(
      '/admin/'
    )
  ) {
    return (
      <AdminRoom />
    )
  }


  return (
    <GeographicApp />
  )
}


export default App