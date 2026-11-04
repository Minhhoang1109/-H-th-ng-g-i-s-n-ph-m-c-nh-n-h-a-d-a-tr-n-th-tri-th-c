import os
import json
from datetime import datetime

PAYMENT_SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "graph", "payment_settings.json")

DEFAULT_SETTINGS = {
    "bank_accounts": [
        {
            "id": "acc_mb_01",
            "bank_id": "MB",
            "bank_name": "MB Bank (Ngân hàng Quân Đội)",
            "account_number": "0909123456",
            "account_name": "K/H STORE OFFICIAL",
            "branch": "Chi nhánh Đồng Nai",
            "is_active": True,
            "is_default": True,
            "created_at": "2026-10-19"
        },
        {
            "id": "acc_vcb_02",
            "bank_id": "VCB",
            "bank_name": "Vietcombank (Ngoại Thương)",
            "account_number": "1012345678",
            "account_name": "K/H STORE OFFICIAL",
            "branch": "Chi nhánh Biên Hòa",
            "is_active": False,
            "is_default": False,
            "created_at": "2026-10-19"
        }
    ],
    "payment_codes": [
        {
            "id": "code_khtrian",
            "code": "KHTRIAN100K",
            "discount_type": "fixed",
            "discount_value": 100000,
            "min_order_amount": 500000,
            "max_discount": 100000,
            "expires_at": "2026-12-31",
            "is_active": True,
            "usage_count": 0,
            "description": "Mã tri ân khách hàng - Giảm 100.000 ₫ cho đơn từ 500.000 ₫"
        },
        {
            "id": "code_khvip",
            "code": "KHVIP5",
            "discount_type": "percent",
            "discount_value": 5,
            "min_order_amount": 1000000,
            "max_discount": 500000,
            "expires_at": "2026-12-31",
            "is_active": True,
            "usage_count": 0,
            "description": "Ưu đãi khách hàng VIP - Giảm 5% tối đa 500.000 ₫ cho đơn từ 1.000.000 ₫"
        },
        {
            "id": "code_freeship",
            "code": "FREESHIP",
            "discount_type": "fixed",
            "discount_value": 30000,
            "min_order_amount": 0,
            "max_discount": 30000,
            "expires_at": "2026-12-31",
            "is_active": True,
            "usage_count": 0,
            "description": "Hỗ trợ phí vận chuyển hỏa tốc toàn quốc"
        }
    ]
}

class PaymentService:
    def __init__(self, filepath=PAYMENT_SETTINGS_FILE):
        self.filepath = filepath
        self.settings = self._load_settings()

    def _load_settings(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "bank_accounts" in data and "payment_codes" in data:
                        return data
            except Exception as e:
                print(f"Error loading payment settings: {e}")
        
        # Save and return default settings
        self._save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS

    def _save_settings(self, data=None):
        if data is None:
            data = self.settings
        try:
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            with open(self.filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving payment settings: {e}")

    def get_settings(self):
        active_account = self.get_active_bank_account()
        return {
            "bank_accounts": self.settings.get("bank_accounts", []),
            "payment_codes": self.settings.get("payment_codes", []),
            "gemini_config": self.settings.get("gemini_config", {
                "api_key": "",
                "model": "gemini-1.5-flash",
                "is_enabled": True,
                "temperature": 0.7
            }),
            "active_bank_account": active_account
        }

    def update_gemini_config(self, config_data):
        cfg = self.settings.setdefault("gemini_config", {})
        if "api_key" in config_data:
            key_val = config_data["api_key"].strip()
            # If the user sends back the masked key, preserve existing key; otherwise update
            if not ("..." in key_val and len(key_val) < 25):
                cfg["api_key"] = key_val
        if "model" in config_data:
            cfg["model"] = config_data["model"].strip() or "gemini-1.5-flash"
        if "is_enabled" in config_data:
            cfg["is_enabled"] = bool(config_data["is_enabled"])
        if "temperature" in config_data:
            try:
                cfg["temperature"] = float(config_data["temperature"])
            except:
                pass
        self._save_settings()
        return cfg

    def get_active_bank_account(self):
        accounts = self.settings.get("bank_accounts", [])
        for acc in accounts:
            if acc.get("is_default") and acc.get("is_active"):
                return acc
        for acc in accounts:
            if acc.get("is_active"):
                return acc
        return accounts[0] if accounts else None

    # ----------------------------------------------------
    # BANK ACCOUNTS MANAGEMENT
    # ----------------------------------------------------
    def add_or_update_bank_account(self, data):
        accounts = self.settings.setdefault("bank_accounts", [])
        acc_id = data.get("id")
        
        bank_id = (data.get("bank_id") or "MB").strip().upper()
        bank_name = (data.get("bank_name") or "MB Bank").strip()
        account_number = (data.get("account_number") or "").strip()
        account_name = (data.get("account_name") or "K/H STORE OFFICIAL").strip().upper()
        branch = (data.get("branch") or "Toàn quốc").strip()
        is_default = bool(data.get("is_default", False))
        is_active = bool(data.get("is_active", True))

        if not account_number:
            raise ValueError("Số tài khoản không được để trống!")

        if is_default:
            for acc in accounts:
                acc["is_default"] = False

        account_item = None
        if acc_id:
            for acc in accounts:
                if acc["id"] == acc_id:
                    acc["bank_id"] = bank_id
                    acc["bank_name"] = bank_name
                    acc["account_number"] = account_number
                    acc["account_name"] = account_name
                    acc["branch"] = branch
                    acc["is_active"] = is_active
                    acc["is_default"] = is_default
                    account_item = acc
                    break

        if not account_item:
            acc_id = f"acc_{bank_id.lower()}_{os.urandom(2).hex()}"
            account_item = {
                "id": acc_id,
                "bank_id": bank_id,
                "bank_name": bank_name,
                "account_number": account_number,
                "account_name": account_name,
                "branch": branch,
                "is_active": is_active,
                "is_default": is_default or (len(accounts) == 0),
                "created_at": datetime.now().strftime("%Y-%m-%d")
            }
            accounts.append(account_item)

        self._save_settings()
        return account_item

    def set_active_bank_account(self, account_id):
        accounts = self.settings.get("bank_accounts", [])
        found = False
        for acc in accounts:
            if acc["id"] == account_id:
                acc["is_active"] = True
                acc["is_default"] = True
                found = True
            else:
                acc["is_default"] = False
        if not found:
            raise ValueError("Không tìm thấy tài khoản ngân hàng!")
        self._save_settings()
        return self.get_active_bank_account()

    def delete_bank_account(self, account_id):
        accounts = self.settings.get("bank_accounts", [])
        if len(accounts) <= 1:
            raise ValueError("Hệ thống cần duy trì ít nhất 1 tài khoản nhận tiền thanh toán!")
        
        self.settings["bank_accounts"] = [acc for acc in accounts if acc["id"] != account_id]
        # If deleted account was default, set first remaining as default
        remaining = self.settings["bank_accounts"]
        if remaining and not any(acc.get("is_default") for acc in remaining):
            remaining[0]["is_default"] = True
            remaining[0]["is_active"] = True

        self._save_settings()
        return True

    # ----------------------------------------------------
    # PAYMENT / PROMO CODES MANAGEMENT
    # ----------------------------------------------------
    def add_or_update_payment_code(self, data):
        codes = self.settings.setdefault("payment_codes", [])
        code_id = data.get("id")
        code_str = (data.get("code") or "").strip().upper()
        discount_type = data.get("discount_type", "fixed") # 'fixed' or 'percent'
        
        try:
            discount_value = float(data.get("discount_value", 0))
        except (ValueError, TypeError):
            discount_value = 0
            
        try:
            min_order_amount = float(data.get("min_order_amount", 0))
        except (ValueError, TypeError):
            min_order_amount = 0

        try:
            max_discount = float(data.get("max_discount", 0)) if data.get("max_discount") else None
        except (ValueError, TypeError):
            max_discount = None

        expires_at = data.get("expires_at") or "2026-12-31"
        is_active = bool(data.get("is_active", True))
        description = (data.get("description") or f"Mã ưu đãi {code_str}").strip()

        if not code_str:
            raise ValueError("Mã thanh toán không được để trống!")
        if discount_value <= 0:
            raise ValueError("Giá trị giảm giá phải lớn hơn 0!")
        if discount_type == "percent" and discount_value > 100:
            raise ValueError("Giảm giá theo phần trăm không được vượt quá 100%!")

        code_item = None
        if code_id:
            for item in codes:
                if item["id"] == code_id:
                    item["code"] = code_str
                    item["discount_type"] = discount_type
                    item["discount_value"] = discount_value
                    item["min_order_amount"] = min_order_amount
                    item["max_discount"] = max_discount
                    item["expires_at"] = expires_at
                    item["is_active"] = is_active
                    item["description"] = description
                    code_item = item
                    break

        if not code_item:
            # Check duplicate code
            for item in codes:
                if item["code"] == code_str:
                    raise ValueError(f"Mã thanh toán '{code_str}' đã tồn tại trong hệ thống!")
            
            code_id = f"code_{code_str.lower()}_{os.urandom(2).hex()}"
            code_item = {
                "id": code_id,
                "code": code_str,
                "discount_type": discount_type,
                "discount_value": discount_value,
                "min_order_amount": min_order_amount,
                "max_discount": max_discount,
                "expires_at": expires_at,
                "is_active": is_active,
                "usage_count": 0,
                "description": description,
                "created_at": datetime.now().strftime("%Y-%m-%d")
            }
            codes.append(code_item)

        self._save_settings()
        return code_item

    def toggle_payment_code(self, code_id):
        codes = self.settings.get("payment_codes", [])
        for item in codes:
            if item["id"] == code_id:
                item["is_active"] = not item.get("is_active", True)
                self._save_settings()
                return item
        raise ValueError("Không tìm thấy mã thanh toán!")

    def delete_payment_code(self, code_id):
        codes = self.settings.get("payment_codes", [])
        self.settings["payment_codes"] = [c for c in codes if c["id"] != code_id]
        self._save_settings()
        return True

    def validate_payment_code(self, code_str, order_total):
        if not code_str:
            return {"valid": False, "message": "Vui lòng nhập mã thanh toán!"}
        
        clean_code = code_str.strip().upper()
        codes = self.settings.get("payment_codes", [])
        matched = None
        for item in codes:
            if item.get("code", "").upper() == clean_code:
                matched = item
                break
        
        if not matched:
            return {"valid": False, "message": f"Mã '{clean_code}' không hợp lệ hoặc không tồn tại!"}

        if not matched.get("is_active", True):
            return {"valid": False, "message": f"Mã '{clean_code}' hiện đang tạm dừng áp dụng!"}

        # Check expiration if set
        expires_at = matched.get("expires_at")
        if expires_at:
            try:
                exp_date = datetime.strptime(expires_at, "%Y-%m-%d")
                if datetime.now() > exp_date:
                    return {"valid": False, "message": f"Mã '{clean_code}' đã hết hạn sử dụng vào ngày {expires_at}!"}
            except Exception:
                pass

        min_amt = float(matched.get("min_order_amount", 0))
        if order_total < min_amt:
            return {
                "valid": False,
                "message": f"Đơn hàng cần tối thiểu {self._format_price(min_amt)} để áp dụng mã này!"
            }

        # Calculate discount amount
        discount_type = matched.get("discount_type", "fixed")
        val = float(matched.get("discount_value", 0))

        if discount_type == "percent":
            discount_amount = order_total * (val / 100.0)
            max_disc = matched.get("max_discount")
            if max_disc and discount_amount > float(max_disc):
                discount_amount = float(max_disc)
        else:
            discount_amount = min(val, order_total)

        final_total = max(0, order_total - discount_amount)

        return {
            "valid": True,
            "code": clean_code,
            "discount_amount": int(discount_amount),
            "final_total": int(final_total),
            "discount_type": discount_type,
            "description": matched.get("description", ""),
            "message": f"Áp dụng mã {clean_code} thành công! Bạn được giảm {self._format_price(discount_amount)}."
        }

    def record_code_usage(self, code_str):
        if not code_str:
            return
        clean_code = code_str.strip().upper()
        for item in self.settings.get("payment_codes", []):
            if item.get("code", "").upper() == clean_code:
                item["usage_count"] = item.get("usage_count", 0) + 1
                self._save_settings()
                break

    def _format_price(self, price):
        try:
            return f"{int(price):,} ₫".replace(",", ".")
        except Exception:
            return f"{price} ₫"
