// Admin Dashboard & Knowledge Graph Management Logic
const API_BASE = '/api';

let adminState = {
  products: [],
  users: [],
  metrics: null,
  graphData: null,
  visNetwork: null
};

document.addEventListener('DOMContentLoaded', async () => {
  setupAdminTabs();
  setupProductForm();
  await loadMetrics();
  await loadAdminProducts();
  await loadAdminUsers();
  await initAdminGraph();
});

function setupAdminTabs() {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-view-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.getAttribute('data-admin-view');
      const pane = document.getElementById(`adminView${view.charAt(0).toUpperCase() + view.slice(1)}`);
      if (pane) pane.classList.add('active');

      if (view === 'canvas' && adminState.visNetwork) {
        setTimeout(() => adminState.visNetwork.fit(), 200);
      }
    });
  });

  document.getElementById('btnResetCanvasZoom')?.addEventListener('click', () => {
    if (adminState.visNetwork) adminState.visNetwork.fit();
  });

  document.getElementById('btnRefreshAdminGraph')?.addEventListener('click', () => {
    initAdminGraph();
  });

  // Search in products table
  document.getElementById('adminProductSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    renderProductsTable(adminState.products.filter(p => 
      p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q))
    ));
  });
}

async function loadMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const data = await res.json();
    if (data.success && data.metrics) {
      adminState.metrics = data.metrics;
      document.getElementById('statTotalNodes').textContent = data.metrics.total_nodes || 0;
      document.getElementById('statTotalEdges').textContent = data.metrics.total_edges || 0;
      document.getElementById('statTotalProducts').textContent = data.metrics.nodes_by_type?.Product || 0;
      document.getElementById('statTotalUsers').textContent = data.metrics.nodes_by_type?.User || 0;
      document.getElementById('adminGraphLiveStats').textContent = `Đồ thị: ${data.metrics.total_nodes} nút • ${data.metrics.total_edges} cạnh (Mật độ: ${data.metrics.density})`;
    }
  } catch (err) {
    console.error('Error loading metrics:', err);
  }
}

// ========================================================
// VIS.JS 2D NETWORK CANVAS
// ========================================================
async function initAdminGraph() {
  const container = document.getElementById('visNetworkGraph');
  if (!container || typeof vis === 'undefined') return;

  try {
    const res = await fetch(`${API_BASE}/admin/graph-canvas`);
    const data = await res.json();
    const graphData = data.graph || data;
    adminState.graphData = graphData;

    const colorMap = {
      'User': '#3b82f6',
      'Product': '#10b981',
      'Category': '#f59e0b',
      'Brand': '#8b5cf6',
      'Purpose': '#ec4899',
      'Tag': '#ec4899',
      'Spec': '#64748b'
    };

    const nodesList = (graphData.nodes || []).map(n => ({
      id: n.id,
      label: n.label || n.name || n.id,
      title: `${n.type}: ${n.name || n.label || n.id}`,
      color: {
        background: colorMap[n.type] || '#94a3b8',
        border: '#ffffff',
        highlight: { background: '#ef4444', border: '#1e293b' }
      },
      font: { color: '#1e293b', size: 12, face: 'Inter' },
      shape: n.type === 'Product' ? 'box' : (n.type === 'User' ? 'circle' : 'ellipse'),
      raw: n
    }));

    const edgesList = (graphData.edges || graphData.links || []).map(l => ({
      from: l.from || l.source,
      to: l.to || l.target,
      label: l.label || l.type || l.relation || '',
      arrows: 'to',
      font: { size: 9, color: '#64748b', align: 'middle' },
      color: { color: '#cbd5e1', highlight: '#3b82f6' }
    }));

    const nodes = new vis.DataSet(nodesList);
    const edges = new vis.DataSet(edgesList);

    const options = {
      nodes: { borderWidth: 2, shadow: true },
      edges: { smooth: { type: 'continuous' } },
      physics: {
        stabilization: true,
        barnesHut: { gravitationalConstant: -2500, springLength: 120 }
      },
      interaction: { hover: true, tooltipDelay: 200 }
    };

    adminState.visNetwork = new vis.Network(container, { nodes, edges }, options);

    adminState.visNetwork.on('selectNode', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeObj = (graphData.nodes || []).find(n => n.id === nodeId);
        const connectedLinks = (graphData.edges || graphData.links || []).filter(l => 
          (l.from || l.source) === nodeId || (l.to || l.target) === nodeId
        );
        renderNodeDetailsPanel(nodeObj, connectedLinks);
      }
    });

    const focusSelect = document.getElementById('canvasFocusNodeSelect');
    if (focusSelect) {
      focusSelect.innerHTML = '<option value="">-- Xem toàn bộ đồ thị --</option>' +
        (graphData.nodes || []).map(n => `<option value="${n.id}">[${n.type}] ${n.label || n.name || n.id}</option>`).join('');
      focusSelect.onchange = (e) => {
        if (e.target.value && adminState.visNetwork) {
          adminState.visNetwork.focus(e.target.value, { scale: 1.2, animation: true });
        }
      };
    }

    document.getElementById('canvasNodeTypeFilter')?.addEventListener('change', (e) => {
      const type = e.target.value;
      if (type === 'all') {
        nodes.clear();
        nodes.add(nodesList);
      } else {
        nodes.clear();
        nodes.add(nodesList.filter(n => n.raw.type === type));
      }
    });

  } catch (err) {
    console.error('Error loading admin graph:', err);
  }
}

function renderNodeDetailsPanel(node, connectedLinks) {
  const panel = document.getElementById('visNodeDetailContent');
  if (!panel || !node) return;

  panel.innerHTML = `
    <div style="background:#f8fafc; padding:10px; border-radius:4px; border:1px solid #e2e8f0; margin-bottom:10px;">
      <strong style="color:#0f172a; font-size:14px;">${node.label || node.name || node.id}</strong><br>
      <span style="font-size:11px; background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px;">Loại: ${node.type}</span>
      <p style="font-size:12px; margin-top:6px; color:#475569;">${node.description || 'Không có mô tả bổ sung.'}</p>
    </div>
    <h5 style="font-size:12px; font-weight:700; margin-bottom:6px;">Liên kết Tri thức (${connectedLinks.length}):</h5>
    <ul style="font-size:11px; color:#334155; padding-left:16px;">
      ${connectedLinks.map(l => {
        const from = l.from || l.source;
        const to = l.to || l.target;
        const label = l.label || l.type || l.relation || 'liên kết';
        return `<li><code>${label}</code> ➔ ${from === node.id ? to : from}</li>`;
      }).join('')}
    </ul>
  `;
}

// ========================================================
// PRODUCT CRUD
// ========================================================
async function loadAdminProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    const data = await res.json();
    adminState.products = data.products || data || [];
    renderProductsTable(adminState.products);
  } catch (err) {
    console.error(err);
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('adminProductsTableBody');
  const badge = document.getElementById('adminProductCountBadge');
  if (!tbody) return;

  if (badge) badge.textContent = `${products.length} sản phẩm`;

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:24px;">Không tìm thấy sản phẩm nào.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr>
      <td><code>${p.id}</code></td>
      <td><img src="${p.image || 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400'}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;" /></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category || 'Thiết bị'}</td>
      <td><span class="brand-tag" style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:11px;">${p.brand || 'Khác'}</span></td>
      <td style="color:#dc2626; font-weight:700;">${formatPrice(p.price)}</td>
      <td>⭐ ${p.rating || 4.8}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteAdminProduct('${p.id}')">🗑️ Xóa</button>
      </td>
    </tr>
  `).join('');
}

function setupProductForm() {
  const modal = document.getElementById('adminProductModal');
  const btnOpenAdd = document.getElementById('btnOpenAddProductModal');
  const btnClose = document.getElementById('btnCloseAdminProdModal');
  const form = document.getElementById('adminProductForm');

  btnOpenAdd?.addEventListener('click', () => {
    document.getElementById('adminProdModalTitle').textContent = 'Thêm Sản Phẩm Mới Vào Đồ Thị';
    document.getElementById('adminProdEditId').value = '';
    form.reset();
    modal.style.display = 'flex';
  });

  btnClose?.addEventListener('click', () => modal.style.display = 'none');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('adminProdEditId').value;
    const name = document.getElementById('adminProdName').value.trim();
    const customId = document.getElementById('adminProdId').value.trim() || `p_${Date.now()}`;
    const category_id = document.getElementById('adminProdCat').value;
    const brand_id = document.getElementById('adminProdBrand').value.trim();
    const price = parseFloat(document.getElementById('adminProdPrice').value);
    const image = document.getElementById('adminProdImage').value.trim() || 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400';
    const tag_ids = Array.from(document.querySelectorAll('input[name="admin_prod_purpose"]:checked')).map(c => c.value);
    const description = document.getElementById('adminProdDesc').value.trim();

    const payload = {
      id: customId,
      name,
      price,
      image,
      description,
      category_id,
      brand_id,
      tag_ids
    };

    try {
      const res = await fetch(`${API_BASE}/admin/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        modal.style.display = 'none';
        showToast(data.message || 'Lưu sản phẩm thành công!', 'success');
        await loadAdminProducts();
        await loadMetrics();
        await initAdminGraph();
      } else {
        showToast(data.error || 'Lỗi khi lưu sản phẩm!', 'error');
      }
    } catch (err) {
      showToast('Lỗi máy chủ khi thêm sản phẩm!', 'error');
    }
  });
}

window.deleteAdminProduct = async function(productId) {
  if (!confirm(`Bạn có chắc muốn xóa sản phẩm ${productId} khỏi Đồ thị Tri thức?`)) return;
  try {
    const res = await fetch(`${API_BASE}/admin/products/${productId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Đã xóa sản phẩm!', 'success');
      await loadAdminProducts();
      await loadMetrics();
      await initAdminGraph();
    } else {
      showToast(data.error || 'Xóa thất bại!', 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối khi xóa!', 'error');
  }
};

// ========================================================
// USER PROFILES
// ========================================================
async function loadAdminUsers() {
  const container = document.getElementById('adminUsersList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    const users = data.users || data || [];
    adminState.users = users;

    container.innerHTML = users.map(u => `
      <div class="user-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:14px;">
          <img src="${u.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0;" />
          <div>
            <h4 style="margin:0; font-size:15px; color:#0f172a;">${u.name || u.full_name || u.username} <code style="font-size:11px; color:#64748b;">(${u.id})</code></h4>
            <span style="font-size:12px; color:#475569;">${u.role || 'Người dùng'} • ${u.email || ''}</span>
            <div style="font-size:12px; color:#334155; margin-top:4px;">
              🎯 <b>Nhu cầu hiện tại:</b> ${u.wishlist_need || (u.wishlist && u.wishlist.length ? u.wishlist[0].query : 'Chưa ghi nhận')}
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="badge" style="background:#dcfce7; color:#166534; font-size:11px; padding:3px 8px; border-radius:12px;">Đã kích hoạt KG</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function formatPrice(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
