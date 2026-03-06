# CodePTIT++ Extension

## Giới thiệu (Introduction)
Extension hỗ trợ làm bài trên **CodePTIT** tiện lợi hơn: nộp bài nhanh, copy thông minh, gửi đề trực tiếp đến IDE.

*(Enhances CodePTIT experience: quick submit, smart copy, and direct Send to IDE.)*

## Tính năng (Features)
*   **Dán và Nộp bài (Paste & Submit)**: Nộp code trực tiếp từ clipboard.
*   **Smart Copy**: Copy Input/Output chuẩn, tự động xóa dòng thừa.
*   **Filename Formatting**: Tự động đặt tên file theo ID, Tên bài (CamelCase, SnakeCase...).
*   **🚀 Send to IDE**: Gửi đề bài trực tiếp đến CP Editor, CPH (VS Code), v.v. **không cần Competitive Companion**.
*   **Keyboard Shortcuts**: `Ctrl+Shift+V` (Dán & Nộp), `Ctrl+Shift+C` (Copy tên file), `Ctrl+Shift+P` (Send to IDE).

## Cài đặt (Installation)

### Từ Store
- **Chrome**: [Chrome Web Store](https://chromewebstore.google.com/detail/codeptit/glnlkofhfeppcndeelhlenfcmlabbcdd)
- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/codeptit/)

### Thủ công (Manual)
1.  Tải và giải nén source code.
2.  Truy cập `chrome://extensions/`, bật **Developer mode**.
3.  Chọn **Load unpacked** và trỏ tới thư mục extension.

## Cấu hình (Configuration)

### 🚀 Send to IDE (Khuyến nghị / Recommended)
Nhấn nút **🚀 Send to IDE** trên trang bài tập để gửi đề trực tiếp đến IDE.

Mặc định gửi đến các port: `27121` (CPH), `10045` (CP Editor), `10043` (Caide).

Có thể cấu hình port trong **Extension popup > IDE Ports**.

> **Không cần cài Competitive Companion!**

### Competitive Companion (Tùy chọn)
Nếu bạn vẫn muốn sử dụng Competitive Companion, bạn **CẦN** cấu hình như sau:

1.  Mở **Extension options** của Competitive Companion.
2.  Trong mục **Custom rules**, thêm:

| Match URL | Parser |
| :--- | :--- |
| `^https://code\.ptit\.edu\.vn/(student/question\|beta/problems)/.*` | `CodeforcesProblemParser` |

**Copy Regex:**
```regex
^https://code\.ptit\.edu\.vn/(student/question|beta/problems)/.*
```

## Đóng góp (Contribution)
**Author**: Nguyen Hoang Duc Tam (B25DCCN523)
