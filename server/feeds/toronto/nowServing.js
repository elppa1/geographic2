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


let cachedHtml =
  ''


let cachedAt =
  0


let inFlight =
  null


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


async function fetchNowServingHtml() {
  const fresh =
    cachedHtml &&
    (
      Date.now() -
      cachedAt
    ) <
      CACHE_TTL_MS


  if (
    fresh
  ) {
    return cachedHtml
  }


  if (
    inFlight
  ) {
    return inFlight
  }


  inFlight =
    (async () => {
      const response =
        await fetch(
          UPSTREAM_URL,
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


      cachedHtml =
        html


      cachedAt =
        Date.now()


      return html
    })()


  try {
    return await inFlight
  }
  finally {
    inFlight =
      null
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
            const html =
              await fetchNowServingHtml()


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                source:
                  'NowServingTO',

                sourceUrl:
                  UPSTREAM_URL,

                fetchedAt:
                  new Date(
                    cachedAt ||
                    Date.now()
                  )
                    .toISOString(),

                html,
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
