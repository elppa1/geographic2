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


  const sponsorName =
    String(
      import.meta.env.VITE_GEOGRAPHIC_SPONSOR_NAME ||
      'AVAILABLE'
    )
      .trim()


  const sponsorUrl =
    String(
      import.meta.env.VITE_GEOGRAPHIC_SPONSOR_URL ||
      ''
    )
      .trim()


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
      'news'
    )


  const [
    newSubtypeFilter,
    setNewSubtypeFilter,
  ] =
    useState(
      'businesses'
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


  const [
    mobileHeaderOpen,
    setMobileHeaderOpen,
  ] =
    useState(
      true
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
    if (
      mode ===
        'new'
    ) {
      setNewSubtypeFilter(
        'businesses'
      )
    }


    setActivePinFilter(
      mode
    )
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <main className="app">
      <style>
        {`
          .mobile-brand-toggle {
            display: none;
          }

          @media (max-width: 700px) {
            .brand {
              top: 10px !important;
              left: 10px !important;
              width: calc(100vw - 94px);
              min-height: 30px;
              padding: 6px 7px !important;
              gap: 4px !important;
              scale: 1;
              transform-origin: top left;
              font-size: 8px !important;
              letter-spacing: 0.10em !important;
            }

            .brand-main-row {
              position: relative;
              display: flex !important;
              align-items: center !important;
              flex-wrap: wrap;
              gap: 4px !important;
              width: 100%;
              min-height: 18px;
              padding-right: 18px;
            }

            .brand-title {
              white-space: nowrap;
              line-height: 1;
            }

            .brand-primary-filters {
              order: 3;
              width: 100%;
              gap: 1px !important;
              margin-top: 2px;
            }

            .brand-secondary-filters,
            .brand-range-filters {
              gap: 1px !important;
              max-width: 100%;
              overflow-x: auto;
              scrollbar-width: none;
            }

            .brand-secondary-filters::-webkit-scrollbar,
            .brand-range-filters::-webkit-scrollbar {
              display: none;
            }

            .brand button:not(.mobile-brand-toggle) {
              min-height: 20px;
              padding: 3px 5px !important;
              font-size: 6px !important;
              line-height: 1.05 !important;
              letter-spacing: 0.05em !important;
            }

            .mobile-brand-toggle {
              position: absolute;
              top: 5px;
              right: 5px;
              z-index: 4;
              display: grid;
              width: 18px;
              height: 18px;
              place-items: center;
              border: 0;
              padding: 0;
              background: transparent;
              color: #111;
              font: inherit;
              font-size: 10px;
              line-height: 1;
              cursor: pointer;
            }

            .mobile-header-collapsed .brand-primary-filters,
            .mobile-header-collapsed .brand-secondary-filters,
            .mobile-header-collapsed .brand-range-filters {
              display: none !important;
            }

            .geographic-sponsor {
              top: 10px !important;
              right: 10px !important;
              scale: 0.62;
              transform-origin: top right;
            }

            .timeline-shell {
              scale: 1;
              transform-origin: bottom center;
              width: calc(100vw - 16px) !important;
              max-width: none !important;
              bottom: max(24px, env(safe-area-inset-bottom)) !important;
              padding: 4px 6px 5px !important;
            }

            .timeline-years {
              gap: 1px !important;
            }

            .timeline-button {
              min-width: 38px !important;
              padding: 4px 5px !important;
              font-size: 6px !important;
              line-height: 1 !important;
            }

            .opacity-row {
              gap: 6px !important;
              margin-top: 6px !important;
              font-size: 7px !important;
            }

            .layer-info {
              margin-top: 6px !important;
              padding-top: 6px !important;
              font-size: 7px !important;
              line-height: 1.25 !important;
            }

            .layer-info-main {
              gap: 6px !important;
            }

            .layer-title {
              font-size: 7px !important;
              line-height: 1.25 !important;
            }

            .layer-source {
              font-size: 6px !important;
            }

            .enhance-button {
              min-width: 58px !important;
              min-height: 22px !important;
              padding: 4px 5px !important;
              font-size: 6px !important;
            }

            .maplibregl-ctrl-top-left .maplibregl-ctrl,
            .maplibregl-ctrl-bottom-left .maplibregl-ctrl {
              scale: 0.66;
              transform-origin: left center;
            }

            .maplibregl-ctrl-top-right .maplibregl-ctrl,
            .maplibregl-ctrl-bottom-right .maplibregl-ctrl {
              scale: 0.66;
              transform-origin: right center;
            }
          }
        `}
      </style>

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
        className="geographic-sponsor"
        style={{
          position:
            'fixed',

          right:
            '12px',

          top:
            '12px',

          zIndex:
            30,

          minWidth:
            '104px',

          padding:
            '7px 9px',

          border:
            '1px solid rgba(0,0,0,0.16)',

          background:
            'rgba(255,255,255,0.92)',

          backdropFilter:
            'blur(8px)',

          fontFamily:
            'inherit',

          textAlign:
            'right',
        }}
      >
        <div
          style={{
            fontSize:
              '6px',

            fontWeight:
              700,

            letterSpacing:
              '0.14em',

            opacity:
              0.52,
          }}
        >
          SPONSOR
        </div>

        {sponsorUrl
          ? (
              <a
                href={
                  sponsorUrl
                }
                target="_blank"
                rel="noreferrer"
                style={{
                  display:
                    'block',

                  marginTop:
                    '2px',

                  color:
                    '#111',

                  fontSize:
                    '8px',

                  fontWeight:
                    800,

                  letterSpacing:
                    '0.08em',

                  textDecoration:
                    'none',
                }}
              >
                {sponsorName.toUpperCase()}
              </a>
            )
          : (
              <div
                style={{
                  marginTop:
                    '2px',

                  fontSize:
                    '8px',

                  fontWeight:
                    800,

                  letterSpacing:
                    '0.08em',
                }}
              >
                {sponsorName.toUpperCase()}
              </div>
            )}
      </div>


      <div
        className={
          mobileHeaderOpen
            ? 'brand mobile-header-open'
            : 'brand mobile-header-collapsed'
        }
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
          className="brand-main-row"
          style={{
            display:
              'flex',

            alignItems:
              'center',

            gap:
              '12px',
          }}
        >
          <span className="brand-title">
            {city.name}
            {' GEOGRAPHIC'}
          </span>


          <div
            className="brand-primary-filters"
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


          <button
            type="button"
            className="mobile-brand-toggle"
            onClick={() =>
              setMobileHeaderOpen(
                (
                  current
                ) =>
                  !current
              )
            }
            aria-label={
              mobileHeaderOpen
                ? 'Collapse map controls'
                : 'Expand map controls'
            }
            aria-expanded={
              mobileHeaderOpen
            }
          >
            {mobileHeaderOpen
              ? '▴'
              : '▾'}
          </button>
        </div>


        {activePinFilter ===
          'new' &&
          newSubtypeFilter ===
            'businesses' && (
          <div
            className="brand-range-filters"
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


            <button
              type="button"
              onClick={() =>
                setNewBusinessRangeFilter(
                  '90'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newBusinessRangeFilter ===
                  '90'
                    ? '#111'
                    : '#fff',

                color:
                  newBusinessRangeFilter ===
                  '90'
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
              3 MONTHS
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