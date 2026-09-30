import {
  useEffect,
  useRef,
} from 'react'


function TimeMachine({
  layers,
  selectedYear,
  onSelectYear,
  opacity,
  onOpacityChange,
}) {
  const yearsRef =
    useRef(null)


  useEffect(
    () => {
      const years =
        yearsRef.current


      if (
        !years
      ) {
        return undefined
      }


      const frame =
        window.requestAnimationFrame(
          () => {
            const selectedButton =
              years.querySelector(
                '.timeline-button.active'
              )


            if (
              !selectedButton
            ) {
              return
            }


            const targetLeft =
              selectedButton.offsetLeft -
              (
                years.clientWidth -
                selectedButton.offsetWidth
              ) /
                2


            years.scrollTo({
              left:
                Math.max(
                  0,
                  targetLeft
                ),

              behavior:
                'smooth',
            })
          }
        )


      return () =>
        window.cancelAnimationFrame(
          frame
        )
    },
    [
      selectedYear,
      layers,
    ]
  )


  return (
    <div className="time-machine">
      <div
        ref={
          yearsRef
        }
        className="timeline-years"
      >
        {layers.map(
          (item) => (
            <button
              key={`${item.layerType}-${item.year}`}
              type="button"
              className={
                item.year ===
                selectedYear
                  ? 'timeline-button active'
                  : 'timeline-button'
              }
              onClick={() =>
                onSelectYear(
                  item
                )
              }
            >
              {item.now
                ? 'NOW'
                : item.year}
            </button>
          )
        )}
      </div>


      <div className="opacity-row">
        <span>
          MODERN
        </span>

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={opacity}
          onChange={
            onOpacityChange
          }
        />

        <span>
          HISTORICAL
        </span>
      </div>
    </div>
  )
}


export default TimeMachine