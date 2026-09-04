import {
  useRef,
  useState,
} from 'react'

import {
  searchLocation,
} from './locationSearchUtils.js'


// ============================================================
// LOCATION SEARCH
// ============================================================
//
// ADMIN SEARCH IS MANUAL ONLY.
//
// Typing never:
// - geocodes
// - auto-selects a result
// - changes coordinates
//
// The Admin can finish/correct the search text first.
// A request is made only when FIND is pressed.
//
// ============================================================

function LocationSearch({
  city,
  value,
  selectedLocation,
  onChange,
  onSelect,
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


  const searchRequestRef =
    useRef({
      controller:
        null,

      id:
        0,
    })


  // ==========================================================
  // CANCEL CURRENT SEARCH
  // ==========================================================

  function cancelSearch() {
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
  }


  // ==========================================================
  // MANUAL SEARCH
  // ==========================================================

  async function search() {
    const clean =
      String(
        value ||
        ''
      )
        .trim()


    if (
      clean.length <
      2
    ) {
      setResults(
        []
      )


      setMessage(
        'ENTER A LOCATION'
      )


      return
    }


    if (
      !city
    ) {
      setResults(
        []
      )


      setMessage(
        'CITY UNAVAILABLE'
      )


      return
    }


    cancelSearch()


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
    }
    catch (
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
    }
    finally {
      if (
        searchRequestRef.current.id ===
        requestId
      ) {
        searchRequestRef.current = {
          controller:
            null,

          id:
            requestId,
        }


        setSearching(
          false
        )
      }
    }
  }


  // ==========================================================
  // SELECT RESULT
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
  // SELECTED LOCATION
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
              cancelSearch()


              setResults(
                []
              )


              setMessage(
                ''
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
                // FIND is deliberately button-only.
                // This prevents an accidental search or form submit
                // while Admin is still editing the location text.
                event.preventDefault()
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
            searching ||
            String(
              value ||
              ''
            )
              .trim()
              .length <
              2
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
                onClick={
                  () =>
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
