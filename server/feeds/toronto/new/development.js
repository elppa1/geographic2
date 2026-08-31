import {
  createPublishedNewFeed,
} from './publishedStore.js'


export function torontoNewDevelopmentFeed() {
  return createPublishedNewFeed({
    newType:
      'development',

    fileName:
      'toronto-new-development.json',

    basePath:
      '/api/geographic/toronto/new/development',
  })
}
