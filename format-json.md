# Giao thức Thông điệp (API Contract) cho WebRTC Group Call

Tất cả các thành viên (Frontend & Backend) bắt buộc tuân theo dúng định dạng JSON dưới đây khi thực hiện gửi/nhận qua WebSocket để có thể làm việc song song hiệu quả.

## 1. Quản lý Đăng nhập & Phòng (Room Management)

### A. Đăng nhập (Register)
*   **Mục đích:** Khởi tạo tên cho client. Backend lưu lại kết nối WebSocket với tên này.
*   **JSON (Client gửi):**
```json
{
  "type": "register",
  "name": "Alice"
}
```

### B. Tạo hoặc Vào phòng (Create/Join Room)
*   **Mục đích:** Xin gia nhập vào một Room cụ thể. Nếu room chưa có, Backend tự khởi tạo một Room mới.
*   **JSON (Client gửi):**
```json
{
  "type": "joinRoom",
  "roomId": "room-123",
  "name": "Alice"
}
```

### C. Cập nhật Danh sách thành viên (Room Members)
*   **Mục đích:** Server trả về danh sách tất cả những người đang có mặt trong phòng.
*   **JSON (Server tự động broadcast cho tất cả thành viên trong Room đó):**
```json
{
  "type": "roomMembers",
  "roomId": "room-123",
  "members": ["Alice", "Bob", "Charlie"]
}
```

### D. Rời phòng & Thông báo có người rời (Leave / Member Left)
*   **Mục đích:** Khi người dùng chủ động thoát, hoặc rớt mạng.
*   **JSON (Client gửi lên Server báo xin thoát):**
```json
{
  "type": "leaveRoom",
  "roomId": "room-123",
  "sender": "Alice"
}
```
*   **JSON (Server thông báo cho các thành viên còn lại trong Room để lập tức đóng Video/Connection tương ứng):**
```json
{
  "type": "memberLeft",
  "roomId": "room-123",
  "name": "Alice"
}
```

---

## 2. Giao tiếp WebRTC Mesh (Signaling Protocol)

> **Làm việc Backend lưu ý:** Với các thông tin ở phần 2 này. Backend **KHÔNG CẦN CHỈNH SỬA** bất cứ nội dung gì bên trong gói tin. Backend chỉ cần đọc trường `target`, tìm kiếm WebSocket tương ứng đang nối đến server rồi gọi `ws.send(raw_data)`.

### A. Gửi Offer
```json
{ 
  "type": "offer", 
  "roomId": "room-123", 
  "sender": "Alice", 
  "target": "Bob", 
  "offer": { 
      "type": "offer", 
      "sdp": "v=0\r\no=- 4209534..." 
  } 
}
```

### B. Gửi Answer
```json
{ 
  "type": "answer", 
  "roomId": "room-123", 
  "sender": "Bob", 
  "target": "Alice", 
  "answer": { 
      "type": "answer", 
      "sdp": "v=0\r\no=- 234123..." 
  } 
}
```

### C. Gửi ICE Candidate
```json
{ 
  "type": "candidate", 
  "roomId": "room-123", 
  "sender": "Alice", 
  "target": "Bob", 
  "candidate": { 
      "candidate": "candidate:8421630... udp 16777 ...", 
      "sdpMLineIndex": 0, 
      "sdpMid": "0" 
  } 
}
```

### D. Kết thúc cuộc gọi nhóm (End Call)
*   **Mục đích:** Khi một người bấm dừng gọi nhưng chưa rời phòng, hệ thống đóng tất cả các PC, trả về trạng thái UI mặc định.
*   **JSON (Client gửi):**
```json
{
  "type": "endCall",
  "roomId": "room-123",
  "sender": "Alice"
}
```

---

## 🔥 Nhắc nhở
*   **Thành viên 1 (Backend):** Gom Map 2 chiều/chuỗi để nhóm chung `roomId`. Theo dõi sự kiện `ws.on('close')` để dọn Map kịp thời và gửi thông báo `memberLeft`.
*   **Thành viên 2 (Frontend UI):** Nhớ phải dựa vào trường `sender` hoặc `target` để nối các SDP đúng với từng đối tượng `new RTCPeerConnection()`. Rất dễ nhầm lẫn khi phòng có 3-4 người sinh ra nhiều PC.
*   **Thành viên 3 (Network):** Mượn tạm code HTML hiện tại của dự án để add mảng `iceServers` có TURN/STUN theo mẫu trước, sau đó đợi member 2 làm xong UI Mesh thì dán vào block hàm `setupPeerConnection()`.