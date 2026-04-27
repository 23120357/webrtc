let rtcConfig = null;
let localStream = null;
const peers = {}; // Store (n-1) peer connections: { targetId: RTCPeerConnection }
let ws;
const myClientId = Math.random().toString(36).substring(2, 9); // Random ID for testing
const roomId = "demo-room"; // Can be replaced with UI input value
const ICE_TIMEOUT_MS = 12000; // Fallback timeout: 12 seconds

// 1. Initialize System
async function init() {
    try {
        console.log("[INFO] Fetching ICE configuration from server...");
        const response = await fetch('/api/turn-config');
        rtcConfig = await response.json();
        console.log("[INFO] ICE configuration loaded successfully.");

        // DÁN VÀO ĐÂY: Hiển thị ID lên màn hình sau khi mọi thứ đã sẵn sàng
        document.getElementById('my-id-display').innerText = myClientId;
        updateUIStatus("System Ready. Requesting Camera..."); // Thêm dòng này cho UI sinh động

        console.log("[INFO] Requesting media access...");
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = localStream;

        connectSignaling();
    } catch (err) {
        console.error("[ERROR] Initialization failed:", err);
        updateUIStatus("Error: Camera not found or Server down.", true);
    }
}

// 2. WebSocket Signaling Logic
function connectSignaling() {
    // Tự động nhận diện: Nếu URL là https (Ngrok) thì dùng wss://, nếu là http (localhost) thì dùng ws://
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    console.log("[INFO] Đang kết nối WebSocket tới:", wsUrl); // Log ra để bạn dễ kiểm tra
    
    ws = new WebSocket(wsUrl); // Dòng 36 mới của bạn sẽ là dòng này

    ws.onopen = () => {
        console.log("[INFO] Connected to Signaling Server");
        updateUIStatus("Đã kết nối máy chủ. Đang chờ đối tác...");
        ws.send(JSON.stringify({ type: 'joinRoom', roomId: roomId, sender: myClientId }));
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'userJoined':
                console.log(`[INFO] New user joined: ${data.sender}. Initiating connection...`);
                const pc = createPeerConnection(data.sender);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendToServer({ type: 'offer', target: data.sender, sdp: offer });
                break;

            case 'offer':
                const peerOffer = createPeerConnection(data.sender);
                await peerOffer.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await peerOffer.createAnswer();
                await peerOffer.setLocalDescription(answer);
                sendToServer({ type: 'answer', target: data.sender, sdp: answer });
                break;

            case 'answer':
                if (peers[data.sender]) {
                    await peers[data.sender].setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
                break;

            case 'candidate':
                if (peers[data.sender]) {
                    await peers[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;

            case 'userLeft':
                if (peers[data.sender]) {
                    peers[data.sender].close();
                    delete peers[data.sender];
                    console.log(`[INFO] User disconnected: ${data.sender}`);
                    
                    // Remove their video from the screen
                    const videoElement = document.getElementById(`video-${data.sender}`);
                    if (videoElement) {
                        videoElement.remove();
                    }
                }
                break;
        }
    };
}

function sendToServer(msg) {
    msg.sender = myClientId;
    msg.roomId = roomId;
    ws.send(JSON.stringify(msg));
}

// 3. WebRTC Core Logic (Mesh & Fallback)
function createPeerConnection(targetId) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[targetId] = pc;
    let fallbackTimer;

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Handle incoming remote media
    pc.ontrack = (event) => {
        console.log(`[INFO] Received remote track from ${targetId}`);
        
        // Check if the video element already exists to avoid duplicates
        if (!document.getElementById(`video-${targetId}`)) {
            const grid = document.getElementById('video-grid');
            const newVideo = document.createElement('video');
            
            newVideo.id = `video-${targetId}`;
            newVideo.autoplay = true;
            newVideo.playsInline = true;
            newVideo.srcObject = event.streams[0]; // Attach the remote stream
            
            grid.appendChild(newVideo);
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

    pc.onconnectionstatechange = () => {
        console.log(`[CONN STATE] ${targetId}: ${pc.connectionState}`);
    };

    // Monitor Connection State & Trigger Fallback
    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log(`[ICE STATE] Connection with ${targetId}: ${state}`);
        
        updateUIStatus(`Trạng thái ICE: ${state.toUpperCase()}`);

        if (state === 'checking') {
            fallbackTimer = setTimeout(() => {
                if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
                    const warnMsg = `P2P failed, trying TURN...`;
                    console.warn(`[WARN] ${warnMsg}`);
                    updateUIStatus(warnMsg, true);
                }
            }, ICE_TIMEOUT_MS);
            
        } else if (state === 'connected' || state === 'completed') {
            clearTimeout(fallbackTimer);
            console.log(`[SUCCESS] Media established with ${targetId}`);
            updateUIStatus(`Kết nối thành công (WebRTC)!`);
            analyzeConnectionStats(pc, targetId);
            
        } else if (state === 'failed' || state === 'disconnected') {
            clearTimeout(fallbackTimer);
            console.error(`[ERROR] Connection completely failed with ${targetId}`);
            updateUIStatus(`Kết nối thất bại.`, true);
        }
    };

    return pc;
}

// 4. Analytics: Verify TURN Usage
async function analyzeConnectionStats(pc, targetId) {
    try {
        const stats = await pc.getStats();
        let activeCandidatePair = null;

        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                activeCandidatePair = report;
            }
        });

        if (activeCandidatePair) {
            const localCandidate = stats.get(activeCandidatePair.localCandidateId);
            if (localCandidate) {
                const connType = localCandidate.candidateType; 
                console.log(`\n=========================================`);
                console.log(`          CONNECTION REPORT [${targetId}]       `);
                console.log(`=========================================`);
                console.log(`- Start Time      : ${new Date().toLocaleTimeString()}`);
                console.log(`- Conn State      : ${pc.connectionState}`); // Thêm dòng này
                console.log(`- ICE State       : ${pc.iceConnectionState}`);
                console.log(`- Used Route      : [ ${connType.toUpperCase()} ]`);
                console.log(`=========================================\n`);
                
                // (Bonus) Bạn có thể in thẳng Route đang dùng lên UI
                updateUIStatus(`Đã kết nối qua: ${connType.toUpperCase()}`);
            }
        }
    } catch (err) {
        console.error("[ERROR] Failed to fetch connection stats:", err);
    }
}

// Add this helper function
function updateUIStatus(message, isWarning = false) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.innerText = message;
        statusText.style.color = isWarning ? '#ffaa00' : '#00ff88';
    }
}

// In your init() function, add this to show the random ID generated:
document.getElementById('my-id-display').innerText = myClientId;

function hangUp() {
    console.log(`[INFO] Call ended at: ${new Date().toLocaleTimeString()}`);
    console.log("[INFO] Hanging up...");
    
    // 1. Tell the server we are leaving
    sendToServer({ type: 'userLeft', sender: myClientId });
    
    // 2. Close all active WebRTC peer connections
    for (let peerId in peers) {
        peers[peerId].close();
    }
    
    // 3. Turn off local camera and mic
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // 4. Disconnect WebSocket
    if (ws) {
        ws.close();
    }
    
    updateUIStatus("Disconnected from room.", true);
    document.getElementById('video-grid').innerHTML = ''; // Clear the screen
}

// Start the app when the page loads
window.onload = init;

