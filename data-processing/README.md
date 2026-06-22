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
        ├── package.json
        └── settings.js

shared/                          ← shared across all layers
└── parking-zones.json
```

## How to run

```bash
cd data-processing
docker compose up -d --build
```

- Node-RED editor: http://localhost:1880
- InfluxDB UI: http://localhost:8086 (admin / admin12345)

## MQTT topics

Each bike sends a single telemetry message every ~2 seconds (configurable via `TICK_MS`):

| Topic | Payload |
|---|---|
| `bike/{id}/telemetry` | `{ id, position: {lat, lng}, current_speed, imu: {x,y,z,dx,dy,dz}, battery, locked, status, current_ride, timestamp, rssi }` |

## Node-RED flows

Flows are in `node-red/data/flows.json` and editable at http://localhost:1880.

| Flow | What it does |
|---|---|
| A — Ingest & Store | Subscribes to `bike/+/telemetry`, writes `bike` measurement to InfluxDB, tracks `bikeLastSeen` |
| B — Fall Detection | Fires a `fall` alert when tilt deviates from gravity (`\|z - 9.8\| > 4.0`) or total acceleration exceeds 25 m/s²; only when rented |
| C — Parking Violation | Fires a `parking_violation` alert when a locked bike is outside all authorized zones |
| D — Battery Alerts | Fires a `low_battery` alert with tiered severity: ≤15% (low), ≤5% (medium), ≤0% (high) |
| E — Connectivity Monitoring | Every 15s, checks if any bike has been silent for >60s; fires a `connectivity` alert |

## Alerts

Alerts are append-only events in InfluxDB — we never update them.

| Type | Severity | When it fires |
|---|---|---|
| `fall` | high | `\|z - 9.8\| > 4.0` OR `sqrt(x²+y²+z²) > 25`; only when `status === "rented"` |
| `parking_violation` | medium | `locked === true` and bike is outside all parking zones |
| `low_battery` | low / medium / high | `battery ≤ 15%` (low), `≤ 5%` (medium), `≤ 0%` (high); fires on severity tier change |
| `connectivity` | medium | No telemetry for > 60 seconds; auto-clears when bike comes back online |

Each alert is written as:

```
measurement: alert
tags:        { bike_id, type, severity }
fields:      { alert_id, message }
```

**Acknowledging alerts:** instead of updating the original point (bad practice in time-series DBs), we write a separate event:

```
measurement: alert_ack
tags:        { bike_id, alert_id }
fields:      { acked, source }
```

To check if an alert was acknowledged, look for a matching `alert_id` in `alert_ack`.

## Parking zones

Defined in [`shared/parking-zones.json`](../shared/parking-zones.json) (shared across simulation, data-processing, and visualization). Mounted read-only into the Node-RED container at `/shared/`.

| Zone | zone_id | Coordinates | Radius |
|---|---|---|---|
| Porto Antico | `zone-porto-antico` | 44.4095, 8.9290 | 300 m |
| Piazza De Ferrari | `zone-de-ferrari` | 44.4072, 8.9345 | 200 m |
| Stazione Brignole | `zone-brignole` | 44.4153, 8.9425 | 250 m |
| Stazione Principe | `zone-principe` | 44.4103, 8.9213 | 250 m |

To add/edit zones, update `shared/parking-zones.json` and restart Node-RED:

```bash
docker compose restart node-red
```

Zone format:

```json
{
    "zone_id": "zone-example",
    "name": "Display Name",
    "center": { "lat": 44.0000, "lng": 8.0000 },
    "radius": 200
}
```

## InfluxDB schema

Bucket: `bike_data`, org: `iot-bikes`.

| Measurement | Tags | Fields |
|---|---|---|
| `bike` | `id` | `lat`, `lng`, `current_speed`, `imu_x/y/z`, `imu_dx/dy/dz`, `battery`, `locked`, `status`, `current_ride` |
| `alert` | `bike_id`, `type`, `severity` | `alert_id`, `message` |
| `alert_ack` | `bike_id`, `alert_id` | `acked`, `source` |

## Useful commands

```bash
docker compose logs -f node-red      # follow Node-RED logs
docker compose restart node-red      # restart after editing flows/zones
docker compose down                  # stop everything
docker compose down -v               # stop + wipe all data
```

## Demo Data Seeder

Write demo `bike` measurement points directly to InfluxDB using the same
connection values as `docker-compose.yml`. The seeder also adds `alert`
measurement rows for some of the bikes.

```bash
node demo-data/seed-bike-demo.js
```

Common options:

```bash
node demo-data/seed-bike-demo.js --bikes 5 --points 240 --interval-seconds 30
node demo-data/seed-bike-demo.js --dry-run
```

The script reads `data-processing/.env` first and then falls back to the
defaults used by the compose file.

## More Info

See [INTEGRATION.md](../INTEGRATION.md) for MQTT payload formats, Flux queries, and testing steps.
