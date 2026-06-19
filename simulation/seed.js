"use strict"
const { parkingDelay } = require("./utils")
const { BikeSimulator } = require("./BikeSimulator.js")
const fs = require("fs")
const { InfluxDB, Point } = require("@influxdata/influxdb-client")

const jsonlStream = fs.createWriteStream("bike-ge-001.jsonl")
const INFLUX_URL   = process.env.INFLUX_URL   || "http://localhost:8086"
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || "dev-token-change-in-production"
const INFLUX_ORG   = process.env.INFLUX_ORG   || "iot-bikes"
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || "bike_data"
const influx = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
const writeApi = influx.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, "ns")

const BIKE_IDS = [
  "bike-ge-001",
  "bike-ge-002",
  "bike-ge-003",
  "bike-ge-004",
  "bike-ge-005",
]

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

const BIKE_PROFILES = {
  "bike-ge-001": { minParkingMin: 5, meanParkingMin: 15 },
  "bike-ge-002": { minParkingMin: 5, meanParkingMin: 30 },
  "bike-ge-003": { minParkingMin: 10, meanParkingMin: 60 },
  "bike-ge-004": { minParkingMin: 5, meanParkingMin: 20 },
  "bike-ge-005": { minParkingMin: 15, meanParkingMin: 90 },
}

const DAYS = 7
const TICK_S = 60
const NEW_RIDE_GAP_MS = 5 * 60 * 1000

function pickRoute() {
  return ALL_ROUTES[Math.floor(Math.random() * ALL_ROUTES.length)]
}

function writePoint(payload, ts) {
  const record = {
    bikeId: payload.id,
    lat: payload.position?.lat ?? null,
    lng: payload.position?.lng ?? null,
    speed: payload.current_speed,
    battery: payload.battery,
    locked: payload.locked,
    status: payload.status,
    rideId: payload.current_ride || null,
    imu_x: payload.imu.x,
    imu_y: payload.imu.y,
    imu_z: payload.imu.z,
    imu_dx: payload.imu.dx,
    imu_dy: payload.imu.dy,
    imu_dz: payload.imu.dz,
    timestamp: new Date(ts).toISOString(),
  }

  jsonlStream.write(JSON.stringify(record) + "\n")

  const point = new Point("bike")
    .tag("id", payload.id)
    .floatField("lat", payload.position?.lat ?? 0)
    .floatField("lng", payload.position?.lng ?? 0)
    .floatField("current_speed", payload.current_speed)
    .floatField("battery", payload.battery)
    .booleanField("locked", payload.locked)
    .stringField("status", payload.status)
    .stringField("current_ride", payload.current_ride || "")
    .floatField("imu_x", payload.imu.x)
    .floatField("imu_y", payload.imu.y)
    .floatField("imu_z", payload.imu.z)
    .floatField("imu_dx", payload.imu.dx)
    .floatField("imu_dy", payload.imu.dy)
    .floatField("imu_dz", payload.imu.dz)
    .timestamp(new Date(ts))

  writeApi.writePoint(point)
}

async function main() {
  const now = Date.now()
  const start = now - DAYS * 24 * 60 * 60 * 1000

  for (const bikeId of BIKE_IDS) {
    console.log(`Bike ${bikeId}`)
    let currentMs = start
    let tickTs = currentMs

    while (currentMs < now) {
      const route = pickRoute()
      const sim = new BikeSimulator(bikeId, route)

      sim.on("telemetry", ({ payload }) => {
        writePoint(payload, tickTs)
      })

      sim.startRide(route)

      while (!sim.state.route.isFinished && currentMs < now) {
        tickTs = currentMs
        sim.tick(TICK_S)
        currentMs += TICK_S * 1000
      }

      sim.stopRide()

      tickTs = currentMs
      sim.tick(TICK_S)

      const parkingDurationMs = parkingDelay(bikeId, BIKE_PROFILES)
      const parkingEndMs = currentMs + parkingDurationMs

      if (parkingEndMs < now) {
        tickTs = parkingEndMs
        sim.tick(TICK_S)
      } else {
        tickTs = now - 1000
        sim.tick(TICK_S)
      }

      currentMs = parkingEndMs + NEW_RIDE_GAP_MS

      if (sim.state.battery < 15) {
        sim.state.battery = 85
      }
    }
  }

  jsonlStream.end()
  await writeApi.close()
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
