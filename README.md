# Hệ thống Gợi ý Thiết bị Điện tử & Linh kiện dựa trên Đồ thị Tri thức (KG-RecSys Electronics)

> **Học phần:** Phát triển ứng dụng (Đề tài DT014)  
> **Sinh viên:** Trần Minh Hoàng (MSSV: 123001183)  
> **GVHD:** ThS. Phan Mạnh Thường  
> **Trường:** Đại học Lạc Hồng (LHU)

---

## 1. Giới thiệu Đề tài
Dự án tập trung chuyên sâu vào lĩnh vực **Thiết bị điện tử, Laptop, Điện thoại thông minh, Linh kiện PC (CPU, GPU, RAM, SSD, Mainboard, Nguồn) và Phụ kiện ngoại vi**.
Hệ thống sử dụng **Đồ thị tri thức (Knowledge Graph)** làm lõi suy luận để giải quyết các bài toán lớn của thương mại điện tử công nghệ:
1. **Gợi ý Bán chéo & Tương thích phần cứng (Compatibility & Cross-selling):** Khai thác các chuỗi liên kết meta-path (ví dụ: CPU Intel i9 ➔ tương thích Bo mạch chủ ASUS Z790 ➔ RAM Corsair DDR5; Card đồ họa RTX 4080 ➔ đi kèm Nguồn Corsair RM850x công suất thực).
2. **Khảo sát Nhu cầu Người dùng (User Preference Survey):** Thu thập mục đích sử dụng (Gaming, Đồ họa 3D, Lập trình, Văn phòng), thương hiệu và ngân sách để ánh xạ tức thì vào Đồ thị tri thức.
3. **Khắc phục Khởi động lạnh (Cold-Start Problem):** Đề xuất chuẩn xác cho khách hàng mới ngay sau khi chọn 1-2 sở thích ban đầu.
4. **Giải thích Gợi ý Minh bạch (Explainable AI - XAI):** Mỗi sản phẩm đều có giải thích tự nhiên bằng tiếng Việt và chuỗi suy luận tri thức cụ thể.

---

## 2. Các Phân Hệ Trên Giao Diện

1. ✨ **Gợi ý Cá nhân hóa (Recommendations):**
   - Danh sách sản phẩm điện tử, laptop, linh kiện được xếp hạng theo thuật toán (*Hybrid*, *Personalized PageRank*, *Meta-path*).
   - Hiển thị ảnh thực tế, mức giá VND, đánh giá sao, điểm tương thích (% Match) và huy hiệu lý do.
   - Các nút tương tác: "❤️ Thích", "🛒 Đã mua", "🔍 Giải thích lý do".
2. 📋 **Khảo sát Người dùng (User Survey & Feedback):**
   - Khảo sát 5 bước về nhu cầu công nghệ, thương hiệu ưa thích, ngân sách dự kiến.
   - Phần đánh giá trải nghiệm thực nghiệm (hệ thống đánh giá 5 sao ⭐, khả năng giải thích, đóng góp ý kiến).
   - Thống kê cộng đồng theo thời gian thực (Điểm CSAT trung bình, tổng lượt khảo sát).
3. ❄️ **Thử nghiệm Khởi động lạnh (Cold-Start Simulator):**
   - Tạo hồ sơ khách hàng mới không có lịch sử mua hàng, chọn sở thích và kiểm chứng thuật toán KG đề xuất chính xác ngay lập tức.
4. 📊 **Thống kê Đồ thị & Thuật toán (Analytics):**
   - Thống kê số lượng thực thể, số cạnh quan hệ và chi tiết nguyên lý hoạt động của các thuật toán.

---

## 3. Hướng Dẫn Chạy Ứng Dụng

- **Cách 1 (1 Click):** Nhấp đúp chuột vào file `start.bat`.
- **Cách 2 (Terminal):**
  ```bash
  python run.py
  ```

Hệ thống sẽ khởi động máy chủ và tự động mở trình duyệt web tại: **`http://127.0.0.1:5000`**.
