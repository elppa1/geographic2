import {
  PINS,
} from '../content/pins.js'


// ============================================================
// SETTINGS
// ============================================================

const MAX_CANDIDATES =
  8


const MIN_PROGRESS =
  0.15


const MAX_PROGRESS =
  0.85


const MAX_CORRIDOR_KM =
  1.2


// ============================================================
// DISTANCE
// ============================================================

function toRadians(
  degrees
) {
  return (
    degrees *
    Math.PI /
    180
  )
}


function distanceKm(
  a,
  b
) {
  const earthRadiusKm =
    6371


  const latitude1 =
    toRadians(
      a.latitude
    )

  const latitude2 =
    toRadians(
      b.latitude
    )


  const latitudeDifference =
    toRadians(
      b.latitude -
      a.latitude
    )


  const longitudeDifference =
    toRadians(
      b.longitude -
      a.longitude
    )


  const value =
    (
      Math.sin(
        latitudeDifference / 2
      ) **
      2
    ) +
    (
      Math.cos(
        latitude1
      ) *
      Math.cos(
        latitude2
      ) *
      (
        Math.sin(
          longitudeDifference / 2
        ) **
        2
      )
    )


  const angle =
    2 *
    Math.atan2(
      Math.sqrt(
        value
      ),
      Math.sqrt(
        1 - value
      )
    )


  return (
    earthRadiusKm *
    angle
  )
}


// ============================================================
// APPROXIMATE POINT → ROUTE DISTANCE
// ============================================================

function coordinateToPoint(
  coordinate
) {
  return {
    longitude:
      Number(
        coordinate[0]
      ),

    latitude:
      Number(
        coordinate[1]
      ),
  }
}


function distanceToRoute({
  point,
  coordinates,
}) {
  if (
    !Array.isArray(
      coordinates
    ) ||
    coordinates.length === 0
  ) {
    return Infinity
  }


  let best =
    Infinity


  coordinates.forEach(
    (coordinate) => {
      const routePoint =
        coordinateToPoint(
          coordinate
        )


      const distance =
        distanceKm(
          point,
          routePoint
        )


      if (
        distance <
        best
      ) {
        best =
          distance
      }
    }
  )


  return best
}


// ============================================================
// ROUTE PROGRESS
// ============================================================
//
// We don't want a "Long Way" candidate immediately beside the
// user's starting point or destination.
//
// A useful waypoint should generally occur somewhere through
// the middle of the journey.
//

function progressAlongTrip({
  start,
  destination,
  point,
}) {
  const dx =
    destination.longitude -
    start.longitude

  const dy =
    destination.latitude -
    start.latitude


  const lengthSquared =
    (
      dx * dx +
      dy * dy
    )


  if (
    lengthSquared === 0
  ) {
    return 0
  }


  const px =
    point.longitude -
    start.longitude

  const py =
    point.latitude -
    start.latitude


  return (
    (
      px * dx +
      py * dy
    ) /
    lengthSquared
  )
}


// ============================================================
// PIN SCORE
// ============================================================

function scorePin({
  pin,
  routeDistance,
  progress,
}) {
  let score =
    100


  // Closer to the existing route is better.

  score -=
    routeDistance *
    30


  // Places near the middle of the journey
  // are generally better detours.

  score -=
    Math.abs(
      0.5 -
      progress
    ) *
    30


  // Eventually different Geographic pin types
  // can carry different importance.

  if (
    pin.kind ===
    'field'
  ) {
    score +=
      5
  }


  return score
}


// ============================================================
// FIND GEOGRAPHIC CANDIDATES
// ============================================================

export function findGeographicCandidates({
  cityKey,
  start,
  destination,
  routeCoordinates,
}) {
  const cityPins =
    PINS.filter(
      (pin) =>
        pin.city === cityKey &&
        pin.active !== false
    )


  const candidates =
    []


  cityPins.forEach(
    (pin) => {
      const longitude =
        Number(
          pin.longitude
        )

      const latitude =
        Number(
          pin.latitude
        )


      if (
        !Number.isFinite(
          longitude
        ) ||
        !Number.isFinite(
          latitude
        )
      ) {
        return
      }


      const point = {
        longitude,
        latitude,
      }


      const progress =
        progressAlongTrip({
          start,
          destination,
          point,
        })


      if (
        progress <
          MIN_PROGRESS ||
        progress >
          MAX_PROGRESS
      ) {
        return
      }


      const routeDistance =
        distanceToRoute({
          point,

          coordinates:
            routeCoordinates,
        })


      if (
        routeDistance >
        MAX_CORRIDOR_KM
      ) {
        return
      }


      const score =
        scorePin({
          pin,
          routeDistance,
          progress,
        })


      candidates.push({
        id:
          pin.id,

        type:
          'geographic',

        name:
          pin.title ||
          'Geographic place',

        description:
          pin.description ||
          '',

        longitude,

        latitude,

        routeDistance,

        progress,

        score,

        pin,
      })
    }
  )


  return candidates
    .sort(
      (
        a,
        b
      ) =>
        b.score -
        a.score
    )
    .slice(
      0,
      MAX_CANDIDATES
    )
}


// ============================================================
// BACKTRACK DETECTION
// ============================================================
//
// A candidate can technically produce a valid route while
// sending the walker past the destination and back again.
//
// Reject obvious versions of that behaviour.
//

export function hasObviousBacktracking({
  start,
  destination,
  waypoint,
}) {
  const direct =
    distanceKm(
      start,
      destination
    )


  if (
    direct <= 0
  ) {
    return true
  }


  const firstLeg =
    distanceKm(
      start,
      waypoint
    )


  const secondLeg =
    distanceKm(
      waypoint,
      destination
    )


  const waypointTrip =
    firstLeg +
    secondLeg


  return (
    waypointTrip >
    direct * 1.55
  )
}


// ============================================================
// ROUTE SCORE
// ============================================================

export function scoreScenicRoute({
  route,
  directRoute,
  candidate,
}) {
  const extraDistance =
    Math.max(
      0,
      route.distance -
      directRoute.distance
    )


  const extraRatio =
    directRoute.distance > 0
      ? (
          extraDistance /
          directRoute.distance
        )
      : 0


  let score =
    candidate.score


  // We want a detour, but not the longest possible detour.
  //
  // Around 12–20% longer is a nice initial target.

  score -=
    Math.abs(
      extraRatio -
      0.16
    ) *
    100


  return score
}


// ============================================================
// BUILD CANDIDATES
// ============================================================

export function getScenicCandidates({
  cityKey,
  start,
  destination,
  directRoute,
}) {
  if (
    !directRoute ||
    !Array.isArray(
      directRoute.coordinates
    )
  ) {
    return []
  }


  return findGeographicCandidates({
    cityKey,

    start,

    destination,

    routeCoordinates:
      directRoute.coordinates,
  })
}