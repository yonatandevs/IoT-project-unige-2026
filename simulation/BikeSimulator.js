"use strict"
const { randomUUID } = require("crypto")
const { EventEmitter } = require("events")
const { haversineDistance } = require("./utils")

/**
 * Generates a random number following a Gaussian (normal) distribution.
 * @param {number} mean - The center value (average speed we want)
 * @param {number} standardDeviation - How much the value can vary around the mean
 * @returns {number} A random value centered around mean
 */
function gaussianNoise(mean, standardDeviation) {
  let randomA, randomB
  do { randomA = Math.random() } while (randomA === 0)
  do { randomB = Math.random() } while (randomB === 0)
  return (
    mean +
    standardDeviation *
      Math.sqrt(-2 * Math.log(randomA)) *
      Math.cos(2 * Math.PI * randomB)
  )
}

/**
 * Manages a fixed sequence of GPS waypoints and an advancing cursor.
 * Waypoints are consumed one by one as the simulation progresses.
 * Call reset() to restart the route from the beginning.
 */
class GPSRoute {
  constructor(waypoints) {
    this.waypoints = waypoints
    this.index = 0
  }

  get isFinished() {
    return this.index >= this.waypoints.length
  }

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

  advance() {
    if (!this.isFinished) return this.index++
  }

  reset() {
    return (this.index = 0)
  }
}

/**
 * Produces physically coherent IMU readings.
 */
class IMUModel {
  compute({ speedMs, isRiding }) {
    if (!isRiding) {
      return {
        x: gaussianNoise(0, 0.02),
        y: gaussianNoise(0, 0.02),
        z: gaussianNoise(9.8, 0.05),
        dx: gaussianNoise(0, 0.05),
        dy: gaussianNoise(0, 0.05),
        dz: gaussianNoise(0, 0.03),
      }
    }
    return {
      x: gaussianNoise(0, 0.15),
      y: gaussianNoise(0, 0.1),
      z: gaussianNoise(9.8, 0.1 + speedMs * 0.02),
      dx: gaussianNoise(0, 0.05),
      dy: gaussianNoise(0, 0.05),
      dz: gaussianNoise(0, 0.03),
    }
  }
}

/**
 * Holds all mutable simulation state for a single bike.
 */
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

/**
 * Physics-driven e-bike simulator.
 * Supports scenario injection for demo/testing purposes.
 *
 * Scenarios:
 *   normal      — standard simulation
 *   fall        — injects fall IMU values at tick 10
 *   low_battery — forces battery to 12% at tick 1
 */
class BikeSimulator extends EventEmitter {
  constructor(id, waypoints, scenario = 'normal') {
    super()
    this.id = id
    this.state = new BikeState(id, waypoints)
    this.imuModel = new IMUModel()
    this._scenario = scenario
    this._tickCount = 0
  }

  startRide(route = null) {
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
    this.emit("rideStopped", {
      bikeId: this.id,
      rideId: temp,
      timestamp: new Date().toISOString(),
      duration: durationS,
    })
  }

  tick(deltaSeconds) {
    this.state.timestamp = new Date().toISOString()

    if (
      this.state.status === "rented" &&
      this.state.locked === false &&
      !this.state.route.isFinished
    ) {
      const targetSpeedKmh = 14 + gaussianNoise(0, 3)
      const speedKmh = Math.min(25, Math.max(8, targetSpeedKmh))
      const speedMs = speedKmh / 3.6
      const distance = speedMs * deltaSeconds
      this.state.current_speed = speedMs * 3.6

      let metersLeft = distance
      while (metersLeft > 0 && !this.state.route.isFinished) {
        const waypoint = this.state.route.current()
        const distToWaypoint = haversineDistance(
          this.state.position.lat,
          this.state.position.lng,
          waypoint.lat,
          waypoint.lng,
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

      // Assume 100% battery allows for 50km.
      const batteryDrain = (distance / 50000) * 100
      this.state.battery = Math.max(0, this.state.battery - batteryDrain)
    }

    const isRiding = this.state.status === "rented" && !this.state.locked
    this.state.imu = this.imuModel.compute({
      speedMs: this.state.current_speed / 3.6,
      isRiding,
    })
    this.state.rssi = Math.round(gaussianNoise(-65, 10))

    // Increment tick counter
    this._tickCount++

    // Scenario injection
    if (this._scenario === 'fall' && this._tickCount === 10) {
      console.log('[SCENARIO] Injecting fall event')
      this.state.imu = { x: 8.5, y: 0.2, z: 1.1, dx: 0, dy: 0, dz: 0 }
    }

    if (this._scenario === 'low_battery' && this._tickCount === 1) {
      console.log('[SCENARIO] Injecting low battery')
      this.state.battery = 15
    }

    this.emit("telemetry", { payload: this.state.toPayload() })
  }
}

module.exports = { BikeSimulator }
