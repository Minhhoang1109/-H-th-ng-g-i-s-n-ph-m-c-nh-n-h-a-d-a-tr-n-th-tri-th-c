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
        "prefers_tag": 2.0,
        "wants": 4.0,
        "reviewed": 2.0
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
            "login_count": 1,
            "survey_completed": False,
            "wishlist": [],
            "color": self.TYPE_COLORS.get("User", "#3b82f6")
        }
        self.graph.add_node(user_id, **user_attrs)

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
                    authenticated = False
                    if stored_hash:
                        if stored_hash == pwd_hash:
                            authenticated = True
                    else:
                        if password == "123456":
                            authenticated = True

                    if authenticated:
                        current_logins = self.graph.nodes[node_id].get("login_count", 1) + 1
                        self.graph.nodes[node_id]["login_count"] = current_logins
                        self.save_graph()
                        user = self.get_user(node_id)
                        user["is_second_login"] = (current_logins >= 2)
                        return user
        return None

    def set_user_wishlist(self, user_id, target_query, target_items=None):
        """Sets target need / wishlist for 2nd login and builds KG connection edges"""
        if user_id not in self.graph:
            raise ValueError(f"User {user_id} not found")

        user_node = self.graph.nodes[user_id]
        if "wishlist" not in user_node or not isinstance(user_node["wishlist"], list):
            user_node["wishlist"] = []

        item_entry = {
            "query": target_query,
            "timestamp": str(os.urandom(4).hex()),
            "items": target_items or []
        }
        user_node["wishlist"].append(item_entry)
        user_node["last_target_need"] = target_query

        # Create 'wants' edge to matching products or tags
        q_lower = target_query.lower()
        for prod_id, p_attrs in self.graph.nodes(data=True):
            if p_attrs.get("type") == "Product":
                p_name = p_attrs.get("name", "").lower()
                p_desc = p_attrs.get("description", "").lower()
                if any(w in p_name or w in p_desc for w in q_lower.split()):
                    self.graph.add_edge(user_id, prod_id, type="wants", weight=4.0, label="mong muốn")

        if target_items:
            for itm in target_items:
                if itm in self.graph:
                    self.graph.add_edge(user_id, itm, type="wants", weight=4.0, label="mong muốn")

        self.save_graph()
        return user_node["wishlist"]

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
            prod["bought_together_items"] = [
                self.graph.nodes[v]["name"]
                for _, v, d in self.graph.out_edges(product_id, data=True)
                if d.get("type") == "bought_together" and v in self.graph
            ]
            return prod
        return None

    def get_products(self):
        products = []
        for node_id, attrs in self.graph.nodes(data=True):
            if attrs.get("type") == "Product":
                prod = self.get_product(node_id)
                if prod:
                    products.append(prod)
        return products

    def add_product(self, prod_id, name, price, rating=4.8, image=None, description=None, category_id=None, brand_id=None, tag_ids=None, compatible_ids=None):
        if not prod_id or not name:
            raise ValueError("Mã sản phẩm (ID) và Tên sản phẩm là bắt buộc!")

        if prod_id in self.graph:
            raise ValueError(f"Mã sản phẩm '{prod_id}' đã tồn tại trong đồ thị!")

        default_img = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400"
        attrs = {
            "id": prod_id,
            "type": "Product",
            "name": name,
            "price": int(price),
            "rating": float(rating),
            "image": image or default_img,
            "description": description or f"Sản phẩm công nghệ cao cấp {name}.",
            "reviews": [],
            "color": self.TYPE_COLORS["Product"]
        }
        self.graph.add_node(prod_id, **attrs)

        if category_id and category_id in self.graph:
            self.graph.add_edge(prod_id, category_id, type="belongs_to", weight=1.5, label="thuộc danh mục")
        if brand_id and brand_id in self.graph:
            self.graph.add_edge(prod_id, brand_id, type="produced_by", weight=2.0, label="sản xuất bởi")
        if tag_ids:
            for t in tag_ids:
                if t in self.graph:
                    self.graph.add_edge(prod_id, t, type="has_tag", weight=1.4, label="có đặc tính")
        if compatible_ids:
            for c in compatible_ids:
                if c in self.graph:
                    self.graph.add_edge(prod_id, c, type="bought_together", weight=2.8, label="tương thích mua kèm")
                    self.graph.add_edge(c, prod_id, type="bought_together", weight=2.8, label="tương thích mua kèm")

        self.save_graph()
        return self.get_product(prod_id)

    def update_product(self, prod_id, name=None, price=None, rating=None, image=None, description=None):
        if prod_id not in self.graph:
            raise ValueError(f"Sản phẩm {prod_id} không tồn tại!")
        p = self.graph.nodes[prod_id]
        if name: p["name"] = name
        if price is not None: p["price"] = int(price)
        if rating is not None: p["rating"] = float(rating)
        if image: p["image"] = image
        if description: p["description"] = description
        self.save_graph()
        return self.get_product(prod_id)

    def delete_product(self, prod_id):
        if prod_id not in self.graph:
            raise ValueError(f"Sản phẩm {prod_id} không tồn tại!")
        self.graph.remove_node(prod_id)
        self.save_graph()
        return True

    def add_product_review(self, user_id, product_id, rating, comment, pros="", cons=""):
        if product_id not in self.graph:
            raise ValueError(f"Sản phẩm {product_id} không tồn tại!")
        
        user_name = self.graph.nodes[user_id].get("name", user_id) if user_id in self.graph else "Khách hàng"
        prod = self.graph.nodes[product_id]
        if "reviews" not in prod or not isinstance(prod["reviews"], list):
            prod["reviews"] = []

        review_obj = {
            "user_id": user_id,
            "user_name": user_name,
            "rating": int(rating),
            "comment": comment,
            "pros": pros,
            "cons": cons,
            "date": "Vừa xong"
        }
        prod["reviews"].append(review_obj)

        # Update average rating
        all_ratings = [r["rating"] for r in prod["reviews"]]
        if all_ratings:
            prod["rating"] = round(sum(all_ratings) / len(all_ratings), 1)

        # Add reviewed edge
        if user_id in self.graph:
            self.graph.add_edge(user_id, product_id, type="reviewed", weight=2.0, label="đã đánh giá")

        self.save_graph()
        return review_obj

    def get_product_reviews(self, product_id):
        if product_id in self.graph:
            return self.graph.nodes[product_id].get("reviews", [])
        return []

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
                login_count=1,
                survey_completed=False,
                wishlist=[],
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

    def apply_detailed_survey(self, user_id, survey_data):
        if user_id not in self.graph:
            raise ValueError(f"User {user_id} not found")

        categories = survey_data.get("categories", [])
        brands = survey_data.get("brands", [])
        tags = survey_data.get("tags", [])
        hardware_specs = survey_data.get("hardware_specs", {})
        budget = survey_data.get("budget", "all")
        feedback = survey_data.get("feedback", {})

        # Remove previous survey preference edges
        edges_to_remove = []
        for _, v, k, d in self.graph.out_edges(user_id, keys=True, data=True):
            if d.get("type") in ["prefers_category", "prefers_brand", "prefers_tag", "prefers_spec"]:
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
                    self.graph.add_edge(user_id, tag_id, type="prefers_tag", weight=2.5, label="quan tâm đặc tính")

        user_node = self.graph.nodes[user_id]
        user_node["survey_completed"] = True
        user_node["detailed_survey"] = {
            "categories": categories,
            "brands": brands,
            "tags": tags,
            "hardware_specs": hardware_specs,
            "budget": budget
        }

        if feedback:
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

    def get_admin_graph_data(self, filter_type=None, entity_id=None, depth=2, max_nodes=120):
        """Returns visual graph network dataset for Admin Visual KG Canvas"""
        if entity_id and entity_id in self.graph:
            sub_nodes = set([entity_id])
            current_layer = set([entity_id])
            for _ in range(depth):
                next_layer = set()
                for n in current_layer:
                    neighbors = set(self.graph.successors(n)).union(set(self.graph.predecessors(n)))
                    next_layer.update(neighbors)
                sub_nodes.update(next_layer)
                current_layer = next_layer
                if len(sub_nodes) >= max_nodes:
                    break
            sub_nodes_list = list(sub_nodes)[:max_nodes]
        else:
            if filter_type and filter_type != "all":
                sub_nodes_list = [n for n, d in self.graph.nodes(data=True) if d.get("type") == filter_type][:max_nodes]
            else:
                sub_nodes_list = list(self.graph.nodes())[:max_nodes]

        sub_nodes_set = set(sub_nodes_list)

        nodes = []
        for n in sub_nodes_list:
            attrs = dict(self.graph.nodes[n])
            node_type = attrs.get("type", "Unknown")
            degree = self.graph.degree(n)
            size = 18 + min(20, degree * 2)

            nodes.append({
                "id": n,
                "label": attrs.get("name", n),
                "type": node_type,
                "color": attrs.get("color", self.TYPE_COLORS.get(node_type, "#94a3b8")),
                "shape": "box" if node_type == "Product" else "ellipse",
                "size": size,
                "title": f"[{node_type}] {attrs.get('name', n)} (Bậc kết nối: {degree})",
                "degree": degree,
                "role": attrs.get("role", ""),
                "price": attrs.get("price", 0)
            })

        edges = []
        for u, v, k, d in self.graph.edges(keys=True, data=True):
            if u in sub_nodes_set and v in sub_nodes_set:
                edges.append({
                    "id": f"{u}_{v}_{k}",
                    "from": u,
                    "to": v,
                    "label": d.get("label", d.get("type", "")),
                    "type": d.get("type", ""),
                    "weight": d.get("weight", 1.0),
                    "arrows": "to"
                })

        return {
            "nodes": nodes,
            "edges": edges,
            "metrics": self.get_metrics()
        }

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
