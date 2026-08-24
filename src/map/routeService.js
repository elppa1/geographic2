import {
  getScenicCandidates,
  hasObviousBacktracking,
  scoreScenicRoute,
} from './scenicRoute.js'

const ROUTE_URL = 'https://valhalla1.openstreetmap.de/route'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

const MAX_DIRECT_ROUTE_RATIO = 2.75
const LONG_WAY_MIN_RATIO = 1.05
const LONG_WAY_MAX_RATIO = 1.30

const TRACE_SAMPLE_METERS = 55
const OSM_SEARCH_RADIUS_METERS = 45
const MIN_SEGMENT_METERS = 35

const DESTINATION_SNAP_RADIUS_METERS = 140
const DESTINATION_SNAP_MAX_METERS = 120

function toRadians(degrees) {
  return degrees * Math.PI / 180
}

function toDegrees(radians) {
  return radians * 180 / Math.PI
}

function haversineMeters(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0

  const [lon1, lat1] = a.map(Number)
  const [lon2, lat2] = b.map(Number)

  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return 0

  const earthRadius = 6371000
  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const deltaPhi = toRadians(lat2 - lat1)
  const deltaLambda = toRadians(lon2 - lon1)

  const value =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) ** 2

  return 2 * earthRadius * Math.atan2(
    Math.sqrt(value),
    Math.sqrt(1 - value)
  )
}

function straightLineDistanceKm({
  start,
  destination,
}) {
  return haversineMeters(
    [
      Number(start.longitude),
      Number(start.latitude),
    ],
    [
      Number(destination.longitude),
      Number(destination.latitude),
    ]
  ) / 1000
}

function bearingDegrees(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0

  const [lon1, lat1] = a.map(Number)
  const [lon2, lat2] = b.map(Number)

  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const lambda1 = toRadians(lon1)
  const lambda2 = toRadians(lon2)

  const y =
    Math.sin(lambda2 - lambda1) *
    Math.cos(phi2)

  const x =
    Math.cos(phi1) *
      Math.sin(phi2) -
    Math.sin(phi1) *
      Math.cos(phi2) *
      Math.cos(lambda2 - lambda1)

  return (
    toDegrees(
      Math.atan2(y, x)
    ) +
    360
  ) % 360
}

function normalizeTurnDelta(value) {
  let delta = value

  while (delta > 180) {
    delta -= 360
  }

  while (delta < -180) {
    delta += 360
  }

  return delta
}

function cardinalDirection(bearing) {
  const directions = [
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
  ]

  const index =
    Math.round(
      Number(bearing) / 45
    ) % 8

  return directions[index]
}

function decodePolyline(
  encoded,
  precision = 6
) {
  const coordinates = []

  let index = 0
  let latitude = 0
  let longitude = 0

  const factor = 10 ** precision

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte

    do {
      byte =
        encoded.charCodeAt(index++) -
        63

      result |=
        (byte & 0x1f) <<
        shift

      shift += 5
    } while (byte >= 0x20)

    latitude +=
      result & 1
        ? ~(result >> 1)
        : result >> 1

    result = 0
    shift = 0

    do {
      byte =
        encoded.charCodeAt(index++) -
        63

      result |=
        (byte & 0x1f) <<
        shift

      shift += 5
    } while (byte >= 0x20)

    longitude +=
      result & 1
        ? ~(result >> 1)
        : result >> 1

    coordinates.push([
      longitude / factor,
      latitude / factor,
    ])
  }

  return coordinates
}

function decodeLegs(legs) {
  return legs.map(
    (leg) =>
      decodePolyline(
        leg.shape
      )
  )
}

function combineLegShapes(decodedLegs) {
  const coordinates = []

  decodedLegs.forEach(
    (
      decoded,
      index
    ) => {
      const next = [
        ...decoded,
      ]

      if (index > 0) {
        next.shift()
      }

      coordinates.push(
        ...next
      )
    }
  )

  return coordinates
}

function cleanName(value) {
  const clean =
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()

  const lower =
    clean.toLowerCase()

  const generic =
    new Set([
      '',
      'road',
      'path',
      'walkway',
      'footway',
      'crosswalk',
      'sidewalk',
      'pedestrian',
      'unnamed road',
      'unnamed path',
      'unnamed walkway',
      'unnamed footway',
    ])

  return generic.has(lower)
    ? ''
    : clean
}

function normalizeName(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[.,]/g, '')
}

function firstUsefulName(values) {
  if (!Array.isArray(values)) {
    return ''
  }

  for (const value of values) {
    const name =
      cleanName(value)

    if (name) {
      return name
    }
  }

  return ''
}

function getManeuverStreetName(
  maneuver
) {
  return firstUsefulName([
    ...(
      Array.isArray(
        maneuver.street_names
      )
        ? maneuver.street_names
        : []
    ),

    ...(
      Array.isArray(
        maneuver.begin_street_names
      )
        ? maneuver.begin_street_names
        : []
    ),
  ])
}

function getOriginalInstruction(
  maneuver
) {
  return String(
    maneuver.instruction ||
    maneuver.verbal_pre_transition_instruction ||
    maneuver.verbal_transition_alert_instruction ||
    ''
  ).trim()
}

function textIncludesAny(
  value,
  terms
) {
  const lower =
    String(value || '')
      .toLowerCase()

  return terms.some(
    (term) =>
      lower.includes(term)
  )
}

function extractRawManeuvers(
  legs,
  decodedLegs
) {
  const maneuvers = []

  legs.forEach(
    (
      leg,
      legIndex
    ) => {
      const legShape =
        decodedLegs[
          legIndex
        ] || []

      const items =
        Array.isArray(
          leg.maneuvers
        )
          ? leg.maneuvers
          : []

      items.forEach(
        (
          maneuver,
          maneuverIndex
        ) => {
          const beginIndex =
            Number(
              maneuver.begin_shape_index ||
              0
            )

          const coordinate =
            legShape[
              Math.min(
                beginIndex,
                Math.max(
                  0,
                  legShape.length - 1
                )
              )
            ] || null

          const original =
            getOriginalInstruction(
              maneuver
            )

          maneuvers.push({
            id:
              `raw-${legIndex}-${maneuverIndex}`,

            original,

            streetName:
              getManeuverStreetName(
                maneuver
              ),

            coordinate,

            distance:
              Number(
                maneuver.length ||
                0
              ),

            seconds:
              Number(
                maneuver.time ||
                0
              ),

            stairs:
              textIncludesAny(
                original,
                [
                  'stairs',
                  'steps',
                ]
              ),

            elevator:
              textIncludesAny(
                original,
                [
                  'elevator',
                ]
              ),

            escalator:
              textIncludesAny(
                original,
                [
                  'escalator',
                ]
              ),

            ferry:
              textIncludesAny(
                original,
                [
                  'ferry',
                ]
              ),
          })
        }
      )
    }
  )

  return maneuvers
}

function interpolateCoordinate(
  a,
  b,
  ratio
) {
  return [
    a[0] +
      (b[0] - a[0]) *
      ratio,

    a[1] +
      (b[1] - a[1]) *
      ratio,
  ]
}

function sampleRoute(
  coordinates,
  spacingMeters =
    TRACE_SAMPLE_METERS
) {
  if (
    !Array.isArray(
      coordinates
    ) ||
    coordinates.length === 0
  ) {
    return []
  }

  const samples = [
    {
      coordinate:
        coordinates[0],

      routeMeters:
        0,
    },
  ]

  let totalMeters = 0
  let nextSampleAt =
    spacingMeters

  for (
    let index = 1;
    index < coordinates.length;
    index++
  ) {
    const previous =
      coordinates[
        index - 1
      ]

    const current =
      coordinates[
        index
      ]

    const segmentMeters =
      haversineMeters(
        previous,
        current
      )

    if (segmentMeters <= 0) {
      continue
    }

    while (
      totalMeters +
        segmentMeters >=
      nextSampleAt
    ) {
      const ratio =
        (
          nextSampleAt -
          totalMeters
        ) /
        segmentMeters

      samples.push({
        coordinate:
          interpolateCoordinate(
            previous,
            current,
            ratio
          ),

        routeMeters:
          nextSampleAt,
      })

      nextSampleAt +=
        spacingMeters
    }

    totalMeters +=
      segmentMeters
  }

  const last =
    coordinates[
      coordinates.length - 1
    ]

  const previousLast =
    samples[
      samples.length - 1
    ]

  if (
    !previousLast ||
    haversineMeters(
      previousLast.coordinate,
      last
    ) >
      5
  ) {
    samples.push({
      coordinate:
        last,

      routeMeters:
        totalMeters,
    })
  } else {
    previousLast.routeMeters =
      totalMeters
  }

  return samples
}

function buildOverpassQuery(
  samples
) {
  const clauses =
    samples
      .map(
        (
          sample
        ) => {
          const [
            longitude,
            latitude,
          ] =
            sample.coordinate

          return (
            `way(around:${OSM_SEARCH_RADIUS_METERS},` +
            `${latitude},${longitude})` +
            '["highway"]["name"];'
          )
        }
      )
      .join('\n')

  return (
    '[out:json][timeout:25];\n' +
    '(\n' +
    clauses +
    '\n);\n' +
    'out tags geom;'
  )
}

async function fetchNamedWays(
  samples
) {
  if (
    !Array.isArray(
      samples
    ) ||
    samples.length === 0
  ) {
    return []
  }

  try {
    const response =
      await fetch(
        OVERPASS_URL,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded;charset=UTF-8',
          },

          body:
            new URLSearchParams({
              data:
                buildOverpassQuery(
                  samples
                ),
            }),
        }
      )

    if (!response.ok) {
      throw new Error(
        `Overpass ${response.status}`
      )
    }

    const data =
      await response.json()

    return (
      Array.isArray(
        data.elements
      )
        ? data.elements
        : []
    )
      .filter(
        (
          item
        ) =>
          item.type ===
            'way' &&
          cleanName(
            item.tags?.name
          ) &&
          Array.isArray(
            item.geometry
          ) &&
          item.geometry.length >=
            2
      )
      .map(
        (
          item
        ) => ({
          id:
            item.id,

          name:
            cleanName(
              item.tags.name
            ),

          highway:
            item.tags.highway ||
            '',

          geometry:
            item.geometry.map(
              (
                point
              ) => ([
                Number(
                  point.lon
                ),

                Number(
                  point.lat
                ),
              ])
            ),
        })
      )
  } catch (error) {
    console.warn(
      'ROUTE STREET TRACE FAILED:',
      error
    )

    return []
  }
}

function projectLocal(
  coordinate,
  origin
) {
  const [
    longitude,
    latitude,
  ] =
    coordinate

  const [
    originLongitude,
    originLatitude,
  ] =
    origin

  const x =
    (
      longitude -
      originLongitude
    ) *
    Math.cos(
      toRadians(
        originLatitude
      )
    ) *
    111320

  const y =
    (
      latitude -
      originLatitude
    ) *
    111320

  return [
    x,
    y,
  ]
}

function pointToSegmentMeters(
  point,
  a,
  b
) {
  const [
    px,
    py,
  ] =
    projectLocal(
      point,
      point
    )

  const [
    ax,
    ay,
  ] =
    projectLocal(
      a,
      point
    )

  const [
    bx,
    by,
  ] =
    projectLocal(
      b,
      point
    )

  const dx =
    bx - ax

  const dy =
    by - ay

  const lengthSquared =
    dx * dx +
    dy * dy

  if (lengthSquared === 0) {
    return Math.sqrt(
      (
        px - ax
      ) ** 2 +
      (
        py - ay
      ) ** 2
    )
  }

  const t =
    Math.max(
      0,
      Math.min(
        1,
        (
          (
            px - ax
          ) *
          dx +
          (
            py - ay
          ) *
          dy
        ) /
        lengthSquared
      )
    )

  const nearestX =
    ax +
    t * dx

  const nearestY =
    ay +
    t * dy

  return Math.sqrt(
    (
      px -
      nearestX
    ) ** 2 +
    (
      py -
      nearestY
    ) ** 2
  )
}

function distanceToWayMeters(
  coordinate,
  way
) {
  let best =
    Infinity

  for (
    let index = 1;
    index <
      way.geometry.length;
    index++
  ) {
    const distance =
      pointToSegmentMeters(
        coordinate,
        way.geometry[
          index - 1
        ],
        way.geometry[
          index
        ]
      )

    if (distance < best) {
      best =
        distance
    }
  }

  return best
}

function nearestNamedWay(
  coordinate,
  ways
) {
  let winner =
    null

  let bestDistance =
    Infinity

  ways.forEach(
    (
      way
    ) => {
      const distance =
        distanceToWayMeters(
          coordinate,
          way
        )

      if (
        distance <
        bestDistance
      ) {
        bestDistance =
          distance

        winner =
          way
      }
    }
  )

  if (
    !winner ||
    bestDistance >
      OSM_SEARCH_RADIUS_METERS
  ) {
    return null
  }

  return {
    ...winner,

    distanceMeters:
      bestDistance,
  }
}

function nameSamples(
  samples,
  ways
) {
  return samples.map(
    (
      sample
    ) => {
      const way =
        nearestNamedWay(
          sample.coordinate,
          ways
        )

      return {
        ...sample,

        streetName:
          way?.name ||
          '',

        highway:
          way?.highway ||
          '',

        distanceToStreet:
          way?.distanceMeters ??
          Infinity,
      }
    }
  )
}

function stabilizeSampleNames(
  samples
) {
  const result =
    samples.map(
      (
        sample
      ) => ({
        ...sample,
      })
    )

  for (
    let index = 1;
    index <
      result.length - 1;
    index++
  ) {
    const previous =
      result[
        index - 1
      ]

    const current =
      result[
        index
      ]

    const next =
      result[
        index + 1
      ]

    if (
      previous.streetName &&
      next.streetName &&
      normalizeName(
        previous.streetName
      ) ===
        normalizeName(
          next.streetName
        ) &&
      normalizeName(
        current.streetName
      ) !==
        normalizeName(
          previous.streetName
        )
    ) {
      current.streetName =
        previous.streetName
    }
  }

  return result
}

function buildStreetSegments(
  samples
) {
  const segments = []

  samples.forEach(
    (
      sample,
      index
    ) => {
      const name =
        cleanName(
          sample.streetName
        )

      if (!name) {
        return
      }

      const previous =
        segments[
          segments.length - 1
        ]

      if (
        previous &&
        normalizeName(
          previous.streetName
        ) ===
          normalizeName(
            name
          )
      ) {
        previous.endRouteMeters =
          sample.routeMeters

        previous.endCoordinate =
          sample.coordinate

        previous.endSampleIndex =
          index

        return
      }

      segments.push({
        streetName:
          name,

        startRouteMeters:
          sample.routeMeters,

        endRouteMeters:
          sample.routeMeters,

        startCoordinate:
          sample.coordinate,

        endCoordinate:
          sample.coordinate,

        startSampleIndex:
          index,

        endSampleIndex:
          index,
      })
    }
  )

  const cleaned = []

  segments.forEach(
    (
      segment,
      index
    ) => {
      const length =
        Math.max(
          0,
          segment.endRouteMeters -
            segment.startRouteMeters
        )

      const previous =
        cleaned[
          cleaned.length - 1
        ]

      const next =
        segments[
          index + 1
        ]

      if (
        length <
          MIN_SEGMENT_METERS &&
        previous &&
        next &&
        normalizeName(
          previous.streetName
        ) ===
          normalizeName(
            next.streetName
          )
      ) {
        previous.endRouteMeters =
          next.endRouteMeters

        previous.endCoordinate =
          next.endCoordinate

        previous.endSampleIndex =
          next.endSampleIndex

        return
      }

      cleaned.push({
        ...segment,
      })
    }
  )

  return cleaned
}

function closestSampleIndex(
  coordinate,
  samples
) {
  if (
    !Array.isArray(
      coordinate
    )
  ) {
    return -1
  }

  let winner =
    -1

  let bestDistance =
    Infinity

  samples.forEach(
    (
      sample,
      index
    ) => {
      const distance =
        haversineMeters(
          coordinate,
          sample.coordinate
        )

      if (
        distance <
        bestDistance
      ) {
        bestDistance =
          distance

        winner =
          index
      }
    }
  )

  return winner
}

function routePositionForCoordinate(
  coordinate,
  samples
) {
  const index =
    closestSampleIndex(
      coordinate,
      samples
    )

  if (index < 0) {
    return 0
  }

  return samples[
    index
  ].routeMeters
}

function segmentTurnInstruction(
  previous,
  current,
  samples
) {
  const previousIndex =
    Math.max(
      0,
      previous.endSampleIndex
    )

  const currentIndex =
    Math.min(
      samples.length - 1,
      current.startSampleIndex
    )

  const beforeA =
    samples[
      Math.max(
        0,
        previousIndex - 1
      )
    ]?.coordinate

  const beforeB =
    samples[
      previousIndex
    ]?.coordinate

  const afterA =
    samples[
      currentIndex
    ]?.coordinate

  const afterB =
    samples[
      Math.min(
        samples.length - 1,
        currentIndex + 1
      )
    ]?.coordinate

  const beforeBearing =
    bearingDegrees(
      beforeA,
      beforeB
    )

  const afterBearing =
    bearingDegrees(
      afterA,
      afterB
    )

  const delta =
    normalizeTurnDelta(
      afterBearing -
        beforeBearing
    )

  if (delta <= -30) {
    return (
      `Turn left onto ${current.streetName}`
    )
  }

  if (delta >= 30) {
    return (
      `Turn right onto ${current.streetName}`
    )
  }

  return (
    `Continue onto ${current.streetName}`
  )
}

function buildStreetSteps(
  segments,
  samples
) {
  if (
    segments.length ===
    0
  ) {
    return []
  }

  return segments.map(
    (
      segment,
      index
    ) => {
      const next =
        segments[
          index + 1
        ]

      const distanceMeters =
        next
          ? (
              next.startRouteMeters -
              segment.startRouteMeters
            )
          : (
              samples[
                samples.length - 1
              ].routeMeters -
              segment.startRouteMeters
            )

      let instruction

      if (index === 0) {
        const startIndex =
          segment.startSampleIndex

        const endIndex =
          Math.min(
            samples.length - 1,
            startIndex + 1
          )

        const bearing =
          bearingDegrees(
            samples[
              startIndex
            ].coordinate,
            samples[
              endIndex
            ].coordinate
          )

        instruction =
          (
            `Head ${cardinalDirection(bearing)} ` +
            `on ${segment.streetName}`
          )
      } else {
        instruction =
          segmentTurnInstruction(
            segments[
              index - 1
            ],
            segment,
            samples
          )
      }

      return {
        id:
          `street-${index}`,

        kind:
          'street',

        streetName:
          segment.streetName,

        instruction,

        distance:
          Math.max(
            0,
            distanceMeters
          ) /
          1000,

        coordinate:
          segment.startCoordinate,

        routeMeters:
          segment.startRouteMeters,
      }
    }
  )
}

function nextStreetAfterPosition(
  streetSteps,
  routeMeters
) {
  return (
    streetSteps.find(
      (
        step
      ) =>
        step.routeMeters >
        routeMeters + 5
    )?.streetName ||
    ''
  )
}

function buildFeatureSteps(
  rawManeuvers,
  samples,
  streetSteps
) {
  const features = []

  rawManeuvers.forEach(
    (
      maneuver,
      index
    ) => {
      if (
        !maneuver.stairs &&
        !maneuver.elevator &&
        !maneuver.escalator &&
        !maneuver.ferry
      ) {
        return
      }

      const routeMeters =
        routePositionForCoordinate(
          maneuver.coordinate,
          samples
        )

      const upcomingStreet =
        nextStreetAfterPosition(
          streetSteps,
          routeMeters
        )

      let instruction =
        maneuver.original

      if (maneuver.stairs) {
        instruction =
          upcomingStreet
            ? (
                `Take the stairs toward ${upcomingStreet}`
              )
            : 'Take the stairs'
      } else if (
        maneuver.elevator
      ) {
        instruction =
          upcomingStreet
            ? (
                `Take the elevator toward ${upcomingStreet}`
              )
            : 'Take the elevator'
      } else if (
        maneuver.escalator
      ) {
        instruction =
          upcomingStreet
            ? (
                `Take the escalator toward ${upcomingStreet}`
              )
            : 'Take the escalator'
      }

      features.push({
        id:
          `feature-${index}`,

        kind:
          'feature',

        streetName:
          upcomingStreet,

        instruction,

        distance:
          Number(
            maneuver.distance ||
            0
          ),

        coordinate:
          maneuver.coordinate,

        routeMeters,
      })
    }
  )

  return features
}

async function buildHumanSteps(
  legs,
  decodedLegs,
  coordinates
) {
  const rawManeuvers =
    extractRawManeuvers(
      legs,
      decodedLegs
    )

  const samples =
    sampleRoute(
      coordinates
    )

  const namedWays =
    await fetchNamedWays(
      samples
    )

  const namedSamples =
    stabilizeSampleNames(
      nameSamples(
        samples,
        namedWays
      )
    )

  const segments =
    buildStreetSegments(
      namedSamples
    )

  const streetSteps =
    buildStreetSteps(
      segments,
      namedSamples
    )

  const featureSteps =
    buildFeatureSteps(
      rawManeuvers,
      namedSamples,
      streetSteps
    )

  const merged = [
    ...streetSteps,
    ...featureSteps,

    {
      id:
        'arrival',

      kind:
        'arrival',

      streetName:
        '',

      instruction:
        'Arrive at your destination',

      distance:
        0,

      coordinate:
        coordinates[
          coordinates.length - 1
        ],

      routeMeters:
        namedSamples[
          namedSamples.length - 1
        ]?.routeMeters ||
        0,
    },
  ]
    .sort(
      (
        a,
        b
      ) =>
        a.routeMeters -
        b.routeMeters
    )
    .map(
      (
        step,
        index
      ) => ({
        ...step,

        id:
          `step-${index}`,
      })
    )

  console.log(
    'GEOGRAPHIC STREET SEGMENTS:',
    segments
  )

  console.log(
    'GEOGRAPHIC HUMAN DIRECTIONS:',
    merged
  )

  return merged
}


// ============================================================
// DESTINATION STREET SNAP
// ============================================================
//
// Search/business pins can sit inside a building or parcel.
//
// The visual destination remains the actual pin.
//
// But routing uses the nearest sensible named public street/path,
// so Valhalla does not send someone around an entire block just to
// reach a mapped service entrance.
//

function destinationHighwayPenalty(
  highway
) {
  const value =
    String(
      highway || ''
    )
      .toLowerCase()

  if (
    value === 'motorway' ||
    value === 'motorway_link' ||
    value === 'trunk' ||
    value === 'trunk_link'
  ) {
    return Infinity
  }

  if (
    value === 'service'
  ) {
    return 35
  }

  if (
    value === 'footway' ||
    value === 'path' ||
    value === 'pedestrian' ||
    value === 'cycleway'
  ) {
    return 12
  }

  return 0
}

function nearestPointOnSegment(
  point,
  a,
  b
) {
  const [
    ax,
    ay,
  ] =
    projectLocal(
      a,
      point
    )

  const [
    bx,
    by,
  ] =
    projectLocal(
      b,
      point
    )

  const dx =
    bx - ax

  const dy =
    by - ay

  const lengthSquared =
    dx * dx +
    dy * dy

  let ratio =
    0

  if (
    lengthSquared > 0
  ) {
    ratio =
      Math.max(
        0,
        Math.min(
          1,
          -(
            ax * dx +
            ay * dy
          ) /
          lengthSquared
        )
      )
  }

  const coordinate = [
    a[0] +
      (
        b[0] -
        a[0]
      ) *
      ratio,

    a[1] +
      (
        b[1] -
        a[1]
      ) *
      ratio,
  ]

  return {
    coordinate,

    distanceMeters:
      haversineMeters(
        point,
        coordinate
      ),
  }
}

function nearestPointOnWay(
  point,
  way
) {
  if (
    !Array.isArray(
      way?.geometry
    ) ||
    way.geometry.length < 2
  ) {
    return null
  }

  let best =
    null

  for (
    let index = 1;
    index <
      way.geometry.length;
    index++
  ) {
    const candidate =
      nearestPointOnSegment(
        point,
        way.geometry[
          index - 1
        ],
        way.geometry[
          index
        ]
      )

    if (
      !best ||
      candidate.distanceMeters <
        best.distanceMeters
    ) {
      best =
        candidate
    }
  }

  return best
}

async function fetchDestinationWays(
  destination
) {
  const longitude =
    Number(
      destination?.longitude
    )

  const latitude =
    Number(
      destination?.latitude
    )

  if (
    !Number.isFinite(
      longitude
    ) ||
    !Number.isFinite(
      latitude
    )
  ) {
    return []
  }

  const query =
    (
      '[out:json][timeout:15];' +
      '(' +
      `way(around:${DESTINATION_SNAP_RADIUS_METERS},${latitude},${longitude})` +
      '["highway"]["name"];' +
      ');' +
      'out tags geom;'
    )

  try {
    const response =
      await fetch(
        OVERPASS_URL,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded;charset=UTF-8',
          },

          body:
            new URLSearchParams({
              data:
                query,
            }),
        }
      )

    if (
      !response.ok
    ) {
      return []
    }

    const data =
      await response.json()

    return (
      Array.isArray(
        data.elements
      )
        ? data.elements
        : []
    )
      .filter(
        (
          item
        ) =>
          item.type ===
            'way' &&
          cleanName(
            item.tags?.name
          ) &&
          Array.isArray(
            item.geometry
          ) &&
          item.geometry.length >=
            2
      )
      .map(
        (
          item
        ) => ({
          id:
            item.id,

          name:
            cleanName(
              item.tags.name
            ),

          highway:
            item.tags.highway ||
            '',

          geometry:
            item.geometry.map(
              (
                point
              ) => ([
                Number(
                  point.lon
                ),

                Number(
                  point.lat
                ),
              ])
            ),
        })
      )
  } catch (
    error
  ) {
    console.warn(
      'DESTINATION SNAP LOOKUP FAILED:',
      error
    )

    return []
  }
}

async function getRoutingDestination(
  destination
) {
  const original = [
    Number(
      destination.longitude
    ),

    Number(
      destination.latitude
    ),
  ]

  if (
    !original.every(
      Number.isFinite
    )
  ) {
    return {
      ...destination,
    }
  }

  const ways =
    await fetchDestinationWays(
      destination
    )

  let winner =
    null

  ways.forEach(
    (
      way
    ) => {
      const penalty =
        destinationHighwayPenalty(
          way.highway
        )

      if (
        !Number.isFinite(
          penalty
        )
      ) {
        return
      }

      const nearest =
        nearestPointOnWay(
          original,
          way
        )

      if (
        !nearest ||
        nearest.distanceMeters >
          DESTINATION_SNAP_MAX_METERS
      ) {
        return
      }

      const score =
        nearest.distanceMeters +
        penalty

      if (
        !winner ||
        score <
          winner.score
      ) {
        winner = {
          ...nearest,

          score,

          streetName:
            way.name,

          highway:
            way.highway,
        }
      }
    }
  )

  if (
    !winner
  ) {
    return {
      ...destination,
    }
  }

  console.log(
    'GEOGRAPHIC DESTINATION SNAP:',
    {
      destination:
        destination.name ||
        destination.title ||
        'destination',

      street:
        winner.streetName,

      distanceMeters:
        Math.round(
          winner.distanceMeters
        ),

      original,

      snapped:
        winner.coordinate,
    }
  )

  return {
    ...destination,

    longitude:
      winner.coordinate[0],

    latitude:
      winner.coordinate[1],

    displayLongitude:
      original[0],

    displayLatitude:
      original[1],

    snappedStreet:
      winner.streetName,
  }
}

function buildLocations({
  start,
  destination,
  waypoint,
}) {
  const locations = [
    {
      lat:
        start.latitude,

      lon:
        start.longitude,

      type:
        'break',
    },
  ]

  if (waypoint) {
    locations.push({
      lat:
        waypoint.latitude,

      lon:
        waypoint.longitude,

      type:
        'break',
    })
  }

  const destinationLocation = {
    lat:
      destination.latitude,

    lon:
      destination.longitude,

    type:
      'break',
  }

  if (
    Number.isFinite(
      Number(
        destination.displayLatitude
      )
    ) &&
    Number.isFinite(
      Number(
        destination.displayLongitude
      )
    )
  ) {
    destinationLocation.display_lat =
      Number(
        destination.displayLatitude
      )

    destinationLocation.display_lon =
      Number(
        destination.displayLongitude
      )
  }

  locations.push(
    destinationLocation
  )

  return locations
}

async function requestValhallaRoute({
  start,
  destination,
  waypoint = null,
}) {
  const routingDestination =
    await getRoutingDestination(
      destination
    )

  const payload = {
    locations:
      buildLocations({
        start,

        destination:
          routingDestination,

        waypoint,
      }),

    costing:
      'pedestrian',

    directions_options: {
      units:
        'kilometers',

      language:
        'en-US',
    },
  }

  const params =
    new URLSearchParams({
      json:
        JSON.stringify(
          payload
        ),
    })

  const response =
    await fetch(
      `${ROUTE_URL}?${params.toString()}`,
      {
        headers: {
          'X-Client-Id':
            'elppa-geographic-dev',
        },
      }
    )

  if (!response.ok) {
    throw new Error(
      `Route request failed: ${response.status}`
    )
  }

  const data =
    await response.json()

  if (
    !data.trip ||
    !Array.isArray(
      data.trip.legs
    )
  ) {
    throw new Error(
      'Invalid route response'
    )
  }

  const decodedLegs =
    decodeLegs(
      data.trip.legs
    )

  const coordinates =
    combineLegShapes(
      decodedLegs
    )

  const distance =
    Number(
      data.trip.summary?.length ||
      0
    )

  const straightDistance =
    straightLineDistanceKm({
      start,

      destination:
        routingDestination,
    })

  const routeRatio =
    straightDistance > 0
      ? (
          distance /
          straightDistance
        )
      : 1

  let steps

  try {
    steps =
      await buildHumanSteps(
        data.trip.legs,
        decodedLegs,
        coordinates
      )
  } catch (error) {
    console.error(
      'GEOGRAPHIC STREET TRACE ERROR:',
      error
    )

    const raw =
      extractRawManeuvers(
        data.trip.legs,
        decodedLegs
      )

    steps =
      raw.map(
        (
          maneuver,
          index
        ) => ({
          id:
            `step-${index}`,

          instruction:
            maneuver.original ||
            'Continue',

          streetName:
            maneuver.streetName,

          distance:
            maneuver.distance,

          seconds:
            maneuver.seconds,

          coordinate:
            maneuver.coordinate,
        })
      )
  }

  return {
    distance,

    seconds:
      Number(
        data.trip.summary?.time ||
        0
      ),

    straightDistance,

    routeRatio,

    coordinates,

    steps,

    routingDestination,

    raw:
      data,
  }
}

function routeLooksReasonable(
  route
) {
  if (
    !route ||
    !Array.isArray(
      route.coordinates
    ) ||
    route.coordinates.length <
      2
  ) {
    return false
  }

  if (
    !Number.isFinite(
      route.distance
    ) ||
    route.distance <=
      0
  ) {
    return false
  }

  if (
    route.straightDistance <
    0.35
  ) {
    return true
  }

  return (
    route.routeRatio <=
    MAX_DIRECT_ROUTE_RATIO
  )
}

export async function getDirectRoute({
  start,
  destination,
}) {
  const route =
    await requestValhallaRoute({
      start,
      destination,
    })

  const reasonable =
    routeLooksReasonable(
      route
    )

  if (!reasonable) {
    console.warn(
      'SUSPICIOUS WALKING ROUTE:',
      {
        routeDistance:
          route.distance,

        straightDistance:
          route.straightDistance,

        ratio:
          route.routeRatio,
      }
    )
  }

  return {
    ...route,

    kind:
      'direct',

    fallback:
      false,

    suspicious:
      !reasonable,
  }
}

export async function getLongWayRoute({
  start,
  destination,
  cityKey = 'toronto',
}) {
  const direct =
    await getDirectRoute({
      start,
      destination,
    })

  const minimumDistance =
    direct.distance *
    LONG_WAY_MIN_RATIO

  const maximumDistance =
    direct.distance *
    LONG_WAY_MAX_RATIO

  const candidates =
    getScenicCandidates({
      cityKey,

      start,

      destination,

      directRoute:
        direct,
    })

  console.log(
    'LONG WAY CANDIDATES:',
    candidates
  )

  const scenicRoutes = []

  for (
    const candidate
    of candidates
  ) {
    const waypoint = {
      longitude:
        candidate.longitude,

      latitude:
        candidate.latitude,
    }

    if (
      hasObviousBacktracking({
        start,
        destination,
        waypoint,
      })
    ) {
      continue
    }

    try {
      const candidateRoute =
        await requestValhallaRoute({
          start,

          destination,

          waypoint,
        })

      if (
        candidateRoute.distance <
        minimumDistance
      ) {
        continue
      }

      if (
        candidateRoute.distance >
        maximumDistance
      ) {
        continue
      }

      if (
        !routeLooksReasonable(
          candidateRoute
        )
      ) {
        continue
      }

      const scenicScore =
        scoreScenicRoute({
          route:
            candidateRoute,

          directRoute:
            direct,

          candidate,
        })

      scenicRoutes.push({
        ...candidateRoute,

        scenicScore,

        scenicPlace:
          candidate,

        extraDistance:
          candidateRoute.distance -
          direct.distance,

        extraSeconds:
          candidateRoute.seconds -
          direct.seconds,
      })
    } catch (error) {
      console.warn(
        'SCENIC ROUTE CANDIDATE FAILED:',
        candidate.id,
        error
      )
    }
  }

  scenicRoutes.sort(
    (
      a,
      b
    ) =>
      b.scenicScore -
      a.scenicScore
  )

  const winner =
    scenicRoutes[0]

  if (winner) {
    console.log(
      'LONG WAY WINNER:',
      winner.scenicPlace?.name,
      winner
    )

    return {
      ...winner,

      kind:
        'long',

      fallback:
        false,

      scenicAvailable:
        true,

      directDistance:
        direct.distance,

      directSeconds:
        direct.seconds,

      minimumLongWayDistance:
        minimumDistance,

      maximumLongWayDistance:
        maximumDistance,
    }
  }

  console.log(
    'NO GOOD LONG WAY FOUND — USING DIRECT ROUTE'
  )

  return {
    ...direct,

    kind:
      'long',

    fallback:
      true,

    scenicAvailable:
      false,

    directDistance:
      direct.distance,

    directSeconds:
      direct.seconds,

    minimumLongWayDistance:
      minimumDistance,

    maximumLongWayDistance:
      maximumDistance,
  }
}