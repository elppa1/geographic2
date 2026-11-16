import { useState } from 'react'
import LocationSearch from './LocationSearch.jsx'

// Search is deliberately separate from the main LOCATION field.
// Selecting a result appends a route stop without moving the draft's
// existing starting pin or overwriting its general location field.
function TtcRouteStopSearch({ city, nextStopNumber, onSelect }) {
  const [query, setQuery] = useState('')

  function choose(result) {
    onSelect?.(result)
    setQuery('')
  }

  return (
    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
      <div className="admin-pin-position-note">
        {`SEARCH FOR STOP ${nextStopNumber} (OR CLICK THE MAP)`}
      </div>
      <LocationSearch
        city={city}
        value={query}
        onChange={setQuery}
        onSelect={choose}
        selectedLocation={null}
      />
    </div>
  )
}

export default TtcRouteStopSearch
