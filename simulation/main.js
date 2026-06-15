"use strict"
require("dotenv").config()
const mqtt = require("mqtt")
const { BikeSimulator } = require("./BikeSimulator")
const { haversineDistance } = require("./utils")
const {
  ROUTE_PORTO_ANTICO_TO_PIAZZA_DE_FERRARI,
  ROUTE_STAZIONE_PRINCIPE_TO_PORTO_ANTICO,
  ROUTE_PIAZZA_DE_FERRARI_TO_STAZIONE_BRIGNOLE,
  ROUTE_STAZIONE_BRIGNOLE_TO_STADIO_MARASSI,
  ROUTE_STADIO_MARASSI_TO_STAZIONE_PRINCIPE,
} = require("./road_routes")
const { randomUUID } = require("crypto")

const ALL_ROUTES = [
  ROUTE_PORTO_ANTICO_TO_PIAZZA_DE_FERRARI,
  ROUTE_STAZIONE_PRINCIPE_TO_PORTO_ANTICO,
  ROUTE_PIAZZA_DE_FERRARI_TO_STAZIONE_BRIGNOLE,
  ROUTE_STAZIONE_BRIGNOLE_TO_STADIO_MARASSI,
  ROUTE_STADIO_MARASSI_TO_STAZIONE_PRINCIPE,
]

const SCENARIO = process.argv[2] || "normal"

const BIKE_ID = `bike-ge-${randomUUID().slice(0, 6)}`
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

function exponentialDelay(meanMs) {
  return -meanMs * Math.log(1 - Math.random())
}

function attachRideLifecycle(sim) {
  let rideEnded = false
  sim.on("telemetry", ({ payload }) => {
    if (sim.state.route.isFinished && !rideEnded) {
      rideEnded = true
      sim.stopRide()
      setTimeout(() => {
        rideEnded = false
        const nextRoute = findClosestRoute(sim.state.position, ALL_ROUTES)
        sim.startRide(nextRoute)
      }, exponentialDelay(30_000))
    }
  })
}

async function main() {
  const sim = new BikeSimulator(
    BIKE_ID,
    ROUTE_PORTO_ANTICO_TO_PIAZZA_DE_FERRARI.slice(0, 15),
    SCENARIO,
  )
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
      mqttClient.publish(
        TOPIC_TELEMETRY,
        JSON.stringify(payload),
        QOS_TELEMETRY,
        (err) => {
          if (err) console.error(`Failed to publish telemetry: ${err.message}`)
        },
      )
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
    mqttClient.end()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
