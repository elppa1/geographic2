const TTC_ALERTS_ENDPOINT =
  '/api/geographic/toronto/ttc/alerts'


const TTC_PUBLIC_URL =
  'https://www.ttc.ca/service-advisories/all-service-alerts'


const TTC_SOURCE_NAME =
  'Toronto Transit Commission'


const TTC_ATTRIBUTION =
  'Contains information licensed under the Open Government Licence - Toronto'


const DEFAULT_EXPIRY_HOURS =
  12


// ============================================================
// TEXT
// ============================================================

function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\u00a0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// SLUG
// ============================================================

function slugify(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
}


// ============================================================
// EFFECT
// ============================================================

function normalizeEffect(
  value
) {
  return cleanText(
    value
  )
    .toUpperCase()
}


function inferEffectFromText(
  record
) {
  const text =
    (
      cleanText(
        record?.headerText
      ) +
      ' ' +
      cleanText(
        record?.descriptionText
      )
    )
      .toLowerCase()


  if (
    /\bno service\b/.test(
      text
    )
  ) {
    return 'NO_SERVICE'
  }


  if (
    /\bdetour\b/.test(
      text
    )
  ) {
    return 'DETOUR'
  }


  if (
    /\bbypass\b/.test(
      text
    ) ||
    /\bnot stopping\b/.test(
      text
    )
  ) {
    return 'BYPASS'
  }


  if (
    /\bdelays?\b/.test(
      text
    )
  ) {
    return 'SIGNIFICANT_DELAYS'
  }


  if (
    /\bstop moved\b/.test(
      text
    ) ||
    /\btemporary stop\b/.test(
      text
    )
  ) {
    return 'STOP_MOVED'
  }


  if (
    /\breduced service\b/.test(
      text
    )
  ) {
    return 'REDUCED_SERVICE'
  }


  if (
    /\bservice change\b/.test(
      text
    ) ||
    /\bshort turn\b/.test(
      text
    )
  ) {
    return 'MODIFIED_SERVICE'
  }


  return ''
}


function getEffectiveEffect(
  record
) {
  const feedEffect =
    normalizeEffect(
      record?.effect
    )


  if (
    feedEffect &&
    ![
      'UNKNOWN_EFFECT',
      'NO_EFFECT',
    ]
      .includes(
        feedEffect
      )
  ) {
    return feedEffect
  }


  return inferEffectFromText(
    record
  )
}


function effectLabel(
  effect
) {
  const normalized =
    normalizeEffect(
      effect
    )


  const labels = {
    NO_SERVICE:
      'No service',

    REDUCED_SERVICE:
      'Reduced service',

    SIGNIFICANT_DELAYS:
      'Delay',

    DETOUR:
      'Detour',

    BYPASS:
      'Bypass',

    STOP_MOVED:
      'Stop moved',

    MODIFIED_SERVICE:
      'Service change',

    OTHER_EFFECT:
      'Service alert',
  }


  return (
    labels[
      normalized
    ] ||
    'Service alert'
  )
}


function usefulRecord(
  record
) {
  const text =
    (
      cleanText(
        record?.headerText
      ) +
      ' ' +
      cleanText(
        record?.descriptionText
      )
    )
      .toLowerCase()


  // Do not turn general rider reminders or accessibility-only
  // notices into map NEWS pins.
  if (
    /\belevator\b/.test(
      text
    ) ||
    /\bescalator\b/.test(
      text
    ) ||
    /\bproof of payment\b/.test(
      text
    ) ||
    /\blook both ways\b/.test(
      text
    )
  ) {
    return false
  }


  return Boolean(
    getEffectiveEffect(
      record
    )
  )
}


// ============================================================
// ROUTES
// ============================================================

function getRouteNumbers(
  record
) {
  const entities =
    Array.isArray(
      record?.informedEntities
    )
      ? record.informedEntities
      : []


  const routes =
    []


  entities.forEach(
    (
      entity
    ) => {
      const values = [
        entity?.routeId,
        entity?.trip?.routeId,
      ]


      values.forEach(
        (
          value
        ) => {
          const route =
            cleanText(
              value
            )


          if (
            route &&
            !routes.includes(
              route
            )
          ) {
            routes.push(
              route
            )
          }
        }
      )
    }
  )


  return routes
}


// ============================================================
// LOCATION
// ============================================================

function cleanLocationPiece(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /^[,;:\-–—\s]+/,
      ''
    )
    .replace(
      /[,;:\-–—\s]+$/,
      ''
    )
    .replace(
      /\s+(?:due to|while we|because of|for the duration).*$/i,
      ''
    )
    .trim()
}


function stationName(
  value
) {
  const text =
    cleanLocationPiece(
      value
    )


  if (
    !text
  ) {
    return ''
  }


  if (
    /\bstation\b/i.test(
      text
    )
  ) {
    return text
  }


  return (
    text +
    ' Station'
  )
}


function extractNearLocation(
  text
) {
  const match =
    text.match(
      /\bnear\s+(.{3,90}?)(?:\s+at\s+bus bay\b|\s+while\b|\s+due to\b|[.;]|$)/i
    )


  if (
    !match
  ) {
    return ''
  }


  return cleanLocationPiece(
    match[1]
  )
}


function extractStreetAtStreet(
  text
) {
  const match =
    text.match(
      /\b([A-Za-z0-9.'’ -]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\s+at\s+([A-Za-z0-9.'’ -]+?(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Gt|Gate|Way|Cres|Crescent|Trl|Trail|Hwy|Highway))\b/i
    )


  if (
    !match
  ) {
    return ''
  }


  return (
    cleanLocationPiece(
      match[1]
    ) +
    ' & ' +
    cleanLocationPiece(
      match[2]
    )
  )
}


function extractBetweenLocation(
  text
) {
  const match =
    text.match(
      /\bbetween\s+(.{2,100}?)\s+and\s+(.{2,100}?)(?:\s+due to\b|\s+while\b|[.;]|$)/i
    )


  if (
    !match
  ) {
    return ''
  }


  const first =
    cleanLocationPiece(
      match[1]
    )


  const firstIntersection =
    extractStreetAtStreet(
      first
    )


  if (
    firstIntersection
  ) {
    return firstIntersection
  }


  if (
    /\bstation\b/i.test(
      first
    ) ||
    !/\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive)\b/i.test(
      first
    )
  ) {
    return stationName(
      first
    )
  }


  return first
}


function extractViaLocation(
  text
) {
  const match =
    text.match(
      /\bvia\s+(.{3,150}?)(?:\s+due to\b|\s+while\b|[.;]|$)/i
    )


  if (
    !match
  ) {
    return ''
  }


  const viaText =
    cleanLocationPiece(
      match[1]
    )


  const pieces =
    viaText
      .split(
        /\s*,\s*|\s+and\s+/i
      )
      .map(
        cleanLocationPiece
      )
      .filter(
        Boolean
      )


  if (
    pieces.length >=
      2
  ) {
    return (
      pieces[0] +
      ' & ' +
      pieces[1]
    )
  }


  return (
    pieces[0] ||
    ''
  )
}


function extractLocation(
  record
) {
  const description =
    cleanText(
      record?.descriptionText
    )


  const header =
    cleanText(
      record?.headerText
    )


  const combined =
    (
      description +
      ' ' +
      header
    )
      .trim()


  return (
    extractNearLocation(
      combined
    ) ||
    extractBetweenLocation(
      combined
    ) ||
    extractViaLocation(
      combined
    ) ||
    extractStreetAtStreet(
      combined
    )
  )
}


// ============================================================
// TIME
// ============================================================


function feedPublishedAt(
  payload
) {
  const timestamp =
    Number(
      payload?.feedTimestamp
    )


  if (
    Number.isFinite(
      timestamp
    ) &&
    timestamp >
      0
  ) {
    return new Date(
      timestamp *
      1000
    )
      .toISOString()
  }


  const updatedAt =
    new Date(
      payload?.updatedAt ||
      Date.now()
    )


  if (
    !Number.isNaN(
      updatedAt.getTime()
    )
  ) {
    return updatedAt
      .toISOString()
  }


  return new Date()
    .toISOString()
}


function getTtcSourceTime(
  record,
  payload
) {
  const periods =
    Array.isArray(
      record?.activePeriods
    )
      ? record.activePeriods
      : []


  const starts =
    periods
      .map(
        (
          period
        ) =>
          Number(
            period?.start
          )
      )
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            value
          ) &&
          value >
            0
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )


  // GTFS-Realtime Alert has no dedicated "created at" field.
  //
  // When TTC supplies active_period.start, this is the closest
  // source-provided per-alert timestamp to "when this alert began".
  if (
    starts.length >
      0
  ) {
    return {
      value:
        new Date(
          starts[0] *
          1000
        )
          .toISOString(),

      kind:
        'active-period-start',
    }
  }


  // Some TTC alerts omit active periods entirely.
  //
  // In that case use the feed timestamp from the FIRST poll where
  // Geographic sees the alert. runReviewScraper preserves that first
  // value instead of replacing it every two minutes.
  return {
    value:
      feedPublishedAt(
        payload
      ),

    kind:
      'feed-first-observed',
  }
}


function buildExpiry(
  record,
  publishedAt
) {
  const periods =
    Array.isArray(
      record?.activePeriods
    )
      ? record.activePeriods
      : []


  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )


  const ends =
    periods
      .map(
        (
          period
        ) =>
          Number(
            period?.end
          )
      )
      .filter(
        (
          value
        ) =>
          Number.isFinite(
            value
          ) &&
          value >
            nowSeconds
      )
      .sort(
        (
          a,
          b
        ) =>
          a -
          b
      )


  if (
    ends.length >
      0
  ) {
    return new Date(
      ends[0] *
      1000
    )
      .toISOString()
  }


  const start =
    new Date(
      publishedAt
    )
      .getTime()


  const timestamp =
    Number.isFinite(
      start
    )
      ? start
      : Date.now()


  return new Date(
    timestamp +
    (
      DEFAULT_EXPIRY_HOURS *
      60 *
      60 *
      1000
    )
  )
    .toISOString()
}


// ============================================================
// TITLE + DESCRIPTION
// ============================================================

function buildTitle({
  routes,
  effect,
  location,
}) {
  const routeLabel =
    routes.length >
      0
      ? routes.join(
          ', '
        )
      : 'TTC'


  const status =
    effectLabel(
      effect
    )


  if (
    location
  ) {
    return (
      `${routeLabel} · ` +
      `${status} · ` +
      location
    )
  }


  return (
    `${routeLabel} · ` +
    status
  )
}


function buildDescription(
  record
) {
  const description =
    cleanText(
      record?.descriptionText
    )


  const header =
    cleanText(
      record?.headerText
    )


  if (
    description &&
    header &&
    !description
      .toLowerCase()
      .includes(
        header.toLowerCase()
      )
  ) {
    return (
      `${header}. ` +
      description
    )
  }


  return (
    description ||
    header ||
    'TTC service disruption.'
  )
}


// ============================================================
// RECORD
// ============================================================

function buildExternalId(
  record,
  routes,
  location
) {
  const directId =
    cleanText(
      record?.id
    )


  if (
    directId
  ) {
    return (
      'ttc-alert-' +
      slugify(
        directId
      )
    )
  }


  return (
    'ttc-alert-' +
    slugify(
      [
        routes.join(
          '-'
        ),
        record?.effect,
        location,
        record?.headerText,
      ]
        .join(
          '-'
        )
    )
  )
}


function buildRecord(
  record,
  payload
) {
  if (
    !usefulRecord(
      record
    )
  ) {
    return null
  }


  const routes =
    getRouteNumbers(
      record
    )


  const effectiveEffect =
    getEffectiveEffect(
      record
    )


  const location =
    extractLocation(
      record
    )


  // Geographic is a map. Route-wide alerts with no usable place
  // stay out until we can attach them to a location.
  if (
    !location
  ) {
    return null
  }


  const sourceTime =
    getTtcSourceTime(
      record,
      payload
    )


  const publishedAt =
    sourceTime.value


  return {
    externalId:
      buildExternalId(
        record,
        routes,
        location
      ),

    scraperSource:
      'ttc-gtfs-rt-alerts',

    origin:
      'ttc-gtfs-rt',

    newsroomSource:
      'ttc-gtfs-rt',

    city:
      'toronto',

    type:
      'news',

    category:
      'ttc',

    title:
      buildTitle({
        routes,

        effect:
          effectiveEffect,

        location,
      }),

    description:
      buildDescription(
        record
      ),

    location,

    intersection:
      location,

    longitude:
      null,

    latitude:
      null,

    pinPositionMode:
      'auto',

    searchedLongitude:
      null,

    searchedLatitude:
      null,

    source:
      TTC_SOURCE_NAME,

    sourceUrl:
      cleanText(
        record?.url
      ) ||
      TTC_PUBLIC_URL,

    attribution:
      TTC_ATTRIBUTION,

    officialSource:
      true,

    publishedAt,

    ttcSourceTime:
      publishedAt,

    ttcSourceTimeKind:
      sourceTime.kind,

    expiresAt:
      buildExpiry(
        record,
        publishedAt
      ),

    active:
      true,

    ttcEffect:
      effectiveEffect,

    ttcCause:
      cleanText(
        record?.cause
      ),

    ttcRoutes:
      routes,
  }
}


// ============================================================
// FETCH
// ============================================================

async function fetchTtcAlerts() {
  const response =
    await fetch(
      TTC_ALERTS_ENDPOINT,
      {
        cache:
          'no-store',

        headers: {
          Accept:
            'application/json',
        },
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TTC SERVICE ALERTS REQUEST FAILED · ' +
        response.status
      )
    )
  }


  return response.json()
}


// ============================================================
// SCRAPE
// ============================================================

export async function scrapeTtcServiceAlerts() {
  const payload =
    await fetchTtcAlerts()


  const rawRecords =
    Array.isArray(
      payload?.records
    )
      ? payload.records
      : []


  const records =
    rawRecords
      .map(
        (
          record
        ) =>
          buildRecord(
            record,
            payload
          )
      )
      .filter(
        Boolean
      )


  console.log(
    'TTC ACTIVE SERVICE ALERTS:',
    rawRecords.length,
    'RAW ·',
    records.length,
    'MAPPABLE'
  )


  records.forEach(
    (
      record
    ) => {
      console.log(
        'TTC ALERT:',
        record.title,
        '→',
        record.location
      )
    }
  )


  return records
}