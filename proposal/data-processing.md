# Data Processing Pipeline

## Overview

The system has six layers. Data flows from the edge devices up through the broker and processing engine into storage and visualization. Commands flow back down from the operator to the bikes.

```
┌───────────────────────┐   ┌───────────────────────┐
│      BIKE NODE        │   │   DOCKING STATION     │
│        (x3-5)         │   │        (x2)           │
│  GPS · IMU · PIR      │   │  Slot sensors         │
│  Lock · Alarm · Bat   │   │  Dock lock · Status   │
└──────────┬────────────┘   └────────────┬──────────┘
           │                             │
           └──────────┬──────────────────┘
                      │ MQTT publish
                      ▼
        ┌─────────────────────────────┐
        │       MESSAGE BROKER        │
        │          Mosquitto          │
        └──────────────┬──────────────┘
                       │ subscribe
                       ▼
        ┌─────────────────────────────┐
        │      PROCESSING LAYER       │
        │          Node-RED           │
        │  parse · validate · route   │
        │  detect events              │
        └──────────┬──────────────────┘
                   │              │
                   ▼              ▼
        ┌──────────────┐  ┌───────────────────┐
        │   STORAGE    │  │     ALERTING      │
        │   InfluxDB   │  │  Grafana Alerting │
        └──────┬───────┘  └───────────────────┘
               │ query
               ▼
        ┌─────────────────────────────┐
        │       VISUALIZATION         │
        │           Grafana           │
        │  map · charts · tables      │
        │  data export                │
        └──────────────┬──────────────┘
                       │ operator issues command (HTTP)
                       ▼
        ┌─────────────────────────────┐
        │      ACTUATOR CONTROL       │
        │      Node.js REST API       │
        └──────────────┬──────────────┘
                       │ MQTT publish  bike/001/cmd
                       ▼
               Mosquitto → Bike Node
```

---

## Layer 1 — Edge Devices

Each device is a **Node.js script** that runs in a loop, reads simulated sensor values, and publishes JSON to the MQTT broker.

### Bike Node

Publishes sensor data on separate topics:

| Topic | Payload |
|---|---|
| `bike/001/gps` | `{ lat, lng, speed, heading, altitude }` |
| `bike/001/imu` | `{ accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z }` |
| `bike/001/status` | `{ battery_level, lock_state, alarm_active }` |

Also **subscribes** to receive commands:

| Topic | Payload |
|---|---|
| `bike/001/cmd` | `{ command_type: "lock" \| "unlock" \| "alarm_on" \| "alarm_off" }` |

### Docking Station Node

| Topic | Payload |
|---|---|
| `station/001/status` | `{ slots: [true, false, ...], available_slots, bikes_docked }` |
| `station/001/event` | `{ event: "dock" \| "undock", bike_id, slot_index, timestamp }` |

---

## Layer 2 — Message Broker (Mosquitto)

Mosquitto is the **central routing hub**. It does not process or store data — it only routes messages from publishers to subscribers based on topic names.

- All devices, Node-RED, and the REST API connect to Mosquitto
- Node-RED uses wildcard subscriptions like `bike/+/gps` to receive data from all bikes at once
- Runs as a single Docker container

---

## Layer 3 — Processing Layer (Node-RED)

Node-RED is where all the logic lives. It subscribes to every topic on the broker, processes the data, and decides where it goes next.

It runs four flows:

### Flow A — Ingest and Store

Receives every sensor message, parses the JSON, and writes it to InfluxDB.

```
[MQTT in: bike/+/gps]  →  [Parse JSON]  →  [Tag: bike_id, measurement=gps]  →  [InfluxDB out]
[MQTT in: bike/+/imu]  →  [Parse JSON]  →  [Tag: bike_id, measurement=imu]  →  [InfluxDB out]
[MQTT in: station/+/status]  →  [Parse JSON]  →  [InfluxDB out]
```

### Flow B — Fall Detection

Checks each IMU reading for a sudden spike in vertical acceleration, which indicates the bike has fallen.

```
[MQTT in: bike/+/imu]
    → [Function: if |accel_z| > 25 m/s² → generate fall alert]
    → [InfluxDB out: measurement=alerts, type=fall, severity=high]
```

### Flow C — Unauthorized Parking Detection

Checks GPS readings to see if a stationary bike is outside an authorized parking zone.

```
[MQTT in: bike/+/gps]
    → [Function: if speed < 1 km/h for > 60s AND not inside any zone polygon
                 → generate parking_violation alert]
    → [InfluxDB out: measurement=alerts, type=parking_violation]
```

### Flow D — Battery and Dock Events

Watches battery levels and dock/undock events to trigger alerts and compute trip records.

```
[MQTT in: bike/+/status]
    → [Switch: battery_level < 15]
    → [InfluxDB out: measurement=alerts, type=low_battery]

[MQTT in: station/+/event]
    → [Function: compute trip end, record duration and distance]
    → [InfluxDB out: measurement=trip_records]
```

---

## Layer 4 — Storage (InfluxDB)

InfluxDB is a **time-series database** — optimized for storing data that has a timestamp attached to every reading.

Each sensor reading is stored as a **measurement** with tags (labels for filtering) and fields (the actual values):

```
measurement:  gps
tags:         bike_id = bike-001
fields:       lat=44.4056, lng=8.9463, speed=12.3
timestamp:    2026-05-26T09:30:00Z
```

| Measurement | What it stores |
|---|---|
| `gps` | Position and speed of every bike |
| `imu` | Accelerometer and gyroscope samples |
| `station_status` | Slot availability per docking station |
| `alerts` | All generated events (fall, theft, geofence, battery) |
| `trip_records` | Completed trip summaries |
| `actuator_commands` | Every lock / unlock command with its status |

---

## Layer 5 — Visualization and Alerting (Grafana)

Grafana connects directly to InfluxDB and renders live dashboards.

| Panel | Content |
|---|---|
| Geomap | Live positions of all bikes on a map of Genoa |
| Time series | Speed, battery level, and IMU over time per bike |
| Stat | Available slots per docking station |
| Table | Recent alerts with severity and acknowledged status |
| Bar chart | Trips per day, utilization per station |

**Data export** is built in — any table panel has a CSV download button, satisfying the project requirement.

**Grafana Alerting** runs InfluxDB queries on a schedule. When a condition is met (e.g., more than one theft alert in the last 5 minutes), it fires a notification directly on the dashboard. No external service is needed.

---

## Layer 6 — Actuator Control (Node.js REST API)

A minimal Express server that receives operator commands from the dashboard and delivers them to the bikes via MQTT.

**Request from operator:**

```
POST /command
{ "bike_id": "bike-001", "command_type": "lock" }
```

**What the API does:**

1. Validates the command
2. Logs it to InfluxDB with `status = "pending"`
3. Publishes to `bike/001/cmd` on Mosquitto

**Bike Node response:**

The bike script receives the command, updates its lock state, and publishes an acknowledgement on `bike/001/status`. Node-RED picks this up and updates the InfluxDB record to `status = "acknowledged"`. The control loop is closed.

---

## Required Technologies Covered

From the project requirements, at least 2 of the listed technologies must be used. This stack covers 4:

| Technology | Role |
|---|---|
| **Node.js** | Edge device simulation + REST API |
| **Node-RED** | Stream processing, event detection |
| **InfluxDB** | Time-series storage |
| **Grafana** | Dashboard, alerting, data export |

---

## Deployment

All backend services run in Docker. A single `docker-compose.yml` starts the entire stack:

```
mosquitto    → MQTT broker
node-red     → processing flows
influxdb     → time-series storage
grafana      → dashboard
api          → Node.js actuator REST API
```

Edge device scripts run locally (or also as Docker services). The full system starts with:

```bash
docker compose up
```
