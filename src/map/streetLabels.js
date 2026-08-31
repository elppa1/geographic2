const STREET_SOURCE_ID =
  'geographic-streets'


const MAJOR_STREET_LABEL_ID =
  'geographic-major-street-labels'


const LOCAL_STREET_LABEL_ID =
  'geographic-local-street-labels'


const STREET_SOURCE_URL =
  'https://tiles.openfreemap.org/planet'


// ============================================================
// STREET NAME FIELD
// ============================================================

const STREET_NAME = [
  'coalesce',

  [
    'get',
    'name_en',
  ],

  [
    'get',
    'name:en',
  ],

  [
    'get',
    'name',
  ],
]


// ============================================================
// MOBILE STREET LABEL DENSITY / SCALE
// ============================================================

function useCompactStreetLabels() {
  return (
    typeof window !==
      'undefined' &&
    window.matchMedia(
      '(max-width: 700px)'
    )
      .matches
  )
}


// ============================================================
// ADD STREET LABELS
// ============================================================

export function addStreetLabels({
  map,
}) {
  if (
    !map
  ) {
    return
  }


  const compact =
    useCompactStreetLabels()


  // ==========================================================
  // VECTOR SOURCE
  // ==========================================================

  if (
    !map.getSource(
      STREET_SOURCE_ID
    )
  ) {
    map.addSource(
      STREET_SOURCE_ID,
      {
        type:
          'vector',

        url:
          STREET_SOURCE_URL,

        attribution:
          (
            '© OpenStreetMap contributors · ' +
            'OpenFreeMap · OpenMapTiles'
          ),
      }
    )
  }


  // ==========================================================
  // MAJOR STREET NAMES
  // ==========================================================

  if (
    !map.getLayer(
      MAJOR_STREET_LABEL_ID
    )
  ) {
    map.addLayer({
      id:
        MAJOR_STREET_LABEL_ID,

      type:
        'symbol',

      source:
        STREET_SOURCE_ID,

      'source-layer':
        'transportation_name',

      minzoom:
        11,

      filter: [
        'all',

        [
          'has',
          'name',
        ],

        [
          'match',

          [
            'get',
            'class',
          ],

          [
            'motorway',
            'trunk',
            'primary',
            'secondary',
            'tertiary',
          ],

          true,

          false,
        ],
      ],

      layout: {
        'symbol-placement':
          'line',

        'text-field':
          STREET_NAME,

        'text-font': [
          'Noto Sans Regular',
        ],

        'text-size':
          compact
            ? [
                'interpolate',

                [
                  'linear',
                ],

                [
                  'zoom',
                ],

                11,
                7,

                14,
                7.5,

                17,
                8.5,

                19,
                9.5,
              ]
            : [
                'interpolate',

                [
                  'linear',
                ],

                [
                  'zoom',
                ],

                11,
                10,

                14,
                11,

                17,
                13,

                19,
                14,
              ],

        'text-letter-spacing':
          compact
            ? 0.035
            : 0.08,

        'text-transform':
          compact
            ? 'none'
            : 'uppercase',

        'text-max-angle':
          35,

        'text-padding':
          compact
            ? 2
            : 4,

        'text-rotation-alignment':
          'map',

        'text-pitch-alignment':
          'viewport',

        'symbol-spacing':
          compact
            ? 380
            : 320,

        'text-allow-overlap':
          false,

        'text-ignore-placement':
          false,
      },

      paint: {
        'text-color':
          compact
            ? 'rgba(242, 201, 76, 0.88)'
            : '#F2C94C',

        'text-halo-color':
          compact
            ? 'rgba(20, 20, 20, 0.82)'
            : 'rgba(20, 20, 20, 0.94)',

        'text-halo-width':
          compact
            ? 1.05
            : 2.2,

        'text-halo-blur':
          compact
            ? 0.2
            : 0.4,
      },
    })
  }


  // ==========================================================
  // LOCAL STREET NAMES
  // ==========================================================

  if (
    !map.getLayer(
      LOCAL_STREET_LABEL_ID
    )
  ) {
    map.addLayer({
      id:
        LOCAL_STREET_LABEL_ID,

      type:
        'symbol',

      source:
        STREET_SOURCE_ID,

      'source-layer':
        'transportation_name',

      minzoom:
        15,

      filter: [
        'all',

        [
          'has',
          'name',
        ],

        [
          'match',

          [
            'get',
            'class',
          ],

          [
            'minor',
            'service',
            'path',
          ],

          true,

          false,
        ],
      ],

      layout: {
        'symbol-placement':
          'line',

        'text-field':
          STREET_NAME,

        'text-font': [
          'Noto Sans Regular',
        ],

        'text-size':
          compact
            ? [
                'interpolate',

                [
                  'linear',
                ],

                [
                  'zoom',
                ],

                15,
                6.5,

                16,
                7,

                18,
                7.75,

                20,
                8.5,
              ]
            : [
                'interpolate',

                [
                  'linear',
                ],

                [
                  'zoom',
                ],

                15,
                9,

                16,
                10,

                18,
                11,

                20,
                12,
              ],

        'text-letter-spacing':
          compact
            ? 0.015
            : 0.03,

        'text-max-angle':
          40,

        'text-padding':
          compact
            ? 2
            : 3,

        'text-rotation-alignment':
          'map',

        'text-pitch-alignment':
          'viewport',

        'symbol-spacing':
          compact
            ? 340
            : 280,

        'text-allow-overlap':
          false,

        'text-ignore-placement':
          false,
      },

      paint: {
        'text-color':
          compact
            ? 'rgba(242, 201, 76, 0.78)'
            : 'rgba(242, 201, 76, 0.90)',

        'text-halo-color':
          compact
            ? 'rgba(20, 20, 20, 0.78)'
            : 'rgba(20, 20, 20, 0.88)',

        'text-halo-width':
          compact
            ? 0.85
            : 1.8,

        'text-halo-blur':
          compact
            ? 0.18
            : 0.35,
      },
    })
  }
}


// ============================================================
// MOVE LABELS BELOW ROUTE
// ============================================================

export function keepStreetLabelsBelow({
  map,
  beforeLayerId,
}) {
  if (
    !map ||
    !beforeLayerId ||
    !map.getLayer(
      beforeLayerId
    )
  ) {
    return
  }


  if (
    map.getLayer(
      MAJOR_STREET_LABEL_ID
    )
  ) {
    map.moveLayer(
      MAJOR_STREET_LABEL_ID,
      beforeLayerId
    )
  }


  if (
    map.getLayer(
      LOCAL_STREET_LABEL_ID
    )
  ) {
    map.moveLayer(
      LOCAL_STREET_LABEL_ID,
      beforeLayerId
    )
  }
}


// ============================================================
// VISIBILITY
// ============================================================

export function setStreetLabelsVisible({
  map,

  visible =
    true,
}) {
  if (
    !map
  ) {
    return
  }


  const visibility =
    visible
      ? 'visible'
      : 'none'


  ;[
    MAJOR_STREET_LABEL_ID,
    LOCAL_STREET_LABEL_ID,
  ].forEach(
    (layerId) => {
      if (
        map.getLayer(
          layerId
        )
      ) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          visibility
        )
      }
    }
  )
}
