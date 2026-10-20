// K/H Store - User Portal Logic
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
  cart: [],
  selectedCartItemIds: new Set()
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
  setupCheckout();
  setupChatbot();

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
      const target = item.getAttribute('data-tab');
      const isAdmin = !!(appState.currentUser && (appState.currentUser.is_admin || appState.currentUser.username === 'admin' || appState.currentUser.id === 'admin'));

      if (target === 'graph-explorer' && !isAdmin) {
        showToast('Tính năng Khám phá Đồ thị Tri thức 2D chỉ dành cho Quản trị viên (Admin)!', 'warning');
        return;
      }

      navItems.forEach(i => i.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
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

  // Top bar user card dropdown popover toggle
  const userCardTrigger = document.getElementById('userCardTrigger');
  const userDropdownPopover = document.getElementById('userDropdownPopover');

  userCardTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = userDropdownPopover && userDropdownPopover.style.display === 'block';
    if (userDropdownPopover) {
      userDropdownPopover.style.display = isShowing ? 'none' : 'block';
    }
    userCardTrigger.classList.toggle('active', !isShowing);
  });

  // Close popover when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (userDropdownPopover && !userDropdownPopover.contains(e.target) && !userCardTrigger?.contains(e.target)) {
      userDropdownPopover.style.display = 'none';
      userCardTrigger?.classList.remove('active');
    }
  });

  // Close popover on switching user account
  document.getElementById('userSelect')?.addEventListener('change', () => {
    if (userDropdownPopover) userDropdownPopover.style.display = 'none';
    userCardTrigger?.classList.remove('active');
  });

  // Wire up popover buttons
  document.getElementById('btnMenuWishlist')?.addEventListener('click', () => {
    if (userDropdownPopover) userDropdownPopover.style.display = 'none';
    userCardTrigger?.classList.remove('active');
    const wishlistModal = document.getElementById('wishlistModal');
    if (wishlistModal) {
      wishlistModal.style.display = 'flex';
      if (appState.currentUser && appState.currentUser.wishlist_need) {
        const input = document.getElementById('wishlistKeywordInput');
        if (input) input.value = appState.currentUser.wishlist_need;
      }
    }
  });

  document.getElementById('btnMenuFavorites')?.addEventListener('click', () => {
    if (userDropdownPopover) userDropdownPopover.style.display = 'none';
    userCardTrigger?.classList.remove('active');
    openFavoritesModal();
  });

  btnOpenProfile?.addEventListener('click', () => {
    if (userDropdownPopover) userDropdownPopover.style.display = 'none';
    userCardTrigger?.classList.remove('active');
    openProfileDrawer();
  });

  document.getElementById('btnCloseProfileModal')?.addEventListener('click', () => {
    document.getElementById('profileModal').style.display = 'none';
  });

  // Edit User Profile triggers
  document.getElementById('btnOpenEditProfile')?.addEventListener('click', () => openEditProfileModal());
  document.getElementById('btnHeaderEditProfile')?.addEventListener('click', () => openEditProfileModal());
  document.getElementById('profileAvatarClickWrap')?.addEventListener('click', () => openEditProfileModal('editProfileAvatarInput'));
  document.getElementById('btnQuickEditTargetNeed')?.addEventListener('click', () => openEditProfileModal('editProfileTargetNeed'));
  document.getElementById('btnCloseEditProfileModal')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').style.display = 'none';
  });
  document.getElementById('btnCancelEditProfile')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').style.display = 'none';
  });
  document.getElementById('editProfileForm')?.addEventListener('submit', handleEditProfileSubmit);

  const editAvatarInput = document.getElementById('editProfileAvatarInput');
  editAvatarInput?.addEventListener('input', () => {
    const val = editAvatarInput.value.trim();
    const prev = document.getElementById('editProfileAvatarPreview');
    if (val && prev) prev.src = val;
  });

  // Avatar upload from device
  const fileInput = document.getElementById('editProfileAvatarFileInput');
  const btnUploadAvatar = document.getElementById('btnUploadAvatarFile');
  const avatarPreviewClickBox = document.getElementById('avatarPreviewClickBox');
  const avatarUploadStatus = document.getElementById('avatarUploadStatus');

  btnUploadAvatar?.addEventListener('click', () => fileInput?.click());
  avatarPreviewClickBox?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn file hình ảnh hợp lệ (PNG, JPG, WEBP, GIF)!', 'warning');
      return;
    }

    if (btnUploadAvatar) {
      btnUploadAvatar.disabled = true;
      btnUploadAvatar.innerHTML = '⏳ Đang tải ảnh...';
    }
    if (avatarUploadStatus) {
      avatarUploadStatus.style.display = 'inline';
      avatarUploadStatus.style.color = '#2563eb';
      avatarUploadStatus.textContent = '⏳ Đang xử lý ảnh...';
    }

    try {
      // 1. Client-side canvas resize (max 400x400)
      const resizedDataUrl = await resizeImageToMax(file, 400, 400);

      // Instant preview
      const previewEl = document.getElementById('editProfileAvatarPreview');
      if (previewEl) previewEl.src = resizedDataUrl;

      // 2. Upload to server
      const currentUid = appState.currentUser ? appState.currentUser.id : 'user';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', currentUid);

      const res = await fetch(`${API_BASE}/upload-avatar`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      const avatarInput = document.getElementById('editProfileAvatarInput');
      if (res.ok && data.success && data.url) {
        if (avatarInput) avatarInput.value = data.url;
        if (previewEl) previewEl.src = data.url;
        if (avatarUploadStatus) {
          avatarUploadStatus.style.color = '#16a34a';
          avatarUploadStatus.textContent = '✓ Đã tải ảnh lên thành công!';
        }
        showToast('Tải ảnh đại diện từ thiết bị thành công! Nhấn "Lưu Thay Đổi" để cập nhật.', 'success');
      } else {
        // Fallback to compressed base64
        if (avatarInput) avatarInput.value = resizedDataUrl;
        if (avatarUploadStatus) {
          avatarUploadStatus.style.color = '#16a34a';
          avatarUploadStatus.textContent = '✓ Đã nhận ảnh từ thiết bị!';
        }
        showToast('Đã nhận ảnh đại diện từ thiết bị!', 'success');
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh đại diện:', err);
      showToast('Có lỗi khi xử lý file ảnh, vui lòng thử lại!', 'error');
      if (avatarUploadStatus) {
        avatarUploadStatus.style.color = '#dc2626';
        avatarUploadStatus.textContent = '✕ Lỗi tải ảnh!';
      }
    } finally {
      if (btnUploadAvatar) {
        btnUploadAvatar.disabled = false;
        btnUploadAvatar.innerHTML = '📁 Tải ảnh từ thiết bị';
      }
      fileInput.value = '';
    }
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

  // Khám phá Đồ thị Tri thức 2D: Chỉ hiển thị cho tài khoản có quyền Admin
  const navGraphExplorer = document.getElementById('navItemGraphExplorer') || document.querySelector('.nav-item[data-tab="graph-explorer"]');
  if (navGraphExplorer) {
    navGraphExplorer.style.display = isAdmin ? '' : 'none';
  }

  // Nếu người dùng không phải admin mà đang ở tab đồ thị thì tự động chuyển về tab gợi ý
  if (!isAdmin) {
    const activeTab = document.querySelector('.nav-item.active');
    if (activeTab && activeTab.getAttribute('data-tab') === 'graph-explorer') {
      const recTab = document.querySelector('.nav-item[data-tab="recommendations"]');
      if (recTab) {
        recTab.click();
      } else {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-recommendations')?.classList.add('active');
        document.querySelector('.nav-item[data-tab="recommendations"]')?.classList.add('active');
      }
    }
  }

  if (appState.currentUser && !appState.isGuest) {
    authStatusHeader.style.display = 'flex';
    guestStatusHeader.style.display = 'none';
    if (topGreetingUser) topGreetingUser.textContent = appState.currentUser.name || appState.currentUser.full_name || appState.currentUser.username;
    if (userSelect) userSelect.value = appState.currentUser.id;

    const displayName = appState.currentUser.name || appState.currentUser.full_name || appState.currentUser.username;
    const displayRole = appState.currentUser.role || (isAdmin ? 'Quản trị viên (Admin)' : 'Thành viên K/H Store');
    const displayAvatar = appState.currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${appState.currentUser.username || appState.currentUser.id}`;

    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const userAvatarEl = document.getElementById('userAvatar');
    if (userNameEl) userNameEl.textContent = displayName;
    if (userRoleEl) userRoleEl.textContent = displayRole;
    if (userAvatarEl) userAvatarEl.src = displayAvatar;

    // Also update popover preview info
    const popoverAvatar = document.getElementById('popoverAvatar');
    const popoverName = document.getElementById('popoverName');
    const popoverRole = document.getElementById('popoverRole');
    const popoverMeta = document.getElementById('popoverMeta');
    if (popoverAvatar) popoverAvatar.src = displayAvatar;
    if (popoverName) popoverName.textContent = displayName;
    if (popoverRole) popoverRole.textContent = displayRole;
    if (popoverMeta) popoverMeta.textContent = appState.currentUser.email ? appState.currentUser.email : (isAdmin ? 'Admin Quyền Cao Nhất' : `ID: ${appState.currentUser.id}`);

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
      <p><b>Email:</b> ${user.email || 'Chưa cung cấp'}</p>
      <p><b>Số điện thoại:</b> ${user.phone || '<span style="color:#94a3b8; font-style:italic;">Chưa cập nhật</span>'}</p>
      <p><b>Vai trò / Chức danh:</b> ${user.role || 'Thành viên'}</p>
      <p><b>Phân quyền hệ thống:</b> <span class="badge" style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px;">${user.is_admin ? 'Quản trị viên (Admin)' : 'Thành viên'}</span></p>
      <p><b>Trạng thái khảo sát KG:</b> <span class="badge" style="background:${user.survey_completed ? '#dcfce7; color:#166534;' : '#fef3c7; color:#b45309;'} padding:2px 8px; border-radius:10px;">${user.survey_completed ? '✅ Đã kích hoạt' : '⚠️ Chưa hoàn tất'}</span></p>
      <p><b>Trạng thái phiên:</b> <span style="color:#10b981; font-weight:600;">● Đang hoạt động (Active Session)</span></p>
      <p><b>Độ tin cậy đồ thị:</b> <span style="color:#3b82f6; font-weight:700;">100% Khớp tri thức</span></p>
      ${user.bio ? `<p style="grid-column:1 / -1; margin-top:4px; font-style:italic; color:#475569; background:#f1f5f9; padding:8px 12px; border-radius:6px; border-left:3px solid #3b82f6;"><b>📝 Giới thiệu:</b> "${user.bio}"</p>` : ''}
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

  // 6. Orders History
  const ordersListEl = document.getElementById('profileOrdersList');
  const orderCountBadge = document.getElementById('profileOrderCountBadge');
  const orders = user.orders || [];
  if (orderCountBadge) orderCountBadge.textContent = orders.length;

  if (ordersListEl) {
    if (orders.length === 0) {
      ordersListEl.innerHTML = '<div style="text-align:center; padding:18px 0; color:#94a3b8; font-size:12px;"><p style="font-size:24px; margin-bottom:4px;">📦</p>Chưa có đơn hàng nào được ghi nhận.</div>';
    } else {
      ordersListEl.innerHTML = orders.slice().reverse().map(ord => {
        const items = ord.items || [];
        const itemsSummary = items.map(it => `• <b>${it.name}</b> (x${it.quantity || 1})`).join('<br>');
        return `
          <div class="profile-order-card">
            <div class="profile-order-header">
              <span class="profile-order-id">Mã: ${ord.id}</span>
              <span class="profile-order-status">${ord.status || 'Đã tiếp nhận'}</span>
            </div>
            <div class="profile-order-items">
              ${itemsSummary}
            </div>
            <div class="profile-order-footer">
              <span style="color:#64748b;">Hình thức: <b>${ord.payment_method || 'Chuyển khoản'}</b></span>
              <span style="color:#e53238; font-weight:800; font-size:13px;">${formatPrice(ord.total || 0)}</span>
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
// USER PROFILE EDITING & AVATAR PRESETS
// ========================================================
const AVATAR_PRESETS = [
  { url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', title: 'Nữ Quản Trị / Diana' },
  { url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', title: 'Nữ Tech / Alice' },
  { url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', title: 'Nam Gamer / Bob' },
  { url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', title: 'Kỹ Sư Phần Mềm / Charlie' },
  { url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150', title: 'Thiết Kế 3D / Edward' },
  { url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', title: 'Chuyên Gia Tối Giản' },
  { url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150', title: 'Tech Lead / Alex' },
  { url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ai_core', title: 'AI Bot Cyberpunk' }
];

function renderAvatarPresets(currentUrl) {
  const container = document.getElementById('avatarPresetsGrid');
  if (!container) return;
  container.innerHTML = AVATAR_PRESETS.map(p => `
    <button type="button" class="avatar-preset-btn ${p.url === currentUrl ? 'active' : ''}" data-url="${p.url}" title="${p.title}">
      <img src="${p.url}" alt="${p.title}" />
    </button>
  `).join('');

  container.querySelectorAll('.avatar-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      const input = document.getElementById('editProfileAvatarInput');
      const prev = document.getElementById('editProfileAvatarPreview');
      if (input) input.value = url;
      if (prev) prev.src = url;
      container.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function openEditProfileModal(focusField = null) {
  const user = appState.currentUser;
  if (!user) {
    showToast('Vui lòng đăng nhập để chỉnh sửa hồ sơ!', 'warning');
    return;
  }

  const userIdEl = document.getElementById('editProfileUserId');
  const nameEl = document.getElementById('editProfileName');
  const emailEl = document.getElementById('editProfileEmail');
  const phoneEl = document.getElementById('editProfilePhone');
  const roleEl = document.getElementById('editProfileRole');
  const bioEl = document.getElementById('editProfileBio');
  const pwdEl = document.getElementById('editProfileNewPassword');
  const targetNeedEl = document.getElementById('editProfileTargetNeed');
  const avatarInput = document.getElementById('editProfileAvatarInput');
  const avatarPreview = document.getElementById('editProfileAvatarPreview');

  if (userIdEl) userIdEl.value = user.id;
  if (nameEl) nameEl.value = user.name || user.full_name || user.username || '';
  if (emailEl) emailEl.value = user.email || '';
  if (phoneEl) phoneEl.value = user.phone || '';
  if (roleEl) roleEl.value = user.role || '';
  if (bioEl) bioEl.value = user.bio || '';
  if (pwdEl) pwdEl.value = '';

  const avatarUrl = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username || user.id}`;
  if (avatarInput) avatarInput.value = user.avatar || '';
  if (avatarPreview) avatarPreview.src = avatarUrl;
  const avatarUploadStatus = document.getElementById('avatarUploadStatus');
  if (avatarUploadStatus) avatarUploadStatus.style.display = 'none';

  let targetNeed = user.last_target_need || user.wishlist_need;
  if (!targetNeed && user.wishlist && user.wishlist.length > 0) {
    const lastItem = user.wishlist[user.wishlist.length - 1];
    targetNeed = typeof lastItem === 'object' ? (lastItem.query || lastItem.name) : lastItem;
  }
  if (targetNeedEl) targetNeedEl.value = targetNeed || '';

  renderAvatarPresets(avatarUrl);

  const modal = document.getElementById('editProfileModal');
  if (modal) modal.style.display = 'flex';

  if (focusField) {
    setTimeout(() => {
      document.getElementById(focusField)?.focus();
    }, 100);
  }
}

async function handleEditProfileSubmit(e) {
  e.preventDefault();
  const userId = document.getElementById('editProfileUserId')?.value || (appState.currentUser ? appState.currentUser.id : null);
  const name = document.getElementById('editProfileName')?.value.trim();
  const email = document.getElementById('editProfileEmail')?.value.trim();
  const phone = document.getElementById('editProfilePhone')?.value.trim();
  const role = document.getElementById('editProfileRole')?.value.trim();
  const avatar = document.getElementById('editProfileAvatarInput')?.value.trim();
  const targetNeed = document.getElementById('editProfileTargetNeed')?.value.trim();
  const bio = document.getElementById('editProfileBio')?.value.trim();
  const newPassword = document.getElementById('editProfileNewPassword')?.value.trim();

  if (!name || !email) {
    showToast('Vui lòng nhập đầy đủ Họ và tên và Email!', 'error');
    return;
  }

  const payload = {
    user_id: userId,
    name,
    email,
    phone,
    role,
    avatar,
    bio,
    target_need: targetNeed
  };
  if (newPassword) {
    payload.new_password = newPassword;
  }

  const btnSave = document.getElementById('btnSubmitEditProfile');
  const origText = btnSave ? btnSave.innerHTML : '💾 Lưu';
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '⏳ Đang lưu hồ sơ...';
  }

  try {
    const res = await fetch(`${API_BASE}/user/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Cập nhật hồ sơ thành công! Đồ thị Tri thức đã được đồng bộ.', 'success');
      appState.currentUser = data.user;

      // Update session in localStorage
      const rawSess = localStorage.getItem('kh_recsys_session');
      if (rawSess) {
        try {
          const sess = JSON.parse(rawSess);
          sess.username = data.user.username;
          localStorage.setItem('kh_recsys_session', JSON.stringify(sess));
        } catch (e) {}
      }

      // Update in appState.users list
      const uIndex = appState.users.findIndex(u => u.id === data.user.id);
      if (uIndex > -1) {
        appState.users[uIndex] = data.user;
      }

      document.getElementById('editProfileModal').style.display = 'none';

      // Update Top Nav UI
      updateAuthUI();

      // Refresh Open Profile Drawer
      await openProfileDrawer();

      // Refresh recommendations
      await loadRecommendations();
    } else {
      showToast(data.error || 'Lỗi cập nhật hồ sơ người dùng!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ khi cập nhật hồ sơ!', 'error');
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = origText;
    }
  }
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
  const isAdmin = !!(appState.currentUser && (appState.currentUser.is_admin || appState.currentUser.username === 'admin' || appState.currentUser.id === 'admin'));
  if (!isAdmin) return;

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

  document.getElementById('cartSelectAll')?.addEventListener('change', (e) => {
    toggleSelectAllCart(e.target.checked);
  });

  document.getElementById('btnRemoveSelectedCart')?.addEventListener('click', () => {
    removeSelectedCartItems();
  });

  document.getElementById('btnCheckoutDemo')?.addEventListener('click', () => {
    openCheckoutModal();
  });
}

function loadCartAndFavoritesFromStorage() {
  try {
    const rawFavs = localStorage.getItem('kh_favorites_list');
    if (rawFavs) appState.favorites = JSON.parse(rawFavs);
    const rawCart = localStorage.getItem('kh_cart_list');
    if (rawCart) appState.cart = JSON.parse(rawCart);
  } catch (e) {}

  if (!appState.selectedCartItemIds) appState.selectedCartItemIds = new Set();
  if (appState.cart && appState.cart.length > 0) {
    appState.selectedCartItemIds = new Set(appState.cart.map(i => i.id));
  }

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
  if (typeof updateChatbotCartBar === 'function') {
    updateChatbotCartBar();
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
    if (!appState.selectedCartItemIds) appState.selectedCartItemIds = new Set();
    appState.selectedCartItemIds.add(prod.id);
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
  if (appState.selectedCartItemIds) {
    appState.selectedCartItemIds.delete(productId);
  }
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

function getSelectedCartItems() {
  if (!appState.selectedCartItemIds) {
    appState.selectedCartItemIds = new Set(appState.cart.map(i => i.id));
  }
  return appState.cart.filter(item => appState.selectedCartItemIds.has(item.id));
}

window.toggleCartItemSelection = function(productId, isChecked) {
  if (!appState.selectedCartItemIds) appState.selectedCartItemIds = new Set();
  if (isChecked) {
    appState.selectedCartItemIds.add(productId);
  } else {
    appState.selectedCartItemIds.delete(productId);
  }

  // Update item row visual style immediately
  const row = document.querySelector(`.cart-item-row[data-id="${productId}"]`);
  if (row) {
    if (isChecked) {
      row.style.background = '#fff';
      row.style.opacity = '1';
    } else {
      row.style.background = '#fafafa';
      row.style.opacity = '0.6';
    }
  }

  updateCartTotalSummary();
};

window.toggleSelectAllCart = function(forceChecked) {
  if (!appState.selectedCartItemIds) appState.selectedCartItemIds = new Set();
  if (forceChecked) {
    appState.cart.forEach(item => appState.selectedCartItemIds.add(item.id));
  } else {
    appState.selectedCartItemIds.clear();
  }
  renderCartList();
};

window.removeSelectedCartItems = function() {
  const selectedItems = getSelectedCartItems();
  if (selectedItems.length === 0) {
    showToast('Chưa có sản phẩm nào được chọn để xóa!', 'warning');
    return;
  }
  const count = selectedItems.length;
  appState.cart = appState.cart.filter(item => !appState.selectedCartItemIds.has(item.id));
  appState.selectedCartItemIds.clear();
  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  renderCartList();
  filterAndRenderProducts();
  showToast(`Đã xóa ${count} sản phẩm đã chọn khỏi giỏ hàng!`, 'info');
};

function updateCartTotalSummary() {
  const totalPriceEl = document.getElementById('cartTotalPrice');
  const summaryLabel = document.getElementById('cartSelectedSummaryLabel');
  const selectAllCheckbox = document.getElementById('cartSelectAll');
  const selectAllCount = document.getElementById('cartSelectAllCount');
  const checkoutBtn = document.getElementById('btnCheckoutDemo');
  const checkoutCountSpan = document.getElementById('btnCheckoutSelectedCount');
  const cartToolbar = document.getElementById('cartToolbar');

  const totalCartCount = appState.cart.length;
  if (selectAllCount) selectAllCount.textContent = totalCartCount;

  if (totalCartCount === 0) {
    if (cartToolbar) cartToolbar.style.display = 'none';
    if (totalPriceEl) totalPriceEl.textContent = '0 ₫';
    if (summaryLabel) summaryLabel.textContent = '(0 sản phẩm được chọn)';
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.style.opacity = '0.6';
    }
    if (checkoutCountSpan) checkoutCountSpan.textContent = '0';
    return;
  }

  if (cartToolbar) cartToolbar.style.display = 'flex';

  const selectedItems = getSelectedCartItems();
  const selectedCount = selectedItems.length;
  const totalSelectedQty = selectedItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const totalSelectedAmount = selectedItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);

  if (totalPriceEl) totalPriceEl.textContent = formatPrice(totalSelectedAmount);
  if (summaryLabel) {
    summaryLabel.textContent = `(Đã chọn ${selectedCount} / ${totalCartCount} sản phẩm - ${totalSelectedQty} món)`;
  }
  if (checkoutCountSpan) checkoutCountSpan.textContent = totalSelectedQty;

  if (selectAllCheckbox) {
    selectAllCheckbox.checked = selectedCount === totalCartCount && totalCartCount > 0;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCartCount;
  }

  if (checkoutBtn) {
    if (selectedCount === 0) {
      checkoutBtn.style.opacity = '0.65';
      checkoutBtn.innerHTML = '⚠️ Vui Lòng Chọn Sản Phẩm Để Thanh Toán';
    } else {
      checkoutBtn.style.opacity = '1';
      checkoutBtn.innerHTML = `💳 Tiến Hành Thanh Toán (${totalSelectedQty} món - ${formatPrice(totalSelectedAmount)})`;
    }
  }
}

function openCartModal() {
  const modal = document.getElementById('cartModal');
  if (!appState.selectedCartItemIds) {
    appState.selectedCartItemIds = new Set();
  }
  if (appState.selectedCartItemIds.size === 0 && appState.cart.length > 0) {
    appState.selectedCartItemIds = new Set(appState.cart.map(i => i.id));
  } else {
    const validIds = new Set(appState.cart.map(i => i.id));
    for (const id of Array.from(appState.selectedCartItemIds)) {
      if (!validIds.has(id)) appState.selectedCartItemIds.delete(id);
    }
  }
  renderCartList();
  if (modal) modal.style.display = 'flex';
}

function renderCartList() {
  const container = document.getElementById('cartListContainer');
  const cartToolbar = document.getElementById('cartToolbar');
  if (!container) return;

  if (appState.cart.length === 0) {
    if (cartToolbar) cartToolbar.style.display = 'none';
    container.innerHTML = `
      <div style="text-align:center; padding:36px 0; color:#94a3b8;">
        <p style="font-size:36px; margin-bottom:8px;">🛒</p>
        <p style="font-size:14px; font-weight:600;">Giỏ hàng của bạn đang trống.</p>
        <p style="font-size:12px; margin-top:4px;">Hãy khám phá các sản phẩm gợi ý và thêm vào giỏ nhé!</p>
      </div>
    `;
    updateCartTotalSummary();
    return;
  }

  if (cartToolbar) cartToolbar.style.display = 'flex';

  if (!appState.selectedCartItemIds) {
    appState.selectedCartItemIds = new Set(appState.cart.map(i => i.id));
  }

  container.innerHTML = appState.cart.map(item => {
    const qty = item.quantity || 1;
    const subtotal = (item.price || 0) * qty;
    const isSelected = appState.selectedCartItemIds.has(item.id);

    return `
      <div class="cart-item-row" data-id="${item.id}" style="display:flex; align-items:center; padding:10px 12px; border-bottom:1px solid #f1f5f9; gap:12px; border-radius:6px; transition:all 0.15s ease; ${isSelected ? 'background:#fff;' : 'background:#fafafa; opacity:0.6;'}">
        <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} style="width:18px; height:18px; accent-color:#0053a0; cursor:pointer; flex-shrink:0;" title="Chọn sản phẩm này để thanh toán" onchange="toggleCartItemSelection('${item.id}', this.checked)" />
        <img src="${item.image}" alt="${item.name}" style="width:52px; height:52px; object-fit:cover; border-radius:6px; flex-shrink:0; border:1px solid #e2e8f0;" />
        <div style="flex:1; min-width:0;">
          <h5 style="margin:0 0 4px; font-size:13px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.name}">${item.name}</h5>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:#e53238; font-weight:700; font-size:13px;">${formatPrice(item.price)}</span>
            <span style="font-size:11px; color:#64748b;">x${qty} = <b style="color:#1e293b;">${formatPrice(subtotal)}</b></span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
          <button type="button" class="btn-qty" onclick="updateCartQuantity('${item.id}', -1)" style="width:24px; height:24px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer; font-weight:700; line-height:1;">-</button>
          <span style="font-size:13px; font-weight:700; min-width:20px; text-align:center;">${qty}</span>
          <button type="button" class="btn-qty" onclick="updateCartQuantity('${item.id}', 1)" style="width:24px; height:24px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer; font-weight:700; line-height:1;">+</button>
          <button type="button" class="btn-remove-cart" onclick="removeFromCart('${item.id}')" style="margin-left:6px; border:none; background:transparent; color:#ef4444; cursor:pointer; font-size:14px; padding:2px;" title="Xóa khỏi giỏ">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  updateCartTotalSummary();
}

// ========================================================
// CHECKOUT, DELIVERY INFORMATION & VIETQR PAYMENT
// ========================================================
let currentCheckoutState = {
  orderId: '',
  transferCode: '',
  items: [],
  subtotal: 0,
  discountAmount: 0,
  totalAmount: 0,
  appliedCode: null,
  activeBank: {
    bank_id: 'MB',
    bank_name: 'MB Bank (Ngân hàng Quân Đội)',
    account_number: '0909123456',
    account_name: 'K/H STORE OFFICIAL',
    branch: 'Chi nhánh Đồng Nai'
  },
  paymentMethod: 'Chuyển khoản Ngân hàng (VietQR 24/7)'
};

function updateCheckoutBankDisplay() {
  const bank = currentCheckoutState.activeBank || {
    bank_id: 'MB',
    bank_name: 'MB Bank (Ngân hàng Quân Đội)',
    account_number: '0909123456',
    account_name: 'K/H STORE OFFICIAL',
    branch: 'Chi nhánh Đồng Nai'
  };

  const badgeEl = document.getElementById('checkoutBankBadge');
  if (badgeEl) badgeEl.textContent = `${bank.bank_id} BANK`;

  const subEl = document.getElementById('checkoutBankNameSub');
  if (subEl) subEl.textContent = `${bank.bank_name || ''} ${bank.branch ? '(' + bank.branch + ')' : ''}`;

  const ownerEl = document.getElementById('checkoutBankOwner');
  if (ownerEl) ownerEl.textContent = bank.account_name || 'K/H STORE OFFICIAL';

  const accEl = document.getElementById('checkoutBankAcc');
  if (accEl) accEl.textContent = bank.account_number || '0909123456';

  const bankAmountEl = document.getElementById('checkoutBankAmount');
  if (bankAmountEl) bankAmountEl.textContent = formatPrice(currentCheckoutState.totalAmount);

  const transferCodeEl = document.getElementById('checkoutTransferCode');
  if (transferCodeEl) transferCodeEl.textContent = currentCheckoutState.transferCode;

  // VietQR URL
  const qrImg = document.getElementById('checkoutQrImg');
  if (qrImg) {
    const encodedMemo = encodeURIComponent(currentCheckoutState.transferCode);
    const encodedOwner = encodeURIComponent(bank.account_name || 'KH STORE OFFICIAL');
    const bankId = bank.bank_id || 'MB';
    const accNum = bank.account_number || '0909123456';
    qrImg.src = `https://img.vietqr.io/image/${bankId}-${accNum}-compact2.png?amount=${currentCheckoutState.totalAmount}&addInfo=${encodedMemo}&accountName=${encodedOwner}`;
  }
}

window.copyText = function(text, successMsg = 'Đã sao chép vào bộ nhớ tạm!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => {
      fallbackCopyText(text, successMsg);
    });
  } else {
    fallbackCopyText(text, successMsg);
  }
};

function fallbackCopyText(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('Không thể sao chép tự động, vui lòng copy thủ công!', 'warning');
  }
  document.body.removeChild(ta);
}

function openCheckoutModal() {
  if (!appState.cart || appState.cart.length === 0) {
    showToast('Giỏ hàng của bạn đang trống! Vui lòng chọn sản phẩm trước.', 'warning');
    return;
  }

  // Get only selected items
  const selectedItems = getSelectedCartItems();
  if (!selectedItems || selectedItems.length === 0) {
    showToast('Vui lòng chọn ít nhất 1 sản phẩm trong giỏ hàng để thanh toán!', 'warning');
    return;
  }

  // 1. Hide Cart Modal
  const cartModal = document.getElementById('cartModal');
  if (cartModal) cartModal.style.display = 'none';

  // 2. Generate unique order ID and transfer code
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const orderId = `DH-${randomSuffix}`;
  const transferCode = `KHSTORE ${orderId}`;
  currentCheckoutState.orderId = orderId;
  currentCheckoutState.transferCode = transferCode;
  currentCheckoutState.appliedCode = null;
  currentCheckoutState.discountAmount = 0;
  currentCheckoutState.items = selectedItems; // Checkout only selected items!

  // Reset voucher UI
  const voucherInput = document.getElementById('checkoutVoucherInput');
  const voucherMsg = document.getElementById('checkoutVoucherMsg');
  const btnApplyVoucher = document.getElementById('btnApplyVoucher');
  const btnRemoveVoucher = document.getElementById('btnRemoveVoucher');
  const discountRow = document.getElementById('checkoutDiscountRow');
  if (voucherInput) { voucherInput.value = ''; voucherInput.disabled = false; }
  if (voucherMsg) voucherMsg.innerHTML = '';
  if (btnApplyVoucher) btnApplyVoucher.disabled = false;
  if (btnRemoveVoucher) btnRemoveVoucher.style.display = 'none';
  if (discountRow) discountRow.style.display = 'none';

  // 3. Pre-fill user delivery information
  const user = appState.currentUser;
  const nameInput = document.getElementById('checkoutRecipientName');
  const phoneInput = document.getElementById('checkoutRecipientPhone');
  const emailInput = document.getElementById('checkoutRecipientEmail');
  const addressInput = document.getElementById('checkoutAddress');
  const noteInput = document.getElementById('checkoutNote');
  const refCodeInput = document.getElementById('checkoutBankRefCode');

  if (nameInput) nameInput.value = user ? (user.name || user.full_name || user.username || '') : '';
  if (phoneInput) phoneInput.value = user ? (user.phone || '') : '';
  if (emailInput) emailInput.value = user ? (user.email || '') : '';
  if (addressInput && user && user.address) addressInput.value = user.address;
  if (noteInput) noteInput.value = '';
  if (refCodeInput) refCodeInput.value = '';

  // 4. Render ONLY selected items in order summary & calculate total
  const itemsContainer = document.getElementById('checkoutItemsList');
  let total = 0;
  let totalCount = 0;

  if (itemsContainer) {
    itemsContainer.innerHTML = currentCheckoutState.items.map(item => {
      const qty = item.quantity || 1;
      const subtotal = (item.price || 0) * qty;
      total += subtotal;
      totalCount += qty;

      return `
        <div class="checkout-item-mini">
          <img src="${item.image || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=100'}" alt="${item.name}" />
          <div class="ci-name" title="${item.name}">${item.name} <span style="color:#64748b; font-weight:400;">x${qty}</span></div>
          <div class="ci-price">${formatPrice(subtotal)}</div>
        </div>
      `;
    }).join('');
  }

  currentCheckoutState.subtotal = total;
  currentCheckoutState.totalAmount = total;

  // 5. Update summary breakdown
  const countEl = document.getElementById('checkoutItemCount');
  if (countEl) countEl.textContent = totalCount;
  const subtotalEl = document.getElementById('checkoutSubtotalPrice');
  if (subtotalEl) subtotalEl.textContent = formatPrice(total);
  const finalTotalEl = document.getElementById('checkoutFinalTotalPrice');
  if (finalTotalEl) finalTotalEl.textContent = formatPrice(total);
  const summaryCodeEl = document.getElementById('checkoutSummaryTransferCode');
  if (summaryCodeEl) summaryCodeEl.textContent = orderId;

  // 6. Fetch live active bank settings from server and update Bank Transfer Box + QR
  updateCheckoutBankDisplay();
  fetch(`${API_BASE}/payment-settings`)
    .then(r => r.json())
    .then(data => {
      if (data && data.success && data.active_bank_account) {
        currentCheckoutState.activeBank = data.active_bank_account;
        updateCheckoutBankDisplay();
      }
    })
    .catch(err => console.warn('Không thể nạp thông tin ngân hàng thanh toán:', err));

  // 7. Reset payment method to banking
  const optBanking = document.getElementById('optPaymentTransfer');
  const optCod = document.getElementById('optPaymentCod');
  const radioBanking = document.querySelector('input[name="checkout_payment_method"][value="banking"]');
  if (radioBanking) radioBanking.checked = true;
  if (optBanking) optBanking.classList.add('active');
  if (optCod) optCod.classList.remove('active');
  const transferBox = document.getElementById('transferDetailsBox');
  if (transferBox) transferBox.style.display = 'block';
  const codBox = document.getElementById('codDetailsBox');
  if (codBox) codBox.style.display = 'none';
  currentCheckoutState.paymentMethod = 'Chuyển khoản Ngân hàng (VietQR 24/7)';

  // 8. Open modal
  const checkoutModal = document.getElementById('checkoutModal');
  if (checkoutModal) checkoutModal.style.display = 'flex';
}

function setupCheckout() {
  const checkoutModal = document.getElementById('checkoutModal');
  const btnCloseCheckout = document.getElementById('btnCloseCheckoutModal');
  const btnBackToCart = document.getElementById('btnBackToCartModal');
  const form = document.getElementById('checkoutForm');

  // Close & Back buttons
  btnCloseCheckout?.addEventListener('click', () => {
    if (checkoutModal) checkoutModal.style.display = 'none';
  });

  btnBackToCart?.addEventListener('click', () => {
    if (checkoutModal) checkoutModal.style.display = 'none';
    const cartModal = document.getElementById('cartModal');
    if (cartModal) {
      renderCartList();
      cartModal.style.display = 'flex';
    }
  });

  // Copy buttons
  document.getElementById('btnCopyBankAcc')?.addEventListener('click', () => {
    const acc = currentCheckoutState.activeBank?.account_number || '0909123456';
    const bName = currentCheckoutState.activeBank?.bank_id || 'MB';
    copyText(acc, `Đã sao chép Số tài khoản ${bName}: ${acc}`);
  });

  document.getElementById('btnCopyBankAmount')?.addEventListener('click', () => {
    copyText(currentCheckoutState.totalAmount.toString(), `Đã sao chép số tiền: ${formatPrice(currentCheckoutState.totalAmount)}`);
  });

  document.getElementById('btnCopyTransferCode')?.addEventListener('click', () => {
    copyText(currentCheckoutState.transferCode, `Đã sao chép Mã chuyển khoản: ${currentCheckoutState.transferCode}`);
  });

  // Voucher apply & remove listeners
  const btnApplyVoucher = document.getElementById('btnApplyVoucher');
  const btnRemoveVoucher = document.getElementById('btnRemoveVoucher');
  const voucherInput = document.getElementById('checkoutVoucherInput');
  const voucherMsg = document.getElementById('checkoutVoucherMsg');
  const discountRow = document.getElementById('checkoutDiscountRow');
  const discountAmountEl = document.getElementById('checkoutDiscountAmount');
  const finalTotalEl = document.getElementById('checkoutFinalTotalPrice');

  btnApplyVoucher?.addEventListener('click', async () => {
    const code = voucherInput?.value.trim().toUpperCase();
    if (!code) {
      if (voucherMsg) voucherMsg.innerHTML = '<span style="color:#dc2626;">⚠️ Vui lòng nhập mã ưu đãi trước khi áp dụng!</span>';
      return;
    }
    btnApplyVoucher.disabled = true;
    btnApplyVoucher.textContent = '...';

    try {
      const res = await fetch(`${API_BASE}/payment-code/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, total: currentCheckoutState.subtotal })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        currentCheckoutState.appliedCode = data.code;
        currentCheckoutState.discountAmount = data.discount_amount;
        currentCheckoutState.totalAmount = data.final_total;

        if (discountRow) discountRow.style.display = 'flex';
        if (discountAmountEl) discountAmountEl.textContent = `- ${formatPrice(data.discount_amount)}`;
        if (finalTotalEl) finalTotalEl.textContent = formatPrice(data.final_total);

        updateCheckoutBankDisplay();

        if (voucherMsg) voucherMsg.innerHTML = `<span style="color:#16a34a; font-weight:600;">✓ ${data.message}</span>`;
        if (voucherInput) voucherInput.disabled = true;
        if (btnRemoveVoucher) btnRemoveVoucher.style.display = 'inline-block';
        showToast(`Áp dụng mã ${data.code} thành công!`, 'success');
      } else {
        if (voucherMsg) voucherMsg.innerHTML = `<span style="color:#dc2626; font-weight:600;">✕ ${data.message || 'Mã ưu đãi không hợp lệ!'}</span>`;
        showToast(data.message || 'Mã ưu đãi không hợp lệ!', 'error');
      }
    } catch (err) {
      if (voucherMsg) voucherMsg.innerHTML = '<span style="color:#dc2626;">✕ Không thể kiểm tra mã, vui lòng thử lại!</span>';
    } finally {
      btnApplyVoucher.disabled = currentCheckoutState.appliedCode ? true : false;
      btnApplyVoucher.textContent = 'Áp Dụng';
    }
  });

  btnRemoveVoucher?.addEventListener('click', () => {
    currentCheckoutState.appliedCode = null;
    currentCheckoutState.discountAmount = 0;
    currentCheckoutState.totalAmount = currentCheckoutState.subtotal;

    if (discountRow) discountRow.style.display = 'none';
    if (finalTotalEl) finalTotalEl.textContent = formatPrice(currentCheckoutState.totalAmount);
    updateCheckoutBankDisplay();

    if (voucherInput) {
      voucherInput.disabled = false;
      voucherInput.value = '';
    }
    if (voucherMsg) voucherMsg.innerHTML = '';
    if (btnApplyVoucher) btnApplyVoucher.disabled = false;
    btnRemoveVoucher.style.display = 'none';
    showToast('Đã hủy áp dụng mã ưu đãi.', 'info');
  });

  // Payment method radio toggling
  document.querySelectorAll('input[name="checkout_payment_method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const val = e.target.value;
      const optBanking = document.getElementById('optPaymentTransfer');
      const optCod = document.getElementById('optPaymentCod');
      const transferBox = document.getElementById('transferDetailsBox');
      const codBox = document.getElementById('codDetailsBox');

      if (val === 'banking') {
        optBanking?.classList.add('active');
        optCod?.classList.remove('active');
        if (transferBox) transferBox.style.display = 'block';
        if (codBox) codBox.style.display = 'none';
        currentCheckoutState.paymentMethod = 'Chuyển khoản Ngân hàng (VietQR 24/7)';
      } else {
        optCod?.classList.add('active');
        optBanking?.classList.remove('active');
        if (transferBox) transferBox.style.display = 'none';
        if (codBox) codBox.style.display = 'block';
        currentCheckoutState.paymentMethod = 'COD (Thanh toán khi nhận hàng)';
      }
    });
  });

  // Submit Checkout Form
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const recipientName = document.getElementById('checkoutRecipientName')?.value.trim() || '';
    const recipientPhone = document.getElementById('checkoutRecipientPhone')?.value.trim() || '';
    const recipientEmail = document.getElementById('checkoutRecipientEmail')?.value.trim() || '';
    const recipientCity = document.getElementById('checkoutCity')?.value || 'Đồng Nai';
    const recipientAddress = document.getElementById('checkoutAddress')?.value.trim() || '';
    const orderNote = document.getElementById('checkoutNote')?.value.trim() || '';
    const bankRefCode = document.getElementById('checkoutBankRefCode')?.value.trim() || '';

    if (!recipientName || !recipientPhone || !recipientAddress) {
      showToast('Vui lòng điền đầy đủ Họ tên, Số điện thoại và Địa chỉ nhận hàng!', 'warning');
      return;
    }

    const fullAddress = `${recipientAddress}, ${recipientCity}`;
    const customerInfo = {
      name: recipientName,
      phone: recipientPhone,
      email: recipientEmail,
      city: recipientCity,
      address: fullAddress,
      note: orderNote,
      bank_tx_id: bankRefCode
    };

    const submitBtn = document.getElementById('btnConfirmCheckoutOrder');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Đang xử lý đơn hàng...';
    }

    try {
      const uid = appState.currentUser ? appState.currentUser.id : 'u1';
      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          items: currentCheckoutState.items, // Only checkout selected items!
          customer: customerInfo,
          total: currentCheckoutState.totalAmount,
          subtotal: currentCheckoutState.subtotal,
          discount_amount: currentCheckoutState.discountAmount,
          applied_code: currentCheckoutState.appliedCode,
          payment_method: currentCheckoutState.paymentMethod,
          order_id: currentCheckoutState.orderId,
          transfer_code: currentCheckoutState.transferCode,
          note: orderNote
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const order = data.order || {};

        // 1. Clear ONLY the purchased items from Cart (preserve unselected items!)
        const checkedOutIds = new Set((currentCheckoutState.items || []).map(i => i.id));
        appState.cart = appState.cart.filter(item => !checkedOutIds.has(item.id));
        checkedOutIds.forEach(id => {
          if (appState.selectedCartItemIds) appState.selectedCartItemIds.delete(id);
        });

        saveCartAndFavoritesToStorage();
        updateCartAndFavoritesBadges();
        if (typeof updateChatbotCartBar === 'function') updateChatbotCartBar();
        renderCartList();

        // 2. Hide Checkout Modal
        if (checkoutModal) checkoutModal.style.display = 'none';

        // 3. Populate & show Order Success Modal
        document.getElementById('successOrderId').textContent = order.id || currentCheckoutState.orderId;
        document.getElementById('successTransferCode').textContent = currentCheckoutState.paymentMethod.includes('Chuyển khoản') ? currentCheckoutState.transferCode : '(Thanh toán COD khi nhận)';
        document.getElementById('successCustomerName').textContent = customerInfo.name;
        document.getElementById('successCustomerPhone').textContent = customerInfo.phone;
        document.getElementById('successCustomerAddress').textContent = customerInfo.address;
        document.getElementById('successPaymentMethod').textContent = currentCheckoutState.paymentMethod;
        document.getElementById('successTotalAmount').textContent = formatPrice(currentCheckoutState.totalAmount);

        const successModal = document.getElementById('orderSuccessModal');
        if (successModal) successModal.style.display = 'flex';

        showToast('🎉 Đặt hàng thành công! Đơn hàng đã được lưu và cập nhật vào Đồ thị Tri thức.', 'success');

        // 4. Reload Recommendations (due to newly created 'purchased' edges on KG)
        await loadRecommendations();
      } else {
        showToast(data.error || 'Có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại!', 'error');
      }
    } catch (err) {
      showToast('Lỗi kết nối máy chủ! Vui lòng thử lại sau.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '✅ Xác Nhận Đặt Hàng & Hoàn Tất';
      }
    }
  });

  // Order Success Modal Actions
  const successModal = document.getElementById('orderSuccessModal');
  document.getElementById('btnCloseOrderSuccessModal')?.addEventListener('click', () => {
    if (successModal) successModal.style.display = 'none';
  });
  document.getElementById('btnContinueShopping')?.addEventListener('click', () => {
    if (successModal) successModal.style.display = 'none';
    const recTab = document.querySelector('.nav-item[data-tab="recommendations"]');
    if (recTab) recTab.click();
  });
  document.getElementById('btnViewProfileOrders')?.addEventListener('click', () => {
    if (successModal) successModal.style.display = 'none';
    openProfileDrawer();
  });
}

// ========================================================
// AI SHOPPING ASSISTANT & AUTOMATED PURCHASING CHATBOT
// ========================================================
let chatbotState = {
  isOpen: false,
  isWaiting: false,
  history: []
};

function setupChatbot() {
  const triggerBtn = document.getElementById('chatbotFloatingBtn');
  const widget = document.getElementById('chatbotWidget');
  const btnClose = document.getElementById('btnChatbotClose');
  const btnMinimize = document.getElementById('btnChatbotMinimize');
  const btnReset = document.getElementById('btnChatbotReset');
  const form = document.getElementById('chatbotForm');
  const input = document.getElementById('chatbotInput');
  const quickCheckoutBtn = document.getElementById('btnChatbotQuickCheckout');

  triggerBtn?.addEventListener('click', toggleChatbot);
  btnClose?.addEventListener('click', () => closeChatbot());
  btnMinimize?.addEventListener('click', () => closeChatbot());
  btnReset?.addEventListener('click', () => resetChatbot());
  quickCheckoutBtn?.addEventListener('click', () => handleChatbotCheckoutClick());

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    sendChatbotMessage(query);
  });

  // Initial welcome message
  initChatbotWelcome();
  updateChatbotCartBar();
}

function toggleChatbot() {
  const widget = document.getElementById('chatbotWidget');
  if (!widget) return;
  chatbotState.isOpen = !chatbotState.isOpen;
  widget.style.display = chatbotState.isOpen ? 'flex' : 'none';

  if (chatbotState.isOpen) {
    const dot = document.getElementById('chatbotUnreadDot');
    if (dot) dot.style.display = 'none';
    updateChatbotCartBar();
    scrollChatbotToBottom();
    setTimeout(() => document.getElementById('chatbotInput')?.focus(), 200);
  }
}

function closeChatbot() {
  const widget = document.getElementById('chatbotWidget');
  if (widget) widget.style.display = 'none';
  chatbotState.isOpen = false;
}

function resetChatbot() {
  const container = document.getElementById('chatbotMessages');
  if (container) container.innerHTML = '';
  chatbotState.history = [];
  initChatbotWelcome(true);
}

function updateChatbotCartBar() {
  const bar = document.getElementById('chatbotCartBar');
  const countEl = document.getElementById('chatbotCartCount');
  const totalEl = document.getElementById('chatbotCartTotal');
  if (!bar) return;

  const count = appState.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const total = appState.cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);

  if (count > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = count;
    if (totalEl) totalEl.textContent = formatPrice(total);
  } else {
    bar.style.display = 'none';
  }
}

function initChatbotWelcome(force = false) {
  const container = document.getElementById('chatbotMessages');
  if (!container || (container.children.length > 0 && !force)) return;

  const userName = appState.currentUser ? (appState.currentUser.name || appState.currentUser.username) : 'bạn';
  const welcomeText = 
    `👋 **Xin chào ${userName}!** Tôi là **Trợ lý Mua Sắm AI (K/H Store)**.\n\n` +
    `Tôi có thể tự động hóa toàn bộ khâu mua sắm cho bạn:\n` +
    `• 🔍 **Tư vấn cấu hình & sản phẩm** dựa trên Đồ thị Tri thức (KG).\n` +
    `• 🛒 **Tự động thêm giỏ hàng & kiểm tra phụ kiện mua kèm**.\n` +
    `• ⚡ **Tự động hóa khâu chốt đơn & đặt hàng** tức thì!\n\n` +
    `Bạn đang tìm kiếm thiết bị công nghệ nào?`;

  const initialPills = [
    "💻 Laptop lập trình & đồ họa",
    "🎮 PC Gaming RTX 4090",
    "📱 iPhone 16 Pro Max",
    "🛒 Xem giỏ hàng & Chốt đơn",
    "⚡ Đặt hàng nhanh"
  ];

  appendBotMessage(welcomeText, [], initialPills);
}

function appendUserMessage(text) {
  const container = document.getElementById('chatbotMessages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'chat-row chat-row-user';
  row.innerHTML = `<div class="chat-bubble chat-bubble-user">${escapeHtml(text)}</div>`;
  container.appendChild(row);
  scrollChatbotToBottom();
}

function appendTypingIndicator() {
  const container = document.getElementById('chatbotMessages');
  if (!container) return null;

  const row = document.createElement('div');
  row.className = 'chat-row chat-row-bot';
  row.id = 'chatTypingIndicator';
  row.innerHTML = `
    <div class="chat-bot-avatar">🤖</div>
    <div class="chat-bubble chat-bubble-bot">
      <div class="chat-typing-dots">
        <span class="chat-typing-dot"></span>
        <span class="chat-typing-dot"></span>
        <span class="chat-typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(row);
  scrollChatbotToBottom();
  return row;
}

function removeTypingIndicator() {
  const el = document.getElementById('chatTypingIndicator');
  if (el) el.remove();
}

function appendBotMessage(text, products = [], pills = [], order = null) {
  const container = document.getElementById('chatbotMessages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'chat-row chat-row-bot';

  let formattedText = formatChatMarkdown(text);

  let productsHtml = '';
  if (products && products.length > 0) {
    productsHtml = `
      <div class="chat-products-list">
        ${products.map(p => `
          <div class="chat-product-item">
            <img src="${p.image || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200'}" alt="${p.name}" class="chat-prod-img" onerror="this.src='https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200'" />
            <div class="chat-prod-info">
              <h5 class="chat-prod-name" title="${p.name}">${p.name}</h5>
              <div class="chat-prod-price-row">
                <span class="chat-prod-price">${formatPrice(p.price)}</span>
                <span class="chat-prod-badge">⭐ ${p.rating || 4.8}</span>
              </div>
              <div class="chat-prod-kg-reason">💡 ${p.kg_reason || 'Độ khớp cao trên Đồ thị Tri thức'}</div>
              <div class="chat-prod-actions">
                <button class="chat-btn-cart" onclick="botAddProductToCart('${p.id}')">🛒 Thêm giỏ</button>
                <button class="chat-btn-buy" onclick="botBuyNow('${p.id}')">⚡ Mua ngay</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  let orderHtml = '';
  if (order) {
    orderHtml = `
      <div class="chat-order-receipt">
        <div class="chat-order-header">
          <span class="chat-order-id">Mã đơn: ${order.id}</span>
          <span class="chat-order-status-badge">Đã xác nhận</span>
        </div>
        <div class="chat-order-details">
          <div>👤 <b>Người nhận:</b> ${order.customer?.name || 'Khách hàng'} (${order.customer?.phone || ''})</div>
          <div>📍 <b>Địa chỉ:</b> ${order.customer?.address || 'Tại địa chỉ đăng ký'}</div>
          <div>💳 <b>Thanh toán:</b> ${order.payment_method || 'COD'}</div>
        </div>
        <div class="chat-order-total-row">
          <span>Tổng thanh toán:</span>
          <span style="color:#e53238;">${formatPrice(order.total)}</span>
        </div>
      </div>
    `;
  }

  row.innerHTML = `
    <div class="chat-bot-avatar">🤖</div>
    <div class="chat-bubble chat-bubble-bot">
      <div>${formattedText}</div>
      ${productsHtml}
      ${orderHtml}
    </div>
  `;

  container.appendChild(row);
  renderChatbotPills(pills);
  scrollChatbotToBottom();
}

function renderChatbotPills(pills = []) {
  const container = document.getElementById('chatbotPills');
  if (!container) return;

  if (!pills || pills.length === 0) {
    pills = ["💻 Laptop", "📱 Điện thoại", "🎮 PC Gaming", "🛒 Xem giỏ hàng", "⚡ Chốt đơn ngay"];
  }

  container.innerHTML = pills.map(p => `
    <button type="button" class="chatbot-pill" onclick="sendChatbotMessage('${escapeHtml(p)}')">
      ${p}
    </button>
  `).join('');
}

function scrollChatbotToBottom() {
  const container = document.getElementById('chatbotMessages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

async function sendChatbotMessage(text) {
  if (!text || chatbotState.isWaiting) return;

  appendUserMessage(text);
  chatbotState.isWaiting = true;
  appendTypingIndicator();

  const uid = appState.currentUser ? appState.currentUser.id : 'u1';
  const payload = {
    message: text,
    user_id: uid,
    cart: appState.cart,
    context: {
      is_guest: appState.isGuest,
      current_category: appState.selectedCategory
    }
  };

  try {
    const res = await fetch(`${API_BASE}/chatbot/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    removeTypingIndicator();

    if (res.ok && data.success) {
      appendBotMessage(data.reply, data.products || [], data.suggested_replies || [], data.order || null);

      if (data.action) {
        handleBotAutomatedAction(data.action);
      }
    } else {
      appendBotMessage("Xin lỗi, tôi gặp chút gián đoạn kết nối. Bạn vui lòng thử lại nhé!");
    }
  } catch (err) {
    removeTypingIndicator();
    appendBotMessage("Lỗi kết nối máy chủ! Vui lòng kiểm tra lại đường truyền mạng.");
  } finally {
    chatbotState.isWaiting = false;
  }
}

function handleBotAutomatedAction(action) {
  if (!action) return;

  if (action.type === 'add_to_cart' && action.product) {
    const p = action.product;
    const existing = appState.cart.find(it => it.id === p.id);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      appState.cart.push({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        brand: p.brand || (p.brands ? p.brands[0] : 'K/H Store'),
        quantity: 1
      });
      if (!appState.selectedCartItemIds) appState.selectedCartItemIds = new Set();
      appState.selectedCartItemIds.add(p.id);
    }
    saveCartAndFavoritesToStorage();
    updateCartAndFavoritesBadges();
    updateChatbotCartBar();
    showToast(`Đã thêm "${p.name}" vào giỏ hàng! 🛒`, 'success');
  } else if (action.type === 'clear_cart') {
    appState.cart = [];
    saveCartAndFavoritesToStorage();
    updateCartAndFavoritesBadges();
    updateChatbotCartBar();
  } else if (action.type === 'order_completed') {
    appState.cart = [];
    saveCartAndFavoritesToStorage();
    updateCartAndFavoritesBadges();
    updateChatbotCartBar();
    showToast('Đơn hàng đã được tự động xử lý thành công! 🎉', 'success');
    loadRecommendations();
  } else if (action.type === 'view_cart') {
    updateChatbotCartBar();
  }
}

window.botAddProductToCart = function(productId) {
  const prod = appState.recommendations.find(p => p.id === productId) || { id: productId };
  sendChatbotMessage(`Thêm ${prod.name || productId} vào giỏ hàng`);
};

window.botBuyNow = function(productId) {
  const prod = appState.recommendations.find(p => p.id === productId) || { id: productId };
  const existing = appState.cart.find(it => it.id === productId);
  if (existing) {
    existing.quantity = (existing.quantity || 1) + 1;
  } else {
    appState.cart.push({
      id: prod.id,
      name: prod.name || productId,
      price: prod.price || 0,
      image: prod.image || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200',
      brand: prod.brand || 'K/H Store',
      quantity: 1
    });
  }
  saveCartAndFavoritesToStorage();
  updateCartAndFavoritesBadges();
  updateChatbotCartBar();
  sendChatbotMessage("Chốt đơn ngay");
};

function handleChatbotCheckoutClick() {
  sendChatbotMessage("Chốt đơn ngay");
}

function formatChatMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function resizeImageToMax(file, maxWidth = 400, maxHeight = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
