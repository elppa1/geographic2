import {
  Pool,
} from 'pg'


let pool =
  null


let schemaPromise =
  null


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .trim()
}


function getDatabaseUrl() {
  const value =
    cleanText(
      process.env.DATABASE_URL
    )


  if (
    !value
  ) {
    throw new Error(
      'DATABASE_URL is not configured. Geographic published pins require PostgreSQL.'
    )
  }


  return value
}


function getPool() {
  if (
    pool
  ) {
    return pool
  }


  pool =
    new Pool({
      connectionString:
        getDatabaseUrl(),

      max:
        8,

      idleTimeoutMillis:
        30000,

      connectionTimeoutMillis:
        10000,
    })


  pool.on(
    'error',
    (
      error
    ) => {
      console.error(
        'GEOGRAPHIC DATABASE · POOL ERROR:',
        error
      )
    }
  )


  return pool
}


export async function ensureGeographicPinsTable() {
  if (
    schemaPromise
  ) {
    return schemaPromise
  }


  schemaPromise =
    (async () => {
      const client =
        await getPool()
          .connect()


      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS geographic_pins (
            city TEXT NOT NULL,
            pin_type TEXT NOT NULL,
            subtype TEXT NOT NULL DEFAULT '',
            identity TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (city, pin_type, subtype, identity)
          )
        `)


        await client.query(`
          CREATE INDEX IF NOT EXISTS geographic_pins_lookup_idx
          ON geographic_pins (city, pin_type, subtype, active, updated_at DESC)
        `)


        await client.query(`
          CREATE INDEX IF NOT EXISTS geographic_pins_external_id_idx
          ON geographic_pins ((payload ->> 'externalId'))
        `)
      }
      finally {
        client.release()
      }
    })()


  try {
    await schemaPromise
  }
  catch (
    error
  ) {
    schemaPromise =
      null


    throw error
  }


  return schemaPromise
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
      'Geographic database pin type is required.'
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


function recordFromRow(
  row
) {
  const payload =
    row?.payload &&
    typeof row.payload ===
      'object'
      ? row.payload
      : {}


  return {
    ...payload,

    active:
      row?.active !==
        false,
  }
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
  await ensureGeographicPinsTable()


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


  const values = [
    scope.city,
    scope.type,
    scope.subtype,
  ]


  let statusSql =
    ''


  if (
    normalizedStatus ===
      'live'
  ) {
    statusSql =
      ' AND active = TRUE'
  }
  else if (
    normalizedStatus ===
      'archive' ||
    normalizedStatus ===
      'archived' ||
    normalizedStatus ===
      'unpublished'
  ) {
    statusSql =
      ' AND active = FALSE'
  }


  const result =
    await getPool()
      .query(
        `
          SELECT
            identity,
            active,
            payload,
            created_at,
            updated_at
          FROM geographic_pins
          WHERE city = $1
            AND pin_type = $2
            AND subtype = $3
            ${statusSql}
          ORDER BY updated_at DESC
        `,
        values
      )


  return result.rows
    .map(
      recordFromRow
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
  await ensureGeographicPinsTable()


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


  const result =
    await getPool()
      .query(
        `
          SELECT
            identity,
            active,
            payload,
            created_at,
            updated_at
          FROM geographic_pins
          WHERE city = $1
            AND pin_type = $2
            AND subtype = $3
            AND (
              ($4 <> '' AND identity = $4)
              OR ($5 <> '' AND payload ->> 'externalId' = $5)
              OR ($6 <> '' AND payload ->> 'id' = $6)
              OR (
                cardinality($7::text[]) > 0
                AND (
                  payload ->> 'caseNumber' = ANY($7::text[])
                  OR payload ->> 'policeCaseNumber' = ANY($7::text[])
                  OR payload ->> 'incidentNumber' = ANY($7::text[])
                  OR payload ->> 'goNumber' = ANY($7::text[])
                )
              )
            )
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [
          scope.city,
          scope.type,
          scope.subtype,
          normalizedIdentity,
          normalizedExternalId,
          normalizedId,
          normalizedCaseKeys,
        ]
      )


  return result.rows[0]
    ? recordFromRow(
        result.rows[0]
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
  await ensureGeographicPinsTable()


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
      'Geographic database pin identity is required.'
    )
  }


  if (
    !record ||
    typeof record !==
      'object'
  ) {
    throw new Error(
      'Geographic database pin record is required.'
    )
  }


  const active =
    record.active !==
      false


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


  const client =
    await getPool()
      .connect()


  try {
    await client.query(
      'BEGIN'
    )


    const normalizedPreviousIdentity =
      cleanText(
        previousIdentity
      )


    if (
      normalizedPreviousIdentity &&
      normalizedPreviousIdentity !==
        normalizedIdentity
    ) {
      await client.query(
        `
          DELETE FROM geographic_pins
          WHERE city = $1
            AND pin_type = $2
            AND subtype = $3
            AND identity = $4
        `,
        [
          scope.city,
          scope.type,
          scope.subtype,
          normalizedPreviousIdentity,
        ]
      )
    }


    const result =
      await client.query(
        `
          INSERT INTO geographic_pins (
            city,
            pin_type,
            subtype,
            identity,
            active,
            payload,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::jsonb,
            NOW(),
            NOW()
          )
          ON CONFLICT (city, pin_type, subtype, identity)
          DO UPDATE SET
            active = EXCLUDED.active,
            payload = EXCLUDED.payload,
            updated_at = NOW()
          RETURNING
            identity,
            active,
            payload,
            created_at,
            updated_at
        `,
        [
          scope.city,
          scope.type,
          scope.subtype,
          normalizedIdentity,
          active,
          JSON.stringify(
            payload
          ),
        ]
      )


    await client.query(
      'COMMIT'
    )


    return recordFromRow(
      result.rows[0]
    )
  }
  catch (
    error
  ) {
    await client.query(
      'ROLLBACK'
    )


    throw error
  }
  finally {
    client.release()
  }
}


export async function geographicPinsCounts({
  city =
    'toronto',
  type,
  subtype =
    '',
} = {}) {
  await ensureGeographicPinsTable()


  const scope =
    normalizedScope({
      city,
      type,
      subtype,
    })


  const result =
    await getPool()
      .query(
        `
          SELECT
            COUNT(*)::integer AS all_count,
            COUNT(*) FILTER (WHERE active = TRUE)::integer AS live_count,
            COUNT(*) FILTER (WHERE active = FALSE)::integer AS archive_count
          FROM geographic_pins
          WHERE city = $1
            AND pin_type = $2
            AND subtype = $3
        `,
        [
          scope.city,
          scope.type,
          scope.subtype,
        ]
      )


  const row =
    result.rows[0] ||
    {}


  return {
    all:
      Number(
        row.all_count ||
        0
      ),

    live:
      Number(
        row.live_count ||
        0
      ),

    archive:
      Number(
        row.archive_count ||
        0
      ),
  }
}
