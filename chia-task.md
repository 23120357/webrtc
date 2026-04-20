# 📋 Phân Công Công Việc Xây Dựng Mở Rộng Hệ Thống WebRTC

Dựa trên yêu cầu mở rộng hệ thống WebRTC Call thành kiến trúc **TURN + Room + Mesh Group Call**, dưới đây là bảng phân công chi tiết nhiệm vụ và trách nhiệm của từng người để tránh conflict code.

---

## 👤 Thành viên 1: Xây dựng Backend & Quản lý Signaling (Server-side)
**Trọng tâm:** Cấu trúc lại file `server.js`, chuyển từ kiến trúc quản lý toàn cục (`global`) sang quản lý chia theo Phòng (`Room`).

### 📝 Chi tiết công việc gồm B1 (Server) & B3:
*   **Quản lý Phòng & Trạng Thái (Room Management):** 
    * Tạo cấu trúc dữ liệu quản lý trạng thái, ví dụ: `Map<roomId, Map<clientName, ws>>`.
    * Xử lý chính xác các tín hiệu `joinRoom`, `leaveRoom` và đặc biệt là `endCall`. **Bắt buộc Server phải dọn sạch state/bộ nhớ liên quan** để không sinh ra rác kết nối.
    * **Broadcast nội bộ:** Ràng buộc logic gửi nội dung. Bất kỳ thông báo hay sự thay đổi danh sách user nào cũng chỉ được gửi cho **các Client nằm trong cùng một Phòng** (không gửi lố ra phòng khác).
*   **Định tuyến luồng gọi nhóm (Mesh Forwarding):**
    * Parse và forward nguyên trạng các thông điệp media (`offer`, `answer`, `candidate`) cho đúng thiết bị đích thông qua việc dò mã `roomId` và `target`.
    * Giám sát sự kiện ngắt kết nối đột ngột của WebSocket (tắt trình duyệt, mất mạng) để tự động xuất thông báo `memberLeft` báo hiệu cho những user khác dọn dẹp thẻ Video (Đảm bảo yêu cầu: Xử lý lỗi WS disconnect, peer rời phòng).
*   **Bảo đảm Code Quality (Không hardcode IP):**
    * Xóa dòng IP fix cứng trong log `server.listen(...)`.
    * Cân nhắc dùng biến môi trường để lắng nghe chung mọi nới: `const PORT = process.env.PORT || 3000; server.listen(PORT, '0.0.0.0', ...);`

---

## 👤 Thành viên 2: Nâng cấp Giao diện & Xử lý Mesh Group Call (Client UI)
**Trọng tâm:** Chỉnh sửa file `index.html`, tạo giao diện "Phòng họp" và xử lý kiến trúc kết nối lưới nhiều chiều (`n-1` Mesh Topology).

### 📝 Chi tiết công việc gồm B1 (UI) & B2:
*   **Cập nhật Giao diện (UI):**
    * Bổ sung các input nhập `roomId` và các nút điều khiển chức năng `Create/Join Room`.
    * Render danh sách các thành viên thực tế đang tồn tại trong Room lên màn hình.
*   **Xử lý Logic Gọi Nhóm & Quản Lý Trạng Thái (Mesh Connection):**
    * Khi người dùng nhấn nút *"Start Group Call"*, viết vòng lặp để khởi tạo đồng loạt **n-1** đối tượng `RTCPeerConnection` (nối với tất cả thành viên trong list phòng).
    * **Dynamic Video Grid:** Code DOM API tự động (`document.createElement('video')`) nhúng Video Elements vào giao diện dạng Lưới / Chia ô khi có luồng stream mới tới.
    * Lắng nghe sự kiện `memberLeft` từ Backend để tự động đóng `RTCPeerConnection` bị đứt và `.remove()` thẻ video tương ứng ra khỏi màn hình tránh giao diện lỗi.
    * **Sự kiện Nút Hangup (Chống lỗi gọi lại):** Khi bấm Dừng Gọi (Gửi `endCall` hoặc `leaveRoom`), Client bắt buộc **tự đóng toàn bộ `RTCPeerConnection`** đang mở trong room và dọn sạch khung hình DOM video lưới lưới. Phải test thật kỹ để đảm bảo **Không được xảy ra lỗi: Cúp máy xong thì không thể gọi lại (Re-call)** như yêu cầu B3 của đề bài.
*   **Bảo đảm Code Quality (Không hardcode IP):**
    * Gỡ bỏ hoàn toàn IP fix cứng `const ws = new WebSocket('wss://192.168.1.167:3000');`.
    * Trích xuất kết nối ra biến linh động: `const SIGNALING_URL = \`wss://${window.location.hostname}:3000\`; const ws = new WebSocket(SIGNALING_URL);` để giám khảo chấm test trên mọi IP mạng nội bộ mà không cần sửa code.
*   **Tài liệu Hóa (Hỗ trợ Báo cáo):**
    * Viết một đoạn ngắn mô tả **Thiết kế Room & Group call** (Giải thích logic tạo `n-1` Peer Connections cho kiến trúc Mesh, và cách thuật toán tính toán/hiển thị Grid Video DOM) chuyển cho Thành viên 3 ghép vào `report.md`.

---

## 👤 Thành viên 3: Network, Phân tích STUN/TURN & Báo Cáo (WebRTC Core)
**Trọng tâm:** Xử lý kết nối sâu của mạng (`ICE Candidate`), đảm bảo cuộc gọi có thể xuyên NAT/Firewall và chịu trách nhiệm làm bản báo cáo nghiệm thu nộp bài.

### 📝 Chi tiết công việc gồm A1 & A2 & A3:
*   **Triển khai TURN & Cấu hình Hạ tầng Network:**
    * Cài đặt và cấp phát Node TURN Server (qua Coturn / Docker hoặc dịch vụ cloud). 
    * **Bắt buộc:** Ghi chép và cấu hình rõ ràng thông tin: `host`, `ports` (3478 tcp/udp, 5349 tls), `username`, và `credential`. Đưa cấu trúc `iceServers` này cung cấp cho Thành viên 2 ghép vào code.
*   **Fallback Management (Dự phòng ngắt mạch):**
    * Đặt Listener nghe các sự kiện `oniceconnectionstatechange` và `onconnectionstatechange` của WebRTC.
    * Áp dụng Logic Timeout (10 - 15 giây). Nếu mạng không connected được kiểu P2P thì nhả thông báo *"P2P failed, trying TURN..."* và ép luồng mạng chuyển sang chế độ dùng cổng Relay.
*   **Log Thống Kê & Giám Sát (Analytics):**
    * Tích hợp đọc API `pc.getStats()` liên tục để trích xuất loại kết nối (`host`, `srflx`, hay `relay`) và log ra màn hình chứng minh TURN hoạt động.
    * Trace thời gian bắt đầu và kết thúc hệ thống theo log chuẩn.
    * **Nội dung Báo Cáo & Document (Yêu cầu khắt khe):** 
        * Viết file `README.md` mô tả rõ ràng **về việc triển khai TURN** (cách setup/chạy bằng lệnh docker, host/port là gì, credential ở đâu) thay vì chỉ cấu hình ngầm. 
        * Hướng dẫn chi tiết **cách tạo chứng chỉ mạng (cert) self-signed**.
        * Tổng hợp mô tả **Thiết kế Room & Group call mesh** từ Thành viên 2 đẩy vào `report.md`.
    * **Nhiệm vụ Thử nghiệm:** Trực tiếp giám sát Test System chạy 3 môi trường (LAN, Wifi, 4G). Đặc biệt **hệ thống Test phải đảm bảo duy trì gọi nhóm ổn định 3-4 người**, chụp màn hình grid video/log thống kê làm bằng chứng chứng minh hoàn thiện 100% đồ án.

---

> 💡 **Khuyến nghị:**
> Các thành viên hãy bấm sang xem file [cach-lam.md](cach-lam.md) để biết chiến thuật vừa chia việc trên vừa làm lập trình song song mà không cần đợi File hay đợi module của người còn lại.