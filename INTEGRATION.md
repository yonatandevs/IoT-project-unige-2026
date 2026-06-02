# Integration & Testing Guide

This document defines the contracts between every layer of the system:
what MQTT topics exist, what payloads look like, what gets stored in InfluxDB,
and how to test it all.

---

## Architecture Overview

```
Edge Devices                Data Processing (Docker)              Dashboard
────────────                ────────────────────────              ─────────
                               ┌──────────────┐
  Bike Node  ── MQTT pub ──>  │  Mosquitto    │
  Station Node ── MQTT pub ->  │  :1883        │
                               └──────┬───────┘
                                      │ subscribe
                                      ▼
                               ┌──────────────┐
                               │  Node-RED     │
                               │  :1880        │
                               │  (4 flows)    │
                               └──────┬───────┘
                                      │ write
                                      ▼
                               ┌──────────────┐
                               │  InfluxDB 2   │ <── query ── Dashboard
                               │  :8086        │
                               └──────────────┘
```

---

## MQTT Broker

| Setting    | Value                          |
|------------|--------------------------------|
| Broker     | `mqtt://localhost:1883`        |
| Protocol   | MQTT v3.1.1 or v5             |
| Auth       | None (anonymous allowed)       |
| QoS        | 0 for telemetry, 1 for alarms |

---

## MQTT Topics — Bikes

Each bike publishes on **three separate topics**. The `{bike_id}` in the topic
must match the value used everywhere else (e.g. `bike-001`).

### `bike/{bike_id}/gps`

Published once per tick (every 1-2 seconds while riding, every 5-10 seconds while parked).

```json
{
  "lat": 44.40560,
  "lng": 8.94630,
  "speed": 12.3,
  "heading": 185.4,
  "altitude": 15.2
}
```

| Field      | Type   | Unit           | Notes                              |
|------------|--------|----------------|------------------------------------|
| `lat`      | float  | degrees WGS-84 | Decimal degrees, 5-6 decimal places|
| `lng`      | float  | degrees WGS-84 | Decimal degrees, 5-6 decimal places|
| `speed`    | float  | km/h           | 0 when parked                      |
| `heading`  | float  | degrees 0-360  | Direction of travel                |
| `altitude` | float  | meters         | Above sea level                    |

---

### `bike/{bike_id}/imu`

Published once per tick. Consumed by the fall detection flow.

```json
{
  "accel_x": 0.12,
  "accel_y": -0.05,
  "accel_z": 9.81,
  "gyro_x": 0.003,
  "gyro_y": -0.001,
  "gyro_z": 0.015
}
```

| Field     | Type  | Unit   | Notes                                          |
|-----------|-------|--------|-------------------------------------------------|
| `accel_x` | float | m/s²   | Longitudinal (forward positive)                |
| `accel_y` | float | m/s²   | Lateral (left positive)                        |
| `accel_z` | float | m/s²   | Vertical (up positive, ~9.81 when static)      |
| `gyro_x`  | float | rad/s  | Roll rate                                      |
| `gyro_y`  | float | rad/s  | Pitch rate                                     |
| `gyro_z`  | float | rad/s  | Yaw rate                                       |

**Fall detection triggers when `|accel_z| > 25 m/s²`.**

---

### `bike/{bike_id}/status`

Published once per tick. Consumed by the battery alert flow.

```json
{
  "battery_level": 73.5,
  "lock_state": "unlocked",
  "alarm_active": false
}
```

| Field           | Type    | Values                    | Notes                        |
|-----------------|---------|---------------------------|------------------------------|
| `battery_level` | float   | 0-100                     | Alert triggers when < 15     |
| `lock_state`    | string  | `"locked"` / `"unlocked"` |                              |
| `alarm_active`  | boolean | `true` / `false`          |                              |

---

### `bike/{bike_id}/cmd` (subscribe direction)

Bikes **subscribe** to this topic to receive operator commands.
Not consumed by the data processing layer — goes directly to the bike.

```json
{
  "command_type": "lock"
}
```

| Field          | Type   | Values                                          |
|----------------|--------|-------------------------------------------------|
| `command_type` | string | `"lock"`, `"unlock"`, `"alarm_on"`, `"alarm_off"` |

---

## MQTT Topics — Docking Stations

### `station/{station_id}/status`

Published on every slot change or every 10 seconds as heartbeat.

```json
{
  "available_slots": 3,
  "bikes_docked": 2,
  "slots": [true, true, false, false, false]
}
```

| Field             | Type     | Notes                                  |
|-------------------|----------|----------------------------------------|
| `available_slots` | integer  | Number of free slots                   |
| `bikes_docked`    | integer  | Number of occupied slots               |
| `slots`           | boolean[]| Per-slot status, `true` = occupied     |

---

### `station/{station_id}/event`

Published when a bike docks or undocks.

```json
{
  "event": "dock",
  "bike_id": "bike-001",
  "slot_index": 2,
  "timestamp": "2026-06-01T14:30:00Z"
}
```

| Field        | Type    | Values              | Notes                     |
|--------------|---------|---------------------|---------------------------|
| `event`      | string  | `"dock"` / `"undock"` |                          |
| `bike_id`    | string  |                     | Which bike                |
| `slot_index` | integer |                     | Zero-based slot number    |
| `timestamp`  | string  | ISO 8601            |                           |

> Note: The dock event flow is wired in Node-RED but not fully processing yet.
> It currently logs events to the debug console.

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

### `gps` — Bike positions and speed

Tags: `bike_id`
Fields: `lat`, `lng`, `speed`, `heading`, `altitude`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "gps")
  |> filter(fn: (r) => r.bike_id == "bike-001")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

Example result:

| _time                | bike_id  | lat      | lng     | speed | heading | altitude |
|----------------------|----------|----------|---------|-------|---------|----------|
| 2026-06-01T14:30:00Z | bike-001 | 44.40560 | 8.94630 | 12.3  | 185.4   | 15.2     |

---

### `imu` — Accelerometer and gyroscope

Tags: `bike_id`
Fields: `accel_x`, `accel_y`, `accel_z`, `gyro_x`, `gyro_y`, `gyro_z`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "imu")
  |> filter(fn: (r) => r.bike_id == "bike-001")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

### `bike_status` — Battery and lock state

Tags: `bike_id`
Fields: `battery_level`, `lock_state`, `alarm_active`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "bike_status")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

### `station_status` — Docking station availability

Tags: `station_id`
Fields: `available_slots`, `bikes_docked`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "station_status")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

### `alerts` — All generated alerts

Tags: `bike_id`, `type`, `severity`
Fields: `message`, `acknowledged`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "alerts")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

```flux
// Filter by alert type
from(bucket: "bike_data")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "alerts")
  |> filter(fn: (r) => r.type == "fall")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

Example result:

| _time                | bike_id  | type | severity | message                                 | acknowledged |
|----------------------|----------|------|----------|-----------------------------------------|--------------|
| 2026-06-01T14:35:00Z | bike-001 | fall | high     | Fall detected: \|accel_z\| = 28.50 m/s² | false        |

---

## Alert Types

| `type`              | `severity` | Trigger condition                      |
|---------------------|------------|----------------------------------------|
| `fall`              | `high`     | `|accel_z| > 25 m/s²`                  |
| `parking_violation` | `medium`   | `speed < 1` AND outside all zones      |
| `low_battery`       | `low`      | `battery_level < 15%`                  |

---

## Authorized Parking Zones

Hardcoded in Node-RED Flow C. To add new zones, update the function node
in the Node-RED editor (http://localhost:1880).

| Zone                | Latitude  | Longitude | Radius (m) |
|---------------------|-----------|-----------|------------|
| Porto Antico        | 44.4095   | 8.9290    | 300        |
| Piazza De Ferrari   | 44.4072   | 8.9345    | 200        |
| Stazione Brignole   | 44.4153   | 8.9425    | 250        |
| Stazione Principe   | 44.4103   | 8.9213    | 250        |

---

## Dashboard Panel Suggestions

| Panel type   | Data source                      | What to show                             |
|--------------|----------------------------------|------------------------------------------|
| Map (Geomap) | `gps`                            | Live bike positions on a Genoa map       |
| Line chart   | `gps.speed`                      | Speed over time per bike                 |
| Line chart   | `bike_status.battery_level`      | Battery drain over time                  |
| Gauge        | `bike_status.battery_level`      | Current battery per bike (last value)    |
| Stat         | `station_status.available_slots` | Available slots per station              |
| Table        | `alerts`                         | Recent alerts with type, severity, message |
| Bar chart    | `alerts`                         | Alert count by type over last 24h        |

---

## Manual Testing with mosquitto_pub

Start the Docker stack first (`cd data-processing && docker compose up -d`),
then publish test messages from any terminal.

```bash
# GPS data
mosquitto_pub -h localhost -t "bike/bike-001/gps" -m '{
  "lat": 44.4056, "lng": 8.9463, "speed": 12.3, "heading": 185.4, "altitude": 15.2
}'

# IMU data (normal — no alert)
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "accel_x": 0.12, "accel_y": -0.05, "accel_z": 9.81,
  "gyro_x": 0.003, "gyro_y": -0.001, "gyro_z": 0.015
}'

# IMU data (triggers FALL ALERT — accel_z > 25)
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "accel_x": 3.5, "accel_y": 1.2, "accel_z": 28.5,
  "gyro_x": 0.8, "gyro_y": 0.3, "gyro_z": 0.1
}'

# Status (triggers LOW BATTERY ALERT — battery < 15)
mosquitto_pub -h localhost -t "bike/bike-001/status" -m '{
  "battery_level": 8.2, "lock_state": "unlocked", "alarm_active": false
}'

# Status (normal — no alert)
mosquitto_pub -h localhost -t "bike/bike-001/status" -m '{
  "battery_level": 73.5, "lock_state": "unlocked", "alarm_active": false
}'

# GPS (triggers PARKING VIOLATION — speed=0, outside all zones)
mosquitto_pub -h localhost -t "bike/bike-002/gps" -m '{
  "lat": 44.4200, "lng": 8.9600, "speed": 0, "heading": 0, "altitude": 50
}'

# Station status
mosquitto_pub -h localhost -t "station/station-001/status" -m '{
  "available_slots": 3, "bikes_docked": 2, "slots": [true, true, false, false, false]
}'

# Station dock event
mosquitto_pub -h localhost -t "station/station-001/event" -m '{
  "event": "dock", "bike_id": "bike-001", "slot_index": 2,
  "timestamp": "2026-06-01T14:30:00Z"
}'
```

---

## End-to-End Test Scenario

### 1. Start the stack

```bash
cd data-processing
docker compose up -d
```

Wait ~30 seconds for all services to initialize.

### 2. Publish a GPS reading

```bash
mosquitto_pub -h localhost -t "bike/bike-001/gps" -m '{
  "lat": 44.4056, "lng": 8.9463, "speed": 14.2, "heading": 90, "altitude": 12
}'
```

### 3. Verify in InfluxDB

Open http://localhost:8086, log in (`admin` / `admin12345`), go to **Data Explorer**,
select bucket `bike_data`, measurement `gps`. The data point should appear.

Or run this Flux query:

```flux
from(bucket: "bike_data")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "gps")
```

### 4. Trigger a fall alert

```bash
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "accel_x": 3.5, "accel_y": 1.2, "accel_z": 28.5,
  "gyro_x": 0.8, "gyro_y": 0.3, "gyro_z": 0.1
}'
```

### 5. Verify the alert

Check the Node-RED debug sidebar at http://localhost:1880 — the fall alert
should appear.

Query InfluxDB:

```flux
from(bucket: "bike_data")
  |> range(start: -5m)
  |> filter(fn: (r) => r._measurement == "alerts")
  |> filter(fn: (r) => r.type == "fall")
```

### 6. Trigger a low battery alert

```bash
mosquitto_pub -h localhost -t "bike/bike-001/status" -m '{
  "battery_level": 8.2, "lock_state": "unlocked", "alarm_active": false
}'
```

### 7. Trigger a parking violation

```bash
mosquitto_pub -h localhost -t "bike/bike-003/gps" -m '{
  "lat": 44.4200, "lng": 8.9600, "speed": 0, "heading": 0, "altitude": 50
}'
```

This location (44.42, 8.96) is outside all authorized parking zones, so the
parking violation flow should fire.
