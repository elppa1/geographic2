const CP24_ENDPOINT =
  '/api/toronto/cp24/'


const CP24_PUBLIC_URL =
  'https://www.cp24.com'


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
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// URL
// ============================================================

function makeAbsoluteUrl(
  value
) {
  const href =
    cleanText(
      value
    )


  if (
    !href
  ) {
    return ''
  }


  if (
    href.startsWith(
      'https://'
    ) ||
    href.startsWith(
      'http://'
    )
  ) {
    return href
  }


  if (
    href.startsWith(
      '/'
    )
  ) {
    return (
      CP24_PUBLIC_URL +
      href
    )
  }


  return (
    CP24_PUBLIC_URL +
    '/' +
    href
  )
}


// ============================================================
// ARTICLE URL
// ============================================================

function isArticleUrl(
  value
) {
  const href =
    cleanText(
      value
    )


  return (
    href.includes(
      '/news/'
    ) ||
    href.includes(
      '/local/'
    )
  )
}


// ============================================================
// EXTERNAL ID
// ============================================================

function createExternalId(
  url
) {
  const value =
    cleanText(
      url
    )
      .replace(
        /^https?:\/\/(?:www\.)?cp24\.com/i,
        ''
      )
      .replace(
        /[?#].*$/,
        ''
      )
      .replace(
        /[^a-z0-9]+/gi,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )
      .toLowerCase()


  return (
    'cp24-' +
    value
  )
}


// ============================================================
// TORONTO SIGNALS
// ============================================================

const TORONTO_SIGNALS = [
  'toronto',
  'downtown',
  'scarborough',
  'etobicoke',
  'north york',
  'east york',
  'york',
  'the beaches',
  'beaches',
  'liberty village',
  'parkdale',
  'roncesvalles',
  'leslieville',
  'riverdale',
  'cabbagetown',
  'the annex',
  'annex',
  'kensington market',
  'chinatown',
  'yorkville',
  'forest hill',
  'leaside',
  'don mills',
  'eglinton',
  'yonge',
  'bloor',
  'dundas',
  'queen street',
  'king street',
  'college street',
  'spadina',
  'bathurst',
  'dufferin',
  'ossington',
  'jane street',
  'finch',
  'sheppard',
  'lawrence',
  'danforth',
  'pape',
  'broadview',
  'parliament',
  'jarvis',
  'church street',
  'bay street',
  'university avenue',
  'lakeshore',
  'lake shore',
  'gardiner',
  'don valley parkway',
  'dvp',
  'ttc',
  'union station',
  'pearson airport',
  'toronto police',
]


// ============================================================
// OUTSIDE TORONTO SIGNALS
// ============================================================

const OUTSIDE_TORONTO_SIGNALS = [
  'mississauga',
  'brampton',
  'caledon',
  'vaughan',
  'markham',
  'richmond hill',
  'aurora',
  'newmarket',
  'pickering',
  'ajax',
  'whitby',
  'oshawa',
  'oakville',
  'burlington',
  'hamilton',
  'milton',
  'ontario provincial police',
  'opp ',
]


// ============================================================
// TORONTO STORY
// ============================================================

function isTorontoStory(
  title
) {
  const text =
    cleanText(
      title
    )
      .toLowerCase()


  if (
    !text
  ) {
    return false
  }


  const hasTorontoSignal =
    TORONTO_SIGNALS.some(
      (
        signal
      ) =>
        text.includes(
          signal
        )
    )


  if (
    hasTorontoSignal
  ) {
    return true
  }


  const hasOutsideSignal =
    OUTSIDE_TORONTO_SIGNALS.some(
      (
        signal
      ) =>
        text.includes(
          signal
        )
    )


  if (
    hasOutsideSignal
  ) {
    return false
  }


  return false
}


// ============================================================
// STREET TYPES
// ============================================================

const STREET_TYPE =
  (
    '(?:' +
    'Street|' +
    'Avenue|' +
    'Road|' +
    'Drive|' +
    'Boulevard|' +
    'Crescent|' +
    'Trail|' +
    'Highway|' +
    'Parkway|' +
    'Lane|' +
    'Court|' +
    'Place|' +
    'Way' +
    ')'
  )


// ============================================================
// INTERSECTION
// ============================================================

function extractIntersection(
  title
) {
  const text =
    cleanText(
      title
    )


  const pattern =
    new RegExp(
      (
        '([A-Z0-9][A-Za-z0-9 .\'’-]{1,60}?' +
        STREET_TYPE +
        '(?:\\s+(?:East|West|North|South))?' +
        '\\s+(?:and|at|near)\\s+' +
        '[A-Z0-9][A-Za-z0-9 .\'’-]{1,60}?' +
        STREET_TYPE +
        '(?:\\s+(?:East|West|North|South))?' +
        ')'
      ),
      'i'
    )


  const match =
    text.match(
      pattern
    )


  if (
    !match?.[1]
  ) {
    return ''
  }


  return cleanText(
    match[1]
  )
}


// ============================================================
// LOCATION PHRASES
// ============================================================

const KNOWN_LOCATIONS = [
  'Scarborough',
  'Etobicoke',
  'North York',
  'East York',
  'Downtown Toronto',
  'Downtown',
  'The Beaches',
  'Liberty Village',
  'Parkdale',
  'Roncesvalles',
  'Leslieville',
  'Riverdale',
  'Cabbagetown',
  'The Annex',
  'Kensington Market',
  'Chinatown',
  'Yorkville',
  'Forest Hill',
  'Leaside',
  'Don Mills',
  'Union Station',
  'Pearson Airport',
]


// ============================================================
// LOCATION
// ============================================================

function extractLocation(
  title
) {
  const intersection =
    extractIntersection(
      title
    )


  if (
    intersection
  ) {
    return intersection
  }


  const text =
    cleanText(
      title
    )


  for (
    const location of
    KNOWN_LOCATIONS
  ) {
    if (
      text
        .toLowerCase()
        .includes(
          location.toLowerCase()
        )
    ) {
      return location
    }
  }


  if (
    text
      .toLowerCase()
      .includes(
        'toronto'
      )
  ) {
    return 'Toronto'
  }


  return ''
}


// ============================================================
// CATEGORY
// ============================================================

function getCategory(
  title
) {
  const text =
    cleanText(
      title
    )
      .toLowerCase()


  if (
    text.includes(
      'ttc'
    ) ||
    text.includes(
      'subway'
    ) ||
    text.includes(
      'streetcar'
    ) ||
    text.includes(
      'bus '
    ) ||
    text.includes(
      'traffic'
    ) ||
    text.includes(
      'collision'
    ) ||
    text.includes(
      'gardiner'
    ) ||
    text.includes(
      'dvp'
    ) ||
    text.includes(
      'road closure'
    )
  ) {
    return 'transit'
  }


  if (
    text.includes(
      'festival'
    ) ||
    text.includes(
      'concert'
    ) ||
    text.includes(
      'exhibition'
    ) ||
    text.includes(
      'museum'
    ) ||
    text.includes(
      'film'
    ) ||
    text.includes(
      'music'
    )
  ) {
    return 'culture'
  }


  if (
    text.includes(
      'event'
    ) ||
    text.includes(
      'parade'
    ) ||
    text.includes(
      'celebration'
    )
  ) {
    return 'event'
  }


  if (
    text.includes(
      'park'
    ) ||
    text.includes(
      'weather'
    ) ||
    text.includes(
      'flood'
    ) ||
    text.includes(
      'storm'
    ) ||
    text.includes(
      'heat warning'
    ) ||
    text.includes(
      'air quality'
    )
  ) {
    return 'environment'
  }


  if (
    text.includes(
      'mayor'
    ) ||
    text.includes(
      'council'
    ) ||
    text.includes(
      'councillor'
    ) ||
    text.includes(
      'city hall'
    ) ||
    text.includes(
      'election'
    )
  ) {
    return 'politics'
  }


  if (
    text.includes(
      'community'
    ) ||
    text.includes(
      'neighbourhood'
    ) ||
    text.includes(
      'neighborhood'
    ) ||
    text.includes(
      'school'
    )
  ) {
    return 'community'
  }


  return 'city'
}


// ============================================================
// DATE
// ============================================================

function normalizeDate(
  value
) {
  const text =
    cleanText(
      value
    )


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
    return ''
  }


  return date
    .toISOString()
    .slice(
      0,
      10
    )
}


// ============================================================
// DATE FROM ELEMENT
// ============================================================

function getElementDate(
  element
) {
  let current =
    element


  for (
    let level = 0;
    level < 6;
    level++
  ) {
    if (
      !current
    ) {
      break
    }


    const time =
      current.querySelector?.(
        'time'
      )


    if (
      time
    ) {
      const date =
        normalizeDate(
          time.getAttribute(
            'datetime'
          ) ||
          time.textContent
        )


      if (
        date
      ) {
        return date
      }
    }


    current =
      current.parentElement
  }


  return ''
}


// ============================================================
// TITLE
// ============================================================

function getArticleTitle(
  anchor
) {
  const titleAttribute =
    cleanText(
      anchor.getAttribute(
        'title'
      )
    )


  if (
    titleAttribute
  ) {
    return titleAttribute
  }


  const heading =
    anchor.querySelector(
      'h1, h2, h3, h4, h5, h6'
    )


  if (
    heading
  ) {
    return cleanText(
      heading.textContent
    )
  }


  return cleanText(
    anchor.textContent
  )
}


// ============================================================
// VALID TITLE
// ============================================================

function isUsefulTitle(
  title
) {
  const text =
    cleanText(
      title
    )


  if (
    text.length <
    20
  ) {
    return false
  }


  if (
    text.length >
    300
  ) {
    return false
  }


  const lower =
    text.toLowerCase()


  const junk = [
    'read more',
    'watch more',
    'latest news',
    'more news',
    'view more',
    'see more',
    'click here',
  ]


  return !junk.some(
    (
      value
    ) =>
      lower ===
      value
  )
}


// ============================================================
// BUILD RECORD
// ============================================================

function buildRecord(
  anchor
) {
  const href =
    cleanText(
      anchor.getAttribute(
        'href'
      )
    )


  if (
    !isArticleUrl(
      href
    )
  ) {
    return null
  }


  const title =
    getArticleTitle(
      anchor
    )


  if (
    !isUsefulTitle(
      title
    )
  ) {
    return null
  }


  if (
    !isTorontoStory(
      title
    )
  ) {
    return null
  }


  const sourceUrl =
    makeAbsoluteUrl(
      href
    )


  if (
    !sourceUrl
  ) {
    return null
  }


  const location =
    extractLocation(
      title
    )


  // ----------------------------------------------------------
  // Geographic is a MAP.
  //
  // For the first CP24 pass, don't put a story into REVIEW
  // unless we can at least identify a Toronto location.
  // ----------------------------------------------------------

  if (
    !location
  ) {
    return null
  }


  const publishedAt =
    getElementDate(
      anchor
    )


  return {
    externalId:
      createExternalId(
        sourceUrl
      ),

    city:
      'toronto',

    type:
      'news',

    category:
      getCategory(
        title
      ),

    title,

    description:
      '',

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
      'CP24',

    sourceUrl,

    publishedAt,

    expiresAt:
      '',

    active:
      true,
  }
}


// ============================================================
// PARSE
// ============================================================

function parseCp24Page(
  html
) {
  const parser =
    new DOMParser()


  const document =
    parser.parseFromString(
      html,
      'text/html'
    )


  const anchors = [
    ...document.querySelectorAll(
      'a[href]'
    ),
  ]


  const records =
    []


  const seen =
    new Set()


  anchors.forEach(
    (
      anchor
    ) => {
      const record =
        buildRecord(
          anchor
        )


      if (
        !record
      ) {
        return
      }


      if (
        seen.has(
          record.externalId
        )
      ) {
        return
      }


      seen.add(
        record.externalId
      )


      records.push(
        record
      )
    }
  )


  return records
}


// ============================================================
// FETCH
// ============================================================

async function fetchCp24Page() {
  const response =
    await fetch(
      CP24_ENDPOINT
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'CP24 REQUEST FAILED · ' +
        `${response.status}`
      )
    )
  }


  return response.text()
}


// ============================================================
// SCRAPER
// ============================================================

export async function scrapeCp24News() {
  const html =
    await fetchCp24Page()


  const records =
    parseCp24Page(
      html
    )


  console.log(
    'CP24 GEOGRAPHIC NEWS:',
    records.length
  )


  return records
}