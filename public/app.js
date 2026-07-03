// ═══════════════════════════════════════════════════════════════════════════════
// WebRTC Mesh Group Call — Client Logic (B1 UI + Mesh Signaling)
// ═══════════════════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────────────────
let rtcConfig = null;
let localStream = null;
/** @type {Object.<string, RTCPeerConnection>} */
let peers = {};
let ws = null;
let micEnabled = true;
let camEnabled = true;
let groupCallActive = false;

// ── Member list: Set of clientIds currently in the room ───────────────────────
/** @type {Set<string>} */
const roomMembers = new Set();

/** @type {Map<string, boolean>} */
const memberMicEnabled = new Map();

// ── Identity (random, generated once per page load) ───────────────────────────
const myClientId = Math.random().toString(36).substring(2, 9);
let myDisplayName = myClientId;

/** @type {Map<string, string>} */
const memberDisplayNames = new Map();

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getDisplayName(id) {
    if (id === myClientId) return myDisplayName || id;
    return memberDisplayNames.get(id) || id;
}

function formatMemberLabel(id) {
    const name = getDisplayName(id);
    return name === id ? id : `${name} (${id})`;
}

function updateMyIdentityUI() {
    const navId = document.getElementById('my-id-display');
    const lobbyId = document.getElementById('lobby-my-id');
    const localLabel = document.getElementById('local-video-label');

    if (navId) navId.innerText = myClientId;
    if (lobbyId) lobbyId.innerText = myClientId;
    if (localLabel) localLabel.innerText = `Bạn (${getDisplayName(myClientId)})`;
}

function applyDisplayNameFromInput() {
    const input = document.getElementById('name-input');
    if (!input) return;

    const raw = input.value.trim();
    myDisplayName = raw || myClientId;
    updateMyIdentityUI();
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ICE_TIMEOUT_MS = 12000;

// ── Avatar colors (deterministic based on ID) ─────────────────────────────────
const AVATAR_COLORS = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
    '#22c55e', '#06b6d4', '#f97316', '#6366f1'
];
function getAvatarColor(id) {
    let hash = 0;
    for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. BOOTSTRAP — show lobby on page load (no auto-join)
// ═══════════════════════════════════════════════════════════════════════════════
window.onload = () => {
    updateMyIdentityUI();

    const nameInput = document.getElementById('name-input');
    if (nameInput) {
        nameInput.value = myDisplayName;
        nameInput.addEventListener('input', () => {
            applyDisplayNameFromInput();
            showLobbyError('');
        });
    }

    // Pre-fetch ICE config in background so it's ready when user clicks Join
    fetch('/api/turn-config')
        .then(r => r.json())
        .then(cfg => {
            rtcConfig = cfg;
            console.log('[INFO] ICE config pre-loaded:', cfg);
        })
        .catch(() => console.warn('[WARN] Could not pre-load ICE config.'));
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. UI PHASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function showLobby() {
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('room-screen').classList.remove('active');
    document.getElementById('room-chip').style.display = 'none';
}

function showRoom(roomId) {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('room-screen').classList.add('active');
    document.getElementById('room-display').innerText = roomId;
    document.getElementById('room-title').innerText = roomId;
    document.getElementById('room-chip').style.display = 'block';
}

function showLoading(text = 'Đang xử lý...') {
    document.getElementById('loading-overlay').classList.add('active');
    document.getElementById('loading-text').innerText = text;
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MEMBER LIST — render / add / remove
// ═══════════════════════════════════════════════════════════════════════════════
function renderMemberList() {
    const ul = document.getElementById('member-list');
    const badge = document.getElementById('member-count-badge');
    const badge2 = document.getElementById('room-status-badge');

    ul.innerHTML = '';
    const totalCount = roomMembers.size + 1; // +1 for self

    badge.innerText = totalCount;
    badge2.innerText = `${totalCount} thành viên`;
    badge2.style.background = 'rgba(34,197,94,0.15)';
    badge2.style.color = '#22c55e';
    badge2.style.border = '1px solid rgba(34,197,94,0.3)';
    badge2.style.borderRadius = '20px';
    badge2.style.padding = '2px 9px';
    badge2.style.fontSize = '0.72rem';

    // Render self first
    ul.appendChild(buildMemberItem(myClientId, 'me'));

    // Render others
    for (const id of roomMembers) {
        const hasConnection = peers[id] && peers[id].connectionState === 'connected';
        ul.appendChild(buildMemberItem(id, hasConnection ? 'connected' : 'online'));
    }
}

function buildMemberItem(id, cssClass = '') {
    const li = document.createElement('li');
    li.className = `member-item ${cssClass}`;
    li.id = `member-${id}`;

    const displayName = getDisplayName(id);
    const initials = (displayName || id).substring(0, 2).toUpperCase();
    const color = getAvatarColor(id);
    const isMe = id === myClientId;

    const micOn = id === myClientId ? micEnabled : memberMicEnabled.get(id) !== false;
    const micBadge = micOn ? '' : ' <span class="mic-muted">🚫🎙️</span>';
    const safeLabel = escapeHtml(displayName || id);

    li.innerHTML = `
        <div class="member-avatar" style="background:${color}">${initials}</div>
        <div class="member-info">
            <div class="member-name">${safeLabel}${isMe ? ' (bạn)' : ''}${micBadge}</div>
            <div class="member-status ${cssClass === 'connected' ? 'calling' : 'online'}">
                ${isMe ? '● Bạn' : cssClass === 'connected' ? '● Đang gọi' : '● Trong phòng'}
            </div>
        </div>
    `;
    return li;
}

function addMember(id) {
    roomMembers.add(id);
    if (!memberMicEnabled.has(id)) memberMicEnabled.set(id, true);
    renderMemberList();
}

function removeMember(id) {
    roomMembers.delete(id);
    memberMicEnabled.delete(id);
    renderMemberList();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. LOBBY ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════
function getRoomId() {
    const input = document.getElementById('room-input');
    return (input ? input.value.trim() : '') || '';
}

/** Hiện / ẩn thông báo lỗi inline trong lobby card */
function showLobbyError(msg) {
    const el = document.getElementById('lobby-error');
    if (!el) return;
    el.innerText = msg;
    el.style.display = msg ? 'block' : 'none';
}

/**
 * joinRoom() — CHỈ vào được nếu phòng đã tồn tại trên server.
 * Bước 1: kiểm tra /api/room-check → nếu không tồn tại → báo lỗi, dừng.
 * Bước 2: xin quyền camera → kết nối WS → vào phòng.
 */
async function joinRoom() {
    applyDisplayNameFromInput();

    const roomId = getRoomId();
    if (!roomId) {
        showLobbyError('Vui lòng nhập tên phòng trước khi vào!');
        return;
    }

    showLobbyError(''); // Xóa lỗi cũ
    showLoading('Đang kiểm tra phòng...');

    try {
        // ── Bước 1: Kiểm tra phòng có tồn tại không ────────────────────
        const checkRes = await fetch(`/api/room-check?roomId=${encodeURIComponent(roomId)}`);
        const { exists, memberCount } = await checkRes.json();

        if (!exists) {
            hideLoading();
            showLobbyError(`Phòng "${roomId}" không tồn tại hoặc chưa có ai trong phòng. Hãy nhập đúng Room ID hoặc dùng "Tạo Phòng Mới".`);
            return;
        }

        console.log(`[INFO] Room "${roomId}" exists with ${memberCount} member(s). Joining...`);

        // ── Bước 2: Xin quyền camera / mic ─────────────────────────────
        await enterRoomDirect(roomId);

    } catch (err) {
        hideLoading();
        console.error('[ERROR] joinRoom failed:', err);
        showLobbyError('Lỗi kết nối server. Vui lòng thử lại.');
    }
}

/**
 * createRoom() — Tạo phòng mới với ID ngẫu nhiên.
 * Bỏ qua bước kiểm tra tồn tại vì đây là phòng mới.
 */
async function createRoom() {
    applyDisplayNameFromInput();

    showLobbyError('');
    const newId = 'room-' + Math.random().toString(36).substring(2, 8);
    document.getElementById('room-input').value = newId;
    await enterRoomDirect(newId);
}

/**
 * enterRoomDirect() — Hàm nội bộ: xin cam/mic → vào phòng.
 * Dùng bởi createRoom() (không cần check) và joinRoom() (sau khi đã check).
 */
async function enterRoomDirect(roomId) {
    showLoading('Đang yêu cầu quyền Camera & Microphone...');

    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.disabled = true;

    try {
        // Fetch ICE config nếu chưa có
        if (!rtcConfig) {
            const r = await fetch('/api/turn-config');
            rtcConfig = await r.json();
            console.log('[INFO] ICE config fetched on join:', rtcConfig);
        } else {
            console.log('[INFO] Using pre-loaded ICE config:', rtcConfig);
        }

        // Xin quyền camera + mic
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;

        // Chuyển sang Room Screen
        showRoom(roomId);
        hideLoading();
        renderMemberList();

        updateUIStatus('Đang kết nối tới Signaling Server...');
        connectSignaling(roomId);

    } catch (err) {
        hideLoading();
        console.error('[ERROR] enterRoomDirect failed:', err);
        if (err.name === 'NotAllowedError') {
            showLobbyError('Không được cấp quyền Camera/Mic. Vui lòng cho phép trình duyệt và thử lại.');
        } else {
            showLobbyError('Lỗi: ' + err.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. WEBSOCKET SIGNALING
// ═══════════════════════════════════════════════════════════════════════════════
function connectSignaling(roomId) {
    // Tự động nhận diện: Nếu URL là https (Ngrok) thì dùng wss://, nếu là http (localhost) thì dùng ws://
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    console.log('[INFO] Connecting WebSocket to:', wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`[INFO] WS connected. Joining room: "${roomId}"`);
        updateUIStatus(`Đã kết nối. Đang vào phòng "${roomId}"...`);
        ws.send(JSON.stringify({
            type: 'joinRoom',
            roomId,
            sender: myClientId,
            displayName: myDisplayName
        }));
    };

    ws.onmessage = async (event) => {
        let data;
        try { data = JSON.parse(event.data); }
        catch { return; }

        switch (data.type) {

            // ── Server gửi danh sách thành viên cho người mới join ─────────
            case 'roomInfo': {
                const members = Array.isArray(data.members) ? data.members : [];
                const ids = [];

                for (const member of members) {
                    const id = typeof member === 'string' ? member : member.id;
                    const name = typeof member === 'string' ? null : member.name;
                    if (!id || id === myClientId) continue;
                    ids.push(id);
                    if (name) memberDisplayNames.set(id, name);
                    addMember(id);                       // Hiện trên member list
                }

                console.log(`[INFO] roomInfo → members: [${ids.join(', ')}]`);

                updateUIStatus(
                    ids.length === 0
                        ? 'Đang chờ thành viên khác tham gia...'
                        : `Có ${ids.length} thành viên trong phòng. Đang chờ kết nối...`
                );
                break;
            }

            // ── Existing member thấy người mới → gửi offer ───────────────
            case 'userJoined': {
                const newId = data.sender;
                if (data.displayName) memberDisplayNames.set(newId, data.displayName);
                console.log(`[INFO] userJoined: "${newId}" → tôi là existing member, gửi offer...`);
                addMember(newId);

                if (groupCallActive) {
                    if (!peers[newId]) createPeerConnection(newId);
                    if (shouldInitiateOffer(newId)) {
                        const pc = peers[newId];
                        try {
                            const offer = await pc.createOffer();
                            await pc.setLocalDescription(offer);
                            sendToServer({ type: 'offer', target: newId, sdp: offer });
                        } catch (err) {
                            console.error(`[ERROR] createOffer to ${newId}:`, err.message);
                        }
                    }
                }
                break;
            }

            // ── Nhận Offer → trả Answer ───────────────────────────────────
            case 'offer': {
                console.log(`[INFO] Received offer from: ${data.sender}`);
                const offerPc = peers[data.sender] || createPeerConnection(data.sender);

                // Glare guard
                if (offerPc.signalingState === 'have-local-offer') {
                    console.warn(`[WARN] Glare with ${data.sender} — rolling back.`);
                    await offerPc.setLocalDescription({ type: 'rollback' });
                }

                try {
                    await offerPc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    const answer = await offerPc.createAnswer();
                    await offerPc.setLocalDescription(answer);
                    sendToServer({ type: 'answer', target: data.sender, sdp: answer });
                } catch (err) {
                    console.error(`[ERROR] Processing offer from ${data.sender}:`, err.message);
                }
                break;
            }

            // ── Nhận Answer ───────────────────────────────────────────────
            case 'answer': {
                if (peers[data.sender]) {
                    try {
                        await peers[data.sender].setRemoteDescription(
                            new RTCSessionDescription(data.sdp)
                        );
                    } catch (err) {
                        console.error(`[ERROR] setRemoteDescription(answer) from ${data.sender}:`, err.message);
                    }
                }
                break;
            }

            // ── Nhận ICE Candidate ────────────────────────────────────────
            case 'candidate': {
                if (peers[data.sender]) {
                    try {
                        await peers[data.sender].addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        );
                    } catch (err) {
                        console.warn(`[WARN] addIceCandidate from ${data.sender}:`, err.message);
                    }
                }
                break;
            }

            // ── Thành viên rời/mất kết nối ───────────────────────────────
            case 'memberLeft': {
                if (data.sender) memberDisplayNames.delete(data.sender);
                handlePeerDisconnected(data.sender);
                break;
            }

            // ── endCall: ai đó kết thúc toàn bộ cuộc gọi ─────────────────
            case 'callEnded': {
                console.log(`[INFO] callEnded from: ${data.sender}`);
                updateUIStatus(`"${data.sender}" đã kết thúc cuộc gọi.`, 'warn');
                cleanUpCallOnly();
                groupCallActive = false;
                const startBtn = document.getElementById('btn-start-call');
                if (startBtn) startBtn.disabled = false;
                break;
            }

            // ── Mic status update ───────────────────────────────────────
            case 'micStatus': {
                if (data.sender && data.sender !== myClientId) {
                    memberMicEnabled.set(data.sender, !!data.enabled);
                    renderMemberList();
                }
                break;
            }

            // ── Start group call (broadcast) ─────────────────────────────
            case 'startCall': {
                if (Array.isArray(data.members)) {
                    roomMembers.clear();
                    for (const id of data.members) {
                        if (id !== myClientId) roomMembers.add(id);
                    }
                    renderMemberList();
                }

                await startMeshForMembers();
                break;
            }

            default:
                console.warn(`[WARN] Unknown message type: "${data.type}"`);
        }
    };

    ws.onclose = (e) => {
        console.log(`[WS] Closed (code: ${e.code})`);
        updateUIStatus('Mất kết nối tới server.', 'error');
    };

    ws.onerror = (e) => {
        console.error('[WS ERROR]', e);
        updateUIStatus('Lỗi WebSocket.', 'error');
    };
}

// Helper: gửi message lên server
function sendToServer(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    msg.sender = myClientId;
    msg.roomId = getRoomId();
    ws.send(JSON.stringify(msg));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. WebRTC PEER CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════
function createPeerConnection(targetId) {
    if (peers[targetId]) return peers[targetId];

    const pc = new RTCPeerConnection(rtcConfig);
    peers[targetId] = pc;
    let fallbackTimer = null;

    // Add local tracks
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Remote track → thêm video vào grid
    pc.ontrack = (event) => {
        console.log(`[TRACK] Remote track from ${targetId} (Kind: ${event.track.kind})`);
        let video = document.getElementById(`video-${targetId}`);

        if (!video) {
            const grid = document.getElementById('video-grid');
            const wrapper = document.createElement('div');
            wrapper.id = `wrapper-${targetId}`;
            wrapper.className = 'video-wrapper';

            video = document.createElement('video');
            video.id = `video-${targetId}`;
            video.autoplay = true;
            video.playsInline = true;

            if (event.streams && event.streams[0]) {
                video.srcObject = event.streams[0];
            } else {
                video.srcObject = new MediaStream([event.track]);
            }

            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            const color = getAvatarColor(targetId);
            const safeLabel = escapeHtml(formatMemberLabel(targetId));
            overlay.innerHTML = `
                <span class="video-label" style="color:#fff">${safeLabel}</span>
                <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
            `;

            wrapper.appendChild(video);
            wrapper.appendChild(overlay);
            grid.appendChild(wrapper);

            // Update member status to "calling"
            renderMemberList();
        } else {
            // Nếu phần tử video đã tồn tại, đảm bảo track mới được thêm vào srcObject hiện có
            const stream = video.srcObject;
            if (stream instanceof MediaStream) {
                if (!stream.getTracks().includes(event.track)) {
                    stream.addTrack(event.track);
                }
            }
        }
    };

    // Send ICE candidates to the target peer
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            const type = event.candidate.candidate;
            // comment out to use other kind of ICE server
            // if (type.includes("typ host")) {
            //     console.log("[LOG] Đã chặn host. Đang ép dùng SRFLX...");
            //     return;
            // }
            // if (type.includes("typ srflx")) {
            //     console.log("[LOG] Đã chặn host và srflx. Đang ép dùng TURN...");
            //     return;
            // }

            sendToServer({ type: 'candidate', target: targetId, candidate: event.candidate });
        }
    };


    // Connection state
    pc.onconnectionstatechange = () => {
        console.log(`[CONN STATE] ${targetId}: ${pc.connectionState}`);
        renderMemberList(); // Cập nhật trạng thái trong member list
        if (pc.connectionState === 'failed') {
            console.error(`[ERROR] Connection failed with ${targetId}`);
            updateUIStatus(`❌ Kết nối thất bại với ${targetId}`, 'error');
        }
    };

    // ICE state + fallback
    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[ICE STATE] ${targetId}: ${state}`);
        updateUIStatus(`ICE [${targetId}]: ${state.toUpperCase()}`);

        if (state === 'checking') {
            fallbackTimer = setTimeout(() => {
                if (pc.iceConnectionState === 'checking') {
                    const msg = `P2P checking quá lâu → Browser đang thử TURN relay...`;
                    console.warn(`[WARN] ${msg}`);
                    updateUIStatus(msg, 'warn');
                }
            }, ICE_TIMEOUT_MS);

        } else if (state === 'connected' || state === 'completed') {
            clearTimeout(fallbackTimer);
            updateUIStatus(`✅ Đã kết nối với ${targetId}!`);
            analyzeConnectionStats(pc, targetId);
            renderMemberList();

        } else if (state === 'failed') {
            clearTimeout(fallbackTimer);
            console.error(`[ERROR] ICE failed: ${targetId}. Kiểm tra TURN server!`);
            updateUIStatus(`❌ ICE failed với ${targetId}. Kiểm tra TURN server!`, 'error');

        } else if (state === 'disconnected') {
            clearTimeout(fallbackTimer);
            updateUIStatus(`⚠️ Mất kết nối tạm với ${targetId}...`, 'warn');
        }
    };

    return pc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PEER CLEANUP
// ═══════════════════════════════════════════════════════════════════════════════
function handlePeerDisconnected(peerId) {
    console.log(`[INFO] Peer disconnected: ${peerId}`);

    if (peers[peerId]) { peers[peerId].close(); delete peers[peerId]; }

    const wrapper = document.getElementById(`wrapper-${peerId}`);
    if (wrapper) wrapper.remove();

    removeMember(peerId);
    updateUIStatus(`"${peerId}" đã rời phòng.`, 'warn');
}

function cleanUpAllPeers() {
    for (const id in peers) { peers[id].close(); }
    peers = {};

    // Xóa tất cả remote video wrappers
    document.querySelectorAll('.video-wrapper:not(#local-wrapper)').forEach(el => el.remove());

    // Reset member list (chỉ giữ bản thân)
    roomMembers.clear();
    memberDisplayNames.clear();
    renderMemberList();
}

function cleanUpCallOnly() {
    for (const id in peers) { peers[id].close(); }
    peers = {};

    document.querySelectorAll('.video-wrapper:not(#local-wrapper)').forEach(el => el.remove());
    renderMemberList();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. HANG UP
// ═══════════════════════════════════════════════════════════════════════════════
function hangUp() {
    console.log(`[INFO] Hang up: ${new Date().toLocaleTimeString()}`);

    if (ws && ws.readyState === WebSocket.OPEN) {
        sendToServer({ type: 'leaveRoom' });
        ws.close();
    }
    ws = null;

    cleanUpAllPeers();

    stopLocalMedia();

    groupCallActive = false;
    const startBtn = document.getElementById('btn-start-call');
    if (startBtn) startBtn.disabled = false;

    // Quay về lobby
    showLobby();

    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.disabled = false;
}


// ═══════════════════════════════════════════════════════════════════════════════
// 8.1 START GROUP CALL
// ═══════════════════════════════════════════════════════════════════════════════
async function startGroupCall() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        updateUIStatus('Chưa kết nối tới server.', 'error');
        return;
    }
    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = localStream;
        } catch (err) {
            console.error('[ERROR] getUserMedia failed:', err);
            updateUIStatus('Không thể mở lại camera/mic.', 'error');
            return;
        }
    }

    const startBtn = document.getElementById('btn-start-call');
    if (startBtn) startBtn.disabled = true;

    sendToServer({ type: 'startCall' });
}

function shouldInitiateOffer(targetId) {
    return myClientId < targetId;
}

async function startMeshForMembers() {
    groupCallActive = true;
    const startBtn = document.getElementById('btn-start-call');
    if (startBtn) startBtn.disabled = true;

    const targets = Array.from(roomMembers);
    if (targets.length === 0) {
        updateUIStatus('Chưa có thành viên khác trong phòng.', 'warn');
        return;
    }

    updateUIStatus('Đang bắt đầu gọi nhóm...');
    for (const targetId of targets) {
        if (!peers[targetId]) createPeerConnection(targetId);
        if (!shouldInitiateOffer(targetId)) continue;

        const pc = peers[targetId];
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendToServer({ type: 'offer', target: targetId, sdp: offer });
        } catch (err) {
            console.error(`[ERROR] createOffer to ${targetId}:`, err.message);
        }
    }
}

function endCallRoom() {
    if (!ws || ws.readyState !== WebSocket.OPEN) { return; }

    console.log(`[INFO] End call: ${new Date().toLocaleTimeString()}`);
    sendToServer({ type: 'endCall' });
    cleanUpCallOnly();

    groupCallActive = false;
    const startBtn = document.getElementById('btn-start-call');
    if (startBtn) startBtn.disabled = false;
}

function stopLocalMedia() {
    if (!localStream) return;
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    const lv = document.getElementById('localVideo');
    if (lv) lv.srcObject = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. MIC / CAM TOGGLE
// ═══════════════════════════════════════════════════════════════════════════════
function toggleMic() {
    if (!localStream) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach(t => (t.enabled = micEnabled));
    const btn = document.getElementById('btn-toggle-mic');
    btn.innerText = micEnabled ? '🎙️ Tắt Mic' : '🔇 Bật Mic';
    btn.style.borderColor = micEnabled ? '' : 'var(--accent-red)';
    btn.style.color = micEnabled ? '' : 'var(--accent-red)';
    sendToServer({ type: 'micStatus', enabled: micEnabled });
    renderMemberList();
}

function toggleCam() {
    if (!localStream) return;
    camEnabled = !camEnabled;
    localStream.getVideoTracks().forEach(t => (t.enabled = camEnabled));
    const btn = document.getElementById('btn-toggle-cam');
    btn.innerText = camEnabled ? '📷 Tắt Camera' : '🚫 Bật Camera';
    btn.style.borderColor = camEnabled ? '' : 'var(--accent-red)';
    btn.style.color = camEnabled ? '' : 'var(--accent-red)';

    // Tối màu local video khi tắt cam
    const localWrapper = document.getElementById('local-wrapper');
    if (localWrapper) localWrapper.style.filter = camEnabled ? '' : 'brightness(0.15)';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════
async function analyzeConnectionStats(pc, targetId) {
    try {
        const stats = await pc.getStats();
        let activePair = null;
        stats.forEach(r => {
            if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated)
                activePair = r;
        });
        if (activePair) {
            const lc = stats.get(activePair.localCandidateId);
            if (lc) {
                const connType = lc.candidateType; // host | srflx | relay
                console.log(`\n=========================================`);
                console.log(`          CONNECTION REPORT [${targetId}]       `);
                console.log(`=========================================`);
                console.log(`- Start Time      : ${new Date().toLocaleTimeString()}`);
                console.log(`- Conn State      : ${pc.connectionState}`); // Thêm dòng này
                console.log(`- ICE State       : ${pc.iceConnectionState}`);
                console.log(`- Used Route      : [ ${connType.toUpperCase()} ]`);
                console.log(`=========================================\n`);
                updateUIStatus(`✅ Kết nối qua: ${connType.toUpperCase()} với ${targetId}`);
            }
        }
    } catch (err) {
        console.error('[ERROR] Failed to fetch connection stats:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. UI STATUS HELPER
// ═══════════════════════════════════════════════════════════════════════════════
function updateUIStatus(message, level = 'ok') {
    // 'ok' | 'warn' | 'error'
    const el = document.getElementById('status-text');
    const board = document.getElementById('status-board');
    if (!el) return;

    el.innerText = message;

    if (level === 'error') {
        el.style.color = 'var(--accent-red)';
    } else if (level === 'warn') {
        el.style.color = 'var(--accent-orange)';
    } else {
        el.style.color = 'var(--accent-green)';
    }
}
