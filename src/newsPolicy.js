// ============================================================
// GEOGRAPHIC - LIVE NEWS LIFECYCLE POLICY
// ============================================================
//
// Citywide shelf-life rules plus local retention windows.
//
// IMPORTANT:
//   - Citywide shelf life starts from the ORIGINAL source timestamp.
//   - Meaningful updates do NOT restart the clock.
//   - An official RESOLVE can remove an item earlier.
//   - Naturally expired stories may still be revealed locally:
//       neighbourhood view -> up to 14 days
//       street view        -> up to 30 days
//   - Manual unpublishes / suppressions / official resolves do NOT
//     become locally visible again.
//   - Ordinary editorial/news stories without one of these live-source
//     policies do not auto-expire here.
//
// Current rules:
//   TTC                         feed-controlled; no fixed timer
//   TPS missing person          5 days unless officially resolved
//   TPS all other police        7 days
//   Toronto Fire major          7 days
//   Toronto Fire standard       5 days
//   Toronto Fire minor / gas    2 days
//
// TTC is intentionally timer-free here. The live newsroom removes a
// TTC alert after it disappears from the official feed for the required
// consecutive missing polls.
//
// ============================================================

export const NEWS_SHELF_LIFE_HOURS = {
  ttc:
    null,

  fire:
    5 * 24,

  fireMajor:
    7 * 24,

  fireMinor:
    2 * 24,

  police: {
    missing:
      5 * 24,

    shooting:
      7 * 24,

    stabbing:
      7 * 24,

    major:
      7 * 24,

    collision:
      7 * 24,

    default:
      7 * 24,
  },
}


export const NEWS_LOCAL_RETENTION_HOURS = {
  neighbourhood:
    14 * 24,

  street:
    30 * 24,
}


function clean(
  value
) {
  return String(
    value ??
    ''
  )
    .trim()
    .toLowerCase()
}


function getRecordSearchText(
  record
) {
  return [
    record?.category,
    record?.title,
    record?.description,
    record?.incidentType,
    record?.eventType,
  ]
    .map(
      clean
    )
    .filter(
      Boolean
    )
    .join(
      ' '
    )
}


function getFireAlarmLevel(
  record
) {
  const direct =
    Number(
      String(
        record?.alarmLevel ??
        ''
      )
        .trim()
        .replace(
          /[^0-9.-]/g,
          ''
        )
    )


  if (
    Number.isFinite(
      direct
    )
  ) {
    return direct
  }


  const text =
    getRecordSearchText(
      record
    )


  const match =
    text.match(
      /\balarm(?:\s+level)?\s*[:#-]?\s*(\d+)\b/i
    )


  if (
    !match
  ) {
    return null
  }


  const parsed =
    Number(
      match[1]
    )


  return Number.isFinite(
    parsed
  )
    ? parsed
    : null
}


function getFireShelfLifeHours(
  record
) {
  const text =
    getRecordSearchText(
      record
    )


  const alarmLevel =
    getFireAlarmLevel(
      record
    )


  const majorFire =
    (
      Number.isFinite(
        Number(
          alarmLevel
        )
      ) &&
      Number(
        alarmLevel
      ) >=
        2
    ) ||
    /\bhigh[\s-]?rise\b/i.test(
      text
    ) ||
    /\bmultiple[\s-]?alarm\b/i.test(
      text
    ) ||
    /\bmulti[\s-]?alarm\b/i.test(
      text
    )


  if (
    majorFire
  ) {
    return NEWS_SHELF_LIFE_HOURS.fireMajor
  }


  const minorFire =
    /\bgas leak\b/i.test(
      text
    ) ||
    /\bnatural gas\b/i.test(
      text
    ) ||
    /\bgas odou?r\b/i.test(
      text
    ) ||
    /\bhazmat\b/i.test(
      text
    ) ||
    /\bhazardous material/i.test(
      text
    ) ||
    /\bcarbon monoxide\b/i.test(
      text
    )


  if (
    minorFire
  ) {
    return NEWS_SHELF_LIFE_HOURS.fireMinor
  }


  return NEWS_SHELF_LIFE_HOURS.fire
}


function getPoliceShelfLifeHours(
  record
) {
  const category =
    clean(
      record?.category
    )


  const text =
    getRecordSearchText(
      record
    )


  // LOCATED is a newsroom RESOLVE event, not a new live pin with
  // its own shelf-life clock.
  if (
    category ===
      'located'
  ) {
    return null
  }


  if (
    category ===
      'missing'
  ) {
    return NEWS_SHELF_LIFE_HOURS.police.missing
  }


  if (
    category ===
      'collision'
  ) {
    return NEWS_SHELF_LIFE_HOURS.police.collision
  }


  if (
    category ===
      'shooting'
  ) {
    return NEWS_SHELF_LIFE_HOURS.police.shooting
  }


  if (
    category ===
      'stabbing'
  ) {
    return NEWS_SHELF_LIFE_HOURS.police.stabbing
  }


  const majorPoliceIncident =
    category ===
      'homicide' ||
    category ===
      'firearm' ||
    /\bhomicide\b/i.test(
      text
    ) ||
    /\bfirearm\b/i.test(
      text
    ) ||
    /\bshots fired\b/i.test(
      text
    )


  if (
    majorPoliceIncident
  ) {
    return NEWS_SHELF_LIFE_HOURS.police.major
  }


  return NEWS_SHELF_LIFE_HOURS.police.default
}


export function getNewsSourceKey(
  record
) {
  const source =
    clean(
      record?.source ||
      record?.scraperSource ||
      record?.newsroomSource ||
      record?.origin
    )


  if (
    record?.category ===
      'ttc' ||
    source.includes(
      'transit commission'
    ) ||
    source.includes(
      'ttc'
    )
  ) {
    return 'ttc'
  }


  if (
    record?.category ===
      'fire' ||
    source.includes(
      'toronto fire'
    ) ||
    source.includes(
      'fire-active'
    )
  ) {
    return 'fire'
  }


  if (
    record?.origin ===
      'tps-email' ||
    record?.newsroomSource ===
      'tps-email' ||
    source.includes(
      'toronto police'
    ) ||
    source.includes(
      'tps'
    )
  ) {
    return 'police'
  }


  return 'other'
}


export function getNewsShelfLifeHours(
  record
) {
  const sourceKey =
    getNewsSourceKey(
      record
    )


  if (
    sourceKey ===
      'ttc'
  ) {
    return NEWS_SHELF_LIFE_HOURS.ttc
  }


  if (
    sourceKey ===
      'fire'
  ) {
    return getFireShelfLifeHours(
      record
    )
  }


  if (
    sourceKey ===
      'police'
  ) {
    return getPoliceShelfLifeHours(
      record
    )
  }


  return null
}


export function getNewsSourceTimestamp(
  record
) {
  const sourceKey =
    getNewsSourceKey(
      record
    )


  if (
    sourceKey ===
      'ttc'
  ) {
    if (
      record?.ttcSourceTimeKind ===
        'active-period-start' &&
      record?.ttcSourceTime
    ) {
      return record.ttcSourceTime
    }


    return (
      record?.firstSeenAt ||
      record?.ttcSourceTime ||
      record?.publishedAt ||
      ''
    )
  }


  if (
    sourceKey ===
      'police'
  ) {
    return (
      record?.firstPublishedAt ||
      record?.firstSeenAt ||
      record?.tpsBroadcastAt ||
      record?.publishedAt ||
      ''
    )
  }


  if (
    sourceKey ===
      'fire'
  ) {
    return (
      record?.firstSeenAt ||
      record?.publishedAt ||
      ''
    )
  }


  return (
    record?.publishedAt ||
    record?.firstSeenAt ||
    ''
  )
}


export function getNewsExpiresAt(
  record
) {
  const hours =
    getNewsShelfLifeHours(
      record
    )


  if (
    hours ===
      null ||
    hours ===
      undefined ||
    hours ===
      ''
  ) {
    return ''
  }


  if (
    !Number.isFinite(
      Number(
        hours
      )
    )
  ) {
    return ''
  }


  const sourceTime =
    getNewsSourceTimestamp(
      record
    )


  const start =
    new Date(
      sourceTime ||
      ''
    )
      .getTime()


  if (
    !Number.isFinite(
      start
    )
  ) {
    return ''
  }


  return new Date(
    start +
    Number(
      hours
    ) *
      60 *
      60 *
      1000
  )
    .toISOString()
}



export function getNewsLocalRetentionHours(
  scale =
    'street'
) {
  const normalizedScale =
    clean(
      scale
    )


  if (
    normalizedScale ===
      'neighbourhood' ||
    normalizedScale ===
      'neighborhood'
  ) {
    return NEWS_LOCAL_RETENTION_HOURS.neighbourhood
  }


  return NEWS_LOCAL_RETENTION_HOURS.street
}


export function getNewsLocalExpiresAt(
  record,
  scale =
    'street'
) {
  const hours =
    getNewsLocalRetentionHours(
      scale
    )


  const sourceTime =
    getNewsSourceTimestamp(
      record
    )


  const start =
    new Date(
      sourceTime ||
      ''
    )
      .getTime()


  if (
    !Number.isFinite(
      start
    )
  ) {
    return ''
  }


  return new Date(
    start +
    Number(
      hours
    ) *
      60 *
      60 *
      1000
  )
    .toISOString()
}


export function newsRecordIsLocallyRetained(
  record,
  scale =
    'street',
  now =
    Date.now()
) {
  const expiresAt =
    getNewsLocalExpiresAt(
      record,
      scale
    )


  if (
    !expiresAt
  ) {
    return false
  }


  const expiry =
    new Date(
      expiresAt
    )
      .getTime()


  if (
    !Number.isFinite(
      expiry
    )
  ) {
    return false
  }


  return (
    Number(
      now
    ) <
    expiry
  )
}


export function newsRecordIsCurrent(
  record,
  now =
    Date.now()
) {
  const expiresAt =
    getNewsExpiresAt(
      record
    )


  if (
    !expiresAt
  ) {
    return true
  }


  const expiry =
    new Date(
      expiresAt
    )
      .getTime()


  if (
    !Number.isFinite(
      expiry
    )
  ) {
    return true
  }


  return (
    Number(
      now
    ) <
    expiry
  )
}


export function getNewsTimeRemainingMs(
  record,
  now =
    Date.now()
) {
  const expiresAt =
    getNewsExpiresAt(
      record
    )


  if (
    !expiresAt
  ) {
    return null
  }


  const expiry =
    new Date(
      expiresAt
    )
      .getTime()


  if (
    !Number.isFinite(
      expiry
    )
  ) {
    return null
  }


  return Math.max(
    0,
    expiry -
    Number(
      now
    )
  )
}
