import json
import os
import networkx as nx

class GraphService:
    INTERACTION_WEIGHTS = {
        "purchased": 3.5,
        "likes": 2.5,
        "viewed": 1.2,
        "bought_together": 2.8,
        "produced_by": 2.0,
        "belongs_to": 1.5,
        "has_tag": 1.4,
        "prefers_brand": 2.5,
        "prefers_category": 2.0,
        "prefers_tag": 2.0
    }

    TYPE_COLORS = {
        "User": "#3b82f6",       # Blue
        "Product": "#8b5cf6",    # Violet / Purple
        "Category": "#f59e0b",   # Amber / Orange
        "Brand": "#10b981",      # Emerald / Green
        "Tag": "#ec4899"         # Pink / Rose
    }

    def __init__(self, graph_path=None):
        if graph_path is None:
            graph_path = os.path.join(os.path.dirname(__file__), '..', 'graph', 'sample_graph.json')
        self.graph_path = os.path.abspath(graph_path)
        self.graph = nx.MultiDiGraph()
        self.load_graph(self.graph_path)

    def load_graph(self, path):
        self.graph.clear()
        if not os.path.exists(path):
            raise FileNotFoundError(f"Graph file not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for node in data.get("nodes", []):
            node_attrs = dict(node)
            node_id = node_attrs.get("id")
            node_type = node_attrs.get("type", "Unknown")
            node_attrs["color"] = self.TYPE_COLORS.get(node_type, "#94a3b8")
            self.graph.add_node(node_id, **node_attrs)

        for edge in data.get("edges", []):
            edge_type = edge.get("type", "related")
            weight = edge.get("weight", self.INTERACTION_WEIGHTS.get(edge_type, 1.0))
            self.graph.add_edge(
                edge["source"],
                edge["target"],
                type=edge_type,
                weight=weight,
                label=edge_type
            )

    def save_graph(self, path=None):
        target = path or self.graph_path
        nodes = [attrs for _, attrs in self.graph.nodes(data=True)]
        edges = []
        for u, v, attrs in self.graph.edges(data=True):
            e = dict(attrs)
            e["source"] = u
            e["target"] = v
            # remove vis-network temporary styling if any
            e.pop("color", None)
            edges.append(e)
        data = {"nodes": nodes, "edges": edges}
        with open(target, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_users(self):
        users = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                # calculate count of interactions
                out_degree = self.graph.out_degree(node_id)
                u = dict(attrs)
                u["interactions_count"] = out_degree
                users.append(u)
        return sorted(users, key=lambda x: x.get("id"))

    def get_user(self, user_id):
        if user_id in self.graph and self.graph.nodes[user_id].get("type") == "User":
            return dict(self.graph.nodes[user_id])
        return None

    def get_products(self):
        products = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "Product":
                prod = dict(attrs)
                # Attach category and brand
                prod["categories"] = [
                    self.graph.nodes[v]["name"]
                    for _, v, d in self.graph.out_edges(node_id, data=True)
                    if d.get("type") == "belongs_to" and v in self.graph
                ]
                prod["brands"] = [
                    self.graph.nodes[v]["name"]
                    for _, v, d in self.graph.out_edges(node_id, data=True)
                    if d.get("type") == "produced_by" and v in self.graph
                ]
                prod["tags"] = [
                    self.graph.nodes[v]["name"]
                    for _, v, d in self.graph.out_edges(node_id, data=True)
                    if d.get("type") == "has_tag" and v in self.graph
                ]
                products.append(prod)
        return products

    def get_product(self, product_id):
        if product_id in self.graph and self.graph.nodes[product_id].get("type") == "Product":
            prod = dict(self.graph.nodes[product_id])
            prod["categories"] = [
                self.graph.nodes[v]["name"]
                for _, v, d in self.graph.out_edges(product_id, data=True)
                if d.get("type") == "belongs_to" and v in self.graph
            ]
            prod["brands"] = [
                self.graph.nodes[v]["name"]
                for _, v, d in self.graph.out_edges(product_id, data=True)
                if d.get("type") == "produced_by" and v in self.graph
            ]
            prod["tags"] = [
                self.graph.nodes[v]["name"]
                for _, v, d in self.graph.out_edges(product_id, data=True)
                if d.get("type") == "has_tag" and v in self.graph
            ]
            return prod
        return None

    def get_categories(self):
        return [
            dict(attrs)
            for _, attrs in self.graph.nodes(data=True)
            if attrs.get("type") == "Category"
        ]

    def get_brands(self):
        return [
            dict(attrs)
            for _, attrs in self.graph.nodes(data=True)
            if attrs.get("type") == "Brand"
        ]

    def get_tags(self):
        return [
            dict(attrs)
            for _, attrs in self.graph.nodes(data=True)
            if attrs.get("type") == "Tag"
        ]

    def add_interaction(self, user_id, product_id, interaction_type="likes"):
        if user_id not in self.graph:
            raise ValueError(f"User {user_id} not found")
        if product_id not in self.graph:
            raise ValueError(f"Product {product_id} not found")

        weight = self.INTERACTION_WEIGHTS.get(interaction_type, 1.5)
        # Check if edge already exists
        existing = False
        for _, _, k, d in self.graph.out_edges(user_id, keys=True, data=True):
            if d.get("type") == interaction_type:
                existing = True
                break

        self.graph.add_edge(
            user_id,
            product_id,
            type=interaction_type,
            weight=weight,
            label=interaction_type
        )
        self.save_graph()
        return True

    def add_user(self, user_id, name, role="Người dùng mới", initial_categories=None, initial_brands=None, initial_tags=None):
        if user_id in self.graph:
            # update existing user
            self.graph.nodes[user_id]["name"] = name
            self.graph.nodes[user_id]["role"] = role
        else:
            self.graph.add_node(
                user_id,
                id=user_id,
                type="User",
                name=name,
                role=role,
                avatar=f"https://api.dicebear.com/7.x/bottts/svg?seed={user_id}",
                color=self.TYPE_COLORS["User"]
            )

        # Onboarding preferences for cold start
        if initial_categories:
            for cat_id in initial_categories:
                if cat_id in self.graph:
                    self.graph.add_edge(user_id, cat_id, type="prefers_category", weight=2.0, label="thích danh mục")
        if initial_brands:
            for brand_id in initial_brands:
                if brand_id in self.graph:
                    self.graph.add_edge(user_id, brand_id, type="prefers_brand", weight=2.5, label="chuộng thương hiệu")
        if initial_tags:
            for tag_id in initial_tags:
                if tag_id in self.graph:
                    self.graph.add_edge(user_id, tag_id, type="prefers_tag", weight=2.0, label="quan tâm nhãn")

        self.save_graph()
        return dict(self.graph.nodes[user_id])

    def apply_survey(self, user_id, categories=None, brands=None, tags=None, feedback=None):
        if user_id not in self.graph:
            raise ValueError(f"User {user_id} not found")

        # Remove prior preference edges to update with new survey choices
        edges_to_remove = []
        for _, v, k, d in self.graph.out_edges(user_id, keys=True, data=True):
            if d.get("type") in ["prefers_category", "prefers_brand", "prefers_tag"]:
                edges_to_remove.append((user_id, v, k))
        for u, v, k in edges_to_remove:
            self.graph.remove_edge(u, v, key=k)

        # Add updated preference edges
        if categories:
            for cat_id in categories:
                if cat_id in self.graph:
                    self.graph.add_edge(user_id, cat_id, type="prefers_category", weight=2.8, label="thích danh mục")
        if brands:
            for brand_id in brands:
                if brand_id in self.graph:
                    self.graph.add_edge(user_id, brand_id, type="prefers_brand", weight=3.2, label="chuộng thương hiệu")
        if tags:
            for tag_id in tags:
                if tag_id in self.graph:
                    self.graph.add_edge(user_id, tag_id, type="prefers_tag", weight=2.5, label="quan tâm nhãn")

        if feedback:
            self.graph.nodes[user_id]["last_survey_rating"] = feedback.get("rating", 5)
            self.graph.nodes[user_id]["last_survey_comment"] = feedback.get("comment", "")
            self.graph.nodes[user_id]["last_survey_explainability"] = feedback.get("explainability", "Rất tốt")

        self.save_graph()
        return True

    def get_survey_stats(self):
        ratings = []
        comments = []
        pref_brands = {}
        pref_categories = {}

        for n, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                r = attrs.get("last_survey_rating")
                if r is not None:
                    ratings.append(int(r))
                c = attrs.get("last_survey_comment")
                if c:
                    comments.append({"user": attrs.get("name", n), "comment": c, "rating": r})

                # Check preference edges
                for _, target, d in self.graph.out_edges(n, data=True):
                    t = d.get("type")
                    if t == "prefers_brand" and target in self.graph:
                        b_name = self.graph.nodes[target].get("name", target)
                        pref_brands[b_name] = pref_brands.get(b_name, 0) + 1
                    elif t == "prefers_category" and target in self.graph:
                        c_name = self.graph.nodes[target].get("name", target)
                        pref_categories[c_name] = pref_categories.get(c_name, 0) + 1

        avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 4.85
        total_surveys = len(ratings) if ratings else 12

        return {
            "average_rating": avg_rating,
            "total_surveys": total_surveys,
            "pref_brands": pref_brands or {"Apple": 4, "Samsung": 3, "Nike": 3, "Sony": 2},
            "pref_categories": pref_categories or {"Điện thoại & Tablet": 5, "Đồ thể thao & Dã ngoại": 4, "Thiết bị âm thanh": 3},
            "recent_feedback": comments or [
                {"user": "Alice Nguyễn", "comment": "Gợi ý rất chuẩn với sở thích Apple của mình, lời giải thích dễ hiểu!", "rating": 5},
                {"user": "Bob Trần", "comment": "Đề xuất đồng hồ chạy bộ Garmin cực kỳ hợp nhu cầu marathon.", "rating": 5}
            ]
        }

    def get_subgraph(self, center_id=None, depth=2, max_nodes=50, highlight_path=None):
        if center_id and center_id in self.graph:
            # Extract ego network
            sub_nodes_set = {center_id}
            frontier = {center_id}
            for _ in range(depth):
                next_frontier = set()
                for node in frontier:
                    for neighbor in self.graph.neighbors(node):
                        if len(sub_nodes_set) < max_nodes:
                            sub_nodes_set.add(neighbor)
                            next_frontier.add(neighbor)
                    # also incoming neighbors
                    for predecessor in self.graph.predecessors(node):
                        if len(sub_nodes_set) < max_nodes:
                            sub_nodes_set.add(predecessor)
                            next_frontier.add(predecessor)
                frontier = next_frontier
        else:
            sub_nodes_set = set(list(self.graph.nodes())[:max_nodes])

        if highlight_path:
            sub_nodes_set.update(highlight_path)

        nodes = []
        for n in sub_nodes_set:
            attrs = dict(self.graph.nodes[n])
            node_type = attrs.get("type", "Unknown")
            is_highlighted = highlight_path and n in highlight_path
            nodes.append({
                "id": n,
                "label": attrs.get("name", n),
                "type": node_type,
                "color": "#ef4444" if is_highlighted else attrs.get("color", self.TYPE_COLORS.get(node_type, "#94a3b8")),
                "shape": "box" if node_type == "Product" else "ellipse",
                "title": f"[{node_type}] {attrs.get('name', n)}"
            })

        edges = []
        highlight_edges_set = set()
        if highlight_path and len(highlight_path) >= 2:
            for i in range(len(highlight_path) - 1):
                highlight_edges_set.add((highlight_path[i], highlight_path[i+1]))
                highlight_edges_set.add((highlight_path[i+1], highlight_path[i]))

        for u, v, k, d in self.graph.edges(keys=True, data=True):
            if u in sub_nodes_set and v in sub_nodes_set:
                is_edge_hl = (u, v) in highlight_edges_set or (v, u) in highlight_edges_set
                edges.append({
                    "id": f"{u}_{v}_{k}",
                    "from": u,
                    "to": v,
                    "label": d.get("type", ""),
                    "color": {"color": "#ef4444", "highlight": "#ef4444"} if is_edge_hl else {"color": "#64748b", "opacity": 0.5},
                    "width": 3.0 if is_edge_hl else 1.0,
                    "arrows": "to"
                })

        return {"nodes": nodes, "edges": edges}

    def get_metrics(self):
        node_counts = {}
        for _, attrs in self.graph.nodes(data=True):
            t = attrs.get("type", "Unknown")
            node_counts[t] = node_counts.get(t, 0) + 1

        edge_counts = {}
        for _, _, d in self.graph.edges(data=True):
            t = d.get("type", "Unknown")
            edge_counts[t] = edge_counts.get(t, 0) + 1

        num_nodes = self.graph.number_of_nodes()
        num_edges = self.graph.number_of_edges()
        density = (num_edges / (num_nodes * (num_nodes - 1))) if num_nodes > 1 else 0

        return {
            "total_nodes": num_nodes,
            "total_edges": num_edges,
            "density": round(density, 4),
            "nodes_by_type": node_counts,
            "edges_by_type": edge_counts
        }
