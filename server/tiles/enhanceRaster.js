import sharp from 'sharp'

import {
  CITIES,
} from '../../src/cities/index.js'


// ============================================================
// CACHE
// ============================================================

const tileCache =
  new Map()


const MAX_CACHE_ITEMS =
  500


const CACHE_VERSION =
  'archival-v5'


// ============================================================
// TILE SIZE
// ============================================================

const TILE_SIZE =
  256


// ============================================================
// FALLBACK DEPTH
// ============================================================

const MAX_PARENT_FALLBACK =
  5


// ============================================================
// LAYER RECORD
// ============================================================

function getLayerRecord({
  city,
  layerType,
  year,
}) {
  if (
    !city
  ) {
    return null
  }


  if (
    layerType ===
    'map'
  ) {
    return (
      city.maps?.[
        year
      ] ||
      null
    )
  }


  if (
    layerType ===
    'aerial'
  ) {
    return (
      city.aerials?.[
        year
      ] ||
      null
    )
  }


  return null
}


// ============================================================
// UPSTREAM TEMPLATE
// ============================================================

function normalizeUpstreamTemplate(
  template
) {
  if (
    !template
  ) {
    return null
  }


  let resolved =
    String(
      template
    )


  if (
    resolved.startsWith(
      '/utoronto-clean-1995/'
    )
  ) {
    resolved =
      resolved.replace(
        '/utoronto-clean-1995/',
        'https://maps.library.utoronto.ca/tiles1995/'
      )
  }


  if (
    resolved.startsWith(
      '/utoronto/'
    )
  ) {
    resolved =
      resolved.replace(
        '/utoronto/',
        'https://maps.library.utoronto.ca/'
      )
  }


  if (
    !resolved.startsWith(
      'http://'
    ) &&
    !resolved.startsWith(
      'https://'
    )
  ) {
    return null
  }


  return resolved
}


// ============================================================
// RESOLVE TILE URL
// ============================================================

function resolveTileUrl({
  template,
  z,
  x,
  y,
}) {
  const normalizedTemplate =
    normalizeUpstreamTemplate(
      template
    )


  if (
    !normalizedTemplate
  ) {
    return null
  }


  return normalizedTemplate
    .replaceAll(
      '{z}',
      String(
        z
      )
    )
    .replaceAll(
      '{x}',
      String(
        x
      )
    )
    .replaceAll(
      '{y}',
      String(
        y
      )
    )
}


// ============================================================
// FETCH BUFFER
// ============================================================

async function fetchTileBuffer(
  url
) {
  if (
    !url
  ) {
    return null
  }


  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              'image/*',

            'User-Agent':
              'ELPPA-Geographic/0.1',
          },
        }
      )


    if (
      !response.ok
    ) {
      return null
    }


    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      )


    if (
      buffer.length ===
      0
    ) {
      return null
    }


    return buffer
  }
  catch (
    error
  ) {
    console.warn(
      'ENHANCE TILE FETCH ERROR:',
      url,
      error
    )


    return null
  }
}


// ============================================================
// EXACT TILE
// ============================================================

async function fetchExactTile({
  record,
  z,
  x,
  y,
}) {
  const url =
    resolveTileUrl({
      template:
        record.url,

      z,
      x,
      y,
    })


  const buffer =
    await fetchTileBuffer(
      url
    )


  return {
    buffer,
    url,
  }
}


// ============================================================
// PARENT TILE CROP
// ============================================================
//
// If the archive doesn't contain the requested high-zoom tile,
// use an available parent tile.
//
// We crop the exact section represented by the requested tile
// and resize that section back to 256 x 256.
//
// ============================================================

async function cropParentTile({
  buffer,
  requestedX,
  requestedY,
  depth,
}) {
  const metadata =
    await sharp(
      buffer
    )
      .metadata()


  const parentWidth =
    metadata.width ||
    TILE_SIZE


  const parentHeight =
    metadata.height ||
    TILE_SIZE


  const factor =
    2 ** depth


  const childX =
    (
      requestedX %
      factor +
      factor
    ) %
    factor


  const childY =
    (
      requestedY %
      factor +
      factor
    ) %
    factor


  const regionWidth =
    parentWidth /
    factor


  const regionHeight =
    parentHeight /
    factor


  const left =
    Math.floor(
      childX *
      regionWidth
    )


  const top =
    Math.floor(
      childY *
      regionHeight
    )


  const width =
    Math.max(
      1,
      Math.ceil(
        regionWidth
      )
    )


  const height =
    Math.max(
      1,
      Math.ceil(
        regionHeight
      )
    )


  const safeLeft =
    Math.min(
      parentWidth - 1,
      left
    )


  const safeTop =
    Math.min(
      parentHeight - 1,
      top
    )


  const safeWidth =
    Math.max(
      1,
      Math.min(
        width,
        parentWidth -
        safeLeft
      )
    )


  const safeHeight =
    Math.max(
      1,
      Math.min(
        height,
        parentHeight -
        safeTop
      )
    )


  return sharp(
    buffer
  )
    .extract({
      left:
        safeLeft,

      top:
        safeTop,

      width:
        safeWidth,

      height:
        safeHeight,
    })

    .resize(
      TILE_SIZE,
      TILE_SIZE,
      {
        kernel:
          sharp.kernel.lanczos3,
      }
    )

    .png({
      compressionLevel:
        6,
    })

    .toBuffer()
}


// ============================================================
// FETCH ORIGINAL TILE
// ============================================================
//
// 1. Try the exact requested tile.
//
// 2. If the archival source doesn't provide that zoom level,
//    walk upward through its parent tiles.
//
// 3. Crop the appropriate section from the first parent tile
//    we can find.
//
// ============================================================

async function fetchOriginalTile({
  record,
  z,
  x,
  y,
}) {
  const requestedZ =
    Number(
      z
    )


  const requestedX =
    Number(
      x
    )


  const requestedY =
    Number(
      y
    )


  if (
    !Number.isFinite(
      requestedZ
    ) ||
    !Number.isFinite(
      requestedX
    ) ||
    !Number.isFinite(
      requestedY
    )
  ) {
    return null
  }


  // ==========================================================
  // EXACT TILE
  // ==========================================================

  const exact =
    await fetchExactTile({
      record,

      z:
        requestedZ,

      x:
        requestedX,

      y:
        requestedY,
    })


  if (
    exact.buffer
  ) {
    return exact.buffer
  }


  // ==========================================================
  // PARENT FALLBACK
  // ==========================================================

  for (
    let depth = 1;
    depth <=
    MAX_PARENT_FALLBACK;
    depth++
  ) {
    const parentZ =
      requestedZ -
      depth


    if (
      parentZ <
      0
    ) {
      break
    }


    const factor =
      2 ** depth


    const parentX =
      Math.floor(
        requestedX /
        factor
      )


    const parentY =
      Math.floor(
        requestedY /
        factor
      )


    const parent =
      await fetchExactTile({
        record,

        z:
          parentZ,

        x:
          parentX,

        y:
          parentY,
      })


    if (
      !parent.buffer
    ) {
      continue
    }


    console.log(
      (
        'ENHANCE PARENT FALLBACK · ' +
        `z${requestedZ} → z${parentZ} · ` +
        `${requestedX}/${requestedY}`
      )
    )


    try {
      return await cropParentTile({
        buffer:
          parent.buffer,

        requestedX,

        requestedY,

        depth,
      })
    }
    catch (
      error
    ) {
      console.warn(
        'ENHANCE PARENT CROP ERROR:',
        error
      )


      return null
    }
  }


  console.warn(
    (
      'ENHANCE TILE UNAVAILABLE · ' +
      `z${requestedZ}/` +
      `${requestedX}/` +
      `${requestedY}`
    )
  )


  return null
}


// ============================================================
// 1995 CLEANUP
// ============================================================
//
// Only remove pixels extremely close to pure white.
//
// This keeps pale photographic detail intact.
//
// ============================================================

async function clean1995(
  input
) {
  if (
    !input ||
    input.length ===
    0
  ) {
    return null
  }


  const {
    data,
    info,
  } =
    await sharp(
      input
    )
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject:
          true,
      })


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {
    const red =
      data[
        i
      ]


    const green =
      data[
        i + 1
      ]


    const blue =
      data[
        i + 2
      ]


    const brightest =
      Math.max(
        red,
        green,
        blue
      )


    const darkest =
      Math.min(
        red,
        green,
        blue
      )


    const difference =
      brightest -
      darkest


    if (
      darkest >=
        252 &&
      difference <=
        5
    ) {
      data[
        i + 3
      ] =
        0
    }
  }


  return sharp(
    data,
    {
      raw: {
        width:
          info.width,

        height:
          info.height,

        channels:
          4,
      },
    }
  )
    .png({
      compressionLevel:
        6,
    })
    .toBuffer()
}


// ============================================================
// AERIAL PROFILE
// ============================================================

function getAerialProfile(
  year
) {
  const numericYear =
    Number(
      year
    )


  // ----------------------------------------------------------
  // EARLY AERIALS
  // ----------------------------------------------------------

  if (
    numericYear <=
    1965
  ) {
    return {
      brightness:
        1.015,

      saturation:
        0.98,

      sharpen: {
        sigma:
          1.15,

        m1:
          1.7,

        m2:
          3.0,

        x1:
          2,

        y2:
          6,

        y3:
          12,
      },
    }
  }


  // ----------------------------------------------------------
  // MID / LATE ARCHIVAL AERIALS
  // ----------------------------------------------------------

  if (
    numericYear <=
    1999
  ) {
    return {
      brightness:
        1.01,

      saturation:
        1.0,

      sharpen: {
        sigma:
          1.05,

        m1:
          1.55,

        m2:
          2.7,

        x1:
          2,

        y2:
          6,

        y3:
          11,
      },
    }
  }


  // ----------------------------------------------------------
  // MODERN ORTHOPHOTOS
  // ----------------------------------------------------------

  return {
    brightness:
      1.0,

    saturation:
      1.0,

    sharpen: {
      sigma:
        0.8,

      m1:
        1.3,

      m2:
        2.2,

      x1:
        2,

      y2:
        5,

      y3:
        9,
    },
  }
}


// ============================================================
// ENHANCE AERIAL
// ============================================================

async function enhanceAerial({
  input,
  year,
}) {
  if (
    !input ||
    input.length ===
    0
  ) {
    return null
  }


  const profile =
    getAerialProfile(
      year
    )


  return sharp(
    input
  )
    .modulate({
      brightness:
        profile.brightness,

      saturation:
        profile.saturation,
    })

    // --------------------------------------------------------
    // SMALL CONTRAST LIFT
    // --------------------------------------------------------

    .linear(
      1.035,
      -4
    )

    // --------------------------------------------------------
    // CONTROLLED SHARPEN
    // --------------------------------------------------------

    .sharpen(
      profile.sharpen
    )

    .png({
      compressionLevel:
        6,
    })

    .toBuffer()
}


// ============================================================
// ENHANCE DRAWN MAP
// ============================================================

async function enhanceMap(
  input
) {
  if (
    !input ||
    input.length ===
    0
  ) {
    return null
  }


  return sharp(
    input
  )
    .linear(
      1.04,
      -4
    )

    .sharpen({
      sigma:
        0.85,

      m1:
        1.6,

      m2:
        2.8,

      x1:
        2,

      y2:
        6,

      y3:
        10,
    })

    .png({
      compressionLevel:
        6,
    })

    .toBuffer()
}


// ============================================================
// ARCHIVAL ENHANCE
// ============================================================

async function archivalEnhance({
  input,
  year,
  layerType,
}) {
  if (
    !input ||
    input.length ===
    0
  ) {
    return null
  }


  let workingInput =
    input


  // ==========================================================
  // 1995 CLEANUP FIRST
  // ==========================================================

  if (
    Number(
      year
    ) ===
    1995
  ) {
    workingInput =
      await clean1995(
        input
      )


    if (
      !workingInput ||
      workingInput.length ===
      0
    ) {
      return null
    }
  }


  // ==========================================================
  // AERIAL
  // ==========================================================

  if (
    layerType ===
    'aerial'
  ) {
    return enhanceAerial({
      input:
        workingInput,

      year,
    })
  }


  // ==========================================================
  // MAP
  // ==========================================================

  return enhanceMap(
    workingInput
  )
}


// ============================================================
// CACHE
// ============================================================

function addToCache(
  key,
  buffer
) {
  if (
    !buffer ||
    buffer.length ===
    0
  ) {
    return
  }


  tileCache.set(
    key,
    buffer
  )


  if (
    tileCache.size <=
    MAX_CACHE_ITEMS
  ) {
    return
  }


  const oldest =
    tileCache
      .keys()
      .next()
      .value


  if (
    oldest
  ) {
    tileCache.delete(
      oldest
    )
  }
}


// ============================================================
// SEND TILE
// ============================================================

function sendTile({
  res,
  buffer,
}) {
  if (
    !buffer ||
    buffer.length ===
    0
  ) {
    res.statusCode =
      404


    res.end(
      'Tile unavailable'
    )


    return
  }


  res.statusCode =
    200


  res.setHeader(
    'Content-Type',
    'image/png'
  )


  res.setHeader(
    'Cache-Control',
    'public, max-age=86400'
  )


  res.end(
    buffer
  )
}


// ============================================================
// ENHANCE HISTORICAL TILES
// ============================================================

export function enhanceHistoricalTiles() {
  return {
    name:
      'geographic-archival-enhance',


    configureServer(
      server
    ) {
      server.middlewares.use(
        '/api/enhance',

        async (
          req,
          res
        ) => {
          try {
            const pathname =
              new URL(
                req.url ||
                '/',

                'http://localhost'
              )
                .pathname


            // ==================================================
            // ROUTE
            // ==================================================
            //
            // Example:
            //
            // /toronto/aerial/1947/19/146529/191314.png
            //
            // ==================================================

            const match =
              pathname.match(
                /^\/([^/]+)\/(map|aerial)\/(\d{4})\/(\d+)\/(\d+)\/(\d+)(?:\.[A-Za-z0-9]+)?$/
              )


            if (
              !match
            ) {
              res.statusCode =
                400


              res.end(
                'Invalid enhanced tile path'
              )


              return
            }


            const [
              ,
              cityKey,
              layerType,
              year,
              z,
              x,
              y,
            ] =
              match


            // ==================================================
            // CITY
            // ==================================================

            const city =
              CITIES[
                cityKey
              ]


            if (
              !city
            ) {
              res.statusCode =
                404


              res.end(
                'City unavailable'
              )


              return
            }


            // ==================================================
            // LAYER
            // ==================================================

            const record =
              getLayerRecord({
                city,
                layerType,
                year,
              })


            if (
              !record
            ) {
              res.statusCode =
                404


              res.end(
                'Layer unavailable'
              )


              return
            }


            // ==================================================
            // CACHE
            // ==================================================

            const cacheKey =
              [
                CACHE_VERSION,
                cityKey,
                layerType,
                year,
                z,
                x,
                y,
              ].join(
                ':'
              )


            const cached =
              tileCache.get(
                cacheKey
              )


            if (
              cached
            ) {
              sendTile({
                res,

                buffer:
                  cached,
              })


              return
            }


            // ==================================================
            // ORIGINAL TILE
            // ==================================================

            const original =
              await fetchOriginalTile({
                record,
                z,
                x,
                y,
              })


            if (
              !original ||
              original.length ===
              0
            ) {
              res.statusCode =
                404


              res.end(
                'Tile unavailable'
              )


              return
            }


            // ==================================================
            // ENHANCE
            // ==================================================

            const enhanced =
              await archivalEnhance({
                input:
                  original,

                year,

                layerType,
              })


            if (
              !enhanced ||
              enhanced.length ===
              0
            ) {
              res.statusCode =
                404


              res.end(
                'Enhancement unavailable'
              )


              return
            }


            // ==================================================
            // CACHE
            // ==================================================

            addToCache(
              cacheKey,
              enhanced
            )


            // ==================================================
            // SEND
            // ==================================================

            sendTile({
              res,

              buffer:
                enhanced,
            })
          }
          catch (
            error
          ) {
            console.error(
              'ARCHIVAL ENHANCE ERROR:',
              error
            )


            res.statusCode =
              500


            res.end(
              'Enhancement unavailable'
            )
          }
        }
      )
    },
  }
}