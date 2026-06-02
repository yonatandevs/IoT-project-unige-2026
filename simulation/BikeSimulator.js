"use strict"

const { EventEmitter } = require("events")

const EARTH_RADIUS_M = 6_371_000
const BATTERY_CAPACITY_WH = 400
const TOTAL_MASS_KG = 90
const C_RR = 0.005
const CDA = 0.5
const RHO_AIR = 1.2
const G = 9.80665
const ETA_MOTOR = 0.85
const ETA_REGEN = 0.2

/**
 * Draws a sample from a Gaussian distribution using the Box-Muller transform.
 *
 * @param {number} [mean=0]  Distribution mean.
 * @param {number} [std=1]   Standard deviation.
 * @returns {number}
 */
function gaussianNoise(mean = 0, std = 1) {
  let u, v
  do {
    u = Math.random()
  } while (u === 0)
  do {
    v = Math.random()
  } while (v === 0)
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Computes the great-circle distance in metres between two GPS coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}  Distance in metres.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Computes the initial bearing (radians, range [-π, π]) from point A to point B.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}  Bearing in radians.
 */
function bearing(lat1, lon1, lat2, lon2) {
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180
  const deltaLonRad = ((lon2 - lon1) * Math.PI) / 180

  return Math.atan2(
    Math.sin(deltaLonRad) * Math.cos(lat2Rad),
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad),
  )
}

/**
 * Estimates the terrain slope (radians) between two consecutive GPS waypoints
 * using a lightweight heuristic calibrated for the Genoa coastal hillside.
 *
 * Porto Antico sits at ~5 m asl and Piazza De Ferrari at ~20 m asl.
 * Northward movement (positive ΔLat) is treated as climbing; southward as descending.
 * The scale factor (0.012 × 600 000) maps one degree of latitude to roughly 7 200 m
 * of elevation change, tuned so the overall route yields a ~0.6 % average gradient.
 *
 * Replace with a real DEM/SRTM lookup when a digital elevation model is available.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @param {number} distanceM  Horizontal segment length in metres.
 * @returns {number}          Slope angle in radians (positive = uphill).
 */
function estimateSlope(lat1, lon1, lat2, lon2, distanceM) {
  if (distanceM < 0.1) return 0
  const dLat = lat2 - lat1
  const dElevEst = dLat * 600_000 * 0.012
  return Math.atan2(dElevEst, distanceM)
}

/**
 * Computes motor power and estimates battery usage over a time step.
 *
 * Forces considered:
 * - Rolling resistance
 * - Air drag
 * - Slope (gravity component)
 * - Acceleration
 *
 * Power is roughly:
 * P = total_force × speed (adjusted for efficiency)
 *
 * Positive power drains the battery; negative power means regen braking.
 *
 * Example:
 * A bike moving at 6 m/s uphill with moderate acceleration will:
 * - increase power demand due to gravity (slope)
 * - increase drag due to speed
 * - slightly increase demand due to acceleration
 *
 * This results in higher battery consumption compared to flat terrain,
 * and could even return negative power during downhill braking.
 */
class PhysicsEngine {
  /**
   * Returns the net electrical power (W) drawn from the battery.
   * A negative value indicates energy flowing back during regenerative braking.
   *
   * @param {object} p
   * @param {number} p.speedMs    Current speed in m/s.
   * @param {number} p.accelMs2  Instantaneous longitudinal acceleration in m/s².
   * @param {number} p.slopeRad  Terrain slope in radians (positive = uphill).
   * @returns {number}  Net power in watts.
   */
  computePower({ speedMs, accelMs2, slopeRad }) {
    const cosθ = Math.cos(slopeRad)
    const sinθ = Math.sin(slopeRad)
    const F_roll = C_RR * TOTAL_MASS_KG * G * cosθ
    const F_air = 0.5 * RHO_AIR * CDA * speedMs * speedMs
    const F_slope = TOTAL_MASS_KG * G * sinθ
    const F_acc = TOTAL_MASS_KG * accelMs2
    const P_mech = (F_roll + F_air + F_slope + F_acc) * speedMs
    return P_mech >= 0 ? P_mech / ETA_MOTOR : P_mech * ETA_REGEN
  }

  /**
   * Converts a power draw over a time step into a battery state-of-charge delta.
   *
   * @param {number} powerW        Net power in watts (positive = drain).
   * @param {number} deltaSeconds  Duration of the time step in seconds.
   * @returns {number}  Percentage points consumed (positive = battery decreasing).
   */
  powerToPercent(powerW, deltaSeconds) {
    const energyWh = (powerW * deltaSeconds) / 3600
    return (energyWh / BATTERY_CAPACITY_WH) * 100
  }
}

/**
 * Produces physically coherent IMU readings derived from actual motion
 * vectors rather than uncorrelated random noise.
 *
 * Axis convention:
 * - x  longitudinal accelerometer (forward positive)
 * - y  lateral accelerometer      (left positive)
 * - z  vertical accelerometer     (up positive, ~9.8 m/s² when static)
 * - dx roll rate  (rad/s)
 * - dy pitch rate (rad/s)
 * - dz yaw rate   (rad/s)
 *
 * Each axis is computed from the true kinematic quantity and then perturbed
 * with Gaussian noise whose standard deviation scales with speed to reproduce
 * road vibration amplitude growth at higher velocities.
 */
class IMUModel {
  /**
   * @param {object}  p
   * @param {number}  p.accelMs2      Longitudinal acceleration in m/s².
   * @param {number}  p.slopeRad      Terrain slope in radians.
   * @param {number}  p.yawRateRad    Heading change rate in rad/s.
   * @param {number}  p.speedMs       Current speed in m/s.
   * @param {boolean} p.isRiding      False when the bike is parked or locked.
   * @returns {{ x: number, y: number, z: number, dx: number, dy: number, dz: number }}
   */
  compute({ accelMs2, slopeRad, yawRateRad, speedMs, isRiding }) {
    if (!isRiding) {
      return {
        x: gaussianNoise(0, 0.02),
        y: gaussianNoise(0, 0.02),
        z: gaussianNoise(G, 0.05),
        dx: gaussianNoise(0, 0.05),
        dy: gaussianNoise(0, 0.05),
        dz: gaussianNoise(0, 0.03),
      }
    }

    const gravX = -G * Math.sin(slopeRad)
    const x = gaussianNoise(accelMs2 + gravX, 0.15 + speedMs * 0.01)
    const ayTrue = speedMs * yawRateRad
    const y = gaussianNoise(ayTrue, 0.1)
    const z = gaussianNoise(G * Math.cos(slopeRad), 0.25 + speedMs * 0.02)
    const dz = gaussianNoise(yawRateRad, 0.05)
    const dy = gaussianNoise(0, 0.15)
    const leanRate = speedMs > 0.5 ? (speedMs * yawRateRad) / (G * 0.8) : 0
    const dx = gaussianNoise(leanRate, 0.2)

    return {
      x: parseFloat(x.toFixed(4)),
      y: parseFloat(y.toFixed(4)),
      z: parseFloat(z.toFixed(4)),
      dx: parseFloat(dx.toFixed(4)),
      dy: parseFloat(dy.toFixed(4)),
      dz: parseFloat(dz.toFixed(4)),
    }
  }
}

/**
 * Evaluates the current bike state against a set of alarm rules and returns
 * the list of triggered alarm identifiers.
 *
 * This class is a pure function wrapper: it has no state and no side effects.
 * Alarm publishing is the responsibility of the caller.
 */
class AlarmDetector {
  /**
   * @param {object} bike  A snapshot produced by `BikeState.toPayload()`.
   * @returns {string[]}   Alarm reason strings; empty array means no alarms.
   */
  check(bike) {
    const alarms = []
    const { x, y, z } = bike.imu
    const totalAccel = Math.sqrt(x * x + y * y + z * z)

    if (bike.locked && bike.status === "available") {
      if (totalAccel > 15) alarms.push("tamper_detected_while_parked")
      if (Math.abs(x) > 8 && Math.abs(z) < 3)
        alarms.push("fall_or_incorrect_parking")
    }

    if (!bike.locked && bike.status === "rented") {
      if (totalAccel > 25) alarms.push("dangerous_acceleration_or_crash")
    }

    if (bike.battery <= 10 && bike.status === "rented")
      alarms.push("low_battery")

    return alarms
  }
}

/**
 * Encapsulates a fixed sequence of GPS waypoints and an advancing cursor.
 *
 * Waypoints are consumed one by one as the simulation progresses. The cursor
 * never rewinds automatically; call `reset()` to restart a route.
 */
class GPSRoute {
  /**
   * @param {[number, number][]} waypoints  Array of [latitude, longitude] pairs.
   */
  constructor(waypoints) {
    this._waypoints = waypoints
    this._index = 0
  }

  /** Total number of waypoints in the route. @type {number} */
  get length() {
    return this._waypoints.length
  }

  /** Zero-based index of the current target waypoint. @type {number} */
  get index() {
    return this._index
  }

  /** True when all waypoints have been consumed. @type {boolean} */
  get isFinished() {
    return this._index >= this._waypoints.length
  }

  /**
   * Returns the current target waypoint without advancing the cursor.
   * @returns {{ lat: number, lng: number } | null}
   */
  current() {
    if (this.isFinished) return null
    const [lat, lng] = this._waypoints[this._index]
    return { lat, lng }
  }

  /**
   * Peeks at the waypoint after the current one without advancing the cursor.
   * @returns {{ lat: number, lng: number } | null}
   */
  next() {
    const ni = this._index + 1
    if (ni >= this._waypoints.length) return null
    const [lat, lng] = this._waypoints[ni]
    return { lat, lng }
  }

  /** Advances the cursor to the next waypoint. */
  advance() {
    if (!this.isFinished) this._index++
  }

  /** Resets the cursor to the first waypoint. */
  reset() {
    this._index = 0
  }
}

/**
 * Holds all mutable simulation state for a single bike.
 *
 * Public fields match the TypeScript `Bike` interface exactly.
 * Private fields (prefixed with `_`) carry physics-continuity data
 * needed between successive ticks and are not included in the serialised payload.
 */
class BikeState {
  /**
   * @param {string}             id              Unique bike identifier.
   * @param {[number,number][]}  routeWaypoints  Initial GPS route waypoints.
   */
  constructor(id, routeWaypoints) {
    this.id = id
    this.current_ride = ""
    this.status = "available"
    this.locked = true
    this.position = { lat: routeWaypoints[0][0], lng: routeWaypoints[0][1] }
    this.battery = 85
    this.current_speed = 0
    this.imu = { x: 0, y: 0, z: G, dx: 0, dy: 0, dz: 0 }
    this.timestamp = new Date().toISOString()

    this._speedMs = 0
    this._prevSpeedMs = 0
    this._prevBearing = 0
    this._slopeRad = 0
    this.route = new GPSRoute(routeWaypoints)
    this._rideStartMs = null
    this._rideId = null
  }

  /**
   * Serialises the public state into a plain object conforming to the `Bike` interface.
   *
   * @returns {object}
   */
  toPayload() {
    return {
      id: this.id,
      current_ride: this.current_ride,
      status: this.status,
      locked: this.locked,
      position: {
        lat: parseFloat(this.position.lat.toFixed(6)),
        lng: parseFloat(this.position.lng.toFixed(6)),
      },
      battery: parseFloat(this.battery.toFixed(2)),
      current_speed: parseFloat(this.current_speed.toFixed(2)),
      imu: {
        x: this.imu.x,
        y: this.imu.y,
        z: this.imu.z,
        dx: this.imu.dx,
        dy: this.imu.dy,
        dz: this.imu.dz,
      },
      timestamp: this.timestamp,
    }
  }
}

/**
 * Physics-driven e-bike simulator.
 *
 * Advances a `BikeState` one time step at a time using coherent models for
 * GPS position, speed, IMU, and battery consumption. All derived quantities
 * (acceleration, yaw rate, slope) are computed from the GPS trajectory so
 * that the sensor streams are physically consistent with each other.
 *
 * Emitted events:
 * | Event         | Payload fields                                        |
 * |---------------|-------------------------------------------------------|
 * | `rideStarted` | `bikeId`, `rideId`, `timestamp`                       |
 * | `rideStopped` | `bikeId`, `rideId`, `durationS`, `timestamp`          |
 * | `alarm`       | `bikeId`, `reason`, `position`, `locked`, `timestamp` |
 * | `telemetry`   | `{ payload }` — emitted every tick                    |
 *
 * @extends EventEmitter
 */
class BikeSimulator extends EventEmitter {
  /**
   * @param {string}             bikeId          Unique identifier for this bike.
   * @param {[number,number][]}  routeWaypoints  GPS waypoints [[lat,lng], …].
   */
  constructor(bikeId, routeWaypoints) {
    super()
    this._state = new BikeState(bikeId, routeWaypoints)
    this._physics = new PhysicsEngine()
    this._imu = new IMUModel()
    this._alarms = new AlarmDetector()
  }

  /** The bike's unique identifier. @type {string} */
  get bikeId() {
    return this._state.id
  }

  /**
   * Returns a serialised snapshot of the current bike state.
   * @returns {object}  Plain object conforming to the `Bike` interface.
   */
  getPayload() {
    return this._state.toPayload()
  }

  /**
   * Transitions the bike to `rented` status, unlocks it, resets the GPS route
   * cursor to the first waypoint, and emits a `rideStarted` event.
   */
  startRide() {
    const s = this._state
    s.status = "rented"
    s.locked = false
    s._rideId = `ride-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    s._rideStartMs = Date.now()
    s.current_ride = s._rideId
    s.route.reset()
    s._speedMs = 0
    s._prevSpeedMs = 0

    this.emit("rideStarted", {
      bikeId: s.id,
      rideId: s._rideId,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Transitions the bike back to `available` status, locks it, zeroes the speed,
   * and emits a `rideStopped` event containing the ride duration.
   */
  stopRide() {
    const s = this._state
    const durationS = s._rideStartMs
      ? Math.round((Date.now() - s._rideStartMs) / 1000)
      : 0

    this.emit("rideStopped", {
      bikeId: s.id,
      rideId: s._rideId,
      durationS,
      timestamp: new Date().toISOString(),
    })

    s.status = "available"
    s.locked = true
    s._speedMs = 0
    s.current_speed = 0
    s.current_ride = ""
    s._rideId = null
    s._rideStartMs = null
  }

  /**
   * Advances the simulation by one time step.
   *
   * Depending on the current bike status, delegates to `_stepRiding` or
   * `_stepParked`, then runs alarm detection and emits a `telemetry` event.
   *
   * @param {number} deltaSeconds  Length of the time step in seconds (e.g. 2.0).
   */
  tick(deltaSeconds) {
    const s = this._state
    s.timestamp = new Date().toISOString()

    if (s.status === "rented" && !s.locked) {
      this._stepRiding(deltaSeconds)
    } else {
      this._stepParked(deltaSeconds)
    }

    const alarms = this._alarms.check(s)
    for (const reason of alarms) {
      this.emit("alarm", {
        bikeId: s.id,
        reason,
        position: { ...s.position },
        locked: s.locked,
        timestamp: s.timestamp,
      })
    }

    this.emit("telemetry", { payload: s.toPayload() })
  }

  /**
   * Computes one riding tick: advances the GPS position by the distance covered
   * in `dt` seconds, derives slope, acceleration, and yaw rate from the
   * trajectory, updates the IMU, and deducts battery energy via the physics model.
   *
   * Speed is smoothed toward a terrain-adjusted target using a first-order
   * low-pass filter with time constant τ = 4 s, preventing instantaneous
   * velocity discontinuities at waypoint transitions.
   *
   * @param {number} dt  Time step in seconds.
   */
  _stepRiding(dt) {
    const s = this._state
    const route = s.route

    if (route.isFinished) {
      s._speedMs = 0
      s.current_speed = 0
      return
    }

    const wpCurrent = route.current()
    const wpNext = route.next()
    const segmentM = wpNext
      ? haversineDistance(wpCurrent.lat, wpCurrent.lng, wpNext.lat, wpNext.lng)
      : haversineDistance(
          s.position.lat,
          s.position.lng,
          wpCurrent.lat,
          wpCurrent.lng,
        )

    if (wpNext) {
      s._slopeRad = estimateSlope(
        wpCurrent.lat,
        wpCurrent.lng,
        wpNext.lat,
        wpNext.lng,
        Math.max(segmentM, 1),
      )
    }

    const slopeInfluence = -s._slopeRad * 25
    const targetKmh = Math.min(
      25,
      Math.max(3, 14 + slopeInfluence + gaussianNoise(0, 0.8)),
    )
    const targetMs = targetKmh / 3.6
    const alpha = 1 - Math.exp(-dt / 4.0)
    const newSpeedMs = s._speedMs + alpha * (targetMs - s._speedMs)
    const accelMs2 = (newSpeedMs - s._prevSpeedMs) / dt

    s._prevSpeedMs = s._speedMs
    s._speedMs = newSpeedMs
    s.current_speed = newSpeedMs * 3.6

    let remaining = s._speedMs * dt
    while (remaining > 0 && !route.isFinished) {
      const wp = route.current()
      const dist = haversineDistance(
        s.position.lat,
        s.position.lng,
        wp.lat,
        wp.lng,
      )
      if (remaining >= dist) {
        s.position.lat = wp.lat
        s.position.lng = wp.lng
        remaining -= dist
        route.advance()
      } else {
        const frac = remaining / dist
        s.position.lat += frac * (wp.lat - s.position.lat)
        s.position.lng += frac * (wp.lng - s.position.lng)
        remaining = 0
      }
    }

    let yawRateRad = 0
    const wpAfter = route.current()
    if (wpAfter && !route.isFinished) {
      const bNow = bearing(
        s.position.lat,
        s.position.lng,
        wpAfter.lat,
        wpAfter.lng,
      )
      const dBear = bNow - s._prevBearing
      const dBearWrapped = ((dBear + Math.PI) % (2 * Math.PI)) - Math.PI
      yawRateRad = dBearWrapped / dt
      s._prevBearing = bNow
    }

    s.imu = this._imu.compute({
      accelMs2,
      slopeRad: s._slopeRad,
      yawRateRad,
      speedMs: s._speedMs,
      isRiding: true,
    })

    const powerW = this._physics.computePower({
      speedMs: s._speedMs,
      accelMs2,
      slopeRad: s._slopeRad,
    })
    const drainPct = this._physics.powerToPercent(powerW, dt)
    s.battery = Math.max(0, Math.min(100, s.battery - drainPct))

    if (route.isFinished) {
      s._speedMs = 0
      s.current_speed = 0
    }
  }

  /**
   * Computes one parked tick: zeroes speed and updates the IMU with
   * near-static values (gravity + minimal sensor noise).
   *
   * @param {number} _dt  Unused; present for a consistent tick signature.
   */
  _stepParked(_dt) {
    const s = this._state
    s._speedMs = 0
    s.current_speed = 0
    s.imu = this._imu.compute({
      accelMs2: 0,
      slopeRad: 0,
      yawRateRad: 0,
      speedMs: 0,
      isRiding: false,
    })
  }
}

/**
 * GPS waypoints for the Porto Antico → Piazza De Ferrari route in Genoa.
 * 130 real street coordinates sampled at uniform spacing.
 *
 * @type {[number, number][]}
 */

module.exports = {
  BikeSimulator,
  BikeState,
  GPSRoute,
  PhysicsEngine,
  IMUModel,
  AlarmDetector,
  haversineDistance,
  bearing,
  estimateSlope,
  gaussianNoise,
  BATTERY_CAPACITY_WH,
  TOTAL_MASS_KG,
}
