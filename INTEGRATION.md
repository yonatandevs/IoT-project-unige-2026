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

All three topics write to a **single InfluxDB measurement `bike`** (matching `models/bike.ts`).

### `bike/{bike_id}/gps`

Published once per tick (every 1-2 seconds while riding, every 5-10 seconds while parked).

```json
{
  "lat": 44.40560,
  "lng": 8.94630,
  "current_speed": 12.3
}
```

| Field           | Type   | Unit           | Notes                              |
|-----------------|--------|----------------|------------------------------------|
| `lat`           | float  | degrees WGS-84 | Decimal degrees, 5-6 decimal places|
| `lng`           | float  | degrees WGS-84 | Decimal degrees, 5-6 decimal places|
| `current_speed` | float  | km/h           | 0 when parked                      |

---

### `bike/{bike_id}/imu`

Published once per tick. Consumed by the fall detection flow.

```json
{
  "x": 0.12,
  "y": -0.05,
  "z": 9.81,
  "dx": 0.003,
  "dy": -0.001,
  "dz": 0.015
}
```

| Field | Type  | Unit   | Notes                                          |
|-------|-------|--------|-------------------------------------------------|
| `x`   | float | m/s²   | Longitudinal acceleration (forward positive)   |
| `y`   | float | m/s²   | Lateral acceleration (left positive)           |
| `z`   | float | m/s²   | Vertical acceleration (up positive, ~9.81 static) |
| `dx`  | float | rad/s  | Roll rate                                      |
| `dy`  | float | rad/s  | Pitch rate                                     |
| `dz`  | float | rad/s  | Yaw rate                                       |

**Fall detection triggers when `|z| > 25 m/s²`.**

---

### `bike/{bike_id}/status`

Published once per tick. Consumed by the battery alert flow.

```json
{
  "battery": 73.5,
  "locked": true,
  "status": "rented",
  "current_ride": "ride-001"
}
```

| Field          | Type    | Values                                    | Notes                        |
|----------------|---------|-------------------------------------------|------------------------------|
| `battery`      | float   | 0-100                                     | Alert triggers when < 15     |
| `locked`       | boolean | `true` / `false`                          |                              |
| `status`       | string  | `"available"` / `"rented"` / `"broken"`   |                              |
| `current_ride` | string  | ride ID or `""`                           | Empty when not rented        |

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
  "bikes_docked": 2
}
```

| Field             | Type     | Notes                                  |
|-------------------|----------|----------------------------------------|
| `available_slots` | integer  | Number of free slots                   |
| `bikes_docked`    | integer  | Number of occupied slots               |

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

### `bike` — All bike telemetry (matches `models/bike.ts`)

Three MQTT topics feed into this single measurement:

| MQTT Topic          | Fields written                                             |
|---------------------|------------------------------------------------------------|
| `bike/+/gps`       | `lat`, `lng`, `current_speed`                              |
| `bike/+/imu`       | `imu_x`, `imu_y`, `imu_z`, `imu_dx`, `imu_dy`, `imu_dz`  |
| `bike/+/status`    | `battery`, `locked`, `status`, `current_ride`              |

Tags: `id` (bike_id)

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "bike")
  |> filter(fn: (r) => r.id == "bike-001")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

### `alert` — All generated alerts (matches `models/alert.ts`)

Tags: `bike_id`, `type`, `severity`
Fields: `alert_id`, `message`, `acknowledged`

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

| _time                | bike_id  | type | severity | alert_id                       | message                              | acknowledged |
|----------------------|----------|------|----------|--------------------------------|--------------------------------------|--------------|
| 2026-06-01T14:35:00Z | bike-001 | fall | high     | fall-bike-001-1748789700000    | Fall detected: \|z\| = 28.50 m/s²   | false        |

---

### `station` — Docking station availability (extensible)

Tags: `station_id`
Fields: `available_slots`, `bikes_docked`

```flux
from(bucket: "bike_data")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "station")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
```

---

## Alert Types

| `type`              | `severity` | Trigger condition                      |
|---------------------|------------|----------------------------------------|
| `fall`              | `high`     | `|z| > 25 m/s²`                        |
| `parking_violation` | `medium`   | `current_speed < 1` AND outside all zones |
| `low_battery`       | `low`      | `battery < 15%`                        |

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

## Dashboard

The dashboard connects to the influxdb on port 8086.
It fetches bike measurements, alerts, and alert acknowledgments according to the type definition in [types](./visualization/src/types.ts).
New acknowledgments are written back to the influxdb for persistence.

To start the dashboard directly (without docker) run the following commands:
```shell
cd ./visualization
npm install
npm run dev
```
The system will be available on [http://localhost:5173](http://localhost:5173)


---

## Manual Testing with mosquitto_pub

Start the Docker stack first (`cd data-processing && docker compose up -d`),
then publish test messages from any terminal.

```bash
# GPS data
mosquitto_pub -h localhost -t "bike/bike-001/gps" -m '{
  "lat": 44.4056, "lng": 8.9463, "current_speed": 12.3
}'

# IMU data (normal — no alert)
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "x": 0.12, "y": -0.05, "z": 9.81,
  "dx": 0.003, "dy": -0.001, "dz": 0.015
}'

# IMU data (triggers FALL ALERT — |z| > 25)
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "x": 3.5, "y": 1.2, "z": 28.5,
  "dx": 0.8, "dy": 0.3, "dz": 0.1
}'

# Status (triggers LOW BATTERY ALERT — battery < 15)
mosquitto_pub -h localhost -t "bike/bike-001/telemetry" -m '{
  "battery": 8.2, "locked": false, "status": "rented", "current_ride": "ride-042"
}'

# Status (normal — no alert)
mosquitto_pub -h localhost -t "bike/bike-001/status" -m '{
  "battery": 73.5, "locked": true, "status": "available", "current_ride": ""
}'

# GPS (triggers PARKING VIOLATION — current_speed=0, outside all zones)
mosquitto_pub -h localhost -t "bike/bike-002/gps" -m '{
  "lat": 44.4200, "lng": 8.9600, "current_speed": 0
}'

# Station status
mosquitto_pub -h localhost -t "station/station-001/status" -m '{
  "available_slots": 3, "bikes_docked": 2
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
  "lat": 44.4056, "lng": 8.9463, "current_speed": 14.2
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
mosquitto_pub -h localhost -t "bike/bike-001/imu" -m '{
  "x": 3.5, "y": 1.2, "z": 28.5,
  "dx": 0.8, "dy": 0.3, "dz": 0.1
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
mosquitto_pub -h localhost -t "bike/bike-001/status" -m '{
  "battery": 8.2, "locked": false, "status": "rented", "current_ride": "ride-042"
}'
```

### 7. Trigger a parking violation

```bash
mosquitto_pub -h localhost -t "bike/bike-003/gps" -m '{
  "lat": 44.4200, "lng": 8.9600, "current_speed": 0
}'
```

This location (44.42, 8.96) is outside all authorized parking zones, so the
parking violation flow should fire.
