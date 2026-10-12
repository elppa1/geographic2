import https from 'node:https'


const TTC_ALERTS_UPSTREAM =
  'https://alerts.ttc.ca/api/alerts/live-alerts'


const TTC_ALERTS_ENDPOINT =
  '/api/geographic/toronto/ttc/alerts'


const FETCH_TIMEOUT_MS =
  20 * 1000


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
      /\u00a0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


// ============================================================
// NUMBERS / TIME
// ============================================================

function numberOrNull(
  value
) {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ''
  ) {
    return null
  }


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


function dateToUnixSeconds(
  value
) {
  const clean =
    cleanText(
      value
    )


  if (
    !clean ||
    clean.startsWith(
      '0001-'
    )
  ) {
    return null
  }


  const parsed =
    new Date(
      clean
    )


  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null
  }


  return Math.floor(
    parsed.getTime() /
    1000
  )
}


// ============================================================
// TTC API NORMALIZATION
// ============================================================

function routeIds(
  record
) {
  const raw =
    cleanText(
      record?.route
    )


  if (
    !raw
  ) {
    return []
  }


  return raw
    .split(
      ','
    )
    .map(
      cleanText
    )
    .filter(
      Boolean
    )
}


function normalizeActivePeriod(
  record
) {
  const periods =
    []


  const appendPeriod =
    (
      startValue,
      endValue
    ) => {
      const start =
        dateToUnixSeconds(
          startValue
        )


      const end =
        dateToUnixSeconds(
          endValue
        )


      if (
        start ===
          null &&
        end ===
          null
      ) {
        return
      }


      periods.push({
        start,
        end,
      })
    }


  appendPeriod(
    record?.activePeriod?.start,
    record?.activePeriod?.end
  )


  const childAlerts =
    Array.isArray(
      record?.childAlerts
    )
      ? record.childAlerts
      : []


  for (
    const child
    of childAlerts
  ) {
    appendPeriod(
      child?.startTime ||
      child?.activePeriod?.start,
      child?.endTime ||
      child?.activePeriod?.end
    )
  }


  return periods
}


function normalizeVisibilityPeriods(
  record
) {
  const childAlerts =
    Array.isArray(
      record?.childAlerts
    )
      ? record.childAlerts
      : []


  const childPeriods =
    childAlerts
      .map(
        (
          child
        ) => ({
          start:
            dateToUnixSeconds(
              child?.startTime ||
              child?.activePeriod?.start
            ),

          end:
            dateToUnixSeconds(
              child?.endTime ||
              child?.activePeriod?.end
            ),
        })
      )
      .filter(
        (
          period
        ) =>
          period.start !==
            null ||
          period.end !==
            null
      )


  if (
    childPeriods.length >
      0
  ) {
    return childPeriods
  }


  const parentStart =
    dateToUnixSeconds(
      record?.activePeriod?.start
    )


  const parentEnd =
    dateToUnixSeconds(
      record?.activePeriod?.end
    )


  if (
    parentStart ===
      null &&
    parentEnd ===
      null
  ) {
    return []
  }


  return [
    {
      start:
        parentStart,

      end:
        parentEnd,
    },
  ]
}


// The upstream live-alerts API includes a separate inventory of persistent
// subway Reduced Speed Zones (RSZ). TTC displays those on its RSZ page,
// not in the short-term Service Alerts section. Do not queue them as NEWS.
// Use source metadata rather than filtering genuine short-term DELAY alerts.
function isReducedSpeedZoneRecord(
  record
) {
  const type =
    cleanText(record?.alertType)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')

  if (
    type === 'rsz' ||
    type === 'reducedspeedzone' ||
    type === 'reducedspeedzones' ||
    type === 'sloworder' ||
    type === 'sloworders'
  ) {
    return true
  }

  return [
    record?.rszLength,
    record?.trackPercent,
    record?.reducedSpeed,
    record?.averageSpeed,
    record?.targetRemoval,
  ].some((value) =>
    value !== null &&
    value !== undefined &&
    value !== ''
  )
}


function ttcAlertIsStillRelevant(
  record,
  nowUnixSeconds
) {
  // This feed powers the TTC website's current-alerts listing, but its
  // payload also includes upcoming and previously scheduled disruptions.
  // The TTC-owned "Current" group, not the parent/child schedule clocks,
  // is the authoritative membership test for the LIVE newsroom.
  // A current alert may have contradictory schedule windows (Line 2, 77820).
  // Do not fall back to dates or missing grouping: that re-queues old notices.
  const groups =
    Array.isArray(record?.activePeriodGroup)
      ? record.activePeriodGroup
      : [record?.activePeriodGroup]

  // TTC sometimes combines labels in one value, e.g. "Current, Weekend".
  // Match "Current" as a whole token, not a substring of "Upcoming".
  return groups.some(
    (value) =>
      cleanText(value).split(',').some(
        (part) => part.trim().toLowerCase() === 'current'
      )
  )
}


function normalizeTtcApiAlert(
  record
) {
  if (
    !record ||
    typeof record !==
      'object'
  ) {
    return null
  }


  const id =
    cleanText(
      record?.id
    )


  if (
    !id
  ) {
    return null
  }


  const routes =
    routeIds(
      record
    )


  const headerText =
    cleanText(
      record?.headerText ||
      record?.customHeaderText ||
      record?.title
    )


  const descriptionText =
    cleanText(
      record?.description ||
      record?.title ||
      record?.headerText
    )


  const effect =
    cleanText(
      record?.effect ||
      record?.effectDesc
    )


  const cause =
    cleanText(
      record?.cause ||
      record?.causeDescription
    )


  return {
    id,

    headerText,

    descriptionText,

    url:
      cleanText(
        record?.url
      ),

    cause,

    effect,

    activePeriods:
      normalizeActivePeriod(
        record
      ),

    // The TTC live-alert API can keep a planned alert in the payload for
    // several days while childAlerts define the actual live windows shown
    // to riders. Public-map visibility follows those child windows when
    // present; otherwise it follows the parent activePeriod.
    visibilityPeriods:
      normalizeVisibilityPeriods(
        record
      ),

    // This is TTC's present/upcoming grouping, distinct from alertType.
    // A "Planned" alert can belong to the "Current" group once active.
    activePeriodGroup:
      (
        Array.isArray(record?.activePeriodGroup)
          ? record.activePeriodGroup
          : [record?.activePeriodGroup]
      )
        .map(cleanText)
        .filter(Boolean),

    informedEntities:
      routes.map(
        (
          routeId
        ) => ({
          agencyId:
            'TTC',

          routeId,

          routeType:
            cleanText(
              record?.routeType
            ) ||
            null,

          stopId:
            cleanText(
              record?.stopStartId
            ),

          trip: {
            tripId:
              '',

            routeId,

            directionId:
              record?.direction ??
              null,
          },
        })
      ),

    lastUpdated:
      cleanText(
        record?.lastUpdated
      ),

    alertType:
      cleanText(
        record?.alertType
      ),

    routeType:
      cleanText(
        record?.routeType
      ),

    direction:
      cleanText(
        record?.direction
      ),

    stopStart:
      cleanText(
        record?.stopStart
      ),

    stopEnd:
      cleanText(
        record?.stopEnd
      ),

    stopStartId:
      cleanText(
        record?.stopStartId
      ),

    stopEndId:
      cleanText(
        record?.stopEndId
      ),

    stops:
      (
        Array.isArray(
          record?.stops
        )
          ? record.stops
          : []
      )
        .map(
          cleanText
        )
        .filter(
          Boolean
        ),

    stopIDList:
      (
        Array.isArray(
          record?.stopIDList
        )
          ? record.stopIDList
          : []
      )
        .map(
          cleanText
        )
        .filter(
          Boolean
        ),

    shuttleType:
      cleanText(
        record?.shuttleType
      ),

    shuttleStart:
      cleanText(
        record?.shuttleStart
      ),

    shuttleEnd:
      cleanText(
        record?.shuttleEnd
      ),
  }
}


function extractAlertList(
  payload
) {
  if (
    Array.isArray(
      payload
    )
  ) {
    return payload
  }


  if (
    !payload ||
    typeof payload !==
      'object'
  ) {
    return []
  }


  const preferredKeys = [
    'alerts',
    'liveAlerts',
    'data',
    'results',
  ]


  for (
    const key
    of preferredKeys
  ) {
    if (
      Array.isArray(
        payload[
          key
        ]
      )
    ) {
      return payload[
        key
      ]
    }
  }


  for (
    const value
    of Object.values(
      payload
    )
  ) {
    if (
      Array.isArray(
        value
      ) &&
      value.some(
        (
          item
        ) =>
          item &&
          typeof item ===
            'object' &&
          (
            item.id !==
              undefined ||
            item.effect !==
              undefined ||
            item.headerText !==
              undefined
          )
      )
    ) {
      return value
    }
  }


  return []
}


// ============================================================
// FETCH JSON
// ============================================================

function fetchJson(
  url
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let settled =
        false


      const finishReject =
        (
          error
        ) => {
          if (
            settled
          ) {
            return
          }


          settled =
            true


          reject(
            error
          )
        }


      const finishResolve =
        (
          value
        ) => {
          if (
            settled
          ) {
            return
          }


          settled =
            true


          resolve(
            value
          )
        }


      const request =
        https.get(
          url,
          {
            autoSelectFamily:
              true,

            autoSelectFamilyAttemptTimeout:
              1000,

            headers: {
              Accept:
                'application/json',

              'User-Agent':
                'ELPPA-Geographic/1.0',
            },
          },
          (
            response
          ) => {
            const statusCode =
              Number(
                response.statusCode ||
                0
              )


            if (
              statusCode <
                200 ||
              statusCode >=
                300
            ) {
              response.resume()


              finishReject(
                new Error(
                  (
                    'TTC ALERTS REQUEST FAILED · ' +
                    statusCode
                  )
                )
              )


              return
            }


            const chunks =
              []


            response.on(
              'data',
              (
                chunk
              ) => {
                chunks.push(
                  chunk
                )
              }
            )


            response.on(
              'end',
              () => {
                try {
                  const raw =
                    Buffer.concat(
                      chunks
                    )
                      .toString(
                        'utf8'
                      )


                  finishResolve(
                    JSON.parse(
                      raw
                    )
                  )
                }
                catch (
                  error
                ) {
                  finishReject(
                    new Error(
                      (
                        'TTC ALERTS JSON PARSE FAILED · ' +
                        (
                          error?.message ||
                          error
                        )
                      )
                    )
                  )
                }
              }
            )


            response.on(
              'error',
              finishReject
            )
          }
        )


      const timeoutId =
        setTimeout(
          () => {
            request.destroy(
              new Error(
                (
                  'TTC ALERTS REQUEST TIMED OUT AFTER ' +
                  FETCH_TIMEOUT_MS +
                  'MS'
                )
              )
            )
          },
          FETCH_TIMEOUT_MS
        )


      request.on(
        'error',
        (
          error
        ) => {
          clearTimeout(
            timeoutId
          )


          finishReject(
            error
          )
        }
      )


      request.on(
        'close',
        () => {
          clearTimeout(
            timeoutId
          )
        }
      )
    }
  )
}


// ============================================================
// REUSABLE SNAPSHOT
// ============================================================

export async function fetchTtcAlertsFeed() {
  return fetchJson(
    TTC_ALERTS_UPSTREAM
  )
}


export async function getTtcAlertsSnapshot() {
  const payload =
    await fetchTtcAlertsFeed()


  const rawRecords =
    extractAlertList(
      payload
    )


  // Never treat a non-empty TTC payload as an empty current-alert feed.
  // A changed API response shape must not expire real newsroom alerts.
  if (
    !Array.isArray(payload?.routes) ||
    (
      rawRecords.length === 0 &&
      Number(payload?.total) > 0
    )
  ) {
    throw new Error(
      'TTC live-alert response contained records but could not be parsed'
    )
  }

  const nowUnixSeconds =
    Math.floor(
      Date.now() /
      1000
    )


  const records =
    rawRecords
      .filter(
        (record) => !isReducedSpeedZoneRecord(record)
      )
      .map(
        normalizeTtcApiAlert
      )
      .filter(
        Boolean
      )
      .filter(
        (
          record
        ) =>
          ttcAlertIsStillRelevant(
            record,
            nowUnixSeconds
          )
      )


  return {
    ok:
      true,

    source:
      'Toronto Transit Commission Live Service Alerts',

    upstream:
      TTC_ALERTS_UPSTREAM,

    updatedAt:
      new Date()
        .toISOString(),

    feedTimestamp:
      null,

    count:
      records.length,

    records,
  }
}


// ============================================================
// RESPONSE
// ============================================================

function sendJson(
  res,
  statusCode,
  payload
) {
  res.statusCode =
    statusCode


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
      payload
    )
  )
}


// ============================================================
// VITE PLUGIN
// ============================================================

export function ttcAlertsFeed() {
  return {
    name:
      'geographic-ttc-alerts-feed',


    configureServer(
      server
    ) {
      server.middlewares.use(
        TTC_ALERTS_ENDPOINT,
        async (
          req,
          res,
          next
        ) => {
          if (
            req.method !==
              'GET'
          ) {
            next()
            return
          }


          try {
            const payload =
              await getTtcAlertsSnapshot()


            sendJson(
              res,
              200,
              payload
            )
          }
          catch (
            error
          ) {
            console.error(
              'TTC ALERTS FEED ERROR:',
              error
            )


            sendJson(
              res,
              502,
              {
                ok:
                  false,

                count:
                  0,

                records:
                  [],

                error:
                  error?.message ||
                  'TTC alerts unavailable',
              }
            )
          }
        }
      )
    },
  }
}