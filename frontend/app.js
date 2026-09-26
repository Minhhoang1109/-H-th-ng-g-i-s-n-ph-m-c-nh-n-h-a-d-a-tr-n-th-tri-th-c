// K/H Team Electronics - KG-RecSys Full Application Logic
const API_BASE = '/api';

let appState = {
  users: [],
  currentUser: null,
  isGuest: false,
  isAdmin: false,
  selectedUserId: 'u1',
  selectedAlgorithm: 'hybrid',
  selectedCategory: 'all',
  selectedPurpose: 'all',
  selectedBrands: [],
  priceMin: null,
  priceMax: null,
  searchQuery: '',
  sortBy: 'kg_score',
  recommendations: [],
  products: [],
  metadata: { categories: [], brands: [], purposes: [] },
  adminVisNetwork: null,
  adminGraphData: null
};

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setup3FacetSearch();
  setupAuth();
  setupWishlistModal();
  setupReviewModal();
  setupOnboardingAndSurvey();
  setupAdminPanel();
  setupFiltersAndSort();

  await loadMetadata();
  await loadUsers();
  restoreSessionOrGuest();
  await loadRecommendations();
  await loadMetrics();
});

// ========================================================
// NAVIGATION & TABS
// ========================================================
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-tab');
      if (target === 'admin' && !appState.isAdmin) {
        showToast('Chế độ Quản trị viên chưa được kích hoạt! Nhấp nút "⚙️ Chế độ Quản lý" ở góc trên.', 'warning');
        return;
      }
      navItems.forEach(i => i.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      const content = document.getElementById(`tab-${target}`);
      if (content) content.classList.add('active');

      if (target === 'admin') {
        initAdminGraph();
        loadAdminProducts();
        loadAdminUsers();
      }
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

// ========================================================
// 3-FACET SEARCH (Keyword + Category + Purpose)
// ========================================================
function setup3FacetSearch() {
  const btnSearch = document.getElementById('btnSearch');
  const searchInput = document.getElementById('searchInput');
  const searchCategorySelect = document.getElementById('searchCategorySelect');
  const searchPurposeSelect = document.getElementById('searchPurposeSelect');

  const executeSearch = () => {
    appState.searchQuery = searchInput.value.trim();
    appState.selectedCategory = searchCategorySelect.value;
    appState.selectedPurpose = searchPurposeSelect.value;
    
    // Update active purpose pill
    const pill = document.getElementById('activePurposePill');
    if (appState.selectedPurpose !== 'all' && pill) {
      pill.style.display = 'inline-block';
      pill.textContent = `Mục đích: ${searchPurposeSelect.options[searchPurposeSelect.selectedIndex].text}`;
    } else if (pill) {
      pill.style.display = 'none';
    }

    updateSidebarCategoryUI(appState.selectedCategory);
    filterAndRenderProducts();
  };

  btnSearch?.addEventListener('click', executeSearch);
  searchInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') executeSearch();
  });

  searchCategorySelect?.addEventListener('change', executeSearch);
  searchPurposeSelect?.addEventListener('change', executeSearch);
}

// ========================================================
// AUTHENTICATION & PERSISTENT SESSION
// ========================================================
function setupAuth() {
  const authModal = document.getElementById('authModal');
  const btnOpenLoginModal = document.getElementById('btnOpenLoginModal');
  const btnOpenRegisterModal = document.getElementById('btnOpenRegisterModal');
  const btnCloseAuthModal = document.getElementById('btnCloseAuthModal');
  const tabLoginBtn = document.getElementById('tabLoginBtn');
  const tabRegisterBtn = document.getElementById('tabRegisterBtn');
  const loginPane = document.getElementById('loginPane');
  const registerPane = document.getElementById('registerPane');
  const btnLogout = document.getElementById('btnLogout');
  const userSelect = document.getElementById('userSelect');
  const btnOpenProfile = document.getElementById('btnOpenProfile');

  btnOpenLoginModal?.addEventListener('click', () => openAuthModal('login'));
  btnOpenRegisterModal?.addEventListener('click', () => openAuthModal('register'));
  btnCloseAuthModal?.addEventListener('click', () => authModal.style.display = 'none');

  tabLoginBtn?.addEventListener('click', () => {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    loginPane.style.display = 'block';
    registerPane.style.display = 'none';
  });

  tabRegisterBtn?.addEventListener('click', () => {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    registerPane.style.display = 'block';
    loginPane.style.display = 'none';
  });

  // Toggle Password
  document.getElementById('btnToggleLoginPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('btnToggleRegPwd')?.addEventListener('click', () => {
    const inp = document.getElementById('regPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Login Submit
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authModal.style.display = 'none';
        showToast(data.message || 'Đăng nhập thành công!', 'success');
        handleLoginSuccess(data.user);
      } else {
        showToast(data.message || 'Sai tên đăng nhập hoặc mật khẩu!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ!', 'error');
    }
  });

  // Register Submit
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const full_name = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const role = document.getElementById('regRole').value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, username, password, role })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authModal.style.display = 'none';
        showToast('Đăng ký thành công! Vui lòng hoàn tất khảo sát khởi đầu.', 'success');
        handleLoginSuccess(data.user, true); // true = isFirstRegister
      } else {
        showToast(data.message || 'Đăng ký thất bại!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ!', 'error');
    }
  });

  // Quick switch dropdown
  userSelect?.addEventListener('change', async (e) => {
    const uid = e.target.value;
    const user = appState.users.find(u => u.id === uid);
    if (user) {
      handleLoginSuccess(user, false);
    }
  });

  btnLogout?.addEventListener('click', () => {
    localStorage.removeItem('kh_recsys_session');
    appState.currentUser = null;
    appState.isGuest = true;
    updateAuthUI();
    loadRecommendations();
    showToast('Đã đăng xuất! Chuyển sang chế độ Khách vãng lai.', 'info');
  });

  btnOpenProfile?.addEventListener('click', openProfileDrawer);
  document.getElementById('btnCloseProfileModal')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
  });
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  modal.style.display = 'flex';
  if (mode === 'login') {
    document.getElementById('tabLoginBtn').click();
  } else {
    document.getElementById('tabRegisterBtn').click();
  }
}

function handleLoginSuccess(user, isFirstRegister = false) {
  appState.currentUser = user;
  appState.selectedUserId = user.id;
  appState.isGuest = false;

  // Track session count in localStorage
  let sessionKey = `kh_session_count_${user.id}`;
  let count = parseInt(localStorage.getItem(sessionKey) || '0', 10) + 1;
  localStorage.setItem(sessionKey, count.toString());
  localStorage.setItem('kh_recsys_session', JSON.stringify({ userId: user.id, username: user.username }));

  updateAuthUI();
  loadRecommendations();

  // Check 1st time vs 2nd+ time
  if (isFirstRegister || count === 1) {
    // Show 1-time onboarding survey
    document.getElementById('onboardingSurveyModal').style.display = 'flex';
  } else if (count >= 2) {
    // Show 2nd login wishlist capture
    document.getElementById('wishlistModal').style.display = 'flex';
  }
}

function restoreSessionOrGuest() {
  const raw = localStorage.getItem('kh_recsys_session');
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      const user = appState.users.find(u => u.id === sess.userId || u.username === sess.username);
      if (user) {
        appState.currentUser = user;
        appState.selectedUserId = user.id;
        appState.isGuest = false;
        updateAuthUI();
        return;
      }
    } catch (e) {}
  }
  // Default fallback
  if (appState.users.length > 0) {
    appState.currentUser = appState.users[0];
    appState.selectedUserId = appState.users[0].id;
    appState.isGuest = false;
  } else {
    appState.isGuest = true;
  }
  updateAuthUI();
}

function updateAuthUI() {
  const authStatusHeader = document.getElementById('authStatusHeader');
  const guestStatusHeader = document.getElementById('guestStatusHeader');
  const topGreetingUser = document.getElementById('topGreetingUser');
  const userSelect = document.getElementById('userSelect');
  const returningUserBanner = document.getElementById('returningUserBanner');
  const guestRecNotice = document.getElementById('guestRecNotice');

  if (appState.currentUser && !appState.isGuest) {
    authStatusHeader.style.display = 'flex';
    guestStatusHeader.style.display = 'none';
    topGreetingUser.textContent = appState.currentUser.name || appState.currentUser.full_name || appState.currentUser.username;
    if (userSelect) userSelect.value = appState.currentUser.id;

    // Update hero card
    document.getElementById('userName').textContent = appState.currentUser.name || appState.currentUser.full_name;
    document.getElementById('userRole').textContent = appState.currentUser.role || 'Thành viên K/H Team';
    if (appState.currentUser.avatar) {
      document.getElementById('userAvatar').src = appState.currentUser.avatar;
    }

    // Check wishlist banner
    if (appState.currentUser.wishlist_need) {
      returningUserBanner.style.display = 'block';
      document.getElementById('bannerUserName').textContent = `Chào ${appState.currentUser.name || 'bạn'}! Nhu cầu săn đón: "${appState.currentUser.wishlist_need}"`;
    } else {
      returningUserBanner.style.display = 'none';
    }
    guestRecNotice.style.display = 'none';
  } else {
    authStatusHeader.style.display = 'none';
    guestStatusHeader.style.display = 'flex';
    returningUserBanner.style.display = 'none';
    guestRecNotice.style.display = 'block';
    document.getElementById('userName').textContent = 'Khách vãng lai (Guest)';
    document.getElementById('userRole').textContent = 'Gợi ý theo nhóm sở thích tương đồng';
  }
}

// ========================================================
// 2ND-LOGIN WISHLIST CAPTURE
// ========================================================
function setupWishlistModal() {
  const modal = document.getElementById('wishlistModal');
  const btnClose = document.getElementById('btnCloseWishlistModal');
  const btnSkip = document.getElementById('btnSkipWishlist');
  const form = document.getElementById('wishlistForm');
  const btnOpenQuick = document.getElementById('btnOpenWishlistQuick');
  const btnHeroWishlist = document.getElementById('btnHeroWishlist');
  const btnUpdateWishlistBanner = document.getElementById('btnUpdateWishlistBanner');

  const openWishlist = () => {
    modal.style.display = 'flex';
    if (appState.currentUser && appState.currentUser.wishlist_need) {
      document.getElementById('wishlistKeywordInput').value = appState.currentUser.wishlist_need;
    }
  };

  btnOpenQuick?.addEventListener('click', openWishlist);
  btnHeroWishlist?.addEventListener('click', openWishlist);
  btnUpdateWishlistBanner?.addEventListener('click', openWishlist);
  btnClose?.addEventListener('click', () => modal.style.display = 'none');
  btnSkip?.addEventListener('click', () => modal.style.display = 'none');

  // Clickable quick tags
  document.querySelectorAll('.wish-tag-item').forEach(tag => {
    tag.addEventListener('click', () => {
      document.getElementById('wishlistKeywordInput').value = tag.getAttribute('data-val');
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyword = document.getElementById('wishlistKeywordInput').value.trim();
    const purpose = document.getElementById('wishlistPurposeSelect').value;

    if (!appState.currentUser) {
      showToast('Vui lòng đăng nhập để lưu sản phẩm mong muốn!', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/user/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: appState.currentUser.id,
          keyword: keyword,
          purpose: purpose
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        modal.style.display = 'none';
        appState.currentUser.wishlist_need = keyword;
        updateAuthUI();
        showToast(data.message || 'Đã ghi nhận sản phẩm mong muốn vào Đồ thị Tri thức!', 'success');
        await loadRecommendations();
      }
    } catch (err) {
      showToast('Lỗi lưu nhu cầu mong muốn!', 'error');
    }
  });
}

// ========================================================
// PRODUCT REVIEWS & FEEDBACK (Reviewed Edges)
// ========================================================
function setupReviewModal() {
  const modal = document.getElementById('reviewModal');
  const btnClose = document.getElementById('btnCloseReviewModal');
  const form = document.getElementById('productReviewForm');

  btnClose?.addEventListener('click', () => modal.style.display = 'none');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const product_id = document.getElementById('reviewProductId').value;
    const rating = parseInt(document.querySelector('input[name="starRating"]:checked').value, 10);
    const pros = document.getElementById('reviewPros').value.trim();
    const cons = document.getElementById('reviewCons').value.trim();
    const comment = document.getElementById('reviewComment').value.trim();

    const user_id = appState.currentUser ? appState.currentUser.id : 'u1';
    const user_name = appState.currentUser ? (appState.currentUser.name || appState.currentUser.full_name) : 'Khách vãng lai';

    try {
      const res = await fetch(`${API_BASE}/products/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id, user_id, user_name, rating, pros, cons, comment })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        modal.style.display = 'none';
        showToast(data.message || 'Cảm ơn bạn đã đóng góp ý kiến!', 'success');
        form.reset();
        await loadRecommendations();
      }
    } catch (err) {
      showToast('Lỗi gửi đánh giá!', 'error');
    }
  });
}

function openProductReviewModal(productId, productName) {
  document.getElementById('reviewProductId').value = productId;
  document.getElementById('reviewProductName').textContent = `Đánh giá: ${productName}`;
  document.getElementById('reviewModal').style.display = 'flex';
}

// ========================================================
// 6-STEP SURVEY & ONBOARDING
// ========================================================
function setupOnboardingAndSurvey() {
  // Onboarding Form (1 time)
  const onboardForm = document.getElementById('onboardingSurveyForm');
  const btnSkipOnboarding = document.getElementById('btnSkipOnboarding');
  const btnCloseOnboarding = document.getElementById('btnCloseOnboardingModal');

  btnCloseOnboarding?.addEventListener('click', () => {
    document.getElementById('onboardingSurveyModal').style.display = 'none';
  });
  btnSkipOnboarding?.addEventListener('click', () => {
    document.getElementById('onboardingSurveyModal').style.display = 'none';
  });

  onboardForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const purposes = Array.from(document.querySelectorAll('input[name="onboard_purpose"]:checked')).map(c => c.value);
    const brands = Array.from(document.querySelectorAll('input[name="onboard_brand"]:checked')).map(c => c.value);
    const categories = Array.from(document.querySelectorAll('input[name="onboard_category"]:checked')).map(c => c.value);
    const budget = document.getElementById('onboardingBudget').value;

    const payload = {
      user_id: appState.currentUser ? appState.currentUser.id : 'u1',
      purposes, brands, categories, budget
    };

    try {
      const res = await fetch(`${API_BASE}/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById('onboardingSurveyModal').style.display = 'none';
        showToast('Khảo sát thành công! Đồ thị đã cập nhật gợi ý riêng cho bạn.', 'success');
        await loadRecommendations();
      }
    } catch (err) {
      showToast('Lỗi cập nhật khảo sát!', 'error');
    }
  });

  // Detailed Survey Form (Tab 2)
  const detailedForm = document.getElementById('detailedSurveyForm');
  detailedForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const purposes = Array.from(document.querySelectorAll('input[name="survey_purpose"]:checked')).map(c => c.value);
    const brands = Array.from(document.querySelectorAll('input[name="survey_brand"]:checked')).map(c => c.value);
    const categories = Array.from(document.querySelectorAll('input[name="survey_cat"]:checked')).map(c => c.value);
    const budget = document.getElementById('surveyBudget').value;
    const cpu = document.getElementById('surveyCpuPref').value;
    const gpu = document.getElementById('surveyGpuPref').value;
    const ram = document.getElementById('surveyRamPref').value;
    const ssd = document.getElementById('surveySsdPref').value;
    const specific_wish = document.getElementById('surveySpecificWish').value.trim();

    const payload = {
      user_id: appState.currentUser ? appState.currentUser.id : 'u1',
      purposes, brands, categories, budget,
      hardware_specs: { cpu, gpu, ram, ssd },
      specific_wish
    };

    try {
      const res = await fetch(`${API_BASE}/survey/detailed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Đã áp dụng cấu hình phần cứng chi tiết vào Đồ thị Tri thức!', 'success');
        // Switch back to shop tab
        document.querySelector('.nav-item[data-tab="recommendations"]').click();
        await loadRecommendations();
      }
    } catch (err) {
      showToast('Lỗi gửi khảo sát chi tiết!', 'error');
    }
  });
}

// ========================================================
// ADMIN PANEL & VIS.JS 2D GRAPH CANVAS
// ========================================================
function setupAdminPanel() {
  const btnAdminToggle = document.getElementById('btnAdminToggle');
  const navAdminTab = document.getElementById('navAdminTab');

  btnAdminToggle?.addEventListener('click', () => {
    appState.isAdmin = !appState.isAdmin;
    if (appState.isAdmin) {
      btnAdminToggle.classList.add('active');
      btnAdminToggle.textContent = '🔓 Đang là Quản Lý';
      navAdminTab.style.display = 'inline-block';
      navAdminTab.click();
      showToast('Đã chuyển sang chế độ Quản trị viên!', 'info');
    } else {
      btnAdminToggle.classList.remove('active');
      btnAdminToggle.textContent = '⚙️ Chế độ Quản lý';
      navAdminTab.style.display = 'none';
      document.querySelector('.nav-item[data-tab="recommendations"]').click();
      showToast('Đã thoát chế độ Quản lý.', 'info');
    }
  });

  // Admin sub tabs
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-view-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.getAttribute('data-admin-view');
      const pane = document.getElementById(`adminView${view.charAt(0).toUpperCase() + view.slice(1)}`);
      if (pane) pane.classList.add('active');
    });
  });

  // Add product modal
  const adminProductModal = document.getElementById('adminProductModal');
  const btnOpenAdd = document.getElementById('btnOpenAddProductModal');
  const btnCloseAdminProd = document.getElementById('btnCloseAdminProdModal');
  const adminProductForm = document.getElementById('adminProductForm');

  btnOpenAdd?.addEventListener('click', () => {
    document.getElementById('adminProdModalTitle').textContent = 'Thêm Sản Phẩm Mới Vào Đồ Thị';
    document.getElementById('adminProdEditId').value = '';
    adminProductForm.reset();
    adminProductModal.style.display = 'flex';
  });

  btnCloseAdminProd?.addEventListener('click', () => adminProductModal.style.display = 'none');

  adminProductForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('adminProdEditId').value;
    const name = document.getElementById('adminProdName').value.trim();
    const customId = document.getElementById('adminProdId').value.trim();
    const category = document.getElementById('adminProdCat').value;
    const brand = document.getElementById('adminProdBrand').value.trim();
    const price = parseFloat(document.getElementById('adminProdPrice').value);
    const image = document.getElementById('adminProdImage').value.trim() || 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=400';
    const specs = document.getElementById('adminProdSpecs').value.split(',').map(s => s.trim()).filter(Boolean);
    const purposes = Array.from(document.querySelectorAll('input[name="admin_prod_purpose"]:checked')).map(c => c.value);
    const description = document.getElementById('adminProdDesc').value.trim();

    const payload = { name, category, brand, price, image, specs, purposes, description };
    if (customId) payload.id = customId;

    try {
      const url = editId ? `${API_BASE}/admin/products/${editId}` : `${API_BASE}/admin/products`;
      const method = editId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        adminProductModal.style.display = 'none';
        showToast(data.message || 'Lưu sản phẩm vào Đồ thị thành công!', 'success');
        loadAdminProducts();
        loadRecommendations();
        initAdminGraph();
      }
    } catch (err) {
      showToast('Lỗi thao tác sản phẩm!', 'error');
    }
  });

  document.getElementById('btnResetCanvasZoom')?.addEventListener('click', () => {
    if (appState.adminVisNetwork) appState.adminVisNetwork.fit();
  });

  document.getElementById('btnRefreshAdminGraph')?.addEventListener('click', () => {
    initAdminGraph();
  });
}

async function initAdminGraph() {
  const container = document.getElementById('visNetworkGraph');
  if (!container || typeof vis === 'undefined') return;

  try {
    const res = await fetch(`${API_BASE}/admin/graph-canvas`);
    const graphData = await res.json();
    appState.adminGraphData = graphData;

    // Color map by node type
    const colorMap = {
      'User': '#3b82f6',
      'Product': '#10b981',
      'Category': '#f59e0b',
      'Brand': '#8b5cf6',
      'Purpose': '#ec4899',
      'Spec': '#64748b'
    };

    const nodes = new vis.DataSet(graphData.nodes.map(n => ({
      id: n.id,
      label: n.name || n.label || n.id,
      title: `${n.type}: ${n.name || n.id}`,
      color: {
        background: colorMap[n.type] || '#94a3b8',
        border: '#ffffff',
        highlight: { background: '#ef4444', border: '#1e293b' }
      },
      font: { color: '#1e293b', size: 12, face: 'Inter' },
      shape: n.type === 'Product' ? 'box' : (n.type === 'User' ? 'circle' : 'ellipse'),
      raw: n
    })));

    const edges = new vis.DataSet(graphData.links.map(l => ({
      from: l.source,
      to: l.target,
      label: l.relation || '',
      arrows: 'to',
      font: { size: 9, color: '#64748b', align: 'middle' },
      color: { color: '#cbd5e1', highlight: '#3b82f6' }
    })));

    const options = {
      nodes: { borderWidth: 2, shadow: true },
      edges: { smooth: { type: 'continuous' } },
      physics: {
        stabilization: true,
        barnesHut: { gravitationalConstant: -2500, springLength: 120 }
      },
      interaction: { hover: true, tooltipDelay: 200 }
    };

    appState.adminVisNetwork = new vis.Network(container, { nodes, edges }, options);

    appState.adminVisNetwork.on('selectNode', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeObj = graphData.nodes.find(n => n.id === nodeId);
        renderNodeDetailsPanel(nodeObj, graphData.links.filter(l => l.source === nodeId || l.target === nodeId));
      }
    });

    // Populate focus select
    const focusSelect = document.getElementById('canvasFocusNodeSelect');
    if (focusSelect) {
      focusSelect.innerHTML = '<option value="">-- Xem toàn bộ đồ thị --</option>' +
        graphData.nodes.map(n => `<option value="${n.id}">[${n.type}] ${n.name || n.id}</option>`).join('');
      focusSelect.onchange = (e) => {
        if (e.target.value && appState.adminVisNetwork) {
          appState.adminVisNetwork.focus(e.target.value, { scale: 1.2, animation: true });
        }
      };
    }
  } catch (err) {
    console.error('Error loading admin graph canvas:', err);
  }
}

function renderNodeDetailsPanel(node, connectedLinks) {
  const panel = document.getElementById('visNodeDetailContent');
  if (!panel || !node) return;

  panel.innerHTML = `
    <div style="background:#f8fafc; padding:10px; border-radius:4px; border:1px solid #e2e8f0; margin-bottom:10px;">
      <strong style="color:#0f172a; font-size:14px;">${node.name || node.label || node.id}</strong><br>
      <span style="font-size:11px; background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px;">Loại: ${node.type}</span>
      <p style="font-size:12px; margin-top:6px; color:#475569;">${node.description || 'Không có mô tả bổ sung.'}</p>
    </div>
    <h5 style="font-size:12px; font-weight:700; margin-bottom:6px;">Liên kết Tri thức (${connectedLinks.length}):</h5>
    <ul style="font-size:11px; color:#334155; padding-left:16px;">
      ${connectedLinks.map(l => `<li><code>${l.relation}</code> ➔ ${l.source === node.id ? l.target : l.source}</li>`).join('')}
    </ul>
  `;
}

async function loadAdminProducts() {
  const tbody = document.getElementById('adminProductsTableBody');
  const badge = document.getElementById('adminProductCountBadge');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/products`);
    const products = await res.json();
    if (badge) badge.textContent = `${products.length} sản phẩm`;

    tbody.innerHTML = products.map(p => `
      <tr>
        <td><code>${p.id}</code></td>
        <td><img src="${p.image}" style="width:40px; height:40px; object-fit:cover; border-radius:4px;" /></td>
        <td><strong>${p.name}</strong></td>
        <td>${p.category}</td>
        <td><span class="brand-tag">${p.brand}</span></td>
        <td style="color:#dc2626; font-weight:700;">${formatPrice(p.price)}</td>
        <td>⭐ ${p.rating || 4.8}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteAdminProduct('${p.id}')">🗑️ Xóa</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

window.deleteAdminProduct = async function(productId) {
  if (!confirm(`Bạn có chắc muốn xóa sản phẩm ${productId} khỏi Đồ thị Tri thức?`)) return;
  try {
    const res = await fetch(`${API_BASE}/admin/products/${productId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Đã xóa sản phẩm khỏi đồ thị!', 'success');
      loadAdminProducts();
      loadRecommendations();
      initAdminGraph();
    }
  } catch (e) {
    showToast('Lỗi khi xóa sản phẩm!', 'error');
  }
};

async function loadAdminUsers() {
  const container = document.getElementById('adminUsersList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/users`);
    const users = await res.json();

    container.innerHTML = users.map(u => `
      <div class="user-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${u.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;" />
          <div>
            <h4 style="margin:0; font-size:14px;">${u.name || u.full_name} (<code>${u.id}</code>)</h4>
            <span style="font-size:11px; color:#64748b;">${u.role || 'Người dùng'}</span>
          </div>
        </div>
        <p style="font-size:12px; margin-top:8px; color:#334155;">
          🎯 <b>Nhu cầu hiện tại:</b> ${u.wishlist_need || 'Chưa ghi nhận'}<br>
          🛒 <b>Lịch sử mua:</b> ${(u.history && u.history.length) || 0} sản phẩm
        </p>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// ========================================================
// RECOMMENDATIONS & 4-DIMENSIONAL XAI EXPLANATIONS
// ========================================================
async function loadRecommendations() {
  const grid = document.getElementById('productsGrid');
  const countLabel = document.getElementById('productCountLabel');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-box"><div class="spinner"></div><p>Đang duyệt Đồ thị Tri thức để tối ưu hóa gợi ý...</p></div>';

  try {
    let url = '';
    if (appState.isGuest) {
      url = `${API_BASE}/recommendations/guest?purpose=${appState.selectedPurpose}&algorithm=${appState.selectedAlgorithm}`;
    } else {
      const uid = appState.currentUser ? appState.currentUser.id : appState.selectedUserId;
      url = `${API_BASE}/recommendations?user_id=${uid}&algorithm=${appState.selectedAlgorithm}&top_k=24`;
    }

    const res = await fetch(url);
    const recs = await res.json();
    appState.recommendations = recs;

    filterAndRenderProducts();
  } catch (err) {
    grid.innerHTML = '<div class="loading-box"><p>Không thể kết nối đến máy chủ Đồ thị Tri thức.</p></div>';
  }
}

function filterAndRenderProducts() {
  const grid = document.getElementById('productsGrid');
  const countLabel = document.getElementById('productCountLabel');
  if (!grid) return;

  let list = [...appState.recommendations];

  // 1. Keyword filter
  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
  }

  // 2. Category filter
  if (appState.selectedCategory && appState.selectedCategory !== 'all') {
    list = list.filter(p => p.category === appState.selectedCategory);
  }

  // 3. Price filter
  if (appState.priceMin !== null && !isNaN(appState.priceMin)) {
    list = list.filter(p => p.price >= appState.priceMin);
  }
  if (appState.priceMax !== null && !isNaN(appState.priceMax)) {
    list = list.filter(p => p.price <= appState.priceMax);
  }

  // 4. Sort
  if (appState.sortBy === 'price_asc') list.sort((a, b) => a.price - b.price);
  else if (appState.sortBy === 'price_desc') list.sort((a, b) => b.price - a.price);
  else if (appState.sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => (b.score || 0) - (a.score || 0));

  countLabel.textContent = `Hiển thị ${list.length} sản phẩm được tối ưu từ Đồ thị Tri thức`;

  if (list.length === 0) {
    grid.innerHTML = '<div class="loading-box"><p>Không tìm thấy sản phẩm phù hợp với bộ lọc.</p></div>';
    return;
  }

  grid.innerHTML = list.map(prod => `
    <div class="product-card ebay-card">
      <div class="card-img-wrap">
        <img src="${prod.image}" alt="${prod.name}" loading="lazy" />
        <span class="match-score-badge">Độ khớp KG: ${Math.round((prod.score || 0.85) * 100)}%</span>
      </div>
      <div class="card-body">
        <h4 class="prod-title" title="${prod.name}">${prod.name}</h4>
        <div class="prod-price-row">
          <span class="price-current">${formatPrice(prod.price)}</span>
          <span class="prod-brand">${prod.brand}</span>
        </div>
        <p class="prod-specs-mini">${prod.specs ? prod.specs.slice(0, 3).join(' • ') : ''}</p>
        
        <!-- Short reason summary -->
        <div class="prod-reason-snippet">
          <span class="sparkle">💡</span> ${prod.explanation ? prod.explanation.summary : 'Được đề xuất dựa trên Đồ thị Tri thức.'}
        </div>

        <div class="card-actions">
          <button class="btn btn-sm btn-ebay-outline" onclick="openExplanationModal('${prod.id}')">
            🔍 Xem Lý Do & Key Đồ Thị
          </button>
          <button class="btn btn-sm btn-review-star" onclick="openProductReviewModal('${prod.id}', '${escapeHtml(prod.name)}')">
            ⭐ Góp ý
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// ========================================================
// DETAILED EXPLANATION MODAL & KG KEYS TABLE
// ========================================================
window.openExplanationModal = function(productId) {
  const prod = appState.recommendations.find(p => p.id === productId);
  if (!prod) return;

  const modal = document.getElementById('explanationModal');
  document.getElementById('modalProductName').textContent = prod.name;
  
  const exp = prod.explanation || {};
  document.getElementById('modalExplanationText').textContent = exp.summary || 'Sản phẩm có độ tương thích cao trên Đồ thị Tri thức.';
  document.getElementById('modalPurposeDetails').textContent = exp.purpose_fit || 'Đáp ứng hoàn hảo nhu cầu làm việc và giải trí.';
  document.getElementById('modalCompatibilityDetails').textContent = exp.compatibility || 'Tương thích phần cứng và hệ sinh thái tối đa.';

  // Render KG Keys Table
  const tbody = document.getElementById('modalKgKeysTableBody');
  if (tbody) {
    const keys = exp.kg_keys || [
      { relation: 'belongs_to', entity: prod.category, weight: 1.5, contribution: '30%' },
      { relation: 'produced_by', entity: prod.brand, weight: 2.0, contribution: '40%' },
      { relation: 'suitable_for', entity: 'Mục đích sử dụng', weight: 2.5, contribution: '30%' }
    ];
    tbody.innerHTML = keys.map(k => `
      <tr>
        <td><span class="key-relation-tag">${k.relation}</span></td>
        <td><strong>${k.entity || k.target}</strong></td>
        <td><code>${k.weight}</code></td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${k.contribution || '25%'}</span>
            <div class="impact-bar-wrap"><div class="impact-bar-fill" style="width:${k.contribution || '25%'}"></div></div>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // Render Reasoning Chain
  const chainWrap = document.getElementById('modalReasoningChain');
  if (chainWrap) {
    const paths = exp.reasoning_paths || [`Người dùng ➔ ${prod.brand} ➔ ${prod.name}`];
    chainWrap.innerHTML = paths.map(path => {
      const parts = path.split('➔').map(s => s.trim());
      return parts.map((p, idx) => `<span class="chain-node ${idx === parts.length - 1 ? 'highlight' : ''}">${p}</span>`).join(' <span class="chain-arrow">➔</span> ');
    }).join('<br>');
  }

  // Product reviews summary
  loadProductReviewsInModal(productId);

  modal.style.display = 'flex';
};

async function loadProductReviewsInModal(productId) {
  const container = document.getElementById('modalProductReviewsList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/products/${productId}/reviews`);
    const reviews = await res.json();

    if (reviews.length === 0) {
      container.innerHTML = '<p style="color:#64748b; font-size:12px;">Chưa có góp ý nào cho sản phẩm này. Hãy là người đầu tiên đóng góp!</p>';
      return;
    }

    container.innerHTML = reviews.map(r => `
      <div class="review-item-card">
        <div class="review-item-header">
          <strong>👤 ${r.user_name || 'Khách'}</strong>
          <span>${'⭐'.repeat(r.rating || 5)}</span>
        </div>
        <p style="margin:2px 0;">${r.comment || ''}</p>
        ${r.pros ? `<div class="review-pros-cons"><span class="pro-badge">+ Ưu:</span> ${r.pros}</div>` : ''}
        ${r.cons ? `<div class="review-pros-cons"><span class="con-badge">- Nhược:</span> ${r.cons}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '';
  }
}

// ========================================================
// PROFILE DRAWER & INTERACTIONS
// ========================================================
function openProfileDrawer() {
  if (!appState.currentUser) return;
  const modal = document.getElementById('profileModal');
  document.getElementById('profileModalUserName').textContent = appState.currentUser.name || appState.currentUser.full_name;
  
  const summary = document.getElementById('profileInfoSummary');
  summary.innerHTML = `
    <p><b>Mã tài khoản:</b> <code>${appState.currentUser.id}</code></p>
    <p><b>Vai trò / Sở thích:</b> ${appState.currentUser.role || 'Người dùng công nghệ'}</p>
    <p><b>Trạng thái phiên:</b> Đã lưu tự động (Persistent Session)</p>
  `;

  const wishBox = document.getElementById('profileWishlistDisplay');
  wishBox.innerHTML = appState.currentUser.wishlist_need 
    ? `🎯 <b>Sản phẩm săn đón:</b> "${appState.currentUser.wishlist_need}" (Đã kết nối cạnh KG trọng số 4.0)`
    : 'Chưa đặt sản phẩm mong muốn cụ thể.';

  modal.style.display = 'flex';
}

// ========================================================
// METADATA & UTILS
// ========================================================
async function loadMetadata() {
  try {
    const res = await fetch(`${API_BASE}/metadata`);
    appState.metadata = await res.json();
    populateMetadataUI();
  } catch (err) {}
}

async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`);
    appState.users = await res.json();
    const select = document.getElementById('userSelect');
    if (select) {
      select.innerHTML = appState.users.map(u => `<option value="${u.id}">${u.name || u.full_name} (${u.role || 'User'})</option>`).join('');
    }
  } catch (err) {}
}

async function loadMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const m = await res.json();
    const badge = document.getElementById('headerMetricsBadge');
    if (badge && m.graph) {
      badge.textContent = `Đồ thị: ${m.graph.nodes || 48} nút • ${m.graph.edges || 115} cạnh`;
    }
  } catch (err) {}
}

function populateMetadataUI() {
  const catSelect = document.getElementById('searchCategorySelect');
  const catFilterList = document.getElementById('categoryFilterList');
  const brandList = document.getElementById('sidebarBrandList');
  const onboardBrandList = document.getElementById('onboardingBrandList');
  const onboardCatList = document.getElementById('onboardingCategoryList');
  const surveyBrandChips = document.getElementById('surveyBrandChips');
  const surveyCatChips = document.getElementById('surveyCatChips');

  if (appState.metadata.categories && catSelect) {
    catSelect.innerHTML = '<option value="all">Tất cả danh mục</option>' +
      appState.metadata.categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  if (appState.metadata.categories && catFilterList) {
    catFilterList.innerHTML = '<li class="cat-filter-item active" data-cat="all">Tất cả sản phẩm</li>' +
      appState.metadata.categories.map(c => `<li class="cat-filter-item" data-cat="${c}">${c}</li>`).join('');
    
    catFilterList.querySelectorAll('.cat-filter-item').forEach(item => {
      item.addEventListener('click', () => {
        catFilterList.querySelectorAll('.cat-filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        appState.selectedCategory = item.getAttribute('data-cat');
        if (catSelect) catSelect.value = appState.selectedCategory;
        filterAndRenderProducts();
      });
    });
  }

  if (appState.metadata.brands && brandList) {
    brandList.innerHTML = appState.metadata.brands.map(b => `
      <label class="sidebar-check-item">
        <input type="checkbox" name="sidebar_brand" value="${b}" /> ${b}
      </label>
    `).join('');
  }

  if (appState.metadata.brands && onboardBrandList) {
    onboardBrandList.innerHTML = appState.metadata.brands.map(b => `
      <label class="ebay-chip"><input type="checkbox" name="onboard_brand" value="${b}"><span>${b}</span></label>
    `).join('');
  }

  if (appState.metadata.categories && onboardCatList) {
    onboardCatList.innerHTML = appState.metadata.categories.map(c => `
      <label class="ebay-chip"><input type="checkbox" name="onboard_category" value="${c}"><span>${c}</span></label>
    `).join('');
  }

  if (appState.metadata.brands && surveyBrandChips) {
    surveyBrandChips.innerHTML = appState.metadata.brands.map(b => `
      <label class="ebay-chip"><input type="checkbox" name="survey_brand" value="${b}"><span>${b}</span></label>
    `).join('');
  }

  if (appState.metadata.categories && surveyCatChips) {
    surveyCatChips.innerHTML = appState.metadata.categories.map(c => `
      <label class="ebay-chip"><input type="checkbox" name="survey_cat" value="${c}"><span>${c}</span></label>
    `).join('');
  }
}

function updateSidebarCategoryUI(cat) {
  const catFilterList = document.getElementById('categoryFilterList');
  if (!catFilterList) return;
  catFilterList.querySelectorAll('.cat-filter-item').forEach(item => {
    if (item.getAttribute('data-cat') === cat) item.classList.add('active');
    else item.classList.remove('active');
  });
}

function setupFiltersAndSort() {
  document.getElementById('btnApplyPriceFilter')?.addEventListener('click', () => {
    const min = parseFloat(document.getElementById('priceMin').value);
    const max = parseFloat(document.getElementById('priceMax').value);
    appState.priceMin = isNaN(min) ? null : min;
    appState.priceMax = isNaN(max) ? null : max;
    filterAndRenderProducts();
  });

  document.getElementById('sortBySelect')?.addEventListener('change', (e) => {
    appState.sortBy = e.target.value;
    filterAndRenderProducts();
  });

  document.getElementById('algoSelect')?.addEventListener('change', async (e) => {
    appState.selectedAlgorithm = e.target.value;
    await loadRecommendations();
  });

  document.getElementById('btnRefreshRecs')?.addEventListener('click', async () => {
    await loadRecommendations();
    showToast('Đã làm mới đề xuất từ Đồ thị Tri thức!', 'success');
  });
}

function formatPrice(num) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num || 0);
}

function escapeHtml(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
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
