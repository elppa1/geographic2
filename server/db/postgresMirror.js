import {
  Pool,
} from 'pg'


const DATABASE_URL =
  String(
    process.env.DATABASE_URL ||
    ''
  )
    .trim()


let pool =
  null


let ensureDocumentsPromise =
  null


let ensureLedgerPromise =
  null


const loggedReadyKeys =
  new Set()


const documentWriteChains =
  new Map()


const ledgerWriteChains =
  new Map()


function queueByKey(
  chains,
  key,
  task
) {
  const previous =
    chains.get(
      key
    ) ||
    Promise.resolve()


  const run =
    previous
      .catch(
        () => {}
      )
      .then(
        task
      )


  chains.set(
    key,
    run
  )


  run.finally(
    () => {
      if (
        chains.get(
          key
        ) ===
          run
      ) {
        chains.delete(
          key
        )
      }
    }
  )


  return run
}


function getPool() {
  if (
    !DATABASE_URL
  ) {
    return null
  }


  if (
    !pool
  ) {
    pool =
      new Pool({
        connectionString:
          DATABASE_URL,

        max:
          4,

        connectionTimeoutMillis:
          5000,

        idleTimeoutMillis:
          30000,
      })
  }


  return pool
}


function logReady(
  storeKey
) {
  if (
    loggedReadyKeys.has(
      storeKey
    )
  ) {
    return
  }


  loggedReadyKeys.add(
    storeKey
  )


  console.log(
    'POSTGRES MIRROR · READY:',
    storeKey
  )
}


async function ensureDocumentsTable() {
  const database =
    getPool()


  if (
    !database
  ) {
    return false
  }


  if (
    !ensureDocumentsPromise
  ) {
    ensureDocumentsPromise =
      database.query(`
        CREATE TABLE IF NOT EXISTS geographic_documents (
          store_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
        .then(
          () => true
        )
        .catch(
          (
            error
          ) => {
            ensureDocumentsPromise =
              null


            throw error
          }
        )
  }


  return ensureDocumentsPromise
}


async function ensureLedgerTable() {
  const database =
    getPool()


  if (
    !database
  ) {
    return false
  }


  if (
    !ensureLedgerPromise
  ) {
    ensureLedgerPromise =
      database.query(`
        CREATE TABLE IF NOT EXISTS geographic_ledger_events (
          id BIGSERIAL PRIMARY KEY,
          ledger_key TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
        .then(
          () => true
        )
        .catch(
          (
            error
          ) => {
            ensureLedgerPromise =
              null


            throw error
          }
        )
  }


  return ensureLedgerPromise
}


export function postgresMirrorEnabled() {
  return Boolean(
    DATABASE_URL
  )
}


export function seedPostgresDocument({
  storeKey,
  payload,
}) {
  const database =
    getPool()


  if (
    !database ||
    !storeKey
  ) {
    return Promise.resolve(
      false
    )
  }


  return queueByKey(
    documentWriteChains,
    storeKey,
    async () => {
      try {
        await ensureDocumentsTable()


        await database.query(
          `
            INSERT INTO geographic_documents (
              store_key,
              payload,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2::jsonb,
              NOW(),
              NOW()
            )
            ON CONFLICT (store_key)
            DO NOTHING
          `,
          [
            storeKey,
            JSON.stringify(
              payload ??
              null
            ),
          ]
        )


        logReady(
          storeKey
        )


        return true
      }
      catch (
        error
      ) {
        console.warn(
          'POSTGRES MIRROR · SEED FAILED:',
          storeKey,
          error?.message ||
          error
        )


        return false
      }
    }
  )
}


export async function readPostgresDocument({
  storeKey,
}) {
  const database =
    getPool()


  if (
    !database ||
    !storeKey
  ) {
    return {
      found:
        false,

      payload:
        null,
    }
  }


  try {
    await ensureDocumentsTable()


    const result =
      await database.query(
        `
          SELECT
            payload
          FROM geographic_documents
          WHERE store_key = $1
          LIMIT 1
        `,
        [
          storeKey,
        ]
      )


    if (
      result.rows.length ===
        0
    ) {
      return {
        found:
          false,

        payload:
          null,
      }
    }


    logReady(
      storeKey
    )


    return {
      found:
        true,

      payload:
        result.rows[0]?.payload ??
        null,
    }
  }
  catch (
    error
  ) {
    console.warn(
      'POSTGRES MIRROR · READ FAILED:',
      storeKey,
      error?.message ||
      error
    )


    throw error
  }
}


export function writePostgresDocument({
  storeKey,
  payload,
}) {
  const database =
    getPool()


  if (
    !database ||
    !storeKey
  ) {
    return Promise.resolve(
      false
    )
  }


  return queueByKey(
    documentWriteChains,
    storeKey,
    async () => {
      try {
        await ensureDocumentsTable()


        await database.query(
          `
            INSERT INTO geographic_documents (
              store_key,
              payload,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2::jsonb,
              NOW(),
              NOW()
            )
            ON CONFLICT (store_key)
            DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = NOW()
          `,
          [
            storeKey,
            JSON.stringify(
              payload ??
              null
            ),
          ]
        )


        logReady(
          storeKey
        )


        return true
      }
      catch (
        error
      ) {
        console.warn(
          'POSTGRES MIRROR · WRITE FAILED:',
          storeKey,
          error?.message ||
          error
        )


        return false
      }
    }
  )
}


export function appendPostgresLedgerEvent({
  ledgerKey,
  payload,
}) {
  const database =
    getPool()


  if (
    !database ||
    !ledgerKey
  ) {
    return Promise.resolve(
      false
    )
  }


  return queueByKey(
    ledgerWriteChains,
    ledgerKey,
    async () => {
      try {
        await ensureLedgerTable()


        await database.query(
          `
            INSERT INTO geographic_ledger_events (
              ledger_key,
              payload,
              created_at
            )
            VALUES (
              $1,
              $2::jsonb,
              NOW()
            )
          `,
          [
            ledgerKey,
            JSON.stringify(
              payload ??
              null
            ),
          ]
        )


        logReady(
          ledgerKey
        )


        return true
      }
      catch (
        error
      ) {
        console.warn(
          'POSTGRES MIRROR · LEDGER WRITE FAILED:',
          ledgerKey,
          error?.message ||
          error
        )


        return false
      }
    }
  )
}
