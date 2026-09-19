import networkx as nx
import collections
from backend.explanation import generate_explanation

def get_recommendations(graph_service, user_id, algorithm="hybrid", max_results=8):
    """
    Generate personalized product recommendations based on the Knowledge Graph.
    Supports:
    - 'ppr': Personalized PageRank / Random Walk with Restart
    - 'metapath': Meta-path Traversal & Semantic Feature Reasoning
    - 'hybrid': Combined PPR + Meta-path + Popularity fallback
    """
    graph = graph_service.graph
    if user_id not in graph:
        return []

    # Get products the user has already purchased or liked to exclude/downweight
    interacted_products = set()
    for _, v, d in graph.out_edges(user_id, data=True):
        if graph.nodes.get(v, {}).get("type") == "Product":
            interacted_products.add(v)

    all_products = [
        node_id for node_id, attrs in graph.nodes(data=True)
        if attrs.get("type") == "Product"
    ]

    if algorithm == "ppr":
        scores = _recommend_ppr(graph_service, user_id, all_products, interacted_products)
    elif algorithm == "metapath":
        scores = _recommend_metapath(graph_service, user_id, all_products, interacted_products)
    else: # hybrid
        scores = _recommend_hybrid(graph_service, user_id, all_products, interacted_products)

    # Sort candidates by score descending
    sorted_candidates = sorted(scores.items(), key=lambda item: item[1]["score"], reverse=True)
    results = []

    for prod_id, info in sorted_candidates[:max_results]:
        prod_data = graph_service.get_product(prod_id)
        if not prod_data:
            continue
        
        explanation = generate_explanation(graph_service, user_id, prod_id, info.get("best_path"))
        results.append({
            "product": prod_data,
            "score": round(info["score"], 4),
            "match_percent": min(100, int(info["score"] * 100)),
            "reason_badge": explanation["badge"],
            "explanation": explanation["text"],
            "path": explanation["path"],
            "path_labels": explanation["path_labels"]
        })

    return results

def _recommend_ppr(graph_service, user_id, all_products, interacted_products):
    graph = graph_service.graph
    # Convert MultiDiGraph to weighted simple DiGraph for PageRank
    simple_g = nx.DiGraph()
    for u, v, d in graph.edges(data=True):
        w = d.get("weight", 1.0)
        # Undirected effect for KG semantic links
        if simple_g.has_edge(u, v):
            simple_g[u][v]["weight"] += w
        else:
            simple_g.add_edge(u, v, weight=w)
        # Add reverse edge for bidirectionality in random walk traversal
        if simple_g.has_edge(v, u):
            simple_g[v][u]["weight"] += w * 0.7
        else:
            simple_g.add_edge(v, u, weight=w * 0.7)

    personalization = {n: 0.0 for n in simple_g.nodes()}
    personalization[user_id] = 1.0

    try:
        pr = nx.pagerank(simple_g, alpha=0.85, personalization=personalization, weight="weight", max_iter=100)
    except Exception:
        pr = {p: 0.01 for p in all_products}

    # Normalize product scores
    prod_scores = {p: pr.get(p, 0.0) for p in all_products if p not in interacted_products}
    max_s = max(prod_scores.values()) if prod_scores and max(prod_scores.values()) > 0 else 1.0

    scores = {}
    for p, s in prod_scores.items():
        norm_s = s / max_s
        scores[p] = {
            "score": norm_s,
            "best_path": _find_best_path(graph, user_id, p)
        }
    return scores

def _recommend_metapath(graph_service, user_id, all_products, interacted_products):
    graph = graph_service.graph
    scores = collections.defaultdict(lambda: {"score": 0.0, "best_path": None, "reasons": []})

    # Meta-path 1: Direct Onboarding Preferences (Cold-Start)
    # User -> Brand/Category/Tag -> Product
    for _, pref_target, d in graph.out_edges(user_id, data=True):
        pref_type = d.get("type", "")
        if pref_type in ["prefers_brand", "prefers_category", "prefers_tag"]:
            for prod in all_products:
                if prod in interacted_products:
                    continue
                if graph.has_edge(prod, pref_target):
                    scores[prod]["score"] += 0.8
                    scores[prod]["best_path"] = [user_id, pref_target, prod]

    # Meta-path 2: Frequently Bought Together (Cross-selling)
    # User -> [purchased] -> P1 -> [bought_together] -> P2
    for _, p1, d in graph.out_edges(user_id, data=True):
        if d.get("type") in ["purchased", "likes"] and graph.nodes.get(p1, {}).get("type") == "Product":
            for _, p2, ed in graph.out_edges(p1, data=True):
                if ed.get("type") == "bought_together" and p2 in all_products and p2 not in interacted_products:
                    weight = 0.9 if d.get("type") == "purchased" else 0.6
                    scores[p2]["score"] += weight
                    if not scores[p2]["best_path"]:
                        scores[p2]["best_path"] = [user_id, p1, p2]

    # Meta-path 3: Same Brand
    # User -> P1 -> Brand <- P2
    for _, p1, d in graph.out_edges(user_id, data=True):
        if graph.nodes.get(p1, {}).get("type") == "Product":
            for _, brand, ed in graph.out_edges(p1, data=True):
                if ed.get("type") == "produced_by":
                    for in_p, _, _ in graph.in_edges(brand, data=True):
                        if in_p in all_products and in_p != p1 and in_p not in interacted_products:
                            scores[in_p]["score"] += 0.65
                            if not scores[in_p]["best_path"]:
                                scores[in_p]["best_path"] = [user_id, p1, brand, in_p]

    # Meta-path 4: Same Category & Tags
    for _, p1, d in graph.out_edges(user_id, data=True):
        if graph.nodes.get(p1, {}).get("type") == "Product":
            for _, tag_or_cat, ed in graph.out_edges(p1, data=True):
                if ed.get("type") in ["belongs_to", "has_tag"]:
                    for in_p, _, _ in graph.in_edges(tag_or_cat, data=True):
                        if in_p in all_products and in_p != p1 and in_p not in interacted_products:
                            scores[in_p]["score"] += 0.45
                            if not scores[in_p]["best_path"]:
                                scores[in_p]["best_path"] = [user_id, p1, tag_or_cat, in_p]

    # Meta-path 5: Collaborative User-Item
    # User1 -> P1 <- User2 -> P2
    for _, p1, _ in graph.out_edges(user_id, data=True):
        for other_u, _, _ in graph.in_edges(p1, data=True):
            if other_u != user_id and graph.nodes.get(other_u, {}).get("type") == "User":
                for _, p2, _ in graph.out_edges(other_u, data=True):
                    if p2 in all_products and p2 not in interacted_products:
                        scores[p2]["score"] += 0.4
                        if not scores[p2]["best_path"]:
                            scores[p2]["best_path"] = [user_id, p1, other_u, p2]

    # Normalize scores
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

        # Hybrid weighting
        final_score = 0.55 * p_meta + 0.45 * p_ppr
        # Slight rating bonus
        rating = graph_service.graph.nodes.get(p, {}).get("rating", 4.5)
        final_score += (rating - 4.0) * 0.05

        combined[p] = {
            "score": min(0.99, max(0.1, final_score)),
            "best_path": best_path
        }
    return combined

def _find_best_path(graph, user_id, product_id):
    try:
        # Check shortest path in undirected version
        undirected = graph.to_undirected()
        path = nx.shortest_path(undirected, source=user_id, target=product_id)
        return path
    except Exception:
        return [user_id, product_id]
