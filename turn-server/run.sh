#!/bin/bash

echo "=== INITIALIZING TURN SERVER ==="

# Get into the directory
cd "$(dirname "$0")" || exit

# Running Docker Compose
echo "[1] Running Docker (Port Mapping Mode)..."
docker compose down
docker compose up -d

echo "------------------------------------------------"
echo "SUCCESSFULLY INITIALIZED TURN SERVER"
echo "TURN/STUN : Port 3478 (TCP & UDP)"
echo "Relay Ports: 49152 - 49251 (UDP)"
echo "------------------------------------------------"