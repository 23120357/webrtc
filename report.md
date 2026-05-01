# Report - WebRTC Mesh Group Call

## 1. Mo ta kien truc

He thong gom 3 thanh phan chinh:
- Trinh duyet (Client): giao dien, xu ly WebRTC, quan ly phong va peer connection.
- Signaling Server (Node.js + WebSocket): trao doi thong tin SDP/ICE va dieu phoi thanh vien trong phong.
- TURN/STUN (Coturn - Docker): cung cap relay khi P2P khong the ket noi truc tiep.

Kien truc Mesh:
- Moi client tao ket noi peer-to-peer den tat ca thanh vien con lai (n-1 ket noi).
- Signaling Server chi chuyen tiep thong tin (offer/answer/ICE), khong truyen media.

Luong chinh:
1) Client vao phong -> server tra danh sach thanh vien.
2) Client tao RTCPeerConnection voi cac thanh vien khac.
3) Trao doi offer/answer va candidate de hoan tat ket noi.
4) Media di truc tiep giua cac client (P2P), neu khong duoc thi chuyen sang TURN relay.

## 2. Mo ta message signaling

Cac message chinh (client <-> server):
- joinRoom: client vao phong
  - payload: { type, roomId, sender, displayName }
- roomInfo: server tra danh sach thanh vien
  - payload: { type, roomId, members: [{ id, name }] }
- userJoined: server thong bao co nguoi moi vao phong
  - payload: { type, sender, displayName }
- offer: gui SDP offer
  - payload: { type, target, sdp }
- answer: gui SDP answer
  - payload: { type, target, sdp }
- candidate: gui ICE candidate
  - payload: { type, target, candidate }
- startCall: bat dau cuoc goi nhom
  - payload: { type, roomId, sender, members }
- endCall: ket thuc cuoc goi
  - payload: { type }
- leaveRoom: roi phong
  - payload: { type }
- memberLeft: server thong bao thanh vien roi phong
  - payload: { type, sender }
- micStatus: trang thai mic
  - payload: { type, sender, enabled }

## 3. Ket qua test P2P vs TURN

### 3.1 P2P (direct)
- Dieu kien: cac client cung mang LAN, khong bi chan NAT.
- Ket qua: ICE chon candidate typ host/srflx, ket noi thanh cong.

Anh chup man hinh / log:
- [Chen anh tai day]
- [Chen log tai day]

### 3.2 TURN (relay)
- Dieu kien: mot client bi NAT khac mang hoac bi chan P2P.
- Ket qua: ICE fallback sang relay, ket noi qua TURN thanh cong.

Anh chup man hinh / log:
- [Chen anh tai day]
- [Chen log tai day]
