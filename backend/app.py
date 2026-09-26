import os
import sys

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from backend.graph_service import GraphService
from backend.recommender import get_recommendations, get_guest_recommendations

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

graph_service = GraphService()

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

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
    if not user_id:
        return jsonify({'success': False, 'error': 'Missing user_id parameter'}), 400

    recs = get_recommendations(graph_service, user_id, algorithm=algorithm)
    user = graph_service.get_user(user_id)
    return jsonify({
        'success': True,
        'user': user,
        'algorithm': algorithm,
        'recommendations': recs
    })

@app.route('/api/recommendations/guest', methods=['GET'])
def guest_recommendations():
    purpose = request.args.get('purpose', 't_laptrinh')
    category = request.args.get('category', 'all')
    recs = get_guest_recommendations(graph_service, purpose=purpose, category=category)
    return jsonify({
        'success': True,
        'is_guest': True,
        'matched_purpose': purpose,
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
def submit_survey():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'error': 'user_id là bắt buộc'}), 400

    try:
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

if __name__ == '__main__':
    print('Khởi động Knowledge Graph Recommendation Engine tại http://127.0.0.1:5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
