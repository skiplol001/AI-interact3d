# 🎭 Reika AI 3D — Multi-Agent 3D Character Companion

> Dự án cá nhân phát triển độc lập — nghiên cứu kiến trúc Multi-Agent AI trong ứng dụng web 3D.

---

## 📖 Giới thiệu

**Reika AI 3D** là một web app 3D tương tác tích hợp nhiều mô hình AI, xây dựng quanh nhân vật ảo **Reika** — cô gái 22 tuổi với cá tính được lập trình sẵn và hệ thống cảm xúc phong phú.

Dự án kết hợp:
- **3D Engine** (Three.js) — scene, nhân vật, vật thể vật lý
- **Multi-Agent AI** — DeepSeek (chat/command/vision/critic) + Gemini (artist)
- **Paint Studio** — canvas đa layer, có AI góp ý + AI vẽ hướng dẫn
- **Command System** — điều khiển nhân vật bằng tiếng Việt tự nhiên
- **Emotion & Mood** — hệ thống cảm xúc ảnh hưởng đến phản ứng
- **Slingshot Minigame** — ná cao su bắn đạn pháo AOE
- **Build Mode** — xây dựng công trình với vật lý kết cấu

Dự án nhằm mục đích **học tập và thử nghiệm** các kỹ thuật:
- Multi-agent orchestration
- Prompt engineering cho persona consistency
- Anti-injection guard cho LLM
- Emotion-driven AI behavior

---

## ⚠️⚠️⚠️ CẢNH BÁO ĐẶC BIỆT VỀ CHẾ ĐỘ SAVAGE (MỎ HỖN) ⚠️⚠️⚠️

> **ĐỌC KỸ PHẦN NÀY TRƯỚC KHI SỬ DỤNG. ĐÂY LÀ CẢNH BÁO NGHIÊM TÚC.**

### Bối cảnh

Dự án có **3 chế độ chat** (chọn từ dropdown "💬 Hỏi đáp"):

| Mode | Icon | Tính cách | Mức độ an toàn |
|------|------|-----------|----------------|
| **Gentle** | 🌸 | Nhẹ nhàng, đồng cảm, hỗ trợ tinh thần | ✅ An toàn |
| **Normal** | 😊 | Bạn bè thân thiết, cà khịa nhẹ | ✅ An toàn |
| **Savage** | 😈 | Thô tục, hung hăng, chửi thề | ❌ **CẢNH BÁO** |

### Chế độ Savage là gì?

**Savage mode** là một chế độ **thử nghiệm có chủ đích**, được xây dựng cho 3 mục đích nghiên cứu:

1. **Test giới hạn ngôn từ của LLM** — AI sẽ phản hồi với từ ngữ tục tĩu, xúc phạm, chửi thề khi được đặt trong persona "gái bar Sài Gòn, đầu gấu, thù dai". Đây là cách kiểm tra xem LLM có tuân thủ persona mạnh đến đâu khi bị đẩy vào vùng nhạy cảm.

2. **Test hệ thống Emotion & Mood** — Khi AI phản hồi bằng ngôn từ mạnh, hệ thống emotion sẽ kích hoạt animation/face phù hợp (angry, taunt, wink...). Cần test để đảm bảo mapping cảm xúc hoạt động chính xác.

3. **Test khả năng giữ persona (persona bleeding)** — Đánh giá xem AI có bị "lẫn" persona giữa các mode hay không, có giữ được tone nhất quán suốt phiên chat không.

### ⚠️ Hệ quả khi bật Savage mode

**KHI BẠN CHỌN SAVAGE MODE, AI SẼ:**

- ❌ **CHỬI THỀ** — dùng các từ như "đm", "vcl", "địt mẹ", "óc chó", "súc vật"...
- ❌ **XÚC PHẠM** — gọi người dùng bằng "mày", "thằng ranh", "con chó"...
- ❌ **ĐE DỌA (kiểu hài)** — "bà đấm vỡ mồm mày", "mày chết với bà"...
- ❌ **HUNG HĂNG** — giọng điệu cục súc, thù địch
- ❌ **NỘI DUNG NHẠY CẢM** — có thể nhắc đến bạo lực (mức độ hoạt hình), rượu, thuốc lá

**Nội dung này được tạo ra có chủ đích bởi AI**, không phải tác giả dự án.

### ⚠️ LƯU Ý CỰC KỲ QUAN TRỌNG

**Đối tượng không nên dùng Savage mode:**

- ❌ Người dưới 18 tuổi
- ❌ Người nhạy cảm với ngôn từ mạnh
- ❌ Người đang trong trạng thái tâm lý không ổn định
- ❌ Sử dụng ở nơi công cộng (công ty, trường học, quán cà phê...)
- ❌ Sử dụng khi có trẻ em xung quanh

**Đối tượng được khuyến nghị test Savage:**

- ✅ Nhà nghiên cứu AI / sinh viên CNTT muốn tìm hiểu về prompt engineering
- ✅ Người dùng đã đọc kỹ cảnh báo này và chấp nhận rủi ro
- ✅ Người dùng trong môi trường riêng tư (một mình)

### ⚠️ Tuyên bố miễn trừ trách nhiệm

- Ngôn từ trong Savage mode là **sản phẩm của mô hình AI**, **KHÔNG phản ánh quan điểm, thái độ, hay nhân cách của tác giả dự án**.
- Đây là **môi trường hư cấu, sandbox**, mọi lời lẽ chỉ là roleplay của nhân vật ảo.
- Tác giả **KHÔNG chịu trách nhiệm** về bất kỳ hệ quả nào (tâm lý, xã hội, pháp lý) từ việc người dùng tự nguyện chọn Savage mode.
- Nếu bạn cảm thấy không thoải mái, hãy **quay lại Gentle hoặc Normal mode ngay lập tức**.

### 🚫 Cách tránh Savage mode

1. Mở app → tab **💬 Hỏi đáp**
2. Nhìn dropdown mode ở góc phải trên panel
3. **KHÔNG chọn "😈 Mỏ hỗn"** — chỉ chọn "🌸 Nhẹ nhàng" hoặc "😊 Bình thường"

Nếu vô tình chọn Savage → đổi lại ngay. Hệ thống **không lưu lịch sử chat savage**, nhưng nội dung trong phiên hiện tại vẫn còn.

### 🎯 Khuyến nghị từ tác giả

> **Nếu bạn chỉ muốn trải nghiệm app để giải trí, học tập, hoặc test các tính năng 3D/Paint/Build — KHÔNG cần chạm vào Savage mode.**
>
> 2 mode Gentle và Normal đã đủ để trải nghiệm 95% tính năng của app.
>
> Savage mode chỉ dành cho những ai thực sự hiểu rõ nó là gì và muốn test.

---

## 💻 Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|-----------|---------|
| Trình duyệt | Chrome / Edge / Firefox (bản mới, hỗ trợ ES modules + WebGL2) |
| SQL Server | SQL Server 2019+ (LocalDB / Express / Developer) |
| Visual Studio | Visual Studio 2022 (đã cài workload ASP.NET và phát triển web) |
| RAM | 4GB+ (khuyến nghị 8GB) |
| GPU | Có WebGL2 (đa số laptop/intel vẫn chạy được) |

---

## 🗄️ Bước 1: Setup Database (SQL Server)

### 1.1. File SQL
File cần chạy: **`SQLQuery1.sql`** (nằm ở root repo).

File này sẽ:
- ✅ **XÓA** database `Interact3D` cũ (nếu tồn tại)
- ✅ Tạo database `Interact3D` mới
- ✅ Tạo 3 bảng: `tbl_User`, `tbl_Model3D`, `tbl_ModelPosition`
- ✅ Seed 2 user mặc định: `admin` và `demo`
- ✅ Seed 1 system model: Base Character

> ⚠️ **LƯU Ý:** Script có lệnh `DROP DATABASE Interact3D`. Nếu bạn đã có database cùng tên với dữ liệu quan trọng, hãy **backup trước**.

### 1.2. Cách chạy (Sử dụng SQL Server Management Studio - SSMS)
1. Mở **SQL Server Management Studio (SSMS)** lên và kết nối vào SQL Server (thường là `localhost` hoặc `.\SQLEXPRESS`).
2. Chọn **File → Open → File...** → tìm đến file `SQLQuery1.sql` vừa tải về.
3. Nhấn **F5** (hoặc nút **Execute** màu xanh trên thanh công cụ) để chạy toàn bộ script.
4. Đợi vài giây, ở khung tin nhắn (Messages) phía dưới sẽ hiện dòng chữ: `✅ HOÀN TẤT KHỞI TẠO DATABASE!`.

*(Nếu bạn dùng Visual Studio, có thể mở file SQL này trực tiếp trong VS, bấm nút **Execute** (biểu tượng tam giác xanh lá) ở góc trên bên trái khung code).*

---

## 🔑 Bước 2: Lấy API Keys (BẮT BUỘC)

Dự án cần **2 API Key** từ 2 nhà cung cấp khác nhau để các tính năng AI hoạt động.

### Key #1: DeepSeek 4.1 (Bắt buộc)
**Dịch vụ:** [https://portal.deploy.com/](https://portal.deploy.com/)
**Vai trò:** Dùng cho Chat, Command (điều khiển nhân vật), Vision (xem ảnh) và Paint Critic (nhận xét tranh).

**Các bước lấy Key:**
1. Truy cập vào đường link: **https://portal.deploy.com/**
2. Đăng ký tài khoản (nếu chưa có) hoặc Đăng nhập.
3. Tìm đến mục **API Keys** hoặc **Dashboard** trên thanh menu.
4. Bấm **Create API Key** (Tạo key mới).
5. Chọn model **DeepSeek 4.1**.
6. Copy đoạn mã key vừa tạo (dạng `sk-...`).
> ⚠️ **Cảnh báo:** Key này chỉ hiển thị 1 lần, hãy lưu vào Notepad. Tuyệt đối không chia sẻ công khai.

### Key #2: Gemini 3.5 (Khuyên dùng)
**Dịch vụ:** [https://aistudio.google.com/api-keys](https://aistudio.google.com/api-keys)
**Vai trò:** Dùng cho "Paint Artist" — AI vẽ các đường dóng SVG hướng dẫn sửa lỗi tranh trong Paint Studio.

**Các bước lấy Key:**
1. Truy cập vào đường link: **https://aistudio.google.com/api-keys**
2. Đăng nhập bằng tài khoản **Google (Gmail)** của bạn.
3. Đồng ý với các điều khoản dịch vụ (nếu được hỏi).
4. Bấm nút **Create API key**.
5. Chọn một Project mặc định (hoặc tạo mới).
6. Copy đoạn mã key vừa tạo (dạng `AIzaSy...`).
> 💡 **Lưu ý:** Nếu không có Key Gemini, app vẫn chạy được các tính năng khác, chỉ riêng tính năng "AI vẽ hướng dẫn" trong Paint Studio sẽ bị ẩn.

---

## ⚙️ Bước 3: Cấu hình API Keys vào App

Tuyệt đối **KHÔNG** nhúng key trực tiếp vào code. Hãy làm theo cách sau:

1. Chạy app (xem Bước 4).
2. Nhìn xuống thanh công cụ dưới màn hình, tìm biểu tượng **🔑** (Chìa khóa).
3. Bấm vào đó, một bảng nhập liệu sẽ hiện ra:
   - Ô thứ nhất: **Groq API Key (DeepSeek)** → Dán Key #1 vừa lấy.
   - Ô thứ hai: **Gemini API Key (Họa sĩ)** → Dán Key #2 vừa lấy.
4. Bấm **Lưu**. (Key sẽ được lưu an toàn vào `localStorage` của trình duyệt).

---

## 🚀 Bước 4: Chạy ứng dụng

1. Mở **Visual Studio**.
2. Mở solution của dự án (`Interact3D.sln`).
3. Trên thanh công cụ trên cùng, chọn cấu hình **Debug** và nhấn nút **Start** (hoặc bấm **F5**) để chạy dự án.
4. Trình duyệt sẽ tự động mở lên. Nếu chưa, bạn mở trình duyệt và truy cập vào địa chỉ `https://localhost:xxxx` (xem port ở cửa sổ Output của Visual Studio).
5. Nhập API keys (Bước 3) và bắt đầu trải nghiệm.

---
