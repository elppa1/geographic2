import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'

import {
  isAbsolute,
  join,
  resolve,
} from 'node:path'

import {
  loadEnv,
} from 'vite'


let resolvedDataDirectory =
  ''


const EMPTY_SNAPSHOT = {
  version:
    1,

  updatedAt:
    '',

  items:
    [],

  issues:
    [],

  categories:
    [],

  layers:
    [],
}


const MAX_BODY_BYTES =
  20 * 1024 * 1024


let writeQueue =
  Promise.resolve()


function getDataDirectory() {
  const configured =
    String(
      resolvedDataDirectory ||
      process.env.GEOGRAPHIC_DATA_DIR ||
      ''
    )
      .trim()


  if (
    configured
  ) {
    return isAbsolute(
      configured
    )
      ? configured
      : resolve(
          process.cwd(),
          configured
        )
  }


  return resolve(
    process.cwd(),
    'server',
    'data'
  )
}


function getHistoricFilePath() {
  return join(
    getDataDirectory(),
    'toronto-historic.json'
  )
}


function normalizeRecords(
  value
) {
  return Array.isArray(
    value
  )
    ? value
    : []
}


function normalizeSnapshot(
  value
) {
  return {
    version:
      1,

    updatedAt:
      String(
        value?.updatedAt ||
        ''
      ),

    items:
      normalizeRecords(
        value?.items
      ),

    issues:
      normalizeRecords(
        value?.issues
      ),

    categories:
      normalizeRecords(
        value?.categories
      ),

    layers:
      normalizeRecords(
        value?.layers
      ),
  }
}


function snapshotHasData(
  snapshot
) {
  return (
    snapshot.items.length >
      0 ||
    snapshot.issues.length >
      0 ||
    snapshot.categories.length >
      0 ||
    snapshot.layers.length >
      0
  )
}


async function readSnapshot() {
  try {
    const raw =
      await readFile(
        getHistoricFilePath(),
        'utf8'
      )


    return normalizeSnapshot(
      JSON.parse(
        raw
      )
    )
  }
  catch (
    error
  ) {
    if (
      error?.code ===
        'ENOENT'
    ) {
      return normalizeSnapshot(
        EMPTY_SNAPSHOT
      )
    }


    console.error(
      'HISTORIC STORE READ ERROR:',
      error
    )


    throw error
  }
}


async function writeSnapshot(
  snapshot
) {
  const normalized =
    normalizeSnapshot({
      ...snapshot,

      updatedAt:
        new Date()
          .toISOString(),
    })


  await mkdir(
    getDataDirectory(),
    {
      recursive:
        true,
    }
  )


  await writeFile(
    getHistoricFilePath(),
    JSON.stringify(
      normalized,
      null,
      2
    ),
    'utf8'
  )


  return normalized
}


function queueMutation(
  mutate
) {
  const operation =
    writeQueue
      .then(
        async () => {
          const current =
            await readSnapshot()


          const next =
            await mutate(
              current
            )


          return writeSnapshot(
            next
          )
        }
      )


  writeQueue =
    operation
      .catch(
        () => {}
      )


  return operation
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


async function readJsonBody(
  req
) {
  const chunks =
    []


  let total =
    0


  for await (
    const chunk of
    req
  ) {
    total +=
      chunk.length


    if (
      total >
      MAX_BODY_BYTES
    ) {
      const error =
        new Error(
          'Historic request body is too large.'
        )


      error.statusCode =
        413


      throw error
    }


    chunks.push(
      chunk
    )
  }


  if (
    chunks.length ===
      0
  ) {
    return {}
  }


  const text =
    Buffer.concat(
      chunks
    )
      .toString(
        'utf8'
      )
      .trim()


  if (
    !text
  ) {
    return {}
  }


  try {
    return JSON.parse(
      text
    )
  }
  catch {
    const error =
      new Error(
        'Historic request body is not valid JSON.'
      )


    error.statusCode =
      400


    throw error
  }
}


function getPublishedSnapshot(
  snapshot
) {
  const categories =
    snapshot.categories
      .filter(
        (
          category
        ) =>
          category?.status ===
          'published'
      )


  const layers =
    snapshot.layers
      .filter(
        (
          layer
        ) =>
          layer?.status ===
          'published'
      )


  const issues =
    snapshot.issues
      .filter(
        (
          issue
        ) =>
          issue?.status ===
          'published'
      )


  const publishedCategoryIds =
    new Set(
      categories
        .map(
          (
            category
          ) =>
            category?.id
        )
        .filter(
          Boolean
        )
    )


  const publishedLayerIds =
    new Set(
      layers
        .map(
          (
            layer
          ) =>
            layer?.id
        )
        .filter(
          Boolean
        )
    )


  const items =
    snapshot.items
      .filter(
        (
          item
        ) =>
          item?.active !==
          false
      )
      .filter(
        (
          item
        ) =>
          !item?.historicCategoryId ||
          publishedCategoryIds.has(
            item.historicCategoryId
          )
      )
      .filter(
        (
          item
        ) =>
          !item?.historicLayerId ||
          publishedLayerIds.has(
            item.historicLayerId
          )
      )


  return normalizeSnapshot({
    ...snapshot,
    items,
    issues,
    categories,
    layers,
  })
}


function normalizeRequestPath(
  req
) {
  try {
    return new URL(
      req.url ||
      '/',
      'http://localhost'
    )
      .pathname
  }
  catch {
    return String(
      req.url ||
      '/'
    )
  }
}


async function handleHistoricRequest(
  req,
  res,
  next
) {
  const method =
    String(
      req.method ||
      'GET'
    )
      .toUpperCase()


  const pathname =
    normalizeRequestPath(
      req
    )


  try {
    if (
      method ===
        'GET' &&
      pathname ===
        '/published'
    ) {
      const snapshot =
        await readSnapshot()


      sendJson(
        res,
        200,
        {
          ok:
            true,

          snapshot:
            getPublishedSnapshot(
              snapshot
            ),
        }
      )


      return
    }


    if (
      method ===
        'GET' &&
      (
        pathname ===
          '/admin' ||
        pathname ===
          '/admin/'
      )
    ) {
      const snapshot =
        await readSnapshot()


      sendJson(
        res,
        200,
        {
          ok:
            true,

          snapshot,
        }
      )


      return
    }


    if (
      method ===
        'POST' &&
      pathname ===
        '/admin/migrate'
    ) {
      const incoming =
        normalizeSnapshot(
          await readJsonBody(
            req
          )
        )


      const snapshot =
        await queueMutation(
          (
            current
          ) => {
            if (
              snapshotHasData(
                current
              )
            ) {
              const error =
                new Error(
                  'Historic production store is not empty. Migration refused to overwrite it.'
                )


              error.statusCode =
                409


              throw error
            }


            return incoming
          }
        )


      sendJson(
        res,
        200,
        {
          ok:
            true,

          migrated:
            true,

          snapshot,
        }
      )


      return
    }


    const collectionMatch =
      pathname.match(
        /^\/admin\/(items|issues|categories|layers)$/
      )


    if (
      method ===
        'PUT' &&
      collectionMatch
    ) {
      const collection =
        collectionMatch[1]


      const body =
        await readJsonBody(
          req
        )


      const records =
        normalizeRecords(
          body?.records
        )


      const snapshot =
        await queueMutation(
          (
            current
          ) => ({
            ...current,

            [collection]:
              records,
          })
        )


      sendJson(
        res,
        200,
        {
          ok:
            true,

          collection,

          count:
            records.length,

          snapshot,
        }
      )


      return
    }


    next()
  }
  catch (
    error
  ) {
    console.error(
      'HISTORIC STORE ERROR:',
      error
    )


    if (
      res.writableEnded
    ) {
      return
    }


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
          error?.message ||
          'Historic persistence failed.',
      }
    )
  }
}


export function torontoHistoricFeed() {
  return {
    name:
      'toronto-historic-feed',

    configResolved(
      config
    ) {
      const env =
        loadEnv(
          config?.mode ||
            'production',
          config?.envDir ||
            process.cwd(),
          ''
        )


      resolvedDataDirectory =
        String(
          process.env.GEOGRAPHIC_DATA_DIR ??
          env.GEOGRAPHIC_DATA_DIR ??
          ''
        )
          .trim()
    },

    configureServer(
      server
    ) {
      server.middlewares.use(
        '/api/geographic/toronto/historic',
        handleHistoricRequest
      )
    },
  }
}
