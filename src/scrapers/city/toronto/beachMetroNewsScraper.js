const BEACH_METRO_ENDPOINT =
  '/api/toronto/beachmetro/category/news/'


const BEACH_METRO_PROXY =
  '/api/toronto/beachmetro'


const BEACH_METRO_PUBLIC_URL =
  'https://beachmetro.com'


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
// PUBLIC URL
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
      BEACH_METRO_PUBLIC_URL +
      href
    )
  }


  return (
    BEACH_METRO_PUBLIC_URL +
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
      /^https?:\/\/(?:www\.)?beachmetro\.com/i,
      ''
    )


  return (
    BEACH_METRO_PROXY +
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


  return (
    /\/20\d{2}\/\d{2}\/\d{2}\//.test(
      href
    )
  )
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
        /^https?:\/\/(?:www\.)?beachmetro\.com/i,
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
    'beachmetro-' +
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


    const text =
      cleanText(
        current.textContent
      )


    const dateMatch =
      text.match(
        /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
      )


    if (
      dateMatch
    ) {
      const date =
        normalizeDate(
          dateMatch[0]
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


  return (
    text.length >=
      20 &&
    text.length <=
      300
  )
}


// ============================================================
// STREET ADDRESS
// ============================================================

const STREET_ADDRESS_PATTERN =
  /\b\d{1,5}(?:\s*-\s*\d{1,5})?\s+[A-Z0-9][A-Za-z0-9.'’\- ]{0,60}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?(?=\s|,|\.|;|:|\)|\]|$)/gi


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
  /\b[A-Z0-9][A-Za-z0-9.'’\- ]{0,50}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?\s*(?:and|&|at|near|\/|@)\s*[A-Z0-9][A-Za-z0-9.'’\- ]{0,50}?\s(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Trail|Highway|Hwy\.?|Parkway|Pkwy\.?|Lane|Ln\.?|Court|Ct\.?|Place|Pl\.?|Way)(?:\s+(?:East|West|North|South|E\.?|W\.?|N\.?|S\.?))?/gi


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
// KNOWN LOCATIONS
// ============================================================
//
// IMPORTANT:
//
// These are only used against the HEADLINE.
//
// We intentionally do not use neighbourhood words from the
// article body because related stories / navigation can cause
// false matches.
//
// ============================================================

const KNOWN_LOCATIONS = [
  'Scarborough Southwest',
  'Beaches-East York',
  'Kingston Road Village',
  'Birchmount Community Centre',
  'West Scarborough Neighbourhood Community Centre',
  'The Beaches',
  'The Beach',
  'East Toronto',
  'East York',
  'Scarborough',
  'Leslieville',
  'Riverdale',
  'Birch Cliff',
  'Cliffside',
  'Guildwood',
  'Woodbine Park',
  'Kew Gardens',
  'Danforth',
  'Kingston Road',
  'Queen Street East',
  'Danforth Avenue',
  'Woodbine Avenue',
  'Main Street',
  'Victoria Park Avenue',
  'Birchmount Road',
  'Coxwell Avenue',
  'Greenwood Avenue',
  'Pape Avenue',
  'Broadview Avenue',
  'Pharmacy Avenue',
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


  if (
    text.includes(
      'toronto'
    )
  ) {
    return 'Toronto'
  }


  return ''
}


// ============================================================
// GEOGRAPHIC LOCATION
// ============================================================
//
// ARTICLE BODY:
//   exact addresses + intersections only
//
// HEADLINE:
//   addresses + intersections + neighbourhoods
//
// This prevents unrelated article/footer text from assigning
// the wrong neighbourhood.
//
// ============================================================

function extractGeographicLocation(
  body,
  title
) {
  // ----------------------------------------------------------
  // EXACT ADDRESS FROM BODY
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // INTERSECTION FROM BODY
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // EXACT ADDRESS FROM TITLE
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // INTERSECTION FROM TITLE
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // NEIGHBOURHOOD FROM TITLE ONLY
  // ----------------------------------------------------------

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
      'collision'
    ) ||
    text.includes(
      'road closure'
    )
  ) {
    return 'transit'
  }


  if (
    text.includes(
      'candidate'
    ) ||
    text.includes(
      'election'
    ) ||
    text.includes(
      'byelection'
    ) ||
    text.includes(
      'by-election'
    ) ||
    text.includes(
      'councillor'
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
      'meeting'
    ) ||
    text.includes(
      'event'
    ) ||
    text.includes(
      'parade'
    ) ||
    text.includes(
      'fair'
    )
  ) {
    return 'event'
  }


  if (
    text.includes(
      'park'
    ) ||
    text.includes(
      'flood'
    ) ||
    text.includes(
      'storm'
    ) ||
    text.includes(
      'environment'
    )
  ) {
    return 'environment'
  }


  if (
    text.includes(
      'community'
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
// ARTICLE CONTENT ELEMENT
// ============================================================

function getArticleContentElement(
  document
) {
  const selectors = [
    '.entry-content',
    '.td-post-content',
    '.post-content',
    '.article-content',
    '.article-body',
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
        '.addtoany_share_save_container',
        '.related',
        '.related-posts',
        '.yarpp-related',
        '.td-related-row',
        '.td_block_related_posts',
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
  const metaDescription =
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
    metaDescription
  ) {
    return metaDescription
  }


  const ogDescription =
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
    ogDescription
  ) {
    return ogDescription
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
      BEACH_METRO_ENDPOINT
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'BEACH METRO REQUEST FAILED · ' +
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
          'BEACH METRO ARTICLE FAILED · ' +
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
      'BEACH METRO ARTICLE ERROR:',
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
    'BEACH METRO LOCATION:',
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
      'Beach Metro Community News',

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

export async function scrapeBeachMetroNews() {
  const archiveHtml =
    await fetchArchivePage()


  const candidates =
    parseArchivePage(
      archiveHtml
    )


  console.log(
    'BEACH METRO CANDIDATES:',
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
    'BEACH METRO GEOGRAPHIC NEWS:',
    records.length
  )


  console.log(
    'BEACH METRO EXACT ADDRESSES:',
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