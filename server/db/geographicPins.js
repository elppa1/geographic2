import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises'

import {
  dirname,
  join,
} from 'node:path'

import {
  fileURLToPath,
} from 'node:url'


const __filename =
  fileURLToPath(
    import.meta.url
  )


const __dirname =
  dirname(
    __filename
  )


const DEFAULT_DATA_DIR =
  join(
    __dirname,
    '..',
    'data'
  )


const DATA_DIR =
  String(
    process.env.GEOGRAPHIC_DATA_DIR ||
    ''
  )
    .trim() ||
  DEFAULT_DATA_DIR


const STORE_PATH =
  join(
    DATA_DIR,
    'geographic-published-pins.json'
  )


let writeChain =
  Promise.resolve()


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim()
}


function createEmptyStore() {
  return {
    version:
      1,

    updatedAt:
      '',

    records:
      [],
  }
}


function normalizedScope({
  city =
    'toronto',
  type,
  subtype =
    '',
}) {
  const normalizedCity =
    cleanText(
      city
    ) ||
    'toronto'


  const normalizedType =
    cleanText(
      type
    )
      .toLowerCase()


  const normalizedSubtype =
    cleanText(
      subtype
    )
      .toLowerCase()


  if (
    !normalizedType
  ) {
    throw new Error(
      'Geographic pin type is required.'
    )
  }


  return {
    city:
      normalizedCity,

    type:
      normalizedType,

    subtype:
      normalizedSubtype,
  }
}


function normalizeStoredRecord(
  value
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value
    )
  ) {
    return null
  }


  const city =
    cleanText(
      value.city
    ) ||
    'toronto'


  const type =
    cleanText(
      value.type
    )
      .toLowerCase()


  const subtype =
    cleanText(
      value.subtype
    )
      .toLowerCase()


  const identity =
    cleanText(
      value.identity
    )


  const payload =
    value.payload &&
    typeof value.payload ===
      'object' &&
    !Array.isArray(
      value.payload
    )
      ? value.payload
      : {}


  if (
    !type ||
    !identity
  ) {
    return null
  }


  const active =
    value.active !==
      false


  return {
    city,
    type,
    subtype,
    identity,
    active,

    payload: {
      ...payload,
      city,
      type,
      ...(subtype
        ? {
            newType:
              subtype,
          }
        : {}),
      active,
    },

    createdAt:
      cleanText(
        value.createdAt
      ) ||
      new Date()
        .toISOString(),

    updatedAt:
      cleanText(
        value.updatedAt
      ) ||
      new Date()
        .toISOString(),
  }
}


async function readStore() {
  try {
    const raw =
      await readFile(
        STORE_PATH,
        'utf8'
      )


    const parsed =
      JSON.parse(
        raw
      )


    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      ) ||
      !Array.isArray(
        parsed.records
      )
    ) {
      throw new Error(
        'GEOGRAPHIC PIN STORE FORMAT INVALID'
      )
    }


    return {
      version:
        1,

      updatedAt:
        cleanText(
          parsed.updatedAt
        ),

      records:
        parsed.records
          .map(
            normalizeStoredRecord
          )
          .filter(
            Boolean
          ),
    }
  }
  catch (
    error
  ) {
    if (
      error?.code ===
        'ENOENT'
    ) {
      return createEmptyStore()
    }


    console.error(
      'GEOGRAPHIC PIN STORE · READ FAILED:',
      error
    )


    throw error
  }
}


async function writeStoreAtomic(
  store
) {
  await mkdir(
    DATA_DIR,
    {
      recursive:
        true,
    }
  )


  const nextStore = {
    version:
      1,

    updatedAt:
      new Date()
        .toISOString(),

    records:
      Array.isArray(
        store?.records
      )
        ? store.records
        : [],
  }


  const tempPath =
    `${STORE_PATH}.${process.pid}.tmp`


  await writeFile(
    tempPath,
    JSON.stringify(
      nextStore,
      null,
      2
    ),
    'utf8'
  )


  await rename(
    tempPath,
    STORE_PATH
  )


  return nextStore
}


function queueWrite(
  task
) {
  const run =
    writeChain
      .catch(
        () => {}
      )
      .then(
        task
      )


  writeChain =
    run


  return run
}


function recordForResponse(
  entry
) {
  const payload =
    entry?.payload &&
    typeof entry.payload ===
      'object'
      ? entry.payload
      : {}


  return {
    ...payload,

    active:
      entry?.active !==
        false,
  }
}


function scopeMatches(
  entry,
  scope
) {
  return (
    entry.city ===
      scope.city &&
    entry.type ===
      scope.type &&
    entry.subtype ===
      scope.subtype
  )
}


export async function ensureGeographicPinsTable() {
  await mkdir(
    DATA_DIR,
    {
      recursive:
        true,
    }
  )


  // Validate an existing store if there is one. If the file does not yet
  // exist, readStore returns a fresh empty store without creating anything.
  await readStore()


  return true
}


export async function getGeographicPins({
  city =
    'toronto',
  type,
  subtype =
    '',
  status =
    'all',
} = {}) {
  const scope =
    normalizedScope({
      city,
      type,
      subtype,
    })


  const normalizedStatus =
    cleanText(
      status
    )
      .toLowerCase()


  const store =
    await readStore()


  return store.records
    .filter(
      (
        entry
      ) =>
        scopeMatches(
          entry,
          scope
        )
    )
    .filter(
      (
        entry
      ) => {
        if (
          normalizedStatus ===
            'live'
        ) {
          return entry.active !==
            false
        }


        if (
          normalizedStatus ===
            'archive' ||
          normalizedStatus ===
            'archived' ||
          normalizedStatus ===
            'unpublished'
        ) {
          return entry.active ===
            false
        }


        return true
      }
    )
    .sort(
      (
        a,
        b
      ) =>
        String(
          b.updatedAt ||
          ''
        )
          .localeCompare(
            String(
              a.updatedAt ||
              ''
            )
          )
    )
    .map(
      recordForResponse
    )
}


export async function findGeographicPin({
  city =
    'toronto',
  type,
  subtype =
    '',
  identity =
    '',
  externalId =
    '',
  id =
    '',
  caseKeys =
    [],
} = {}) {
  const scope =
    normalizedScope({
      city,
      type,
      subtype,
    })


  const normalizedIdentity =
    cleanText(
      identity
    )


  const normalizedExternalId =
    cleanText(
      externalId
    )


  const normalizedId =
    cleanText(
      id
    )


  const normalizedCaseKeys =
    (
      Array.isArray(
        caseKeys
      )
        ? caseKeys
        : []
    )
      .map(
        cleanText
      )
      .filter(
        Boolean
      )


  if (
    !normalizedIdentity &&
    !normalizedExternalId &&
    !normalizedId &&
    normalizedCaseKeys.length ===
      0
  ) {
    return null
  }


  const store =
    await readStore()


  const matching =
    store.records
      .filter(
        (
          entry
        ) =>
          scopeMatches(
            entry,
            scope
          )
      )
      .filter(
        (
          entry
        ) => {
          const payload =
            entry.payload ||
            {}


          if (
            normalizedIdentity &&
            entry.identity ===
              normalizedIdentity
          ) {
            return true
          }


          if (
            normalizedExternalId &&
            cleanText(
              payload.externalId
            ) ===
              normalizedExternalId
          ) {
            return true
          }


          if (
            normalizedId &&
            cleanText(
              payload.id
            ) ===
              normalizedId
          ) {
            return true
          }


          if (
            normalizedCaseKeys.length >
              0
          ) {
            const recordCaseKeys = [
              payload.caseNumber,
              payload.policeCaseNumber,
              payload.incidentNumber,
              payload.goNumber,
            ]
              .map(
                cleanText
              )
              .filter(
                Boolean
              )


            return recordCaseKeys.some(
              (
                key
              ) =>
                normalizedCaseKeys.includes(
                  key
                )
            )
          }


          return false
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          String(
            b.updatedAt ||
            ''
          )
            .localeCompare(
              String(
                a.updatedAt ||
                ''
              )
            )
      )


  return matching[0]
    ? recordForResponse(
        matching[0]
      )
    : null
}


export async function upsertGeographicPin({
  city =
    'toronto',
  type,
  subtype =
    '',
  identity,
  previousIdentity =
    '',
  record,
}) {
  const scope =
    normalizedScope({
      city,
      type,
      subtype,
    })


  const normalizedIdentity =
    cleanText(
      identity
    )


  if (
    !normalizedIdentity
  ) {
    throw new Error(
      'Geographic pin identity is required.'
    )
  }


  if (
    !record ||
    typeof record !==
      'object' ||
    Array.isArray(
      record
    )
  ) {
    throw new Error(
      'Geographic pin record is required.'
    )
  }


  const normalizedPreviousIdentity =
    cleanText(
      previousIdentity
    )


  const active =
    record.active !==
      false


  const now =
    new Date()
      .toISOString()


  const payload = {
    ...record,

    city:
      scope.city,

    type:
      scope.type,

    ...(scope.subtype
      ? {
          newType:
            scope.subtype,
        }
      : {}),

    active,
  }


  return queueWrite(
    async () => {
      const store =
        await readStore()


      if (
        normalizedPreviousIdentity &&
        normalizedPreviousIdentity !==
          normalizedIdentity
      ) {
        store.records =
          store.records.filter(
            (
              entry
            ) =>
              !(
                scopeMatches(
                  entry,
                  scope
                ) &&
                entry.identity ===
                  normalizedPreviousIdentity
              )
          )
      }


      const existingIndex =
        store.records.findIndex(
          (
            entry
          ) =>
            scopeMatches(
              entry,
              scope
            ) &&
            entry.identity ===
              normalizedIdentity
        )


      const existing =
        existingIndex >=
          0
          ? store.records[
              existingIndex
            ]
          : null


      const nextEntry = {
        city:
          scope.city,

        type:
          scope.type,

        subtype:
          scope.subtype,

        identity:
          normalizedIdentity,

        active,

        payload,

        createdAt:
          existing?.createdAt ||
          now,

        updatedAt:
          now,
      }


      if (
        existingIndex >=
          0
      ) {
        store.records[
          existingIndex
        ] =
          nextEntry
      }
      else {
        store.records.push(
          nextEntry
        )
      }


      await writeStoreAtomic(
        store
      )


      return recordForResponse(
        nextEntry
      )
    }
  )
}


export async function geographicPinsCounts({
  city =
    'toronto',
  type,
  subtype =
    '',
} = {}) {
  const scope =
    normalizedScope({
      city,
      type,
      subtype,
    })


  const store =
    await readStore()


  const records =
    store.records.filter(
      (
        entry
      ) =>
        scopeMatches(
          entry,
          scope
        )
    )


  const live =
    records.filter(
      (
        entry
      ) =>
        entry.active !==
          false
    )
      .length


  return {
    all:
      records.length,

    live,

    archive:
      records.length -
      live,
  }
}


export function getGeographicPinsStoreInfo() {
  return {
    dataDir:
      DATA_DIR,

    storePath:
      STORE_PATH,
  }
}
