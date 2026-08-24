import sharp from 'sharp'


export function cleanToronto1995Tiles() {
  return {
    name:
      'toronto-1995-cleanup',


    configureServer(server) {
      server.middlewares.use(
        '/utoronto-clean-1995',

        async (
          req,
          res
        ) => {
          try {
            const tilePath =
              req.url


            if (
              !tilePath
            ) {
              res.statusCode =
                400

              res.end(
                'Missing tile path'
              )

              return
            }


            const upstreamUrl =
              (
                'https://maps.library.utoronto.ca/' +
                'tiles1995' +
                tilePath
              )


            const response =
              await fetch(
                upstreamUrl
              )


            if (
              !response.ok
            ) {
              res.statusCode =
                response.status

              res.end(
                'Tile unavailable'
              )

              return
            }


            const input =
              Buffer.from(
                await response.arrayBuffer()
              )


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


            const width =
              info.width


            const height =
              info.height


            let removedPixels =
              0


            // ==================================================
            // REMOVE ONLY NEAR-PURE WHITE
            // ==================================================
            //
            // Previous cleanup:
            //
            // darkest >= 242
            //
            // was aggressive enough to remove legitimate light
            // photographic detail.
            //
            // This version only removes pixels that are very
            // close to true white.
            //
            // ==================================================

            for (
              let i = 0;
              i < data.length;
              i += 4
            ) {
              const red =
                data[i]


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


              const colourDifference =
                brightest -
                darkest


              if (
                darkest >=
                  252 &&
                colourDifference <=
                  5
              ) {
                data[
                  i + 3
                ] =
                  0


                removedPixels++
              }
            }


            const totalPixels =
              width *
              height


            const removedRatio =
              removedPixels /
              totalPixels


            // ==================================================
            // EMPTY TILE
            // ==========================================================

            if (
              removedRatio >
              0.995
            ) {
              const transparentTile =
                await sharp({
                  create: {
                    width,

                    height,

                    channels:
                      4,

                    background: {
                      r:
                        0,

                      g:
                        0,

                      b:
                        0,

                      alpha:
                        0,
                    },
                  },
                })
                  .png({
                    compressionLevel:
                      6,
                  })
                  .toBuffer()


              res.statusCode =
                200


              res.setHeader(
                'Content-Type',
                'image/png'
              )


              res.setHeader(
                'Cache-Control',
                'no-store'
              )


              res.end(
                transparentTile
              )


              return
            }


            // ==================================================
            // OUTPUT
            // ==========================================================

            const cleaned =
              await sharp(
                data,
                {
                  raw: {
                    width,

                    height,

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


            res.statusCode =
              200


            res.setHeader(
              'Content-Type',
              'image/png'
            )


            res.setHeader(
              'Cache-Control',
              'no-store'
            )


            res.end(
              cleaned
            )
          } catch (
            error
          ) {
            console.error(
              '1995 TILE ERROR:',
              error
            )


            res.statusCode =
              500


            res.end(
              'Tile processing failed'
            )
          }
        }
      )
    },
  }
}