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
latest reading for each bike id, and renders the rows in a selectable list.
Selecting a bike opens a detail panel on the right with the full history for
that bike, computed speed statistics, and a battery-over-time chart.
