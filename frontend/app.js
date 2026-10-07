// K/H Team Electronics - User Portal Logic
const API_BASE = '/api';

let appState = {
  users: [],
  currentUser: null,
  isGuest: false,
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
  metadata: { categories: [], brands: [], purposes: [] },
  favorites: [],
  cart: []
};

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setup3FacetSearch();
  setupAuth();
  setupWishlistModal();
  setupReviewModal();
  setupOnboardingAndSurvey();
  setupFiltersAndSort();
  setupUserGraphExplorer();
  setupCartAndFavorites();

  await loadMetadata();
  await loadUsers();
  restoreSessionOrGuest();
  loadCartAndFavoritesFromStorage();
  await loadRecommendations();
  await loadMetrics();
  await loadAnalyticsDashboard();
});

// ========================================================
// NAVIGATION & TABS
// ========================================================
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

      if (target === 'graph-explorer') {
        initUserGraphCanvas();
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
        showToast(data.error || 'Sai tên đăng nhập hoặc mật khẩu!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ!', 'error');
    }
  });

  // Register Submit
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const role = document.getElementById('regRole').value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, role })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authModal.style.display = 'none';
        showToast('Đăng ký thành công! Vui lòng hoàn tất khảo sát khởi đầu.', 'success');
        handleLoginSuccess(data.user, true);
      } else {
        showToast(data.error || 'Đăng ký thất bại!', 'error');
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

  document.getElementById('btnProfileRetakeSurvey')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('onboardingSurveyModal').style.display = 'flex';
  });

  document.getElementById('btnProfileOpenFavs')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
    renderFavoritesModal();
  });

  document.getElementById('btnProfileOpenCart')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
    renderCartModal();
  });

  document.getElementById('btnProfileLogout')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('btnLogout')?.click();
  });

  document.getElementById('btnGuestOpenLogin')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btnHeroAuth')?.addEventListener('click', () => openAuthModal('login'));
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

  localStorage.setItem('kh_recsys_session', JSON.stringify({ userId: user.id, username: user.username, is_admin: !!(user.is_admin || user.username === 'admin' || user.id === 'admin') }));

  // Nếu là tài khoản Quản trị viên (admin), chuyển hướng ngay đến trang Quản trị
  if (user.is_admin || user.username === 'admin' || user.id === 'admin') {
    showToast('Đăng nhập Quản trị viên thành công! Đang chuyển đến Trang Quản Trị...', 'success');
    setTimeout(() => {
      window.location.href = '/admin';
    }, 600);
    return;
  }

  updateAuthUI();
  loadRecommendations();

  // Khảo sát chỉ xuất hiện DUY NHẤT 1 lần ngay sau khi vừa Đăng ký tài khoản
  if (isFirstRegister) {
    document.getElementById('onboardingSurveyModal').style.display = 'flex';
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
  if (appState.users.length > 0) {
    // Default to first regular user if guest
    const defaultUser = appState.users.find(u => !u.is_admin && u.username !== 'admin') || appState.users[0];
    appState.currentUser = defaultUser;
    appState.selectedUserId = defaultUser.id;
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
  const headerAdminLink = document.getElementById('headerAdminLink');

  const isAdmin = !!(appState.currentUser && (appState.currentUser.is_admin || appState.currentUser.username === 'admin' || appState.currentUser.id === 'admin'));
  if (headerAdminLink) {
    headerAdminLink.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  if (appState.currentUser && !appState.isGuest) {
    authStatusHeader.style.display = 'flex';
    guestStatusHeader.style.display = 'none';
    topGreetingUser.textContent = appState.currentUser.name || appState.currentUser.full_name || appState.currentUser.username;
    if (userSelect) userSelect.value = appState.currentUser.id;

    document.getElementById('userName').textContent = appState.currentUser.name || appState.currentUser.full_name;
    document.getElementById('userRole').textContent = appState.currentUser.role || 'Thành viên K/H Team';
    if (appState.currentUser.avatar) {
      document.getElementById('userAvatar').src = appState.currentUser.avatar;
    }

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
// PRODUCT REVIEWS & FEEDBACK
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
    const cpu = document.getElementById('onboardingCpu')?.value || 'any';
    const gpu = document.getElementById('onboardingGpu')?.value || 'any';
    const ram = document.getElementById('onboardingRam')?.value || 'any';
    const ssd = document.getElementById('onboardingSsd')?.value || 'any';

    const payload = {
      user_id: appState.currentUser ? appState.currentUser.id : 'u1',
      purposes, brands, categories, budget,
      hardware_specs: { cpu, gpu, ram, ssd }
    };

    try {
      const res = await fetch(`${API_BASE}/survey/detailed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById('onboardingSurveyModal').style.display = 'none';
        showToast('Khảo sát hoàn tất! Đồ thị đã phân tích và thiết lập gợi ý chuẩn xác cho bạn.', 'success');
        await loadRecommendations();
      } else {
        showToast(data.error || 'Lỗi cập nhật khảo sát!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ khi lưu khảo sát!', 'error');
    }
  });

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
        document.querySelector('.nav-item[data-tab="recommendations"]').click();
        await loadRecommendations();
      }
    } catch (err) {
      showToast('Lỗi gửi khảo sát chi tiết!', 'error');
    }
  });

  // Cold start runner
  document.getElementById('btnRunColdStart')?.addEventListener('click', handleColdStartRun);
}

async function handleColdStartRun() {
  const persona = document.getElementById('coldStartPersonaSelect').value;
  const budget = document.getElementById('coldStartBudgetSelect').value;
  const resultsWrap = document.getElementById('coldStartResults');
  const grid = document.getElementById('coldStartGrid');

  const personaMap = {
    'gamer': 't_gaming',
    'developer': 't_laptrinh',
    'designer': 't_dohoa',
    'office': 't_vanphong'
  };

  const purpose = personaMap[persona] || 't_laptrinh';

  try {
    const res = await fetch(`${API_BASE}/recommendations/guest?purpose=${purpose}&algorithm=hybrid`);
    const recs = await res.json();
    resultsWrap.style.display = 'block';

    grid.innerHTML = recs.map(prod => `
      <div class="product-card ebay-card">
        <div class="card-img-wrap">
          <img src="${prod.image}" alt="${prod.name}" loading="lazy" />
          <span class="match-score-badge">Độ khớp Cold-Start: ${Math.round((prod.score || 0.8) * 100)}%</span>
        </div>
        <div class="card-body">
          <h4 class="prod-title">${prod.name}</h4>
          <div class="prod-price-row">
            <span class="price-current">${formatPrice(prod.price)}</span>
            <span class="prod-brand">${prod.brand}</span>
          </div>
          <div class="prod-reason-snippet">
            <span class="sparkle">💡</span> ${prod.explanation ? prod.explanation.summary : 'Gợi ý từ lan truyền đồ thị.'}
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    showToast('Lỗi chạy mô phỏng khởi động lạnh!', 'error');
  }
}

// ========================================================
// RECOMMENDATIONS & XAI EXPLANATIONS
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
    appState.recommendations = Array.isArray(recs) ? recs : (recs.recommendations || []);

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

  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)));
  }

  if (appState.selectedCategory && appState.selectedCategory !== 'all') {
    list = list.filter(p => p.category === appState.selectedCategory);
  }

  if (appState.priceMin !== null && !isNaN(appState.priceMin)) {
    list = list.filter(p => p.price >= appState.priceMin);
  }
  if (appState.priceMax !== null && !isNaN(appState.priceMax)) {
    list = list.filter(p => p.price <= appState.priceMax);
  }

  if (appState.sortBy === 'price_asc') list.sort((a, b) => a.price - b.price);
  else if (appState.sortBy === 'price_desc') list.sort((a, b) => b.price - a.price);
  else if (appState.sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else list.sort((a, b) => (b.score || 0) - (a.score || 0));

  countLabel.textContent = `Hiển thị ${list.length} sản phẩm được tối ưu từ Đồ thị Tri thức`;

  if (list.length === 0) {
    grid.innerHTML = '<div class="loading-box"><p>Không tìm thấy sản phẩm phù hợp với bộ lọc.</p></div>';
    return;
  }

  grid.innerHTML = list.map(prod => {
    const isFav = appState.favorites.includes(prod.id);
    const inCart = appState.cart.some(item => item.id === prod.id);

    return `
    <div class="product-card ebay-card" id="prod-card-${prod.id}">
      <div class="card-img-wrap">
        <img src="${prod.image}" alt="${prod.name}" loading="lazy" />
        <button class="card-btn-favorite ${isFav ? 'active' : ''}" onclick="toggleFavoriteProduct('${prod.id}', event)" title="${isFav ? 'Bỏ yêu thích' : 'Yêu thích sản phẩm'}">
          ${isFav ? '❤️' : '🤍'}
        </button>
        <span class="match-score-badge">Độ khớp KG: ${Math.round((prod.score || 0.85) * 100)}%</span>
      </div>
      <div class="card-body">
        <h4 class="prod-title" title="${prod.name}">${prod.name}</h4>
        <div class="prod-price-row">
          <span class="price-current">${formatPrice(prod.price)}</span>
          <span class="prod-brand">${prod.brand || 'Chính hãng'}</span>
        </div>
        <p class="prod-specs-mini">${prod.specs ? prod.specs.slice(0, 3).join(' • ') : ''}</p>
        
        <div class="prod-reason-snippet">
          <span class="sparkle">💡</span> ${prod.explanation ? prod.explanation.summary : 'Được đề xuất dựa trên Đồ thị Tri thức.'}
        </div>

        <div class="card-primary-actions" style="margin-top:10px; display:flex; gap:6px;">
          <button class="btn btn-sm btn-add-cart ${inCart ? 'in-cart' : ''}" onclick="toggleCartProduct('${prod.id}', event)">
            ${inCart ? '✓ Đã trong giỏ' : '🛒 Thêm vào giỏ'}
          </button>
          <button class="btn btn-sm btn-favorite-toggle ${isFav ? 'active' : ''}" onclick="toggleFavoriteProduct('${prod.id}', event)">
            ${isFav ? '❤️ Đã thích' : '🤍 Yêu thích'}
          </button>
        </div>

        <div class="card-actions" style="margin-top:8px;">
          <button class="btn btn-sm btn-ebay-outline" onclick="openExplanationModal('${prod.id}')">
            🔍 Lý Do & Key KG
          </button>
          <button class="btn btn-sm btn-review-star" onclick="openProductReviewModal('${prod.id}', '${escapeHtml(prod.name)}')">
            ⭐ Góp ý
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');
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

  const chainWrap = document.getElementById('modalReasoningChain');
  if (chainWrap) {
    const paths = exp.reasoning_paths || [`Người dùng ➔ ${prod.brand} ➔ ${prod.name}`];
    chainWrap.innerHTML = paths.map(path => {
      const parts = path.split('➔').map(s => s.trim());
      return parts.map((p, idx) => `<span class="chain-node ${idx === parts.length - 1 ? 'highlight' : ''}">${p}</span>`).join(' <span class="chain-arrow">➔</span> ');
    }).join('<br>');
  }

  loadProductReviewsInModal(productId);
  modal.style.display = 'flex';
};

async function loadProductReviewsInModal(productId) {
  const container = document.getElementById('modalProductReviewsList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/products/reviews?product_id=${productId}`);
    const data = await res.json();
    const reviews = data.reviews || [];

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
async function openProfileDrawer() {
  if (!appState.currentUser) return;
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  const userId = appState.currentUser.id;

  // Attempt to fetch freshest profile from /api/user/<userId>
  let user = appState.currentUser;
  try {
    const res = await fetch(`${API_BASE}/user/${userId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        user = data.user;
        appState.currentUser = user;
      }
    }
  } catch (e) {
    console.warn('Could not fetch fresh user profile:', e);
  }

  // 1. Header
  const avatarEl = document.getElementById('profileModalAvatar');
  if (avatarEl) {
    avatarEl.src = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`;
  }

  const nameEl = document.getElementById('profileModalUserName');
  if (nameEl) nameEl.textContent = user.name || user.full_name || user.username || user.id;

  const roleTag = document.getElementById('profileModalRoleTag');
  if (roleTag) {
    roleTag.textContent = user.is_admin ? '👑 Quản Trị Viên' : (user.role || 'Người dùng');
    if (user.is_admin) {
      roleTag.style.background = '#fef3c7';
      roleTag.style.color = '#b45309';
      roleTag.style.borderColor = '#fde68a';
    } else {
      roleTag.style.background = '#eff6ff';
      roleTag.style.color = '#1d4ed8';
      roleTag.style.borderColor = '#bfdbfe';
    }
  }

  const metaEl = document.getElementById('profileModalMeta');
  if (metaEl) {
    metaEl.innerHTML = `Email: <b>${user.email || 'Chưa cung cấp'}</b> • Mã ID: <code>${user.id}</code> • Đăng nhập: <b>${user.login_count || 1}</b> lần`;
  }

  // 2. Stats
  const favs = appState.favorites || JSON.parse(localStorage.getItem('kh_favorites') || '[]');
  const cart = appState.cart || JSON.parse(localStorage.getItem('kh_cart') || '[]');
  const totalEdges = user.interactions_count || ((user.interactions ? user.interactions.length : 0) + 
    (user.preferred_categories ? user.preferred_categories.length : 0) + 
    (user.preferred_brands ? user.preferred_brands.length : 0) + 
    (user.preferred_tags ? user.preferred_tags.length : 0));

  const elEdges = document.getElementById('pStatEdges');
  if (elEdges) elEdges.textContent = totalEdges || 0;

  const elFavs = document.getElementById('pStatFavs');
  if (elFavs) elFavs.textContent = favs.length || 0;

  const elCart = document.getElementById('pStatCart');
  if (elCart) elCart.textContent = cart.length || 0;

  const elLogins = document.getElementById('pStatLogins');
  if (elLogins) elLogins.textContent = user.login_count || 1;

  // 3. Account Details
  const accountDetails = document.getElementById('profileAccountDetails');
  if (accountDetails) {
    accountDetails.innerHTML = `
      <p><b>Tên đăng nhập:</b> <code>${user.username || user.id}</code></p>
      <p><b>Họ và tên:</b> ${user.name || user.full_name || 'Khách hàng'}</p>
      <p><b>Phân quyền hệ thống:</b> <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px;">${user.is_admin ? 'Quản trị viên (Admin)' : 'Thành viên'}</span></p>
      <p><b>Trạng thái khảo sát KG:</b> <span class="badge" style="background:${user.survey_completed ? '#dcfce7; color:#166534;' : '#fef3c7; color:#b45309;'} padding:2px 8px; border-radius:10px;">${user.survey_completed ? '✅ Đã kích hoạt' : '⚠️ Chưa hoàn tất'}</span></p>
      <p><b>Trạng thái phiên:</b> <span style="color:#10b981; font-weight:600;">● Đang hoạt động (Active Session)</span></p>
      <p><b>Độ tin cậy đồ thị:</b> <span style="color:#3b82f6; font-weight:700;">100% Khớp tri thức</span></p>
    `;
  }

  // 4. Preferences / Survey Content
  const prefContainer = document.getElementById('profilePreferencesContent');
  if (prefContainer) {
    let catsHtml = '';
    if (user.preferred_categories && user.preferred_categories.length > 0) {
      catsHtml = user.preferred_categories.map(c => `<span class="pref-chip">${c.icon || '🏷️'} ${c.name}</span>`).join(' ');
    } else if (user.detailed_survey && user.detailed_survey.categories && user.detailed_survey.categories.length > 0) {
      catsHtml = user.detailed_survey.categories.map(c => `<span class="pref-chip">🏷️ ${c}</span>`).join(' ');
    } else {
      catsHtml = '<span style="color:#94a3b8; font-style:italic;">Chưa chọn danh mục</span>';
    }

    let brandsHtml = '';
    if (user.preferred_brands && user.preferred_brands.length > 0) {
      brandsHtml = user.preferred_brands.map(b => `<span class="pref-chip" style="background:#ede9fe; color:#6d28d9; border-color:#ddd6fe;">🏢 ${b.name}</span>`).join(' ');
    } else if (user.detailed_survey && user.detailed_survey.brands && user.detailed_survey.brands.length > 0) {
      brandsHtml = user.detailed_survey.brands.map(b => `<span class="pref-chip" style="background:#ede9fe; color:#6d28d9; border-color:#ddd6fe;">🏢 ${b}</span>`).join(' ');
    } else {
      brandsHtml = '<span style="color:#94a3b8; font-style:italic;">Chưa chọn thương hiệu</span>';
    }

    let tagsHtml = '';
    if (user.preferred_tags && user.preferred_tags.length > 0) {
      tagsHtml = user.preferred_tags.map(t => `<span class="pref-chip" style="background:#fce7f3; color:#be185d; border-color:#fbcfe8;">🎯 ${t.name}</span>`).join(' ');
    } else if (user.detailed_survey && user.detailed_survey.tags && user.detailed_survey.tags.length > 0) {
      tagsHtml = user.detailed_survey.tags.map(t => `<span class="pref-chip" style="background:#fce7f3; color:#be185d; border-color:#fbcfe8;">🎯 ${t}</span>`).join(' ');
    } else {
      tagsHtml = '<span style="color:#94a3b8; font-style:italic;">Chưa chọn mục đích sử dụng</span>';
    }

    // Specs & Budget
    let budgetText = 'Mọi mức ngân sách';
    if (user.detailed_survey && user.detailed_survey.budget) {
      const bMap = {
        'under_15m': 'Dưới 15 triệu VNĐ',
        '15m_30m': 'Từ 15 đến 30 triệu VNĐ',
        'above_30m': 'Phân khúc cao cấp (Trên 30 triệu VNĐ)',
        'all': 'Mọi mức ngân sách'
      };
      budgetText = bMap[user.detailed_survey.budget] || user.detailed_survey.budget;
    }

    let specsHtml = '';
    if (user.detailed_survey && user.detailed_survey.hardware_specs) {
      const specs = user.detailed_survey.hardware_specs;
      const specPairs = Object.entries(specs).filter(([k, v]) => v && v !== 'any').map(([k, v]) => `<b>${k.toUpperCase()}:</b> ${v}`).join(' • ');
      if (specPairs) {
        specsHtml = `<div class="pref-group"><div class="pref-label">⚙️ Yêu cầu thông số cấu hình:</div><div style="font-size:12px; color:#475569;">${specPairs}</div></div>`;
      }
    }

    prefContainer.innerHTML = `
      <div class="pref-group">
        <div class="pref-label">💻 Danh mục quan tâm:</div>
        <div class="pref-chips-wrap">${catsHtml}</div>
      </div>
      <div class="pref-group" style="margin-top:8px;">
        <div class="pref-label">🏢 Thương hiệu ưa thích:</div>
        <div class="pref-chips-wrap">${brandsHtml}</div>
      </div>
      <div class="pref-group" style="margin-top:8px;">
        <div class="pref-label">🎯 Mục đích sử dụng & Nhu cầu:</div>
        <div class="pref-chips-wrap">${tagsHtml}</div>
      </div>
      ${specsHtml}
      <div class="pref-group" style="margin-top:8px;">
        <div class="pref-label">💰 Ngân sách dự kiến:</div>
        <div style="font-size:12px; color:#059669; font-weight:700;">${budgetText}</div>
      </div>
    `;
  }

  // 5. Wishlist / Target Need
  const wishBox = document.getElementById('profileWishlistDisplay');
  if (wishBox) {
    let targetNeed = user.last_target_need || user.wishlist_need;
    if (!targetNeed && user.wishlist && user.wishlist.length > 0) {
      const lastW = user.wishlist[user.wishlist.length - 1];
      targetNeed = typeof lastW === 'object' ? (lastW.query || lastW.name) : lastW;
    }

    if (targetNeed) {
      wishBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <span style="font-size:14px; font-weight:700; color:#15803d;">🎯 ${targetNeed}</span>
            <span class="badge" style="background:#bbf7d0; color:#14532d; font-size:11px; margin-left:8px; padding:2px 8px; border-radius:10px;">Trọng số KG: 4.0 (Tối đa)</span>
          </div>
        </div>
        <p style="font-size:12px; color:#166534; margin:0;">
          Thuật toán đồ thị tri thức ưu tiên sản phẩm tương thích với nhu cầu săn đón này lên vị trí đầu trang.
        </p>
      `;
    } else {
      wishBox.innerHTML = `
        <p style="color:#64748b; font-size:12px; margin:0;">
          Chưa đặt sản phẩm mong muốn cụ thể. Bạn có thể gõ tìm kiếm hoặc chọn danh mục để hệ thống tự động ghi nhận nhu cầu mục tiêu.
        </p>
      `;
    }
  }

  // 6. Graph Interactions History
  const historyBox = document.getElementById('profileInteractionsHistory');
  if (historyBox) {
    const interactions = user.interactions || [];

    if (interactions.length === 0) {
      historyBox.innerHTML = `
        <div style="text-align:center; padding:18px; color:#94a3b8; font-size:12px; background:#f8fafc; border-radius:6px;">
          Chưa có tương tác nào được ghi nhận trên đồ thị.<br>
          <span style="font-size:11px; color:#64748b;">Hãy thử bấm <b>❤️ Yêu thích</b> hoặc <b>🛒 Thêm vào giỏ</b> tại trang chủ để mở rộng liên kết đồ thị tri thức!</span>
        </div>
      `;
    } else {
      const typeBadgeMap = {
        'likes': { text: '❤️ Đã thích', class: 'likes', bg: '#fee2e2', color: '#dc2626' },
        'wants': { text: '🎯 Mong muốn', class: 'wants', bg: '#dbeafe', color: '#2563eb' },
        'cart': { text: '🛒 Giỏ hàng', class: 'cart', bg: '#dbeafe', color: '#2563eb' },
        'viewed': { text: '👁️ Đã xem', class: 'viewed', bg: '#f1f5f9', color: '#475569' },
        'purchased': { text: '🛍️ Đã mua', class: 'purchased', bg: '#dcfce7', color: '#166534' },
        'reviewed': { text: '⭐ Đã đánh giá', class: 'reviewed', bg: '#fef3c7', color: '#d97706' }
      };

      historyBox.innerHTML = interactions.map(item => {
        const badgeInfo = typeBadgeMap[item.edge_type] || { text: item.label || item.edge_type, bg: '#f1f5f9', color: '#334155' };
        const displayPrice = item.target_price ? formatPrice(item.target_price) : '';
        const displayImg = item.target_image || 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=100';

        return `
          <div class="history-item">
            <div class="history-item-left">
              <img src="${displayImg}" class="history-item-img" onerror="this.src='https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=100'" />
              <div>
                <strong style="font-size:13px; color:#0f172a; display:block;">${item.target_name || item.target_id}</strong>
                <span style="font-size:11px; color:#64748b;">Mã SP: <code>${item.target_id}</code> ${displayPrice ? '• ' + displayPrice : ''}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <span class="history-tag" style="background:${badgeInfo.bg}; color:${badgeInfo.color};">${badgeInfo.text}</span>
              <div style="font-size:10px; color:#94a3b8; margin-top:2px;">KG Weight: <b>${item.weight || 1.0}</b></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 7. Action buttons
  const btnGoAdmin = document.getElementById('btnProfileGoAdmin');
  if (btnGoAdmin) {
    btnGoAdmin.style.display = user.is_admin ? 'inline-block' : 'none';
  }

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
    const data = await res.json();
    appState.users = data.users || data || [];
    const select = document.getElementById('userSelect');
    if (select) {
      select.innerHTML = appState.users.map(u => `<option value="${u.id}">${u.name || u.full_name || u.username} (${u.role || 'User'})</option>`).join('');
    }
  } catch (err) {}
}

async function loadMetrics() {
  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const data = await res.json();
    const m = data.metrics || data;
    const badge = document.getElementById('headerMetricsBadge');
    if (badge && m) {
      badge.textContent = `Đồ thị: ${m.total_nodes || 52} nút • ${m.total_edges || 191} cạnh`;
    }
  } catch (err) {}
}

async function loadAnalyticsDashboard() {
  const container = document.getElementById('analyticsDashboard');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/metrics`);
    const data = await res.json();
    const m = data.metrics || data;

    container.innerHTML = `
      <div class="metric-card">
        <h4>Cấu trúc Đồ thị (Graph Topology)</h4>
        <p><b>Tổng số nút:</b> ${m.total_nodes || 52}</p>
        <p><b>Tổng số cạnh quan hệ:</b> ${m.total_edges || 191}</p>
        <p><b>Mật độ liên kết:</b> ${m.density || 0.07}</p>
      </div>
      <div class="metric-card">
        <h4>Thuật toán Gợi ý (Algorithms)</h4>
        <p><b>PPR:</b> Personalized PageRank (Restart alpha = 0.85)</p>
        <p><b>Meta-path:</b> U-B-P, U-N-P, U-P-U-P</p>
        <p><b>Hybrid:</b> 0.55 Meta-path + 0.45 PPR + Rating Weight</p>
      </div>
    `;
  } catch (e) {}
}

function populateMetadataUI() {
  const catSelect = document.getElementById('searchCategorySelect');
  const catFilterList = document.getElementById('categoryFilterList');
  const brandList = document.getElementById('sidebarBrandList');
  const onboardBrandList = document.getElementById('onboardingBrandList');
  const onboardCatList = document.getElementById('onboardingCategoryList');
  const surveyBrandChips = document.getElementById('surveyBrandChips');
  const surveyCatChips = document.getElementById('surveyCatChips');

  const categories = (appState.metadata.categories || []).map(c => typeof c === 'object' ? c.name : c);
  const brands = (appState.metadata.brands || []).map(b => typeof b === 'object' ? b.name : b);

  if (categories.length && catSelect) {
    catSelect.innerHTML = '<option value="all">Tất cả danh mục</option>' +
      categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  if (categories.length && catFilterList) {
    catFilterList.innerHTML = '<li class="cat-filter-item active" data-cat="all">Tất cả sản phẩm</li>' +
      categories.map(c => `<li class="cat-filter-item" data-cat="${c}">${c}</li>`).join('');
    
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

  if (brands.length && brandList) {
    brandList.innerHTML = brands.map(b => `
      <label class="sidebar-check-item">
        <input type="checkbox" name="sidebar_brand" value="${b}" /> ${b}
      </label>
    `).join('');
  }

  if (brands.length && onboardBrandList) {
    onboardBrandList.innerHTML = brands.map(b => `
      <label class="ebay-chip"><input type="checkbox" name="onboard_brand" value="${b}"><span>${b}</span></label>
    `).join('');
  }

  if (categories.length && onboardCatList) {
    onboardCatList.innerHTML = categories.map(c => `
      <label class="ebay-chip"><input type="checkbox" name="onboard_category" value="${c}"><span>${c}</span></label>
    `).join('');
  }

  if (brands.length && surveyBrandChips) {
    surveyBrandChips.innerHTML = brands.map(b => `
      <label class="ebay-chip"><input type="checkbox" name="survey_brand" value="${b}"><span>${b}</span></label>
    `).join('');
  }

  if (categories.length && surveyCatChips) {
    surveyCatChips.innerHTML = categories.map(c => `
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

  document.getElementById('btnCloseModal')?.addEventListener('click', () => {
    document.getElementById('explanationModal').style.display = 'none';
  });
  document.getElementById('btnModalClose')?.addEventListener('click', () => {
    document.getElementById('explanationModal').style.display = 'none';
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

// ========================================================
// USER KNOWLEDGE GRAPH 2D EXPLORER (VIS.JS)
// ========================================================
let userGraphState = {
  visNetwork: null,
  graphData: null,
  nodesDataSet: null
};

function setupUserGraphExplorer() {
  document.getElementById('btnUserResetCanvasZoom')?.addEventListener('click', () => {
    if (userGraphState.visNetwork) userGraphState.visNetwork.fit();
  });

  document.getElementById('btnUserRefreshGraph')?.addEventListener('click', () => {
    initUserGraphCanvas(true);
  });
}

async function initUserGraphCanvas(forceReload = false) {
  const container = document.getElementById('userVisNetworkGraph');
  if (!container) return;

  if (userGraphState.visNetwork && !forceReload) {
    setTimeout(() => userGraphState.visNetwork.fit(), 200);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/graph-canvas?filter_type=all`);
    const data = await res.json();
    if (!data.success || !data.graph) return;

    userGraphState.graphData = data.graph;
    const graphData = data.graph;

    const colorMap = {
      'User': '#3b82f6',
      'Product': '#10b981',
      'Category': '#f59e0b',
      'Brand': '#8b5cf6',
      'Purpose': '#ec4899',
      'Tag': '#ec4899',
      'Spec': '#64748b'
    };

    const currentUserId = appState.currentUser ? appState.currentUser.id : 'u1';

    const nodesList = (graphData.nodes || []).map(n => {
      const isCurrent = (n.id === currentUserId);
      return {
        id: n.id,
        label: isCurrent ? `⭐ ${n.label || n.name} (Bạn)` : (n.label || n.name || n.id),
        title: `${n.type}: ${n.name || n.label || n.id}`,
        color: {
          background: isCurrent ? '#e53238' : (colorMap[n.type] || '#94a3b8'),
          border: isCurrent ? '#fbbf24' : '#ffffff',
          highlight: { background: '#ef4444', border: '#1e293b' }
        },
        font: { color: isCurrent ? '#b91c1c' : '#1e293b', size: isCurrent ? 14 : 12, face: 'Inter', bold: isCurrent },
        shape: n.type === 'Product' ? 'box' : (n.type === 'User' ? 'circle' : 'ellipse'),
        size: isCurrent ? 28 : (n.type === 'Product' ? 20 : 16),
        raw: n
      };
    });

    const edgesList = (graphData.edges || graphData.links || []).map(l => ({
      from: l.from || l.source,
      to: l.to || l.target,
      label: l.label || l.type || l.relation || '',
      arrows: 'to',
      font: { size: 9, color: '#64748b', align: 'middle' },
      color: { color: '#cbd5e1', highlight: '#3b82f6' }
    }));

    userGraphState.nodesDataSet = new vis.DataSet(nodesList);
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

    userGraphState.visNetwork = new vis.Network(container, { nodes: userGraphState.nodesDataSet, edges }, options);

    userGraphState.visNetwork.on('selectNode', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const nodeObj = (graphData.nodes || []).find(n => n.id === nodeId);
        const connectedLinks = (graphData.edges || graphData.links || []).filter(l => 
          (l.from || l.source) === nodeId || (l.to || l.target) === nodeId
        );
        renderUserNodeDetailsPanel(nodeObj, connectedLinks);
      }
    });

    const focusSelect = document.getElementById('userCanvasFocusNodeSelect');
    const typeFilter = document.getElementById('userCanvasNodeTypeFilter');

    function applyUserGraphFilters() {
      const selectedFocusId = focusSelect ? focusSelect.value : '';
      const selectedType = typeFilter ? typeFilter.value : 'all';

      let filteredNodes = nodesList;
      let filteredEdges = edgesList;

      // 1. If Focus Node selected, isolate its 1-hop neighborhood (Ego Network)
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

        const nodeObj = (graphData.nodes || []).find(n => n.id === selectedFocusId);
        const connectedLinks = (graphData.edges || graphData.links || []).filter(l => 
          (l.from || l.source) === selectedFocusId || (l.to || l.target) === selectedFocusId
        );
        if (nodeObj) renderUserNodeDetailsPanel(nodeObj, connectedLinks);
      }

      if (selectedType !== 'all') {
        filteredNodes = filteredNodes.filter(n => n.raw.type === selectedType || n.id === selectedFocusId);
        const validNodeIds = new Set(filteredNodes.map(n => n.id));
        filteredEdges = filteredEdges.filter(e => validNodeIds.has(e.from) && validNodeIds.has(e.to));
      }

      userGraphState.nodesDataSet.clear();
      userGraphState.nodesDataSet.add(filteredNodes);

      edges.clear();
      edges.add(filteredEdges);

      setTimeout(() => {
        if (userGraphState.visNetwork) {
          userGraphState.visNetwork.fit({ animation: { duration: 300 } });
        }
      }, 100);
    }

    if (focusSelect) {
      focusSelect.innerHTML = '<option value="">-- Toàn bộ đồ thị --</option>' +
        (graphData.nodes || []).map(n => `<option value="${n.id}">[${n.type}] ${n.label || n.name || n.id}</option>`).join('');
      focusSelect.onchange = applyUserGraphFilters;
    }

    typeFilter?.addEventListener('change', applyUserGraphFilters);

    // Initial fit
    setTimeout(() => {
      if (userGraphState.visNetwork) {
        userGraphState.visNetwork.fit({ animation: { duration: 400 } });
      }
    }, 300);

  } catch (err) {
    console.error('Error initializing user graph:', err);
  }
}

function renderUserNodeDetailsPanel(node, connectedLinks) {
  const panel = document.getElementById('userVisNodeDetailContent');
  if (!panel || !node) return;

  panel.innerHTML = `
    <div style="background:#f8fafc; padding:12px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:12px;">
      <strong style="color:#0f172a; font-size:15px;">${node.label || node.name || node.id}</strong><br>
      <span style="font-size:11px; background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:4px; font-weight:700;">Loại: ${node.type}</span>
      <p style="font-size:12px; margin-top:8px; color:#475569;">${node.description || (node.price ? `Giá: ${formatPrice(node.price)}` : 'Thực thể trong Mạng lưới Đồ thị Tri thức')}</p>
    </div>
    <h5 style="font-size:13px; font-weight:700; margin-bottom:8px; color:var(--text-main);">Các Cạnh Kết Nối (${connectedLinks.length}):</h5>
    <ul style="font-size:12px; color:#334155; padding-left:18px; line-height:1.6;">
      ${connectedLinks.map(l => {
        const from = l.from || l.source;
        const to = l.to || l.target;
        const label = l.label || l.type || l.relation || 'liên kết';
        return `<li><code>${label}</code> ➔ <strong>${from === node.id ? to : from}</strong></li>`;
      }).join('')}
    </ul>
  `;
}

// ========================================================
// FAVORITES & SHOPPING CART LOGIC
// ========================================================
function setupCartAndFavorites() {
  document.getElementById('btnOpenFavoritesModal')?.addEventListener('click', openFavoritesModal);
  document.getElementById('btnCloseFavoritesModal')?.addEventListener('click', () => {
    document.getElementById('favoritesModal').style.display = 'none';
  });

  document.getElementById('btnOpenCartModal')?.addEventListener('click', openCartModal);
  document.getElementById('btnCloseCartModal')?.addEventListener('click', () => {
    document.getElementById('cartModal').style.display = 'none';
  });

  document.getElementById('btnCheckoutDemo')?.addEventListener('click', async () => {
    if (appState.cart.length === 0) {
      showToast('Giỏ hàng của bạn đang trống!', 'warning');
      return;
    }

    const uid = appState.currentUser ? appState.currentUser.id : 'u1';
    for (const item of appState.cart) {
      try {
        await fetch(`${API_BASE}/interact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: uid, product_id: item.id, type: 'purchased' })
        });
      } catch (e) {}
    }

    showToast('Đặt hàng thành công! Đã tạo cạnh "purchased" trên Đồ thị Tri thức.', 'success');
    appState.cart = [];
    saveCartAndFavoritesToStorage();
    updateCartAndFavoritesBadges();
    document.getElementById('cartModal').style.display = 'none';
    await loadRecommendations();
  });
}

function loadCartAndFavoritesFromStorage() {
  try {
    const rawFavs = localStorage.getItem('kh_favorites_list');
    if (rawFavs) appState.favorites = JSON.parse(rawFavs);
    const rawCart = localStorage.getItem('kh_cart_list');
    if (rawCart) appState.cart = JSON.parse(rawCart);
  } catch (e) {}
  updateCartAndFavoritesBadges();
}

function saveCartAndFavoritesToStorage() {
  localStorage.setItem('kh_favorites_list', JSON.stringify(appState.favorites));
  localStorage.setItem('kh_cart_list', JSON.stringify(appState.cart));
}

function updateCartAndFavoritesBadges() {
  const favBadge = document.getElementById('favoritesCountBadge');
  if (favBadge) favBadge.textContent = appState.favorites.length;
  const cartBadge = document.getElementById('cartCountBadge');
  if (cartBadge) {
    const totalQty = appState.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    cartBadge.textContent = totalQty;
  }
}

window.toggleFavoriteProduct = async function(productId, event) {
  if (event) event.stopPropagation();
  const index = appState.favorites.indexOf(productId);
  const uid = appState.currentUser ? appState.currentUser.id : 'u1';
  const prod = appState.recommendations.find(p => p.id === productId);
  const prodName = prod ? prod.name : productId;

  if (index > -1) {
    appState.favorites.splice(index, 1);
    showToast(`Đã bỏ "${prodName}" khỏi danh sách yêu thích.`, 'info');
  } else {
    appState.favorites.push(productId);
    showToast(`Đã thêm "${prodName}" vào Yêu thích ❤️!`, 'success');
    try {
      await fetch(`${API_BASE}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, product_id: productId, type: 'likes' })
      });
    } catch (e) {}
  }

  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  filterAndRenderProducts();
};

window.toggleCartProduct = async function(productId, event) {
  if (event) event.stopPropagation();
  const prod = appState.recommendations.find(p => p.id === productId);
  if (!prod) return;

  const existing = appState.cart.find(item => item.id === productId);
  const uid = appState.currentUser ? appState.currentUser.id : 'u1';

  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
    showToast(`Đã tăng số lượng "${prod.name}" trong giỏ hàng (x${existing.quantity})! 🛒`, 'success');
  } else {
    appState.cart.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      image: prod.image,
      brand: prod.brand,
      quantity: 1
    });
    showToast(`Đã thêm "${prod.name}" vào Giỏ hàng! 🛒`, 'success');
    try {
      await fetch(`${API_BASE}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, product_id: productId, type: 'wants' })
      });
    } catch (e) {}
  }

  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  filterAndRenderProducts();
};

window.removeFromCart = function(productId) {
  appState.cart = appState.cart.filter(item => item.id !== productId);
  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  renderCartList();
  filterAndRenderProducts();
};

window.updateCartQuantity = function(productId, delta) {
  const item = appState.cart.find(i => i.id === productId);
  if (item) {
    item.quantity = (item.quantity || 1) + delta;
    if (item.quantity <= 0) {
      removeFromCart(productId);
      return;
    }
  }
  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  renderCartList();
};

function openFavoritesModal() {
  const modal = document.getElementById('favoritesModal');
  const container = document.getElementById('favoritesListContainer');
  if (!container || !modal) return;

  if (appState.favorites.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:32px 0; color:#94a3b8;"><p style="font-size:32px; margin-bottom:8px;">❤️</p><p>Bạn chưa lưu sản phẩm yêu thích nào.</p></div>';
  } else {
    const favProducts = appState.favorites.map(fid => {
      return appState.recommendations.find(p => p.id === fid) || { id: fid, name: 'Sản phẩm ' + fid, price: 0, image: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=300' };
    });

    container.innerHTML = favProducts.map(p => `
      <div class="cart-item-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid #f1f5f9; gap:12px;">
        <img src="${p.image}" alt="${p.name}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;" />
        <div style="flex:1;">
          <h5 style="margin:0 0 4px; font-size:13px; font-weight:700;">${p.name}</h5>
          <span style="color:#e53238; font-weight:700; font-size:13px;">${formatPrice(p.price)}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm btn-ebay-primary" onclick="toggleCartProduct('${p.id}'); document.getElementById('favoritesModal').style.display='none';">🛒 Thêm Giỏ</button>
          <button class="btn btn-sm btn-outline-danger" onclick="toggleFavoriteProduct('${p.id}'); openFavoritesModal();">🗑️ Xóa</button>
        </div>
      </div>
    `).join('');
  }

  modal.style.display = 'flex';
}

function openCartModal() {
  const modal = document.getElementById('cartModal');
  renderCartList();
  modal.style.display = 'flex';
}

function renderCartList() {
  const container = document.getElementById('cartListContainer');
  const totalPriceEl = document.getElementById('cartTotalPrice');
  if (!container) return;

  if (appState.cart.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:32px 0; color:#94a3b8;"><p style="font-size:32px; margin-bottom:8px;">🛒</p><p>Giỏ hàng của bạn đang trống.</p></div>';
    if (totalPriceEl) totalPriceEl.textContent = '0 ₫';
    return;
  }

  let total = 0;
  container.innerHTML = appState.cart.map(item => {
    const qty = item.quantity || 1;
    const subtotal = (item.price || 0) * qty;
    total += subtotal;

    return `
      <div class="cart-item-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid #f1f5f9; gap:12px;">
        <img src="${item.image}" alt="${item.name}" style="width:50px; height:50px; object-fit:cover; border-radius:6px;" />
        <div style="flex:1;">
          <h5 style="margin:0 0 4px; font-size:13px; font-weight:700;">${item.name}</h5>
          <span style="color:#e53238; font-weight:700; font-size:13px;">${formatPrice(item.price)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn-qty" onclick="updateCartQuantity('${item.id}', -1)" style="width:24px; height:24px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer;">-</button>
          <span style="font-size:13px; font-weight:700; min-width:20px; text-align:center;">${qty}</span>
          <button class="btn-qty" onclick="updateCartQuantity('${item.id}', 1)" style="width:24px; height:24px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer;">+</button>
          <button class="btn-remove-cart" onclick="removeFromCart('${item.id}')" style="margin-left:8px; border:none; background:transparent; color:#ef4444; cursor:pointer;" title="Xóa khỏi giỏ">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  if (totalPriceEl) totalPriceEl.textContent = formatPrice(total);
}
