import {
  useEffect,
  useState,
} from 'react'

import './Directions.css'


function formatDistance(
  kilometers
) {
  if (
    kilometers < 0.01
  ) {
    return ''
  }


  if (
    kilometers < 1
  ) {
    return (
      `${Math.round(
        kilometers * 1000
      )} m`
    )
  }


  return (
    `${kilometers.toFixed(
      1
    )} km`
  )
}


function formatTime(
  seconds
) {
  const minutes =
    Math.max(
      1,
      Math.round(
        seconds / 60
      )
    )


  if (
    minutes < 60
  ) {
    return (
      `${minutes} min`
    )
  }


  const hours =
    Math.floor(
      minutes / 60
    )


  const remainder =
    minutes % 60


  if (
    remainder === 0
  ) {
    return (
      `${hours} hr`
    )
  }


  return (
    `${hours} hr ${remainder} min`
  )
}


function DirectionsPanel({
  route,
  destination,
  loading,
  error,
  onClear,
  onStepChange,
}) {
  const [
    navigating,
    setNavigating,
  ] =
    useState(false)


  const [
    currentStep,
    setCurrentStep,
  ] =
    useState(0)


  useEffect(() => {
    setNavigating(
      false
    )

    setCurrentStep(
      0
    )


    onStepChange?.(
      null
    )
  }, [
    route,
    onStepChange,
  ])


  if (
    !route &&
    !loading &&
    !error
  ) {
    return null
  }


  const steps =
    route?.steps ||
    []


  const activeStep =
    steps[
      currentStep
    ]


  const atLastStep =
    currentStep >=
    steps.length - 1


  function showStep(
    index
  ) {
    if (
      steps.length === 0
    ) {
      return
    }


    const nextIndex =
      Math.max(
        0,
        Math.min(
          index,
          steps.length - 1
        )
      )


    setCurrentStep(
      nextIndex
    )


    onStepChange?.(
      steps[
        nextIndex
      ] ||
      null
    )
  }


  function startWalking() {
    setNavigating(
      true
    )


    showStep(
      0
    )
  }


  function nextStep() {
    if (
      atLastStep
    ) {
      return
    }


    showStep(
      currentStep + 1
    )
  }


  function previousStep() {
    if (
      currentStep === 0
    ) {
      return
    }


    showStep(
      currentStep - 1
    )
  }


  function backToRoutes() {
    setNavigating(
      false
    )


    setCurrentStep(
      0
    )


    onStepChange?.(
      null
    )
  }


  function clearDirections() {
    onStepChange?.(
      null
    )


    onClear?.()
  }


  return (
    <div
      className={
        navigating
          ? 'directions-panel directions-panel-navigation'
          : 'directions-panel'
      }
    >
      <button
        type="button"
        className="directions-close"
        onClick={
          clearDirections
        }
        aria-label="Clear route"
      >
        ×
      </button>


      {loading && (
        <div className="directions-loading">
          FINDING ROUTE…
        </div>
      )}


      {error && (
        <div className="directions-error">
          {error}
        </div>
      )}


      {route &&
        !navigating && (
          <>
            <div className="directions-kicker">
              ROUTE
            </div>


            <div className="directions-title">
              {
                destination?.name ||
                'DESTINATION'
              }
            </div>


            <div className="directions-route-label">
              WALKING DIRECTIONS
            </div>


            <div className="directions-meta">
              {formatDistance(
                route.distance
              )}

              {' · '}

              {formatTime(
                route.seconds
              )}
            </div>


            <button
              type="button"
              className="directions-start"
              onClick={
                startWalking
              }
              disabled={
                steps.length === 0 ||
                loading
              }
            >
              START WALKING
            </button>
          </>
        )}


      {route &&
        navigating &&
        activeStep && (
          <>
            <button
              type="button"
              className="navigation-back-to-routes"
              onClick={
                backToRoutes
              }
            >
              ← BACK TO ROUTE
            </button>


            <div className="navigation-topline">
              <span>
                {currentStep + 1}
                {' / '}
                {steps.length}
              </span>

              <span>
                {formatTime(
                  route.seconds
                )}
              </span>
            </div>


            <div className="navigation-distance">
              {formatDistance(
                activeStep.distance
              ) || 'NOW'}
            </div>


            <div className="navigation-instruction">
              {
                activeStep.instruction
              }
            </div>


            {activeStep.streetName && (
              <div className="navigation-street">
                {
                  activeStep.streetName
                }
              </div>
            )}


            {atLastStep && (
              <div className="navigation-arrival">
                YOU'RE THERE.
              </div>
            )}


            <div className="navigation-controls">
              <button
                type="button"
                className="navigation-control"
                onClick={
                  previousStep
                }
                disabled={
                  currentStep === 0
                }
              >
                PREVIOUS
              </button>


              {!atLastStep ? (
                <button
                  type="button"
                  className="navigation-control navigation-control-next"
                  onClick={
                    nextStep
                  }
                >
                  NEXT
                </button>
              ) : (
                <button
                  type="button"
                  className="navigation-control navigation-control-next"
                  onClick={
                    backToRoutes
                  }
                >
                  ROUTE
                </button>
              )}
            </div>
          </>
        )}
    </div>
  )
}


export default DirectionsPanel