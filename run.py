import sys
import os
import webbrowser
import threading
import time

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from backend.app import app

def open_browser():
    time.sleep(1.5)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    print('=' * 65)
    print('  KG-RecSys: He thong Goi y Ca nhan hoa dua tren Do thi Tri thuc')
    print('  Dang khoi dong may chu tai http://127.0.0.1:5000 ...')
    print('=' * 65)
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=False)
