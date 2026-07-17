let voteDragState = null;
let viewNavigationPending = false;

function setSessionField(sessionId, fieldName, value) {
  const session = getSession(sessionId);
  const numeric = ["plannedCourts", "bookedCourts", "playersPerCourt", "expectedPlayers", "totalPaid", "perPersonAmount", "shuttleCost", "waterCost"];
  const financialFields = new Set(["date", "startTime", "endTime", "courtId", "bookedCourts", "expectedPlayers", "totalPaid", "perPersonAmount", "shuttleCost", "waterCost"]);
  if (financialFields.has(fieldName) && sessionHasActiveFinancialState(session)) {
    showToast("Clear active cash, Advance, or Credit coverage before changing this session's financial basis.");
    render();
    return false;
  }
  if (fieldName === "perPersonAmount") {
    updateSessionPerPersonAmount(session, value);
  } else {
    session[fieldName] = numeric.includes(fieldName) ? Number(value) : value;
  }
  if (fieldName === "courtId") {
    applyBookingStage(session, true);
  } else {
    applyAutomaticSessionStage(session);
  }
  syncSessionPayments(session);
  saveState();
  render();
  return true;
}

function updateSessionModalCalculations(form) {
  const fields = form?.elements;
  if (!fields) return;
  const courtSlots = sessionCourtSlotsFromForm(form);
  const courts = courtSlotMaxCourts(courtSlots);
  const playersPerCourt = state.settings.defaultPlayersPerCourt || PLAYERS_PER_COURT;
  const shuttleCost = Number(fields.shuttleCost?.value ?? state.settings.defaultShuttleCost ?? 5);
  const expectedPlayersInput = fields.expectedPlayers;
  if (expectedPlayersInput && expectedPlayersInput.dataset.manual !== "true") {
    expectedPlayersInput.value = calculateExpectedPlayers(courts, playersPerCourt);
  }
  const courtFeeInput = form?.querySelector("[data-court-fee-input]");
  if (courtFeeInput && courtFeeInput.dataset.manual !== "true") {
    courtFeeInput.value = calculateCourtFeeForSlots(fields.courtId?.value, courtSlots);
  }
  const perPersonInput = fields.perPersonAmount;
  if (perPersonInput && perPersonInput.dataset.manual !== "true") {
    perPersonInput.value = calculatePerPersonRate(fields.totalPaid?.value, fields.expectedPlayers?.value, shuttleCost);
  }
  const summary = form?.querySelector("[data-session-court-slot-summary]");
  if (summary) {
    summary.textContent = `${Number(courtSlotCourtHours(courtSlots).toFixed(2))} court-hours; ${courts} peak ${courts === 1 ? "court" : "courts"}`;
  }
  const resetCapacityButton = form?.querySelector('[data-action="reset-session-capacity"]');
  if (resetCapacityButton) resetCapacityButton.disabled = expectedPlayersInput?.dataset.manual !== "true";
}

function sessionCourtSlotsFromForm(form) {
  const rows = form?.querySelectorAll ? [...form.querySelectorAll("[data-session-court-slot]")] : [];
  if (rows.length) {
    return rows.map((row) => ({
      startTime: row.querySelector('[name="slotStartTime"]')?.value || "00:00",
      endTime: row.querySelector('[name="slotEndTime"]')?.value || "01:00",
      courts: row.querySelector('[name="slotCourts"]')?.value || 1
    }));
  }
  const fields = form?.elements || {};
  return normalizeCourtSlots([], {
    startTime: fields.startTime?.value || "00:00",
    endTime: fields.endTime?.value || "01:00",
    courts: fields.courts?.value || 1
  });
}

function refreshSessionCourtSlotControls(form) {
  const rows = form?.querySelectorAll ? [...form.querySelectorAll("[data-session-court-slot]")] : [];
  rows.forEach((row, index) => {
    const heading = row.querySelector(".session-court-slot-heading strong");
    const removeButton = row.querySelector('[data-action="remove-session-court-slot"]');
    if (heading) heading.textContent = `Booking ${index + 1}`;
    if (removeButton) {
      removeButton.disabled = rows.length <= 1;
      removeButton.setAttribute("aria-label", `Remove court booking ${index + 1}`);
    }
  });
}

function updateSessionRecurrenceControls(form) {
  if (!form || form.dataset.editId) return;
  const frequency = normalizeRecurrenceFrequency(form.querySelector('[name="recurrence"]:checked')?.value || "none");
  const fields = form.querySelector("[data-session-recurrence-fields]");
  const endInput = form.querySelector("[data-session-recurrence-end]");
  const startDate = form.elements.date?.value || "";
  if (fields) fields.hidden = frequency !== "weekly";
  if (endInput) {
    endInput.disabled = frequency !== "weekly";
    endInput.required = frequency === "weekly";
    if (frequency === "weekly" && !endInput.value) {
      endInput.value = startDate;
    }
  }
  const plan = buildSessionRecurrencePlan(startDate, frequency, endInput?.value || "");
  const summary = form.querySelector("[data-session-recurrence-summary]");
  if (summary) {
    summary.textContent = plan.valid && plan.dates.length
      ? `${plan.dates.length} ${plan.dates.length === 1 ? "session" : "sessions"}`
      : frequency === "weekly" ? "Check end date" : "One session";
  }
  const submit = form.querySelector("[data-session-submit-label]");
  if (submit) submit.textContent = frequency === "weekly" ? "Create Sessions" : "Create Session";
}

function applySessionDateDefaults(form) {
  if (form?.dataset.editId) return;
  const fields = form?.elements;
  if (!fields?.date) return;
  const type = sessionTypeForDate(fields.date.value, fields.type?.value || "Friday");
  if (fields.type) fields.type.value = type;
  const defaults = sessionDefaultsForType(type);
  const slotRows = form.querySelectorAll ? [...form.querySelectorAll("[data-session-court-slot]")] : [];
  if (slotRows.length === 1) {
    const startInput = slotRows[0].querySelector('[name="slotStartTime"]');
    const endInput = slotRows[0].querySelector('[name="slotEndTime"]');
    const courtsInput = slotRows[0].querySelector('[name="slotCourts"]');
    if (startInput) startInput.value = defaults.startTime;
    if (endInput) endInput.value = defaults.endTime;
    if (courtsInput) courtsInput.value = defaults.courts;
  } else {
    if (fields.startTime) fields.startTime.value = defaults.startTime;
    if (fields.endTime) fields.endTime.value = defaults.endTime;
  }
  const recurrenceEnd = form.querySelector("[data-session-recurrence-end]");
  if (recurrenceEnd && recurrenceEnd.dataset.manual !== "true") {
    recurrenceEnd.value = fields.date.value;
  }
  updateSessionModalCalculations(form);
  updateSessionRecurrenceControls(form);
}

function handlePointerDown(event) {
  const handle = event.target.closest?.("[data-vote-drag-handle]");
  if (!handle) return;
  const group = handle.closest("[data-vote-response-group]");
  const list = handle.closest("[data-vote-reorder-list]");
  const sessionId = handle.dataset.session || group?.dataset.session || activeSessionId;
  const responseId = handle.dataset.response || group?.dataset.response || "";
  if (!group || !list || !sessionId || !responseId) return;

  event.preventDefault();
  handle.setPointerCapture?.(event.pointerId);
  const responseIds = [...list.querySelectorAll("[data-vote-response-group]")].map((item) => item.dataset.response).filter(Boolean);
  voteDragState = {
    pointerId: event.pointerId,
    handle,
    group,
    list,
    sessionId,
    responseId,
    responseIds,
    startY: event.clientY,
    moved: false
  };
  group.classList.add("is-dragging");
  list.classList.add("is-reordering");
  document.body.classList.add("vote-reorder-active");
}

function handlePointerMove(event) {
  if (!voteDragState || event.pointerId !== voteDragState.pointerId) return;
  event.preventDefault();
  const { group, list, startY } = voteDragState;
  if (Math.abs(event.clientY - startY) > 4) voteDragState.moved = true;

  const listRect = list.getBoundingClientRect();
  const edge = 42;
  if (event.clientY < listRect.top + edge) {
    list.scrollTop -= Math.max(4, edge - (event.clientY - listRect.top));
  } else if (event.clientY > listRect.bottom - edge) {
    list.scrollTop += Math.max(4, edge - (listRect.bottom - event.clientY));
  }

  const siblings = [...list.querySelectorAll("[data-vote-response-group]")].filter((item) => item !== group);
  const nextSibling = siblings.find((item) => {
    const rect = item.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2;
  });
  if (nextSibling) {
    list.insertBefore(group, nextSibling);
  } else {
    list.appendChild(group);
  }
}

function handlePointerUp(event) {
  if (!voteDragState || event.pointerId !== voteDragState.pointerId) return;
  event.preventDefault();
  const drag = voteDragState;
  voteDragState = null;
  drag.handle.releasePointerCapture?.(event.pointerId);
  drag.group.classList.remove("is-dragging");
  drag.list.classList.remove("is-reordering");
  document.body.classList.remove("vote-reorder-active");

  if (!drag.moved) return;
  const responseIds = [...drag.list.querySelectorAll("[data-vote-response-group]")].map((item) => item.dataset.response).filter(Boolean);
  if (responseIds.join("|") === drag.responseIds.join("|")) return;
  const session = getSession(drag.sessionId);
  if (!session || !reorderSessionResponses(session, responseIds)) {
    render();
    return;
  }
  syncSessionPayments(session);
  applyAutomaticSessionStage(session);
  saveState();
  render();
}

function navigateToView(nextView, nextSessionId = "") {
  const sameSurface = nextView === activeView && (!nextSessionId || nextSessionId === activeSessionId);
  if (sameSurface) return false;
  const isPageSwitch = nextView !== activeView;
  if (isPageSwitch) {
    uiState.scrollPositions = uiState.scrollPositions || {};
    uiState.scrollPositions[surfaceKey(nextView)] = 0;
  }
  activeView = nextView;
  if (nextSessionId) {
    activeSessionId = nextSessionId;
    const selectedSession = getSession(activeSessionId);
    if (selectedSession?.date) uiState.sessionWeekStart = weekStartIso(selectedSession.date);
    activeSessionTab = DEFAULT_SESSION_TAB;
  }
  render();
  return true;
}

function afterVisiblePaint(callback) {
  const requestFrame = typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame.bind(window)
    : (next) => window.setTimeout(next, 16);
  requestFrame(() => requestFrame(callback));
}

function navigateToDashboardWithLoading(nextSessionId = "") {
  const sameSurface = activeView === "dashboard" && (!nextSessionId || nextSessionId === activeSessionId);
  if (sameSurface || viewNavigationPending) return false;
  viewNavigationPending = true;
  setAppLoadingOverlay(true, "Opening Dashboard...");
  afterVisiblePaint(() => {
    try {
      navigateToView("dashboard", nextSessionId);
    } finally {
      viewNavigationPending = false;
      setAppLoadingOverlay(false);
    }
  });
  return true;
}

function handleClick(event) {
  if (event.target.matches("[data-modal-backdrop]")) {
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    const nextView = viewButton.dataset.view;
    const nextSessionId = viewButton.dataset.session || "";
    if (viewButton.dataset.dashboardLogo === "true") {
      navigateToDashboardWithLoading(nextSessionId);
      return;
    }
    navigateToView(nextView, nextSessionId);
    return;
  }

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    activeSessionTab = tabButton.dataset.tab;
    render();
    return;
  }

  const dashboardRangeButton = event.target.closest("[data-dashboard-range]");
  if (dashboardRangeButton) {
    uiState.dashboardRange = dashboardRangeButton.dataset.dashboardRange;
    saveUiState();
    render();
    return;
  }

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const sessionId = actionTarget.dataset.session || activeSessionId;
  const session = sessionId ? getSession(sessionId) : null;

  if (action === "check-app-update") {
    performAppUpdateCheck();
    return;
  }

  if (action === "retry-cloud-load") {
    if (!isAuthenticated()) {
      cloudLoadFailed = false;
      cloudError = "";
      render();
      return;
    }
    cloudError = "";
    cloudLoadFailed = false;
    cloudLoading = true;
    render();
    loadCloudState()
      .then((loadedState) => {
        state = loadedState;
        cloudError = "";
        cloudLoadFailed = false;
        cloudLoading = false;
        if (cloudStateNeedsMigrationSave) saveState();
        showToast("Cloud data loaded.");
        render();
      })
      .catch((error) => {
        cloudError = error.message || "Could not load Firestore data.";
        cloudLoadFailed = true;
        cloudLoading = false;
        render();
      });
    return;
  }

  if (action === "previous-session-week" || action === "next-session-week") {
    const currentWeekStart = selectedSessionWeekStart();
    const nextWeekStart = addDaysIso(currentWeekStart, action === "previous-session-week" ? -7 : 7);
    uiState.sessionWeekStart = nextWeekStart;
    const weekSessions = sessionsForWeek(sortSessions(), nextWeekStart);
    activeSessionId = weekSessions[0]?.id || null;
    activeSessionTab = DEFAULT_SESSION_TAB;
    saveUiState();
    render();
    return;
  }

  if (action === "sign-out") {
    signOutFromFirebase().then(() => {
      loginError = "";
      activeView = DEFAULT_VIEW;
      activeSessionId = null;
      activeSessionTab = DEFAULT_SESSION_TAB;
      modal = null;
      showToast("Signed out.");
      render();
    });
    return;
  }

  if (action === "cancel-delete") {
    cancelDeleteConfirmation();
    return;
  }
  if (action === "confirm-delete") {
    if (executeConfirmedDelete(actionTarget)) {
      render();
    } else {
      modal = null;
      showToast("Could not delete.");
      render();
    }
    return;
  }

  if (action === "add-session-court-slot") {
    const form = actionTarget.closest('form[data-form="session"]');
    const list = form?.querySelector("[data-session-court-slot-list]");
    if (!form || !list) return;
    const slots = sessionCourtSlotsFromForm(form);
    const lastSlot = slots[slots.length - 1] || { startTime: "20:00", endTime: "21:00", courts: 1 };
    const nextSlot = {
      startTime: lastSlot.startTime,
      endTime: lastSlot.endTime,
      courts: 1
    };
    list.insertAdjacentHTML("beforeend", renderSessionCourtSlot(nextSlot, slots.length, slots.length + 1));
    refreshSessionCourtSlotControls(form);
    updateSessionModalCalculations(form);
    list.lastElementChild?.querySelector('[name="slotCourts"]')?.focus();
    return;
  }

  if (action === "remove-session-court-slot") {
    const form = actionTarget.closest('form[data-form="session"]');
    const row = actionTarget.closest("[data-session-court-slot]");
    const rows = form?.querySelectorAll ? form.querySelectorAll("[data-session-court-slot]") : [];
    if (!form || !row || rows.length <= 1) return;
    row.remove();
    refreshSessionCourtSlotControls(form);
    updateSessionModalCalculations(form);
    return;
  }

  if (action === "reset-session-capacity") {
    const form = actionTarget.closest('form[data-form="session"]');
    const capacityInput = form?.elements?.expectedPlayers;
    if (!form || !capacityInput) return;
    delete capacityInput.dataset.manual;
    updateSessionModalCalculations(form);
    capacityInput.focus();
    return;
  }

  if (action === "open-session-modal") modal = { type: "session" };
  if (action === "open-court-modal") modal = { type: "court" };
  if (action === "open-player-modal") modal = { type: "player" };
  if (action === "open-player-role") {
    modal = { type: "playerRole", role: actionTarget.dataset.role || "organizer" };
    render();
    return;
  }
  if (action === "open-activity-modal") {
    activityDraft = createActivityDraft();
    modal = { type: "activity" };
    render();
    return;
  }
  if (action === "open-activity-details") {
    modal = { type: "activityDetails", activityId: actionTarget.dataset.activity || "" };
    render();
    return;
  }
  if (action === "open-shuttle-purchase-modal") {
    activityDraft = createShuttleActivityDraft();
    modal = { type: "shuttlePurchase" };
    render();
    return;
  }
  if (action === "open-group-payment-modal") {
    groupPaymentDraft = createGroupPaymentDraft();
    modal = { type: "groupPayment" };
    render();
    return;
  }
  if (action === "open-payment-group-modal") {
    paymentGroupDraft = createPaymentGroupDraft();
    modal = { type: "paymentGroup" };
    render();
    return;
  }
  if (action === "pay-payment-group") {
    const group = getPaymentGroup(actionTarget.dataset.paymentGroup);
    if (group) {
      groupPaymentDraft = createGroupPaymentDraft(group.id);
      modal = { type: "groupPayment" };
      render();
    }
    return;
  }
  if (action === "open-group-payment-history") {
    modal = { type: "groupPaymentHistory", groupId: actionTarget.dataset.paymentGroup };
    render();
    return;
  }
  if (action === "open-payment-group-copy") {
    modal = { type: "paymentGroupCopy", groupId: actionTarget.dataset.paymentGroup };
    render();
    return;
  }
  if (action === "open-shuttle-spent-history") {
    modal = { type: "shuttleSpentHistory" };
    render();
    return;
  }
  if (action === "open-player-advance-details") {
    modal = { type: "advanceDetails", playerId: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "open-player-advance-history") {
    modal = { type: "advanceHistory", playerId: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "edit-payment-group") {
    const group = getPaymentGroup(actionTarget.dataset.paymentGroup);
    if (group) {
      paymentGroupDraft = createPaymentGroupDraft(group.id);
      modal = { type: "paymentGroup" };
      render();
    }
    return;
  }
  if (action === "open-session-players" && session) {
    modal = { type: "sessionPlayers", id: session.id };
    render();
    return;
  }
  if (action === "open-session-attendance" && session) {
    ensureSessionAttendance(session);
    syncSessionPayments(session);
    modal = { type: "sessionAttendance", id: session.id };
    saveState();
    render();
    return;
  }
  if (action === "open-session-stage" && session) {
    modal = { type: "sessionStage", id: session.id };
    render();
    return;
  }
  if (action === "open-activity-players") {
    captureActivityDraft(actionTarget.closest('form[data-form="activity"]'));
    modal = { type: "activityPlayers" };
    render();
    return;
  }
  if (action === "open-group-payment-players") {
    captureGroupPaymentDraft(actionTarget.closest('form[data-form="group-payment"]'));
    modal = { type: "groupPaymentPlayers" };
    render();
    return;
  }
  if (action === "open-payment-group-players") {
    capturePaymentGroupDraft(actionTarget.closest('form[data-form="payment-group"]'));
    modal = { type: "paymentGroupPlayers" };
    render();
    return;
  }
  if (action === "open-payment-history") {
    modal = { type: "paymentHistory", playerId: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "open-player-payment-details" || action === "open-player-payment-copy") {
    modal = { type: "playerPaymentDetails", playerId: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "copy-player-payment-history") {
    copyText(buildPlayerPaymentHistoryCopy(actionTarget.dataset.player), "Payment history copied.");
    modal = null;
    render();
    return;
  }
  if (action === "copy-player-due-history") {
    copyText(buildPlayerDueHistoryCopy(actionTarget.dataset.player), "Due history copied.");
    modal = null;
    render();
    return;
  }
  if (action === "copy-player-advance-summary") {
    copyText(buildPlayerAdvanceSummaryCopy(actionTarget.dataset.player), "Advance summary copied.");
    render();
    return;
  }
  if (action === "copy-payment-group-history") {
    copyText(buildPaymentGroupPaymentHistoryCopy(actionTarget.dataset.paymentGroup), "Payment history copied.");
    modal = null;
    render();
    return;
  }
  if (action === "copy-payment-group-due-history") {
    copyText(buildPaymentGroupDueHistoryCopy(actionTarget.dataset.paymentGroup), "Due history copied.");
    modal = null;
    render();
    return;
  }
  if (action === "edit-session") {
    modal = { type: "session", id: actionTarget.dataset.session };
    render();
    return;
  }
  if (action === "delete-session" && session) {
    const label = `${session.type} - ${formatDate(session.date)}`;
    const recurring = Boolean(normalizeSessionRecurrence(session.recurrence));
    openDeleteConfirmation({
      deleteType: "session",
      sessionId: session.id,
      confirmLabel: recurring ? "Cancel Session" : "Delete",
      title: recurring ? "Cancel Session" : "Delete Session",
      message: recurring
        ? `Cancel ${label}? Other sessions in this weekly schedule will stay unchanged.`
        : `Delete ${label}? This cannot be undone.`
    });
    return;
  }
  if (action === "edit-court") {
    modal = { type: "court", id: actionTarget.dataset.court };
    render();
    return;
  }
  if (action === "delete-court") {
    const court = state.courts.find((item) => item.id === actionTarget.dataset.court);
    if (court) {
      openDeleteConfirmation({
        deleteType: "court",
        courtId: court.id,
        title: "Delete Court",
        message: `Delete ${court.name || "this court"}? Sessions using it will move to the fallback court.`
      });
    }
    return;
  }
  if (action === "edit-player") {
    modal = { type: "player", id: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "delete-player") {
    const player = getPlayer(actionTarget.dataset.player);
    if (player) {
      openDeleteConfirmation({
        deleteType: "player",
        playerId: player.id,
        title: "Delete Player",
        message: `Delete ${player.name || player.displayName || "this player"}? Their future payment tracking and activity splits will be removed.`
      });
    }
    return;
  }
  if (action === "close-modal") {
    if (modal && typeof modal !== "string" && modal.type === "activityPlayers") {
      modal = { type: "activity" };
      render();
      return;
    }
    if (modal && typeof modal !== "string" && modal.type === "groupPaymentPlayers") {
      modal = { type: "groupPayment" };
      render();
      return;
    }
    if (modal && typeof modal !== "string" && modal.type === "paymentGroupPlayers") {
      modal = { type: "paymentGroup" };
      render();
      return;
    }
    if (modal && typeof modal !== "string" && (modal.type === "activity" || modal.type === "shuttlePurchase")) {
      activityDraft = createActivityDraft();
    }
    if (modal && typeof modal !== "string" && modal.type === "groupPayment") {
      groupPaymentDraft = createGroupPaymentDraft();
    }
    if (modal && typeof modal !== "string" && modal.type === "paymentGroup") {
      paymentGroupDraft = createPaymentGroupDraft();
    }
    modal = null;
    render();
    return;
  }
  if (action === "quick-add-session-player" && session) {
    const playerId = actionTarget.dataset.player;
    if (!playerId) {
      render();
      return;
    }
    if (session.responses.some((item) => item.playerId === playerId)) {
      showToast("That player is already in this session.");
      render();
      return;
    }
    if (manualConfirmedPlayerIds(session).includes(playerId)) {
      showToast("Player is already confirmed.");
      render();
      return;
    }
    const nextVoteOrder = session.responses.length ? Math.max(...session.responses.map((item) => Number(item.voteOrder) || 0)) + 1 : 1;
    session.responses.push({
      id: createId("response"),
      playerId,
      voteOrder: nextVoteOrder,
      attendanceChoice: "in",
      guestCount: 0,
      racketNeeded: false,
      rawOptions: rawOptionsFor("in", false),
      notes: ""
    });
    renumberSessionResponses(session);
    syncSessionPayments(session);
    applyAutomaticSessionStage(session);
    saveState();
    showToast("Player added as I'm in.");
    render();
    return;
  }
  if (action === "activity-add-player") {
    const playerId = actionTarget.dataset.player;
    if (playerId && !activityDraft.playerIds.includes(playerId)) {
      activityDraft.playerIds.push(playerId);
    }
    render();
    return;
  }
  if (action === "activity-remove-player") {
    activityDraft.playerIds = activityDraft.playerIds.filter((id) => id !== actionTarget.dataset.player);
    render();
    return;
  }
  if (action === "group-payment-add-player") {
    const playerId = actionTarget.dataset.player;
    if (playerId && !groupPaymentDraft.playerIds.includes(playerId)) {
      groupPaymentDraft.playerIds.push(playerId);
    }
    render();
    return;
  }
  if (action === "group-payment-remove-player") {
    groupPaymentDraft.playerIds = groupPaymentDraft.playerIds.filter((id) => id !== actionTarget.dataset.player);
    render();
    return;
  }
  if (action === "payment-group-add-player") {
    const playerId = actionTarget.dataset.player;
    if (playerId && !paymentGroupDraft.playerIds.includes(playerId)) {
      paymentGroupDraft.playerIds.push(playerId);
    }
    render();
    return;
  }
  if (action === "payment-group-remove-player") {
    const playerId = actionTarget.dataset.player;
    paymentGroupDraft.playerIds = paymentGroupDraft.playerIds.filter((id) => id !== playerId);
    paymentGroupDraft.guests = normalizePaymentGroupGuests(paymentGroupDraft.guests || []).filter((guest) => guest.ownerPlayerId !== playerId);
    render();
    return;
  }
  if (action === "payment-group-add-guest") {
    addPaymentGroupDraftGuest(actionTarget.dataset.player);
    render();
    return;
  }
  if (action === "payment-group-remove-guest") {
    removePaymentGroupDraftGuest(actionTarget.dataset.guest);
    render();
    return;
  }
  if (action === "edit-activity") {
    const activity = state.activities.find((item) => item.id === actionTarget.dataset.activity);
    if (activity) {
      if (activityIsShuttle(activity)) {
        activityDraft = createShuttleActivityDraft(activity);
        modal = { type: "shuttlePurchase" };
      } else {
        activityDraft = {
          id: activity.id,
          name: activity.name || "",
          date: activity.date || new Date().toISOString().slice(0, 10),
          totalPaid: String(activity.totalPaid || ""),
          paidById: activity.paidById || "",
          playerIds: uniqueIds(activity.playerIds || []),
          notes: activity.notes || ""
        };
        modal = { type: "activity" };
      }
      render();
    }
    return;
  }
  if (action === "cancel-activity-edit") {
    activityDraft = createActivityDraft();
    modal = null;
    render();
    return;
  }
  if (action === "cancel-group-payment") {
    groupPaymentDraft = createGroupPaymentDraft();
    modal = null;
    render();
    return;
  }
  if (action === "cancel-payment-group") {
    paymentGroupDraft = createPaymentGroupDraft();
    modal = null;
    render();
    return;
  }
  if (action === "attendance-add-player" && session) {
    const playerId = actionTarget.dataset.player;
    if (addManualAttendedPlayer(session, playerId)) {
      saveState();
      showToast("Player confirmed.");
    }
    render();
    return;
  }
  if (action === "attendance-remove-player" && session) {
    const playerId = actionTarget.dataset.player;
    const playerName = getPlayerName(playerId);
    openDeleteConfirmation({
      deleteType: "attendance",
      sessionId: session.id,
      playerId,
      title: "Remove Attendance",
      message: `Remove ${playerName} from attended players? Their session payment row will also be removed.`
    });
    return;
  }
  if (action === "attendance-remove-guest" && session) {
    const playerName = getPlayerName(actionTarget.dataset.player);
    openDeleteConfirmation({
      deleteType: "attendance-guest",
      sessionId: session.id,
      playerId: actionTarget.dataset.player,
      guestKey: actionTarget.dataset.guestKey,
      title: "Remove Guest Attendance",
      message: `Remove this guest of ${playerName} from attended players? Their guest share will be removed from payment.`
    });
    return;
  }
  if (action === "add-manual-attendance-guest" && session) {
    if (sessionPlayerHasActiveFinancialState(session, actionTarget.dataset.player)) {
      showToast("Clear this player's active cash, Advance, or Credit coverage before changing guests.");
      render();
      return;
    }
    if (addManualAttendanceGuest(session, actionTarget.dataset.player)) {
      saveState();
      showToast("Guest added.");
    } else {
      showToast("Could not add guest.");
    }
    render();
    return;
  }
  if (action === "add-response-guest" && session) {
    const response = session.responses.find((item) => item.id === actionTarget.dataset.response);
    if (response?.playerId && sessionPlayerHasActiveFinancialState(session, response.playerId)) {
      showToast("Clear this player's active cash, Advance, or Credit coverage before changing guests.");
      render();
      return;
    }
    if (addResponseGuest(session, actionTarget.dataset.response)) {
      saveState();
      showToast("Guest added.");
    } else {
      showToast("Could not add guest.");
    }
    render();
    return;
  }
  if (action === "set-session-stage" && session) {
    setSessionStage(session, actionTarget.dataset.stage);
    applyAutomaticSessionStage(session);
    saveState();
    showToast("Stage updated.");
    modal = null;
    render();
    return;
  }
  if (action === "copy-poll" && session) {
    advanceSessionStage(session, "Poll Live");
    saveState();
    copyText(buildPollMessage(session), "Poll intro copied.");
  }
  if (action === "copy-final-list" && session) {
    advanceSessionStage(session, "Player List Published");
    saveState();
    copyText(buildFinalListMessage(session), "Final list copied.");
  }
  if (action === "copy-payment-reminder" && session) copyText(buildPaymentReminder(session), "Payment reminder copied.");
  if (action === "copy-open-poll" && session) {
    advanceSessionStage(session, "Poll Live");
    saveState();
    copyText(buildPollMessage(session), "Poll copied. Paste it in WhatsApp.");
    openWhatsappGroup(getSessionGroup(session)?.url);
  }
  if (action === "copy-open-final" && session) {
    advanceSessionStage(session, "Player List Published");
    saveState();
    copyText(buildFinalListMessage(session), "Final list copied. Paste it in WhatsApp.");
    openWhatsappGroup(getSessionGroup(session)?.url);
  }
  if (action === "open-group" && session) openWhatsappGroup(getSessionGroup(session)?.url);
  if (action === "open-whatsapp-number") {
    openWhatsappNumber(actionTarget.dataset.number);
    return;
  }
  if (action === "open-map") openExternal(safeMapUrl(getCourt(actionTarget.dataset.court)?.location));
  if (action === "open-playo") openExternal(getCourt(actionTarget.dataset.court)?.playoLink);
  if (action === "copy-booking-request") copyText(buildBookingRequest(getCourt(actionTarget.dataset.court)), "Booking request copied.");
  if (action === "mark-sent" && session) {
    session.sent = session.sent || {};
    session.sent[actionTarget.dataset.message] = new Date().toISOString();
    saveState();
    showToast("Marked as sent.");
  }
  if (action === "delete-response" && session) {
    const response = session.responses.find((item) => item.id === actionTarget.dataset.response);
    const playerName = response ? getPlayerName(response.playerId) : "this player";
    openDeleteConfirmation({
      deleteType: "response",
      sessionId: session.id,
      responseId: actionTarget.dataset.response,
      title: "Remove Player",
      message: `Remove ${playerName} from this session?`
    });
    return;
  }
  if (action === "remove-response-guest" && session) {
    const response = session.responses.find((item) => item.id === actionTarget.dataset.response);
    const playerName = response ? getPlayerName(response.playerId) : "this player";
    openDeleteConfirmation({
      deleteType: "response-guest",
      sessionId: session.id,
      responseId: actionTarget.dataset.response,
      title: "Remove Guest",
      message: `Remove one guest from ${playerName}'s vote?`
    });
    return;
  }
  if ((action === "move-response-up" || action === "move-response-down") && session) {
    const direction = action === "move-response-up" ? -1 : 1;
    if (moveSessionResponse(session, actionTarget.dataset.response, direction)) {
      saveState();
      render();
    }
    return;
  }
  if (action === "mark-partial" && session) {
    modal = { type: "partialPayment", sessionId: session.id, playerId: actionTarget.dataset.player };
    render();
    return;
  }
  if (action === "mark-paid" || action === "mark-pending") {
    const status = action === "mark-paid" ? "Paid" : "Pending";
    if (updatePaymentStatus(session, actionTarget.dataset.player, status)) {
      applyAutomaticSessionStage(session);
      saveState();
    }
  }
  if (action === "delete-activity") {
    const activity = state.activities.find((item) => item.id === actionTarget.dataset.activity);
    if (activity) {
      openDeleteConfirmation({
        deleteType: "activity",
        activityId: activity.id,
        title: "Delete Activity",
        message: `Delete ${activity.name || "this activity"}? This will remove the split from selected players.`
      });
    }
    return;
  }
  if (action === "delete-payment-group") {
    const group = getPaymentGroup(actionTarget.dataset.paymentGroup);
    if (group) {
      openDeleteConfirmation({
        deleteType: "payment-group",
        paymentGroupId: group.id,
        title: "Delete Payment Group",
        message: `Delete ${group.name || "this payment group"}? Past payment history will remain.`
      });
    }
    return;
  }
  if (action === "delete-payment-transaction") {
    const transaction = (state.paymentTransactions || []).find((item) => item.id === actionTarget.dataset.transaction);
    if (transaction) {
      const isAdvancePayment = transaction.type === "advance-payment";
      openDeleteConfirmation({
        deleteType: "payment-transaction",
        transactionId: transaction.id,
        confirmLabel: "Reverse",
        title: isAdvancePayment ? "Reverse Advance" : "Reverse Payment",
        message: isAdvancePayment
          ? `Reverse this Advance payment from ${getPlayerName(transaction.paidById)}? The Advance balance will reduce and the audit record will remain.`
          : `Reverse this payment by ${getPlayerName(transaction.paidById)}? The applied amount will become due again and the audit record will remain.`
      });
    }
    return;
  }
  if (action === "delete-payment-history") {
    const playerName = getPlayerName(actionTarget.dataset.player);
    openDeleteConfirmation({
      deleteType: "payment-history",
      playerId: actionTarget.dataset.player,
      sessionId: actionTarget.dataset.session || "",
      activityId: actionTarget.dataset.activity || "",
      historyType: actionTarget.dataset.historyType || "",
      amount: actionTarget.dataset.amount || "",
      confirmLabel: "Reverse",
      title: "Reverse Payment",
      message: `Reverse this payment entry for ${playerName}? The amount will become due again and an audit record will remain.`
    });
    return;
  }
  if (action === "export-data") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ad-smashers-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Backup exported.");
  }
  render();
}

function handleInput(event) {
  const paymentsSearchInput = event.target.closest("[data-payments-search]");
  if (paymentsSearchInput) {
    const cursorPosition = paymentsSearchInput.selectionStart ?? paymentsSearchInput.value.length;
    uiState.paymentsSearch = paymentsSearchInput.value;
    saveUiState();
    render();
    const restoredInput = document.querySelector("[data-payments-search]");
    if (restoredInput) {
      restoredInput.focus({ preventScroll: true });
      restoredInput.setSelectionRange(cursorPosition, cursorPosition);
    }
    return;
  }
  const responseVote = event.target.closest("[data-response-vote]");
  if (responseVote) {
    updateResponseVote(responseVote.dataset.session, responseVote.dataset.response, responseVote.value);
    return;
  }
  const courtFeeInput = event.target.closest("[data-court-fee-input]");
  if (courtFeeInput) {
    courtFeeInput.dataset.manual = "true";
  }
  const expectedPlayersInput = event.target.closest("[data-expected-players-input]");
  if (expectedPlayersInput) {
    expectedPlayersInput.dataset.manual = "true";
  }
  const perPersonInput = event.target.closest("[data-per-person-input]");
  if (perPersonInput) {
    perPersonInput.dataset.manual = "true";
  }
  const recurrenceEndInput = event.target.closest("[data-session-recurrence-end]");
  if (recurrenceEndInput) recurrenceEndInput.dataset.manual = "true";
  const recurrenceSource = event.target.closest("[data-session-recurrence-source]");
  if (recurrenceSource) {
    updateSessionRecurrenceControls(recurrenceSource.closest('form[data-form="session"]'));
    return;
  }
  const defaultAutoToggle = event.target.closest("[data-session-default-auto]");
  if (defaultAutoToggle) {
    const form = defaultAutoToggle.closest('form[data-form="session-defaults"]');
    const controlledInput = form?.elements?.[defaultAutoToggle.dataset.controls];
    if (controlledInput) controlledInput.disabled = defaultAutoToggle.checked;
    return;
  }
  const halfHourTimeInput = event.target.closest("[data-half-hour-time]");
  if (halfHourTimeInput && halfHourTimeInput.value) {
    const normalizedTime = normalizeHalfHourTime(halfHourTimeInput.value, halfHourTimeInput.value);
    if (normalizedTime !== halfHourTimeInput.value) {
      halfHourTimeInput.value = normalizedTime;
    }
  }
  const sessionDateSource = event.target.closest("[data-session-date-source]");
  if (sessionDateSource) {
    applySessionDateDefaults(sessionDateSource.closest('form[data-form="session"]'));
    return;
  }
  const sessionCalculationSource = event.target.closest("[data-session-cost-source], [data-session-capacity-source], [data-session-rate-source], [data-court-fee-input]");
  if (sessionCalculationSource) {
    updateSessionModalCalculations(sessionCalculationSource.closest('form[data-form="session"]'));
    return;
  }
  const sessionField = event.target.closest("[data-session-field]");
  if (sessionField) {
    setSessionField(activeSessionId, sessionField.dataset.sessionField, sessionField.value);
    return;
  }
  const activityForm = event.target.closest('form[data-form="activity"]');
  if (activityForm) {
    captureActivityDraft(activityForm);
    return;
  }
  const groupPaymentForm = event.target.closest('form[data-form="group-payment"]');
  if (groupPaymentForm) {
    captureGroupPaymentDraft(groupPaymentForm);
    return;
  }
  const paymentGroupForm = event.target.closest('form[data-form="payment-group"]');
  if (paymentGroupForm) {
    capturePaymentGroupDraft(paymentGroupForm);
    return;
  }
  const paymentGroupGuestName = event.target.closest("[data-payment-group-guest-name]");
  if (paymentGroupGuestName) {
    updatePaymentGroupDraftGuestName(paymentGroupGuestName.dataset.paymentGroupGuestName, paymentGroupGuestName.value);
    return;
  }
  const sessionGuestNameInput = event.target.closest("[data-session-guest-name]");
  if (sessionGuestNameInput) {
    updateSessionGuestName(sessionGuestNameInput.dataset.session, sessionGuestNameInput.dataset.guestKey, sessionGuestNameInput.value);
    return;
  }
  const settingField = event.target.closest("[data-setting-field]");
  if (settingField) {
    state.settings[settingField.dataset.settingField] = settingField.type === "number" ? Number(settingField.value) : settingField.value;
    saveState();
    render();
    return;
  }
  const groupUrl = event.target.closest("[data-group-url]");
  if (groupUrl) {
    const group = state.groups.find((item) => item.id === groupUrl.dataset.groupUrl);
    group.url = groupUrl.value;
    saveState();
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const formType = form.dataset.form;
  const editId = form.dataset.editId || "";
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  if (formType === "session-defaults") {
    const fields = form.elements;
    const candidate = {
      ...state.settings,
      defaultSessionWeekday: fields.defaultSessionWeekday.value,
      defaultCourtId: fields.defaultCourtId.value,
      defaultPlayersPerCourt: fields.defaultPlayersPerCourt.value,
      defaultShuttleCost: fields.defaultShuttleCost.value,
      defaultFridayStartTime: fields.defaultFridayStartTime.value,
      defaultFridayEndTime: fields.defaultFridayEndTime.value,
      defaultFridayCourts: fields.defaultFridayCourts.value,
      defaultSaturdayStartTime: fields.defaultSaturdayStartTime.value,
      defaultSaturdayEndTime: fields.defaultSaturdayEndTime.value,
      defaultSaturdayCourts: fields.defaultSaturdayCourts.value,
      defaultFlexiDayStartTime: fields.defaultFlexiDayStartTime.value,
      defaultFlexiDayEndTime: fields.defaultFlexiDayEndTime.value,
      defaultFlexiDayCourts: fields.defaultFlexiDayCourts.value,
      autoCalculateCourtFee: fields.autoCalculateCourtFee.checked,
      defaultCourtFee: fields.defaultCourtFee.value,
      autoCalculatePerPersonRate: fields.autoCalculatePerPersonRate.checked,
      defaultPerPersonAmount: fields.defaultPerPersonAmount.value,
      defaultRecurrence: fields.defaultRecurrence.value
    };
    const validation = validateSessionSettingsCandidate(candidate);
    if (!validation.valid) {
      showToast(validation.message);
      return;
    }
    if (candidate.defaultCourtId && !state.courts.some((court) => court.id === candidate.defaultCourtId)) {
      showToast("Select an available default court.");
      return;
    }
    state.settings = validation.settings;
    saveState();
    render();
    showToast("Session defaults saved.");
    return;
  }

  if (formType === "login") {
    const email = String(data.email || "").trim();
    const password = String(data.password || "");
    loginError = "";
    authLoading = true;
    render();
    try {
      await signInToFirebase(email, password);
      cloudLoading = true;
      authLoading = false;
      render();
      state = await loadCloudState();
      loginError = "";
      cloudLoadFailed = false;
      showToast("Welcome back.");
      activeView = DEFAULT_VIEW;
      activeSessionId = state.sessions[0]?.id || null;
      activeSessionTab = DEFAULT_SESSION_TAB;
      cloudError = "";
      cloudLoading = false;
      render();
    } catch (error) {
      authLoading = false;
      cloudLoading = false;
      currentUser = null;
      cloudLoadFailed = false;
      loginError = error.message || "Could not sign in.";
      render();
    }
    return;
  }

  if (formType === "session") {
    const type = sessionTypeForDate(data.date, data.type);
    const groupId = sessionGroupIdFor({ date: data.date, type });
    const existingSession = editId ? getSession(editId) : null;
    const defaultTimes = sessionDefaultTimesForDate(data.date, type);
    const courtBookings = normalizeCourtSlots(sessionCourtSlotsFromForm(form));
    const slotValidation = validateCourtSlots(courtBookings);
    if (!slotValidation.valid) {
      showToast(slotValidation.message);
      return;
    }
    const courtSlots = slotValidation.slots;
    const startTime = normalizeHalfHourTime(courtSlots[0]?.startTime, defaultTimes.startTime);
    const endTime = normalizeHalfHourTime(courtSlots[courtSlots.length - 1]?.endTime, defaultTimes.endTime);
    const courts = courtSlotMaxCourts(courtSlots);
    const bookedCourts = courts;
    const playersPerCourt = Number(existingSession?.playersPerCourt || state.settings.defaultPlayersPerCourt || PLAYERS_PER_COURT);
    const expectedPlayers = expectedPlayersValue(data.expectedPlayers, bookedCourts, playersPerCourt);
    const totalPaid = existingSession
      ? Number(data.totalPaid || 0)
      : data.totalPaid === ""
        ? calculateCourtFeeForSlots(data.courtId, courtSlots)
        : Number(data.totalPaid || 0);
    const shuttleCost = data.shuttleCost === ""
      ? Number(existingSession?.shuttleCost ?? state.settings.defaultShuttleCost ?? 5)
      : Number(data.shuttleCost ?? existingSession?.shuttleCost ?? state.settings.defaultShuttleCost ?? 5);
    const waterCost = data.waterCost === "" ? 0 : Number(data.waterCost);
    if (!Number.isFinite(waterCost) || waterCost < 0) {
      showToast("Water Cost must be zero or more.");
      return;
    }
    const perPersonManual = form.elements.perPersonAmount?.dataset.manual === "true";
    const perPersonAmount = existingSession
      ? Number(data.perPersonAmount || 0)
      : perPersonRateValue(data.perPersonAmount, totalPaid, expectedPlayers, shuttleCost, perPersonManual);
    const sessionData = {
      type,
      date: data.date,
      startTime,
      endTime,
      courtBookings,
      groupId,
      courtId: data.courtId,
      plannedCourts: courts,
      bookedCourts,
      playersPerCourt,
      expectedPlayers,
      totalPaid,
      shuttleCost,
      waterCost,
      perPersonAmount,
      stage: normalizeStage(data.stage || existingSession?.stage || "Draft"),
      bookingStatus: bookedCourts > 0 ? "Pre-booked" : "Planned"
    };
    let session = existingSession;
    if (existingSession) {
      const changedFinancialBasis = sessionFinancialBasisChanged(existingSession, sessionData);
      if (changedFinancialBasis && sessionHasActiveFinancialState(existingSession)) {
        showToast("Clear active cash, Advance, or Credit coverage before changing this session's financial basis.");
        render();
        return;
      }
      Object.assign(existingSession, sessionData);
      delete existingSession.courtSlots;
      updateSessionPerPersonAmount(existingSession, sessionData.perPersonAmount);
      applyAutomaticSessionStage(existingSession);
      syncSessionPayments(existingSession);
      showToast("Session updated.");
    } else {
      const creation = buildNewSessionRecords(
        { ...sessionData, pollStatus: "Draft" },
        { frequency: data.recurrence || "none", endDate: data.recurrenceEndDate || "" },
        state.sessions
      );
      if (!creation.valid) {
        showToast(creation.message);
        return;
      }
      state.sessions.push(...creation.records);
      session = creation.records[0];
      showToast(creation.records.length === 1 ? "Session created." : `${creation.records.length} weekly sessions created.`);
    }
    activeSessionId = session.id;
    uiState.sessionWeekStart = weekStartIso(session.date);
    activeView = "sessions";
    activeSessionTab = DEFAULT_SESSION_TAB;
    modal = null;
    saveState();
  }

  if (formType === "poll-response") {
    const session = getSession();
    let playerId = data.playerId;
    if (data.newPlayerName.trim()) {
      const player = {
        ...playerSeed(data.newPlayerName.trim(), data.newPlayerName.trim(), session.type, DEFAULT_PAYMENT_METHOD),
        phone: "",
        whatsapp: ""
      };
      state.players.push(player);
      playerId = player.id;
    }
    const attendanceChoice = data.attendanceChoice;
    const guestCount =
      attendanceChoice === "in_plus_2" ? 2 : attendanceChoice === "in_plus_1" ? 1 : Number(data.guestCount || 0);
    const response = {
      id: createId("response"),
      playerId,
      voteOrder: Number(data.voteOrder),
      attendanceChoice,
      guestCount,
      racketNeeded: data.racketNeeded === "true",
      rawOptions: rawOptionsFor(attendanceChoice, data.racketNeeded === "true"),
      notes: ""
    };
    const duplicate = session.responses.some((item) => item.playerId === playerId);
    session.responses.push(response);
    renumberSessionResponses(session);
    syncSessionPayments(session);
    saveState();
    showToast(duplicate ? "Response added. Duplicate player flagged by name." : "Poll response added.");
  }

  if (formType === "session-player") {
    const session = getSession();
    const playerId = data.playerId;
    if (!playerId) {
      showToast("Select a player first.");
      render();
      return;
    }
    if (session.responses.some((item) => item.playerId === playerId)) {
      showToast("That player is already in this session.");
      render();
      return;
    }
    if (manualConfirmedPlayerIds(session).includes(playerId)) {
      showToast("Player is already confirmed.");
      render();
      return;
    }
    const guestCount = Number(data.guestCount || 0);
    const attendanceChoice = guestCount >= 2 ? "in_plus_2" : guestCount === 1 ? "in_plus_1" : "in";
    session.responses.push({
      id: createId("response"),
      playerId,
      voteOrder: Number(data.voteOrder || session.responses.length + 1),
      attendanceChoice,
      guestCount,
      racketNeeded: data.racketNeeded === "true",
      rawOptions: rawOptionsFor(attendanceChoice, data.racketNeeded === "true"),
      notes: ""
    });
    renumberSessionResponses(session);
    syncSessionPayments(session);
    saveState();
    showToast("Player added to this week's session.");
  }

  if (formType === "templates") {
    state.settings.pollTemplate = data.pollTemplate || defaultPollTemplate();
    state.settings.finalListTemplate = data.finalListTemplate || defaultFinalListTemplate();
    try {
      await saveStateNow();
      showToast("Templates saved.");
    } catch (error) {
      cloudError = error.message || "Could not save templates.";
      showToast("Could not save templates.");
    }
  }

  if (formType === "advance-payment") {
    const amountPaid = Number(data.amountPaid || 0);
    if (!data.playerId) {
      showToast("Select a player first.");
      render();
      return;
    }
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      showToast("Enter the advance amount.");
      render();
      return;
    }
    recordPlayerAdvance(data.playerId, amountPaid);
    saveState();
    showToast(`${currency(amountPaid)} advance added for ${getPlayerName(data.playerId)}.`);
  }

  if (formType === "player-payment") {
    const amountPaid = Number(data.amountPaid || 0);
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      showToast("Enter the amount paid.");
      render();
      return;
    }
    const result = applyPlayerPayment(data.playerId, amountPaid);
    saveState();
    if (result.applied > 0 || result.remaining > 0) {
      const appliedText = result.applied > 0 ? `Applied ${currency(result.applied)}.` : "";
      const creditText = result.remaining > 0 ? ` ${currency(result.remaining)} added as Credit.` : "";
      showToast(`${appliedText}${creditText}`.trim());
    } else {
      showToast("No pending amount for this player.");
    }
  }

  if (formType === "payment-group-payment") {
    const group = getPaymentGroup(data.groupId);
    const amountPaid = Number(data.amountPaid || 0);
    if (!group) {
      showToast("Payment group not found.");
      render();
      return;
    }
    if (!group.payerId) {
      showToast("Edit the group and select who paid.");
      render();
      return;
    }
    const playerIds = uniqueIds(group.playerIds || []).filter((playerId) => getPlayer(playerId)?.active !== false);
    if (!playerIds.length) {
      showToast("Edit the group and select players.");
      render();
      return;
    }
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      showToast("Enter the amount paid.");
      render();
      return;
    }
    const result = applyGroupPayment({ paidById: group.payerId, playerIds, amountPaid, groupId: group.id });
    saveState();
    const appliedText = result.applied > 0 ? `Applied ${currency(result.applied)}.` : "";
    const creditAddedText = result.remaining > 0 ? ` ${currency(result.remaining)} added as Credit for ${getPlayerName(group.payerId)}.` : "";
    showToast(`${appliedText}${creditAddedText}`.trim() || "No pending amount for this group.");
  }

  if (formType === "group-payment") {
    captureGroupPaymentDraft(form);
    const paidById = groupPaymentDraft.paidById;
    const playerIds = groupPaymentDraft.playerIds;
    const amountPaid = Number(groupPaymentDraft.amountPaid || 0);
    if (!paidById) {
      showToast("Select who paid.");
      render();
      return;
    }
    if (!playerIds.length) {
      showToast("Select players covered by this payment.");
      render();
      return;
    }
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      showToast("Enter the amount paid.");
      render();
      return;
    }
    let groupId = groupPaymentDraft.groupId || "";
    const saveAsGroupName = String(groupPaymentDraft.saveAsGroupName || "").trim();
    if (!groupId && saveAsGroupName) {
      const membershipConflicts = paymentGroupMembershipConflicts(playerIds, "", paidById);
      if (membershipConflicts.length) {
        const conflict = membershipConflicts[0];
        const names = conflict.playerIds.map(getPlayerName).join(", ");
        showToast(`${names} already ${conflict.playerIds.length === 1 ? "belongs" : "belong"} to ${conflict.group.name || "another payment group"}.`);
        render();
        return;
      }
      const savedGroup = normalizePaymentGroup({
        id: createId("payment-group"),
        name: saveAsGroupName,
        payerId: paidById,
        playerIds,
        guests: []
      });
      state.paymentGroups = state.paymentGroups || [];
      state.paymentGroups.push(savedGroup);
      groupId = savedGroup.id;
    }
    const result = applyGroupPayment({ paidById, playerIds, amountPaid, groupId });
    modal = null;
    groupPaymentDraft = createGroupPaymentDraft();
    saveState();
    const appliedText = result.applied > 0 ? `Applied ${currency(result.applied)}.` : "";
    const creditAddedText = result.remaining > 0 ? ` ${currency(result.remaining)} added as Credit for ${getPlayerName(paidById)}.` : "";
    showToast(`${appliedText}${creditAddedText}`.trim() || "No pending amount for the selected players.");
  }

  if (formType === "payment-group") {
    capturePaymentGroupDraft(form);
    const groupName = String(paymentGroupDraft.name || "").trim();
    if (!groupName) {
      showToast("Enter a group name.");
      render();
      return;
    }
    if (!paymentGroupDraft.payerId) {
      showToast("Select the default payer.");
      render();
      return;
    }
    if (!paymentGroupDraft.playerIds.length) {
      showToast("Select at least one group member.");
      render();
      return;
    }
    const existingGroup = paymentGroupDraft.id ? getPaymentGroup(paymentGroupDraft.id) : null;
    const membershipConflicts = paymentGroupMembershipConflicts(
      paymentGroupDraft.playerIds,
      existingGroup?.id || "",
      paymentGroupDraft.payerId
    );
    if (membershipConflicts.length) {
      const conflict = membershipConflicts[0];
      const names = conflict.playerIds.map(getPlayerName).join(", ");
      showToast(`${names} already ${conflict.playerIds.length === 1 ? "belongs" : "belong"} to ${conflict.group.name || "another payment group"}.`);
      render();
      return;
    }
    const groupData = normalizePaymentGroup({
      id: existingGroup?.id || createId("payment-group"),
      name: groupName,
      payerId: paymentGroupDraft.payerId,
      playerIds: paymentGroupDraft.playerIds,
      guests: paymentGroupDraft.guests,
      active: true
    });
    if (existingGroup) {
      Object.assign(existingGroup, groupData);
      showToast("Payment group updated.");
    } else {
      state.paymentGroups = state.paymentGroups || [];
      state.paymentGroups.push(groupData);
      showToast("Payment group added.");
    }
    syncSessionStages();
    paymentGroupDraft = createPaymentGroupDraft();
    modal = null;
    saveState();
  }

  if (formType === "partial-payment") {
    const session = getSession(data.sessionId);
    const amountPaid = Number(data.amountPaid || 0);
    if (savePaymentAmount(session, data.playerId, amountPaid)) {
      applyAutomaticSessionStage(session);
      modal = null;
      saveState();
    } else {
      render();
      return;
    }
  }

  if (formType === "activity") {
    captureActivityDraft(form);
    const playerIds = activityDraft.playerIds;
    const paidById = activityDraft.paidById;
    const totalPaid = Number(activityDraft.totalPaid || 0);
    const activityName = String(activityDraft.name || "").trim();
    if (!activityName) {
      showToast("Enter an activity name.");
      render();
      return;
    }
    if (!Number.isFinite(totalPaid) || totalPaid <= 0) {
      showToast("Enter the total paid.");
      render();
      return;
    }
    if (!paidById) {
      showToast("Select who paid.");
      render();
      return;
    }
    if (!playerIds.length) {
      showToast("Select at least one player.");
      render();
      return;
    }
    const existingActivity = activityDraft.id ? state.activities.find((item) => item.id === activityDraft.id) : null;
    const activity = normalizeActivity({
      id: existingActivity?.id || createId("activity"),
      name: activityName,
      date: activityDraft.date || new Date().toISOString().slice(0, 10),
      totalPaid,
      paidById,
      playerIds,
      notes: activityDraft.notes || "",
      shares: JSON.parse(JSON.stringify(existingActivity?.shares || {}))
    });
    if (existingActivity) {
      const changedFinancialBasis = String(existingActivity.date || "") !== String(activity.date || "")
        || Number(existingActivity.totalPaid || 0) !== Number(activity.totalPaid || 0)
        || String(existingActivity.paidById || "") !== String(activity.paidById || "")
        || uniqueIds(existingActivity.playerIds || []).join("|") !== uniqueIds(activity.playerIds || []).join("|");
      if (changedFinancialBasis && activityHasActiveFinancialState(existingActivity)) {
        showToast("Clear active cash, Advance, or Credit coverage before changing this activity split.");
        render();
        return;
      }
      state.activities = state.activities.map((item) => (item.id === existingActivity.id ? activity : item));
    } else {
      state.activities.push(activity);
    }
    activityDraft = createActivityDraft();
    modal = null;
    saveState();
    showToast(existingActivity ? "Activity updated." : "Activity added.");
  }

  if (formType === "court") {
    const existingCourt = editId ? getCourt(editId) : null;
    const contactNumber = data.phone || "";
    const courtData = {
      name: data.name || "New court",
      area: data.area || "",
      contact: data.contact || "",
      phone: contactNumber,
      whatsapp: contactNumber,
      location: data.location || "",
      playoLink: data.playoLink || "",
      aedPerHour: Number(data.aedPerHour || 0),
      bookingMethod: data.bookingMethod || "WhatsApp",
      notes: data.notes || ""
    };
    let savedCourt = existingCourt;
    if (existingCourt) {
      delete existingCourt.courtsAvailable;
      delete existingCourt.typicalRate;
      delete existingCourt.preferredSlots;
      Object.assign(existingCourt, courtData);
      state.sessions.filter((session) => session.courtId === existingCourt.id).forEach((session) => applyBookingStage(session, true));
      showToast("Court updated.");
    } else {
      savedCourt = {
        id: createId("court"),
        ...courtData
      };
      state.courts.push(savedCourt);
      showToast("Court added.");
    }
    modal = null;
    saveState();
  }

  if (formType === "player-role") {
    const role = form.dataset.role || "organizer";
    const config = playerRoleConfig(role);
    const playerId = data.playerId || "";
    if (state.settings?.[config.field] !== playerId && state.sessions.some((session) => sessionHasActiveFinancialState(session))) {
      showToast("Clear active cash, Advance, or Credit coverage before changing organizer roles.");
      render();
      return;
    }
    state.settings[config.field] = playerId;
    if (playerId) {
      ["organizer", "coOrganizer"].forEach((otherRole) => {
        const otherConfig = playerRoleConfig(otherRole);
        if (otherConfig.field !== config.field && state.settings[otherConfig.field] === playerId) {
          state.settings[otherConfig.field] = "";
        }
      });
    }
    state.sessions.forEach((session) => syncSessionPayments(session));
    modal = null;
    saveState();
    showToast(playerId ? `${config.label} updated.` : `${config.label} cleared.`);
  }

  if (formType === "player") {
    const existingPlayer = editId ? getPlayer(editId) : null;
    const contactNumber = data.phone || "";
    const playerData = {
      name: data.name || "New player",
      displayName: data.name || "New player",
      phone: contactNumber,
      whatsapp: contactNumber,
      preferredDays: data.preferredDays || "",
      skillLevel: normalizeSkillLevel(data.skillLevel),
      racketOwned: data.racketOwned || DEFAULT_RACKET_OWNED,
      usuallyNeedsRacket: (data.racketOwned || DEFAULT_RACKET_OWNED) === "No",
      paymentMethod: normalizePaymentMethod(data.paymentMethod),
      attendanceCount: 0,
      noShowCount: 0,
      pendingBalance: 0,
      notes: data.notes || "",
      active: true
    };
    let savedPlayer = existingPlayer;
    if (existingPlayer) {
      Object.assign(existingPlayer, {
        ...playerData,
        attendanceCount: existingPlayer.attendanceCount || 0,
        noShowCount: existingPlayer.noShowCount || 0,
        pendingBalance: existingPlayer.pendingBalance || 0
      });
      showToast("Player updated.");
    } else {
      savedPlayer = {
        id: createId("player"),
        ...playerData
      };
      state.players.push(savedPlayer);
      showToast("Player added.");
    }
    state.sessions.forEach((session) => syncSessionPayments(session));
    modal = null;
    saveState();
  }

  render();
}

function handleChange(event) {
  if (event.target.matches('[data-action="import-data"]')) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        state = restoreStateFromBackup(JSON.parse(reader.result));
        activeSessionId = state.sessions[0]?.id || null;
        activeSessionTab = DEFAULT_SESSION_TAB;
        modal = null;
        await saveStateNow();
        showToast("Backup imported.");
        render();
      } catch (error) {
        showToast("Could not import JSON.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
    return;
  }
  handleInput(event);
}
