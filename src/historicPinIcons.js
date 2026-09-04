// ============================================================
// HISTORIC PIN ICONS
// ============================================================
//
// Stable icon IDs are stored on Historic records.
// The glyph/label can evolve without changing saved records.
//
// ============================================================

export const HISTORIC_PIN_ICON_CATEGORIES = [
  'all',
  'crime',
  'people',
  'death',
  'buildings',
  'transport',
  'nature',
  'institutions',
  'objects',
  'places',
  'mystery',
]


export const HISTORIC_PIN_ICONS = [
  {
    id: 'map-pin',
    emoji: '📍',
    label: 'Map Pin',
    category: 'places',
    keywords: 'location place point marker address',
  },
  {
    id: 'crossroads',
    emoji: '🚦',
    label: 'Crossroads',
    category: 'places',
    keywords: 'intersection road crossing streets traffic',
  },
  {
    id: 'star',
    emoji: '⭐',
    label: 'Landmark',
    category: 'places',
    keywords: 'landmark notable famous star',
  },
  {
    id: 'flag',
    emoji: '🚩',
    label: 'Flag',
    category: 'places',
    keywords: 'flag site location marker',
  },
  {
    id: 'tower',
    emoji: '🗼',
    label: 'Tower',
    category: 'places',
    keywords: 'tower landmark structure',
  },
  {
    id: 'monument',
    emoji: '🗿',
    label: 'Monument',
    category: 'places',
    keywords: 'monument statue memorial landmark',
  },
  {
    id: 'bridge',
    emoji: '🌉',
    label: 'Bridge',
    category: 'places',
    keywords: 'bridge crossing river infrastructure',
  },
  {
    id: 'tunnel',
    emoji: '🚇',
    label: 'Tunnel',
    category: 'places',
    keywords: 'tunnel underground passage',
  },
  {
    id: 'market',
    emoji: '🏪',
    label: 'Market / Shop',
    category: 'places',
    keywords: 'market shop store commercial',
  },

  {
    id: 'knife',
    emoji: '🔪',
    label: 'Knife',
    category: 'crime',
    keywords: 'murder stabbing crime weapon homicide',
  },
  {
    id: 'pistol',
    emoji: '🔫',
    label: 'Firearm',
    category: 'crime',
    keywords: 'murder shooting crime gun firearm homicide',
  },
  {
    id: 'police-car',
    emoji: '🚓',
    label: 'Police',
    category: 'crime',
    keywords: 'police crime investigation arrest',
  },
  {
    id: 'handcuffs',
    emoji: '⛓️',
    label: 'Arrest / Custody',
    category: 'crime',
    keywords: 'arrest custody prison jail handcuffs crime',
  },
  {
    id: 'detective',
    emoji: '🕵️',
    label: 'Investigation',
    category: 'crime',
    keywords: 'detective investigation mystery police crime',
  },
  {
    id: 'warning',
    emoji: '⚠️',
    label: 'Danger / Incident',
    category: 'crime',
    keywords: 'danger incident warning accident crime',
  },
  {
    id: 'fire',
    emoji: '🔥',
    label: 'Fire',
    category: 'crime',
    keywords: 'fire arson blaze disaster incident',
  },

  {
    id: 'person',
    emoji: '👤',
    label: 'Person',
    category: 'people',
    keywords: 'person individual biography resident',
  },
  {
    id: 'missing-person',
    emoji: '👤',
    label: 'Missing Person',
    category: 'people',
    keywords: 'missing disappeared disappearance person lost',
  },
  {
    id: 'family',
    emoji: '👪',
    label: 'Family',
    category: 'people',
    keywords: 'family relatives household people',
  },
  {
    id: 'child',
    emoji: '🧒',
    label: 'Child',
    category: 'people',
    keywords: 'child youth kid young person',
  },
  {
    id: 'worker',
    emoji: '👷',
    label: 'Worker',
    category: 'people',
    keywords: 'worker labour construction job industry',
  },
  {
    id: 'soldier',
    emoji: '🪖',
    label: 'Military',
    category: 'people',
    keywords: 'military soldier war veteran',
  },
  {
    id: 'artist',
    emoji: '🎨',
    label: 'Artist',
    category: 'people',
    keywords: 'artist painter creative culture',
  },
  {
    id: 'writer',
    emoji: '✍️',
    label: 'Writer',
    category: 'people',
    keywords: 'writer author journalist poet',
  },

  {
    id: 'skull',
    emoji: '💀',
    label: 'Death',
    category: 'death',
    keywords: 'death murder fatal dead skull',
  },
  {
    id: 'grave',
    emoji: '🪦',
    label: 'Grave',
    category: 'death',
    keywords: 'grave burial death cemetery tomb',
  },
  {
    id: 'cemetery',
    emoji: '🪦',
    label: 'Cemetery',
    category: 'death',
    keywords: 'cemetery graveyard burial death',
  },
  {
    id: 'coffin',
    emoji: '⚰️',
    label: 'Coffin',
    category: 'death',
    keywords: 'coffin funeral burial death',
  },
  {
    id: 'candle',
    emoji: '🕯️',
    label: 'Memorial',
    category: 'death',
    keywords: 'memorial vigil remembrance candle death',
  },

  {
    id: 'house',
    emoji: '🏠',
    label: 'House',
    category: 'buildings',
    keywords: 'house home residence building',
  },
  {
    id: 'apartment',
    emoji: '🏢',
    label: 'Apartment / Office',
    category: 'buildings',
    keywords: 'apartment office building tower',
  },
  {
    id: 'church',
    emoji: '⛪',
    label: 'Church',
    category: 'buildings',
    keywords: 'church religion worship building',
  },
  {
    id: 'hospital',
    emoji: '🏥',
    label: 'Hospital',
    category: 'buildings',
    keywords: 'hospital medical health building',
  },
  {
    id: 'school',
    emoji: '🏫',
    label: 'School',
    category: 'buildings',
    keywords: 'school education building',
  },
  {
    id: 'factory',
    emoji: '🏭',
    label: 'Factory',
    category: 'buildings',
    keywords: 'factory industry industrial building',
  },
  {
    id: 'bank',
    emoji: '🏦',
    label: 'Bank',
    category: 'buildings',
    keywords: 'bank finance building',
  },
  {
    id: 'theatre',
    emoji: '🎭',
    label: 'Theatre',
    category: 'buildings',
    keywords: 'theatre theater stage entertainment culture',
  },
  {
    id: 'hotel',
    emoji: '🏨',
    label: 'Hotel',
    category: 'buildings',
    keywords: 'hotel lodging building',
  },
  {
    id: 'stadium',
    emoji: '🏟️',
    label: 'Stadium',
    category: 'buildings',
    keywords: 'stadium arena sports venue building',
  },

  {
    id: 'car',
    emoji: '🚗',
    label: 'Car',
    category: 'transport',
    keywords: 'car automobile road transport',
  },
  {
    id: 'streetcar',
    emoji: '🚋',
    label: 'Streetcar',
    category: 'transport',
    keywords: 'streetcar tram ttc transit transport',
  },
  {
    id: 'bus',
    emoji: '🚌',
    label: 'Bus',
    category: 'transport',
    keywords: 'bus ttc transit transport',
  },
  {
    id: 'subway',
    emoji: '🚇',
    label: 'Subway',
    category: 'transport',
    keywords: 'subway metro ttc transit underground',
  },
  {
    id: 'train',
    emoji: '🚂',
    label: 'Train / Railway',
    category: 'transport',
    keywords: 'train railway railroad station transport',
  },
  {
    id: 'bicycle',
    emoji: '🚲',
    label: 'Bicycle',
    category: 'transport',
    keywords: 'bike bicycle cycling transport',
  },
  {
    id: 'airplane',
    emoji: '✈️',
    label: 'Airplane',
    category: 'transport',
    keywords: 'airplane plane airport aviation transport',
  },
  {
    id: 'ship',
    emoji: '🚢',
    label: 'Ship / Harbour',
    category: 'transport',
    keywords: 'ship boat harbour harbor port lake transport',
  },

  {
    id: 'tree',
    emoji: '🌳',
    label: 'Tree / Park',
    category: 'nature',
    keywords: 'tree park forest nature',
  },
  {
    id: 'water',
    emoji: '🌊',
    label: 'Water',
    category: 'nature',
    keywords: 'water lake river flood waterfront',
  },
  {
    id: 'island',
    emoji: '🏝️',
    label: 'Island',
    category: 'nature',
    keywords: 'island beach water nature',
  },
  {
    id: 'flower',
    emoji: '🌸',
    label: 'Garden',
    category: 'nature',
    keywords: 'garden flower park nature',
  },
  {
    id: 'storm',
    emoji: '⛈️',
    label: 'Storm / Weather',
    category: 'nature',
    keywords: 'storm weather rain lightning disaster',
  },
  {
    id: 'snow',
    emoji: '❄️',
    label: 'Snow / Winter',
    category: 'nature',
    keywords: 'snow winter blizzard weather',
  },

  {
    id: 'police-station',
    emoji: '🚔',
    label: 'Police Station',
    category: 'institutions',
    keywords: 'police station law institution',
  },
  {
    id: 'fire-station',
    emoji: '🚒',
    label: 'Fire Station',
    category: 'institutions',
    keywords: 'fire station department institution',
  },
  {
    id: 'court',
    emoji: '⚖️',
    label: 'Court / Law',
    category: 'institutions',
    keywords: 'court law justice legal institution',
  },
  {
    id: 'library',
    emoji: '📚',
    label: 'Library',
    category: 'institutions',
    keywords: 'library archive books institution',
  },
  {
    id: 'university',
    emoji: '🎓',
    label: 'University',
    category: 'institutions',
    keywords: 'university college education institution',
  },
  {
    id: 'museum',
    emoji: '🏛️',
    label: 'Museum / Civic',
    category: 'institutions',
    keywords: 'museum civic government institution history',
  },
  {
    id: 'post-office',
    emoji: '📮',
    label: 'Post Office',
    category: 'institutions',
    keywords: 'post office mail institution',
  },

  {
    id: 'camera',
    emoji: '📷',
    label: 'Photograph',
    category: 'objects',
    keywords: 'camera photo photograph image archive',
  },
  {
    id: 'newspaper',
    emoji: '📰',
    label: 'Newspaper',
    category: 'objects',
    keywords: 'newspaper journalism press article media',
  },
  {
    id: 'book',
    emoji: '📖',
    label: 'Book',
    category: 'objects',
    keywords: 'book publication story literature archive',
  },
  {
    id: 'letter',
    emoji: '✉️',
    label: 'Letter / Mail',
    category: 'objects',
    keywords: 'letter mail correspondence document',
  },
  {
    id: 'telephone',
    emoji: '☎️',
    label: 'Telephone',
    category: 'objects',
    keywords: 'telephone phone call communications',
  },
  {
    id: 'clock',
    emoji: '🕰️',
    label: 'Clock / Time',
    category: 'objects',
    keywords: 'clock time date historic',
  },
  {
    id: 'key',
    emoji: '🔑',
    label: 'Key',
    category: 'objects',
    keywords: 'key object access mystery',
  },
  {
    id: 'money',
    emoji: '💰',
    label: 'Money',
    category: 'objects',
    keywords: 'money finance wealth robbery',
  },
  {
    id: 'microphone',
    emoji: '🎙️',
    label: 'Recording / Radio',
    category: 'objects',
    keywords: 'microphone radio recording audio broadcast',
  },

  {
    id: 'ghost',
    emoji: '👻',
    label: 'Ghost',
    category: 'mystery',
    keywords: 'ghost haunted haunting paranormal mystery',
  },
  {
    id: 'question',
    emoji: '❓',
    label: 'Mystery',
    category: 'mystery',
    keywords: 'mystery unknown question unexplained',
  },
  {
    id: 'eye',
    emoji: '👁️',
    label: 'Witness / Sighting',
    category: 'mystery',
    keywords: 'witness sighting seen eye observation mystery',
  },
  {
    id: 'magnifying-glass',
    emoji: '🔎',
    label: 'Search / Clue',
    category: 'mystery',
    keywords: 'clue search investigation mystery evidence',
  },
  {
    id: 'ufo',
    emoji: '🛸',
    label: 'Unexplained',
    category: 'mystery',
    keywords: 'ufo unexplained strange mystery sighting',
  },
]


export function getHistoricPinIcon(
  value
) {
  const id =
    String(
      value ||
      'map-pin'
    )
      .trim()


  return (
    HISTORIC_PIN_ICONS.find(
      (icon) =>
        icon.id ===
        id
    ) ||
    HISTORIC_PIN_ICONS[0]
  )
}
