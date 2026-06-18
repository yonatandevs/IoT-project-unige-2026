/* Computes the great-circle distance in metres between two GPS coordinates
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

function gaussianNoise(mean, std) {
  let u, v
  do {
    u = Math.random()
  } while (u === 0)
  do {
    v = Math.random()
  } while (v === 0)
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function exponentialDelay(meanMs) {
  return -meanMs * Math.log(1 - Math.random())
}

function parkingDelay(bikeId, profiles = {}) {
  const profile = profiles[bikeId] || { minParkingMin: 5, meanParkingMin: 15 }
  const minMs  = profile.minParkingMin  * 60 * 1000
  const meanMs = profile.meanParkingMin * 60 * 1000
  return minMs + exponentialDelay(meanMs)
}
module.exports = { haversineDistance, gaussianNoise, exponentialDelay, parkingDelay }