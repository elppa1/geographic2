const ADMIN_STORE_MIRROR_ENDPOINT =
  '/api/geographic/toronto/admin-store'


const LOCAL_FALLBACK_MAX_CHARS =
  1_500_000


const ADMIN_STORE_MIRROR_KEYS =
  new Set([
    'elppa-geographic-news',
    'elppa-geographic-new',
    'elppa-geographic-news-review',
    'elppa-geographic-new-review',
    'elppa-geographic-scraper-processed',
  ])


const memoryStores =
  new Map()


const writeChains =
  new Map()


let hydratePromise =
  null


let postgresAuthorityReady =
  false


function isAdminPage() {
  if (
    typeof window ===
      'undefined' ||
    typeof fetch !==
      'function'
  ) {
    return false
  }


  const pathname =
    String(
      window.location?.pathname ||
      ''
    )


  return (
    pathname ===
      '/admin' ||
    pathname.startsWith(
      '/admin/'
    )
  )
}


function readLocalRecords(
  key
) {
  if (
    typeof localStorage ===
      'undefined'
  ) {
    return []
  }


  try {
    const value =
      localStorage.getItem(
        key
      )


    if (
      !value
    ) {
      return []
    }


    const parsed =
      JSON.parse(
        value
      )


    return Array.isArray(
      parsed
    )
      ? parsed
      : []
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN STORE · LOCAL FALLBACK READ FAILED:',
      key,
      error?.message ||
      error
    )


    return []
  }
}


function writeLocalFallback(
  key,
  records
) {
  if (
    typeof localStorage ===
      'undefined'
  ) {
    return false
  }


  try {
    const serialized =
      JSON.stringify(
        records
      )


    if (
      serialized.length >
      LOCAL_FALLBACK_MAX_CHARS
    ) {
      console.warn(
        'ADMIN STORE · LOCAL FALLBACK SKIPPED · PAYLOAD TOO LARGE:',
        key,
        serialized.length
      )


      return false
    }


    localStorage.setItem(
      key,
      serialized
    )


    return true
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN STORE · LOCAL FALLBACK WRITE FAILED:',
      key,
      error?.message ||
      error
    )


    return false
  }
}


function ensureMemoryStore(
  key
) {
  if (
    !memoryStores.has(
      key
    )
  ) {
    memoryStores.set(
      key,
      readLocalRecords(
        key
      )
    )
  }


  return (
    memoryStores.get(
      key
    ) ||
    []
  )
}


for (
  const key
  of ADMIN_STORE_MIRROR_KEYS
) {
  ensureMemoryStore(
    key
  )
}


async function sendMirror({
  key,
  records,
  mode,
}) {
  if (
    !isAdminPage() ||
    !ADMIN_STORE_MIRROR_KEYS.has(
      key
    ) ||
    !Array.isArray(
      records
    )
  ) {
    return false
  }


  try {
    const response =
      await fetch(
        `${ADMIN_STORE_MIRROR_ENDPOINT}/${encodeURIComponent(
          key
        )}`,
        {
          method:
            'POST',

          credentials:
            'same-origin',

          headers: {
            Accept:
              'application/json',

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              mode,
              records,
            }),
        }
      )


    const payload =
      await response.json()
        .catch(
          () => null
        )


    if (
      !response.ok ||
      payload?.ok !==
        true
    ) {
      throw new Error(
        payload?.error ||
        `HTTP ${response.status}`
      )
    }


    return true
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN STORE · POSTGRES WRITE FAILED:',
      key,
      error?.message ||
      error
    )


    return false
  }
}


async function fetchPostgresRecords(
  key
) {
  const response =
    await fetch(
      `${ADMIN_STORE_MIRROR_ENDPOINT}/${encodeURIComponent(
        key
      )}`,
      {
        method:
          'GET',

        credentials:
          'same-origin',

        headers: {
          Accept:
            'application/json',
        },

        cache:
          'no-store',
      }
    )


  const payload =
    await response.json()
      .catch(
        () => null
      )


  if (
    response.status ===
      404
  ) {
    return {
      found:
        false,

      records:
        [],
    }
  }


  if (
    !response.ok
  ) {
    throw new Error(
      payload?.error ||
      `HTTP ${response.status}`
    )
  }


  if (
    payload?.ok !==
      true ||
    !Array.isArray(
      payload.records
    )
  ) {
    throw new Error(
      'Invalid Postgres admin store response.'
    )
  }


  return {
    found:
      true,

    records:
      payload.records,
  }
}


function queueRemoteWrite(
  key,
  records
) {
  const previous =
    writeChains.get(
      key
    ) ||
    Promise.resolve()


  const run =
    previous
      .catch(
        () => {}
      )
      .then(
        async () => {
          const written =
            await sendMirror({
              key,
              records,
              mode:
                'write',
            })


          if (
            !written &&
            !postgresAuthorityReady
          ) {
            writeLocalFallback(
              key,
              records
            )
          }


          return written
        }
      )


  writeChains.set(
    key,
    run
  )


  run.finally(
    () => {
      if (
        writeChains.get(
          key
        ) ===
          run
      ) {
        writeChains.delete(
          key
        )
      }
    }
  )


  return run
}


export function isPostgresAdminStoreKey(
  key
) {
  return ADMIN_STORE_MIRROR_KEYS.has(
    key
  )
}


export function getAdminStoreRecords(
  key
) {
  if (
    !ADMIN_STORE_MIRROR_KEYS.has(
      key
    )
  ) {
    return []
  }


  return [
    ...ensureMemoryStore(
      key
    ),
  ]
}


export function writeAdminStoreRecords(
  key,
  records
) {
  if (
    !ADMIN_STORE_MIRROR_KEYS.has(
      key
    ) ||
    !Array.isArray(
      records
    )
  ) {
    return
  }


  const snapshot = [
    ...records,
  ]


  memoryStores.set(
    key,
    snapshot
  )


  if (
    !postgresAuthorityReady
  ) {
    writeLocalFallback(
      key,
      snapshot
    )
  }


  return queueRemoteWrite(
    key,
    snapshot
  )
}


export function hydrateAdminStoresFromPostgres() {
  if (
    hydratePromise
  ) {
    return hydratePromise
  }


  if (
    !isAdminPage()
  ) {
    return Promise.resolve({
      ok:
        false,

      authoritative:
        false,

      counts:
        {},
    })
  }


  hydratePromise =
    (async () => {
      const loaded =
        new Map()


      for (
        const key
        of ADMIN_STORE_MIRROR_KEYS
      ) {
        try {
          const snapshot =
            await fetchPostgresRecords(
              key
            )


          if (
            snapshot.found
          ) {
            loaded.set(
              key,
              snapshot.records
            )


            continue
          }


          const localRecords = [
            ...ensureMemoryStore(
              key
            ),
          ]


          const seeded =
            await sendMirror({
              key,

              records:
                localRecords,

              mode:
                'seed',
            })


          if (
            !seeded
          ) {
            throw new Error(
              'Initial Postgres migration failed.'
            )
          }


          loaded.set(
            key,
            localRecords
          )
        }
        catch (
          error
        ) {
          console.warn(
            'ADMIN STORE · POSTGRES HYDRATE FAILED:',
            key,
            error?.message ||
            error
          )


          return {
            ok:
              false,

            authoritative:
              false,

            counts:
              Object.fromEntries(
                [
                  ...loaded.entries(),
                ]
                  .map(
                    ([
                      loadedKey,
                      records,
                    ]) => [
                      loadedKey,
                      records.length,
                    ]
                  )
              ),
          }
        }
      }


      loaded.forEach(
        (
          records,
          key
        ) => {
          memoryStores.set(
            key,
            [
              ...records,
            ]
          )
        }
      )


      postgresAuthorityReady =
        true


      return {
        ok:
          true,

        authoritative:
          true,

        counts:
          Object.fromEntries(
            [
              ...loaded.entries(),
            ]
              .map(
                ([
                  key,
                  records,
                ]) => [
                  key,
                  records.length,
                ]
              )
          ),
      }
    })()


  return hydratePromise
}
