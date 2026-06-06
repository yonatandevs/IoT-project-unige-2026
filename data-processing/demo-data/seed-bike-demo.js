#!/usr/bin/env node

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    bikes: 3,
    points: 180,
    intervalSeconds: 60,
    start: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    if (current === "--bikes" && next) {
      args.bikes = Number(next);
      i += 1;
    } else if (current === "--points" && next) {
      args.points = Number(next);
      i += 1;
    } else if (current === "--interval-seconds" && next) {
      args.intervalSeconds = Number(next);
      i += 1;
    } else if (current === "--start" && next) {
      args.start = next;
      i += 1;
    } else if (current === "--dry-run") {
      args.dryRun = true;
    } else if (current === "--help" || current === "-h") {
      printHelpAndExit();
    }
  }

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`Invalid value for ${key}: ${value}`);
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`
Usage:
  node data-processing/scripts/seed-bike-demo.js [options]

Options:
  --bikes <n>             Number of bikes to generate (default: 3)
  --points <n>            Points per bike (default: 180)
  --interval-seconds <n>  Seconds between points (default: 60)
  --start <iso-date>      Start time for the first point
  --dry-run               Print line protocol instead of writing to InfluxDB
  -h, --help              Show this help
`);
  process.exit(0);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function escapeTag(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/ /g, "\\ ");
}

function escapeStringField(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function formatFieldValue(value) {
  if (typeof value === "string") {
    return `"${escapeStringField(value)}"`;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return Number(value).toString();
}

function toNanoseconds(date) {
  return `${BigInt(date.getTime()) * 1000000n}`;
}

function buildBikePoint(bikeId, bikeIndex, pointIndex, pointCount, timestamp, random) {
  const progress = pointCount === 1 ? 1 : pointIndex / (pointCount - 1);
  const ridingWindow = progress > 0.1 && progress < 0.9;
  const availableWindow = !ridingWindow;
  const brokenWindow = bikeIndex === 2 && progress > 0.82;

  let status = "rented";
  let locked = false;
  let currentRide = `ride-${bikeId}-${String(Math.floor(pointIndex / 12) + 1).padStart(3, "0")}`;
  let currentSpeed = 14 + Math.sin(progress * Math.PI * 4) * 6 + (random() - 0.5) * 1.5;
  let battery = Math.max(10, 92 - pointIndex * (0.12 + bikeIndex * 0.02));

  if (availableWindow) {
    status = "available";
    locked = true;
    currentRide = "";
    currentSpeed = Math.max(0, (random() - 0.35) * 0.8);
  }

  if (brokenWindow) {
    status = "broken";
    locked = true;
    currentRide = "";
    currentSpeed = 0;
    battery = Math.min(battery, 13.5);
  }

  if (battery < 15 && status !== "broken") {
    status = "broken";
    locked = true;
    currentRide = "";
    currentSpeed = 0;
  }

  const baseLat = 44.4056 + bikeIndex * 0.0014;
  const baseLng = 8.9463 + bikeIndex * 0.0018;
  const travelRadius = ridingWindow ? 0.003 + bikeIndex * 0.0005 : 0.00035;
  const theta = progress * Math.PI * 6 + bikeIndex;
  const lat = baseLat + Math.sin(theta) * travelRadius + (random() - 0.5) * 0.00012;
  const lng = baseLng + Math.cos(theta) * travelRadius + (random() - 0.5) * 0.00012;

  const imuNoise = (scale) => (random() - 0.5) * scale;
  const imu = {
    x: ridingWindow ? 0.35 * Math.sin(theta * 1.8) + imuNoise(0.4) : imuNoise(0.08),
    y: ridingWindow ? 0.28 * Math.cos(theta * 1.4) + imuNoise(0.3) : imuNoise(0.08),
    z: 9.81 + (ridingWindow ? imuNoise(0.9) : imuNoise(0.15)),
    dx: ridingWindow ? imuNoise(0.07) : imuNoise(0.015),
    dy: ridingWindow ? imuNoise(0.07) : imuNoise(0.015),
    dz: ridingWindow ? imuNoise(0.08) : imuNoise(0.015),
  };

  return {
    id: bikeId,
    current_ride: currentRide,
    status,
    locked,
    position: {
      lng,
      lat,
    },
    battery,
    current_speed: currentSpeed,
    imu,
    timestamp,
  };
}

function bikeToLineProtocol(bike) {
  const measurement = "bike";
  const tagSet = `id=${escapeTag(bike.id)}`;
  const fieldSet = [
    `lat=${formatFieldValue(bike.position.lat)}`,
    `lng=${formatFieldValue(bike.position.lng)}`,
    `current_speed=${formatFieldValue(bike.current_speed)}`,
    `battery=${formatFieldValue(bike.battery)}`,
    `locked=${formatFieldValue(bike.locked)}`,
    `status=${formatFieldValue(bike.status)}`,
    `current_ride=${formatFieldValue(bike.current_ride)}`,
    `imu_x=${formatFieldValue(bike.imu.x)}`,
    `imu_y=${formatFieldValue(bike.imu.y)}`,
    `imu_z=${formatFieldValue(bike.imu.z)}`,
    `imu_dx=${formatFieldValue(bike.imu.dx)}`,
    `imu_dy=${formatFieldValue(bike.imu.dy)}`,
    `imu_dz=${formatFieldValue(bike.imu.dz)}`,
  ].join(",");

  return `${measurement},${tagSet} ${fieldSet} ${toNanoseconds(bike.timestamp)}`;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function writeToInflux(config, lines) {
  const target = new URL(config.url);
  const transport = target.protocol === "https:" ? https : http;
  const body = lines.join("\n");
  const requestPath = `/api/v2/write?org=${encodeURIComponent(config.org)}&bucket=${encodeURIComponent(config.bucket)}&precision=ns`;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: requestPath,
        headers: {
          Authorization: `Token ${config.token}`,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunkData) => chunks.push(chunkData));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(
            new Error(
              `InfluxDB write failed with ${res.statusCode}: ${responseBody || res.statusMessage || "unknown error"}`
            )
          );
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const envFromFile = loadEnv(path.join(repoRoot, ".env"));
  const env = { ...envFromFile, ...process.env };

  const config = {
    url: env.INFLUXDB_URL || "http://localhost:8086",
    org: env.INFLUXDB_ORG || "iot-bikes",
    bucket: env.INFLUXDB_BUCKET || "bike_data",
    token: env.INFLUXDB_ADMIN_TOKEN || "dev-token-change-in-production",
  };

  if (!config.url || !config.org || !config.bucket || !config.token) {
    throw new Error("Missing InfluxDB configuration. Check data-processing/.env or your environment.");
  }

  const startTime = args.start ? new Date(args.start) : new Date(Date.now() - (args.points - 1) * args.intervalSeconds * 1000);
  if (Number.isNaN(startTime.getTime())) {
    throw new Error(`Invalid --start value: ${args.start}`);
  }

  const allLines = [];
  for (let bikeIndex = 0; bikeIndex < args.bikes; bikeIndex += 1) {
    const bikeId = `bike-${String(bikeIndex + 1).padStart(3, "0")}`;
    const random = createRandom(hashString(bikeId));

    for (let pointIndex = 0; pointIndex < args.points; pointIndex += 1) {
      const timestamp = new Date(startTime.getTime() + pointIndex * args.intervalSeconds * 1000);
      const bike = buildBikePoint(bikeId, bikeIndex, pointIndex, args.points, timestamp, random);
      allLines.push(bikeToLineProtocol(bike));
    }
  }

  if (args.dryRun) {
    process.stdout.write(`${allLines.join("\n")}\n`);
    return;
  }

  const batches = chunk(allLines, 500);
  for (let i = 0; i < batches.length; i += 1) {
    await writeToInflux(config, batches[i]);
  }

  console.log(
    `Seeded ${allLines.length} bike points into ${config.url} (org=${config.org}, bucket=${config.bucket}).`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
