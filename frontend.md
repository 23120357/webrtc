# 👤 Thành Viên 2 — B1 UI: Giao Diện Phòng Họp

## Tổng Quan

File chịu trách nhiệm: `public/index.html` + `public/app.js`

Giao diện được chia làm **2 Phase** rõ ràng:

| Phase | Màn hình | Điều kiện chuyển |
|-------|----------|-----------------|
| **Phase 1** | Lobby (chọn phòng) | Khi trang load |
| **Phase 2** | Room (trong phòng) | Sau khi ấn Join / Create |

---

## Phase 1: Lobby Screen

### Giao diện
```
┌─────────────────────────────────┐
│  🎥  Phòng Họp Nhóm             │
│  Nhập tên phòng để tham gia...  │
│                                 │
│  ID của bạn: [abc123]           │
│                                 │
│  Tên Phòng (Room ID)            │
│  ┌───────────────────────────┐  │
│  │ demo-room                 │  │
│  └───────────────────────────┘  │
│                                 │
│  [🚪 Vào Phòng] [✨ Tạo Mới]  │
└─────────────────────────────────┘
```

### Tính năng
- **Input roomId**: nhập tên phòng bất kỳ, hoặc dùng giá trị mặc định `demo-room`
- **Nút "Vào Phòng"** (`joinRoom()`): Xin quyền Camera → kết nối WS → vào phòng
- **Nút "Tạo Phòng Mới"** (`createRoom()`): Generate tên phòng ngẫu nhiên → join ngay
- **Không auto-join khi load trang** — người dùng chủ động chọn phòng

### Luồng joinRoom()
```
User nhấn "Vào Phòng"
    ↓
showLoading() — hiện overlay loading
    ↓
GET /api/room-check?roomId=...  ← kiểm tra phòng tồn tại
    ↓
getUserMedia({ video, audio })  ← xin quyền cam/mic
    ↓
showRoom(roomId)                ← chuyển sang Phase 2
    ↓
connectSignaling(roomId)        ← kết nối WebSocket
    ↓
ws.send({ type: 'joinRoom' })   ← đăng ký vào phòng
```

---

## Phase 2: Room Screen

### Layout
```
┌── Navbar ─────────────────────────────────────────────────────────────┐
│ 📹 WebRTC Mesh ●    │  My ID: [abc123]  │  Room: [demo-room]          │
├────────────────────────────────────────────────────────────────────────┤
│ 🏠 demo-room   [2 thành viên]    System State: ✅ Đã kết nối...       │
├──────────────────┬─────────────────────────────────────────────────────┤
│                  │                                                      │
│  THÀNH VIÊN  [2] │   ┌──────────┐  ┌──────────┐                       │
│  ──────────────  │   │          │  │          │                        │
│  [AB] abc123(bạn)│   │  Camera  │  │  Remote  │                        │
│  ●  Bạn          │   │  Local   │  │  Video   │                        │
│  ──────────────  │   │          │  │          │                        │
│  [XY] xyz456     │   └──────────┘  └──────────┘                        │
│  ● Đang gọi      │                                                      │
│                  │                                                      │
├──────────────────┴─────────────────────────────────────────────────────┤
│   [▶️ Bắt Đầu Gọi Nhóm] [⛔ Kết Thúc Cuộc Gọi] [📵 Rời Phòng]       │
│              [🎙️ Tắt Mic]  [📷 Tắt Camera]                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Danh Sách Thành Viên (Member List)

### Cách hoạt động
Member list được cập nhật **real-time** dựa trên các sự kiện từ server:

| Sự kiện Server | Hành động Member List |
|----------------|-----------------------|
| `roomInfo` (danh sách cũ) | Thêm tất cả member hiện có vào list |
| `userJoined` (người mới) | Thêm 1 member mới vào list |
| `memberLeft` (người rời) | Xóa khỏi list, xóa video tile |
| `callEnded` | Đóng toàn bộ peer, giữ nguyên danh sách member |
| `micStatus` | Hiện trạng thái tắt mic của member |
| `startCall` | Tạo mesh n-1 và bắt đầu gọi nhóm |

### Trạng thái từng member
```
● Bạn         — bản thân (màu xanh)
● Trong phòng — đã join nhưng chưa kết nối media
● Đang gọi    — RTCPeerConnection.connectionState === 'connected'
🚫🎙️           — member đang tắt mic
```

### Avatar
- Hiển thị 2 chữ đầu của clientId (viết hoa)
- Màu sắc xác định dựa trên hash của clientId — cùng một ID luôn có cùng màu

---

## Video Grid

### Cơ chế render
- **Local video**: Hiển thị ngay khi vào phòng
- **Remote video**: Tạo động bằng `document.createElement('video')` khi `pc.ontrack` fire
- Layout: `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))` — tự chia ô theo số người

```js
// Mỗi remote video được bọc trong wrapper div:
<div class="video-wrapper" id="wrapper-{peerId}">
  <video id="video-{peerId}" autoplay playsinline>
  <div class="video-overlay">  ← label tên + màu indicator
```

### Xóa video khi peer rời
```js
function handlePeerDisconnected(peerId) {
    document.getElementById(`wrapper-${peerId}`)?.remove();
    removeMember(peerId); // cập nhật member list
}
```

---

## Điều Khiển

| Nút | Hàm | Hành động |
|-----|-----|-----------|
| ▶️ Bắt Đầu Gọi Nhóm | `startGroupCall()` | Broadcast `startCall` để tạo mesh toàn phòng |
| ⛔ Kết Thúc Cuộc Gọi | `endCallRoom()` | Gửi `endCall`, đóng toàn bộ PC trong room |
| 📵 Rời Phòng | `hangUp()` | Gửi `leaveRoom`, đóng PC, tắt cam/mic, quay lobby |
| 🎙️ Tắt Mic | `toggleMic()` | Toggle `AudioTrack.enabled` |
| 📷 Tắt Camera | `toggleCam()` | Toggle `VideoTrack.enabled` + làm tối video |

> **Re-call không cần F5**: Sau khi rời phòng, bấm lại "Vào Phòng" là kết nối được ngay — tất cả state đã được reset sạch.

---

## Thay Đổi So Với Phiên Bản Cũ

| Cũ | Mới |
|----|-----|
| Auto-join ngay khi trang load | Lobby → chờ người dùng chọn phòng |
| Không có UI chọn phòng | Input roomId + Create/Join buttons |
| Không có danh sách thành viên | Member list sidebar real-time |
| Chỉ có nút Hang Up | Hang Up + Toggle Mic + Toggle Cam |
| `userLeft` | `memberLeft` (đồng bộ với server) |
| `updateUIStatus(msg, isWarning)` | `updateUIStatus(msg, level)` — `'ok'/'warn'/'error'` |

---

## Ghi Chú Bàn Giao Cho Thành Viên 3

- Hàm `analyzeConnectionStats(pc, targetId)` đã implement — gọi tự động khi ICE connected
- Log ra console với format `[ HOST / SRFLX / RELAY ]`
- `updateUIStatus()` cũng hiển thị loại kết nối lên UI sau khi connected
- Đã có ICE fallback timeout 12s với thông báo rõ ràng

---

## Files Liên Quan

- [`public/index.html`](../public/index.html) — cấu trúc HTML + CSS toàn bộ UI
- [`public/app.js`](../public/app.js) — logic JavaScript
- [`server/server.js`](../server/server.js) — Signaling Server (Thành viên 1)
