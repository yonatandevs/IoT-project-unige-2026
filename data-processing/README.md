# Data Processing Pipeline

This is the backend data pipeline for the Smart Bike system. It runs three Docker containers — an MQTT broker (Mosquitto), a stream processor (Node-RED), and a time-series database (InfluxDB).

## Project structure

```
data-processing/
├── docker-compose.yml
├── .env / .env.example
├── mosquitto/
│   └── config/mosquitto.conf
└── node-red/
    ├── Dockerfile
    ├── package.json
    └── data/
        ├── flows.json
        ├── flows_cred.json
        ├── parking-zones.json
        └── settings.js
```

## How to run

```bash
cd data-processing
docker compose up -d --build
```

- Node-RED editor: http://localhost:1880
- InfluxDB UI: http://localhost:8086 (admin / admin12345)

## MQTT topics

Each bike sends a single telemetry message every ~5 seconds:

| Topic | Payload |
|---|---|
| `bike/{id}/telemetry` | `{ lat, lng, current_speed, imu_x, imu_y, imu_z, imu_dx, imu_dy, imu_dz, battery, locked, status, current_ride }` |
| `station/{id}/status` | `{ available_slots, bikes_docked }` |
| `station/{id}/event` | dock/undock events (not processed yet) |

## Node-RED flows

Flows are in `node-red/data/flows.json` and editable at http://localhost:1880.

| Flow | What it does |
|---|---|
| A — Ingest & Store | Subscribes to `bike/+/telemetry` and `station/+/status`, writes everything to InfluxDB |
| B — Fall Detection | Fires a `fall` alert when `|imu_z| > 25 m/s²` (~2.5g spike) |
| C — Parking Violation | Fires a `parking_violation` alert when a bike stops outside authorized zones |
| D — Battery & Dock | Fires a `low_battery` alert when battery drops below 15% |

## Alerts

Alerts are append-only events in InfluxDB — we never update them.

| Type | Severity | When it fires |
|---|---|---|
| `fall` | high | `|imu_z| > 25 m/s²` — sudden vertical impact |
| `parking_violation` | medium | `current_speed < 1` and bike is outside all parking zones |
| `low_battery` | low | `battery < 15%` |

Each alert is written as:

```
measurement: alert
tags:        { bike_id, type, severity }
fields:      { alert_id, message }
```

**Acknowledging alerts:** instead of updating the original point (bad practice in time-series DBs), we write a separate event:

```
measurement: alert_acknowledged
tags:        { alert_id }
fields:      { acknowledged_by, note }
```

To check if an alert was acknowledged, just look for a matching `alert_id` in `alert_acknowledged`.

## Parking zones

Defined in `node-red/data/parking-zones.json` and loaded into Node-RED on startup. Currently configured for Genoa:

| Zone | Coordinates | Radius |
|---|---|---|
| Porto Antico | 44.4095, 8.9290 | 300 m |
| Piazza De Ferrari | 44.4072, 8.9345 | 200 m |
| Stazione Brignole | 44.4153, 8.9425 | 250 m |
| Stazione Principe | 44.4103, 8.9213 | 250 m |
| Boccadasse | 44.3960, 8.9635 | 200 m |
| Università / Via Balbi | 44.4118, 8.9240 | 200 m |
| Spianata Castelletto | 44.4120, 8.9325 | 150 m |
| Fiera di Genova | 44.4030, 8.9530 | 300 m |

Edit the JSON file and restart Node-RED to update zones.

## InfluxDB schema

Bucket: `bike_data`, org: `iot-bikes`.

| Measurement | Tags | Fields |
|---|---|---|
| `bike` | `id` | `lat`, `lng`, `current_speed`, `imu_x/y/z`, `imu_dx/dy/dz`, `battery`, `locked`, `status`, `current_ride` |
| `alert` | `bike_id`, `type`, `severity` | `alert_id`, `message` |
| `alert_acknowledged` | `alert_id` | `acknowledged_by`, `note` |
| `station` | `station_id` | `available_slots`, `bikes_docked` |

## Useful commands

```bash
docker compose logs -f node-red      # follow Node-RED logs
docker compose restart node-red      # restart after editing flows/zones
docker compose down                  # stop everything
docker compose down -v               # stop + wipe all data
```

See [INTEGRATION.md](../INTEGRATION.md) for MQTT payload formats, Flux queries, and testing steps.
