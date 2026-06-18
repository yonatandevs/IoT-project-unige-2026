"use strict"
const { randomUUID } = require("crypto")
const { EventEmitter } = require("events")
const { haversineDistance } = require("./utils")

const COVERAGE_ZONES = [
  { latMin: 44.406, latMax: 44.412, lngMin: 8.926, lngMax: 8.93,  rssiMean: -58, rssiStd: 6  },
  { latMin: 44.407, latMax: 44.413, lngMin: 8.932, lngMax: 8.938, rssiMean: -82, rssiStd: 8  },
  { latMin: 44.41,  latMax: 44.417, lngMin: 8.882, lngMax: 8.9,   rssiMean: -72, rssiStd: 10 },
  { latMin: 44.405, latMax: 44.41,  lngMin: 8.94,  lngMax: 8.95,  rssiMean: -61, rssiStd: 7  },
  { latMin: 44.404, latMax: 44.408, lngMin: 8.968, lngMax: 8.978, rssiMean: -67, rssiStd: 8  },
]

function getRssiForPosition(lat, lng) {
  for (const zone of COVERAGE_ZONES) {
    if (lat >= zone.latMin && lat <= zone.latMax && lng >= zone.lngMin && lng <= zone.lngMax) {
      return gaussianNoise(zone.rssiMean, zone.rssiStd)
    }
  }
  return gaussianNoise(-65, 10)
}

function rssiToDropProbability(rssi) {
  if (rssi >= -65) return 0.01
  if (rssi >= -75) return 0.05
  if (rssi >= -85) return 0.25
  if (rssi >= -95) return 0.6
  return 0.9
}

function gaussianNoise(mean, standardDeviation) {
  let randomA, randomB
  do { randomA = Math.random() } while (randomA === 0)
  do { randomB = Math.random() } while (randomB === 0)
  return mean + standardDeviation * Math.sqrt(-2 * Math.log(randomA)) * Math.cos(2 * Math.PI * randomB)
}

class GPSRoute {
  constructor(waypoints) {
    this.waypoints = waypoints
    this.index = 0
  }
  get isFinished() { return this.index >= this.waypoints.length }
  current() {
    if (!this.isFinished) {
      const [lat, lng] = this.waypoints[this.index]
      return { lat, lng }
    }
    return null
  }
  next() {
    if (!this.isFinished && this.index + 1 < this.waypoints.length) {
      const [lat, lng] = this.waypoints[this.index + 1]
      return { lat, lng }
    }
    return null
  }
  advance() { if (!this.isFinished) return this.index++ }
  reset() { return (this.index = 0) }
}

class IMUModel {
  constructor() { this._prev = { x: 0, y: 0, z: 9.8 } }
  compute({ speedMs, isRiding }) {
    let x, y, z
    if (!isRiding) {
      x = gaussianNoise(0, 0.02)
      y = gaussianNoise(0, 0.02)
      z = gaussianNoise(9.8, 0.05)
    } else {
      x = gaussianNoise(0, 0.15)
      y = gaussianNoise(0, 0.1)
      z = gaussianNoise(9.8, 0.1 + speedMs * 0.02)
    }
    const dx = x - this._prev.x
    const dy = y - this._prev.y
    const dz = z - this._prev.z
    this._prev = { x, y, z }
    return { x, y, z, dx, dy, dz }
  }
  reset() { this._prev = { x: 0, y: 0, z: 9.8 } }
}

class BikeState {
  constructor(id, waypoints) {
    this.id = id
    this.route = new GPSRoute(waypoints)
    this.position = this.route.current()
    this.status = "available"
    this.locked = true
    this.battery = 85
    this.current_speed = 0
    this.timestamp = new Date().toISOString()
    this.current_ride = ""
    this.imu = { x: 0, y: 0, z: 9.8, dx: 0, dy: 0, dz: 0 }
    this.rssi = 0
  }
  toPayload() {
    return {
      id: this.id,
      current_ride: this.current_ride,
      position: this.position,
      status: this.status,
      locked: this.locked,
      battery: this.battery,
      current_speed: this.current_speed,
      timestamp: this.timestamp,
      imu: this.imu,
      rssi: this.rssi,
    }
  }
}

class BikeSimulator extends EventEmitter {
  constructor(id, waypoints, scenario = "normal") {
    super()
    this.id = id
    this.state = new BikeState(id, waypoints)
    this.imuModel = new IMUModel()
    this._scenario = scenario
    this._tickCount = 0
    this.routeFinishedEmitted = false
  }

  startRide(route = null) {
    this.routeFinishedEmitted = false
    if (route) {
      this.state.route = new GPSRoute(route)
      this.state.position = this.state.route.current()
    } else {
      this.state.route.reset()
    }
    this.state.status = "rented"
    this.state.locked = false
    this.state.current_ride = `ride-${randomUUID()}`
    this.state._rideStartMs = Date.now()
    this.imuModel.reset()
    this.emit("rideStarted", {
      bikeId: this.id,
      rideId: this.state.current_ride,
      timestamp: this.state.timestamp,
    })
  }

  stopRide() {
    this.state.status = "available"
    this.state.locked = true
    const temp = this.state.current_ride
    this.state.current_ride = ""
    this.state.current_speed = 0
    const durationS = this.state._rideStartMs
      ? Math.round((Date.now() - this.state._rideStartMs) / 1000)
      : 0
    this.imuModel.reset()
    this.emit("rideStopped", {
      bikeId: this.id,
      rideId: temp,
      timestamp: new Date().toISOString(),
      duration: durationS,
    })
  }

  tick(deltaSeconds) {
    this.state.timestamp = new Date().toISOString()

    if (this.state.status === "rented" && this.state.locked === false && !this.state.route.isFinished) {
      const targetSpeedKmh = 14 + gaussianNoise(0, 3)
      const speedKmh = Math.min(25, Math.max(8, targetSpeedKmh))
      const speedMs = speedKmh / 3.6
      const distance = speedMs * deltaSeconds
      this.state.current_speed = speedMs * 3.6

      let metersLeft = distance
      while (metersLeft > 0 && !this.state.route.isFinished) {
        const waypoint = this.state.route.current()
        const distToWaypoint = haversineDistance(
          this.state.position.lat, this.state.position.lng,
          waypoint.lat, waypoint.lng,
        )
        if (metersLeft >= distToWaypoint) {
          this.state.position = waypoint
          metersLeft -= distToWaypoint
          this.state.route.advance()
        } else {
          const fraction = metersLeft / distToWaypoint
          this.state.position.lat += fraction * (waypoint.lat - this.state.position.lat)
          this.state.position.lng += fraction * (waypoint.lng - this.state.position.lng)
          metersLeft = 0
        }
      }

      const batteryDrain = (distance / 50000) * 100
      this.state.battery = Math.max(0, this.state.battery - batteryDrain)
    }

    const isRiding = this.state.status === "rented" && !this.state.locked
    this.state.imu = this.imuModel.compute({ speedMs: this.state.current_speed / 3.6, isRiding })

    this._tickCount++

    if (this._scenario === "fall" && this._tickCount === 10) {
      console.log("[SCENARIO] Injecting fall event")
      this.state.imu = { x: 8.5, y: 0.2, z: 1.1, dx: 0, dy: 0, dz: 0 }
    }

    if (this._scenario === "low_battery" && this._tickCount === 1) {
      console.log("[SCENARIO] Injecting low battery")
      this.state.battery = 15
    }

    const pos = this.state.position
    this.state.rssi = pos
      ? Math.round(getRssiForPosition(pos.lat, pos.lng))
      : Math.round(gaussianNoise(-65, 10))

    if (this.state.status === "rented" && this.state.route.isFinished && !this.routeFinishedEmitted) {
      this.routeFinishedEmitted = true
      this.emit("routeFinished")
    }

    if (Math.random() < rssiToDropProbability(this.state.rssi)) {
      return
    }

    this.emit("telemetry", { payload: this.state.toPayload() })
  }
}

module.exports = { BikeSimulator }