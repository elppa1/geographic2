import {
  useState,
} from 'react'

import SearchControl from './SearchControl.jsx'

import './MapControls.css'


function MapControls({
  onLocate,
  onSearchResult,
  locationTrackingActive = false,
}) {
  const [
    locating,
    setLocating,
  ] =
    useState(false)


  async function handleLocate() {
    if (
      locating ||
      !onLocate
    ) {
      return
    }

    setLocating(
      true
    )

    try {
      await onLocate()
    } catch (
      error
    ) {
      console.error(
        'LOCATION ERROR:',
        error
      )
    } finally {
      setLocating(
        false
      )
    }
  }


  return (
    <div className="map-utilities">
      <button
        type="button"
        className={[
          'map-utility-button',
          'gps-toggle-button',
          locationTrackingActive
            ? 'gps-toggle-button-active'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={
          handleLocate
        }
        aria-label={
          locationTrackingActive
            ? 'Turn GPS tracking off'
            : 'Turn GPS tracking on'
        }
        aria-pressed={
          locationTrackingActive
        }
        title={
          locationTrackingActive
            ? 'GPS on — click to turn off'
            : 'GPS off — click to turn on'
        }
      >
        {locating
          ? '…'
          : 'GPS'}
      </button>


      <SearchControl
        onResult={
          onSearchResult
        }
      />
    </div>
  )
}


export default MapControls
