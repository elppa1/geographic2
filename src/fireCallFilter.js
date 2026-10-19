// Toronto Fire CAD call-type exclusion policy.
// Match the OFFICIAL incident classification, never the free-text description,
// alarm level or responding unit types. Keep higher-alarm fire handling intact.
const excludedFireType = /^(?:fire[\s-]*alarm[\s\-/:]*check[\s-]*calls?|check[\s-]*calls?|water[\s-]*problems?|haz[\s-]*mat(?:erials)?|hazardous[\s-]*materials?|elevator[\s-]*rescues?|rescue[\s\-/:]*elevators?)\b/i

export function isExcludedTorontoFireCall(record) {
  if (!record || typeof record !== 'object') return false

  const provenance = String([
    record.sourceKey,
    record.source,
    record.scraperSource,
    record.newsroomSource,
    record.origin,
  ].filter(Boolean).join(' ')).toLowerCase()
  const category = String(record.category || '').trim().toLowerCase()
  const officialFire = /\bfire\b|toronto-fire/.test(provenance)
  // Never apply the Fire-only policy to explicitly non-Fire records.
  if (category && category !== 'fire' && !officialFire) return false
  if (record.sourceKey && record.sourceKey !== 'fire' && !officialFire && category !== 'fire') return false

  // Incident types are authoritative where available. Only inspect titles
  // for older Fire records that were stored without an incident-type field.
  const incidentType = String(
    record.fireIncidentType ||
    record.incidentType ||
    record.incomingRecord?.fireIncidentType ||
    record.incomingRecord?.incidentType ||
    ''
  ).trim()
  if (incidentType) return excludedFireType.test(incidentType.replace(/[–—−]/g, '-'))

  if (category !== 'fire' && !officialFire) return false

  // Legacy official Fire headlines start with their incident classification.
  // No matching against the rest of the title or the description.
  const titleType = String(record.title || '').trim()
  return excludedFireType.test(titleType.replace(/[–—−]/g, '-'))
}
