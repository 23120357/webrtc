# 👤 Thành Viên 1 — Backend & Signaling Server

## Tổng Quan

File chịu trách nhiệm: `server/server.js`

Server đóng vai trò **Signaling Server** (không truyền media trực tiếp), chỉ phụ trách:
- Quản lý phòng họp (Room)
- Chuyển tiếp (forward) các thông điệp đàm phán WebRTC giữa các peer
- Theo dõi kết nối/ngắt kết nối và dọn dẹp bộ nhớ

---

## Kiến Trúc Dữ Liệu (Room State)

```
rooms: Map<roomId, Map<clientId, WebSocket>>
           │               │
           │               └── mỗi phần tử là 1 kết nối WS của 1 user
           └── mỗi phần tử là 1 phòng họp

clientMeta: Map<WebSocket, { roomId, clientId }>
           └── tra cứu ngược: từ WS → biết client này đang ở phòng nào

roomCallActive: Map<roomId, boolean>
           └── đánh dấu phòng đang có group call hay không
```

> Dùng `Map` thay `{}` vì `Map` có `.size`, `.has()`, `.delete()` rõ ràng hơn và không bị lẫn prototype keys.

---

## Luồng Sự Kiện (Message Flow)

### Client → Server

| `type`      | Mô tả |
|-------------|-------|
| `joinRoom`  | Client muốn gia nhập phòng. Cần có `roomId` và `sender` |
| `offer`     | SDP Offer từ caller → forward tới `target` |
| `answer`    | SDP Answer từ callee → forward tới `target` |
| `candidate` | ICE Candidate → forward tới `target` |
| `startCall` | Bắt đầu cuộc gọi nhóm (broadcast toàn phòng) |
| `micStatus` | Cập nhật trạng thái mic (on/off) |
| `leaveRoom` | Client rời phòng chủ động (nhấn Hang Up) |
| `endCall`   | Client kết thúc cuộc gọi (không rời phòng, chỉ dọn call state) |

### Server → Client

| `type`       | Mô tả |
|--------------|-------|
| `roomInfo`   | Gửi về cho **người mới join**: danh sách clientId đang có trong phòng |
| `userJoined` | Broadcast tới **những người đang trong phòng**: có user mới vào |
| `memberLeft` | Broadcast khi 1 user rời / mất kết nối đột ngột |
| `callEnded`  | Broadcast khi `endCall` được gửi lên |
| `startCall`  | Broadcast khi có người nhấn Start Group Call |
| `micStatus`  | Broadcast trạng thái mic (on/off) của member |

---

## Chi Tiết Các Tính Năng Đã Implement

### ✅ 1. Room Management (Quản lý phòng)

```js
const rooms = new Map();       // roomId → Map<clientId, ws>
const clientMeta = new Map();  // ws → { roomId, clientId }
const roomCallActive = new Map(); // roomId → boolean
```

- Khi client join: `rooms.get(roomId).set(clientId, ws)` + `clientMeta.set(ws, ...)`
- Khi client rời: xóa khỏi cả 2 Map, broadcast `memberLeft`
- Phòng trống → tự động `rooms.delete(roomId)` → **không rò rỉ bộ nhớ**

### ✅ 2. Broadcast Nội Bộ (Trong Cùng Phòng)

```js
function broadcastToRoom(roomId, excludeClientId, payload) {
    const room = rooms.get(roomId);
    for (const [id, clientWs] of room) {
        if (id !== excludeClientId && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(payload));
        }
    }
}
```

> Đảm bảo: chỉ gửi trong phạm vi phòng, **không bao giờ leak sang phòng khác**.

### ✅ 3. Mesh Forwarding (Định tuyến Offer/Answer/Candidate)

```js
case 'offer':
case 'answer':
case 'candidate': {
    const { roomId } = meta;         // phòng của người gửi
    const delivered = sendToTarget(roomId, target, data);
    ...
}
```

Server dò `roomId` từ `clientMeta`, sau đó gửi đúng peer `target` trong cùng phòng.
Tuyệt đối không forward nhầm phòng.

### ✅ 4. Xử Lý Disconnect Đột Ngột (Tắt Tab / Mất Mạng)

```js
ws.on('close', (code) => {
    // Gọi removeClientFromRoom() để dọn state và broadcast memberLeft
    removeClientFromRoom(ws);
});

ws.on('error', (err) => {
    // Log lỗi, 'close' sẽ tự fire sau đó → cleanup tự động
});
```

### ✅ 5. Gửi Danh Sách Thành Viên Cho Người Mới Join

```js
// Trong case 'joinRoom':
ws.send(JSON.stringify({
    type: 'roomInfo',
    roomId,
    members: existingMembers  // mảng clientId đã có trong phòng
}));

// Nếu phòng đang gọi, server thông báo để người mới tự nối mesh
if (roomCallActive.get(roomId)) {
    ws.send(JSON.stringify({
        type: 'startCall',
        roomId,
        sender: clientId,
        members: [...room.keys()]
    }));
}
```

Client nhận được `roomInfo` để render danh sách thành viên và chờ `startCall` để tạo mesh.

### ✅ 6. Dọn Sạch State (Không Rác Kết Nối)

Hàm `removeClientFromRoom(ws)`:
1. Lấy `{ roomId, clientId }` từ `clientMeta`
2. Xóa client khỏi `rooms.get(roomId)`
3. Xóa entry trong `clientMeta`
4. Broadcast `memberLeft` tới những người còn lại
5. Nếu phòng rỗng → `rooms.delete(roomId)`

### ✅ 7. Không Hardcode IP/Port

```js
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => { ... });
```

- `'0.0.0.0'` → lắng nghe trên TẤT CẢ các network interface (LAN, Wi-Fi, Ethernet)
- `PORT` đọc từ `server/.env` → không cần sửa code khi đổi port

---

## Cấu Hình `.env`

File `server/.env`:

```env
# Port chạy Signaling Server
PORT=3000

# Địa chỉ IP của TURN Server (Thường giống LOCAL IP máy chủ)
TURN_IP=192.168.1.x

# Thông tin xác thực (phải KHỚP với turn-server/.env)
TURN_USER=admin
TURN_PASS=password
```

---

## Chạy Server

```bash
# Cài dependencies (lần đầu)
npm install

# Chạy (production)
npm start

# Chạy với hot-reload (development)
npm run dev
```

---

## Kiểm Tra (Manual Test)

1. Mở `http://localhost:3000` trên **Tab 1** → user join phòng `demo-room`
2. Mở **Tab 2** cùng URL → server log: `[JOIN] Client "xxx" joined room "demo-room". Members: 2`
3. Đóng Tab 2 → server log: `[DISCONNECT] Client "xxx" disconnected` + Tab 1 nhận `memberLeft`
4. Đóng Tab 1 → server log: `[ROOM] Room "demo-room" is now empty and has been deleted.`

> **Kiểm tra không rò rỉ bộ nhớ:** Sau khi tất cả user rời, phòng phải bị xóa khỏi `rooms` Map.

---

## Giao Diện Thông Điệp (Interface Contract với Thành viên 2)

Thành viên 2 (Client UI) cần handle các message server gửi xuống:

```js
// Client phải xử lý:
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'roomInfo':    // { members: ['id1','id2',...] }  → cập nhật member list
        case 'userJoined':  // { sender: 'newId' }             → tạo thêm 1 PeerConnection
        case 'memberLeft':  // { sender: 'leftId' }            → đóng PC + xóa video tile
        case 'callEnded':   // { sender: 'endCallerId' }       → dọn call state, vẫn giữ member list
        case 'startCall':   // { members: [...] }              → tạo mesh toàn phòng
        case 'micStatus':   // { sender, enabled }             → hiển thị trạng thái mic
        case 'offer':       // forward nguyên trạng
        case 'answer':      // forward nguyên trạng
        case 'candidate':   // forward nguyên trạng
    }
};

// Client phải gửi:
ws.send(JSON.stringify({ type: 'joinRoom', roomId, sender: myClientId }));
ws.send(JSON.stringify({ type: 'offer',    target: peerId, sdp, sender, roomId }));
ws.send(JSON.stringify({ type: 'leaveRoom', sender, roomId }));  // khi nhấn Hang Up
ws.send(JSON.stringify({ type: 'startCall', sender, roomId }));  // khi nhấn Start Group Call
ws.send(JSON.stringify({ type: 'endCall', sender, roomId }));    // khi nhấn End Call
ws.send(JSON.stringify({ type: 'micStatus', sender, roomId, enabled }));
```

---

## Lưu Ý Bàn Giao Cho Thành Viên 2

- Server gửi `memberLeft` (thay `userLeft`) → Client đã sửa tương ứng
- Server gửi `roomInfo` với `members[]` → Client đã xử lý để tạo n-1 PeerConnections
- Client gửi `leaveRoom` thay vì `userLeft` khi nhấn Hang Up
