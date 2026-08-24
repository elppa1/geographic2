import {
  TORONTO_PROXIES,
} from './cities/index.js'


// ============================================================
// GEOGRAPHIC PROXY REGISTRY
// ============================================================

const CITY_PROXIES = [
  TORONTO_PROXIES,
]


// ============================================================
// CREATE GEOGRAPHIC PROXY
// ============================================================

export function createGeographicProxy() {
  return Object.assign(
    {},
    ...CITY_PROXIES
  )
}