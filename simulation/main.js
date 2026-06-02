'use strict'

const mqtt = require('mqtt')
const { BikeSimulator } = require('./BikeSimulator')
const { GENOA_ROUTE } = require('./road_route')

const BIKE_ID    = process.env.BIKE_ID  
const BROKER_URL = process.env.BROKER    
const TICK_MS    = parseInt(process.env.TICK_MS )

const TOPIC_TELEM = `bikes/genoa/${BIKE_ID}/telemetry`
const TOPIC_ALARM = `bikes/genoa/${BIKE_ID}/alarm`

const MQTT_OPTS = {
    clientId: `node-sim-${BIKE_ID}-${Date.now()}`,
    clean:    true,
    reconnectPeriod: 3000,
}

const QOS_TELEM = { qos: 0 }
const QOS_ALARM = { qos: 1, retain: true }

/**
 * Draws a random delay (ms) from an exponential distribution.
 *
 * The exponential distribution models memoryless waiting times, making
 * it well-suited for simulating realistic inter-event gaps (e.g. time
 * before a user picks up a bike, or parking duration between rides).
 *
 * @param {number} meanMs  Expected mean delay in milliseconds (1/λ).
 * @returns {number}       Sampled delay in milliseconds.
 */
function exponentialDelay(meanMs) {
    return -meanMs * Math.log(1 - Math.random())
}

/**
 * Prints the startup banner to stdout.
 */
function printBanner() {
    const pad = (s, n) => s.slice(0, n).padEnd(n)
    console.log('╔══════════════════════════════════════════╗')
    console.log('║   Smart Bike Simulator — Genoa  v2.0     ║')
    console.log(`║   Bike   : ${pad(BIKE_ID, 30)}║`)
    console.log(`║   Broker : ${pad(BROKER_URL, 30)}║`)
    console.log(`║   Tick   : ${pad(String(TICK_MS) + ' ms', 30)}║`)
    console.log('╚══════════════════════════════════════════╝\n')
}

/**
 * Formats and prints a single telemetry payload line to stdout.
 *
 * @param {object} payload  Bike interface payload from `BikeSimulator.getPayload()`.
 */
function logTelemetry(payload) {
    const line = [
        payload.id,
        `${payload.position.lat.toFixed(5)},${payload.position.lng.toFixed(5)}`,
        payload.current_speed.toFixed(1),
        payload.battery.toFixed(1),
        payload.timestamp
    ].join('|')

    console.log(line)
}

/**
 * Attaches the auto-demo ride lifecycle to a simulator instance.
 *
 * Sequence:
 *   1. Wait an exponentially-distributed initial park delay (mean 5 s) before the first ride.
 *   2. When the route finishes, stop the ride and wait another exponentially-distributed
 *      re-ride delay (mean 10 s) before restarting.
 *
 * Both delays use `exponentialDelay` to produce realistic, memoryless waiting times
 * rather than fixed intervals.
 *
 * @param {BikeSimulator} sim  The simulator instance to control.
 */
function attachRideLifecycle(sim) {
    let rideLoopActive  = false
    let routeDoneHandled = false

    setTimeout(() => {
        sim.startRide()
        rideLoopActive = true
    }, exponentialDelay(5_000))

    sim.on('telemetry', ({ payload }) => {
        if (
            rideLoopActive &&
            payload.status === 'rented' &&
            payload.current_speed === 0 &&
            sim._state.route.isFinished &&
            !routeDoneHandled
        ) {
            routeDoneHandled = true
            sim.stopRide()

            setTimeout(() => {
                routeDoneHandled = false
                sim.startRide()
            }, exponentialDelay(8 * 60_000))
        }
    })
}

/**
 * Entry point.
 *
 * Instantiates the simulator, connects to the MQTT broker, wires all
 * simulator events to their respective MQTT topics, and starts the
 * simulation tick loop.
 */
async function main() {
    printBanner()

    const sim    = new BikeSimulator(BIKE_ID, GENOA_ROUTE)
    const client = mqtt.connect(BROKER_URL, MQTT_OPTS)

    client.on('connect', () => {
        console.log(`[MQTT] Connected -> ${BROKER_URL}`)
        console.log(`[TELEMETRY] ${TOPIC_TELEM}`)
        console.log(`[ALARMS] ${TOPIC_ALARM}\n`)

        sim.on('telemetry', ({ payload }) => {
            client.publish(TOPIC_TELEM, JSON.stringify(payload), QOS_TELEM)
            logTelemetry(payload)
        })

        sim.on('alarm', ({ bikeId, reason, position, locked, timestamp }) => {
            const msg = JSON.stringify({ bike_id: bikeId, alarm: reason, ...position, locked, timestamp })
            client.publish(TOPIC_ALARM, msg, QOS_ALARM)
            console.log(`\n[ALARM] ${reason}  LAT: ${position.lat.toFixed(5)}, LNG: ${position.lng.toFixed(5)}\n`)
        })

        sim.on('rideStarted', ({ bikeId, rideId, timestamp }) => {
            console.log(`\n[RIDE STARTED]`)
            console.log(`   Bike  : ${bikeId}`)
            console.log(`   Ride  : ${rideId}`)
            console.log(`   Start : Porto Antico -> Piazza De Ferrari`)
            console.log(`   Time  : ${timestamp}\n`)
        })

        sim.on('rideStopped', ({ bikeId, rideId, durationS, timestamp }) => {
            console.log(`\n[RIDE ENDED]`)
            console.log(`   Bike     : ${bikeId}`)
            console.log(`   Ride     : ${rideId || 'n/a'}`)
            console.log(`   Duration : ${durationS}s`)
            console.log(`   Time     : ${timestamp}\n`)
        })

        attachRideLifecycle(sim)

        const deltaSeconds = TICK_MS / 1000
        setInterval(() => sim.tick(deltaSeconds), TICK_MS)
    })

    client.on('error',     (err) => console.error('[MQTT] Error:', err.message))
    client.on('offline',   ()    => console.warn('[MQTT] Offline - reconnecting...'))
    client.on('reconnect', ()    => console.log('[MQTT] Reconnecting...'))

    process.on('SIGINT', () => {
        console.log('\n\nStopping simulator...')
        client.end(true, () => process.exit(0))
    })
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})