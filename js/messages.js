function timeRange(session) {
  return `${session.startTime} to ${session.endTime}`;
}

function messageDate(value) {
  const date = new Date(`${value}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
  const month = new Intl.DateTimeFormat("en", { month: "long" }).format(date);
  const day = date.getDate();
  return `${weekday}, ${day}${ordinalSuffix(day)} ${month}`;
}

function ordinalSuffix(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}

function messageTimeRange(session, compact = false) {
  const start = parseClockTime(session.startTime);
  const end = parseClockTime(session.endTime);
  const startPeriod = start.hours >= 12 ? "PM" : "AM";
  const endPeriod = end.hours >= 12 ? "PM" : "AM";
  const showStartPeriod = startPeriod !== endPeriod;
  const startText = formatMessageClock(start, compact, showStartPeriod);
  const endText = formatMessageClock(end, compact, true);
  return `${startText} to ${endText}`;
}

function parseClockTime(value) {
  const [hours = "0", minutes = "0"] = String(value || "00:00").split(":");
  return {
    hours: Number(hours),
    minutes: Number(minutes)
  };
}

function formatMessageClock(time, compact, showPeriod) {
  const period = time.hours >= 12 ? "PM" : "AM";
  const hour = time.hours % 12 || 12;
  const minuteText = `:${String(time.minutes).padStart(2, "0")}`;
  return `${hour}${minuteText}${showPeriod ? ` ${period}` : ""}`;
}

function stages() {
  return SESSION_STAGES;
}

function stageTone(stage) {
  if (stage === "Completed") return "green";
  if (stage === "Payment Collection" || stage === "Player List Published") return "gold";
  if (stage === "Poll Live") return "blue";
  return "teal";
}

function skillTone(skillLevel) {
  const normalized = normalizeSkillLevel(skillLevel);
  if (normalized === "Professional") return "blue";
  if (normalized === "Beginner") return "gold";
  return "teal";
}

const TITLE_CASE_SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "per", "the", "to", "via", "with", "yet"]);

function titleCase(value) {
  const preserved = {
    ad: "AD",
    aed: "AED",
    flexiday: "FlexiDay",
    id: "ID",
    json: "JSON",
    mvp: "MVP",
    tbd: "TBD",
    url: "URL",
    whatsapp: "WhatsApp"
  };
  const words = String(value ?? "")
    .replaceAll("_", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) => {
      const isEdgeWord = index === 0 || index === words.length - 1;
      return word
        .split("-")
        .map((part) => titleCasePart(part, isEdgeWord, preserved))
        .join("-");
    })
    .join(" ");
}

function titleCasePart(part, forceTitle, preserved) {
  const match = part.match(/^([^A-Za-z0-9]*)([A-Za-z0-9']+)([^A-Za-z0-9]*)$/);
  if (!match) return part;
  const [, prefix, core, suffix] = match;
  const lower = core.toLowerCase();
  if (preserved[lower]) return `${prefix}${preserved[lower]}${suffix}`;
  if (!forceTitle && TITLE_CASE_SMALL_WORDS.has(lower)) return `${prefix}${lower}${suffix}`;
  if (/^[A-Z0-9]+$/.test(core) && core.length > 1) return `${prefix}${core}${suffix}`;
  return `${prefix}${lower.charAt(0).toUpperCase()}${lower.slice(1)}${suffix}`;
}

function attendanceLabel(value) {
  const map = {
    in: "I'm in",
    in_plus_1: "I'm in +1",
    in_plus_2: "I'm in +2",
    incomplete: "I need a racket",
    not_playing: "Not playing"
  };
  return map[value] || value;
}

function courtStatusText(session) {
  if (session.bookingStatus === "Booked") return "booked";
  if (session.bookingStatus === "Pre-booked") return "pre-booked";
  return "planned";
}

function buildPollMessage(session) {
  return renderTemplate(state.settings.pollTemplate || defaultPollTemplate(), templateData(session));
}

function buildFinalListMessage(session) {
  return renderTemplate(state.settings.finalListTemplate || defaultFinalListTemplate(), templateData(session));
}

function confirmedVotingEntries(allocation) {
  return allocation.capacity > 0 ? allocation.entries.slice(0, allocation.capacity) : [];
}

function listSkillSections(allocation) {
  const confirmed = confirmedVotingEntries(allocation);
  const sections = [
    ["Professional", confirmed.filter((entry) => entry.skillLevel === "Professional")],
    ["Intermediate", confirmed.filter((entry) => entry.skillLevel === "Intermediate")],
    ["Beginner", confirmed.filter((entry) => entry.skillLevel === "Beginner")],
    ["TBD", confirmed.filter((entry) => entry.skillLevel === "TBD")],
    ["Guest", confirmed.filter((entry) => entry.skillLevel === "Guest")]
  ].filter(([, entries]) => entries.length);
  return sections
    .map(([title, entries]) => [`🏸 ${title}`, entries.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n")].join("\n"))
    .join("\n\n");
}

function listCourtSectionsByVoteOrder(allocation, playersPerCourt) {
  const confirmed = confirmedVotingEntries(allocation);
  const courtSize = Math.max(1, Number(playersPerCourt || PLAYERS_PER_COURT));
  const sections = [];
  for (let index = 0; index < confirmed.length; index += courtSize) {
    sections.push(confirmed.slice(index, index + courtSize));
  }
  return sections
    .map((entries, index) => [`🏸 Court ${index + 1}`, entries.map((entry, entryIndex) => `${entryIndex + 1}. ${entry.name}`).join("\n")].join("\n"))
    .join("\n\n");
}

function listMessageCourtSectionsByVoteOrder(allocation, playersPerCourt) {
  const confirmed = confirmedVotingEntries(allocation);
  const courtSize = Math.max(1, Number(playersPerCourt || PLAYERS_PER_COURT));
  const sections = [];
  for (let index = 0; index < confirmed.length; index += courtSize) {
    sections.push(confirmed.slice(index, index + courtSize));
  }
  return sections
    .map((entries, index) => [
      `${String.fromCodePoint(0x1f3f8)} Court ${index + 1}`,
      entries.map((entry, entryIndex) => `${entryIndex + 1}. ${messageEntryName(entry)}`).join("\n")
    ].join("\n"))
    .join("\n\n");
}

function messageEntryName(entry) {
  const name = String(entry?.name || "").trim();
  if (!entry?.guest) return name;
  const guestIndex = messageGuestIndex(entry);
  if (!guestIndex) return name;
  const playerName = getPlayerName(entry.playerId);
  return name === `${playerName} Guest ${guestIndex}` ? `${playerName} +${guestIndex}` : name;
}

function messageGuestIndex(entry) {
  const match = String(entry?.key || "").match(/-guest-(\d+)$/);
  const guestIndex = match ? Number(match[1]) : 0;
  return Number.isInteger(guestIndex) && guestIndex > 0 ? guestIndex : 0;
}

function templateData(session) {
  const court = getCourt(session.courtId);
  const allocation = allocateSession(session);
  const playersPerCourt = getPlayersPerCourt(session);
  const listTitle = finalListTitle(session, allocation, playersPerCourt);
  const playerListSections = listMessageCourtSectionsByVoteOrder(allocation, playersPerCourt);
  const courtSections = allocation.courts
    .map((courtItem) => {
      const players = courtItem.players.map((entry, index) => `${index + 1}. ${messageEntryName(entry)}`).join("\n");
      const empty = Array.from({ length: Math.max(0, playersPerCourt - courtItem.players.length) }, (_, index) => `${courtItem.players.length + index + 1}.`).join("\n");
      return [`🏸 Court ${courtItem.number}`, players, empty].filter(Boolean).join("\n");
    })
    .join("\n\n");
  const waiting = allocation.waiting.length
    ? allocation.waiting.map((entry, index) => `${index + 1}. ${messageEntryName(entry)}`).join("\n")
    : "No waiting list";
  return {
    date: messageDate(session.date),
    time: messageTimeRange(session),
    compact_time: messageTimeRange(session, true),
    planned_courts: session.plannedCourts,
    booking_status: courtStatusText(session),
    court_name: messageCourtName(court),
    location_link: court?.location || "Location link not set",
    poll_options: STANDARD_POLL_OPTIONS,
    total_paid: currency(session.totalPaid),
    per_person_amount: currency(session.perPersonAmount),
    list_title: listTitle,
    player_list_sections: playerListSections || "No confirmed players yet",
    court_sections: playerListSections || "No confirmed players yet",
    waiting_list: waiting,
    final_list_cancellation_notice: finalListCancellationNotice(session, allocation),
    shuttle_cost: session.shuttleCost || state.settings.defaultShuttleCost,
    no_show_deadline: noShowDeadline(session)
  };
}

function finalListCancellationNotice(session, allocation = allocateSession(session)) {
  const deadline = noShowDeadline(session);
  if (allocation.waiting.length === 1) {
    return `In case of cancellation, please update by ${deadline}, so our friend in the waiting list has enough time to join.`;
  }
  if (allocation.waiting.length > 1) {
    return `In case of cancellation, please update by ${deadline}, so our friends in the waiting list have enough time to join.`;
  }
  return `In case of cancellation, please update by ${deadline}, so our friends in the group have time to vote and join.`;
}

function messageCourtName(court) {
  if (!court) return "Court not selected";
  const fullName = String(court.name || "").trim();
  const area = String(court.area || "").trim();
  const atIndex = fullName.lastIndexOf("@");
  const name = atIndex >= 0 ? fullName.slice(atIndex + 1).trim() : fullName;
  return [name || fullName || "Court not selected", area].filter(Boolean).join(", ");
}

function renderTemplate(template, values) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
}

function noShowDeadline(session) {
  const [hours = 0, minutes = 0] = String(session.startTime || "00:00").split(":").map(Number);
  const date = new Date(`${session.date || new Date().toISOString().slice(0, 10)}T12:00:00`);
  date.setHours(hours, minutes, 0, 0);
  date.setHours(date.getHours() - 3);
  return `${formatMessageTime(date.getHours(), date.getMinutes())} today`;
}

function formatMessageTime(hours, minutes = 0) {
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")} ${period}` : `${hour12} ${period}`;
}

function normalizePollTemplateCopy(template) {
  return String(template || "")
    .replace(/\{\{\s*poll_options\s*\}\}/g, STANDARD_POLL_OPTIONS)
    .replaceAll("Please Vote Here to Join Us", "please vote here to join us")
    .replaceAll("{{planned_courts}} Courts {{booking_status}}", "{{planned_courts}} courts {{booking_status}}")
    .replaceAll("Poll Options:", "Poll options:")
    .replaceAll("1. I'm In", "1. I'm in")
    .replaceAll("2. I'm In +1", "2. I'm in +1")
    .replaceAll("3. I'm In +2", "3. I'm in +2")
    .replaceAll("4. I Need a Racket", "4. I need a racket");
}

function normalizeFinalListTemplateCopy(template) {
  const normalized = String(template || "")
    .replaceAll(OLD_FINAL_LIST_NO_SHOW_NOTICE, FINAL_LIST_NO_SHOW_NOTICE)
    .replaceAll(PREVIOUS_FINAL_LIST_NO_SHOW_NOTICE, FINAL_LIST_NO_SHOW_NOTICE)
    .replaceAll(DYNAMIC_FINAL_LIST_NO_SHOW_NOTICE, FINAL_LIST_NO_SHOW_NOTICE)
    .replaceAll(FINAL_LIST_NO_SHOW_NOTICE, FINAL_LIST_CANCELLATION_NOTICE_PLACEHOLDER)
    .replaceAll(FINAL_LIST_CANCELLATION_WAITING_NOTICE, FINAL_LIST_CANCELLATION_NOTICE_PLACEHOLDER)
    .replaceAll("Total Paid:", "Total paid:")
    .replaceAll("{{per_person_amount}} / Person", "{{per_person_amount}} / person")
    .replaceAll("💰 Court Charges: To Be Split Equally Among Confirmed Players", "💰 Court charges: to be split equally among confirmed players")
    .replaceAll("🏸 Shuttle Charges:", "🏸 Shuttle charges:")
    .replaceAll("AED per Player", "AED per player");
  return insertFinalListVoteOrderNotice(normalized);
}

function insertFinalListVoteOrderNotice(template) {
  const text = String(template || "");
  if (text.includes(FINAL_LIST_VOTE_ORDER_NOTICE)) return text;
  return text.replace(
    /(\n)([^\n]*Court charges: to be split equally among confirmed players)/,
    `\n${FINAL_LIST_VOTE_ORDER_NOTICE}$1$2`
  );
}

function defaultPollTemplate() {
  return [
    "Hi Makkalae 👋🏻, please vote here to join us on 🗓️ {{date}}.",
    "⏱️{{time}} - {{planned_courts}} courts {{booking_status}}",
    "⚡{{court_name}}",
    "📍{{location_link}}",
    "",
    "Poll options:",
    STANDARD_POLL_OPTIONS
  ].join("\n");
}

function defaultFinalListTemplate() {
  return [
    "🏸 {{date}} 🏸",
    "🕗 {{compact_time}} 🕗",
    "",
    "⚡{{court_name}}",
    "📍{{location_link}}",
    "",
    "Total paid: {{total_paid}}",
    "💳 {{per_person_amount}} / person",
    "",
    "✅ {{list_title}}",
    "━━━━━━━━━━━━━━",
    "{{player_list_sections}}",
    "━━━━━━━━━━━━━━━",
    "🏸 Waiting List",
    "{{waiting_list}}",
    "━━━━━━━━━━━━━━━",
    FINAL_LIST_VOTE_ORDER_NOTICE,
    "💰 Court charges: to be split equally among confirmed players",
    "🏸 Shuttle charges: +{{shuttle_cost}} AED per player",
    "",
    FINAL_LIST_CANCELLATION_NOTICE_PLACEHOLDER
  ].join("\n");
}

function finalListTitle(session, allocation = allocateSession(session), playersPerCourt = getPlayersPerCourt(session)) {
  const publishedStages = ["Player List Published", "Payment Collection", "Completed"];
  const courtsAreFull = allocation.courts.length > 0 && allocation.courts.every((court) => court.players.length >= playersPerCourt);
  const expectedPlayersAreFull = allocation.capacity > 0 && allocation.confirmedCount >= allocation.capacity;
  return publishedStages.includes(session.stage) || expectedPlayersAreFull || courtsAreFull ? "Final List" : "Draft List";
}

function buildPaymentReminder(session) {
  const pending = Object.values(session.payments || {}).filter((payment) => paymentEffectiveStatus(session, payment) !== "Paid");
  const pendingPlayers = pending.map((payment) => `${getPlayerName(payment.playerId)} - ${currency(payment.amount || session.perPersonAmount)}`).join("\n");
  return [
    `Payment reminder - AD Smashers ${session.type}`,
    "",
    `Date: ${formatDate(session.date)}`,
    `Amount pending: ${currency(pending.reduce((total, payment) => total + Number(payment.amount || session.perPersonAmount || 0), 0))}`,
    "",
    "Pending players:",
    pendingPlayers || "No pending players.",
    "",
    "Please complete the payment when possible."
  ].join("\n");
}

function buildBookingRequest(court) {
  const session = getSession();
  if (!session) return "Create a session before copying a booking request.";
  return [
    `Hi ${court?.contact || "There"},`,
    "",
    "We would like to check badminton court availability.",
    "",
    `Date: ${formatDate(session.date)}`,
    `Time: ${timeRange(session)}`,
    `Courts needed: ${session.plannedCourts}`,
    "Duration: 2 hours",
    "",
    "Please confirm availability and total cost.",
    "",
    "Thank you."
  ].join("\n");
}
