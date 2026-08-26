import {
  timingSafeEqual,
} from 'node:crypto'

import {
  loadEnv,
} from 'vite'

import {
  queueLiveNewsroomRecord,
} from './liveNewsroom.js'

import {
  getNewsExpiresAt,
} from '../../../src/newsPolicy.js'


// ============================================================
// TORONTO POLICE · INCOMING EMAIL WEBHOOK
// ============================================================
//
// Receives official TPS email alerts forwarded by an external
// email/webhook service.
//
// POST:
//
//   /api/geographic/toronto/police/incoming
//
// GET:
//
//   /api/geographic/toronto/police/incoming
//
// POST accepts:
//
//   application/json
//   application/x-www-form-urlencoded
//   text/plain
//
// Parsed records currently live in memory and are consumed by
// the Geographic Admin NEWSROOM.
//
// IMPORTANT:
//   Incoming TPS email records are NEVER marked for automatic
//   publication by this server. Every record is delivered as a
//   newsroom review item. The admin must approve it before it can
//   become, update, or remove a public NEWS pin.
//
// POST is protected by a server-only webhook secret and strict
// TPS sender-domain validation. When Gmail forwards a TPS email,
// the original TPS sender is validated from the forwarded message
// headers inside the body.
//
// GET remains same-origin readable so the Admin Room can collect
// pending newsroom records.
//
// ============================================================


// ============================================================
// SETTINGS
// ============================================================

const MAX_RECORDS =
  100


const DEFAULT_EXPIRY_HOURS =
  24


const MAX_REQUEST_BYTES =
  256 * 1024


const DEFAULT_ALLOWED_SENDER_DOMAINS = [
  'tps.ca',
  'torontopolice.on.ca',
]


const TPS_NEWS_RELEASES_URL =
  'https://www.tps.ca/media-centre/news-releases/'


let webhookSecret =
  ''


let allowedSenderDomains = [
  ...DEFAULT_ALLOWED_SENDER_DOMAINS,
]


// ============================================================
// TEMPORARY MEMORY STORE
// ============================================================

const recentPoliceRecords =
  []


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
      /\r/g,
      '\n'
    )
    .replace(
      /\n{3,}/g,
      '\n\n'
    )
    .replace(
      /[ \t]+/g,
      ' '
    )
    .trim()
}


// ============================================================
// HTML → TEXT
// ============================================================

function htmlToText(
  value
) {
  return cleanText(
    String(
      value ??
      ''
    )
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ' '
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ' '
      )
      .replace(
        /<br\s*\/?>/gi,
        '\n'
      )
      .replace(
        /<\/p>/gi,
        '\n'
      )
      .replace(
        /<[^>]+>/g,
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
  )
}


// ============================================================
// SLUG
// ============================================================

function slugify(
  value
) {
  return cleanText(
    value
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
}


// ============================================================
// JSON RESPONSE
// ============================================================

function sendJson({
  res,
  status = 200,
  data,
}) {
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
      data,
      null,
      2
    )
  )
}


// ============================================================
// BODY
// ============================================================

async function readRequestBody(
  req
) {
  const chunks =
    []


  let totalBytes =
    0


  for await (
    const chunk of
    req
  ) {
    totalBytes +=
      chunk.length


    if (
      totalBytes >
      MAX_REQUEST_BYTES
    ) {
      const error =
        new Error(
          'REQUEST BODY TOO LARGE'
        )


      error.statusCode =
        413


      throw error
    }


    chunks.push(
      chunk
    )
  }


  return Buffer
    .concat(
      chunks
    )
    .toString(
      'utf8'
    )
}


// ============================================================
// FORM DATA
// ============================================================

function parseFormBody(
  text
) {
  const params =
    new URLSearchParams(
      text
    )


  return Object.fromEntries(
    params.entries()
  )
}


// ============================================================
// REQUEST PAYLOAD
// ============================================================

async function parseRequestPayload(
  req
) {
  const raw =
    await readRequestBody(
      req
    )


  const contentType =
    cleanText(
      req.headers[
        'content-type'
      ]
    )
      .toLowerCase()


  if (
    contentType.includes(
      'application/json'
    )
  ) {
    try {
      return JSON.parse(
        raw ||
        '{}'
      )
    }
    catch {
      throw new Error(
        'INVALID JSON BODY'
      )
    }
  }


  if (
    contentType.includes(
      'application/x-www-form-urlencoded'
    )
  ) {
    return parseFormBody(
      raw
    )
  }


  return {
    body:
      raw,
  }
}


// ============================================================
// FIELD PICKER
// ============================================================
//
// Different webhook/email tools use slightly different names.
//
// This lets us accept:
//   subject
//   Subject
//   email_subject
//   body_plain
//   text
//   etc.
//
// ============================================================

function pickField(
  payload,
  names
) {
  for (
    const name of
    names
  ) {
    const value =
      payload?.[
        name
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


// ============================================================
// NORMALIZE EMAIL
// ============================================================

function normalizeIncomingEmail(
  payload
) {
  const subject =
    cleanText(
      pickField(
        payload,
        [
          'subject',
          'Subject',
          'email_subject',
          'emailSubject',
          'title',
        ]
      )
    )


  const from =
    cleanText(
      pickField(
        payload,
        [
          'from',
          'From',
          'sender',
          'sender_email',
          'senderEmail',
          'from_email',
          'fromEmail',
        ]
      )
    )


  const plainBody =
    cleanText(
      pickField(
        payload,
        [
          'body',
          'Body',
          'body_plain',
          'bodyPlain',
          'plain',
          'text',
          'message',
          'content',
        ]
      )
    )


  const htmlBody =
    pickField(
      payload,
      [
        'html',
        'body_html',
        'bodyHtml',
        'htmlBody',
      ]
    )


  const body =
    plainBody ||
    htmlToText(
      htmlBody
    )


  const receivedAt =
    cleanText(
      pickField(
        payload,
        [
          'date',
          'Date',
          'received_at',
          'receivedAt',
          'timestamp',
          'time',
        ]
      )
    )


  return {
    subject,
    from,
    body,
    receivedAt,
  }
}


// ============================================================
// WEBHOOK SECURITY
// ============================================================

function splitCsv(
  value
) {
  return cleanText(
    value
  )
    .split(
      ','
    )
    .map(
      (
        item
      ) =>
        cleanText(
          item
        )
          .toLowerCase()
    )
    .filter(
      Boolean
    )
}


function getHeaderValue({
  req,
  name,
}) {
  const value =
    req.headers[
      name
    ]


  if (
    Array.isArray(
      value
    )
  ) {
    return cleanText(
      value[0]
    )
  }


  return cleanText(
    value
  )
}


function getPresentedWebhookSecret(
  req
) {
  const direct =
    (
      getHeaderValue({
        req,
        name:
          'x-geographic-webhook-secret',
      }) ||
      getHeaderValue({
        req,
        name:
          'x-tps-webhook-secret',
      })
    )


  if (
    direct
  ) {
    return direct
  }


  const authorization =
    getHeaderValue({
      req,
      name:
        'authorization',
    })


  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    )


  return match
    ? cleanText(
        match[1]
      )
    : ''
}


function secretsMatch({
  expected,
  presented,
}) {
  const expectedBuffer =
    Buffer.from(
      String(
        expected ||
        ''
      )
    )


  const presentedBuffer =
    Buffer.from(
      String(
        presented ||
        ''
      )
    )


  if (
    expectedBuffer.length ===
      0 ||
    expectedBuffer.length !==
      presentedBuffer.length
  ) {
    return false
  }


  return timingSafeEqual(
    expectedBuffer,
    presentedBuffer
  )
}


function webhookIsAuthorized(
  req
) {
  if (
    !webhookSecret
  ) {
    return {
      ok:
        false,

      status:
        503,

      error:
        'TPS webhook secret is not configured',
    }
  }


  const presented =
    getPresentedWebhookSecret(
      req
    )


  if (
    !secretsMatch({
      expected:
        webhookSecret,

      presented,
    })
  ) {
    return {
      ok:
        false,

      status:
        401,

      error:
        'Unauthorized webhook request',
    }
  }


  return {
    ok:
      true,

    status:
      200,

    error:
      '',
  }
}


// ============================================================
// SENDER EMAIL
// ============================================================

function extractSenderEmail(
  value
) {
  const sender =
    cleanText(
      value
    )
      .toLowerCase()


  if (
    !sender
  ) {
    return ''
  }


  const angleMatch =
    sender.match(
      /<\s*([^<>\s]+@[^<>\s]+)\s*>/
    )


  if (
    angleMatch
  ) {
    return angleMatch[1]
      .trim()
  }


  const plainMatch =
    sender.match(
      /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i
    )


  return plainMatch
    ? plainMatch[0]
        .toLowerCase()
        .trim()
    : ''
}


function getSenderDomain(
  value
) {
  const email =
    extractSenderEmail(
      value
    )


  if (
    !email
  ) {
    return ''
  }


  const parts =
    email.split(
      '@'
    )


  return parts[
    parts.length -
    1
  ] || ''
}


// ============================================================
// TRUSTED SENDER
// ============================================================
//
// Sender display names are not trusted.
//
// We extract the actual email address and require its domain to
// match an allowed TPS domain or one of its subdomains. This is
// required because official News Releases arrive from lists.tps.ca.
//
// Default domains:
//
//   tps.ca
//   torontopolice.on.ca
//
// Optional:
//
//   TPS_ALLOWED_SENDER_DOMAINS=domain1,domain2
//
// ============================================================

function isLikelyOfficialTpsSender(
  value
) {
  const domain =
    getSenderDomain(
      value
    )


  if (
    !domain
  ) {
    return false
  }


  return allowedSenderDomains.some(
    (allowedDomain) =>
      domain ===
        allowedDomain ||
      domain.endsWith(
        '.' +
        allowedDomain
      )
  )
}


// ============================================================
// FORWARDED EMAIL HEADERS
// ============================================================
//
// Make receives a forwarded message from the dedicated Gmail
// account, so the transport sender may be Gmail.
//
// The original TPS sender is preserved inside the forwarded
// message body:
//
//   From: Toronto Police Service <...@tps.ca>
//
// We validate that ORIGINAL sender before trusting the record.
//
// ============================================================

function extractForwardedHeader({
  body,
  name,
}) {
  const text =
    String(
      body ??
      ''
    )
      .replace(
        /\r/g,
        '\n'
      )


  const pattern =
    new RegExp(
      (
        '^' +
        name +
        '\\s*:\\s*(.+)$'
      ),
      'im'
    )


  const match =
    text.match(
      pattern
    )


  return match?.[1]
    ? cleanText(
        match[1]
      )
    : ''
}


function getEffectiveTpsSender(
  email
) {
  const forwardedSender =
    extractForwardedHeader({
      body:
        email?.body,
      name:
        'From',
    })


  if (
    forwardedSender &&
    isLikelyOfficialTpsSender(
      forwardedSender
    )
  ) {
    return forwardedSender
  }


  return email?.from ||
    ''
}


// ============================================================
// CLEAN FORWARDED SUBJECT
// ============================================================

function cleanForwardedSubject(
  value
) {
  let subject =
    cleanText(
      value
    )


  while (
    /^(?:fwd?|re)\s*:\s*/i.test(
      subject
    )
  ) {
    subject =
      subject.replace(
        /^(?:fwd?|re)\s*:\s*/i,
        ''
      )
  }


  subject =
    subject.replace(
      /^\[TPS\]\s*-?\s*/i,
      ''
    )


  return subject
    .trim()
}


// ============================================================
// TPS RELEASE METADATA
// ============================================================

function extractTpsMetadataValue({
  value,
  label,
}) {
  const text =
    String(
      value ??
      ''
    )
      .replace(
        /\r/g,
        '\n'
      )


  const escapedLabel =
    String(
      label
    )
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      )


  // TPS plaintext forwarded through Gmail commonly looks like:
  //
  //   *Broadcast time:* 07:23 AM
  //   *Date:* Friday, Aug 21, 2026
  //   *Unit:* 52 Division
  //   *Case #:* 2026-1706054
  //
  // The colon is INSIDE the Markdown emphasis, so accept the
  // closing asterisk after the colon. Plain unformatted lines
  // are accepted too.
  const pattern =
    new RegExp(
      (
        '^\\s*' +
        '(?:\\*{1,2}\\s*)?' +
        escapedLabel +
        '\\s*' +
        ':' +
        '\\s*' +
        '(?:\\*{1,2}\\s*)?' +
        '(.+?)' +
        '\\s*$'
      ),
      'im'
    )


  const match =
    text.match(
      pattern
    )


  return match?.[1]
    ? cleanText(
        match[1]
      )
    : ''
}


function extractReleaseUnit(
  value
) {
  return extractTpsMetadataValue({
    value,
    label:
      'Unit',
  })
}


function extractReleaseCaseNumber(
  value
) {
  const raw =
    (
      extractTpsMetadataValue({
        value,
        label:
          'Case #',
      }) ||
      extractTpsMetadataValue({
        value,
        label:
          'Case Number',
      })
    )


  const match =
    String(
      raw
    )
      .match(
        /\b([0-9]{4}-[0-9]{4,})\b/
      )


  return match?.[1] ||
    ''
}


function extractReleaseBroadcastTime(
  value
) {
  return extractTpsMetadataValue({
    value,
    label:
      'Broadcast time',
  })
}


function extractReleaseDate(
  value
) {
  return extractTpsMetadataValue({
    value,
    label:
      'Date',
  })
}


function getTimeZoneOffsetMilliseconds({
  date,
  timeZone,
}) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hourCycle:
          'h23',
      }
    )


  const parts =
    formatter.formatToParts(
      date
    )


  const values =
    Object.fromEntries(
      parts
        .filter(
          (part) =>
            part.type !==
            'literal'
        )
        .map(
          (part) => [
            part.type,
            Number(
              part.value
            ),
          ]
        )
    )


  const representedAsUtc =
    Date.UTC(
      values.year,
      values.month -
        1,
      values.day,
      values.hour,
      values.minute,
      values.second
    )


  return (
    representedAsUtc -
    date.getTime()
  )
}


function torontoLocalToIso({
  year,
  month,
  day,
  hour,
  minute,
}) {
  const timeZone =
    'America/Toronto'


  const localAsUtc =
    Date.UTC(
      year,
      month -
        1,
      day,
      hour,
      minute,
      0
    )


  // First pass determines the Toronto offset near the requested
  // local wall-clock time.
  const firstOffset =
    getTimeZoneOffsetMilliseconds({
      date:
        new Date(
          localAsUtc
        ),

      timeZone,
    })


  let timestamp =
    localAsUtc -
    firstOffset


  // Second pass handles DST boundaries more reliably.
  const secondOffset =
    getTimeZoneOffsetMilliseconds({
      date:
        new Date(
          timestamp
        ),

      timeZone,
    })


  timestamp =
    localAsUtc -
    secondOffset


  return new Date(
    timestamp
  )
    .toISOString()
}


function parseTpsReleaseTimestamp(
  value
) {
  const releaseDate =
    extractReleaseDate(
      value
    )


  const broadcastTime =
    extractReleaseBroadcastTime(
      value
    )


  if (
    !releaseDate
  ) {
    return ''
  }


  const dateMatch =
    releaseDate.match(
      /\b([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})\b/i
    )


  if (
    !dateMatch
  ) {
    return ''
  }


  const monthNames = {
    jan:
      1,

    feb:
      2,

    mar:
      3,

    apr:
      4,

    may:
      5,

    jun:
      6,

    jul:
      7,

    aug:
      8,

    sep:
      9,

    sept:
      9,

    oct:
      10,

    nov:
      11,

    dec:
      12,
  }


  const monthKey =
    dateMatch[1]
      .toLowerCase()
      .slice(
        0,
        4
      )


  const month =
    monthNames[
      monthKey
    ] ||
    monthNames[
      monthKey.slice(
        0,
        3
      )
    ]


  if (
    !month
  ) {
    return ''
  }


  const year =
    Number(
      dateMatch[3]
    )


  const day =
    Number(
      dateMatch[2]
    )


  let hour =
    0


  let minute =
    0


  if (
    broadcastTime
  ) {
    const timeMatch =
      broadcastTime.match(
        /\b(\d{1,2})\s*:\s*(\d{2})\s*([AP]M)\b/i
      )


    if (
      timeMatch
    ) {
      hour =
        Number(
          timeMatch[1]
        )


      minute =
        Number(
          timeMatch[2]
        )


      const meridiem =
        timeMatch[3]
          .toUpperCase()


      if (
        meridiem ===
          'AM' &&
        hour ===
          12
      ) {
        hour =
          0
      }


      if (
        meridiem ===
          'PM' &&
        hour !==
          12
      ) {
        hour +=
          12
      }
    }
  }


  try {
    return torontoLocalToIso({
      year,
      month,
      day,
      hour,
      minute,
    })
  }
  catch {
    return ''
  }
}


function extractTpsReleaseUrl(
  value
) {
  const text =
    String(
      value ??
      ''
    )


  const matches =
    [
      ...text.matchAll(
        /https?:\/\/(?:www\.)?tps\.ca\/media-centre\/news-releases\/(\d{5,7})\/?/gi
      ),
    ]


  if (
    matches.length >
      0
  ) {
    const releaseId =
      matches[
        matches.length -
        1
      ][1]


    return (
      TPS_NEWS_RELEASES_URL +
      releaseId +
      '/'
    )
  }


  // Some forwarded TPS emails lose the href but retain a standalone
  // numeric release id. Prefer the last plausible id in the message.
  const standaloneIds =
    [
      ...text.matchAll(
        /^\s*(\d{5,7})\s*$/gm
      ),
    ]


  if (
    standaloneIds.length >
      0
  ) {
    const releaseId =
      standaloneIds[
        standaloneIds.length -
        1
      ][1]


    return (
      TPS_NEWS_RELEASES_URL +
      releaseId +
      '/'
    )
  }


  return ''
}


function normalizeReleaseTitleForMatch(
  value
) {
  return cleanText(
    htmlToText(
      value
    )
  )
    .toLowerCase()
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


function releaseTitleScore({
  candidateTitle,
  subject,
}) {
  const candidate =
    normalizeReleaseTitleForMatch(
      candidateTitle
    )


  const target =
    normalizeReleaseTitleForMatch(
      subject
    )


  if (
    !candidate ||
    !target
  ) {
    return 0
  }


  if (
    candidate ===
      target
  ) {
    return 1000
  }


  let score =
    0


  if (
    candidate.includes(
      target
    ) ||
    target.includes(
      candidate
    )
  ) {
    score +=
      500
  }


  const targetWords =
    new Set(
      target
        .split(
          ' '
        )
        .filter(
          (
            word
          ) =>
            word.length >=
              4
        )
    )


  const candidateWords =
    new Set(
      candidate
        .split(
          ' '
        )
        .filter(
          (
            word
          ) =>
            word.length >=
              4
        )
    )


  let shared =
    0


  targetWords.forEach(
    (
      word
    ) => {
      if (
        candidateWords.has(
          word
        )
      ) {
        shared++
      }
    }
  )


  if (
    targetWords.size >
      0
  ) {
    score +=
      Math.round(
        (
          shared /
          targetWords.size
        ) *
        300
      )
  }


  return score
}


function parseTpsSearchCandidates(
  html
) {
  const source =
    String(
      html ??
      ''
    )


  const anchorPattern =
    /<a\b[^>]*href=["']([^"']*\/media-centre\/news-releases\/(\d{5,7})\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi


  const matches =
    []


  let match


  while (
    (
      match =
        anchorPattern.exec(
          source
        )
    )
  ) {
    matches.push({
      index:
        match.index,

      releaseId:
        match[2],

      title:
        htmlToText(
          match[3]
        ),
    })
  }


  const unique =
    []


  const seenIds =
    new Set()


  matches.forEach(
    (
      candidate,
      index
    ) => {
      if (
        seenIds.has(
          candidate.releaseId
        )
      ) {
        return
      }


      seenIds.add(
        candidate.releaseId
      )


      const nextIndex =
        matches[
          index +
          1
        ]?.index ??
        Math.min(
          source.length,
          candidate.index +
            3000
        )


      const context =
        htmlToText(
          source.slice(
            candidate.index,
            nextIndex
          )
        )


      unique.push({
        ...candidate,

        context,

        url:
          (
            TPS_NEWS_RELEASES_URL +
            candidate.releaseId +
            '/'
          ),
      })
    }
  )


  return unique
}


async function searchTpsRelease({
  query,
  incidentNumber,
  subject,
}) {
  const cleanQuery =
    cleanText(
      query
    )


  if (
    !cleanQuery
  ) {
    return ''
  }


  const url =
    new URL(
      TPS_NEWS_RELEASES_URL
    )


  url.searchParams.set(
    'category',
    'news-release'
  )


  url.searchParams.set(
    'q',
    cleanQuery
  )


  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            'text/html,application/xhtml+xml',

          'User-Agent':
            'ELPPA-Geographic/1.0',
        },

        signal:
          AbortSignal.timeout(
            10000
          ),
      }
    )


  if (
    !response.ok
  ) {
    throw new Error(
      (
        'TPS RELEASE SEARCH FAILED · ' +
        response.status
      )
    )
  }


  const html =
    await response.text()


  const candidates =
    parseTpsSearchCandidates(
      html
    )


  if (
    candidates.length ===
      0
  ) {
    return ''
  }


  const incident =
    cleanText(
      incidentNumber
    )


  const ranked =
    candidates
      .map(
        (
          candidate,
          index
        ) => {
          let score =
            releaseTitleScore({
              candidateTitle:
                candidate.title,

              subject,
            })


          if (
            incident &&
            cleanText(
              candidate.context
            )
              .includes(
                incident
              )
          ) {
            score +=
              1000
          }


          // Search results are newest-first. Use page order only as
          // the final tie-breaker after case/title matching.
          score -=
            index


          return {
            ...candidate,
            score,
          }
        }
      )
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )


  return (
    ranked[0]?.url ||
    ''
  )
}


async function resolveTpsReleaseUrl({
  emailBody,
  incidentNumber,
  subject,
}) {
  const direct =
    extractTpsReleaseUrl(
      emailBody
    )


  if (
    direct
  ) {
    return direct
  }


  try {
    if (
      incidentNumber
    ) {
      const byCase =
        await searchTpsRelease({
          query:
            incidentNumber,

          incidentNumber,

          subject,
        })


      if (
        byCase
      ) {
        return byCase
      }
    }


    if (
      subject
    ) {
      const byTitle =
        await searchTpsRelease({
          query:
            subject,

          incidentNumber,

          subject,
        })


      if (
        byTitle
      ) {
        return byTitle
      }
    }
  }
  catch (
    error
  ) {
    console.warn(
      'TPS RELEASE LOOKUP FAILED:',
      String(
        error?.message ||
        error
      )
    )
  }


  return TPS_NEWS_RELEASES_URL
}


// ============================================================
// GEOGRAPHIC HEADLINE
// ============================================================
//
// We publish a short factual Geographic headline instead of
// reproducing TPS's release headline verbatim.
//
// ============================================================

function getGeographicCategoryLabel({
  category,
  subject,
}) {
  const title =
    cleanText(
      subject
    )
      .toLowerCase()


  if (
    category ===
      'wanted'
  ) {
    return 'Wanted person'
  }


  // Use the actual investigation type when TPS gives us one.
  // This makes the map headline useful instead of falling back
  // to a generic "Police update".
  if (
    title.includes(
      'criminal harassment'
    )
  ) {
    return 'Criminal harassment investigation'
  }


  if (
    title.includes(
      'sexual assault'
    )
  ) {
    return 'Sexual assault investigation'
  }


  if (
    title.includes(
      'assault cause bodily harm'
    ) ||
    title.includes(
      'assault causing bodily harm'
    )
  ) {
    return 'Assault investigation'
  }


  if (
    title.includes(
      'break and enter'
    )
  ) {
    return 'Break and enter'
  }


  if (
    title.includes(
      'homicide'
    ) ||
    title.includes(
      'murder'
    )
  ) {
    return 'Homicide investigation'
  }


  if (
    title.includes(
      'arson'
    )
  ) {
    return 'Arson investigation'
  }


  if (
    title.includes(
      'fraud'
    )
  ) {
    return 'Fraud investigation'
  }


  if (
    title.includes(
      'theft'
    )
  ) {
    return 'Theft investigation'
  }


  if (
    category ===
      'event'
  ) {
    return 'Event'
  }


  if (
    category ===
      'break-enter'
  ) {
    return 'Break and enter'
  }


  if (
    category ===
      'mischief'
  ) {
    return 'Mischief'
  }


  if (
    category ===
      'homicide'
  ) {
    return 'Homicide investigation'
  }


  if (
    category ===
      'sexual-assault'
  ) {
    return 'Sexual assault investigation'
  }


  if (
    category ===
      'criminal-harassment'
  ) {
    return 'Criminal harassment investigation'
  }


  if (
    category ===
      'fraud'
  ) {
    return 'Fraud investigation'
  }


  if (
    category ===
      'arson'
  ) {
    return 'Arson investigation'
  }


  if (
    category ===
      'theft'
  ) {
    return 'Theft investigation'
  }


  if (
    category ===
      'collision'
  ) {
    return title.includes(
      'fatal collision'
    )
      ? 'Fatal collision'
      : 'Collision'
  }


  if (
    category ===
      'shooting'
  ) {
    return 'Shooting'
  }


  if (
    category ===
      'missing'
  ) {
    return 'Missing person'
  }


  if (
    category ===
      'located'
  ) {
    return 'Person located'
  }


  if (
    category ===
      'road-closure'
  ) {
    return 'Road closure'
  }


  if (
    category ===
      'stabbing'
  ) {
    return 'Stabbing'
  }


  if (
    category ===
      'robbery'
  ) {
    return 'Robbery'
  }


  if (
    category ===
      'assault'
  ) {
    return 'Assault investigation'
  }


  if (
    title.includes(
      'suspect sought'
    )
  ) {
    return 'Suspect sought'
  }


  if (
    title.includes(
      'arrest'
    ) ||
    title.includes(
      'charged'
    )
  ) {
    return 'Police investigation update'
  }


  return 'Police update'
}


function buildGeographicTitle({
  category,
  subject,
  location,
}) {
  const label =
    getGeographicCategoryLabel({
      category,
      subject,
    })


  if (
    location
  ) {
    return (
      label +
      ' · ' +
      location
    )
  }


  return label
}


// ============================================================
// GEOGRAPHIC FACT SUMMARY
// ============================================================
//
// Important publishing rule:
//
//   We extract facts from the official TPS release, but we do
//   NOT republish the release body.
//
// The public pin gets a short templated summary in Geographic's
// own wording plus clear TPS attribution and a source link.
//
// ============================================================

function extractArrestedPersonDetails(
  value
) {
  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\b([A-Z][A-Za-z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){1,4}),\s*(\d{1,3})(?:,\s*of\s+[^,\n.]+)?\s*,?\s*was arrested and charged\b/i
    )


  return {
    name:
      match?.[1]
        ? cleanText(
            match[1]
          )
        : '',

    age:
      match?.[2]
        ? cleanText(
            match[2]
          )
        : '',
  }
}


function buildGeographicSummary({
  category,
  location,
  subject,
  body,
}) {
  const title =
    cleanText(
      subject
    )
      .toLowerCase()


  const releaseBody =
    cleanText(
      body
    )
      .toLowerCase()


  const place =
    location
      ? (
          ' near ' +
          location
        )
      : ' in Toronto'


  const imageReleased =
    (
      title.includes(
        'image released'
      ) ||
      title.includes(
        'images released'
      )
    )


  const personIdentified =
    (
      title.includes(
        'identified'
      ) &&
      (
        title.includes(
          'update'
        ) ||
        releaseBody.includes(
          'have identified'
        ) ||
        releaseBody.includes(
          'has been identified'
        )
      )
    )


  const arrestUpdate =
    (
      title.includes(
        'arrested'
      ) ||
      title.includes(
        'arrest made'
      )
    )


  const chargeUpdate =
    title.includes(
      'charged'
    )


  const suspectSought =
    (
      title.includes(
        'suspect sought'
      ) ||
      title.includes(
        'wanted'
      ) ||
      releaseBody.includes(
        "requesting the public's assistance with identifying"
      ) ||
      releaseBody.includes(
        'requesting the public’s assistance with identifying'
      )
    )


  let sentence =
    ''


  const followUps =
    []


  // ----------------------------------------------------------
  // WANTED / ELOPEE
  // ----------------------------------------------------------

  if (
    category ===
      'wanted'
  ) {
    const details =
      extractWantedPersonDetails(
        body
      )


    if (
      details.name
    ) {
      sentence =
        (
          'Toronto Police are asking for help locating ' +
          details.name +
          (
            details.age
              ? (
                  ', ' +
                  details.age
                )
              : ''
          ) +
          (
            details.lastSeen
              ? (
                  ', who was last seen ' +
                  details.lastSeen
                )
              : ''
          ) +
          place +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police are asking for help locating a wanted person' +
          place +
          '.'
        )
    }


    if (
      details.warrantOfCommittal
    ) {
      followUps.push(
        'Police say the person is currently bound by a warrant of committal.'
      )
    }


    if (
      details.doNotApproach
    ) {
      followUps.push(
        'TPS advises the public not to approach and to call 911 if the person is located.'
      )
    }
  }

  // ----------------------------------------------------------
  // EVENT / COMMUNITY RELEASES
  // ----------------------------------------------------------

  else if (
    category ===
      'event'
  ) {
    if (
      title.includes(
        'youth in policing initiative'
      ) &&
      title.includes(
        'graduation'
      )
    ) {
      sentence =
        (
          'Toronto Police are holding the Youth in Policing Initiative summer graduation' +
          (
            title.includes(
              'toronto police college'
            )
              ? ' at Toronto Police College'
              : place
          ) +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police announced a public event' +
          place +
          '.'
        )
    }
  }

  // ----------------------------------------------------------
  // SPECIFIC INVESTIGATION TYPES
  // ----------------------------------------------------------

  else if (
    title.includes(
      'mischief'
    )
  ) {
    sentence =
      suspectSought
        ? (
            'Toronto Police are asking for help identifying a suspect in a mischief investigation' +
            place +
            '.'
          )
        : (
            'Toronto Police are investigating mischief' +
            place +
            '.'
          )


    if (
      releaseBody.includes(
        'threw rocks through multiple windows'
      )
    ) {
      followUps.push(
        'Police say the suspect threw rocks through multiple windows at a college campus before leaving the area.'
      )
    }
  }
  else if (
    title.includes(
      'criminal harassment'
    )
  ) {
    if (
      personIdentified
    ) {
      sentence =
        (
          'Toronto Police say the person sought in a criminal harassment investigation' +
          place +
          ' has been identified.'
        )
    }
    else if (
      arrestUpdate ||
      chargeUpdate
    ) {
      sentence =
        (
          'Toronto Police have announced an arrest or charge in a criminal harassment investigation' +
          place +
          '.'
        )
    }
    else if (
      suspectSought
    ) {
      sentence =
        (
          'Toronto Police are asking for help identifying a suspect in a criminal harassment investigation' +
          place +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police are investigating criminal harassment' +
          place +
          '.'
        )
    }
  }
  else if (
    title.includes(
      'break and enter'
    )
  ) {
    const arrestedPerson =
      extractArrestedPersonDetails(
        body
      )


    if (
      arrestUpdate ||
      chargeUpdate
    ) {
      if (
        arrestedPerson.name
      ) {
        sentence =
          (
            'Toronto Police say ' +
            arrestedPerson.name +
            (
              arrestedPerson.age
                ? (
                    ', ' +
                    arrestedPerson.age
                  )
                : ''
            ) +
            ' was arrested and charged in a break and enter investigation' +
            place +
            '.'
          )
      }
      else {
        sentence =
          (
            'Toronto Police have announced an arrest and charges in a break and enter investigation' +
            place +
            '.'
          )
      }


      if (
        releaseBody.includes(
          'recovered'
        ) &&
        (
          releaseBody.includes(
            'stole'
          ) ||
          releaseBody.includes(
            'stolen'
          )
        )
      ) {
        followUps.push(
          'Police say property reported stolen during the break-in was recovered.'
        )
      }
    }
    else if (
      suspectSought
    ) {
      sentence =
        (
          'Toronto Police are asking for help identifying or locating a suspect in a break and enter investigation' +
          place +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police are investigating a break and enter' +
          place +
          '.'
        )
    }
  }
  else if (
    title.includes(
      'sexual assault'
    )
  ) {
    if (
      personIdentified
    ) {
      sentence =
        (
          'Toronto Police say the person sought in a sexual assault investigation' +
          place +
          ' has been identified.'
        )
    }
    else if (
      arrestUpdate ||
      chargeUpdate
    ) {
      sentence =
        (
          'Toronto Police have announced an arrest or charge in a sexual assault investigation' +
          place +
          '.'
        )
    }
    else if (
      suspectSought
    ) {
      sentence =
        (
          'Toronto Police are asking for help identifying or locating a person in connection with a sexual assault investigation' +
          place +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police are investigating a sexual assault' +
          place +
          '.'
        )
    }
  }
  else if (
    title.includes(
      'assault cause bodily harm'
    ) ||
    title.includes(
      'assault causing bodily harm'
    )
  ) {
    if (
      suspectSought
    ) {
      sentence =
        (
          'Toronto Police are asking for help identifying a suspect in an assault investigation' +
          place +
          '.'
        )
    }
    else {
      sentence =
        (
          'Toronto Police are investigating an assault' +
          place +
          '.'
        )
    }
  }

  // ----------------------------------------------------------
  // CATEGORY FALLBACKS
  // ----------------------------------------------------------

  else if (
    category ===
      'collision'
  ) {
    sentence =
      title.includes(
        'fatal collision'
      )
        ? (
            'Toronto Police are investigating a fatal collision' +
            place +
            '.'
          )
        : (
            'Toronto Police are investigating a collision' +
            place +
            '.'
          )
  }
  else if (
    category ===
      'shooting'
  ) {
    sentence =
      (
        'Toronto Police are investigating a shooting' +
        place +
        '.'
      )
  }
  else if (
    category ===
      'missing'
  ) {
    sentence =
      (
        'Toronto Police are asking for help locating a missing person' +
        place +
        '.'
      )
  }
  else if (
    category ===
      'located'
  ) {
    sentence =
      (
        'Toronto Police say a previously reported missing person has been located.'
      )
  }
  else if (
    category ===
      'road-closure'
  ) {
    sentence =
      (
        'Toronto Police reported a road closure' +
        place +
        '.'
      )
  }
  else if (
    category ===
      'stabbing'
  ) {
    sentence =
      (
        'Toronto Police are investigating a stabbing' +
        place +
        '.'
      )
  }
  else if (
    category ===
      'robbery'
  ) {
    sentence =
      (
        'Toronto Police are investigating a robbery' +
        place +
        '.'
      )
  }
  else if (
    category ===
      'assault'
  ) {
    sentence =
      suspectSought
        ? (
            'Toronto Police are asking for help identifying a suspect in an assault investigation' +
            place +
            '.'
          )
        : (
            'Toronto Police are investigating an assault' +
            place +
            '.'
          )
  }
  else if (
    suspectSought
  ) {
    sentence =
      (
        'Toronto Police are asking for help identifying or locating a person connected to an investigation' +
        place +
        '.'
      )
  }
  else if (
    arrestUpdate ||
    chargeUpdate
  ) {
    sentence =
      (
        'Toronto Police have announced an arrest or charge in an investigation' +
        place +
        '.'
      )
  }
  else {
    sentence =
      (
        'Toronto Police issued an investigation update' +
        place +
        '.'
      )
  }


  if (
    imageReleased &&
    !personIdentified &&
    category !==
      'wanted'
  ) {
    followUps.push(
      'TPS has released an image as part of the investigation.'
    )
  }


  if (
    personIdentified
  ) {
    followUps.push(
      'The release is an update to an earlier public appeal.'
    )
  }


  return [
    sentence,
    ...followUps,
  ]
    .filter(
      Boolean
    )
    .join(
      ' '
    )
}


// ============================================================
// INCIDENT CATEGORY
// ============================================================

function getPrimaryIncidentText(
  value
) {
  const text =
    cleanText(
      value
    )


  if (
    !text
  ) {
    return ''
  }


  // Some TPS wanted / elopee releases include a later list of
  // historical "index offences". Those offences are background
  // information and must never determine today's incident type.
  const markers = [
    'he was found not criminally responsible for the index offences',
    'she was found not criminally responsible for the index offences',
    'they were found not criminally responsible for the index offences',
    'index offences of:',
    'index offenses of:',
    'a warrant of committal is issued by',
    'corporate communications for',
  ]


  const lower =
    text.toLowerCase()


  let cutoff =
    text.length


  markers.forEach(
    (marker) => {
      const index =
        lower.indexOf(
          marker
        )


      if (
        index >=
          0 &&
        index <
          cutoff
      ) {
        cutoff =
          index
      }
    }
  )


  return cleanText(
    text.slice(
      0,
      cutoff
    )
  )
}


function classifyIncidentText(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()


  if (
    !text
  ) {
    return ''
  }


  // Resolution has highest priority.
  if (
    text.includes(
      'located:'
    ) ||
    text.includes(
      'located missing'
    ) ||
    text.includes(
      'has been located'
    )
  ) {
    return 'located'
  }


  // "Elopee" is its own current public-safety / wanted-person
  // release type. It must be detected before any historical
  // offence names elsewhere in the release.
  if (
    text.includes(
      'elopee'
    ) ||
    text.includes(
      'warrant of committal'
    ) ||
    text.includes(
      'wanted person'
    ) ||
    text.includes(
      'wanted male'
    ) ||
    text.includes(
      'wanted female'
    )
  ) {
    return 'wanted'
  }


  if (
    text.includes(
      'missing person'
    ) ||
    text.includes(
      'missing:'
    )
  ) {
    return 'missing'
  }


  // TPS also publishes community / public-information releases.
  // These are not investigations and must not fall through to POLICE.
  if (
    text.includes(
      'youth in policing initiative'
    ) ||
    text.includes(
      'summer graduation'
    ) ||
    text.includes(
      'graduation ceremony'
    ) ||
    text.includes(
      'community event'
    ) ||
    text.includes(
      'open house'
    ) ||
    text.includes(
      'media availability'
    ) ||
    text.includes(
      'press conference'
    ) ||
    text.includes(
      'media advisory'
    )
  ) {
    return 'event'
  }


  if (
    text.includes(
      'collision'
    )
  ) {
    return 'collision'
  }


  if (
    text.includes(
      'road closure'
    ) ||
    text.includes(
      'roads closed'
    ) ||
    text.includes(
      'road closed'
    )
  ) {
    return 'road-closure'
  }


  if (
    text.includes(
      'shooting'
    )
  ) {
    return 'shooting'
  }


  if (
    text.includes(
      'stabbing'
    )
  ) {
    return 'stabbing'
  }


  if (
    text.includes(
      'homicide'
    ) ||
    text.includes(
      'murder'
    )
  ) {
    return 'homicide'
  }


  if (
    text.includes(
      'sexual assault'
    )
  ) {
    return 'sexual-assault'
  }


  if (
    text.includes(
      'criminal harassment'
    )
  ) {
    return 'criminal-harassment'
  }


  if (
    text.includes(
      'break and enter'
    )
  ) {
    return 'break-enter'
  }


  if (
    text.includes(
      'mischief'
    )
  ) {
    return 'mischief'
  }


  if (
    text.includes(
      'robbery'
    )
  ) {
    return 'robbery'
  }


  if (
    text.includes(
      'assault'
    )
  ) {
    return 'assault'
  }


  if (
    text.includes(
      'fraud'
    )
  ) {
    return 'fraud'
  }


  if (
    text.includes(
      'arson'
    )
  ) {
    return 'arson'
  }


  if (
    text.includes(
      'theft'
    )
  ) {
    return 'theft'
  }


  if (
    /\bfire\b/i.test(
      text
    )
  ) {
    return 'fire'
  }


  if (
    text.includes(
      'arrest'
    ) ||
    text.includes(
      'charged'
    )
  ) {
    return 'police'
  }


  return ''
}


function getIncidentCategory({
  subject,
  body,
}) {
  // Subject first: TPS release titles are the strongest signal for
  // what the release is actually about.
  const subjectCategory =
    classifyIncidentText(
      subject
    )


  if (
    subjectCategory
  ) {
    return subjectCategory
  }


  // Body second, but only the current-incident portion. This keeps
  // historical offence lists from contaminating classification.
  const primaryBody =
    getPrimaryIncidentText(
      body
    )


  const bodyCategory =
    classifyIncidentText(
      primaryBody
    )


  return bodyCategory ||
    'police'
}


function formatTpsClockTime(
  value
) {
  const compact =
    cleanText(
      value
    )
      .toLowerCase()
      .replace(
        /\./g,
        ''
      )
      .replace(
        /\s+/g,
        ''
      )


  const match =
    compact.match(
      /^(\d{1,2})(?::(\d{2}))?(am|pm)$/
    )


  if (
    !match
  ) {
    return cleanText(
      value
    )
  }


  const hour =
    String(
      Number(
        match[1]
      )
    )


  const minute =
    match[2]
      ? (
          ':' +
          match[2]
        )
      : ''


  const meridiem =
    match[3] ===
      'am'
      ? 'a.m.'
      : 'p.m.'


  return (
    hour +
    minute +
    ' ' +
    meridiem
  )
}


function extractWantedPersonDetails(
  value
) {
  const text =
    cleanText(
      value
    )


  const nameAgeMatch =
    text.match(
      /\b([A-Z][A-Za-z'’.\-]+(?:\s+[A-Z][A-Za-z'’.\-]+){1,4}),\s*(\d{1,3}),\s+was last seen\b/
    )


  const lastSeenMatch =
    text.match(
      /was last seen on\s+([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}),\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?))/i
    )


  const lastSeen =
    lastSeenMatch
      ? (
          'on ' +
          cleanText(
            lastSeenMatch[1]
          ) +
          ' at ' +
          formatTpsClockTime(
            lastSeenMatch[2]
          )
        )
      : ''


  return {
    name:
      nameAgeMatch?.[1]
        ? cleanText(
            nameAgeMatch[1]
          )
        : '',

    age:
      nameAgeMatch?.[2]
        ? cleanText(
            nameAgeMatch[2]
          )
        : '',

    lastSeen,

    warrantOfCommittal:
      /warrant of committal/i.test(
        text
      ),

    doNotApproach:
      /do not approach/i.test(
        text
      ),
  }
}


// ============================================================
// TPS INCIDENT NUMBER
// ============================================================
//
// Real TPS News Release emails use:
//
//   Case #: 2026-1738439
//
// Older / operations-style TPS records may use:
//
//   GO1234567
//
// We treat either value as the stable incident key so later
// updates modify the same map incident instead of creating a
// duplicate.
//
// ============================================================

function extractIncidentNumber(
  value
) {
  const releaseCaseNumber =
    extractReleaseCaseNumber(
      value
    )


  if (
    releaseCaseNumber
  ) {
    return releaseCaseNumber
  }


  const text =
    cleanText(
      value
    )


  const patterns = [
    /\bCase\s*#\s*:?\s*([0-9]{4}-[0-9]{4,})\b/i,
    /\bCase\s*(?:Number|No\.?|#)\s*:?\s*([0-9-]{6,})\b/i,
    /\bGO\s*#?\s*(\d{6,})\b/i,
    /#GO(\d{6,})\b/i,
    /\bGO[-:\s]+(\d{6,})\b/i,
  ]


  for (
    const pattern of
    patterns
  ) {
    const match =
      text.match(
        pattern
      )


    if (
      match?.[1]
    ) {
      return cleanText(
        match[1]
      )
    }
  }


  return ''
}


function extractCaseNumber(
  value
) {
  const releaseCaseNumber =
    extractReleaseCaseNumber(
      value
    )


  if (
    releaseCaseNumber
  ) {
    return releaseCaseNumber
  }


  const text =
    cleanText(
      value
    )


  const match =
    text.match(
      /\bCase\s*(?:Number|No\.?|#)\s*:?\s*([0-9]{4}-[0-9]{4,})\b/i
    )


  return match?.[1]
    ? cleanText(
        match[1]
      )
    : ''
}


// ============================================================
// STREET SUFFIX
// ============================================================

const STREET_SUFFIX =
  (
    '(?:' +
    'Street|St\\.?|' +
    'Avenue|Ave\\.?|' +
    'Road|Rd\\.?|' +
    'Drive|Dr\\.?|' +
    'Boulevard|Blvd\\.?|' +
    'Crescent|Cres\\.?|' +
    'Trail|' +
    'Highway|Hwy\\.?|' +
    'Parkway|Pkwy\\.?|' +
    'Lane|Ln\\.?|' +
    'Court|Ct\\.?|' +
    'Place|Pl\\.?|' +
    'Way' +
    ')'
  )


// ============================================================
// ADDRESS
// ============================================================

const ADDRESS_PATTERN =
  new RegExp(
    (
      '\\b' +
      '\\d{1,5}' +
      '(?:\\s*-\\s*\\d{1,5})?' +
      '\\s+' +
      '[A-Z0-9]' +
      "[A-Za-z0-9.'’\\- ]{0,60}?" +
      '\\s' +
      STREET_SUFFIX +
      '(?:\\s+' +
      '(?:East|West|North|South|E\\.?|W\\.?|N\\.?|S\\.?)' +
      ')?'
    ),
    'i'
  )


// ============================================================
// FULL INTERSECTION
// ============================================================

const FULL_INTERSECTION_PATTERN =
  new RegExp(
    (
      '\\b' +
      "(?:[A-Z0-9][A-Za-z0-9.'’\\-]*\\s+){0,4}" +
      STREET_SUFFIX +
      '(?:\\s+' +
      '(?:East|West|North|South|E\\.?|W\\.?|N\\.?|S\\.?)' +
      ')?' +
      '\\s*' +
      '(?:and|&|at|near|\\/|@)' +
      '\\s*' +
      "(?:[A-Z0-9][A-Za-z0-9.'’\\-]*\\s+){0,4}" +
      STREET_SUFFIX +
      '(?:\\s+' +
      '(?:East|West|North|South|E\\.?|W\\.?|N\\.?|S\\.?)' +
      ')?'
    ),
    'i'
  )


// ============================================================
// COMMON TORONTO STREET NAMES
// ============================================================
//
// This is for short TPS formatting:
//
//   Yonge & Finch
//   Jane and Finch
//   Queen & Spadina
//
// We only accept the short format when both halves contain a
// recognizable Toronto street name.
//
// ============================================================

const TORONTO_STREET_NAMES = [
  'Adelaide',
  'Allen',
  'Avenue',
  'Bathurst',
  'Bay',
  'Bloor',
  'Broadview',
  'Carlton',
  'College',
  'Danforth',
  'Don Mills',
  'Dufferin',
  'Dundas',
  'Eglinton',
  'Finch',
  'Front',
  'Gardiner',
  'Gerrard',
  'Jane',
  'Jarvis',
  'Keele',
  'Kennedy',
  'King',
  'Kingston',
  'Lakeshore',
  'Lake Shore',
  'Lawrence',
  'Leslie',
  'Markham',
  'McCowan',
  'Ossington',
  'Parliament',
  'Pharmacy',
  'Queen',
  'Roncesvalles',
  'Sheppard',
  'Spadina',
  'St Clair',
  'Steeles',
  'University',
  'Victoria Park',
  'Warden',
  'Weston',
  'Wilson',
  'Woodbine',
  'Yonge',
  'York Mills',
]


// ============================================================
// SHORT INTERSECTION
// ============================================================

const SHORT_INTERSECTION_PATTERN =
  /\b([A-Z][A-Za-z0-9.'’\- ]{1,35})\s*(?:and|&|at|\/|@)\s*([A-Z][A-Za-z0-9.'’\- ]{1,35})(?=\s|,|\.|;|:|\)|$)/g


function containsKnownTorontoStreet(
  value
) {
  const text =
    cleanText(
      value
    )
      .toLowerCase()


  return TORONTO_STREET_NAMES.some(
    (
      street
    ) =>
      text.includes(
        street.toLowerCase()
      )
  )
}


function extractShortIntersection(
  value
) {
  const text =
    cleanText(
      value
    )


  SHORT_INTERSECTION_PATTERN.lastIndex =
    0


  let match


  while (
    (
      match =
        SHORT_INTERSECTION_PATTERN.exec(
          text
        )
    )
  ) {
    const first =
      cleanText(
        match[1]
      )


    const second =
      cleanText(
        match[2]
      )


    if (
      containsKnownTorontoStreet(
        first
      ) &&
      containsKnownTorontoStreet(
        second
      )
    ) {
      return (
        `${first} & ${second}`
      )
    }
  }


  return ''
}


// ============================================================
// GEOGRAPHY
// ============================================================

function cleanTpsLocationInput(
  value
) {
  let text =
    cleanText(
      value
    )


  const prefixes = [
    /^(?:located\s*:\s*)?missing\s+person(?:s)?\s*[,:\-]?\s*/i,
    /^(?:located\s*:\s*)?missing\s+youth\s*[,:\-]?\s*/i,
    /^(?:located\s*:\s*)?missing\s+people\s*[,:\-]?\s*/i,
    /^elopee\s*[,:\-]?\s*/i,
    /^wanted\s+(?:person|male|female)\s*[,:\-]?\s*/i,
  ]


  let changed =
    true


  while (
    changed
  ) {
    changed =
      false


    for (
      const pattern of
      prefixes
    ) {
      const next =
        text.replace(
          pattern,
          ''
        )


      if (
        next !==
          text
      ) {
        text =
          cleanText(
            next
          )

        changed =
          true
      }
    }
  }


  return text
}


function cleanExtractedTpsLocation(
  value
) {
  return cleanTpsLocationInput(
    value
  )
    .replace(
      /\s+area\s*$/i,
      ''
    )
    .replace(
      /^[,;:\-–—\s]+|[,;:\-–—\s]+$/g,
      ''
    )
    .trim()
}


function extractLocation(
  value
) {
  const text =
    cleanTpsLocationInput(
      value
    )


  const address =
    text.match(
      ADDRESS_PATTERN
    )


  if (
    address
  ) {
    return {
      location:
        cleanExtractedTpsLocation(
          address[0]
        ),

      precision:
        'address',
    }
  }


  const fullIntersection =
    text.match(
      FULL_INTERSECTION_PATTERN
    )


  if (
    fullIntersection
  ) {
    return {
      location:
        cleanExtractedTpsLocation(
          fullIntersection[0]
        ),

      precision:
        'intersection',
    }
  }


  const shortIntersection =
    extractShortIntersection(
      text
    )


  if (
    shortIntersection
  ) {
    return {
      location:
        cleanExtractedTpsLocation(
          shortIntersection
        ),

      precision:
        'intersection',
    }
  }


  return {
    location:
      '',

    precision:
      '',
  }
}


// ============================================================
// EXPIRY
// ============================================================

function buildExpiry(
  category,
  publishedAt
) {
  return getNewsExpiresAt({
    source:
      'Toronto Police Service',

    origin:
      'tps-email',

    category,

    firstSeenAt:
      publishedAt,

    publishedAt,
  })
}


// ============================================================
// EXTERNAL ID
// ============================================================

function buildExternalId({
  incidentNumber,
  subject,
  location,
  receivedAt,
}) {
  if (
    incidentNumber
  ) {
    return (
      'toronto-police-case-' +
      slugify(
        incidentNumber
      )
    )
  }


  return (
    'toronto-police-' +
    slugify(
      [
        subject,
        location,
        receivedAt,
      ]
        .join(
          '-'
        )
    )
  )
}


// ============================================================
// BUILD POLICE RECORD
// ============================================================

async function buildPoliceRecord(
  email
) {
  const cleanedSubject =
    cleanForwardedSubject(
      email.subject
    )


  const combinedText =
    cleanText(
      (
        cleanedSubject +
        '\n' +
        email.body
      )
    )


  const category =
    getIncidentCategory({
      subject:
        cleanedSubject,

      body:
        email.body,
    })


  const subjectGeographic =
    extractLocation(
      cleanedSubject
    )


  const bodyGeographic =
    extractLocation(
      getPrimaryIncidentText(
        email.body
      )
    )


  const geographic =
    subjectGeographic.location
      ? subjectGeographic
      : bodyGeographic


  const incidentNumber =
    extractIncidentNumber(
      combinedText
    )


  const caseNumber =
    extractCaseNumber(
      combinedText
    )


  const unit =
    extractReleaseUnit(
      email.body
    )


  const releasePublishedAt =
    parseTpsReleaseTimestamp(
      email.body
    )


  const releaseSourceUrl =
    await resolveTpsReleaseUrl({
      emailBody:
        email.body,

      incidentNumber,

      subject:
        cleanedSubject,
    })


  const effectiveSender =
    getEffectiveTpsSender(
      email
    )


  const receivedDate =
    new Date(
      email.receivedAt ||
      Date.now()
    )


  const publishedAt =
    releasePublishedAt ||
    (
      Number.isNaN(
        receivedDate.getTime()
      )
        ? new Date()
            .toISOString()
        : receivedDate
            .toISOString()
    )


  // ==========================================================
  // NEWSROOM GATE
  // ==========================================================
  //
  // NEVER return "publish" or "resolve" here.
  //
  // The legacy browser TPS auto-publisher still polls this same
  // endpoint. It only auto-publishes records whose action is
  // "publish", and it auto-removes records whose action is
  // "resolve".
  //
  // Returning "review" for EVERY incoming email guarantees that
  // nothing can bypass the Admin Room approval workflow.
  //
  // A separate newsroomAction tells AdminRoom.jsx what the editor
  // will be approving.
  //
  // ==========================================================

  const action =
    'review'


  const newsroomAction =
    category ===
      'located'
      ? 'resolve'
      : 'review'


  // Ordinary records keep TPS's current release headline.
  // LOCATED is different: once resolved, the public-facing title
  // must describe the current state instead of saying the person
  // is still missing.
  const publicTitle =
    category ===
      'located'
      ? buildGeographicTitle({
          category,

          subject:
            cleanedSubject,

          location:
            geographic.location,
        })
      : (
          cleanedSubject ||
          buildGeographicTitle({
            category,

            subject:
              cleanedSubject,

            location:
              geographic.location,
          })
        )


  const publicDescription =
    buildGeographicSummary({
      category,

      location:
        geographic.location,

      subject:
        cleanedSubject,

      body:
        email.body,
    })


  return {
    externalId:
      buildExternalId({
        incidentNumber,

        subject:
          cleanedSubject,

        location:
          geographic.location,

        receivedAt:
          publishedAt,
      }),

    city:
      'toronto',

    type:
      'news',

    category,

    // Server delivery is always review-only.
    action,

    // The Admin Room turns ordinary review items into either
    // PUBLISH or UPDATE based on whether this Case # is already
    // on the map. LOCATED is explicitly a pending RESOLVE.
    newsroomAction,

    reviewStatus:
      'pending',

    deliveryMode:
      'newsroom',

    title:
      publicTitle,

    description:
      publicDescription,

    location:
      geographic.location,

    intersection:
      geographic.location,

    locationPrecision:
      geographic.precision,

    longitude:
      null,

    latitude:
      null,

    pinPositionMode:
      'auto',

    searchedLongitude:
      null,

    searchedLatitude:
      null,

    source:
      'Toronto Police Service',

    sourceUrl:
      releaseSourceUrl,

    tpsReleaseUrl:
      releaseSourceUrl,

    attribution:
      'Source: Toronto Police Service News Releases',

    officialSource:
      true,

    contentMode:
      'fact-summary',

    summaryMethod:
      'geographic-editorial-summary-v4',

    publishedAt,

    expiresAt:
      buildExpiry(
        category,
        publishedAt
      ),

    // Never expose an incoming email as public before approval.
    active:
      false,

    // Keep goNumber for compatibility with the existing
    // auto-publisher's matching / resolution logic.
    goNumber:
      incidentNumber,

    incidentNumber,

    caseNumber,

    policeUnit:
      unit,

    tpsReleaseTitle:
      cleanedSubject,

    tpsBroadcastAt:
      releasePublishedAt ||
      '',

    // "sender" is the ORIGINAL TPS sender when this message
    // arrived through Gmail forwarding.
    sender:
      effectiveSender,

    forwardedBy:
      email.from,

    trustedSender:
      isLikelyOfficialTpsSender(
        effectiveSender
      ),
  }
}


// ============================================================
// STORE
// ============================================================

function storeRecord(
  record
) {
  const existingIndex =
    recentPoliceRecords
      .findIndex(
        (
          existing
        ) =>
          existing.externalId ===
          record.externalId
      )


  if (
    existingIndex >=
    0
  ) {
    const existing =
      recentPoliceRecords[
        existingIndex
      ]


    const firstPublishedAt =
      existing.firstPublishedAt ||
      existing.publishedAt ||
      record.publishedAt


    const preservedExpiry =
      record.category ===
        'located'
        ? ''
        : buildExpiry(
            existing.category ||
            record.category,
            firstPublishedAt
          )


    recentPoliceRecords[
      existingIndex
    ] = {
      ...existing,
      ...record,

      // New email becomes the latest public information.
      publishedAt:
        record.publishedAt,

      // But the incident's original clock never restarts.
      firstPublishedAt,

      expiresAt:
        preservedExpiry,

      updatedAt:
        new Date()
          .toISOString(),
    }
  }
  else {
    recentPoliceRecords.unshift({
      ...record,

      firstPublishedAt:
        record.publishedAt,

      updatedAt:
        record.publishedAt,
    })
  }


  if (
    recentPoliceRecords.length >
    MAX_RECORDS
  ) {
    recentPoliceRecords.length =
      MAX_RECORDS
  }


  return (
    recentPoliceRecords.find(
      (
        existing
      ) =>
        existing.externalId ===
        record.externalId
    ) ||
    record
  )
}


// ============================================================
// GET
// ============================================================

function handleGet(
  res
) {
  sendJson({
    res,

    data: {
      ok:
        true,

      count:
        recentPoliceRecords.length,

      records:
        recentPoliceRecords,
    },
  })
}


// ============================================================
// POST
// ============================================================

async function handlePost({
  req,
  res,
}) {
  const authorization =
    webhookIsAuthorized(
      req
    )


  if (
    !authorization.ok
  ) {
    sendJson({
      res,

      status:
        authorization.status,

      data: {
        ok:
          false,

        error:
          authorization.error,
      },
    })


    return
  }


  const payload =
    await parseRequestPayload(
      req
    )


  const email =
    normalizeIncomingEmail(
      payload
    )


  if (
    !email.subject &&
    !email.body
  ) {
    sendJson({
      res,

      status:
        400,

      data: {
        ok:
          false,

        error:
          'No email subject or body received',
      },
    })


    return
  }


  const effectiveSender =
    getEffectiveTpsSender(
      email
    )


  if (
    !isLikelyOfficialTpsSender(
      effectiveSender
    )
  ) {
    console.warn(
      'TPS WEBHOOK REJECTED SENDER:',
      effectiveSender ||
      email.from ||
      'NO TPS SENDER FOUND'
    )


    sendJson({
      res,

      status:
        403,

      data: {
        ok:
          false,

        error:
          'Original sender is not an allowed Toronto Police address',
      },
    })


    return
  }


  const record =
    await buildPoliceRecord(
      email
    )


  const storedRecord =
    storeRecord(
      record
    )


  // Persist every trusted TPS newsroom delivery independently of the
  // browser. This survives Admin Room being closed and also survives
  // a dev-server restart because liveNewsroom writes to disk.
  await queueLiveNewsroomRecord({
    sourceKey:
      'police',

    record:
      storedRecord,

    action:
      storedRecord.newsroomAction ||
      (
        storedRecord.category ===
          'located'
          ? 'resolve'
          : ''
      ),
  })


  console.log(
    'TPS WEBHOOK EMAIL:',
    record.title
  )


  console.log(
    'TPS WEBHOOK LOCATION:',
    record.location ||
    'NO LOCATION'
  )


  console.log(
    'TPS WEBHOOK DELIVERY ACTION:',
    record.action
  )


  console.log(
    'TPS WEBHOOK NEWSROOM ACTION:',
    record.newsroomAction
  )


  console.log(
    'TPS WEBHOOK CASE:',
    record.caseNumber ||
    record.incidentNumber ||
    'NO CASE NUMBER'
  )


  console.log(
    'TPS WEBHOOK ORIGINAL SENDER:',
    record.sender ||
    'NO ORIGINAL SENDER'
  )


  console.log(
    'TPS WEBHOOK TRUSTED:',
    record.trustedSender
  )


  console.log(
    'TPS WEBHOOK CONTENT MODE:',
    record.contentMode
  )


  sendJson({
    res,

    status:
      201,

    data: {
      ok:
        true,

      record,
    },
  })
}


// ============================================================
// VITE PLUGIN
// ============================================================

export function tpsWebhookFeed() {
  return {
    name:
      'geographic-tps-email-webhook',


    configResolved(
      config
    ) {
      const env =
        loadEnv(
          config.mode,
          config.envDir,
          ''
        )


      webhookSecret =
        cleanText(
          (
            process.env
              .TPS_WEBHOOK_SECRET ||
            env.TPS_WEBHOOK_SECRET ||
            ''
          )
        )


      const configuredDomains =
        splitCsv(
          (
            process.env
              .TPS_ALLOWED_SENDER_DOMAINS ||
            env.TPS_ALLOWED_SENDER_DOMAINS ||
            ''
          )
        )


      allowedSenderDomains =
        configuredDomains.length >
        0
          ? configuredDomains
          : [
              ...DEFAULT_ALLOWED_SENDER_DOMAINS,
            ]


      if (
        !webhookSecret
      ) {
        console.warn(
          'TPS WEBHOOK · TPS_WEBHOOK_SECRET NOT CONFIGURED'
        )
      }
      else {
        console.log(
          'TPS WEBHOOK · SECURITY ENABLED'
        )
      }


      console.log(
        'TPS WEBHOOK · ALLOWED SENDER DOMAINS:',
        allowedSenderDomains.join(
          ', '
        )
      )
    },


    configureServer(
      server
    ) {
      server.middlewares.use(
        '/api/geographic/toronto/police/incoming',

        async (
          req,
          res
        ) => {
          try {
            if (
              req.method ===
              'GET'
            ) {
              handleGet(
                res
              )


              return
            }


            if (
              req.method ===
              'POST'
            ) {
              await handlePost({
                req,
                res,
              })


              return
            }


            sendJson({
              res,

              status:
                405,

              data: {
                ok:
                  false,

                error:
                  'Method not allowed',
              },
            })
          }
          catch (
            error
          ) {
            console.error(
              'TPS WEBHOOK ERROR:',
              error
            )


            sendJson({
              res,

              status:
                Number(
                  error?.statusCode
                ) ||
                500,

              data: {
                ok:
                  false,

                error:
                  String(
                    error?.message ||
                    error
                  ),
              },
            })
          }
        }
      )
    },
  }
}