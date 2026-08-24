import {
  useState,
} from 'react'

import SearchControl from './SearchControl.jsx'

import './MapControls.css'


function MapControls({
  onLocate,
  onSearchResult,
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


      <SearchControl
        onResult={
          onSearchResult
        }
      />
    </div>
  )
}


export default MapControls