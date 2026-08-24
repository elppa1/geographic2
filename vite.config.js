import {
  defineConfig,
  loadEnv,
} from 'vite'

import react from '@vitejs/plugin-react'

import {
  timingSafeEqual,
} from 'node:crypto'

import {
  cleanToronto1995Tiles,
} from './server/tiles/toronto/clean1995.js'

import {
  enhanceHistoricalTiles,
} from './server/tiles/enhanceRaster.js'

import {
  createGeographicProxy,
} from './server/proxy/index.js'

import {
  tpsWebhookFeed,
} from './server/feeds/toronto/tpsWebhook.js'

import {
  ttcAlertsFeed,
} from './server/feeds/toronto/ttcAlerts.js'

import {
  liveNewsroomFeed,
} from './server/feeds/toronto/liveNewsroom.js'


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
  catch (
    error
  ) {
    console.warn(
      'ADMIN AUTH HEADER ERROR:',
      error
    )


    return null
  }
}


function requestNeedsAdminAuth(
  req
) {
  let pathname =
    ''


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
        ''
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


function adminAuth(
  env
) {
  return {
    name:
      'geographic-admin-auth',


    configureServer(
      server
    ) {
      server.middlewares.use(
        (
          req,
          res,
          next
        ) => {
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
              env.GEOGRAPHIC_ADMIN_USER ||
              ''
            )


          const expectedPassword =
            String(
              env.GEOGRAPHIC_ADMIN_PASSWORD ||
              ''
            )


          if (
            !expectedUsername ||
            !expectedPassword
          ) {
            console.error(
              'ADMIN AUTH · GEOGRAPHIC_ADMIN_USER / GEOGRAPHIC_ADMIN_PASSWORD are not configured.'
            )


            res.statusCode =
              503


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.end(
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


            res.setHeader(
              'Content-Type',
              'text/plain; charset=utf-8'
            )


            res.end(
              'Admin authentication required.'
            )


            return
          }


          next()
        }
      )
    },
  }
}


export default defineConfig(
  ({
    mode,
  }) => {
    const env =
      loadEnv(
        mode,
        process.cwd(),
        ''
      )


    return {
      plugins: [
        adminAuth(
          env
        ),
        react(),
        cleanToronto1995Tiles(),
        enhanceHistoricalTiles(),
        tpsWebhookFeed(),
        ttcAlertsFeed(),
        liveNewsroomFeed(),
      ],


      optimizeDeps: {
        exclude: [
          'maplibre-gl',
        ],
      },


      server: {
        allowedHosts: [
          'floating-racks-industrial-submissions.trycloudflare.com',
        ],

        watch: {
          ignored: [
            '**/tools/superres/**',
          ],
        },


        proxy:
          createGeographicProxy(),
      },
    }
  }
)