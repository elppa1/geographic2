import { useState } from 'react'
import LocationSearch from './LocationSearch.jsx'

// Route-only search controls. Never modifies the main LOCATION search.
// The first two rows are always present, even for an empty route.
function TtcRouteStopSearch({ city, stops = [], onSelect }) {
  const [queries, setQueries] = useState({})
  const [showNext, setShowNext] = useState(false)
  const visibleCount = Math.max(2, stops.length + (showNext ? 1 : 0))

  function selectStop(index, result) {
    onSelect?.(index, result)
    setQueries((previous) => ({ ...previous, [index]: '' }))
    // After a newly added row is filled, show its confirmed stop and
    // require another explicit click to create the next row.
    if (index >= stops.length) {
      setShowNext(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '10px', margin: '10px 0' }}>
      {Array.from({ length: visibleCount }, (_, index) => {
        const stop = stops[index] || null
        const canSearch = index <= stops.length
        return (
          <div key={index} style={{ display: 'grid', gap: '5px' }}>
            <div className="admin-pin-position-note">
              {index === 0 ? 'FIRST STOP' : index === 1 ? 'SECOND STOP' : `STOP ${index + 1}`}
              {stop ? ' · SELECTED' : ' · SEARCH OR CLICK THE MAP'}
            </div>
            <LocationSearch
              city={city}
              value={Object.prototype.hasOwnProperty.call(queries, index) && queries[index] !== ''
                ? queries[index]
                : (stop?.label || '')}
              onChange={(value) => setQueries((previous) => ({ ...previous, [index]: value }))}
              onSelect={(result) => selectStop(index, result)}
              selectedLocation={stop ? {
                longitude: stop.longitude,
                latitude: stop.latitude,
                location: stop.label,
              } : null}
            />
            {!canSearch && <div className="admin-pin-position-note">SELECT THE PREVIOUS STOP FIRST.</div>}
          </div>
        )
      })}
      <button
        type="button"
        className="admin-pin-position-button"
        onClick={() => setShowNext(true)}
        disabled={stops.length < 2 || showNext}
      >
        + ADD ANOTHER STOP
      </button>
    </div>
  )
}

export default TtcRouteStopSearch
