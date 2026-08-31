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


  const [
    aboutOpen,
    setAboutOpen,
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

          .about-button {
            border: 1px solid rgba(0,0,0,0.18);
            padding: 5px 8px;
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.08em;
            cursor: pointer;
          }

          .about-backdrop {
            position: fixed;
            inset: 0;
            z-index: 80;
            background: rgba(0,0,0,0.28);
            backdrop-filter: blur(2px);
          }

          .about-panel {
            position: fixed;
            top: 12px;
            right: 12px;
            bottom: 12px;
            z-index: 81;
            width: min(390px, calc(100vw - 24px));
            overflow-y: auto;
            padding: 18px 18px 20px;
            border: 1px solid rgba(0,0,0,0.18);
            background: rgba(255,255,255,0.98);
            color: #111;
            box-shadow: 0 18px 60px rgba(0,0,0,0.18);
          }

          .about-panel-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(0,0,0,0.12);
          }

          .about-panel-kicker {
            font-size: 7px;
            font-weight: 700;
            letter-spacing: 0.16em;
            opacity: 0.5;
          }

          .about-panel-title {
            margin-top: 4px;
            font-size: 15px;
            font-weight: 800;
            letter-spacing: 0.08em;
          }

          .about-close {
            flex: 0 0 auto;
            width: 28px;
            height: 28px;
            border: 1px solid rgba(0,0,0,0.16);
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 16px;
            cursor: pointer;
          }

          .about-section {
            padding: 14px 0;
            border-bottom: 1px solid rgba(0,0,0,0.10);
          }

          .about-section:last-of-type {
            border-bottom: 0;
          }

          .about-section h2 {
            margin: 0 0 6px;
            font-size: 8px;
            letter-spacing: 0.12em;
          }

          .about-section p {
            margin: 0;
            font-size: 10px;
            line-height: 1.5;
          }

          .about-section p + p {
            margin-top: 7px;
          }

          .about-made-by {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid rgba(0,0,0,0.12);
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.10em;
          }

          .about-made-by a {
            color: #111;
            text-decoration: none;
            border-bottom: 1px solid rgba(0,0,0,0.35);
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


            .about-panel {
              top: 8px;
              right: 8px;
              bottom: 8px;
              left: 8px;
              width: auto;
              padding: 14px 14px 18px;
            }

            .about-panel-title {
              font-size: 13px;
            }

            .about-section {
              padding: 11px 0;
            }

            .about-section h2 {
              font-size: 7px;
            }

            .about-section p {
              font-size: 9px;
              line-height: 1.45;
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
              transform: translate(-50%, -42px) !important;
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


            <button
              type="button"
              className="about-button"
              onClick={() =>
                setAboutOpen(
                  true
                )
              }
            >
              ABOUT
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


      {aboutOpen && (
        <>
          <button
            type="button"
            className="about-backdrop"
            aria-label="Close About"
            onClick={() =>
              setAboutOpen(
                false
              )
            }
          />

          <aside
            className="about-panel"
            role="dialog"
            aria-modal="true"
            aria-label="About Toronto Geographic"
          >
            <div className="about-panel-header">
              <div>
                <div className="about-panel-kicker">
                  TORONTO GEOGRAPHIC
                </div>

                <div className="about-panel-title">
                  HOW TO USE THIS MAP
                </div>
              </div>

              <button
                type="button"
                className="about-close"
                onClick={() =>
                  setAboutOpen(
                    false
                  )
                }
                aria-label="Close About"
              >
                ×
              </button>
            </div>

            <section className="about-section">
              <h2>
                ABOUT
              </h2>

              <p>
                Toronto Geographic is a living map of Toronto: current news,
                new places, and historical maps and aerial photography in one
                place.
              </p>
            </section>

            <section className="about-section">
              <h2>
                HOW TO USE IT
              </h2>

              <p>
                Switch between HISTORIC, NEWS, and NEW at the top. Tap a pin
                for details. Use search or GPS to find a place, and move
                through the timeline at the bottom to see Toronto at different
                points in time.
              </p>
            </section>

            <section className="about-section">
              <h2>
                MAP RULES
              </h2>

              <p>
                Pins mark the best available location. Some are exact
                addresses, some are intersections, and some are approximate
                areas.
              </p>

              <p>
                Historical maps and aerials are reference material, not exact
                surveys. Older imagery can be incomplete, misaligned, or
                approximate.
              </p>
            </section>

            <section className="about-section">
              <h2>
                NEWS RULES
              </h2>

              <p>
                News pins come from public and official sources where
                available. Fresh and important events are emphasized. Older
                stories may disappear from the broad city view while still
                remaining visible when you zoom into the neighbourhood or
                street.
              </p>

              <p>
                Toronto Geographic is informational and is not an emergency
                alerting service.
              </p>
            </section>

            <section className="about-section">
              <h2>
                NEW PLACES
              </h2>

              <p>
                New businesses are shown when we discover or verify them.
                “First seen” is not the same as an opening date unless the
                opening date has been confirmed.
              </p>
            </section>

            <section className="about-section">
              <h2>
                SOURCES + CORRECTIONS
              </h2>

              <p>
                Where a source or story link exists, we link back to it. If
                something looks wrong, outdated, or misplaced, let us know so
                the map can be corrected.
              </p>
            </section>

            <div className="about-made-by">
              MADE BY{' '}
              <a
                href="https://elppa.engineering"
                target="_blank"
                rel="noreferrer"
              >
                ELPPA.ENGINEERING ↗
              </a>
            </div>
          </aside>
        </>
      )}


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