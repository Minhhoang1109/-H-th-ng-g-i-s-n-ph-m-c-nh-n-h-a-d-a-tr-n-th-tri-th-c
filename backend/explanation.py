def generate_explanation(graph_service, user_id, product_id, path=None):
    """
    Generates human-readable Vietnamese explanation (XAI) based on the Knowledge Graph reasoning path.
    """
    graph = graph_service.graph
    prod_attrs = graph.nodes.get(product_id, {})
    prod_name = prod_attrs.get("name", product_id)

    if not path or len(path) < 2:
        return {
            "badge": "Phổ biến",
            "text": f"Sản phẩm {prod_name} đang được đánh giá rất cao trên hệ thống.",
            "path": [user_id, product_id],
            "path_labels": ["Khách hàng", "Sản phẩm gợi ý"]
        }

    path_nodes = path
    path_labels = [graph.nodes.get(n, {}).get("name", n) for n in path]

    # 1. Direct cross-sell: User -> Purchased Product -> Product
    if len(path) == 3:
        mid = path[1]
        mid_attrs = graph.nodes.get(mid, {})
        mid_type = mid_attrs.get("type", "")

        if mid_type == "Product":
            return {
                "badge": "Thường mua cùng",
                "text": f"Khách hàng mua {mid_attrs.get('name')} thường mua kèm {prod_name}.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif mid_type == "Brand":
            return {
                "badge": "Cùng thương hiệu",
                "text": f"Gợi ý vì bạn quan tâm các sản phẩm thuộc thương hiệu {mid_attrs.get('name')}.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif mid_type == "Category":
            return {
                "badge": "Cùng danh mục",
                "text": f"Sản phẩm phù hợp với sự quan tâm của bạn trong danh mục {mid_attrs.get('name')}.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif mid_type == "Tag":
            return {
                "badge": "Cùng phong cách",
                "text": f"Được gợi ý theo tiêu chí bạn yêu thích: {mid_attrs.get('name')}.",
                "path": path_nodes,
                "path_labels": path_labels
            }

    # 2. 4-hop path: User -> P1 -> Brand/Category -> P2
    if len(path) == 4:
        p1 = path[1]
        entity = path[2]
        p1_name = graph.nodes.get(p1, {}).get("name", "sản phẩm trước")
        entity_attrs = graph.nodes.get(entity, {})
        entity_name = entity_attrs.get("name", "")
        entity_type = entity_attrs.get("type", "")

        if entity_type == "Brand":
            return {
                "badge": f"Hãng {entity_name}",
                "text": f"Vì bạn đã tương tác với {p1_name}, hệ thống gợi ý thêm {prod_name} cùng hệ sinh thái {entity_name}.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif entity_type == "Category":
            return {
                "badge": f"Ngành hàng {entity_name}",
                "text": f"Dựa trên sự quan tâm của bạn tới {p1_name}, đề xuất thêm {prod_name} thuộc cùng danh mục {entity_name}.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif entity_type == "Tag":
            return {
                "badge": f"Đặc tính {entity_name}",
                "text": f"Cả {p1_name} và {prod_name} đều đáp ứng nhu cầu {entity_name} của bạn.",
                "path": path_nodes,
                "path_labels": path_labels
            }
        elif entity_type == "User":
            return {
                "badge": "Cộng đồng đề xuất",
                "text": f"Người dùng có sở thích tương đồng với bạn ({entity_name}) cũng rất yêu thích {prod_name}.",
                "path": path_nodes,
                "path_labels": path_labels
            }

    # Fallback default path explanation
    return {
        "badge": "Đồ thị tương quan",
        "text": f"Được kết nối qua mạng lưới tri thức giữa các hành vi mua sắm gần đây của bạn.",
        "path": path_nodes,
        "path_labels": path_labels
    }
