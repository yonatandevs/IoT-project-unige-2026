"use strict"
require("dotenv").config()
const mqtt = require("mqtt")
const { BikeSimulator } = require("./BikeSimulator")
const { haversineDistance, gaussianNoise, exponentialDelay, parkingDelay } = require("./utils")

const { randomUUID } = require("crypto")

const {
  ROUTE_PORTO_ANTICO_TO_PIAZZA_DE_FERRARI,
  ROUTE_STAZIONE_PRINCIPE_TO_PORTO_ANTICO,
  ROUTE_PIAZZA_DE_FERRARI_TO_STAZIONE_BRIGNOLE,
  ROUTE_STAZIONE_BRIGNOLE_TO_STADIO_MARASSI,
  ROUTE_STADIO_MARASSI_TO_STAZIONE_PRINCIPE,
  ROUTE_STAZIONE_BRIGNOLE_TO_OSPEDALE_SAN_MARTINO,
  ROUTE_PORTO_ANTICO_TO_STAZIONE_SAMPIERDARENA,
  ROUTE_STAZIONE_SAMPIERDARENA_TO_FLIXBUS_GENOVA,
  ROUTE_PORTO_ANTICO_TO_BOCCADASSE,
  ROUTE_STAZIONE_BRIGNOLE_TO_MERCATO_ORIENTALE,
  ROUTE_CASTELLETTO_TO_PORTO_ANTICO,
  ROUTE_STAZIONE_BRIGNOLE_TO_PIAZZA_TOMMASEO,
  ROUTE_CASTELLO_ALBERTIS_TO_PORTO_ANTICO,
  ROUTE_QUARTO_DEI_MILLE_TO_BOCCADASSE,
} = require("./road_routes")

const ALL_ROUTES = [
  ROUTE_PORTO_ANTICO_TO_PIAZZA_DE_FERRARI,
  ROUTE_STAZIONE_PRINCIPE_TO_PORTO_ANTICO,
  ROUTE_PIAZZA_DE_FERRARI_TO_STAZIONE_BRIGNOLE,
  ROUTE_STAZIONE_BRIGNOLE_TO_STADIO_MARASSI,
  ROUTE_STADIO_MARASSI_TO_STAZIONE_PRINCIPE,
  ROUTE_STAZIONE_BRIGNOLE_TO_OSPEDALE_SAN_MARTINO,
  ROUTE_PORTO_ANTICO_TO_STAZIONE_SAMPIERDARENA,
  ROUTE_STAZIONE_SAMPIERDARENA_TO_FLIXBUS_GENOVA,
  ROUTE_PORTO_ANTICO_TO_BOCCADASSE,
  ROUTE_STAZIONE_BRIGNOLE_TO_MERCATO_ORIENTALE,
  ROUTE_CASTELLETTO_TO_PORTO_ANTICO,
  ROUTE_STAZIONE_BRIGNOLE_TO_PIAZZA_TOMMASEO,
  ROUTE_CASTELLO_ALBERTIS_TO_PORTO_ANTICO,
  ROUTE_QUARTO_DEI_MILLE_TO_BOCCADASSE,
]

const SCENARIO = process.argv[2] || "normal"

const BIKE_ID = process.argv[3] || `bike-ge-${randomUUID().slice(0, 6)}`
const BROKER_URL = process.env.BROKER_URL
const TICK_MS = parseInt(process.env.TICK_MS)
const TOPIC_TELEMETRY = `bike/${BIKE_ID}/telemetry`
const clientId = `bike-${randomUUID()}`

const MQTT_OPTS = {
  clientId,
  clean: true,
  reconnectPeriod: 5000,
}
const QOS_TELEMETRY = { qos: 0 }

// Delay in ms based on signal strength — weak signal = slower delivery
function getNetworkLatency(rssi) {
  if (rssi >= -65) return Math.max(0, gaussianNoise(50, 15)) // good — ~50ms
  if (rssi >= -75) return Math.max(0, gaussianNoise(120, 30)) // ok — ~120ms
  if (rssi >= -85) return Math.max(0, gaussianNoise(300, 80)) // weak — ~300ms
  return Math.max(0, gaussianNoise(800, 200)) // very weak — ~800ms
}

function findClosestRoute(currentPos, routes) {
  let bestRoute = null
  let bestDist = Infinity
  for (const route of routes) {
    const dist = haversineDistance(
      currentPos.lat,
      currentPos.lng,
      route[0][0],
      route[0][1],
    )
    if (dist < bestDist) {
      bestDist = dist
      bestRoute = route
    }
  }
  return bestRoute
}



function attachRideLifecycle(sim) {
  sim.on("routeFinished", () => {
    sim.stopRide()
    const delay = parkingDelay(BIKE_ID) 
    console.log(`[PARKING] next ride in ${Math.round(delay / 60000)} min`)
    setTimeout(() => {
      const nextRoute = findClosestRoute(sim.state.position, ALL_ROUTES)
      sim.startRide(nextRoute)
    }, delay)
  })
}
async function main() {
  const startRoute = ALL_ROUTES[Math.floor(Math.random() * ALL_ROUTES.length)]
  const sim = new BikeSimulator(BIKE_ID, startRoute, SCENARIO)
  const mqttClient = mqtt.connect(BROKER_URL, MQTT_OPTS)

  mqttClient.on("connect", () => {
    console.log(
      `Connected to MQTT broker at ${BROKER_URL} with client ID ${clientId}`,
    )

    sim.on("rideStarted", (data) => {
      console.log(`\n[RIDE STARTED]`)
      console.log(`  Bike  : ${data.bikeId}`)
      console.log(`  Ride  : ${data.rideId}`)
      console.log(`  Time  : ${data.timestamp}\n`)
    })

    sim.on("rideStopped", (data) => {
      console.log(`\n[RIDE ENDED]`)
      console.log(`  Bike     : ${data.bikeId}`)
      console.log(`  Ride     : ${data.rideId}`)
      console.log(`  Duration : ${data.duration}s`)
      console.log(`  Time     : ${data.timestamp}\n`)
    })

    sim.on("telemetry", ({ payload }) => {
      console.log(JSON.stringify(payload, null, 2))

      const delay = getNetworkLatency(payload.rssi)

      // Log high latency so we can see it during the demo
      if (delay > 400) {
        console.log(
          `[LATENCY] ${Math.round(delay)}ms  (rssi: ${payload.rssi} dBm)`,
        )
      }

      setTimeout(() => {
        mqttClient.publish(
          TOPIC_TELEMETRY,
          JSON.stringify(payload),
          QOS_TELEMETRY,
          (err) => {
            if (err)
              console.error(`Failed to publish telemetry: ${err.message}`)
          },
        )
      }, delay)
    })

    attachRideLifecycle(sim)
    sim.startRide()
    setInterval(() => sim.tick(TICK_MS / 1000), TICK_MS)
  })

  mqttClient.on("error", (err) => {
    console.error(err.message)
  })

  process.on("SIGINT", () => {
    console.log("Shutting down...")
    sim.stopRide()

    // Publish one final telemetry so Influx gets the available/locked state
    const finalPayload = sim.state.toPayload()
    mqttClient.publish(
      TOPIC_TELEMETRY,
      JSON.stringify(finalPayload),
      { qos: 1 },
      (err) => {
        if (err)
          console.error(`Failed to publish final telemetry: ${err.message}`)
        mqttClient.end()
        process.exit(0)
      },
    )
  })
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
