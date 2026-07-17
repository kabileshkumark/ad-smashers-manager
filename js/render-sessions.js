function renderSessions() {
  const allSessions = sortSessions();
  const weekStart = selectedSessionWeekStart(allSessions);
  const weekSessions = sessionsForWeek(allSessions, weekStart);
  if (weekSessions.length && !weekSessions.some((item) => item.id === activeSessionId)) {
    activeSessionId = weekSessions[0].id;
  }
  if (!weekSessions.length) {
    activeSessionId = null;
  }
  const session = weekSessions.find((item) => item.id === activeSessionId) || null;
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Sessions</h1>
          <p class="page-kicker">Manage poll, booking, allocation, payments, and messages.</p>
        </div>
        <button class="btn primary icon-only" type="button" data-action="open-session-modal" aria-label="New session" title="New session">${icon("plus")}</button>
      </div>
      ${renderSessionWeekSelector(weekStart)}
      <div class="grid two">
        ${weekSessions.length ? weekSessions.map((item) => renderSessionCard(item, true)).join("") : `<div class="empty">No sessions this week.</div>`}
      </div>
      ${session ? renderSessionDetail(session) : `<div class="empty">Use the arrows to pick a week with sessions, or create a new session.</div>`}
    </section>
  `;
}

function selectedSessionWeekStart(sessions = sortSessions()) {
  if (uiState.sessionWeekStart) return weekStartIso(uiState.sessionWeekStart);
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const referenceDate = activeSession?.date || sessions[0]?.date || new Date();
  uiState.sessionWeekStart = weekStartIso(referenceDate);
  return uiState.sessionWeekStart;
}

function sessionsForWeek(sessions, weekStart) {
  const weekEnd = addDaysIso(weekStart, 7);
  return sessions.filter((session) => session.date >= weekStart && session.date < weekEnd);
}

function renderSessionWeekSelector(weekStart) {
  return `
    <section class="week-selector-shell" aria-label="Session week">
      <p>Week</p>
      <div class="week-selector">
        <button class="btn icon-only" type="button" data-action="previous-session-week" aria-label="Previous week" title="Previous week">${icon("arrowLeft")}</button>
        <div class="week-selector-value" aria-live="polite">${escapeHtml(weekRangeLabel(weekStart))}</div>
        <button class="btn icon-only" type="button" data-action="next-session-week" aria-label="Next week" title="Next week">${icon("arrowRight")}</button>
      </div>
    </section>
  `;
}

function renderSessionCard(session, selectable = false) {
  const stats = sessionStats(session);
  const court = getCourt(session.courtId);
  const group = getSessionGroup(session);
  const courtSlots = sessionCourtSlots(session);
  const courtCount = sessionCourtCountLabel(session);
  const groupUrl = safeWhatsappGroupUrl(group?.url || "");
  const whatsappGroupAction = groupUrl
    ? `<button class="btn icon-only" type="button" data-action="open-group" data-session="${escapeAttr(session.id)}" aria-label="Open WhatsApp Business group for ${escapeAttr(formatDate(session.date))}" title="Open WhatsApp Business group">${icon("message")}</button>`
    : `<button class="btn icon-only" type="button" disabled aria-label="WhatsApp group link missing" title="WhatsApp group link missing">${icon("message")}</button>`;
  return `
    <article class="row-card">
      <div class="row-main">
        <div class="session-card-heading">
          <div class="session-card-title-line">
            <h3 class="row-title">${escapeHtml(formatDate(session.date))}</h3>
            ${renderSessionStageChips(session)}
          </div>
          <p class="row-subtitle">${escapeHtml(timeRange(session))} at ${escapeHtml(court?.name || "Court not selected")}</p>
          ${courtSlots.length > 1 ? renderSessionCourtSlotBreakdown(courtSlots) : ""}
        </div>
      </div>
      <div class="meta-grid session-card-metrics">
        <div class="meta"><span>Players</span><strong>${escapeHtml(stats.confirmedCount)}/${escapeHtml(stats.capacity)}</strong></div>
        <div class="meta"><span>Waitlist</span><strong>${escapeHtml(stats.waiting.length)}</strong></div>
        <div class="meta"><span>Courts</span><strong>${escapeHtml(courtCount)}</strong></div>
        <div class="meta"><span>Payments</span><strong>${escapeHtml(stats.pendingCount)} pending</strong></div>
      </div>
      <div class="toolbar icon-toolbar session-card-actions">
        <button class="btn primary icon-only" type="button" data-view="sessions" data-session="${escapeAttr(session.id)}" aria-label="${selectable && activeSessionId === session.id ? "Selected session" : "Open session"}" title="${selectable && activeSessionId === session.id ? "Selected" : "Open"}">${icon(selectable && activeSessionId === session.id ? "check" : "arrowRight")}</button>
        <button class="btn icon-only" type="button" data-action="copy-poll" data-session="${escapeAttr(session.id)}" aria-label="Copy poll" title="Copy poll">${icon("poll")}</button>
        <button class="btn icon-only" type="button" data-action="open-session-players" data-session="${escapeAttr(session.id)}" aria-label="Edit vote order" title="Vote order">${icon("users")}</button>
        <button class="btn icon-only" type="button" data-action="copy-final-list" data-session="${escapeAttr(session.id)}" aria-label="Copy list" title="Copy list">${icon("list")}</button>
        ${whatsappGroupAction}
        <button class="btn icon-only" type="button" data-action="open-session-attendance" data-session="${escapeAttr(session.id)}" aria-label="Edit confirmed players" title="Confirmed">${icon("userCheck")}</button>
        <button class="btn icon-only" type="button" data-action="open-session-stage" data-session="${escapeAttr(session.id)}" aria-label="Change session stage" title="Stage">${icon("flag")}</button>
        <button class="btn icon-only" type="button" data-action="edit-session" data-session="${escapeAttr(session.id)}" aria-label="Edit ${escapeAttr(session.type)} Session" title="Edit Session">${icon("edit")}</button>
        <button class="btn icon-only danger" type="button" data-action="delete-session" data-session="${escapeAttr(session.id)}" aria-label="Delete ${escapeAttr(session.type)} Session" title="Delete">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderSessionCourtSlotBreakdown(slots) {
  return `
    <div class="session-court-breakdown" aria-label="Court allocation by time">
      ${slots
        .map(
          (slot) => `
            <span class="session-court-breakdown-item">
              <strong>${escapeHtml(messageTimeRange(slot, true))}</strong>
              <span>${escapeHtml(`${slot.courts} ${slot.courts === 1 ? "court" : "courts"}`)}</span>
            </span>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSessionStageChips(session) {
  const stage = normalizeStage(session.stage);
  const bookingStatus = sessionBookingStatus(session);
  return `
    <div class="badge-row stage-badges">
      <span class="badge ${stageTone(stage)}">${escapeHtml(titleCase(stage))}</span>
      <span class="badge ${bookingStatus.tone}">${escapeHtml(bookingStatus.label)}</span>
    </div>
  `;
}

function renderSessionDetail(session) {
  const selectedTab = SESSION_DETAIL_TABS.includes(activeSessionTab) ? activeSessionTab : DEFAULT_SESSION_TAB;
  return `
    <section class="detail-shell">
      <div class="session-header">
        <div class="segment" role="tablist">
          ${SESSION_DETAIL_TABS
            .map(
              (tab) => `
                <button type="button" class="${selectedTab === tab ? "active" : ""}" data-tab="${tab}">
                  ${titleCase(tab)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
      ${renderSessionTab(session, selectedTab)}
    </section>
  `;
}

function renderSessionTab(session, tab) {
  if (tab === "poll") return renderPollTab(session);
  if (tab === "payments") return renderPaymentTab(session);
  if (tab === "courts") return renderCourtAllocationTab(session);
  if (tab === "messages") return renderMessageTab(session);
  return renderPollTab(session);
}

function renderOverviewTab(session) {
  const court = getCourt(session.courtId);
  const group = getSessionGroup(session);
  const stats = sessionStats(session);
  const courtSlots = sessionCourtSlots(session);
  return `
    <div class="detail-content">
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Session Setup</h2>
            <p>Select court, time, and weekly capacity</p>
          </div>
        </div>
        <div class="meta-grid">
          <div class="meta"><span>Date</span><strong>${escapeHtml(formatDate(session.date))}</strong></div>
          <div class="meta"><span>Court</span><strong>${escapeHtml(court?.name || "Not Set")}</strong></div>
          <div class="meta"><span>Time</span><strong>${escapeHtml(timeRange(session))}</strong></div>
          <div class="meta"><span>Courts</span><strong>${escapeHtml(sessionCourtCountLabel(session))}</strong></div>
          <div class="meta"><span>Capacity</span><strong>${escapeHtml(stats.capacity)}</strong></div>
          <div class="meta"><span>Court-hours</span><strong>${escapeHtml(Number(sessionCourtHours(session).toFixed(2)))}</strong></div>
        </div>
        ${courtSlots.length > 1 ? renderSessionCourtSlotBreakdown(courtSlots) : ""}
        <div class="toolbar">
          <button class="btn" type="button" data-action="edit-session" data-session="${escapeAttr(session.id)}">Edit Session Setup</button>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea class="textarea" data-session-field="notes">${escapeHtml(session.notes || "")}</textarea>
        </label>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>WhatsApp Shortcut</h2>
            <p>${escapeHtml(group?.name || "WhatsApp group not set")}</p>
          </div>
        </div>
        <div class="meta-grid">
          <div class="meta"><span>Group</span><strong>${escapeHtml(group?.name || "Not Set")}</strong></div>
          <div class="meta"><span>Link Status</span><strong>${safeWhatsappGroupUrl(group?.url || "") ? "Set" : "Missing"}</strong></div>
          <div class="meta"><span>Court Contact</span><strong>${escapeHtml(court?.contact || "Not Set")}</strong></div>
          <div class="meta"><span>Booking Method</span><strong>${escapeHtml(court?.bookingMethod || "Not Set")}</strong></div>
        </div>
        <div class="toolbar">
          <button class="btn" type="button" data-action="open-group" data-session="${escapeAttr(session.id)}">Open WhatsApp</button>
          ${court ? `<button class="btn" type="button" data-action="open-map" data-court="${escapeAttr(court.id)}">Open Map</button>` : ""}
        </div>
      </section>
    </div>
    ${renderWeeklyPlayersPanel(session)}
  `;
}

function renderWeeklyPlayersPanel(session) {
  const responses = [...(session.responses || [])].sort((a, b) => Number(a.voteOrder) - Number(b.voteOrder));
  const addedIds = new Set(responses.map((response) => response.playerId));
  const manuallyConfirmedIds = new Set(manualConfirmedPlayerIds(session));
  const availablePlayers = state.players.filter((player) => player.active !== false && !addedIds.has(player.id) && !manuallyConfirmedIds.has(player.id));
  const nextVoteOrder = responses.length ? Math.max(...responses.map((item) => Number(item.voteOrder))) + 1 : 1;
  const stats = sessionStats(session);
  return `
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Weekly Players</h2>
          <p>${escapeHtml(stats.confirmedCount)}/${escapeHtml(stats.capacity)} confirmed slots, ${escapeHtml(stats.waiting.length)} waiting</p>
        </div>
      </div>
      <form class="form-grid weekly-player-form" data-form="session-player">
        <input type="hidden" name="voteOrder" value="${nextVoteOrder}" />
        ${selectPlayerField("playerId", "Player", availablePlayers, availablePlayers[0]?.id || "")}
        ${numberField("guestCount", "Guests", 0, 0, "weekly")}
        <label class="field">
          <span>Racket Needed</span>
          <select class="select" name="racketNeeded">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <button class="btn primary icon-only weekly-player-submit" type="submit" ${availablePlayers.length ? "" : "disabled"} aria-label="Add player" title="Add player">${icon("userPlus")}</button>
      </form>
      ${responses.length ? `<div class="grid two">${responses.map((response) => renderResponseRow(response, "weekly")).join("")}</div>` : `<div class="empty">No players selected for this session yet.</div>`}
    </section>
  `;
}

function renderPollTab(session) {
  const responses = [...(session.responses || [])].sort((a, b) => Number(a.voteOrder) - Number(b.voteOrder));
  const voteEntryCount = buildEntries(session).length;
  let participantNumber = 1;
  const voteRows = responses
    .map((response) => {
      const rows = renderPollVoteRows(session, response, participantNumber);
      participantNumber += 1 + Math.max(0, Math.floor(Number(response.guestCount || 0)));
      return rows;
    })
    .join("");
  return `
    <div class="detail-content">
      <section class="panel poll-simple-panel">
        <div class="section-heading">
          <div>
            <h2>Vote List</h2>
            <p>${escapeHtml(voteEntryCount)} vote entries</p>
          </div>
        </div>
        <div class="poll-vote-list">
          ${responses.length ? voteRows : `<div class="empty">No players selected yet. Use the players icon on the session card to add them in vote order.</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderPollVoteRows(session, response, playerNumber = Number(response.voteOrder || 0)) {
  const guestCount = Math.max(0, Math.floor(Number(response.guestCount || 0)));
  const guestRows = Array.from({ length: guestCount }, (_, index) =>
    renderPollGuestVoteRow(session, response, index + 1, Number(playerNumber || 0) + index + 1)
  );
  return [renderPollVoteRow(session, response, playerNumber), ...guestRows].join("");
}

function renderPollVoteRow(session, response, playerNumber = Number(response.voteOrder || 0)) {
  const playerName = getPlayerName(response.playerId);
  const selectedVote = POLL_VOTE_OPTIONS.includes(response.attendanceChoice) ? response.attendanceChoice : "in";
  return `
    <article class="poll-vote-card">
      <div class="poll-vote-player poll-vote-inline-player">
        <strong><span>${escapeHtml(Number(playerNumber) || "")}.</span> ${escapeHtml(playerName)}</strong>
      </div>
      <label class="field poll-vote-select">
        <span class="visually-hidden">Vote for ${escapeHtml(playerName)}</span>
        <select class="select" data-response-vote data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}">
          ${POLL_VOTE_OPTIONS.map((option) => `<option value="${option}" ${option === selectedVote ? "selected" : ""}>${escapeHtml(attendanceLabel(option))}</option>`).join("")}
        </select>
      </label>
      <button class="btn icon-only" type="button" data-action="add-response-guest" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" aria-label="Add guest for ${escapeAttr(playerName)}" title="Add guest">${icon("plus")}</button>
    </article>
  `;
}

function renderPollGuestVoteRow(session, response, guestIndex, guestNumber = Number(response.voteOrder || 0) + guestIndex) {
  const playerName = getPlayerName(response.playerId);
  const guestKey = `${response.id}-guest-${guestIndex}`;
  const fallbackName = `${playerName} Guest ${guestIndex}`;
  const guestName = sessionGuestName(session, guestKey, fallbackName);
  return `
    <article class="poll-vote-card poll-vote-card-guest">
      <label class="field compact-field poll-vote-guest-name-field">
        <span>${escapeHtml(`${Number(guestNumber) || ""}.`)}</span>
        <input class="input" type="text" data-session-guest-name data-session="${escapeAttr(session.id)}" data-guest-key="${escapeAttr(guestKey)}" value="${escapeAttr(guestName)}" placeholder="${escapeAttr(fallbackName)}" />
      </label>
      <div class="poll-vote-guest-meta">
        <button class="btn icon-only danger" type="button" data-action="remove-response-guest" data-session="${escapeAttr(session.id)}" data-response="${escapeAttr(response.id)}" aria-label="Remove ${escapeAttr(guestName)}" title="Remove guest">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderResponseRow(response) {
  const issues = [];
  const player = getPlayer(response.playerId);
  const skillLevel = normalizeSkillLevel(player?.skillLevel);
  if (response.attendanceChoice === "incomplete") issues.push("Needs attendance confirmation");
  if (response.guestCount > 0 && response.attendanceChoice === "in") issues.push("Guest count mismatch");
  return `
    <article class="row-card">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(response.voteOrder)}. ${escapeHtml(getPlayerName(response.playerId))}</h3>
          <p class="row-subtitle">${escapeHtml(attendanceLabel(response.attendanceChoice))} - ${escapeHtml(response.guestCount || 0)} Guest(s)</p>
        </div>
        <span class="badge ${skillTone(skillLevel)}">${escapeHtml(skillLevel)}</span>
      </div>
      <div class="badge-row">
        <span class="badge ${response.racketNeeded ? "gold" : "teal"}">${response.racketNeeded ? "Racket Needed" : "No Racket"}</span>
      </div>
      ${issues.length ? `<div class="badge-row">${issues.map((issue) => `<span class="badge red">${escapeHtml(issue)}</span>`).join("")}</div>` : ""}
      <div class="toolbar">
        <button class="btn danger" type="button" data-action="delete-response" data-response="${escapeAttr(response.id)}">Remove</button>
      </div>
    </article>
  `;
}

function renderCourtAllocationTab(session) {
  const allocation = allocateSession(session);
  const playersPerCourt = getPlayersPerCourt(session);
  return `
    <div class="detail-content">
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Court Allocation</h2>
            <p>Skill-grouped courts, waitlist kept by join order</p>
          </div>
          <button class="btn" type="button" data-action="edit-session" data-session="${escapeAttr(session.id)}">Edit Court Slots</button>
        </div>
        <div class="allocation">
          ${allocation.courts.map((court) => renderCourtSection(court, playersPerCourt)).join("")}
          ${renderWaitingList(allocation.waiting)}
        </div>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Racket Needed</h2>
            <p>Support tag from the poll</p>
          </div>
        </div>
        ${allocation.entries.filter((entry) => entry.racketNeeded).length
          ? `<ul class="player-list">${allocation.entries
              .filter((entry) => entry.racketNeeded)
              .map((entry) => `<li>${escapeHtml(entry.name)}<small>Vote ${escapeHtml(entry.voteOrder)}</small></li>`)
              .join("")}</ul>`
          : `<div class="empty">No racket requests.</div>`}
      </section>
    </div>
  `;
}

function renderCourtSection(court, playersPerCourt = PLAYERS_PER_COURT) {
  const emptySlots = Array.from({ length: Math.max(0, playersPerCourt - court.players.length) }, (_, index) => index + 1);
  return `
    <section class="court-section">
      <h3>Court ${escapeHtml(court.number)} <span class="muted">${escapeHtml(court.skillGroup || "Open")}</span></h3>
      <ul class="player-list">
        ${court.players
          .map(
            (entry, index) => `
              <li>
                <span>${index + 1}. ${escapeHtml(entry.name)}</span>
                <small>${escapeHtml(entry.skillLevel)} - Order ${escapeHtml(entry.voteOrder)}</small>
              </li>
            `
          )
          .join("")}
        ${emptySlots.map((slot) => `<li class="muted">${court.players.length + slot}. Open slot<small>Available</small></li>`).join("")}
      </ul>
    </section>
  `;
}

function renderWaitingList(waiting) {
  return `
    <section class="court-section">
      <h3>Waiting List</h3>
      ${
        waiting.length
          ? `<ul class="player-list">${waiting.map((entry, index) => `<li>${index + 1}. ${escapeHtml(entry.name)}<small>${escapeHtml(entry.skillLevel)} - Order ${escapeHtml(entry.voteOrder)}</small></li>`).join("")}</ul>`
          : `<div class="empty">No waiting players.</div>`
      }
    </section>
  `;
}

function renderPaymentTab(session) {
  const collectible = sessionIsCollectible(session);
  const payments = collectible
    ? Object.values(session.payments || {}).sort((a, b) => paymentPlayerName(a).localeCompare(paymentPlayerName(b), undefined, { sensitivity: "base" }))
    : [];
  const pendingCount = payments.filter((payment) => paymentEffectiveStatus(session, payment) !== "Paid").length;
  return `
    <div class="detail-content">
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Payments</h2>
            <p>${collectible ? `${escapeHtml(pendingCount)} pending` : "Available after game ends"}</p>
          </div>
        </div>
        ${
          payments.length
            ? payments.map((payment) => renderPaymentRow(session, payment)).join("")
            : `<div class="empty">${collectible ? "No confirmed players to collect from yet." : "Payments will appear after this session has ended."}</div>`
        }
      </section>
    </div>
  `;
}

function paymentPlayerName(payment) {
  const player = getPlayer(payment.playerId);
  return player?.name || player?.displayName || "Player";
}

function renderPaymentRow(session, payment) {
  const playerName = paymentPlayerName(payment);
  const amountDue = Number(payment.amount || session.perPersonAmount || 0);
  const paidAmount = Number(payment.paidAmount || 0);
  const advanceAmount = Number(payment.advanceAmount || 0);
  const coverage = paymentCoverageDetails(session, payment);
  const coverageApplied = coverage.applied;
  const coverageText = ledgerCoverageDescription(coverage);
  const guestCount = Number(payment.guestCount || 0);
  const guestText = guestCount > 0 ? ` (includes ${guestCount} guest${guestCount === 1 ? "" : "s"})` : "";
  const amountText = advanceAmount
    ? `${currency(amountDue)} paid, ${currency(advanceAmount)} Credit`
    : coverageApplied > 0
      ? `${[
          paidAmount > 0 ? `${currency(paidAmount)} paid` : "",
          coverageText
        ].filter(Boolean).join(" + ")} ${paidAmount + coverageApplied >= amountDue ? "covered" : `of ${currency(amountDue)}`}`
      : payment.status === "Partial"
        ? `${currency(paidAmount)} paid of ${currency(amountDue)}`
        : currency(amountDue);
  return `
    <article class="row-card payment-row">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(playerName)}</h3>
          <p class="row-subtitle">${escapeHtml(amountText + guestText)} - ${escapeHtml(normalizePaymentMethod(payment.method))}</p>
        </div>
        <div class="toolbar icon-toolbar payment-status-actions" aria-label="Payment status for ${escapeAttr(playerName)}">
          ${paymentStatusButton(session, payment, "Paid", "check")}
          ${paymentStatusButton(session, payment, "Pending", "clock")}
          ${paymentStatusButton(session, payment, "Partial", "wallet")}
        </div>
      </div>
    </article>
  `;
}

function paymentStatusButton(session, payment, status, iconName) {
  const effectiveStatus = paymentEffectiveStatus(session, payment);
  const activeClass = effectiveStatus === status ? ` active ${status.toLowerCase()}` : "";
  return `<button class="btn icon-only payment-status${activeClass}" type="button" data-action="mark-${status.toLowerCase()}" data-player="${escapeAttr(payment.playerId)}" data-session="${escapeAttr(session.id)}" aria-label="${status}" title="${status}">${icon(iconName)}</button>`;
}

function renderMessageTab(session) {
  return `
    <div class="detail-content">
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Poll Intro</h2>
            <p>Poll message preview</p>
          </div>
        </div>
        <pre class="template-preview">${escapeHtml(buildPollMessage(session))}</pre>
      </section>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Final List</h2>
            <p>List message preview</p>
          </div>
        </div>
        <pre class="template-preview">${escapeHtml(buildFinalListMessage(session))}</pre>
      </section>
    </div>
  `;
}
