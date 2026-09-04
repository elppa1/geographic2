import {
  createPublishedNewFeed,
} from './publishedStore.js'


export function torontoNewSportsFeed() {
  return createPublishedNewFeed({
    newType:
      'sports',

    fileName:
      'toronto-new-sports.json',

    basePath:
      '/api/geographic/toronto/new/sports',
  })
}
