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
  getHistoricCategories,
  getHistoricItems,
  getHistoricLayers,
  getNewsItems,
  getNewItems,
} from '../admin/adminStore.js'

import {
  getHistoricPinIcon,
} from '../historicPinIcons.js'


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


const PUBLISHED_NEW_EVENTS_ENDPOINT =
  '/api/geographic/toronto/new/events/published?status=all'


const PUBLISHED_NEW_SPORTS_ENDPOINT =
  '/api/geographic/toronto/new/sports/published?status=all'


const PUBLISHED_NEW_REAL_ESTATE_ENDPOINT =
  '/api/geographic/toronto/new/real-estate/published?status=all'


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


const COMMUNITY_CATEGORIES = [
  'community',
  'community-place',
  'library',
  'community-centre',
  'gallery',
  'cinema',
  'rink',
  'skatepark',
  'basketball-court',
  'tennis-court',
  'pickleball-court',
  'bike-park',
  'sports-court',
  'pool',
  'splash-pad',
  'wading-pool',
  'water-park',
  'dry-pad',
  'market',
  'park',
  'public-space',
]


const SPORTS_REC_CATEGORIES = [
  'rink',
  'skatepark',
  'basketball-court',
  'tennis-court',
  'pickleball-court',
  'bike-park',
  'sports-court',
  'pool',
  'splash-pad',
  'wading-pool',
  'water-park',
  'dry-pad',
]


const SPORTS_REC_ICON_KEYS = [
  'rink',
  'skateboard',
  'dry-pad',
  'basketball',
  'tennis',
  'pickleball',
  'bike-park',
  'sports-court',
  'pool',
  'splash-pad',
  'wading-pool',
  'water-park',
]


const DEVELOPMENT_CATEGORIES = [
  'development',
  'construction',
  'housing',
  'transit',
  'public-space',
]


const EVENT_CATEGORIES = [
  'event',
  'theatre',
  'comedy',
  'concert',
  'festival',
  'exhibition',
  'talk',
  'screening',
  'community-event',
]


const SPORTS_CATEGORIES = [
  'sports',
  'game',
  'match',
]


const REAL_ESTATE_CATEGORIES = [
  'condo',
  'house',
  'rental',
  'commercial',
  'land',
  'real-estate-other',
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
      180,

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
    !subtype
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


  const realEstatePin =
    explicitType ===
      'real-estate' ||
    (
      !explicitType &&
      REAL_ESTATE_CATEGORIES.includes(
        category
      )
    )


  const communityCategory =
    COMMUNITY_CATEGORIES.includes(
      category
    ) ||
    category.startsWith(
      'community-'
    )


  const communityPin =
    explicitType ===
      'community' ||
    communityCategory ||
    Boolean(
      pin.communityType ||
      pin.communityIcon ||
      pin.facilityType
    )


  const sportsRecKeys =
    [
      category,
      pin.eventPinIcon,
      pin.communityIcon,
      pin.facilityType,
    ]
      .map(
        (value) =>
          String(
            value ||
            ''
          )
            .trim()
            .toLowerCase()
      )


  const sportsRecFacilityPin =
    explicitType ===
      'sports-rec' ||
    sportsRecKeys.some(
      (value) =>
        SPORTS_REC_CATEGORIES.includes(
          value
        ) ||
        SPORTS_REC_ICON_KEYS.includes(
          value
        )
    )


  const sportsRecProgramPin =
    (
      Array.isArray(
        pin?.poolPrograms
      ) &&
      pin.poolPrograms.length >
        0
    ) ||
    (
      Array.isArray(
        pin?.rinkPrograms
      ) &&
      pin.rinkPrograms.length >
        0
    )


  const sportsRecPin =
    sportsRecFacilityPin ||
    sportsRecProgramPin


  if (
    subtype ===
      'all'
  ) {
    return (
      explicitType ===
        'business' ||
      explicitType ===
        'events' ||
      realEstatePin ||
      communityPin ||
      (
        !explicitType &&
        (
          BUSINESS_CATEGORIES.includes(
            category
          ) ||
          EVENT_CATEGORIES.includes(
            category
          )
        )
      )
    )
  }

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
      'community'
  ) {
    return (
      communityPin &&
      !sportsRecFacilityPin
    )
  }


  if (
    subtype ===
      'sports-rec'
  ) {
    return sportsRecPin
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

  if (
    subtype ===
    'events'
  ) {
    return (
      explicitType ===
        'events' ||
      (
        !explicitType &&
        EVENT_CATEGORIES.includes(
          category
        )
      )
    )
  }

  if (
    subtype ===
    'sports'
  ) {
    return (
      explicitType ===
        'sports' ||
      (
        !explicitType &&
        SPORTS_CATEGORIES.includes(
          category
        )
      )
    )
  }


  if (
    subtype ===
      'real-estate' ||
    subtype.startsWith(
      'real-estate:'
    )
  ) {
    if (
      !realEstatePin
    ) {
      return false
    }


    const requestedCategory =
      subtype.includes(
        ':'
      )
        ? subtype
            .slice(
              subtype.indexOf(
                ':'
              ) +
              1
            )
            .trim()
        : 'all'


    if (
      !requestedCategory ||
      requestedCategory ===
        'all'
    ) {
      return true
    }


    if (
      requestedCategory ===
        'other'
    ) {
      return (
        category ===
          'real-estate-other' ||
        (
          explicitType ===
            'real-estate' &&
          category ===
            'other'
        )
      )
    }


    return (
      category ===
      requestedCategory
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


function getNewBusinessLocationLabel(
  pin
) {
  const candidates =
    [
      pin?.address,
      pin?.streetAddress,
      pin?.formattedAddress,
      pin?.businessAddress,
      pin?.location,
      pin?.intersection,
    ]
      .map(
        (value) =>
          String(
            value ||
            ''
          )
            .trim()
      )
      .filter(
        Boolean
      )


  const looksLikeStreetAddress =
    (value) =>
      /^\s*\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+\S/.test(
        value
      ) ||
      /^\s*(?:unit|suite|#)\s*[^, ]+[, ]+\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+\S/i.test(
        value
      )


  const looksLikeIntersection =
    (value) =>
      /\s(?:&|and|@)\s/i.test(
        value
      ) &&
      /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?|crescent|cres\.?|trail|trl\.?|highway|hwy\.?)\b/i.test(
        value
      )


  return (
    candidates.find(
      (value) =>
        looksLikeStreetAddress(
          value
        ) ||
        looksLikeIntersection(
          value
        )
    ) ||
    ''
  )
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
    const rawExpiry =
      String(
        pin.expiresAt
      )
        .trim()


    const explicitExpiry =
      new Date(
        rawExpiry.includes(
          'T'
        )
          ? rawExpiry
          : `${rawExpiry}T23:59:59`
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
// HISTORIC STORY LAYER
// ============================================================

function getHistoricLayerFromCity({
  city,
  layerType,
  year,
}) {
  const numericYear =
    Number(
      year
    )


  if (
    !city ||
    !Number.isFinite(
      numericYear
    )
  ) {
    return null
  }


  const collection =
    layerType ===
      'map'
      ? city.maps
      : layerType ===
          'aerial'
        ? city.aerials
        : null


  const item =
    collection?.[
      numericYear
    ]


  if (
    !item?.url
  ) {
    return null
  }


  return {
    year:
      numericYear,

    layerType,

    ...item,
  }
}


function getHistoricStoryLayer({
  pin,
  city,
}) {
  if (
    pin?.layerPlacementMode ===
      'manual'
  ) {
    const manualLayer =
      getHistoricLayerFromCity({
        city,

        layerType:
          pin.layerOverrideType,

        year:
          pin.layerOverrideYear,
      })


    if (
      manualLayer
    ) {
      return manualLayer
    }
  }


  const storedAutoLayer =
    Array.isArray(
      pin?.autoLayers
    )
      ? pin.autoLayers[0]
      : null


  if (
    storedAutoLayer
  ) {
    const autoLayer =
      getHistoricLayerFromCity({
        city,

        layerType:
          storedAutoLayer.layerType,

        year:
          storedAutoLayer.year,
      })


    if (
      autoLayer
    ) {
      return autoLayer
    }
  }


  const eventYear =
    String(
      pin?.eventDate ||
      ''
    )
      .match(
        /^(\d{4})-/
      )?.[1] ||
    pin?.year ||
    pin?.startYear


  return getClosestEventLayer({
    city,
    year:
      eventYear,
  })
}


function historicLayerMatchesSelected({
  layer,
  selectedLayer,
}) {
  if (
    !layer ||
    !selectedLayer
  ) {
    return false
  }


  return (
    Number(
      layer.year
    ) ===
      Number(
        selectedLayer.year
      ) &&
    layer.layerType ===
      selectedLayer.layerType
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


  const eventDate =
    String(
      pin.eventDate ||
      ''
    )
      .trim()


  if (
    eventDate
  ) {
    const date =
      new Date(
        `${eventDate}T12:00:00`
      )


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date
        .toLocaleDateString(
          'en-CA',
          {
            year:
              'numeric',

            month:
              'long',

            day:
              'numeric',
          }
        )
        .toUpperCase()
    }
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


function formatNewsDateTime(
  value
) {
  if (
    !value
  ) {
    return ''
  }


  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(
      value
    )
  }


  const dateText =
    date.toLocaleDateString(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        year:
          'numeric',

        month:
          'short',

        day:
          'numeric',
      }
    )


  const timeText =
    date.toLocaleTimeString(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        hour:
          'numeric',

        minute:
          '2-digit',
      }
    )


  return (
    `${dateText} · ${timeText}`
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
    isTorontoPolicePin(
      pin
    )
      ? 'contain'
      : 'cover'

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
// HISTORIC VIDEO
// ============================================================

function getHistoricVideoPreview(
  value
) {
  const videoUrl =
    normalizeUrl(
      value
    )


  if (
    !videoUrl
  ) {
    return null
  }


  let parsedUrl


  try {
    parsedUrl =
      new URL(
        videoUrl
      )
  }
  catch {
    return {
      type:
        'link',

      url:
        videoUrl,
    }
  }


  const host =
    parsedUrl.hostname
      .replace(
        /^www\./,
        ''
      )
      .toLowerCase()


  let youtubeId =
    ''


  if (
    host ===
      'youtu.be'
  ) {
    youtubeId =
      parsedUrl.pathname
        .split(
          '/'
        )
        .filter(
          Boolean
        )[0] ||
      ''
  }
  else if (
    host ===
      'youtube.com' ||
    host.endsWith(
      '.youtube.com'
    )
  ) {
    youtubeId =
      parsedUrl.searchParams.get(
        'v'
      ) ||
      ''


    if (
      !youtubeId
    ) {
      const pieces =
        parsedUrl.pathname
          .split(
            '/'
          )
          .filter(
            Boolean
          )


      if (
        [
          'embed',
          'shorts',
          'live',
        ].includes(
          pieces[0]
        )
      ) {
        youtubeId =
          pieces[1] ||
          ''
      }
    }
  }


  if (
    youtubeId
  ) {
    return {
      type:
        'iframe',

      url:
        (
          'https://www.youtube.com/embed/' +
          encodeURIComponent(
            youtubeId
          )
        ),
    }
  }


  if (
    host ===
      'vimeo.com' ||
    host.endsWith(
      '.vimeo.com'
    )
  ) {
    const vimeoId =
      parsedUrl.pathname
        .split(
          '/'
        )
        .filter(
          Boolean
        )
        .reverse()
        .find(
          (piece) =>
            /^\d+$/.test(
              piece
            )
        ) ||
      ''


    if (
      vimeoId
    ) {
      return {
        type:
          'iframe',

        url:
          (
            'https://player.vimeo.com/video/' +
            encodeURIComponent(
              vimeoId
            )
          ),
      }
    }
  }


  if (
    /\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(
      videoUrl
    )
  ) {
    return {
      type:
        'video',

      url:
        videoUrl,
    }
  }


  return {
    type:
      'link',

    url:
      videoUrl,
  }
}


function appendHistoricVideo({
  parent,
  pin,
}) {
  const preview =
    getHistoricVideoPreview(
      pin?.videoUrl
    )


  if (
    !preview
  ) {
    return
  }


  const compactMobileCard =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches


  if (
    preview.type ===
      'iframe'
  ) {
    const iframe =
      document.createElement(
        'iframe'
      )


    iframe.src =
      preview.url

    iframe.title =
      pin?.title
        ? `${pin.title} video`
        : 'Historic video'

    iframe.loading =
      'lazy'

    iframe.allow =
      (
        'accelerometer; autoplay; clipboard-write; ' +
        'encrypted-media; gyroscope; picture-in-picture; web-share'
      )

    iframe.allowFullscreen =
      true

    iframe.style.display =
      'block'

    iframe.style.width =
      '100%'

    iframe.style.height =
      compactMobileCard
        ? '130px'
        : '180px'

    iframe.style.border =
      '0'

    iframe.style.borderRadius =
      '4px'

    iframe.style.margin =
      compactMobileCard
        ? '6px 0'
        : '10px 0'


    parent.appendChild(
      iframe
    )

    return
  }


  if (
    preview.type ===
      'video'
  ) {
    const video =
      document.createElement(
        'video'
      )


    video.src =
      preview.url

    video.controls =
      true

    video.preload =
      'metadata'

    video.playsInline =
      true

    video.style.display =
      'block'

    video.style.width =
      '100%'

    video.style.maxHeight =
      compactMobileCard
        ? '130px'
        : '220px'

    video.style.borderRadius =
      '4px'

    video.style.margin =
      compactMobileCard
        ? '6px 0'
        : '10px 0'


    parent.appendChild(
      video
    )

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
    preview.url

  link.target =
    '_blank'

  link.rel =
    'noopener noreferrer'

  link.className =
    'geographic-pin-source-link'

  link.textContent =
    'WATCH VIDEO ↗'

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
// SOURCE / WEBSITE
// ============================================================

function appendSources({
  parent,
  pin,
}) {
  const explicitSources =
    Array.isArray(
      pin?.sources
    )
      ? pin.sources
      : []


  const sources =
    explicitSources
      .map(
        (
          source
        ) => ({
          name:
            String(
              source?.name ||
              source?.label ||
              ''
            )
              .trim(),

          url:
            normalizeUrl(
              source?.url ||
              source?.sourceUrl
            ),
        })
      )
      .filter(
        (
          source
        ) =>
          Boolean(
            source.name ||
            source.url
          )
      )


  if (
    sources.length ===
      0
  ) {
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
      sourceName ||
      sourceUrl
    ) {
      sources.push({
        name:
          sourceName,

        url:
          sourceUrl,
      })
    }
  }


  if (
    sources.length ===
      0
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
    sources.length >
      1
  ) {
    const heading =
      document.createElement(
        'div'
      )

    heading.textContent =
      'SOURCES'

    heading.style.fontWeight =
      '700'

    heading.style.marginBottom =
      '4px'

    sourceShell.appendChild(
      heading
    )
  }


  sources.forEach(
    (
      source,
      index
    ) => {
      const row =
        document.createElement(
          'div'
        )


      if (
        index >
          0
      ) {
        row.style.marginTop =
          '3px'
      }


      if (
        source.url
      ) {
        const link =
          document.createElement(
            'a'
          )

        link.href =
          source.url

        link.target =
          '_blank'

        link.rel =
          'noopener noreferrer'

        link.className =
          'geographic-pin-source-link'

        link.textContent =
          source.name
            ? `${source.name} ↗`
            : 'MORE INFORMATION ↗'

        link.addEventListener(
          'click',
          (
            event
          ) => {
            event.stopPropagation()
          }
        )

        row.appendChild(
          link
        )
      } else {
        row.textContent =
          source.name
      }


      sourceShell.appendChild(
        row
      )
    }
  )


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


function formatCommunityProgramWhen(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .trim()


  if (
    !text
  ) {
    return ''
  }


  const date =
    new Date(
      text
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text
  }


  const dateText =
    date.toLocaleDateString(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        weekday:
          'short',

        month:
          'short',

        day:
          'numeric',
      }
    )
      .replace(
        /,/g,
        ''
      )
      .toUpperCase()


  const timeText =
    date.toLocaleTimeString(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        hour:
          'numeric',

        minute:
          '2-digit',

        hour12:
          true,
      }
    )
      .replace(
        /\s*a\.m\./i,
        ' AM'
      )
      .replace(
        /\s*p\.m\./i,
        ' PM'
      )
      .replace(
        /\./g,
        ''
      )
      .toUpperCase()


  return (
    dateText +
    ' · ' +
    timeText
  )
}

function formatCommunityProgramAge(
  program
) {
  const rawMin =
    program?.ageMin


  const rawMax =
    program?.ageMax


  const hasMin =
    rawMin !==
      undefined &&
    rawMin !==
      null &&
    String(
      rawMin
    )
      .trim() !==
      ''


  const hasMax =
    rawMax !==
      undefined &&
    rawMax !==
      null &&
    String(
      rawMax
    )
      .trim() !==
      ''


  if (
    !hasMin &&
    !hasMax
  ) {
    return ''
  }


  const min =
    hasMin
      ? Number(
          rawMin
        )
      : null


  const max =
    hasMax
      ? Number(
          rawMax
        )
      : null


  const validMin =
    min !==
      null &&
    Number.isFinite(
      min
    )


  const validMax =
    max !==
      null &&
    Number.isFinite(
      max
    )


  if (
    !validMin &&
    !validMax
  ) {
    return ''
  }


  if (
    validMin &&
    validMax
  ) {
    if (
      min ===
        max
    ) {
      return `AGE ${min}`
    }


    return `AGES ${min}–${max}`
  }


  if (
    validMin
  ) {
    return `AGES ${min}+`
  }


  return `AGES 0–${max}`
}


function formatCommunityProgramPrice(
  program
) {
  const raw =
    program?.price


  if (
    raw ===
      undefined ||
    raw ===
      null ||
    String(
      raw
    )
      .trim() ===
      ''
  ) {
    return ''
  }


  const numeric =
    Number(
      raw
    )


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return String(
      raw
    )
      .trim()
  }


  return (
    '$' +
    numeric.toLocaleString(
      'en-CA',
      {
        minimumFractionDigits:
          Number.isInteger(
            numeric
          )
            ? 0
            : 2,

        maximumFractionDigits:
          2,
      }
    )
  )
}


function parseFarmersMarketDate(
  value
) {
  const text =
    String(
      value ||
      ''
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


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date
}


function formatFarmersMarketTime(
  value
) {
  const match =
    String(
      value ||
      ''
    )
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})$/
      )


  if (
    !match
  ) {
    return ''
  }


  const hour =
    Number(
      match[1]
    )


  const minute =
    Number(
      match[2]
    )


  if (
    !Number.isFinite(
      hour
    ) ||
    !Number.isFinite(
      minute
    ) ||
    hour >
      23 ||
    minute >
      59
  ) {
    return ''
  }


  const date =
    new Date(
      2000,
      0,
      1,
      hour,
      minute
    )


  return date
    .toLocaleTimeString(
      'en-CA',
      {
        hour:
          'numeric',

        minute:
          minute ===
            0
            ? undefined
            : '2-digit',

        hour12:
          true,
      }
    )
    .replace(
      /\s*a\.m\./i,
      ' AM'
    )
    .replace(
      /\s*p\.m\./i,
      ' PM'
    )
    .replace(
      /\./g,
      ''
    )
    .toUpperCase()
}


function getFarmersMarketStatus(
  pin
) {
  if (
    String(
      pin?.communityType ||
      ''
    )
      .toLowerCase() !==
      'farmers-market'
  ) {
    return null
  }


  const now =
    new Date()


  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12
    )


  const seasonType =
    String(
      pin?.seasonType ||
      ''
    )
      .toLowerCase()


  const seasonStart =
    parseFarmersMarketDate(
      pin?.seasonStart
    )


  const seasonEnd =
    parseFarmersMarketDate(
      pin?.seasonEnd
    )


  const yearRound =
    seasonType ===
      'year-round'


  const inSeason =
    yearRound ||
    (
      seasonStart &&
      seasonEnd &&
      today >=
        seasonStart &&
      today <=
        seasonEnd
    )


  const weekdays =
    Array.isArray(
      pin?.weekdays
    )
      ? pin.weekdays
          .map(
            (value) =>
              String(
                value ||
                ''
              )
                .trim()
          )
          .filter(
            Boolean
          )
      : []


  const openTime =
    formatFarmersMarketTime(
      pin?.openTime
    )


  const closeTime =
    formatFarmersMarketTime(
      pin?.closeTime
    )


  const hours =
    openTime &&
    closeTime
      ? `${openTime}–${closeTime}`
      : String(
          pin?.hoursText ||
          ''
        )
          .trim()


  if (
    !inSeason
  ) {
    const nextStart =
      parseFarmersMarketDate(
        pin?.nextSeasonStart ||
        (
          seasonStart &&
          seasonStart.getFullYear() >
            today.getFullYear()
            ? pin?.seasonStart
            : ''
        )
      )


    if (
      nextStart
    ) {
      return {
        status:
          'OFF-SEASON',

        line1:
          'Closed for the season',

        line2:
          `Reopens ${nextStart.toLocaleDateString(
            'en-CA',
            {
              year:
                'numeric',

              month:
                'long',

              day:
                'numeric',
            }
          )}`,
      }
    }


    const expectedMonth =
      Number(
        pin?.expectedReopenMonth
      )


    const monthName =
      Number.isFinite(
        expectedMonth
      ) &&
      expectedMonth >=
        1 &&
      expectedMonth <=
        12
        ? new Date(
            2000,
            expectedMonth -
              1,
            1
          )
            .toLocaleDateString(
              'en-CA',
              {
                month:
                  'long',
              }
            )
        : ''


    return {
      status:
        'OFF-SEASON',

      line1:
        'Closed for the season',

      line2:
        monthName
          ? `Expected to reopen around ${monthName}`
          : 'Next season dates not yet announced',

      line3:
        monthName
          ? `${
              expectedMonth >
                today.getMonth() +
                  1
                ? today.getFullYear()
                : today.getFullYear() +
                  1
            } dates not yet announced`
          : '',
    }
  }


  const todayName =
    today.toLocaleDateString(
      'en-CA',
      {
        weekday:
          'long',
      }
    )


  const openToday =
    weekdays.some(
      (weekday) =>
        weekday.toLowerCase() ===
        todayName.toLowerCase()
    )


  let nextMarket =
    ''


  if (
    weekdays.length >
      0
  ) {
    const dayIndexes = {
      Sunday:
        0,
      Monday:
        1,
      Tuesday:
        2,
      Wednesday:
        3,
      Thursday:
        4,
      Friday:
        5,
      Saturday:
        6,
    }


    let best =
      null


    weekdays.forEach(
      (weekday) => {
        const target =
          dayIndexes[
            weekday
          ]


        if (
          target ===
            undefined
        ) {
          return
        }


        let delta =
          (
            target -
            today.getDay() +
            7
          ) %
          7


        if (
          delta ===
            0 &&
          !openToday
        ) {
          delta =
            7
        }


        if (
          best ===
            null ||
          delta <
            best.delta
        ) {
          best = {
            delta,
            weekday,
          }
        }
      }
    )


    if (
      best
    ) {
      nextMarket =
        best.weekday +
        (
          hours
            ? ` · ${hours}`
            : ''
        )
    }
  }


  return {
    status:
      yearRound
        ? 'YEAR-ROUND'
        : 'IN SEASON',

    line1:
      openToday
        ? (
            hours
              ? `OPEN TODAY · ${hours}`
              : 'OPEN TODAY'
          )
        : 'CLOSED TODAY',

    line2:
      !openToday &&
      nextMarket
        ? `Next market: ${nextMarket}`
        : (
            openToday &&
            weekdays.length >
              0
              ? `${weekdays.join(' · ')}${hours ? ` · ${hours}` : ''}`
              : ''
          ),
  }
}


function appendFarmersMarketStatus({
  parent,
  pin,
}) {
  const status =
    getFarmersMarketStatus(
      pin
    )


  if (
    !status
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )


  shell.style.marginTop =
    '12px'


  shell.style.paddingTop =
    '10px'


  shell.style.borderTop =
    '1px solid rgba(0,0,0,0.12)'


  appendText({
    parent:
      shell,

    className:
      'geographic-pin-year',

    text:
      status.status,
  })


  ;[
    status.line1,
    status.line2,
    status.line3,
  ]
    .filter(
      Boolean
    )
    .forEach(
      (text) => {
        appendText({
          parent:
            shell,

          className:
            'geographic-pin-description',

          text,
        })
      }
    )


  parent.appendChild(
    shell
  )
}


function appendOutdoorRecreationUses({
  parent,
  pin,
}) {
  const activities =
    Array.isArray(
      pin?.outdoorActivities
    )
      ? pin.outdoorActivities
          .map(
            (value) =>
              String(
                value ||
                ''
              )
                .trim()
          )
          .filter(
            Boolean
          )
      : []


  if (
    activities.length ===
      0
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )


  shell.className =
    'geographic-community-programs'


  shell.style.marginTop =
    '12px'


  shell.style.paddingTop =
    '10px'


  shell.style.borderTop =
    '1px solid rgba(0,0,0,0.12)'


  const heading =
    document.createElement(
      'div'
    )


  heading.className =
    'geographic-pin-category'


  heading.textContent =
    'FACILITIES'


  heading.style.marginBottom =
    '3px'


  shell.appendChild(
    heading
  )


  appendText({
    parent:
      shell,

    className:
      'geographic-pin-description',

    text:
      activities.join(
        ' · '
      ),
  })


  parent.appendChild(
    shell
  )
}


function appendAquaticsStatus({
  parent,
  pin,
}) {
  const facilities =
    Array.isArray(
      pin?.aquaticFacilities
    )
      ? pin.aquaticFacilities
          .filter(
            (facility) =>
              Boolean(
                facility?.typeLabel
              )
          )
      : []


  if (
    facilities.length ===
      0
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )


  shell.style.marginTop =
    '12px'


  shell.style.paddingTop =
    '10px'


  shell.style.borderTop =
    '1px solid rgba(0,0,0,0.12)'


  const heading =
    document.createElement(
      'div'
    )


  heading.className =
    'geographic-pin-category'


  heading.textContent =
    'AQUATICS'


  heading.style.marginBottom =
    '3px'


  shell.appendChild(
    heading
  )


  facilities.forEach(
    (
      facility,
      index
    ) => {
      if (
        index >
          0
      ) {
        const spacer =
          document.createElement(
            'div'
          )


        spacer.style.marginTop =
          '6px'


        shell.appendChild(
          spacer
        )
      }


      appendText({
        parent:
          shell,

        className:
          'geographic-pin-description',

        text:
          String(
            facility?.typeLabel ||
            ''
          )
            .trim(),
      })


      const status =
        String(
          facility?.currentStatus ||
          ''
        )
          .trim()


      if (
        status
      ) {
        const statusElement =
          document.createElement(
            'div'
          )


        statusElement.className =
          'geographic-pin-year'


        statusElement.textContent =
          status


        statusElement.style.marginTop =
          '2px'


        statusElement.style.fontSize =
          '10px'


        statusElement.style.fontWeight =
          '700'


        shell.appendChild(
          statusElement
        )
      }


      const season =
        String(
          facility?.seasonLabel ||
          ''
        )
          .trim()


      if (
        season
      ) {
        const seasonElement =
          document.createElement(
            'div'
          )


        seasonElement.className =
          'geographic-pin-year'


        seasonElement.textContent =
          season


        seasonElement.style.marginTop =
          '2px'


        seasonElement.style.fontSize =
          '10px'


        seasonElement.style.fontWeight =
          '600'


        shell.appendChild(
          seasonElement
        )
      }
    }
  )


  parent.appendChild(
    shell
  )
}


function appendRinkStatus({
  parent,
  pin,
}) {
  const facility =
    pin?.rinkFacility


  if (
    !facility
  ) {
    return
  }


  const currentUse =
    String(
      facility?.currentUseLabel ||
      ''
    )
      .trim()


  const iceStatus =
    String(
      facility?.iceStatusLabel ||
      ''
    )
      .trim()


  const expectedIce =
    String(
      facility?.expectedIceLabel ||
      ''
    )
      .trim()


  if (
    !currentUse &&
    !iceStatus &&
    !expectedIce
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )


  shell.style.marginTop =
    '12px'


  shell.style.paddingTop =
    '10px'


  shell.style.borderTop =
    '1px solid rgba(0,0,0,0.12)'


  const heading =
    document.createElement(
      'div'
    )


  heading.className =
    'geographic-pin-category'


  heading.textContent =
    'CURRENT USE'


  heading.style.marginBottom =
    '3px'


  shell.appendChild(
    heading
  )


  if (
    currentUse
  ) {
    appendText({
      parent:
        shell,

      className:
        'geographic-pin-description',

      text:
        currentUse,
    })
  }


  if (
    iceStatus
  ) {
    const status =
      document.createElement(
        'div'
      )


    status.className =
      'geographic-pin-year'


    status.textContent =
      iceStatus


    status.style.marginTop =
      '3px'


    status.style.fontSize =
      '10px'


    status.style.fontWeight =
      '700'


    shell.appendChild(
      status
    )
  }


  if (
    expectedIce
  ) {
    const expected =
      document.createElement(
        'div'
      )


    expected.className =
      'geographic-pin-year'


    expected.textContent =
      expectedIce


    expected.style.marginTop =
      '2px'


    expected.style.fontSize =
      '10px'


    expected.style.fontWeight =
      '600'


    shell.appendChild(
      expected
    )
  }


  parent.appendChild(
    shell
  )
}


function appendCommunityPrograms({
  parent,
  pin,
  programsOverride =
    null,
  headingText =
    'UPCOMING',
}) {
  const sourcePrograms =
    Array.isArray(
      programsOverride
    )
      ? programsOverride
      : pin?.upcomingPrograms


  const programs =
    Array.isArray(
      sourcePrograms
    )
      ? sourcePrograms
          .filter(
            (program) =>
              Boolean(
                program?.title
              )
          )
          .slice(
            0,
            3
          )
      : []


  if (
    programs.length ===
      0
  ) {
    return
  }


  const shell =
    document.createElement(
      'div'
    )


  shell.style.marginTop =
    '12px'


  shell.style.paddingTop =
    '10px'


  shell.style.borderTop =
    '1px solid rgba(0,0,0,0.12)'


  const heading =
    document.createElement(
      'div'
    )


  heading.className =
    'geographic-pin-category'


  heading.textContent =
    headingText


  heading.style.marginBottom =
    '2px'


  shell.appendChild(
    heading
  )


  programs.forEach(
    (program) => {
      const row =
        document.createElement(
          'div'
        )


      row.className =
        'geographic-community-program-row'


      row.style.marginTop =
        '9px'


      const when =
        formatCommunityProgramWhen(
          program?.startTime ||
          program?.date
        )


      if (
        when
      ) {
        const whenElement =
          document.createElement(
            'div'
          )


        whenElement.className =
          'geographic-pin-year geographic-community-program-when'


        whenElement.textContent =
          when


        whenElement.style.fontSize =
          '10px'


        whenElement.style.fontWeight =
          '600'


        whenElement.style.letterSpacing =
          '0.06em'


        whenElement.style.marginBottom =
          '2px'


        row.appendChild(
          whenElement
        )
      }


      const title =
        document.createElement(
          'div'
        )


      title.className =
        'geographic-community-program-title'


      title.textContent =
        String(
          program?.title ||
          ''
        )
          .trim()


      title.style.fontSize =
        '13px'


      title.style.fontWeight =
        '600'


      title.style.lineHeight =
        '1.25'


      title.style.color =
        '#111'


      row.appendChild(
        title
      )


      const ageLabel =
        formatCommunityProgramAge(
          program
        )


      if (
        ageLabel
      ) {
        const age =
          document.createElement(
            'div'
          )


        age.className =
          'geographic-pin-year geographic-community-program-meta'


        age.textContent =
          ageLabel


        age.style.marginTop =
          '2px'


        age.style.fontSize =
          '10px'


        age.style.fontWeight =
          '600'


        row.appendChild(
          age
        )
      }


      const priceLabel =
        formatCommunityProgramPrice(
          program
        )


      if (
        priceLabel
      ) {
        const price =
          document.createElement(
            'div'
          )


        price.className =
          'geographic-pin-year geographic-community-program-meta'


        price.textContent =
          priceLabel


        price.style.marginTop =
          '2px'


        price.style.fontSize =
          '10px'


        price.style.fontWeight =
          '600'


        row.appendChild(
          price
        )
      }


      const seniorPriceLabel =
        formatCommunityProgramPrice({
          price:
            program?.seniorPrice,
        })


      if (
        seniorPriceLabel
      ) {
        const senior =
          document.createElement(
            'div'
          )


        senior.className =
          'geographic-pin-year'


        senior.textContent =
          (
            'SENIOR ' +
            seniorPriceLabel +
            (
              program?.seniorDiscountText
                ? ` · ${String(program.seniorDiscountText).trim()}`
                : ''
            )
          )


        senior.style.marginTop =
          '2px'


        senior.style.fontSize =
          '10px'


        senior.style.fontWeight =
          '600'


        row.appendChild(
          senior
        )
      }


      if (
        program?.isFull
      ) {
        const full =
          document.createElement(
            'div'
          )


        full.className =
          'geographic-pin-year'


        full.textContent =
          'REGISTRATION FULL / CLOSED'


        full.style.marginTop =
          '2px'


        row.appendChild(
          full
        )
      }


      shell.appendChild(
        row
      )
    }
  )


  parent.appendChild(
    shell
  )
}


// ============================================================
// SEE IT THEN
// ============================================================

function appendSeeItThenAction({
  popupContent,
  pin,
  city,
  selectedLayer,
  homeLayer,
  historicIssueFilter,
  historicCategoryFilter,
  historicLayerFilter,
  onSeeItThen,
  onReturnToHistoricIssueHome,
}) {
  const storyLayer =
    getHistoricStoryLayer({
      pin,
      city,
    })


  const insideHistoricCollection =
    Boolean(
      (
        historicIssueFilter &&
        historicIssueFilter !==
          'all'
      ) ||
      (
        historicCategoryFilter &&
        historicCategoryFilter !==
          'all'
      ) ||
      (
        historicLayerFilter &&
        historicLayerFilter !==
          'all'
      )
    )


  const atStoryLayer =
    historicLayerMatchesSelected({
      layer:
        storyLayer,

      selectedLayer,
    })


  const atHomeLayer =
    historicLayerMatchesSelected({
      layer:
        homeLayer,

      selectedLayer,
    })


  const returnToIssueHome =
    insideHistoricCollection &&
    atStoryLayer &&
    !atHomeLayer &&
    typeof onReturnToHistoricIssueHome ===
      'function'


  if (
    !returnToIssueHome &&
    typeof onSeeItThen !==
      'function'
  ) {
    return
  }


  const actions =
    document.createElement(
      'div'
    )

  actions.className =
    'geographic-route-actions'


  const button =
    document.createElement(
      'button'
    )

  button.type =
    'button'

  button.className =
    'geographic-route-action geographic-see-it-then-action'


  button.style.display =
    'block'

  button.style.width =
    '100%'

  button.style.boxSizing =
    'border-box'

  button.style.marginTop =
    '7px'

  button.style.padding =
    '8px 10px'

  button.style.border =
    '0'

  button.style.borderRadius =
    '0'

  button.style.background =
    '#111'

  button.style.color =
    '#fff'

  button.style.fontFamily =
    'inherit'

  button.style.fontSize =
    '8px'

  button.style.fontWeight =
    '800'

  button.style.lineHeight =
    '1.2'

  button.style.letterSpacing =
    '0.08em'

  button.style.textAlign =
    'center'

  button.style.whiteSpace =
    'nowrap'

  button.style.cursor =
    'pointer'


  const getReturnLabel =
    () =>
      historicLayerFilter !==
        'all'
        ? '← RETURN TO LAYER'
        : historicCategoryFilter !==
            'all'
          ? '← RETURN TO CATEGORY'
          : '← RETURN TO COLLECTION'


  const getSeeItThenLabel =
    () =>
      'SEE WHAT IT LOOKED LIKE →'


  let viewingStoryLayer =
    returnToIssueHome


  const refreshButtonLabel =
    () => {
      button.textContent =
        viewingStoryLayer
          ? getReturnLabel()
          : getSeeItThenLabel()
    }


  refreshButtonLabel()


  button.addEventListener(
    'click',
    (
      event
    ) => {
      event.stopPropagation()


      if (
        viewingStoryLayer &&
        insideHistoricCollection &&
        typeof onReturnToHistoricIssueHome ===
          'function'
      ) {
        viewingStoryLayer =
          false

        refreshButtonLabel()

        onReturnToHistoricIssueHome()

        return
      }


      onSeeItThen?.(
        pin
      )


      if (
        insideHistoricCollection &&
        typeof onReturnToHistoricIssueHome ===
          'function'
      ) {
        viewingStoryLayer =
          true

        refreshButtonLabel()
      }
    }
  )


  actions.appendChild(
    button
  )


  popupContent.appendChild(
    actions
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

  actions.appendChild(
    directionsButton
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
  const explicitType =
    normalizeCompareText(
      pin?.newType
    )


  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    explicitType !==
      'business' &&
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
    iconKey &&
    NEW_BUSINESS_ICONS[
      iconKey
    ]
  ) {
    return NEW_BUSINESS_ICONS[
      iconKey
    ]
  }


  if (
    category ===
      'restaurant'
  ) {
    return {
      emoji:
        '🍴',

      label:
        'Restaurant',
    }
  }


  if (
    category ===
      'store'
  ) {
    return {
      emoji:
        '🛍️',

      label:
        'Store',
    }
  }


  return {
    emoji:
      '🏢',

    label:
      'Business',
  }
}


const NEW_EVENT_ICONS = {
  music: {
    emoji:
      '🎵',

    label:
      'Music / Concert',
  },

  food: {
    emoji:
      '🍴',

    label:
      'Food / Pop-up',
  },

  theatre: {
    emoji:
      '🎭',

    label:
      'Theatre / Play',
  },

  comedy: {
    emoji:
      '🎤',

    label:
      'Comedy',
  },

  art: {
    emoji:
      '🎨',

    label:
      'Art / Exhibition',
  },

  film: {
    emoji:
      '🎬',

    label:
      'Film / Screening',
  },

  festival: {
    emoji:
      '🎪',

    label:
      'Festival',
  },

  talk: {
    emoji:
      '💬',

    label:
      'Talk / Lecture',
  },

  community: {
    emoji:
      '📍',

    label:
      'Community / General',
  },
}


function getNewEventIcon(
  pin
) {
  const explicitType =
    normalizeCompareText(
      pin?.newType
    )


  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    explicitType !==
      'events' &&
    !EVENT_CATEGORIES.includes(
      category
    )
  ) {
    return null
  }


  const iconKey =
    normalizeCompareText(
      pin?.eventPinIcon
    )


  if (
    iconKey &&
    NEW_EVENT_ICONS[
      iconKey
    ]
  ) {
    return NEW_EVENT_ICONS[
      iconKey
    ]
  }


  const categoryIconKey = {
    theatre:
      'theatre',

    comedy:
      'comedy',

    concert:
      'music',

    festival:
      'festival',

    exhibition:
      'art',

    talk:
      'talk',

    screening:
      'film',

    'community-event':
      'community',
  }[
    category
  ]


  if (
    categoryIconKey &&
    NEW_EVENT_ICONS[
      categoryIconKey
    ]
  ) {
    return NEW_EVENT_ICONS[
      categoryIconKey
    ]
  }


  return {
    emoji:
      '🎟️',

    label:
      'Event',
  }
}


const NEW_COMMUNITY_ICONS = {
  community: {
    emoji:
      '📍',

    label:
      'Community',
  },

  library: {
    emoji:
      '📚',

    label:
      'Library',
  },

  'community-centre': {
    emoji:
      '🏛️',

    label:
      'Community Centre',
  },

  learn4life: {
    emoji:
      '🏫',

    label:
      'Learn4Life',
  },

  gallery: {
    emoji:
      '🖼️',

    label:
      'Gallery',
  },

  cinema: {
    emoji:
      '🎬',

    label:
      'Cinema',
  },

  rink: {
    emoji:
      '⛸️',

    label:
      'Rink',
  },

  skateboard: {
    emoji:
      '🛹',

    label:
      'Skatepark',
  },

  'dry-pad': {
    emoji:
      '🏟️',

    label:
      'Dry Pad',
  },

  basketball: {
    emoji:
      '🏀',

    label:
      'Basketball',
  },

  tennis: {
    emoji:
      '🎾',

    label:
      'Tennis',
  },

  pickleball: {
    emoji:
      '🏓',

    label:
      'Pickleball',
  },

  'bike-park': {
    emoji:
      '🚲',

    label:
      'Bike Park',
  },

  'sports-court': {
    emoji:
      '🏟️',

    label:
      'Sports Court',
  },

  pool: {
    emoji:
      '🏊',

    label:
      'Pool',
  },

  'splash-pad': {
    emoji:
      '💦',

    label:
      'Splash Pad',
  },

  'wading-pool': {
    emoji:
      '💧',

    label:
      'Wading Pool',
  },

  'water-park': {
    emoji:
      '🌊',

    label:
      'Water Park',
  },

  market: {
    emoji:
      '🧺',

    label:
      'Market',
  },

  park: {
    emoji:
      '🌳',

    label:
      'Park',
  },

  'public-space': {
    emoji:
      '🌐',

    label:
      'Public Space',
  },
}


function getNewCommunityIcon(
  pin
) {
  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    !COMMUNITY_CATEGORIES.includes(
      category
    )
  ) {
    return null
  }


  const communityType =
    normalizeCompareText(
      pin?.communityType
    )


  const iconKey =
    communityType ===
      'learn4life'
      ? 'learn4life'
      : (
          normalizeCompareText(
            pin?.eventPinIcon
          ) ||
          category
        )


  return (
    NEW_COMMUNITY_ICONS[
      iconKey
    ] ||
    NEW_COMMUNITY_ICONS.community
  )
}


const NEW_SPORTS_ICONS = {
  hockey: {
    emoji:
      '🏒',

    label:
      'Hockey',
  },

  basketball: {
    emoji:
      '🏀',

    label:
      'Basketball',
  },

  baseball: {
    emoji:
      '⚾',

    label:
      'Baseball',
  },

  soccer: {
    emoji:
      '⚽',

    label:
      'Soccer',
  },

  football: {
    emoji:
      '🏈',

    label:
      'Football',
  },

  tennis: {
    emoji:
      '🎾',

    label:
      'Tennis',
  },

  golf: {
    emoji:
      '⛳',

    label:
      'Golf',
  },

  lacrosse: {
    emoji:
      '🥍',

    label:
      'Lacrosse',
  },

  boxing: {
    emoji:
      '🥊',

    label:
      'Boxing',
  },

  running: {
    emoji:
      '🏃',

    label:
      'Running / Road Race',
  },

  cycling: {
    emoji:
      '🚲',

    label:
      'Cycling',
  },

  motorsport: {
    emoji:
      '🏁',

    label:
      'Motorsport',
  },

  general: {
    emoji:
      '🏆',

    label:
      'General Sports',
  },
}


function getNewSportsIcon(
  pin
) {
  const explicitType =
    normalizeCompareText(
      pin?.newType
    )


  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    explicitType !==
      'sports' &&
    !SPORTS_CATEGORIES.includes(
      category
    )
  ) {
    return null
  }


  const iconKey =
    normalizeCompareText(
      pin?.sportsPinIcon
    )


  if (
    iconKey &&
    NEW_SPORTS_ICONS[
      iconKey
    ]
  ) {
    return NEW_SPORTS_ICONS[
      iconKey
    ]
  }


  return NEW_SPORTS_ICONS.general
}


const NEW_REAL_ESTATE_ICONS = {
  condo: {
    emoji:
      '🏢',

    label:
      'Condo',
  },

  house: {
    emoji:
      '🏠',

    label:
      'House',
  },

  rental: {
    emoji:
      '🔑',

    label:
      'Rental',
  },

  commercial: {
    emoji:
      '🏬',

    label:
      'Commercial',
  },

  land: {
    emoji:
      '🌱',

    label:
      'Land',
  },

  other: {
    emoji:
      '🏘️',

    label:
      'Real Estate',
  },
}


function getNewRealEstateIcon(
  pin
) {
  const explicitType =
    normalizeCompareText(
      pin?.newType
    )


  const category =
    normalizeCompareText(
      pin?.category
    )


  if (
    explicitType !==
      'real-estate' &&
    !REAL_ESTATE_CATEGORIES.includes(
      category
    )
  ) {
    return null
  }


  const rawKey =
    normalizeCompareText(
      pin?.realEstateIcon ||
      pin?.realEstateType ||
      category
    )


  const iconKey =
    rawKey ===
      'real-estate-other'
      ? 'other'
      : rawKey


  return (
    NEW_REAL_ESTATE_ICONS[
      iconKey
    ] ||
    NEW_REAL_ESTATE_ICONS.other
  )
}


function formatEventCardDateTime(
  pin
) {
  const dateText =
    String(
      pin?.eventDate ||
      ''
    )
      .trim()


  const timeText =
    String(
      pin?.startTime ||
      ''
    )
      .trim()


  let dateLabel =
    ''


  if (
    dateText
  ) {
    const date =
      new Date(
        `${dateText}T12:00:00`
      )


    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      dateLabel =
        date
          .toLocaleDateString(
            'en-CA',
            {
              weekday:
                'short',

              month:
                'short',

              day:
                'numeric',
            }
          )
          .toUpperCase()
    } else {
      dateLabel =
        dateText.toUpperCase()
    }
  }


  let timeLabel =
    ''


  if (
    /^\d{2}:\d{2}$/.test(
      timeText
    )
  ) {
    const [
      hourText,
      minuteText,
    ] =
      timeText.split(
        ':'
      )


    const hour =
      Number(
        hourText
      )


    const minute =
      Number(
        minuteText
      )


    if (
      Number.isFinite(
        hour
      ) &&
      Number.isFinite(
        minute
      )
    ) {
      const suffix =
        hour >=
          12
          ? 'PM'
          : 'AM'


      const displayHour =
        hour %
          12 ||
        12


      timeLabel =
        `${displayHour}:` +
        `${String(
          minute
        ).padStart(
          2,
          '0'
        )} ${suffix}`
    }
  }


  return [
    dateLabel,
    timeLabel,
  ]
    .filter(
      Boolean
    )
    .join(
      ' · '
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


const TORONTO_FIRE_PUBLIC_UNIT_LABELS = [
  ['CMD', 'Command Vehicle', 'Command Vehicles'],
  ['TRS', 'Trench Rescue Support', 'Trench Rescue Support units'],
  ['Box', 'Canteen Vehicle', 'Canteen Vehicles'],
  ['Sup', 'Canteen Vehicle', 'Canteen Vehicles'],
  ['HR', 'Highrise', 'Highrise units'],
  ['HZ', 'HazMat', 'HazMat units'],
  ['FB', 'Fireboat', 'Fireboats'],
  ['LA', 'Air Light', 'Air Light units'],
  ['WT', 'Water Tanker', 'Water Tankers'],
  ['HS', 'Haz Support', 'Haz Support units'],
  ['DE', 'Decon', 'Decon units'],
  ['MP', 'Mini Pumper', 'Mini Pumpers'],
  ['FI', 'Fire Investigator', 'Fire Investigators'],
  ['PL', 'Platform', 'Platforms'],
  ['P', 'Pumper', 'Pumpers'],
  ['R', 'Rescue', 'Rescue units'],
  ['A', 'Aerial', 'Aerials'],
  ['T', 'Tower', 'Towers'],
  ['S', 'Squad', 'Squads'],
  ['C', 'Chief', 'Chiefs'],
]


const TORONTO_FIRE_PUBLIC_ALARM_LABELS = {
  0:
    'Initial response',

  1:
    'Support fire response',

  2:
    '10–14 emergency vehicles',

  3:
    '15–18 emergency vehicles',

  4:
    '19–22 emergency vehicles',

  5:
    '23–28 emergency vehicles',

  6:
    '29–32 emergency vehicles',
}


function formatTorontoFirePublicClock(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .trim()


  const match =
    text.match(
      /^\d{4}-\d{2}-\d{2}(?:T|,\s*)(\d{1,2}):(\d{2})(?::\d{2})?$/
    )


  if (
    !match
  ) {
    return text
  }


  const hour24 =
    Number(
      match[1]
    )


  const hour12 =
    hour24 %
      12 ||
    12


  return (
    `${hour12}:${match[2]} ` +
    (
      hour24 >=
        12
        ? 'PM'
        : 'AM'
    )
  )
}


function formatTorontoFirePublicUnits(
  value
) {
  const groups =
    new Map()


  String(
    value ||
    ''
  )
    .split(
      /\s*,\s*/
    )
    .map(
      (code) =>
        String(
          code ||
          ''
        )
          .trim()
    )
    .filter(
      Boolean
    )
    .forEach(
      (
        code,
        index
      ) => {
        const match =
          TORONTO_FIRE_PUBLIC_UNIT_LABELS.find(
            ([
              prefix,
            ]) =>
              code
                .toLowerCase()
                .startsWith(
                  prefix.toLowerCase()
                )
          )


        const label =
          match?.[1] ||
          'Other unit'


        const pluralLabel =
          match?.[2] ||
          'Other units'


        const existing =
          groups.get(
            label
          )


        if (
          existing
        ) {
          existing.count +=
            1

          return
        }


        groups.set(
          label,
          {
            count:
              1,

            label,

            pluralLabel,

            firstIndex:
              index,
          }
        )
      }
    )


  return Array.from(
    groups.values()
  )
    .sort(
      (
        a,
        b
      ) =>
        b.count -
          a.count ||
        a.firstIndex -
          b.firstIndex
    )
    .map(
      (group) =>
        `${group.count} ` +
        (
          group.count ===
            1
            ? group.label
            : group.pluralLabel
        )
    )
    .join(
      ', '
    )
}


function getTorontoFirePublicDescription(
  pin
) {
  const description =
    String(
      pin?.description ||
      ''
    )
      .trim()


  if (
    !description ||
    !isTorontoFirePin(
      pin
    )
  ) {
    return description
  }


  const normalizedDescription =
    description.replace(
      /,\s*Units?\s+dispatched\s+/gi,
      ' · Units '
    )


  let translatedAny =
    false


  const translated =
    normalizedDescription
      .split(
        /\s*·\s*/
      )
      .map(
        (part) =>
          part.trim()
      )
      .filter(
        Boolean
      )
      .map(
        (part) => {
          const dispatchMatch =
            part.match(
              /^Dispatch\s+(.+)$/i
            )


          if (
            dispatchMatch
          ) {
            translatedAny =
              true

            return (
              'Dispatched ' +
              formatTorontoFirePublicClock(
                dispatchMatch[1]
              )
            )
          }


          const alarmMatch =
            part.match(
              /^Alarm\s+(\d+)$/i
            )


          if (
            alarmMatch
          ) {
            translatedAny =
              true

            const level =
              Number(
                alarmMatch[1]
              )

            const label =
              TORONTO_FIRE_PUBLIC_ALARM_LABELS[
                level
              ]

            return (
              label
                ? `Alarm ${level} — ${label}`
                : `Alarm ${level}`
            )
          }


          const areaMatch =
            part.match(
              /^Area\s+(.+)$/i
            )


          if (
            areaMatch
          ) {
            translatedAny =
              true

            return (
              'Nearest fire station ' +
              areaMatch[1]
            )
          }


          const unitsMatch =
            part.match(
              /^Units?\s+(?:dispatched\s+)?(.+)$/i
            )


          if (
            unitsMatch
          ) {
            const unitsLabel =
              formatTorontoFirePublicUnits(
                unitsMatch[1]
              )


            if (
              unitsLabel
            ) {
              translatedAny =
                true

              return (
                'Units: ' +
                unitsLabel
              )
            }
          }


          return part
        }
      )


  return (
    translatedAny
      ? translated.join(
          ' · '
        )
      : description
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


// ============================================================
// TTC ROUTE
// ============================================================

function getTtcRouteStops(
  pin
) {
  const source =
    Array.isArray(
      pin?.ttcRouteStops
    )
      ? pin.ttcRouteStops
      : []


  return source
    .map(
      (
        stop
      ) => {
        const longitude =
          Number(
            stop?.longitude
          )


        const latitude =
          Number(
            stop?.latitude
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


        return {
          id:
            String(
              stop?.id ||
              ''
            ),

          label:
            String(
              stop?.label ||
              stop?.name ||
              ''
            )
              .trim(),

          longitude,

          latitude,
        }
      }
    )
    .filter(
      Boolean
    )
}


function isTtcRoutePin(
  pin
) {
  return (
    isTtcPin(
      pin
    ) &&
    pin?.active !==
      false &&
    (
      pin?.ttcRouteEnabled ===
        true ||
      getTtcRouteStops(
        pin
      ).length >=
        2
    ) &&
    getTtcRouteStops(
      pin
    ).length >=
      2
  )
}


function safeTtcRouteKey(
  pin,
  index
) {
  const raw =
    String(
      pin?.id ||
      pin?.externalId ||
      `route-${index}`
    )


  return raw
    .replace(
      /[^a-zA-Z0-9_-]+/g,
      '-'
    )
    .slice(
      0,
      80
    ) ||
    `route-${index}`
}


function removeTtcRouteArtifact({
  map,
  artifact,
}) {
  if (
    !map ||
    !artifact
  ) {
    return
  }


  if (
    artifact.timerId
  ) {
    window.clearInterval(
      artifact.timerId
    )
  }


  if (
    map.getLayer(
      artifact.pulseLayerId
    )
  ) {
    map.removeLayer(
      artifact.pulseLayerId
    )
  }


  if (
    map.getLayer(
      artifact.baseLayerId
    )
  ) {
    map.removeLayer(
      artifact.baseLayerId
    )
  }


  if (
    map.getSource(
      artifact.sourceId
    )
  ) {
    map.removeSource(
      artifact.sourceId
    )
  }
}


function getTtcRouteBeforeLayerId(
  map
) {
  const layers =
    map?.getStyle?.()
      ?.layers ||
    []


  // Keep the custom TTC route above all Live TTC route-line layers,
  // but below stops, stations and vehicles so buses remain on top.
  if (
    map?.getLayer?.(
      'ttc-live-stops'
    )
  ) {
    return 'ttc-live-stops'
  }


  const preferred =
    layers.find(
      (layer) =>
        layer?.type ===
          'symbol' &&
        Boolean(
          layer?.layout?.[
            'text-field'
          ]
        ) &&
        !String(
          layer?.id ||
          ''
        )
          .startsWith(
            'ttc-live-'
          )
    )


  return (
    preferred?.id ||
    undefined
  )
}

function addTtcRouteToMap({
  map,
  pin,
  index,
}) {
  const stops =
    getTtcRouteStops(
      pin
    )


  if (
    !map ||
    stops.length <
      2
  ) {
    return null
  }


  const key =
    safeTtcRouteKey(
      pin,
      index
    )


  const sourceId =
    `geographic-ttc-route-source-${key}`


  const baseLayerId =
    `geographic-ttc-route-base-${key}`


  const pulseLayerId =
    `geographic-ttc-route-pulse-${key}`


  const existingArtifact = {
    sourceId,
    baseLayerId,
    pulseLayerId,
    timerId:
      null,
  }


  removeTtcRouteArtifact({
    map,
    artifact:
      existingArtifact,
  })


  if (
    !map.isStyleLoaded()
  ) {
    return null
  }

  const beforeLayerId =
    getTtcRouteBeforeLayerId(
      map
    )


  map.addSource(
    sourceId,
    {
      type:
        'geojson',

      data: {
        type:
          'Feature',

        properties:
          {},

        geometry: {
          type:
            'LineString',

          coordinates:
            stops.map(
              (
                stop
              ) => [
                stop.longitude,
                stop.latitude,
              ]
            ),
        },
      },
    }
  )


  map.addLayer({
    id:
      baseLayerId,

    type:
      'line',

    source:
      sourceId,

    layout: {
      'line-cap':
        'round',

      'line-join':
        'round',
    },

    paint: {
      'line-color':
        'rgba(225, 170, 45, 0.98)',

      'line-width':
        14,

      'line-opacity':
        0.72,
    },
  },
    beforeLayerId
  )


  map.addLayer({
    id:
      pulseLayerId,

    type:
      'line',

    source:
      sourceId,

    layout: {
      'line-cap':
        'round',

      'line-join':
        'round',
    },

    paint: {
      'line-color':
        'rgba(225, 170, 45, 0.98)',

      'line-width':
        8,

      'line-opacity':
        1,
    },
  },
    beforeLayerId
  )


  const reducedMotion =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
      .matches


  let timerId =
    null


  if (
    !reducedMotion
  ) {
    let bright =
      true


    timerId =
      window.setInterval(
        () => {
          if (
            !map.getLayer(
              pulseLayerId
            )
          ) {
            return
          }


          bright =
            !bright


          map.setPaintProperty(
            pulseLayerId,
            'line-opacity',
            bright
              ? 1
              : 0.24
          )


          map.setPaintProperty(
            pulseLayerId,
            'line-width',
            bright
              ? 9.2
              : 6.8
          )
        },
        650
      )
  }


  return {
    sourceId,
    baseLayerId,
    pulseLayerId,
    timerId,
  }
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
      ''


    const desktopIconShell =
      document.createElement(
        'span'
      )


    desktopIconShell.textContent =
      emoji

    desktopIconShell.style.display =
      'inline-block'

    desktopIconShell.style.fontSize =
      '24px'

    desktopIconShell.style.lineHeight =
      '1'

    desktopIconShell.style.filter =
      'drop-shadow(0 0 0.7px rgba(0,0,0,0.9))'

    desktopIconShell.style.pointerEvents =
      'none'

    desktopIconShell.style.transformOrigin =
      'center center'


    element.appendChild(
      desktopIconShell
    )

    return
  }


  element.textContent =
    ''


  const iconShell =
    document.createElement(
      'span'
    )


  iconShell.textContent =
    emoji

  iconShell.style.width =
    '22px'

  iconShell.style.height =
    '22px'

  iconShell.style.display =
    'grid'

  iconShell.style.placeItems =
    'center'

  iconShell.style.flex =
    '0 0 22px'

  // Keep the native full-colour emoji artwork on mobile.
  // Category/icon selection and mobile sizing remain exactly the same.
  iconShell.style.border =
    '0'

  iconShell.style.borderRadius =
    '0'

  iconShell.style.background =
    'transparent'

  iconShell.style.boxShadow =
    'none'

  iconShell.style.filter =
    'drop-shadow(1px 0 0 rgba(0,0,0,0.95)) drop-shadow(-1px 0 0 rgba(0,0,0,0.95)) drop-shadow(0 1px 0 rgba(0,0,0,0.95)) drop-shadow(0 -1px 0 rgba(0,0,0,0.95)) drop-shadow(0 0 1.5px rgba(255,255,255,0.95))'

  iconShell.style.fontSize =
    '19px'

  iconShell.style.lineHeight =
    '1'

  iconShell.style.opacity =
    '1'

  iconShell.style.pointerEvents =
    'none'


  element.appendChild(
    iconShell
  )
}


// ============================================================
// ACTIVE / LIVE PIN PULSE
// ============================================================
//
// NEWS:
//   - an active TTC alert keeps pulsing while it remains active
//   - Police pulse for 4 hours from the TPS release timestamp
//   - Fire pulses for 4 hours from first newsroom arrival
//
// NEW:
//   - Events pulse only while their scheduled event is happening
//   - Sports pulse only while their scheduled game/match is happening
//   - Other NEW pins do not pulse
//
// Event and Sports times are interpreted in America/Toronto.
//
// Reduced-motion users get a steady glow instead of animation.
//
// ============================================================

const POLICE_NEWS_MARKER_WINDOW_MS =
  4 *
  60 *
  60 *
  1000


const FIRE_NEWS_MARKER_WINDOW_MS =
  4 *
  60 *
  60 *
  1000


function getTorontoWallClockNowMs() {
  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'America/Toronto',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hourCycle:
          'h23',
      }
    )
      .formatToParts(
        new Date()
      )


  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
              'literal'
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ]
        )
    )


  const year =
    Number(
      values.year
    )

  const month =
    Number(
      values.month
    )

  const day =
    Number(
      values.day
    )

  const hour =
    Number(
      values.hour
    )

  const minute =
    Number(
      values.minute
    )

  const second =
    Number(
      values.second
    )


  if (
    !Number.isFinite(
      year
    ) ||
    !Number.isFinite(
      month
    ) ||
    !Number.isFinite(
      day
    ) ||
    !Number.isFinite(
      hour
    ) ||
    !Number.isFinite(
      minute
    ) ||
    !Number.isFinite(
      second
    )
  ) {
    return Date.now()
  }


  return Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second
  )
}


function parseScheduledWallClockMs({
  eventDate,
  time,
}) {
  const dateText =
    String(
      eventDate ||
      ''
    )
      .trim()


  const timeText =
    String(
      time ||
      ''
    )
      .trim()


  const dateMatch =
    dateText.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    )


  const timeMatch =
    timeText.match(
      /^(\d{2}):(\d{2})$/
    )


  if (
    !dateMatch ||
    !timeMatch
  ) {
    return null
  }


  const year =
    Number(
      dateMatch[1]
    )

  const month =
    Number(
      dateMatch[2]
    )

  const day =
    Number(
      dateMatch[3]
    )

  const hour =
    Number(
      timeMatch[1]
    )

  const minute =
    Number(
      timeMatch[2]
    )


  if (
    !Number.isFinite(
      year
    ) ||
    !Number.isFinite(
      month
    ) ||
    month <
      1 ||
    month >
      12 ||
    !Number.isFinite(
      day
    ) ||
    day <
      1 ||
    day >
      31 ||
    !Number.isFinite(
      hour
    ) ||
    hour <
      0 ||
    hour >
      23 ||
    !Number.isFinite(
      minute
    ) ||
    minute <
      0 ||
    minute >
      59
  ) {
    return null
  }


  return Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0
  )
}


function getLiveScheduledNewPulseState(
  pin
) {
  if (
    pin?.active ===
      false
  ) {
    return {
      pulse:
        false,
    }
  }


  const explicitType =
    normalizeCompareText(
      pin?.newType
    )


  const category =
    normalizeCompareText(
      pin?.category
    )


  const isEvent =
    explicitType ===
      'events' ||
    EVENT_CATEGORIES.includes(
      category
    )


  const isSport =
    explicitType ===
      'sports' ||
    SPORTS_CATEGORIES.includes(
      category
    )


  if (
    !isEvent &&
    !isSport
  ) {
    return {
      pulse:
        false,
    }
  }


  const startMs =
    parseScheduledWallClockMs({
      eventDate:
        pin?.eventDate,

      time:
        pin?.startTime,
    })


  let endMs =
    parseScheduledWallClockMs({
      eventDate:
        pin?.eventDate,

      time:
        pin?.endTime,
    })


  if (
    startMs ===
      null ||
    endMs ===
      null
  ) {
    return {
      pulse:
        false,
    }
  }


  if (
    endMs <=
      startMs
  ) {
    endMs +=
      24 *
      60 *
      60 *
      1000
  }


  const nowMs =
    getTorontoWallClockNowMs()


  if (
    nowMs <
      startMs ||
    nowMs >=
      endMs
  ) {
    return {
      pulse:
        false,
    }
  }


  return {
    pulse:
      true,

    forever:
      false,

    remainingMs:
      endMs -
      nowMs,
  }
}


function getNewsroomPulseTimestamp(
  pin
) {
  const values = [
    pin?.newsroomFirstSeenAt,
    pin?.receivedAt,
    pin?.queuedAt,
    pin?.firstSeenAt,
    pin?.publishedAt,
    pin?.createdAt,
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


function getPoliceReleasePulseTimestamp(
  pin
) {
  const values = [
    pin?.tpsBroadcastAt,
    pin?.publishedAt,
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


function getMarkerPulseState({
  pin,
  pinType,
}) {
  if (
    pinType ===
      'new'
  ) {
    return getLiveScheduledNewPulseState(
      pin
    )
  }


  if (
    pinType !==
      'news'
  ) {
    return {
      pulse:
        false,
    }
  }


  const activeTtc =
    isTtcPin(
      pin
    ) &&
    pin?.active !==
      false


  if (
    activeTtc
  ) {
    return {
      pulse:
        true,

      forever:
        true,
    }
  }


  const urgentSource =
    isTorontoPolicePin(
      pin
    ) ||
    isTorontoFirePin(
      pin
    )


  if (
    !urgentSource
  ) {
    return {
      pulse:
        false,
    }
  }


  const date =
    isTorontoPolicePin(
      pin
    )
      ? getPoliceReleasePulseTimestamp(
          pin
        )
      : getNewsroomPulseTimestamp(
          pin
        )


  if (
    !date
  ) {
    return {
      pulse:
        false,
    }
  }


  const markerWindowMs =
    isTorontoFirePin(
      pin
    )
      ? FIRE_NEWS_MARKER_WINDOW_MS
      : POLICE_NEWS_MARKER_WINDOW_MS


  const ageMs =
    Date.now() -
    date.getTime()


  if (
    ageMs <
      0 ||
    ageMs >=
      markerWindowMs
  ) {
    return {
      pulse:
        false,
    }
  }


  return {
    pulse:
      true,

    forever:
      false,

    remainingMs:
      markerWindowMs -
      ageMs,
  }
}


function getMarkerPulseColor({
  pin,
}) {
  if (
    isTorontoFirePin(
      pin
    )
  ) {
    return 'rgba(225, 70, 45, 0.96)'
  }


  if (
    isTorontoPolicePin(
      pin
    )
  ) {
    return 'rgba(55, 105, 215, 0.96)'
  }


  if (
    isTtcPin(
      pin
    )
  ) {
    return 'rgba(225, 170, 45, 0.94)'
  }


  return 'rgba(30, 30, 30, 0.60)'
}


function applyMarkerActivityPulse({
  element,
  pin,
  pinType,
}) {
  if (
    typeof window ===
      'undefined' ||
    !element ||
    !pin
  ) {
    return
  }


  const pulseState =
    getMarkerPulseState({
      pin,
      pinType,
    })


  if (
    !pulseState.pulse
  ) {
    return
  }


  const color =
    getMarkerPulseColor({
      pin,
    })


  const target =
    element.firstElementChild ||
    element


  if (
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
      .matches
  ) {
    target.style.filter =
      `drop-shadow(0 0 5px ${color})`

    return
  }


  if (
    typeof target.animate !==
      'function'
  ) {
    return
  }


  const pulseDuration =
    1200


  target.animate(
    [
      {
        transform:
          'scale(1)',

        opacity:
          1,

        filter:
          `drop-shadow(0 0 0 ${color})`,
      },

      {
        transform:
          'scale(1.11)',

        opacity:
          0.72,

        filter:
          `drop-shadow(0 0 7px ${color})`,
      },

      {
        transform:
          'scale(1)',

        opacity:
          1,

        filter:
          `drop-shadow(0 0 0 ${color})`,
      },
    ],
    {
      duration:
        pulseDuration,

      iterations:
        pulseState.forever
          ? Infinity
          : Math.max(
              1,
              Math.ceil(
                pulseState.remainingMs /
                pulseDuration
              )
            ),

      easing:
        'ease-in-out',
    }
  )
}


// ============================================================
// HISTORIC LAYER SELECTION PULSE
// ============================================================

function applyHistoricLayerSelectionPulse({
  element,
  active,
}) {
  if (
    !active ||
    typeof window ===
      'undefined' ||
    !element
  ) {
    return
  }


  const target =
    element.firstElementChild ||
    element


  if (
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
      .matches
  ) {
    target.style.filter =
      'drop-shadow(0 0 6px rgba(20, 20, 20, 0.72))'

    return
  }


  if (
    typeof target.animate !==
      'function'
  ) {
    return
  }


  target.animate(
    [
      {
        transform:
          'scale(1)',

        opacity:
          1,
      },

      {
        transform:
          'scale(1.16)',

        opacity:
          0.62,

        filter:
          'drop-shadow(0 0 8px rgba(20, 20, 20, 0.66))',
      },

      {
        transform:
          'scale(1)',

        opacity:
          1,
      },
    ],
    {
      duration:
        1000,

      iterations:
        8,

      easing:
        'ease-in-out',
    }
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
// another visible NEWS marker. TTC markers are rendered last so they stay
// above other vehicle/news markers, but they do NOT get a forced z-index;
// MapLibre popups and text boxes must still render above the marker.
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
// HISTORIC SAME-LOCATION MARKERS
// ============================================================
//
// Historic stories can legitimately share one exact venue.
// Keep every story as its own marker: the first pin stays on the
// true coordinate and the rest fan out in roomy rings around it.
// The geographic data itself is never changed.
//

const HISTORIC_STACK_COORDINATE_PRECISION =
  4

const HISTORIC_STACK_RADIUS_PX =
  52

const HISTORIC_STACK_RING_GAP_PX =
  44

const NEW_SPORTS_STACK_COORDINATE_PRECISION =
  5


function getHistoricStackKey(
  item
) {
  if (
    item?.pinType !==
      'historic'
  ) {
    return ''
  }


  const longitude =
    Number(
      item?.pin?.longitude
    )

  const latitude =
    Number(
      item?.pin?.latitude
    )


  if (
    !Number.isFinite(
      longitude
    ) ||
    !Number.isFinite(
      latitude
    )
  ) {
    return ''
  }


  return (
    `${latitude.toFixed(
      HISTORIC_STACK_COORDINATE_PRECISION
    )}:` +
    `${longitude.toFixed(
      HISTORIC_STACK_COORDINATE_PRECISION
    )}`
  )
}


function getNewSportsStackKey(
  item
) {
  if (
    item?.pinType !==
      'new' ||
    !getNewSportsIcon(
      item?.pin
    )
  ) {
    return ''
  }


  const longitude =
    Number(
      item?.pin?.longitude
    )

  const latitude =
    Number(
      item?.pin?.latitude
    )


  if (
    !Number.isFinite(
      longitude
    ) ||
    !Number.isFinite(
      latitude
    )
  ) {
    return ''
  }


  return (
    `${latitude.toFixed(
      NEW_SPORTS_STACK_COORDINATE_PRECISION
    )}:` +
    `${longitude.toFixed(
      NEW_SPORTS_STACK_COORDINATE_PRECISION
    )}`
  )
}


function getHistoricStackOffsets(
  count
) {
  if (
    count <=
      1
  ) {
    return [
      [0, 0],
    ]
  }


  const offsets = [
    [0, 0],
  ]


  let remaining =
    count -
    1

  let ring =
    0


  while (
    remaining >
      0
  ) {
    const itemsInRing =
      Math.min(
        8,
        remaining
      )

    const radius =
      HISTORIC_STACK_RADIUS_PX +
      (
        ring *
        HISTORIC_STACK_RING_GAP_PX
      )


    for (
      let positionInRing =
        0;
      positionInRing <
        itemsInRing;
      positionInRing +=
        1
    ) {
      const angle =
        (
          -Math.PI /
          2
        ) +
        (
          (
            Math.PI *
            2
          ) *
          (
            positionInRing /
            itemsInRing
          )
        )


      offsets.push([
        Math.round(
          Math.cos(
            angle
          ) *
          radius
        ),
        Math.round(
          Math.sin(
            angle
          ) *
          radius
        ),
      ])
    }


    remaining -=
      itemsInRing

    ring +=
      1
  }


  return offsets
}


function createHistoricStackMarker({
  map,
  items,
  onExpand,
}) {
  const firstPin =
    items?.[0]?.pin


  if (
    !firstPin
  ) {
    return null
  }


  const longitude =
    Number(
      firstPin.longitude
    )

  const latitude =
    Number(
      firstPin.latitude
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

  element.className =
    'geographic-pin-historic-stack'

  element.style.height =
    '32px'

  element.style.minWidth =
    '42px'

  element.style.padding =
    '0 8px'

  element.style.border =
    '1px solid rgba(0, 0, 0, 0.72)'

  element.style.borderRadius =
    '999px'

  element.style.background =
    'rgba(255, 255, 255, 0.96)'

  element.style.boxShadow =
    '0 2px 8px rgba(0, 0, 0, 0.24)'

  element.style.cursor =
    'pointer'

  element.style.display =
    'flex'

  element.style.alignItems =
    'center'

  element.style.justifyContent =
    'center'

  element.style.gap =
    '4px'

  element.style.fontSize =
    '13px'

  element.style.fontWeight =
    '800'

  element.style.lineHeight =
    '1'

  element.style.whiteSpace =
    'nowrap'

  element.style.appearance =
    'none'

  element.style.WebkitAppearance =
    'none'


  const emojis =
    Array.from(
      new Set(
        items
          .map(
            (item) =>
              getHistoricPinIcon(
                item?.pin?.pinIcon
              )?.emoji
          )
          .filter(
            Boolean
          )
      )
    )
      .slice(
        0,
        3
      )


  const iconText =
    document.createElement(
      'span'
    )

  iconText.textContent =
    emojis.join(
      ''
    )


  const countText =
    document.createElement(
      'span'
    )

  countText.textContent =
    String(
      items.length
    )


  element.appendChild(
    iconText
  )

  element.appendChild(
    countText
  )


  element.setAttribute(
    'aria-label',
    (
      `${items.length} Historic stories ` +
      'at this location. Click to spread markers.'
    )
  )


  element.addEventListener(
    'click',
    (
      event
    ) => {
      event.preventDefault()
      event.stopPropagation()

      map
        ?.getContainer?.()
        ?.dispatchEvent(
          new CustomEvent(
            'geographic:map-pin-click'
          )
        )

      onExpand?.()
    }
  )


  return new Marker({
    element,

    anchor:
      'center',
  })
    .setLngLat([
      longitude,
      latitude,
    ])
    .addTo(
      map
    )
}


// ============================================================
// CREATE MARKER
// ============================================================

function getHistoricMarkerScale(
  zoom
) {
  // Historic markers use their natural/original size at every zoom.
  // Keep the helper in place so marker creation remains otherwise untouched.
  void zoom
  return 1
}


function createMarker({
  map,
  pin,
  pinType,
  markerOffset =
    [0, 0],
  city,
  selectedLayer,
  homeLayer,
  historicIssueFilter,
  historicCategoryFilter,
  historicLayerFilter,
  newSubtypeFilter,
  historicLayerPulse =
    false,
  onDirections,
  onSeeItThen,
  onReturnToHistoricIssueHome,
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

  const historicIcon =
    pinType ===
    'historic'
      ? getHistoricPinIcon(
          pin.pinIcon
        )
      : null


  const newsEmoji =
    pinType ===
    'news'
      ? getNewsEmoji(
          pin
        )
      : ''


  const newCommunityIcon =
    pinType ===
    'new'
      ? getNewCommunityIcon(
          pin
        )
      : null


  const newBusinessIcon =
    pinType ===
    'new'
      ? getNewBusinessIcon(
          pin
        )
      : null


  const newEventIcon =
    pinType ===
    'new'
      ? getNewEventIcon(
          pin
        )
      : null


  const newSportsIcon =
    pinType ===
    'new'
      ? getNewSportsIcon(
          pin
        )
      : null


  const newRealEstateIcon =
    pinType ===
    'new'
      ? getNewRealEstateIcon(
          pin
        )
      : null


  if (
    historicIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-historic-emoji-marker'

    const historicMarkerScale =
      getHistoricMarkerScale(
        map?.getZoom?.()
      )


    element.style.width =
      `${Math.round(
        32 *
          historicMarkerScale
      )}px`

    element.style.height =
      `${Math.round(
        32 *
          historicMarkerScale
      )}px`

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
        ? `${historicIcon.label} · ${pin.title}`
        : `${historicIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      historicIcon.emoji
    )


    // Use the same emoji sizing as Police / Fire / TTC news markers.
    // appendEmojiMarkerIcon() already applies the correct desktop/mobile size.


  }
  else if (
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


    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
  }
  else if (
    newCommunityIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-new-community-emoji-marker'

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
        ? `${newCommunityIcon.label} · ${pin.title}`
        : `${newCommunityIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newCommunityIcon.emoji
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


    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
  }
  else if (
    newEventIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-new-event-emoji-marker'

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
        ? `${newEventIcon.label} · ${pin.title}`
        : `${newEventIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newEventIcon.emoji
    )


    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
  }
  else if (
    newSportsIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-new-sports-emoji-marker'

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
        ? `${newSportsIcon.label} · ${pin.title}`
        : `${newSportsIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newSportsIcon.emoji
    )


    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
  }
  else if (
    newRealEstateIcon
  ) {
    element.className =
      'geographic-pin-emoji-marker geographic-pin-new-real-estate-emoji-marker'

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
        ? `${newRealEstateIcon.label} · ${pin.title}`
        : `${newRealEstateIcon.label} marker`
    )

    appendEmojiMarkerIcon(
      element,
      newRealEstateIcon.emoji
    )

    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
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


    applyMarkerActivityPulse({
      element,
      pin,
      pinType,
    })
  }

  element.classList.add(
    'geographic-map-marker',
    `geographic-map-marker-${pinType}`
  )


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
    const policeMobileStory =
      isTorontoPolicePin(
        pin
      )


    if (
      !policeMobileStory
    ) {
      appendNewsImage({
        parent:
          popupContent,

        pin,
      })
    }


    const showMobileNewsDate =
      isTorontoFirePin(
        pin
      ) ||
      policeMobileStory ||
      isTtcPin(
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
          formatNewsDateTime(
            isTtcPin(
              pin
            )
              ? (
                  pin.serverPublishedAt ||
                  pin.approvedAt ||
                  pin.firstPublishedAt ||
                  pin.createdAt ||
                  pin.publishedAt
                )
              : (
                  getNewsRecordTimestamp(
                    pin
                  ) ||
                  pin.publishedAt
                )
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


    if (
      policeMobileStory
    ) {
      appendNewsImage({
        parent:
          popupContent,

        pin,
      })
    }


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


    appendText({
      parent:
        popupContent,

      className:
        'geographic-pin-location',

      text:
        getNewBusinessLocationLabel(
          pin
        ),
    })


    appendMobileBusinessLink({
      parent:
        popupContent,

      pin,
    })
  }
  else {
    const historicDescription =
      pinType ===
        'historic'
        ? String(
            pin.description ||
            ''
          )
            .trim()
        : ''

    const collapseHistoricDetails =
      compactMobilePopup &&
      pinType ===
        'historic' &&
      historicDescription.length >
        260

    let collapsedHistoricSourcesParent =
      null

    let collapsedHistoricLessButton =
      null


    if (
      pinType !==
        'historic'
    ) {
      appendText({
        parent:
          popupContent,

        className:
          'geographic-pin-type',

        text:
          pinType.toUpperCase(),
      })
    }


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
          isTtcPin(
            pin
          )
            ? formatNewsDateTime(
                pin.serverPublishedAt ||
                pin.approvedAt ||
                pin.firstPublishedAt ||
                pin.createdAt ||
                pin.publishedAt
              )
            : formatNewsDate(
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


      const isEvent =
        normalizeCompareText(
          pin.newType
        ) ===
          'events' ||
        EVENT_CATEGORIES.includes(
          normalizeCompareText(
            pin.category
          )
        )


      const isSport =
        normalizeCompareText(
          pin.newType
        ) ===
          'sports' ||
        SPORTS_CATEGORIES.includes(
          normalizeCompareText(
            pin.category
          )
        )


      appendText({
        parent:
          popupContent,

        className:
          'geographic-pin-year',

        text:
          (
            isEvent ||
            isSport
          )
            ? formatEventCardDateTime(
                pin
              )
            : [
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
          (
            pinType ===
              'new' &&
            (
              normalizeCompareText(
                pin.newType
              ) ===
                'events' ||
              normalizeCompareText(
                pin.newType
              ) ===
                'sports' ||
              EVENT_CATEGORIES.includes(
                normalizeCompareText(
                  pin.category
                )
              ) ||
              SPORTS_CATEGORIES.includes(
                normalizeCompareText(
                  pin.category
                )
              )
            )
          )
            ? (
                pin.venue ||
                pin.intersection ||
                pin.location
              )
            : (
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
                  ? getNewBusinessLocationLabel(
                      pin
                    )
                  : (
                      pin.intersection ||
                      pin.location
                    )
              )
        ),
    })


    if (
      pinType ===
        'news' ||
      pinType ===
        'historic'
    ) {
      appendNewsImage({
        parent:
          popupContent,

        pin,
      })
    }


    if (
      pinType ===
        'historic'
    ) {
      appendHistoricVideo({
        parent:
          popupContent,

        pin,
      })
    }


    const publicDescription =
      pinType ===
        'news' &&
      isTorontoFirePin(
        pin
      )
        ? getTorontoFirePublicDescription(
            pin
          )
        : pin.description


    if (
      collapseHistoricDetails
    ) {
      const detailsShell =
        document.createElement(
          'div'
        )

      detailsShell.className =
        'geographic-pin-collapsible-details'


      const previewDescription =
        document.createElement(
          'div'
        )

      previewDescription.className =
        'geographic-pin-description'


      let previewText =
        historicDescription
          .slice(
            0,
            260
          )
          .trim()

      const previewBreak =
        previewText.lastIndexOf(
          ' '
        )


      if (
        previewBreak >
          180
      ) {
        previewText =
          previewText
            .slice(
              0,
              previewBreak
            )
            .trim()
      }


      previewDescription.textContent =
        `${previewText}…`


      const moreButton =
        document.createElement(
          'button'
        )

      moreButton.type =
        'button'

      moreButton.textContent =
        '(... MORE)'

      moreButton.style.display =
        'inline-block'

      moreButton.style.margin =
        '4px 0 0'

      moreButton.style.border =
        '0'

      moreButton.style.padding =
        '0'

      moreButton.style.background =
        'transparent'

      moreButton.style.color =
        'inherit'

      moreButton.style.font =
        'inherit'

      moreButton.style.fontSize =
        '7px'

      moreButton.style.fontWeight =
        '800'

      moreButton.style.letterSpacing =
        '0.05em'

      moreButton.style.cursor =
        'pointer'


      const expandedDetails =
        document.createElement(
          'div'
        )

      expandedDetails.style.display =
        'none'


      appendText({
        parent:
          expandedDetails,

        className:
          'geographic-pin-description',

        text:
          publicDescription,
      })


      const lessButton =
        document.createElement(
          'button'
        )

      lessButton.type =
        'button'

      lessButton.textContent =
        '(LESS)'

      lessButton.style.display =
        'inline-block'

      lessButton.style.margin =
        '5px 0 0'

      lessButton.style.border =
        '0'

      lessButton.style.padding =
        '0'

      lessButton.style.background =
        'transparent'

      lessButton.style.color =
        'inherit'

      lessButton.style.font =
        'inherit'

      lessButton.style.fontSize =
        '7px'

      lessButton.style.fontWeight =
        '800'

      lessButton.style.letterSpacing =
        '0.05em'

      lessButton.style.cursor =
        'pointer'


      moreButton.addEventListener(
        'click',
        (
          event
        ) => {
          event.stopPropagation()

          previewDescription.style.display =
            'none'

          moreButton.style.display =
            'none'

          expandedDetails.style.display =
            'block'
        }
      )


      lessButton.addEventListener(
        'click',
        (
          event
        ) => {
          event.stopPropagation()

          expandedDetails.style.display =
            'none'

          previewDescription.style.display =
            'block'

          moreButton.style.display =
            'inline-block'
        }
      )


      detailsShell.appendChild(
        previewDescription
      )

      detailsShell.appendChild(
        moreButton
      )

      detailsShell.appendChild(
        expandedDetails
      )

      popupContent.appendChild(
        detailsShell
      )


      collapsedHistoricSourcesParent =
        expandedDetails

      collapsedHistoricLessButton =
        lessButton
    }
    else {
      appendText({
        parent:
          popupContent,

        className:
          'geographic-pin-description',

        text:
          publicDescription,
      })
    }


    if (
      pinType ===
        'new' &&
      COMMUNITY_CATEGORIES.includes(
        normalizeCompareText(
          pin.category
        )
      )
    ) {
      appendFarmersMarketStatus({
        parent:
          popupContent,

        pin,
      })


      appendRinkStatus({
        parent:
          popupContent,

        pin,
      })


      appendOutdoorRecreationUses({
        parent:
          popupContent,

        pin,
      })


      appendAquaticsStatus({
        parent:
          popupContent,

        pin,
      })


      const hasPoolPrograms =
        Array.isArray(
          pin?.poolPrograms
        ) &&
        pin.poolPrograms.length >
          0


      const hasRinkPrograms =
        Array.isArray(
          pin?.rinkPrograms
        ) &&
        pin.rinkPrograms.length >
          0


      const communityProgramsOnly =
        newSubtypeFilter ===
          'community'


      const sportsRecProgramsOnly =
        newSubtypeFilter ===
          'sports-rec'


      if (
        communityProgramsOnly
      ) {
        appendCommunityPrograms({
          parent:
            popupContent,

          pin,
        })
      }
      else if (
        sportsRecProgramsOnly
      ) {
        if (
          hasPoolPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,

            programsOverride:
              pin.poolPrograms,

            headingText:
              'SWIM',
          })
        }


        if (
          hasRinkPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,

            programsOverride:
              pin.rinkPrograms,

            headingText:
              'SKATING',
          })
        }


        if (
          !hasPoolPrograms &&
          !hasRinkPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,
          })
        }
      }
      else {
        if (
          !hasPoolPrograms &&
          !hasRinkPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,
          })
        }


        if (
          hasPoolPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,

            programsOverride:
              pin.poolPrograms,

            headingText:
              'SWIM',
          })
        }


        if (
          hasRinkPrograms
        ) {
          appendCommunityPrograms({
            parent:
              popupContent,

            pin,

            programsOverride:
              pin.rinkPrograms,

            headingText:
              'SKATING',
          })
        }
      }
    }

    if (
      (
        pin.category &&
        !(
          pinType ===
            'new' &&
          COMMUNITY_CATEGORIES.includes(
            normalizeCompareText(
              pin.category
            )
          )
        )
      ) ||
      (
        pinType ===
          'historic' &&
        (
          pin.historicCategoryTitle ||
          pin.historicLayerTitle
        )
      )
    ) {
      const categoryLabel =
        String(
          pinType ===
            'historic'
            ? (
                pin.historicCategoryTitle ||
                pin.category ||
                ''
              )
            : (
                pin.category ||
                ''
              )
        )
          .replace(
            /-/g,
            ' '
          )
          .toUpperCase()


      const historicLayerLabel =
        pinType ===
          'historic'
          ? String(
              pin.historicLayerTitle ||
              ''
            )
              .replace(
                /-/g,
                ' '
              )
              .toUpperCase()
          : ''


      appendText({
        parent:
          popupContent,

        className:
          'geographic-pin-category',

        text:
          [
            categoryLabel,
            historicLayerLabel,
          ]
            .filter(
              Boolean
            )
            .join(
              ' · '
            ),
      })
    }


    appendSources({
      parent:
        collapsedHistoricSourcesParent ||
        popupContent,

      pin,
    })


    if (
      collapsedHistoricSourcesParent &&
      collapsedHistoricLessButton
    ) {
      collapsedHistoricSourcesParent
        .appendChild(
          collapsedHistoricLessButton
        )
    }


    if (
      pinType ===
        'historic'
    ) {
      appendSeeItThenAction({
        popupContent,
        pin,
        city,
        selectedLayer,
        homeLayer,
        historicIssueFilter,
        historicCategoryFilter,
        historicLayerFilter,
        onSeeItThen,
        onReturnToHistoricIssueHome,
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
        ? 'min(138px, calc(100vw - 72px))'
        : 'min(150px, calc(100vw - 68px))'

    popupContent.style.maxWidth =
      'calc(100vw - 68px)'

    popupContent.style.maxHeight =
      'none'

    popupContent.style.overflowY =
      'visible'

    popupContent.style.overscrollBehavior =
      'auto'

    popupContent.style.fontSize =
      '0.74em'

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
        '9px'

      mobileTitle.style.lineHeight =
        '1.18'

      mobileTitle.style.marginBottom =
        '4px'


      if (
        pinType ===
          'historic'
      ) {
        popupContent.insertBefore(
          mobileTitle,
          popupContent.firstChild
        )
      }
    }


    const mobileLocation =
      popupContent.querySelector(
        '.geographic-pin-location'
      )


    if (
      mobileLocation
    ) {
      mobileLocation.style.fontSize =
        '7px'

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


      if (
        pinType ===
          'historic' &&
        mobileTitle
      ) {
        mobileCategory.style.marginBottom =
          '3px'

        popupContent.insertBefore(
          mobileCategory,
          mobileTitle
        )
      }
    }


    const mobileProgramShells =
      popupContent.querySelectorAll(
        '.geographic-community-programs'
      )


    mobileProgramShells.forEach(
      (shell) => {
        shell.style.marginTop =
          '8px'

        shell.style.paddingTop =
          '7px'
      }
    )


    popupContent
      .querySelectorAll(
        '.geographic-community-program-row'
      )
      .forEach(
        (row) => {
          row.style.marginTop =
            '6px'
        }
      )


    popupContent
      .querySelectorAll(
        '.geographic-community-program-when'
      )
      .forEach(
        (when) => {
          when.style.fontSize =
            '8px'

          when.style.marginBottom =
            '1px'
        }
      )


    popupContent
      .querySelectorAll(
        '.geographic-community-program-title'
      )
      .forEach(
        (title) => {
          title.style.fontSize =
            '10px'

          title.style.lineHeight =
            '1.15'
        }
      )


    popupContent
      .querySelectorAll(
        '.geographic-community-program-meta'
      )
      .forEach(
        (meta) => {
          meta.style.fontSize =
            '8px'

          meta.style.lineHeight =
            '1.1'
        }
      )


    const mobileImage =
      popupContent.querySelector(
        'img'
      )


    if (
      mobileImage
    ) {
      const mobileImageLink =
        mobileImage.parentElement

      const historicMobileImage =
        pinType ===
          'historic'


      const policeMobileImage =
        pinType ===
          'news' &&
        isTorontoPolicePin(
          pin
        )


      if (
        mobileImageLink
      ) {
        mobileImageLink.style.display =
          'block'

        mobileImageLink.style.width =
          historicMobileImage
            ? '132px'
            : policeMobileImage
              ? '128px'
              : '88px'

        mobileImageLink.style.height =
          historicMobileImage
            ? '99px'
            : policeMobileImage
              ? 'auto'
              : '66px'

        mobileImageLink.style.float =
          historicMobileImage ||
          policeMobileImage
            ? 'none'
            : 'right'

        mobileImageLink.style.margin =
          historicMobileImage
            ? '8px auto 10px'
            : policeMobileImage
              ? '6px auto 8px'
              : '0 0 5px 8px'

        mobileImageLink.style.clear =
          historicMobileImage ||
          policeMobileImage
            ? 'both'
            : 'none'

        mobileImageLink.style.overflow =
          policeMobileImage
            ? 'visible'
            : 'hidden'

        mobileImageLink.style.borderRadius =
          '2px'
      }


      mobileImage.style.width =
        historicMobileImage
          ? '132px'
          : policeMobileImage
            ? '128px'
            : '88px'

      mobileImage.style.height =
        historicMobileImage
          ? '99px'
          : policeMobileImage
            ? 'auto'
            : '66px'

      mobileImage.style.maxHeight =
        historicMobileImage
          ? '99px'
          : policeMobileImage
            ? '180px'
            : '66px'

      mobileImage.style.margin =
        historicMobileImage ||
        policeMobileImage
          ? '0 auto'
          : '0'

      mobileImage.style.objectFit =
        policeMobileImage
          ? 'contain'
          : 'cover'

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


  const preferredPopupMaxHeight =
    popupContent.style.maxHeight


  const popup =
    new Popup({
      closeButton:
        true,

      closeOnClick:
        true,

      closeOnMove:
        false,

      offset:
        14,

      maxWidth:
        compactMobilePopup
          ? '164px'
          : '280px',

      className:
        'geographic-map-card-popup',
    })
      .setDOMContent(
        popupContent
      )


  let popupLayoutCleanup =
    null


  popup.on(
    'open',
    () => {
      popupLayoutCleanup?.()
      popupLayoutCleanup =
        null


      // Tell LIVE BUSES only after this map pin has actually opened.
      map
        ?.getContainer?.()
        ?.dispatchEvent(
          new CustomEvent(
            'geographic:map-pin-click'
          )
        )


      let closed =
        false
      const timeoutIds =
        []
      const frameIds =
        []


      const resetPopupScroll =
        () => {
          if (
            closed
          ) {
            return
          }


          popupContent.scrollTop =
            0


          const popupShell =
            popupContent.closest(
              '.maplibregl-popup-content'
            )


          if (
            popupShell
          ) {
            popupShell.scrollTop =
              0


            if (
              compactMobilePopup
            ) {
              popupShell.style.padding =
                '8px 9px'
            }
          }
        }


      const fitPopupIntoViewport =
        () => {
          if (
            closed ||
            !popup.isOpen?.()
          ) {
            return
          }


          const mapContainer =
            map?.getContainer?.()

          const popupElement =
            popup?.getElement?.() ||
            popupContent.closest(
              '.maplibregl-popup'
            )


          if (
            !mapContainer ||
            !popupElement
          ) {
            return
          }


          // Cards are the top map UI. Keep them above all map markers and
          // canvas layers while still below app chrome outside .map.
          popupElement.style.zIndex =
            '1400'


          const mapRect =
            mapContainer.getBoundingClientRect()

          const edgePadding =
            compactMobilePopup
              ? 8
              : 14

          let safeTop =
            mapRect.top +
            edgePadding

          let safeBottom =
            mapRect.bottom -
            edgePadding


          const brandRect =
            document
              .querySelector(
                '.brand'
              )
              ?.getBoundingClientRect()


          if (
            brandRect?.height &&
            brandRect.bottom >
              mapRect.top &&
            brandRect.top <
              mapRect.bottom
          ) {
            safeTop =
              Math.max(
                safeTop,
                brandRect.bottom +
                  edgePadding
              )
          }


          const timelineRect =
            document
              .querySelector(
                '.timeline-shell'
              )
              ?.getBoundingClientRect()


          if (
            timelineRect?.height &&
            timelineRect.bottom >
              mapRect.top &&
            timelineRect.top <
              mapRect.bottom
          ) {
            safeBottom =
              Math.min(
                safeBottom,
                timelineRect.top -
                  edgePadding
              )
          }


          const availableHeight =
            Math.max(
              92,
              safeBottom -
                safeTop -
                16
            )

          const preferredHeight =
            parseFloat(
              preferredPopupMaxHeight ||
              ''
            )

          const maxContentHeight =
            Number.isFinite(
              preferredHeight
            )
              ? Math.min(
                  availableHeight,
                  preferredHeight
                )
              : availableHeight


          popupContent.style.maxHeight =
            `${Math.floor(
              maxContentHeight
            )}px`

          popupContent.style.overflowY =
            'auto'

          popupContent.style.overscrollBehavior =
            'contain'


          const popupRect =
            popupElement.getBoundingClientRect()

          const safeLeft =
            mapRect.left +
            edgePadding

          const safeRight =
            mapRect.right -
            edgePadding


          const panX =
            popupRect.left <
              safeLeft
              ? popupRect.left -
                safeLeft
              : popupRect.right >
                  safeRight
                ? popupRect.right -
                  safeRight
                : 0

          const panY =
            popupRect.top <
              safeTop
              ? popupRect.top -
                safeTop
              : popupRect.bottom >
                  safeBottom
                ? popupRect.bottom -
                  safeBottom
                : 0


          if (
            Math.abs(
              panX
            ) <=
              1 &&
            Math.abs(
              panY
            ) <=
              1
          ) {
            return
          }


          // Snap the card into the usable screen immediately. Do not attach
          // recursive moveend corrections: they accumulated across popups and
          // eventually fought normal drag/zoom/See-It-Then camera movement.
          map.panBy(
            [
              panX,
              panY,
            ],
            {
              duration:
                0,

              essential:
                true,
            }
          )
        }


      const refreshPopupLayout =
        () => {
          if (
            closed
          ) {
            return
          }

          resetPopupScroll()
          fitPopupIntoViewport()
        }


      refreshPopupLayout()


      const firstFrame =
        window.requestAnimationFrame(
          () => {
            const secondFrame =
              window.requestAnimationFrame(
                refreshPopupLayout
              )

            frameIds.push(
              secondFrame
            )
          }
        )

      frameIds.push(
        firstFrame
      )


      timeoutIds.push(
        window.setTimeout(
          refreshPopupLayout,
          90
        )
      )

      timeoutIds.push(
        window.setTimeout(
          refreshPopupLayout,
          220
        )
      )


      const popupImage =
        popupContent.querySelector(
          'img'
        )


      const handlePopupImageLoad =
        () => {
          refreshPopupLayout()
        }


      if (
        popupImage &&
        !popupImage.complete
      ) {
        popupImage.addEventListener(
          'load',
          handlePopupImageLoad,
          {
            once:
              true,
          }
        )
      }


      popupLayoutCleanup =
        () => {
          if (
            closed
          ) {
            return
          }


          closed =
            true


          timeoutIds.forEach(
            (
              timeoutId
            ) => {
              window.clearTimeout(
                timeoutId
              )
            }
          )


          frameIds.forEach(
            (
              frameId
            ) => {
              window.cancelAnimationFrame(
                frameId
              )
            }
          )


          popupImage?.removeEventListener?.(
            'load',
            handlePopupImageLoad
          )
        }
    }
  )


  popup.on(
    'close',
    () => {
      popupLayoutCleanup?.()
      popupLayoutCleanup =
        null
    }
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

  // NEWS must always sit above canvas-based TTC routes, stops and vehicles.
  // This is display priority only; it does not change pin filtering or logic.
  const markerElement =
    marker.getElement?.()

  if (
    markerElement
  ) {
    if (
      pinType ===
        'news'
    ) {
      markerElement.style.zIndex =
        '700'
    }
    else if (
      pinType ===
        'historic'
    ) {
      markerElement.style.zIndex =
        '360'
    }
    else {
      markerElement.style.zIndex =
        '420'
    }
  }

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


function newsRecordIsAvailableForHistory(
  pin
) {
  return (
    pin?.active !==
      false ||
    newsArchiveIsNaturalExpiry(
      pin
    )
  )
}


function newsRecordMatchesHistoryRange({
  pin,
  range,
}) {
  if (
    range ===
      'curated' ||
    !range
  ) {
    return true
  }


  if (
    !newsRecordIsAvailableForHistory(
      pin
    )
  ) {
    return false
  }


  // A TTC alert that is still active remains useful even if it began
  // before the selected look-back window.
  if (
    isTtcPin(
      pin
    ) &&
    pin?.active !==
      false
  ) {
    return true
  }


  if (
    range ===
      'all'
  ) {
    return true
  }


  const maxHours =
    Number(
      range
    )


  if (
    !Number.isFinite(
      maxHours
    ) ||
    maxHours <=
      0
  ) {
    return false
  }


  const ageHours =
    getNewsAgeHours(
      pin
    )


  return (
    ageHours !==
      null &&
    ageHours <=
      maxHours
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
  homeLayer,
  selectedPinId,
  activePinFilter,
  liveTtcAlertsVisible =
    false,
  historicIssueFilter =
    'all',
  historicCategoryFilter =
    'all',
  historicLayerFilter =
    'all',
  newsRangeFilter,
  newSubtypeFilter,
  newBusinessRangeFilter,
  onDirections,
  onSeeItThen,
  onReturnToHistoricIssueHome,
}) {
  const markersRef =
    useRef([])

  const markerByIdRef =
    useRef(
      new Map()
    )


  const historicLayerPulseRef =
    useRef({
      layerId:
        '',

      pulseUntil:
        0,
    })


  const ttcRouteArtifactsRef =
    useRef(
      []
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


  const [
    activityRevision,
    setActivityRevision,
  ] =
    useState(
      0
    )


  const historicModeActive =
    activePinFilter ===
      'historic'


  useEffect(
    () => {
      if (
        activePinFilter ===
          'historic' &&
        historicLayerFilter !==
          'all'
      ) {
        historicLayerPulseRef.current = {
          layerId:
            historicLayerFilter,

          pulseUntil:
            Date.now() +
            8000,
        }

        return
      }


      historicLayerPulseRef.current = {
        layerId:
          '',

        pulseUntil:
          0,
      }
    },
    [
      activePinFilter,
      historicLayerFilter,
    ]
  )


  // Historic pins belong to the selected story collection, not to the
  // basemap year. SEE IT THEN may swap historical imagery underneath
  // them, but it must never make the story markers disappear.
  const markerSelectedLayerKey =
    historicModeActive
      ? 'historic-persistent'
      : `${selectedLayer?.layerType || ''}:${selectedLayer?.year || ''}`


  const markerSelectedPinKey =
    historicModeActive
      ? ''
      : selectedPinId


  const markerViewportRevision =
    historicModeActive
      ? 0
      : viewportRevision


  const markerActivityRevision =
    historicModeActive
      ? 0
      : activityRevision


  const markerServerNewsItems =
    historicModeActive &&
    !liveTtcAlertsVisible
      ? null
      : serverNewsItems


  const markerServerNewItems =
    historicModeActive
      ? null
      : serverNewItems


  useEffect(
    () => {
      const interval =
        window.setInterval(
          () => {
            setActivityRevision(
              (
                current
              ) =>
                current + 1
            )
          },
          15 * 1000
        )


      return () => {
        window.clearInterval(
          interval
        )
      }
    },
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

            loadPublishedNewEndpoint(
              PUBLISHED_NEW_EVENTS_ENDPOINT,
              'Published NEW events'
            ),

            loadPublishedNewEndpoint(
              PUBLISHED_NEW_SPORTS_ENDPOINT,
              'Published NEW sports'
            ),

            loadPublishedNewEndpoint(
              PUBLISHED_NEW_REAL_ESTATE_ENDPOINT,
              'Published NEW real estate'
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

      // Pin visibility is zoom-dependent, not pan-dependent. Rebuilding every
      // marker after a popup auto-pan tears down the popup that just opened,
      // which makes NEWS feel like it needs a second click. Keep the marker
      // set stable while the map pans underneath an open card.
      map.on(
        'zoomend',
        refreshViewport
      )

      return () => {
        map.off(
          'zoomend',
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


    ttcRouteArtifactsRef.current.forEach(
      (
        artifact
      ) => {
        removeTtcRouteArtifact({
          map,
          artifact,
        })
      }
    )


    ttcRouteArtifactsRef.current =
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


      const historicCategoryById =
        new Map(
          getHistoricCategories()
            .filter(
              (category) =>
                belongsToCity(
                  category,
                  cityKey
                )
            )
            .map(
              (category) => [
                category.id,
                category,
              ]
            )
        )


      const historicLayerById =
        new Map(
          getHistoricLayers()
            .filter(
              (layer) =>
                belongsToCity(
                  layer,
                  cityKey
                )
            )
            .map(
              (layer) => [
                layer.id,
                layer,
              ]
            )
        )


      const getAdditionalHistoricLayerIds =
        (pin) =>
          Array.from(
            new Set(
              (
                Array.isArray(
                  pin?.additionalHistoricLayerIds
                )
                  ? pin.additionalHistoricLayerIds
                  : []
              )
                .map(
                  (layerId) =>
                    String(
                      layerId ||
                      ''
                    )
                      .trim()
                )
                .filter(
                  (layerId) =>
                    Boolean(
                      layerId
                    ) &&
                    layerId !==
                      pin?.historicLayerId
                )
            )
          )


      const sharedHistoricLayerIsPublished =
        (layerId) => {
          const layer =
            historicLayerById.get(
              layerId
            )


          if (
            !layer ||
            layer.status !==
              'published'
          ) {
            return false
          }


          if (
            !layer.categoryId
          ) {
            return true
          }


          const category =
            historicCategoryById.get(
              layer.categoryId
            )


          return (
            Boolean(
              category
            ) &&
            category.status ===
              'published'
          )
        }


      const historicRecordMatchesLayer =
        (pin, layerId) => {
          if (
            pin?.historicLayerId ===
              layerId &&
            sharedHistoricLayerIsPublished(
              layerId
            )
          ) {
            return true
          }


          return getAdditionalHistoricLayerIds(
            pin
          )
            .some(
              (sharedLayerId) =>
                sharedLayerId ===
                  layerId &&
                sharedHistoricLayerIsPublished(
                  sharedLayerId
                )
            )
        }


      const historicRecordMatchesCategory =
        (pin, categoryId) => {
          if (
            pin?.historicCategoryId ===
              categoryId
          ) {
            if (
              pin?.historicLayerId
            ) {
              const primaryLayer =
                historicLayerById.get(
                  pin.historicLayerId
                )


              if (
                primaryLayer?.categoryId ===
                  categoryId &&
                sharedHistoricLayerIsPublished(
                  pin.historicLayerId
                )
              ) {
                return true
              }
            }
            else {
              const primaryCategory =
                historicCategoryById.get(
                  categoryId
                )


              if (
                primaryCategory?.status ===
                  'published'
              ) {
                return true
              }
            }
          }


          return getAdditionalHistoricLayerIds(
            pin
          )
            .some(
              (sharedLayerId) => {
                if (
                  !sharedHistoricLayerIsPublished(
                    sharedLayerId
                  )
                ) {
                  return false
                }


                return (
                  historicLayerById.get(
                    sharedLayerId
                  )?.categoryId ===
                    categoryId
                )
              }
            )
        }


      const historicRecordHasPublishedMembership =
        (pin) => {
          const membershipLayerIds =
            [
              String(
                pin?.historicLayerId ||
                ''
              )
                .trim(),
              ...getAdditionalHistoricLayerIds(
                pin
              ),
            ]
              .filter(
                Boolean
              )


          if (
            membershipLayerIds.length >
              0
          ) {
            return membershipLayerIds.some(
              sharedHistoricLayerIsPublished
            )
          }


          if (
            pin?.historicCategoryId
          ) {
            return (
              historicCategoryById.get(
                pin.historicCategoryId
              )?.status ===
                'published'
            )
          }


          return true
        }


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
            historicRecordHasPublishedMembership
          )
          .filter(
            (pin) =>
              historicIssueFilter ===
                'all' ||
              (
                Array.isArray(
                  pin.issueIds
                ) &&
                pin.issueIds.includes(
                  historicIssueFilter
                )
              )
          )
          .filter(
            (pin) =>
              historicCategoryFilter ===
                'all' ||
              historicRecordMatchesCategory(
                pin,
                historicCategoryFilter
              )
          )
          .filter(
            (pin) =>
              historicLayerFilter ===
                'all' ||
              historicRecordMatchesLayer(
                pin,
                historicLayerFilter
              )
          )
          .filter(
            () =>
              true
          )
          .map(
            (pin) => {
              const membershipLayerIds =
                [
                  String(
                    pin.historicLayerId ||
                    ''
                  )
                    .trim(),
                  ...getAdditionalHistoricLayerIds(
                    pin
                  ),
                ]
                  .filter(
                    Boolean
                  )


              let layer =
                historicLayerFilter !==
                  'all'
                  ? historicLayerById.get(
                      historicLayerFilter
                    )
                  : null


              if (
                !layer &&
                historicCategoryFilter !==
                  'all'
              ) {
                layer =
                  membershipLayerIds
                    .map(
                      (layerId) =>
                        historicLayerById.get(
                          layerId
                        )
                    )
                    .find(
                      (candidate) =>
                        candidate?.categoryId ===
                          historicCategoryFilter &&
                        sharedHistoricLayerIsPublished(
                          candidate.id
                        )
                    ) ||
                  null
              }


              if (
                !layer
              ) {
                layer =
                  membershipLayerIds
                    .map(
                      (layerId) =>
                        historicLayerById.get(
                          layerId
                        )
                    )
                    .find(
                      (candidate) =>
                        candidate &&
                        sharedHistoricLayerIsPublished(
                          candidate.id
                        )
                    ) ||
                  null
              }


              const category =
                layer?.categoryId
                  ? historicCategoryById.get(
                      layer.categoryId
                    )
                  : historicCategoryById.get(
                      pin.historicCategoryId
                    )


              const storyPinIcon =
                String(
                  pin.pinIcon ||
                  ''
                )
                  .trim()


              const pinIcon =
                storyPinIcon &&
                storyPinIcon !==
                  'map-pin'
                  ? storyPinIcon
                  : (
                      layer?.pinIcon ||
                      category?.pinIcon ||
                      storyPinIcon ||
                      'map-pin'
                    )


              return {
                pin: {
                  ...pin,

                  pinIcon,

                  historicCategoryTitle:
                    category?.title ||
                    pin.category ||
                    '',

                  historicLayerTitle:
                    layer?.title ||
                    '',
                },

                pinType:
                  'historic',
              }
            }
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
              newsRecordMatchesHistoryRange({
                pin,
                range:
                  newsRangeFilter,
              })
          )
          .filter(
            (pin) =>
              newsRangeFilter ===
                'curated'
                ? newsRecordCanAppearAtZoom({
                    pin,
                    zoom,
                  })
                : true
          )
          .filter(
            (pin) =>
              newsRangeFilter ===
                'curated'
                ? newsPinIsVisibleAtZoom({
                    pin,
                    zoom,
                    selectedPinId,
                  })
                : true
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
      liveTtcAlertsVisible &&
      cityKey ===
        'toronto' &&
      activePinFilter !==
        'news'
    ) {
      const existingIds =
        new Set(
          visiblePins
            .map(
              (item) =>
                String(
                  item?.pin?.id ||
                  ''
                )
            )
            .filter(
              Boolean
            )
        )


      const liveTtcPins =
        serverNewsItems
          .filter(
            (pin) =>
              belongsToCity(
                pin,
                cityKey
              ) &&
              isTtcPin(
                pin
              ) &&
              pin?.active !==
                false
          )
          .filter(
            (pin) =>
              !existingIds.has(
                String(
                  pin?.id ||
                  ''
                )
              )
          )
          .map(
            (pin) => ({
              pin,

              pinType:
                'news',
            })
          )


      visiblePins = [
        ...visiblePins,
        ...liveTtcPins,
      ]
    }


    if (
      activePinFilter ===
        'news' ||
      liveTtcAlertsVisible
    ) {
      visiblePins =
        spreadActiveTtcMarkers({
          map,
          items:
            visiblePins,
        })
    }


    const historicStackGroups =
      new Map()

    const newSportsStackGroups =
      new Map()


    if (
      activePinFilter ===
        'historic'
    ) {
      visiblePins.forEach(
        (item) => {
          const stackKey =
            getHistoricStackKey(
              item
            )


          if (
            !stackKey
          ) {
            return
          }


          const group =
            historicStackGroups.get(
              stackKey
            ) ||
            []


          group.push(
            item
          )

          historicStackGroups.set(
            stackKey,
            group
          )
        }
      )
    }


    if (
      activePinFilter ===
        'historic'
    ) {
      historicStackGroups.forEach(
        (
          group
        ) => {
          if (
            group.length <=
              1
          ) {
            return
          }


          const offsets =
            getHistoricStackOffsets(
              group.length
            )


          group.forEach(
            (
              item,
              index
            ) => {
              item.markerOffset =
                offsets[
                  index
                ] ||
                [0, 0]
            }
          )
        }
      )
    }


    // Sports schedules can legitimately place several games on the exact
    // same venue coordinate. Give each game its own visual hit target while
    // leaving the stored geographic coordinate untouched.
    if (
      activePinFilter ===
        'new'
    ) {
      visiblePins.forEach(
        (item) => {
          const stackKey =
            getNewSportsStackKey(
              item
            )


          if (
            !stackKey
          ) {
            return
          }


          const group =
            newSportsStackGroups.get(
              stackKey
            ) ||
            []


          group.push(
            item
          )

          newSportsStackGroups.set(
            stackKey,
            group
          )
        }
      )


      newSportsStackGroups.forEach(
        (group) => {
          if (
            group.length <=
              1
          ) {
            return
          }


          const offsets =
            getHistoricStackOffsets(
              group.length
            )


          group.forEach(
            (
              item,
              index
            ) => {
              item.markerOffset =
                offsets[
                  index
                ] ||
                [0, 0]
            }
          )
        }
      )
    }


    const historicLayerPulseActive =
      activePinFilter ===
        'historic' &&
      historicLayerFilter !==
        'all' &&
      historicLayerPulseRef.current.layerId ===
        historicLayerFilter &&
      Date.now() <
        historicLayerPulseRef.current.pulseUntil


    visiblePins.forEach(
      ({
        pin,
        pinType,
        markerOffset,
      },
      visibleIndex
      ) => {
        if (
          pinType ===
            'news' &&
          isTtcRoutePin(
            pin
          )
        ) {
          const routeStops =
            getTtcRouteStops(
              pin
            )


          const routeArtifact =
            addTtcRouteToMap({
              map,
              pin,
              index:
                visibleIndex,
            })


          if (
            routeArtifact
          ) {
            ttcRouteArtifactsRef.current.push(
              routeArtifact
            )
          }


          const endpoints = [
            {
              ...pin,

              longitude:
                routeStops[0].longitude,

              latitude:
                routeStops[0].latitude,

              location:
                routeStops[0].label ||
                pin.location,

              ttcRouteEndpoint:
                'start',
            },
            {
              ...pin,

              longitude:
                routeStops[
                  routeStops.length -
                  1
                ].longitude,

              latitude:
                routeStops[
                  routeStops.length -
                  1
                ].latitude,

              location:
                routeStops[
                  routeStops.length -
                  1
                ].label ||
                pin.location,

              ttcRouteEndpoint:
                'end',
            },
          ]


          endpoints.forEach(
            (
              endpointPin,
              endpointIndex
            ) => {
              const marker =
                createMarker({
                  map,
                  pin:
                    endpointPin,
                  pinType,
                  markerOffset:
                    [0, 0],
                  city,
                  selectedLayer,
                  homeLayer,
                  historicIssueFilter,
                  historicCategoryFilter,
                  historicLayerFilter,
                  newSubtypeFilter,
                  onDirections,
                  onSeeItThen,
                  onReturnToHistoricIssueHome,
                })


              if (
                !marker
              ) {
                return
              }


              markersRef.current.push(
                marker
              )


              if (
                endpointIndex ===
                  0
              ) {
                markerByIdRef.current.set(
                  pin.id,
                  marker
                )
              }
            }
          )


          return
        }


        const marker =
          createMarker({
            map,
            pin,
            pinType,
            markerOffset,
            city,
            selectedLayer,
            homeLayer,
            historicIssueFilter,
            historicCategoryFilter,
            historicLayerFilter,
            newSubtypeFilter,

            historicLayerPulse:
              pinType ===
                'historic' &&
              historicLayerPulseActive,

            onDirections,
            onSeeItThen,
            onReturnToHistoricIssueHome,
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


      ttcRouteArtifactsRef.current.forEach(
        (
          artifact
        ) => {
          removeTtcRouteArtifact({
            map,
            artifact,
          })
        }
      )


      ttcRouteArtifactsRef.current =
        []


      markerByIdRef.current =
        new Map()
    }
  }, [
    map,
    cityKey,
    markerSelectedLayerKey,
    activePinFilter,
    liveTtcAlertsVisible,
    historicIssueFilter,
    historicCategoryFilter,
    historicLayerFilter,
    homeLayer?.year,
    homeLayer?.layerType,
    newsRangeFilter,
    newSubtypeFilter,
    newBusinessRangeFilter,
    contentRevision,
    markerServerNewsItems,
    markerServerNewItems,
    markerViewportRevision,
    markerActivityRevision,
    markerSelectedPinKey,
    onDirections,
    onSeeItThen,
    onReturnToHistoricIssueHome,
  ])

  useEffect(() => {
    if (
      !map ||
      !selectedPinId
    ) {
      return
    }


    let cancelled =
      false
    let frameId =
      null
    let reopenTimer =
      null


    const openSelectedPopup =
      () => {
        if (
          cancelled
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
      }


    const openAfterCurrentCameraMove =
      () => {
        if (
          cancelled
        ) {
          return
        }


        frameId =
          window.requestAnimationFrame(
            openSelectedPopup
          )
      }


    if (
      map.isMoving?.()
    ) {
      map.once(
        'moveend',
        openAfterCurrentCameraMove
      )
    }
    else {
      reopenTimer =
        window.setTimeout(
          openSelectedPopup,
          0
        )
    }


    return () => {
      cancelled =
        true


      if (
        reopenTimer !==
          null
      ) {
        window.clearTimeout(
          reopenTimer
        )
      }


      if (
        frameId !==
          null
      ) {
        window.cancelAnimationFrame(
          frameId
        )
      }


      map.off(
        'moveend',
        openAfterCurrentCameraMove
      )
    }
  }, [
    map,
    selectedPinId,
    activePinFilter,
    newSubtypeFilter,
    selectedLayer?.year,
    selectedLayer?.layerType,
  ])


  useEffect(() => {
    if (
      !map ||
      selectedPinId
    ) {
      return
    }


    markersRef.current.forEach(
      (marker) => {
        const popup =
          marker.getPopup?.()


        if (
          popup?.isOpen?.()
        ) {
          popup.remove()
        }
      }
    )
  }, [
    map,
    selectedPinId,
  ])

  return null
}


export default MapPins