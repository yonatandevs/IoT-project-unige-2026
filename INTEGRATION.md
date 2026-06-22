# Integration & Testing Guide

This document defines the contracts between every layer of the system:
what MQTT topics exist, what payloads look like, what gets stored in InfluxDB,
and how to test it all.

---

## Architecture Overview

```
Edge / Simulator            Data Processing (Docker)              Dashboard
────────────────            ────────────────────────              ─────────
                               ┌──────────────┐
  Bike Simulator ─ MQTT pub ─> │  Mosquitto    │
  (Node.js)                    │  :1883        │
                               └──────┬───────┘
                                      │ subscribe
                                      ▼
                               ┌──────────────┐
                               │  Node-RED     │
                               │  :1880        │
                               │  (5 flows)    │
                               └──────┬───────┘
                                      │ write
                                      ▼
                               ┌──────────────┐
                               │  InfluxDB 2   │ <── query ── React Dashboard
                               │  :8086        │ <── write ── (alert acks)
                               └──────────────┘              :80 (nginx)
```

### Docker Services (root `docker-compose.yml`)

| Service          | Container        | Host Port | Purpose                      |
|------------------|------------------|-----------|------------------------------|
| `mosquitto`      | `iot-mosquitto`  | 1883      | MQTT broker                  |
| `influxdb`       | `iot-influxdb`   | 8086      | Time-series database         |
| `node-red`       | `iot-node-red`   | 1880      | Stream processing + alerts   |
| `frontend`       | `iot-frontend`   | 80        | React dashboard (nginx)      |
| `bike-simulator` | `iot-simulator`  | —         | Live bike simulation + seed  |

---

## MQTT Broker

| Setting    | Value                          |
|------------|--------------------------------|
| Broker     | `mqtt://localhost:1883`        |
| Protocol   | MQTT v3.1.1 or v5             |
| Auth       | None (anonymous allowed)       |
| QoS        | 0 for telemetry, 1 on shutdown |

---

## MQTT Topic — Bikes

Each bike publishes **all telemetry on a single unified topic**.
The `{bike_id}` follows the format `bike-ge-XXX` (e.g. `bike-ge-001`).

### `bike/{bike_id}/telemetry`

Published once per tick (every `TICK_MS` milliseconds, default 2000ms).
Consumed by all five Node-RED flows.

```json
{
  "id": "bike-ge-001",
  "position": {
    "lat": 44.40560,
    "lng": 8.94630
  },
  "current_speed": 12.3,
  "imu": {
    "x": 0.12,
    "y": -0.05,
    "z": 9.81,
    "dx": 0.003,
    "dy": -0.001,
    "dz": 0.015
  },
  "battery": 73.5,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-xxxxxxxx",
  "timestamp": "2026-06-22T09:15:00.000Z",
  "rssi": -65
}
```

| Field                | Type    | Unit / Values                           | Notes                                      |
|----------------------|---------|-----------------------------------------|--------------------------------------------|
| `id`                 | string  | `bike-ge-XXX`                           | Bike identifier                            |
| `position.lat`       | float   | degrees WGS-84                          | Decimal degrees, 5-6 decimal places        |
| `position.lng`       | float   | degrees WGS-84                          | Decimal degrees, 5-6 decimal places        |
| `current_speed`      | float   | km/h                                    | 0 when parked                              |
| `imu.x`              | float   | m/s²                                    | Longitudinal acceleration                  |
| `imu.y`              | float   | m/s²                                    | Lateral acceleration                       |
| `imu.z`              | float   | m/s²                                    | Vertical acceleration (~9.8 static)        |
| `imu.dx`             | float   | m/s² delta                              | Change in x since last tick                |
| `imu.dy`             | float   | m/s² delta                              | Change in y since last tick                |
| `imu.dz`             | float   | m/s² delta                              | Change in z since last tick                |
| `battery`            | float   | 0-100                                   | Percentage                                 |
| `locked`             | boolean | `true` / `false`                        |                                            |
| `status`             | string  | `"available"` / `"rented"` / `"broken"` |                                            |
| `current_ride`       | string  | ride UUID or `""`                       | Empty when not rented                      |
| `timestamp`          | string  | ISO 8601                                | When the reading was taken                 |
| `rssi`               | integer | dBm                                     | Simulated signal strength (affects packet loss) |

---

## Node-RED Flows

Five flows process the incoming telemetry:

| Flow | Label                       | MQTT Subscription      | Purpose                                       |
|------|-----------------------------|------------------------|-----------------------------------------------|
| A    | Ingest & Store              | `bike/+/telemetry`     | Writes `bike` measurement; updates `bikeLastSeen` |
| B    | Fall Detection              | `bike/+/telemetry`     | Detects falls; writes `alert` (type=`fall`)   |
| C    | Parking Violation           | `bike/+/telemetry`     | Detects illegal parking; writes `alert`       |
| D    | Battery Alerts              | `bike/+/telemetry`     | Tiered low-battery alerts; writes `alert`     |
| E    | Connectivity Monitoring     | *(timer, no MQTT)*     | Every 15s, checks bikes silent > 60s          |

---

## InfluxDB Connection

| Setting  | Value                              |
|----------|------------------------------------|
| URL      | `http://localhost:8086`            |
| Version  | 2.x (Flux query language)          |
| Org      | `iot-bikes`                        |
| Bucket   | `bike_data`                        |
| Token    | `dev-token-change-in-production`   |
| Username | `admin`                            |
| Password | `admin12345`                       |

---

## InfluxDB Measurements

### `bike` — All bike telemetry (matches [models/bike.ts](shared/models/bike.ts)

The single `bike/+/telemetry` MQTT topic feeds into this measurement.
Flow A extracts nested fields and flattens them:

| Payload Path         | InfluxDB Field   |
|----------------------|------------------|
| `position.lat`       | `lat`            |
| `position.lng`       | `lng`            |
| `current_speed`      | `current_speed`  |
| `imu.x`              | `imu_x`          |
| `imu.y`              | `imu_y`          |
| `imu.z`              | `imu_z`          |
| `imu.dx`             | `imu_dx`         |
| `imu.dy`             | `imu_dy`         |
| `imu.dz`             | `imu_dz`         |
| `battery`            | `battery`        |
| `locked`             | `locked`         |
| `status`             | `status`         |
| `current_ride`       | `current_ride`   |

Tags: `id` (bike_id, extracted from topic)

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "bike")
  |> filter(fn: (r) => r.id == "bike-ge-001")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

### `alert` — All generated alerts (matches [models/alert.ts](shared/models/alert.ts))

Tags: `bike_id`, `type`, `severity`
Fields: `alert_id`, `message`

> Note: `acknowledged` is **not** stored in this measurement.
> Acknowledgments are tracked separately in the `alert_ack` measurement.

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "alert")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

```flux
// Filter by alert type
from(bucket: "bike_data")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "alert")
  |> filter(fn: (r) => r.type == "fall")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

Example result:

| _time                | bike_id      | type | severity | alert_id                           | message                                                |
|----------------------|--------------|------|----------|------------------------------------|--------------------------------------------------------|
| 2026-06-01T14:35:00Z | bike-ge-001 | fall | high     | fall-bike-ge-001-1748789700000     | Fall detected: tilt=5.2, total_acc=26.30 m/s2          |

---

### `alert_ack` — Alert acknowledgments (written by dashboard)

Tags: `bike_id`, `alert_id`
Fields: `acked` (boolean), `source` (string)

Written by the React dashboard when an operator acknowledges an alert.

```flux
from(bucket: "bike_data")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "alert_ack")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

## Alert Types

| `type`              | `severity`              | Trigger condition                                                              |
|---------------------|-------------------------|--------------------------------------------------------------------------------|
| `fall`              | `high`                  | `status === "rented"` AND (`\|z - 9.8\| > 4.0` OR `sqrt(x²+y²+z²) > 25`)       |
| `parking_violation` | `medium`                | `current_speed < 1` AND outside all authorized parking zones                     |
| `low_battery`       | `low` / `medium` / `high` | `battery ≤ 15%` (low) / `≤ 5%` (medium) / `≤ 0%` (high); fires on tier change  |
| `connectivity`      | `medium`                | No telemetry received for > 60 seconds; auto-clears when bike comes back online |

**De-duplication:** Each alert type uses flow-scoped state to ensure only one active alert
per bike. A new alert is only created when the condition first triggers (or when severity
changes for `low_battery`). Alerts clear automatically when the condition resolves.

---

## Authorized Parking Zones

Loaded from `/shared/parking-zones.json` at Node-RED startup (Flow C).
To add or modify zones, edit `shared/parking-zones.json` — changes take effect on restart.

| Zone                | Latitude  | Longitude | Radius (m) |
|---------------------|-----------|-----------|------------|
| Porto Antico        | 44.4095   | 8.9290    | 300        |
| Piazza De Ferrari   | 44.4072   | 8.9345    | 200        |
| Stazione Brignole   | 44.4153   | 8.9425    | 250        |
| Stazione Principe   | 44.4103   | 8.9213    | 250        |

---

## Dashboard

The React dashboard connects to InfluxDB on port 8086 (via nginx proxy at `/influx`).
It fetches bike measurements, alerts, and alert acknowledgments according to the
type definitions in [types](./visualization/src/types.ts).

New acknowledgments are written back to InfluxDB as `alert_ack` measurements.
New alerts are surfaced as real-time toast notifications (5-second polling interval).

**Production (Docker):** http://localhost:80

**Development (without Docker):**
```shell
cd ./visualization
npm install
npm run dev
```
Available at http://localhost:5173

---

## Manual Testing with mosquitto_pub

Start the Docker stack first (`docker compose up -d` from the repo root),
then publish test messages from any terminal.

```bash
# Normal telemetry (no alerts triggered)
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4056, "lng": 8.9463 },
  "current_speed": 12.3,
  "imu": { "x": 0.12, "y": -0.05, "z": 9.81, "dx": 0.003, "dy": -0.001, "dz": 0.015 },
  "battery": 73.5,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-042",
  "timestamp": "2026-06-22T09:00:00Z",
  "rssi": -60
}'

# Triggers FALL ALERT — tilt from gravity > 4.0 (z=1.1, |1.1-9.8|=8.7)
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4056, "lng": 8.9463 },
  "current_speed": 5.0,
  "imu": { "x": 8.5, "y": 0.2, "z": 1.1, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 65.0,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-042",
  "timestamp": "2026-06-22T09:01:00Z",
  "rssi": -60
}'

# Triggers LOW BATTERY ALERT (severity: low, battery ≤ 15)
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4095, "lng": 8.9290 },
  "current_speed": 0,
  "imu": { "x": 0.01, "y": -0.02, "z": 9.79, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 12.0,
  "locked": true,
  "status": "available",
  "current_ride": "",
  "timestamp": "2026-06-22T09:02:00Z",
  "rssi": -55
}'

# Triggers CRITICAL BATTERY ALERT (severity: high, battery ≤ 0)
mosquitto_pub -h localhost -t "bike/bike-ge-002/telemetry" -m '{
  "id": "bike-ge-002",
  "position": { "lat": 44.4095, "lng": 8.9290 },
  "current_speed": 0,
  "imu": { "x": 0, "y": 0, "z": 9.8, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 0,
  "locked": true,
  "status": "available",
  "current_ride": "",
  "timestamp": "2026-06-22T09:03:00Z",
  "rssi": -55
}'

# Triggers PARKING VIOLATION — speed=0, outside all zones (44.42, 8.96)
mosquitto_pub -h localhost -t "bike/bike-ge-003/telemetry" -m '{
  "id": "bike-ge-003",
  "position": { "lat": 44.4200, "lng": 8.9600 },
  "current_speed": 0,
  "imu": { "x": 0, "y": 0, "z": 9.8, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 50.0,
  "locked": true,
  "status": "available",
  "current_ride": "",
  "timestamp": "2026-06-22T09:04:00Z",
  "rssi": -70
}'
```

---

## End-to-End Test Scenario

### 1. Start the stack

```bash
docker compose up -d
```

Wait ~30 seconds for all services to initialize.
The simulator will seed 7 days of historical data, then start publishing live.

### 2. Publish a telemetry reading

```bash
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4056, "lng": 8.9463 },
  "current_speed": 14.2,
  "imu": { "x": 0.1, "y": 0.05, "z": 9.78, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 80.0,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-test-001",
  "timestamp": "2026-06-22T10:00:00Z",
  "rssi": -62
}'
```

### 3. Verify in InfluxDB

Open http://localhost:8086, log in (`admin` / `admin12345`), go to **Data Explorer**,
select bucket `bike_data`, measurement `bike`. The data point should appear.

Or run this Flux query:

```flux
from(bucket: "bike_data")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "bike")
```

### 4. Trigger a fall alert

```bash
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4056, "lng": 8.9463 },
  "current_speed": 5.0,
  "imu": { "x": 8.5, "y": 0.2, "z": 1.1, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 65.0,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-test-001",
  "timestamp": "2026-06-22T10:01:00Z",
  "rssi": -60
}'
```

### 5. Verify the alert

Check the Node-RED debug sidebar at http://localhost:1880 — the fall alert
should appear.

Query InfluxDB:

```flux
from(bucket: "bike_data")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "alert")
  |> filter(fn: (r) => r.type == "fall")
```

### 6. Trigger a low battery alert

```bash
mosquitto_pub -h localhost -t "bike/bike-ge-001/telemetry" -m '{
  "id": "bike-ge-001",
  "position": { "lat": 44.4095, "lng": 8.9290 },
  "current_speed": 0,
  "imu": { "x": 0, "y": 0, "z": 9.8, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 8.2,
  "locked": false,
  "status": "rented",
  "current_ride": "ride-test-001",
  "timestamp": "2026-06-22T10:02:00Z",
  "rssi": -55
}'
```

### 7. Trigger a parking violation

```bash
mosquitto_pub -h localhost -t "bike/bike-ge-003/telemetry" -m '{
  "id": "bike-ge-003",
  "position": { "lat": 44.4200, "lng": 8.9600 },
  "current_speed": 0,
  "imu": { "x": 0, "y": 0, "z": 9.8, "dx": 0, "dy": 0, "dz": 0 },
  "battery": 50.0,
  "locked": true,
  "status": "available",
  "current_ride": "",
  "timestamp": "2026-06-22T10:03:00Z",
  "rssi": -70
}'
```

This location (44.42, 8.96) is outside all authorized parking zones, so the
parking violation flow should fire.

### 8. Verify on the dashboard

Open http://localhost:80 — alerts should appear in the alert panel
and as toast notifications.
