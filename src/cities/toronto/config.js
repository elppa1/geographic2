import {
  TORONTO_MAPS,
} from './maps.js'

import {
  TORONTO_AERIALS,
} from './aerials.js'


export const TORONTO = {
  key:
    'toronto',

  name:
    'TORONTO',

  center: [
    -79.3832,
    43.6532,
  ],

  zoom:
    11,

  defaultMode:
    'aerial',

  defaultYear:
    2025,


  // ==========================================================
  // LOCATION / SEARCH
  // ==========================================================
  //
  // Geographic's shared search/admin system reads this.
  //
  // Nothing inside LocationSearch needs to know Toronto
  // specifically anymore.
  //

  search: {
    querySuffix:
      'Toronto, Ontario, Canada',

    countryCode:
      'ca',

    bounds: {
      south:
        43.5810,

      west:
        -79.6393,

      north:
        43.8555,

      east:
        -79.1150,
    },
  },


  maps:
    TORONTO_MAPS,

  aerials:
    TORONTO_AERIALS,
}