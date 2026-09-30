// ============================================================
// NOWSERVINGTO · NEW RESTAURANT LEADS
// ============================================================
//
// This is a DISCOVERY scraper only.
//
// It deliberately does NOT copy NowServing editorial descriptions.
// It creates generic restaurant leads with:
//
// - restaurant name
// - address
// - cuisine / food type when available
// - NowServing listing URL
// - source "first seen" label when available
// - a rough opening date derived from that label
//
// Toronto Geographic treats that date as an APPROXIMATE opening date.
// We keep the source-first-seen fields too so the provenance is clear.
//
// Historical recovery:
// all six NowServing Toronto district pages are checked and any restaurant
// with an approximate opening date within the last 180 days is kept.
// Existing review/published dedupe prevents duplicate leads.
//
// ============================================================

const SOURCE = {
  id:
    'nowserving-restaurant-leads',

  name:
    'NowServingTO',

  url:
    '/api/geographic/toronto/newsroom/nowserving',
}


const BACKFILL_LOOKBACK_DAYS =
  180


const NOWSERVING_DISTRICTS = [
  'downtown',
  'east-toronto',
  'etobicoke',
  'north-york',
  'scarborough',
  'west-toronto',
]


function cleanText(
  value
) {
  return String(
    value ||
    ''
  )
    .replace(
      /↗/g,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function absoluteNowServingUrl(
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


  try {
    return new URL(
      text,
      'https://nowservingto.com'
    )
      .toString()
  }
  catch {
    return ''
  }
}


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
    .slice(
      0,
      140
    )
}


function findRestaurantContainer(
  listingLink
) {
  let current =
    listingLink?.parentElement ||
    null


  for (
    let depth = 0;
    current &&
    depth < 7;
    depth++
  ) {
    const heading =
      current.querySelector(
        'h2'
      )


    const listingCount =
      current.querySelectorAll(
        'a[href^="/r/"], a[href*="nowservingto.com/r/"]'
      )
        .length


    const hasMapLink =
      Array.from(
        current.querySelectorAll(
          'a[href]'
        )
      )
        .some(
          (link) => {
            const href =
              String(
                link.getAttribute(
                  'href'
                ) ||
                ''
              )
                .toLowerCase()


            return (
              href.includes(
                'maps.google.'
              ) ||
              href.includes(
                'google.com/maps'
              )
            )
          }
        )


    if (
      heading &&
      hasMapLink &&
      listingCount ===
        1
    ) {
      return current
    }


    current =
      current.parentElement
  }


  return (
    listingLink?.parentElement ||
    null
  )
}


function getMapAddress(
  container
) {
  if (
    !container
  ) {
    return ''
  }


  const mapLinks =
    Array.from(
      container.querySelectorAll(
        'a[href]'
      )
    )
      .filter(
        (link) => {
          const href =
            String(
              link.getAttribute(
                'href'
              ) ||
              ''
            )
              .toLowerCase()


          return (
            href.includes(
              'maps.google.'
            ) ||
            href.includes(
              'google.com/maps'
            )
          )
        }
      )
      .map(
        (link) =>
          cleanText(
            link.textContent
          )
      )
      .filter(
        Boolean
      )


  const addressLike =
    mapLinks
      .filter(
        (value) =>
          /\d/.test(
            value
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          b.length -
          a.length
      )


  if (
    addressLike.length >
      0
  ) {
    return addressLike[0]
  }


  return (
    mapLinks
      .sort(
        (
          a,
          b
        ) =>
          b.length -
          a.length
      )[0] ||
    ''
  )
}


function getSourceFirstSeenLabel(
  container
) {
  const text =
    cleanText(
      container?.textContent
    )


  const match =
    text.match(
      /\b(today|yesterday|\d+\s+(?:day|days|week|weeks|month|months)\s+ago)\b/i
    )


  return cleanText(
    match?.[1] ||
    ''
  )
}


function toDateOnly(
  value
) {
  const date =
    value instanceof Date
      ? new Date(
          value.getTime()
        )
      : new Date(
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


function sourceFirstSeenDateFromLabel(
  label,
  baseDate =
    new Date()
) {
  const normalized =
    cleanText(
      label
    )
      .toLowerCase()


  if (
    !normalized
  ) {
    return ''
  }


  const date =
    new Date(
      baseDate
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return ''
  }


  date.setHours(
    12,
    0,
    0,
    0
  )


  if (
    normalized ===
      'today'
  ) {
    return toDateOnly(
      date
    )
  }


  if (
    normalized ===
      'yesterday'
  ) {
    date.setDate(
      date.getDate() -
      1
    )


    return toDateOnly(
      date
    )
  }


  const match =
    normalized.match(
      /^(\d+)\s+(day|days|week|weeks|month|months)\s+ago$/
    )


  if (
    !match
  ) {
    return ''
  }


  const amount =
    Number(
      match[1]
    )


  const unit =
    match[2]


  if (
    !Number.isFinite(
      amount
    )
  ) {
    return ''
  }


  if (
    unit.startsWith(
      'day'
    )
  ) {
    date.setDate(
      date.getDate() -
      amount
    )
  }
  else if (
    unit.startsWith(
      'week'
    )
  ) {
    date.setDate(
      date.getDate() -
      (
        amount *
        7
      )
    )
  }
  else if (
    unit.startsWith(
      'month'
    )
  ) {
    date.setMonth(
      date.getMonth() -
      amount
    )
  }


  return toDateOnly(
    date
  )
}


function getCuisine(
  container,
  heading
) {
  if (
    !container
  ) {
    return ''
  }


  const explicit =
    container.querySelector(
      '[data-cuisine], .cuisine, [class*="cuisine"]'
    )


  const explicitValue =
    cleanText(
      explicit?.getAttribute?.(
        'data-cuisine'
      ) ||
      explicit?.textContent ||
      ''
    )


  if (
    explicitValue &&
    explicitValue.length <=
      80
  ) {
    return explicitValue
  }


  const containerText =
    cleanText(
      container.textContent
    )


  const firstSeenMatch =
    containerText.match(
      /^(.{1,80}?)\s+(?:today|yesterday|\d+\s+(?:day|days|week|weeks|month|months)\s+ago)\b/i
    )


  if (
    firstSeenMatch?.[1]
  ) {
    const value =
      cleanText(
        firstSeenMatch[1]
      )


    if (
      value &&
      !value.includes(
        cleanText(
          heading?.textContent
        )
      )
    ) {
      return value
    }
  }


  return ''
}


function makeExternalId({
  listingUrl,
  name,
  address,
}) {
  let stable =
    ''


  try {
    const parsed =
      new URL(
        listingUrl
      )


    stable =
      parsed.pathname
  }
  catch {
    stable =
      ''
  }


  return (
    'nowserving-' +
    slugify(
      stable ||
      `${name}-${address}`
    )
  )
}


function parseNowServingHtml(
  html,
  sourceDate =
    new Date()
) {
  const parser =
    new DOMParser()


  const document =
    parser.parseFromString(
      html,
      'text/html'
    )


  const listingLinks =
    Array.from(
      document.querySelectorAll(
        'a[href^="/r/"], a[href*="nowservingto.com/r/"]'
      )
    )


  const records =
    []


  const seen =
    new Set()


  listingLinks.forEach(
    (listingLink) => {
      const listingUrl =
        absoluteNowServingUrl(
          listingLink.getAttribute(
            'href'
          )
        )


      if (
        !listingUrl ||
        seen.has(
          listingUrl
        )
      ) {
        return
      }


      const container =
        findRestaurantContainer(
          listingLink
        )


      const heading =
        container?.querySelector(
          'h2'
        ) ||
        null


      const name =
        cleanText(
          heading?.textContent ||
          listingLink.textContent
        )


      const address =
        getMapAddress(
          container
        )


      if (
        !name ||
        !address
      ) {
        return
      }


      const cuisine =
        getCuisine(
          container,
          heading
        )


      const sourceFirstSeenLabel =
        getSourceFirstSeenLabel(
          container
        )


      const sourceFirstSeenAt =
        sourceFirstSeenDateFromLabel(
          sourceFirstSeenLabel,
          sourceDate
        )


      const externalId =
        makeExternalId({
          listingUrl,
          name,
          address,
        })


      if (
        !externalId
      ) {
        return
      }


      seen.add(
        listingUrl
      )


      records.push({
        externalId,

        city:
          'toronto',

        type:
          'new',

        category:
          'restaurant',

        status:
          'open',

        title:
          name,

        description:
          '',

        location:
          address,

        intersection:
          '',

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

        cuisine,

        businessUrl:
          '',

        source:
          SOURCE.name,

        sourceUrl:
          listingUrl,

        scraperSource:
          SOURCE.id,

        leadSource:
          'nowserving',

        leadStatus:
          'unverified',

        sourceFirstSeenLabel,

        sourceFirstSeenAt,

        sourceDateKind:
          sourceFirstSeenAt
            ? 'approx-opening'
            : '',

        sourceDateAccuracy:
          sourceFirstSeenAt
            ? 'estimated-from-nowserving-first-seen'
            : '',

        sourceEditionDate:
          toDateOnly(
            sourceDate
          ),

        firstSeenAt:
          sourceFirstSeenAt,

        openedAt:
          sourceFirstSeenAt,

        openingDateApproximate:
          Boolean(
            sourceFirstSeenAt
          ),

        openingDateSource:
          sourceFirstSeenAt
            ? 'nowserving-first-seen'
            : '',

        announcedAt:
          '',

        expectedAt:
          '',

        active:
          false,

        discoveredAt:
          new Date()
            .toISOString(),
      })
    }
  )


  return records
}


async function fetchNowServingRecords(
  url
) {
  const response =
    await fetch(
      url,
      {
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
      `NOWSERVING FEED ${response.status}`
    )
  }


  const payload =
    await response.json()


  if (
    !payload?.ok ||
    typeof payload.html !==
      'string'
  ) {
    throw new Error(
      'NOWSERVING FEED INVALID RESPONSE'
    )
  }


  const sourceDate =
    payload.sourceEditionDate
      ? new Date(
          `${payload.sourceEditionDate}T12:00:00`
        )
      : (
          payload.fetchedAt
            ? new Date(
                payload.fetchedAt
              )
            : new Date()
        )


  return parseNowServingHtml(
    payload.html,
    sourceDate
  )
}


function isWithinBackfillWindow(
  record,
  referenceDate =
    new Date()
) {
  const openingText =
    String(
      record?.openedAt ||
      ''
    )
      .slice(
        0,
        10
      )


  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      openingText
    )
  ) {
    return false
  }


  const openingDate =
    new Date(
      `${openingText}T12:00:00`
    )


  if (
    Number.isNaN(
      openingDate.getTime()
    )
  ) {
    return false
  }


  const cutoff =
    new Date(
      referenceDate
    )


  cutoff.setHours(
    12,
    0,
    0,
    0
  )


  cutoff.setDate(
    cutoff.getDate() -
      BACKFILL_LOOKBACK_DAYS
  )


  const latest =
    new Date(
      referenceDate
    )


  latest.setHours(
    23,
    59,
    59,
    999
  )


  return (
    openingDate.getTime() >=
      cutoff.getTime() &&
    openingDate.getTime() <=
      latest.getTime()
  )
}


function mergeByExternalId(
  records
) {
  const merged =
    new Map()


  records.forEach(
    (
      record
    ) => {
      if (
        !record?.externalId
      ) {
        return
      }


      merged.set(
        record.externalId,
        record
      )
    }
  )


  return Array.from(
    merged.values()
  )
}


export async function scrapeNowServingNew() {
  const currentRecords =
    await fetchNowServingRecords(
      SOURCE.url
    )


  const referenceDate =
    new Date()


  const districtRecords =
    []


  for (
    const district of
      NOWSERVING_DISTRICTS
  ) {
    try {
      const districtUrl =
        (
          SOURCE.url +
          '?district=' +
          encodeURIComponent(
            district
          )
        )


      const records =
        await fetchNowServingRecords(
          districtUrl
        )


      districtRecords.push(
        ...records
          .filter(
            (
              record
            ) =>
              isWithinBackfillWindow(
                record,
                referenceDate
              )
          )
      )
    }
    catch (
      error
    ) {
      // Current discovery and the remaining district pages should
      // still work if one district is temporarily unavailable.
      console.warn(
        `NOWSERVING DISTRICT BACKFILL FAILED · ${district}:`,
        error
      )
    }
  }


  // District pages provide the deeper history. Current /new is merged
  // last so its freshest copy wins when a restaurant appears in both.
  return mergeByExternalId([
    ...districtRecords,
    ...currentRecords,
  ])
}
