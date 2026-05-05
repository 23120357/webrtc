const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Serve static frontend files
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dynamic API: Provide WebRTC ICE/TURN configuration to the client
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/turn-config', (req, res) => {
    const ip = process.env.TURN_IP;

    if (!ip) {
        console.warn("[WARN] TURN_IP is missing in .env file – TURN server will not be available.");
    }

    res.json({
        iceServers: [
            // Public STUN servers (Google)
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302"
                ]
            },
            // Local TURN server (Coturn via Docker)
            ...(ip ? [{
                urls: [
                    `turn:${ip}:3478?transport=udp`,
                    `turn:${ip}:3478?transport=tcp`,
                ],
                username: process.env.TURN_USER,
                credential: process.env.TURN_PASS
            }] : [])
        ]
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. API: Check if a room exists and has at least 1 member
//    GET /api/room-check?roomId=<id>
//    Response: { exists: true/false, memberCount: number }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/room-check', (req, res) => {
    const { roomId } = req.query;

    if (!roomId || typeof roomId !== 'string') {
        return res.status(400).json({ error: 'roomId is required' });
    }

    const room = rooms.get(roomId.trim());
    const exists = !!(room && room.size > 0);

    res.json({
        exists,
        memberCount: exists ? room.size : 0
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Room State Management
//    Structure: Map< roomId, Map< clientId, WebSocket > >
//    Separate Map for clientId → roomId lookup on disconnect
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Map<string, Map<string, WebSocket>>} */
const rooms = new Map();

/** @type {Map<string, Map<string, string>>} */
const roomMemberNames = new Map();

/** @type {Map<string, boolean>} */
const roomCallActive = new Map();

/** @type {Map<WebSocket, { roomId: string, clientId: string }>} */
const clientMeta = new Map();

// ─── Helper: get or create a room ──────────────────────────────────────────
function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
        roomMemberNames.set(roomId, new Map());
        console.log(`[ROOM] Created new room: "${roomId}"`);
    }
    return rooms.get(roomId);
}

// ─── Helper: broadcast to everyone in a room EXCEPT the excluded clientId ──
function broadcastToRoom(roomId, excludeClientId, payload) {
    const room = rooms.get(roomId);
    if (!room) return;

    const msg = JSON.stringify(payload);
    for (const [id, clientWs] of room) {
        if (id !== excludeClientId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msg);
        }
    }
}

// ─── Helper: send to a single target inside the same room ──────────────────
function sendToTarget(roomId, targetId, payload) {
    const room = rooms.get(roomId);
    if (!room) return false;

    const targetWs = room.get(targetId);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify(payload));
        return true;
    }
    return false;
}

// ─── Helper: clean up a client from state completely ───────────────────────
function removeClientFromRoom(ws) {
    const meta = clientMeta.get(ws);
    if (!meta) return; // Already cleaned up

    const { roomId, clientId } = meta;
    clientMeta.delete(ws);

    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(clientId);
    const nameMap = roomMemberNames.get(roomId);
    if (nameMap) nameMap.delete(clientId);
    console.log(`[ROOM] Client "${clientId}" removed from room "${roomId}". Remaining: ${room.size}`);

    // Notify remaining peers so they can close the dead RTCPeerConnection & remove the video tile
    broadcastToRoom(roomId, null, {
        type: 'memberLeft',
        sender: clientId
    });

    // Garbage-collect empty rooms to prevent memory leaks
    if (room.size === 0) {
        rooms.delete(roomId);
        roomMemberNames.delete(roomId);
        console.log(`[ROOM] Room "${roomId}" is now empty and has been deleted.`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WebSocket Signaling Handler
// ─────────────────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
    const remoteAddr = req.socket.remoteAddress;
    console.log(`[WS] New connection from ${remoteAddr}`);

    // ── Incoming messages ─────────────────────────────────────────────────
    ws.on('message', (raw) => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (err) {
            console.error('[ERROR] Malformed JSON received:', err.message);
            return;
        }

        // All messages (except joinRoom) require the client to be in a room
        const meta = clientMeta.get(ws);

        switch (data.type) {

            // ── Join Room ────────────────────────────────────────────────
            case 'joinRoom': {
                const { roomId, sender: clientId, displayName } = data;

                if (!roomId || !clientId) {
                    console.warn('[WARN] joinRoom missing roomId or sender – ignoring.');
                    return;
                }

                // If client was already in a room (re-join), clean up first
                if (meta) removeClientFromRoom(ws);

                const room = getOrCreateRoom(roomId);
                room.set(clientId, ws);
                clientMeta.set(ws, { roomId, clientId });

                const nameMap = roomMemberNames.get(roomId);
                if (nameMap) nameMap.set(clientId, (displayName || clientId).toString());

                console.log(`[JOIN] Client "${clientId}" joined room "${roomId}". Members: ${room.size}`);

                // ① Send the new joiner the list of everyone already in the room
                //    so the client can render the member list immediately
                const existingMembers = [...room.keys()]
                    .filter(id => id !== clientId)
                    .map(id => ({ id, name: nameMap ? nameMap.get(id) : id }));
                ws.send(JSON.stringify({
                    type: 'roomInfo',
                    roomId,
                    members: existingMembers
                }));

                // If a group call is already active, notify the new joiner
                if (roomCallActive.get(roomId)) {
                    ws.send(JSON.stringify({
                        type: 'startCall',
                        roomId,
                        sender: clientId,
                        members: [...room.keys()]
                    }));
                }

                // ② Notify existing members so they initiate RTCPeerConnection towards the newcomer
                broadcastToRoom(roomId, clientId, {
                    type: 'userJoined',
                    sender: clientId,
                    displayName: nameMap ? nameMap.get(clientId) : clientId
                });
                break;
            }

            // ── Offer / Answer / ICE Candidate (Mesh forwarding) ─────────
            case 'offer':
            case 'answer':
            case 'candidate': {
                if (!meta) {
                    console.warn(`[WARN] "${data.type}" from unregistered client – ignoring.`);
                    return;
                }
                const { roomId } = meta;
                const { target } = data;

                if (!target) {
                    console.warn(`[WARN] "${data.type}" message has no target – ignoring.`);
                    return;
                }

                const delivered = sendToTarget(roomId, target, data);
                if (!delivered) {
                    console.warn(`[WARN] Target "${target}" not found in room "${roomId}" – "${data.type}" dropped.`);
                }
                break;
            }

            // ── Mic status update (broadcast to room) ───────────────────
            case 'micStatus': {
                if (!meta) return;
                const { roomId, clientId } = meta;

                broadcastToRoom(roomId, null, {
                    type: 'micStatus',
                    sender: clientId,
                    enabled: !!data.enabled
                });
                break;
            }

            // ── Leave Room (graceful, sent by hangUp button) ──────────────
            case 'leaveRoom': {
                if (!meta) return;
                console.log(`[LEAVE] Client "${meta.clientId}" sent leaveRoom from room "${meta.roomId}".`);
                removeClientFromRoom(ws);
                break;
            }

            // ── Start Call (broadcast to all members in room) ───────────
            case 'startCall': {
                if (!meta) return;
                const { roomId, clientId } = meta;
                console.log(`[START] Client "${clientId}" started group call in room "${roomId}".`);

                roomCallActive.set(roomId, true);
                broadcastToRoom(roomId, null, {
                    type: 'startCall',
                    roomId,
                    sender: clientId,
                    members: [...rooms.get(roomId).keys()]
                });
                break;
            }

            // ── End Call (sent by hangUp; clean up entire room) ───────────
            case 'endCall': {
                if (!meta) return;
                const { roomId, clientId } = meta;
                console.log(`[END] Client "${clientId}" triggered endCall in room "${roomId}".`);

                roomCallActive.set(roomId, false);

                // Notify ALL members in the room (including sender)
                broadcastToRoom(roomId, null, {
                    type: 'callEnded',
                    sender: clientId
                });
                break;
            }

            default:
                console.warn(`[WARN] Unknown message type received: "${data.type}"`);
                break;
        }
    });

    // ── WebSocket disconnected (tab closed / network drop) ─────────────────
    ws.on('close', (code, reason) => {
        const meta = clientMeta.get(ws);
        if (meta) {
            console.log(`[DISCONNECT] Client "${meta.clientId}" disconnected from room "${meta.roomId}" (code: ${code}).`);
            removeClientFromRoom(ws);
        } else {
            console.log(`[DISCONNECT] Unregistered client disconnected (code: ${code}).`);
        }
    });

    // ── WebSocket error (network glitch, etc.) ─────────────────────────────
    ws.on('error', (err) => {
        const meta = clientMeta.get(ws);
        const who = meta ? `"${meta.clientId}"` : 'unregistered client';
        console.error(`[WS ERROR] Error on ${who}: ${err.message}`);
        // The 'close' event will always fire after 'error', so cleanup happens there
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Start Server
//    Bind to 0.0.0.0 so it is reachable from any network interface (LAN, Wi-Fi)
//    Port is read from .env so no IP/port is hardcoded
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[INFO] Signaling Server running on port ${PORT}`);
    console.log(`[INFO] Access locally:  http://localhost:${PORT}`);
    console.log(`[INFO] Access on LAN:   http://<YOUR_LAN_IP>:${PORT}`);
});