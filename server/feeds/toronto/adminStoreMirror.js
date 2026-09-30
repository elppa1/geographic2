import {
  postgresMirrorEnabled,
  seedPostgresDocument,
  writePostgresDocument,
} from '../../db/postgresMirror.js'


const BASE_PATH =
  '/api/geographic/toronto/admin-store'


const MAX_BODY_BYTES =
  12_000_000


const STORE_DOCUMENT_KEYS =
  new Map([
    [
      'elppa-geographic-news',
      'toronto-admin-news',
    ],
    [
      'elppa-geographic-new',
      'toronto-admin-new',
    ],
    [
      'elppa-geographic-news-review',
      'toronto-admin-news-review',
    ],
    [
      'elppa-geographic-new-review',
      'toronto-admin-new-review',
    ],
    [
      'elppa-geographic-scraper-processed',
      'toronto-admin-scraper-processed',
    ],
  ])


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


async function readJsonBody(
  req
) {
  let raw =
    ''


  for await (
    const chunk
    of req
  ) {
    raw +=
      chunk.toString(
        'utf8'
      )


    if (
      raw.length >
      MAX_BODY_BYTES
    ) {
      throw new Error(
        'Admin store mirror request body is too large.'
      )
    }
  }


  if (
    !raw.trim()
  ) {
    return {}
  }


  return JSON.parse(
    raw
  )
}


function requestedStoreKey(
  req
) {
  const url =
    new URL(
      req.url ||
      '/',
      'http://localhost'
    )


  const encoded =
    url.pathname
      .replace(
        /^\/+/,
        ''
      )
      .split(
        '/'
      )[0] ||
    ''


  try {
    return decodeURIComponent(
      encoded
    )
  }
  catch {
    return encoded
  }
}


export function torontoAdminStoreMirrorFeed() {
  return {
    name:
      'toronto-admin-store-postgres-mirror',


    configureServer(
      server
    ) {
      server.middlewares.use(
        BASE_PATH,
        async (
          req,
          res,
          next
        ) => {
          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'POST'
          ) {
            next()


            return
          }


          const browserStoreKey =
            requestedStoreKey(
              req
            )


          const documentKey =
            STORE_DOCUMENT_KEYS.get(
              browserStoreKey
            ) ||
            ''


          if (
            !documentKey
          ) {
            sendJson(
              res,
              404,
              {
                ok:
                  false,

                error:
                  'Unknown admin store.',
              }
            )


            return
          }


          if (
            !postgresMirrorEnabled()
          ) {
            sendJson(
              res,
              503,
              {
                ok:
                  false,

                error:
                  'Postgres mirror is not configured.',
              }
            )


            return
          }


          try {
            const body =
              await readJsonBody(
                req
              )


            const records =
              body?.records


            if (
              !Array.isArray(
                records
              )
            ) {
              sendJson(
                res,
                400,
                {
                  ok:
                    false,

                  error:
                    'Admin store mirror requires a records array.',
                }
              )


              return
            }


            const mode =
              String(
                body?.mode ||
                'write'
              )
                .toLowerCase()


            const mirrored =
              mode ===
                'seed'
                ? await seedPostgresDocument({
                    storeKey:
                      documentKey,
                    payload:
                      records,
                  })
                : await writePostgresDocument({
                    storeKey:
                      documentKey,
                    payload:
                      records,
                  })


            if (
              !mirrored
            ) {
              sendJson(
                res,
                503,
                {
                  ok:
                    false,

                  error:
                    'Postgres mirror write did not complete.',
                }
              )


              return
            }


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                mode:
                  mode ===
                    'seed'
                    ? 'seed'
                    : 'write',

                storeKey:
                  browserStoreKey,

                documentKey,

                count:
                  records.length,
              }
            )
          }
          catch (
            error
          ) {
            console.warn(
              'ADMIN STORE · POSTGRES MIRROR REQUEST FAILED:',
              browserStoreKey,
              error?.message ||
              error
            )


            sendJson(
              res,
              400,
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
