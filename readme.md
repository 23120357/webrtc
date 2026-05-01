# 🚀 WebRTC Simple Conference Webapp - Signaling & Coturn Server

Dự án này là một hệ thống WebRTC hoàn chỉnh bao gồm một **Signaling Server** (Node.js + WebSocket) và một **TURN/STUN Server cục bộ** (Coturn chạy bằng Docker). Hệ thống được thiết kế để thử nghiệm đàm phán ICE và kết nối P2P.

---

## 1. Yêu cầu hệ thống (Prerequisites)
Để chạy được dự án này, máy tính của bạn cần cài đặt sẵn:
1. **Node.js** (Phiên bản 16.x trở lên)
2. **Docker** và **Docker Compose** (Dành cho việc chạy Coturn Server)
3. **Ngrok** (Tuỳ chọn - Dùng để truy cập dưới kiểu kết nối http, để các trình duyệt khắt khe như safari cho phép truy cập camera)

---

## 2. Cấu trúc thư mục (Project Structure)

Để hệ thống hoạt động trơn tru với các script, hãy đảm bảo cấu trúc thư mục của bạn giống như sau:
```
webrtc-advanced-network/
│
├── public/                 # Chứa giao diện Frontend
│   ├── app.js
│   └── index.html
│
├── server/                 # Chứa Backend Signaling Server
│   ├── .env                # File cấu hình biến môi trường cho Node.js
│   └── server.js           # Code chính của Signaling Server
│
├── turn-server/            # Chứa hệ thống Coturn (Docker)
│   ├── .env                # File cấu hình biến môi trường cho Docker/Coturn
│   ├── docker-compose.yml
│   ├── run.sh              # Script tạo chứng chỉ và chạy Docker
│   └── turnserver.conf     # File cấu hình chi tiết của Coturn
│
├── package.json            # File quản lý thư viện và scripts hệ thống
└── README.md               # File hướng dẫn này
```
---

## 3. Cấu hình hệ thống

Dự án sử dụng 2 file `.env` riêng biệt cho 2 thành phần. **Bạn BẮT BUỘC phải điền đúng địa chỉ IP LAN (IP mạng Wi-Fi/Dây) của máy tính, nơi bạn muốn server Coturn nhận traffic, vào các file này để Coturn có thể hoạt động.**

> **🔍 Cách lấy IP máy tính của bạn:**
> - **Windows:** Mở `cmd` hoặc `PowerShell`, gõ lệnh `ipconfig` và tìm dòng `IPv4 Address` ở card Wi-Fi hoặc Ethernet (Ví dụ: `10.0.0.13` hoặc `192.168.1.x`).
> - **Linux/Mac:** Mở Terminal, gõ `ifconfig` hoặc `ip a`.

---

### 3.1 Cấu hình cho Coturn Server (`turn-server/.env`)
Tạo file `.env` trong thư mục `turn-server/` và điền thông tin sau:

```
# Địa chỉ IP LAN của máy bạn
SERVER_IP=<IP>

# Thông tin xác thực cho TURN Server
TURN_USER=admin
TURN_PASS=password
TURN_REALM=ltm.turn.local
```

---

### 3.2 Cấu hình cho Signaling Server (`server/.env`)
Tạo file `.env` trong thư mục `server/` và điền thông tin sau:

```
# Port chạy Signaling Server
PORT=<PORT> (Mặc định là 3000 nếu không có giá trị)

# Địa chỉ IP của TURN Server (Thường giống hệt LOCAL_IP ở trên)
TURN_IP=<IP> (Khớp với SERVER_IP trong turn-server/.env)

# Thông tin xác thực (Bắt buộc phải KHỚP với cấu hình ở turn-server/.env)
TURN_USER=admin
TURN_PASS=password
```

---

## 4. Hướng dẫn chạy

Mở terminal ở thư mục gốc của dự án và làm theo các bước sau:

Cài đặt các gói phụ thuộc cho Node.js:

`npm install`

Nhờ các script đã được tích hợp sẵn, bạn có thể chạy cả Coturn bằng Docker và Signaling Server bằng Node.js chỉ với 1 lệnh duy nhất:

`npm run deploy:all`

Lệnh này sẽ tự động: Deploy Coturn qua Docker và Khởi động Signaling Server.

### 🛠 Các lệnh quản lý thủ công (Scripts)

Nếu bạn không muốn chạy tất cả cùng lúc, bạn có thể dùng các lệnh đơn lẻ sau:

```
npm run turn:up # Khởi động riêng Coturn Server (chạy run.sh).
npm run turn:down # Tắt và dọn dẹp Coturn Server (chạy docker compose down).
npm start # Khởi chạy riêng Signaling Server.
npm run dev # Khởi chạy Signaling Server với chế độ theo dõi thay đổi (Nodemon - tự động restart khi bạn sửa code).
```

### 🧪 Hướng dẫn Test

Mở trình duyệt Chrome, truy cập vào http://\<IP>:3000.

Cho phép trình duyệt truy cập Camera và Microphone.

Để kiểm tra đàm phán ICE và quá trình bắt tay P2P:

    1. Mở Tab thứ hai: chrome://webrtc-internals/
    2. Bấm F5 lại Tab trang web (http://<IP>:3000).
    3. Quay lại Tab webrtc-internals, bạn sẽ thấy biểu đồ và danh sách các gói tin đàm phán (Candidate Pair).

Bạn cũng có thể sử dụng Ngrok để forward port 3000 ra ngoài, sau đó dùng thiết bị khác (chung mạng LAN hoặc máy ảo) truy cập vào link Ngrok để test luồng video thực tế.

---

## 5. Cách tạo cert (self-signed)

Tạo chứng chỉ để phục vụ HTTPS/WSS khi cần test trình duyệt yêu cầu bảo mật:

```
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/key.pem -out certs/cert.pem -days 365 \
    -subj "/CN=localhost"
```

Gợi ý:
- Nếu chạy trên Windows, có thể dùng Git Bash hoặc cài OpenSSL (ví dụ qua Chocolatey).
- Bạn có thể thay `CN=localhost` bằng IP LAN nếu cần.

---

## 6. Cách test gọi 2 người và gọi nhóm 3–4 người

### 6.1 Gọi 2 người
1. Mở 2 tab trình duyệt (hoặc 2 thiết bị) cùng truy cập `http://<IP>:3000`.
2. Ở Tab A: tạo phòng mới.
3. Ở Tab B: nhập đúng Room ID và vào phòng.
4. Nhấn **Bắt Đầu Gọi Nhóm** ở một tab để tạo kết nối P2P.

### 6.2 Gọi nhóm 3–4 người
1. Mở 3–4 tab trình duyệt (hoặc 3–4 thiết bị) cùng truy cập `http://<IP>:3000`.
2. Tab A tạo phòng mới.
3. Các tab còn lại nhập đúng Room ID để vào phòng.
4. Nhấn **Bắt Đầu Gọi Nhóm** để tạo mesh kết nối giữa mọi người.
