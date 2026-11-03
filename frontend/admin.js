// Admin Dashboard & Knowledge Graph Management Logic
const API_BASE = '/api';

let adminState = {
  products: [],
  users: [],
  bankAccounts: [],
  paymentCodes: [],
  metrics: null,
  graphData: null,
  visNetwork: null
};

document.addEventListener('DOMContentLoaded', async () => {
  // Check admin authorization
  const sessionStr = localStorage.getItem('kh_recsys_session');
  let isAuthorizedAdmin = false;
  if (sessionStr) {
    try {
      const session = JSON.parse(sessionStr);
      if (session && (session.is_admin || session.username === 'admin' || session.id === 'admin')) {
        isAuthorizedAdmin = true;
      }
    } catch (e) {}
  }

  if (!isAuthorizedAdmin) {
    alert('Truy cập bị từ chối! Bạn cần đăng nhập tài khoản có quyền Quản trị viên (Admin) để vào trang này.');
    window.location.href = '/';
    return;
  }

  setupAdminTabs();
  setupProductForm();
  setupAdminUserModalEvents();
  setupPaymentManagement();
  
  document.getElementById('btnAdminLogout')?.addEventListener('click', () => {
    localStorage.removeItem('kh_recsys_session');
    window.location.href = '/';
  });

  await loadMetrics();
  await loadAdminProducts();
  await loadAdminUsers();
  await initAdminGraph();
});

function setupAdminTabs() {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-view-pane').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      btn.classList.add('active');
      const view = btn.getAttribute('data-admin-view');
      const pane = document.getElementById(`adminView${view.charAt(0).toUpperCase() + view.slice(1)}`);
      if (pane) {
        pane.classList.add('active');
        pane.style.display = 'block';
      }

      if (view === 'canvas' && adminState.visNetwork) {
        setTimeout(() => adminState.visNetwork.fit(), 200);
      } else if (view === 'products') {
        if (!adminState.products || adminState.products.length === 0) {
          loadAdminProducts();
        } else {
          renderProductsTable(adminState.products);
        }
      } else if (view === 'users') {
        if (!adminState.users || adminState.users.length === 0) {
          loadAdminUsers();
        } else {
          renderAdminUsers(adminState.users);
        }
      } else if (view === 'payments') {
        loadAdminPayments();
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
    renderProductsTable(adminState.products.filter(p => {
      const cat = (p.categories && p.categories.join(' ')) || p.category || '';
      const brand = (p.brands && p.brands.join(' ')) || p.brand || '';
      return p.name.toLowerCase().includes(q) || 
             p.id.toLowerCase().includes(q) || 
             brand.toLowerCase().includes(q) ||
             cat.toLowerCase().includes(q);
    }));
  });

  // Search in users list
  document.getElementById('adminUserSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    renderAdminUsers(adminState.users.filter(u => 
      (u.name && u.name.toLowerCase().includes(q)) || 
      (u.username && u.username.toLowerCase().includes(q)) || 
      (u.id && u.id.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
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

    adminState.visNetwork.once('stabilizationIterationsDone', () => {
      adminState.visNetwork.fit({ animation: { duration: 400 } });
    });

    // Fallback fit after 300ms
    setTimeout(() => {
      if (adminState.visNetwork) {
        adminState.visNetwork.fit();
      }
    }, 300);

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
    const typeFilter = document.getElementById('canvasNodeTypeFilter');

    function applyAdminGraphFilters() {
      const selectedFocusId = focusSelect ? focusSelect.value : '';
      const selectedType = typeFilter ? typeFilter.value : 'all';

      let filteredNodes = nodesList;
      let filteredEdges = edgesList;

      // 1. If a Focus Node (Điểm neo) is chosen, only keep the focus node + direct neighbors + connections between them
      if (selectedFocusId) {
        const neighborNodeIds = new Set([selectedFocusId]);
        const activeEdges = [];

        edgesList.forEach(e => {
          if (e.from === selectedFocusId || e.to === selectedFocusId) {
            neighborNodeIds.add(e.from);
            neighborNodeIds.add(e.to);
            activeEdges.push(e);
          }
        });

        filteredNodes = nodesList.filter(n => neighborNodeIds.has(n.id));
        filteredEdges = activeEdges;

        // Auto display details panel for this focus node
        const nodeObj = (graphData.nodes || []).find(n => n.id === selectedFocusId);
        const connectedLinks = (graphData.edges || graphData.links || []).filter(l => 
          (l.from || l.source) === selectedFocusId || (l.to || l.target) === selectedFocusId
        );
        if (nodeObj) renderNodeDetailsPanel(nodeObj, connectedLinks);
      }

      // 2. If node type filter is active
      if (selectedType !== 'all') {
        filteredNodes = filteredNodes.filter(n => n.raw.type === selectedType || n.id === selectedFocusId);
        const validNodeIds = new Set(filteredNodes.map(n => n.id));
        filteredEdges = filteredEdges.filter(e => validNodeIds.has(e.from) && validNodeIds.has(e.to));
      }

      nodes.clear();
      nodes.add(filteredNodes);

      edges.clear();
      edges.add(filteredEdges);

      setTimeout(() => {
        if (adminState.visNetwork) {
          adminState.visNetwork.fit({ animation: { duration: 300 } });
        }
      }, 100);
    }

    if (focusSelect) {
      focusSelect.innerHTML = '<option value="">-- Xem toàn bộ đồ thị --</option>' +
        (graphData.nodes || []).map(n => `<option value="${n.id}">[${n.type}] ${n.label || n.name || n.id}</option>`).join('');
      focusSelect.onchange = applyAdminGraphFilters;
    }

    typeFilter?.addEventListener('change', applyAdminGraphFilters);

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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:32px;">Không tìm thấy sản phẩm nào.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => {
    const categoryName = (p.categories && p.categories.length > 0) ? p.categories.join(', ') : (p.category || 'Thiết bị');
    const brandName = (p.brands && p.brands.join(', ')) ? p.brands.join(', ') : (p.brand || 'Khác');
    const displayImg = p.image || 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400';

    return `
      <tr>
        <td><code>${p.id}</code></td>
        <td><img src="${displayImg}" style="width:42px; height:42px; object-fit:cover; border-radius:6px; border:1px solid #e2e8f0;" onerror="this.src='https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400'" /></td>
        <td>
          <strong style="color:#0f172a;">${p.name}</strong>
          ${p.description ? `<p style="font-size:11px; color:#64748b; margin:2px 0 0; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.description}</p>` : ''}
        </td>
        <td><span style="font-size:12px; color:#334155; font-weight:500;">${categoryName}</span></td>
        <td><span class="brand-tag" style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:600;">${brandName}</span></td>
        <td style="color:#dc2626; font-weight:700; white-space:nowrap;">${formatPrice(p.price)}</td>
        <td style="white-space:nowrap;">⭐ ${p.rating || 4.8}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAdminProduct('${p.id}')" style="cursor:pointer; padding:4px 8px; font-size:12px;">🗑️ Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadCategoriesIntoForm() {
  const select = document.getElementById('adminProdCat');
  if (!select) return;
  try {
    const res = await fetch(`${API_BASE}/metadata`);
    const data = await res.json();
    if (data.categories && data.categories.length > 0) {
      select.innerHTML = data.categories.map(c => 
        `<option value="${c.id}">${c.name || c.id}</option>`
      ).join('');
    }
  } catch (e) {
    console.warn('Could not load categories for modal:', e);
  }
}

function setupProductForm() {
  const modal = document.getElementById('adminProductModal');
  const btnOpenAdd = document.getElementById('btnOpenAddProductModal');
  const btnClose = document.getElementById('btnCloseAdminProdModal');
  const form = document.getElementById('adminProductForm');

  btnOpenAdd?.addEventListener('click', async () => {
    document.getElementById('adminProdModalTitle').textContent = 'Thêm Sản Phẩm Mới Vào Đồ Thị';
    document.getElementById('adminProdEditId').value = '';
    form.reset();
    await loadCategoriesIntoForm();
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
function renderAdminUsers(users) {
  const container = document.getElementById('adminUsersList');
  const badge = document.getElementById('adminUserCountBadge');
  if (!container) return;

  if (badge) badge.textContent = `${users.length} người dùng`;

  if (users.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:32px; background:#fff; border-radius:8px;">Không tìm thấy người dùng nào phù hợp.</div>';
    return;
  }

  container.innerHTML = users.map(u => {
    let targetNeed = u.wishlist_need || u.last_target_need;
    if (!targetNeed && u.wishlist && u.wishlist.length > 0) {
      const lastItem = u.wishlist[u.wishlist.length - 1];
      targetNeed = typeof lastItem === 'object' ? (lastItem.query || lastItem.name) : lastItem;
    }
    if (!targetNeed) targetNeed = 'Chưa ghi nhận';

    const catsHtml = (u.preferred_categories || []).map(c => 
      `<span style="background:#f1f5f9; color:#1e293b; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-block; margin-top:3px;">${c.icon || '🏷️'} ${c.name}</span>`
    ).join('');

    const brandsHtml = (u.preferred_brands || []).map(b => 
      `<span style="background:#ede9fe; color:#6d28d9; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-block; margin-top:3px;">🏢 ${b.name}</span>`
    ).join('');

    const tagsHtml = (u.preferred_tags || []).map(t => 
      `<span style="background:#fce7f3; color:#be185d; padding:2px 6px; border-radius:4px; font-size:11px; margin-right:4px; display:inline-block; margin-top:3px;">🎯 ${t.name}</span>`
    ).join('');

    return `
      <div class="user-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-start; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; align-items:flex-start; gap:16px;">
          <img src="${u.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" style="width:54px; height:54px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0; flex-shrink:0; margin-top:2px;" />
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h4 style="margin:0; font-size:15px; color:#0f172a; font-weight:700;">${u.name || u.full_name || u.username} <code style="font-size:11px; color:#64748b; font-weight:normal;">(${u.id})</code></h4>
              <span class="badge" style="background:${u.is_admin ? '#fef3c7; color:#b45309;' : '#eff6ff; color:#1d4ed8;'} font-size:11px; padding:1px 6px; border-radius:8px;">${u.is_admin ? 'Quản trị viên' : (u.role || 'Người dùng')}</span>
            </div>
            <span style="font-size:12px; color:#475569;">${u.email || ''} • Đăng nhập: <b>${u.login_count || 1}</b> lần • Liên kết KG: <b>${u.interactions_count || 0}</b> bậc</span>
            
            <div style="font-size:12px; color:#334155; margin-top:6px;">
              🎯 <b>Nhu cầu / Tìm kiếm:</b> <span style="color:#0284c7; font-weight:600;">${targetNeed}</span>
            </div>

            ${(catsHtml || brandsHtml || tagsHtml) ? `
              <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
                ${catsHtml} ${brandsHtml} ${tagsHtml}
              </div>
            ` : ''}
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <span class="badge" style="background:#dcfce7; color:#166534; font-size:12px; padding:4px 10px; border-radius:12px; font-weight:600;">Đã kích hoạt KG</span>
          <button class="btn btn-sm btn-ebay-outline" onclick="openAdminEditUserModal('${u.id}')" style="font-size:12px; padding:3px 10px;">✏️ Sửa hồ sơ</button>
        </div>
      </div>
    `;
  }).join('');
}

window.openAdminEditUserModal = function(userId) {
  const user = adminState.users.find(u => u.id === userId);
  if (!user) return;

  document.getElementById('adminEditUserId').value = user.id;
  document.getElementById('adminEditUserName').value = user.name || user.full_name || user.username || '';
  document.getElementById('adminEditUserRole').value = user.role || '';
  document.getElementById('adminEditUserEmail').value = user.email || '';
  document.getElementById('adminEditUserPhone').value = user.phone || '';
  document.getElementById('adminEditUserBio').value = user.bio || '';

  const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`;
  document.getElementById('adminEditUserAvatar').value = user.avatar || '';
  document.getElementById('adminEditUserAvatarPreview').src = avatarUrl;

  let targetNeed = user.last_target_need || user.wishlist_need;
  if (!targetNeed && user.wishlist && user.wishlist.length > 0) {
    const lastItem = user.wishlist[user.wishlist.length - 1];
    targetNeed = typeof lastItem === 'object' ? (lastItem.query || lastItem.name) : lastItem;
  }
  document.getElementById('adminEditUserTargetNeed').value = targetNeed || '';

  document.getElementById('adminUserModal').style.display = 'flex';
};

function setupAdminUserModalEvents() {
  const modal = document.getElementById('adminUserModal');
  const btnClose = document.getElementById('btnCloseAdminUserModal');
  const btnCancel = document.getElementById('btnCancelAdminUserModal');
  const form = document.getElementById('adminUserForm');
  const avatarInput = document.getElementById('adminEditUserAvatar');

  btnClose?.addEventListener('click', () => modal.style.display = 'none');
  btnCancel?.addEventListener('click', () => modal.style.display = 'none');

  avatarInput?.addEventListener('input', () => {
    const val = avatarInput.value.trim();
    const prev = document.getElementById('adminEditUserAvatarPreview');
    if (val && prev) prev.src = val;
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('adminEditUserId').value;
    const name = document.getElementById('adminEditUserName').value.trim();
    const email = document.getElementById('adminEditUserEmail').value.trim();
    const phone = document.getElementById('adminEditUserPhone').value.trim();
    const role = document.getElementById('adminEditUserRole').value.trim();
    const avatar = document.getElementById('adminEditUserAvatar').value.trim();
    const targetNeed = document.getElementById('adminEditUserTargetNeed').value.trim();
    const bio = document.getElementById('adminEditUserBio').value.trim();

    const btnSubmit = document.getElementById('btnSaveAdminUserModal');
    const origText = btnSubmit ? btnSubmit.innerHTML : '💾 Lưu';
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '⏳ Đang lưu...';
    }

    try {
      const res = await fetch(`${API_BASE}/user/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name, email, phone, role, avatar, bio, target_need: targetNeed })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        modal.style.display = 'none';
        showToast('Cập nhật hồ sơ người dùng thành công!', 'success');
        await loadAdminUsers();
      } else {
        showToast(data.error || 'Lỗi cập nhật hồ sơ!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ!', 'error');
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = origText;
      }
    }
  });
}

async function loadAdminUsers() {
  const container = document.getElementById('adminUsersList');
  try {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    adminState.users = data.users || data || [];
    renderAdminUsers(adminState.users);
  } catch (err) {
    console.error('Error loading users:', err);
    if (container) {
      container.innerHTML = `<div style="color:#dc2626; padding:16px;">Lỗi tải danh sách người dùng: ${err.message}</div>`;
    }
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

// ========================================================
// ADMIN PAYMENT & BANK ACCOUNTS MANAGEMENT
// ========================================================
async function loadAdminPayments() {
  try {
    const res = await fetch(`${API_BASE}/payment-settings`);
    const data = await res.json();
    if (data.success) {
      adminState.bankAccounts = data.bank_accounts || [];
      adminState.paymentCodes = data.payment_codes || [];
      renderBankAccountsTable(adminState.bankAccounts);
      renderPaymentCodesTable(adminState.paymentCodes);
    }
  } catch (err) {
    console.error('Lỗi tải cài đặt thanh toán:', err);
    showToast('Lỗi tải dữ liệu thanh toán và ngân hàng!', 'error');
  }
}

function renderBankAccountsTable(accounts) {
  const tbody = document.getElementById('adminBankAccountsTableBody');
  if (!tbody) return;

  if (!accounts || accounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#94a3b8;">Chưa có tài khoản ngân hàng nào. Hãy bấm "Thêm Tài Khoản Ngân Hàng"!</td></tr>`;
    return;
  }

  tbody.innerHTML = accounts.map(acc => {
    const isDefault = !!acc.is_default;
    const isActive = !!acc.is_active;
    const qrUrl = `https://img.vietqr.io/image/${acc.bank_id}-${acc.account_number}-compact2.png?amount=100000&accountName=${encodeURIComponent(acc.account_name)}`;

    return `
      <tr style="${isDefault ? 'background:#f0fdf4;' : ''}">
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:#1e3a8a; color:#fff; font-weight:800; font-size:11px; padding:2px 6px;">${acc.bank_id}</span>
            <b style="color:#0f172a;">${acc.bank_name}</b>
          </div>
        </td>
        <td>
          <code style="font-size:14px; font-weight:800; color:#2563eb;">${acc.account_number}</code>
        </td>
        <td>
          <b style="font-size:13px; color:#1e293b;">${acc.account_name}</b>
        </td>
        <td>
          <span style="font-size:12px; color:#64748b;">${acc.branch || 'Toàn quốc'}</span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${qrUrl}" alt="VietQR Demo" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer;" onclick="window.open('${qrUrl}')" title="Nhấp để phóng to mã VietQR" />
            <a href="${qrUrl}" target="_blank" style="font-size:11px; color:#2563eb; text-decoration:none;">🔍 Xem QR</a>
          </div>
        </td>
        <td>
          ${isDefault && isActive ? 
            `<span class="badge" style="background:#dcfce7; color:#166534; font-weight:800; font-size:11px; padding:3px 8px; border-radius:12px;">🌟 ĐANG NHẬN TIỀN CHÍNH</span>` : 
            `<button class="btn btn-sm btn-ebay-outline" onclick="setPrimaryBankAccount('${acc.id}')" title="Chọn làm tài khoản nhận tiền thanh toán chính">Đặt làm chính</button>`
          }
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-ebay-outline" onclick="openEditBankAccountModal('${acc.id}')" title="Chỉnh sửa">✏️ Sửa</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteBankAccount('${acc.id}')" title="Xóa tài khoản" ${accounts.length <= 1 ? 'disabled style="opacity:0.5;"' : ''}>🗑️ Xóa</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPaymentCodesTable(codes) {
  const tbody = document.getElementById('adminPaymentCodesTableBody');
  if (!tbody) return;

  if (!codes || codes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#94a3b8;">Chưa có mã thanh toán nào. Hãy bấm "Tạo Mã Thanh Toán Mới"!</td></tr>`;
    return;
  }

  tbody.innerHTML = codes.map(c => {
    const isPercent = c.discount_type === 'percent';
    const discountText = isPercent 
      ? `<b style="color:#2563eb; font-size:13px;">${c.discount_value}%</b> ${c.max_discount ? `<span style="font-size:11px; color:#64748b;">(Tối đa ${formatPrice(c.max_discount)})</span>` : ''}` 
      : `<b style="color:#e53238; font-size:13px;">${formatPrice(c.discount_value)}</b>`;

    return `
      <tr>
        <td>
          <code style="font-size:14px; font-weight:900; color:#b45309; background:#fef3c7; padding:3px 8px; border-radius:4px; font-family:monospace;">${c.code}</code>
        </td>
        <td>${discountText}</td>
        <td><span style="font-size:12px; color:#334155;">${c.min_order_amount ? formatPrice(c.min_order_amount) : '0 ₫'}</span></td>
        <td><span style="font-size:12px; color:#475569;">${c.description || '--'}</span></td>
        <td><span style="font-size:12px; color:#64748b;">${c.expires_at || 'Không thời hạn'}</span></td>
        <td><span class="badge" style="background:#f1f5f9; color:#0f172a; font-weight:700;">${c.usage_count || 0} lần</span></td>
        <td>
          <span class="badge" style="background:${c.is_active ? '#dcfce7; color:#166534;' : '#fee2e2; color:#dc2626;'} font-weight:700; font-size:11px; padding:3px 8px; border-radius:12px;">
            ${c.is_active ? '● Đang chạy' : '○ Tạm dừng'}
          </span>
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-ebay-outline" onclick="togglePaymentCode('${c.id}')" title="Bật / Tắt trạng thái">
              ${c.is_active ? '⏸️ Tắt' : '▶️ Bật'}
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deletePaymentCode('${c.id}')" title="Xóa mã">🗑️ Xóa</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setupPaymentManagement() {
  // 1. Bank Account Modal Triggers
  document.getElementById('btnOpenAddBankAccountModal')?.addEventListener('click', () => {
    openAddBankAccountModal();
  });
  document.getElementById('btnCloseAdminBankModal')?.addEventListener('click', () => {
    document.getElementById('adminBankAccountModal').style.display = 'none';
  });
  document.getElementById('btnCancelAdminBankModal')?.addEventListener('click', () => {
    document.getElementById('adminBankAccountModal').style.display = 'none';
  });

  // Bank Form Submit
  document.getElementById('adminBankAccountForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adminBankAccId').value;
    const bankVal = document.getElementById('adminBankSelect').value.split('|');
    const bank_id = bankVal[0];
    const bank_name = bankVal[1];
    const account_number = document.getElementById('adminBankAccNumber').value.trim();
    const branch = document.getElementById('adminBankBranch').value.trim();
    const account_name = document.getElementById('adminBankAccountName').value.trim().toUpperCase();
    const is_default = document.getElementById('adminBankIsDefault').checked;

    if (!account_number || !account_name) {
      showToast('Vui lòng điền đầy đủ Số tài khoản và Tên chủ tài khoản!', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/bank-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id || undefined,
          bank_id,
          bank_name,
          account_number,
          account_name,
          branch,
          is_default,
          is_active: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Lưu tài khoản ngân hàng thành công!', 'success');
        document.getElementById('adminBankAccountModal').style.display = 'none';
        await loadAdminPayments();
      } else {
        showToast(data.error || 'Lỗi lưu tài khoản!', 'error');
      }
    } catch (err) {
      showToast('Lỗi máy chủ khi lưu tài khoản!', 'error');
    }
  });

  // 2. Payment Code Modal Triggers
  document.getElementById('btnOpenAddPaymentCodeModal')?.addEventListener('click', () => {
    openAddPaymentCodeModal();
  });
  document.getElementById('btnCloseAdminCodeModal')?.addEventListener('click', () => {
    document.getElementById('adminPaymentCodeModal').style.display = 'none';
  });
  document.getElementById('btnCancelAdminCodeModal')?.addEventListener('click', () => {
    document.getElementById('adminPaymentCodeModal').style.display = 'none';
  });

  // Type change handler
  const codeTypeSelect = document.getElementById('adminCodeType');
  codeTypeSelect?.addEventListener('change', (e) => {
    const isPercent = e.target.value === 'percent';
    const lblVal = document.getElementById('lblAdminCodeValue');
    const wrapMax = document.getElementById('wrapAdminCodeMaxDiscount');
    if (lblVal) lblVal.innerHTML = isPercent ? 'Mức giảm (%) <span style="color:#ef4444;">*</span>:' : 'Mức giảm (VNĐ) <span style="color:#ef4444;">*</span>:';
    if (wrapMax) wrapMax.style.display = isPercent ? 'block' : 'none';
  });

  // Payment Code Form Submit
  document.getElementById('adminPaymentCodeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adminCodeId').value;
    const code = document.getElementById('adminCodeStr').value.trim().toUpperCase();
    const discount_type = document.getElementById('adminCodeType').value;
    const discount_value = parseFloat(document.getElementById('adminCodeValue').value) || 0;
    const max_discount = parseFloat(document.getElementById('adminCodeMaxDiscount').value) || undefined;
    const min_order_amount = parseFloat(document.getElementById('adminCodeMinOrder').value) || 0;
    const expires_at = document.getElementById('adminCodeExpires').value || '2026-12-31';
    const is_active = document.getElementById('adminCodeIsActive').checked;
    const description = document.getElementById('adminCodeDesc').value.trim();

    if (!code || discount_value <= 0) {
      showToast('Vui lòng nhập mã và mức giảm giá hợp lệ!', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/payment-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id || undefined,
          code,
          discount_type,
          discount_value,
          max_discount,
          min_order_amount,
          expires_at,
          is_active,
          description
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || 'Lưu mã thanh toán thành công!', 'success');
        document.getElementById('adminPaymentCodeModal').style.display = 'none';
        await loadAdminPayments();
      } else {
        showToast(data.error || 'Lỗi lưu mã thanh toán!', 'error');
      }
    } catch (err) {
      showToast('Lỗi máy chủ khi lưu mã!', 'error');
    }
  });
}

function openAddBankAccountModal() {
  document.getElementById('adminBankAccId').value = '';
  document.getElementById('adminBankModalTitle').textContent = 'Thêm Tài Khoản Nhận Tiền Mới';
  document.getElementById('adminBankAccNumber').value = '';
  document.getElementById('adminBankBranch').value = '';
  document.getElementById('adminBankAccountName').value = 'K/H STORE OFFICIAL';
  document.getElementById('adminBankIsDefault').checked = true;
  document.getElementById('adminBankAccountModal').style.display = 'flex';
}

function openEditBankAccountModal(accId) {
  const acc = adminState.bankAccounts.find(a => a.id === accId);
  if (!acc) return;

  document.getElementById('adminBankAccId').value = acc.id;
  document.getElementById('adminBankModalTitle').textContent = 'Chỉnh Sửa Tài Khoản Nhận Tiền';
  
  // Find matching select option
  const sel = document.getElementById('adminBankSelect');
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value.startsWith(acc.bank_id + '|')) {
      sel.selectedIndex = i;
      break;
    }
  }

  document.getElementById('adminBankAccNumber').value = acc.account_number || '';
  document.getElementById('adminBankBranch').value = acc.branch || '';
  document.getElementById('adminBankAccountName').value = acc.account_name || '';
  document.getElementById('adminBankIsDefault').checked = !!acc.is_default;
  document.getElementById('adminBankAccountModal').style.display = 'flex';
}

window.setPrimaryBankAccount = async function(accId) {
  try {
    const res = await fetch(`${API_BASE}/admin/bank-accounts/${accId}/set-active`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Đã đặt làm tài khoản nhận tiền chính (VietQR 24/7)!', 'success');
      await loadAdminPayments();
    } else {
      showToast(data.error || 'Lỗi cập nhật tài khoản chính!', 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối máy chủ!', 'error');
  }
};

window.deleteBankAccount = async function(accId) {
  if (!confirm('Bạn có chắc chắn muốn xóa tài khoản ngân hàng này?')) return;
  try {
    const res = await fetch(`${API_BASE}/admin/bank-accounts/${accId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Đã xóa tài khoản ngân hàng!', 'success');
      await loadAdminPayments();
    } else {
      showToast(data.error || 'Lỗi khi xóa tài khoản!', 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối máy chủ!', 'error');
  }
};

function openAddPaymentCodeModal() {
  document.getElementById('adminCodeId').value = '';
  document.getElementById('adminCodeModalTitle').textContent = 'Tạo Mã Thanh Toán & Ưu Đãi Mới';
  document.getElementById('adminCodeStr').value = '';
  document.getElementById('adminCodeType').value = 'fixed';
  document.getElementById('adminCodeValue').value = '';
  document.getElementById('adminCodeMaxDiscount').value = '';
  document.getElementById('adminCodeMinOrder').value = '0';
  document.getElementById('wrapAdminCodeMaxDiscount').style.display = 'none';
  document.getElementById('lblAdminCodeValue').innerHTML = 'Mức giảm (VNĐ) <span style="color:#ef4444;">*</span>:';
  
  // Set default expiry to next month
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  document.getElementById('adminCodeExpires').value = d.toISOString().split('T')[0];
  document.getElementById('adminCodeIsActive').checked = true;
  document.getElementById('adminCodeDesc').value = '';
  document.getElementById('adminPaymentCodeModal').style.display = 'flex';
}

window.togglePaymentCode = async function(codeId) {
  try {
    const res = await fetch(`${API_BASE}/admin/payment-codes/${codeId}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Đã cập nhật trạng thái mã!', 'success');
      await loadAdminPayments();
    } else {
      showToast(data.error || 'Lỗi cập nhật mã!', 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối máy chủ!', 'error');
  }
};

window.deletePaymentCode = async function(codeId) {
  if (!confirm('Bạn có chắc chắn muốn xóa mã thanh toán này?')) return;
  try {
    const res = await fetch(`${API_BASE}/admin/payment-codes/${codeId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Đã xóa mã thanh toán!', 'success');
      await loadAdminPayments();
    } else {
      showToast(data.error || 'Lỗi khi xóa mã!', 'error');
    }
  } catch (e) {
    showToast('Lỗi kết nối máy chủ!', 'error');
  }
};
