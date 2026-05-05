# 🎥 WebRTC Group Call App

Ứng dụng gọi video nhóm theo kiến trúc **Mesh P2P** sử dụng WebRTC. Bao gồm:
- **Signaling Server** — Node.js + WebSocket (forward SDP & ICE)
- **TURN/STUN Server** — Coturn chạy qua Docker
- **Frontend** — HTML/CSS/JS thuần, không phụ thuộc framework

> **Kiến trúc Mesh:** Mỗi người tạo kết nối P2P trực tiếp với từng người còn lại trong phòng.  
> Ví dụ: 3 người → 3 kết nối P2P; 4 người → 6 kết nối P2P.

---

## 📋 Mục lục

1. [Yêu cầu hệ thống](#1-yêu-cầu-hệ-thống)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Cấu hình biến môi trường](#3-cấu-hình-biến-môi-trường)
4. [Cài đặt & Chạy Signaling Server](#4-cài-đặt--chạy-signaling-server)
5. [Cấu hình & Chạy TURN Server (Coturn)](#5-cấu-hình--chạy-turn-server-coturn)
6. [Test gọi 2 người](#6-test-gọi-2-người)
7. [Test gọi nhóm 3–4 người](#7-test-gọi-nhóm-34-người)
8. [Các lệnh tiện ích](#8-các-lệnh-tiện-ích)
9. [Gỡ lỗi & Kiểm tra ICE](#9-gỡ-lỗi--kiểm-tra-ice)

---

## 1. Yêu cầu hệ thống

_Đề xuất: Khuyên dùng hệ điều hành Linux để chạy ứng dụng này do các hạn chế của Windows đối với các relay ports_

| Phần mềm | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| **Node.js** | 16.x trở lên | Chạy Signaling Server |
| **npm** | 8.x trở lên | Đi kèm với Node.js |
| **Docker** | 20.x trở lên | Chạy Coturn |
| **Docker Compose** | v2.x trở lên | Quản lý container |


> **Lấy IP LAN của máy:**
> - **Windows:** Mở PowerShell → gõ `ipconfig` → tìm dòng `IPv4 Address` ở card Wi-Fi hoặc Ethernet (ví dụ: `192.168.1.11`).
> - **Linux/macOS:** Mở Terminal → gõ `ip a` hoặc `ifconfig`.

---

## 2. Cấu trúc thư mục

```
webrtc-app-v2/
│
├── public/                  # Frontend (HTML + JS)
│   ├── index.html           # Giao diện chính
│   └── app.js               # Logic WebRTC phía client
│
├── server/                  # Signaling Server (Node.js)
│   ├── .env                 # ⚙️ Cấu hình IP TURN & credentials
│   └── server.js            # Entry point của server
│
├── turn-server/             # TURN Server (Coturn via Docker)
│   ├── .env                 # ⚙️ Cấu hình IP & credentials cho Docker
│   ├── docker-compose.yml   # Định nghĩa container Coturn
│   ├── turnserver.conf      # Cấu hình chi tiết Coturn
│   └── run.sh               # Script khởi động (Linux/macOS/WSL)
│

├── package.json             # Scripts & dependencies
└── README.md                
```

---

## 3. Cấu hình biến môi trường

Dự án có **2 file `.env`** riêng biệt cho 2 thành phần. Cả hai phải dùng cùng IP và cùng credentials.

Giả sử ip local trong trường hợp này là 192.168.1.11.
### 3.1 `turn-server/.env` — Cấu hình cho Coturn (Docker)

```env
# Địa chỉ IP LAN của máy chạy TURN server
SERVER_IP=192.168.1.11

# Thông tin đăng nhập TURN (tự đặt)
TURN_USER=admin
TURN_PASS=password
TURN_REALM=ltm.turn.local
```

### 3.2 `server/.env` — Cấu hình cho Signaling Server (Node.js)

```env
# Port chạy Signaling Server (mặc định 3000)
PORT=3000

# IP của TURN server (phải KHỚP với SERVER_IP ở trên)
TURN_IP=192.168.1.11

# Credentials TURN (phải KHỚP với turn-server/.env)
TURN_USER=admin
TURN_PASS=password
```

> **⚠️ Quan trọng:**  
> `TURN_IP` trong `server/.env` và `SERVER_IP` trong `turn-server/.env` **phải là cùng một địa chỉ IP**.  
> Credentials (`TURN_USER`, `TURN_PASS`) cũng phải khớp nhau.

---

## 4. Cài đặt & Chạy Signaling Server

### Bước 1: Cài đặt dependencies

Mở terminal tại **thư mục gốc** của dự án:

```bash
npm install
```

### Bước 2: Khởi động server

**Chế độ production:**
```bash
npm start
```

**Chế độ development** (tự restart khi sửa code):
```bash
npm run dev
```

### Kiểm tra server đã chạy

Sau khi khởi động, terminal sẽ in:
```
[INFO] Signaling Server running on port 3000
[INFO] Access locally:  http://localhost:3000
[INFO] Access on LAN:   http://<YOUR_LAN_IP>:3000
```

Mở trình duyệt và truy cập:
- **Trên máy chủ:** `http://localhost:3000`
- **Từ thiết bị khác trong LAN:** `http://192.168.1.11:3000`

---

## 5. Cấu hình & Chạy TURN Server (Coturn)

TURN server cần thiết khi 2 thiết bị **không thể kết nối P2P trực tiếp** (ví dụ: khác mạng, sau NAT nghiêm ngặt, hay giữa các mạng di động).

### Chạy Coturn bằng Docker (Khuyến nghị)

#### Điều kiện tiên quyết
- Docker Desktop đã chạy (kiểm tra bằng `docker ps`)
- Đã cấu hình `turn-server/.env` ở Bước 3.1

#### Trên Linux/macOS hoặc WSL (Windows):

```bash
npm run turn:up
```

Lệnh này tương đương với:
```bash
cd turn-server && bash run.sh
```

Script sẽ tự động:
1. Dừng container cũ (nếu có)
2. Khởi động container `coturn/coturn:latest` với cấu hình từ `.env` và `turnserver.conf`

#### Trên Windows (PowerShell thuần, không có WSL):

```powershell
cd turn-server
docker compose down
docker compose up -d
```

#### Kiểm tra Coturn đã chạy

```bash
docker ps
# Phải thấy container tên "turn_server" đang running

docker logs turn_server
# Xem log của Coturn
```

**Ports được mở bởi Coturn:**
| Port | Giao thức | Mục đích |
|---|---|---|
| `3478` | TCP & UDP | STUN/TURN chính |
| `49152–49251` | UDP | Relay media |

#### Dừng Coturn

```bash
npm run turn:down
# hoặc
cd turn-server && docker compose down
```


## 6. Test gọi 2 người

### Kịch bản: 2 tab trên cùng máy

1. Mở **Tab A** → truy cập `http://localhost:3000`
2. Tại Tab A: nhập tên hiển thị → nhấn **"Tạo phòng mới"** → ghi lại **Room ID** được tạo
3. Mở **Tab B** → truy cập `http://localhost:3000`
4. Tại Tab B: nhập tên → dán Room ID vào ô → nhấn **"Vào phòng"**
5. Tại **một trong hai tab**: nhấn **"Bắt Đầu Gọi Nhóm"**
6. ✅ Cả hai tab sẽ thấy video của nhau

### Kịch bản: 2 thiết bị khác nhau trong LAN

1. Đảm bảo cả 2 thiết bị kết nối cùng mạng Wi-Fi/LAN
2. **Thiết bị A** (máy chạy server): truy cập `http://localhost:3000` → tạo phòng
3. **Thiết bị B**: truy cập `http://192.168.1.11:3000` → nhập Room ID → vào phòng
4. Nhấn **"Bắt Đầu Gọi Nhóm"** từ bất kỳ thiết bị nào
5. ✅ Hai thiết bị kết nối P2P (qua STUN hoặc TURN nếu cần)

> 💡 **Lưu ý camera/microphone:**  
> - Trình duyệt chỉ cho phép dùng camera/mic trên `localhost` hoặc **HTTPS**.  
> - Nếu truy cập từ thiết bị khác qua `http://IP:3000`, trình duyệt có thể **block camera**.  
> - Giải pháp: dùng **HTTPS** hoặc **Ngrok** (xem bên dưới).

### Dùng Ngrok để bypass HTTPS (tùy chọn)

```bash
# Cài Ngrok: https://ngrok.com/download
ngrok http 3000
```

Ngrok sẽ cấp một URL dạng `https://xxxx.ngrok-free.app` — dùng URL này để mọi thiết bị đều truy cập được qua HTTPS.

---

## 7. Test gọi nhóm 3–4 người

### Kịch bản: Nhiều tab trên cùng máy

1. **Tab A**: Tạo phòng → ghi lại Room ID
2. **Tab B, C, D**: Mỗi tab vào phòng với cùng Room ID (nhập tên khác nhau)
3. Sau khi tất cả đã vào phòng, nhấn **"Bắt Đầu Gọi Nhóm"** từ **bất kỳ tab nào**
4. ✅ Tất cả thành viên tự động kết nối theo dạng Mesh

### Kịch bản: Nhiều thiết bị thực

| Thiết bị | Bước thực hiện |
|---|---|
| **Máy A** (chạy server) | Truy cập `http://localhost:3000` → Tạo phòng |
| **Máy B** | Truy cập `http://192.168.1.11:3000` → Nhập Room ID → Vào phòng |
| **Máy C** | Truy cập `http://192.168.1.11:3000` → Nhập Room ID → Vào phòng |
| **Điện thoại D** | Truy cập `http://192.168.1.11:3000` → Nhập Room ID → Vào phòng |
| **Bất kỳ** | Nhấn **"Bắt Đầu Gọi Nhóm"** |

### Số lượng kết nối P2P theo mesh

| Số người | Số kết nối P2P |
|---|---|
| 2 người | 1 kết nối |
| 3 người | 3 kết nối |
| 4 người | 6 kết nối |

> ⚠️ **Lưu ý hiệu năng:** Với 4+ người, mỗi máy phải encode/gửi video đến N-1 người khác.  
> Khuyến nghị dùng máy có CPU tốt và mạng ổn định khi test 4 người.

---

## 8. Các lệnh tiện ích

```bash
# Cài đặt dependencies lần đầu
npm install

# Chạy toàn bộ hệ thống (TURN + Signaling Server)
npm run deploy:all

# Chỉ khởi động TURN server (Coturn qua Docker)
npm run turn:up

# Chỉ dừng TURN server
npm run turn:down

# Khởi động Signaling Server (production)
npm start

# Khởi động Signaling Server (development, tự restart)
npm run dev
```

---

## 9. Gỡ lỗi & Kiểm tra ICE

### Xem log Signaling Server

Log được in trực tiếp ra terminal. Các prefix log:

| Prefix | Ý nghĩa |
|---|---|
| `[WS]` | Kết nối WebSocket mới |
| `[JOIN]` | Client vào phòng |
| `[LEAVE]` | Client rời phòng |
| `[START]` | Bắt đầu cuộc gọi |
| `[END]` | Kết thúc cuộc gọi |
| `[DISCONNECT]` | Client mất kết nối đột ngột |
| `[WARN]` | Cảnh báo (tin nhắn không hợp lệ…) |
| `[ERROR]` | Lỗi JSON hoặc hệ thống |

### Xem log Coturn

```bash
docker logs -f turn_server
```

### Kiểm tra ICE Candidate trong trình duyệt

1. Mở Chrome → truy cập `chrome://webrtc-internals/`
2. Mở tab ứng dụng và thực hiện cuộc gọi
3. Quay lại `webrtc-internals` → xem phần **ICE candidate pair**

Tìm dòng có trạng thái `succeeded` và loại:
- `host` → kết nối trực tiếp trong LAN ✅
- `srflx` → qua STUN (NAT traversal) ✅
- `relay` → qua TURN server (fallback) ✅

Nếu chỉ thấy `relay` → STUN không hoạt động, kiểm tra firewall.  
Nếu không có candidate nào → TURN cũng không hoạt động, kiểm tra IP và credentials.

### Kiểm tra TURN server hoạt động

```bash
# Test STUN/TURN bằng turnutils (trong Docker)
docker run --rm --network=host \
  coturn/coturn turnutils_uclient \
  -u admin -w password \
  192.168.1.11:3478
```

Hoặc dùng trang web: [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) để kiểm tra TURN credentials.

### Các vấn đề thường gặp

| Vấn đề | Nguyên nhân có thể | Cách khắc phục |
|---|---|---|
| Camera/mic không hoạt động | Truy cập HTTP từ thiết bị khác | Dùng HTTPS hoặc Ngrok |
| Không kết nối được video | TURN server không chạy hoặc sai IP | Kiểm tra `docker ps`, kiểm tra IP trong `.env` |
| Signaling Server không khởi động | Thiếu `.env` hoặc port đang được dùng | Kiểm tra file `.env`, đổi PORT |
| `npm run turn:up` lỗi trên Windows | PowerShell không chạy được bash | Dùng WSL hoặc chạy `docker compose` thủ công |
| Coturn lỗi `Address already in use` | Port 3478 đang được dùng | Dừng service khác dùng port 3478 |

---

*Made with ❤️ by Nhóm Anti Lập Trình Mạng*
