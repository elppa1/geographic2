import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  Marker,
  Popup,
} from 'maplibre-gl'

import {
  CITIES,
} from '../cities/index.js'

import {
  getHistoricItems,
  getNewsItems,
  getNewItems,
} from '../admin/adminStore.js'


const PUBLISHED_NEWS_ENDPOINT =
  '/api/geographic/toronto/news/published'


const PUBLISHED_NEWS_REFRESH_MS =
  15 * 1000


// ============================================================
// NEW CATEGORIES
// ============================================================

const BUSINESS_CATEGORIES = [
  'store',
  'restaurant',
]


const DEVELOPMENT_CATEGORIES = [
  'development',
  'construction',
  'housing',
  'transit',
  'public-space',
]


// ============================================================
// NEW LIFECYCLE
// ============================================================
//
// Manual admin override always wins:
//
// active === false
//   -> hidden immediately
//
// lifecycleOverride === 'keep-live'
//   -> stays visible past automatic expiry
//
// lifecycleOverride === 'expired'
//   -> hidden immediately
//
// lifecycleOverride === 'auto' / missing
//   -> normal shelf-life rules
//
// ============================================================

const NEW_LIFECYCLE_DAYS = {
  business: {
    proposed:
      90,

    approved:
      120,

    construction:
      180,

    'opening-soon':
      90,

    open:
      30,

    cancelled:
      14,
  },

  development: {
    proposed:
      180,

    approved:
      365,

    construction:
      365,

    'opening-soon':
      90,

    open:
      60,

    cancelled:
      30,
  },

  other: {
    proposed:
      90,

    approved:
      180,

    construction:
      180,

    'opening-soon':
      90,

    open:
      30,

    cancelled:
      14,
  },
}


// ============================================================
// CITY
// ============================================================

function belongsToCity(
  record,
  cityKey
) {
  const recordCity =
    record.city ||
    'toronto'

  return (
    recordCity ===
    cityKey
  )
}


// ============================================================
// NEW SUBTYPE
// ============================================================

function newPinMatchesSubtype(
  pin,
  subtype
) {
  if (
    !subtype ||
    subtype ===
      'all'
  ) {
    return true
  }

  const category =
    String(
      pin.category ||
      ''
    )
      .toLowerCase()

  if (
    subtype ===
    'businesses'
  ) {
    return BUSINESS_CATEGORIES.includes(
      category
    )
  }

  if (
    subtype ===
    'developments'
  ) {
    return DEVELOPMENT_CATEGORIES.includes(
      category
    )
  }

  return true
}


// ============================================================
// NEW LIFECYCLE GROUP
// ============================================================

function getNewLifecycleGroup(
  pin
) {
  const category =
    String(
      pin.category ||
      ''
    )
      .toLowerCase()

  if (
    BUSINESS_CATEGORIES.includes(
      category
    )
  ) {
    return 'business'
  }

  if (
    DEVELOPMENT_CATEGORIES.includes(
      category
    )
  ) {
    return 'development'
  }

  return 'other'
}


// ============================================================
// NEW LIFECYCLE DAYS
// ============================================================

function getNewLifecycleDays(
  pin
) {
  const group =
    getNewLifecycleGroup(
      pin
    )

  const status =
    String(
      pin.status ||
      'proposed'
    )
      .toLowerCase()

  return (
    NEW_LIFECYCLE_DAYS[
      group
    ]?.[
      status
    ] ??
    NEW_LIFECYCLE_DAYS[
      group
    ]?.proposed ??
    90
  )
}


// ============================================================
// NEW LIFECYCLE START DATE
// ============================================================

function getNewLifecycleDate(
  pin
) {
  const values = [
    pin.lifecycleUpdatedAt,
    pin.statusUpdatedAt,
    pin.announcedAt,
    pin.publishedAt,
    pin.createdAt,
    pin.updatedAt,
  ]

  for (
    const value of values
  ) {
    if (
      !value
    ) {
      continue
    }

    const date =
      new Date(
        value
      )

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date
    }
  }

  return null
}


// ============================================================
// NEW VISIBILITY
// ============================================================

function newPinIsCurrent(
  pin
) {
  if (
    pin.active ===
    false
  ) {
    return false
  }

  const lifecycleOverride =
    String(
      pin.lifecycleOverride ||
      'auto'
    )
      .toLowerCase()

  if (
    lifecycleOverride ===
    'keep-live'
  ) {
    return true
  }

  if (
    lifecycleOverride ===
    'expired'
  ) {
    return false
  }

  if (
    pin.expiresAt
  ) {
    const explicitExpiry =
      new Date(
        `${pin.expiresAt}T23:59:59`
      )

    if (
      !Number.isNaN(
        explicitExpiry.getTime()
      )
    ) {
      return (
        Date.now() <=
        explicitExpiry.getTime()
      )
    }
  }

  const lifecycleDate =
    getNewLifecycleDate(
      pin
    )

  if (
    !lifecycleDate
  ) {
    return true
  }

  const lifecycleDays =
    getNewLifecycleDays(
      pin
    )

  const expiryTimestamp =
    lifecycleDate.getTime() +
    (
      lifecycleDays *
      24 *
      60 *
      60 *
      1000
    )

  return (
    Date.now() <=
    expiryTimestamp
  )
}


// ============================================================
// HISTORICAL LAYERS
// ============================================================

function getHistoricalLayers(
  city
) {
  if (
    !city
  ) {
    return []
  }

  const maps =
    Object.entries(
      city.maps ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([year]) => ({
          year:
            Number(
              year
            ),

          layerType:
            'map',
        })
      )

  const aerials =
    Object.entries(
      city.aerials ||
      {}
    )
      .filter(
        ([
          ,
          item,
        ]) =>
          Boolean(
            item?.url
          )
      )
      .map(
        ([year]) => ({
          year:
            Number(
              year
            ),

          layerType:
            'aerial',
        })
      )

  return [
    ...maps,
    ...aerials,
  ]
    .filter(
      (layer) =>
        Number.isFinite(
          layer.year
        )
    )
}


// ============================================================
// LANDING LAYER
// ============================================================

function isLandingLayer({
  city,
  selectedLayer,
}) {
  if (
    !city ||
    !selectedLayer
  ) {
    return true
  }

  return (
    Number(
      selectedLayer.year
    ) ===
    Number(
      city.defaultYear
    )
  )
}


// ============================================================
// EVENT LAYER
// ============================================================

function getClosestEventLayer({
  city,
  year,
}) {
  const numericYear =
    Number(
      year
    )

  if (
    !Number.isFinite(
      numericYear
    )
  ) {
    return null
  }

  const layers =
    getHistoricalLayers(
      city
    )

  if (
    layers.length ===
    0
  ) {
    return null
  }

  const preferredType =
    city.defaultMode ||
    'aerial'

  return layers.reduce(
    (
      best,
      layer
    ) => {
      if (
        !best
      ) {
        return layer
      }

      const difference =
        Math.abs(
          layer.year -
          numericYear
        )

      const bestDifference =
        Math.abs(
          best.year -
          numericYear
        )

      if (
        difference <
        bestDifference
      ) {
        return layer
      }

      if (
        difference >
        bestDifference
      ) {
        return best
      }

      if (
        layer.layerType ===
          preferredType &&
        best.layerType !==
          preferredType
      ) {
        return layer
      }

      if (
        layer.year >
        best.year
      ) {
        return layer
      }

      return best
    },
    null
  )
}


// ============================================================
// HISTORIC VISIBILITY
// ============================================================

function historicPinIsVisible({
  pin,
  city,
  selectedLayer,
}) {
  if (
    !selectedLayer
  ) {
    return true
  }

  const selectedYear =
    Number(
      selectedLayer.year
    )

  const selectedType =
    selectedLayer.layerType

  if (
    !Number.isFinite(
      selectedYear
    )
  ) {
    return true
  }

  if (
    pin.layerPlacementMode ===
    'manual'
  ) {
    return (
      Number(
        pin.layerOverrideYear
      ) ===
        selectedYear &&
      pin.layerOverrideType ===
        selectedType
    )
  }

  const timeMode =
    pin.timeMode ||
    'event'

  if (
    timeMode ===
    'range'
  ) {
    const start =
      Number(
        pin.startYear ||
        pin.year
      )

    const end =
      Number(
        pin.endYear
      )

    if (
      !Number.isFinite(
        start
      ) ||
      !Number.isFinite(
        end
      )
    ) {
      return false
    }

    return (
      selectedYear >=
        start &&
      selectedYear <=
        end
    )
  }

  if (
    timeMode ===
    'present'
  ) {
    const start =
      Number(
        pin.startYear ||
        pin.year
      )

    if (
      !Number.isFinite(
        start
      )
    ) {
      return false
    }

    return (
      selectedYear >=
      start
    )
  }

  const eventLayer =
    getClosestEventLayer({
      city,

      year:
        pin.year ||
        pin.startYear,
    })

  if (
    !eventLayer
  ) {
    return false
  }

  return (
    eventLayer.year ===
      selectedYear &&
    eventLayer.layerType ===
      selectedType
  )
}


// ============================================================
// CURRENT CONTENT
// ============================================================

function currentPinIsVisible() {
  return true
}


// ============================================================
// LABELS
// ============================================================

function getHistoricDateLabel(
  pin
) {
  const timeMode =
    pin.timeMode ||
    'event'

  if (
    timeMode ===
    'range'
  ) {
    return (
      `${pin.startYear || pin.year || '?'}` +
      '–' +
      `${pin.endYear || '?'}`
    )
  }

  if (
    timeMode ===
    'present'
  ) {
    return (
      `${pin.startYear || pin.year || '?'}` +
      '–PRESENT'
    )
  }

  return String(
    pin.year ||
    pin.startYear ||
    ''
  )
}


function formatNewsDate(
  value
) {
  if (
    !value
  ) {
    return ''
  }

  const text =
    String(
      value
    )
      .trim()

  const date =
    text.includes('T')
      ? new Date(text)
      : new Date(
          `${text}T12:00:00`
        )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text
  }

  return date.toLocaleDateString(
    'en-CA',
    {
      year:
        'numeric',

      month:
        'short',

      day:
        'numeric',
    }
  )
}


function formatStatus(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /-/g,
      ' '
    )
    .toUpperCase()
}


// ============================================================
// URL
// ============================================================

function normalizeUrl(
  value
) {
  const clean =
    String(
      value ||
      ''
    )
      .trim()

  if (
    !clean
  ) {
    return ''
  }

  const markdownMatch =
    clean.match(
      /^\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)$/
    )

  if (
    markdownMatch
  ) {
    return (
      markdownMatch[2] ||
      markdownMatch[1]
    )
  }

  if (
    clean.startsWith(
      'http://'
    ) ||
    clean.startsWith(
      'https://'
    )
  ) {
    return clean
  }

  return (
    `https://${clean}`
  )
}


// ============================================================
// TEXT
// ============================================================

function appendText({
  parent,
  className,
  text,
}) {
  if (
    !text
  ) {
    return
  }

  const element =
    document.createElement(
      'div'
    )

  element.className =
    className

  element.textContent =
    text

  parent.appendChild(
    element
  )
}


// ============================================================
// SOURCE / WEBSITE
// ============================================================

function appendSource({
  parent,
  pin,
}) {
  const sourceName =
    String(
      pin.source ||
      ''
    )
      .trim()

  const sourceUrl =
    normalizeUrl(
      pin.sourceUrl
    )

  if (
    !sourceName &&
    !sourceUrl
  ) {
    return
  }

  const sourceShell =
    document.createElement(
      'div'
    )

  sourceShell.className =
    'geographic-pin-source'

  if (
    sourceUrl
  ) {
    const link =
      document.createElement(
        'a'
      )

    link.href =
      sourceUrl

    link.target =
      '_blank'

    link.rel =
      'noopener noreferrer'

    link.className =
      'geographic-pin-source-link'

    link.textContent =
      sourceName
        ? `SOURCE · ${sourceName} ↗`
        : 'MORE INFORMATION ↗'

    link.addEventListener(
      'click',
      (
        event
      ) => {
        event.stopPropagation()
      }
    )

    sourceShell.appendChild(
      link
    )
  } else {
    sourceShell.textContent =
      `SOURCE · ${sourceName}`
  }

  parent.appendChild(
    sourceShell
  )
}


// ============================================================
// ROUTE ACTIONS
// ============================================================

function appendRouteActions({
  popupContent,
  pin,
  longitude,
  latitude,
  onDirections,
  onLongWay,
}) {
  const actions =
    document.createElement(
      'div'
    )

  actions.className =
    'geographic-route-actions'

  const directionsButton =
    document.createElement(
      'button'
    )

  directionsButton.type =
    'button'

  directionsButton.className =
    'geographic-route-action'

  directionsButton.textContent =
    'DIRECTIONS'

  directionsButton.addEventListener(
    'click',
    () => {
      onDirections?.({
        id:
          pin.id,

        name:
          pin.title,

        longitude,

        latitude,

        type:
          'geographic',
      })
    }
  )

  const longWayButton =
    document.createElement(
      'button'
    )

  longWayButton.type =
    'button'

  longWayButton.className =
    (
      'geographic-route-action ' +
      'geographic-route-action-long'
    )

  longWayButton.textContent =
    'TAKE THE LONG WAY'

  longWayButton.addEventListener(
    'click',
    () => {
      onLongWay?.({
        id:
          pin.id,

        name:
          pin.title,

        longitude,

        latitude,

        type:
          'geographic',
      })
    }
  )

  actions.appendChild(
    directionsButton
  )

  actions.appendChild(
    longWayButton
  )

  popupContent.appendChild(
    actions
  )
}


// ============================================================
// NEWS ICON DETECTION
// ============================================================

function normalizeCompareText(
  value
) {
  return String(
    value ||
    ''
  )
    .toLowerCase()
    .trim()
}


function isTorontoPolicePin(
  pin
) {
  const source =
    normalizeCompareText(
      pin.source
    )

  const attribution =
    normalizeCompareText(
      pin.attribution
    )

  const sourceUrl =
    normalizeCompareText(
      pin.sourceUrl
    )

  return (
    source.includes(
      'toronto police'
    ) ||
    attribution.includes(
      'toronto police'
    ) ||
    sourceUrl.includes(
      'tps.ca'
    ) ||
    sourceUrl.includes(
      'lists.tps.ca'
    )
  )
}


function isTorontoFirePin(
  pin
) {
  const source =
    normalizeCompareText(
      pin.source
    )

  const attribution =
    normalizeCompareText(
      pin.attribution
    )

  const sourceUrl =
    normalizeCompareText(
      pin.sourceUrl
    )

  const category =
    normalizeCompareText(
      pin.category
    )

  return (
    source.includes(
      'toronto fire'
    ) ||
    source.includes(
      'fire services'
    ) ||
    attribution.includes(
      'toronto fire'
    ) ||
    sourceUrl.includes(
      'toronto.ca'
    ) &&
    (
      sourceUrl.includes(
        'fire'
      ) ||
      sourceUrl.includes(
        'active-incidents'
      )
    ) ||
    category ===
      'fire'
  )
}


function isTtcPin(
  pin
) {
  const source =
    normalizeCompareText(
      pin.source
    )

  const attribution =
    normalizeCompareText(
      pin.attribution
    )

  const sourceUrl =
    normalizeCompareText(
      pin.sourceUrl
    )

  const category =
    normalizeCompareText(
      pin.category
    )

  return (
    source ===
      'ttc' ||
    source.includes(
      'toronto transit commission'
    ) ||
    source.includes(
      'ttc service alerts'
    ) ||
    attribution.includes(
      'toronto transit commission'
    ) ||
    sourceUrl.includes(
      'ttc.ca'
    ) ||
    (
      category ===
        'transit' &&
      (
        source.includes(
          'ttc'
        ) ||
        sourceUrl.includes(
          'ttc'
        )
      )
    )
  )
}


function getNewsEmoji(
  pin
) {
  if (
    isTorontoPolicePin(
      pin
    )
  ) {
    return '🚔'
  }

  if (
    isTorontoFirePin(
      pin
    )
  ) {
    return '🚒'
  }

  if (
    isTtcPin(pin)
  ) {
    return '🚌'
  }

  return ''
}


function getNewsEmojiLabel(
  pin
) {
  if (
    isTorontoPolicePin(
      pin
    )
  ) {
    return 'Police'
  }

  if (
    isTorontoFirePin(
      pin
    )
  ) {
    return 'Fire'
  }

  if (
    isTtcPin(pin)
  ) {
    return 'TTC'
  }

  return 'News'
}


function appendEmojiMarkerIcon(
  element,
  emoji
) {
  element.textContent =
    emoji

  element.style.fontSize =
    '24px'

  element.style.lineHeight =
    '1'

  element.style.display =
    'flex'

  element.style.alignItems =
    'center'

  element.style.justifyContent =
    'center'
}


// ============================================================
// CREATE MARKER
// ============================================================

function createMarker({
  map,
  pin,
  pinType,
  onDirections,
  onLongWay,
}) {
  const longitude =
    Number(
      pin.longitude
    )

  const latitude =
    Number(
      pin.latitude
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

  const element =
    document.createElement(
      'button'
    )

  element.type =
    'button'

  const newsEmoji =
    pinType ===
    'news'
      ? getNewsEmoji(
          pin
        )
      : ''

  if (
    newsEmoji
  ) {
    const iconLabel =
      getNewsEmojiLabel(
        pin
      )

    element.className =
      'geographic-pin-emoji-marker'

    element.style.width =
      '32px'

    element.style.height =
      '32px'

    element.style.padding =
      '0'

    element.style.margin =
      '0'

    element.style.border =
      'none'

    element.style.borderRadius =
      '0'

    element.style.background =
      'transparent'

    element.style.boxShadow =
      'none'

    element.style.cursor =
      'pointer'

    element.style.display =
      'flex'

    element.style.alignItems =
      'center'

    element.style.justifyContent =
      'center'

    element.style.appearance =
      'none'

    element.style.WebkitAppearance =
      'none'

    element.setAttribute(
      'aria-label',
      pin.title
        ? `${iconLabel} · ${pin.title}`
        : `${iconLabel} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newsEmoji
    )
  } else {
    element.className =
      (
        'geographic-pin ' +
        `geographic-pin-${pinType}`
      )

    element.setAttribute(
      'aria-label',
      pin.title ||
      'Geographic marker'
    )
  }

  const popupContent =
    document.createElement(
      'div'
    )

  popupContent.className =
    (
      'geographic-pin-card ' +
      `geographic-pin-card-${pinType}`
    )

  appendText({
    parent:
      popupContent,

    className:
      'geographic-pin-type',

    text:
      pinType.toUpperCase(),
  })

  if (
    pinType ===
    'historic'
  ) {
    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-year',

      text:
        getHistoricDateLabel(
          pin
        ),
    })
  }

  if (
    pinType ===
    'news'
  ) {
    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-year',

      text:
        formatNewsDate(
          pin.publishedAt
        ),
    })
  }

  if (
    pinType ===
    'new'
  ) {
    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-year',

      text:
        formatStatus(
          pin.status
        ),
    })
  }

  appendText({
    parent:
      popupContent,

    className:
      'geographic-pin-title',

    text:
      pin.title,
  })

  appendText({
    parent:
      popupContent,

    className:
      'geographic-pin-location',

    text:
      (
        pin.intersection ||
        pin.location
      ),
  })

  appendText({
    parent:
      popupContent,

    className:
      'geographic-pin-description',

    text:
      pin.description,
  })

  if (
    pin.category
  ) {
    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-category',

      text:
        String(
          pin.category
        )
          .replace(
            /-/g,
            ' '
          )
          .toUpperCase(),
    })
  }

  appendSource({
    parent:
      popupContent,

    pin,
  })

  appendRouteActions({
    popupContent,
    pin,
    longitude,
    latitude,
    onDirections,
    onLongWay,
  })

  const popup =
    new Popup({
      closeButton:
        true,

      closeOnClick:
        true,

      offset:
        14,

      maxWidth:
        '280px',
    })
      .setDOMContent(
        popupContent
      )

  const marker =
    new Marker({
      element,

      anchor:
        'center',
    })
      .setLngLat([
        longitude,
        latitude,
      ])
      .setPopup(
        popup
      )
      .addTo(
        map
      )

  return marker
}


// ============================================================
// NEWS MERGE
// ============================================================
//
// Keep the existing browser-published NEWS as the base so no
// existing pins disappear during the Railway migration.
//
// Railway records overwrite matching browser records and can
// add new server-only records. Once Railway contains the full
// historical live set, the browser fallback can be removed.
//
function getNewsIdentity(
  pin
) {
  const externalId =
    String(
      pin?.externalId ||
      ''
    )
      .trim()


  if (
    externalId
  ) {
    return (
      'external:' +
      externalId
    )
  }


  const id =
    String(
      pin?.id ||
      ''
    )
      .trim()


  if (
    id
  ) {
    return (
      'id:' +
      id
    )
  }


  return ''
}


function mergeNewsRecords(
  localRecords,
  serverRecords
) {
  const merged =
    new Map()


  for (
    const pin
    of (
      Array.isArray(
        localRecords
      )
        ? localRecords
        : []
    )
  ) {
    const key =
      getNewsIdentity(
        pin
      )


    if (
      key
    ) {
      merged.set(
        key,
        pin
      )
    }
  }


  for (
    const pin
    of (
      Array.isArray(
        serverRecords
      )
        ? serverRecords
        : []
    )
  ) {
    const key =
      getNewsIdentity(
        pin
      )


    if (
      !key
    ) {
      continue
    }


    const existing =
      merged.get(
        key
      )


    merged.set(
      key,
      existing
        ? {
            ...existing,
            ...pin,
          }
        : pin
    )
  }


  return Array.from(
    merged.values()
  )
}


// ============================================================
// COMPONENT
// ============================================================

function MapPins({
  map,
  cityKey,
  selectedLayer,
  selectedPinId,
  activePinFilter,
  newSubtypeFilter,
  onDirections,
  onLongWay,
}) {
  const markersRef =
    useRef([])

  const markerByIdRef =
    useRef(
      new Map()
    )

  const [
    contentRevision,
    setContentRevision,
  ] =
    useState(
      0
    )


  const [
    serverNewsItems,
    setServerNewsItems,
  ] =
    useState(
      []
    )


  useEffect(
    () => {
      if (
        cityKey !==
          'toronto'
      ) {
        setServerNewsItems(
          []
        )


        return
      }


      let cancelled =
        false


      async function loadPublishedNews() {
        try {
          const response =
            await fetch(
              PUBLISHED_NEWS_ENDPOINT,
              {
                headers: {
                  Accept:
                    'application/json',
                },

                cache:
                  'no-store',
              }
            )


          if (
            !response.ok
          ) {
            throw new Error(
              'Published NEWS request failed with HTTP ' +
              response.status
            )
          }


          const payload =
            await response.json()


          if (
            cancelled
          ) {
            return
          }


          setServerNewsItems(
            Array.isArray(
              payload?.records
            )
              ? payload.records
              : []
          )
        }
        catch (
          error
        ) {
          if (
            cancelled
          ) {
            return
          }


          console.warn(
            'PUBLIC MAP · RAILWAY NEWS LOAD FAILED:',
            error
          )
        }
      }


      loadPublishedNews()


      const interval =
        window.setInterval(
          loadPublishedNews,
          PUBLISHED_NEWS_REFRESH_MS
        )


      return () => {
        cancelled =
          true


        window.clearInterval(
          interval
        )
      }
    },
    [
      cityKey,
    ]
  )


  useEffect(
    () => {
      const handleStorageChange =
        () => {
          setContentRevision(
            (
              current
            ) =>
              current + 1
          )
        }

      window.addEventListener(
        'storage',
        handleStorageChange
      )

      return () => {
        window.removeEventListener(
          'storage',
          handleStorageChange
        )
      }
    },
    []
  )

  useEffect(() => {
    if (
      !map ||
      !cityKey
    ) {
      return
    }

    markersRef.current.forEach(
      (marker) => {
        marker.remove()
      }
    )

    markersRef.current =
      []

    markerByIdRef.current =
      new Map()

    const city =
      CITIES[
        cityKey
      ]

    if (
      !city ||
      !activePinFilter
    ) {
      return
    }

    let visiblePins =
      []

    if (
      activePinFilter ===
      'historic'
    ) {
      const landingLayer =
        isLandingLayer({
          city,
          selectedLayer,
        })

      visiblePins =
        getHistoricItems()
          .filter(
            (pin) =>
              belongsToCity(
                pin,
                cityKey
              ) &&
              pin.active !==
                false
          )
          .filter(
            (pin) => {
              if (
                landingLayer
              ) {
                return true
              }

              return historicPinIsVisible({
                pin,
                city,
                selectedLayer,
              })
            }
          )
          .map(
            (pin) => ({
              pin,

              pinType:
                'historic',
            })
          )
    }

    if (
      activePinFilter ===
        'news' &&
      currentPinIsVisible({
        city,
        selectedLayer,
      })
    ) {
      const mergedNewsItems =
        cityKey ===
          'toronto'
          ? mergeNewsRecords(
              getNewsItems(),
              serverNewsItems
            )
          : getNewsItems()


      visiblePins =
        mergedNewsItems
          .filter(
            (pin) =>
              belongsToCity(
                pin,
                cityKey
              ) &&
              pin.active !==
                false
          )
          .map(
            (pin) => ({
              pin,

              pinType:
                'news',
            })
          )
    }

    if (
      activePinFilter ===
        'new' &&
      currentPinIsVisible({
        city,
        selectedLayer,
      })
    ) {
      visiblePins =
        getNewItems()
          .filter(
            (pin) =>
              belongsToCity(
                pin,
                cityKey
              )
          )
          .filter(
            (pin) =>
              newPinIsCurrent(
                pin
              )
          )
          .filter(
            (pin) =>
              newPinMatchesSubtype(
                pin,
                newSubtypeFilter
              )
          )
          .map(
            (pin) => ({
              pin,

              pinType:
                'new',
            })
          )
    }

    visiblePins.forEach(
      ({
        pin,
        pinType,
      }) => {
        const marker =
          createMarker({
            map,
            pin,
            pinType,
            onDirections,
            onLongWay,
          })

        if (
          !marker
        ) {
          return
        }

        markersRef.current.push(
          marker
        )

        markerByIdRef.current.set(
          pin.id,
          marker
        )
      }
    )

    return () => {
      markersRef.current.forEach(
        (marker) => {
          marker.remove()
        }
      )

      markersRef.current =
        []

      markerByIdRef.current =
        new Map()
    }
  }, [
    map,
    cityKey,
    selectedLayer?.year,
    selectedLayer?.layerType,
    activePinFilter,
    newSubtypeFilter,
    contentRevision,
    serverNewsItems,
    onDirections,
    onLongWay,
  ])

  useEffect(() => {
    if (
      !map ||
      !selectedPinId
    ) {
      return
    }

    const marker =
      markerByIdRef.current.get(
        selectedPinId
      )

    if (
      !marker
    ) {
      return
    }

    const popup =
      marker.getPopup()

    if (
      popup &&
      !popup.isOpen()
    ) {
      marker.togglePopup()
    }
  }, [
    map,
    selectedPinId,
    activePinFilter,
    newSubtypeFilter,
    selectedLayer?.year,
    selectedLayer?.layerType,
  ])

  return null
}


export default MapPins