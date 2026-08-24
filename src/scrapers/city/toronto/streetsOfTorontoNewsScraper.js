const STREETS_OF_TORONTO_ENDPOINT =
  '/api/toronto/streetsoftoronto/'


const STREETS_OF_TORONTO_PROXY =
  '/api/toronto/streetsoftoronto'


const STREETS_OF_TORONTO_PUBLIC_URL =
  'https://streetsoftoronto.com'


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
      STREETS_OF_TORONTO_PUBLIC_URL +
      href
    )
  }


  return (
    STREETS_OF_TORONTO_PUBLIC_URL +
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
      /^https?:\/\/(?:www\.)?streetsoftoronto\.com/i,
      ''
    )


  return (
    STREETS_OF_TORONTO_PROXY +
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


  const lower =
    href.toLowerCase()


  const blocked = [
    '/category/',
    '/tag/',
    '/author/',
    '/about',
    '/contact',
    '/advertise',
    '/privacy',
    '/terms',
    '/wp-content/',
    '/wp-json/',
    '/feed/',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'twitter.com',
    'x.com/',
    'youtube.com',
    'mailto:',
    'javascript:',
  ]


  if (
    blocked.some(
      (
        item
      ) =>
        lower.includes(
          item
        )
    )
  ) {
    return false
  }


  if (
    lower.startsWith(
      STREETS_OF_TORONTO_PUBLIC_URL
    )
  ) {
    return true
  }


  if (
    href.startsWith(
      '/'
    )
  ) {
    return true
  }


  return false
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
        /^https?:\/\/(?:www\.)?streetsoftoronto\.com/i,
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
    'streetsoftoronto-' +
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
// ELEMENT DATE
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


    const text =
      cleanText(
        current.textContent
      )


    const match =
      text.match(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
      )


    if (
      match
    ) {
      const date =
        normalizeDate(
          match[0]
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
    titleAttribute.length >=
    20
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
    'continue reading',
    'home',
    'news',
    'contact',
    'advertise',
    'subscribe',
  ]


  return !junk.includes(
    lower
  )
}


// ============================================================
// STREET ADDRESS
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
  /\b[A-Z0-9][A-Za-z0-9.'’\- ]{0,55}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?\s*(?:and|&|at|near|\/|@)\s*[A-Z0-9][A-Za-z0-9.'’\- ]{0,55}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?/gi


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
// KNOWN TORONTO LOCATIONS
// ============================================================

const KNOWN_LOCATIONS = [
  'Downtown Toronto',
  'Midtown Toronto',
  'North York',
  'East York',
  'Scarborough',
  'Etobicoke',
  'Yorkville',
  'Rosedale',
  'Forest Hill',
  'Leaside',
  'Yonge and Eglinton',
  'Yonge-Eglinton',
  'The Annex',
  'Leslieville',
  'Riverdale',
  'The Beaches',
  'The Beach',
  'Liberty Village',
  'King West',
  'Queen West',
  'Kensington Market',
  'St. Lawrence Market',
  'Distillery District',
  'Cabbagetown',
  'High Park',
  'Parkdale',
  'Roncesvalles',
  'Bloor West Village',
  'Danforth',
  'Greektown',
  'Little Italy',
  'Little Portugal',
  'Junction',
  'The Junction',
  'West Queen West',
  'Church-Wellesley',
  'Davisville',
  'Summerhill',
  'Moore Park',
  'Lawrence Park',
  'Bedford Park',
  'Willowdale',
  'Don Mills',
  'Bayview Village',
  'Agincourt',
  'Guildwood',
  'Birch Cliff',
  'Cliffside',
  'Mimico',
  'Long Branch',
  'New Toronto',
  'Humber Bay',
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
// LOCATION
// ============================================================
//
// Article body is trusted for exact addresses/intersections.
//
// Broader neighbourhood fallback comes from the headline first
// so related-story/footer text doesn't assign a random area.
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


  const titleLocation =
    extractKnownLocation(
      title
    )


  if (
    titleLocation
  ) {
    return {
      location:
        titleLocation,

      intersection:
        titleLocation,

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
      'condo'
    ) ||
    text.includes(
      'development'
    ) ||
    text.includes(
      'tower'
    ) ||
    text.includes(
      'rezoning'
    ) ||
    text.includes(
      'housing'
    )
  ) {
    return 'development'
  }


  if (
    text.includes(
      'restaurant'
    ) ||
    text.includes(
      'bar '
    ) ||
    text.includes(
      'cafe'
    ) ||
    text.includes(
      'coffee'
    ) ||
    text.includes(
      'opening'
    ) ||
    text.includes(
      'closed'
    ) ||
    text.includes(
      'closure'
    )
  ) {
    return 'business'
  }


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
      'candidate'
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
      'festival'
    ) ||
    text.includes(
      'concert'
    ) ||
    text.includes(
      'theatre'
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
      'park'
    ) ||
    text.includes(
      'environment'
    ) ||
    text.includes(
      'storm'
    ) ||
    text.includes(
      'weather'
    )
  ) {
    return 'environment'
  }


  return 'city'
}


// ============================================================
// ARTICLE CONTENT ELEMENT
// ============================================================

function getArticleContentElement(
  document
) {
  const selectors = [
    '.entry-content',
    '.post-content',
    '.article-content',
    '.article-body',
    '.single-post-content',
    '.td-post-content',
    'article .content',
    'article',
    'main',
  ]


  for (
    const selector of
    selectors
  ) {
    const element =
      document.querySelector(
        selector
      )


    if (
      !element
    ) {
      continue
    }


    const text =
      cleanText(
        element.textContent
      )


    if (
      text.length >
      100
    ) {
      return element
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
        '.sharedaddy',
        '.share',
        '.social',
        '.related',
        '.related-posts',
        '.recommended',
        '.newsletter',
        '.advertisement',
        '.ad',
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
      'p, li'
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
        20
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
        'meta[name="article:published_time"]'
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
      'a[href]'
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
      STREETS_OF_TORONTO_ENDPOINT
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'STREETS OF TORONTO REQUEST FAILED · ' +
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
          'STREETS OF TORONTO ARTICLE FAILED · ' +
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
      'STREETS OF TORONTO ARTICLE ERROR:',
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


  if (
    !body
  ) {
    return null
  }


  const geographic =
    extractGeographicLocation(
      body,
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
    'STREETS OF TORONTO LOCATION:',
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
      'Streets of Toronto',

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

export async function scrapeStreetsOfTorontoNews() {
  const archiveHtml =
    await fetchArchivePage()


  const candidates =
    parseArchivePage(
      archiveHtml
    )


  console.log(
    'STREETS OF TORONTO CANDIDATES:',
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
    'STREETS OF TORONTO GEOGRAPHIC NEWS:',
    records.length
  )


  console.log(
    'STREETS OF TORONTO EXACT ADDRESSES:',
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