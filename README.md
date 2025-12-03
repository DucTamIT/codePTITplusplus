# CodePTIT++ Extension

## Giới thiệu (Introduction)

Là một sinh viên D25CNTT, thay vì ngồi code 300 bài thiếu nhi, do "ngứa tay" nên mình đã thiết kế (với sự trợ giúp của AI) extension **CodePTIT++**. Extension này sinh ra để giải quyết những bất tiện mình gặp phải khi sử dụng CodePTIT:

*(As a D25 IT student, instead of grinding through 300 beginner problems, I got "itchy hands" and designed (with AI help) **CodePTIT++**. This extension aims to solve some inconveniences I faced while using CodePTIT:)*

## Tính năng nổi bật (Features)

1.  **Dán và Nộp bài (Paste & Submit)**:
    *   Thêm nút "Dán và Nộp bài" giúp bạn nộp code trực tiếp từ clipboard mà không cần lưu file rồi chọn file thủ công.
    *   *(Adds a "Paste & Submit" button to submit code directly from clipboard without saving and selecting files manually.)*

2.  **Copy Input/Output thông minh (Smart Copy)**:
    *   Thêm nút Copy vào các bảng Input/Output.
    *   Tự động loại bỏ các dòng trống thừa (extra newlines) khi copy, giúp test case chuẩn hơn.
    *   *(Adds Copy buttons to Input/Output tables. Automatically removes extra newlines for cleaner test cases.)*

3.  **Hỗ trợ Competitive Companion**:
    *   Tự động parse đề bài, test case, giới hạn thời gian/bộ nhớ vào các IDE như VS Code (dùng CPH), CP Editor, CLion,...
    *   *(Automatically parses problem statement, test cases, time/memory limits to IDEs like VS Code, CP Editor, CLion,...)*

4.  **Tùy chỉnh định dạng tên file (Filename Formatting)**:
    *   Tự động tạo tên file chuẩn khi dùng "Dán và Nộp bài" hoặc "Copy tên file".
    *   Hỗ trợ các định dạng:
        *   **Tên (TEN_BAI)**: `GIA_TRI_TRUNG_BINH_CUA_MANG`
        *   **ID + Tên (C001_TEN_BAI)**: `C001_GIA_TRI_TRUNG_BINH_CUA_MANG`
        *   **ID (C001)**: `C001`
        *   **Viết liền (TenBai)**: `GiaTriTrungBinhCuaMang` (CamelCase)
        *   **ID + Viết liền (C001_TenBai)**: `C001_GiaTriTrungBinhCuaMang`

5.  **Tùy chỉnh tên bài gửi IDE (Competitive Companion Name)**:
    *   Tách biệt cấu hình tên file và tên bài hiển thị trong IDE.
    *   Hỗ trợ:
        *   **ID**: `C001`
        *   **ID - Tên gốc**: `C001 - GIÁ TRỊ TRUNG BÌNH CỦA MẢNG`
        *   **ID - Tên gốc (xoá dấu)**: `C001 - GIA TRI TRUNG BINH CUA MANG`

6.  **Nút Copy tên file**:
    *   Nút nhỏ bên cạnh tên bài để copy nhanh tên file theo định dạng đã chọn.

## Cài đặt (Installation)

Do extension chưa được đưa lên Chrome Web Store, bạn cần cài đặt thủ công:

1.  Tải source code về máy và giải nén (nếu là file zip).
2.  Mở Chrome (hoặc Edge/Brave), truy cập `chrome://extensions/`.
3.  Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4.  Chọn **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục chứa extension vừa giải nén.

*(Since it's not on Chrome Web Store yet, please install manually:*
*1. Download and extract the source code.*
*2. Go to `chrome://extensions/`.*
*3. Enable **Developer mode**.*
*4. Click **Load unpacked** and select the extension folder.)*

## Hướng dẫn config Competitive Companion

Để extension hoạt động với Competitive Companion, bạn cần cấu hình như sau:

1.  Cài đặt extension **Competitive Companion** trên trình duyệt.
2.  Mở trang quản lý Extension, tìm **Competitive Companion** -> **Details** (Chi tiết) -> **Extension options** (Tùy chọn tiện ích).
3.  Ở mục "**Custom rules**", dán đoạn regex sau vào cột **Match URL**:
    ```regex
    ^https://code\.ptit\.edu\.vn/(student/question|beta/problems)/.*
    ```
4.  Ở cột bên cạnh (**Parser**), chọn **CodeforcesProblemParser**.
   
## Đóng góp (Contribution)

Extension được phát triển với mục đích học tập và chia sẻ. Nếu có lỗi hoặc ý tưởng mới, hãy tạo Pull Request hoặc liên hệ tác giả.

**Author**: Nguyen Hoang Duc Tam (B25DCCN523)
