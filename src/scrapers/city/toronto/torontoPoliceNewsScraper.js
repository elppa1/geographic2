const TORONTO_POLICE_ENDPOINT =
  '/api/toronto/tps/media-centre/news-releases/'


const TORONTO_POLICE_PUBLIC_URL =
  'https://www.tps.ca'


const MAX_PAGES =
  20


const MAX_AGE_DAYS =
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
}


// ============================================================
// DATE FROM TEXT
// ============================================================

function extractDateFromText(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}(?:,\s+\d{1,2}:\d{2}\s+(?:AM|PM))?/i
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
// CASE NUMBER
// ============================================================

function extractCaseNumber(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /Case\s*#:\s*([0-9-]+)/i
    )


  return match?.[1]
    ? cleanText(
        match[1]
      )
    : ''
}


// ============================================================
// DIVISION
// ============================================================

function extractDivision(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\b(\d{1,2}\s+Division)\b/i
    )


  return match?.[1]
    ? cleanText(
        match[1]
      )
    : ''
}


// ============================================================
// LOCATION CLEANUP
// ============================================================

function cleanLocation(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /^,\s*/,
      ''
    )
    .replace(
      /\s*,\s*$/,
      ''
    )
    .replace(
      /\s+area[,]?$/i,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// STREET LOCATION PATTERN
// ============================================================

const STREET_TYPE_PATTERN =
  (
    '(?:' +
    'Street|' +
    'Avenue|' +
    'Road|' +
    'Drive|' +
    'Boulevard|' +
    'Lane|' +
    'Gate|' +
    'Way|' +
    'Crescent|' +
    'Trail|' +
    'Highway|' +
    'Parkway|' +
    'Court|' +
    'Place|' +
    'Terrace' +
    ')'
  )


// ============================================================
// LOCATION FROM TITLE
// ============================================================

function extractLocationFromTitle(
  title
) {
  const text =
    cleanText(
      title
    )


  if (
    !text
  ) {
    return ''
  }


  // ----------------------------------------------------------
  // Most TPS headlines use:
  //
  // "... , Bathurst Street and St. Clair Avenue West area"
  //
  // First try the final comma-delimited portion.
  // ----------------------------------------------------------

  const commaParts =
    text.split(
      ','
    )


  if (
    commaParts.length >
    1
  ) {
    const lastPart =
      cleanLocation(
        commaParts[
          commaParts.length -
          1
        ]
      )


    if (
      lastPart &&
      /\band\b/i.test(
        lastPart
      ) &&
      new RegExp(
        STREET_TYPE_PATTERN,
        'i'
      ).test(
        lastPart
      )
    ) {
      return lastPart
    }
  }


  // ----------------------------------------------------------
  // Some releases omit the comma:
  //
  // "Missing Person Jane Street and Wilson Avenue area"
  //
  // Look for the final street + street intersection.
  // ----------------------------------------------------------

  const intersectionPattern =
    new RegExp(
      (
        '([A-Z0-9][A-Za-z0-9 .\'’-]{1,70}?' +
        STREET_TYPE_PATTERN +
        '(?:\\s+(?:East|West|North|South))?' +
        '\\s+and\\s+' +
        '[A-Z0-9][A-Za-z0-9 .\'’-]{1,70}?' +
        STREET_TYPE_PATTERN +
        '(?:\\s+(?:East|West|North|South))?' +
        ')\\s+area[,]?$'
      ),
      'i'
    )


  const intersectionMatch =
    text.match(
      intersectionPattern
    )


  if (
    intersectionMatch?.[1]
  ) {
    let location =
      cleanLocation(
        intersectionMatch[1]
      )


    // --------------------------------------------------------
    // The broad pattern can sometimes catch words from the
    // headline before the first street. Trim common prefixes.
    // --------------------------------------------------------

    const prefixSplit =
      location.split(
        /(?:Investigation|Alert|Person|Youth|Elopee|Collision)\s+/i
      )


    if (
      prefixSplit.length >
      1
    ) {
      location =
        prefixSplit[
          prefixSplit.length -
          1
        ]
    }


    return cleanLocation(
      location
    )
  }


  return ''
}


// ============================================================
// RELEASE ID
// ============================================================

function getReleaseIdFromUrl(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\/media-centre\/news-releases\/(\d+)/i
    )


  return match?.[1]
    ? match[1]
    : ''
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
      TORONTO_POLICE_PUBLIC_URL +
      href
    )
  }


  return (
    TORONTO_POLICE_PUBLIC_URL +
    '/' +
    href
  )
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
      'shooting'
    ) ||
    text.includes(
      'firearm'
    ) ||
    text.includes(
      'gun'
    )
  ) {
    return 'shooting'
  }


  if (
    text.includes(
      'collision'
    ) ||
    text.includes(
      'traffic collision'
    )
  ) {
    return 'collision'
  }


  if (
    text.includes(
      'missing person'
    ) ||
    text.includes(
      'missing youth'
    ) ||
    text.includes(
      'elopee'
    )
  ) {
    return 'missing'
  }


  if (
    text.includes(
      'road closure'
    ) ||
    text.includes(
      'roads closed'
    ) ||
    text.includes(
      'road closed'
    )
  ) {
    return 'road-closure'
  }


  if (
    text.includes(
      'stabbing'
    )
  ) {
    return 'stabbing'
  }


  if (
    text.includes(
      'robbery'
    )
  ) {
    return 'robbery'
  }


  if (
    text.includes(
      'assault'
    )
  ) {
    return 'assault'
  }


  return 'police'
}


// ============================================================
// EXPIRY
// ============================================================
//
// NEWS should feel current, not archival.
//
// Missing-person records stay live until TPS publishes a
// LOCATED / resolved update.
//
// Everything else is a short-lived live-news pin and expires
// after 24 hours.
//
// ============================================================

const DEFAULT_NEWS_EXPIRY_HOURS =
  24


function buildNewsExpiry(
  category
) {
  if (
    category ===
    'missing'
  ) {
    return ''
  }


  const date =
    new Date()


  date.setHours(
    date.getHours() +
    DEFAULT_NEWS_EXPIRY_HOURS
  )


  return date
    .toISOString()
}


// ============================================================
// RESOLVED / LOCATED
// ============================================================

function isResolvedRelease(
  title
) {
  const text =
    cleanText(
      title
    )
      .toLowerCase()


  return (
    text.startsWith(
      'located:'
    ) ||
    text.startsWith(
      'located -'
    ) ||
    text.includes(
      'has been located'
    )
  )
}


// ============================================================
// GEOGRAPHIC
// ============================================================

function isGeographicRelease(
  title
) {
  return Boolean(
    extractLocationFromTitle(
      title
    )
  )
}


// ============================================================
// RECENT
// ============================================================

function isRecentEnough(
  publishedAt
) {
  if (
    !publishedAt
  ) {
    return false
  }


  const timestamp =
    new Date(
      publishedAt
    )
      .getTime()


  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return false
  }


  const cutoff =
    Date.now() -
    (
      MAX_AGE_DAYS *
      24 *
      60 *
      60 *
      1000
    )


  return (
    timestamp >=
    cutoff
  )
}


// ============================================================
// RELEASE ANCHORS
// ============================================================

function getReleaseAnchors(
  document
) {
  return [
    ...document.querySelectorAll(
      'a[href*="/media-centre/news-releases/"]'
    ),
  ]
    .filter(
      (
        anchor
      ) => {
        const href =
          cleanText(
            anchor.getAttribute(
              'href'
            )
          )


        return Boolean(
          getReleaseIdFromUrl(
            href
          )
        )
      }
    )
}


// ============================================================
// CARD ELEMENT
// ============================================================

function findReleaseContainer(
  anchor
) {
  let current =
    anchor


  for (
    let level = 0;
    level < 8;
    level++
  ) {
    if (
      !current
    ) {
      break
    }


    const text =
      cleanText(
        current.textContent
      )


    if (
      /Case\s*#:/i.test(
        text
      ) ||
      /\b\d{1,2}\s+Division\b/i.test(
        text
      )
    ) {
      return current
    }


    current =
      current.parentElement
  }


  return (
    anchor.parentElement ||
    anchor
  )
}


// ============================================================
// TITLE
// ============================================================

function getAnchorTitle(
  anchor
) {
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
// BUILD RECORD FROM LINK
// ============================================================

function buildRecordFromAnchor(
  anchor
) {
  const href =
    cleanText(
      anchor.getAttribute(
        'href'
      )
    )


  const releaseId =
    getReleaseIdFromUrl(
      href
    )


  if (
    !releaseId
  ) {
    return null
  }


  const title =
    getAnchorTitle(
      anchor
    )


  if (
    !title
  ) {
    return null
  }


  const resolved =
    isResolvedRelease(
      title
    )


  const location =
    extractLocationFromTitle(
      title
    )


  const container =
    findReleaseContainer(
      anchor
    )


  const containerText =
    cleanText(
      container?.textContent
    )


  const publishedAt =
    extractDateFromText(
      containerText
    )


  const caseNumber =
    extractCaseNumber(
      containerText
    )


  const division =
    extractDivision(
      containerText
    )


  // ----------------------------------------------------------
  // Normal news pins need a geographic location.
  //
  // LOCATED / resolved releases are also preserved because
  // they can be used to remove an earlier missing-person pin.
  // A resolved release may not repeat the location, so a case
  // number is enough to keep it in the feed.
  // ----------------------------------------------------------

  if (
    !resolved &&
    !location
  ) {
    return null
  }


  if (
    resolved &&
    !location &&
    !caseNumber
  ) {
    return null
  }


  const sourceUrl =
    makeAbsoluteUrl(
      href
    )


  const category =
    getCategory(
      title
    )


  const descriptionParts =
    []


  if (
    division
  ) {
    descriptionParts.push(
      division
    )
  }


  if (
    caseNumber
  ) {
    descriptionParts.push(
      `Case #${caseNumber}`
    )
  }


  const description =
    descriptionParts.length >
    0
      ? (
          'Toronto Police Service news release. ' +
          descriptionParts.join(
            ' · '
          )
        )
      : 'Toronto Police Service news release.'


  return {
    externalId:
      (
        'toronto-police-release-' +
        releaseId
      ),

    city:
      'toronto',

    type:
      'news',

    category,

    incidentType:
      category,

    newsAgency:
      'police',

    action:
      resolved
        ? 'resolve'
        : 'publish',

    title,

    description,

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
      'Toronto Police Service',

    sourceUrl,

    publishedAt,

    expiresAt:
      resolved
        ? ''
        : buildNewsExpiry(
            category
          ),

    policeReleaseId:
      releaseId,

    policeCaseNumber:
      caseNumber,

    policeDivision:
      division,

    // Compatibility with the existing TPS auto-publisher,
    // which already knows how to match/remove records by this
    // field when a resolved update arrives.
    goNumber:
      caseNumber,

    officialSource:
      true,

    active:
      !resolved,
  }
}


// ============================================================
// PARSE PAGE
// ============================================================

function parseNewsReleasePage(
  html
) {
  const parser =
    new DOMParser()


  const document =
    parser.parseFromString(
      html,
      'text/html'
    )


  const anchors =
    getReleaseAnchors(
      document
    )


  const records =
    []


  const seenReleaseIds =
    new Set()


  anchors.forEach(
    (
      anchor
    ) => {
      const record =
        buildRecordFromAnchor(
          anchor
        )


      if (
        !record
      ) {
        return
      }


      if (
        seenReleaseIds.has(
          record.policeReleaseId
        )
      ) {
        return
      }


      seenReleaseIds.add(
        record.policeReleaseId
      )


      records.push(
        record
      )
    }
  )


  return records
}


// ============================================================
// PAGE URL
// ============================================================

function getPageEndpoint(
  page
) {
  if (
    page <=
    1
  ) {
    return TORONTO_POLICE_ENDPOINT
  }


  return (
    TORONTO_POLICE_ENDPOINT +
    `?page=${page}`
  )
}


// ============================================================
// FETCH PAGE
// ============================================================

async function fetchNewsReleasePage(
  page
) {
  const endpoint =
    getPageEndpoint(
      page
    )


  const response =
    await fetch(
      endpoint
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TORONTO POLICE REQUEST FAILED · ' +
        `${response.status} · ` +
        `PAGE ${page}`
      )
    )
  }


  const html =
    await response.text()


  return parseNewsReleasePage(
    html
  )
}


// ============================================================
// OLDEST DATE
// ============================================================

function getOldestPublishedAt(
  records
) {
  const timestamps =
    records
      .map(
        (
          record
        ) => {
          if (
            !record.publishedAt
          ) {
            return null
          }


          const timestamp =
            new Date(
              record.publishedAt
            )
              .getTime()


          return Number.isNaN(
            timestamp
          )
            ? null
            : timestamp
        }
      )
      .filter(
        (
          timestamp
        ) =>
          timestamp !==
          null
      )


  if (
    timestamps.length ===
    0
  ) {
    return null
  }


  return Math.min(
    ...timestamps
  )
}


// ============================================================
// OLD ENOUGH TO STOP PAGING
// ============================================================

function pageHasReachedAgeLimit(
  records
) {
  const oldest =
    getOldestPublishedAt(
      records
    )


  if (
    oldest ===
    null
  ) {
    return false
  }


  const cutoff =
    Date.now() -
    (
      MAX_AGE_DAYS *
      24 *
      60 *
      60 *
      1000
    )


  return (
    oldest <
    cutoff
  )
}


// ============================================================
// DEDUPE
// ============================================================

function dedupeRecords(
  records
) {
  const seen =
    new Set()


  const output =
    []


  records.forEach(
    (
      record
    ) => {
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


      output.push(
        record
      )
    }
  )


  return output
}


// ============================================================
// SCRAPER
// ============================================================

export async function scrapeTorontoPoliceNews({
  maxPages =
    MAX_PAGES,
} = {}) {
  const allRecords =
    []


  const pageLimit =
    Math.max(
      1,
      Math.min(
        MAX_PAGES,
        Number(
          maxPages
        ) ||
        MAX_PAGES
      )
    )


  for (
    let page = 1;
    page <= pageLimit;
    page++
  ) {
    const pageRecords =
      await fetchNewsReleasePage(
        page
      )


    console.log(
      (
        'TORONTO POLICE NEWS PAGE ' +
        `${page}:`
      ),
      pageRecords.length
    )


    if (
      pageRecords.length ===
      0
    ) {
      break
    }


    allRecords.push(
      ...pageRecords
    )


    if (
      pageHasReachedAgeLimit(
        pageRecords
      )
    ) {
      break
    }
  }


  const deduped =
    dedupeRecords(
      allRecords
    )


  const recent =
    deduped
      .filter(
        (
          record
        ) =>
          isRecentEnough(
            record.publishedAt
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          (
            new Date(
              b.publishedAt ||
              0
            )
              .getTime() -
            new Date(
              a.publishedAt ||
              0
            )
              .getTime()
          )
      )


  console.log(
    'TORONTO POLICE GEOGRAPHIC NEWS:',
    recent.length
  )


  console.log(
    'TORONTO POLICE TOTAL GEOGRAPHIC RELEASES FOUND:',
    deduped.length
  )


  return recent
}