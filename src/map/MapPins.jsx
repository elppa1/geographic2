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
  GEOGRAPHIC_STORE_CHANGE_EVENT,
  getHistoricItems,
  getNewsItems,
  getNewItems,
} from '../admin/adminStore.js'


import {
  newsRecordIsLocallyRetained,
} from '../newsPolicy.js'


const PUBLISHED_NEWS_ENDPOINT =
  '/api/geographic/toronto/news/published?status=all'


const PUBLISHED_NEWS_REFRESH_MS =
  15 * 1000


const LEGACY_PUBLISHED_NEW_ENDPOINT =
  '/api/geographic/toronto/new/published?status=all'


const PUBLISHED_NEW_BUSINESS_ENDPOINT =
  '/api/geographic/toronto/new/business/published?status=all'


const PUBLISHED_NEW_DEVELOPMENT_ENDPOINT =
  '/api/geographic/toronto/new/development/published?status=all'


const PUBLISHED_NEW_REFRESH_MS =
  15 * 1000


// ============================================================
// NEW CATEGORIES
// ============================================================

const BUSINESS_CATEGORIES = [
  'store',
  'restaurant',
  'business',
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
      90,

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

  const explicitType =
    String(
      pin.newType ||
      ''
    )
      .toLowerCase()


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
    return (
      explicitType ===
        'business' ||
      (
        !explicitType &&
        BUSINESS_CATEGORIES.includes(
          category
        )
      )
    )
  }

  if (
    subtype ===
    'developments'
  ) {
    return (
      explicitType ===
        'development' ||
      (
        !explicitType &&
        DEVELOPMENT_CATEGORIES.includes(
          category
        )
      )
    )
  }

  return true
}


// ============================================================
// NEW BUSINESS RANGE
// ============================================================

function parseNewBusinessDateValue(
  value
) {
  if (
    !value
  ) {
    return null
  }


  const text =
    String(
      value
    )
      .trim()


  if (
    !text
  ) {
    return null
  }


  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
      ? new Date(
          `${text}T12:00:00`
        )
      : new Date(
          text
        )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null
  }


  return date
}


function getNewBusinessDate(
  pin
) {
  const values = [
    pin.openedAt,
    pin.openingDate,
    pin.expectedAt,
    pin.sourceFirstSeenAt,
    pin.firstSeenAt,
    pin.announcedAt,
    pin.createdAt,
    pin.publishedAt,
    pin.serverPublishedAt,
    pin.updatedAt,
  ]


  for (
    const value of values
  ) {
    const date =
      parseNewBusinessDateValue(
        value
      )


    if (
      date
    ) {
      return date
    }
  }


  return null
}


function newBusinessMatchesRange(
  pin,
  range
) {
  const days =
    Number(
      range ||
      30
    )

  if (
    !Number.isFinite(
      days
    ) ||
    days <=
      0
  ) {
    return true
  }

  const businessDate =
    getNewBusinessDate(
      pin
    )

  if (
    !businessDate
  ) {
    return true
  }

  const now =
    new Date()

  if (
    businessDate.getTime() >
    now.getTime()
  ) {
    return false
  }

  const cutoff =
    new Date()

  cutoff.setHours(
    0,
    0,
    0,
    0
  )

  cutoff.setDate(
    cutoff.getDate() -
    (
      days -
      1
    )
  )

  return (
    businessDate.getTime() >=
    cutoff.getTime()
  )
}


function formatNewBusinessDate(
  date
) {
  return date
    .toLocaleDateString(
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
    .toUpperCase()
}


function formatBusinessAge({
  date,
  prefix,
  exactAfterDays =
    45,
}) {
  const diffMs =
    Date.now() -
    date.getTime()


  if (
    diffMs <
      0
  ) {
    return (
      `${prefix} ` +
      formatNewBusinessDate(
        date
      )
    )
  }


  const days =
    Math.floor(
      diffMs /
      (
        24 *
        60 *
        60 *
        1000
      )
    )


  if (
    days ===
      0
  ) {
    return `${prefix} TODAY`
  }


  if (
    days ===
      1
  ) {
    return `${prefix} YESTERDAY`
  }


  if (
    days <
      exactAfterDays
  ) {
    return (
      `${prefix} ${days} DAYS AGO`
    )
  }


  return (
    `${prefix} ` +
    formatNewBusinessDate(
      date
    )
  )
}


function getNewBusinessAgeLabel(
  pin
) {
  const status =
    String(
      pin?.status ||
      ''
    )
      .toLowerCase()


  const openingDate =
    parseNewBusinessDateValue(
      pin?.openedAt ||
      pin?.openingDate ||
      (
        status ===
          'open'
          ? pin?.expectedAt
          : ''
      )
    )


  if (
    openingDate
  ) {
    return formatBusinessAge({
      date:
        openingDate,

      prefix:
        'OPENED',
    })
  }


  const firstSeenDate =
    parseNewBusinessDateValue(
      pin?.sourceFirstSeenAt ||
      pin?.firstSeenAt
    )


  if (
    firstSeenDate
  ) {
    return formatBusinessAge({
      date:
        firstSeenDate,

      prefix:
        'FIRST SEEN',

      exactAfterDays:
        45,
    })
  }


  const sourceLabel =
    String(
      pin?.sourceFirstSeenLabel ||
      ''
    )
      .trim()


  if (
    sourceLabel
  ) {
    return (
      'FIRST SEEN ' +
      sourceLabel.toUpperCase()
    )
  }


  return ''
}


// ============================================================
// NEW LIFECYCLE GROUP
// ============================================================

function getNewLifecycleGroup(
  pin
) {
  const explicitType =
    String(
      pin.newType ||
      ''
    )
      .toLowerCase()


  if (
    explicitType ===
      'business' ||
    explicitType ===
      'development'
  ) {
    return explicitType
  }


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
  const category =
    String(
      pin.category ||
      ''
    )
      .toLowerCase()


  const status =
    String(
      pin.status ||
      'proposed'
    )
      .toLowerCase()


  if (
    (
      String(
        pin.newType ||
        ''
      )
        .toLowerCase() ===
        'business' ||
      (
        !pin.newType &&
        BUSINESS_CATEGORIES.includes(
          category
        )
      )
    ) &&
    status ===
      'open'
  ) {
    const openingDate =
      parseNewBusinessDateValue(
        pin.openedAt ||
        pin.openingDate ||
        pin.expectedAt
      )


    if (
      openingDate
    ) {
      return openingDate
    }
  }


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
// IMAGE
// ============================================================

function appendNewsImage({
  parent,
  pin,
}) {
  const imageUrl =
    normalizeUrl(
      pin?.imageUrl
    )


  if (
    !imageUrl
  ) {
    return
  }


  const imageLink =
    document.createElement(
      'a'
    )


  imageLink.href =
    imageUrl

  imageLink.target =
    '_blank'

  imageLink.rel =
    'noopener noreferrer'

  imageLink.addEventListener(
    'click',
    (
      event
    ) => {
      event.stopPropagation()
    }
  )


  const image =
    document.createElement(
      'img'
    )


  image.src =
    imageUrl

  image.alt =
    pin?.title ||
    'News image'

  image.loading =
    'lazy'

  image.style.display =
    'block'

  image.style.width =
    '100%'

  const compactMobileCard =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches


  image.style.maxHeight =
    compactMobileCard
      ? '105px'
      : '220px'

  image.style.objectFit =
    'cover'

  image.style.margin =
    compactMobileCard
      ? '6px 0'
      : '10px 0'

  image.style.borderRadius =
    '4px'


  image.addEventListener(
    'error',
    () => {
      imageLink.style.display =
        'none'
    }
  )


  imageLink.appendChild(
    image
  )


  parent.appendChild(
    imageLink
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
// MOBILE NEWS STORY LINK
// ============================================================

function appendMobileNewsStoryLink({
  parent,
  pin,
}) {
  const href =
    normalizeUrl(
      pin?.sourceUrl
    )


  if (
    !href
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )

  shell.className =
    'geographic-pin-source'


  const link =
    document.createElement(
      'a'
    )

  link.href =
    href

  link.target =
    '_blank'

  link.rel =
    'noopener noreferrer'

  link.className =
    'geographic-pin-source-link'

  link.textContent =
    'STORY ↗'

  link.addEventListener(
    'click',
    (
      event
    ) => {
      event.stopPropagation()
    }
  )


  shell.appendChild(
    link
  )

  parent.appendChild(
    shell
  )
}


// ============================================================
// MOBILE BUSINESS LINK
// ============================================================

function appendMobileBusinessLink({
  parent,
  pin,
}) {
  const href =
    normalizeUrl(
      pin?.businessUrl ||
      pin?.sourceUrl
    )


  if (
    !href
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )

  shell.className =
    'geographic-pin-source'


  const link =
    document.createElement(
      'a'
    )

  link.href =
    href

  link.target =
    '_blank'

  link.rel =
    'noopener noreferrer'

  link.className =
    'geographic-pin-source-link'

  link.textContent =
    'LINK ↗'

  link.addEventListener(
    'click',
    (
      event
    ) => {
      event.stopPropagation()
    }
  )


  shell.appendChild(
    link
  )

  parent.appendChild(
    shell
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


const NEW_BUSINESS_ICONS = {
  restaurant: {
    emoji:
      '🍽️',

    label:
      'Restaurant',
  },

  pizza: {
    emoji:
      '🍕',

    label:
      'Pizza',
  },

  burgers: {
    emoji:
      '🍔',

    label:
      'Burgers',
  },

  sandwiches: {
    emoji:
      '🥪',

    label:
      'Sandwiches / Deli',
  },

  'hot-dogs': {
    emoji:
      '🌭',

    label:
      'Hot Dogs',
  },

  'fried-chicken': {
    emoji:
      '🍗',

    label:
      'Fried Chicken',
  },

  bbq: {
    emoji:
      '🍖',

    label:
      'BBQ / Smokehouse',
  },

  steakhouse: {
    emoji:
      '🥩',

    label:
      'Steakhouse',
  },

  'sushi-japanese': {
    emoji:
      '🍣',

    label:
      'Sushi / Japanese',
  },

  noodles: {
    emoji:
      '🍜',

    label:
      'Noodles / Ramen / Pho',
  },

  dumplings: {
    emoji:
      '🥟',

    label:
      'Dumplings',
  },

  chinese: {
    emoji:
      '🥡',

    label:
      'Chinese / Takeout',
  },

  korean: {
    emoji:
      '🍲',

    label:
      'Korean',
  },

  'thai-southeast-asian': {
    emoji:
      '🌶️',

    label:
      'Thai / Southeast Asian',
  },

  'indian-south-asian': {
    emoji:
      '🍛',

    label:
      'Indian / South Asian',
  },

  'middle-eastern': {
    emoji:
      '🥙',

    label:
      'Middle Eastern / Shawarma',
  },

  mediterranean: {
    emoji:
      '🫒',

    label:
      'Mediterranean',
  },

  caribbean: {
    emoji:
      '🌴',

    label:
      'Caribbean',
  },

  mexican: {
    emoji:
      '🌮',

    label:
      'Mexican / Tacos',
  },

  'italian-pasta': {
    emoji:
      '🍝',

    label:
      'Italian / Pasta',
  },

  'breakfast-brunch': {
    emoji:
      '🍳',

    label:
      'Breakfast / Brunch',
  },

  bakery: {
    emoji:
      '🥐',

    label:
      'Bakery',
  },

  bagels: {
    emoji:
      '🥯',

    label:
      'Bagels',
  },

  cafe: {
    emoji:
      '☕',

    label:
      'Cafe / Coffee',
  },

  'bubble-tea': {
    emoji:
      '🧋',

    label:
      'Bubble Tea',
  },

  'ice-cream': {
    emoji:
      '🍦',

    label:
      'Ice Cream / Gelato',
  },

  dessert: {
    emoji:
      '🍰',

    label:
      'Dessert / Cakes',
  },

  donuts: {
    emoji:
      '🍩',

    label:
      'Donuts',
  },

  seafood: {
    emoji:
      '🦞',

    label:
      'Seafood',
  },

  'salads-healthy': {
    emoji:
      '🥗',

    label:
      'Salads / Healthy',
  },

  'vegan-vegetarian': {
    emoji:
      '🌱',

    label:
      'Vegan / Vegetarian',
  },

  'bar-pub': {
    emoji:
      '🍺',

    label:
      'Bar / Pub',
  },

  'cocktail-bar': {
    emoji:
      '🍸',

    label:
      'Cocktail Bar',
  },

  'wine-bar': {
    emoji:
      '🍷',

    label:
      'Wine Bar',
  },
}


function getNewBusinessIcon(
  pin
) {
  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    !BUSINESS_CATEGORIES.includes(
      category
    )
  ) {
    return null
  }


  const iconKey =
    normalizeCompareText(
      pin?.businessIcon
    )


  if (
    !iconKey
  ) {
    return null
  }


  return (
    NEW_BUSINESS_ICONS[
      iconKey
    ] ||
    null
  )
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
  const compactMobileMarker =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches


  element.style.lineHeight =
    '1'

  element.style.display =
    'flex'

  element.style.alignItems =
    'center'

  element.style.justifyContent =
    'center'


  if (
    !compactMobileMarker
  ) {
    element.textContent =
      emoji

    element.style.fontSize =
      '24px'

    return
  }


  element.textContent =
    ''


  const iconShell =
    document.createElement(
      'span'
    )


  const ringColor =
    emoji ===
      '🚒'
      ? 'rgba(205, 48, 48, 0.68)'
      : emoji ===
          '🚔'
        ? 'rgba(45, 92, 170, 0.68)'
        : emoji ===
            '🚌'
          ? 'rgba(20, 20, 20, 0.50)'
          : 'rgba(20, 20, 20, 0.28)'


  iconShell.textContent =
    emoji

  iconShell.style.width =
    '24px'

  iconShell.style.height =
    '24px'

  iconShell.style.display =
    'grid'

  iconShell.style.placeItems =
    'center'

  iconShell.style.flex =
    '0 0 24px'

  iconShell.style.border =
    `1px solid ${ringColor}`

  iconShell.style.borderRadius =
    '50%'

  iconShell.style.background =
    'rgba(255, 255, 255, 0.94)'

  iconShell.style.boxShadow =
    '0 1px 4px rgba(0, 0, 0, 0.34)'

  iconShell.style.fontSize =
    '16px'

  iconShell.style.lineHeight =
    '1'

  iconShell.style.pointerEvents =
    'none'


  element.appendChild(
    iconShell
  )
}


// ============================================================
// TTC MARKER VISIBILITY
// ============================================================
//
// Active TTC alerts must not merely survive the NEWS density filters;
// their icons also need to remain individually visible when several
// alerts land on the same or nearly the same screen position.
//
// We keep the actual geographic coordinates untouched and use a small
// visual pixel offset only when an active TTC marker would collide with
// another visible NEWS marker. TTC markers are also rendered last so a
// service alert cannot sit underneath a police or fire icon.
//
// ============================================================

const TTC_MARKER_CLEARANCE_PX =
  30


const TTC_MARKER_OFFSET_CANDIDATES = [
  [0, 0],

  [34, 0],
  [-34, 0],
  [0, 34],
  [0, -34],

  [24, 24],
  [-24, 24],
  [24, -24],
  [-24, -24],

  [48, 0],
  [-48, 0],
  [0, 48],
  [0, -48],

  [42, 42],
  [-42, 42],
  [42, -42],
  [-42, -42],

  [66, 0],
  [-66, 0],
  [0, 66],
  [0, -66],

  [60, 34],
  [-60, 34],
  [60, -34],
  [-60, -34],
  [34, 60],
  [-34, 60],
  [34, -60],
  [-34, -60],
]


function activeTtcNewsItem(
  item
) {
  return (
    item?.pinType ===
      'news' &&
    isTtcPin(
      item?.pin
    ) &&
    item?.pin?.active !==
      false
  )
}


function projectedPinPoint({
  map,
  pin,
}) {
  const longitude =
    Number(
      pin?.longitude
    )

  const latitude =
    Number(
      pin?.latitude
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

  return map.project([
    longitude,
    latitude,
  ])
}


function spreadActiveTtcMarkers({
  map,
  items,
}) {
  const occupied =
    []

  const offsets =
    new Map()


  // First reserve the screen positions of every non-TTC NEWS marker.
  // Active TTC markers will move only when they would otherwise cover
  // one of these positions or another TTC alert.
  items
    .filter(
      (item) =>
        !activeTtcNewsItem(
          item
        )
    )
    .forEach(
      (item) => {
        const point =
          projectedPinPoint({
            map,
            pin:
              item.pin,
          })

        if (
          point
        ) {
          occupied.push({
            x:
              point.x,
            y:
              point.y,
          })
        }
      }
    )


  items
    .filter(
      activeTtcNewsItem
    )
    .forEach(
      (item) => {
        const point =
          projectedPinPoint({
            map,
            pin:
              item.pin,
          })

        if (
          !point
        ) {
          offsets.set(
            item,
            [0, 0]
          )

          return
        }

        let chosen =
          TTC_MARKER_OFFSET_CANDIDATES[
            TTC_MARKER_OFFSET_CANDIDATES.length -
            1
          ]

        for (
          const candidate
          of TTC_MARKER_OFFSET_CANDIDATES
        ) {
          const candidateX =
            point.x +
            candidate[0]

          const candidateY =
            point.y +
            candidate[1]

          const collision =
            occupied.some(
              (placed) => {
                const dx =
                  candidateX -
                  placed.x

                const dy =
                  candidateY -
                  placed.y

                return (
                  Math.hypot(
                    dx,
                    dy
                  ) <
                  TTC_MARKER_CLEARANCE_PX
                )
              }
            )

          if (
            !collision
          ) {
            chosen =
              candidate

            break
          }
        }

        offsets.set(
          item,
          chosen
        )

        occupied.push({
          x:
            point.x +
            chosen[0],
          y:
            point.y +
            chosen[1],
        })
      }
    )


  const withOffsets =
    items.map(
      (item) => ({
        ...item,

        markerOffset:
          offsets.get(
            item
          ) ||
          [0, 0],
      })
    )


  // Render TTC last so even a near-collision cannot bury a live service
  // alert underneath another source icon.
  return [
    ...withOffsets.filter(
      (item) =>
        !activeTtcNewsItem(
          item
        )
    ),
    ...withOffsets.filter(
      activeTtcNewsItem
    ),
  ]
}


// ============================================================
// CREATE MARKER
// ============================================================

function createMarker({
  map,
  pin,
  pinType,
  markerOffset =
    [0, 0],
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


  const newBusinessIcon =
    pinType ===
    'new'
      ? getNewBusinessIcon(
          pin
        )
      : null


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

    if (
      isTtcPin(
        pin
      )
    ) {
      element.style.zIndex =
        '20'
    }

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
  }
  else if (
    newBusinessIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-new-business-emoji-marker'

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
        ? `${newBusinessIcon.label} · ${pin.title}`
        : `${newBusinessIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newBusinessIcon.emoji
    )
  }
  else {
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

  const compactMobilePopup =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches


  const popupContent =
    document.createElement(
      'div'
    )

  popupContent.className =
    (
      'geographic-pin-card ' +
      `geographic-pin-card-${pinType}`
    )


  if (
    compactMobilePopup &&
    pinType ===
      'news'
  ) {
    appendNewsImage({
      parent:
        popupContent,

      pin,
    })


    const showMobileNewsDate =
      isTorontoFirePin(
        pin
      ) ||
      isTorontoPolicePin(
        pin
      )


    if (
      showMobileNewsDate
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


    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-title',

      text:
        pin.title,
    })


    appendMobileNewsStoryLink({
      parent:
        popupContent,

      pin,
    })
  }
  else if (
    compactMobilePopup &&
    pinType ===
      'new' &&
    (
      normalizeCompareText(
        pin.newType
      ) ===
        'business' ||
      BUSINESS_CATEGORIES.includes(
        normalizeCompareText(
          pin.category
        )
      )
    )
  ) {
    appendNewsImage({
      parent:
        popupContent,

      pin,
    })


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
        'geographic-pin-category',

      text:
        (
          pin.cuisine ||
          newBusinessIcon?.label ||
          String(
            pin.category ||
            'Business'
          )
            .replace(
              /-/g,
              ' '
            )
        ),
    })


    appendMobileBusinessLink({
      parent:
        popupContent,

      pin,
    })
  }
  else {
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
      const ageLabel =
        BUSINESS_CATEGORIES.includes(
          String(
            pin.category ||
            ''
          )
            .toLowerCase()
        )
          ? getNewBusinessAgeLabel(
              pin
            )
          : ''


      appendText({
        parent:
          popupContent,

        className:
          'geographic-pin-year',

        text:
          [
            formatStatus(
              pin.status
            ),
            ageLabel,
          ]
            .filter(
              Boolean
            )
            .join(
              ' · '
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


    if (
      pinType ===
        'news'
    ) {
      appendNewsImage({
        parent:
          popupContent,

        pin,
      })
    }


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


    if (
      pinType !==
        'news'
    ) {
      appendRouteActions({
        popupContent,
        pin,
        longitude,
        latitude,
        onDirections,
        onLongWay,
      })
    }
  }


  if (
    compactMobilePopup
  ) {
    popupContent.style.minWidth =
      '0'

    popupContent.style.width =
      pinType ===
        'news' ||
      (
        pinType ===
          'new' &&
        (
          normalizeCompareText(
            pin.newType
          ) ===
            'business' ||
          BUSINESS_CATEGORIES.includes(
            normalizeCompareText(
              pin.category
            )
          )
        )
      )
        ? 'min(145px, calc(100vw - 64px))'
        : 'min(165px, calc(100vw - 56px))'

    popupContent.style.maxWidth =
      'calc(100vw - 56px)'

    popupContent.style.maxHeight =
      pinType ===
        'news'
        ? '34vh'
        : '38vh'

    popupContent.style.overflowY =
      'auto'

    popupContent.style.overscrollBehavior =
      'contain'

    popupContent.style.fontSize =
      '0.78em'

    popupContent.style.lineHeight =
      '1.2'

    popupContent.style.display =
      'flow-root'


    const mobileDate =
      popupContent.querySelector(
        '.geographic-pin-year'
      )


    if (
      mobileDate
    ) {
      mobileDate.style.fontSize =
        '7px'

      mobileDate.style.lineHeight =
        '1.15'

      mobileDate.style.marginBottom =
        '3px'
    }


    const mobileTitle =
      popupContent.querySelector(
        '.geographic-pin-title'
      )


    if (
      mobileTitle
    ) {
      mobileTitle.style.fontSize =
        '10px'

      mobileTitle.style.lineHeight =
        '1.18'

      mobileTitle.style.marginBottom =
        '4px'
    }


    const mobileLocation =
      popupContent.querySelector(
        '.geographic-pin-location'
      )


    if (
      mobileLocation
    ) {
      mobileLocation.style.fontSize =
        '8px'

      mobileLocation.style.lineHeight =
        '1.2'

      mobileLocation.style.marginBottom =
        '5px'
    }


    const mobileCategory =
      popupContent.querySelector(
        '.geographic-pin-category'
      )


    if (
      mobileCategory
    ) {
      mobileCategory.style.marginTop =
        '0'

      mobileCategory.style.fontSize =
        '7px'

      mobileCategory.style.lineHeight =
        '1.2'

      mobileCategory.style.letterSpacing =
        '0.05em'

      mobileCategory.style.opacity =
        '0.55'
    }


    const mobileImage =
      popupContent.querySelector(
        'img'
      )


    if (
      mobileImage
    ) {
      const mobileImageLink =
        mobileImage.parentElement


      if (
        mobileImageLink
      ) {
        mobileImageLink.style.display =
          'block'

        mobileImageLink.style.width =
          '42px'

        mobileImageLink.style.height =
          '32px'

        mobileImageLink.style.float =
          'right'

        mobileImageLink.style.margin =
          '0 0 2px 6px'

        mobileImageLink.style.overflow =
          'hidden'

        mobileImageLink.style.borderRadius =
          '2px'
      }


      mobileImage.style.width =
        '42px'

      mobileImage.style.height =
        '32px'

      mobileImage.style.maxHeight =
        '32px'

      mobileImage.style.margin =
        '0'

      mobileImage.style.objectFit =
        'cover'

      mobileImage.style.borderRadius =
        '2px'
    }


    const mobileSource =
      popupContent.querySelector(
        '.geographic-pin-source'
      )


    if (
      mobileSource
    ) {
      mobileSource.style.fontSize =
        '7px'

      mobileSource.style.lineHeight =
        '1.2'
    }
  }


  const popup =
    new Popup({
      closeButton:
        true,

      closeOnClick:
        true,

      offset:
        14,

      maxWidth:
        compactMobilePopup
          ? '178px'
          : '280px',
    })
      .setDOMContent(
        popupContent
      )

  const marker =
    new Marker({
      element,

      anchor:
        'center',

      offset:
        markerOffset,
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



function mergeNewRecords(
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


    const local =
      merged.get(
        key
      )


    if (
      local?.serverSyncPending ===
        true
    ) {
      continue
    }


    merged.set(
      key,
      local
        ? {
            ...local,
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
// NEWS SCALE / PROMINENCE
// ============================================================
//
// NEWS now has two separate concepts:
//
//   CITYWIDE LIFE
//     The existing 2 / 5 / 7-day policy decides when a story leaves
//     the normal citywide live set.
//
//   LOCAL RETENTION
//     A story archived only because its shelf life expired can still
//     reappear when the user looks closer:
//       neighbourhood -> up to 14 days
//       street        -> up to 30 days
//
// Manual unpublishes, suppressions and official resolves stay hidden.
//
// CITY:
//   major stories stay visible
//   regular stories are strongest while fresh
//   routine stories are very fresh only
//   hard cap prevents the whole-city view becoming confetti
//   active TTC service alerts are exempt and always remain visible
//
// NEIGHBOURHOOD:
//   naturally expired local stories can reappear up to 14 days
//
// STREET:
//   naturally expired local stories can reappear up to 30 days
//
// ============================================================

const NEWS_CITY_MAX_ZOOM =
  11.75

const NEWS_NEIGHBOURHOOD_MAX_ZOOM =
  14.25

const NEWS_CITY_MAX_PINS =
  40

const NEWS_CITY_REGULAR_MAX_HOURS =
  48

const NEWS_CITY_ROUTINE_MAX_HOURS =
  12

const NEWS_NEIGHBOURHOOD_ROUTINE_MAX_HOURS =
  14 * 24


function getNewsRecordTimestamp(
  pin
) {
  const fire =
    isTorontoFirePin(
      pin
    )

  const ttc =
    isTtcPin(
      pin
    )

  const values =
    fire
      ? [
          pin.firstSeenAt,
          pin.receivedAt,
          pin.queuedAt,
          pin.publishedAt,
          pin.createdAt,
          pin.updatedAt,
        ]
      : ttc
        ? [
            pin.ttcSourceTime,
            pin.publishedAt,
            pin.firstSeenAt,
            pin.receivedAt,
            pin.createdAt,
            pin.updatedAt,
          ]
        : [
            pin.publishedAt,
            pin.firstSeenAt,
            pin.receivedAt,
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


function getNewsAgeHours(
  pin
) {
  const date =
    getNewsRecordTimestamp(
      pin
    )

  if (
    !date
  ) {
    return null
  }

  return Math.max(
    0,
    (
      Date.now() -
      date.getTime()
    ) /
    (
      60 *
      60 *
      1000
    )
  )
}


function getNewsPriority(
  pin
) {
  const category =
    normalizeCompareText(
      pin?.category
    )

  const effect =
    normalizeCompareText(
      pin?.ttcEffect
    )

  const text =
    [
      pin?.title,
      pin?.description,
      pin?.category,
      pin?.incidentType,
      pin?.ttcEffect,
      pin?.ttcCause,
    ]
      .filter(
        Boolean
      )
      .join(
        ' '
      )
      .toLowerCase()

  const alarmLevel =
    Number(
      pin?.alarmLevel ||
      0
    )

  if (
    alarmLevel >=
      2 ||
    [
      'missing',
      'missing-person',
      'shooting',
      'stabbing',
      'homicide',
      'murder',
    ]
      .includes(
        category
      ) ||
    /\bmissing person\b|\bshooting\b|\bstabbing\b|\bhomicide\b|\bmurder\b|\bfatal collision\b|\blife[- ]threatening\b|\bexplosion\b|\bmultiple alarm\b|\bmulti[- ]alarm\b|\bsecond alarm\b|\bthird alarm\b|\bhigh[- ]rise fire\b/.test(
      text
    ) ||
    effect ===
      'NO_SERVICE' ||
    /\bno service\b|\bservice suspended\b|\bline closure\b|\bsubway shutdown\b|\bfull closure\b/.test(
      text
    )
  ) {
    return 'major'
  }

  if (
    isTtcPin(
      pin
    ) &&
    (
      effect ===
        'STOP_MOVED' ||
      effect ===
        'BYPASS'
    )
  ) {
    return 'routine'
  }

  if (
    isTorontoFirePin(
      pin
    ) &&
    (
      /\bvehicle fire\b|\bgas leak\b|\bcarbon monoxide\b/.test(
        text
      )
    )
  ) {
    return 'routine'
  }

  if (
    isTorontoPolicePin(
      pin
    ) &&
    (
      category ===
        'collision' &&
      !/\bfatal\b|\bserious\b|\blife[- ]threatening\b/.test(
        text
      )
    )
  ) {
    return 'routine'
  }

  return 'regular'
}


function newsPriorityRank(
  pin
) {
  const priority =
    getNewsPriority(
      pin
    )

  if (
    priority ===
      'major'
  ) {
    return 3
  }

  if (
    priority ===
      'regular'
  ) {
    return 2
  }

  return 1
}



function newsArchiveIsNaturalExpiry(
  pin
) {
  return (
    pin?.active ===
      false &&
    normalizeCompareText(
      pin?.archiveReason
    ) ===
      'expired-shelf-life'
  )
}


function newsRecordCanAppearAtZoom({
  pin,
  zoom,
}) {
  if (
    pin?.active !==
      false
  ) {
    return true
  }


  if (
    !newsArchiveIsNaturalExpiry(
      pin
    )
  ) {
    return false
  }


  if (
    zoom <
      NEWS_CITY_MAX_ZOOM
  ) {
    return false
  }


  if (
    zoom <
      NEWS_NEIGHBOURHOOD_MAX_ZOOM
  ) {
    return newsRecordIsLocallyRetained(
      pin,
      'neighbourhood'
    )
  }


  return newsRecordIsLocallyRetained(
    pin,
    'street'
  )
}


function newsPinIsVisibleAtZoom({
  pin,
  zoom,
  selectedPinId,
}) {
  if (
    selectedPinId &&
    String(
      pin?.id
    ) ===
      String(
        selectedPinId
      )
  ) {
    return true
  }


  // Active TTC service alerts are live utility information, not
  // ordinary editorial density. They stay visible at every NEWS zoom.
  if (
    isTtcPin(
      pin
    ) &&
    pin?.active !==
      false
  ) {
    return true
  }


  const priority =
    getNewsPriority(
      pin
    )

  const ageHours =
    getNewsAgeHours(
      pin
    )

  if (
    zoom <
      NEWS_CITY_MAX_ZOOM
  ) {
    if (
      priority ===
        'major'
    ) {
      return true
    }

    if (
      ageHours ===
        null
    ) {
      return (
        priority ===
        'regular'
      )
    }

    if (
      priority ===
        'regular'
    ) {
      return (
        ageHours <=
        NEWS_CITY_REGULAR_MAX_HOURS
      )
    }

    return (
      ageHours <=
      NEWS_CITY_ROUTINE_MAX_HOURS
    )
  }

  if (
    zoom <
      NEWS_NEIGHBOURHOOD_MAX_ZOOM
  ) {
    if (
      priority !==
        'routine'
    ) {
      return true
    }

    if (
      ageHours ===
        null
    ) {
      return true
    }

    return (
      ageHours <=
      NEWS_NEIGHBOURHOOD_ROUTINE_MAX_HOURS
    )
  }

  return true
}


function limitCityNewsPins({
  pins,
  zoom,
  selectedPinId,
}) {
  if (
    zoom >=
      NEWS_CITY_MAX_ZOOM ||
    pins.length <=
      NEWS_CITY_MAX_PINS
  ) {
    return pins
  }

  const sorted =
    [
      ...pins,
    ]
      .sort(
        (
          a,
          b
        ) => {
          const priorityDifference =
            newsPriorityRank(
              b
            ) -
            newsPriorityRank(
              a
            )

          if (
            priorityDifference !==
              0
          ) {
            return priorityDifference
          }

          const aTime =
            getNewsRecordTimestamp(
              a
            )?.getTime() ||
            0

          const bTime =
            getNewsRecordTimestamp(
              b
            )?.getTime() ||
            0

          return (
            bTime -
            aTime
          )
        }
      )

  // Active TTC alerts are exempt from the citywide story cap. A user
  // should never have to zoom in just to discover a current service alert.
  const activeTtcPins =
    sorted.filter(
      (pin) =>
        isTtcPin(
          pin
        ) &&
        pin?.active !==
          false
    )


  const nonTtcPins =
    sorted.filter(
      (pin) =>
        !(
          isTtcPin(
            pin
          ) &&
          pin?.active !==
            false
        )
    )


  const remainingSlots =
    Math.max(
      0,
      NEWS_CITY_MAX_PINS -
      activeTtcPins.length
    )


  const limited = [
    ...activeTtcPins,
    ...nonTtcPins.slice(
      0,
      remainingSlots
    ),
  ]


  if (
    selectedPinId
  ) {
    const selected =
      pins.find(
        (pin) =>
          String(
            pin?.id
          ) ===
          String(
            selectedPinId
          )
      )

    if (
      selected &&
      !limited.some(
        (pin) =>
          String(
            pin?.id
          ) ===
          String(
            selectedPinId
          )
      )
    ) {
      limited.push(
        selected
      )
    }
  }

  return limited
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
  newBusinessRangeFilter,
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


  const [
    serverNewItems,
    setServerNewItems,
  ] =
    useState(
      []
    )


  const [
    viewportRevision,
    setViewportRevision,
  ] =
    useState(
      0
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
      if (
        cityKey !==
          'toronto'
      ) {
        setServerNewItems(
          []
        )


        return
      }


      let cancelled =
        false


      async function loadPublishedNewEndpoint(
        endpoint,
        label,
        {
          optional =
            false,
        } = {}
      ) {
        const response =
          await fetch(
            endpoint,
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
          if (
            optional
          ) {
            return []
          }


          throw new Error(
            `${label} request failed with HTTP ` +
            response.status
          )
        }


        const payload =
          await response.json()


        return (
          Array.isArray(
            payload?.records
          )
            ? payload.records
            : []
        )
      }


      async function loadPublishedNew() {
        const results =
          await Promise.allSettled([
            loadPublishedNewEndpoint(
              LEGACY_PUBLISHED_NEW_ENDPOINT,
              'Legacy published NEW',
              {
                optional:
                  true,
              }
            ),

            loadPublishedNewEndpoint(
              PUBLISHED_NEW_BUSINESS_ENDPOINT,
              'Published NEW business'
            ),

            loadPublishedNewEndpoint(
              PUBLISHED_NEW_DEVELOPMENT_ENDPOINT,
              'Published NEW development'
            ),
          ])


        if (
          cancelled
        ) {
          return
        }


        const records =
          []


        results.forEach(
          (
            result
          ) => {
            if (
              result.status ===
                'fulfilled'
            ) {
              records.push(
                ...result.value
              )
            }
            else {
              console.warn(
                'PUBLIC MAP · TORONTO NEW LOAD FAILED:',
                result.reason
              )
            }
          }
        )


        if (
          records.length >
            0 ||
          results.every(
            (
              result
            ) =>
              result.status ===
                'fulfilled'
          )
        ) {
          setServerNewItems(
            records
          )
        }
      }


      loadPublishedNew()


      const interval =
        window.setInterval(
          loadPublishedNew,
          PUBLISHED_NEW_REFRESH_MS
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


      window.addEventListener(
        GEOGRAPHIC_STORE_CHANGE_EVENT,
        handleStorageChange
      )


      return () => {
        window.removeEventListener(
          'storage',
          handleStorageChange
        )


        window.removeEventListener(
          GEOGRAPHIC_STORE_CHANGE_EVENT,
          handleStorageChange
        )
      }
    },
    []
  )

  useEffect(
    () => {
      if (
        !map
      ) {
        return
      }

      const refreshViewport =
        () => {
          setViewportRevision(
            (
              current
            ) =>
              current + 1
          )
        }

      map.on(
        'zoomend',
        refreshViewport
      )

      map.on(
        'moveend',
        refreshViewport
      )

      return () => {
        map.off(
          'zoomend',
          refreshViewport
        )

        map.off(
          'moveend',
          refreshViewport
        )
      }
    },
    [
      map,
    ]
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
          ? serverNewsItems
          : getNewsItems()


      const zoom =
        map.getZoom()


      const scaleVisibleNews =
        mergedNewsItems
          .filter(
            (pin) =>
              belongsToCity(
                pin,
                cityKey
              )
          )
          .filter(
            (pin) =>
              newsRecordCanAppearAtZoom({
                pin,
                zoom,
              })
          )
          .filter(
            (pin) =>
              newsPinIsVisibleAtZoom({
                pin,
                zoom,
                selectedPinId,
              })
          )


      const limitedNews =
        limitCityNewsPins({
          pins:
            scaleVisibleNews,

          zoom,

          selectedPinId,
        })


      visiblePins =
        limitedNews.map(
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
      const mergedNewItems =
        cityKey ===
          'toronto'
          ? serverNewItems
          : getNewItems()


      visiblePins =
        mergedNewItems
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
          .filter(
            (pin) =>
              newSubtypeFilter !==
                'businesses' ||
              newBusinessMatchesRange(
                pin,
                newBusinessRangeFilter
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

    if (
      activePinFilter ===
        'news'
    ) {
      visiblePins =
        spreadActiveTtcMarkers({
          map,
          items:
            visiblePins,
        })
    }

    visiblePins.forEach(
      ({
        pin,
        pinType,
        markerOffset,
      }) => {
        const marker =
          createMarker({
            map,
            pin,
            pinType,
            markerOffset,
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
    newBusinessRangeFilter,
    contentRevision,
    serverNewsItems,
    serverNewItems,
    viewportRevision,
    selectedPinId,
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