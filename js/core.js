function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function createActivityDraft() {
  return {
    id: "",
    name: "",
    date: new Date().toISOString().slice(0, 10),
    totalPaid: "",
    paidById: "",
    playerIds: [],
    notes: ""
  };
}

function defaultShuttlePurchasePlayerId() {
  const activePlayers = activePlayersAlphabetical();
  const kabilesh = activePlayers.find((player) => {
    const label = String(player.name || player.displayName || "").trim().toLowerCase();
    return label === "kabilesh";
  });
  return kabilesh?.id || state.settings?.organizerPlayerId || activePlayers[0]?.id || "";
}

function createShuttleActivityDraft(activity = null) {
  const playerId = activity?.paidById || defaultShuttlePurchasePlayerId();
  return {
    id: activity?.id || "",
    name: "Shuttle",
    date: activity?.date || new Date().toISOString().slice(0, 10),
    totalPaid: activity ? String(activity.totalPaid || "") : "",
    paidById: playerId,
    playerIds: playerId ? [playerId] : [],
    notes: activity?.notes || "",
    shuttlePurchase: true
  };
}

function createGroupPaymentDraft(groupId = "") {
  const group = groupId ? getPaymentGroup(groupId) : null;
  return {
    groupId: group?.id || "",
    paidById: group?.payerId || "",
    amountPaid: group ? String(paymentGroupBalance(group)) : "",
    saveAsGroupName: "",
    playerIds: uniqueIds(group?.playerIds || [])
  };
}

function createPaymentGroupDraft(groupId = "") {
  const group = groupId ? getPaymentGroup(groupId) : null;
  return {
    id: group?.id || "",
    name: group?.name || "",
    payerId: group?.payerId || "",
    playerIds: uniqueIds(group?.playerIds || []),
    guests: normalizePaymentGroupGuests(group?.guests || [])
  };
}

function isAuthenticated() {
  return Boolean(currentUser?.idToken);
}

function setAuthenticated(value) {
  if (!value) currentUser = null;
}

function nextWeekdayDate(targetDay) {
  const date = new Date();
  const day = date.getDay();
  const delta = (targetDay - day + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isoDate(date) {
  const copy = new Date(date);
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function weekStartIso(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  const day = date.getDay();
  const offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return isoDate(date);
}

function weekRangeLabel(weekStart) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${addDaysIso(weekStart, 6)}T12:00:00`);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function sessionStartTime(session) {
  if (!session?.date) return Number.POSITIVE_INFINITY;
  const startTime = session.startTime || "00:00";
  return new Date(`${session.date}T${startTime}:00`).getTime();
}

function sessionEndTime(session) {
  if (!session?.date || !session?.endTime) return Number.POSITIVE_INFINITY;
  const start = sessionStartTime(session);
  let end = new Date(`${session.date}T${session.endTime}:00`).getTime();
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
    end += 24 * 60 * 60 * 1000;
  }
  return end;
}

function todayIso() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function sessionIsPastDate(session) {
  return Boolean(session?.date && String(session.date) < todayIso());
}

function sessionIsCollectible(session) {
  return sessionEndTime(session) <= Date.now();
}

function currency(value) {
  const amount = Number(value || 0);
  const rounded = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `${rounded} AED`;
}

function financeCurrency(value) {
  const amount = Number(value || 0);
  return amount < 0 ? `(${currency(Math.abs(amount))})` : currency(amount);
}

function icon(name) {
  const icons = {
    dashboard: `<rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />`,
    calendar: `<path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" />`,
    court: `<rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 12h16" /><path d="M12 3v18" /><path d="M8 7h8" /><path d="M8 17h8" />`,
    users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
    userPlus: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" />`,
    userCheck: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" />`,
    templates: `<path d="M4 4h16v16H4z" /><path d="M8 4v16" /><path d="M4 9h16" />`,
    wallet: `<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10H5a3 3 0 0 1-3-3V6" /><path d="M16 13h.01" />`,
    search: `<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />`,
    settings: `<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.37.37.7.6 1a1.65 1.65 0 0 0 1.1.4H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" />`,
    phone: `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.77.59 2.61a2 2 0 0 1-.45 2.11L8 9.69a16 16 0 0 0 6.31 6.31l1.25-1.25a2 2 0 0 1 2.11-.45c.84.27 1.71.47 2.61.59A2 2 0 0 1 22 16.92Z" />`,
    message: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />`,
    poll: `<path d="M4 19V5" /><path d="M10 19v-8" /><path d="M16 19V9" /><path d="M22 19v-5" />`,
    list: `<path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />`,
    flag: `<path d="M4 22V4" /><path d="M4 4h13l-1 5 1 5H4" />`,
    map: `<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />`,
    externalLink: `<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />`,
    copy: `<rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
    save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" />`,
    x: `<path d="M18 6 6 18" /><path d="m6 6 12 12" />`,
    refresh: `<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5" />`,
    plus: `<path d="M12 5v14" /><path d="M5 12h14" />`,
    arrowLeft: `<path d="M19 12H5" /><path d="m12 19-7-7 7-7" />`,
    arrowRight: `<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />`,
    arrowUp: `<path d="M12 19V5" /><path d="m5 12 7-7 7 7" />`,
    arrowDown: `<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />`,
    gripVertical: `<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />`,
    history: `<path d="M3 12a9 9 0 1 0 3-6.7L3 9" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />`,
    organizer: `<path d="m2 5 5 5 5-7 5 7 5-5-3 14H5L2 5Z" /><path d="M5 22h14" />`,
    coOrganizer: `<path d="M12 3 4 7v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V7l-8-4Z" /><path d="m9 12 2 2 4-5" />`,
    check: `<path d="m20 6-11 11-5-5" />`,
    clock: `<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`,
    eye: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />`,
    edit: `<path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />`,
    trash: `<path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />`,
    logOut: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />`
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || ""}</svg>`;
}

function navIcon(viewId) {
  const map = {
    dashboard: "dashboard",
    sessions: "calendar",
    courts: "court",
    players: "users",
    templates: "templates",
    payments: "wallet",
    settings: "settings"
  };
  return map[viewId] || "dashboard";
}

function loadState() {
  return emptyState();
}

function saveState() {
  queueCloudSave();
}

function loadUiState() {
  try {
    const stored = localStorage.getItem(UI_STATE_KEY);
    const parsed = stored ? JSON.parse(stored) : {};
    return {
      ...parsed,
      dashboardRange: DASHBOARD_RANGES.some((range) => range.id === parsed.dashboardRange) ? parsed.dashboardRange : "90",
      paymentsSearch: String(parsed.paymentsSearch || ""),
      sessionWeekStart: parsed.sessionWeekStart || "",
      appLastUpdatedAt: typeof parsed.appLastUpdatedAt === "string" ? parsed.appLastUpdatedAt : "",
      scrollPositions: parsed.scrollPositions || {}
    };
  } catch (error) {
    console.warn("Could not load UI state", error);
    return { dashboardRange: "90", paymentsSearch: "", sessionWeekStart: "", appLastUpdatedAt: "", scrollPositions: {} };
  }
}

function initialActiveView() {
  return DEFAULT_VIEW;
}

function saveUiState() {
  try {
    localStorage.setItem(
      UI_STATE_KEY,
      JSON.stringify({
        ...uiState,
        activeView,
        activeSessionId,
        activeSessionTab,
        scrollPositions: uiState.scrollPositions || {}
      })
    );
  } catch (error) {
    console.warn("Could not save UI state", error);
  }
}

function surfaceKey(view = activeView) {
  return view;
}

function currentScrollTop() {
  const main = document.querySelector("#main-content");
  return main?.scrollTop || 0;
}

function rememberScrollPosition(key = currentSurfaceKey) {
  if (!key) return;
  uiState.scrollPositions = uiState.scrollPositions || {};
  uiState.scrollPositions[key] = currentScrollTop();
}

function restoreScrollPosition(key) {
  const top = Number(uiState.scrollPositions?.[key] || 0);
  isRestoringScroll = true;
  const restore = () => {
    const main = document.querySelector("#main-content");
    if (main) main.scrollTop = top;
    if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
      window.scrollTo(0, 0);
    }
  };
  restore();
  requestAnimationFrame(() => {
    restore();
    setTimeout(() => {
      isRestoringScroll = false;
    }, 0);
  });
}

function captureModalScrollPositions() {
  return [...document.querySelectorAll("[data-modal-scroll]")].map((element) => ({
    key: element.dataset.modalScroll,
    top: element.scrollTop,
    left: element.scrollLeft
  }));
}

function restoreModalScrollPositions(positions = []) {
  if (!positions.length) return;
  const restore = () => {
    const elements = [...document.querySelectorAll("[data-modal-scroll]")];
    positions.forEach((position) => {
      const element = elements.find((item) => item.dataset.modalScroll === position.key);
      if (element) {
        element.scrollTop = position.top;
        element.scrollLeft = position.left;
      }
    });
  };
  restore();
  requestAnimationFrame(() => {
    restore();
  });
}

function queueScrollSave() {
  if (isRestoringScroll) return;
  document.body.classList.add("is-scrolling-content");
  clearTimeout(scrollActivityTimer);
  scrollActivityTimer = setTimeout(() => {
    document.body.classList.remove("is-scrolling-content");
  }, 260);
  if (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) {
    window.scrollTo(0, 0);
  }
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    rememberScrollPosition();
    saveUiState();
  }, 120);
}
