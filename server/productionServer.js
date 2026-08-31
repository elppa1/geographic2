import {
  createServer,
} from 'node:http'

import {
  readFile,
  stat,
} from 'node:fs/promises'

import {
  extname,
  join,
  normalize,
  resolve,
} from 'node:path'

import {
  fileURLToPath,
} from 'node:url'

import {
  timingSafeEqual,
} from 'node:crypto'

import {
  Readable,
} from 'node:stream'

import {
  loadEnv,
} from 'vite'

import {
  cleanToronto1995Tiles,
} from './tiles/toronto/clean1995.js'

import {
  enhanceHistoricalTiles,
} from './tiles/enhanceRaster.js'

import {
  tpsWebhookFeed,
} from './feeds/toronto/tpsWebhook.js'

import {
  ttcAlertsFeed,
} from './feeds/toronto/ttcAlerts.js'

import {
  liveNewsroomFeed,
} from './feeds/toronto/liveNewsroom.js'

import {
  nowServingFeed,
} from './feeds/toronto/nowServing.js'

import {
  torontoNewBusinessFeed,
} from './feeds/toronto/new/business.js'

import {
  torontoNewDevelopmentFeed,
} from './feeds/toronto/new/development.js'

import {
  locationSearchApi,
} from './locationSearch.js'

import {
  TORONTO_PROXIES,
} from './proxy/cities/index.js'


const ROOT_DIR =
  resolve(
    fileURLToPath(
      new URL(
        '..',
        import.meta.url
      )
    )
  )


const DIST_DIR =
  join(
    ROOT_DIR,
    'dist'
  )


const PORT =
  Number(
    process.env.PORT ||
    3000
  )


const HOST =
  process.env.HOST ||
  '0.0.0.0'


const LOCAL_ENV =
  loadEnv(
    'production',
    ROOT_DIR,
    ''
  )


function getServerEnv(
  name
) {
  return (
    process.env[
      name
    ] ??
    LOCAL_ENV[
      name
    ] ??
    ''
  )
}


// ============================================================
// BASIC RESPONSE HELPERS
// ============================================================

function sendText(
  res,
  status,
  text
) {
  res.statusCode =
    status


  res.setHeader(
    'Content-Type',
    'text/plain; charset=utf-8'
  )


  res.setHeader(
    'Cache-Control',
    'no-store'
  )


  res.end(
    text
  )
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


// ============================================================
// ADMIN AUTH
// ============================================================

function safeEqual(
  actual,
  expected
) {
  const actualBuffer =
    Buffer.from(
      String(
        actual ||
        ''
      )
    )


  const expectedBuffer =
    Buffer.from(
      String(
        expected ||
        ''
      )
    )


  if (
    actualBuffer.length !==
    expectedBuffer.length
  ) {
    return false
  }


  return timingSafeEqual(
    actualBuffer,
    expectedBuffer
  )
}


function getBasicCredentials(
  req
) {
  const authorization =
    String(
      req.headers.authorization ||
      ''
    )


  if (
    !authorization.startsWith(
      'Basic '
    )
  ) {
    return null
  }


  try {
    const decoded =
      Buffer.from(
        authorization.slice(
          6
        ),
        'base64'
      )
        .toString(
          'utf8'
        )


    const separatorIndex =
      decoded.indexOf(
        ':'
      )


    if (
      separatorIndex <
      0
    ) {
      return null
    }


    return {
      username:
        decoded.slice(
          0,
          separatorIndex
        ),

      password:
        decoded.slice(
          separatorIndex +
          1
        ),
    }
  }
  catch {
    return null
  }
}


function requestNeedsAdminAuth(
  req
) {
  let pathname =
    '/'


  try {
    pathname =
      new URL(
        req.url ||
        '/',
        'http://localhost'
      )
        .pathname
  }
  catch {
    pathname =
      String(
        req.url ||
        '/'
      )
  }


  if (
    pathname ===
      '/admin' ||
    pathname.startsWith(
      '/admin/'
    )
  ) {
    return true
  }


  if (
    pathname.startsWith(
      '/api/geographic/toronto/newsroom/'
    )
  ) {
    return true
  }


  if (
    pathname.startsWith(
      '/api/geographic/toronto/new/'
    ) &&
    String(
      req.method ||
      'GET'
    )
      .toUpperCase() !==
      'GET'
  ) {
    return true
  }


  if (
    pathname ===
      '/api/geographic/toronto/police/incoming' &&
    String(
      req.method ||
      'GET'
    )
      .toUpperCase() ===
      'GET'
  ) {
    return true
  }


  return false
}


function adminAuthMiddleware(
  req,
  res,
  next
) {
  if (
    !requestNeedsAdminAuth(
      req
    )
  ) {
    next()

    return
  }


  const expectedUsername =
    String(
      getServerEnv(
        'GEOGRAPHIC_ADMIN_USER'
      )
    )


  const expectedPassword =
    String(
      getServerEnv(
        'GEOGRAPHIC_ADMIN_PASSWORD'
      )
    )


  if (
    !expectedUsername ||
    !expectedPassword
  ) {
    console.error(
      'ADMIN AUTH · GEOGRAPHIC_ADMIN_USER / GEOGRAPHIC_ADMIN_PASSWORD are not configured.'
    )


    sendText(
      res,
      503,
      'Admin access is not configured.'
    )


    return
  }


  const credentials =
    getBasicCredentials(
      req
    )


  const valid =
    credentials &&
    safeEqual(
      credentials.username,
      expectedUsername
    ) &&
    safeEqual(
      credentials.password,
      expectedPassword
    )


  if (
    !valid
  ) {
    res.statusCode =
      401


    res.setHeader(
      'WWW-Authenticate',
      'Basic realm="Toronto Geographic Admin", charset="UTF-8"'
    )


    res.setHeader(
      'Cache-Control',
      'no-store'
    )


    res.end(
      'Admin authentication required.'
    )


    return
  }


  next()
}


// ============================================================
// CONNECT-LIKE MIDDLEWARE STACK
// ============================================================
//
// Existing Geographic server modules are Vite plugins. Their server
// behavior is already implemented through `server.middlewares.use()`.
//
// Production reuses those exact handlers through this tiny compatible
// middleware stack instead of duplicating TPS / TTC / newsroom logic.
//
// ============================================================

function createMiddlewareStack() {
  const stack =
    []


  function use(
    route,
    handler
  ) {
    if (
      typeof route ===
      'function'
    ) {
      stack.push({
        route:
          '',

        handler:
          route,
      })


      return
    }


    stack.push({
      route:
        String(
          route ||
          ''
        ),

      handler,
    })
  }


  async function handle(
    req,
    res
  ) {
    let index =
      -1


    async function run(
      nextIndex
    ) {
      if (
        res.writableEnded
      ) {
        return
      }


      if (
        nextIndex <=
        index
      ) {
        throw new Error(
          'next() called multiple times'
        )
      }


      index =
        nextIndex


      const layer =
        stack[
          nextIndex
        ]


      if (
        !layer
      ) {
        await handleProxyOrStatic(
          req,
          res
        )

        return
      }


      const originalUrl =
        req.url


      let pathname =
        '/'


      try {
        pathname =
          new URL(
            req.url ||
            '/',
            'http://localhost'
          )
            .pathname
      }
      catch {
        pathname =
          String(
            req.url ||
            '/'
          )
      }


      if (
        layer.route &&
        pathname !==
          layer.route &&
        !pathname.startsWith(
          layer.route +
          '/'
        )
      ) {
        await run(
          nextIndex +
          1
        )

        return
      }


      if (
        layer.route
      ) {
        const parsed =
          new URL(
            req.url ||
            '/',
            'http://localhost'
          )


        const strippedPath =
          parsed.pathname.slice(
            layer.route.length
          ) ||
          '/'


        req.url =
          strippedPath +
          parsed.search
      }


      let nextCalled =
        false


      const next =
        (
          error
        ) => {
          nextCalled =
            true


          req.url =
            originalUrl


          if (
            error
          ) {
            throw error
          }


          return run(
            nextIndex +
            1
          )
        }


      try {
        const result =
          layer.handler(
            req,
            res,
            next
          )


        if (
          result &&
          typeof result.then ===
            'function'
        ) {
          await result
        }
      }
      finally {
        if (
          !nextCalled
        ) {
          req.url =
            originalUrl
        }
      }
    }


    await run(
      0
    )
  }


  return {
    use,
    handle,
  }
}


// ============================================================
// VITE-PLUGIN COMPATIBILITY
// ============================================================

function mountPlugin({
  plugin,
  middlewareStack,
  httpServer,
}) {
  if (
    typeof plugin?.configResolved ===
    'function'
  ) {
    plugin.configResolved({
      mode:
        'production',

      envDir:
        ROOT_DIR,
    })
  }


  if (
    typeof plugin?.configureServer ===
    'function'
  ) {
    plugin.configureServer({
      middlewares:
        middlewareStack,

      httpServer,
    })
  }
}


// ============================================================
// PROXY
// ============================================================

function getProxyMatch(
  pathname
) {
  return Object.entries(
    TORONTO_PROXIES
  )
    .sort(
      (
        a,
        b
      ) =>
        b[0].length -
        a[0].length
    )
    .find(
      ([
        prefix,
      ]) =>
        pathname ===
          prefix ||
        pathname.startsWith(
          prefix +
          '/'
        )
    ) ||
    null
}


async function readRequestBuffer(
  req
) {
  const chunks =
    []


  for await (
    const chunk of
    req
  ) {
    chunks.push(
      chunk
    )
  }


  return Buffer.concat(
    chunks
  )
}


async function proxyRequest(
  req,
  res,
  prefix,
  config
) {
  const incoming =
    new URL(
      req.url ||
      '/',
      'http://localhost'
    )


  const rewritten =
    typeof config.rewrite ===
      'function'
      ? config.rewrite(
          incoming.pathname
        )
      : incoming.pathname


  const target =
    new URL(
      rewritten +
      incoming.search,
      String(
        config.target
      )
    )


  const headers = {
    ...req.headers,
    ...(
      config.headers ||
      {}
    ),
  }


  delete headers.host
  delete headers['content-length']


  if (
    config.changeOrigin
  ) {
    headers.host =
      target.host
  }


  const method =
    String(
      req.method ||
      'GET'
    )
      .toUpperCase()


  const body =
    method ===
      'GET' ||
    method ===
      'HEAD'
      ? undefined
      : await readRequestBuffer(
          req
        )


  const response =
    await fetch(
      target,
      {
        method,
        headers,
        body,

        redirect:
          'manual',
      }
    )


  res.statusCode =
    response.status


  response.headers.forEach(
    (
      value,
      name
    ) => {
      const lower =
        name.toLowerCase()


      if (
        lower ===
          'transfer-encoding' ||
        lower ===
          'content-length' ||
        lower ===
          'content-encoding'
      ) {
        return
      }


      res.setHeader(
        name,
        value
      )
    }
  )


  if (
    !response.body
  ) {
    res.end()

    return
  }


  Readable
    .fromWeb(
      response.body
    )
    .pipe(
      res
    )
}


// ============================================================
// STATIC SITE
// ============================================================

const MIME_TYPES = {
  '.css':
    'text/css; charset=utf-8',

  '.gif':
    'image/gif',

  '.html':
    'text/html; charset=utf-8',

  '.ico':
    'image/x-icon',

  '.jpeg':
    'image/jpeg',

  '.jpg':
    'image/jpeg',

  '.js':
    'text/javascript; charset=utf-8',

  '.json':
    'application/json; charset=utf-8',

  '.map':
    'application/json; charset=utf-8',

  '.png':
    'image/png',

  '.svg':
    'image/svg+xml',

  '.txt':
    'text/plain; charset=utf-8',

  '.webp':
    'image/webp',

  '.woff':
    'font/woff',

  '.woff2':
    'font/woff2',
}


async function fileExists(
  path
) {
  try {
    const details =
      await stat(
        path
      )


    return details.isFile()
  }
  catch {
    return false
  }
}


function safeDistPath(
  pathname
) {
  let decoded =
    pathname


  try {
    decoded =
      decodeURIComponent(
        pathname
      )
  }
  catch {
    decoded =
      pathname
  }


  const cleaned =
    normalize(
      decoded
    )
      .replace(
        /^(\.\.(\/|\\|$))+/,
        ''
      )
      .replace(
        /^[/\\]+/,
        ''
      )


  const candidate =
    resolve(
      DIST_DIR,
      cleaned
    )


  if (
    candidate !==
      DIST_DIR &&
    !candidate.startsWith(
      DIST_DIR +
      '/'
    ) &&
    !candidate.startsWith(
      DIST_DIR +
      '\\'
    )
  ) {
    return null
  }


  return candidate
}


async function serveFile(
  res,
  path
) {
  const data =
    await readFile(
      path
    )


  const type =
    MIME_TYPES[
      extname(
        path
      )
        .toLowerCase()
    ] ||
    'application/octet-stream'


  res.statusCode =
    200


  res.setHeader(
    'Content-Type',
    type
  )


  res.setHeader(
    'Cache-Control',
    path.endsWith(
      'index.html'
    )
      ? 'no-cache'
      : 'public, max-age=3600'
  )


  res.end(
    data
  )
}


async function handleProxyOrStatic(
  req,
  res
) {
  const parsed =
    new URL(
      req.url ||
      '/',
      'http://localhost'
    )


  if (
    parsed.pathname ===
      '/health'
  ) {
    sendJson(
      res,
      200,
      {
        ok:
          true,

        service:
          'elppa-geographic',

        time:
          new Date()
            .toISOString(),
      }
    )


    return
  }


  const proxyMatch =
    getProxyMatch(
      parsed.pathname
    )


  if (
    proxyMatch
  ) {
    const [
      prefix,
      config,
    ] =
      proxyMatch


    try {
      await proxyRequest(
        req,
        res,
        prefix,
        config
      )
    }
    catch (
      error
    ) {
      console.error(
        'PROXY ERROR:',
        prefix,
        error
      )


      sendJson(
        res,
        502,
        {
          ok:
            false,

          error:
            'Proxy request failed',
        }
      )
    }


    return
  }


  if (
    parsed.pathname.startsWith(
      '/api/'
    )
  ) {
    sendJson(
      res,
      404,
      {
        ok:
          false,

        error:
          'API route not found',
      }
    )


    return
  }


  const requestedPath =
    safeDistPath(
      parsed.pathname
    )


  if (
    requestedPath &&
    await fileExists(
      requestedPath
    )
  ) {
    await serveFile(
      res,
      requestedPath
    )


    return
  }


  const indexPath =
    join(
      DIST_DIR,
      'index.html'
    )


  if (
    !await fileExists(
      indexPath
    )
  ) {
    sendText(
      res,
      503,
      'Geographic has not been built. Run npm run build first.'
    )


    return
  }


  await serveFile(
    res,
    indexPath
  )
}


// ============================================================
// SERVER
// ============================================================

const middlewareStack =
  createMiddlewareStack()


middlewareStack.use(
  adminAuthMiddleware
)


const httpServer =
  createServer(
    async (
      req,
      res
    ) => {
      try {
        await middlewareStack.handle(
          req,
          res
        )
      }
      catch (
        error
      ) {
        console.error(
          'PRODUCTION SERVER ERROR:',
          error
        )


        if (
          !res.headersSent
        ) {
          sendJson(
            res,
            500,
            {
              ok:
                false,

              error:
                'Internal server error',
            }
          )
        }
        else if (
          !res.writableEnded
        ) {
          res.end()
        }
      }
    }
  )


const plugins = [
  locationSearchApi(),
  cleanToronto1995Tiles(),
  enhanceHistoricalTiles(),
  tpsWebhookFeed(),
  ttcAlertsFeed(),
  liveNewsroomFeed(),
  nowServingFeed(),
  torontoNewBusinessFeed(),
  torontoNewDevelopmentFeed(),
]


plugins.forEach(
  (
    plugin
  ) => {
    mountPlugin({
      plugin,
      middlewareStack,
      httpServer,
    })
  }
)


httpServer.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `GEOGRAPHIC · PRODUCTION SERVER · http://${HOST}:${PORT}`
    )


    console.log(
      'GEOGRAPHIC · DATA DIR:',
      getServerEnv(
        'GEOGRAPHIC_DATA_DIR'
      ) ||
      'server/data'
    )
  }
)