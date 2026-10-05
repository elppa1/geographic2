let queueTail =
  Promise.resolve()


let queuedCount =
  0


function heapUsedMb() {
  return Math.round(
    process.memoryUsage().heapUsed /
    1024 /
    1024
  )
}


export function queueCommunitySync(
  label,
  task
) {
  queuedCount +=
    1


  const run =
    async () => {
      const startedAt =
        Date.now()


      console.log(
        'COMMUNITY SYNC QUEUE · START',
        {
          label,
          queued:
            Math.max(
              0,
              queuedCount -
              1
            ),
          heapUsedMb:
            heapUsedMb(),
        }
      )


      try {
        return await task()
      }
      finally {
        queuedCount =
          Math.max(
            0,
            queuedCount -
            1
          )


        console.log(
          'COMMUNITY SYNC QUEUE · DONE',
          {
            label,
            durationMs:
              Date.now() -
              startedAt,
            queued:
              queuedCount,
            heapUsedMb:
              heapUsedMb(),
          }
        )
      }
    }


  const queued =
    queueTail.then(
      run,
      run
    )


  queueTail =
    queued.then(
      () => undefined,
      () => undefined
    )


  return queued
}
