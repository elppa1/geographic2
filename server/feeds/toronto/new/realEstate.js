import { createPublishedNewFeed } from './publishedStore.js'


export function torontoNewRealEstateFeed() {
  return createPublishedNewFeed({
    newType:
      'real-estate',

    fileName:
      'toronto-new-real-estate.json',

    basePath:
      '/api/geographic/toronto/new/real-estate',
  })
}
