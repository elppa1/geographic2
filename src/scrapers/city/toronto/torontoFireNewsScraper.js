const TORONTO_FIRE_ENDPOINT =
  (
    '/api/toronto/fire/' +
    'wp-content/uploads/' +
    '2017/11/' +
    '9775-actiefireincidents.html'
  )


const TORONTO_FIRE_PUBLIC_URL =
  (
    'https://www.toronto.ca/' +
    'community-people/' +
    'public-safety-alerts/' +
    'alerts-notifications/' +
    'toronto-fire-active-incidents/'
  )


const TORONTO_FIRE_SOURCE_ID =
  'toronto-fire-active-incidents'


const TORONTO_FIRE_SOURCE_NAME =
  'Toronto Fire Services'


// ============================================================
// TEXT
// ============================================================

function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\u00a0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// SLUG
// ============================================================

function slugify(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      '-'
    )
    .replace(
      /^-+|-+$/g,
      ''
    )
}


// ============================================================
// TORONTO DATE
// ============================================================

function getTorontoDateString() {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone:
        'America/Toronto',

      year:
        'numeric',

      month:
        '2-digit',

      day:
        '2-digit',
    }
  )
    .format(
      new Date()
    )
}


// ============================================================
// DISPATCH TIME
// ============================================================
//
// The active Fire feed may provide a time rather than a full
// timestamp.
//
// We only need this to establish that the incident is current.
// Geographic does NOT use this scraper as a historical archive.
//
// ============================================================

function buildPublishedAt(
  dispatchTime
) {
  const today =
    getTorontoDateString()


  const time =
    cleanText(
      dispatchTime
    )


  if (
    !time
  ) {
    return new Date()
      .toISOString()
  }


  const match12 =
    time.match(
      /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
    )


  if (
    match12
  ) {
    let hour =
      Number(
        match12[1]
      )


    const minute =
      Number(
        match12[2]
      )


    const period =
      match12[3]
        .toUpperCase()


    if (
      period ===
        'PM' &&
      hour !==
        12
    ) {
      hour +=
        12
    }


    if (
      period ===
        'AM' &&
      hour ===
        12
    ) {
      hour =
        0
    }


    const localValue =
      (
        `${today}T` +
        `${String(hour).padStart(2, '0')}:` +
        `${String(minute).padStart(2, '0')}:00`
      )


    const parsed =
      new Date(
        localValue
      )


    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed
        .toISOString()
    }
  }


  const match24 =
    time.match(
      /^(\d{1,2}):(\d{2})$/
    )


  if (
    match24
  ) {
    const hour =
      String(
        Number(
          match24[1]
        )
      )
        .padStart(
          2,
          '0'
        )


    const minute =
      match24[2]


    const localValue =
      (
        `${today}T` +
        `${hour}:${minute}:00`
      )


    const parsed =
      new Date(
        localValue
      )


    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed
        .toISOString()
    }
  }


  return new Date()
    .toISOString()
}


// ============================================================
// SHORT EXPIRY
// ============================================================
//
// Safety net only.
//
// Fire incidents come from the ACTIVE feed.
//
// We do not want these becoming permanent NEWS records.
//
// ============================================================

function buildExpiry() {
  const expiry =
    new Date()


  expiry.setHours(
    expiry.getHours() +
    12
  )


  return expiry
    .toISOString()
}


// ============================================================
// HEADER
// ============================================================

function normalizeHeader(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .trim()
}


// ============================================================
// HEADER MAP
// ============================================================

function buildHeaderMap(
  table
) {
  const rows = [
    ...table.querySelectorAll(
      'tr'
    ),
  ]


  if (
    rows.length ===
    0
  ) {
    return {}
  }


  const firstRow =
    rows[0]


  const cells = [
    ...firstRow.querySelectorAll(
      'th, td'
    ),
  ]


  const map =
    {}


  cells.forEach(
    (
      cell,
      index
    ) => {
      const header =
        normalizeHeader(
          cell.textContent
        )


      if (
        header.includes(
          'prime'
        ) &&
        header.includes(
          'street'
        )
      ) {
        map.primeStreet =
          index
      }


      if (
        header.includes(
          'cross'
        ) &&
        header.includes(
          'street'
        )
      ) {
        map.crossStreet =
          index
      }


      if (
        header.includes(
          'dispatch'
        ) &&
        header.includes(
          'time'
        )
      ) {
        map.dispatchTime =
          index
      }


      if (
        header.includes(
          'incident'
        ) &&
        header.includes(
          'number'
        )
      ) {
        map.incidentNumber =
          index
      }


      if (
        header.includes(
          'incident'
        ) &&
        header.includes(
          'type'
        )
      ) {
        map.incidentType =
          index
      }


      if (
        header.includes(
          'alarm'
        )
      ) {
        map.alarmLevel =
          index
      }


      if (
        header ===
        'area'
      ) {
        map.area =
          index
      }


      if (
        header.includes(
          'dispatched'
        ) &&
        header.includes(
          'units'
        )
      ) {
        map.dispatchedUnits =
          index
      }
    }
  )


  return map
}


// ============================================================
// DEFAULT HEADER MAP
// ============================================================
//
// The Toronto Fire table has a stable eight-column layout.
//
// If City markup does not use normal <th> elements, this keeps
// the scraper working.
//
// ============================================================

const DEFAULT_HEADER_MAP = {
  primeStreet:
    0,

  crossStreet:
    1,

  dispatchTime:
    2,

  incidentNumber:
    3,

  incidentType:
    4,

  alarmLevel:
    5,

  area:
    6,

  dispatchedUnits:
    7,
}


// ============================================================
// CELL
// ============================================================

function getCell(
  cells,
  index
) {
  if (
    !Number.isInteger(
      index
    )
  ) {
    return ''
  }


  return cleanText(
    cells[
      index
    ]?.textContent
  )
}


// ============================================================
// INCIDENT ROW
// ============================================================

function parseIncidentRow({
  row,
  headerMap,
}) {
  const cells = [
    ...row.querySelectorAll(
      'td'
    ),
  ]


  if (
    cells.length <
    8
  ) {
    return null
  }


  const primeStreet =
    getCell(
      cells,
      headerMap.primeStreet
    )


  const crossStreet =
    getCell(
      cells,
      headerMap.crossStreet
    )


  const dispatchTime =
    getCell(
      cells,
      headerMap.dispatchTime
    )


  const incidentNumber =
    getCell(
      cells,
      headerMap.incidentNumber
    )


  const incidentType =
    getCell(
      cells,
      headerMap.incidentType
    )


  const alarmLevel =
    getCell(
      cells,
      headerMap.alarmLevel
    )


  const area =
    getCell(
      cells,
      headerMap.area
    )


  const dispatchedUnits =
    getCell(
      cells,
      headerMap.dispatchedUnits
    )


  if (
    !primeStreet &&
    !crossStreet
  ) {
    return null
  }


  return {
    primeStreet,
    crossStreet,
    dispatchTime,
    incidentNumber,
    incidentType,
    alarmLevel,
    area,
    dispatchedUnits,
  }
}


// ============================================================
// LOCATION
// ============================================================

function isFireAreaCode(
  value
) {
  return /^(NY|EY|SC|ET|YK|TO|TT)$/i.test(
    cleanText(
      value
    )
  )
}


function fireLocationPieces(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /\s*,\s*(?:NY|EY|SC|ET|YK|TO|TT)$/i,
      ''
    )
    .split(
      /\s*\/\s*/
    )
    .map(
      cleanText
    )
    .filter(
      Boolean
    )
    .filter(
      (
        piece
      ) =>
        !isFireAreaCode(
          piece
        )
    )
}


function buildLocation({
  primeStreet,
  crossStreet,
}) {
  const prime =
    fireLocationPieces(
      primeStreet
    )
      .join(
        ' / '
      )


  const cross =
    fireLocationPieces(
      crossStreet
    )
      .join(
        ' / '
      )


  if (
    prime &&
    cross
  ) {
    return {
      location:
        `${prime} & ${cross}`,

      intersection:
        `${prime} & ${cross}`,

      precision:
        'intersection',
    }
  }


  if (
    prime
  ) {
    return {
      location:
        prime,

      intersection:
        prime,

      precision:
        'street',
    }
  }


  if (
    cross
  ) {
    return {
      location:
        cross,

      intersection:
        cross,

      precision:
        'street',
    }
  }


  return {
    location:
      '',

    intersection:
      '',

    precision:
      '',
  }
}


// ============================================================
// EXTERNAL ID
// ============================================================

function buildExternalId(
  incident
) {
  const number =
    cleanText(
      incident.incidentNumber
    )


  if (
    number
  ) {
    return (
      'toronto-fire-' +
      slugify(
        number
      )
    )
  }


  return (
    'toronto-fire-' +
    slugify(
      [
        incident.primeStreet,
        incident.crossStreet,
        incident.dispatchTime,
        incident.incidentType,
      ]
        .join(
          '-'
        )
    )
  )
}


// ============================================================
// TITLE
// ============================================================

function buildTitle({
  incidentType,
  location,
}) {
  const type =
    cleanText(
      incidentType
    ) ||
    'Toronto Fire incident'


  if (
    location
  ) {
    return (
      `${type} · ` +
      location
    )
  }


  return type
}


// ============================================================
// DESCRIPTION
// ============================================================

function buildDescription(
  incident,
  location
) {
  const incidentType =
    cleanText(
      incident.incidentType
    )


  const place =
    cleanText(
      location
    )


  let sentence =
    'Toronto Fire Services is responding'


  if (
    incidentType &&
    place
  ) {
    sentence =
      (
        'Toronto Fire Services is responding to ' +
        incidentType.toLowerCase() +
        ' at ' +
        place +
        '.'
      )
  }
  else if (
    incidentType
  ) {
    sentence =
      (
        'Toronto Fire Services is responding to ' +
        incidentType.toLowerCase() +
        '.'
      )
  }
  else if (
    place
  ) {
    sentence =
      (
        'Toronto Fire Services is responding to an active incident at ' +
        place +
        '.'
      )
  }
  else {
    sentence +=
      ' to an active incident.'
  }


  const details =
    []


  if (
    incident.dispatchTime
  ) {
    details.push(
      (
        'Dispatched ' +
        cleanText(
          incident.dispatchTime
        )
      )
    )
  }


  if (
    incident.alarmLevel
  ) {
    details.push(
      (
        'Alarm ' +
        cleanText(
          incident.alarmLevel
        )
      )
    )
  }


  if (
    incident.area
  ) {
    details.push(
      (
        'Area ' +
        cleanText(
          incident.area
        )
      )
    )
  }


  if (
    incident.dispatchedUnits
  ) {
    details.push(
      (
        'Units ' +
        cleanText(
          incident.dispatchedUnits
        )
      )
    )
  }


  if (
    details.length ===
      0
  ) {
    return sentence
  }


  return (
    sentence +
    ' ' +
    details.join(
      ' · '
    )
  )
}



// ============================================================
// RECORD
// ============================================================

function buildRecord(
  incident
) {
  const geographic =
    buildLocation({
      primeStreet:
        incident.primeStreet,

      crossStreet:
        incident.crossStreet,
    })


  if (
    !geographic.location
  ) {
    return null
  }


  return {
    externalId:
      buildExternalId(
        incident
      ),

    city:
      'toronto',

    type:
      'news',

    category:
      'fire',

    title:
      buildTitle({
        incidentType:
          incident.incidentType,

        location:
          geographic.location,
      }),

    description:
      buildDescription(
        incident,
        geographic.location
      ),

    location:
      geographic.location,

    intersection:
      geographic.intersection,

    locationPrecision:
      geographic.precision,

    longitude:
      null,

    latitude:
      null,

    pinPositionMode:
      'auto',

    searchedLongitude:
      null,

    searchedLatitude:
      null,

    source:
      TORONTO_FIRE_SOURCE_NAME,

    scraperSource:
      TORONTO_FIRE_SOURCE_ID,

    origin:
      'toronto-fire-feed',

    newsroomSource:
      'toronto-fire-feed',

    sourceUrl:
      TORONTO_FIRE_PUBLIC_URL,

    attribution:
      'Source: Toronto Fire Services Active Incidents',

    officialSource:
      true,

    contentMode:
      'official-active-feed',

    fireIncidentNumber:
      cleanText(
        incident.incidentNumber
      ),

    fireIncidentType:
      cleanText(
        incident.incidentType
      ),

    fireAlarmLevel:
      cleanText(
        incident.alarmLevel
      ),

    fireArea:
      cleanText(
        incident.area
      ),

    fireDispatchedUnits:
      cleanText(
        incident.dispatchedUnits
      ),

    publishedAt:
      buildPublishedAt(
        incident.dispatchTime
      ),

    expiresAt:
      buildExpiry(),

    active:
      true,
  }
}


// ============================================================
// FIRE TABLE
// ============================================================

function findFireTable(
  document
) {
  const tables = [
    ...document.querySelectorAll(
      'table'
    ),
  ]


  if (
    tables.length ===
    0
  ) {
    return null
  }


  const matching =
    tables.find(
      (
        table
      ) => {
        const text =
          normalizeHeader(
            table.textContent
          )


        return (
          text.includes(
            'prime street'
          ) &&
          text.includes(
            'cross street'
          ) &&
          text.includes(
            'incident'
          )
        )
      }
    )


  return (
    matching ||
    tables[0]
  )
}


// ============================================================
// PARSE FIRE HTML
// ============================================================

function parseFirePage(
  html
) {
  const parser =
    new DOMParser()


  const document =
    parser.parseFromString(
      html,
      'text/html'
    )


  const table =
    findFireTable(
      document
    )


  if (
    !table
  ) {
    console.warn(
      'TORONTO FIRE TABLE NOT FOUND'
    )


    return []
  }


  const detectedHeaderMap =
    buildHeaderMap(
      table
    )


  const headerMap = {
    ...DEFAULT_HEADER_MAP,
    ...detectedHeaderMap,
  }


  const rows = [
    ...table.querySelectorAll(
      'tr'
    ),
  ]


  if (
    rows.length <=
    1
  ) {
    return []
  }


  return rows
    .slice(
      1
    )
    .map(
      (
        row
      ) =>
        parseIncidentRow({
          row,
          headerMap,
        })
    )
    .filter(
      Boolean
    )
    .map(
      buildRecord
    )
    .filter(
      Boolean
    )
}


// ============================================================
// FETCH FIRE FEED
// ============================================================

async function fetchFireFeed() {
  const response =
    await fetch(
      TORONTO_FIRE_ENDPOINT,
      {
        cache:
          'no-store',
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TORONTO FIRE REQUEST FAILED · ' +
        `${response.status}`
      )
    )
  }


  return response.text()
}


// ============================================================
// SCRAPE
// ============================================================

export async function scrapeTorontoFireNews() {
  const html =
    await fetchFireFeed()


  const records =
    parseFirePage(
      html
    )


  console.log(
    'TORONTO FIRE ACTIVE INCIDENTS:',
    records.length
  )


  records.forEach(
    (
      record
    ) => {
      console.log(
        'TORONTO FIRE LOCATION:',
        record.title,
        '→',
        record.location
      )
    }
  )


  return records
}
