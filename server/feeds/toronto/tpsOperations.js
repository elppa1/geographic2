// ============================================================
// TORONTO POLICE OPERATIONS · LIVE SOCIAL FEED
// ============================================================
//
// Official source:
//
//   @TPSOperations
//
// Direct X and tps.ca requests are unreliable/blocked.
//
// This feed currently uses a public mirror and exposes the
// returned HTML locally so Geographic can parse it.
//
// ============================================================


const TPS_OPERATIONS_MIRRORS = [
  'https://ww.twstalker.com/TPSOperations',
  'https://w.twstalker.com/TPSOperations',
  'https://mobile.twstalker.com/TPSOperations',
]


// ============================================================
// REQUEST HEADERS
// ============================================================

const REQUEST_HEADERS = {
  'User-Agent':
    (
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/151.0.0.0 Safari/537.36'
    ),

  Accept:
    (
      'text/html,application/xhtml+xml,' +
      'application/xml;q=0.9,' +
      'image/avif,image/webp,*/*;q=0.8'
    ),

  'Accept-Language':
    'en-CA,en;q=0.9',

  'Cache-Control':
    'no-cache',

  Pragma:
    'no-cache',
}


// ============================================================
// FETCH ONE MIRROR
// ============================================================

async function fetchMirror(
  url
) {
  try {
    const response =
      await fetch(
        url,
        {
          method:
            'GET',

          headers:
            REQUEST_HEADERS,

          redirect:
            'follow',
        }
      )


    if (
      !response.ok
    ) {
      console.warn(
        (
          'TPS MIRROR FAILED · ' +
          `${response.status} · ` +
          url
        )
      )


      return null
    }


    const html =
      await response.text()


    if (
      !html ||
      html.length <
      500
    ) {
      console.warn(
        (
          'TPS MIRROR EMPTY · ' +
          url
        )
      )


      return null
    }


    const lower =
      html.toLowerCase()


    if (
      !lower.includes(
        'tpsoperations'
      ) &&
      !lower.includes(
        'toronto police operations'
      )
    ) {
      console.warn(
        (
          'TPS MIRROR INVALID · ' +
          url
        )
      )


      return null
    }


    return {
      html,
      url,
    }
  }
  catch (
    error
  ) {
    console.warn(
      'TPS MIRROR ERROR:',
      url,
      error
    )


    return null
  }
}


// ============================================================
// FETCH OPERATIONS FEED
// ============================================================

async function fetchOperationsFeed() {
  for (
    const mirror of
    TPS_OPERATIONS_MIRRORS
  ) {
    const result =
      await fetchMirror(
        mirror
      )


    if (
      result
    ) {
      return result
    }
  }


  throw new Error(
    'ALL TPS OPERATIONS MIRRORS FAILED'
  )
}


// ============================================================
// VITE PLUGIN
// ============================================================

export function tpsOperationsFeed() {
  return {
    name:
      'geographic-tps-operations-feed',


    configureServer(
      server
    ) {
      server.middlewares.use(
        '/api/geographic/toronto/tps-operations',

        async (
          req,
          res
        ) => {
          try {
            const {
              html,
              url,
            } =
              await fetchOperationsFeed()


            console.log(
              'TPS OPERATIONS FEED:',
              html.length,
              'characters'
            )


            console.log(
              'TPS OPERATIONS SOURCE:',
              url
            )


            res.statusCode =
              200


            res.setHeader(
              'Content-Type',
              'text/html; charset=utf-8'
            )


            res.setHeader(
              'Cache-Control',
              'no-store'
            )


            res.end(
              html
            )
          }
          catch (
            error
          ) {
            console.error(
              'TPS OPERATIONS FEED ERROR:',
              error
            )


            res.statusCode =
              502


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.setHeader(
              'Cache-Control',
              'no-store'
            )


            res.end(
              (
                'TPS Operations feed unavailable\n\n' +
                String(
                  error?.message ||
                  error
                )
              )
            )
          }
        }
      )
    },
  }
}