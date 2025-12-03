# CodePTIT++ Extension

## Giới thiệu (Introduction)
Extension hỗ trợ làm bài trên **CodePTIT** tiện lợi hơn: nộp bài nhanh, copy thông minh và tích hợp **Competitive Companion**.

*(Enhances CodePTIT experience: quick submit, smart copy, and Competitive Companion integration.)*

## Tính năng (Features)
*   **Dán và Nộp bài (Paste & Submit)**: Nộp code trực tiếp từ clipboard.
*   **Smart Copy**: Copy Input/Output chuẩn, tự động xóa dòng thừa.
*   **Filename Formatting**: Tự động đặt tên file theo ID, Tên bài (CamelCase, SnakeCase...).
*   **Competitive Companion**: Parse đề bài vào VS Code, CP Editor...

## Cài đặt (Installation)
1.  Tải và giải nén source code.
2.  Truy cập `chrome://extensions/`, bật **Developer mode**.
3.  Chọn **Load unpacked** và trỏ tới thư mục extension.

## Cấu hình (Configuration)
Nếu bạn muốn sử dụng Competitive Companion với codePTIT++, bạn **CẦN** cấu hình Competitive Companion như sau:

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
