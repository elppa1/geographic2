// ============================================================
// NOWSERVINGTO · NEW RESTAURANT LEADS
// ============================================================
//
// This is a DISCOVERY scraper only.
//
// It deliberately does NOT copy NowServing editorial descriptions.
// It only creates a generic lead with:
//
// - restaurant name
// - address
// - cuisine / food type when available
// - NowServing listing URL
// - source "first seen" label when available
//
// The editor must open the lead, confirm the pin, write Geographic's
// own description, add/confirm the business link and publish it.
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
  html
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
          'proposed',

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


export async function scrapeNowServingNew() {
  const response =
    await fetch(
      SOURCE.url,
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


  return parseNowServingHtml(
    payload.html
  )
}
