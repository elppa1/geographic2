import {
  createPublishedNewFeed,
} from './publishedStore.js'


export function torontoNewEventsFeed() {
  return createPublishedNewFeed({
    newType:
      'events',

    fileName:
      'toronto-new-events.json',

    basePath:
      '/api/geographic/toronto/new/events',
  })
}
