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
