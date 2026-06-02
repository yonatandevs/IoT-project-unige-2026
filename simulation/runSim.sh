#!/bin/bash

BIKE_ID=bike-ge-001 node main.js > bike1.log &
BIKE_ID=bike-ge-002 node main.js > bike2.log &
BIKE_ID=bike-ge-003 node main.js > bike3.log &

bash simLog.sh &
wait