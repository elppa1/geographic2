const TORONTO_NOTICE_ENDPOINT =
  '/toronto-feed/nm/api/individual/notice'


// ============================================================
// TEXT
// ============================================================

function cleanText(
  value
) {
  return String(
    value ??
    ''
  )
    .replace(
      /<[^>]*>/g,
      ' '
    )
    .replace(
      /&nbsp;/gi,
      ' '
    )
    .replace(
      /&amp;/gi,
      '&'
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// DATE
// ============================================================

function normalizeDate(
  value
) {
  if (
    !value
  ) {
    return ''
  }


  const date =
    new Date(
      value
    )


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return ''
  }


  return date
    .toISOString()
    .slice(
      0,
      10
    )
}


// ============================================================
// OBJECT SEARCH
// ============================================================

function findValue(
  object,
  keys
) {
  if (
    !object ||
    typeof object !==
      'object'
  ) {
    return ''
  }


  for (
    const key of
    keys
  ) {
    const value =
      object[
        key
      ]


    if (
      value !==
        undefined &&
      value !==
        null &&
      value !==
        ''
    ) {
      return value
    }
  }


  return ''
}


// ============================================================
// ARRAY SEARCH
// ============================================================

function findArray(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value
  }


  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return []
  }


  const preferredKeys = [
    'notices',
    'notice',
    'results',
    'result',
    'items',
    'data',
    'records',
    'rows',
  ]


  for (
    const key of
    preferredKeys
  ) {
    if (
      Array.isArray(
        value[
          key
        ]
      )
    ) {
      return value[
        key
      ]
    }
  }


  for (
    const nestedValue of
    Object.values(
      value
    )
  ) {
    if (
      Array.isArray(
        nestedValue
      )
    ) {
      return nestedValue
    }
  }


  return []
}


// ============================================================
// NOTICE ID
// ============================================================

function getNoticeId(
  notice
) {
  return cleanText(
    findValue(
      notice,
      [
        'id',
        'noticeId',
        'noticeID',
        'notice_id',
        'NOTICE_ID',
      ]
    )
  )
}


// ============================================================
// TITLE
// ============================================================

function getTitle(
  notice
) {
  return cleanText(
    findValue(
      notice,
      [
        'title',
        'noticeTitle',
        'notice_title',
        'subject',
        'name',
        'heading',
      ]
    )
  )
}


// ============================================================
// DESCRIPTION
// ============================================================

function getDescription(
  notice
) {
  return cleanText(
    findValue(
      notice,
      [
        'description',
        'noticeDescription',
        'notice_description',
        'summary',
        'body',
        'content',
        'details',
      ]
    )
  )
}


// ============================================================
// DATE
// ============================================================

function getDate(
  notice
) {
  return normalizeDate(
    findValue(
      notice,
      [
        'date',
        'noticeDate',
        'notice_date',
        'publishedAt',
        'publishedDate',
        'publicationDate',
        'createdAt',
        'createdDate',
      ]
    )
  )
}


// ============================================================
// LOCATION
// ============================================================

function getDirectLocation(
  notice
) {
  return cleanText(
    findValue(
      notice,
      [
        'location',
        'address',
        'siteAddress',
        'site_address',
        'propertyAddress',
        'property_address',
      ]
    )
  )
}


// ============================================================
// APPLICATION NUMBER PATTERN
// ============================================================

const APPLICATION_NUMBER_PATTERN =
  /\b\d{2}\s+\d{6}\s+(?:STE|NNY|ESC|WET|CPS)\s+\d{2}\s+[A-Z]{2}\b/gi


// ============================================================
// APPLICATION NUMBERS
// ============================================================

function extractPlanningApplicationNumbers(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    !text
  ) {
    return []
  }


  const matches =
    text.match(
      APPLICATION_NUMBER_PATTERN
    ) ||
    []


  return [
    ...new Set(
      matches.map(
        (match) =>
          cleanText(
            match
          )
            .toUpperCase()
      )
    ),
  ]
}


// ============================================================
// GET ALL APPLICATION NUMBERS
// ============================================================

function getPlanningApplicationNumbers(
  notice
) {
  const values = [
    findValue(
      notice,
      [
        'applicationNumber',
        'application_number',
        'applicationNo',
        'application_no',
      ]
    ),

    getTitle(
      notice
    ),

    getDescription(
      notice
    ),
  ]


  const numbers =
    []


  values.forEach(
    (value) => {
      numbers.push(
        ...extractPlanningApplicationNumbers(
          value
        )
      )
    }
  )


  return [
    ...new Set(
      numbers
    ),
  ]
}


// ============================================================
// PRIMARY APPLICATION NUMBER
// ============================================================

function getPrimaryPlanningApplicationNumber(
  notice
) {
  return (
    getPlanningApplicationNumbers(
      notice
    )[0] ||
    ''
  )
}


// ============================================================
// APPLICATION YEAR
// ============================================================

function getApplicationYear(
  applicationNumber
) {
  const match =
    String(
      applicationNumber ||
      ''
    )
      .match(
        /^(\d{2})\b/
      )


  if (
    !match
  ) {
    return null
  }


  const shortYear =
    Number(
      match[1]
    )


  if (
    !Number.isFinite(
      shortYear
    )
  ) {
    return null
  }


  return (
    2000 +
    shortYear
  )
}


// ============================================================
// ADDRESS FROM TITLE
// ============================================================

function extractLocationFromTitle(
  title
) {
  const text =
    cleanText(
      title
    )


  if (
    !text
  ) {
    return ''
  }


  const dashParts =
    text.split(
      /\s+-\s+/
    )


  if (
    dashParts.length >
    1
  ) {
    const possibleLocation =
      cleanText(
        dashParts[
          dashParts.length -
          1
        ]
      )


    if (
      /\d/.test(
        possibleLocation
      )
    ) {
      return possibleLocation
    }
  }


  const knownAsMatch =
    text.match(
      /(?:lands?\s+known\s+as|properties?\s+known\s+as)\s+(.+)$/i
    )


  if (
    knownAsMatch?.[1]
  ) {
    return cleanText(
      knownAsMatch[1]
    )
  }


  return ''
}


// ============================================================
// LOCATION
// ============================================================

function getLocation(
  notice
) {
  const direct =
    getDirectLocation(
      notice
    )


  if (
    direct
  ) {
    return direct
  }


  return extractLocationFromTitle(
    getTitle(
      notice
    )
  )
}


// ============================================================
// COORDINATES
// ============================================================

function getCoordinates(
  notice
) {
  const addresses =
    Array.isArray(
      notice?.addressList
    )
      ? notice.addressList
      : []


  for (
    const address of
    addresses
  ) {
    const longitude =
      Number(
        address?.longitudeCoordinate ??
        address?.longitude ??
        address?.lng
      )


    const latitude =
      Number(
        address?.latitudeCoordinate ??
        address?.latitude ??
        address?.lat
      )


    if (
      Number.isFinite(
        longitude
      ) &&
      Number.isFinite(
        latitude
      )
    ) {
      return {
        longitude,
        latitude,
      }
    }
  }


  const longitude =
    Number(
      notice?.longitudeCoordinate ??
      notice?.longitude ??
      notice?.lng
    )


  const latitude =
    Number(
      notice?.latitudeCoordinate ??
      notice?.latitude ??
      notice?.lat
    )


  if (
    Number.isFinite(
      longitude
    ) &&
    Number.isFinite(
      latitude
    )
  ) {
    return {
      longitude,
      latitude,
    }
  }


  return {
    longitude:
      null,

    latitude:
      null,
  }
}


// ============================================================
// NORMALIZED SEARCH TEXT
// ============================================================

function getSearchText(
  notice
) {
  return cleanText(
    (
      getTitle(
        notice
      ) +
      ' ' +
      getDescription(
        notice
      )
    )
  )
    .toLowerCase()
}


// ============================================================
// STRONG DEVELOPMENT TOPICS
// ============================================================

const STRONG_DEVELOPMENT_TOPICS = [
  'official plan amendment',
  'zoning by-law',
  'zoning bylaw',
  'zoning amendment',
  'rezoning',
  'site plan',
  'plan of subdivision',
  'draft plan',
  'development application',
  'development proposal',
  'community planning',
]


// ============================================================
// GENERAL DEVELOPMENT WORDS
// ============================================================

const GENERAL_DEVELOPMENT_WORDS = [
  'development',
  'redevelopment',
  'building',
  'construction',
  'housing',
  'residential',
  'mixed-use',
  'mixed use',
  'condominium',
  'apartment',
  'tower',
  'storey',
  'stories',
  'public space',
  'park',
  'transit',
  'station',
  'street',
  'road',
  'infrastructure',
]


// ============================================================
// ROUTINE APPLICATION WORDS
// ============================================================

const ROUTINE_APPLICATION_WORDS = [
  'committee of adjustment',
  'minor variance',
  'consent application',
  'application for consent',
]


// ============================================================
// MEANINGFUL UPDATE WORDS
// ============================================================

const MEANINGFUL_UPDATE_WORDS = [
  'notice of passing',
  'notice of adoption',
  'notice of approval',
  'notice of refusal',
  'approved',
  'approval',
  'adopted',
  'adoption',
  'passing of zoning',
  'official plan amendment',
  'zoning by-law',
  'zoning bylaw',
]


// ============================================================
// EXCLUDED NON APPLICATION WORDS
// ============================================================

const NON_APPLICATION_EXCLUSIONS = [
  'road closure',
  'temporary road closure',
  'parking prohibition',
  'parking restriction',
  'traffic restriction',
  'special event',
  'public hearing',
  'meeting notice',
  'committee meeting',
  'council meeting',
  'licence',
  'license',
  'tax sale',
  'property tax',
  'watermain flushing',
  'garbage',
  'waste collection',
  'election',
  'nomination',
]


// ============================================================
// INCLUDES ANY
// ============================================================

function includesAny(
  text,
  terms
) {
  return terms.some(
    (term) =>
      text.includes(
        term
      )
  )
}


// ============================================================
// STRONG TOPIC
// ============================================================

function hasStrongDevelopmentTopic(
  notice
) {
  return includesAny(
    getSearchText(
      notice
    ),
    STRONG_DEVELOPMENT_TOPICS
  )
}


// ============================================================
// GENERAL DEVELOPMENT
// ============================================================

function hasGeneralDevelopmentKeyword(
  notice
) {
  return includesAny(
    getSearchText(
      notice
    ),
    GENERAL_DEVELOPMENT_WORDS
  )
}


// ============================================================
// ROUTINE
// ============================================================

function isRoutineApplication(
  notice
) {
  return includesAny(
    getSearchText(
      notice
    ),
    ROUTINE_APPLICATION_WORDS
  )
}


// ============================================================
// MEANINGFUL UPDATE
// ============================================================

function isMeaningfulUpdate(
  notice
) {
  return includesAny(
    getSearchText(
      notice
    ),
    MEANINGFUL_UPDATE_WORDS
  )
}


// ============================================================
// NON APPLICATION EXCLUSION
// ============================================================

function isExcludedNonApplicationNotice(
  notice
) {
  return includesAny(
    getSearchText(
      notice
    ),
    NON_APPLICATION_EXCLUSIONS
  )
}


// ============================================================
// RELEVANT NOTICE
// ============================================================

function isRelevantDevelopmentNotice(
  notice
) {
  if (
    getPlanningApplicationNumbers(
      notice
    )
      .length >
    0
  ) {
    return true
  }


  if (
    hasStrongDevelopmentTopic(
      notice
    )
  ) {
    return true
  }


  if (
    hasGeneralDevelopmentKeyword(
      notice
    )
  ) {
    return true
  }


  return false
}


// ============================================================
// CATEGORY
// ============================================================

function getCategory(
  notice
) {
  const text =
    getSearchText(
      notice
    )


  if (
    text.includes(
      'transit'
    ) ||
    text.includes(
      'subway'
    ) ||
    text.includes(
      'streetcar'
    ) ||
    text.includes(
      'station'
    )
  ) {
    return 'transit'
  }


  if (
    text.includes(
      'housing'
    ) ||
    text.includes(
      'residential'
    ) ||
    text.includes(
      'apartment'
    ) ||
    text.includes(
      'condominium'
    )
  ) {
    return 'housing'
  }


  if (
    text.includes(
      'park'
    ) ||
    text.includes(
      'public space'
    )
  ) {
    return 'public-space'
  }


  if (
    text.includes(
      'construction'
    )
  ) {
    return 'construction'
  }


  return 'development'
}


// ============================================================
// STATUS
// ============================================================

function getStatus(
  notice
) {
  const text =
    getSearchText(
      notice
    )


  if (
    text.includes(
      'refusal'
    ) ||
    text.includes(
      'refused'
    )
  ) {
    return 'cancelled'
  }


  if (
    text.includes(
      'approval'
    ) ||
    text.includes(
      'approved'
    ) ||
    text.includes(
      'adoption'
    ) ||
    text.includes(
      'adopted'
    ) ||
    text.includes(
      'notice of passing'
    )
  ) {
    return 'approved'
  }


  if (
    text.includes(
      'construction'
    )
  ) {
    return 'construction'
  }


  return 'proposed'
}


// ============================================================
// SOURCE URL
// ============================================================

function unwrapSourceUrl(
  value
) {
  const text =
    String(
      value ||
      ''
    )
      .trim()


  const markdownMatch =
    text.match(
      /^\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)$/
    )


  if (
    markdownMatch
  ) {
    return (
      markdownMatch[2] ||
      markdownMatch[1]
    )
  }


  return text
}


function getReferenceUrl(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return ''
  }


  for (
    const item of
    value
  ) {
    const url =
      unwrapSourceUrl(
        item?.url
      )


    if (
      url.startsWith(
        'http://'
      ) ||
      url.startsWith(
        'https://'
      )
    ) {
      return url
    }
  }


  return ''
}


function getSourceUrl(
  notice
) {
  const directUrl =
    unwrapSourceUrl(
      notice.url ||
      notice.sourceUrl ||
      notice.noticeUrl
    )


  if (
    directUrl
  ) {
    return directUrl
  }


  const otherReferenceUrl =
    getReferenceUrl(
      notice.otherReferenceList
    )


  if (
    otherReferenceUrl
  ) {
    return otherReferenceUrl
  }


  const backgroundUrl =
    getReferenceUrl(
      notice.backgroundInformationList
    )


  if (
    backgroundUrl
  ) {
    return backgroundUrl
  }


  return (
    'https://www.toronto.ca/city-government/public-notices-bylaws/'
  )
}


// ============================================================
// EXTERNAL ID
// ============================================================

function createExternalId(
  notice
) {
  const applicationNumber =
    getPrimaryPlanningApplicationNumber(
      notice
    )


  if (
    applicationNumber
  ) {
    const normalizedApplication =
      applicationNumber
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          '-'
        )
        .replace(
          /^-+|-+$/g,
          ''
        )


    return (
      'toronto-planning-' +
      normalizedApplication
    )
  }


  const noticeId =
    getNoticeId(
      notice
    )


  if (
    noticeId
  ) {
    return (
      'toronto-notice-' +
      noticeId
    )
  }


  const title =
    getTitle(
      notice
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )
      .slice(
        0,
        100
      )


  return (
    'toronto-notice-' +
    title
  )
}


// ============================================================
// BUILD RECORD
// ============================================================

function buildRecord(
  notice,
  applicationNumbers = []
) {
  const title =
    getTitle(
      notice
    )


  const description =
    getDescription(
      notice
    )


  const location =
    getLocation(
      notice
    )


  const announcedAt =
    getDate(
      notice
    )


  const coordinates =
    getCoordinates(
      notice
    )


  const planningApplicationNumbers =
    applicationNumbers.length >
    0
      ? applicationNumbers
      : getPlanningApplicationNumbers(
          notice
        )


  return {
    externalId:
      createExternalId(
        notice
      ),

    city:
      'toronto',

    type:
      'new',

    category:
      getCategory(
        notice
      ),

    status:
      getStatus(
        notice
      ),

    title,

    description,

    location,

    intersection:
      location,

    longitude:
      coordinates.longitude,

    latitude:
      coordinates.latitude,

    pinPositionMode:
      'auto',

    searchedLongitude:
      coordinates.longitude,

    searchedLatitude:
      coordinates.latitude,

    source:
      'Toronto Public Notices',

    sourceUrl:
      getSourceUrl(
        notice
      ),

    announcedAt,

    expectedAt:
      '',

    planningApplicationNumber:
      planningApplicationNumbers[0] ||
      '',

    planningApplicationNumbers,

    active:
      true,
  }
}


// ============================================================
// NOTICE TIMESTAMP
// ============================================================

function noticeTimestamp(
  notice
) {
  const date =
    getDate(
      notice
    )


  if (
    !date
  ) {
    return 0
  }


  const timestamp =
    new Date(
      date
    )
      .getTime()


  return Number.isNaN(
    timestamp
  )
    ? 0
    : timestamp
}


// ============================================================
// NEWEST NOTICE
// ============================================================

function newestNotice(
  notices
) {
  return [
    ...notices,
  ]
    .sort(
      (
        a,
        b
      ) =>
        noticeTimestamp(
          b
        ) -
        noticeTimestamp(
          a
        )
    )[0]
}


// ============================================================
// APPLICATION GROUPS
// ============================================================

function groupByApplication(
  notices
) {
  const groups =
    new Map()


  notices.forEach(
    (notice) => {
      const numbers =
        getPlanningApplicationNumbers(
          notice
        )


      numbers.forEach(
        (number) => {
          const key =
            number
              .toUpperCase()


          if (
            !groups.has(
              key
            )
          ) {
            groups.set(
              key,
              {
                applicationNumber:
                  number,

                notices:
                  [],
              }
            )
          }


          groups
            .get(
              key
            )
            .notices
            .push(
              notice
            )
        }
      )
    }
  )


  return groups
}


// ============================================================
// APPLICATION PROJECTS
// ============================================================

function buildApplicationProjects(
  notices
) {
  const groups =
    groupByApplication(
      notices
    )


  const projects =
    []


  let currentYearApplications =
    0


  let olderMeaningfulUpdates =
    0


  let oldRoutineApplicationsFiltered =
    0


  let unknownYearApplications =
    0


  const thisYear =
    new Date()
      .getFullYear()


  groups.forEach(
    (group) => {
      const applicationYear =
        getApplicationYear(
          group.applicationNumber
        )


      const representative =
        newestNotice(
          group.notices
        )


      if (
        !representative
      ) {
        return
      }


      if (
        applicationYear ===
        thisYear
      ) {
        currentYearApplications++


        projects.push(
          buildRecord(
            representative,
            [
              group.applicationNumber,
            ]
          )
        )


        return
      }


      if (
        applicationYear ===
        null
      ) {
        unknownYearApplications++


        projects.push(
          buildRecord(
            representative,
            [
              group.applicationNumber,
            ]
          )
        )


        return
      }


      const meaningful =
        group.notices.filter(
          (notice) =>
            isMeaningfulUpdate(
              notice
            ) &&
            !isRoutineApplication(
              notice
            )
        )


      if (
        meaningful.length >
        0
      ) {
        olderMeaningfulUpdates++


        projects.push(
          buildRecord(
            newestNotice(
              meaningful
            ),
            [
              group.applicationNumber,
            ]
          )
        )


        return
      }


      oldRoutineApplicationsFiltered++
    }
  )


  return {
    projects,

    uniqueApplications:
      groups.size,

    currentYearApplications,

    olderMeaningfulUpdates,

    oldRoutineApplicationsFiltered,

    unknownYearApplications,
  }
}


// ============================================================
// NON APPLICATION PROJECTS
// ============================================================

function buildNonApplicationProjects(
  notices
) {
  const candidates =
    notices.filter(
      (notice) =>
        getPlanningApplicationNumbers(
          notice
        )
          .length ===
        0
    )


  const projects =
    []


  let filtered =
    0


  candidates.forEach(
    (notice) => {
      if (
        isExcludedNonApplicationNotice(
          notice
        )
      ) {
        filtered++


        return
      }


      if (
        !hasStrongDevelopmentTopic(
          notice
        ) &&
        !isMeaningfulUpdate(
          notice
        )
      ) {
        filtered++


        return
      }


      projects.push(
        buildRecord(
          notice
        )
      )
    }
  )


  return {
    candidates:
      candidates.length,

    filtered,

    projects,
  }
}


// ============================================================
// DEDUPE
// ============================================================

function getProjectKey(
  record
) {
  if (
    record.planningApplicationNumber
  ) {
    return (
      'application:' +
      record
        .planningApplicationNumber
        .toUpperCase()
    )
  }


  if (
    record.location
  ) {
    return (
      'location:' +
      record.location
        .toLowerCase()
    )
  }


  return (
    'title:' +
    record.title
      .toLowerCase()
  )
}


function dedupeProjects(
  records
) {
  const seen =
    new Set()


  const output =
    []


  records.forEach(
    (record) => {
      const key =
        getProjectKey(
          record
        )


      if (
        seen.has(
          key
        )
      ) {
        return
      }


      seen.add(
        key
      )


      output.push(
        record
      )
    }
  )


  return output
}


// ============================================================
// FETCH
// ============================================================

async function fetchTorontoNotices() {
  const response =
    await fetch(
      TORONTO_NOTICE_ENDPOINT
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TORONTO NOTICE REQUEST FAILED · ' +
        `${response.status}`
      )
    )
  }


  const text =
    await response.text()


  let payload


  try {
    payload =
      JSON.parse(
        text
      )
  } catch (
    error
  ) {
    console.error(
      'TORONTO NOTICE JSON ERROR:',
      error
    )


    throw new Error(
      'TORONTO NOTICE RESPONSE WAS NOT VALID JSON'
    )
  }


  return findArray(
    payload
  )
}


// ============================================================
// SCRAPER
// ============================================================

export async function scrapeTorontoDevelopments() {
  const notices =
    await fetchTorontoNotices()


  console.log(
    'TORONTO NOTICE ARRAY LENGTH:',
    notices.length
  )


  const relevantNotices =
    notices.filter(
      isRelevantDevelopmentNotice
    )


  console.log(
    'TORONTO RELEVANT DEVELOPMENT NOTICES:',
    relevantNotices.length
  )


  const applicationResult =
    buildApplicationProjects(
      relevantNotices
    )


  console.log(
    'TORONTO UNIQUE APPLICATION PROJECTS:',
    applicationResult
      .uniqueApplications
  )


  console.log(
    'TORONTO APPLICATION PROJECTS SURFACED:',
    applicationResult
      .projects
      .length
  )


  console.log(
    'TORONTO CURRENT-YEAR APPLICATIONS:',
    applicationResult
      .currentYearApplications
  )


  console.log(
    'TORONTO OLDER MEANINGFUL UPDATES:',
    applicationResult
      .olderMeaningfulUpdates
  )


  console.log(
    'TORONTO OLD ROUTINE APPLICATIONS FILTERED:',
    applicationResult
      .oldRoutineApplicationsFiltered
  )


  console.log(
    'TORONTO UNKNOWN-YEAR APPLICATIONS:',
    applicationResult
      .unknownYearApplications
  )


  const nonApplicationResult =
    buildNonApplicationProjects(
      relevantNotices
    )


  console.log(
    'TORONTO NON-APPLICATION CANDIDATES:',
    nonApplicationResult
      .candidates
  )


  console.log(
    'TORONTO NON-APPLICATION PROJECTS FILTERED:',
    nonApplicationResult
      .filtered
  )


  console.log(
    'TORONTO NON-APPLICATION PROJECTS:',
    nonApplicationResult
      .projects
      .length
  )


  const combined =
    [
      ...applicationResult.projects,
      ...nonApplicationResult.projects,
    ]


  const projects =
    dedupeProjects(
      combined
    )


  console.log(
    'TORONTO FINAL GEOGRAPHIC PROJECTS:',
    projects.length
  )


  console.log(
    'TORONTO DUPLICATE / IRRELEVANT NOTICES REMOVED:',
    (
      relevantNotices.length -
      projects.length
    )
  )


  return projects
}