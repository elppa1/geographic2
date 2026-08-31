import {
  createPublishedNewFeed,
} from './publishedStore.js'


export function torontoNewBusinessFeed() {
  return createPublishedNewFeed({
    newType:
      'business',

    fileName:
      'toronto-new-business.json',

    basePath:
      '/api/geographic/toronto/new/business',
  })
}
