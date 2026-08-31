// ============================================================
// NOWSERVINGTO · ADMIN DISCOVERY FEED
// ============================================================
//
// Browser -> same-origin authenticated Admin endpoint -> NowServingTO.
//
// The browser scraper parses the returned HTML into generic restaurant
// leads. This server layer exists so the browser never depends on
// NowServing CORS behavior and so repeated Admin syncs do not hammer the
// source page.
//
// ============================================================

const ENDPOINT =
  '/api/geographic/toronto/newsroom/nowserving'


const UPSTREAM_URL =
  'https://nowservingto.com/new'


const CACHE_TTL_MS =
  10 * 60 * 1000


const cachedPages =
  new Map()


const inFlightPages =
  new Map()


function getUpstreamUrl(
  edition
) {
  const normalized =
    String(
      edition ||
      ''
    )
      .trim()


  if (
    !normalized
  ) {
    return UPSTREAM_URL
  }


  if (
    !/^\d{4}-\d{2}$/.test(
      normalized
    )
  ) {
    throw new Error(
      'NOWSERVING EDITION INVALID'
    )
  }


  return (
    'https://nowservingto.com/trends/' +
    normalized
  )
}


function getSourceEditionDate(
  html
) {
  const match =
    String(
      html ||
      ''
    )
      .match(
        /\bDAILY\s+EDITION\s+(\d{4})[.\/-](\d{2})[.\/-](\d{2})\b/i
      )


  if (
    !match
  ) {
    return ''
  }


  return (
    `${match[1]}-` +
    `${match[2]}-` +
    `${match[3]}`
  )
}


function sendJson(
  res,
  status,
  value
) {
  res.statusCode =
    status


  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  )


  res.setHeader(
    'Cache-Control',
    'no-store'
  )


  res.end(
    JSON.stringify(
      value
    )
  )
}


async function fetchNowServingHtml(
  upstreamUrl
) {
  const cached =
    cachedPages.get(
      upstreamUrl
    )


  const fresh =
    cached?.html &&
    (
      Date.now() -
      cached.cachedAt
    ) <
      CACHE_TTL_MS


  if (
    fresh
  ) {
    return cached
  }


  if (
    inFlightPages.has(
      upstreamUrl
    )
  ) {
    return inFlightPages.get(
      upstreamUrl
    )
  }


  const request =
    (async () => {
      const response =
        await fetch(
          upstreamUrl,
          {
            headers: {
              Accept:
                'text/html,application/xhtml+xml',

              'Accept-Language':
                'en-CA,en;q=0.9',

              'User-Agent':
                'Toronto-Geographic/1.0 (+https://geographic2-production.up.railway.app)',
            },

            redirect:
              'follow',

            signal:
              AbortSignal.timeout(
                15000
              ),
          }
        )


      if (
        !response.ok
      ) {
        throw new Error(
          `NOWSERVING UPSTREAM ${response.status}`
        )
      }


      const html =
        await response.text()


      if (
        !html ||
        html.length <
          500
      ) {
        throw new Error(
          'NOWSERVING UPSTREAM EMPTY RESPONSE'
        )
      }


      const value = {
        html,

        cachedAt:
          Date.now(),
      }


      cachedPages.set(
        upstreamUrl,
        value
      )


      return value
    })()


  inFlightPages.set(
    upstreamUrl,
    request
  )


  try {
    return await request
  }
  finally {
    inFlightPages.delete(
      upstreamUrl
    )
  }
}


export function nowServingFeed() {
  return {
    name:
      'geographic-nowserving-feed',


    configureServer(
      server
    ) {
      server.middlewares.use(
        async (
          req,
          res,
          next
        ) => {
          let url


          try {
            url =
              new URL(
                req.url ||
                '/',
                'http://localhost'
              )
          }
          catch {
            next()

            return
          }


          if (
            url.pathname !==
              ENDPOINT
          ) {
            next()

            return
          }


          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'GET'
          ) {
            sendJson(
              res,
              405,
              {
                ok:
                  false,

                error:
                  'Method not allowed',
              }
            )


            return
          }


          try {
            const edition =
              String(
                url.searchParams.get(
                  'edition'
                ) ||
                ''
              )
                .trim()


            const upstreamUrl =
              getUpstreamUrl(
                edition
              )


            const page =
              await fetchNowServingHtml(
                upstreamUrl
              )


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                source:
                  'NowServingTO',

                sourceUrl:
                  upstreamUrl,

                requestedEdition:
                  edition,

                fetchedAt:
                  new Date(
                    page.cachedAt ||
                    Date.now()
                  )
                    .toISOString(),

                sourceEditionDate:
                  getSourceEditionDate(
                    page.html
                  ),

                html:
                  page.html,
              }
            )
          }
          catch (
            error
          ) {
            console.error(
              'NOWSERVING FEED ERROR:',
              error
            )


            sendJson(
              res,
              502,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )
    },
  }
}
