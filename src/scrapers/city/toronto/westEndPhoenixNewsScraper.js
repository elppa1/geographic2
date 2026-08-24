const WEST_END_PHOENIX_ENDPOINT =
  '/api/toronto/westendphoenix/'


const WEST_END_PHOENIX_PROXY =
  '/api/toronto/westendphoenix'


const WEST_END_PHOENIX_PUBLIC_URL =
  'https://www.westendphoenix.com'


const MAX_ARTICLES =
  30


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
// ABSOLUTE URL
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
      'http://'
    ) ||
    href.startsWith(
      'https://'
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
      WEST_END_PHOENIX_PUBLIC_URL +
      href
    )
  }


  return (
    WEST_END_PHOENIX_PUBLIC_URL +
    '/' +
    href
  )
}


// ============================================================
// PROXY URL
// ============================================================

function makeProxyUrl(
  publicUrl
) {
  const value =
    cleanText(
      publicUrl
    )


  if (
    !value
  ) {
    return ''
  }


  const path =
    value.replace(
      /^https?:\/\/(?:www\.)?westendphoenix\.com/i,
      ''
    )


  return (
    WEST_END_PHOENIX_PROXY +
    (
      path.startsWith(
        '/'
      )
        ? path
        : '/' + path
    )
  )
}


// ============================================================
// ARTICLE URL
// ============================================================
//
// West End Phoenix uses:
//
//   /stories/article-slug
//
// ============================================================

function isArticleUrl(
  value
) {
  const href =
    cleanText(
      value
    )


  if (
    !href
  ) {
    return false
  }


  try {
    const absolute =
      makeAbsoluteUrl(
        href
      )


    const url =
      new URL(
        absolute
      )


    if (
      !(
        url.hostname ===
          'westendphoenix.com' ||
        url.hostname ===
          'www.westendphoenix.com'
      )
    ) {
      return false
    }


    return url.pathname.startsWith(
      '/stories/'
    )
  }
  catch {
    return false
  }
}


// ============================================================
// EXTERNAL ID
// ============================================================

function createExternalId(
  url
) {
  const normalized =
    cleanText(
      url
    )
      .replace(
        /^https?:\/\/(?:www\.)?westendphoenix\.com/i,
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
    'westendphoenix-' +
    normalized
  )
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
// DATE FROM TEXT
// ============================================================

function getDateFromText(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
    )


  if (
    !match
  ) {
    return ''
  }


  return normalizeDate(
    match[0]
  )
}


// ============================================================
// ARCHIVE DATE
// ============================================================

function getElementDate(
  element
) {
  let current =
    element


  for (
    let level = 0;
    level < 7;
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


    const date =
      getDateFromText(
        current.textContent
      )


    if (
      date
    ) {
      return date
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
    titleAttribute.length >=
    15
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


  const text =
    cleanText(
      anchor.textContent
    )


  return text
    .replace(
      /\s*Read more\s*→?\s*$/i,
      ''
    )
    .trim()
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
      10 ||
    text.length >
      300
  ) {
    return false
  }


  const lower =
    text.toLowerCase()


  const blocked = [
    'read more',
    'read more →',
    'see all stories',
    'view all stories',
    'next',
    'previous',
  ]


  return !blocked.includes(
    lower
  )
}


// ============================================================
// STREET ADDRESS
// ============================================================
//
// Handles:
//
// 1544 Queen St. W.
// 72 Main St.
// 313 Pharmacy Ave.
// 100-120 King Street West
//
// ============================================================

const STREET_ADDRESS_PATTERN =
  /\b\d{1,5}(?:\s*-\s*\d{1,5})?\s+[A-Z0-9][A-Za-z0-9.'’\- ]{0,70}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?(?=\s|,|\.|;|:|\)|\]|$)/gi


// ============================================================
// EXTRACT ADDRESSES
// ============================================================

function extractStreetAddresses(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    !text
  ) {
    return []
  }


  const matches =
    text.match(
      STREET_ADDRESS_PATTERN
    ) ||
    []


  return [
    ...new Set(
      matches.map(
        (
          item
        ) =>
          cleanText(
            item
          )
      )
    ),
  ]
}


// ============================================================
// INTERSECTION
// ============================================================

const INTERSECTION_PATTERN =
  /\b(?:[A-Z0-9][A-Za-z0-9.'’\-]*\s+){0,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?\s*(?:and|&|at|near|\/|@)\s*(?:[A-Z0-9][A-Za-z0-9.'’\-]*\s+){0,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?/g


// ============================================================
// SHORT INTERSECTION
// ============================================================
//
// Community writing often says:
//
//   Queen and Dowling
//   Dundas and Ossington
//
// without repeating "Street" or "Avenue".
//
// ============================================================

const SHORT_INTERSECTION_PATTERN =
  /\b([A-Z][A-Za-z.'’\- ]{1,35})\s+(?:and|&|at)\s+([A-Z][A-Za-z.'’\- ]{1,35})(?=\s|,|\.|;|:|\)|$)/g


// ============================================================
// EXTRACT INTERSECTIONS
// ============================================================

function extractIntersections(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    !text
  ) {
    return []
  }


  const matches =
    text.match(
      INTERSECTION_PATTERN
    ) ||
    []


  return [
    ...new Set(
      matches.map(
        (
          item
        ) =>
          cleanText(
            item
          )
      )
    ),
  ]
}


// ============================================================
// SHORT TORONTO INTERSECTIONS
// ============================================================

const TORONTO_STREET_NAMES = [
  'Queen',
  'King',
  'Dundas',
  'Bloor',
  'College',
  'Bathurst',
  'Dufferin',
  'Lansdowne',
  'Ossington',
  'Dowling',
  'Roncesvalles',
  'Sorauren',
  'Jameson',
  'Keele',
  'Parkside',
  'Dovercourt',
  'Brock',
  'Sheridan',
  'Gladstone',
  'Atlantic',
  'Strachan',
  'Spadina',
]


function extractShortIntersection(
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


  SHORT_INTERSECTION_PATTERN.lastIndex =
    0


  let match


  while (
    (
      match =
        SHORT_INTERSECTION_PATTERN.exec(
          text
        )
    )
  ) {
    const first =
      cleanText(
        match[1]
      )


    const second =
      cleanText(
        match[2]
      )


    const firstKnown =
      TORONTO_STREET_NAMES.some(
        (
          street
        ) =>
          first
            .toLowerCase()
            .endsWith(
              street.toLowerCase()
            )
      )


    const secondKnown =
      TORONTO_STREET_NAMES.some(
        (
          street
        ) =>
          second
            .toLowerCase()
            .endsWith(
              street.toLowerCase()
            )
      )


    if (
      firstKnown &&
      secondKnown
    ) {
      return (
        first +
        ' & ' +
        second
      )
    }
  }


  return ''
}


// ============================================================
// WEST END LOCATIONS
// ============================================================

const KNOWN_LOCATIONS = [
  'West Queen West',
  'Liberty Village',
  'Little Portugal',
  'Little Tibet',
  'Bloor West Village',
  'Kensington Market',
  'Trinity Bellwoods',
  'Fort York',
  'High Park',
  'Parkdale',
  'Roncesvalles',
  'Brockton Village',
  'Bloordale',
  'Dufferin Grove',
  'Dovercourt Village',
  'The Junction',
  'Junction Triangle',
  'Wallace Emerson',
  'Corso Italia',
  'Little Italy',
  'Queen West',
  'Dundas West',
  'West End',
  'Toronto',
]


// ============================================================
// KNOWN LOCATION
// ============================================================

function extractKnownLocation(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()


  for (
    const location of
    KNOWN_LOCATIONS
  ) {
    if (
      text.includes(
        location.toLowerCase()
      )
    ) {
      return location
    }
  }


  return ''
}


// ============================================================
// GEOGRAPHIC LOCATION
// ============================================================
//
// Priority:
//
// 1. Exact article-body address
// 2. Full article-body intersection
// 3. Short known Toronto intersection
// 4. Exact headline address
// 5. Full headline intersection
// 6. Headline neighbourhood
// 7. Article neighbourhood
//
// ============================================================

function extractGeographicLocation(
  body,
  title
) {
  const bodyAddresses =
    extractStreetAddresses(
      body
    )


  if (
    bodyAddresses.length >
    0
  ) {
    return {
      location:
        bodyAddresses[0],

      intersection:
        bodyAddresses[0],

      precision:
        'address',
    }
  }


  const bodyIntersections =
    extractIntersections(
      body
    )


  if (
    bodyIntersections.length >
    0
  ) {
    return {
      location:
        bodyIntersections[0],

      intersection:
        bodyIntersections[0],

      precision:
        'intersection',
    }
  }


  const shortIntersection =
    extractShortIntersection(
      body
    )


  if (
    shortIntersection
  ) {
    return {
      location:
        shortIntersection,

      intersection:
        shortIntersection,

      precision:
        'intersection',
    }
  }


  const titleAddresses =
    extractStreetAddresses(
      title
    )


  if (
    titleAddresses.length >
    0
  ) {
    return {
      location:
        titleAddresses[0],

      intersection:
        titleAddresses[0],

      precision:
        'address',
    }
  }


  const titleIntersections =
    extractIntersections(
      title
    )


  if (
    titleIntersections.length >
    0
  ) {
    return {
      location:
        titleIntersections[0],

      intersection:
        titleIntersections[0],

      precision:
        'intersection',
    }
  }


  const titleKnown =
    extractKnownLocation(
      title
    )


  if (
    titleKnown
  ) {
    return {
      location:
        titleKnown,

      intersection:
        titleKnown,

      precision:
        'neighbourhood',
    }
  }


  const bodyKnown =
    extractKnownLocation(
      body
    )


  if (
    bodyKnown
  ) {
    return {
      location:
        bodyKnown,

      intersection:
        bodyKnown,

      precision:
        'neighbourhood',
    }
  }


  return {
    location:
      '',

    intersection:
      '',

    precision:
      '',
  }
}


// ============================================================
// CATEGORY
// ============================================================

function getCategory(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()


  if (
    text.includes(
      'restaurant'
    ) ||
    text.includes(
      'cafe'
    ) ||
    text.includes(
      'coffee'
    ) ||
    text.includes(
      'shop'
    ) ||
    text.includes(
      'business'
    ) ||
    text.includes(
      'opening'
    ) ||
    text.includes(
      'opened'
    ) ||
    text.includes(
      'closure'
    ) ||
    text.includes(
      'closed'
    )
  ) {
    return 'business'
  }


  if (
    text.includes(
      'condo'
    ) ||
    text.includes(
      'development'
    ) ||
    text.includes(
      'tower'
    ) ||
    text.includes(
      'housing'
    ) ||
    text.includes(
      'rezoning'
    )
  ) {
    return 'development'
  }


  if (
    text.includes(
      'ttc'
    ) ||
    text.includes(
      'streetcar'
    ) ||
    text.includes(
      'subway'
    ) ||
    text.includes(
      'traffic'
    ) ||
    text.includes(
      'road closure'
    )
  ) {
    return 'transit'
  }


  if (
    text.includes(
      'election'
    ) ||
    text.includes(
      'councillor'
    ) ||
    text.includes(
      'mayor'
    ) ||
    text.includes(
      'city hall'
    )
  ) {
    return 'politics'
  }


  if (
    text.includes(
      'concert'
    ) ||
    text.includes(
      'music'
    ) ||
    text.includes(
      'artist'
    ) ||
    text.includes(
      'theatre'
    ) ||
    text.includes(
      'film'
    ) ||
    text.includes(
      'festival'
    )
  ) {
    return 'culture'
  }


  if (
    text.includes(
      'community'
    ) ||
    text.includes(
      'neighbourhood'
    )
  ) {
    return 'community'
  }


  return 'city'
}


// ============================================================
// CONTENT ELEMENT
// ============================================================
//
// West End Phoenix is Squarespace.
//
// Squarespace article bodies commonly live inside:
//
//   article
//   .sqs-html-content
//   .blog-item-content
//
// ============================================================

function getArticleContentElement(
  document
) {
  const selectors = [
    '.blog-item-content',
    '.blog-item-wrapper',
    '.entry-content',
    '.sqs-html-content',
    'article',
    'main',
  ]


  for (
    const selector of
    selectors
  ) {
    const elements = [
      ...document.querySelectorAll(
        selector
      ),
    ]


    for (
      const element of
      elements
    ) {
      const text =
        cleanText(
          element.textContent
        )


      if (
        text.length >
        150
      ) {
        return element
      }
    }
  }


  return null
}


// ============================================================
// ARTICLE BODY
// ============================================================

function getArticleBody(
  document
) {
  const content =
    getArticleContentElement(
      document
    )


  if (
    !content
  ) {
    return ''
  }


  const clone =
    content.cloneNode(
      true
    )


  clone
    .querySelectorAll(
      [
        'script',
        'style',
        'nav',
        'footer',
        'form',
        '.newsletter',
        '.social',
        '.share',
        '.blog-item-pagination',
        '.blog-item-author-profile',
        '.related',
        '.related-posts',
      ].join(
        ', '
      )
    )
    .forEach(
      (
        element
      ) =>
        element.remove()
    )


  const paragraphs = [
    ...clone.querySelectorAll(
      'p, figcaption, blockquote'
    ),
  ]
    .map(
      (
        element
      ) =>
        cleanText(
          element.textContent
        )
    )
    .filter(
      (
        text
      ) =>
        text.length >
        15
    )


  if (
    paragraphs.length >
    0
  ) {
    return cleanText(
      paragraphs.join(
        ' '
      )
    )
  }


  return cleanText(
    clone.textContent
  )
}


// ============================================================
// IMAGE ALT TEXT
// ============================================================
//
// WEP sometimes puts an exact address directly in an image
// caption / alt description.
//
// That is useful geographic information and should be included
// in location extraction.
//
// ============================================================

function getImageText(
  document
) {
  return [
    ...document.querySelectorAll(
      'img'
    ),
  ]
    .map(
      (
        image
      ) =>
        cleanText(
          image.getAttribute(
            'alt'
          )
        )
    )
    .filter(
      (
        text
      ) =>
        text.length >
        5
    )
    .join(
      ' '
    )
}


// ============================================================
// DESCRIPTION
// ============================================================

function getDescription(
  document,
  body
) {
  const meta =
    cleanText(
      document
        .querySelector(
          'meta[name="description"]'
        )
        ?.getAttribute(
          'content'
        )
    )


  if (
    meta
  ) {
    return meta
  }


  const og =
    cleanText(
      document
        .querySelector(
          'meta[property="og:description"]'
        )
        ?.getAttribute(
          'content'
        )
    )


  if (
    og
  ) {
    return og
  }


  return body.slice(
    0,
    500
  )
}


// ============================================================
// ARTICLE DATE
// ============================================================

function getArticleDate(
  document,
  fallbackDate
) {
  const values = [
    document
      .querySelector(
        'meta[property="article:published_time"]'
      )
      ?.getAttribute(
        'content'
      ),

    document
      .querySelector(
        'meta[itemprop="datePublished"]'
      )
      ?.getAttribute(
        'content'
      ),

    document
      .querySelector(
        'time[datetime]'
      )
      ?.getAttribute(
        'datetime'
      ),
  ]


  for (
    const value of
    values
  ) {
    const date =
      normalizeDate(
        value
      )


    if (
      date
    ) {
      return date
    }
  }


  const bodyDate =
    getDateFromText(
      document.body?.textContent
    )


  if (
    bodyDate
  ) {
    return bodyDate
  }


  return fallbackDate
}


// ============================================================
// ARCHIVE CANDIDATE
// ============================================================

function buildCandidate(
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


  const sourceUrl =
    makeAbsoluteUrl(
      href
    )


  if (
    !sourceUrl
  ) {
    return null
  }


  return {
    externalId:
      createExternalId(
        sourceUrl
      ),

    title,

    sourceUrl,

    publishedAt:
      getElementDate(
        anchor
      ),
  }
}


// ============================================================
// PARSE ARCHIVE
// ============================================================

function parseArchivePage(
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
      'a[href*="/stories/"]'
    ),
  ]


  const candidates =
    []


  const seen =
    new Set()


  anchors.forEach(
    (
      anchor
    ) => {
      const candidate =
        buildCandidate(
          anchor
        )


      if (
        !candidate
      ) {
        return
      }


      if (
        seen.has(
          candidate.externalId
        )
      ) {
        return
      }


      seen.add(
        candidate.externalId
      )


      candidates.push(
        candidate
      )
    }
  )


  return candidates
}


// ============================================================
// FETCH ARCHIVE
// ============================================================

async function fetchArchivePage() {
  const response =
    await fetch(
      WEST_END_PHOENIX_ENDPOINT
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'WEST END PHOENIX REQUEST FAILED · ' +
        `${response.status}`
      )
    )
  }


  return response.text()
}


// ============================================================
// FETCH ARTICLE
// ============================================================

async function fetchArticle(
  sourceUrl
) {
  const endpoint =
    makeProxyUrl(
      sourceUrl
    )


  if (
    !endpoint
  ) {
    return ''
  }


  try {
    const response =
      await fetch(
        endpoint
      )


    if (
      !response.ok
    ) {
      console.warn(
        (
          'WEST END PHOENIX ARTICLE FAILED · ' +
          `${response.status} · ` +
          sourceUrl
        )
      )


      return ''
    }


    return response.text()
  }
  catch (
    error
  ) {
    console.warn(
      'WEST END PHOENIX ARTICLE ERROR:',
      sourceUrl,
      error
    )


    return ''
  }
}


// ============================================================
// ENRICH
// ============================================================

async function enrichCandidate(
  candidate
) {
  const html =
    await fetchArticle(
      candidate.sourceUrl
    )


  if (
    !html
  ) {
    return null
  }


  const parser =
    new DOMParser()


  const document =
    parser.parseFromString(
      html,
      'text/html'
    )


  const body =
    getArticleBody(
      document
    )


  const imageText =
    getImageText(
      document
    )


  const geographicText =
    cleanText(
      body +
      ' ' +
      imageText
    )


  if (
    !geographicText
  ) {
    return null
  }


  const geographic =
    extractGeographicLocation(
      geographicText,
      candidate.title
    )


  if (
    !geographic.location
  ) {
    return null
  }


  const combinedText =
    cleanText(
      (
        candidate.title +
        ' ' +
        body
      )
    )


  console.log(
    'WEST END PHOENIX LOCATION:',
    candidate.title,
    '→',
    geographic.location,
    `(${geographic.precision})`
  )


  return {
    externalId:
      candidate.externalId,

    city:
      'toronto',

    type:
      'news',

    category:
      getCategory(
        combinedText
      ),

    title:
      candidate.title,

    description:
      getDescription(
        document,
        body
      ),

    location:
      geographic.location,

    intersection:
      geographic.intersection,

    locationPrecision:
      geographic.precision,

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
      'West End Phoenix',

    sourceUrl:
      candidate.sourceUrl,

    publishedAt:
      getArticleDate(
        document,
        candidate.publishedAt
      ),

    expiresAt:
      '',

    active:
      true,
  }
}


// ============================================================
// SCRAPER
// ============================================================

export async function scrapeWestEndPhoenixNews() {
  const archiveHtml =
    await fetchArchivePage()


  const candidates =
    parseArchivePage(
      archiveHtml
    )


  console.log(
    'WEST END PHOENIX CANDIDATES:',
    candidates.length
  )


  const candidatesToInspect =
    candidates.slice(
      0,
      MAX_ARTICLES
    )


  const results =
    await Promise.all(
      candidatesToInspect.map(
        (
          candidate
        ) =>
          enrichCandidate(
            candidate
          )
      )
    )


  const records =
    results.filter(
      Boolean
    )


  console.log(
    'WEST END PHOENIX GEOGRAPHIC NEWS:',
    records.length
  )


  console.log(
    'WEST END PHOENIX EXACT ADDRESSES:',
    records.filter(
      (
        record
      ) =>
        record.locationPrecision ===
        'address'
    )
      .length
  )


  return records
}