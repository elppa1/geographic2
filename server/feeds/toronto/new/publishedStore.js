import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'

import {
  join,
  resolve,
} from 'node:path'

import {
  fileURLToPath,
} from 'node:url'


const DEFAULT_DATA_DIR =
  fileURLToPath(
    new URL(
      '../../../data/',
      import.meta.url
    )
  )


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


function smallHash(
  value
) {
  let hash =
    2166136261


  const text =
    String(
      value ||
      ''
    )


  for (
    let index =
      0;
    index <
      text.length;
    index +=
      1
  ) {
    hash ^=
      text.charCodeAt(
        index
      )


    hash =
      Math.imul(
        hash,
        16777619
      )
  }


  return (
    hash >>>
    0
  )
    .toString(
      36
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
      2_000_000
    ) {
      throw new Error(
        'Request body is too large.'
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


function stripWorkflowFields(
  record
) {
  const next = {
    ...record,
  }


  delete next.reviewStatus
  delete next.receivedAt
  delete next.newsroomAction
  delete next.deliveryMode
  delete next.previousRecord
  delete next.incomingRecord
  delete next.changedFields
  delete next.targetId
  delete next.targetExternalId
  delete next.resolutionReason
  delete next.missingPolls
  delete next.serverSyncPending


  return next
}


function recordIdentity(
  record
) {
  const externalId =
    cleanText(
      record?.externalId
    )


  if (
    externalId
  ) {
    return (
      'external:' +
      externalId
    )
  }


  const id =
    cleanText(
      record?.id
    )


  if (
    id
  ) {
    return (
      'id:' +
      id
    )
  }


  const title =
    cleanText(
      record?.title
    )


  const location =
    cleanText(
      record?.location ||
      record?.intersection
    )


  const latitude =
    cleanText(
      record?.latitude
    )


  const longitude =
    cleanText(
      record?.longitude
    )


  if (
    !title ||
    (
      !location &&
      !latitude &&
      !longitude
    )
  ) {
    return ''
  }


  return (
    'fallback:' +
    smallHash(
      [
        title,
        location,
        latitude,
        longitude,
        cleanText(
          record?.sourceUrl
        ),
      ]
        .join(
          '|'
        )
        .toLowerCase()
    )
  )
}


export function createPublishedNewFeed({
  newType,
  fileName,
  basePath,
}) {
  const normalizedNewType =
    cleanText(
      newType
    )
      .toLowerCase()


  if (
    !normalizedNewType
  ) {
    throw new Error(
      'Published NEW feed requires a newType.'
    )
  }


  const normalizedBasePath =
    cleanText(
      basePath
    )


  if (
    !normalizedBasePath
  ) {
    throw new Error(
      'Published NEW feed requires a basePath.'
    )
  }


  const dataDir =
    resolve(
      process.env.GEOGRAPHIC_DATA_DIR ||
      DEFAULT_DATA_DIR
    )


  const storePath =
    join(
      dataDir,
      fileName
    )


  let loaded =
    false


  let writeChain =
    Promise.resolve()


  let store = {
    version:
      1,

    city:
      'toronto',

    newType:
      normalizedNewType,

    records:
      {},

    updatedAt:
      '',
  }


  async function ensureLoaded() {
    if (
      loaded
    ) {
      return
    }


    loaded =
      true


    try {
      const raw =
        await readFile(
          storePath,
          'utf8'
        )


      const parsed =
        JSON.parse(
          raw
        )


      if (
        parsed &&
        typeof parsed ===
          'object'
      ) {
        store = {
          ...store,
          ...parsed,

          city:
            'toronto',

          newType:
            normalizedNewType,

          records:
            parsed.records &&
            typeof parsed.records ===
              'object' &&
            !Array.isArray(
              parsed.records
            )
              ? parsed.records
              : {},
        }
      }
    }
    catch (
      error
    ) {
      if (
        error?.code !==
          'ENOENT'
      ) {
        console.warn(
          `TORONTO NEW ${normalizedNewType.toUpperCase()} · STORE READ FAILED:`,
          error
        )
      }
    }
  }


  async function persistStore() {
    store.updatedAt =
      new Date()
        .toISOString()


    writeChain =
      writeChain.then(
        async () => {
          await mkdir(
            dataDir,
            {
              recursive:
                true,
            }
          )


          await writeFile(
            storePath,
            JSON.stringify(
              store,
              null,
              2
            ),
            'utf8'
          )
        }
      )


    return writeChain
  }


  function findEntry(
    record
  ) {
    const identity =
      recordIdentity(
        record
      )


    if (
      identity &&
      store.records?.[
        identity
      ]
    ) {
      return [
        identity,
        store.records[
          identity
        ],
      ]
    }


    const externalId =
      cleanText(
        record?.externalId
      )


    const id =
      cleanText(
        record?.id
      )


    const match =
      Object.entries(
        store.records ||
        {}
      )
        .find(
          ([
            ,
            item,
          ]) =>
            (
              externalId &&
              cleanText(
                item?.externalId
              ) ===
                externalId
            ) ||
            (
              id &&
              cleanText(
                item?.id
              ) ===
                id
            )
        )


    return (
      match ||
      [
        '',
        null,
      ]
    )
  }


  function normalizeRecord({
    record,
    existing =
      null,
    active =
      null,
    archiveReason =
      '',
  }) {
    const now =
      new Date()
        .toISOString()


    const cleaned =
      stripWorkflowFields(
        record ||
        {}
      )


    const identity =
      recordIdentity({
        ...existing,
        ...cleaned,
      })


    if (
      !identity
    ) {
      throw new Error(
        'Published NEW record requires an id, externalId, or usable title/location identity.'
      )
    }


    const isActive =
      active ===
        null
        ? cleaned.active !==
            false
        : Boolean(
            active
          )


    const firstPublishedAt =
      existing?.firstPublishedAt ||
      cleaned.firstPublishedAt ||
      cleaned.serverPublishedAt ||
      cleaned.publishedAt ||
      cleaned.createdAt ||
      now


    const id =
      cleanText(
        existing?.id ||
        cleaned.id
      ) ||
      (
        'server-new-' +
        normalizedNewType +
        '-' +
        smallHash(
          identity
        )
      )


    return {
      identity,

      record: {
        ...existing,
        ...cleaned,

        id,

        city:
          'toronto',

        type:
          'new',

        newType:
          normalizedNewType,

        active:
          isActive,

        firstPublishedAt,

        publishedAt:
          existing?.publishedAt ||
          cleaned.publishedAt ||
          firstPublishedAt,

        serverPublishedAt:
          existing?.serverPublishedAt ||
          cleaned.serverPublishedAt ||
          now,

        serverUpdatedAt:
          now,

        updatedAt:
          cleaned.updatedAt ||
          now,

        archivedAt:
          isActive
            ? ''
            : (
                cleaned.archivedAt ||
                existing?.archivedAt ||
                cleaned.manuallyUnpublishedAt ||
                now
              ),

        archiveReason:
          isActive
            ? ''
            : (
                cleanText(
                  archiveReason ||
                  cleaned.archiveReason
                ) ||
                'removed-from-live-map'
              ),

        republishedAt:
          isActive &&
          existing?.active ===
            false
            ? now
            : (
                cleaned.republishedAt ||
                cleaned.manuallyRepublishedAt ||
                existing?.republishedAt ||
                ''
              ),
      },
    }
  }


  async function upsertRecord(
    record
  ) {
    await ensureLoaded()


    const [
      existingIdentity,
      existing,
    ] =
      findEntry(
        record
      )


    const normalized =
      normalizeRecord({
        record,
        existing,
      })


    if (
      existingIdentity &&
      existingIdentity !==
        normalized.identity
    ) {
      delete store.records[
        existingIdentity
      ]
    }


    store.records[
      normalized.identity
    ] =
      normalized.record


    await persistStore()


    return normalized.record
  }


  async function archiveRecord({
    id =
      '',
    externalId =
      '',
    record =
      null,
    reason =
      'removed-from-live-map',
  }) {
    await ensureLoaded()


    const candidate = {
      ...(record ||
        {}),

      id:
        id ||
        record?.id ||
        '',

      externalId:
        externalId ||
        record?.externalId ||
        '',
    }


    const [
      existingIdentity,
      existing,
    ] =
      findEntry(
        candidate
      )


    if (
      !existing
    ) {
      return null
    }


    const normalized =
      normalizeRecord({
        record: {
          ...existing,
          ...candidate,

          active:
            false,
        },

        existing,

        active:
          false,

        archiveReason:
          reason,
      })


    if (
      existingIdentity &&
      existingIdentity !==
        normalized.identity
    ) {
      delete store.records[
        existingIdentity
      ]
    }


    store.records[
      normalized.identity
    ] =
      normalized.record


    await persistStore()


    return normalized.record
  }


  async function getRecords({
    status =
      'live',
  } = {}) {
    await ensureLoaded()


    const normalizedStatus =
      cleanText(
        status
      )
        .toLowerCase()


    let records =
      Object.values(
        store.records ||
        {}
      )


    if (
      normalizedStatus ===
        'live'
    ) {
      records =
        records.filter(
          (record) =>
            record.active !==
              false
        )
    }
    else if (
      normalizedStatus ===
        'archive' ||
      normalizedStatus ===
        'archived' ||
      normalizedStatus ===
        'unpublished'
    ) {
      records =
        records.filter(
          (record) =>
            record.active ===
              false
        )
    }


    return records
      .sort(
        (
          a,
          b
        ) =>
          new Date(
            b.serverUpdatedAt ||
            b.updatedAt ||
            b.publishedAt ||
            0
          )
            .getTime() -
          new Date(
            a.serverUpdatedAt ||
            a.updatedAt ||
            a.publishedAt ||
            0
          )
            .getTime()
      )
  }


  return {
    name:
      `toronto-new-${normalizedNewType}-published`,


    configureServer(
      server
    ) {
      const publishedPath =
        `${normalizedBasePath}/published`


      server.middlewares.use(
        `${publishedPath}/upsert`,

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


          try {
            const body =
              await readJsonBody(
                req
              )


            const incoming =
              Array.isArray(
                body.records
              )
                ? body.records
                : (
                    body.record
                      ? [
                          body.record,
                        ]
                      : []
                  )


            if (
              incoming.length ===
                0
            ) {
              sendJson(
                res,
                400,
                {
                  ok:
                    false,

                  error:
                    'Missing published NEW records.',
                }
              )


              return
            }


            const records =
              []


            for (
              const record
              of incoming
            ) {
              records.push(
                await upsertRecord(
                  record
                )
              )
            }


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                city:
                  'toronto',

                newType:
                  normalizedNewType,

                count:
                  records.length,

                records,
              }
            )
          }
          catch (
            error
          ) {
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


      server.middlewares.use(
        `${publishedPath}/archive`,

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


          try {
            const body =
              await readJsonBody(
                req
              )


            const record =
              await archiveRecord({
                id:
                  body.id ||
                  body.record?.id ||
                  '',

                externalId:
                  body.externalId ||
                  body.record?.externalId ||
                  '',

                record:
                  body.record ||
                  null,

                reason:
                  body.reason ||
                  'removed-from-live-map',
              })


            if (
              !record
            ) {
              sendJson(
                res,
                404,
                {
                  ok:
                    false,

                  error:
                    'Published NEW record not found.',
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

                city:
                  'toronto',

                newType:
                  normalizedNewType,

                record,
              }
            )
          }
          catch (
            error
          ) {
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


      server.middlewares.use(
        publishedPath,

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
              'GET'
          ) {
            next()

            return
          }


          try {
            const url =
              new URL(
                req.url ||
                '/',
                'http://localhost'
              )


            const status =
              cleanText(
                url.searchParams.get(
                  'status'
                )
              ) ||
              'live'


            const records =
              await getRecords({
                status,
              })


            sendJson(
              res,
              200,
              {
                ok:
                  true,

                city:
                  'toronto',

                newType:
                  normalizedNewType,

                status,

                count:
                  records.length,

                updatedAt:
                  store.updatedAt,

                records,
              }
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              500,
              {
                ok:
                  false,

                city:
                  'toronto',

                newType:
                  normalizedNewType,

                records:
                  [],

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
