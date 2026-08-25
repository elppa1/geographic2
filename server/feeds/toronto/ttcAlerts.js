import https from 'node:https'

import GtfsRealtimeBindings from 'gtfs-realtime-bindings'


const TTC_ALERTS_UPSTREAM =
  'https://bustime.ttc.ca/gtfsrt/alerts'


const TTC_ALERTS_ENDPOINT =
  '/api/geographic/toronto/ttc/alerts'


const FETCH_TIMEOUT_MS =
  30 * 1000


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
// TRANSLATED STRING
// ============================================================

function translatedText(
  translatedString
) {
  const translations =
    Array.isArray(
      translatedString?.translation
    )
      ? translatedString.translation
      : []


  if (
    translations.length ===
      0
  ) {
    return ''
  }


  const english =
    translations.find(
      (
        item
      ) => {
        const language =
          cleanText(
            item?.language
          )
            .toLowerCase()


        return (
          language ===
            'en' ||
          language.startsWith(
            'en-'
          )
        )
      }
    )


  return cleanText(
    english?.text ||
    translations[0]?.text ||
    ''
  )
}


// ============================================================
// ACTIVE PERIOD
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


function alertIsActiveNow(
  alert,
  nowSeconds
) {
  const periods =
    Array.isArray(
      alert?.activePeriod
    )
      ? alert.activePeriod
      : []


  if (
    periods.length ===
      0
  ) {
    return true
  }


  return periods.some(
    (
      period
    ) => {
      const start =
        numberOrNull(
          period?.start
        )


      const end =
        numberOrNull(
          period?.end
        )


      if (
        start !==
          null &&
        nowSeconds <
          start
      ) {
        return false
      }


      if (
        end !==
          null &&
        nowSeconds >
          end
      ) {
        return false
      }


      return true
    }
  )
}


// ============================================================
// ALERT NORMALIZATION
// ============================================================

function normalizeInformedEntity(
  entity
) {
  return {
    agencyId:
      cleanText(
        entity?.agencyId
      ),

    routeId:
      cleanText(
        entity?.routeId
      ),

    routeType:
      entity?.routeType ??
      null,

    stopId:
      cleanText(
        entity?.stopId
      ),

    trip: {
      tripId:
        cleanText(
          entity?.trip?.tripId
        ),

      routeId:
        cleanText(
          entity?.trip?.routeId
        ),

      directionId:
        entity?.trip?.directionId ??
        null,
    },
  }
}


function normalizeActivePeriod(
  period
) {
  return {
    start:
      numberOrNull(
        period?.start
      ),

    end:
      numberOrNull(
        period?.end
      ),
  }
}


function normalizeAlertEntity(
  entity
) {
  const alert =
    entity?.alert


  if (
    !alert
  ) {
    return null
  }


  return {
    id:
      cleanText(
        entity?.id
      ),

    headerText:
      translatedText(
        alert.headerText
      ),

    descriptionText:
      translatedText(
        alert.descriptionText
      ),

    url:
      translatedText(
        alert.url
      ),

    cause:
      cleanText(
        alert.cause
      ),

    effect:
      cleanText(
        alert.effect
      ),

    activePeriods:
      (
        Array.isArray(
          alert.activePeriod
        )
          ? alert.activePeriod
          : []
      )
        .map(
          normalizeActivePeriod
        ),

    informedEntities:
      (
        Array.isArray(
          alert.informedEntity
        )
          ? alert.informedEntity
          : []
      )
        .map(
          normalizeInformedEntity
        ),
  }
}


// ============================================================
// FETCH + DECODE
// ============================================================

function fetchTtcAlertsBuffer() {
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
          buffer
        ) => {
          if (
            settled
          ) {
            return
          }


          settled =
            true


          resolve(
            buffer
          )
        }


      const request =
        https.get(
          TTC_ALERTS_UPSTREAM,
          {
            autoSelectFamily:
              true,

            autoSelectFamilyAttemptTimeout:
              1000,

            headers: {
              Accept:
                'application/x-protobuf, application/octet-stream, */*',

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
                finishResolve(
                  Buffer.concat(
                    chunks
                  )
                )
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


export async function fetchTtcAlertsFeed() {
  const buffer =
    new Uint8Array(
      await fetchTtcAlertsBuffer()
    )


  const decoded =
    GtfsRealtimeBindings
      .transit_realtime
      .FeedMessage
      .decode(
        buffer
      )


  return GtfsRealtimeBindings
    .transit_realtime
    .FeedMessage
    .toObject(
      decoded,
      {
        longs:
          String,

        enums:
          String,

        bytes:
          String,

        arrays:
          true,

        objects:
          true,
      }
    )
}


// ============================================================
// REUSABLE SNAPSHOT
// ============================================================

export async function getTtcAlertsSnapshot() {
  const feed =
    await fetchTtcAlertsFeed()


  const nowSeconds =
    Math.floor(
      Date.now() /
      1000
    )


  const records =
    (
      Array.isArray(
        feed?.entity
      )
        ? feed.entity
        : []
    )
      .filter(
        (
          entity
        ) =>
          entity?.alert &&
          alertIsActiveNow(
            entity.alert,
            nowSeconds
          )
      )
      .map(
        normalizeAlertEntity
      )
      .filter(
        Boolean
      )


  return {
    ok:
      true,

    source:
      'Toronto Transit Commission GTFS-Realtime Service Alerts',

    upstream:
      TTC_ALERTS_UPSTREAM,

    updatedAt:
      new Date()
        .toISOString(),

    feedTimestamp:
      numberOrNull(
        feed?.header?.timestamp
      ),

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