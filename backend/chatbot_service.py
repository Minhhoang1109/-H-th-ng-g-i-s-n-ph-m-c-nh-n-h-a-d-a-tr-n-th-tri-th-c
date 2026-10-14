import os
import re
import json

class ChatbotService:
    def __init__(self, graph_service):
        self.graph_service = graph_service

    def process_message(self, message, user_id=None, cart=None, context=None):
        """
        Processes a user message and returns a structured response with:
        - reply: markdown formatted text
        - products: list of recommended/matched products
        - suggested_replies: quick reply options for the user
        - action: automated action trigger (add_to_cart, checkout, clear_cart, view_cart)
        - order: created order data if order finalized
        """
        text = (message or "").strip().lower()
        cart = cart or []
        context = context or {}
        user = self.graph_service.get_user(user_id) if user_id else None

        # 1. GREETING & INTRO
        if self._is_greeting(text):
            user_name = user.get("name", "bạn") if user else "bạn"
            return {
                "reply": (
                    f"👋 **Xin chào {user_name}!** Tôi là **Trợ lý Mua Sắm Thông Minh (KG-Bot)**.\n\n"
                    "Tôi có thể hỗ trợ bạn tự động hóa toàn bộ quy trình mua sắm:\n"
                    "• 🔍 **Tư vấn cấu hình & sản phẩm** chuẩn xác dựa trên Đồ thị Tri thức (KG).\n"
                    "• 🛒 **Tự động thêm giỏ hàng & gợi ý phụ kiện tương thích**.\n"
                    "• ⚡ **Tự động hóa khâu chốt đơn & đặt hàng** chỉ trong vài giây!\n"
                    "• 📦 **Tra cứu đơn hàng & chính sách bảo hành**.\n\n"
                    "Bạn đang quan tâm đến dòng sản phẩm nào hôm nay?"
                ),
                "products": [],
                "suggested_replies": [
                    "💻 Tư vấn laptop lập trình",
                    "🎮 Gợi ý PC Gaming & RTX 4090",
                    "📱 Xem điện thoại Apple & Samsung",
                    "🛒 Kiểm tra giỏ hàng",
                    "⚡ Chốt đơn ngay"
                ]
            }

        # 2. CONFIRM ORDER CONFIRMATION FLOW (Xác nhận đặt hàng)
        if any(w in text for w in ["xác nhận", "xac nhan", "đồng ý đặt", "chốt luôn", "đồng ý mua", "giao đến"]):
            return self._finalize_order_from_text(user, cart, message)

        # 3. CHECKOUT / PLACE ORDER (KHÂU BẮT ĐẦU CHỐT ĐƠN)
        if any(w in text for w in ["chốt đơn", "chot don", "dat hang", "đặt hàng", "thanh toán", "thanh toan", "checkout", "mua ngay"]):
            return self._handle_checkout(user, cart, text)

        # 4. VIEW / CHECK CART
        if any(w in text for w in ["xem giỏ", "giỏ hàng", "gio hang", "trong giỏ", "tổng tiền", "tong tien"]):
            return self._handle_view_cart(cart)

        # 5. CLEAR CART
        if any(w in text for w in ["xóa giỏ", "xoa gio", "làm trống giỏ", "xóa hết"]):
            return {
                "reply": "🧹 Đã làm trống giỏ hàng theo yêu cầu của bạn. Bạn muốn tôi tư vấn sản phẩm mới nào không?",
                "products": [],
                "action": {"type": "clear_cart"},
                "suggested_replies": [
                    "💻 Laptop văn phòng mỏng nhẹ",
                    "🎮 PC Gaming tầm trung",
                    "🎧 Tai nghe chống ồn"
                ]
            }

        # 6. ORDER TRACKING / LỊCH SỬ ĐƠN
        if any(w in text for w in ["tra cứu đơn", "tra cuu don", "đơn hàng của tôi", "don hang cua toi", "lịch sử mua"]):
            return self._handle_order_tracking(user)

        # 7. ADD SPECIFIC PRODUCT TO CART FROM CHAT
        if text.startswith("thêm") or text.startswith("them") or "cho vào giỏ" in text or "mua cái này" in text:
            return self._handle_add_to_cart_query(text, cart)

        # 8. COMPATIBILITY & ACCESSORIES RECOMMENDATION
        if any(w in text for w in ["phụ kiện", "phu kien", "tương thích", "tuong thich", "mua kèm", "mua kem"]):
            return self._handle_compatibility_query(cart)

        # 9. POLICY / WARRANTY / SHIPPING FAQ
        if any(w in text for w in ["bảo hành", "bao hanh", "đổi trả", "doi tra", "vận chuyển", "van chuyen", "ship", "freeship"]):
            return self._handle_policy_faq(text)

        # 10. PRODUCT SEARCH / KG CONSULTATION (Mặc định: Phân tích nhu cầu & tìm kiếm trên Đồ thị)
        return self._search_products_kg(text, user)

    # ----------------------------------------------------
    # HELPER INTENT LOGIC
    # ----------------------------------------------------
    def _is_greeting(self, text):
        greetings = ["hi", "hello", "xin chào", "chào bot", "chao bot", "alo", "bot ơi", "bạn là ai", "chào bạn", "menu"]
        return any(text == g or text.startswith(g + " ") for g in greetings)

    def _handle_view_cart(self, cart):
        if not cart:
            return {
                "reply": (
                    "🛒 **Giỏ hàng của bạn hiện đang trống!**\n\n"
                    "Hãy để tôi gợi ý một số sản phẩm công nghệ đang được đánh giá cao trên Đồ thị Tri thức nhé:"
                ),
                "products": self._get_featured_products()[:3],
                "suggested_replies": [
                    "💻 Laptop bán chạy nhất",
                    "📱 Điện thoại cao cấp",
                    "🎮 Card màn hình RTX",
                    "🎧 Phụ kiện âm thanh"
                ]
            }

        total = sum((item.get("price", 0) * (item.get("quantity", 1))) for item in cart)
        item_lines = [
            f"• **{item.get('name')}** (x{item.get('quantity', 1)}): {self._format_price(item.get('price', 0) * item.get('quantity', 1))}"
            for item in cart
        ]

        # Check compatibility / cross-selling from KG
        accessories = self._get_compatible_accessories(cart)

        reply = (
            f"🛒 **Giỏ hàng hiện tại ({len(cart)} sản phẩm):**\n"
            + "\n".join(item_lines) + "\n\n"
            f"💰 **Tổng tạm tính:** <b style='color:#e53238; font-size:16px;'>{self._format_price(total)}</b>\n\n"
            "✨ *Bạn đã sẵn sàng để tôi tự động hóa hoàn tất đơn hàng này chưa?*"
        )

        return {
            "reply": reply,
            "products": accessories[:2] if accessories else [],
            "action": {"type": "view_cart"},
            "suggested_replies": [
                "⚡ Chốt đơn ngay",
                "➕ Xem phụ kiện mua kèm",
                "🧹 Xóa giỏ hàng",
                "🔍 Tìm thêm sản phẩm khác"
            ]
        }

    def _handle_checkout(self, user, cart, text):
        if not cart:
            return {
                "reply": (
                    "⚠️ **Giỏ hàng của bạn đang trống!**\n\n"
                    "Để tự động hóa chốt đơn, vui lòng chọn ít nhất một sản phẩm vào giỏ hàng trước nhé. "
                    "Bạn muốn tôi tìm kiếm sản phẩm gì cho bạn?"
                ),
                "products": self._get_featured_products()[:3],
                "suggested_replies": [
                    "💻 Tìm laptop lập trình",
                    "📱 Xem điện thoại mới",
                    "🎮 Card đồ họa RTX 4090"
                ]
            }

        total = sum((item.get("price", 0) * (item.get("quantity", 1))) for item in cart)

        # Pre-fill customer details from user profile if available
        customer = {
            "name": user.get("name", "") if user else "Khách Hàng K/H Store",
            "phone": user.get("phone", "") if user else "0912345678",
            "email": user.get("email", "") if user else "customer@example.com",
            "address": "TP. Biên Hòa, Đồng Nai (Giao hàng tận nơi)"
        }

        reply = (
            "🚀 **TỰ ĐỘNG HÓA QUY TRÌNH CHỐT ĐƠN (CHECKOUT ASSISTANT)**\n\n"
            f"Hệ thống đã chuẩn bị đơn hàng với **{len(cart)} sản phẩm**:\n"
            + "\n".join([f"• {it.get('name')} (x{it.get('quantity', 1)})" for it in cart[:4]])
            + ("\n• *(và các sản phẩm khác...)*" if len(cart) > 4 else "")
            + f"\n\n💰 **Tổng số tiền:** <b style='color:#e53238; font-size:16px;'>{self._format_price(total)}</b>\n"
            f"👤 **Người nhận:** {customer['name']}\n"
            f"📞 **Số điện thoại:** {customer['phone'] or '09xx xxx xxx'}\n"
            f"📍 **Địa chỉ nhận:** {customer['address']}\n"
            "💳 **Phương thức:** Thanh toán khi nhận hàng (COD) / Chuyển khoản QR\n\n"
            "👉 *Bạn có muốn tôi xác nhận tạo đơn hàng ngay lập tức không?*"
        )

        return {
            "reply": reply,
            "products": [],
            "action": {
                "type": "ready_to_checkout",
                "checkout_data": {
                    "total": total,
                    "customer": customer,
                    "items": cart
                }
            },
            "suggested_replies": [
                "✅ Xác nhận đặt hàng",
                "🛒 Xem lại giỏ hàng",
                "🔍 Mua thêm phụ kiện"
            ]
        }

    def _finalize_order_from_text(self, user, cart, raw_message):
        if not cart:
            return {
                "reply": "⚠️ Không có sản phẩm nào trong giỏ để đặt hàng. Hãy chọn sản phẩm trước bạn nhé!",
                "products": self._get_featured_products()[:2],
                "suggested_replies": ["💻 Laptop", "📱 Smartphone", "🎮 Linh kiện PC"]
            }

        uid = user.get("id", "u1") if user else "u1"
        total = sum((item.get("price", 0) * (item.get("quantity", 1))) for item in cart)
        customer = {
            "name": user.get("name", "Khách hàng") if user else "Khách hàng thân thiết",
            "phone": user.get("phone", "0909123456") if user else "0909123456",
            "email": user.get("email", "kh@example.com") if user else "kh@example.com",
            "address": "Số 10, Đường Huỳnh Văn Nghệ, P. Bửu Long, TP. Biên Hòa, Đồng Nai"
        }

        order = self.create_order(
            user_id=uid,
            items=cart,
            customer_info=customer,
            total_price=total,
            payment_method="COD (Thanh toán khi nhận hàng)"
        )

        reply = (
            "🎉 **ĐẶT HÀNG THÀNH CÔNG! ĐƠN HÀNG ĐÃ ĐƯỢC TỰ ĐỘNG XỬ LÝ**\n\n"
            f"🔖 **Mã đơn hàng:** <code style='font-size:14px; color:#2563eb;'>{order['id']}</code>\n"
            f"💰 **Tổng thanh toán:** <b style='color:#e53238;'>{self._format_price(total)}</b>\n"
            f"📦 **Số lượng sản phẩm:** {len(cart)} món\n"
            f"👤 **Khách hàng:** {customer['name']} ({customer['phone']})\n"
            f"🚚 **Địa chỉ nhận hàng:** {customer['address']}\n"
            f"⚡ **Trạng thái:** Đã ghi nhận & Đang chuẩn bị xuất kho\n\n"
            "🕸️ **Tối ưu hóa Đồ thị Tri thức:** Hệ thống đã tự động kết nối các cạnh `purchased` (trọng số 3.5) "
            "giữa tài khoản của bạn và các sản phẩm trên để cá nhân hóa chuẩn xác hơn cho các lần truy cập tiếp theo!\n\n"
            "Cảm ơn bạn đã tin tưởng mua sắm cùng K/H Store!"
        )

        return {
            "reply": reply,
            "products": [],
            "action": {
                "type": "order_completed",
                "order": order
            },
            "order": order,
            "suggested_replies": [
                "📦 Tra cứu đơn hàng vừa đặt",
                "🛡️ Chính sách bảo hành",
                "🔍 Tiếp tục mua sắm"
            ]
        }

    def _handle_add_to_cart_query(self, text, cart):
        products = self.graph_service.get_products()
        matched = None

        # Clean search term
        clean_text = re.sub(r'^(thêm|them|cho vào giỏ|cho vao gio|mua)\s+', '', text).strip()

        # Find best matching product
        for p in products:
            p_name = p.get("name", "").lower()
            p_id = p.get("id", "").lower()
            if clean_text in p_name or p_id == clean_text or clean_text in p_id:
                matched = p
                break

        if not matched and clean_text:
            # Fuzzy word match
            words = [w for w in clean_text.split() if len(w) > 2]
            for p in products:
                p_name = p.get("name", "").lower()
                if any(w in p_name for w in words):
                    matched = p
                    break

        if matched:
            accessories = []
            for b_name in matched.get("bought_together_items", []):
                for p in products:
                    if p.get("name") == b_name and p.get("id") != matched.get("id"):
                        accessories.append(p)

            reply = (
                f"✅ **Đã tự động thêm vào giỏ hàng:**\n"
                f"📦 **{matched.get('name')}** - Giá: **{self._format_price(matched.get('price', 0))}**\n\n"
                f"💡 *Phân tích Đồ thị Tri thức:* Khách hàng quan tâm sản phẩm này thường mua kèm các phụ kiện tương thích bên dưới. "
                "Bạn có muốn thêm vào giỏ hoặc chốt đơn ngay không?"
            )

            return {
                "reply": reply,
                "products": accessories[:2],
                "action": {
                    "type": "add_to_cart",
                    "product": matched
                },
                "suggested_replies": [
                    "⚡ Chốt đơn ngay",
                    "🛒 Xem giỏ hàng",
                    "➕ Xem thêm phụ kiện khác"
                ]
            }

        return {
            "reply": f"Tôi chưa tìm thấy chính xác sản phẩm \"{clean_text}\" để thêm vào giỏ. Bạn có thể tham khảo các sản phẩm nổi bật sau hoặc nhập tên cụ thể hơn nhé:",
            "products": self._get_featured_products()[:3],
            "suggested_replies": [
                "💻 MacBook Pro M3",
                "🎮 RTX 4090",
                "📱 iPhone 16 Pro Max"
            ]
        }

    def _handle_compatibility_query(self, cart):
        if not cart:
            return {
                "reply": "💡 Để tư vấn phụ kiện tương thích chuẩn xác, bạn hãy thêm sản phẩm chính (như Laptop hoặc PC) vào giỏ trước nhé!",
                "products": self._get_featured_products()[:2],
                "suggested_replies": ["💻 Chọn Laptop", "🎮 Chọn Linh kiện PC"]
            }

        accessories = self._get_compatible_accessories(cart)
        if accessories:
            return {
                "reply": (
                    "🔗 **Phụ kiện tương thích trên Đồ thị Tri thức (KG Compatibility):**\n\n"
                    "Dựa trên các sản phẩm hiện có trong giỏ hàng, thuật toán phân tích liên kết `bought_together` "
                    "và `compatible_with` gợi ý các phụ kiện sau để tối ưu hóa trải nghiệm của bạn:"
                ),
                "products": accessories[:3],
                "suggested_replies": [
                    "⚡ Chốt đơn giỏ hàng hiện tại",
                    "🛒 Xem lại giỏ hàng"
                ]
            }
        else:
            return {
                "reply": "Các sản phẩm trong giỏ hàng của bạn đã rất hoàn thiện! Bạn có thể tiến hành chốt đơn ngay.",
                "products": [],
                "suggested_replies": ["⚡ Chốt đơn ngay", "🛒 Xem giỏ hàng"]
            }

    def _handle_order_tracking(self, user):
        if not user:
            return {
                "reply": "Bạn vui lòng đăng nhập tài khoản để tra cứu lịch sử các đơn hàng đã đặt nhé!",
                "products": [],
                "suggested_replies": ["🔑 Đăng nhập", "🛒 Xem giỏ hàng"]
            }

        orders = user.get("orders", [])
        if not orders:
            return {
                "reply": (
                    f"📦 **Chào {user.get('name', 'bạn')}:** Hiện tại bạn chưa có đơn hàng nào trước đó.\n"
                    "Hãy chọn những sản phẩm ưng ý và yêu cầu tôi hỗ trợ chốt đơn ngay nhé!"
                ),
                "products": self._get_featured_products()[:2],
                "suggested_replies": ["💻 Xem Laptop", "📱 Xem Điện thoại", "🎮 Xem PC"]
            }

        recent = orders[-3:]
        lines = []
        for o in reversed(recent):
            lines.append(
                f"• **Mã đơn:** `{o.get('id')}` | **Tổng:** {self._format_price(o.get('total', 0))} | **Trạng thái:** `{o.get('status', 'Đang vận chuyển')}`"
            )

        reply = (
            f"📦 **Lịch sử đơn hàng của bạn ({len(orders)} đơn):**\n\n"
            + "\n".join(lines) + "\n\n"
            "Mọi đơn hàng đều được kiểm tra kỹ lưỡng và bảo hành chính hãng 100%."
        )

        return {
            "reply": reply,
            "products": [],
            "suggested_replies": ["⚡ Mua thêm sản phẩm mới", "🛒 Xem giỏ hàng"]
        }

    def _handle_policy_faq(self, text):
        if "bảo hành" in text or "bao hanh" in text:
            reply = (
                "🛡️ **CHÍNH SÁCH BẢO HÀNH K/H STORE:**\n\n"
                "• **100% Sản phẩm chính hãng:** Bảo hành từ 12 đến 36 tháng tùy linh kiện.\n"
                "• **Lỗi 1 đổi 1:** Trong vòng 30 ngày đầu nếu phát sinh lỗi phần cứng từ nhà sản xuất.\n"
                "• **Hỗ trợ trọn đời:** Cài đặt phần mềm, vệ sinh máy và tra keo tản nhiệt miễn phí.\n\n"
                "Bạn cần hỗ trợ bảo hành cho thiết bị cụ thể nào không?"
            )
        elif "vận chuyển" in text or "ship" in text or "freeship" in text:
            reply = (
                "🚚 **CHÍNH SÁCH GIAO HÀNG & VẬN CHUYỂN:**\n\n"
                "• **Freeship toàn quốc:** Áp dụng cho mọi đơn hàng giá trị từ 500.000 ₫ trở lên.\n"
                "• **Giao hỏa tốc 2 giờ:** Khu vực TP. Hồ Chí Minh & TP. Biên Hòa.\n"
                "• **Đồng kiểm khi nhận hàng:** Được mở hộp kiểm tra thiết bị trước khi thanh toán."
            )
        else:
            reply = (
                "🔄 **CHÍNH SÁCH ĐỔI TRẢ & THANH TOÁN:**\n\n"
                "• Đổi trả miễn phí trong 15 ngày nếu sản phẩm còn nguyên hộp seal.\n"
                "• Hỗ trợ đa dạng phương thức: COD tiền mặt, Chuyển khoản QR, Thẻ Visa/Mastercard, Trả góp 0%."
            )

        return {
            "reply": reply,
            "products": [],
            "suggested_replies": [
                "🛒 Xem giỏ hàng",
                "💻 Tư vấn laptop",
                "⚡ Chốt đơn ngay"
            ]
        }

    # ----------------------------------------------------
    # KNOWLEDGE GRAPH PRODUCT SEARCH & RECOMMENDATION
    # ----------------------------------------------------
    def _search_products_kg(self, text, user):
        products = self.graph_service.get_products()
        scored_products = []

        # Detect category keywords
        cat_keywords = {
            "c_laptop": ["laptop", "máy tính xách tay", "macbook", "zenbook", "thinkpad", "notebook"],
            "c_phone": ["điện thoại", "phone", "smartphone", "iphone", "galaxy"],
            "c_component": ["pc", "linh kiện", "vga", "card", "cpu", "gpu", "ram", "rtx", "intel", "core i"],
            "c_accessory": ["phụ kiện", "chuột", "bàn phím", "phim co", "pad", "sac", "cáp"],
            "c_audio": ["tai nghe", "headphone", "audio", "loa", "airpods", "wh-1000xm"]
        }

        # Detect brand keywords
        brand_keywords = {
            "b_apple": ["apple", "macbook", "iphone", "ipad"],
            "b_asus": ["asus", "rog", "tuf", "zenbook"],
            "b_samsung": ["samsung", "galaxy"],
            "b_dell": ["dell", "xps", "alienware"],
            "b_nvidia": ["nvidia", "geforce", "rtx"],
            "b_sony": ["sony"],
            "b_logitech": ["logitech"],
            "b_intel": ["intel"],
            "b_corsair": ["corsair"]
        }

        # Detect tag keywords
        tag_keywords = {
            "t_gaming": ["gaming", "game", "chơi game", "esport", "fps"],
            "t_dohoa": ["đồ họa", "do hoa", "render", "3d", "photoshop", "thiết kế"],
            "t_laptrinh": ["lập trình", "lap trinh", "code", "dev", "developer", "cntt"],
            "t_vanphong": ["văn phòng", "van phong", "học tập", "hoc tap", "mỏng nhẹ"],
            "t_caocap": ["cao cấp", "flagship", "sang trọng", "vip", "mạnh nhất"],
            "t_chongon": ["chống ồn", "chong on", "anc"]
        }

        # Budget filters
        min_price = 0
        max_price = float('inf')

        if "dưới 15" in text or "duoi 15" in text:
            max_price = 15000000
        elif "15 đến 30" in text or "15-30" in text or "tầm 20" in text or "khoảng 20" in text:
            min_price = 14000000
            max_price = 31000000
        elif "trên 30" in text or "tren 30" in text or "cao cấp" in text:
            min_price = 30000000

        # Exact price extraction e.g. "20tr", "10 triệu"
        price_match = re.search(r'(\d+)\s*(tr|triệu|trieu)', text)
        if price_match:
            val = int(price_match.group(1)) * 1000000
            min_price = max(0, val - 7000000)
            max_price = val + 7000000

        for p in products:
            p_name = p.get("name", "").lower()
            p_desc = p.get("description", "").lower()
            p_price = p.get("price", 0)
            score = 0
            match_reasons = []

            # Price constraint check
            if p_price < min_price or p_price > max_price:
                continue

            # Category matching
            for cat_id, kws in cat_keywords.items():
                if any(kw in text for kw in kws):
                    if any(cat_name.lower() in [c.lower() for c in p.get("categories", [])] for cat_name in kws):
                        score += 35
                        match_reasons.append("Khớp danh mục tìm kiếm")

            # Brand matching
            for brand_id, kws in brand_keywords.items():
                if any(kw in text for kw in kws):
                    if any(kw in b.lower() for b in p.get("brands", []) for kw in kws):
                        score += 30
                        match_reasons.append("Thương hiệu chính xác")

            # Tag matching
            for tag_id, kws in tag_keywords.items():
                if any(kw in text for kw in kws):
                    if any(kw in t.lower() for t in p.get("tags", []) for kw in kws):
                        score += 25
                        match_reasons.append("Phù hợp mục đích sử dụng")

            # Textual match in title & description
            query_words = [w for w in text.split() if len(w) > 2]
            for w in query_words:
                if w in p_name:
                    score += 15
                elif w in p_desc:
                    score += 8

            # User KG preference bonus
            if user:
                user_need = (user.get("last_target_need") or "").lower()
                if user_need and any(w in p_name for w in user_need.split()):
                    score += 20
                    match_reasons.append("Khớp nhu cầu mục tiêu người dùng (Trọng số 4.0)")

            if score > 0:
                p_copy = dict(p)
                p_copy["match_score"] = score
                p_copy["kg_reason"] = " • ".join(list(set(match_reasons))[:2]) or "Tối ưu từ liên kết Đồ thị Tri thức"
                scored_products.append(p_copy)

        scored_products.sort(key=lambda x: x["match_score"], reverse=True)
        top_products = scored_products[:3]

        if top_products:
            reply = (
                f"🎯 **Tôi đã tra cứu Đồ thị Tri thức và tìm thấy {len(top_products)} sản phẩm phù hợp nhất với yêu cầu của bạn:**\n\n"
                "Bạn có thể bấm **🛒 Thêm vào giỏ** hoặc **⚡ Mua ngay** bên dưới mỗi sản phẩm để tôi tự động hóa quy trình đặt hàng nhé!"
            )
            return {
                "reply": reply,
                "products": top_products,
                "suggested_replies": [
                    "⚡ Chốt đơn ngay",
                    "🛒 Xem giỏ hàng",
                    "➕ Xem thêm phụ kiện tương thích"
                ]
            }
        else:
            featured = self._get_featured_products()[:3]
            return {
                "reply": (
                    f"🤔 Tôi chưa tìm thấy sản phẩm hoàn toàn khớp với từ khóa \"{text}\" trong tầm giá yêu cầu.\n\n"
                    "Dưới đây là một số thiết bị công nghệ tiêu biểu nhất trên hệ thống bạn có thể cân nhắc:"
                ),
                "products": featured,
                "suggested_replies": [
                    "💻 Laptop bán chạy",
                    "📱 iPhone & Flagship",
                    "🎮 PC Gaming & VGA"
                ]
            }

    def _get_featured_products(self):
        prods = self.graph_service.get_products()
        prods.sort(key=lambda x: (x.get("rating", 0), x.get("price", 0)), reverse=True)
        return prods

    def _get_compatible_accessories(self, cart):
        if not cart:
            return []
        products = self.graph_service.get_products()
        cart_ids = {it.get("id") for it in cart}
        acc_names = set()

        for item in cart:
            p_obj = self.graph_service.get_product(item.get("id"))
            if p_obj:
                for b_name in p_obj.get("bought_together_items", []):
                    acc_names.add(b_name.lower())

        compatible = []
        for p in products:
            if p.get("id") not in cart_ids and p.get("name", "").lower() in acc_names:
                compatible.append(p)

        # Fallback to accessory/audio category if not found
        if not compatible:
            for p in products:
                if p.get("id") not in cart_ids:
                    cats = [c.lower() for c in p.get("categories", [])]
                    if any("phụ kiện" in c or "tai nghe" in c for c in cats):
                        compatible.append(p)
                        if len(compatible) >= 3:
                            break

        return compatible

    def create_order(self, user_id, items, customer_info, total_price, payment_method="COD"):
        order_id = f"DH-{os.urandom(3).hex().upper()}"
        order = {
            "id": order_id,
            "user_id": user_id,
            "items": items,
            "customer": customer_info,
            "total": total_price,
            "payment_method": payment_method,
            "status": "Đã tiếp nhận (Đang chuẩn bị hàng)",
            "timestamp": "Vừa xong"
        }

        # Reinforce Knowledge Graph: Add 'purchased' edges with weight 3.5
        for item in items:
            prod_id = item.get("id") if isinstance(item, dict) else item
            if prod_id in self.graph_service.graph:
                try:
                    self.graph_service.add_interaction(user_id, prod_id, "purchased")
                except Exception:
                    pass

        # Save order to user node
        if user_id in self.graph_service.graph and self.graph_service.graph.nodes[user_id].get("type") == "User":
            node = self.graph_service.graph.nodes[user_id]
            if "orders" not in node or not isinstance(node["orders"], list):
                node["orders"] = []
            node["orders"].append(order)

        self.graph_service.save_graph()
        return order

    def _format_price(self, price):
        try:
            return f"{int(price):,} ₫".replace(",", ".")
        except Exception:
            return f"{price} ₫"
