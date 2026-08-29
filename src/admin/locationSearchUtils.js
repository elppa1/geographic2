// ============================================================
// INTERSECTION PARSER
// ============================================================

export function parseIntersection(
  value
) {
  const clean =
    String(
      value || ''
    )
      .trim()
      .replace(
        /\s+/g,
        ' '
      )


  const patterns = [
    /\s+and\s+/i,
    /\s*&\s*/i,
    /\s+@\s+/i,
    /\s+\/\s+/i,
  ]


  for (
    const pattern
    of patterns
  ) {
    const parts =
      clean
        .split(
          pattern
        )
        .map(
          (part) =>
            part.trim()
        )
        .filter(
          Boolean
        )


    if (
      parts.length === 2
    ) {
      return {
        streetA:
          parts[0],

        streetB:
          parts[1],
      }
    }
  }


  return null
}


// ============================================================
// STREET HELPERS
// ============================================================

export function stripStreetSuffix(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .replace(
      /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl)\b\.?/gi,
      ''
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


export function escapeRegex(
  value
) {
  return String(
    value || ''
  )
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )
}


// ============================================================
// STREET DIRECTION
// ============================================================

function getStreetDirection(
  value
) {
  const clean =
    String(
      value || ''
    )
      .trim()
      .replace(
        /\s+/g,
        ' '
      )


  const match =
    clean.match(
      /\s+(East|West|North|South|E|W|N|S)$/i
    )


  if (
    !match
  ) {
    return {
      base:
        clean,

      direction:
        '',
    }
  }


  return {
    base:
      clean
        .slice(
          0,
          match.index
        )
        .trim(),

    direction:
      match[1],
  }
}


function makeDirectionRegex(
  direction
) {
  const clean =
    String(
      direction || ''
    )
      .toLowerCase()


  if (
    clean === 'east' ||
    clean === 'e'
  ) {
    return '(East|E)'
  }


  if (
    clean === 'west' ||
    clean === 'w'
  ) {
    return '(West|W)'
  }


  if (
    clean === 'north' ||
    clean === 'n'
  ) {
    return '(North|N)'
  }


  if (
    clean === 'south' ||
    clean === 's'
  ) {
    return '(South|S)'
  }


  return (
    '(East|West|North|South|E|W|N|S)'
  )
}


// ============================================================
// STREET REGEX
// ============================================================
//
// Directional streets need special handling.
//
// Example:
//
//   Finch Avenue West
//
// The old helper removed "Avenue" first and accidentally produced:
//
//   Finch West
//
// which then generated a regex that could not match:
//
//   Finch Avenue West
//
// We now separate the direction BEFORE removing the street type.
//
// ============================================================

export function makeStreetRegex(
  value
) {
  const {
    base,
    direction,
  } =
    getStreetDirection(
      value
    )


  const escaped =
    stripStreetSuffix(
      base
    )
      .replace(
        /\./g,
        ''
      )
      .trim()
      .replace(
        /\s+/g,
        ' '
      )
      .split(
        ' '
      )
      .filter(
        Boolean
      )
      .map(
        (part) =>
          escapeRegex(
            part
          )
      )
      .join(
        '[ .]+'
      )


  const streetType =
    (
      '( (Street|St|Avenue|Ave|Road|Rd|' +
      'Boulevard|Blvd|Drive|Dr|Lane|Ln|' +
      'Court|Ct|Place|Pl))?'
    )


  const directionRegex =
    direction
      ? (
          ' ' +
          makeDirectionRegex(
            direction
          )
        )
      : (
          '( (East|West|North|South|E|W|N|S))?'
        )


  return (
    '^' +
    escaped +
    streetType +
    directionRegex +
    '$'
  )
}


// ============================================================
// TITLE CASE
// ============================================================

export function titleCase(
  value
) {
  return String(
    value || ''
  )
    .toLowerCase()
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    )
}


// ============================================================
// CITY SEARCH CONFIG
// ============================================================

export function getSearchConfig(
  city
) {
  if (
    !city?.search
  ) {
    return null
  }


  const bounds =
    city.search.bounds


  if (
    !bounds
  ) {
    return null
  }


  return {
    querySuffix:
      city.search.querySuffix ||
      city.name,

    countryCode:
      city.search.countryCode ||
      '',

    bounds,
  }
}


// ============================================================
// INTERSECTION SEARCH
// ============================================================

export async function searchIntersection({
  intersection,
  city,
}) {
  const config =
    getSearchConfig(
      city
    )


  if (
    !config
  ) {
    throw new Error(
      'City search configuration unavailable'
    )
  }


  const {
    bounds,
  } =
    config


  const streetA =
    makeStreetRegex(
      intersection.streetA
    )


  const streetB =
    makeStreetRegex(
      intersection.streetB
    )


  const params =
    new URLSearchParams({
      streetA,
      streetB,

      west:
        String(
          bounds.west
        ),

      north:
        String(
          bounds.north
        ),

      east:
        String(
          bounds.east
        ),

      south:
        String(
          bounds.south
        ),
    })


  const response =
    await fetch(
      `/api/geographic/location-search/intersection?${params.toString()}`
    )


  if (
    !response.ok
  ) {
    throw new Error(
      `Intersection search unavailable: ${response.status}`
    )
  }


  const data =
    await response.json()


  const nodes =
    Array.isArray(
      data.elements
    )
      ? data.elements.filter(
          (item) =>
            item.type ===
              'node' &&
            Number.isFinite(
              Number(
                item.lon
              )
            ) &&
            Number.isFinite(
              Number(
                item.lat
              )
            )
        )
      : []


  const name =
    (
      `${titleCase(intersection.streetA)}` +
      ' & ' +
      `${titleCase(intersection.streetB)}`
    )


  return nodes
    .slice(
      0,
      6
    )
    .map(
      (
        node,
        index
      ) => ({
        id:
          `intersection-${node.id}`,

        name,

        location:
          name,

        intersection:
          name,

        subtitle:
          index === 0
            ? city.name
            : `${city.name} · alternate crossing`,

        longitude:
          Number(
            node.lon
          ),

        latitude:
          Number(
            node.lat
          ),

        locationType:
          'intersection',
      })
    )
}


export async function searchPlaces({
  query,
  city,
}) {
  const config =
    getSearchConfig(
      city
    )


  if (
    !config
  ) {
    throw new Error(
      'City search configuration unavailable'
    )
  }


  const {
    querySuffix,
    countryCode,
    bounds,
  } =
    config


  const params =
    new URLSearchParams({
      q:
        query,

      querySuffix,

      countryCode,

      west:
        String(
          bounds.west
        ),

      north:
        String(
          bounds.north
        ),

      east:
        String(
          bounds.east
        ),

      south:
        String(
          bounds.south
        ),

      bounded:
        '1',

      limit:
        '6',
    })


  const response =
    await fetch(
      `/api/geographic/location-search/place?${params.toString()}`
    )


  if (
    !response.ok
  ) {
    throw new Error(
      `Place search unavailable: ${response.status}`
    )
  }


  const payload =
    await response.json()


  const data =
    Array.isArray(
      payload?.results
    )
      ? payload.results
      : []


  return data
    .filter(
      (item) =>
        Number.isFinite(
          Number(
            item.lon
          )
        ) &&
        Number.isFinite(
          Number(
            item.lat
          )
        )
    )
    .map(
      (item) => {
        const address =
          item.address ||
          {}


        const houseNumber =
          address.house_number ||
          ''


        const road =
          address.road ||
          address.pedestrian ||
          address.footway ||
          ''


        const shortAddress =
          [
            houseNumber,
            road,
          ]
            .filter(
              Boolean
            )
            .join(
              ' '
            )


        const name =
          (
            item.name ||
            shortAddress ||
            item.display_name
              ?.split(',')[0] ||
            `${city.name} location`
          )


        return {
          id:
            `place-${item.place_id}`,

          name,

          location:
            shortAddress ||
            name,

          intersection:
            '',

          subtitle:
            item.display_name,

          longitude:
            Number(
              item.lon
            ),

          latitude:
            Number(
              item.lat
            ),

          locationType:
            'place',

          address:
            item.address ||
            {},
        }
      }
    )
}


// ============================================================
// SHARED LOCATION SEARCH
// ============================================================
//
// Used by non-visual geographic tools such as the automatic
// Toronto Police publisher.
//
// It follows the same behavior as Admin LocationSearch:
//
// 1. detect an intersection
// 2. try direct Overpass intersection lookup
// 3. fall back to bounded Nominatim place/address lookup
//
// ============================================================

export async function searchLocation({
  value,
  city,
}) {
  const clean =
    String(
      value || ''
    )
      .trim()


  if (
    clean.length <
      2 ||
    !city
  ) {
    return []
  }


  const intersection =
    parseIntersection(
      clean
    )


  let results =
    []


  if (
    intersection
  ) {
    try {
      results =
        await searchIntersection({
          intersection,
          city,
        })
    }
    catch (
      error
    ) {
      console.warn(
        'DIRECT INTERSECTION SEARCH FAILED:',
        error
      )
    }
  }


  if (
    results.length ===
      0
  ) {
    results =
      await searchPlaces({
        query:
          clean,

        city,
      })
  }


  return results
}