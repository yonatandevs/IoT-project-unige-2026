# Data Processing Pipeline

MQTT broker + Node-RED processing + InfluxDB storage for the Smart Bike IoT system.

## What's Inside

```
data-processing/
├── docker-compose.yml          # All 3 services in one stack
├── .env                        # InfluxDB credentials (dev defaults)
├── .env.example                # Reference template
├── mosquitto/
│   └── config/mosquitto.conf   # Broker config (anonymous, port 1883)
└── node-red/
    ├── Dockerfile              # Custom image with InfluxDB node
    ├── package.json            # Node-RED dependencies
    └── data/
        ├── flows.json          # 4 processing flows (version-controlled)
        ├── flows_cred.json     # InfluxDB token (version-controlled)
        └── settings.js         # Node-RED config
```

## Quick Start

```bash
cd data-processing
docker compose up -d --build
# Node-RED editor:  http://localhost:1880
# InfluxDB UI:      http://localhost:8086  (admin / admin12345)
```

## Services

| Service    | Port | Purpose                          |
|------------|------|----------------------------------|
| Mosquitto  | 1883 | MQTT broker                      |
| Node-RED   | 1880 | Stream processing + event detect |
| InfluxDB   | 8086 | Time-series storage              |

## Node-RED Flows

The flows are pre-loaded from `node-red/data/flows.json`. You can also edit them
in the browser at http://localhost:1880.

| Flow | Name                     | Subscribes to       | What it does                                            |
|------|--------------------------|----------------------|---------------------------------------------------------|
| A    | Ingest & Store           | `bike/+/gps`, `bike/+/imu`, `bike/+/status`, `station/+/status` | Writes to `bike` and `station` measurements |
| B    | Fall Detection           | `bike/+/imu`        | Triggers alert when `|z| > 25 m/s²`                    |
| C    | Parking Violation        | `bike/+/gps`        | Triggers alert when bike is stationary outside a zone   |
| D    | Battery & Dock Events    | `bike/+/status`, `station/+/event` | Low battery alert (< 15%), dock event placeholder |

## InfluxDB Measurements

All data is stored in the `bike_data` bucket under org `iot-bikes`.
Schema matches [models/bike.ts](../models/bike.ts) and [models/alert.ts](../models/alert.ts).

| Measurement | Tags              | Fields                                                    |
|-------------|-------------------|-----------------------------------------------------------|
| `bike`      | `id`              | `lat`, `lng`, `current_speed`, `imu_x`, `imu_y`, `imu_z`, `imu_dx`, `imu_dy`, `imu_dz`, `battery`, `locked`, `status`, `current_ride` |
| `alert`     | `bike_id`, `type`, `severity` | `alert_id`, `message`, `acknowledged`         |
| `station`   | `station_id`      | `available_slots`, `bikes_docked`                         |

## Useful Commands

```bash
# View logs for a specific service
docker compose logs -f node-red

# Restart just Node-RED (after editing flows)
docker compose restart node-red

# Stop everything
docker compose down

# Stop and remove all data (fresh start)
docker compose down -v
```

## Demo Data Seeder

Write demo `bike` measurement points directly to InfluxDB using the same
connection values as `docker-compose.yml`:

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

See [INTEGRATION.md](../INTEGRATION.md) in the project root for the exact
MQTT topic structure, payload formats, Flux queries, and testing instructions.
