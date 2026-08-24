function LayerInfo({
  layer,
  enhanced,
  onToggleEnhance,
}) {
  if (
    !layer
  ) {
    return null
  }


  return (
    <div className="layer-info">
      <div className="layer-info-main">
        <div>
          <div className="layer-title">
            {layer.now
              ? 'NOW'
              : layer.year}
            {' · '}
            {layer.title}
          </div>


          <div className="layer-source">
            SOURCE · {
              layer.source ||
              'UNKNOWN'
            }
          </div>
        </div>


        <button
          type="button"
          className={
            enhanced
              ? 'enhance-button active'
              : 'enhance-button'
          }
          onClick={
            onToggleEnhance
          }
        >
          {enhanced
            ? 'ORIGINAL'
            : 'ENHANCE'}
        </button>
      </div>
    </div>
  )
}


export default LayerInfo