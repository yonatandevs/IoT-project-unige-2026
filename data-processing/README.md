# Data Processing Pipeline

MQTT broker + Node-RED processing + InfluxDB storage for the Smart Bike IoT system.

## What's Inside

```
data-processing/
├── docker-compose.yml          # All 3 services in one stack
├── .env.example                # Copy to .env and adjust
├── mosquitto/
│   └── config/mosquitto.conf   # Broker config (anonymous, port 1883)
└── node-red/
    ├── Dockerfile              # Custom image with InfluxDB node
    ├── package.json            # Node-RED dependencies
    └── data/
        └── flows.json          # 4 processing flows (version-controlled)
```

## Quick Start

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Start everything
docker compose up -d

# 3. Open the UIs
#    Node-RED editor:  http://localhost:1880
#    InfluxDB UI:      http://localhost:8086
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
| A    | Ingest & Store           | `bike/+/gps`, `bike/+/imu`, `bike/+/status`, `station/+/status` | Parses sensor data and writes to InfluxDB |
| B    | Fall Detection           | `bike/+/imu`        | Triggers alert when `|accel_z| > 25 m/s²`              |
| C    | Parking Violation        | `bike/+/gps`        | Triggers alert when bike is stationary outside a zone   |
| D    | Battery & Dock Events    | `bike/+/status`, `station/+/event` | Low battery alert (< 15%), dock event placeholder |

## InfluxDB Measurements

All data is stored in the `bike_data` bucket under org `iot-bikes`.

| Measurement      | Tags              | Fields                                                    |
|------------------|-------------------|-----------------------------------------------------------|
| `gps`            | `bike_id`         | `lat`, `lng`, `speed`, `heading`, `altitude`              |
| `imu`            | `bike_id`         | `accel_x`, `accel_y`, `accel_z`, `gyro_x`, `gyro_y`, `gyro_z` |
| `bike_status`    | `bike_id`         | `battery_level`, `lock_state`, `alarm_active`             |
| `station_status` | `station_id`      | `available_slots`, `bikes_docked`                         |
| `alerts`         | `bike_id`, `type`, `severity` | `message`, `acknowledged`                     |

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

## Status

The flows expect MQTT messages on separate topics (`bike/{id}/gps`, etc.)
as defined in the project proposal. See `INTEGRATION.md` in the project root for the exact
topic structure, payload formats, and testing instructions.
