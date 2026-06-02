'use strict'

const WAYPOINTS = [
    { name: 'Porto Antico',       lng: 8.92765, lat: 44.40757 },
    { name: 'Piazza De Ferrari',  lng: 8.93390, lat: 44.40690 },
]

const OSRM_BASE   = 'https://router.project-osrm.org'
const PROFILE     = 'bike'
const MAX_POINTS  = 200

async function main() {
    const coords = WAYPOINTS.map(w => `${w.lng},${w.lat}`).join(';')
    const url = `${OSRM_BASE}/route/v1/${PROFILE}/${coords}?overview=full&geometries=geojson&steps=false`

    console.error(`Fetching route from OSRM...`)
    console.error(`  ${url}\n`)

    let data
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        data = await res.json()
    } catch (err) {
        console.error(`ERROR: Could not reach OSRM — ${err.message}`)
        console.error(`Make sure you are online and try again.`)
        process.exit(1)
    }

    if (data.code !== 'Ok' || !data.routes?.length) {
        console.error(`OSRM returned no route. Response:`, JSON.stringify(data, null, 2))
        process.exit(1)
    }

    const route     = data.routes[0]
    const rawCoords = route.geometry.coordinates
    const distanceM = route.distance
    const durationS = route.duration

    console.error(`Route found:`)
    console.error(`  Distance : ${(distanceM / 1000).toFixed(2)} km`)
    console.error(`  Duration : ${Math.round(durationS / 60)} min (OSRM estimate)`)
    console.error(`  Raw pts  : ${rawCoords.length}`)

    const points = subsample(rawCoords, MAX_POINTS)
    console.error(`  Output pts: ${points.length} (max ${MAX_POINTS})\n`)

    const lines = []
    for (let i = 0; i < points.length; i += 3) {
        const chunk = points.slice(i, i + 3)
        lines.push('  ' + chunk.map(([lng, lat]) => `[${lat.toFixed(5)}, ${lng.toFixed(5)}]`).join(', '))
    }

    const from = WAYPOINTS[0].name
    const to   = WAYPOINTS[WAYPOINTS.length - 1].name

    console.log(`const GENOA_ROUTE = [`)
    console.log(lines.join(',\n'))
    console.log(`]`)
    console.log()
    console.log(`module.exports = {`)
    console.log(`  GENOA_ROUTE,`)
    console.log(`}`)
}

function subsample(arr, maxLen) {
    if (arr.length <= maxLen) return arr
    const result = []
    for (let i = 0; i < maxLen; i++) {
        const idx = Math.round(i * (arr.length - 1) / (maxLen - 1))
        result.push(arr[idx])
    }
    return result
}

main().catch(err => {
    console.error('Fatal:', err)
    process.exit(1)
})
