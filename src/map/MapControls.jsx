import {
  useState,
} from 'react'

import SearchControl from './SearchControl.jsx'

import './MapControls.css'


function MapControls({
  onLocate,
  onOrientation,
  onSearchResult,
  locationTrackingActive = false,
}) {
  const [
    locating,
    setLocating,
  ] =
    useState(false)

  const [
    orientationTrackingActive,
    setOrientationTrackingActive,
  ] =
    useState(false)

  const mobileControls =
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches


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
      const active =
        await onLocate()


      if (
        !active
      ) {
        setOrientationTrackingActive(
          false
        )
      }
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


  async function handleOrientation() {
    if (
      !locationTrackingActive ||
      !onOrientation
    ) {
      return
    }


    try {
      const active =
        await onOrientation()


      setOrientationTrackingActive(
        Boolean(
          active
        )
      )
    } catch (
      error
    ) {
      console.error(
        'ORIENTATION ERROR:',
        error
      )

      setOrientationTrackingActive(
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


      {mobileControls &&
        locationTrackingActive && (
        <button
          type="button"
          className={[
            'map-utility-button',
            'gps-toggle-button',
            orientationTrackingActive
              ? 'gps-toggle-button-active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={
            handleOrientation
          }
          disabled={
            !locationTrackingActive
          }
          aria-label={
            orientationTrackingActive
              ? 'Turn phone orientation off'
              : 'Turn phone orientation on'
          }
          aria-pressed={
            orientationTrackingActive
          }
          title={
            !locationTrackingActive
              ? 'Turn GPS on first'
              : orientationTrackingActive
                ? 'Orientation on — click for north-up'
                : 'Orientation off — click to follow phone direction'
          }
        >
          ↑
        </button>
      )}


      <SearchControl
        onResult={
          onSearchResult
        }
      />
    </div>
  )
}


export default MapControls
