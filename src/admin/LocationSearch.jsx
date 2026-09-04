import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  searchLocation,
} from './locationSearchUtils.js'


// ============================================================
// INTERSECTION PARSER
// ============================================================

function parseIntersection(
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
    /\s*&\s*/i,
    /\s+and\s+/i,
    /\s+at\s+/i,
    /\s*@\s*/i,
    /\s*\/\s*/i,
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

function stripStreetSuffix(
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


function escapeRegex(
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


  return '(East|West|North|South|E|W|N|S)'
}


function makeStreetNameRegex(
  value
) {
  const normalized =
    String(
      value || ''
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


  return normalized
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
}


function makeStreetRegex(
  value
) {
  const {
    base,
    direction,
  } =
    getStreetDirection(
      value
    )


  const streetName =
    makeStreetNameRegex(
      stripStreetSuffix(
        base
      )
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
    streetName +
    streetType +
    directionRegex +
    '$'
  )
}


function titleCase(
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

function getSearchConfig(
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

async function searchIntersection({
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


  const bbox =
    [
      bounds.south,
      bounds.west,
      bounds.north,
      bounds.east,
    ]
      .join(',')


  const streetA =
    makeStreetRegex(
      intersection.streetA
    )


  const streetB =
    makeStreetRegex(
      intersection.streetB
    )


  const query =
    `
[out:json][timeout:15];

way
  ["highway"]
  ["name"~"${streetA}",i]
  (${bbox})
  ->.streetA;

way
  ["highway"]
  ["name"~"${streetB}",i]
  (${bbox})
  ->.streetB;

node(w.streetA)
  ->.nodesA;

node(w.streetB)
  ->.nodesB;

node.nodesA.nodesB;

out body;
    `.trim()


  const response =
    await fetch(
      'https://overpass-api.de/api/interpreter',
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


// ============================================================
// PLACE / ADDRESS SEARCH
// ============================================================

async function searchPlaces({
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


  const values = {
    q:
      `${query}, ${querySuffix}`,

    limit:
      '6',

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
  }


  if (
    countryCode
  ) {
    values.countryCode =
      countryCode
  }


  const params =
    new URLSearchParams(
      values
    )


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
// COMPONENT
// ============================================================

function LocationSearch({
  city,
  value,
  selectedLocation,
  onChange,
  onSelect,
  autoSearch =
    false,
}) {
  const [
    results,
    setResults,
  ] =
    useState([])


  const [
    searching,
    setSearching,
  ] =
    useState(false)


  const [
    message,
    setMessage,
  ] =
    useState('')


  const autoSearchKeyRef =
    useRef('')


  const searchRequestRef =
    useRef({
      controller:
        null,

      id:
        0,
    })


  // ==========================================================
  // SEARCH
  // ==========================================================

  async function search({
    autoSelectFirst =
      false,
  } = {}) {
    const clean =
      String(
        value || ''
      )
        .trim()


    if (
      clean.length < 2
    ) {
      return
    }


    if (
      !city
    ) {
      setMessage(
        'CITY UNAVAILABLE'
      )


      return
    }


    searchRequestRef.current.controller
      ?.abort()


    const controller =
      new AbortController()


    const requestId =
      searchRequestRef.current.id +
      1


    searchRequestRef.current = {
      controller,
      id:
        requestId,
    }


    setSearching(
      true
    )


    setMessage(
      ''
    )


    setResults(
      []
    )


    try {
      const nextResults =
        await searchLocation({
          value:
            clean,

          city,

          signal:
            controller.signal,
        })


      if (
        searchRequestRef.current.id !==
          requestId
      ) {
        return
      }


      if (
        autoSelectFirst &&
        nextResults.length >
          0
      ) {
        select(
          nextResults[0]
        )


        return
      }


      setResults(
        nextResults
      )


      if (
        nextResults.length ===
        0
      ) {
        setMessage(
          'NO LOCATIONS FOUND'
        )
      }
    } catch (
      error
    ) {
      if (
        error?.name ===
          'AbortError' ||
        searchRequestRef.current.id !==
          requestId
      ) {
        return
      }


      console.error(
        'ADMIN LOCATION SEARCH ERROR:',
        error
      )


      setMessage(
        'LOCATION SEARCH UNAVAILABLE'
      )
    } finally {
      if (
        searchRequestRef.current.id ===
          requestId
      ) {
        setSearching(
          false
        )
      }
    }
  }


  // ==========================================================
  // SELECT
  // ==========================================================

  function select(
    result
  ) {
    onSelect?.({
      ...result,

      location:
        result.location ||
        result.name,
    })


    setResults(
      []
    )


    setMessage(
      ''
    )
  }


  // ==========================================================
  // SELECTED
  // ==========================================================

  const hasSelectedLocation =
    selectedLocation &&
    selectedLocation.longitude !==
      null &&
    selectedLocation.longitude !==
      undefined &&
    selectedLocation.longitude !==
      '' &&
    selectedLocation.latitude !==
      null &&
    selectedLocation.latitude !==
      undefined &&
    selectedLocation.latitude !==
      '' &&
    Number.isFinite(
      Number(
        selectedLocation.longitude
      )
    ) &&
    Number.isFinite(
      Number(
        selectedLocation.latitude
      )
    )


  // ==========================================================
  // AUTO SEARCH
  // ==========================================================
  //
  // Scraped REVIEW records can arrive with a good address but
  // without coordinates. When AdminRoom explicitly enables
  // autoSearch, resolve that preloaded address once and select
  // the first bounded city result automatically.
  //
  // ==========================================================

  useEffect(
    () => {
      const clean =
        String(
          value ||
          ''
        )
          .trim()


      if (
        !autoSearch ||
        !city ||
        hasSelectedLocation ||
        clean.length <
          2
      ) {
        return
      }


      const key =
        (
          `${city.key || city.name || ''}::` +
          clean.toLowerCase()
        )


      if (
        autoSearchKeyRef.current ===
        key
      ) {
        return
      }


      autoSearchKeyRef.current =
        key


      search({
        autoSelectFirst:
          true,
      })


      return () => {
        searchRequestRef.current.controller
          ?.abort()
      }
    },
    [
      autoSearch,
      city,
      value,
      hasSelectedLocation,
    ]
  )


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="admin-location">
      <div className="admin-location-search">
        <input
          value={
            value
          }
          onChange={
            (event) => {
              searchRequestRef.current.controller
                ?.abort()


              searchRequestRef.current = {
                controller:
                  null,

                id:
                  searchRequestRef.current.id +
                  1,
              }


              setSearching(
                false
              )


              onChange?.(
                event.target.value
              )
            }
          }
          onKeyDown={
            (event) => {
              if (
                event.key ===
                'Enter'
              ) {
                event.preventDefault()

                search()
              }
            }
          }
          placeholder={
            city
              ? `Address, intersection, or place in ${city.name}`
              : 'Address, intersection, or place'
          }
        />


        <button
          type="button"
          disabled={
            searching
          }
          onClick={
            search
          }
        >
          {searching
            ? '…'
            : 'FIND'}
        </button>
      </div>


      {hasSelectedLocation && (
        <div className="admin-location-selected">
          <div className="admin-location-selected-label">
            LOCATION SET
          </div>


          <div>
            {
              selectedLocation.location ||
              selectedLocation.name
            }
          </div>


          {selectedLocation.intersection && (
            <div className="admin-location-selected-intersection">
              {
                selectedLocation.intersection
              }
            </div>
          )}
        </div>
      )}


      {results.length > 0 && (
        <div className="admin-location-results">
          {results.map(
            (result) => (
              <button
                type="button"
                className="admin-location-result"
                key={
                  result.id
                }
                onClick={() =>
                  select(
                    result
                  )
                }
              >
                <strong>
                  {
                    result.name
                  }
                </strong>


                <span>
                  {
                    result.subtitle
                  }
                </span>
              </button>
            )
          )}
        </div>
      )}


      {message && (
        <div className="admin-location-message">
          {
            message
          }
        </div>
      )}
    </div>
  )
}


export default LocationSearch
