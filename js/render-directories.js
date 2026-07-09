function renderCourts() {
  const courts = courtsWithBookingPinned();
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Courts</h1>
          <p class="page-kicker">Venue contacts, rates, maps, and booking notes.</p>
        </div>
        <button class="btn primary icon-only" type="button" data-action="open-court-modal" aria-label="Add court" title="Add court">${icon("plus")}</button>
      </div>
      <div class="grid two">
        ${courts.map((court) => renderCourtCard(court)).join("")}
      </div>
    </section>
  `;
}

function courtsWithBookingPinned() {
  return [...(state.courts || [])].sort((a, b) => {
    const aName = String(a.name || "");
    const bName = String(b.name || "");
    const aPinned = aName.trim().toLowerCase() === "booking";
    const bPinned = bName.trim().toLowerCase() === "booking";
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  });
}

function renderCourtCard(court) {
  const contactNumber = court.phone || court.whatsapp || "";
  const telHref = telLink(contactNumber);
  const waHref = whatsappLink(contactNumber);
  const playoHref = safeExternalUrl(court.playoLink || "");
  return `
    <article class="row-card court-card">
      <div class="row-main">
        <div>
          <h3 class="row-title">${escapeHtml(court.name)}</h3>
          <p class="row-subtitle">${escapeHtml(court.area || "Area not set")} - ${currency(court.aedPerHour)} per hour</p>
        </div>
        <span class="badge teal">${escapeHtml(court.bookingMethod)}</span>
      </div>
      <div class="toolbar icon-toolbar court-card-actions" aria-label="Court quick actions">
        ${telHref ? `<a class="btn icon-only" href="${escapeAttr(telHref)}" aria-label="Call ${escapeAttr(court.name)}" title="Call">${icon("phone")}</a>` : ""}
        ${waHref ? `<button class="btn icon-only" type="button" data-action="open-whatsapp-number" data-number="${escapeAttr(contactNumber)}" aria-label="Open WhatsApp Business for ${escapeAttr(court.name)}" title="WhatsApp Business">${icon("message")}</button>` : ""}
        <button class="btn icon-only" type="button" data-action="open-map" data-court="${escapeAttr(court.id)}" aria-label="Open Map for ${escapeAttr(court.name)}" title="Map">${icon("map")}</button>
        ${playoHref ? `<button class="btn icon-only" type="button" data-action="open-playo" data-court="${escapeAttr(court.id)}" aria-label="Open Playo for ${escapeAttr(court.name)}" title="Playo">${icon("externalLink")}</button>` : ""}
        <button class="btn icon-only" type="button" data-action="copy-booking-request" data-court="${escapeAttr(court.id)}" aria-label="Copy Booking Request for ${escapeAttr(court.name)}" title="Copy Booking Request">${icon("copy")}</button>
        <button class="btn icon-only" type="button" data-action="edit-court" data-court="${escapeAttr(court.id)}" aria-label="Edit ${escapeAttr(court.name)}" title="Edit">${icon("edit")}</button>
        <button class="btn icon-only danger" type="button" data-action="delete-court" data-court="${escapeAttr(court.id)}" aria-label="Delete ${escapeAttr(court.name)}" title="Delete">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderPlayers() {
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Players</h1>
          <p class="page-kicker">Member records</p>
        </div>
        <div class="page-actions" aria-label="Player actions">
          ${renderPlayerRoleButton("organizer")}
          ${renderPlayerRoleButton("coOrganizer")}
          <button class="btn primary icon-only" type="button" data-action="open-player-modal" aria-label="Add player" title="Add player">${icon("plus")}</button>
        </div>
      </div>
      <div class="grid two">
        ${playersWithRolesFirst().map((player) => renderPlayerCard(player)).join("")}
      </div>
    </section>
  `;
}

function renderPlayerRoleButton(role) {
  const config = playerRoleConfig(role);
  const playerId = state.settings?.[config.field] || "";
  const playerName = playerId ? getPlayerName(playerId) : "Not set";
  return `
    <button class="btn icon-only role-button${playerId ? " active" : ""}" type="button" data-action="open-player-role" data-role="${role}" aria-label="Assign ${escapeAttr(config.label)}" title="${escapeAttr(`${config.label}: ${playerName}`)}">${icon(config.icon)}</button>
  `;
}

function renderPlayerCard(player) {
  const attendanceCount = playerAttendanceCount(player.id);
  const contactNumber = player.phone || player.whatsapp || "";
  const telHref = telLink(contactNumber);
  const waHref = whatsappLink(contactNumber);
  const playerLabel = player.name || player.displayName || "Player";
  return `
    <article class="row-card">
      <div class="row-main player-card-header">
        <div class="player-card-title-block">
          <div class="player-card-title-line">
            <h3 class="row-title">${escapeHtml(playerLabel)}</h3>
          </div>
          <p class="row-subtitle">${escapeHtml(player.preferredDays || "No preferred day")} - ${escapeHtml(normalizePaymentMethod(player.paymentMethod) || "No payment method")}</p>
        </div>
        <div class="player-card-actions" aria-label="Player edit actions">
          <button class="btn icon-only" type="button" data-action="edit-player" data-player="${escapeAttr(player.id)}" aria-label="Edit ${escapeAttr(playerLabel)}" title="Edit">${icon("edit")}</button>
          <button class="btn icon-only danger" type="button" data-action="delete-player" data-player="${escapeAttr(player.id)}" aria-label="Delete ${escapeAttr(playerLabel)}" title="Delete">${icon("trash")}</button>
        </div>
      </div>
      <div class="meta-grid player-card-meta-grid">
        <div class="meta"><span>Attendance</span><strong>${attendanceCount}</strong></div>
        <div class="meta"><span>Racket</span><strong>${escapeHtml(player.usuallyNeedsRacket ? "Usually needs" : player.racketOwned)}</strong></div>
        <div class="meta"><span>Skill Level</span><strong>${escapeHtml(normalizeSkillLevel(player.skillLevel))}</strong></div>
      </div>
      ${
        telHref || waHref
          ? `<div class="toolbar icon-toolbar" aria-label="Player quick actions">
              ${telHref ? `<a class="btn icon-only" href="${escapeAttr(telHref)}" aria-label="Call ${escapeAttr(playerLabel)}" title="Call">${icon("phone")}</a>` : ""}
              ${waHref ? `<button class="btn icon-only" type="button" data-action="open-whatsapp-number" data-number="${escapeAttr(contactNumber)}" aria-label="Open WhatsApp Business for ${escapeAttr(playerLabel)}" title="WhatsApp Business">${icon("message")}</button>` : ""}
            </div>`
          : ""
      }
    </article>
  `;
}

function renderTemplateSettingsSection() {
  return `
    <section class="panel">
      <div class="section-heading">
        <div>
          <h2>Message Templates</h2>
          <p>Used by session copy actions.</p>
        </div>
        <button class="btn primary icon-only" type="submit" form="templates-form" aria-label="Save templates" title="Save templates">${icon("save")}</button>
      </div>
      <form class="grid two template-form" id="templates-form" data-form="templates">
        <label class="field">
          <span>Poll Template</span>
          <textarea class="textarea template-editor" name="pollTemplate">${escapeHtml(state.settings.pollTemplate || defaultPollTemplate())}</textarea>
        </label>
        <label class="field">
          <span>List Template</span>
          <textarea class="textarea template-editor" name="finalListTemplate">${escapeHtml(state.settings.finalListTemplate || defaultFinalListTemplate())}</textarea>
        </label>
      </form>
    </section>
  `;
}
