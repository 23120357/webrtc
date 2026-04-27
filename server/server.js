const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 1. Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// 2. Dynamic API: Provide WebRTC infrastructure config
app.get('/api/turn-config', (req, res) => {
    const ip = process.env.TURN_IP;
    
    if (!ip) {
        console.warn("[WARN] TURN_IP is missing in .env file");
    }

    res.json({
        iceServers: [
            // STUN Servers
            { urls: [
                "stun:stun.l.google.com:19302",
            ] },
            
            // TURN Servers
            {
                urls: [
                    `turn:${ip}:3478?transport=udp`,
                    `turn:${ip}:3478?transport=tcp`,
                ],
                username: process.env.TURN_USER,
                credential: process.env.TURN_PASS
            }
        ]
    });
});

// 3. Signaling Server: Room & Message Management
const rooms = {}; // Structure: { roomId: { clientId: WebSocket } }

wss.on('connection', (ws) => {
    let currentRoom = null;
    let myClientId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'joinRoom':
                    currentRoom = data.roomId;
                    myClientId = data.sender;
                    
                    if (!rooms[currentRoom]) rooms[currentRoom] = {};
                    rooms[currentRoom][myClientId] = ws;

                    // Notify existing users so they can initiate the connection
                    broadcastToRoom(currentRoom, myClientId, {
                        type: 'userJoined',
                        sender: myClientId
                    });
                    console.log(`[INFO] Client ${myClientId} joined room ${currentRoom}`);
                    break;

                case 'offer':
                case 'answer':
                case 'candidate':
                    // Route signaling messages directly to the target peer
                    const targetWs = rooms[currentRoom]?.[data.target];
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify(data));
                    }
                    break;
            }
        } catch (error) {
            console.error("[ERROR] Failed to process message:", error);
        }
    });

    ws.on('close', () => {
        if (currentRoom && myClientId && rooms[currentRoom]) {
            delete rooms[currentRoom][myClientId];
            broadcastToRoom(currentRoom, null, { type: 'userLeft', sender: myClientId });
            console.log(`[INFO] Client ${myClientId} left room ${currentRoom}`);
        }
    });
});

// Helper: Send message to everyone in the room except the sender
function broadcastToRoom(roomId, excludeId, message) {
    const room = rooms[roomId];
    if (!room) return;
    
    for (const [id, clientWs] of Object.entries(room)) {
        if (id !== excludeId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(message));
        }
    }
}

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[INFO] Signaling Server running on port ${PORT}`));