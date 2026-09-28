import {
  getGeographicPins,
  upsertGeographicPin,
} from '../../db/geographicPins.js'


const STATUS_PATH =
  '/api/geographic/toronto/new/community/tpl/status'


const SYNC_PATH =
  '/api/geographic/toronto/new/community/tpl/sync'


const CKAN_PACKAGE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id='


const BRANCH_DATASET =
  'library-branch-general-information'


const EVENTS_DATASET =
  'library-branch-programs-and-events-feed'


const FALLBACK_EVENTS_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/fb343332-03cd-40b9-a1c8-c03a4a85ca1e/resource/aa5e1425-77f4-4cb4-a8ea-eb5ce7d4f34c/download/tpl-events-feed.json'


const FALLBACK_BRANCHES_KML_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/8d8f4405-7b90-4264-8607-b27ab63b9359/resource/fc2d9f28-3758-465c-bb03-412a2b794417/download/library-branch-locations.kml'


const BRANCH_DATASET_PAGE =
  'https://open.toronto.ca/dataset/library-branch-general-information/'


const EVENTS_DATASET_PAGE =
  'https://open.toronto.ca/dataset/library-branch-programs-and-events-feed/'


const TPL_EVENTS_PAGE =
  'https://tpl.bibliocommons.com/v2/events'


const TPL_SOURCE =
  'Toronto Public Library'


const COMMUNITY_SOURCE_KEY =
  'tpl-community'


const SYNC_INTERVAL_MS =
  60 * 60 * 1000


const RESOURCE_CACHE_MS =
  6 * 60 * 60 * 1000


const UPCOMING_LIMIT =
  3


const MIN_EXPECTED_PHYSICAL_BRANCHES =
  80


let syncPromise =
  null


let resourceCache = {
  loadedAt:
    0,

  branchesUrl:
    '',

  eventsUrl:
    '',
}


let lastStatus = {
  ok:
    false,

  syncing:
    false,

  lastAttemptAt:
    '',

  lastSuccessAt:
    '',

  branchCount:
    0,

  matchedEventCount:
    0,

  upcomingProgramCount:
    0,

  archivedCount:
    0,

  error:
    '',
}


function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function normalizeKey(
  value
) {
  return cleanText(
    value
  )
    .toLowerCase()
    .replace(
      /\([^)]*\)/g,
      ' '
    )
    .replace(
      /&/g,
      ' and '
    )
    .replace(
      /\bclosed\b/g,
      ' '
    )
    .replace(
      /\bbranch\b/g,
      ' '
    )
    .replace(
      /[^a-z0-9]+/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


function slugify(
  value
) {
  return normalizeKey(
    value
  )
    .replace(
      /\s+/g,
      '-'
    ) ||
    'library'
}


function truthyValue(
  value
) {
  if (
    value ===
      true ||
    value ===
      1
  ) {
    return true
  }


  const text =
    cleanText(
      value
    )
      .toLowerCase()


  return [
    '1',
    'true',
    'yes',
    'y',
  ].includes(
    text
  )
}


function numberOrNull(
  value
) {
  const number =
    Number(
      value
    )


  return Number.isFinite(
    number
  )
    ? number
    : null
}


function firstValue(
  object,
  keys
) {
  for (
    const key of keys
  ) {
    const value =
      object?.[
        key
      ]


    if (
      value !==
        undefined &&
      value !==
        null &&
      cleanText(
        value
      )
    ) {
      return value
    }
  }


  return ''
}


function extractRows(
  payload
) {
  if (
    Array.isArray(
      payload
    )
  ) {
    return payload
  }


  const candidates = [
    payload?.records,
    payload?.data,
    payload?.result?.records,
    payload?.result?.data,
    payload?.items,
  ]


  return (
    candidates.find(
      Array.isArray
    ) ||
    []
  )
}


async function fetchJson(
  url,
  label
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            'application/json',

          'Accept-Language':
            'en-CA,en;q=0.9',

          'User-Agent':
            'Toronto-Geographic/1.0',
        },

        redirect:
          'follow',

        signal:
          AbortSignal.timeout(
            20000
          ),
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      `${label} failed with HTTP ${response.status}.`
    )
  }


  return response.json()
}


async function fetchText(
  url,
  label
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            'application/xml,text/xml,text/plain,*/*',

          'Accept-Language':
            'en-CA,en;q=0.9',

          'User-Agent':
            'Toronto-Geographic/1.0',
        },

        redirect:
          'follow',

        signal:
          AbortSignal.timeout(
            20000
          ),
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      `${label} failed with HTTP ${response.status}.`
    )
  }


  return response.text()
}


function resourceLooksLikeJson(
  resource
) {
  const format =
    cleanText(
      resource?.format
    )
      .toUpperCase()


  const name =
    cleanText(
      resource?.name
    )
      .toLowerCase()


  const url =
    cleanText(
      resource?.url
    )
      .toLowerCase()


  return (
    format ===
      'JSON' ||
    name.endsWith(
      '.json'
    ) ||
    url.includes(
      '.json'
    )
  )
}


async function resolveJsonResource(
  datasetName
) {
  const packagePayload =
    await fetchJson(
      CKAN_PACKAGE_URL +
      encodeURIComponent(
        datasetName
      ),
      `Toronto Open Data metadata · ${datasetName}`
    )


  const resources =
    Array.isArray(
      packagePayload?.result?.resources
    )
      ? packagePayload.result.resources
      : []


  const resource =
    resources.find(
      resourceLooksLikeJson
    )


  const url =
    cleanText(
      resource?.url
    )


  if (
    !url
  ) {
    throw new Error(
      `Toronto Open Data did not expose a JSON resource for ${datasetName}.`
    )
  }


  return url
}


async function getResourceUrls() {
  const fresh =
    resourceCache.loadedAt &&
    (
      Date.now() -
      resourceCache.loadedAt
    ) <
      RESOURCE_CACHE_MS &&
    resourceCache.branchesUrl &&
    resourceCache.eventsUrl


  if (
    fresh
  ) {
    return resourceCache
  }


  const [
    branchesUrl,
    eventsUrl,
  ] =
    await Promise.all([
      resolveJsonResource(
        BRANCH_DATASET
      ),

      resolveJsonResource(
        EVENTS_DATASET
      ),
    ])


  resourceCache = {
    loadedAt:
      Date.now(),

    branchesUrl,

    eventsUrl,
  }


  return resourceCache
}


function parseBranchRows(
  payload
) {
  return extractRows(
    payload
  )
    .map(
      (row) => {
        const physicalValue =
          firstValue(
            row,
            [
              'PhysicalBranch',
              'physicalBranch',
              'physical_branch',
            ]
          )


        if (
          cleanText(
            physicalValue
          ) &&
          !truthyValue(
            physicalValue
          )
        ) {
          return null
        }


        const branchCode =
          cleanText(
            firstValue(
              row,
              [
                'BranchCode',
                'branchCode',
                'branch_code',
                'Code',
                'code',
              ]
            )
          )


        const name =
          cleanText(
            firstValue(
              row,
              [
                'BranchName',
                'branchName',
                'branch_name',
                'Name',
                'name',
              ]
            )
          )


        const address =
          cleanText(
            firstValue(
              row,
              [
                'Address',
                'address',
                'StreetAddress',
                'streetAddress',
              ]
            )
          )


        const latitude =
          numberOrNull(
            firstValue(
              row,
              [
                'Lat',
                'Latitude',
                'lat',
                'latitude',
              ]
            )
          )


        const longitude =
          numberOrNull(
            firstValue(
              row,
              [
                'Long',
                'Longitude',
                'Lng',
                'long',
                'longitude',
                'lng',
              ]
            )
          )


        if (
          !branchCode ||
          !name ||
          !address ||
          latitude ===
            null ||
          longitude ===
            null
        ) {
          return null
        }


        return {
          branchCode,

          name,

          address,

          postalCode:
            cleanText(
              firstValue(
                row,
                [
                  'PostalCode',
                  'postalCode',
                  'postal_code',
                ]
              )
            ),

          website:
            cleanText(
              firstValue(
                row,
                [
                  'Website',
                  'website',
                  'URL',
                  'url',
                ]
              )
            ),

          telephone:
            cleanText(
              firstValue(
                row,
                [
                  'Telephone',
                  'telephone',
                  'Phone',
                  'phone',
                ]
              )
            ),

          neighbourhood:
            cleanText(
              firstValue(
                row,
                [
                  'NBHDName',
                  'Neighbourhood',
                  'Neighborhood',
                  'neighbourhood',
                  'neighborhood',
                ]
              )
            ),

          latitude,

          longitude,
        }
      }
    )
    .filter(
      Boolean
    )
}


function decodeXml(
  value
) {
  return cleanText(
    String(
      value ||
      ''
    )
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/g,
        '$1'
      )
      .replace(
        /&lt;/g,
        '<'
      )
      .replace(
        /&gt;/g,
        '>'
      )
      .replace(
        /&quot;/g,
        '"'
      )
      .replace(
        /&#39;/g,
        "'"
      )
      .replace(
        /&amp;/g,
        '&'
      )
  )
}


function extractXmlTag(
  body,
  tagName
) {
  const match =
    String(
      body ||
      ''
    )
      .match(
        new RegExp(
          `<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
          'i'
        )
      )


  return decodeXml(
    match?.[1] ||
    ''
  )
}


function parseBranchKml(
  kml
) {
  const rows =
    []


  const placemarkPattern =
    /<Placemark\b([^>]*)>([\s\S]*?)<\/Placemark>/gi


  let match


  while (
    (
      match =
        placemarkPattern.exec(
          String(
            kml ||
            ''
          )
        )
    )
  ) {
    const attributes =
      match[1] ||
      ''


    const body =
      match[2] ||
      ''


    const rawId =
      cleanText(
        attributes.match(
          /\bid="([^"]+)"/i
        )?.[1] ||
        ''
      )


    const name =
      extractXmlTag(
        body,
        'name'
      )


    const address =
      extractXmlTag(
        body,
        'address'
      )


    const coordinates =
      extractXmlTag(
        body,
        'coordinates'
      )
        .split(',')
        .map(
          Number
        )


    const longitude =
      Number.isFinite(
        coordinates[0]
      )
        ? coordinates[0]
        : null


    const latitude =
      Number.isFinite(
        coordinates[1]
      )
        ? coordinates[1]
        : null


    if (
      !name ||
      !address ||
      latitude ===
        null ||
      longitude ===
        null
    ) {
      continue
    }


    rows.push({
      branchCode:
        rawId ||
        slugify(
          name
        ),

      name,

      address,

      postalCode:
        '',

      website:
        '',

      telephone:
        extractXmlTag(
          body,
          'phoneNumber'
        ),

      neighbourhood:
        '',

      latitude,

      longitude,
    })
  }


  return rows
}


function parseDate(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    !text
  ) {
    return null
  }


  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
      ? new Date(
          `${text}T12:00:00-04:00`
        )
      : new Date(
          text
        )


  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date
}


function buildProgram(
  event,
  branch
) {
  const eventId =
    cleanText(
      firstValue(
        event,
        [
          'EventID',
          'eventId',
          'event_id',
          'ID',
          'id',
        ]
      )
    )


  const title =
    cleanText(
      firstValue(
        event,
        [
          'Title',
          'title',
          'EventName',
          'eventName',
        ]
      )
    )


  if (
    !title
  ) {
    return null
  }


  const startRaw =
    firstValue(
      event,
      [
        'StartTime',
        'startTime',
        'start_time',
        'StartDateLocal',
        'startDateLocal',
        'start_date_local',
      ]
    )


  const endRaw =
    firstValue(
      event,
      [
        'EndTime',
        'endTime',
        'end_time',
      ]
    )


  const startDate =
    parseDate(
      startRaw
    )


  const endDate =
    parseDate(
      endRaw
    )


  if (
    !startDate
  ) {
    return null
  }


  const directUrl =
    cleanText(
      firstValue(
        event,
        [
          'EventURL',
          'EventUrl',
          'eventUrl',
          'event_url',
          'URL',
          'Url',
          'url',
          'Link',
          'link',
        ]
      )
    )


  const branchEventsUrl =
    branch?.branchCode
      ? (
          TPL_EVENTS_PAGE +
          '?locations=' +
          encodeURIComponent(
            branch.branchCode
          )
        )
      : TPL_EVENTS_PAGE


  return {
    eventId,

    title,

    startTime:
      startDate.toISOString(),

    endTime:
      endDate
        ? endDate.toISOString()
        : '',

    eventTypes:
      cleanText(
        firstValue(
          event,
          [
            'EventTypes',
            'eventTypes',
            'event_types',
          ]
        )
      ),

    audiences:
      cleanText(
        firstValue(
          event,
          [
            'Audiences',
            'audiences',
          ]
        )
      ),

    languages:
      cleanText(
        firstValue(
          event,
          [
            'Languages',
            'languages',
          ]
        )
      ),

    isFull:
      truthyValue(
        firstValue(
          event,
          [
            'IsFull',
            'isFull',
            'RegistrationClosed',
            'registrationClosed',
          ]
        )
      ),

    url:
      directUrl ||
      branchEventsUrl,
  }
}


function eventIsActive(
  event
) {
  const status =
    cleanText(
      firstValue(
        event,
        [
          'Status',
          'status',
        ]
      )
    )
      .toUpperCase()


  return (
    !status ||
    status ===
      'ACTIVE'
  )
}


function branchTitle(
  name
) {
  const cleanName =
    cleanText(
      name
    )


  return /\blibrary\b/i.test(
    cleanName
  )
    ? cleanName
    : `${cleanName} Library`
}


export function buildTplCommunityRecords({
  branches,
  events,
  now =
    new Date(),
}) {
  const physicalBranches =
    Array.isArray(
      branches
    )
      ? branches
      : []


  const branchByName =
    new Map()


  const branchByCode =
    new Map()


  physicalBranches.forEach(
    (branch) => {
      const nameKey =
        normalizeKey(
          branch?.name
        )


      const codeKey =
        normalizeKey(
          branch?.branchCode
        )


      if (
        nameKey
      ) {
        branchByName.set(
          nameKey,
          branch
        )
      }


      if (
        codeKey
      ) {
        branchByCode.set(
          codeKey,
          branch
        )
      }
    }
  )


  const programsByBranchCode =
    new Map()


  let matchedEventCount =
    0


  ;(
    Array.isArray(
      events
    )
      ? events
      : []
  )
    .filter(
      eventIsActive
    )
    .forEach(
      (event) => {
        const eventBranchCode =
          normalizeKey(
            firstValue(
              event,
              [
                'BranchCode',
                'branchCode',
                'branch_code',
              ]
            )
          )


        const locationName =
          normalizeKey(
            firstValue(
              event,
              [
                'LocationName',
                'locationName',
                'location_name',
                'BranchName',
                'branchName',
              ]
            )
          )


        const branch =
          branchByCode.get(
            eventBranchCode
          ) ||
          branchByName.get(
            locationName
          ) ||
          null


        if (
          !branch
        ) {
          return
        }


        const program =
          buildProgram(
            event,
            branch
          )


        if (
          !program
        ) {
          return
        }


        const programEnd =
          parseDate(
            program.endTime
          ) ||
          parseDate(
            program.startTime
          )


        if (
          !programEnd ||
          programEnd.getTime() <
            now.getTime()
        ) {
          return
        }


        matchedEventCount +=
          1


        const key =
          branch.branchCode


        const programs =
          programsByBranchCode.get(
            key
          ) ||
          []


        programs.push(
          program
        )


        programsByBranchCode.set(
          key,
          programs
        )
      }
    )


  let upcomingProgramCount =
    0


  const records =
    physicalBranches.map(
      (branch) => {
        const programs =
          (
            programsByBranchCode.get(
              branch.branchCode
            ) ||
            []
          )
            .sort(
              (
                a,
                b
              ) =>
                new Date(
                  a.startTime
                ) -
                new Date(
                  b.startTime
                )
            )
            .filter(
              (
                program,
                index,
                all
              ) => {
                const identity =
                  program.eventId ||
                  (
                    program.title +
                    '|' +
                    program.startTime
                  )


                return all.findIndex(
                  (candidate) =>
                    (
                      candidate.eventId ||
                      (
                        candidate.title +
                        '|' +
                        candidate.startTime
                      )
                    ) ===
                    identity
                ) ===
                  index
              }
            )
            .slice(
              0,
              UPCOMING_LIMIT
            )


        upcomingProgramCount +=
          programs.length


        const branchCode =
          cleanText(
            branch.branchCode
          )


        const externalId =
          `tpl-branch-${branchCode}`


        const website =
          cleanText(
            branch.website
          )


        return {
          externalId,

          city:
            'toronto',

          type:
            'new',

          newType:
            'events',

          category:
            'library',

          communityType:
            'library',

          communitySource:
            COMMUNITY_SOURCE_KEY,

          eventPinIcon:
            'library',

          title:
            branchTitle(
              branch.name
            ),

          description:
            'Official Toronto Public Library branch.',

          location:
            branch.address,

          address:
            branch.address,

          postalCode:
            branch.postalCode ||
            '',

          neighbourhood:
            branch.neighbourhood ||
            '',

          telephone:
            branch.telephone ||
            '',

          latitude:
            branch.latitude,

          longitude:
            branch.longitude,

          status:
            'open',

          active:
            true,

          lifecycleOverride:
            'keep-live',

          source:
            TPL_SOURCE,

          sourceUrl:
            website ||
            BRANCH_DATASET_PAGE,

          sources: [
            {
              name:
                'Toronto Public Library',

              url:
                website ||
                TPL_EVENTS_PAGE,
            },
            {
              name:
                'Toronto Open Data · Programs',

              url:
                EVENTS_DATASET_PAGE,
            },
          ],

          attribution:
            'Contains information licensed under the Open Government Licence – Toronto.',

          tplBranchCode:
            branchCode,

          upcomingPrograms:
            programs,
        }
      }
    )


  return {
    records,

    matchedEventCount,

    upcomingProgramCount,
  }
}


async function loadOfficialData() {
  let branches =
    []


  let events =
    []


  try {
    const resources =
      await getResourceUrls()


    const [
      branchesPayload,
      eventsPayload,
    ] =
      await Promise.all([
        fetchJson(
          resources.branchesUrl,
          'TPL branch data'
        ),

        fetchJson(
          resources.eventsUrl,
          'TPL events data'
        ),
      ])


    branches =
      parseBranchRows(
        branchesPayload
      )


    events =
      extractRows(
        eventsPayload
      )
  }
  catch (
    error
  ) {
    console.warn(
      'TPL COMMUNITY · CKAN JSON FALLBACK:',
      error
    )


    const [
      branchesKml,
      eventsPayload,
    ] =
      await Promise.all([
        fetchText(
          FALLBACK_BRANCHES_KML_URL,
          'TPL branch KML fallback'
        ),

        fetchJson(
          FALLBACK_EVENTS_URL,
          'TPL events JSON fallback'
        ),
      ])


    branches =
      parseBranchKml(
        branchesKml
      )


    events =
      extractRows(
        eventsPayload
      )
  }


  if (
    branches.length <
      MIN_EXPECTED_PHYSICAL_BRANCHES
  ) {
    throw new Error(
      `TPL branch sanity check failed: only ${branches.length} physical branches were parsed.`
    )
  }


  return {
    branches,
    events,
  }
}


function recordIdentity(
  record
) {
  const externalId =
    cleanText(
      record?.externalId
    )


  return externalId
    ? `external:${externalId}`
    : ''
}


function existingWasManuallyHidden(
  existing
) {
  if (
    existing?.active !==
      false
  ) {
    return false
  }


  const reason =
    cleanText(
      existing?.archiveReason
    )
      .toLowerCase()


  return !reason.startsWith(
    'tpl-'
  )
}


async function writeTplRecord({
  record,
  existing =
    null,
}) {
  const now =
    new Date()
      .toISOString()


  const identity =
    recordIdentity(
      record
    )


  const keepHidden =
    existingWasManuallyHidden(
      existing
    )


  const active =
    keepHidden
      ? false
      : true


  const nextRecord = {
    ...existing,
    ...record,

    id:
      existing?.id ||
      (
        'server-new-events-tpl-' +
        slugify(
          record.tplBranchCode ||
          record.title
        )
      ),

    active,

    firstPublishedAt:
      existing?.firstPublishedAt ||
      existing?.publishedAt ||
      now,

    publishedAt:
      existing?.publishedAt ||
      now,

    serverPublishedAt:
      existing?.serverPublishedAt ||
      now,

    serverUpdatedAt:
      now,

    updatedAt:
      now,

    archivedAt:
      active
        ? ''
        : (
            existing?.archivedAt ||
            now
          ),

    archiveReason:
      active
        ? ''
        : (
            existing?.archiveReason ||
            'removed-from-live-map'
          ),
  }


  return upsertGeographicPin({
    city:
      'toronto',

    type:
      'new',

    subtype:
      'events',

    identity,

    previousIdentity:
      existing
        ? recordIdentity(
            existing
          )
        : '',

    record:
      nextRecord,
  })
}


async function archiveMissingTplRecord(
  existing
) {
  const now =
    new Date()
      .toISOString()


  const identity =
    recordIdentity(
      existing
    )


  if (
    !identity ||
    existing?.active ===
      false
  ) {
    return existing
  }


  return upsertGeographicPin({
    city:
      'toronto',

    type:
      'new',

    subtype:
      'events',

    identity,

    previousIdentity:
      identity,

    record: {
      ...existing,

      active:
        false,

      archivedAt:
        now,

      archiveReason:
        'tpl-branch-not-in-current-feed',

      serverUpdatedAt:
        now,

      updatedAt:
        now,
    },
  })
}


export async function syncTplCommunity() {
  if (
    syncPromise
  ) {
    return syncPromise
  }


  syncPromise =
    (async () => {
      const attemptAt =
        new Date()
          .toISOString()


      lastStatus = {
        ...lastStatus,

        syncing:
          true,

        lastAttemptAt:
          attemptAt,

        error:
          '',
      }


      try {
        const {
          branches,
          events,
        } =
          await loadOfficialData()


        const built =
          buildTplCommunityRecords({
            branches,
            events,
          })


        const existingRecords =
          await getGeographicPins({
            city:
              'toronto',

            type:
              'new',

            subtype:
              'events',

            status:
              'all',
          })


        const existingTpl =
          existingRecords.filter(
            (record) =>
              record?.communitySource ===
                COMMUNITY_SOURCE_KEY ||
              cleanText(
                record?.externalId
              )
                .startsWith(
                  'tpl-branch-'
                )
          )


        const existingByExternalId =
          new Map(
            existingTpl.map(
              (record) => [
                cleanText(
                  record.externalId
                ),
                record,
              ]
            )
          )


        const incomingIds =
          new Set()


        for (
          const record of
          built.records
        ) {
          incomingIds.add(
            record.externalId
          )


          await writeTplRecord({
            record,

            existing:
              existingByExternalId.get(
                record.externalId
              ) ||
              null,
          })
        }


        let archivedCount =
          0


        for (
          const existing of
          existingTpl
        ) {
          if (
            !incomingIds.has(
              cleanText(
                existing.externalId
              )
            )
          ) {
            const archived =
              await archiveMissingTplRecord(
                existing
              )


            if (
              archived
            ) {
              archivedCount +=
                1
            }
          }
        }


        const successAt =
          new Date()
            .toISOString()


        lastStatus = {
          ok:
            true,

          syncing:
            false,

          lastAttemptAt:
            attemptAt,

          lastSuccessAt:
            successAt,

          branchCount:
            built.records.length,

          matchedEventCount:
            built.matchedEventCount,

          upcomingProgramCount:
            built.upcomingProgramCount,

          archivedCount,

          error:
            '',
        }


        console.log(
          'TPL COMMUNITY · SYNCED',
          lastStatus
        )


        return lastStatus
      }
      catch (
        error
      ) {
        lastStatus = {
          ...lastStatus,

          ok:
            false,

          syncing:
            false,

          error:
            String(
              error?.message ||
              error
            ),
        }


        console.error(
          'TPL COMMUNITY · SYNC FAILED:',
          error
        )


        throw error
      }
    })()


  try {
    return await syncPromise
  }
  finally {
    syncPromise =
      null
  }
}


function sendJson(
  res,
  status,
  value
) {
  res.statusCode =
    status


  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  )


  res.setHeader(
    'Cache-Control',
    'no-store'
  )


  res.end(
    JSON.stringify(
      value
    )
  )
}


export function tplCommunityFeed() {
  return {
    name:
      'toronto-tpl-community',


    configureServer(
      server
    ) {
      const runScheduledSync =
        () => {
          syncTplCommunity()
            .catch(
              () => {}
            )
        }


      runScheduledSync()


      const interval =
        setInterval(
          runScheduledSync,
          SYNC_INTERVAL_MS
        )


      interval.unref?.()


      server.httpServer?.once(
        'close',
        () => {
          clearInterval(
            interval
          )
        }
      )


      server.middlewares.use(
        STATUS_PATH,
        (
          req,
          res,
          next
        ) => {
          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'GET'
          ) {
            next()

            return
          }


          sendJson(
            res,
            200,
            {
              ...lastStatus,

              source:
                TPL_SOURCE,

              refreshMinutes:
                SYNC_INTERVAL_MS /
                60000,

              upcomingLimit:
                UPCOMING_LIMIT,
            }
          )
        }
      )


      server.middlewares.use(
        SYNC_PATH,
        async (
          req,
          res,
          next
        ) => {
          if (
            String(
              req.method ||
              'GET'
            )
              .toUpperCase() !==
              'POST'
          ) {
            next()

            return
          }


          try {
            const status =
              await syncTplCommunity()


            sendJson(
              res,
              200,
              status
            )
          }
          catch (
            error
          ) {
            sendJson(
              res,
              502,
              {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              }
            )
          }
        }
      )
    },
  }
}
