import {
  useState,
} from 'react'

import {
  PINS,
} from '../content/pins.js'


const TORONTO_BOUNDS = {
  south:
    43.5810,

  west:
    -79.6393,

  north:
    43.8555,

  east:
    -79.1150,
}


function SearchControl({
  onResult,

  cityKey =
    'toronto',
}) {
  const [
    open,
    setOpen,
  ] =
    useState(false)

  const [
    query,
    setQuery,
  ] =
    useState('')

  const [
    geographicResults,
    setGeographicResults,
  ] =
    useState([])

  const [
    placeResults,
    setPlaceResults,
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


  // ============================================================
  // GEOGRAPHIC SEARCH
  // ============================================================

  function searchGeographic(
    cleanQuery
  ) {
    const search =
      cleanQuery
        .toLowerCase()
        .trim()


    return PINS
      .filter(
        (pin) =>
          pin.city === cityKey &&
          pin.active !== false
      )
      .filter(
        (pin) => {
          const searchableText =
            [
              pin.title,
              pin.description,
              pin.year,
              pin.kind,
              pin.source,
            ]
              .filter(
                Boolean
              )
              .join(' ')
              .toLowerCase()


          return searchableText.includes(
            search
          )
        }
      )
      .slice(
        0,
        5
      )
      .map(
        (pin) => ({
          id:
            pin.id,

          name:
            pin.title,

          subtitle:
            [
              pin.year,
              pin.kind,
            ]
              .filter(
                Boolean
              )
              .join(' · '),

          description:
            pin.description,

          longitude:
            Number(
              pin.longitude
            ),

          latitude:
            Number(
              pin.latitude
            ),

          year:
            pin.year,

          kind:
            pin.kind,

          source:
            pin.source,

          type:
            'geographic',

          pin,
        })
      )
  }


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
        parts.length === 2 &&
        parts[0].length >= 2 &&
        parts[1].length >= 2
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
      value
    )
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )
  }


  function makeStreetRegex(
    value
  ) {
    const raw =
      stripStreetSuffix(
        value
      )


    const escaped =
      escapeRegex(
        raw
      )


    // IMPORTANT:
    //
    // Overpass uses a more limited regular-expression syntax.
    // Avoid:
    //
    //   \s
    //   (?: )
    //
    // Use ordinary groups and literal spaces instead.

    return (
      '^' +
      escaped +
      '( (Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl))?' +
      '( (East|West|North|South|E|W|N|S))?' +
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
  // OVERPASS INTERSECTION SEARCH
  // ============================================================

  async function searchIntersection(
    intersection
  ) {
    const streetARegex =
      makeStreetRegex(
        intersection.streetA
      )

    const streetBRegex =
      makeStreetRegex(
        intersection.streetB
      )


    const bbox =
      [
        TORONTO_BOUNDS.south,
        TORONTO_BOUNDS.west,
        TORONTO_BOUNDS.north,
        TORONTO_BOUNDS.east,
      ].join(',')


    const overpassQuery =
      `
[out:json][timeout:15];

way
  ["highway"]
  ["name"~"${streetARegex}",i]
  (${bbox})
  ->.streetA;

way
  ["highway"]
  ["name"~"${streetBRegex}",i]
  (${bbox})
  ->.streetB;

node(w.streetA)
  ->.nodesA;

node(w.streetB)
  ->.nodesB;

node.nodesA.nodesB;

out body;
      `.trim()


    console.log(
      'INTERSECTION QUERY:',
      overpassQuery
    )


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
                overpassQuery,
            }),
        }
      )


    if (
      !response.ok
    ) {
      const errorText =
        await response.text()


      console.error(
        'OVERPASS ERROR:',
        errorText
      )


      throw new Error(
        'Intersection search unavailable'
      )
    }


    const data =
      await response.json()


    const nodes =
      Array.isArray(
        data.elements
      )
        ? data.elements.filter(
            (element) =>
              element.type === 'node' &&
              Number.isFinite(
                Number(
                  element.lon
                )
              ) &&
              Number.isFinite(
                Number(
                  element.lat
                )
              )
          )
        : []


    if (
      nodes.length === 0
    ) {
      return []
    }


    return nodes
      .slice(
        0,
        3
      )
      .map(
        (
          node,
          index
        ) => ({
          id:
            `intersection-${node.id}`,

          name:
            (
              `${titleCase(intersection.streetA)}` +
              ' & ' +
              `${titleCase(intersection.streetB)}`
            ),

          subtitle:
            index === 0
              ? 'Toronto'
              : 'Toronto · alternate crossing',

          longitude:
            Number(
              node.lon
            ),

          latitude:
            Number(
              node.lat
            ),

          type:
            'place',

          placeType:
            'intersection',
        })
      )
  }


  // ============================================================
  // NORMAL PLACE RESULT
  // ============================================================

  function formatPlaceResult(
    item
  ) {
    const address =
      item.address || {}


    const road =
      address.road ||
      address.pedestrian ||
      address.footway ||
      address.path ||
      ''


    const houseNumber =
      address.house_number ||
      ''


    const neighbourhood =
      address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.city_district ||
      ''


    let primary =
      item.name ||
      road ||
      ''


    if (
      houseNumber &&
      road
    ) {
      primary =
        `${houseNumber} ${road}`
    }


    if (
      !primary
    ) {
      primary =
        String(
          item.display_name ||
          'Toronto'
        )
          .split(',')[0]
          .trim()
    }


    const subtitleParts =
      [
        neighbourhood,
        'Toronto',
      ]
        .filter(
          Boolean
        )


    const subtitle =
      [
        ...new Set(
          subtitleParts
        ),
      ]
        .join(' · ')


    return {
      id:
        `place-${item.place_id}`,

      name:
        primary,

      subtitle,

      longitude:
        Number(
          item.lon
        ),

      latitude:
        Number(
          item.lat
        ),

      type:
        'place',

      placeType:
        item.type,
    }
  }


  // ============================================================
  // NORMAL PLACE SEARCH
  // ============================================================

  async function searchPlaces(
    cleanQuery
  ) {
    const params =
      new URLSearchParams({
        q:
          `${cleanQuery}, Toronto, Ontario, Canada`,

        limit:
          '8',

        countryCode:
          'ca',

        west:
          String(
            TORONTO_BOUNDS.west
          ),

        north:
          String(
            TORONTO_BOUNDS.north
          ),

        east:
          String(
            TORONTO_BOUNDS.east
          ),

        south:
          String(
            TORONTO_BOUNDS.south
          ),

        bounded:
          '1',
      })


    const response =
      await fetch(
        `/api/geographic/location-search/place?${params.toString()}`
      )


    if (
      !response.ok
    ) {
      throw new Error(
        'Place search unavailable'
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


    const formatted =
      data
        .map(
          formatPlaceResult
        )
        .filter(
          (result) =>
            Number.isFinite(
              result.longitude
            ) &&
            Number.isFinite(
              result.latitude
            )
        )


    const seen =
      new Set()


    return formatted
      .filter(
        (result) => {
          const key =
            (
              result.name +
              '|' +
              result.subtitle
            )
              .toLowerCase()


          if (
            seen.has(
              key
            )
          ) {
            return false
          }


          seen.add(
            key
          )


          return true
        }
      )
      .slice(
        0,
        5
      )
  }


  // ============================================================
  // SEARCH
  // ============================================================

  async function search(
    event
  ) {
    event.preventDefault()


    const cleanQuery =
      query.trim()


    if (
      cleanQuery.length < 2
    ) {
      return
    }


    setSearching(
      true
    )

    setMessage(
      ''
    )

    setGeographicResults(
      []
    )

    setPlaceResults(
      []
    )


    const localResults =
      searchGeographic(
        cleanQuery
      )


    setGeographicResults(
      localResults
    )


    try {
      const intersection =
        parseIntersection(
          cleanQuery
        )


      let results


      if (
        intersection
      ) {
        results =
          await searchIntersection(
            intersection
          )
      } else {
        results =
          await searchPlaces(
            cleanQuery
          )
      }


      setPlaceResults(
        results
      )


      if (
        localResults.length === 0 &&
        results.length === 0
      ) {
        setMessage(
          intersection
            ? 'INTERSECTION NOT FOUND'
            : 'NO RESULTS'
        )
      }
    } catch (
      error
    ) {
      console.error(
        'SEARCH ERROR:',
        error
      )


      if (
        localResults.length === 0
      ) {
        setMessage(
          'SEARCH UNAVAILABLE'
        )
      }
    } finally {
      setSearching(
        false
      )
    }
  }


  // ============================================================
  // SELECT
  // ============================================================

  function selectResult(
    result
  ) {
    onResult?.(
      result
    )


    setOpen(
      false
    )

    setMessage(
      ''
    )

    setGeographicResults(
      []
    )

    setPlaceResults(
      []
    )
  }


  // ============================================================
  // CLOSE
  // ============================================================

  function closeSearch() {
    setOpen(
      false
    )

    setMessage(
      ''
    )

    setGeographicResults(
      []
    )

    setPlaceResults(
      []
    )
  }


  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="search-control">
      <button
        type="button"
        className="map-utility-button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        aria-label="Search map"
        title="Search map"
      >
        ⌕
      </button>


      {open && (
        <div className="search-panel">
          <form
            className="search-form"
            onSubmit={
              search
            }
          >
            <input
              className="search-input"
              type="search"
              value={
                query
              }
              onChange={
                (event) =>
                  setQuery(
                    event.target.value
                  )
              }
              placeholder="Search Toronto"
              autoFocus
            />


            <button
              type="submit"
              className="search-submit"
              disabled={
                searching
              }
            >
              {searching
                ? '…'
                : 'GO'}
            </button>


            <button
              type="button"
              className="search-close"
              onClick={
                closeSearch
              }
              aria-label="Close search"
            >
              ×
            </button>
          </form>


          {geographicResults.length > 0 && (
            <div className="search-results">
              <div className="search-section-title">
                GEOGRAPHIC
              </div>


              {geographicResults.map(
                (result) => (
                  <button
                    type="button"
                    className="search-result"
                    key={
                      result.id
                    }
                    onClick={() =>
                      selectResult(
                        result
                      )
                    }
                  >
                    <span className="search-result-name">
                      {
                        result.name
                      }
                    </span>


                    {result.subtitle && (
                      <span className="search-result-subtitle">
                        {
                          result.subtitle
                        }
                      </span>
                    )}


                    {result.description && (
                      <span className="search-result-description">
                        {
                          result.description
                        }
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}


          {placeResults.length > 0 && (
            <div className="search-results">
              <div className="search-section-title">
                PLACES
              </div>


              {placeResults.map(
                (result) => (
                  <button
                    type="button"
                    className="search-result"
                    key={
                      result.id
                    }
                    onClick={() =>
                      selectResult(
                        result
                      )
                    }
                  >
                    <span className="search-result-name">
                      {
                        result.name
                      }
                    </span>


                    {result.subtitle && (
                      <span className="search-result-subtitle">
                        {
                          result.subtitle
                        }
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          )}


          {message && (
            <div className="search-message">
              {message}
            </div>
          )}


          <div className="search-attribution">
            Map data © OpenStreetMap contributors
          </div>
        </div>
      )}
    </div>
  )
}


export default SearchControl