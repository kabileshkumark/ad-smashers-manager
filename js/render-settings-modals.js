function renderSettings() {
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Settings</h1>
          <p class="page-kicker">WhatsApp shortcuts, message templates, and app data controls.</p>
        </div>
      </div>
      <section class="panel app-update-panel">
        <div class="section-heading app-update-heading">
          <div>
            <h2>App Update</h2>
            <p>Load the latest deployed app files on this device.</p>
          </div>
          <button class="btn primary icon-only app-update-button" type="button" data-action="check-app-update" aria-label="Check for Update" title="Check for Update">${icon("refresh")}</button>
        </div>
        <div class="app-update-meta">
          <p>Last updated: ${escapeHtml(formatDateTime(uiState.appLastUpdatedAt))}</p>
          <p>Version: ${escapeHtml(APP_VERSION)}</p>
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>App Data Backup</h2>
            <p>Export or restore the Firestore app data using a JSON backup.</p>
          </div>
        </div>
        <div class="toolbar">
          <button class="btn primary" type="button" data-action="export-data">Export JSON</button>
          <label class="btn">
            Import JSON
            <input class="visually-hidden" type="file" accept="application/json" data-action="import-data" />
          </label>
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Session Defaults</h2>
            <p>Used when creating a new session.</p>
          </div>
        </div>
        <div class="form-grid two">
          ${settingsField("defaultPlayersPerCourt", "Players per Court", "number", state.settings.defaultPlayersPerCourt || PLAYERS_PER_COURT, 'min="1" step="1"')}
          ${settingsField("defaultShuttleCost", "Shuttle Fee", "number", state.settings.defaultShuttleCost ?? 5, 'min="0" step="1"')}
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>WhatsApp Groups</h2>
            <p>These links only open WhatsApp. Messages are copied for you to paste manually.</p>
          </div>
        </div>
        ${settingsGroups().map((group) => `
          <label class="field">
            <span>${escapeHtml(group.name)}</span>
            <input class="input" data-group-url="${escapeAttr(group.id)}" value="${escapeAttr(group.url)}" />
          </label>
        `).join("")}
      </section>
      ${renderTemplateSettingsSection()}
    </section>
  `;
}

function renderModal() {
  if (!modal) return "";
  const modalType = typeof modal === "string" ? modal : modal.type;
  const modalPayload = typeof modal === "string" ? {} : modal;
  const modalId = typeof modal === "string" ? "" : modal.id;
  if (modalType === "session") return renderSessionModal(modalId);
  if (modalType === "sessionPlayers") return renderSessionPlayersModal(modalId);
  if (modalType === "sessionAttendance") return renderSessionAttendanceModal(modalId);
  if (modalType === "sessionStage") return renderSessionStageModal(modalId);
  if (modalType === "activity") return renderActivityModal();
  if (modalType === "activityDetails") return renderActivityDetailsModal(modalPayload.activityId || modalId);
  if (modalType === "shuttlePurchase") return renderShuttlePurchaseModal();
  if (modalType === "activityPlayers") return renderActivityPlayersModal();
  if (modalType === "groupPayment") return renderGroupPaymentModal();
  if (modalType === "groupPaymentPlayers") return renderPaymentPlayerPickerModal("groupPayment");
  if (modalType === "paymentGroup") return renderPaymentGroupModal();
  if (modalType === "paymentGroupPlayers") return renderPaymentPlayerPickerModal("paymentGroup");
  if (modalType === "paymentHistory") return renderPaymentHistoryModal(modalPayload.playerId || modalId);
  if (modalType === "groupPaymentHistory") return renderGroupPaymentHistoryModal(modalPayload.groupId || modalId);
  if (modalType === "shuttleSpentHistory") return renderShuttleSpentHistoryModal();
  if (modalType === "advanceDetails") return renderAdvanceDetailsModal(modalPayload.playerId || modalId);
  if (modalType === "advanceHistory") return renderAdvanceHistoryModal(modalPayload.playerId || modalId);
  if (modalType === "playerPaymentDetails" || modalType === "playerPaymentCopy") return renderPlayerPaymentDetailsModal(modalPayload.playerId || modalId);
  if (modalType === "paymentGroupCopy") return renderPaymentGroupCopyModal(modalPayload.groupId || modalId);
  if (modalType === "partialPayment") return renderPartialPaymentModal(modalPayload.sessionId || modalId, modalPayload.playerId);
  if (modalType === "confirmDelete") return renderDeleteConfirmModal(modalPayload);
  if (modalType === "court") return renderCourtModal(modalId);
  if (modalType === "player") return renderPlayerModal(modalId);
  if (modalType === "playerRole") return renderPlayerRoleModal(modalPayload.role || "organizer");
  return "";
}

function renderDeleteConfirmModal(config = {}) {
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="delete-confirm-title">${escapeHtml(config.title || "Delete")}</h2>
            <p>${escapeHtml(config.message || "This action cannot be undone.")}</p>
          </div>
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="cancel-delete">Cancel</button>
          <button class="btn danger" type="button" data-action="confirm-delete" data-delete-type="${escapeAttr(config.deleteType || "")}" data-session="${escapeAttr(config.sessionId || "")}" data-court="${escapeAttr(config.courtId || "")}" data-player="${escapeAttr(config.playerId || "")}" data-response="${escapeAttr(config.responseId || "")}" data-guest-key="${escapeAttr(config.guestKey || "")}" data-activity="${escapeAttr(config.activityId || "")}" data-payment-group="${escapeAttr(config.paymentGroupId || "")}" data-transaction="${escapeAttr(config.transactionId || "")}" data-history-type="${escapeAttr(config.historyType || "")}" data-amount="${escapeAttr(config.amount || "")}">${escapeHtml(config.confirmLabel || "Delete")}</button>
        </div>
      </div>
    </div>
  `;
}

function renderPlayerRoleModal(role = "organizer") {
  const config = playerRoleConfig(role);
  const currentPlayerId = state.settings?.[config.field] || "";
  const players = activePlayersAlphabetical();
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card confirm-modal" data-form="player-role" data-role="${escapeAttr(role)}" role="dialog" aria-modal="true" aria-labelledby="player-role-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="player-role-modal-title">${escapeHtml(config.label)}</h2>
            <p>This player will not be charged for session games.</p>
          </div>
        </div>
        <label class="field">
          <span>Player</span>
          <select class="select" name="playerId" ${players.length ? "" : "disabled"}>
            <option value="" ${currentPlayerId ? "" : "selected"}>Not set</option>
            ${players.map((player) => `<option value="${escapeAttr(player.id)}" ${player.id === currentPlayerId ? "selected" : ""}>${escapeHtml(player.name || player.displayName || "Player")}</option>`).join("")}
          </select>
        </label>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="close-modal">Cancel</button>
          <button class="btn primary" type="submit">${currentPlayerId ? "Save" : "Assign"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderPaymentHistoryModal(playerId = "") {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  const items = playerPaymentCorrectionItems(playerId);
  const transactions = playerPaymentTransactions(playerId);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="payment-history-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="payment-history-modal-title">Payment History</h2>
            <p>${escapeHtml(playerName)}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="payment-history-list">
          ${transactions.length ? `<h3 class="mini-title">Transactions</h3>${transactions.map((transaction) => renderPlayerPaymentTransactionItem(playerId, transaction)).join("")}` : ""}
          ${
            items.length
              ? `${transactions.length ? `<h3 class="mini-title">Current Records</h3>` : ""}${items.map((item) => renderPaymentHistoryItem(playerId, item)).join("")}`
              : transactions.length ? "" : `<div class="empty">No recorded payments yet.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderPlayerPaymentTransactionItem(playerId, transaction) {
  const isActive = paymentTransactionIsActive(transaction);
  const isMigrated = transaction.status === "migrated";
  const canReverse = isActive
    && !isMigrated
    && transaction.paidById === playerId
    && ["advance-payment", "group-payment", "player-payment"].includes(transaction.type);
  const group = getPaymentGroup(transaction.groupId);
  const session = transaction.sessionId ? getSession(transaction.sessionId) : null;
  const activity = transaction.activityId ? (state.activities || []).find((item) => item.id === transaction.activityId) : null;
  const title = transaction.type === "advance-payment"
    ? "Advance Payment"
    : transaction.type === "player-payment"
      ? "Player Payment"
      : transaction.type === "group-payment"
        ? group?.name || "Group Payment"
        : transaction.type === "session-payment-adjustment"
          ? `${session ? formatDate(session.date) : "Session"} Adjustment`
          : `${activity?.name || "Activity"} Adjustment`;
  let detail = `Cash ${currency(transaction.amountPaid)}, applied ${currency(transaction.appliedAmount)}`;
  if (transaction.type === "advance-payment") {
    detail = `Advance received ${currency(transaction.amountPaid)}`;
  } else if (transaction.type === "session-payment-adjustment" || transaction.type === "activity-payment-adjustment") {
    const previousTotal = Number(transaction.previousPayment?.paidAmount || 0) + Number(transaction.previousPayment?.advanceAmount || 0);
    const nextTotal = Number(transaction.nextPayment?.paidAmount || 0) + Number(transaction.nextPayment?.advanceAmount || 0);
    detail = `Recorded amount changed from ${currency(previousTotal)} to ${currency(nextTotal)}`;
  } else if (Number(transaction.advanceAmount || 0) > 0) {
    detail += `, Credit created ${currency(transaction.advanceAmount)}`;
  }
  if (!isActive) detail += ", transaction reversed";
  if (isMigrated) detail += `, ${currency(transaction.migratedCreditAmount)} corrected to canonical Credit`;
  return `
    <article class="row-card payment-history-item payment-transaction-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(title)}</h3>
          <p class="row-subtitle">${escapeHtml(formatDate(transaction.date))} - ${escapeHtml(detail)}</p>
        </div>
        <div class="toolbar nowrap">
          <span class="badge ${isActive && !isMigrated ? "green" : "gold"}">${!isActive ? "Reversed" : isMigrated ? "Migrated" : currency(transaction.amountPaid)}</span>
          ${canReverse ? `<button class="btn icon-only danger" type="button" data-action="delete-payment-transaction" data-transaction="${escapeAttr(transaction.id)}" aria-label="Reverse ${escapeAttr(title)}" title="Reverse">${icon("trash")}</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderPlayerPaymentDetailsModal(playerId = "") {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="player-payment-details-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="player-payment-details-title">Payment Details</h2>
            <p>${escapeHtml(playerName)}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="toolbar">
          <button class="btn primary" type="button" data-action="copy-player-payment-history" data-player="${escapeAttr(playerId)}">Copy Full History</button>
          <button class="btn" type="button" data-action="copy-player-due-history" data-player="${escapeAttr(playerId)}">Copy Due History</button>
        </div>
      </div>
    </div>
  `;
}

const renderPlayerPaymentCopyModal = renderPlayerPaymentDetailsModal;

function renderPaymentGroupCopyModal(groupId = "") {
  const group = getPaymentGroup(groupId);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="payment-group-copy-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="payment-group-copy-title">Copy Payment</h2>
            <p>${escapeHtml(group?.name || "Payment group")}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="toolbar">
          <button class="btn primary" type="button" data-action="copy-payment-group-history" data-payment-group="${escapeAttr(groupId)}">Copy Full History</button>
          <button class="btn" type="button" data-action="copy-payment-group-due-history" data-payment-group="${escapeAttr(groupId)}">Copy Due History</button>
        </div>
      </div>
    </div>
  `;
}

function renderPaymentHistoryItem(playerId, item) {
  const amount = paymentHistoryAmount(item);
  const subtitle = item.advanceAmount
    ? `${currency(item.paidAmount)} paid, ${currency(item.advanceAmount)} Credit created`
    : currency(amount);
  const dateText = item.date ? formatDate(item.date) : item.type === "credit" ? "Current Credit" : "Manual payment";
  const transactionBacked = item.type === "session"
    ? paymentHasActiveTransactionAllocation(item.id, playerId)
    : item.type === "activity" && activityShareHasActiveTransactionAllocation(item.id, playerId);
  const canReverse = item.type !== "credit" && !transactionBacked;
  return `
    <article class="row-card payment-history-item">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(item.label)}</h3>
          <p class="row-subtitle">${escapeHtml(dateText)} - ${escapeHtml(subtitle)}</p>
        </div>
        ${canReverse ? `<button class="btn icon-only danger" type="button" data-action="delete-payment-history" data-player="${escapeAttr(playerId)}" data-history-type="${escapeAttr(item.type)}" data-session="${escapeAttr(item.type === "session" ? item.id : "")}" data-activity="${escapeAttr(item.type === "activity" ? item.id : "")}" data-amount="${escapeAttr(amount)}" aria-label="Reverse ${escapeAttr(item.label)} payment" title="Reverse">${icon("trash")}</button>` : ""}
      </div>
    </article>
  `;
}

function renderPartialPaymentModal(sessionId = "", playerId = "") {
  const session = getSession(sessionId);
  const payment = session?.payments?.[playerId];
  if (!session || !payment) return "";
  const playerName = paymentPlayerName(payment);
  const amountDue = paymentDueAmount(payment, session);
  const currentAmount = Number(payment.paidAmount || 0) + Number(payment.advanceAmount || 0);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card" data-form="partial-payment" role="dialog" aria-modal="true" aria-labelledby="partial-payment-modal-title">
        <input type="hidden" name="sessionId" value="${escapeAttr(session.id)}" />
        <input type="hidden" name="playerId" value="${escapeAttr(playerId)}" />
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="partial-payment-modal-title">Payment</h2>
            <p>${escapeHtml(playerName)} - ${currency(amountDue)} due</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <label class="field">
          <span>Amount Paid</span>
          <input class="input" type="number" name="amountPaid" min="0" step="0.01" value="${escapeAttr(currentAmount || "")}" autofocus />
        </label>
        <p class="row-subtitle">If the amount is more than ${currency(amountDue)}, the extra will be added as Credit on the Payments page.</p>
        <div class="toolbar">
          <button class="btn primary" type="submit">Save Payment</button>
        </div>
      </form>
    </div>
  `;
}

function renderActivityPlayersModal() {
  const selectedIds = new Set(activityDraft.playerIds);
  const selectedPlayers = activityDraft.playerIds.map((id) => getPlayer(id)).filter((player) => player && player.active !== false);
  const availablePlayers = activePlayersAlphabetical().filter((player) => !selectedIds.has(player.id));
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card session-players-modal" role="dialog" aria-modal="true" aria-labelledby="activity-players-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="activity-players-modal-title">Players</h2>
            <p>Tap players to add them to this activity split.</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="quick-player-layout">
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Available Players</h3>
                <p>${availablePlayers.length} available</p>
              </div>
            </div>
            <div class="quick-player-list" data-modal-scroll="activity-available-players">
              ${
                availablePlayers.length
                  ? availablePlayers
                      .map(
                        (player) => `
                          <button class="quick-player-option" type="button" data-action="activity-add-player" data-player="${escapeAttr(player.id)}">
                            <span>${escapeHtml(player.name || player.displayName || "Player")}</span>
                            <small>${escapeHtml(normalizeSkillLevel(player.skillLevel))}</small>
                          </button>
                        `
                      )
                      .join("")
                  : `<div class="empty">All saved players are already selected.</div>`
              }
            </div>
          </section>
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Split List</h3>
                <p>${selectedPlayers.length} selected</p>
              </div>
            </div>
            <div class="quick-vote-list" data-modal-scroll="activity-split-list">
              ${
                selectedPlayers.length
                  ? selectedPlayers
                      .map(
                        (player, index) => `
                          <div class="quick-vote-item">
                            <span>${index + 1}. ${escapeHtml(player.name || player.displayName || "Player")}</span>
                            <button class="btn icon-only danger" type="button" data-action="activity-remove-player" data-player="${escapeAttr(player.id)}" aria-label="Remove ${escapeAttr(player.name || player.displayName || "Player")}" title="Remove">${icon("trash")}</button>
                          </div>
                        `
                      )
                      .join("")
                  : `<div class="empty">No players selected for this activity yet.</div>`
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderPaymentPlayerPickerModal(kind = "groupPayment") {
  const isSavedGroup = kind === "paymentGroup";
  const draft = isSavedGroup ? paymentGroupDraft : groupPaymentDraft;
  const selectedIds = new Set(draft.playerIds);
  const selectedPlayers = draft.playerIds.map((id) => getPlayer(id)).filter((player) => player && player.active !== false);
  const selectedGuests = isSavedGroup ? normalizePaymentGroupGuests(draft.guests || []) : [];
  const selectedCount = selectedPlayers.length + selectedGuests.length;
  const availablePlayers = activePlayersAlphabetical().filter((player) => !selectedIds.has(player.id));
  const addAction = isSavedGroup ? "payment-group-add-player" : "group-payment-add-player";
  const removeAction = isSavedGroup ? "payment-group-remove-player" : "group-payment-remove-player";
  const availableScroll = isSavedGroup ? "payment-group-available-players" : "group-payment-available-players";
  const selectedScroll = isSavedGroup ? "payment-group-selected-players" : "group-payment-selected-players";
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card session-players-modal" role="dialog" aria-modal="true" aria-labelledby="payment-players-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="payment-players-modal-title">Players</h2>
            <p>${isSavedGroup ? "Tap players to add them to this saved group." : "Tap players covered by this payment."}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="quick-player-layout">
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Available Players</h3>
                <p>${availablePlayers.length} available</p>
              </div>
            </div>
            <div class="quick-player-list" data-modal-scroll="${escapeAttr(availableScroll)}">
              ${
                availablePlayers.length
                  ? availablePlayers
                      .map(
                        (player) => `
                          <button class="quick-player-option" type="button" data-action="${escapeAttr(addAction)}" data-player="${escapeAttr(player.id)}">
                            <span>${escapeHtml(player.name || player.displayName || "Player")}</span>
                            <small>${escapeHtml(normalizeSkillLevel(player.skillLevel))}</small>
                          </button>
                        `
                      )
                      .join("")
                  : `<div class="empty">All saved players are already selected.</div>`
              }
            </div>
          </section>
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>${isSavedGroup ? "Group Members" : "Covered Players"}</h3>
                <p>${selectedCount} selected</p>
              </div>
            </div>
            <div class="quick-vote-list" data-modal-scroll="${escapeAttr(selectedScroll)}">
              ${
                selectedCount
                  ? isSavedGroup
                    ? renderPaymentGroupSelectedMembers(selectedPlayers, selectedGuests, removeAction)
                    : selectedPlayers
                        .map(
                          (player, index) => `
                            <div class="quick-vote-item">
                              <span>${index + 1}. ${escapeHtml(player.name || player.displayName || "Player")}</span>
                              <button class="btn icon-only danger" type="button" data-action="${escapeAttr(removeAction)}" data-player="${escapeAttr(player.id)}" aria-label="Remove ${escapeAttr(player.name || player.displayName || "Player")}" title="Remove">${icon("trash")}</button>
                            </div>
                          `
                        )
                        .join("")
                  : `<div class="empty">No players selected yet.</div>`
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderPaymentGroupSelectedMembers(selectedPlayers, selectedGuests, removeAction) {
  const selectedIds = new Set(selectedPlayers.map((player) => player.id));
  const memberRows = selectedPlayers.flatMap((player, index) => {
    const playerName = player.name || player.displayName || "Player";
    const playerGuests = selectedGuests.filter((guest) => guest.ownerPlayerId === player.id);
    return [
      `
        <div class="quick-vote-item quick-vote-item-with-add payment-group-member-item">
          <span>${index + 1}. ${escapeHtml(playerName)}</span>
          <button class="btn icon-only" type="button" data-action="payment-group-add-guest" data-player="${escapeAttr(player.id)}" aria-label="Add guest for ${escapeAttr(playerName)}" title="Add guest">${icon("plus")}</button>
          <button class="btn icon-only danger" type="button" data-action="${escapeAttr(removeAction)}" data-player="${escapeAttr(player.id)}" aria-label="Remove ${escapeAttr(playerName)}" title="Remove">${icon("trash")}</button>
        </div>
      `,
      ...playerGuests.map((guest, guestIndex) => renderPaymentGroupGuestItem(guest, `${playerName} Guest ${guestIndex + 1}`))
    ];
  });
  const orphanGuests = selectedGuests
    .filter((guest) => !guest.ownerPlayerId || !selectedIds.has(guest.ownerPlayerId))
    .map((guest, index) => renderPaymentGroupGuestItem(guest, `Guest ${index + 1}`));
  return [...memberRows, ...orphanGuests].join("");
}

function renderPaymentGroupGuestItem(guest, fallbackName) {
  const guestName = String(guest.name || "").trim() || fallbackName;
  return `
    <div class="quick-vote-item payment-group-guest-item">
      <label class="field compact-field">
        <span class="visually-hidden">Guest name</span>
        <input class="input" type="text" data-payment-group-guest-name="${escapeAttr(guest.id)}" value="${escapeAttr(guestName)}" placeholder="${escapeAttr(fallbackName)}" />
      </label>
      <button class="btn icon-only danger" type="button" data-action="payment-group-remove-guest" data-guest="${escapeAttr(guest.id)}" aria-label="Remove ${escapeAttr(guestName)}" title="Remove">${icon("trash")}</button>
    </div>
  `;
}

function renderSessionPlayersModal(sessionId = "") {
  const session = getSession(sessionId);
  if (!session) return "";
  const responses = [...(session.responses || [])].sort((a, b) => Number(a.voteOrder) - Number(b.voteOrder));
  const addedIds = new Set(responses.map((response) => response.playerId));
  const manuallyConfirmedIds = new Set(manualConfirmedPlayerIds(session));
  const availablePlayers = state.players
    .filter((player) => player.active !== false && !addedIds.has(player.id) && !manuallyConfirmedIds.has(player.id))
    .sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || ""));
  const selectedCount = sessionVoteParticipantCount(responses);
  const nextVoteOrder = selectedCount + 1;
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card session-players-modal" role="dialog" aria-modal="true" aria-labelledby="session-players-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="session-players-modal-title">Vote Order</h2>
            <p>${escapeHtml(session.type)} - ${escapeHtml(formatDate(session.date))}. WhatsApp poll voters.</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="quick-player-layout">
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Available Players</h3>
                <p>Next vote number is ${nextVoteOrder}. Players default to I'm in.</p>
              </div>
            </div>
            <div class="quick-player-list" data-modal-scroll="session-available-players">
              ${
                availablePlayers.length
                  ? availablePlayers
                      .map(
                        (player) => `
                          <button class="quick-player-option" type="button" data-action="quick-add-session-player" data-session="${escapeAttr(session.id)}" data-player="${escapeAttr(player.id)}">
                            <span>${escapeHtml(player.name || player.displayName || "Player")}</span>
                            <small>${escapeHtml(normalizeSkillLevel(player.skillLevel))}</small>
                          </button>
                        `
                      )
                      .join("")
                  : `<div class="empty">All available voters are already added.</div>`
              }
            </div>
          </section>
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Voter List</h3>
                <p>${selectedCount} selected</p>
              </div>
            </div>
            <div class="quick-vote-list" data-vote-reorder-list data-modal-scroll="session-vote-order">
              ${
                responses.length
                  ? renderSessionVoteOrderItems(session, responses)
                  : `<div class="empty">No players selected for this session yet.</div>`
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function sessionVoteParticipantCount(responses = []) {
  return responses.reduce((total, response) => total + 1 + Math.max(0, Math.floor(Number(response.guestCount || 0))), 0);
}

function renderSessionVoteOrderItems(session, responses) {
  let participantNumber = 1;
  return responses
    .map((response, index) => {
      const playerName = getPlayerName(response.playerId);
      const playerNumber = participantNumber;
      const guestCount = Math.max(0, Math.floor(Number(response.guestCount || 0)));
      const guestItems = renderSessionPlayerGuestItems(session, response, playerNumber + 1);
      participantNumber += 1 + guestCount;
      return `
        <div class="quick-vote-response-group" data-vote-response-group data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}">
          <div class="quick-vote-item reorderable quick-vote-item-with-add">
            <div class="quick-vote-reorder" aria-label="Move ${escapeAttr(playerName)} in voter list">
              <button class="btn icon-only" type="button" data-action="move-response-up" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeAttr(playerName)} up" title="Move up">${icon("arrowUp")}</button>
              <button class="btn icon-only" type="button" data-action="move-response-down" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" ${index === responses.length - 1 ? "disabled" : ""} aria-label="Move ${escapeAttr(playerName)} down" title="Move down">${icon("arrowDown")}</button>
            </div>
            <span class="quick-vote-name">${playerNumber}. ${escapeHtml(playerName)}</span>
            <button class="btn icon-only" type="button" data-action="add-response-guest" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" aria-label="Add guest for ${escapeAttr(playerName)}" title="Add guest">${icon("plus")}</button>
            <button class="btn icon-only danger" type="button" data-action="delete-response" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" aria-label="Remove ${escapeAttr(playerName)}" title="Remove">${icon("trash")}</button>
          </div>
          ${guestItems}
        </div>
      `;
    })
    .join("");
}

function renderSessionPlayerGuestItems(session, response, startNumber = Number(response.voteOrder || 0) + 1) {
  const playerName = getPlayerName(response.playerId);
  return Array.from({ length: Number(response.guestCount || 0) }, (_, index) => {
    const guestIndex = index + 1;
    const guestNumber = startNumber + index;
    const guestKey = `${response.id}-guest-${guestIndex}`;
    const fallbackName = `${playerName} Guest ${guestIndex}`;
    const guestName = sessionGuestName(session, guestKey, fallbackName);
    return `
      <div class="quick-vote-item quick-vote-item-guest">
        <span class="quick-vote-guest-number">${guestNumber}.</span>
        <label class="field compact-field quick-vote-name-field">
          <span class="visually-hidden">Guest ${guestNumber} name</span>
          <input class="input" type="text" data-session-guest-name data-session="${escapeAttr(session.id)}" data-guest-key="${escapeAttr(guestKey)}" value="${escapeAttr(guestName)}" placeholder="${escapeAttr(fallbackName)}" />
        </label>
        <button class="btn icon-only danger" type="button" data-action="remove-response-guest" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" aria-label="Remove ${escapeAttr(guestName)}" title="Remove guest">${icon("trash")}</button>
      </div>
    `;
  }).join("");
}

function renderSessionAttendanceModal(sessionId = "") {
  const session = getSession(sessionId);
  if (!session) return "";
  const attendedEntries = effectiveAttendedEntries(session);
  const attendedPlayerIds = effectiveAttendedPlayerIds(session);
  const attendedSet = new Set(attendedPlayerIds);
  const availablePlayers = state.players
    .filter((player) => player.active !== false && !attendedSet.has(player.id))
    .sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || ""));
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card session-players-modal" role="dialog" aria-modal="true" aria-labelledby="session-attendance-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="session-attendance-modal-title">Confirmed Players</h2>
            <p>${escapeHtml(session.type)} - ${escapeHtml(formatDate(session.date))}. ${currency(session.perPersonAmount)} per person.</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="quick-player-layout">
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Available Players</h3>
                <p>${availablePlayers.length} available</p>
              </div>
            </div>
            <div class="quick-player-list" data-modal-scroll="attendance-available-players">
              ${
                availablePlayers.length
                  ? availablePlayers
                      .map(
                        (player) => `
                          <button class="quick-player-option" type="button" data-action="attendance-add-player" data-session="${escapeAttr(session.id)}" data-player="${escapeAttr(player.id)}">
                            <span>${escapeHtml(player.name || player.displayName || "Player")}</span>
                            <small>${escapeHtml(normalizeSkillLevel(player.skillLevel))}</small>
                          </button>
                        `
                      )
                      .join("")
                  : `<div class="empty">All saved players are already attended.</div>`
              }
            </div>
          </section>
          <section class="quick-player-section">
            <div class="section-heading compact">
              <div>
                <h3>Confirmed Players</h3>
                <p>${attendedEntries.length} confirmed</p>
              </div>
            </div>
            <div class="quick-vote-list" data-modal-scroll="attendance-selected-players">
              ${
                attendedEntries.length
                  ? attendedEntries.map((entry, index) => renderAttendanceEntry(session, entry, index)).join("")
                  : `<div class="empty">No confirmed players added yet.</div>`
              }
            </div>
          </section>
        </div>
      </div>
    </div>
  `;
}

function renderAttendanceEntry(session, entry, index) {
  const removeAction = entry.guest ? "attendance-remove-guest" : "attendance-remove-player";
  const label = entry.name;
  const canAddGuest = !entry.guest;
  const addGuestAction = "add-manual-attendance-guest";
  const rowClass = entry.guest ? "quick-vote-item-guest" : canAddGuest ? "quick-vote-item-with-add" : "";
  return `
    <div class="quick-vote-item ${rowClass}">
      ${
        entry.guest
          ? `
            <span class="quick-vote-guest-number">${index + 1}.</span>
            <label class="field compact-field quick-vote-name-field">
              <span class="visually-hidden">Guest ${index + 1} name</span>
              <input class="input" type="text" data-session-guest-name data-session="${escapeAttr(session.id)}" data-guest-key="${escapeAttr(entry.key)}" value="${escapeAttr(label)}" placeholder="${escapeAttr(label)}" />
            </label>
          `
          : `<span>${index + 1}. ${escapeHtml(label)}</span>`
      }
      ${canAddGuest ? `<button class="btn icon-only" type="button" data-action="${escapeAttr(addGuestAction)}" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(entry.responseId)}" data-player="${escapeAttr(entry.playerId)}" aria-label="Add guest for ${escapeAttr(label)}" title="Add guest">${icon("plus")}</button>` : ""}
      <button class="btn icon-only danger" type="button" data-action="${escapeAttr(removeAction)}" data-session="${escapeAttr(session.id)}" data-player="${escapeAttr(entry.playerId)}" data-guest-key="${escapeAttr(entry.key)}" aria-label="Remove ${escapeAttr(label)}" title="Remove">${icon("trash")}</button>
    </div>
  `;
}

function renderSessionStageModal(sessionId = "") {
  const session = getSession(sessionId);
  if (!session) return "";
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card stage-picker-modal" role="dialog" aria-modal="true" aria-labelledby="session-stage-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="session-stage-modal-title">Session Stage</h2>
            <p>${escapeHtml(session.type)} - ${escapeHtml(formatDate(session.date))}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="stage-picker-list">
          ${stages()
            .map(
              (stage) => `
                <button class="stage-choice ${normalizeStage(session.stage) === stage ? "active" : ""}" type="button" data-action="set-session-stage" data-session="${escapeAttr(session.id)}" data-stage="${escapeAttr(stage)}">
                  <span class="badge ${stageTone(stage)}">${escapeHtml(titleCase(stage))}</span>
                  ${normalizeStage(session.stage) === stage ? icon("check") : ""}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderSessionModal(sessionId = "") {
  const session = sessionId ? getSession(sessionId) : null;
  const isEdit = Boolean(session);
  if (!state.courts.length && !isEdit) {
    return `
      <div class="modal-backdrop" data-modal-backdrop>
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="session-modal-title">
          <div class="section-heading">
            <h2 class="modal-title" id="session-modal-title">New Session</h2>
            <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
          </div>
          <div class="empty">Add at least one real court before creating a weekly session.</div>
          <div class="toolbar">
            <button class="btn primary" type="button" data-action="open-court-modal">Add Court</button>
          </div>
        </div>
      </div>
    `;
  }
  const sessionDate = session?.date || nextWeekdayDate(5);
  const sessionType = sessionTypeForDate(sessionDate, session?.type || "Friday");
  const defaultTimes = sessionDefaultTimesForDate(sessionDate, sessionType);
  const startTime = normalizeHalfHourTime(session?.startTime, defaultTimes.startTime);
  const endTime = normalizeHalfHourTime(session?.endTime, defaultTimes.endTime);
  const courtId = session?.courtId || orderedCourtOptions()[0]?.id || "";
  const courts = Number(session?.bookedCourts || session?.plannedCourts || 2);
  const playersPerCourt = Number(session?.playersPerCourt || state.settings.defaultPlayersPerCourt || PLAYERS_PER_COURT);
  const calculatedExpectedPlayers = calculateExpectedPlayers(courts, playersPerCourt);
  const expectedPlayers = isEdit ? Number(session?.expectedPlayers ?? 0) : expectedPlayersValue(session?.expectedPlayers, courts, playersPerCourt);
  const expectedPlayersAttrs = `data-expected-players-input${isEdit || expectedPlayers !== calculatedExpectedPlayers ? ' data-manual="true"' : ""}`;
  const calculatedCourtFee = calculateCourtFee(courtId, startTime, endTime, courts);
  const totalPaid = isEdit ? Number(session?.totalPaid ?? 0) : Number(session?.totalPaid || 0) || calculatedCourtFee;
  const shuttleCost = Number(session?.shuttleCost ?? state.settings.defaultShuttleCost ?? 5);
  const calculatedWaterCost = calculateWaterCost(courts);
  const waterCost = isEdit ? Number(session?.waterCost ?? 0) : Number(session?.waterCost ?? calculatedWaterCost);
  const waterCostAttrs = `data-water-cost-input${isEdit || waterCost !== calculatedWaterCost ? ' data-manual="true"' : ""}`;
  const calculatedPerPersonAmount = calculatePerPersonRate(totalPaid, expectedPlayers, shuttleCost);
  const perPersonAmount = isEdit ? Number(session?.perPersonAmount ?? 0) : perPersonRateValue(session?.perPersonAmount, totalPaid, expectedPlayers, shuttleCost);
  const perPersonAttrs = `data-per-person-input${isEdit || perPersonAmount !== calculatedPerPersonAmount ? ' data-manual="true"' : ""}`;
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card" data-form="session" data-edit-id="${escapeAttr(session?.id || "")}" role="dialog" aria-modal="true" aria-labelledby="session-modal-title">
        <div class="section-heading">
          <h2 class="modal-title" id="session-modal-title">${isEdit ? "Edit Session" : "New Session"}</h2>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid">
          <div class="session-form-row two">
            ${field("date", "Date", "date", sessionDate, "modal", "data-session-date-source")}
            ${selectSimple("type", "Session Type", ["Friday", "Saturday", "FlexiDay"], sessionType, "modal")}
          </div>
          <div class="session-form-row two">
            ${timeSelectField("startTime", "Start Time", startTime, "modal", "data-session-cost-source")}
            ${timeSelectField("endTime", "End Time", endTime, "modal", "data-session-cost-source")}
          </div>
          ${selectField("courtId", "Court", orderedCourtOptions(), courtId, "name", "modal", "data-session-cost-source")}
          <div class="session-form-row two">
            ${numberField("courts", "Courts", courts, 1, "modal", "data-session-cost-source data-session-capacity-source")}
            ${numberField("expectedPlayers", "Expected Players", expectedPlayers, 0, "modal", `${expectedPlayersAttrs} data-session-rate-source`)}
          </div>
          <div class="session-form-row two">
            ${numberField("totalPaid", "Court Fee", totalPaid, 0, "modal", "data-court-fee-input data-session-rate-source")}
            ${numberField("shuttleCost", "Shuttle Fee", shuttleCost, 0, "modal", "data-session-rate-source")}
          </div>
          <div class="session-form-row two">
            ${numberField("waterCost", "Water Cost", waterCost, 0, "modal", waterCostAttrs)}
            ${numberField("perPersonAmount", "Per Person Rate", perPersonAmount, 0, "modal", perPersonAttrs)}
          </div>
        </div>
        <div class="toolbar modal-actions">
          <button class="btn" type="button" data-action="close-modal">Cancel</button>
          <button class="btn primary" type="submit">${isEdit ? "Save Session" : "Create Session"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderCourtModal(courtId = "") {
  const court = courtId ? getCourt(courtId) : null;
  const isEdit = Boolean(court);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card" data-form="court" data-edit-id="${escapeAttr(court?.id || "")}" role="dialog" aria-modal="true" aria-labelledby="court-modal-title">
        <div class="section-heading">
          <h2 class="modal-title" id="court-modal-title">${isEdit ? "Edit Court" : "Add Court"}</h2>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid">
          <div class="session-form-row two">
            ${field("name", "Venue Name", "text", court?.name || "", "modal")}
            ${field("area", "Area", "text", court?.area || "", "modal")}
          </div>
          <div class="session-form-row two">
            ${field("contact", "Contact Person", "text", court?.contact || "", "modal")}
            ${field("phone", "Phone", "tel", court?.phone || court?.whatsapp || "", "modal")}
          </div>
          <div class="session-form-row two">
            ${numberField("aedPerHour", "AED per Hour", court?.aedPerHour ?? 0, 0, "modal")}
            ${selectSimple("bookingMethod", "Booking Method", ["WhatsApp", "Call", "App", "Walk-in", "Playo"], court?.bookingMethod || "WhatsApp", "modal")}
          </div>
          <div class="session-form-row two">
            ${field("location", "Location Link", "url", court?.location || "", "modal")}
            ${field("playoLink", "Playo Link", "url", court?.playoLink || "", "modal")}
          </div>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea class="textarea" name="notes">${escapeHtml(court?.notes || "")}</textarea>
        </label>
        <div class="toolbar">
          <button class="btn primary" type="submit">${isEdit ? "Save Court" : "Add Court"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderPlayerModal(playerId = "") {
  const player = playerId ? getPlayer(playerId) : null;
  const isEdit = Boolean(player);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card" data-form="player" data-edit-id="${escapeAttr(player?.id || "")}" role="dialog" aria-modal="true" aria-labelledby="player-modal-title">
        <div class="section-heading">
          <h2 class="modal-title" id="player-modal-title">${isEdit ? "Edit Player" : "Add Player"}</h2>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid">
          <div class="session-form-row two">
            ${field("name", "Name", "text", player?.name || "", "modal")}
            ${field("phone", "Number", "tel", player?.phone || player?.whatsapp || "", "modal")}
          </div>
          <div class="session-form-row two">
            ${field("preferredDays", "Preferred Days", "text", player?.preferredDays || "Friday, Saturday", "modal")}
            ${selectSimple("paymentMethod", "Payment Method", ["Cash", "Bank", "Other"], normalizePaymentMethod(player?.paymentMethod), "modal")}
          </div>
          <div class="session-form-row two">
            ${selectSimple("skillLevel", "Skill Level", SKILL_LEVELS, normalizeSkillLevel(player?.skillLevel), "modal")}
            ${selectSimple("racketOwned", "Racket Owned", ["Yes", "No", "Unknown"], player?.racketOwned || DEFAULT_RACKET_OWNED, "modal")}
          </div>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea class="textarea" name="notes">${escapeHtml(player?.notes || "")}</textarea>
        </label>
        <div class="toolbar">
          <button class="btn primary" type="submit">${isEdit ? "Save Player" : "Add Player"}</button>
        </div>
      </form>
    </div>
  `;
}

function field(name, label, type, value, scope = "session", extraAttrs = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input class="input" type="${escapeAttr(type)}" ${scope === "session" ? `data-session-field="${escapeAttr(name)}"` : `name="${escapeAttr(name)}"`} value="${escapeAttr(value)}" ${extraAttrs} />
    </label>
  `;
}

function settingsField(name, label, type, value, extraAttrs = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input class="input" type="${escapeAttr(type)}" data-setting-field="${escapeAttr(name)}" value="${escapeAttr(value)}" ${extraAttrs} />
    </label>
  `;
}

function numberField(name, label, value, min = 0, scope = "session", extraAttrs = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input class="input" type="number" min="${escapeAttr(min)}" step="1" ${scope === "session" ? `data-session-field="${escapeAttr(name)}"` : `name="${escapeAttr(name)}"`} value="${escapeAttr(value)}" ${extraAttrs} />
    </label>
  `;
}

function selectField(name, label, options, value, labelKey, scope = "session", extraAttrs = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="select" ${scope === "session" ? `data-session-field="${escapeAttr(name)}"` : `name="${escapeAttr(name)}"`} ${extraAttrs}>
        ${options.map((option) => `<option value="${escapeAttr(option.id)}" ${option.id === value ? "selected" : ""}>${escapeHtml(option[labelKey] || option.name)}</option>`).join("")}
      </select>
    </label>
  `;
}

function selectSimple(name, label, options, value, scope = "session", formatter = (item) => item) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="select" ${scope === "session" ? `data-session-field="${escapeAttr(name)}"` : `name="${escapeAttr(name)}"`}>
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${option === value ? "selected" : ""}>${escapeHtml(formatter(option))}</option>`).join("")}
      </select>
    </label>
  `;
}

function timeSelectField(name, label, value, scope = "session", extraAttrs = "") {
  const selectedValue = normalizeHalfHourTime(value);
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input class="input" type="time" min="00:00" max="23:30" step="1800" data-half-hour-time ${scope === "session" ? `data-session-field="${escapeAttr(name)}"` : `name="${escapeAttr(name)}"`} value="${escapeAttr(selectedValue)}" ${extraAttrs} />
    </label>
  `;
}

function normalizeHalfHourTime(value, fallback = "00:00") {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return fallback;
  const [hourText = "", minuteText = ""] = rawValue.split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes < 0 || totalMinutes >= 24 * 60) return fallback;
  const normalized = Math.min(23 * 60 + 30, Math.round(totalMinutes / 30) * 30);
  const dayMinutes = normalized;
  const normalizedHours = Math.floor(dayMinutes / 60);
  const normalizedMinutes = dayMinutes % 60;
  return `${String(normalizedHours).padStart(2, "0")}:${String(normalizedMinutes).padStart(2, "0")}`;
}

function selectPlayerField(name, label, options, value) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="select" name="${escapeAttr(name)}" ${options.length ? "" : "disabled"}>
        ${
          options.length
            ? options
                .map((player) => `<option value="${escapeAttr(player.id)}" ${player.id === value ? "selected" : ""}>${escapeHtml(player.name || player.displayName)} - ${escapeHtml(normalizeSkillLevel(player.skillLevel))}</option>`)
                .join("")
            : `<option value="">All saved players are already added</option>`
        }
      </select>
    </label>
  `;
}

function skillOptions(value) {
  const normalized = normalizeSkillLevel(value);
  return SKILL_LEVELS.map((level) => `<option value="${escapeAttr(level)}" ${level === normalized ? "selected" : ""}>${escapeHtml(level)}</option>`).join("");
}

function selectSessionField(name, label, value) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="select" name="${escapeAttr(name)}">
        ${sortSessions()
          .map((session) => `<option value="${escapeAttr(session.id)}" ${session.id === value ? "selected" : ""}>${escapeHtml(session.type)} - ${escapeHtml(formatDate(session.date))}</option>`)
          .join("")}
      </select>
    </label>
  `;
}
