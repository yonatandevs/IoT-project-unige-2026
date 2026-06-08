#!/usr/bin/env node

const net = require("node:net");

function parseArgs(argv) {
  const args = {
    host: "localhost",
    port: "1883",
    topic: "bike/bike-001/imu",
    bikeId: "bike-001",
    x: 3.5,
    y: 1.2,
    z: 28.5,
    dx: 0.8,
    dy: 0.3,
    dz: 0.1,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    if ((current === "--host" || current === "-h") && next) {
      args.host = next;
      i += 1;
    } else if (current === "--port" && next) {
      args.port = next;
      i += 1;
    } else if (current === "--topic" && next) {
      args.topic = next;
      i += 1;
    } else if (current === "--bike-id" && next) {
      args.bikeId = next;
      i += 1;
    } else if (current === "--x" && next) {
      args.x = Number(next);
      i += 1;
    } else if (current === "--y" && next) {
      args.y = Number(next);
      i += 1;
    } else if (current === "--z" && next) {
      args.z = Number(next);
      i += 1;
    } else if (current === "--dx" && next) {
      args.dx = Number(next);
      i += 1;
    } else if (current === "--dy" && next) {
      args.dy = Number(next);
      i += 1;
    } else if (current === "--dz" && next) {
      args.dz = Number(next);
      i += 1;
    } else if (current === "--dry-run") {
      args.dryRun = true;
    } else if (current === "--help") {
      printHelpAndExit();
    }
  }

  for (const key of ["x", "y", "z", "dx", "dy", "dz"]) {
    if (!Number.isFinite(args[key])) {
      throw new Error(`Invalid value for ${key}: ${args[key]}`);
    }
  }

  return args;
}

function printHelpAndExit() {
  console.log(`
Usage:
  node data-processing/demo-data/publish-fall-alert-demo.js [options]

Options:
  --host <name>       MQTT host (default: localhost)
  --port <port>       MQTT port (default: 1883)
  --topic <topic>     MQTT topic (default: bike/bike-001/imu)
  --bike-id <id>      Bike ID used in the payload/example
  --x <value>         IMU x acceleration (default: 3.5)
  --y <value>         IMU y acceleration (default: 1.2)
  --z <value>         IMU z acceleration (default: 28.5)
  --dx <value>        IMU roll rate (default: 0.8)
  --dy <value>        IMU pitch rate (default: 0.3)
  --dz <value>        IMU yaw rate (default: 0.1)
  --dry-run           Print the payload instead of publishing it
  --help              Show this help
`);
  process.exit(0);
}

function buildPayload(args) {
  return {
    x: args.x,
    y: args.y,
    z: args.z,
    dx: args.dx,
    dy: args.dy,
    dz: args.dz,
  };
}

function encodeString(value) {
  const buffer = Buffer.from(String(value), "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(buffer.length, 0);
  return Buffer.concat([length, buffer]);
}

function encodeRemainingLength(length) {
  const bytes = [];
  let value = length;

  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      digit |= 0x80;
    }
    bytes.push(digit);
  } while (value > 0);

  return Buffer.from(bytes);
}

function createClientId() {
  return `fall-demo-${Date.now().toString(36)}`;
}

function buildConnectPacket(clientId) {
  const variableHeader = Buffer.concat([
    encodeString("MQTT"),
    Buffer.from([0x04, 0x02, 0x00, 0x3c]),
  ]);
  const payload = encodeString(clientId);
  const remainingLength = encodeRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([0x10]), remainingLength, variableHeader, payload]);
}

function buildPublishPacket(topic, message) {
  const payload = Buffer.from(message, "utf8");
  const variableHeader = encodeString(topic);
  const remainingLength = encodeRemainingLength(variableHeader.length + payload.length);
  return Buffer.concat([Buffer.from([0x30]), remainingLength, variableHeader, payload]);
}

function publishMqtt(args, payloadJson) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: args.host, port: Number(args.port) });
    const clientId = createClientId();
    let connected = false;
    let publishSent = false;

    socket.on("error", reject);

    socket.on("connect", () => {
      socket.write(buildConnectPacket(clientId));
    });

    socket.on("data", (chunk) => {
      if (chunk.length < 4 || chunk[0] !== 0x20) {
        return;
      }

      const connackFlags = chunk[2];
      const returnCode = chunk[3];
      if (connackFlags !== 0x00 || returnCode !== 0x00) {
        reject(new Error(`MQTT broker rejected connection (code ${returnCode})`));
        socket.destroy();
        return;
      }

      if (!connected) {
        connected = true;
      }

      if (!publishSent) {
        publishSent = true;
        socket.write(buildPublishPacket(args.topic, payloadJson));
        socket.end();
      }
    });

    socket.on("close", () => {
      if (connected) {
        resolve();
      }
    });

    socket.setTimeout(5000, () => {
      reject(new Error("Timed out connecting to MQTT broker"));
      socket.destroy();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildPayload(args);
  const payloadJson = JSON.stringify(payload);

  if (args.dryRun) {
    process.stdout.write(`${args.topic}\n${payloadJson}\n`);
    return;
  }

  await publishMqtt(args, payloadJson);
  console.log(`Published fall-alert IMU data to ${args.topic} on ${args.host}:${args.port}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
