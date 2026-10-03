import {
  postgresMirrorEnabled,
  readPostgresDocument,
  seedPostgresDocument,
  writePostgresDocument,
} from '../../db/postgresMirror.js'


const BASE_PATH =
  '/api/geographic/toronto/admin-store'


const MAX_BODY_BYTES =
  64_000_000


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
  const chunks =
    []


  let totalBytes =
    0


  for await (
    const chunk
    of req
  ) {
    const buffer =
      Buffer.isBuffer(
        chunk
      )
        ? chunk
        : Buffer.from(
            chunk
          )


    totalBytes +=
      buffer.length


    if (
      totalBytes >
      MAX_BODY_BYTES
    ) {
      const error =
        new Error(
          'Admin store mirror request body is too large.'
        )


      error.statusCode =
        413


      throw error
    }


    chunks.push(
      buffer
    )
  }


  if (
    chunks.length ===
      0
  ) {
    return {}
  }


  const raw =
    Buffer.concat(
      chunks,
      totalBytes
    )
      .toString(
        'utf8'
      )


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
          const method =
            String(
              req.method ||
              'GET'
            )
              .toUpperCase()


          if (
            method !==
              'GET' &&
            method !==
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
            if (
              method ===
                'GET'
            ) {
              const snapshot =
                await readPostgresDocument({
                  storeKey:
                    documentKey,
                })


              if (
                !snapshot.found
              ) {
                sendJson(
                  res,
                  404,
                  {
                    ok:
                      false,

                    error:
                      'Admin store has not been migrated to Postgres yet.',
                  }
                )


                return
              }


              const records =
                snapshot.payload


              if (
                !Array.isArray(
                  records
                )
              ) {
                sendJson(
                  res,
                  500,
                  {
                    ok:
                      false,

                    error:
                      'Postgres admin store payload is not a records array.',
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
                    'read',

                  storeKey:
                    browserStoreKey,

                  documentKey,

                  count:
                    records.length,

                  records,
                }
              )


              return
            }


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
              'ADMIN STORE · POSTGRES REQUEST FAILED:',
              browserStoreKey,
              error?.message ||
              error
            )


            sendJson(
              res,
              Number(
                error?.statusCode
              ) ||
              500,
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
