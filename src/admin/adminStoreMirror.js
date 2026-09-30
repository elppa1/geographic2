const ADMIN_STORE_MIRROR_ENDPOINT =
  '/api/geographic/toronto/admin-store'


const ADMIN_STORE_MIRROR_KEYS =
  new Set([
    'elppa-geographic-news',
    'elppa-geographic-new',
    'elppa-geographic-news-review',
    'elppa-geographic-new-review',
    'elppa-geographic-scraper-processed',
  ])


const mirrorTimers =
  new Map()


function isAdminPage() {
  if (
    typeof window ===
      'undefined' ||
    typeof fetch !==
      'function'
  ) {
    return false
  }


  const pathname =
    String(
      window.location?.pathname ||
      ''
    )


  return (
    pathname ===
      '/admin' ||
    pathname.startsWith(
      '/admin/'
    )
  )
}


function readLocalRecords(
  key
) {
  try {
    const value =
      localStorage.getItem(
        key
      )


    if (
      !value
    ) {
      return []
    }


    const parsed =
      JSON.parse(
        value
      )


    return Array.isArray(
      parsed
    )
      ? parsed
      : []
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN STORE · POSTGRES SEED READ FAILED:',
      key,
      error?.message ||
      error
    )


    return []
  }
}


async function sendMirror({
  key,
  records,
  mode,
}) {
  if (
    !isAdminPage() ||
    !ADMIN_STORE_MIRROR_KEYS.has(
      key
    ) ||
    !Array.isArray(
      records
    )
  ) {
    return false
  }


  try {
    const response =
      await fetch(
        `${ADMIN_STORE_MIRROR_ENDPOINT}/${encodeURIComponent(
          key
        )}`,
        {
          method:
            'POST',

          credentials:
            'same-origin',

          headers: {
            Accept:
              'application/json',

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              mode,
              records,
            }),
        }
      )


    if (
      !response.ok
    ) {
      throw new Error(
        `HTTP ${response.status}`
      )
    }


    return true
  }
  catch (
    error
  ) {
    console.warn(
      'ADMIN STORE · POSTGRES MIRROR FAILED:',
      key,
      error?.message ||
      error
    )


    return false
  }
}


export function mirrorAdminStoreRecords(
  key,
  records
) {
  if (
    !isAdminPage() ||
    !ADMIN_STORE_MIRROR_KEYS.has(
      key
    )
  ) {
    return
  }


  const existingTimer =
    mirrorTimers.get(
      key
    )


  if (
    existingTimer
  ) {
    window.clearTimeout(
      existingTimer
    )
  }


  const timer =
    window.setTimeout(
      () => {
        mirrorTimers.delete(
          key
        )


        void sendMirror({
          key,
          records,
          mode:
            'write',
        })
      },
      250
    )


  mirrorTimers.set(
    key,
    timer
  )
}


async function seedExistingAdminStores() {
  if (
    !isAdminPage()
  ) {
    return
  }


  for (
    const key
    of ADMIN_STORE_MIRROR_KEYS
  ) {
    await sendMirror({
      key,
      records:
        readLocalRecords(
          key
        ),
      mode:
        'seed',
    })
  }
}


if (
  isAdminPage()
) {
  window.setTimeout(
    () => {
      void seedExistingAdminStores()
    },
    0
  )
}
