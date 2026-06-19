'use strict'

const ROUTES = [
  [
    { name: 'Porto Antico',      lng: 8.92861, lat: 44.40904 },
    { name: 'Piazza De Ferrari', lng: 8.93394, lat: 44.40737 },
  ],
  [
    { name: 'Stazione Principe', lng: 8.92193, lat: 44.41655 },
    { name: 'Porto Antico',      lng: 8.92861, lat: 44.40904 },
  ],
  [
    { name: 'Piazza De Ferrari', lng: 8.93394, lat: 44.40737 },
    { name: 'Stazione Brignole', lng: 8.94575, lat: 44.40733 },
  ],
  [
    { name: 'Stazione Brignole', lng: 8.94575, lat: 44.40733 },
    { name: 'Stadio Marassi',    lng: 8.94926, lat: 44.41812 },
  ],
  [
    { name: 'Stadio Marassi',    lng: 8.94926, lat: 44.41812 },
    { name: 'Stazione Principe', lng: 8.92193, lat: 44.41655 },
  ],
  [
    { name: 'Stazione Brignole',    lng: 8.94575, lat: 44.40733 },
    { name: 'Ospedale San Martino', lng: 8.97435, lat: 44.41055 },
  ],
  [
    { name: 'Porto Antico',           lng: 8.92861, lat: 44.40904 },
    { name: 'Stazione Sampierdarena', lng: 8.88739, lat: 44.41318 },
  ],
  [
    { name: 'Stazione Sampierdarena', lng: 8.88739, lat: 44.41318 },
    { name: 'FlixBus Genova',         lng: 8.91884, lat: 44.41613 },
  ],
  [
    { name: 'Porto Antico', lng: 8.92861, lat: 44.40904 },
    { name: 'Boccadasse', lng: 8.97343, lat: 44.39007 },
  ],
  [
    { name: 'Stazione Brignole', lng: 8.94575, lat: 44.40733 },
    { name: 'Mercato Orientale', lng: 8.94201, lat: 44.40579 },
  ],
  [
    { name: 'Castelletto', lng: 8.93305, lat: 44.41342 },
    { name: 'Porto Antico', lng: 8.92861, lat: 44.40904 },
  ],
  [
    { name: 'Stazione Brignole', lng: 8.94575, lat: 44.40733 },
    { name: 'Piazza Tommaseo', lng: 8.95398, lat: 44.40198 },
  ],
  [
    { name: 'Castello Albertis', lng: 8.92461, lat: 44.41852 },
    { name: 'Porto Antico', lng: 8.92861, lat: 44.40904 },
  ],
  [
    { name: 'Quarto Dei Mille', lng: 8.98543, lat: 44.39232 },
    { name: 'Boccadasse', lng: 8.97343, lat: 44.39007 },
  ],
]

const OSRM_BASE = 'https://router.project-osrm.org'
const PROFILE  = 'bike'
const MAX_POINTS = 200

function subsample(arr, maxLen) {
  if (arr.length <= maxLen) return arr
  const result = []
  for (let i = 0; i < maxLen; i++) {
    const idx = Math.round(i * (arr.length - 1) / (maxLen - 1))
    result.push(arr[idx])
  }
  return result
}

async function fetchRoute(waypoints) {
  const coords = waypoints.map(w => `${w.lng},${w.lat}`).join(';')
  const url = `${OSRM_BASE}/route/v1/${PROFILE}/${coords}?overview=full&geometries=geojson&steps=false`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found')
  const route = data.routes[0]
  const points = subsample(route.geometry.coordinates, MAX_POINTS)
  const from = waypoints[0].name
  const to   = waypoints[waypoints.length - 1].name
  console.error(`  ${from} → ${to} : ${(route.distance/1000).toFixed(2)}km, ${Math.round(route.duration/60)}min, ${points.length}pts`)
  return { from, to, points }
}

async function main() {
  console.error('Fetching all routes from OSRM...\n')
  const results = []
  for (const waypoints of ROUTES) {
    const route = await fetchRoute(waypoints)
    results.push(route)
  }

  console.log('\'use strict\'')
  console.log('')
  for (const { from, to, points } of results) {
    const varName = `ROUTE_${from.replace(/\s+/g, '_').toUpperCase()}_TO_${to.replace(/\s+/g, '_').toUpperCase()}`
    const lines = []
    for (let i = 0; i < points.length; i += 3) {
      const chunk = points.slice(i, i + 3)
      lines.push('  ' + chunk.map(([lng, lat]) => `[${lat.toFixed(5)}, ${lng.toFixed(5)}]`).join(', '))
    }
    console.log(`const ${varName} = [`)
    console.log(lines.join(',\n'))
    console.log(`]`)
    console.log('')
  }

  console.log('module.exports = {')
  for (const { from, to } of results) {
    const varName = `ROUTE_${from.replace(/\s+/g, '_').toUpperCase()}_TO_${to.replace(/\s+/g, '_').toUpperCase()}`
    console.log(`  ${varName},`)
  }
  console.log('}')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})