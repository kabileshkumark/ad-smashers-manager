async function initializeApp() {
  uiState = loadUiState();
  uiState.sessionWeekStart = weekStartIso(new Date());
  activeView = initialActiveView();
  activeSessionId = uiState.activeSessionId || null;
  activeSessionTab = SESSION_DETAIL_TABS.includes(uiState.activeSessionTab) ? uiState.activeSessionTab : DEFAULT_SESSION_TAB;
  modal = null;
  toastTimer = null;
  scrollSaveTimer = null;
  scrollActivityTimer = null;
  currentSurfaceKey = "";
  isRestoringScroll = false;
  activityDraft = createActivityDraft();
  groupPaymentDraft = createGroupPaymentDraft();
  paymentGroupDraft = createPaymentGroupDraft();
  state = emptyState();
  currentUser = null;
  currentUserMembership = null;
  currentUserRole = "";
  authLoading = true;
  cloudLoading = false;
  cloudError = "";
  cloudLoadFailed = false;
  cloudSaveTimer = null;
  cloudSaveInFlight = false;
  cloudSavePending = false;
  cloudStateNeedsMigrationSave = false;
  cloudStateExists = false;
  cloudStateVersion = 0;
  cloudStateUpdateTime = "";
  cloudStateRemoteUpdatedAtMs = 0;
  cloudStateClientId = "";
  cloudStateSaveId = "";
  cloudStructuredCollectionIds = null;
  cloudStateBaseSnapshot = null;
  cloudClientId = "";
  cloudSaveConflict = false;
  lastCloudSaveError = "";
  loginError = "";
  serviceWorkerRegistration = null;
  pendingAppReload = false;
  clearLegacyLocalState();

  document.addEventListener("click", handleClick);
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerUp);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("scroll", queueScrollSave, { capture: true, passive: true });
  window.addEventListener("scroll", queueScrollSave, { passive: true });
  window.addEventListener("beforeunload", () => {
    rememberScrollPosition();
    saveUiState();
  });

  installViewportInteractionGuards();
  installPullRefresh();
  registerServiceWorker();
  render();

  try {
    const restoredUser = await restoreFirebaseAuthSession();
    if (restoredUser) {
      authLoading = false;
      cloudLoading = true;
      render();
      state = await loadCloudState();
      cloudError = "";
      cloudLoadFailed = false;
      if (cloudStateNeedsMigrationSave) saveState();
    }
  } catch (error) {
    cloudError = error.message || "Could not load Firestore data.";
    cloudLoadFailed = isAuthenticated();
  } finally {
    authLoading = false;
    cloudLoading = false;
    render();
  }
}

initializeApp();
