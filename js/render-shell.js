function render() {
  rememberScrollPosition();
  const app = document.querySelector("#app");
  if (authLoading) {
    currentSurfaceKey = "loading";
    app.innerHTML = renderLoading("Checking sign in...");
    return;
  }
  if (!isAuthenticated()) {
    currentSurfaceKey = "login";
    app.innerHTML = renderLogin();
    return;
  }
  if (cloudLoading) {
    currentSurfaceKey = "loading";
    app.innerHTML = renderLoading("Loading Firestore data...");
    return;
  }
  if (cloudLoadFailed && isAuthenticated()) {
    currentSurfaceKey = "cloud-load-error";
    app.innerHTML = renderCloudLoadError(cloudError);
    return;
  }
  withLedgerCoverageSnapshotCache(() => renderAuthenticatedApp(app));
}

function renderAuthenticatedApp(app) {
  const modalScrollPositions = captureModalScrollPositions();
  syncSessionStages();
  if (!SESSION_DETAIL_TABS.includes(activeSessionTab)) {
    activeSessionTab = DEFAULT_SESSION_TAB;
  }
  if (activeSessionId && !state.sessions.some((session) => session.id === activeSessionId)) {
    activeSessionId = null;
  }
  if (!activeSessionId && state.sessions.length) {
    const sorted = sortSessions();
    activeSessionId = (sorted.find((session) => new Date(`${session.date}T23:59:59`).getTime() >= Date.now()) || sorted[sorted.length - 1]).id;
  }

  app.innerHTML = `
    <div class="app-shell">
      <div class="pull-refresh-indicator" id="pull-refresh-indicator" aria-live="polite">
        <span class="pull-refresh-spinner" aria-hidden="true"></span>
        <span id="pull-refresh-text">Pull to refresh</span>
      </div>
      <div class="app-loading-overlay" id="app-loading-overlay" role="status" aria-live="polite">
        <span class="pull-refresh-spinner" aria-hidden="true"></span>
        <span id="app-loading-overlay-text">Refreshing app...</span>
      </div>
      <div class="layout">
        ${renderHeader()}
        ${renderSidebar()}
        <main class="main" id="main-content">
          ${renderActiveView()}
        </main>
      </div>
      ${renderBottomNav()}
      ${renderModal()}
    </div>
  `;
  const nextSurfaceKey = surfaceKey();
  currentSurfaceKey = nextSurfaceKey;
  saveUiState();
  restoreScrollPosition(currentSurfaceKey);
  restoreModalScrollPositions(modalScrollPositions);
}

function renderCloudLoadError(message = "") {
  return `
    <section class="login-shell" aria-label="AD Smashers Manager cloud load recovery">
      <div class="login-court-scene" aria-hidden="true">
        <span class="court-boundary"></span>
        <span class="court-center-line"></span>
        <span class="court-service-line court-service-top"></span>
        <span class="court-service-line court-service-bottom"></span>
        <span class="court-side-line court-side-left"></span>
        <span class="court-side-line court-side-right"></span>
        <span class="court-net"></span>
        <span class="login-shuttle login-shuttle-one"></span>
        <span class="login-shuttle login-shuttle-two"></span>
      </div>
      <div class="login-card">
        <div class="login-brand">
          <img class="login-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
          <div>
            <p class="login-eyebrow">AD Smashers Manager</p>
            <h1>Cloud Data Did Not Load</h1>
          </div>
        </div>
        <p class="login-copy">Your data is not deleted. This device could not load Firestore, so the app is paused instead of showing empty records.</p>
        ${message ? `<p class="login-error" role="alert">${escapeHtml(message)}</p>` : ""}
        <div class="toolbar">
          <button class="btn primary" type="button" data-action="retry-cloud-load">Retry Cloud Load</button>
          <button class="btn" type="button" data-action="check-app-update">Refresh App Files</button>
          <button class="btn" type="button" data-action="sign-out">Sign Out</button>
        </div>
      </div>
    </section>
  `;
}

function renderLoading(message = "Loading...") {
  const shotElements = loadingShotSequence()
    .map((shot, index) => {
      const delay = `${(index * 0.42).toFixed(2)}s`;
      return `
        <span class="loading-shot-path loading-shot-path-${shot}" style="--shot-delay: ${delay}"></span>
        <span class="loading-shuttle loading-shuttle-${shot}" style="--shot-delay: ${delay}"></span>
      `;
    })
    .join("");
  return `
    <section class="login-shell loading-shell" aria-label="AD Smashers Manager loading">
      <div class="loading-court-scene" aria-hidden="true">
        <span class="loading-court-boundary"></span>
        <span class="loading-court-net"></span>
        <span class="loading-court-center"></span>
        <span class="loading-court-service loading-court-service-top"></span>
        <span class="loading-court-service loading-court-service-bottom"></span>
        <span class="loading-racket loading-racket-left"></span>
        <span class="loading-racket loading-racket-right"></span>
        ${shotElements}
      </div>
      <div class="loading-card">
        <div class="loading-brand">
          <img class="loading-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
          <div>
            <p class="login-eyebrow">AD Smashers Manager</p>
            <h1>Rally loading</h1>
            <p class="loading-status">${escapeHtml(message)}</p>
          </div>
        </div>
        <div class="loading-rally" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <p class="loading-copy">Warming up courts, players, payments, and messages.</p>
      </div>
    </section>
  `;
}

function loadingShotSequence() {
  const shots = ["smash", "drive", "drop", "clear", "net"];
  for (let index = shots.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shots[index], shots[swapIndex]] = [shots[swapIndex], shots[index]];
  }
  return shots;
}

function renderLogin() {
  return `
    <section class="login-shell" aria-label="AD Smashers Manager login">
      <div class="login-court-scene" aria-hidden="true">
        <span class="court-boundary"></span>
        <span class="court-center-line"></span>
        <span class="court-service-line court-service-top"></span>
        <span class="court-service-line court-service-bottom"></span>
        <span class="court-side-line court-side-left"></span>
        <span class="court-side-line court-side-right"></span>
        <span class="court-net"></span>
        <span class="login-shuttle login-shuttle-one"></span>
        <span class="login-shuttle login-shuttle-two"></span>
      </div>
      <div class="login-card">
        <div class="login-brand">
          <img class="login-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
          <div>
            <p class="login-eyebrow">AD Smashers Manager</p>
            <h1>Step Onto the Court</h1>
          </div>
        </div>
        <p class="login-copy">Sign in to manage sessions, payments, courts, and player activity.</p>
        <form class="login-form" data-form="login" autocomplete="on">
          <label class="login-field">
            <span>Email</span>
            <input name="email" type="email" autocomplete="email" required autofocus />
          </label>
          <label class="login-field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          ${loginError ? `<p class="login-error" role="alert">${escapeHtml(loginError)}</p>` : ""}
          <button class="btn primary login-submit" type="submit">Enter Court</button>
        </form>
      </div>
    </section>
  `;
}

function renderHeader() {
  return `
    <header class="app-header">
      <a class="brand brand-link" href="#dashboard" data-view="dashboard" data-dashboard-logo="true" aria-label="Open dashboard">
        <img class="brand-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
        <div class="brand-text">
          <p class="brand-title">AD Smashers</p>
          <p class="brand-subtitle">Manager</p>
        </div>
      </a>
      <button class="btn icon-only header-sign-out" type="button" data-action="sign-out" aria-label="Sign out" title="Sign out">${icon("logOut")}</button>
    </header>
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar" aria-label="Primary">
      <a class="brand brand-link sidebar-brand" href="#dashboard" data-view="dashboard" data-dashboard-logo="true" aria-label="Open dashboard">
        <img class="brand-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
        <div class="brand-text">
          <p class="brand-title">AD Smashers</p>
          <p class="brand-subtitle">Manager</p>
        </div>
      </a>
      <nav class="side-nav">
        ${views.filter((view) => view.id !== "dashboard").map((view) => navButton(view)).join("")}
      </nav>
    </aside>
  `;
}

function renderBottomNav() {
  const labels = bottomViews.map((id) => views.find((view) => view.id === id)).filter(Boolean);
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${labels
        .map(
          (view) => `
            <button type="button" class="${bottomActive(view.id)}" data-view="${view.id}">
              ${icon(navIcon(view.id))}
              <span class="visually-hidden">${view.label}</span>
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function navButton(view) {
  return `
    <button type="button" class="${activeView === view.id ? "active" : ""}" data-view="${view.id}">
      ${icon(navIcon(view.id))}
      ${view.label}
    </button>
  `;
}

function bottomActive(id) {
  return activeView === id ? "active" : "";
}

function renderActiveView() {
  if (activeView === "dashboard") return renderDashboard();
  if (activeView === "sessions") return renderSessions();
  if (activeView === "courts") return renderCourts();
  if (activeView === "players") return renderPlayers();
  if (activeView === "payments") return renderPayments();
  if (activeView === "settings") return renderSettings();
  return renderSessions();
}
