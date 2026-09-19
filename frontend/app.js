// eBay E-commerce Marketplace Logic for KG-RecSys
const API_BASE = '/api';

let appState = {
  users: [],
  selectedUserId: 'u1',
  selectedAlgorithm: 'hybrid',
  selectedCategory: 'all',
  selectedBrand: 'all',
  selectedPriceFilter: 'all',
  searchQuery: '',
  sortBy: 'score_desc',
  recommendations: [],
  metadata: { categories: [], brands: [], tags: [] }
};

let userSelectedRating = 5;

// DOM Elements
const userSelect = document.getElementById('userSelect');
const algoSelect = document.getElementById('algoSelect');
const searchInput = document.getElementById('searchInput');
const searchCatSelect = document.getElementById('searchCategorySelect');
const btnSearch = document.getElementById('btnSearch');
const sortSelect = document.getElementById('sortSelect');
const recsGrid = document.getElementById('recommendationsGrid');

const explanationModal = document.getElementById('explanationModal');
const modalBadge = document.getElementById('modalBadge');
const modalProductName = document.getElementById('modalProductName');
const modalExplanationText = document.getElementById('modalExplanationText');
const modalReasoningChain = document.getElementById('modalReasoningChain');

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventListeners();
  setupSurveyEvents();
  await loadMetadata();
  await loadUsers();
  await loadRecommendations();
  await loadMetrics();
  await loadSurveyStats();
});

// Navigation & Tab Switching
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      const target = item.getAttribute('data-tab');
      const content = document.getElementById(`tab-${target}`);
      if (content) content.classList.add('active');
    });
  });

  document.querySelectorAll('.nav-shortcut').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-target');
      const navItem = document.querySelector(`.nav-item[data-tab="${target}"]`);
      if (navItem) navItem.click();
    });
  });
}

function setupEventListeners() {
  // User switcher
  userSelect.addEventListener('change', async (e) => {
    appState.selectedUserId = e.target.value;
    updateUserProfile();
    await loadRecommendations();
  });

  // Algorithm switcher
  algoSelect.addEventListener('change', async (e) => {
    appState.selectedAlgorithm = e.target.value;
    await loadRecommendations();
  });

  // Search
  btnSearch?.addEventListener('click', handleSearch);
  searchInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  searchCatSelect?.addEventListener('change', (e) => {
    appState.selectedCategory = e.target.value;
    updateSidebarCategoryUI(e.target.value);
    filterAndRenderRecs();
  });

  // Sort
  sortSelect?.addEventListener('change', (e) => {
    appState.sortBy = e.target.value;
    filterAndRenderRecs();
  });

  // Price filter
  document.querySelectorAll('input[name="price_filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      appState.selectedPriceFilter = e.target.value;
      filterAndRenderRecs();
    });
  });

  // Hero CTA buttons
  document.getElementById('btnRefreshRecs')?.addEventListener('click', async () => {
    await loadRecommendations();
    showToast('Đã làm mới danh mục đề xuất eBay!', 'success');
  });

  document.getElementById('btnOpenSurvey')?.addEventListener('click', () => {
    const surveyTab = document.querySelector('.nav-item[data-tab="survey"]');
    if (surveyTab) surveyTab.click();
  });

  // Modal close
  document.getElementById('btnCloseModal')?.addEventListener('click', () => explanationModal.style.display = 'none');
  document.getElementById('btnModalClose')?.addEventListener('click', () => explanationModal.style.display = 'none');

  // Cold start form
  document.getElementById('coldStartForm')?.addEventListener('submit', handleColdStartSubmit);
}

function handleSearch() {
  appState.searchQuery = searchInput.value.trim().toLowerCase();
  filterAndRenderRecs();
}

function setupSurveyEvents() {
  const stars = document.querySelectorAll('#starRating .star');
  const ratingText = document.getElementById('ratingText');
  const ratingLabels = { 1: '1/5 – Chưa hài lòng', 2: '2/5 – Tạm được', 3: '3/5 – Khá ổn', 4: '4/5 – Hài lòng', 5: '5/5 – Rất hài lòng' };

  stars.forEach(star => {
    star.addEventListener('click', () => {
      userSelectedRating = parseInt(star.getAttribute('data-val'));
      stars.forEach(s => {
        s.classList.toggle('active', parseInt(s.getAttribute('data-val')) <= userSelectedRating);
      });
      if (ratingText) ratingText.textContent = ratingLabels[userSelectedRating] || `${userSelectedRating}/5`;
    });
  });

  document.getElementById('surveyForm')?.addEventListener('submit', handleSurveySubmit);
}

// Load Metadata
async function loadMetadata() {
  try {
    const res = await fetch(`${API_BASE}/metadata`);
    const data = await res.json();
    if (data.success) {
      appState.metadata = data;
      renderSidebarCategories(data.categories);
      renderSidebarBrands(data.brands);
      renderSearchCategoryDropdown(data.categories);
      renderColdStartOptions(data);
      renderSurveyOptions(data);
    }
  } catch (err) { console.error('Error loading metadata:', err); }
}

function renderSearchCategoryDropdown(categories) {
  if (!searchCatSelect) return;
  searchCatSelect.innerHTML = '<option value="all">Tất cả danh mục</option>' +
    categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function renderSidebarCategories(categories) {
  const list = document.getElementById('categoryFilterList');
  if (!list) return;
  list.innerHTML = '<li class="cat-filter-item active" data-cat="all">Tất cả sản phẩm</li>' +
    categories.map(c => `<li class="cat-filter-item" data-cat="${c.name}">${c.icon || ''} ${c.name}</li>`).join('');

  list.querySelectorAll('.cat-filter-item').forEach(item => {
    item.addEventListener('click', () => {
      list.querySelectorAll('.cat-filter-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const cat = item.getAttribute('data-cat');
      appState.selectedCategory = cat;
      if (searchCatSelect) searchCatSelect.value = cat;
      filterAndRenderRecs();
    });
  });
}

function updateSidebarCategoryUI(cat) {
  const items = document.querySelectorAll('.cat-filter-item');
  items.forEach(i => {
    i.classList.toggle('active', i.getAttribute('data-cat') === cat);
  });
}

function renderSidebarBrands(brands) {
  const wrap = document.getElementById('sidebarBrandList');
  if (!wrap) return;
  wrap.innerHTML = '<label class="filter-checkbox"><input type="radio" name="brand_filter" value="all" checked><span>Tất cả thương hiệu</span></label>' +
    brands.map(b => `<label class="filter-checkbox"><input type="radio" name="brand_filter" value="${b.name}"><span>${b.name}</span></label>`).join('');

  wrap.querySelectorAll('input[name="brand_filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      appState.selectedBrand = e.target.value;
      filterAndRenderRecs();
    });
  });
}

function renderSurveyOptions(data) {
  const brandWrap = document.getElementById('surveyBrands');
  const catWrap = document.getElementById('surveyCategories');
  if (brandWrap) {
    brandWrap.innerHTML = data.brands.map(b => `
      <label class="cb-item-ebay">
        <input type="checkbox" name="survey_brand" value="${b.id}">
        <span><b>${b.name}</b> (${b.country})</span>
      </label>`).join('');
  }
  if (catWrap) {
    catWrap.innerHTML = data.categories.map(c => `
      <label class="cb-item-ebay">
        <input type="checkbox" name="survey_cat" value="${c.id}">
        <span>${c.icon || ''} ${c.name}</span>
      </label>`).join('');
  }
}

function renderColdStartOptions(data) {
  const catWrap = document.getElementById('coldStartCategories');
  const brandWrap = document.getElementById('coldStartBrands');
  const tagWrap = document.getElementById('coldStartTags');
  if (catWrap) catWrap.innerHTML = data.categories.map(c => `<label class="cb-item-ebay"><input type="checkbox" name="cold_cat" value="${c.id}"><span>${c.icon || ''} ${c.name}</span></label>`).join('');
  if (brandWrap) brandWrap.innerHTML = data.brands.map(b => `<label class="cb-item-ebay"><input type="checkbox" name="cold_brand" value="${b.id}"><span>${b.name} (${b.country})</span></label>`).join('');
  if (tagWrap) tagWrap.innerHTML = data.tags.map(t => `<label class="cb-item-ebay"><input type="checkbox" name="cold_tag" value="${t.id}"><span>#${t.name}</span></label>`).join('');
}

async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`);
    const data = await res.json();
    if (data.success) {
      appState.users = data.users;
      userSelect.innerHTML = data.users.map(u => `<option value="${u.id}" ${u.id === appState.selectedUserId ? 'selected' : ''}>${u.name} (${u.role || u.id})</option>`).join('');
      updateUserProfile();
    }
  } catch (err) { console.error(err); }
}

function updateUserProfile() {
  const user = appState.users.find(u => u.id === appState.selectedUserId);
  if (!user) return;
  document.getElementById('topGreetingUser').textContent = user.name;
  document.getElementById('userName').textContent = user.name;
  document.getElementById('userRole').textContent = user.role || 'Thành viên eBay';
  const avatar = document.getElementById('userAvatar');
  if (user.avatar && avatar) avatar.src = user.avatar;
  const wrap = document.getElementById('userInteractions');
  if (wrap) wrap.innerHTML = `Đã liên kết <b>${user.interactions_count || 0}</b> mối quan hệ trong Đồ thị Tri thức`;
}

async function loadRecommendations() {
  recsGrid.innerHTML = `<div class="loading-box"><div class="spinner"></div><p>Đang suy luận từ Đồ thị Tri thức với thuật toán [${appState.selectedAlgorithm.toUpperCase()}]...</p></div>`;
  try {
    const res = await fetch(`${API_BASE}/recommendations?user_id=${appState.selectedUserId}&algorithm=${appState.selectedAlgorithm}`);
    const data = await res.json();
    if (data.success) {
      appState.recommendations = data.recommendations || [];
      filterAndRenderRecs();
    } else {
      recsGrid.innerHTML = `<p style="color:red;padding:20px;">Lỗi: ${data.error}</p>`;
    }
  } catch (err) {
    recsGrid.innerHTML = `<p style="color:red;padding:20px;">Không thể kết nối với Backend API.</p>`;
  }
}

// Filter, Sort & Render eBay Grid
function filterAndRenderRecs() {
  let list = [...appState.recommendations];

  // Category filter
  if (appState.selectedCategory !== 'all') {
    list = list.filter(r => r.product.categories && r.product.categories.includes(appState.selectedCategory));
  }

  // Brand filter
  if (appState.selectedBrand !== 'all') {
    list = list.filter(r => r.product.brands && r.product.brands.includes(appState.selectedBrand));
  }

  // Price filter
  if (appState.selectedPriceFilter === 'under_5m') {
    list = list.filter(r => r.product.price < 5000000);
  } else if (appState.selectedPriceFilter === '5m_15m') {
    list = list.filter(r => r.product.price >= 5000000 && r.product.price <= 15000000);
  } else if (appState.selectedPriceFilter === '15m_30m') {
    list = list.filter(r => r.product.price > 15000000 && r.product.price <= 30000000);
  } else if (appState.selectedPriceFilter === 'above_30m') {
    list = list.filter(r => r.product.price > 30000000);
  }

  // Keyword search
  if (appState.searchQuery) {
    list = list.filter(r => {
      const name = r.product.name.toLowerCase();
      const desc = (r.product.description || '').toLowerCase();
      const brand = ((r.product.brands && r.product.brands[0]) || '').toLowerCase();
      return name.includes(appState.searchQuery) || desc.includes(appState.searchQuery) || brand.includes(appState.searchQuery);
    });
  }

  // Sorting
  if (appState.sortBy === 'price_asc') {
    list.sort((a, b) => a.product.price - b.product.price);
  } else if (appState.sortBy === 'price_desc') {
    list.sort((a, b) => b.product.price - a.product.price);
  } else if (appState.sortBy === 'rating_desc') {
    list.sort((a, b) => (b.product.rating || 0) - (a.product.rating || 0));
  } else {
    list.sort((a, b) => b.score - a.score);
  }

  // Count info
  const countEl = document.getElementById('resultsCount');
  if (countEl) countEl.textContent = `Tìm thấy ${list.length} kết quả phù hợp trên Đồ thị Tri thức`;

  if (list.length === 0) {
    recsGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;background:#fff;border:1px solid var(--border-light);border-radius:var(--radius-md);">
        <p style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;">Không tìm thấy sản phẩm phù hợp</p>
        <p style="font-size:13px;color:var(--text-muted);">Hãy thử điều chỉnh lại bộ lọc giá hoặc danh mục ở thanh bên trái.</p>
      </div>`;
    return;
  }

  recsGrid.innerHTML = list.map(item => {
    const p = item.product;
    const formattedPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price);
    const brandName = (p.brands && p.brands[0]) || '';
    const catName = (p.categories && p.categories[0]) || '';

    return `
      <div class="ebay-card-item">
        <div class="card-top-image">
          <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy" />
          <span class="badge-match-score">${item.match_percent}% MATCH</span>
          <div class="heart-watchlist" title="Thêm vào yêu thích (Like)" onclick="handleInteraction('${p.id}', 'likes')">♡</div>
        </div>
        <div class="card-item-body">
          <div class="item-meta-top">
            <span>🏷️ ${brandName}</span>
            <span>${catName}</span>
          </div>
          <h4 class="item-title" title="${p.name}">${p.name}</h4>
          <div class="item-seller-rating">
            <span class="stars-gold">★★★★★</span> <b>${p.rating || 4.8}</b> · (1.2K+ đã bán)
          </div>
          <div class="item-price-wrap">
            <div class="item-price">${formattedPrice}</div>
          </div>
          <div class="item-shipping">Miễn phí vận chuyển · Đổi trả 30 ngày</div>
          <div class="item-kg-reason">
            💡 <b>${item.reason_badge}:</b> ${item.explanation}
          </div>
          <div class="card-action-buttons">
            <button class="btn-card btn-buy-now" onclick="handleInteraction('${p.id}', 'purchased')">🛒 Mua Ngay</button>
            <button class="btn-card btn-explain-info" onclick="openExplanationModal('${p.id}')">🔍 Lý Do Gợi Ý</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function handleInteraction(productId, type) {
  try {
    const res = await fetch(`${API_BASE}/interact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: appState.selectedUserId, product_id: productId, type })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Đã thêm quan hệ [${type.toUpperCase()}] vào Đồ thị Tri thức eBay!`, 'success');
      await loadUsers(); await loadRecommendations(); await loadMetrics();
    }
  } catch (err) { showToast('Lỗi khi tương tác!', 'error'); }
}

function openExplanationModal(productId) {
  const item = appState.recommendations.find(r => r.product.id === productId);
  if (!item) return;
  const p = item.product;
  modalBadge.textContent = item.reason_badge;
  modalProductName.textContent = p.name;
  modalExplanationText.textContent = item.explanation;
  const path = item.path || [];
  const labels = item.path_labels || path;
  modalReasoningChain.innerHTML = labels.map((label, idx) => `
    <span class="chain-node ${idx === 0 || idx === labels.length - 1 ? 'highlight' : ''}">${label}</span>
    ${idx < labels.length - 1 ? '<span class="chain-arrow">➔</span>' : ''}`).join('');
  explanationModal.style.display = 'flex';
}

// Survey Logic
async function handleSurveySubmit(e) {
  e.preventDefault();
  const purposes = Array.from(document.querySelectorAll('input[name="survey_purpose"]:checked')).map(cb => cb.value);
  const brands = Array.from(document.querySelectorAll('input[name="survey_brand"]:checked')).map(cb => cb.value);
  const categories = Array.from(document.querySelectorAll('input[name="survey_cat"]:checked')).map(cb => cb.value);
  const priorityTag = document.getElementById('surveyPriorityTag')?.value;
  if (priorityTag && !purposes.includes(priorityTag)) purposes.push(priorityTag);
  const explainability = document.querySelector('input[name="survey_explain"]:checked')?.value || 'Rất trực quan, dễ hiểu';
  const comment = document.getElementById('surveyComment')?.value.trim() || '';

  try {
    const res = await fetch(`${API_BASE}/survey`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: appState.selectedUserId,
        categories, brands, tags: purposes,
        feedback: { rating: userSelectedRating, comment, explainability }
      })
    });
    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      showToast(`Máy chủ phản hồi mã ${res.status}. Vui lòng thử lại.`, 'error');
      return;
    }
    if (res.ok && data.success) {
      showToast('Đã lưu kết quả khảo sát! Đồ thị tri thức đang tối ưu hóa gợi ý...', 'success');
      await loadUsers(); await loadRecommendations(); await loadMetrics(); await loadSurveyStats();
      setTimeout(() => {
        const recTab = document.querySelector('.nav-item[data-tab="recommendations"]');
        if (recTab) recTab.click();
      }, 700);
    } else {
      showToast(`Lỗi: ${data.error || 'Không thể lưu khảo sát'}`, 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi gửi khảo sát!', 'error');
  }
}

async function loadSurveyStats() {
  try {
    const res = await fetch(`${API_BASE}/survey/stats`);
    const data = await res.json();
    if (data.success) {
      const s = data.stats;
      const wrap = document.getElementById('surveyStatsContent');
      if (!wrap) return;
      const topBrands = Object.entries(s.pref_brands).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ') || 'Apple, ASUS, Dell';
      const topCats = Object.entries(s.pref_categories).slice(0, 2).map(([k, v]) => `${k} (${v})`).join(', ') || 'Laptop, Linh kiện PC';
      wrap.innerHTML = `
        <div class="metric-card-ebay"><div class="metric-num" style="color:var(--ebay-yellow);">${s.average_rating} ⭐</div><div class="metric-desc">Độ hài lòng người dùng (CSAT)</div></div>
        <div class="metric-card-ebay"><div class="metric-num">${s.total_surveys}</div><div class="metric-desc">Lượt khảo sát hoàn thành</div></div>
        <div class="metric-card-ebay"><div style="font-size:14px;font-weight:700;color:var(--ebay-green);margin-bottom:4px;">${topBrands}</div><div class="metric-desc">Thương hiệu được ưu tiên cao nhất</div></div>
        <div class="metric-card-ebay"><div style="font-size:14px;font-weight:700;color:var(--ebay-blue);margin-bottom:4px;">${topCats}</div><div class="metric-desc">Ngành hàng được quan tâm nhiều nhất</div></div>`;
    }
  } catch (err) { console.error(err); }
}

// Cold Start Logic
async function handleColdStartSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('newUserName').value.trim();
  const role = document.getElementById('newUserRole').value.trim() || 'Thành viên mới eBay';
  const cats = Array.from(document.querySelectorAll('input[name="cold_cat"]:checked')).map(cb => cb.value);
  const brands = Array.from(document.querySelectorAll('input[name="cold_brand"]:checked')).map(cb => cb.value);
  const tags = Array.from(document.querySelectorAll('input[name="cold_tag"]:checked')).map(cb => cb.value);
  const userId = 'u_' + Date.now().toString().slice(-4);
  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, name, role, categories: cats, brands, tags })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Chào mừng ${name}! Đang tải danh mục gợi ý khởi động lạnh...`, 'success');
      await loadUsers();
      appState.selectedUserId = userId;
      userSelect.value = userId;
      updateUserProfile();
      document.querySelector('.nav-item[data-tab="recommendations"]').click();
      await loadRecommendations(); await loadMetrics();
    }
  } catch (err) { showToast('Lỗi khi tạo tài khoản Cold-Start!', 'error'); }
}

// Analytics Metrics
async function loadMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const data = await res.json();
    if (data.success) {
      const m = data.metrics;
      const headerM = document.getElementById('headerMetricsBadge');
      if (headerM) headerM.textContent = `Đồ thị: ${m.total_nodes} nút • ${m.total_edges} cạnh (Mật độ: ${m.density})`;

      const grid = document.getElementById('metricsGrid');
      if (grid) grid.innerHTML = `
        <div class="metric-card-ebay"><div class="metric-num">${m.total_nodes}</div><div class="metric-desc">Tổng số Nút (Entities)</div></div>
        <div class="metric-card-ebay"><div class="metric-num">${m.total_edges}</div><div class="metric-desc">Tổng số Cạnh (Quan hệ)</div></div>
        <div class="metric-card-ebay"><div class="metric-num">${m.nodes_by_type.Product || 0}</div><div class="metric-desc">Thiết bị điện tử & Linh kiện</div></div>
        <div class="metric-card-ebay"><div class="metric-num">${m.nodes_by_type.User || 0}</div><div class="metric-desc">Hồ sơ người dùng</div></div>`;
    }
  } catch (err) { console.error(err); }
}

// Toast helper
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.style.borderLeftColor = 'var(--ebay-red)';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
}
