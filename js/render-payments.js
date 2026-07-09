function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function matchesSearch(text, searchTerm) {
  return !searchTerm || normalizeSearchTerm(text).includes(searchTerm);
}

function playerBalanceSearchText(player) {
  const ledger = playerLedger(player.id);
  return [
    player.name,
    player.displayName,
    player.paymentMethod,
    player.preferredDays,
    normalizeSkillLevel(player.skillLevel),
    currency(playerBalance(player.id)),
    playerAvailableAdvance(player.id) ? currency(playerAvailableAdvance(player.id)) : "",
    currency(playerCoveredAmount(player.id)),
    ...ledger.map((item) => `${item.label} ${currency(item.outstanding)}`)
  ].join(" ");
}

function paymentGroupSearchText(group) {
  return [
    group.name,
    getPlayerName(group.payerId),
    paymentGroupMemberNames(group),
    currency(paymentGroupBalance(group))
  ].join(" ");
}

function advanceSearchText(player) {
  const summary = playerAdvanceSummary(player.id);
  return [
    player.name,
    player.displayName,
    "advance",
    currency(summary.received),
    currency(summary.deducted),
    currency(summary.balance)
  ].join(" ");
}

function activitySearchText(activity) {
  const playerNames = (activity.playerIds || []).map((id) => getPlayerName(id)).join(" ");
  return [
    activity.name,
    activity.notes,
    formatDate(activity.date),
    getPlayerName(activity.paidById),
    playerNames,
    currency(activity.totalPaid)
  ].join(" ");
}

function renderPaymentsSearch(value) {
  return `
    <label class="search-field payments-search" aria-label="Search payments">
      ${icon("search")}
      <input class="input" type="search" data-payments-search value="${escapeAttr(value)}" placeholder="Search payments" autocomplete="off" />
    </label>
  `;
}

function renderPayments() {
  const activePlayers = activePlayersAlphabetical();
  const balancePlayers = balancePlayersOrder(activePlayers);
  const advancePlayers = advancePlayersOrder(activePlayers);
  const totalOwed = activePlayers.reduce((total, player) => total + playerBalance(player.id), 0);
  const activities = [...(state.activities || [])].sort((a, b) => `${b.date}${b.name}`.localeCompare(`${a.date}${a.name}`));
  const shuttleActivities = activities.filter((activity) => activityIsShuttle(activity));
  const sharedActivities = activities.filter((activity) => !activityIsShuttle(activity));
  const paymentGroups = paymentGroupsList();
  const paymentsSearch = String(uiState.paymentsSearch || "");
  const searchTerm = normalizeSearchTerm(paymentsSearch);
  const filteredBalancePlayers = searchTerm ? balancePlayers.filter((player) => matchesSearch(playerBalanceSearchText(player), searchTerm)) : balancePlayers;
  const filteredAdvancePlayers = searchTerm ? advancePlayers.filter((player) => matchesSearch(advanceSearchText(player), searchTerm)) : advancePlayers;
  const filteredPaymentGroups = searchTerm ? paymentGroups.filter((group) => matchesSearch(paymentGroupSearchText(group), searchTerm)) : paymentGroups;
  const filteredShuttleActivities = searchTerm ? shuttleActivities.filter((activity) => matchesSearch(activitySearchText(activity), searchTerm)) : shuttleActivities;
  const filteredActivities = searchTerm ? sharedActivities.filter((activity) => matchesSearch(activitySearchText(activity), searchTerm)) : sharedActivities;
  const filteredOwed = filteredBalancePlayers.reduce((total, player) => total + playerBalance(player.id), 0);
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Payments</h1>
          <p class="page-kicker">Player balances, manual payments, and shared activity splits.</p>
        </div>
        <div class="toolbar nowrap">
          <button class="btn icon-only" type="button" data-action="open-group-payment-modal" aria-label="Group payment" title="Group payment">${icon("users")}</button>
          <button class="btn primary icon-only" type="button" data-action="open-activity-modal" aria-label="Add activity" title="Add activity">${icon("plus")}</button>
        </div>
      </div>
      ${renderPaymentsSearch(paymentsSearch)}
      ${renderPaymentGroupsPanel(filteredPaymentGroups, Boolean(searchTerm))}
      ${renderAdvancePanel(filteredAdvancePlayers, activePlayers, Boolean(searchTerm))}
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Player Balances</h2>
            <p>${searchTerm ? `${currency(filteredOwed)} shown, ${currency(totalOwed)} owed across all players` : `${currency(totalOwed)} owed across all players`}</p>
          </div>
        </div>
        <div class="payment-ledger-list">
          ${filteredBalancePlayers.length ? filteredBalancePlayers.map((player) => renderPlayerBalanceRow(player)).join("") : `<div class="empty">${searchTerm ? "No matching player balances." : "Add players first to track payments."}</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Activities</h2>
            <p>Dinner or other shared costs split across selected players</p>
          </div>
        </div>
        <div class="activity-list">
          ${filteredActivities.length ? filteredActivities.map((activity) => renderActivityRow(activity)).join("") : `<div class="empty">${searchTerm ? "No matching activities." : "No shared activities added yet."}</div>`}
        </div>
      </section>
      ${renderShuttleSpentPanel(filteredShuttleActivities, Boolean(searchTerm))}
    </section>
  `;
}

function renderShuttleSpentPanel(activities, isFiltered = false) {
  const total = activities.reduce((sum, activity) => sum + Number(activity.totalPaid || 0), 0);
  return `
    <section class="panel shuttle-spent-panel">
      <div class="section-heading">
        <div>
          <h2>Shuttle Spent</h2>
          <p>${currency(total)} ${isFiltered ? "shown" : "logged"} for shuttle purchases.</p>
        </div>
      </div>
      <div class="activity-list">
        ${activities.length || !isFiltered ? renderShuttleSpentSummaryCard(activities, isFiltered) : `<div class="empty">No matching shuttle purchases.</div>`}
      </div>
    </section>
  `;
}

function renderShuttleSpentSummaryCard(activities, isFiltered = false) {
  const total = activities.reduce((sum, activity) => sum + Number(activity.totalPaid || 0), 0);
  const latestActivity = [...activities].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
  const payerNames = uniqueIds(activities.map((activity) => activity.paidById).filter(Boolean)).map(getPlayerName).filter(Boolean);
  const payerText = payerNames.length > 2 ? `${payerNames.slice(0, 2).join(", ")} + ${payerNames.length - 2}` : payerNames.join(", ") || "Not set";
  return `
    <article class="row-card activity-row shuttle-spent-summary-card">
      <div class="row-main activity-row-header shuttle-spent-summary-header">
        <div class="activity-row-title-block">
          <div class="activity-title-line">
            <h3 class="row-title">Shuttle Purchases</h3>
            <span class="badge teal">${currency(total)}</span>
          </div>
          <p class="row-subtitle">${activities.length} ${activities.length === 1 ? "purchase" : "purchases"} ${isFiltered ? "shown" : "logged"}</p>
        </div>
        <div class="activity-row-actions shuttle-spent-actions">
          <button class="btn primary icon-only" type="button" data-action="open-shuttle-purchase-modal" aria-label="Add shuttle purchase" title="Add shuttle purchase">${icon("plus")}</button>
          <button class="btn icon-only" type="button" data-action="open-shuttle-spent-history" ${activities.length ? "" : "disabled"} aria-label="Shuttle purchase history" title="Purchase history">${icon("history")}</button>
        </div>
      </div>
      <div class="meta-grid activity-meta-grid">
        <div class="meta"><span>Total Spent</span><strong>${currency(total)}</strong></div>
        <div class="meta"><span>Purchases</span><strong>${activities.length}</strong></div>
        <div class="meta"><span>Last Purchase</span><strong>${latestActivity?.date ? escapeHtml(formatDate(latestActivity.date)) : "Not set"}</strong></div>
        <div class="meta"><span>Paid by</span><strong>${escapeHtml(payerText)}</strong></div>
      </div>
    </article>
  `;
}

function renderShuttlePurchaseModal() {
  const playerId = activityDraft.paidById || defaultShuttlePurchasePlayerId();
  const playerName = playerId ? getPlayerName(playerId) : "Kabilesh";
  const isEditing = Boolean(activityDraft.id);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card activity-modal shuttle-purchase-modal" data-form="activity" role="dialog" aria-modal="true" aria-labelledby="shuttle-purchase-modal-title">
        <input type="hidden" name="id" value="${escapeAttr(activityDraft.id || "")}" />
        <input type="hidden" name="name" value="Shuttle" />
        <input type="hidden" name="date" value="${escapeAttr(activityDraft.date || new Date().toISOString().slice(0, 10))}" />
        <input type="hidden" name="paidById" value="${escapeAttr(playerId)}" />
        <input type="hidden" name="playerIds" value="${escapeAttr(playerId)}" />
        <input type="hidden" name="shuttlePurchase" value="true" />
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="shuttle-purchase-modal-title">${isEditing ? "Edit Shuttle Purchase" : "Add Shuttle Purchase"}</h2>
            <p>Logged as Shuttle, paid by ${escapeHtml(playerName)}.</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid">
          <div class="shuttle-purchase-locks">
            <div class="meta"><span>Activity</span><strong>Shuttle</strong></div>
            <div class="meta"><span>Paid by</span><strong>${escapeHtml(playerName)}</strong></div>
            <div class="meta"><span>Players</span><strong>${escapeHtml(playerName)}</strong></div>
          </div>
          <label class="field">
            <span>Total Paid</span>
            <input class="input" type="number" name="totalPaid" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(activityDraft.totalPaid || "")}" autofocus />
          </label>
          <label class="field activity-notes-field">
            <span>Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(activityDraft.notes || "")}</textarea>
          </label>
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="cancel-activity-edit">Cancel</button>
          <button class="btn primary" type="submit">${isEditing ? "Save Purchase" : "Add Purchase"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderShuttleSpentHistoryModal() {
  const activities = [...(state.activities || [])]
    .filter((activity) => activityIsShuttle(activity))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  const total = activities.reduce((sum, activity) => sum + Number(activity.totalPaid || 0), 0);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="shuttle-spent-history-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="shuttle-spent-history-modal-title">Shuttle Purchase History</h2>
            <p>${currency(total)} across ${activities.length} ${activities.length === 1 ? "purchase" : "purchases"}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="payment-history-list">
          ${activities.length ? activities.map((activity) => renderShuttleSpentHistoryRow(activity)).join("") : `<div class="empty">No shuttle purchases logged yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderShuttleSpentHistoryRow(activity) {
  const payerName = activityPayerName(activity);
  const notes = String(activity.notes || "").trim();
  return `
    <article class="row-card payment-history-item shuttle-spent-history-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(activity.name || "Shuttle")}</h3>
          <p class="row-subtitle">${activity.date ? escapeHtml(formatDate(activity.date)) : "Date not set"} - paid by ${escapeHtml(payerName)}</p>
          ${notes ? `<p class="row-subtitle activity-notes"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ""}
        </div>
        <div class="toolbar nowrap">
          <span class="badge teal">${currency(activity.totalPaid)}</span>
          <button class="btn icon-only" type="button" data-action="edit-activity" data-activity="${escapeAttr(activity.id)}" aria-label="Edit ${escapeAttr(activity.name || "shuttle purchase")}" title="Edit">${icon("edit")}</button>
          <button class="btn icon-only danger" type="button" data-action="delete-activity" data-activity="${escapeAttr(activity.id)}" aria-label="Delete ${escapeAttr(activity.name || "shuttle purchase")}" title="Delete">${icon("trash")}</button>
        </div>
      </div>
    </article>
  `;
}

function renderPaymentGroupsPanel(groups, isFiltered = false) {
  return `
    <section class="panel payment-groups-panel">
      <div class="section-heading">
        <div>
          <h2>Payment Groups</h2>
          <p>Save couples, roommates, or regular split groups for one-click payment.</p>
        </div>
      </div>
      <div class="payment-group-grid">
        ${
          groups.length
            ? groups.map((group) => renderPaymentGroupCard(group)).join("")
            : `<div class="empty">${isFiltered ? "No matching payment groups." : "No saved payment groups yet."}</div>`
        }
      </div>
    </section>
  `;
}

function renderPaymentGroupCard(group) {
  const balance = paymentGroupBalance(group);
  const memberCount = paymentGroupMemberCount(group);
  const payerName = group.payerId ? getPlayerName(group.payerId) : "Not set";
  const historyItems = paymentGroupTransactions(group.id);
  return `
    <form class="row-card payment-group-card" data-form="payment-group-payment">
      <input type="hidden" name="groupId" value="${escapeAttr(group.id)}" />
      <div class="row-main payment-group-header">
        <div class="payment-group-info">
          <div class="payment-group-title-line">
            <h3 class="row-title">${escapeHtml(group.name || "Payment Group")}</h3>
            <span class="badge ${balance ? "gold" : "green"}">${balance ? `${currency(balance)} due` : "Clear"}</span>
          </div>
          <p class="row-subtitle">Paid by ${escapeHtml(payerName)} - ${memberCount} members</p>
          <p class="row-subtitle payment-group-members">${escapeHtml(paymentGroupMemberNames(group))}</p>
        </div>
        <div class="payment-group-actions">
          <label class="field compact-field payment-group-amount-field">
            <span class="visually-hidden">Paid Amount</span>
            <input class="input" type="number" name="amountPaid" min="0" step="0.01" inputmode="decimal" placeholder="0" />
          </label>
          <button class="btn primary icon-only" type="submit" aria-label="Apply payment for ${escapeAttr(group.name || "group")}" title="Apply group payment">${icon("wallet")}</button>
          <button class="btn icon-only" type="button" data-action="open-payment-group-copy" data-payment-group="${escapeAttr(group.id)}" aria-label="Copy payment details for ${escapeAttr(group.name || "group")}" title="Copy Payment Details">${icon("copy")}</button>
          <button class="btn icon-only" type="button" data-action="open-group-payment-history" data-payment-group="${escapeAttr(group.id)}" ${historyItems.length ? "" : "disabled"} aria-label="Payment history for ${escapeAttr(group.name || "group")}" title="Payment history">${icon("history")}</button>
          <button class="btn icon-only" type="button" data-action="edit-payment-group" data-payment-group="${escapeAttr(group.id)}" aria-label="Edit ${escapeAttr(group.name || "group")}" title="Edit">${icon("edit")}</button>
          <button class="btn icon-only danger" type="button" data-action="delete-payment-group" data-payment-group="${escapeAttr(group.id)}" aria-label="Delete ${escapeAttr(group.name || "group")}" title="Delete">${icon("trash")}</button>
        </div>
      </div>
    </form>
  `;
}

function renderAdvancePanel(players, activePlayers, isFiltered = false) {
  const totalReceived = players.reduce((sum, player) => sum + playerAdvanceSummary(player.id).received, 0);
  const totalDeducted = players.reduce((sum, player) => sum + playerAdvanceSummary(player.id).deducted, 0);
  const totalBalance = players.reduce((sum, player) => sum + playerAdvanceSummary(player.id).balance, 0);
  const subtitle = isFiltered
    ? `${currency(totalBalance)} balance shown from ${currency(totalReceived)} advance`
    : `${currency(totalBalance)} balance after ${currency(totalDeducted)} deducted`;
  return `
    <section class="panel advance-panel">
      <div class="section-heading">
        <div>
          <h2>Advance</h2>
          <p>${subtitle}</p>
        </div>
      </div>
      <form class="row-card advance-payment-form" data-form="advance-payment">
        <div class="row-main advance-payment-grid">
          ${renderPlayerSelectField("playerId", "Player", "", activePlayers)}
          <label class="field advance-amount-field">
            <span>Advance Paid</span>
            <input class="input" type="number" name="amountPaid" min="0" step="0.01" inputmode="decimal" placeholder="0" />
          </label>
          <button class="btn primary icon-only" type="submit" ${activePlayers.length ? "" : "disabled"} aria-label="Add advance" title="Add Advance">${icon("wallet")}</button>
        </div>
      </form>
      <div class="advance-list">
        ${players.length ? players.map((player) => renderAdvanceRow(player)).join("") : `<div class="empty">${isFiltered ? "No matching advances." : "No advance payments recorded yet."}</div>`}
      </div>
    </section>
  `;
}

function renderAdvanceRow(player) {
  const playerLabel = player.name || player.displayName || "Player";
  const summary = playerAdvanceSummary(player.id);
  return `
    <article class="row-card advance-row">
      <div class="row-main">
        <div>
          <div class="activity-title-line">
            <h3 class="row-title">${escapeHtml(playerLabel)}</h3>
            <span class="badge ${summary.balance ? "teal" : "green"}">${currency(summary.balance)} balance</span>
          </div>
          <div class="meta-grid advance-meta-grid">
            <div class="meta"><span>Advance Paid</span><strong>${currency(summary.received)}</strong></div>
            <div class="meta"><span>Deducted</span><strong>${currency(summary.deducted)}</strong></div>
            <div class="meta"><span>Balance</span><strong>${currency(summary.balance)}</strong></div>
          </div>
        </div>
        <div class="advance-row-actions">
          <button class="btn icon-only" type="button" data-action="open-player-advance-details" data-player="${escapeAttr(player.id)}" aria-label="View advance summary for ${escapeAttr(playerLabel)}" title="View Advance Summary">${icon("eye")}</button>
          <button class="btn icon-only" type="button" data-action="open-player-advance-history" data-player="${escapeAttr(player.id)}" aria-label="Advance history for ${escapeAttr(playerLabel)}" title="Advance History">${icon("history")}</button>
        </div>
      </div>
    </article>
  `;
}

function renderAdvanceDetailsModal(playerId = "") {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  const summary = playerCurrentAdvanceCycle(playerId);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="advance-details-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="advance-details-modal-title">Advance Summary</h2>
            <p>${escapeHtml(playerName)}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="meta-grid advance-meta-grid">
          <div class="meta"><span>Advance Paid</span><strong>${currency(summary.received)}</strong></div>
          <div class="meta"><span>Deducted</span><strong>${currency(summary.deducted)}</strong></div>
          <div class="meta"><span>Balance</span><strong>${currency(summary.balance)}</strong></div>
        </div>
        <div class="payment-history-list">
          ${
            summary.deductions.length
              ? summary.deductions.map((deduction) => renderAdvanceDeductionRow(deduction)).join("")
              : `<div class="empty">No deductions from this advance yet.</div>`
          }
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn primary" type="button" data-action="copy-player-advance-summary" data-player="${escapeAttr(playerId)}">Copy Summary</button>
        </div>
      </div>
    </div>
  `;
}

function renderAdvanceHistoryModal(playerId = "") {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  const summaries = [...playerAdvanceCycleSummaries(playerId)].reverse();
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="advance-history-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="advance-history-modal-title">Advance History</h2>
            <p>${escapeHtml(playerName)}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="payment-history-list">
          ${
            summaries.length
              ? summaries.map((summary) => renderAdvanceHistoryRow(summary)).join("")
              : `<div class="empty">No advance payments recorded yet.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderAdvanceHistoryRow(summary) {
  return `
    <article class="row-card payment-transaction-row advance-history-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${summary.date ? escapeHtml(formatDate(summary.date)) : "Date not set"}</h3>
          <p class="row-subtitle">Advance paid ${currency(summary.received)}, deducted ${currency(summary.deducted)}, balance ${currency(summary.balance)}</p>
          ${
            summary.deductions.length
              ? `<div class="payment-history-list advance-deduction-list">${summary.deductions.map((deduction) => renderAdvanceDeductionRow(deduction)).join("")}</div>`
              : `<p class="row-subtitle">No deductions from this advance yet.</p>`
          }
        </div>
        <div class="toolbar nowrap">
          <span class="badge ${summary.balance ? "teal" : "green"}">${currency(summary.balance)} balance</span>
          <button class="btn icon-only danger" type="button" data-action="delete-payment-transaction" data-transaction="${escapeAttr(summary.id)}" aria-label="Delete advance payment" title="Delete">${icon("trash")}</button>
        </div>
      </div>
    </article>
  `;
}

function renderAdvanceDeductionRow(deduction) {
  return `
    <article class="row-card payment-history-item advance-deduction-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(deduction.label)}</h3>
          <p class="row-subtitle">Deducted ${currency(deduction.amount)} - balance ${currency(deduction.balanceAfter)}</p>
        </div>
      </div>
    </article>
  `;
}

function renderGroupPaymentHistoryModal(groupId = "") {
  const group = getPaymentGroup(groupId);
  const transactions = paymentGroupTransactions(groupId);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card payment-history-modal" role="dialog" aria-modal="true" aria-labelledby="group-payment-history-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="group-payment-history-modal-title">Payment History</h2>
            <p>${escapeHtml(group?.name || "Payment group")}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="payment-history-list">
          ${
            transactions.length
              ? transactions.map((transaction) => renderGroupPaymentHistoryRow(transaction)).join("")
              : `<div class="empty">No recorded group payments yet.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderGroupPaymentHistoryRow(transaction) {
  const payerName = getPlayerName(transaction.paidById);
  const coveredNames = uniqueIds(transaction.playerIds || []).map(getPlayerName).filter(Boolean);
  const coveredLabel = coveredNames.length > 3 ? `${coveredNames.slice(0, 3).join(", ")} + ${coveredNames.length - 3} more` : coveredNames.join(", ");
  const group = getPaymentGroup(transaction.groupId);
  const title = group?.name || "Group Payment";
  const advanceText = Number(transaction.advanceAmount || 0) > 0 ? `, ${currency(transaction.advanceAmount)} advance` : "";
  return `
    <article class="row-card payment-transaction-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(title)}</h3>
          <p class="row-subtitle">${escapeHtml(formatDate(transaction.date))} - paid by ${escapeHtml(payerName)} for ${escapeHtml(coveredLabel || "players")}</p>
          <p class="row-subtitle">${currency(Number(transaction.appliedAmount || 0))} applied${escapeHtml(advanceText)}</p>
        </div>
        <div class="toolbar nowrap">
          <span class="badge green">${currency(transaction.amountPaid)}</span>
          <button class="btn icon-only danger" type="button" data-action="delete-payment-transaction" data-transaction="${escapeAttr(transaction.id)}" aria-label="Delete group payment" title="Delete">${icon("trash")}</button>
        </div>
      </div>
    </article>
  `;
}

function renderActivityModal() {
  const players = activePlayersAlphabetical();
  const isEditing = Boolean(activityDraft.id);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card activity-modal" data-form="activity" role="dialog" aria-modal="true" aria-labelledby="activity-modal-title">
        <input type="hidden" name="id" value="${escapeAttr(activityDraft.id || "")}" />
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="activity-modal-title">${isEditing ? "Edit Activity" : "Add Activity"}</h2>
            <p>${isEditing ? "Update this shared cost split." : "Split dinner or other shared costs across selected players."}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid">
          <div class="session-form-row two">
            ${field("name", "Activity Name", "text", activityDraft.name, "activity")}
            ${field("date", "Date", "date", activityDraft.date || new Date().toISOString().slice(0, 10), "activity")}
          </div>
          <div class="session-form-row two">
            ${numberField("totalPaid", "Total Paid", activityDraft.totalPaid, 0, "activity")}
            ${renderActivityPaidByField(players)}
          </div>
          ${renderActivityPlayerPicker(players)}
          <label class="field activity-notes-field">
            <span>Notes</span>
            <textarea class="textarea" name="notes">${escapeHtml(activityDraft.notes || "")}</textarea>
          </label>
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="cancel-activity-edit">Cancel</button>
          <button class="btn primary" type="submit">${isEditing ? "Save Activity" : "Add Activity"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderActivityPaidByField(players) {
  return `
    <label class="field">
      <span>Paid by</span>
      <select class="select" name="paidById" ${players.length ? "" : "disabled"}>
        <option value="" ${activityDraft.paidById ? "" : "selected"}>${players.length ? "Select payer" : "Add players first"}</option>
        ${players.map((player) => `<option value="${escapeAttr(player.id)}" ${player.id === activityDraft.paidById ? "selected" : ""}>${escapeHtml(player.name || player.displayName || "Player")}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderActivityPlayerPicker(players) {
  const selectedPlayers = activityDraft.playerIds.map((id) => getPlayer(id)).filter((player) => player && player.active !== false);
  const selectedLabel = selectedPlayers.length
    ? `${selectedPlayers.length} selected: ${selectedPlayers.map((player) => player.name || player.displayName || "Player").join(", ")}`
    : players.length
      ? "Select players to split"
      : "Add players first";
  return `
    <label class="field activity-player-field">
      <span>Players</span>
      <div class="activity-player-control">
        <button class="btn icon-only" type="button" data-action="open-activity-players" ${players.length ? "" : "disabled"} aria-label="Select players for split" title="Players">${icon("users")}</button>
        <p class="activity-player-summary">${escapeHtml(selectedLabel)}</p>
      </div>
      ${activityDraft.playerIds.map((id) => `<input type="hidden" name="playerIds" value="${escapeAttr(id)}" />`).join("")}
    </label>
  `;
}

function renderGroupPaymentModal() {
  const players = activePlayersAlphabetical();
  const selectedPlayers = groupPaymentDraft.playerIds.map((id) => getPlayer(id)).filter((player) => player && player.active !== false);
  const group = groupPaymentDraft.groupId ? getPaymentGroup(groupPaymentDraft.groupId) : null;
  const amountValue = groupPaymentDraft.amountPaid !== "" ? groupPaymentDraft.amountPaid : group ? String(paymentGroupBalance(group)) : "";
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card group-payment-modal" data-form="group-payment" role="dialog" aria-modal="true" aria-labelledby="group-payment-modal-title">
        <input type="hidden" name="groupId" value="${escapeAttr(groupPaymentDraft.groupId || "")}" />
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="group-payment-modal-title">Group Payment</h2>
            <p>${group ? `Mark payment for ${escapeHtml(group.name)}.` : "Mark one payment that covers multiple players."}</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid two">
          ${renderPlayerSelectField("paidById", "Paid By", groupPaymentDraft.paidById, players)}
          <label class="field">
            <span>Amount Paid</span>
            <input class="input" type="number" name="amountPaid" min="0" step="0.01" value="${escapeAttr(amountValue)}" />
          </label>
          ${renderGroupPaymentPlayerPicker(players, selectedPlayers)}
          ${
            group
              ? ""
              : `<label class="field group-save-field">
                  <span>Save as Group</span>
                  <input class="input" type="text" name="saveAsGroupName" value="${escapeAttr(groupPaymentDraft.saveAsGroupName || "")}" placeholder="Optional group name" />
                </label>`
          }
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="cancel-group-payment">Cancel</button>
          <button class="btn primary" type="submit">Mark Payment</button>
        </div>
      </form>
    </div>
  `;
}

function renderPaymentGroupModal() {
  const players = activePlayersAlphabetical();
  const selectedPlayers = paymentGroupDraft.playerIds.map((id) => getPlayer(id)).filter((player) => player && player.active !== false);
  const selectedGuests = normalizePaymentGroupGuests(paymentGroupDraft.guests || []);
  const isEditing = Boolean(paymentGroupDraft.id);
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <form class="modal-card group-payment-modal" data-form="payment-group" role="dialog" aria-modal="true" aria-labelledby="payment-group-modal-title">
        <input type="hidden" name="id" value="${escapeAttr(paymentGroupDraft.id || "")}" />
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="payment-group-modal-title">${isEditing ? "Edit Payment Group" : "Add Payment Group"}</h2>
            <p>Save regular couples, roommates, or friends who usually pay together.</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="form-grid two">
          <label class="field">
            <span>Group Name</span>
            <input class="input" type="text" name="name" value="${escapeAttr(paymentGroupDraft.name || "")}" />
          </label>
          ${renderPlayerSelectField("payerId", "Default Payer", paymentGroupDraft.payerId, players)}
          ${renderPaymentGroupPlayerPicker(players, selectedPlayers, selectedGuests)}
        </div>
        <div class="toolbar nowrap confirm-actions">
          <button class="btn" type="button" data-action="cancel-payment-group">Cancel</button>
          <button class="btn primary" type="submit">${isEditing ? "Save Group" : "Add Group"}</button>
        </div>
      </form>
    </div>
  `;
}

function renderPlayerSelectField(name, label, value, players) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select class="select" name="${escapeAttr(name)}" ${players.length ? "" : "disabled"}>
        <option value="" ${value ? "" : "selected"}>${players.length ? "Select player" : "Add players first"}</option>
        ${players.map((player) => `<option value="${escapeAttr(player.id)}" ${player.id === value ? "selected" : ""}>${escapeHtml(player.name || player.displayName || "Player")}</option>`).join("")}
      </select>
    </label>
  `;
}

function selectedPlayersSummary(selectedPlayers, fallback, guests = []) {
  const names = [...selectedPlayers.map((player) => player.name || player.displayName || "Player"), ...paymentGroupGuestNames({ guests })];
  return names.length
    ? `${names.length} selected: ${names.join(", ")}`
    : fallback;
}

function renderGroupPaymentPlayerPicker(players, selectedPlayers) {
  return `
    <label class="field activity-player-field">
      <span>Covers Players</span>
      <div class="activity-player-control">
        <button class="btn icon-only" type="button" data-action="open-group-payment-players" ${players.length ? "" : "disabled"} aria-label="Select covered players" title="Players">${icon("users")}</button>
        <p class="activity-player-summary">${escapeHtml(selectedPlayersSummary(selectedPlayers, players.length ? "Select players covered by this payment" : "Add players first"))}</p>
      </div>
      ${groupPaymentDraft.playerIds.map((id) => `<input type="hidden" name="playerIds" value="${escapeAttr(id)}" />`).join("")}
    </label>
  `;
}

function renderPaymentGroupPlayerPicker(players, selectedPlayers, selectedGuests = []) {
  return `
    <label class="field activity-player-field">
      <span>Group Members</span>
      <div class="activity-player-control">
        <button class="btn icon-only" type="button" data-action="open-payment-group-players" ${players.length ? "" : "disabled"} aria-label="Select group members" title="Players">${icon("users")}</button>
        <p class="activity-player-summary">${escapeHtml(selectedPlayersSummary(selectedPlayers, players.length ? "Select players or add guests" : "Add players first", selectedGuests))}</p>
      </div>
      ${paymentGroupDraft.playerIds.map((id) => `<input type="hidden" name="playerIds" value="${escapeAttr(id)}" />`).join("")}
    </label>
  `;
}

function renderPlayerBalanceRow(player) {
  const playerLabel = player.name || player.displayName || "Player";
  const historyItems = playerPaymentCorrectionItems(player.id);
  const covered = playerCoveredAmount(player.id);
  const remainingCredit = playerRemainingCredit(player.id);
  const due = playerBalance(player.id);
  return `
    <form class="row-card player-balance-row" data-form="player-payment">
      <input type="hidden" name="playerId" value="${escapeAttr(player.id)}" />
      <div class="row-main">
        <div>
          <div class="player-balance-title-line">
            <h3 class="row-title">${escapeHtml(playerLabel)}</h3>
            <div class="player-balance-chips" aria-label="Payment summary for ${escapeAttr(playerLabel)}">
              <span class="badge green">Covered ${currency(covered)}</span>
              <span class="player-balance-chip-pair">
                <span class="badge ${due ? "gold" : "green"}">Due ${currency(due)}</span>
                <span class="badge ${remainingCredit ? "teal" : "green"}">Credit ${currency(remainingCredit)}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="player-balance-actions">
          <label class="field compact-field">
            <span class="visually-hidden">Paid amount</span>
            <input class="input" type="number" name="amountPaid" min="0" max="999" step="1" placeholder="0" />
          </label>
          <button class="btn primary icon-only" type="submit" aria-label="Apply payment for ${escapeAttr(playerLabel)}" title="Apply payment">${icon("wallet")}</button>
          <button class="btn icon-only" type="button" data-action="open-player-payment-details" data-player="${escapeAttr(player.id)}" aria-label="Copy payment details for ${escapeAttr(playerLabel)}" title="Copy Payment Details">${icon("copy")}</button>
          <button class="btn icon-only" type="button" data-action="open-payment-history" data-player="${escapeAttr(player.id)}" ${historyItems.length ? "" : "disabled"} aria-label="Payment history for ${escapeAttr(playerLabel)}" title="Payment history">${icon("history")}</button>
        </div>
      </div>
    </form>
  `;
}

function renderActivityRow(activity) {
  const participantNames = (activity.playerIds || []).map((id) => getPlayerName(id)).filter(Boolean);
  const participantCount = participantNames.length;
  const perPerson = participantCount ? Number(activity.totalPaid || 0) / participantCount : 0;
  const outstanding = activityOutstandingAfterAdvance(activity);
  const payerName = activityPayerName(activity);
  return `
    <article class="row-card activity-row">
      <div class="row-main activity-row-header">
        <div class="activity-row-title-block">
          <div class="activity-title-line">
            <h3 class="row-title">${escapeHtml(activity.name || "Activity")}</h3>
            <span class="badge ${outstanding ? "gold" : "green"}">${outstanding ? `${currency(outstanding)} owed${activity.paidById ? ` to ${escapeHtml(payerName)}` : ""}` : "Clear"}</span>
          </div>
          <p class="row-subtitle">${activity.date ? formatDate(activity.date) : "Date not set"} - ${participantCount} players</p>
        </div>
        <div class="activity-row-actions">
          <button class="btn icon-only" type="button" data-action="open-activity-details" data-activity="${escapeAttr(activity.id)}" aria-label="View ${escapeAttr(activity.name || "activity")}" title="View">${icon("eye")}</button>
          <button class="btn icon-only" type="button" data-action="edit-activity" data-activity="${escapeAttr(activity.id)}" aria-label="Edit ${escapeAttr(activity.name || "activity")}" title="Edit">${icon("edit")}</button>
          <button class="btn icon-only danger" type="button" data-action="delete-activity" data-activity="${escapeAttr(activity.id)}" aria-label="Delete ${escapeAttr(activity.name || "activity")}" title="Delete">${icon("trash")}</button>
        </div>
      </div>
      <div class="meta-grid activity-meta-grid">
        <div class="meta"><span>Total Paid</span><strong>${currency(activity.totalPaid)}</strong></div>
        <div class="meta"><span>Per Person</span><strong>${currency(perPerson)}</strong></div>
        <div class="meta"><span>Paid by</span><strong>${escapeHtml(payerName)}</strong></div>
        <div class="meta"><span>Players</span><strong>${participantCount}</strong></div>
      </div>
    </article>
  `;
}

function renderActivityDetailsModal(activityId = "") {
  const activity = (state.activities || []).find((item) => item.id === activityId);
  if (!activity) return "";
  const participantNames = (activity.playerIds || []).map((id) => getPlayerName(id)).filter(Boolean);
  const participantCount = participantNames.length;
  const perPerson = participantCount ? Number(activity.totalPaid || 0) / participantCount : 0;
  const outstanding = activityOutstandingAfterAdvance(activity);
  const payerName = activityPayerName(activity);
  const notes = String(activity.notes || "").trim();
  return `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal-card activity-details-modal" role="dialog" aria-modal="true" aria-labelledby="activity-details-modal-title">
        <div class="section-heading">
          <div>
            <h2 class="modal-title" id="activity-details-modal-title">${escapeHtml(activity.name || "Activity")}</h2>
            <p>${activity.date ? escapeHtml(formatDate(activity.date)) : "Date not set"} - ${participantCount} players</p>
          </div>
          <button class="btn icon-button" type="button" data-action="close-modal" aria-label="Close">X</button>
        </div>
        <div class="meta-grid activity-meta-grid activity-details-meta">
          <div class="meta"><span>Total Paid</span><strong>${currency(activity.totalPaid)}</strong></div>
          <div class="meta"><span>Per Person</span><strong>${currency(perPerson)}</strong></div>
          <div class="meta"><span>Paid by</span><strong>${escapeHtml(payerName)}</strong></div>
          <div class="meta"><span>Status</span><strong>${outstanding ? `${currency(outstanding)} owed` : "Clear"}</strong></div>
        </div>
        <section class="activity-detail-section">
          <h3>Players</h3>
          ${
            participantNames.length
              ? `<div class="activity-detail-player-list">${participantNames.map((name) => `<span class="badge teal">${escapeHtml(name)}</span>`).join("")}</div>`
              : `<p class="row-subtitle">No players selected.</p>`
          }
        </section>
        <section class="activity-detail-section">
          <h3>Notes</h3>
          <p class="activity-detail-note">${notes ? escapeHtml(notes) : "No notes added."}</p>
        </section>
      </div>
    </div>
  `;
}
