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
  onDirect,
  onLongWay,
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


  const [
    stepsOpen,
    setStepsOpen,
  ] =
    useState(false)


  useEffect(() => {
    setNavigating(
      false
    )


    setCurrentStep(
      0
    )


    setStepsOpen(
      false
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


  const isLongWay =
    route?.kind ===
    'long'


  const extraMinutes =
    isLongWay &&
    !route?.fallback &&
    route?.directSeconds
      ? Math.max(
          1,
          Math.round(
            (
              route.seconds -
              route.directSeconds
            ) / 60
          )
        )
      : 0


  const atLastStep =
    currentStep >=
    steps.length - 1


  function showStep(
    index
  ) {
    if (
      steps.length ===
      0
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


    setStepsOpen(
      false
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


  function toggleSteps() {
    setStepsOpen(
      (
        current
      ) => {
        const next =
          !current


        if (
          !next &&
          !navigating
        ) {
          onStepChange?.(
            null
          )
        }


        return next
      }
    )
  }


  function chooseStep(
    index
  ) {
    showStep(
      index
    )
  }


  function backToRoutes() {
    setNavigating(
      false
    )


    setCurrentStep(
      0
    )


    setStepsOpen(
      false
    )


    onStepChange?.(
      null
    )
  }


  function chooseDirect() {
    if (
      loading ||
      !destination ||
      route?.kind ===
        'direct'
    ) {
      return
    }


    setNavigating(
      false
    )


    setCurrentStep(
      0
    )


    setStepsOpen(
      false
    )


    onStepChange?.(
      null
    )


    onDirect?.(
      destination
    )
  }


  function chooseLongWay() {
    if (
      loading ||
      !destination ||
      route?.kind ===
        'long'
    ) {
      return
    }


    setNavigating(
      false
    )


    setCurrentStep(
      0
    )


    setStepsOpen(
      false
    )


    onStepChange?.(
      null
    )


    onLongWay?.(
      destination
    )
  }


  function clearDirections() {
    onStepChange?.(
      null
    )


    onClear?.()
  }


  function renderSteps() {
    if (
      !stepsOpen
    ) {
      return null
    }


    return (
      <div className="directions-step-list">
        {steps.map(
          (
            step,
            index
          ) => {
            const selected =
              index ===
              currentStep


            return (
              <button
                type="button"
                className={
                  selected
                    ? 'directions-step directions-step-active'
                    : 'directions-step'
                }
                key={
                  step.id ||
                  index
                }
                onClick={() =>
                  chooseStep(
                    index
                  )
                }
              >
                <span className="directions-step-number">
                  {
                    index +
                    1
                  }
                </span>


                <span className="directions-step-content">
                  <strong>
                    {
                      step.instruction
                    }
                  </strong>


                  <span className="directions-step-meta">
                    {formatDistance(
                      step.distance
                    ) || 'NOW'}
                  </span>
                </span>
              </button>
            )
          }
        )}
      </div>
    )
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


            <div className="directions-mode-switch">
              <button
                type="button"
                className={
                  route.kind ===
                  'direct'
                    ? (
                        'directions-mode-button ' +
                        'directions-mode-button-active'
                      )
                    : 'directions-mode-button'
                }
                onClick={
                  chooseDirect
                }
                disabled={
                  loading
                }
                aria-pressed={
                  route.kind ===
                  'direct'
                }
              >
                DIRECTIONS
              </button>


              <button
                type="button"
                className={
                  route.kind ===
                  'long'
                    ? (
                        'directions-mode-button ' +
                        'directions-mode-button-active'
                      )
                    : 'directions-mode-button'
                }
                onClick={
                  chooseLongWay
                }
                disabled={
                  loading
                }
                aria-pressed={
                  route.kind ===
                  'long'
                }
              >
                TAKE THE LONG WAY
              </button>
            </div>


            <div className="directions-route-label">
              {isLongWay
                ? 'TAKE THE LONG WAY'
                : 'WALKING DIRECTIONS'}
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


            {isLongWay &&
              !route.fallback &&
              extraMinutes >
                0 && (
                <div className="directions-detour">
                  +{extraMinutes} MIN
                </div>
              )}


            {isLongWay &&
              route.fallback && (
                <div className="directions-note">
                  DIRECT ROUTE IS ALREADY THE GOOD ROUTE.
                </div>
              )}


            {isLongWay &&
              !route.fallback && (
                <div className="directions-note">
                  {route.scenicPlace?.name
                    ? (
                        `VIA ${route.scenicPlace.name}`
                      )
                    : (
                        'A LITTLE FARTHER. MORE ROOM TO WANDER.'
                      )}
                </div>
              )}


            {steps.length >
              0 && (
              <div className="directions-all-shell">
                <button
                  type="button"
                  className={
                    stepsOpen
                      ? 'directions-all-toggle directions-all-toggle-open'
                      : 'directions-all-toggle'
                  }
                  onClick={
                    toggleSteps
                  }
                  aria-expanded={
                    stepsOpen
                  }
                >
                  <span>
                    ALL DIRECTIONS
                  </span>


                  <span className="directions-all-arrow">
                    {stepsOpen
                      ? '▴'
                      : '▾'}
                  </span>
                </button>


                {
                  renderSteps()
                }
              </div>
            )}


            <button
              type="button"
              className="directions-start"
              onClick={
                startWalking
              }
              disabled={
                steps.length ===
                  0 ||
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
              ← BACK TO ROUTES
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


            <div className="directions-all-shell directions-all-shell-navigation">
              <button
                type="button"
                className={
                  stepsOpen
                    ? 'directions-all-toggle directions-all-toggle-open'
                    : 'directions-all-toggle'
                }
                onClick={
                  toggleSteps
                }
                aria-expanded={
                  stepsOpen
                }
              >
                <span>
                  ALL DIRECTIONS
                </span>


                <span className="directions-all-arrow">
                  {stepsOpen
                    ? '▴'
                    : '▾'}
                </span>
              </button>


              {
                renderSteps()
              }
            </div>


            <div className="navigation-controls">
              <button
                type="button"
                className="navigation-control"
                onClick={
                  previousStep
                }
                disabled={
                  currentStep ===
                  0
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
                  ROUTES
                </button>
              )}
            </div>
          </>
        )}
    </div>
  )
}


export default DirectionsPanel