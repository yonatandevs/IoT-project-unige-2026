#!/bin/sh
set -e

echo "Waiting for Mosquitto..."
until nc -z mosquitto 1883; do sleep 1; done
echo "Mosquitto ready."

echo "Waiting for InfluxDB..."
until nc -z influxdb 8086; do sleep 1; done
echo "InfluxDB ready."

echo "Seeding historical data..."
node seed.js
echo "Seed done."

echo "Starting live simulators..."
node main.js normal bike-ge-001 &
node main.js lwo_battery bike-ge-002 
wait