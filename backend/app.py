import os
import sys

# Ensure root directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from backend.graph_service import GraphService
from backend.recommender import get_recommendations

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
    categories = data.get('categories', [])
    brands = data.get('brands', [])
    tags = data.get('tags', [])

    if not username or not password or not name:
        return jsonify({'success': False, 'error': 'Vui lòng điền đầy đủ Tên đăng nhập, Mật khẩu và Họ tên!'}), 400

    try:
        user = graph_service.register_user(
            username=username,
            password=password,
            name=name,
            role=role,
            email=email,
            categories=categories,
            brands=brands,
            tags=tags
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
        'user': user
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

# --- DATA ROUTES ---
@app.route('/api/users', methods=['GET'])
def get_users():
    users = graph_service.get_users()
    return jsonify({'success': True, 'users': users})

@app.route('/api/users', methods=['POST'])
def create_user():
    data = request.json or {}
    user_id = data.get('user_id')
    name = data.get('name')
    role = data.get('role', 'Khách hàng mới')
    if not user_id or not name:
        return jsonify({'success': False, 'error': 'user_id và name là bắt buộc'}), 400

    user = graph_service.add_user(
        user_id=user_id,
        name=name,
        role=role,
        initial_categories=data.get('categories', []),
        initial_brands=data.get('brands', []),
        initial_tags=data.get('tags', [])
    )
    return jsonify({'success': True, 'user': user})

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

    categories = data.get('categories', [])
    brands = data.get('brands', [])
    tags = data.get('tags', [])
    feedback = data.get('feedback', {})

    try:
        graph_service.apply_survey(
            user_id=user_id,
            categories=categories,
            brands=brands,
            tags=tags,
            feedback=feedback
        )
        return jsonify({
            'success': True,
            'message': 'Đã lưu kết quả khảo sát và cập nhật Đồ thị tri thức thành công!'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/survey/stats', methods=['GET'])
def get_survey_stats():
    stats = graph_service.get_survey_stats()
    return jsonify({'success': True, 'stats': stats})

@app.route('/api/graph', methods=['GET'])
def get_graph():
    center_id = request.args.get('center_id')
    highlight_str = request.args.get('highlight_path')
    highlight_path = highlight_str.split(',') if highlight_str else None

    subgraph = graph_service.get_subgraph(
        center_id=center_id,
        depth=2,
        max_nodes=60,
        highlight_path=highlight_path
    )
    return jsonify({'success': True, 'graph': subgraph})

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    metrics = graph_service.get_metrics()
    return jsonify({'success': True, 'metrics': metrics})

if __name__ == '__main__':
    print('Khởi động Knowledge Graph Recommendation Engine tại http://127.0.0.1:5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
