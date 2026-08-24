// ============================================================
// TORONTO POLICE · RECENT RELEASE FEED
// ============================================================
//
// Browser requests to tps.ca previously returned 403.
//
// This middleware fetches the official TPS News Releases page
// from the Vite / Node side instead.
//
// The browser will later read:
//
//   /api/geographic/toronto/police
//
// and parse only very recent, geographically useful releases.
//
// Nothing is auto-published yet. First we prove the feed works.
//
// ============================================================


const TPS_RELEASES_URL =
  'https://www.tps.ca/media-centre/news-releases/'


// ============================================================
// BROWSER-LIKE HEADERS
// ============================================================

const TPS_HEADERS = {
  'User-Agent':
    (
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/151.0.0.0 Safari/537.36'
    ),

  Accept:
    (
      'text/html,application/xhtml+xml,' +
      'application/xml;q=0.9,image/avif,' +
      'image/webp,*/*;q=0.8'
    ),

  'Accept-Language':
    'en-CA,en;q=0.9',

  'Cache-Control':
    'no-cache',

  Pragma:
    'no-cache',

  Referer:
    'https://www.tps.ca/',
}


// ============================================================
// FETCH TPS
// ============================================================

async function fetchTpsReleases() {
  const response =
    await fetch(
      TPS_RELEASES_URL,
      {
        method:
          'GET',

        headers:
          TPS_HEADERS,

        redirect:
          'follow',
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TPS SERVER FETCH FAILED · ' +
        `${response.status} · ` +
        response.statusText
      )
    )
  }


  const html =
    await response.text()


  if (
    !html ||
    html.length <
    100
  ) {
    throw new Error(
      'TPS SERVER FETCH RETURNED EMPTY HTML'
    )
  }


  return html
}


// ============================================================
// TPS RECENT FEED PLUGIN
// ============================================================

export function tpsRecentFeed() {
  return {
    name:
      'geographic-tps-recent-feed',


    configureServer(
      server
    ) {
      server.middlewares.use(
        '/api/geographic/toronto/police',

        async (
          req,
          res
        ) => {
          try {
            const html =
              await fetchTpsReleases()


            console.log(
              'TPS SERVER FEED:',
              html.length,
              'characters'
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
              'TPS SERVER FEED ERROR:',
              error
            )


            res.statusCode =
              502


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.end(
              (
                'Toronto Police feed unavailable\n\n' +
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