# Bike Sharing Visualization

This app shows bike sharing related data fetched from the InfluxDB.

## Setup

The following commands will start the InfluxDB, populate it with demo data and then start the actual app to visualize the data.

```bash
cd data-processing
docker compose up -d
node demo-data/seed-bike-demo.js
cd ../visualization
npm install
npm run dev
```

