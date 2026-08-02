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
    app.innerHTML = renderLoading("Loading your data...");
    return;
  }
  if (cloudLoadFailed && isAuthenticated()) {
    currentSurfaceKey = "cloud-load-error";
    app.innerHTML = renderCloudLoadError();
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

function renderCloudLoadError() {
  return `
    <section class="login-shell" aria-label="AD Smashers Manager data load recovery">
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
            <h1>Your Data Did Not Load</h1>
          </div>
        </div>
        <p class="login-copy">Your data is not deleted. This device could not load it, so the app is paused instead of showing empty records.</p>
        <p class="login-error" role="alert">${escapeHtml(DATA_LOAD_ERROR_MESSAGE)}</p>
        <div class="toolbar">
          <button class="btn primary" type="button" data-action="retry-cloud-load">Retry Data Load</button>
          <button class="btn" type="button" data-action="check-app-update">Refresh App Files</button>
          <button class="btn" type="button" data-action="sign-out">Sign Out</button>
        </div>
      </div>
    </section>
  `;
}

function renderLoading(message = "Loading...") {
  return `
    <section class="login-shell loading-shell" aria-label="AD Smashers Manager loading">
      <div class="loading-court-stage" aria-hidden="true">
        <svg class="loading-court-scene" viewBox="0 0 1200 700" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="loadingCourtSurface" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#0c6a61" stop-opacity="0.56"></stop>
              <stop offset="0.52" stop-color="#0a514d" stop-opacity="0.38"></stop>
              <stop offset="1" stop-color="#19395f" stop-opacity="0.5"></stop>
            </linearGradient>
          </defs>
          <path class="loading-court-surface" d="M 335 70 L 865 70 L 1160 680 L 40 680 Z"></path>
          <path class="loading-court-boundary" d="M 335 70 L 865 70 L 1160 680 L 40 680 Z"></path>
          <path class="loading-court-line" d="M 390 70 L 170 680 M 810 70 L 1030 680"></path>
          <path class="loading-court-line" d="M 258 230 L 942 230 M 125 505 L 1075 505"></path>
          <path class="loading-court-line loading-court-center" d="M 600 70 L 600 230 M 600 505 L 600 680"></path>
          <path class="loading-court-net" d="M 190 365 L 1010 365"></path>
          <circle class="loading-court-post" cx="190" cy="365" r="7"></circle>
          <circle class="loading-court-post" cx="1010" cy="365" r="7"></circle>
        </svg>
        <span class="loading-court-light"></span>
        <svg class="loading-rally-vfx" viewBox="0 0 1200 700" preserveAspectRatio="none" focusable="false">
          <path class="loading-rally-trail loading-rally-trail-forward loading-vfx-wide" pathLength="1" d="M 330 390 C 455 135, 650 55, 820 108" />
          <path class="loading-rally-trail loading-rally-trail-return loading-vfx-wide" pathLength="1" d="M 820 108 C 650 55, 455 135, 330 390" />
          <g class="loading-vfx-wide" transform="translate(330 390)">
            <g class="loading-contact loading-contact-left">
              <circle r="19"></circle>
              <path d="M -38 0 H 38 M 0 -38 V 38 M -27 -27 L 27 27 M 27 -27 L -27 27"></path>
            </g>
          </g>
          <g class="loading-vfx-wide" transform="translate(820 108)">
            <g class="loading-contact loading-contact-right">
              <circle r="19"></circle>
              <path d="M -38 0 H 38 M 0 -38 V 38 M -27 -27 L 27 27 M 27 -27 L -27 27"></path>
            </g>
          </g>
          <path class="loading-rally-trail loading-rally-trail-forward loading-vfx-compact" pathLength="1" d="M 505 515 C 575 230, 655 70, 710 96" />
          <path class="loading-rally-trail loading-rally-trail-return loading-vfx-compact" pathLength="1" d="M 710 96 C 655 70, 575 230, 505 515" />
          <g class="loading-vfx-compact" transform="translate(505 515)">
            <g class="loading-contact loading-contact-left">
              <circle r="19"></circle>
              <path d="M -38 0 H 38 M 0 -38 V 38 M -27 -27 L 27 27 M 27 -27 L -27 27"></path>
            </g>
          </g>
          <g class="loading-vfx-compact" transform="translate(710 96)">
            <g class="loading-contact loading-contact-right">
              <circle r="19"></circle>
              <path d="M -38 0 H 38 M 0 -38 V 38 M -27 -27 L 27 27 M 27 -27 L -27 27"></path>
            </g>
          </g>
        </svg>
        ${renderLoadingPlayerFigure("left")}
        ${renderLoadingPlayerFigure("right")}
        <span class="loading-flight-shuttle"></span>
      </div>
      <div class="loading-card">
        <div class="loading-brand">
          <img class="loading-logo" src="assets/ad-smashers-logo.png" alt="AD Smashers logo" />
          <div>
            <p class="login-eyebrow">AD Smashers Manager</p>
            <h1>Setting the court</h1>
            <p class="loading-status">${escapeHtml(message)}</p>
          </div>
        </div>
        <div class="loading-progress" aria-hidden="true"><span></span></div>
        <p class="loading-copy">One rally, then you are in.</p>
      </div>
    </section>
  `;
}

function renderLoadingPlayerFigure(side) {
  const mirror = side === "right" ? 'transform="translate(220 0) scale(-1 1)"' : "";
  return `
    <svg class="loading-player-figure loading-player-${side}" viewBox="0 0 220 360" focusable="false">
      <g ${mirror}>
        <ellipse class="loading-player-shadow" cx="110" cy="334" rx="76" ry="15"></ellipse>
        <g class="loading-player-body">
          <path class="loading-player-leg loading-player-leg-front" d="M 93 190 L 70 252 L 38 323"></path>
          <path class="loading-player-leg loading-player-leg-back" d="M 127 190 L 151 254 L 181 323"></path>
          <path class="loading-player-shoe" d="M 34 322 L 70 322"></path>
          <path class="loading-player-shoe" d="M 157 322 L 190 322"></path>
          <path class="loading-player-jersey" d="M 78 93 Q 110 78 142 93 L 151 191 Q 110 213 69 191 Z"></path>
          <path class="loading-player-jersey-mark" d="M 75 139 Q 110 155 146 139"></path>
          <circle class="loading-player-head" cx="110" cy="61" r="24"></circle>
          <path class="loading-player-hair" d="M 88 62 Q 91 30 119 35 Q 137 39 133 62 Q 114 47 88 62 Z"></path>
          <path class="loading-player-arm loading-player-free-arm" d="M 80 108 L 51 137 L 43 176"></path>
          <g class="loading-swing-arm">
            <path class="loading-player-arm" d="M 141 108 L 169 126 L 184 99"></path>
            <path class="loading-racket-handle" d="M 184 99 L 202 73"></path>
            <g class="loading-racket-head" transform="rotate(34 213 45)">
              <ellipse cx="213" cy="45" rx="20" ry="34"></ellipse>
              <path d="M 197 28 H 229 M 193 40 H 233 M 193 51 H 233 M 197 63 H 229 M 202 16 V 74 M 213 11 V 79 M 224 16 V 74"></path>
            </g>
          </g>
        </g>
      </g>
    </svg>
  `;
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
