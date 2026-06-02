#!/bin/bash

LOGS=("bike1.log" "bike2.log" "bike3.log")

while true; do
  clear

  printf "%-14s %-22s %-12s %-10s %-20s\n" "BIKE" "POSITION" "SPEED" "BATTERY" "TIMESTAMP"
  echo "--------------------------------------------------------------------------------------"

  for log in "${LOGS[@]}"; do
    line=$(tail -n 1 "$log" 2>/dev/null)

    if [ -n "$line" ]; then
      IFS='|' read -r id pos speed battery ts <<< "$line"

      printf "%-14s %-22s %-12s %-10s %-20s\n" \
        "$id" \
        "$pos" \
        "$speed km/h" \
        "$battery%" \
        "$ts"
    fi
  done

  sleep 1
done