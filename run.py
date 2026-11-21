import sys
import os
import webbrowser
import threading
import time

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

# Automatically load environment variables from .env if present
def load_dotenv():
    env_file = os.path.join(BASE_DIR, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val
        except Exception as e:
            print(f"[Warning] Khong the doc file .env: {e}")

load_dotenv()

from backend.app import app

def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    gemini_key = os.environ.get('GEMINI_API_KEY', '').strip()
    gemini_status = "Đã cấu hình (Sẵn sàng sử dụng)" if gemini_key else "Chưa cấu hình (Đang dùng KG Engine nội bộ)"

    print('=' * 65)
    print('  KG-RecSys: He thong Goi y Ca nhan hoa dua tren Do thi Tri thuc')
    print(f'  Google Gemini AI: {gemini_status}')
    print('  Dang khoi dong may chu tai http://127.0.0.1:5000 ...')
    print('=' * 65)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
