# Giao thức thông điệp (API Contract) cho WebRTC Group Call

Tất cả thành viên (Frontend & Backend) bắt buộc tuân theo đúng định dạng JSON dưới đây khi gửi/nhận qua WebSocket.

## 1. Quản lý phòng và danh tính

### A. Vào phòng (Join Room)
*   **Mục đích:** Xin gia nhập vào 1 room cụ thể. Nếu room chưa có, server tự tạo mới.
*   **JSON (Client gửi):**
```json
{
  "type": "joinRoom",
  "roomId": "room-123",
  "sender": "client-abc",
  "displayName": "Alice"
}
```

### B. Danh sách thành viên (Room Info)
*   **Mục đích:** Server trả về danh sách thành viên hiện có cho người vừa join.
*   **JSON (Server gửi về cho người mới):**
```json
{
  "type": "roomInfo",
  "roomId": "room-123",
  "members": [
    { "id": "client-abc", "name": "Alice" },
    { "id": "client-def", "name": "Bob" }
  ]
}
```

### C. Có thành viên mới vào phòng (User Joined)
*   **Mục đích:** Server thông báo cho các thành viên đang trong room.
*   **JSON (Server broadcast):**
```json
{
  "type": "userJoined",
  "sender": "client-xyz",
  "displayName": "Charlie"
}
```

### D. Rời phòng & thông báo rời phòng
*   **Mục đích:** Client chủ động rời phòng.
*   **JSON (Client gửi):**
```json
{
  "type": "leaveRoom"
}
```
*   **JSON (Server broadcast):**
```json
{
  "type": "memberLeft",
  "sender": "client-abc"
}
```

---

## 2. Giao tiếp WebRTC Mesh (Signaling Protocol)

> **Lưu ý Backend:** Server chỉ cần đọc trường `target` và chuyển tiếp message cho đúng client trong room.

### A. Gửi Offer
```json
{
  "type": "offer",
  "roomId": "room-123",
  "sender": "client-abc",
  "target": "client-def",
  "sdp": { "type": "offer", "sdp": "v=0\r\no=- 4209534..." }
}
```

### B. Gửi Answer
```json
{
  "type": "answer",
  "roomId": "room-123",
  "sender": "client-def",
  "target": "client-abc",
  "sdp": { "type": "answer", "sdp": "v=0\r\no=- 234123..." }
}
```

### C. Gửi ICE Candidate
```json
{
  "type": "candidate",
  "roomId": "room-123",
  "sender": "client-abc",
  "target": "client-def",
  "candidate": {
    "candidate": "candidate:8421630... udp 16777 ...",
    "sdpMLineIndex": 0,
    "sdpMid": "0"
  }
}
```

---

## 3. Điều khiển cuộc gọi nhóm

### A. Bắt đầu gọi nhóm
*   **JSON (Client gửi):**
```json
{
  "type": "startCall"
}
```
*   **JSON (Server broadcast):**
```json
{
  "type": "startCall",
  "roomId": "room-123",
  "sender": "client-abc",
  "members": ["client-abc", "client-def", "client-xyz"]
}
```

### B. Kết thúc cuộc gọi nhóm
*   **JSON (Client gửi):**
```json
{
  "type": "endCall",
  "roomId": "room-123",
  "sender": "client-abc"
}
```
*   **JSON (Server broadcast):**
```json
{
  "type": "callEnded",
  "sender": "client-abc"
}
```

---

## 4. Trạng thái mic

### A. Cập nhật trạng thái mic
*   **JSON (Client gửi):**
```json
{
  "type": "micStatus",
  "enabled": true
}
```
*   **JSON (Server broadcast):**
```json
{
  "type": "micStatus",
  "sender": "client-abc",
  "enabled": true
}
```

---

## Nhắc nhở
*   Backend: thu gom state theo roomId, dọn dẹp khi ws close và gửi `memberLeft`.
*   Frontend: luôn dựa vào `sender`/`target` để map đúng RTCPeerConnection.