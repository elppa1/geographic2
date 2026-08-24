// ============================================================
// BLOGTO SCRAPER
// ============================================================
//
// Purpose:
//
// Use blogTO as a discovery source for meaningful physical
// changes to Toronto:
//
// - restaurants
// - stores
// - businesses
// - developments
// - public spaces
// - transit
// - closures
// - relocations
//
// This scraper does NOT publish anything.
//
// It only creates candidate records.
// runReviewScraper handles:
// - age filtering
// - duplicate checking
// - processed-record checking
// - sending candidates to REVIEW
//
// ============================================================


// ============================================================
// FEED
// ============================================================

const BLOGTO_FEED_URL =
  '/api/toronto/blogto'


// ============================================================
// TEXT
// ============================================================

function cleanText(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /<!\[CDATA\[|\]\]>/g,
      ''
    )
    .replace(
      /<[^>]*>/g,
      ' '
    )
    .replace(
      /&nbsp;/gi,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// NORMALIZED MATCH TEXT
// ============================================================

function normalizeMatchText(
  value
) {
  return String(
    value ||
    ''
  )
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// DATE
// ============================================================

function normalizeDate(
  value
) {
  if (
    !value
  ) {
    return ''
  }


  const date =
    new Date(
      value
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
// EXTERNAL ID
// ============================================================

function makeExternalId(
  link
) {
  const normalized =
    String(
      link ||
      ''
    )
      .toLowerCase()
      .replace(
        /^https?:\/\//,
        ''
      )
      .replace(
        /^www\./,
        ''
      )
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )


  return (
    'blogto-' +
    normalized
  )
}


// ============================================================
// PLACE / PHYSICAL SUBJECT SIGNALS
// ============================================================
//
// A story should be about something that can reasonably
// become a point or feature on the Geographic map.
//
// ============================================================

const PLACE_SIGNALS = [
  'restaurant',
  'restaurants',
  'cafe',
  'café',
  'coffee shop',
  'bakery',
  'bar',
  'pub',
  'brewery',
  'food hall',
  'food court',
  'pizzeria',

  'store',
  'shop',
  'retailer',
  'grocery store',
  'supermarket',
  'market',
  'boutique',
  'mall',
  'shopping centre',
  'shopping center',

  'hotel',
  'theatre',
  'theater',
  'cinema',
  'venue',
  'museum',
  'gallery',

  'building',
  'development',
  'redevelopment',
  'condo',
  'condos',
  'tower',
  'towers',
  'office building',

  'park',
  'public space',
  'plaza',
  'trail',
  'waterfront',

  'ttc station',
  'subway station',
  'go station',
  'train station',
  'transit station',
  'streetcar line',
  'subway line',
  'transit line',
]


// ============================================================
// CHANGE SIGNALS
// ============================================================
//
// These describe an actual physical change.
//
// ============================================================

const CHANGE_SIGNALS = [
  'new restaurant',
  'new cafe',
  'new café',
  'new coffee shop',
  'new bakery',
  'new bar',
  'new store',
  'new shop',
  'new grocery store',
  'new supermarket',
  'new business',
  'new hotel',
  'new venue',
  'new building',
  'new development',
  'new condo',
  'new tower',
  'new park',
  'new public space',
  'new plaza',
  'new trail',
  'new station',

  'now open',
  'just opened',
  'has opened',
  'have opened',
  'recently opened',
  'newly opened',

  'opening soon',
  'set to open',
  'will open',
  'plans to open',
  'planning to open',
  'expected to open',
  'about to open',

  'coming to toronto',
  'coming to the city',
  'coming soon',

  'closing soon',
  'set to close',
  'will close',
  'is closing',
  'are closing',
  'has closed',
  'have closed',
  'shutting down',
  'shuts down',
  'permanently closed',

  'moving to',
  'relocating to',
  'has relocated',
  'has moved',

  'redevelopment',
  'redeveloped',
  'being redeveloped',

  'under construction',
  'construction underway',
  'construction has started',
  'construction begins',
  'construction started',

  'approved for',
  'approved development',
  'approved project',

  'being demolished',
  'set for demolition',
  'will be demolished',
  'demolition underway',

  'renovation',
  'renovations',
  'being renovated',
  'major renovation',
]


// ============================================================
// STRONG TITLE SIGNALS
// ============================================================
//
// Headlines are much more trustworthy than incidental words
// buried in an RSS description.
//
// ============================================================

const STRONG_TITLE_PATTERNS = [
  /\bnew\s+(restaurant|cafe|café|coffee shop|bakery|bar|store|shop|business|hotel|venue|building|development|condo|tower|park|public space|plaza|station)\b/i,

  /\b(restaurant|cafe|café|coffee shop|bakery|bar|store|shop|business|hotel|venue|building|development|condo|tower|park|station)\b.{0,60}\b(opening|opens|opened|closing|closes|closed|relocating|moving)\b/i,

  /\b(opening|opens|opened|closing|closes|closed)\b.{0,60}\b(restaurant|cafe|café|coffee shop|bakery|bar|store|shop|business|hotel|venue|building|park|station)\b/i,

  /\bcoming to toronto\b/i,

  /\bunder construction\b/i,

  /\bconstruction underway\b/i,

  /\bredevelopment\b/i,

  /\bbeing redeveloped\b/i,

  /\bset for demolition\b/i,

  /\bbeing demolished\b/i,
]


// ============================================================
// OBVIOUS NON-GEOGRAPHIC NEWS
// ============================================================
//
// These are useful for rejecting broad news stories that happen
// to contain words like "opening", "station", or "construction".
//
// We do NOT reject automatically if the headline itself has a
// strong physical-change pattern.
//
// ============================================================

const NON_PLACE_SIGNALS = [
  'mortgage',
  'mortgages',
  'interest rate',
  'interest rates',
  'real estate market',
  'housing market',

  'concert',
  'concerts',
  'traffic nightmare',
  'traffic delays',

  'soccer',
  'hockey',
  'baseball',
  'basketball',
  'nhl',
  'nba',
  'mlb',
  'mls',

  'weather',
  'forecast',

  'lottery',
  'lotto',

  'celebrity',
  'actor',
  'actress',
  'singer',

  'ride safety',
  'midway rides',

  'crime',
  'police investigation',
]


// ============================================================
// HELPERS
// ============================================================

function containsAny(
  text,
  signals
) {
  return signals.some(
    (signal) =>
      text.includes(
        signal
      )
  )
}


function matchesAny(
  text,
  patterns
) {
  return patterns.some(
    (pattern) =>
      pattern.test(
        text
      )
  )
}


// ============================================================
// CATEGORY
// ============================================================

function detectCategory(
  title,
  description
) {
  const text =
    normalizeMatchText(
      `${title} ${description}`
    )


  if (
    containsAny(
      text,
      [
        'restaurant',
        'cafe',
        'café',
        'coffee shop',
        'bakery',
        'bar',
        'pub',
        'brewery',
        'food hall',
        'food court',
        'pizzeria',
      ]
    )
  ) {
    return 'restaurant'
  }


  if (
    containsAny(
      text,
      [
        'store',
        'shop',
        'retailer',
        'grocery',
        'supermarket',
        'market',
        'boutique',
        'mall',
        'shopping centre',
        'shopping center',
      ]
    )
  ) {
    return 'store'
  }


  if (
    containsAny(
      text,
      [
        'condo',
        'development',
        'redevelopment',
        'building',
        'tower',
        'construction',
        'demolition',
      ]
    )
  ) {
    return 'development'
  }


  if (
    containsAny(
      text,
      [
        'ttc station',
        'subway station',
        'go station',
        'train station',
        'transit station',
        'streetcar line',
        'subway line',
        'transit line',
      ]
    )
  ) {
    return 'transit'
  }


  if (
    containsAny(
      text,
      [
        'park',
        'public space',
        'plaza',
        'trail',
        'waterfront',
      ]
    )
  ) {
    return 'public-space'
  }


  if (
    containsAny(
      text,
      [
        'hotel',
        'theatre',
        'theater',
        'cinema',
        'venue',
        'museum',
        'gallery',
      ]
    )
  ) {
    return 'culture'
  }


  return 'other'
}


// ============================================================
// STATUS
// ============================================================

function detectStatus(
  title,
  description
) {
  const text =
    normalizeMatchText(
      `${title} ${description}`
    )


  if (
    containsAny(
      text,
      [
        'has closed',
        'have closed',
        'permanently closed',
        'shutting down',
        'shuts down',
      ]
    )
  ) {
    return 'closed'
  }


  if (
    containsAny(
      text,
      [
        'closing soon',
        'set to close',
        'will close',
        'is closing',
        'are closing',
      ]
    )
  ) {
    return 'closing'
  }


  if (
    containsAny(
      text,
      [
        'now open',
        'just opened',
        'has opened',
        'have opened',
        'recently opened',
        'newly opened',
      ]
    )
  ) {
    return 'open'
  }


  if (
    containsAny(
      text,
      [
        'opening soon',
        'set to open',
        'will open',
        'plans to open',
        'planning to open',
        'expected to open',
        'about to open',
        'coming to toronto',
        'coming soon',
      ]
    )
  ) {
    return 'opening-soon'
  }


  if (
    containsAny(
      text,
      [
        'under construction',
        'construction underway',
        'construction has started',
        'construction begins',
        'construction started',
      ]
    )
  ) {
    return 'construction'
  }


  if (
    containsAny(
      text,
      [
        'being demolished',
        'set for demolition',
        'will be demolished',
        'demolition underway',
      ]
    )
  ) {
    return 'demolition'
  }


  if (
    containsAny(
      text,
      [
        'moving to',
        'relocating to',
        'has relocated',
        'has moved',
      ]
    )
  ) {
    return 'relocation'
  }


  if (
    containsAny(
      text,
      [
        'approved for',
        'approved development',
        'approved project',
      ]
    )
  ) {
    return 'approved'
  }


  return 'change'
}


// ============================================================
// NEW-THING TEST
// ============================================================
//
// Rule:
//
// 1. A strong physical-change headline can pass immediately.
//
// OR
//
// 2. The article must contain BOTH:
//      - a place / physical subject
//      - a meaningful change signal
//
// Broad news signals cause rejection unless the headline itself
// clearly describes a physical change.
//
// This is intentionally conservative. Missing an occasional
// article is better than flooding REVIEW with irrelevant news.
//
// ============================================================

function looksLikeNewThing(
  title,
  description
) {
  const titleText =
    normalizeMatchText(
      title
    )


  const fullText =
    normalizeMatchText(
      `${title} ${description}`
    )


  const strongTitleMatch =
    matchesAny(
      titleText,
      STRONG_TITLE_PATTERNS
    )


  if (
    strongTitleMatch
  ) {
    return true
  }


  const hasNonPlaceSignal =
    containsAny(
      fullText,
      NON_PLACE_SIGNALS
    )


  if (
    hasNonPlaceSignal
  ) {
    return false
  }


  const hasPlaceSignal =
    containsAny(
      fullText,
      PLACE_SIGNALS
    )


  if (
    !hasPlaceSignal
  ) {
    return false
  }


  const hasChangeSignal =
    containsAny(
      fullText,
      CHANGE_SIGNALS
    )


  if (
    !hasChangeSignal
  ) {
    return false
  }


  return true
}


// ============================================================
// XML HELPERS
// ============================================================

function getTagText(
  item,
  tagName
) {
  const elements =
    item.getElementsByTagName(
      tagName
    )


  if (
    !elements ||
    elements.length ===
      0
  ) {
    return ''
  }


  return cleanText(
    elements[0]
      .textContent
  )
}


// ============================================================
// REPAIR RSS
// ============================================================
//
// blogTO's FeedBurner XML currently uses media:* elements
// without declaring the media namespace.
//
// Add the missing namespace before DOMParser sees it.
//
// ============================================================

function repairBlogToXml(
  xmlText
) {
  let repaired =
    String(
      xmlText ||
      ''
    )


  const usesMediaNamespace =
    /<\/?media:/i.test(
      repaired
    )


  const declaresMediaNamespace =
    /xmlns:media\s*=/i.test(
      repaired
    )


  if (
    usesMediaNamespace &&
    !declaresMediaNamespace
  ) {
    repaired =
      repaired.replace(
        /<rss\b([^>]*)>/i,
        (
          match,
          attributes
        ) => (
          '<rss' +
          attributes +
          ' xmlns:media="http://search.yahoo.com/mrss/">'
        )
      )
  }


  return repaired
}


// ============================================================
// PARSE RSS
// ============================================================

function parseBlogToFeed(
  xmlText
) {
  const parser =
    new DOMParser()


  const repairedXml =
    repairBlogToXml(
      xmlText
    )


  const document =
    parser.parseFromString(
      repairedXml,
      'text/xml'
    )


  const parserError =
    document.querySelector(
      'parsererror'
    )


  if (
    parserError
  ) {
    console.error(
      'BLOGTO RSS PARSER ERROR:',
      parserError.textContent
    )


    throw new Error(
      'BLOGTO RSS COULD NOT BE PARSED'
    )
  }


  const items =
    Array.from(
      document.getElementsByTagName(
        'item'
      )
    )


  console.log(
    'BLOGTO RSS ITEMS:',
    items.length
  )


  const records =
    []


  for (
    const item
    of items
  ) {
    const title =
      getTagText(
        item,
        'title'
      )


    const link =
      getTagText(
        item,
        'link'
      )


    const description =
      getTagText(
        item,
        'description'
      )


    const published =
      getTagText(
        item,
        'pubDate'
      )


    if (
      !title ||
      !link
    ) {
      continue
    }


    if (
      !looksLikeNewThing(
        title,
        description
      )
    ) {
      continue
    }


    records.push({
      externalId:
        makeExternalId(
          link
        ),

      city:
        'toronto',

      type:
        'new',

      category:
        detectCategory(
          title,
          description
        ),

      status:
        detectStatus(
          title,
          description
        ),

      title,

      description,

      location:
        '',

      intersection:
        '',

      longitude:
        null,

      latitude:
        null,

      announcedAt:
        normalizeDate(
          published
        ),

      expectedAt:
        '',

      source:
        'blogTO',

      sourceUrl:
        link,

      active:
        false,

      reviewStatus:
        'pending',

      receivedAt:
        new Date()
          .toISOString(),
    })
  }


  return records
}


// ============================================================
// SCRAPE
// ============================================================

export async function scrapeBlogToNew() {
  console.log(
    'BLOGTO SCRAPER START'
  )


  const response =
    await fetch(
      BLOGTO_FEED_URL
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'BLOGTO FEED FAILED · ' +
        `${response.status}`
      )
    )
  }


  const xmlText =
    await response.text()


  console.log(
    'BLOGTO FEED RECEIVED:',
    xmlText.length,
    'characters'
  )


  const records =
    parseBlogToFeed(
      xmlText
    )


  console.log(
    'BLOGTO NEW CANDIDATES:',
    records.length
  )


  console.table(
    records.map(
      (record) => ({
        date:
          record.announcedAt,

        category:
          record.category,

        status:
          record.status,

        title:
          record.title,
      })
    )
  )


  return records
}