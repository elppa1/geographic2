import { useEffect, useRef, useState } from 'react'
import { parseIntersection, searchIntersection, searchPlaces } from './locationSearchUtils.js'

// Route editor only. Main SearchControl and regular admin LocationSearch are unchanged.
function StopLookup({ city, stop, value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const requestRef = useRef({ id: 0, controller: null })
  useEffect(() => () => requestRef.current.controller?.abort(), [])

  async function search() {
    const query = value.trim()
    if (query.length < 2) { setMessage('ENTER A STOP OR LOCATION'); return }
    requestRef.current.controller?.abort()
    const controller = new AbortController()
    const id = requestRef.current.id + 1
    requestRef.current = { id, controller }
    setBusy(true)
    setResults([])
    setMessage('')
    try {
      const intersection = parseIntersection(query)
      // Preserve intersection priority. Otherwise look for an official TTC
      // stop before falling back to the existing admin place search.
      let found = []
      let ttcUnavailable = false
      if (!intersection) {
        try {
          const response = await fetch(
            `/api/geographic/toronto/ttc/live/route-stop-search?q=${encodeURIComponent(query)}`,
            { signal: controller.signal }
          )
          if (!response.ok) throw new Error(`TTC stops HTTP ${response.status}`)
          const data = await response.json()
          found = (Array.isArray(data.results) ? data.results : []).map(item => ({
            ...item, id: item.id || `ttc-${item.name}`, source: 'ttc',
          }))
        } catch (error) {
          if (error?.name === 'AbortError') return
          ttcUnavailable = true
        }
      }
      // Show official TTC matches immediately. The independent address/place
      // geocoder can be slow; it must never block a valid station result.
      if (requestRef.current.id !== id) return
      if (found.length) {
        setResults(found.slice(0, 35))
        setMessage('')
      }

      // The normal geocoder remains available for arbitrary intersections,
      // addresses and other places. It is not modified by this component.
      let places = []
      if (city) {
        try {
          places = intersection
            ? await searchIntersection({ intersection, city, signal: controller.signal })
            : await searchPlaces({ query, city, signal: controller.signal })
        } catch (error) {
          if (error?.name === 'AbortError') return
          // TTC results should still appear if the unrelated geocoder fails.
        }
      }
      if (requestRef.current.id !== id) return
      const combined = [...found, ...places.filter(item =>
        !found.some(ttc => Math.abs(Number(ttc.longitude) - Number(item.longitude)) < 0.00008 &&
          Math.abs(Number(ttc.latitude) - Number(item.latitude)) < 0.00008)
      )].slice(0, 35)
      setResults(combined)
      setMessage(combined.length ? '' : (ttcUnavailable
        ? 'TTC lookup unavailable; no address results found. Try a map click.'
        : 'NO MATCHING STOPS OR LOCATIONS'))
    } catch (error) {
      if (error?.name !== 'AbortError' && requestRef.current.id === id) {
        setMessage('SEARCH UNAVAILABLE — YOU CAN STILL CLICK THE MAP')
      }
    } finally {
      if (requestRef.current.id === id) setBusy(false)
    }
  }

  return <div className="admin-location">
    <div className="admin-location-search">
      <input value={value} placeholder="TTC station, stop number, address or intersection"
        onChange={event => { requestRef.current.controller?.abort(); setResults([]); setMessage(''); onChange(event.target.value) }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); search() } }} />
      <button type="button" disabled={busy || value.trim().length < 2} onClick={search}>{busy ? '…' : 'FIND'}</button>
    </div>
    {stop && <div className="admin-location-selected"><div className="admin-location-selected-label">LOCATION SET</div>{stop.label}</div>}
    {results.length > 0 && <div className="admin-location-results">
      {results.map((result, i) => <button type="button" className="admin-location-result"
        key={`${result.id || result.name}-${i}`}
        onClick={() => { onSelect(result); setResults([]); setMessage('') }}>
        <strong>{result.name || result.location}</strong>
        {result.kind && <span> · {result.kind}</span>}
        {result.stopCode && <span> · Stop {result.stopCode}</span>}
      </button>)}
    </div>}
    {message && <div className="admin-pin-position-note">{message}</div>}
  </div>
}

// Exactly two initial rows. Additional rows are explicit and ordered.
function TtcRouteStopSearch({ city, stops = [], onSelect }) {
  const [queries, setQueries] = useState({})
  const [showNext, setShowNext] = useState(false)
  const visibleCount = Math.max(2, stops.length + (showNext ? 1 : 0))
  function selectStop(index, result) {
    onSelect?.(index, result)
    setQueries(previous => ({ ...previous, [index]: '' }))
    if (index >= stops.length) setShowNext(false)
  }
  return <div style={{ display: 'grid', gap: '10px', margin: '10px 0' }}>
    {Array.from({ length: visibleCount }, (_, index) => {
      const stop = stops[index] || null
      return <div key={index} style={{ display: 'grid', gap: '5px' }}>
        <div className="admin-pin-position-note">
          {index === 0 ? 'FIRST STOP' : index === 1 ? 'SECOND STOP' : `STOP ${index + 1}`}
          {stop ? ' · SELECTED' : ' · SEARCH OR CLICK THE MAP'}
        </div>
        <StopLookup city={city} stop={stop}
          value={Object.prototype.hasOwnProperty.call(queries, index) && queries[index] !== ''
            ? queries[index] : (stop?.label || '')}
          onChange={value => setQueries(previous => ({ ...previous, [index]: value }))}
          onSelect={result => selectStop(index, result)} />
      </div>
    })}
    <button type="button" className="admin-pin-position-button"
      onClick={() => setShowNext(true)} disabled={stops.length < 2 || showNext}>
      + ADD ANOTHER STOP
    </button>
  </div>
}

export default TtcRouteStopSearch
