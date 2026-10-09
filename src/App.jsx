import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import GeographicMap from './map/GeographicMap.jsx'
import MapControls from './map/MapControls.jsx'
import TimeMachine from './map/TimeMachine.jsx'
import LayerInfo from './map/LayerInfo.jsx'

import AdminRoom from './admin/AdminRoom.jsx'

import {
  GEOGRAPHIC_STORE_CHANGE_EVENT,
  getHistoricCategories,
  getHistoricIssues,
  getHistoricLayers,
  loadPublishedHistoricSnapshot,
} from './admin/adminStore.js'

import {
  CITIES,
} from './cities/index.js'

import {
  getHistoricPinIcon,
} from './historicPinIcons.js'


const NEWS_HISTORY_STEPS = [
  {
    value:
      '24',

    label:
      '24 HRS',
  },

  {
    value:
      '72',

    label:
      '3 DAYS',
  },

  {
    value:
      '168',

    label:
      '7 DAYS',
  },

  {
    value:
      '336',

    label:
      '14 DAYS',
  },

  {
    value:
      '720',

    label:
      '30 DAYS',
  },

  {
    value:
      'all',

    label:
      'ALL',
  },
]


function getNewsHistoryStepIndex(
  value
) {
  const index =
    NEWS_HISTORY_STEPS.findIndex(
      (
        option
      ) =>
        option.value ===
        value
    )

  return index >=
    0
    ? index
    : 0
}


function getNewsHistoryLabel(
  value
) {
  return (
    NEWS_HISTORY_STEPS.find(
      (
        option
      ) =>
        option.value ===
        value
    )?.label ||
    ''
  )
}


function GeographicApp() {
  const cityKey =
    'toronto'


  const city =
    CITIES[
      cityKey
    ]


  const geographicMapRef =
    useRef(null)


  const historicMenuRootRef =
    useRef(null)


  const sponsorName =
    String(
      import.meta.env.VITE_GEOGRAPHIC_SPONSOR_NAME ||
      'PROGAINS'
    )
      .trim()


  const sponsorUrl =
    String(
      import.meta.env.VITE_GEOGRAPHIC_SPONSOR_URL ||
      'https://progains.ca/'
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
    liveBusesEnabled,
    setLiveBusesEnabled,
  ] =
    useState(
      true
    )


  const [
    historicIssueFilter,
    setHistoricIssueFilter,
  ] =
    useState(
      'all'
    )


  const [
    historicCategoryFilter,
    setHistoricCategoryFilter,
  ] =
    useState(
      'all'
    )


  const [
    historicLayerFilter,
    setHistoricLayerFilter,
  ] =
    useState(
      'all'
    )


  const [
    historicCategories,
    setHistoricCategories,
  ] =
    useState(
      () =>
        getHistoricCategories()
    )


  const [
    historicLayers,
    setHistoricLayers,
  ] =
    useState(
      () =>
        getHistoricLayers()
    )


  const [
    historicIssues,
    setHistoricIssues,
  ] =
    useState(
      () =>
        getHistoricIssues()
    )


  const publishedHistoricCategories =
    useMemo(
      () =>
        historicCategories
          .filter(
            (
              category
            ) =>
              (
                category.city ||
                'toronto'
              ) ===
                cityKey &&
              category.status ===
                'published'
          )
          .sort(
            (
              a,
              b
            ) => {
              const orderDifference =
                Number(
                  a.displayOrder ||
                  0
                ) -
                Number(
                  b.displayOrder ||
                  0
                )


              if (
                orderDifference !==
                0
              ) {
                return orderDifference
              }


              return String(
                a.title ||
                ''
              )
                .localeCompare(
                  String(
                    b.title ||
                    ''
                  )
                )
            }
          ),
      [
        historicCategories,
        cityKey,
      ]
    )


  const publishedHistoricLayers =
    useMemo(
      () =>
        historicLayers
          .filter(
            (
              layer
            ) =>
              (
                layer.city ||
                'toronto'
              ) ===
                cityKey &&
              layer.status ===
                'published'
          )
          .sort(
            (
              a,
              b
            ) => {
              const orderDifference =
                Number(
                  a.displayOrder ||
                  0
                ) -
                Number(
                  b.displayOrder ||
                  0
                )


              if (
                orderDifference !==
                0
              ) {
                return orderDifference
              }


              return String(
                a.title ||
                ''
              )
                .localeCompare(
                  String(
                    b.title ||
                    ''
                  )
                )
            }
          ),
      [
        historicLayers,
        cityKey,
      ]
    )


  const publishedHistoricIssues =
    useMemo(
      () =>
        historicIssues
          .filter(
            (
              issue
            ) =>
              (
                issue.city ||
                'toronto'
              ) ===
                cityKey &&
              issue.status ===
                'published'
          )
          .sort(
            (
              a,
              b
            ) =>
              String(
                a.number ||
                ''
              )
                .localeCompare(
                  String(
                    b.number ||
                    ''
                  )
                )
          ),
      [
        historicIssues,
        cityKey,
      ]
    )


  const [
    newsRangeFilter,
    setNewsRangeFilter,
  ] =
    useState(
      'curated'
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


  const [
    mobileHeaderOpen,
    setMobileHeaderOpen,
  ] =
    useState(
      true
    )


  const [
    locationTrackingActive,
    setLocationTrackingActive,
  ] =
    useState(
      false
    )


  const [
    historicMobileMenuOpen,
    setHistoricMobileMenuOpen,
  ] =
    useState(
      false
    )


  const [
    aboutOpen,
    setAboutOpen,
  ] =
    useState(
      true
    )


  const [
    timeMachineStarting,
    setTimeMachineStarting,
  ] =
    useState(
      false
    )


  const [
    timeMachineError,
    setTimeMachineError,
  ] =
    useState(
      ''
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


  useEffect(
    () => {
      if (
        activePinFilter !==
          'historic'
      ) {
        setHistoricMobileMenuOpen(
          false
        )
      }
    },
    [
      activePinFilter,
    ]
  )


  useEffect(
    () => {
      if (
        !historicMobileMenuOpen
      ) {
        return undefined
      }


      const handleHistoricOutsidePointer =
        (event) => {
          const root =
            historicMenuRootRef.current


          if (
            root &&
            event.target &&
            root.contains(
              event.target
            )
          ) {
            return
          }


          setHistoricMobileMenuOpen(
            false
          )
        }


      document.addEventListener(
        'pointerdown',
        handleHistoricOutsidePointer,
        true
      )


      return () => {
        document.removeEventListener(
          'pointerdown',
          handleHistoricOutsidePointer,
          true
        )
      }
    },
    [
      historicMobileMenuOpen,
    ]
  )


  useEffect(
    () => {
      const refreshHistoricArchive =
        () => {
          setHistoricIssues(
            getHistoricIssues()
          )

          setHistoricCategories(
            getHistoricCategories()
          )

          setHistoricLayers(
            getHistoricLayers()
          )
        }


      window.addEventListener(
        'storage',
        refreshHistoricArchive
      )


      window.addEventListener(
        GEOGRAPHIC_STORE_CHANGE_EVENT,
        refreshHistoricArchive
      )


      return () => {
        window.removeEventListener(
          'storage',
          refreshHistoricArchive
        )


        window.removeEventListener(
          GEOGRAPHIC_STORE_CHANGE_EVENT,
          refreshHistoricArchive
        )
      }
    },
    []
  )


  useEffect(
    () => {
      loadPublishedHistoricSnapshot()
        .catch(
          (error) => {
            console.error(
              'HISTORIC PUBLIC LOAD ERROR:',
              error
            )
          }
        )
    },
    []
  )


  useEffect(
    () => {
      if (
        historicIssueFilter ===
          'all'
      ) {
        return
      }


      const stillPublished =
        publishedHistoricIssues.some(
          (
            issue
          ) =>
            issue.id ===
            historicIssueFilter
        )


      if (
        !stillPublished
      ) {
        setHistoricIssueFilter(
          'all'
        )
      }
    },
    [
      historicIssueFilter,
      publishedHistoricIssues,
    ]
  )


  useEffect(
    () => {
      if (
        historicCategoryFilter ===
          'all'
      ) {
        return
      }


      const stillPublished =
        publishedHistoricCategories.some(
          (category) =>
            category.id ===
            historicCategoryFilter
        )


      if (
        !stillPublished
      ) {
        setHistoricCategoryFilter(
          'all'
        )
      }
    },
    [
      historicCategoryFilter,
      publishedHistoricCategories,
    ]
  )


  useEffect(
    () => {
      if (
        historicLayerFilter ===
          'all'
      ) {
        return
      }


      const stillPublished =
        publishedHistoricLayers.some(
          (layer) =>
            layer.id ===
            historicLayerFilter
        )


      if (
        !stillPublished
      ) {
        setHistoricLayerFilter(
          'all'
        )
      }
    },
    [
      historicLayerFilter,
      publishedHistoricLayers,
    ]
  )


  const historicArchiveValue =
    historicIssueFilter !==
      'all'
      ? `issue:${historicIssueFilter}`
      : historicLayerFilter !==
          'all'
        ? `layer:${historicLayerFilter}`
        : historicCategoryFilter !==
            'all'
          ? `category:${historicCategoryFilter}`
          : 'all'


  const historicArchiveLabel =
    useMemo(
      () => {
        if (
          historicIssueFilter !==
            'all'
        ) {
          const issue =
            publishedHistoricIssues.find(
              (item) =>
                item.id ===
                historicIssueFilter
            )

          return issue
            ? `★ ISSUE ${issue.number || ''} — ${issue.title}`.trim()
            : 'HISTORIC · ALL STORIES'
        }


        if (
          historicLayerFilter !==
            'all'
        ) {
          const layer =
            publishedHistoricLayers.find(
              (item) =>
                item.id ===
                historicLayerFilter
            )

          const category =
            publishedHistoricCategories.find(
              (item) =>
                item.id ===
                layer?.categoryId
            )

          const categoryIcon =
            getHistoricPinIcon(
              category?.pinIcon ||
              'map-pin'
            )

          return layer
            ? `${categoryIcon.emoji} ${category?.title || 'HISTORIC'} — ${layer.title}`
            : 'HISTORIC · ALL STORIES'
        }


        if (
          historicCategoryFilter !==
            'all'
        ) {
          const category =
            publishedHistoricCategories.find(
              (item) =>
                item.id ===
                historicCategoryFilter
            )

          const categoryIcon =
            getHistoricPinIcon(
              category?.pinIcon ||
              'map-pin'
            )

          return category
            ? `${categoryIcon.emoji} ALL ${category.title}`
            : 'HISTORIC · ALL STORIES'
        }


        return 'HISTORIC · ALL STORIES'
      },
      [
        historicIssueFilter,
        historicLayerFilter,
        historicCategoryFilter,
        publishedHistoricIssues,
        publishedHistoricLayers,
        publishedHistoricCategories,
      ]
    )


  const historicCollectionActive =
    historicIssueFilter !==
      'all' ||
    historicCategoryFilter !==
      'all' ||
    historicLayerFilter !==
      'all'


  const historicAtCollectionHome =
    selectedLayer?.year ===
      defaultLayer?.year &&
    selectedLayer?.layerType ===
      defaultLayer?.layerType


  function resetHistoricMapHome(
    recenter =
      true
  ) {
    setSelectedLayer(
      defaultLayer
    )


    window.requestAnimationFrame(
      () => {
        geographicMapRef.current
          ?.clearSelectedPin?.()


        if (
          !recenter
        ) {
          return
        }


        const map =
          geographicMapRef.current
            ?.getMap?.()


        if (
          !map ||
          !city
        ) {
          return
        }


        map.flyTo({
          center:
            city.center,

          zoom:
            city.zoom,

          duration:
            700,
        })
      }
    )
  }


  function changeHistoricArchive(
    value
  ) {
    setHistoricIssueFilter(
      'all'
    )

    setHistoricCategoryFilter(
      'all'
    )

    setHistoricLayerFilter(
      'all'
    )


    if (
      value.startsWith(
        'issue:'
      )
    ) {
      setHistoricIssueFilter(
        value.slice(
          'issue:'.length
        )
      )
    }


    if (
      value.startsWith(
        'category:'
      )
    ) {
      setHistoricCategoryFilter(
        value.slice(
          'category:'.length
        )
      )
    }


    if (
      value.startsWith(
        'layer:'
      )
    ) {
      setHistoricLayerFilter(
        value.slice(
          'layer:'.length
        )
      )
    }


    resetHistoricMapHome(
      value !==
        'all'
    )
  }


  function selectHistoricTimeMachineLayer(
    layer
  ) {
    geographicMapRef.current
      ?.clearSelectedPin?.()

    setActivePinFilter(
      'historic'
    )

    setSelectedLayer(
      layer
    )
  }


  async function startTimeMachine() {
    const timeMachineLayer =
      timelineLayers.find(
        (layer) =>
          layer.year >=
            1960 &&
          layer.year <=
            1969 &&
          layer.layerType ===
            'aerial'
      ) ||
      timelineLayers.find(
        (layer) =>
          layer.year >=
            1960 &&
          layer.year <=
            1969
      ) ||
      defaultLayer


    setActivePinFilter(
      'historic'
    )

    setHistoricIssueFilter(
      'all'
    )

    setHistoricCategoryFilter(
      'all'
    )

    setHistoricLayerFilter(
      'all'
    )

    if (
      timeMachineLayer
    ) {
      setSelectedLayer(
        timeMachineLayer
      )
    }


    setTimeMachineError(
      ''
    )

    setTimeMachineStarting(
      true
    )


    try {
      const mapApi =
        geographicMapRef.current


      if (
        !mapApi?.startLocationTracking
      ) {
        throw new Error(
          'GPS is not ready yet'
        )
      }


      await mapApi
        .startLocationTracking()


      setLocationTrackingActive(
        true
      )


      setAboutOpen(
        false
      )
    } catch (
      error
    ) {
      console.error(
        'TIME MACHINE GPS ERROR:',
        error
      )

      setTimeMachineError(
        'GPS could not be turned on. Allow location access and try again.'
      )


      setLocationTrackingActive(
        false
      )
    } finally {
      setTimeMachineStarting(
        false
      )
    }
  }


  async function handleMainMenuLocate() {
    const mapApi =
      geographicMapRef.current


    if (
      !mapApi?.toggleLocationTracking
    ) {
      return false
    }


    const active =
      await mapApi
        .toggleLocationTracking()


    setLocationTrackingActive(
      Boolean(
        active
      )
    )


    return active
  }


  async function handleMainMenuOrientation() {
    const mapApi =
      geographicMapRef.current


    if (
      !mapApi?.toggleOrientationTracking
    ) {
      return false
    }


    return mapApi
      .toggleOrientationTracking()
  }


  function handleMainMenuSearchResult(
    result
  ) {
    geographicMapRef.current
      ?.handleSearchResult?.(
        result
      )
  }


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
        'all'
      )
    }


    if (
      mode ===
        'news'
    ) {
      setLiveBusesEnabled(
        true
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
            border: 0;
            background: rgba(0,0,0,0.34);
            backdrop-filter: blur(3px);
            cursor: default;
          }

          .about-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: 81;
            width: min(430px, calc(100vw - 32px));
            max-height: calc(100vh - 32px);
            overflow-y: auto;
            transform: translate(-50%, -50%);
            padding: 18px;
            border: 1px solid rgba(0,0,0,0.20);
            background: rgba(255,255,255,0.98);
            color: #111;
            box-shadow: 0 18px 60px rgba(0,0,0,0.24);
          }

          .about-panel-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 11px;
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
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.08em;
          }

          .about-panel-loading-status {
            margin-top: 6px;
            font-size: 7px;
            font-weight: 700;
            letter-spacing: 0.08em;
            line-height: 1.45;
            opacity: 0.48;
          }

          .about-close {
            flex: 0 0 auto;
            width: 27px;
            height: 27px;
            border: 1px solid rgba(0,0,0,0.16);
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 15px;
            cursor: pointer;
          }

          .about-section {
            padding: 10px 0;
            border-bottom: 1px solid rgba(0,0,0,0.09);
          }

          .about-section:last-of-type {
            border-bottom: 0;
          }

          .about-section h2 {
            margin: 0 0 4px;
            font-size: 7px;
            letter-spacing: 0.12em;
          }

          .about-section p {
            margin: 0;
            font-size: 9px;
            line-height: 1.45;
          }

          .about-section p + p {
            margin-top: 6px;
          }

          .howto-actions {
            display: grid;
            gap: 6px;
            margin-top: 13px;
          }

          .howto-primary,
          .howto-secondary {
            width: 100%;
            min-height: 36px;
            border: 1px solid #111;
            padding: 8px 10px;
            font: inherit;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.08em;
            cursor: pointer;
          }

          .howto-primary {
            background: #111;
            color: #fff;
          }

          .howto-primary:disabled {
            cursor: wait;
            opacity: 0.65;
          }

          .howto-secondary {
            background: #fff;
            color: #111;
          }

          .howto-error {
            margin-top: 8px;
            font-size: 8px;
            line-height: 1.4;
          }

          .howto-tip {
            margin-top: 7px !important;
            padding: 7px 8px;
            border: 1px solid rgba(0,0,0,0.14);
            background: rgba(0,0,0,0.035);
            font-weight: 650;
          }

          .howto-tip strong {
            font-weight: 900;
            letter-spacing: 0.08em;
          }

          .howto-sponsor {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid rgba(0,0,0,0.12);
            font-size: 7px;
            font-weight: 700;
            letter-spacing: 0.09em;
            text-align: center;
          }

          .howto-sponsor a {
            color: #111;
            text-decoration: none;
            border-bottom: 1px solid rgba(0,0,0,0.28);
          }

          .about-made-by {
            margin-top: 8px;
            font-size: 6px;
            font-weight: 700;
            letter-spacing: 0.10em;
            text-align: center;
            opacity: 0.55;
          }

          .about-made-by a {
            color: #111;
            text-decoration: none;
          }

          .historic-issue-nav {
            display: flex;
            align-items: stretch;
            gap: 3px;
            max-width: min(760px, calc(100vw - 40px));
            overflow-x: auto;
            scrollbar-width: none;
          }

          .historic-issue-nav::-webkit-scrollbar {
            display: none;
          }

          .historic-mobile-picker {
            display: none;
          }

          .historic-mobile-picker-button {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            border: 1px solid rgba(0,0,0,0.18);
            padding: 6px 8px;
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.06em;
            text-align: left;
            cursor: pointer;
          }

          .historic-mobile-picker-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .historic-mobile-picker-arrow {
            flex: 0 0 auto;
            font-size: 10px;
          }

          .historic-mobile-picker-menu {
            position: absolute;
            top: calc(100% + 2px);
            left: 0;
            right: 0;
            z-index: 120;
            max-height: min(52vh, 360px);
            overflow-y: auto;
            overscroll-behavior: contain;
            border: 1px solid rgba(0,0,0,0.18);
            background: rgba(255,255,255,0.99);
            box-shadow: 0 10px 26px rgba(0,0,0,0.18);
          }

          .historic-mobile-picker-heading {
            padding: 6px 8px 4px;
            background: rgba(0,0,0,0.035);
            border-top: 1px solid rgba(0,0,0,0.07);
            font-size: 6px;
            font-weight: 800;
            letter-spacing: 0.09em;
            opacity: 0.62;
          }

          .historic-mobile-picker-heading:first-child {
            border-top: 0;
          }

          .historic-mobile-picker-option {
            width: 100%;
            min-height: 28px;
            border: 0;
            border-top: 1px solid rgba(0,0,0,0.055);
            padding: 6px 8px;
            background: #fff;
            color: #111;
            font: inherit;
            font-size: 7px;
            font-weight: 700;
            line-height: 1.2;
            letter-spacing: 0.04em;
            text-align: left;
            cursor: pointer;
          }

          .historic-mobile-picker-option-layer {
            padding-left: 18px;
            font-weight: 600;
          }

          .historic-mobile-picker-option-active {
            background: #111;
            color: #fff;
          }

          .historic-issue-button {
            flex: 0 0 auto;
            min-width: 92px;
            border: 1px solid rgba(0,0,0,0.14);
            padding: 5px 7px;
            background: #fff;
            color: #111;
            font: inherit;
            text-align: left;
            cursor: pointer;
          }

          .historic-issue-button-active {
            background: #111;
            color: #fff;
          }

          .historic-issue-number {
            display: block;
            font-size: 6px;
            font-weight: 800;
            letter-spacing: 0.12em;
            opacity: 0.7;
          }

          .historic-issue-subtitle {
            display: block;
            margin-top: 2px;
            font-size: 6px;
            font-weight: 700;
            letter-spacing: 0.06em;
            white-space: nowrap;
          }

          .historic-issue-title {
            display: block;
            margin-top: 2px;
            font-size: 7px;
            font-weight: 800;
            letter-spacing: 0.05em;
            white-space: nowrap;
          }

          .news-history-control {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .news-history-slider-shell {
            width: 150px;
          }

          .news-history-slider-labels {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            min-height: 8px;
            margin-bottom: 1px;
            font-size: 5px;
            font-weight: 700;
            line-height: 1;
            letter-spacing: 0.06em;
            opacity: 0.68;
          }

          .news-history-slider-labels span:nth-child(2) {
            text-align: center;
            opacity: 0.9;
          }

          .news-history-slider-labels span:nth-child(3) {
            text-align: right;
          }

          .news-history-slider {
            display: block;
            width: 100%;
            height: 16px;
            margin: 0;
            padding: 0;

            appearance: none;
            -webkit-appearance: none;

            background: transparent;
            cursor: pointer;
          }

          .news-history-slider::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(17,17,17,0.28);
          }

          .news-history-slider::-webkit-slider-thumb {
            width: 14px;
            height: 14px;
            margin-top: -5px;

            border: 2px solid #111;
            border-radius: 50%;

            -webkit-appearance: none;
            appearance: none;

            background: #fff;

            box-shadow:
              0 0 0 2px rgba(255,255,255,0.88),
              0 1px 5px rgba(0,0,0,0.34);
          }

          .news-history-slider::-moz-range-track {
            height: 4px;
            border: 0;
            border-radius: 999px;
            background: rgba(17,17,17,0.28);
          }

          .news-history-slider::-moz-range-thumb {
            width: 12px;
            height: 12px;

            border: 2px solid #111;
            border-radius: 50%;

            background: #fff;

            box-shadow:
              0 0 0 2px rgba(255,255,255,0.88),
              0 1px 5px rgba(0,0,0,0.34);
          }

          @media (max-width: 700px) {
            .news-history-control {
              gap: 4px;
            }

            .news-history-slider-shell {
              width: 112px;
            }

            .news-history-slider-labels {
              font-size: 4.5px;
            }

            .news-history-slider::-webkit-slider-runnable-track {
              background: rgba(255,255,255,0.34);
            }

            .news-history-slider::-moz-range-track {
              background: rgba(255,255,255,0.34);
            }

            .brand {
              top: 8px !important;
              left: 8px !important;
              right: 8px !important;
              width: auto !important;
              min-height: 30px;
              padding: 8px 6px 5px !important;
              gap: 4px !important;
              scale: 1;
              transform-origin: top left;
              font-size: 7px !important;
              letter-spacing: 0.08em !important;
            }

            .brand-main-row {
              position: relative;
              display: flex !important;
              align-items: center !important;
              flex-wrap: wrap;
              gap: 3px !important;
              width: 100%;
              min-height: 20px;
              padding-right: 72px;
            }

            .brand-title {
              white-space: nowrap;
              line-height: 1;
              font-size: 7px !important;
              letter-spacing: 0.08em !important;
            }

            /* Mobile: visually pair the top controls with the black Time Machine tray. */
            .brand {
              background: rgba(10,10,10,0.91) !important;
              color: #fff !important;
              border-color: rgba(255,255,255,0.20) !important;
              box-shadow: 0 8px 24px rgba(0,0,0,0.20) !important;
            }

            .brand-title {
              color: #fff !important;
            }

            .brand .brand-mode-button {
              border-color: rgba(255,255,255,0.30) !important;
              background: transparent !important;
              color: #fff !important;
              box-shadow: none !important;
            }

            .brand .brand-mode-button-active {
              border-color: #fff !important;
              background: #fff !important;
              color: #111 !important;
            }

            .brand .content-subfilter {
              border-color: #111 !important;
              background: #111 !important;
              color: #fff !important;
            }

            .brand .content-subfilter-active {
              border-color: #fff !important;
              background: #fff !important;
              color: #111 !important;
            }

            .brand .mobile-brand-toggle {
              color: #fff !important;
            }

            .map-utilities .map-utility-button {
              border-color: transparent !important;
              border-radius: 6px !important;
              background: rgba(255,255,255,0.10) !important;
              color: #fff !important;
              box-shadow: none !important;
            }

            .map-utilities .gps-toggle-button-active {
              background: #fff !important;
              color: #111 !important;
            }

            .brand-primary-filters {
              order: 3;
              width: 100%;
              gap: 2px !important;
              margin-top: 2px;
            }

            .brand-secondary-filters,
            .brand-range-filters,
            .historic-issue-nav {
              gap: 1px !important;
              max-width: 100%;
              overflow-x: auto;
              scrollbar-width: none;
            }

            .brand-secondary-filters::-webkit-scrollbar,
            .brand-range-filters::-webkit-scrollbar,
            .historic-issue-nav::-webkit-scrollbar {
              display: none;
            }

            .historic-issue-button {
              min-width: 86px;
              padding: 4px 6px;
            }

            .historic-issue-number,
            .historic-issue-subtitle {
              font-size: 5px;
            }

            .historic-issue-title {
              font-size: 6px;
            }

            .brand button:not(.mobile-brand-toggle) {
              min-height: 19px;
              padding: 3px 5px !important;
              font-size: 5.5px !important;
              line-height: 1 !important;
              letter-spacing: 0.045em !important;
            }

            .historic-issue-nav {
              position: relative;
              width: 100%;
              overflow: visible !important;
            }

            .historic-issue-nav > select {
              display: none !important;
            }

            .historic-mobile-picker {
              position: relative;
              display: block;
              width: 100%;
            }

            .historic-mobile-picker-button {
              min-height: 30px !important;
              padding: 6px 8px !important;
              border-color: rgba(255,255,255,0.28) !important;
              background: rgba(255,255,255,0.06) !important;
              color: #fff !important;
              font-size: 6.5px !important;
              line-height: 1.15 !important;
              letter-spacing: 0.05em !important;
            }

            .historic-mobile-picker-menu {
              max-height: min(48vh, 340px);
              border-color: rgba(255,255,255,0.24) !important;
              background: rgba(10,10,10,0.98) !important;
              box-shadow: 0 10px 28px rgba(0,0,0,0.36) !important;
            }

            .historic-mobile-picker-heading {
              padding: 6px 8px 4px;
              border-top-color: rgba(255,255,255,0.10) !important;
              background: rgba(255,255,255,0.07) !important;
              color: rgba(255,255,255,0.72) !important;
              opacity: 1 !important;
              font-size: 5.5px;
            }

            .historic-mobile-picker-option {
              min-height: 30px !important;
              padding: 7px 8px !important;
              border-top-color: rgba(255,255,255,0.08) !important;
              background: transparent !important;
              color: #fff !important;
              font-size: 6.5px !important;
              line-height: 1.2 !important;
              letter-spacing: 0.04em !important;
            }

            .historic-mobile-picker-option-active {
              background: #fff !important;
              color: #111 !important;
            }

            .historic-mobile-picker-option-layer {
              padding-left: 20px !important;
            }


            .about-panel {
              width: calc(100vw - 24px);
              max-height: calc(100vh - 24px);
              padding: 13px;
            }

            .about-panel-title {
              font-size: 12px;
            }

            .about-section {
              padding: 8px 0;
            }

            .about-section h2 {
              font-size: 6.5px;
            }

            .about-section p {
              font-size: 8px;
              line-height: 1.4;
            }

            .howto-primary,
            .howto-secondary {
              min-height: 34px;
              font-size: 7px;
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

            .timeline-shell {
              position: fixed !important;
              scale: 1;
              transform-origin: bottom center;
              transform: translateX(-50%) !important;
              width: calc(100vw - 16px) !important;
              max-width: none !important;
              bottom: max(10px, env(safe-area-inset-bottom)) !important;
              padding: 4px 6px 5px !important;
            }

            .timeline-years {
              gap: 1px !important;
            }

            .timeline-button {
              min-width: 44px !important;
              min-height: 30px !important;
              padding: 5px 6px !important;
              font-size: 6.5px !important;
              line-height: 1 !important;
            }

            .opacity-row {
              gap: 6px !important;
              margin-top: 4px !important;
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


          /* ======================================================
             FINAL MAIN MENU MERGE
             ====================================================== */

          .historic-selection-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            padding: 4px 2px 0;
            border-top: 1px solid rgba(17,17,17,0.10);
            color: inherit;
            font-size: 7px;
            font-weight: 800;
            line-height: 1.2;
            letter-spacing: 0.08em;
          }

          .historic-selection-row-label {
            flex: 0 0 auto;
            opacity: 0.48;
          }

          .historic-selection-row-value {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          @media (max-width: 700px) {
            .historic-selection-row {
              padding-top: 3px;
              border-top-color: rgba(255,255,255,0.16);
              font-size: 5.8px;
              letter-spacing: 0.06em;
            }
          }

          .live-buses-toggle {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 4px !important;
          }

          .live-buses-check {
            display: inline-block;
            width: 11px;
            flex: 0 0 11px;
            text-align: center;
            font-size: 10px;
            font-weight: 900;
            line-height: 1;
            letter-spacing: 0;
          }

          .live-buses-toggle-active {
            font-weight: 900 !important;
          }

          .brand-primary-filters {
            position: relative;
          }

          .historic-menu-anchor {
            position: relative;
            display: flex;
            align-items: stretch;
          }

          .historic-menu-anchor > .historic-issue-nav {
            position: absolute !important;
            top: calc(100% + 4px) !important;
            left: 0 !important;
            z-index: 180 !important;

            width: min(360px, calc(100vw - 28px)) !important;
            max-width: none !important;

            display: block !important;
            overflow: visible !important;

            padding: 0 !important;
            margin: 0 !important;
          }

          .historic-menu-anchor .historic-issue-nav > select {
            display: none !important;
          }

          .historic-menu-anchor .historic-mobile-picker {
            position: relative !important;
            display: block !important;
            width: 100% !important;
          }

          .historic-menu-anchor .historic-mobile-picker-button {
            display: none !important;
          }

          .historic-menu-anchor .historic-mobile-picker-menu {
            position: static !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;

            width: 100% !important;
            max-height: min(60vh, 420px) !important;

            overflow-y: auto !important;

            border: 1px solid rgba(0,0,0,0.18) !important;
            background: rgba(255,255,255,0.99) !important;
            color: #111 !important;

            box-shadow: 0 10px 26px rgba(0,0,0,0.22) !important;
          }

          .historic-menu-anchor .historic-mobile-picker-heading {
            background: rgba(0,0,0,0.04) !important;
            color: #111 !important;
          }

          .historic-menu-anchor .historic-mobile-picker-option {
            background: #fff !important;
            color: #111 !important;
          }

          .historic-menu-anchor .historic-mobile-picker-option-active {
            background: #111 !important;
            color: #fff !important;
          }

          @media (min-width: 701px) {
            .historic-menu-anchor .historic-mobile-picker-heading {
              font-size: 7.5px !important;
            }

            .historic-menu-anchor .historic-mobile-picker-option {
              font-size: 8.5px !important;
            }
          }


          /* GPS + Search are now part of the main menu, not floating map chrome. */
          .brand-primary-filters > .map-utilities {
            position: static !important;
            inset: auto !important;

            z-index: auto !important;

            display: flex !important;
            flex-direction: row !important;
            align-items: stretch !important;
            gap: 2px !important;

            padding: 0 !important;
            margin: 0 !important;

            border-radius: 0 !important;
            background: transparent !important;

            box-shadow: none !important;

            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }

          .brand-primary-filters .map-utility-button {
            width: auto !important;
            min-width: 30px !important;
            height: auto !important;
            min-height: 26px !important;

            padding: 5px 8px !important;

            border: 1px solid rgba(0,0,0,0.18) !important;
            border-radius: 0 !important;

            background: #fff !important;
            color: #111 !important;

            font-family: inherit !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            letter-spacing: 0.08em !important;

            box-shadow: none !important;

            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }

          .brand-primary-filters .gps-toggle-button {
            min-width: 40px !important;
          }

          .brand-primary-filters .search-control {
            position: relative !important;
          }

          .brand-primary-filters .search-control .map-utility-button {
            width: 30px !important;
            min-width: 30px !important;

            padding: 0 !important;

            font-size: 13px !important;
            font-weight: 400 !important;
            letter-spacing: 0 !important;
          }

          .brand-primary-filters .gps-toggle-button-active,
          .brand-primary-filters .gps-toggle-button-active:hover {
            border-color: #111 !important;
            background: #111 !important;
            color: #fff !important;
          }

          .brand-primary-filters .map-utility-button:hover {
            background: rgba(0,0,0,0.045) !important;
          }

          .brand-primary-filters .gps-toggle-button-active:hover {
            background: #111 !important;
          }

          .brand-primary-filters .search-panel {
            top: calc(100% + 4px) !important;
            right: 0 !important;
            left: auto !important;

            width: min(320px, calc(100vw - 24px)) !important;
          }


          @media (max-width: 700px) {
            .brand-main-row {
              padding-right: 22px !important;
            }

            .historic-menu-anchor > .historic-issue-nav {
              width: min(340px, calc(100vw - 20px)) !important;
            }

            .historic-menu-anchor .historic-mobile-picker-menu {
              border-color: rgba(255,255,255,0.24) !important;
              background: rgba(10,10,10,0.98) !important;
              color: #fff !important;
            }

            .historic-menu-anchor .historic-mobile-picker-heading {
              border-top-color: rgba(255,255,255,0.10) !important;
              background: rgba(255,255,255,0.07) !important;
              color: rgba(255,255,255,0.72) !important;
            }

            .historic-menu-anchor .historic-mobile-picker-option {
              border-top-color: rgba(255,255,255,0.08) !important;
              background: transparent !important;
              color: #fff !important;
            }

            .historic-menu-anchor .historic-mobile-picker-option-active {
              background: #fff !important;
              color: #111 !important;
            }

            .brand-primary-filters > .map-utilities {
              position: static !important;
              flex: 0 0 auto !important;
              gap: 2px !important;
            }

            .brand-primary-filters .map-utility-button {
              min-width: 28px !important;
              min-height: 19px !important;

              padding: 3px 5px !important;

              border-color: rgba(255,255,255,0.30) !important;

              background: transparent !important;
              color: #fff !important;

              font-size: 5.5px !important;

              box-shadow: none !important;
            }

            .brand-primary-filters .gps-toggle-button {
              min-width: 31px !important;
            }

            .brand-primary-filters .search-control .map-utility-button {
              width: 24px !important;
              min-width: 24px !important;

              padding: 0 !important;

              font-size: 11px !important;
            }

            .brand-primary-filters .gps-toggle-button-active,
            .brand-primary-filters .gps-toggle-button-active:hover {
              border-color: #fff !important;
              background: #fff !important;
              color: #111 !important;
            }

            .brand-primary-filters .search-panel {
              position: fixed !important;

              top: 58px !important;
              left: 8px !important;
              right: 8px !important;

              width: auto !important;
            }

          }


          /* ======================================================
             DESKTOP UI POLISH
             Visual-only overrides. Mobile remains unchanged.
             ====================================================== */
          @media (min-width: 701px) {
            .brand {
              top: 12px !important;
              left: 18px !important;
              width: min(560px, calc(100vw - 36px)) !important;
              max-width: calc(100vw - 36px) !important;
              padding: 3px 6px 3px 10px !important;
              gap: 4px !important;
              border: 1px solid rgba(17,17,17,0.12) !important;
              border-radius: 2px !important;
              background: rgba(255,255,255,0.96) !important;
              color: #111 !important;
              box-shadow: 0 10px 32px rgba(0,0,0,0.13) !important;
              backdrop-filter: blur(10px) !important;
              -webkit-backdrop-filter: blur(10px) !important;
            }

            .brand-main-row {
              min-height: 30px !important;
              gap: 0 !important;
            }

            .brand-title {
              display: flex !important;
              align-items: center !important;
              align-self: stretch !important;
              margin-right: 5px !important;
              padding-right: 12px !important;
              border-right: 1px solid rgba(17,17,17,0.13) !important;
              white-space: nowrap !important;
              color: #111 !important;
              font-size: 11px !important;
              font-weight: 850 !important;
              line-height: 1 !important;
              letter-spacing: 0.14em !important;
            }

            .brand-primary-filters {
              align-items: stretch !important;
              gap: 0 !important;
            }

            .brand .brand-mode-button,
            .brand .about-button {
              min-height: 30px !important;
              padding: 0 10px !important;
              border: 0 !important;
              border-radius: 0 !important;
              background: transparent !important;
              color: #111 !important;
              font-size: 8px !important;
              font-weight: 800 !important;
              line-height: 1 !important;
              letter-spacing: 0.10em !important;
              box-shadow: none !important;
              transition:
                background 120ms ease,
                color 120ms ease !important;
            }

            .brand .brand-mode-button:hover,
            .brand .about-button:hover {
              background: rgba(17,17,17,0.055) !important;
            }

            .brand .brand-mode-button-active,
            .brand .brand-mode-button-active:hover {
              background: #111 !important;
              color: #fff !important;
            }

            .historic-menu-anchor {
              align-items: stretch !important;
            }

            .brand-primary-filters > .map-utilities {
              margin-left: 3px !important;
              gap: 0 !important;
              border-left: 1px solid rgba(17,17,17,0.13) !important;
            }

            .brand-primary-filters .map-utility-button {
              min-width: 32px !important;
              min-height: 30px !important;
              padding: 0 9px !important;
              border: 0 !important;
              border-radius: 0 !important;
              background: transparent !important;
              color: #111 !important;
              font-size: 8px !important;
              font-weight: 800 !important;
              letter-spacing: 0.10em !important;
            }

            .brand-primary-filters .map-utility-button:hover {
              background: rgba(17,17,17,0.055) !important;
            }

            .brand-primary-filters .gps-toggle-button {
              min-width: 40px !important;
            }

            .brand-primary-filters .gps-toggle-button-active,
            .brand-primary-filters .gps-toggle-button-active:hover {
              background: #111 !important;
              color: #fff !important;
            }

            .brand-primary-filters .search-control .map-utility-button {
              width: 32px !important;
              min-width: 32px !important;
              padding: 0 !important;
              font-size: 13px !important;
              font-weight: 500 !important;
              letter-spacing: 0 !important;
            }

            /* Desktop: compact two-row header.
               Row 1 = identity + open white search space + GPS/Search.
               Row 2 = Historic / News / To-Do / Live Buses / How-To.
               Search expands into row 1 instead of growing below the menu.
               Mobile markup and behavior remain unchanged. */
            .brand-main-row {
              display: grid !important;
              grid-template-columns:
                repeat(5, minmax(0, 1fr)) !important;
              grid-template-rows: 38px 34px !important;
              align-items: stretch !important;
              gap: 0 !important;
              width: 100% !important;
              min-height: 72px !important;
              padding-right: 0 !important;
            }

            .brand-title {
              grid-column: 1 / 3 !important;
              grid-row: 1 !important;
              align-self: stretch !important;
              display: flex !important;
              align-items: center !important;
              margin: 0 !important;
              padding: 0 12px 0 2px !important;
              border-right: 0 !important;
              border-bottom: 1px solid rgba(17,17,17,0.13) !important;
            }

            .brand-primary-filters {
              display: contents !important;
            }

            /* Keep the utility controls at the far right of the upper row.
               Columns 3-4 intentionally remain white so Search can open there. */
            .brand-primary-filters > .map-utilities {
              grid-column: 5 !important;
              grid-row: 1 !important;
              align-self: stretch !important;
              justify-self: stretch !important;
              margin: 0 !important;
              gap: 0 !important;
              border-left: 1px solid rgba(17,17,17,0.13) !important;
              border-bottom: 1px solid rgba(17,17,17,0.13) !important;
            }

            /* How-To belongs with the content/navigation row on desktop. */
            .brand-primary-filters > .about-button {
              grid-column: 5 !important;
              grid-row: 2 !important;
              align-self: stretch !important;
              min-height: 34px !important;
              border-left: 1px solid rgba(17,17,17,0.10) !important;
              border-bottom: 0 !important;
            }

            .brand-primary-filters > .historic-menu-anchor {
              grid-column: 1 !important;
              grid-row: 2 !important;
              min-width: 78px !important;
            }

            .brand-primary-filters > .historic-menu-anchor > .brand-mode-button {
              width: 100% !important;
              min-height: 34px !important;
              padding: 0 10px !important;
            }

            .brand-primary-filters > .brand-mode-button:not(.about-button) {
              min-height: 34px !important;
              padding: 0 10px !important;
              border-left: 1px solid rgba(17,17,17,0.10) !important;
            }

            .brand-primary-filters > .brand-mode-button:not(.about-button):nth-of-type(1) {
              grid-column: 2 !important;
              grid-row: 2 !important;
            }

            .brand-primary-filters > .brand-mode-button:not(.about-button):nth-of-type(2) {
              grid-column: 3 !important;
              grid-row: 2 !important;
            }

            .brand-primary-filters > .brand-mode-button:not(.about-button):nth-of-type(3) {
              grid-column: 4 !important;
              grid-row: 2 !important;
            }

            .brand-primary-filters .search-control {
              align-self: stretch !important;
              position: relative !important;
            }

            .brand-primary-filters .search-control .map-utility-button {
              height: 100% !important;
            }

            /* Open Search inside the unused white space in row 1.
               Keep GPS and the search trigger visible on the right. */
            .brand-primary-filters .search-panel {
              top: 0 !important;
              right: 72px !important;
              left: auto !important;
              width: 230px !important;
              max-width: calc(100vw - 300px) !important;
              border: 1px solid rgba(17,17,17,0.12) !important;
              border-radius: 0 !important;
              background: rgba(255,255,255,0.99) !important;
              box-shadow: none !important;
              z-index: 40 !important;
            }

            .brand-primary-filters .search-panel .search-form {
              min-height: 36px !important;
            }

            .brand-primary-filters .search-panel .search-input {
              font-size: 11px !important;
              padding-left: 10px !important;
            }

            .brand-primary-filters .search-panel .search-submit {
              min-width: 38px !important;
              padding: 0 9px !important;
            }

            .brand-primary-filters .search-panel .search-close {
              width: 34px !important;
            }

            .news-history-control,
            .content-subfilters {
              padding-top: 4px !important;
              border-top: 1px solid rgba(17,17,17,0.10) !important;
            }

            .brand .content-subfilters {
              gap: 4px !important;
            }

            .brand .content-subfilter {
              min-height: 26px !important;
              padding: 4px 9px !important;
              font-size: 7.5px !important;
              line-height: 1 !important;
              letter-spacing: 0.07em !important;
            }

            /* Opening welcome / HOW-TO panel: make it comfortably readable. */
            .about-panel {
              width: min(590px, calc(100vw - 64px)) !important;
              padding: 26px 28px 24px !important;
              border-color: rgba(17,17,17,0.14) !important;
              box-shadow: 0 24px 80px rgba(0,0,0,0.24) !important;
            }

            .about-panel-header {
              gap: 22px !important;
              padding-bottom: 17px !important;
            }

            .about-panel-kicker {
              font-size: 9px !important;
              letter-spacing: 0.18em !important;
            }

            .about-panel-title {
              margin-top: 7px !important;
              font-size: 21px !important;
              line-height: 1.12 !important;
              letter-spacing: 0.075em !important;
            }

            .about-close {
              width: 34px !important;
              height: 34px !important;
              font-size: 19px !important;
            }

            .about-section {
              padding: 15px 0 !important;
            }

            .about-section h2 {
              margin-bottom: 7px !important;
              font-size: 10px !important;
              letter-spacing: 0.14em !important;
            }

            .about-section p {
              max-width: 68ch !important;
              font-size: 13px !important;
              line-height: 1.58 !important;
            }

            .about-section p + p {
              margin-top: 9px !important;
            }

            .howto-actions {
              gap: 8px !important;
              margin-top: 18px !important;
            }

            .howto-primary,
            .howto-secondary {
              min-height: 43px !important;
              padding: 10px 13px !important;
              font-size: 10px !important;
              letter-spacing: 0.10em !important;
            }

            .howto-error {
              font-size: 11px !important;
            }

            .howto-sponsor {
              margin-top: 15px !important;
              padding-top: 13px !important;
              font-size: 9px !important;
            }

            .about-made-by {
              margin-top: 10px !important;
              font-size: 8px !important;
            }
          }
        `}
      </style>

      <GeographicMap
        ref={
          geographicMapRef
        }

        cityKey={
          cityKey
        }

        selectedLayer={
          selectedLayer
        }

        homeLayer={
          defaultLayer
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

        liveBusesEnabled={
          liveBusesEnabled
        }

        onChangePinFilter={
          chooseContentMode
        }

        historicIssueFilter={
          historicIssueFilter
        }

        historicCategoryFilter={
          historicCategoryFilter
        }

        historicLayerFilter={
          historicLayerFilter
        }

        onSelectHistoricalLayer={
          setSelectedLayer
        }

        newsRangeFilter={
          newsRangeFilter
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
            <div
              ref={
                historicMenuRootRef
              }
              className="historic-menu-anchor"
            >
            <button
              type="button"
              className={
                activePinFilter ===
                  'historic'
                  ? 'brand-mode-button brand-mode-button-active'
                  : 'brand-mode-button'
              }
              onClick={() => {
                const alreadyHistoric =
                  activePinFilter ===
                    'historic'


                chooseContentMode(
                  'historic'
                )


                setHistoricMobileMenuOpen(
                  alreadyHistoric
                    ? !historicMobileMenuOpen
                    : true
                )
              }}
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

        {activePinFilter ===
          'historic' &&
          historicMobileMenuOpen && (
          <div className="historic-issue-nav">
            <select
              value={
                historicArchiveValue
              }
              onChange={
                (event) =>
                  changeHistoricArchive(
                    event.target.value
                  )
              }
              aria-label="Historic archive"
              style={{
                minWidth:
                  '240px',

                maxWidth:
                  'min(520px, calc(100vw - 40px))',

                border:
                  '1px solid rgba(0,0,0,0.18)',

                padding:
                  '6px 8px',

                background:
                  '#fff',

                color:
                  '#111',

                font:
                  'inherit',

                fontSize:
                  '8px',

                fontWeight:
                  800,

                letterSpacing:
                  '0.06em',
              }}
            >
              <option value="all">
                HISTORIC · ALL STORIES
              </option>


              {publishedHistoricCategories.map(
                (category) => {
                  const categoryIcon =
                    getHistoricPinIcon(
                      category.pinIcon ||
                      'map-pin'
                    )


                  return (
                    <optgroup
                      key={
                        category.id
                      }
                      label={
                        `${categoryIcon.emoji} ${category.title}`
                      }
                    >
                      <option
                        value={
                          `category:${category.id}`
                        }
                      >
                        {categoryIcon.emoji} ALL {category.title}
                      </option>

                      {publishedHistoricLayers
                        .filter(
                          (layer) =>
                            layer.categoryId ===
                            category.id
                        )
                        .map(
                          (layer) => (
                            <option
                              key={
                                layer.id
                              }
                              value={
                                `layer:${layer.id}`
                              }
                            >
                              {categoryIcon.emoji} {category.title} — {layer.title}
                            </option>
                          )
                        )}
                    </optgroup>
                  )
                }
              )}


              {publishedHistoricIssues.length >
                0 && (
                <optgroup label="SPECIAL ISSUES">
                  {publishedHistoricIssues.map(
                    (issue) => (
                      <option
                        key={
                          issue.id
                        }
                        value={
                          `issue:${issue.id}`
                        }
                      >
                        ★ ISSUE {issue.number || ''} — {issue.title}
                      </option>
                    )
                  )}
                </optgroup>
              )}
            </select>


            <div className="historic-mobile-picker">
              <button
                type="button"
                className="historic-mobile-picker-button"
                onClick={() =>
                  setHistoricMobileMenuOpen(
                    (open) =>
                      !open
                  )
                }
                aria-expanded={
                  historicMobileMenuOpen
                }
                aria-haspopup="listbox"
              >
                <span className="historic-mobile-picker-label">
                  {historicArchiveLabel}
                </span>

                <span className="historic-mobile-picker-arrow">
                  {historicMobileMenuOpen
                    ? '▴'
                    : '▾'}
                </span>
              </button>


              {historicMobileMenuOpen && (
                <div
                  className="historic-mobile-picker-menu"
                  role="listbox"
                  aria-label="Historic archive"
                >
                  <button
                    type="button"
                    className={
                      historicArchiveValue ===
                        'all'
                        ? 'historic-mobile-picker-option historic-mobile-picker-option-active'
                        : 'historic-mobile-picker-option'
                    }
                    onClick={() => {
                      changeHistoricArchive(
                        'all'
                      )

                      setHistoricMobileMenuOpen(
                        false
                      )
                    }}
                  >
                    HISTORIC · ALL STORIES
                  </button>


                  {publishedHistoricCategories.map(
                    (category) => {
                      const categoryIcon =
                        getHistoricPinIcon(
                          category.pinIcon ||
                          'map-pin'
                        )

                      const categoryValue =
                        `category:${category.id}`

                      const categoryLayers =
                        publishedHistoricLayers.filter(
                          (layer) =>
                            layer.categoryId ===
                            category.id
                        )


                      return (
                        <div
                          key={
                            category.id
                          }
                        >
                          <div className="historic-mobile-picker-heading">
                            {categoryIcon.emoji} {category.title}
                          </div>

                          <button
                            type="button"
                            className={
                              historicArchiveValue ===
                                categoryValue
                                ? 'historic-mobile-picker-option historic-mobile-picker-option-active'
                                : 'historic-mobile-picker-option'
                            }
                            onClick={() => {
                              changeHistoricArchive(
                                categoryValue
                              )

                              setHistoricMobileMenuOpen(
                                false
                              )
                            }}
                          >
                            {categoryIcon.emoji} ALL {category.title}
                          </button>

                          {categoryLayers.map(
                            (layer) => {
                              const layerValue =
                                `layer:${layer.id}`

                              return (
                                <button
                                  type="button"
                                  key={
                                    layer.id
                                  }
                                  className={
                                    historicArchiveValue ===
                                      layerValue
                                      ? 'historic-mobile-picker-option historic-mobile-picker-option-layer historic-mobile-picker-option-active'
                                      : 'historic-mobile-picker-option historic-mobile-picker-option-layer'
                                  }
                                  onClick={() => {
                                    changeHistoricArchive(
                                      layerValue
                                    )

                                    setHistoricMobileMenuOpen(
                                      false
                                    )
                                  }}
                                >
                                  {layer.title}
                                </button>
                              )
                            }
                          )}
                        </div>
                      )
                    }
                  )}


                  {publishedHistoricIssues.length >
                    0 && (
                    <div>
                      <div className="historic-mobile-picker-heading">
                        SPECIAL ISSUES
                      </div>

                      {publishedHistoricIssues.map(
                        (issue) => {
                          const issueValue =
                            `issue:${issue.id}`

                          return (
                            <button
                              type="button"
                              key={
                                issue.id
                              }
                              className={
                                historicArchiveValue ===
                                  issueValue
                                  ? 'historic-mobile-picker-option historic-mobile-picker-option-active'
                                  : 'historic-mobile-picker-option'
                              }
                              onClick={() => {
                                changeHistoricArchive(
                                  issueValue
                                )

                                setHistoricMobileMenuOpen(
                                  false
                                )
                              }}
                            >
                              ★ ISSUE {issue.number || ''} — {issue.title}
                            </button>
                          )
                        }
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>


          </div>
        )}


            </div>


            <button
              type="button"
              className={
                activePinFilter ===
                  'news'
                  ? 'brand-mode-button brand-mode-button-active'
                  : 'brand-mode-button'
              }
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
              className={
                activePinFilter ===
                  'new'
                  ? 'brand-mode-button brand-mode-button-active'
                  : 'brand-mode-button'
              }
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
              TO-DO
            </button>


            <button
              type="button"
              className={
                liveBusesEnabled
                  ? 'brand-mode-button live-buses-toggle live-buses-toggle-active'
                  : 'brand-mode-button live-buses-toggle'
              }
              onClick={() =>
                setLiveBusesEnabled(
                  (current) =>
                    !current
                )
              }
              aria-pressed={
                liveBusesEnabled
              }
              title={
                liveBusesEnabled
                  ? 'Hide live buses and streetcars'
                  : 'Show live buses and streetcars'
              }
            >
              <span
                className="live-buses-check"
                aria-hidden="true"
              >
                {liveBusesEnabled
                  ? '✓'
                  : '□'}
              </span>
              LIVE BUSES
            </button>


            <button
              type="button"
              className="about-button brand-mode-button"
              onClick={() =>
                setAboutOpen(
                  true
                )
              }
            >
              HOW-TO
            </button>


            <MapControls
              onLocate={
                handleMainMenuLocate
              }
              locationTrackingActive={
                locationTrackingActive
              }
              onOrientation={
                handleMainMenuOrientation
              }
              onSearchResult={
                handleMainMenuSearchResult
              }
            />
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
          'historic' && (
          <div
            className="historic-selection-row"
            aria-label={
              `Historic view: ${historicArchiveLabel}`
            }
          >
            <span className="historic-selection-row-label">
              VIEWING
            </span>

            <span className="historic-selection-row-value">
              {historicArchiveLabel}
            </span>
          </div>
        )}


        {activePinFilter ===
          'news' && (
          <div className="news-history-control">
            <button
              type="button"
              onClick={() =>
                setNewsRangeFilter(
                  'curated'
                )
              }
              style={{
                border:
                  '1px solid rgba(0,0,0,0.14)',

                padding:
                  '4px 7px',

                background:
                  newsRangeFilter ===
                  'curated'
                    ? '#111'
                    : '#fff',

                color:
                  newsRangeFilter ===
                  'curated'
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
              CURATED
            </button>


            <div className="news-history-slider-shell">
              <div className="news-history-slider-labels">
                <span>
                  24 HRS
                </span>

                <span>
                  {newsRangeFilter !==
                    'curated' &&
                  newsRangeFilter !==
                    '24' &&
                  newsRangeFilter !==
                    'all'
                    ? getNewsHistoryLabel(
                        newsRangeFilter
                      )
                    : ''}
                </span>

                <span>
                  ALL
                </span>
              </div>

              <input
                className="news-history-slider"
                type="range"
                min="0"
                max={
                  String(
                    NEWS_HISTORY_STEPS.length -
                    1
                  )
                }
                step="1"
                value={
                  getNewsHistoryStepIndex(
                    newsRangeFilter ===
                      'curated'
                      ? '24'
                      : newsRangeFilter
                  )
                }
                onChange={
                  (
                    event
                  ) => {
                    const option =
                      NEWS_HISTORY_STEPS[
                        Number(
                          event.target.value
                        )
                      ]

                    setNewsRangeFilter(
                      option?.value ||
                      '24'
                    )
                  }
                }
                aria-label="News history range"
                title={
                  newsRangeFilter ===
                    'curated'
                    ? 'CURATED'
                    : getNewsHistoryLabel(
                        newsRangeFilter
                      )
                }
              />
            </div>
          </div>
        )}


        {activePinFilter ===
          'new' && (
          <div className="content-subfilters">
            <button
              type="button"
              className={
                newSubtypeFilter ===
                  'businesses'
                  ? 'content-subfilter content-subfilter-active'
                  : 'content-subfilter'
              }
              onClick={() => {
                setNewSubtypeFilter(
                  'businesses'
                )
                setNewBusinessRangeFilter(
                  '180'
                )
              }}
            >
              NEW BUSINESSES
            </button>

            <button
              type="button"
              className={
                newSubtypeFilter === 'top-eats'
                  ? 'content-subfilter content-subfilter-active'
                  : 'content-subfilter'
              }
              onClick={() => setNewSubtypeFilter('top-eats')}
            >
              TOP EATS
            </button>

            <button
              type="button"
              className={
                newSubtypeFilter ===
                  'community'
                  ? 'content-subfilter content-subfilter-active'
                  : 'content-subfilter'
              }
              onClick={() =>
                setNewSubtypeFilter(
                  'community'
                )
              }
            >
              COMMUNITY
            </button>

            <button
              type="button"
              className={
                newSubtypeFilter ===
                  'sports-rec'
                  ? 'content-subfilter content-subfilter-active'
                  : 'content-subfilter'
              }
              onClick={() =>
                setNewSubtypeFilter(
                  'sports-rec'
                )
              }
            >
              SPORTS + REC
            </button>

            {newSubtypeFilter ===
              'businesses' && (
              <div className="news-history-slider-shell">
                <div className="news-history-slider-labels">
                  <span>1 MONTH</span>
                  <span>
                    {Number(
                      newBusinessRangeFilter
                    ) / 30} MONTHS
                  </span>
                  <span>6 MONTHS</span>
                </div>

                <input
                  className="news-history-slider"
                  type="range"
                  min="1"
                  max="6"
                  step="1"
                  value={
                    String(
                      Number(
                        newBusinessRangeFilter
                      ) / 30
                    )
                  }
                  onChange={(event) =>
                    setNewBusinessRangeFilter(
                      String(
                        Number(
                          event.target.value
                        ) * 30
                      )
                    )
                  }
                  aria-label="New business age range"
                />
              </div>
            )}
          </div>
        )}

      </div>


      {aboutOpen && (
        <>
          <button
            type="button"
            className="about-backdrop"
            aria-label="Close How-To"
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
            aria-label="How to use Toronto Geographic"
          >
            <div className="about-panel-header">
              <div>
                <div className="about-panel-kicker">
                  TORONTO GEOGRAPHIC
                </div>

                <div className="about-panel-title">
                  HOW TO USE THIS TOOL
                </div>

                <div
                  className="about-panel-loading-status"
                  aria-hidden="true"
                >
                  LOADING MAP… &nbsp; POPULATING MAP… &nbsp; INITIALIZING TTC BUSES…
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
                aria-label="Close How-To"
              >
                ×
              </button>
            </div>

            <section className="about-section">
              <h2>
                TIME MACHINE
              </h2>

              <p>
                Turn on your gps and walk through time. Use the controls at the
                bottom of the screen to see how your neighbourhood and our city
                has changed over the years. Click on historic markers and see
                what that place looked like back when that event happened or
                building existed.
              </p>
            </section>

            <section className="about-section">
              <h2>
                NEWS
              </h2>

              <p>
                Click news and see transit, police and fire stories. If a map pin
                is pulsating, it means that it is active or was recently
                reported. Zoom in further or use the scroll on the top to see
                police and fire calls from the past. Missing people are updated
                daily and the ttc is live.
              </p>
            </section>

            <section className="about-section">
              <h2>
                COMMUNITY
              </h2>

              <p>
                See libraries, community centres, farmers' markets, cinemas,
                learning programs and other community places and programs across
                the city.
              </p>
            </section>

            <section className="about-section">
              <h2>
                SPORTS + REC
              </h2>

              <p>
                See rinks, pools, skateparks, courts, bike parks and other sports
                and recreation facilities and programs across the city.
              </p>
            </section>

            <section className="about-section">
              <h2>
                NEW BUSINESS
              </h2>

              <p>
                Check out new businesses. Be the first to tell your friends
                about the new cafe up the street or that new dumpling spot
                downtown.
              </p>
            </section>

            <div className="howto-actions">
              <button
                type="button"
                className="howto-primary"
                disabled={
                  timeMachineStarting
                }
                onClick={
                  startTimeMachine
                }
              >
                {timeMachineStarting
                  ? 'TURNING ON GPS…'
                  : 'TURN ON TIME MACHINE'}
              </button>

              <button
                type="button"
                className="howto-secondary"
                onClick={() =>
                  setAboutOpen(
                    false
                  )
                }
              >
                BROWSE THE MAP MYSELF
              </button>
            </div>

            {timeMachineError && (
              <div
                className="howto-error"
                role="status"
              >
                {timeMachineError}
              </div>
            )}

            <div className="howto-sponsor">
              SPONSORED BY{' '}
              {sponsorUrl
                ? (
                    <a
                      href={
                        sponsorUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {sponsorName.toUpperCase()}
                    </a>
                  )
                : sponsorName.toUpperCase()}
            </div>

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
            selectHistoricTimeMachineLayer
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