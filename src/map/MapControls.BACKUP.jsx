import {
  useState,
} from 'react'

import SearchControl from './SearchControl.jsx'

import './MapControls.css'


function MapControls({
  onLocate,
  onSearchResult,
  atmosphereEnabled = true,
  onToggleAtmosphere,
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
        className="map-utility-button"
        onClick={
          handleLocate
        }
        aria-label="Find my location"
        title="Find my location"
      >
        {locating
          ? '…'
          : '◎'}
      </button>


      <button
        type="button"
        className={[
          'map-utility-button',
          'atmosphere-toggle-button',
          atmosphereEnabled
            ? 'atmosphere-toggle-button-active'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={
          onToggleAtmosphere
        }
        aria-label={
          atmosphereEnabled
            ? 'Turn atmosphere off'
            : 'Turn atmosphere on'
        }
        aria-pressed={
          atmosphereEnabled
        }
        title={
          atmosphereEnabled
            ? 'Atmosphere on — click to turn off'
            : 'Atmosphere off — click to turn on'
        }
      >
        ATM
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
