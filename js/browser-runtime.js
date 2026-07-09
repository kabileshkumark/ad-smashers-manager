const WHATSAPP_BUSINESS_ANDROID_PACKAGE = "com.whatsapp.w4b";
const DEFAULT_APP_LOADING_MESSAGE = "Refreshing app...";
const MODAL_TEXT_CONTROL_SELECTOR = ".modal-card input:not([type='hidden']), .modal-card select, .modal-card textarea";
let appHandoffOverlayTimer = null;
let modalKeyboardFocusGuardsInstalled = false;

function isAndroidRuntime() {
  return /Android/i.test(navigator.userAgent || "");
}

function isIosRuntime() {
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/i.test(navigator.userAgent || "") || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function whatsappDigits(number) {
  return String(number || "").replace(/\D/g, "");
}

function whatsappLink(number) {
  const digits = whatsappDigits(number);
  return digits ? `https://wa.me/${digits}` : "";
}

function whatsappBusinessAndroidIntent(pathAndQuery, fallbackUrl) {
  const normalizedPath = String(pathAndQuery || "").replace(/^\/+/, "");
  return `intent://${normalizedPath}#Intent;scheme=whatsapp;package=${WHATSAPP_BUSINESS_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
}

function whatsappBusinessNumberTarget(number) {
  const digits = String(number || "").replace(/\D/g, "");
  const fallbackUrl = digits ? `https://wa.me/${digits}` : "";
  if (!fallbackUrl) return { url: "", fallbackUrl: "" };
  if (isAndroidRuntime()) {
    return { url: whatsappBusinessAndroidIntent(`send?phone=${digits}`, fallbackUrl), fallbackUrl, appHandoff: true };
  }
  return { url: fallbackUrl, fallbackUrl, appHandoff: isIosRuntime() };
}

function telLink(number) {
  const digits = String(number || "").replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}

function safeExternalUrl(url, allowedHosts = []) {
  const raw = String(url || "").trim();
  if (!raw || raw === "#") return "";
  try {
    const parsed = new URL(raw, window.location.href);
    const protocol = parsed.protocol.toLowerCase();
    if (!["http:", "https:"].includes(protocol)) return "";
    if (allowedHosts.length && !allowedHosts.includes(parsed.hostname.toLowerCase())) return "";
    return parsed.href;
  } catch (error) {
    return "";
  }
}

function safeWhatsappGroupUrl(url) {
  return safeExternalUrl(url, ["chat.whatsapp.com"]);
}

function whatsappGroupCode(url) {
  const safeUrl = safeWhatsappGroupUrl(url);
  if (!safeUrl) return "";
  try {
    return new URL(safeUrl).pathname.split("/").filter(Boolean)[0] || "";
  } catch (error) {
    return "";
  }
}

function whatsappBusinessGroupTarget(url) {
  const fallbackUrl = safeWhatsappGroupUrl(url);
  const code = whatsappGroupCode(fallbackUrl);
  if (!fallbackUrl) return { url: "", fallbackUrl: "" };
  if (isAndroidRuntime() && code) {
    return { url: whatsappBusinessAndroidIntent(`chat?code=${encodeURIComponent(code)}`, fallbackUrl), fallbackUrl, appHandoff: true };
  }
  return { url: fallbackUrl, fallbackUrl, appHandoff: isIosRuntime() };
}

function safeMapUrl(url) {
  const safeUrl = safeExternalUrl(url, ["maps.app.goo.gl", "maps.google.com", "www.google.com", "google.com"]);
  if (!safeUrl) return "";
  try {
    const parsed = new URL(safeUrl);
    if (parsed.hostname === "www.google.com" || parsed.hostname === "google.com") {
      return parsed.pathname.startsWith("/maps") ? safeUrl : "";
    }
    return safeUrl;
  } catch (error) {
    return "";
  }
}

function openExternal(url) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) {
    showToast("No link configured yet.");
    return;
  }
  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function setAppLoadingOverlay(visible, message = DEFAULT_APP_LOADING_MESSAGE) {
  const overlay = document.querySelector("#app-loading-overlay");
  const text = document.querySelector("#app-loading-overlay-text");
  if (!overlay) return;
  if (text) text.textContent = message;
  overlay.classList.toggle("show", visible);
}

function startAppHandoffOverlay(message = "Opening WhatsApp...") {
  clearTimeout(appHandoffOverlayTimer);
  setAppLoadingOverlay(true, message);
  const clearOverlay = () => {
    clearTimeout(appHandoffOverlayTimer);
    window.removeEventListener("focus", clearOverlay);
    window.removeEventListener("pageshow", clearOverlay);
    document.removeEventListener("visibilitychange", handleVisibility);
    setAppLoadingOverlay(false, DEFAULT_APP_LOADING_MESSAGE);
  };
  const handleVisibility = () => {
    if (!document.hidden) clearOverlay();
  };
  window.addEventListener("focus", clearOverlay);
  window.addEventListener("pageshow", clearOverlay);
  document.addEventListener("visibilitychange", handleVisibility);
  appHandoffOverlayTimer = window.setTimeout(clearOverlay, 4800);
}

function openMobileAppUrl(url, fallbackUrl) {
  startAppHandoffOverlay();
  if (String(url).startsWith("intent:")) {
    window.setTimeout(() => {
      window.location.href = url;
    }, 80);
    return;
  }

  window.setTimeout(() => {
    window.location.href = url;
  }, 80);
  if (fallbackUrl && fallbackUrl !== url) {
    let appOpened = false;
    const markAppOpened = () => {
      if (document.hidden) appOpened = true;
    };
    document.addEventListener("visibilitychange", markAppOpened);
    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", markAppOpened);
      if (!appOpened && !document.hidden) window.location.href = fallbackUrl;
    }, 1200);
  }
}

function openBusinessWhatsappTarget(target, missingMessage) {
  if (!target?.url) {
    showToast(missingMessage);
    return;
  }
  if (target.appHandoff || /^(intent|whatsapp):/i.test(target.url)) {
    openMobileAppUrl(target.url, target.fallbackUrl);
    return;
  }
  window.open(target.url, "_blank", "noopener,noreferrer");
}

function openWhatsappNumber(number) {
  openBusinessWhatsappTarget(whatsappBusinessNumberTarget(number), "No WhatsApp number configured yet.");
}

function openWhatsappGroup(url) {
  openBusinessWhatsappTarget(whatsappBusinessGroupTarget(url), "No WhatsApp group configured yet.");
}

function normalizeClipboardText(text) {
  return String(text ?? "").replace(/\r\n|\r|\n/g, "\r\n");
}

function clipboardHtml(text) {
  return `<meta charset="utf-8"><div>${escapeHtml(text).replace(/\r\n/g, "<br>")}</div>`;
}

function copyTextWithCopyEvent(clipboardText) {
  let copied = false;
  const area = document.createElement("textarea");
  const onCopy = (event) => {
    event.preventDefault();
    event.clipboardData.setData("text/plain", clipboardText);
    event.clipboardData.setData("text/html", clipboardHtml(clipboardText));
    copied = true;
  };
  area.value = " ";
  area.style.position = "fixed";
  area.style.left = "-999px";
  document.body.appendChild(area);
  document.addEventListener("copy", onCopy);
  area.focus();
  area.select();
  const ok = document.execCommand("copy");
  document.removeEventListener("copy", onCopy);
  document.body.removeChild(area);
  return ok && copied;
}

async function copyText(text, successMessage) {
  const clipboardText = normalizeClipboardText(text);
  try {
    if (copyTextWithCopyEvent(clipboardText)) {
      showToast(successMessage);
      return;
    }
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([clipboardText], { type: "text/plain" }),
          "text/html": new Blob([clipboardHtml(clipboardText)], { type: "text/html" })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(clipboardText);
    }
    showToast(successMessage);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = clipboardText;
    area.style.position = "fixed";
    area.style.left = "-999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    showToast(successMessage);
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function setPullRefreshUi(mode = "idle", offset = 0) {
  const indicator = document.querySelector("#pull-refresh-indicator");
  const text = document.querySelector("#pull-refresh-text");
  const overlay = document.querySelector("#app-loading-overlay");
  if (indicator) {
    indicator.classList.toggle("visible", mode === "pulling" || mode === "ready" || mode === "refreshing");
    indicator.classList.toggle("ready", mode === "ready");
    indicator.classList.toggle("refreshing", mode === "refreshing");
    indicator.style.transform = mode === "idle" ? "" : `translate(-50%, ${Math.round(offset)}px)`;
  }
  if (text) {
    text.textContent = mode === "refreshing" ? "Refreshing..." : mode === "ready" ? "Release to refresh" : "Pull to refresh";
  }
  if (overlay) {
    overlay.classList.toggle("show", mode === "refreshing");
  }
}

function resetPullRefreshUi() {
  pullRefresh.tracking = false;
  pullRefresh.ready = false;
  pullRefresh.offset = 0;
  if (!pullRefresh.refreshing) setPullRefreshUi("idle", 0);
}

function canStartPullRefresh(event) {
  if (pullRefresh.refreshing || modal) return false;
  if (!event.touches || event.touches.length !== 1) return false;
  if (event.target.closest("input, select, textarea, button, a, [contenteditable='true']")) return false;
  const main = document.querySelector("#main-content");
  return Boolean(main && main.scrollTop <= 0);
}

function handlePullRefreshStart(event) {
  if (!canStartPullRefresh(event)) return;
  const touch = event.touches[0];
  pullRefresh.tracking = true;
  pullRefresh.ready = false;
  pullRefresh.startX = touch.clientX;
  pullRefresh.startY = touch.clientY;
  pullRefresh.offset = 0;
}

function handlePullRefreshMove(event) {
  if (!pullRefresh.tracking || pullRefresh.refreshing || !event.touches || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const deltaY = touch.clientY - pullRefresh.startY;
  const deltaX = Math.abs(touch.clientX - pullRefresh.startX);
  if (deltaY <= 0 || deltaX > deltaY * 0.7) {
    resetPullRefreshUi();
    return;
  }
  const main = document.querySelector("#main-content");
  if (!main || main.scrollTop > 0) {
    resetPullRefreshUi();
    return;
  }
  if (deltaY > 16) event.preventDefault();
  pullRefresh.ready = deltaY >= PULL_REFRESH_THRESHOLD;
  pullRefresh.offset = Math.min(PULL_REFRESH_MAX_OFFSET, deltaY * 0.42);
  setPullRefreshUi(pullRefresh.ready ? "ready" : "pulling", pullRefresh.offset);
}

function handlePullRefreshEnd() {
  if (!pullRefresh.tracking || pullRefresh.refreshing) return;
  if (pullRefresh.ready) {
    performPullRefresh();
    return;
  }
  resetPullRefreshUi();
}

function preventGestureZoom(event) {
  event.preventDefault();
}

function preventMultiTouchZoom(event) {
  if (event.touches && event.touches.length > 1) {
    event.preventDefault();
  }
}

function preventDoubleTapZoom(event) {
  const target = event.target;
  if (target?.closest?.("button, a, input, select, textarea, [contenteditable='true']")) return;
  const now = Date.now();
  if (now - (preventDoubleTapZoom.lastTouchEnd || 0) < 320) {
    event.preventDefault();
  }
  preventDoubleTapZoom.lastTouchEnd = now;
}

function refreshVisualViewportModalVars() {
  const rootStyle = document.documentElement?.style;
  if (!rootStyle?.setProperty) return;
  const viewport = window.visualViewport;
  const height = Math.max(0, Math.round(viewport?.height || window.innerHeight || document.documentElement?.clientHeight || 0));
  const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
  if (height) rootStyle.setProperty("--visual-viewport-height", `${height}px`);
  rootStyle.setProperty("--visual-viewport-offset-top", `${offsetTop}px`);
}

function modalTextControl(target) {
  return target?.matches?.(MODAL_TEXT_CONTROL_SELECTOR) ? target : null;
}

function scrollFocusedModalControlIntoView(control = document.activeElement, delay = 80) {
  const target = modalTextControl(control);
  const modalCard = target?.closest?.(".modal-card");
  if (!target || !modalCard) return false;
  const scrollTarget = target.closest(".field, .activity-player-control, .poll-vote-guest-name-field, .quick-vote-name-field, .payment-group-guest-item") || target;
  window.setTimeout(() => {
    refreshVisualViewportModalVars();
    scrollTarget.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
  }, delay);
  return true;
}

function handleModalControlFocusIn(event) {
  const target = modalTextControl(event.target);
  if (!target) return;
  [60, 260, 520].forEach((delay) => scrollFocusedModalControlIntoView(target, delay));
}

function handleModalViewportChange() {
  refreshVisualViewportModalVars();
  scrollFocusedModalControlIntoView(document.activeElement, 40);
}

function installModalKeyboardFocusGuards() {
  if (modalKeyboardFocusGuardsInstalled) return;
  modalKeyboardFocusGuardsInstalled = true;
  refreshVisualViewportModalVars();
  document.addEventListener("focusin", handleModalControlFocusIn, true);
  window.addEventListener("resize", handleModalViewportChange, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleModalViewportChange, { passive: true });
    window.visualViewport.addEventListener("scroll", handleModalViewportChange, { passive: true });
  }
}

function installViewportInteractionGuards() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, preventGestureZoom, { passive: false });
  });
  document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
  document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
  installModalKeyboardFocusGuards();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return null;
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!pendingAppReload) return;
      pendingAppReload = false;
      replaceWithFreshAppUrl();
    });
    return serviceWorkerRegistration;
  } catch (error) {
    console.warn("Could not register service worker", error);
    return null;
  }
}

async function requestServiceWorkerUpdate() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return false;
  const registration = serviceWorkerRegistration || await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  try {
    await registration.update();
    const waitingWorker = registration.waiting;
    if (waitingWorker) {
      pendingAppReload = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return true;
    }
  } catch (error) {
    console.warn("Could not update service worker", error);
  }
  return false;
}

function freshAppUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("appUpdate", Date.now().toString());
  return url.href;
}

function replaceWithFreshAppUrl() {
  window.location.replace(freshAppUrl());
}

async function clearAppShellCaches() {
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }
  const registration = serviceWorkerRegistration || (navigator.serviceWorker?.getRegistration ? await navigator.serviceWorker.getRegistration() : null);
  const worker = registration?.active || navigator.serviceWorker?.controller;
  if (worker?.postMessage) {
    worker.postMessage({ type: "CLEAR_CACHES" });
  }
}

async function unregisterAppServiceWorkers() {
  if (!navigator.serviceWorker?.getRegistrations) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  serviceWorkerRegistration = null;
  pendingAppReload = false;
}

async function warmLatestAppShell() {
  const probeUrl = new URL("index.html", window.location.href);
  probeUrl.searchParams.set("appUpdateProbe", Date.now().toString());
  await fetch(probeUrl.href, {
    cache: "no-store",
    credentials: "same-origin"
  });
}

async function performAppUpdateCheck() {
  setAppLoadingOverlay(true, "Checking for update...");
  rememberScrollPosition();
  uiState.appLastUpdatedAt = new Date().toISOString();
  saveUiState();
  try {
    await clearAppShellCaches();
    await warmLatestAppShell();
    await unregisterAppServiceWorkers();
    window.setTimeout(replaceWithFreshAppUrl, 350);
  } catch (error) {
    console.warn("Could not fully reset app files", error);
    try {
      await unregisterAppServiceWorkers();
      window.setTimeout(replaceWithFreshAppUrl, 350);
      return;
    } catch (fallbackError) {
      console.warn("Could not reset service worker", fallbackError);
    }
    setAppLoadingOverlay(false, DEFAULT_APP_LOADING_MESSAGE);
    showToast("Could not check update. Try again.");
  }
}

async function performPullRefresh() {
  if (pullRefresh.refreshing) return;
  pullRefresh.refreshing = true;
  pullRefresh.offset = PULL_REFRESH_MAX_OFFSET;
  setPullRefreshUi("refreshing", PULL_REFRESH_MAX_OFFSET);
  rememberScrollPosition();
  saveUiState();
  try {
    const updateWillReload = await requestServiceWorkerUpdate();
    if (updateWillReload) {
      window.setTimeout(() => window.location.reload(), 1400);
      return;
    }
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    pullRefresh.refreshing = false;
    resetPullRefreshUi();
    showToast("Could not refresh. Try again.");
  }
}

function installPullRefresh() {
  document.addEventListener("touchstart", handlePullRefreshStart, { passive: true });
  document.addEventListener("touchmove", handlePullRefreshMove, { passive: false });
  document.addEventListener("touchend", handlePullRefreshEnd, { passive: true });
  document.addEventListener("touchcancel", resetPullRefreshUi, { passive: true });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
