# codePTIT++

Tiện ích mở rộng cho trình duyệt, hỗ trợ người dùng học và thi lập trình trên nền tảng [CodePTIT](https://code.ptit.edu.vn) hiệu quả hơn.

## Tính năng

### Trình soạn thảo code tích hợp
- Trình soạn thảo với tô sáng cú pháp, đánh số dòng, tự hoàn thiện dấu ngoặc.
- Gập khối code, tìm kiếm và thay thế trong file.
- Chế độ tối / sáng, toàn màn hình.
- Font chữ JetBrains Mono.
- Hỗ trợ C, C++, Python, Java, C#.

### Nộp bài nhanh
- Dán code từ bộ nhớ đệm và nộp bài chỉ trong một thao tác.
- Tự động điền tên file đúng định dạng compiler đang chọn.

### Sao chép thông minh
- Sao chép input / output mẫu sạch, không lẫn ký tự thừa.
- Sao chép tên file theo định dạng tùy chỉnh (ví dụ: `C01001_TongCuaDaySo.cpp`).

### Gửi đề bài sang IDE
- Gửi thông tin bài tập trực tiếp đến CP Editor, CPH (VS Code), Caide và các IDE tương thích.
- Không bắt buộc phải cài Competitive Companion.
- Tên bài gửi sang IDE có thể tùy chỉnh theo mẫu.

### Phím tắt
| Tổ hợp phím | Chức năng |
| :--- | :--- |
| `Ctrl + Enter` | Nộp bài |
| `Ctrl + Shift + V` | Dán từ bộ nhớ đệm và nộp bài |
| `Ctrl + Shift + P` | Dán từ bộ nhớ đệm |
| `Ctrl + /` | Bật / tắt chú thích dòng |
| `Ctrl + F` | Tìm kiếm trong code |
| `F11` | Toàn màn hình |

### Tùy chỉnh định dạng tên
Truy cập cài đặt tiện ích để thiết lập định dạng tên file và tên bài gửi sang IDE bằng các biến mẫu:

| Biến | Nghĩa |
| :--- | :--- |
| `[id]` | Mã bài (ví dụ: `C01001`) |
| `[ten]` | Tên bài nguyên gốc |
| `[ten_kd]` | Tên bài không dấu |
| `[ten_gach]` | Tên bài không dấu, khoảng trắng thay bằng gạch dưới |
| `[ten_lien]` | Tên bài viết liền, viết hoa đầu mỗi từ |

Ví dụ: mẫu `[id]_[ten_lien]` cho bài "C01001 - TỔNG CỦA DÃY SỐ" sẽ ra `C01001_TongCuaDaySo`.

---

## Cài đặt

### Từ cửa hàng chính thức
- **Chrome**: [Chrome Web Store](https://chromewebstore.google.com/detail/codeptit/glnlkofhfeppcndeelhlenfcmlabbcdd)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/codeptit/)

### Cài thủ công (dành cho phát triển)
1. Tải và giải nén mã nguồn.
2. Truy cập `chrome://extensions/`, bật chế độ nhà phát triển.
3. Chọn "Tải tiện ích chưa đóng gói" và trỏ tới thư mục vừa giải nén.

---

## Sử dụng với Competitive Companion (tùy chọn)

Nếu muốn dùng Competitive Companion song song, cần thêm quy tắc tùy chỉnh trong cài đặt của Competitive Companion:

| Trường | Giá trị |
| :--- | :--- |
| Match URL | `^https://code\.ptit\.edu\.vn/(student/question\|beta/problems)/.*` |
| Parser | `CodeforcesProblemParser` |

---

## Thông tin tác giả

**Nguyễn Hoàng Đức Tâm** — B25DCCN523

- GitHub: [DucTamIT/codePTITplusplus](https://github.com/DucTamIT/codePTITplusplus)
- Facebook: [nguyenhoangductam](https://facebook.com/nguyenhoangductam)
- Email: tambmo22@gmail.com
