import networkx as nx
import collections
from backend.explanation import generate_detailed_explanation

def get_recommendations(graph_service, user_id, algorithm="hybrid", max_results=8):
    graph = graph_service.graph
    if user_id not in graph:
        return get_guest_recommendations(graph_service, algorithm=algorithm, max_results=max_results)

    interacted_products = set()
    for _, v, d in graph.out_edges(user_id, data=True):
        if graph.nodes.get(v, {}).get("type") == "Product":
            interacted_products.add(v)

    all_products = [
        node_id for node_id, attrs in graph.nodes(data=True)
        if attrs.get("type") == "Product"
    ]

    if algorithm == "ppr":
        scores_map = _recommend_ppr(graph_service, user_id, all_products, interacted_products)
    elif algorithm == "metapath":
        scores_map = _recommend_metapath(graph_service, user_id, all_products, interacted_products)
    else:  # hybrid
        scores_map = _recommend_hybrid(graph_service, user_id, all_products, interacted_products)

    sorted_products = sorted(scores_map.items(), key=lambda x: x[1]["score"], reverse=True)
    top_candidates = sorted_products[:max_results]

    results = []
    for prod_id, info in top_candidates:
        prod_data = graph.nodes.get(prod_id, {}).copy()
        prod_data["id"] = prod_id
        prod_data["score"] = round(info["score"], 3)
        prod_data["algorithm"] = algorithm
        prod_data["best_path"] = info.get("best_path", [])

        prod_data["explanation"] = generate_detailed_explanation(
            graph_service, user_id, prod_id, info.get("best_path", []), prod_data["score"]
        )
        results.append(prod_data)

    return results

def get_guest_recommendations(graph_service, purpose='all', algorithm='hybrid', max_results=8):
    graph = graph_service.graph
    all_products = [
        node_id for node_id, attrs in graph.nodes(data=True)
        if attrs.get("type") == "Product"
    ]
    
    scores = collections.defaultdict(float)
    matched_users = []

    if purpose and purpose != 'all':
        for u, v, d in graph.edges(data=True):
            if d.get("relation") == "has_purpose" and v == purpose:
                matched_users.append(u)

    if not matched_users:
        matched_users = [n for n, d in graph.nodes(data=True) if d.get("type") == "User"][:3]

    for uid in matched_users:
        user_recs = get_recommendations(graph_service, uid, algorithm=algorithm, max_results=max_results)
        for r in user_recs:
            scores[r["id"]] += r.get("score", 0.5)

    for p in all_products:
        if p not in scores:
            rating = graph.nodes.get(p, {}).get("rating", 4.5)
            scores[p] = rating / 5.0

    sorted_prods = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:max_results]
    
    results = []
    for prod_id, score in sorted_prods:
        prod_data = graph.nodes.get(prod_id, {}).copy()
        prod_data["id"] = prod_id
        prod_data["score"] = round(min(0.95, score / max(1.0, len(matched_users))), 3)
        prod_data["algorithm"] = f"Guest-Cluster-{algorithm}"
        prod_data["explanation"] = generate_detailed_explanation(
            graph_service, "guest", prod_id, ["Khách vãng lai", prod_data.get("brand", "Thiết bị"), prod_data.get("name", prod_id)], prod_data["score"]
        )
        results.append(prod_data)

    return results

def _recommend_ppr(graph_service, user_id, all_products, interacted_products):
    graph = graph_service.graph
    personalization = {node: 0.0 for node in graph.nodes()}
    personalization[user_id] = 1.0

    try:
        ppr_scores = nx.pagerank(
            graph,
            alpha=0.85,
            personalization=personalization,
            weight="weight",
            max_iter=100
        )
    except Exception:
        ppr_scores = {node: 1.0 / len(graph) for node in graph.nodes()}

    raw_scores = {}
    for p in all_products:
        if p in interacted_products:
            continue
        raw_scores[p] = ppr_scores.get(p, 0.0)

    max_score = max(raw_scores.values()) if raw_scores and max(raw_scores.values()) > 0 else 1.0
    
    result = {}
    for p, s in raw_scores.items():
        norm_score = min(0.98, (s / max_score) * 0.95 + 0.05)
        path = _find_best_path(graph, user_id, p)
        result[p] = {"score": norm_score, "best_path": path}
    return result

def _recommend_metapath(graph_service, user_id, all_products, interacted_products):
    graph = graph_service.graph
    scores = {p: {"score": 0.0, "best_path": []} for p in all_products if p not in interacted_products}

    for _, brand_node, d in graph.out_edges(user_id, data=True):
        if d.get("relation") == "likes_brand":
            weight = d.get("weight", 2.0)
            for _, p, _ in graph.in_edges(brand_node, data=True):
                if p in all_products and p not in interacted_products:
                    scores[p]["score"] += weight * 0.4
                    if not scores[p]["best_path"]:
                        scores[p]["best_path"] = [user_id, brand_node, p]

    for _, need_node, d in graph.out_edges(user_id, data=True):
        if d.get("relation") in ["has_purpose", "wants"]:
            weight = d.get("weight", 3.0)
            for _, p, _ in graph.in_edges(need_node, data=True):
                if p in all_products and p not in interacted_products:
                    scores[p]["score"] += weight * 0.5
                    if not scores[p]["best_path"]:
                        scores[p]["best_path"] = [user_id, need_node, p]

    for _, p1, _ in graph.out_edges(user_id, data=True):
        if graph.nodes.get(p1, {}).get("type") == "Product":
            for other_u, _, _ in graph.in_edges(p1, data=True):
                if other_u != user_id and graph.nodes.get(other_u, {}).get("type") == "User":
                    for _, p2, _ in graph.out_edges(other_u, data=True):
                        if p2 in all_products and p2 not in interacted_products:
                            scores[p2]["score"] += 0.4
                            if not scores[p2]["best_path"]:
                                scores[p2]["best_path"] = [user_id, p1, other_u, p2]

    if scores:
        max_s = max(item["score"] for item in scores.values())
        if max_s > 0:
            for p in scores:
                scores[p]["score"] = min(0.98, scores[p]["score"] / max_s)
                if not scores[p]["best_path"]:
                    scores[p]["best_path"] = _find_best_path(graph, user_id, p)
    return scores

def _recommend_hybrid(graph_service, user_id, all_products, interacted_products):
    ppr_scores = _recommend_ppr(graph_service, user_id, all_products, interacted_products)
    metapath_scores = _recommend_metapath(graph_service, user_id, all_products, interacted_products)

    combined = {}
    for p in all_products:
        if p in interacted_products:
            continue
        p_ppr = ppr_scores.get(p, {}).get("score", 0.0)
        p_meta = metapath_scores.get(p, {}).get("score", 0.0)
        best_path = metapath_scores.get(p, {}).get("best_path") or ppr_scores.get(p, {}).get("best_path")

        final_score = 0.55 * p_meta + 0.45 * p_ppr
        rating = graph_service.graph.nodes.get(p, {}).get("rating", 4.5)
        final_score += (rating - 4.0) * 0.05

        combined[p] = {
            "score": min(0.99, max(0.1, final_score)),
            "best_path": best_path
        }
    return combined

def _find_best_path(graph, user_id, product_id):
    try:
        undirected = graph.to_undirected()
        path = nx.shortest_path(undirected, source=user_id, target=product_id)
        return path
    except Exception:
        return [user_id, product_id]
