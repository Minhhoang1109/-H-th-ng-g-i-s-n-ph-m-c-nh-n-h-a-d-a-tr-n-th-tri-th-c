import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import base64
import time
from werkzeug.utils import secure_filename
from backend.graph_service import GraphService
from backend.recommender import get_recommendations, get_guest_recommendations
from backend.chatbot_service import ChatbotService
from backend.payment_service import PaymentService

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

graph_service = GraphService()
chatbot_service = ChatbotService(graph_service)
payment_service = PaymentService()

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/admin')
@app.route('/admin.html')
def serve_admin():
    return send_from_directory(app.static_folder, 'admin.html')

# --- AUTHENTICATION ROUTES ---
@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    data = request.json or {}
    username = (data.get('username') or '').strip().lower()
    password = (data.get('password') or '').strip()
    name = (data.get('name') or '').strip()
    role = (data.get('role') or 'Khách hàng mới').strip()
    email = (data.get('email') or '').strip()

    if not username or not password or not name:
        return jsonify({'success': False, 'error': 'Vui lòng điền đầy đủ Tên đăng nhập, Mật khẩu và Họ tên!'}), 400

    try:
        user = graph_service.register_user(
            username=username,
            password=password,
            name=name,
            role=role,
            email=email
        )
        return jsonify({
            'success': True,
            'message': f'Đăng ký tài khoản thành công! Chào mừng {name}.',
            'user': user
        })
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Lỗi máy chủ: {str(e)}'}), 500

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()

    if not username or not password:
        return jsonify({'success': False, 'error': 'Vui lòng nhập Tên đăng nhập và Mật khẩu!'}), 400

    user = graph_service.authenticate_user(username, password)
    if not user:
        return jsonify({'success': False, 'error': 'Tên đăng nhập hoặc Mật khẩu không chính xác!'}), 401

    return jsonify({
        'success': True,
        'message': f'Đăng nhập thành công! Xin chào {user.get("name")}.',
        'user': user,
        'is_second_login': user.get('is_second_login', False)
    })

@app.route('/api/auth/demo-accounts', methods=['GET'])
def get_demo_accounts():
    accounts = [
        {'id': 'u1', 'username': 'alice', 'name': 'Alice Nguyễn', 'role': 'Tín đồ Apple', 'avatar': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 'password': '123456'},
        {'id': 'u2', 'username': 'bob', 'name': 'Bob Trần', 'role': 'Hardcore Gamer & PC Builder', 'avatar': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'password': '123456'},
        {'id': 'u3', 'username': 'charlie', 'name': 'Charlie Lê', 'role': 'Senior Software Engineer', 'avatar': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 'password': '123456'},
        {'id': 'u4', 'username': 'diana', 'name': 'Diana Phạm', 'role': 'Dân Văn phòng & Tối giản', 'avatar': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'password': '123456'},
        {'id': 'u5', 'username': 'edward', 'name': 'Edward Vũ', 'role': 'Kỹ sư Đồ họa 3D & AI', 'avatar': 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150', 'password': '123456'}
    ]
    return jsonify({'success': True, 'accounts': accounts})

# --- USER WISHLIST & TARGET NEED (2ND LOGIN) ---
@app.route('/api/user/<user_id>', methods=['GET'])
def get_user_profile(user_id):
    user = graph_service.get_user(user_id)
    if not user:
        for n, attrs in graph_service.graph.nodes(data=True):
            if attrs.get('type') == 'User' and (attrs.get('username') == user_id or attrs.get('name') == user_id):
                user = graph_service.get_user(n)
                break
    if not user:
        return jsonify({'success': False, 'error': f'Không tìm thấy người dùng: {user_id}'}), 404
    return jsonify({'success': True, 'user': user})

@app.route('/api/user/<user_id>', methods=['PUT', 'POST'])
@app.route('/api/user/profile', methods=['PUT', 'POST'])
def update_user_profile(user_id=None):
    data = request.json or {}
    uid = user_id or data.get('user_id') or data.get('id')
    if not uid:
        return jsonify({'success': False, 'error': 'Thiếu mã định danh người dùng (user_id)'}), 400

    try:
        user = graph_service.update_user(
            user_id=uid,
            name=data.get('name'),
            email=data.get('email'),
            phone=data.get('phone'),
            avatar=data.get('avatar'),
            role=data.get('role'),
            bio=data.get('bio'),
            new_password=data.get('new_password'),
            target_need=data.get('target_need') or data.get('target_query') or data.get('last_target_need')
        )
        return jsonify({
            'success': True,
            'message': 'Cập nhật hồ sơ người dùng thành công!',
            'user': user
        })
    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Lỗi cập nhật hồ sơ: {str(e)}'}), 500

# --- AVATAR UPLOAD ENDPOINT ---
UPLOAD_AVATARS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend', 'uploads', 'avatars')
os.makedirs(UPLOAD_AVATARS_DIR, exist_ok=True)
ALLOWED_AVATAR_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}

@app.route('/api/upload-avatar', methods=['POST'])
def upload_avatar():
    try:
        user_id = request.form.get('user_id') or 'user'
        filename = None

        # 1. Handle multipart/form-data file upload
        if 'file' in request.files or 'avatar' in request.files:
            file = request.files.get('file') or request.files.get('avatar')
            if file and file.filename != '':
                orig_name = secure_filename(file.filename)
                ext = orig_name.rsplit('.', 1)[-1].lower() if '.' in orig_name else 'png'
                if ext not in ALLOWED_AVATAR_EXTENSIONS:
                    ext = 'png'
                clean_uid = "".join([c for c in user_id if c.isalnum() or c in ('_', '-')]) or 'user'
                filename = f"avatar_{clean_uid}_{int(time.time())}.{ext}"
                file_path = os.path.join(UPLOAD_AVATARS_DIR, filename)
                file.save(file_path)

        # 2. Handle JSON base64 / data URL payload
        if not filename and request.is_json:
            data = request.json or {}
            user_id = data.get('user_id') or user_id
            data_url = data.get('data_url') or data.get('avatar_base64') or data.get('image')
            if data_url and 'base64,' in data_url:
                header, b64_str = data_url.split('base64,', 1)
                ext = 'png'
                if 'jpeg' in header or 'jpg' in header:
                    ext = 'jpg'
                elif 'webp' in header:
                    ext = 'webp'
                elif 'gif' in header:
                    ext = 'gif'
                elif 'svg' in header:
                    ext = 'svg'

                clean_uid = "".join([c for c in user_id if c.isalnum() or c in ('_', '-')]) or 'user'
                filename = f"avatar_{clean_uid}_{int(time.time())}.{ext}"
                file_path = os.path.join(UPLOAD_AVATARS_DIR, filename)
                with open(file_path, 'wb') as f:
                    f.write(base64.b64decode(b64_str))

        if filename:
            avatar_url = f"/uploads/avatars/{filename}"
            return jsonify({
                'success': True,
                'url': avatar_url,
                'filename': filename,
                'message': 'Tải ảnh đại diện lên thành công!'
            })
        else:
            return jsonify({'success': False, 'error': 'Không tìm thấy file ảnh hoặc dữ liệu ảnh hợp lệ!'}), 400

    except Exception as e:
        return jsonify({'success': False, 'error': f'Lỗi khi xử lý ảnh đại diện: {str(e)}'}), 500

@app.route('/api/user/wishlist', methods=['POST'])
def save_user_wishlist():
    data = request.json or {}
    user_id = data.get('user_id')
    target_query = (data.get('query') or '').strip()
    target_items = data.get('items', [])

    if not user_id or not target_query:
        return jsonify({'success': False, 'error': 'user_id và query là bắt buộc'}), 400

    try:
        wishlist = graph_service.set_user_wishlist(user_id, target_query, target_items)
        return jsonify({
            'success': True,
            'message': f'Đã ghi nhận mong muốn "{target_query}" vào Đồ thị Tri thức!',
            'wishlist': wishlist
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# --- RECOMMENDATIONS (USER & GUEST) ---
@app.route('/api/recommendations', methods=['GET'])
def recommendations():
    user_id = request.args.get('user_id')
    algorithm = request.args.get('algorithm', 'hybrid')
    category = request.args.get('category', 'all')
    try:
        max_results = int(request.args.get('top_k', request.args.get('max_results', 40)))
    except:
        max_results = 40
    if not user_id:
        return jsonify({'success': False, 'error': 'Missing user_id parameter'}), 400

    recs = get_recommendations(graph_service, user_id, algorithm=algorithm, max_results=max_results, category=category)
    user = graph_service.get_user(user_id)
    return jsonify({
        'success': True,
        'user': user,
        'algorithm': algorithm,
        'recommendations': recs
    })

@app.route('/api/recommendations/guest', methods=['GET'])
def guest_recommendations():
    purpose = request.args.get('purpose', 'all')
    category = request.args.get('category', 'all')
    algorithm = request.args.get('algorithm', 'hybrid')
    try:
        max_results = int(request.args.get('top_k', request.args.get('max_results', 40)))
    except:
        max_results = 40
    recs = get_guest_recommendations(graph_service, purpose=purpose, algorithm=algorithm, max_results=max_results, category=category)
    return jsonify({
        'success': True,
        'is_guest': True,
        'matched_purpose': purpose,
        'algorithm': algorithm,
        'recommendations': recs
    })

# --- PRODUCT REVIEWS & FEEDBACK ---
@app.route('/api/products/review', methods=['POST'])
def add_product_review():
    data = request.json or {}
    user_id = data.get('user_id', 'guest')
    product_id = data.get('product_id')
    rating = data.get('rating', 5)
    comment = data.get('comment', '')
    pros = data.get('pros', '')
    cons = data.get('cons', '')

    if not product_id or not comment:
        return jsonify({'success': False, 'error': 'product_id và nội dung góp ý là bắt buộc'}), 400

    try:
        review = graph_service.add_product_review(user_id, product_id, rating, comment, pros, cons)
        return jsonify({
            'success': True,
            'message': 'Đã gửi đánh giá & góp ý sản phẩm thành công!',
            'review': review
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/products/reviews', methods=['GET'])
def get_product_reviews():
    product_id = request.args.get('product_id')
    if not product_id:
        return jsonify({'success': False, 'error': 'Missing product_id'}), 400
    reviews = graph_service.get_product_reviews(product_id)
    return jsonify({'success': True, 'reviews': reviews})

# --- ADMIN PRODUCT MANAGEMENT (CRUD) ---
@app.route('/api/admin/products', methods=['POST'])
def admin_add_product():
    data = request.json or {}
    try:
        prod = graph_service.add_product(
            prod_id=data.get('id'),
            name=data.get('name'),
            price=data.get('price'),
            rating=data.get('rating', 4.8),
            image=data.get('image'),
            description=data.get('description'),
            category_id=data.get('category_id'),
            brand_id=data.get('brand_id'),
            tag_ids=data.get('tag_ids', []),
            compatible_ids=data.get('compatible_ids', [])
        )
        return jsonify({'success': True, 'message': f'Đã thêm sản phẩm {prod["name"]} vào Đồ thị Tri thức!', 'product': prod})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/products/<prod_id>', methods=['PUT'])
def admin_update_product(prod_id):
    data = request.json or {}
    try:
        prod = graph_service.update_product(
            prod_id=prod_id,
            name=data.get('name'),
            price=data.get('price'),
            rating=data.get('rating'),
            image=data.get('image'),
            description=data.get('description')
        )
        return jsonify({'success': True, 'message': 'Đã cập nhật sản phẩm thành công!', 'product': prod})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/products/<prod_id>', methods=['DELETE'])
def admin_delete_product(prod_id):
    try:
        graph_service.delete_product(prod_id)
        return jsonify({'success': True, 'message': f'Đã xóa sản phẩm {prod_id} khỏi Đồ thị Tri thức!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

# --- ADMIN VISUAL KNOWLEDGE GRAPH CANVAS ---
@app.route('/api/admin/graph-canvas', methods=['GET'])
def get_admin_graph_canvas():
    filter_type = request.args.get('filter_type', 'all')
    entity_id = request.args.get('entity_id')
    graph_data = graph_service.get_admin_graph_data(filter_type=filter_type, entity_id=entity_id)
    return jsonify({'success': True, 'graph': graph_data})

# --- DATA & SURVEY ROUTES ---
@app.route('/api/users', methods=['GET'])
def get_users():
    users = graph_service.get_users()
    return jsonify({'success': True, 'users': users})

@app.route('/api/products', methods=['GET'])
def get_products():
    products = graph_service.get_products()
    return jsonify({'success': True, 'products': products})

@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    return jsonify({
        'success': True,
        'categories': graph_service.get_categories(),
        'brands': graph_service.get_brands(),
        'tags': graph_service.get_tags()
    })

@app.route('/api/interact', methods=['POST'])
def add_interaction():
    data = request.json or {}
    user_id = data.get('user_id')
    product_id = data.get('product_id')
    interaction_type = data.get('type', 'likes')

    if not user_id or not product_id:
        return jsonify({'success': False, 'error': 'user_id and product_id are required'}), 400

    try:
        graph_service.add_interaction(user_id, product_id, interaction_type)
        return jsonify({
            'success': True,
            'message': f'Đã ghi nhận tương tác {interaction_type} giữa {user_id} và {product_id}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/survey', methods=['POST'])
@app.route('/api/survey/detailed', methods=['POST'])
def submit_survey():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'user_id là bắt buộc'}), 400

    # Ensure user exists; if username or display name was passed, resolve node id
    if user_id not in graph_service.graph:
        matched = False
        for n, attrs in graph_service.graph.nodes(data=True):
            if attrs.get('type') == 'User' and (attrs.get('username') == user_id or attrs.get('name') == user_id):
                user_id = n
                matched = True
                break
        if not matched:
            return jsonify({'success': False, 'error': f'Không tìm thấy người dùng: {user_id}'}), 404

    try:
        # Convert any brand/category display names to node IDs if necessary
        categories = data.get('categories', [])
        resolved_cats = []
        for cat in categories:
            if cat in graph_service.graph:
                resolved_cats.append(cat)
            else:
                for c_node, c_attrs in graph_service.graph.nodes(data=True):
                    if c_attrs.get('type') == 'Category' and c_attrs.get('name') == cat:
                        resolved_cats.append(c_node)
                        break
        data['categories'] = resolved_cats if resolved_cats else categories

        brands = data.get('brands', [])
        resolved_brands = []
        for brand in brands:
            if brand in graph_service.graph:
                resolved_brands.append(brand)
            else:
                for b_node, b_attrs in graph_service.graph.nodes(data=True):
                    if b_attrs.get('type') == 'Brand' and b_attrs.get('name') == brand:
                        resolved_brands.append(b_node)
                        break
        data['brands'] = resolved_brands if resolved_brands else brands

        graph_service.apply_detailed_survey(user_id=user_id, survey_data=data)
        return jsonify({
            'success': True,
            'message': 'Đã lưu kết quả khảo sát chi tiết và cập nhật Đồ thị tri thức thành công!'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/survey/stats', methods=['GET'])
def get_survey_stats():
    stats = graph_service.get_survey_stats()
    return jsonify({'success': True, 'stats': stats})

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    metrics = graph_service.get_metrics()
    return jsonify({'success': True, 'metrics': metrics})

# --- AI SHOPPING ASSISTANT & AUTOMATED PURCHASING CHATBOT ---
@app.route('/api/chatbot/message', methods=['POST'])
def chatbot_message():
    data = request.json or {}
    message = data.get('message', '')
    user_id = data.get('user_id')
    cart = data.get('cart', [])
    context = data.get('context', {})

    result = chatbot_service.process_message(
        message=message,
        user_id=user_id,
        cart=cart,
        context=context
    )
    return jsonify({'success': True, **result})

@app.route('/api/chatbot/order', methods=['POST'])
@app.route('/api/checkout', methods=['POST'])
def chatbot_create_order():
    data = request.json or {}
    user_id = data.get('user_id', 'u1')
    items = data.get('items', [])
    customer = data.get('customer', {})
    total = data.get('total', 0)
    payment_method = data.get('payment_method', 'COD (Thanh toán khi nhận hàng)')
    order_id = data.get('order_id')
    transfer_code = data.get('transfer_code', '')
    note = data.get('note', '')

    if not items:
        return jsonify({'success': False, 'error': 'Giỏ hàng trống!'}), 400

    order = chatbot_service.create_order(
        user_id=user_id,
        items=items,
        customer_info=customer,
        total_price=total,
        payment_method=payment_method,
        order_id=order_id,
        transfer_code=transfer_code,
        note=note
    )
    applied_code = data.get('applied_code')
    if applied_code:
        try:
            payment_service.record_code_usage(applied_code)
        except Exception:
            pass

    return jsonify({
        'success': True,
        'message': f'Đơn hàng {order["id"]} đã được xử lý thành công!',
        'order': order
    })

# ========================================================
# PAYMENT SETTINGS, BANK ACCOUNTS & PAYMENT CODES
# ========================================================
@app.route('/api/payment-settings', methods=['GET'])
def get_payment_settings():
    try:
        settings = payment_service.get_settings()
        return jsonify({'success': True, **settings})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/payment-code/apply', methods=['POST'])
def apply_payment_code():
    data = request.json or {}
    code = data.get('code', '')
    total = float(data.get('total', 0))
    result = payment_service.validate_payment_code(code, total)
    if result.get('valid'):
        return jsonify({'success': True, **result})
    else:
        return jsonify({'success': False, 'message': result.get('message', 'Mã không hợp lệ!')}), 400

@app.route('/api/admin/bank-accounts', methods=['POST'])
def save_bank_account():
    data = request.json or {}
    try:
        account = payment_service.add_or_update_bank_account(data)
        return jsonify({'success': True, 'account': account, 'message': 'Đã lưu tài khoản ngân hàng thành công!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/bank-accounts/<acc_id>/set-active', methods=['PUT', 'POST'])
def set_active_bank_account(acc_id):
    try:
        active_account = payment_service.set_active_bank_account(acc_id)
        return jsonify({'success': True, 'account': active_account, 'message': 'Đã đặt làm tài khoản nhận tiền chính!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/bank-accounts/<acc_id>', methods=['DELETE'])
def delete_bank_account(acc_id):
    try:
        payment_service.delete_bank_account(acc_id)
        return jsonify({'success': True, 'message': 'Đã xóa tài khoản ngân hàng!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/payment-codes', methods=['POST'])
def save_payment_code():
    data = request.json or {}
    try:
        code_item = payment_service.add_or_update_payment_code(data)
        return jsonify({'success': True, 'code': code_item, 'message': 'Đã lưu mã thanh toán thành công!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/payment-codes/<code_id>/toggle', methods=['PUT', 'POST'])
def toggle_payment_code(code_id):
    try:
        code_item = payment_service.toggle_payment_code(code_id)
        status_text = 'kích hoạt' if code_item.get('is_active') else 'tạm dừng'
        return jsonify({'success': True, 'code': code_item, 'message': f'Đã {status_text} mã {code_item.get("code")}!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/admin/payment-codes/<code_id>', methods=['DELETE'])
def delete_payment_code(code_id):
    try:
        payment_service.delete_payment_code(code_id)
        return jsonify({'success': True, 'message': 'Đã xóa mã thanh toán!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    print('Khoi dong Knowledge Graph Recommendation Engine tai http://127.0.0.1:5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
