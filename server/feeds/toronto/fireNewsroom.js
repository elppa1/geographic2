const FIRE_PUBLIC_URL =
  'https://www.toronto.ca/community-people/public-safety-alerts/alerts-notifications/toronto-fire-active-incidents/'


const FIRE_UPSTREAM =
  'https://www.toronto.ca/data/fire/livecad.xml'


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        hex
      ) =>
        String.fromCodePoint(
          parseInt(
            hex,
            16
          )
        )
    )
    .replace(
      /&#(\d+);/g,
      (
        _match,
        decimal
      ) =>
        String.fromCodePoint(
          parseInt(
            decimal,
            10
          )
        )
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
// FIRE NORMALIZATION
// ============================================================

function decodeXmlText(
  value
) {
  return cleanText(
    String(
      value ??
      ''
    )
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        '$1'
      )
      .replace(
        /&nbsp;/gi,
        ' '
      )
      .replace(
        /&amp;/gi,
        '&'
      )
      .replace(
        /&quot;/gi,
        '"'
      )
      .replace(
        /&#39;/gi,
        "'"
      )
      .replace(
        /&apos;/gi,
        "'"
      )
      .replace(
        /&lt;/gi,
        '<'
      )
      .replace(
        /&gt;/gi,
        '>'
      )
  )
}


function fireXmlTag(
  block,
  tag
) {
  const match =
    String(
      block ??
      ''
    )
      .match(
        new RegExp(
          `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
          'i'
        )
      )


  return decodeXmlText(
    match?.[1] ||
    ''
  )
}


function parseFireRows(
  xml
) {
  const rows =
    []


  const eventPattern =
    /<event\b[^>]*>([\s\S]*?)<\/event>/gi


  let eventMatch


  while (
    (
      eventMatch =
        eventPattern.exec(
          String(
            xml ??
            ''
          )
        )
    )
  ) {
    const block =
      eventMatch[1]


    rows.push([
      fireXmlTag(
        block,
        'prime_street'
      ),

      fireXmlTag(
        block,
        'cross_streets'
      ),

      fireXmlTag(
        block,
        'dispatch_time'
      ),

      fireXmlTag(
        block,
        'event_num'
      ),

      fireXmlTag(
        block,
        'event_type'
      ),

      fireXmlTag(
        block,
        'alarm_lev'
      ),

      fireXmlTag(
        block,
        'beat'
      ),

      fireXmlTag(
        block,
        'units_disp'
      ),
    ])
  }


  return rows
}


function parseTorontoFireTime(
  value
) {
  const clean =
    cleanText(
      value
    )


  if (
    !clean
  ) {
    return new Date()
      .toISOString()
  }


  const direct =
    new Date(
      clean
    )


  if (
    !Number.isNaN(
      direct.getTime()
    )
  ) {
    return direct
      .toISOString()
  }


  // Common Toronto Fire display: YYYY-MM-DD HH:mm:ss
  const match =
    clean.match(
      /(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/
    )


  if (
    match
  ) {
    const isoLike =
      (
        `${match[1]}-${match[2]}-${match[3]}T` +
        `${match[4].padStart(2, '0')}:${match[5]}:${match[6] || '00'}`
      )


    const parsed =
      new Date(
        isoLike
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


function normalizeFireLocationPiece(
  value
) {
  return cleanText(
    value
  )
    .replace(
      /\s*,\s*(?:NY|EY|SC|ET|YK|TO)\b/gi,
      ''
    )
    .replace(
      /^\/+|\/+$/g,
      ''
    )
    .replace(
      /\s*\/\s*/g,
      ' / '
    )
    .trim()
}


function fireIncidentShouldBeReviewed({
  incidentType,
  alarmLevel,
}) {
  const type =
    cleanText(
      incidentType
    )
      .toLowerCase()


  const alarm =
    Number(
      cleanText(
        alarmLevel
      )
    )


  if (
    Number.isFinite(
      alarm
    ) &&
    alarm >=
      1
  ) {
    return true
  }


  const blockedPatterns = [
    /^medical\b/i,
    /^alarm single source\b/i,
    /^check call\b/i,
    /^rescue - elevator\b/i,
    /^water problem\b/i,
    /^public assist\b/i,
    /^assist - /i,
    /^alarm - /i,
  ]


  if (
    blockedPatterns.some(
      (
        pattern
      ) =>
        pattern.test(
          type
        )
    )
  ) {
    return false
  }


  const reviewPatterns = [
    /\bfire\b/i,
    /\bsmoke\b/i,
    /\bexplosion\b/i,
    /\bhazmat\b/i,
    /\bhazardous\b/i,
    /\bvehicle accident\b/i,
    /\btrapped\b/i,
    /\bextrication\b/i,
    /\bwater rescue\b/i,
    /\bmarine rescue\b/i,
    /\btechnical rescue\b/i,
    /\bconfined space\b/i,
    /\btrench\b/i,
    /\bhigh angle\b/i,
    /\bstructural collapse\b/i,
    /\bgas leak\b/i,
    /\bcarbon monoxide\b/i,
    /\bchemical\b/i,
  ]


  return reviewPatterns.some(
    (
      pattern
    ) =>
      pattern.test(
        type
      )
  )
}


function normalizeFireRow(
  cells
) {
  const primeStreet =
    normalizeFireLocationPiece(
      cells[0]
    )


  const crossStreet =
    normalizeFireLocationPiece(
      cells[1]
    )


  const dispatchTime =
    cleanText(
      cells[2]
    )


  const incidentNumber =
    cleanText(
      cells[3]
    )


  const incidentType =
    cleanText(
      cells[4]
    )


  const alarmLevel =
    cleanText(
      cells[5]
    )


  const area =
    cleanText(
      cells[6]
    )


  const dispatchedUnits =
    cleanText(
      cells[7]
    )


  if (
    !fireIncidentShouldBeReviewed({
      incidentType,
      alarmLevel,
    })
  ) {
    return null
  }


  if (
    !primeStreet &&
    !crossStreet
  ) {
    return null
  }


  let location =
    ''


  if (
    primeStreet &&
    crossStreet
  ) {
    location =
      (
        primeStreet +
        ' & ' +
        crossStreet
      )
  }
  else if (
    primeStreet
  ) {
    location =
      primeStreet
  }
  else {
    const crossPieces =
      crossStreet
        .split(
          /\s*\/\s*/
        )
        .map(
          normalizeFireLocationPiece
        )
        .filter(
          Boolean
        )


    location =
      crossPieces.length >=
        2
        ? (
            crossPieces[0] +
            ' & ' +
            crossPieces[1]
          )
        : crossStreet
  }


  const descriptionParts =
    []


  if (
    dispatchTime
  ) {
    descriptionParts.push(
      'Dispatch ' +
      dispatchTime
    )
  }


  if (
    alarmLevel
  ) {
    descriptionParts.push(
      'Alarm ' +
      alarmLevel
    )
  }


  if (
    area
  ) {
    descriptionParts.push(
      'Area ' +
      area
    )
  }


  if (
    dispatchedUnits
  ) {
    descriptionParts.push(
      'Units ' +
      dispatchedUnits
    )
  }


  if (
    incidentNumber
  ) {
    descriptionParts.push(
      'Incident ' +
      incidentNumber
    )
  }


  const publishedAt =
    parseTorontoFireTime(
      dispatchTime
    )


  return {
    externalId:
      'toronto-fire-' +
      slugify(
        incidentNumber ||
        [
          primeStreet,
          crossStreet,
          dispatchTime,
          incidentType,
        ]
          .join(
            '-'
          )
      ),

    scraperSource:
      'toronto-fire-active-incidents',

    origin:
      'toronto-fire-active-incidents',

    newsroomSource:
      'toronto-fire-active-incidents',

    city:
      'toronto',

    type:
      'news',

    category:
      'fire',

    title:
      (
        (
          incidentType ||
          'Toronto Fire incident'
        ) +
        ' · ' +
        location
      ),

    description:
      descriptionParts.join(
        ' · '
      ),

    location,

    intersection:
      location,

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
      'Toronto Fire Services',

    sourceUrl:
      FIRE_PUBLIC_URL,

    officialSource:
      true,

    publishedAt,

    active:
      true,

    alarmLevel,

    area,

    dispatchedUnits,

    incidentNumber,
  }
}


export async function fetchFireSnapshot() {
  const response =
    await fetch(
      FIRE_UPSTREAM,
      {
        headers: {
          Accept:
            'application/xml,text/xml,*/*',

          'User-Agent':
            'ELPPA-Geographic/1.0',
        },

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
        response.status
      )
    )
  }


  const xml =
    await response.text()


  const records =
    parseFireRows(
      xml
    )
      .map(
        normalizeFireRow
      )
      .filter(
        Boolean
      )


  console.log(
    'TORONTO FIRE · LIVE CAD:',
    {
      status:
        response.status,

      bytes:
        Buffer.byteLength(
          xml,
          'utf8'
        ),

      events:
        records.length,
    }
  )


  return records
}
