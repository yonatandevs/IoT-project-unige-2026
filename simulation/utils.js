/**
 * Computes the great-circle distance in metres between two GPS coordinates
 * using the Haversine formula.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_M = 6_371_000
  const latDiffRad = ((lat2 - lat1) * Math.PI) / 180
  const lonDiffRad = ((lon2 - lon1) * Math.PI) / 180
  const haversine =
    Math.sin(latDiffRad / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(lonDiffRad / 2) ** 2
  return (
    EARTH_RADIUS_M *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}


module.exports = {
  haversineDistance,
}   