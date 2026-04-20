# Kế Hoạch Làm Việc Nhóm Song Song (WebRTC Group Call)

Hoàn toàn **CÓ THỂ** làm đồng thời, nhưng điều kiện tiên quyết là nhóm phải **thống nhất trước cấu trúc JSON Message (API Contract) qua WebSocket** (đã được định nghĩa chi tiết trong file `cong-viec-nhom.md`) trước khi bắt tay vào code.

Dưới đây là phương pháp 3 thành viên làm việc song song mà không bị block dính lấy nhau:

## 1. Bước đệm (Khoảng 30 phút đầu) - Bắt buộc
* Cả nhóm cùng ngồi lại đọc, thống nhất và chốt chặt chẽ file [cong-viec-nhom.md](cong-viec-nhom.md).
* Bất cứ ai thay đổi trường dữ liệu hoặc logic nào cũng phải update file này và báo cho 2 người còn lại.

## 2. Quá trình làm việc song song
Sau khi có API Contract thống nhất, các thành viên tách ra làm độc lập:

### 👤 Thành viên 1 (Backend): Xây dựng Backend Server & Signaling
*   **Trọng tâm:** Chỉ tập trung sửa file `server.js` chuyển từ quản lý toàn cục sang quản lý theo Phòng (`rooms` dạng `Map<roomId, Map<clientName, ws>>`).
*   **Chức năng cần làm:** Xử lý `joinRoom`, `leaveRoom`, và forward các tín hiệu `offer`, `answer`, `candidate`, `endCall` theo đúng format JSON.
*   **Cách test độc lập:** 
    * Không cần đợi Frontend của M2.
    * Sử dụng CLI tools như `wscat` hoặc viết một script Node.js console đơn giản (dùng thư viện `ws`) để giả lập 3-4 connect đóng vai trò làm client. Bắn thử JSON lên và in log xem kết quả Node.js forward có theo đúng luồng logic phòng hay không.

### 👤 Thành viên 2 (Frontend): Nâng cấp Giao diện & Xử lý WebRTC Mesh Client
*   **Trọng tâm:** Tập trung thiết kế lại code Client-side ở trong file `index.html`.
*   **Chức năng cần làm:** 
    * Xây UI cho việc nhập `roomId` và hiển thị list dánh sách online theo realtime.
    * Xử lý vòng lặp tạo ra **n-1** đối tượng `RTCPeerConnection` khi nhấn nút gọi nhóm (Mesh topology).
    * Code JS tự động tạo/gỡ thẻ `<video>` và hiển thị dạng màn hình Grid.
*   **Cách test độc lập:** 
    * Khi chưa có Backend hoàn thiện, bạn hãy tự tạo **Dữ liệu giả (Mocking)**. 
    * Fake cứng một mảng `members = ["A", "B", "C"]`, sau đó ấn nút gọi giả lập loop sinh ra 3 `RTCPeerConnection` và 3 thẻ `<video>` khung hình trống. Khi Server của M1 xong, bạn chỉ việc ghim WebSocket `ws.onmessage` vào thay thế cục Mock data là chạy thẳng rắp.

### 👤 Thành viên 3 (Network): Cấu hình STUN/TURN, Xử lý Fallback & Lập Báo Cáo
*   **Trọng tâm:** Đảm nhận mạng mọc (Network), Setup Coturn server, viết logic bắt sự kiện rơi kết nối và export log thống kê.
*   **Cách test độc lập:** 
    * Bạn hoàn toàn làm riêng rẽ, **KHÔNG CẦN CHẠM** vào file dự án chính ngay lúc đầu để tránh conflict code rối rắm với người số 2.
    * Copy source gốc ra một thư mục cục bộ của mình, hoạc tạo một file `test-turn.html`. 
    * Viết cấu trúc JSON config mảng `iceServers`. Viết logic bắt event trạng thái chuyển đổi đường truyền, đếm timeout 10-15s kích hoạt trạng thái fallback và in câu "*P2P failed, trying TURN...*", chọc vào `pc.getStats()` để trích xuất xem có đang dùng TURN Relay hay không.
    * Trong lúc chờ TV1, TV2 thì hãy lo dựng sẵn cấu trúc `report.md` và viết `README.md`.

## 3. Giai đoạn ghép code (Merge Phase)
1.  **Cặp đôi TV1 & TV2 ghép trước:** Cắm Backend và Frontend lại với nhau. Thử call lưới mesh trực tiếp trong LAN. Bắt lỗi logic gửi/nhận JSON xem có lọt bug nào không.
2.  **Ráp nối TV3:** Sau khi LAN chạy tốt Group Call. TV3 copy mảng `iceServers` và các đoạn hàm báo lỗi/Stats dán thêm vào trong scope khởi tạo `new RTCPeerConnection()` của bản HTML hoàn thiện mới nhất.
3.  **Hoàn thành:** Cả nhóm dùng điện thoại 4G kiểm tra chéo (khác mạng) để test STUN/TURN, quay video báo cáo và commit nộp bài cuối kì.