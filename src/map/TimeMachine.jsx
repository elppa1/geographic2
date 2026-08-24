function TimeMachine({
  layers,
  selectedYear,
  onSelectYear,
  opacity,
  onOpacityChange,
}) {
  return (
    <div className="time-machine">
      <div className="timeline-years">
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