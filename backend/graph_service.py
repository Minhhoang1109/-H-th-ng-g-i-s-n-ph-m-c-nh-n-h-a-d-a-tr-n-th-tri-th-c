import json
import os
import hashlib
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
        self.load_graph()

    def _hash_password(self, password):
        return hashlib.sha256(password.encode('utf-8')).hexdigest()

    def load_graph(self, path=None):
        path = path or self.graph_path
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
            e.pop("color", None)
            edges.append(e)
        data = {"nodes": nodes, "edges": edges}
        with open(target, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get_users(self):
        users = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                out_degree = self.graph.out_degree(node_id)
                u = dict(attrs)
                u["interactions_count"] = out_degree
                u.pop("password_hash", None)
                users.append(u)
        return sorted(users, key=lambda x: x.get("id"))

    def get_user(self, user_id):
        if user_id in self.graph and self.graph.nodes[user_id].get("type") == "User":
            u = dict(self.graph.nodes[user_id])
            u["interactions_count"] = self.graph.out_degree(user_id)
            u.pop("password_hash", None)
            return u
        return None

    def register_user(self, username, password, name, role="Người dùng mới", email=None, categories=None, brands=None, tags=None):
        username = username.strip().lower()
        if not username or not password or not name:
            raise ValueError("Vui lòng điền đầy đủ Tên đăng nhập, Mật khẩu và Họ tên!")

        # Check existing username or email
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                existing_user = (attrs.get("username") or node_id).lower()
                existing_email = (attrs.get("email") or "").lower()
                if existing_user == username:
                    raise ValueError(f"Tên đăng nhập '{username}' đã được sử dụng. Vui lòng chọn tên khác!")
                if email and existing_email and existing_email == email.lower():
                    raise ValueError(f"Email '{email}' đã được đăng ký. Vui lòng sử dụng email khác!")

        user_id = f"u_{username}"
        if user_id in self.graph:
            user_id = f"u_{username}_{int(os.urandom(2).hex(), 16)}"

        pwd_hash = self._hash_password(password)
        avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"
        
        user_attrs = {
            "id": user_id,
            "type": "User",
            "name": name,
            "username": username,
            "email": email or f"{username}@gmail.com",
            "role": role,
            "password_hash": pwd_hash,
            "avatar": avatar,
            "color": self.TYPE_COLORS.get("User", "#3b82f6")
        }
        self.graph.add_node(user_id, **user_attrs)

        # Onboarding preferences for cold start
        if categories:
            for cat_id in categories:
                if cat_id in self.graph:
                    self.graph.add_edge(user_id, cat_id, type="prefers_category", weight=2.8, label="thích danh mục")
        if brands:
            for brand_id in brands:
                if brand_id in self.graph:
                    self.graph.add_edge(user_id, brand_id, type="prefers_brand", weight=3.0, label="chuộng thương hiệu")
        if tags:
            for tag_id in tags:
                if tag_id in self.graph:
                    self.graph.add_edge(user_id, tag_id, type="prefers_tag", weight=2.5, label="quan tâm đặc tính")

        self.save_graph()
        return self.get_user(user_id)

    def authenticate_user(self, username_or_email, password):
        query = username_or_email.strip().lower()
        pwd_hash = self._hash_password(password)

        demo_usernames = {
            "u1": "alice",
            "u2": "bob",
            "u3": "charlie",
            "u4": "diana",
            "u5": "edward",
            "u_new": "newuser"
        }

        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                u_name = (attrs.get("username") or demo_usernames.get(node_id, node_id)).lower()
                u_email = (attrs.get("email") or f"{u_name}@gmail.com").lower()
                u_id = node_id.lower()

                if query in [u_name, u_email, u_id]:
                    stored_hash = attrs.get("password_hash")
                    if stored_hash:
                        if stored_hash == pwd_hash:
                            return self.get_user(node_id)
                    else:
                        if password == "123456":
                            return self.get_user(node_id)
        return None

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

    def get_products(self):
        products = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "Product":
                prod = dict(attrs)
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

    def get_categories(self):
        return [dict(attrs) for _, attrs in self.graph.nodes(data=True) if attrs.get("type") == "Category"]

    def get_brands(self):
        return [dict(attrs) for _, attrs in self.graph.nodes(data=True) if attrs.get("type") == "Brand"]

    def get_tags(self):
        return [dict(attrs) for _, attrs in self.graph.nodes(data=True) if attrs.get("type") == "Tag"]

    def add_interaction(self, user_id, product_id, interaction_type):
        if user_id not in self.graph:
            raise ValueError(f"User {user_id} not found")
        if product_id not in self.graph:
            raise ValueError(f"Product {product_id} not found")

        weight = self.INTERACTION_WEIGHTS.get(interaction_type, 1.0)
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

        edges_to_remove = []
        for _, v, k, d in self.graph.out_edges(user_id, keys=True, data=True):
            if d.get("type") in ["prefers_category", "prefers_brand", "prefers_tag"]:
                edges_to_remove.append((user_id, v, k))
        for u, v, k in edges_to_remove:
            self.graph.remove_edge(u, v, key=k)

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
                    self.graph.add_edge(user_id, tag_id, type="prefers_tag", weight=2.5, label="quan tâm đặc tính")

        if feedback:
            user_node = self.graph.nodes[user_id]
            if "rating" in feedback:
                user_node["last_survey_rating"] = feedback["rating"]
            if "comment" in feedback:
                user_node["last_survey_comment"] = feedback["comment"]
            if "explainability" in feedback:
                user_node["last_survey_explainability"] = feedback["explainability"]

        self.save_graph()
        return True

    def get_survey_stats(self):
        total_surveys = 0
        total_rating = 0
        recent_feedback = []
        brand_counts = {}
        category_counts = {}

        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "User":
                if "last_survey_rating" in attrs:
                    total_surveys += 1
                    total_rating += attrs["last_survey_rating"]
                    if attrs.get("last_survey_comment"):
                        recent_feedback.append({
                            "user": attrs.get("name", node_id),
                            "rating": attrs["last_survey_rating"],
                            "comment": attrs["last_survey_comment"]
                        })

                for _, v, d in self.graph.out_edges(node_id, data=True):
                    if d.get("type") == "prefers_brand" and v in self.graph:
                        brand_name = self.graph.nodes[v].get("name", v)
                        brand_counts[brand_name] = brand_counts.get(brand_name, 0) + 1
                    elif d.get("type") == "prefers_category" and v in self.graph:
                        cat_name = self.graph.nodes[v].get("name", v)
                        category_counts[cat_name] = category_counts.get(cat_name, 0) + 1

        avg_rating = round(total_rating / total_surveys, 2) if total_surveys > 0 else 5.0
        return {
            "total_surveys": total_surveys,
            "average_rating": avg_rating,
            "pref_brands": brand_counts,
            "pref_categories": category_counts,
            "recent_feedback": recent_feedback[:5]
        }

    def get_subgraph(self, center_id=None, depth=2, max_nodes=60, highlight_path=None):
        if not center_id or center_id not in self.graph:
            user_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("type") == "User"]
            center_id = user_nodes[0] if user_nodes else list(self.graph.nodes())[0]

        sub_nodes = set([center_id])
        current_layer = set([center_id])

        for _ in range(depth):
            next_layer = set()
            for n in current_layer:
                neighbors = set(self.graph.successors(n)).union(set(self.graph.predecessors(n)))
                next_layer.update(neighbors)
            sub_nodes.update(next_layer)
            current_layer = next_layer
            if len(sub_nodes) >= max_nodes:
                break

        if highlight_path:
            sub_nodes.update([p for p in highlight_path if p in self.graph])

        sub_nodes_list = list(sub_nodes)[:max_nodes]
        sub_nodes_set = set(sub_nodes_list)

        nodes = []
        for n in sub_nodes_list:
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
