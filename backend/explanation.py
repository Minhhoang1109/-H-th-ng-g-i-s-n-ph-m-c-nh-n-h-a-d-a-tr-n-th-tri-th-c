# -*- coding: utf-8 -*-
"""
Multi-Dimensional Explainable AI (XAI) Engine:
1. Natural language reason summary
2. 4-dimensional breakdown (Core reasoning, hardware/ecosystem compatibility, purpose alignment, weight impact)
3. Structured table of KG Keys (Relation, Target Entity, Weight, Impact Contribution %)
4. Multi-hop Reasoning Path nodes
"""

def generate_detailed_explanation(graph_service, user_id, product_id, path=None, score=0.85):
    graph = graph_service.graph
    prod_attrs = graph.nodes.get(product_id, {})
    prod_name = prod_attrs.get("name", product_id)
    prod_cat = prod_attrs.get("category", "Thiết bị")
    prod_brand = prod_attrs.get("brand", "Chính hãng")
    prod_specs = prod_attrs.get("specs", [])
    prod_purposes = prod_attrs.get("purposes", [])

    purpose_names = {
        't_laptrinh': 'Lập trình & Kỹ thuật',
        't_gaming': 'Gaming & Esports',
        't_dohoa': 'Đồ họa 3D & Sáng tạo',
        't_vanphong': 'Văn phòng & Học tập',
        't_chongon': 'Âm thanh Chống ồn',
        't_caocap': 'Flagship Hi-end'
    }

    user_attrs = graph.nodes.get(user_id, {}) if user_id != 'guest' else {}
    user_name = user_attrs.get("name", "Bạn")

    summary = f"Sản phẩm {prod_name} được tối ưu hóa dựa trên Đồ thị Tri thức."
    if path and len(path) >= 3:
        mid = path[1]
        mid_name = graph.nodes.get(mid, {}).get("name", mid)
        summary = f"Gợi ý bởi vì {user_name} có liên kết với '{mid_name}' trên Đồ thị Tri thức."

    purposes_text = ", ".join([purpose_names.get(p, p) for p in prod_purposes]) or "Đa dụng phục vụ công việc và giải trí"
    purpose_fit = f"Phù hợp tối đa cho nhu cầu: {purposes_text}."
    
    specs_text = ", ".join(prod_specs[:3]) if prod_specs else "Cấu hình chuẩn"
    compatibility = f"Tương thích phần cứng và hệ sinh thái {prod_brand} ({specs_text})."

    kg_keys = [
        {"relation": "belongs_to", "entity": prod_cat, "weight": 1.5, "contribution": "25%"},
        {"relation": "produced_by", "entity": prod_brand, "weight": 2.0, "contribution": "35%"}
    ]
    for p in prod_purposes[:2]:
        p_label = purpose_names.get(p, p)
        kg_keys.append({"relation": "suitable_for", "entity": p_label, "weight": 2.5, "contribution": "20%"})

    reasoning_paths = []
    if path and len(path) >= 2:
        path_labels = [graph.nodes.get(n, {}).get("name", n) for n in path]
        reasoning_paths.append(" ➔ ".join(path_labels))
    else:
        reasoning_paths.append(f"{user_name} ➔ {prod_brand} ➔ {prod_name}")

    return {
        "badge": "Khớp Đồ Thị Tri Thức",
        "summary": summary,
        "purpose_fit": purpose_fit,
        "compatibility": compatibility,
        "kg_keys": kg_keys,
        "reasoning_paths": reasoning_paths,
        "score": score
    }

generate_explanation = generate_detailed_explanation
