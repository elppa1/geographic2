// ============================================================
// GEOGRAPHIC · LIVE NEWS LIFECYCLE POLICY
// ============================================================
//
// One clock for every place that needs to know whether a live NEWS
// item should still be on the map / in the live published desk.
//
// IMPORTANT:
//   - Shelf life starts from the ORIGINAL source timestamp.
//   - Meaningful updates do NOT restart the clock.
//   - An official RESOLVE can remove an item earlier.
//   - Ordinary editorial/news stories without one of these live-source
//     policies do not auto-expire here.
//
// Current rules:
//   TTC                 4 hours
//   TPS missing person  7 days
//   TPS shooting        48 hours
//   TPS collision       24 hours
//   TPS other live item 24 hours (existing default)
//   Toronto Fire        72 hours
//
// ============================================================

export const NEWS_SHELF_LIFE_HOURS = {
  ttc:
    4,

  fire:
    72,

  police: {
    missing:
      7 * 24,

    shooting:
      48,

    collision:
      24,

    default:
      24,
  },
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
    return NEWS_SHELF_LIFE_HOURS.fire
  }


  if (
    sourceKey ===
      'police'
  ) {
    const category =
      clean(
        record?.category
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
        'shooting'
    ) {
      return NEWS_SHELF_LIFE_HOURS.police.shooting
    }


    if (
      category ===
        'collision'
    ) {
      return NEWS_SHELF_LIFE_HOURS.police.collision
    }


    return NEWS_SHELF_LIFE_HOURS.police.default
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
    // active-period-start is the best TTC-provided per-alert time.
    // If TTC omitted it, firstSeenAt freezes Geographic's first
    // observation instead of allowing every feed poll to restart time.
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