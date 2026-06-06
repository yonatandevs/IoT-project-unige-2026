# Visualization

React + TypeScript app for inspecting bike telemetry stored in InfluxDB.

## Setup

```bash
cd visualization
npm install
npm run dev
```

The dev server proxies InfluxDB requests through `/influx` to avoid CORS issues
while developing locally.

## First Screen

The initial view queries the `bike` measurement from InfluxDB, fetches the
latest reading for each bike id, and renders the bikes on a map and in a
selectable list.

Selecting a bike from the map or the list keeps both views in sync. The detail
panel on the right loads the full history for that bike, computes average and
max speed, and draws a battery-over-time chart.
