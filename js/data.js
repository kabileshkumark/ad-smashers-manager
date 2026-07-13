function emptyState() {
  return {
    settings: {
      clubName: "AD Smashers Tamil Club",
      adminName: "",
      organizerPlayerId: "",
      coOrganizerPlayerId: "",
      defaultPlayersPerCourt: PLAYERS_PER_COURT,
      defaultShuttleCost: 5,
      shuttleType: "Yonex Mavis 350 Green Cap",
      currency: "AED",
      pollTemplate: defaultPollTemplate(),
      finalListTemplate: defaultFinalListTemplate()
    },
    groups: [],
    courts: [],
    players: [],
    sessions: [],
    activities: [],
    paymentGroups: [],
    paymentTransactions: [],
    advances: {}
  };
}

function migrateState(data = {}, options = {}) {
  const source = data || {};
  const useSeedCollections = options.useSeedCollections !== false;
  const seeded = emptyState();
  const collectionFallback = (value, seededValue) => {
    if (Array.isArray(value)) return value;
    return useSeedCollections ? seededValue : [];
  };
  const migrated = {
    ...seeded,
    ...source,
    settings: { ...seeded.settings, ...(source.settings || {}) },
    groups: collectionFallback(source.groups, seeded.groups),
    courts: collectionFallback(source.courts, seeded.courts),
    players: collectionFallback(source.players, seeded.players),
    sessions: collectionFallback(source.sessions, seeded.sessions),
    activities: collectionFallback(source.activities, seeded.activities),
    paymentGroups: collectionFallback(source.paymentGroups, seeded.paymentGroups || []),
    paymentTransactions: collectionFallback(source.paymentTransactions, seeded.paymentTransactions || []),
    advances: source.advances || (useSeedCollections ? seeded.advances : {}) || {}
  };
  migrated.settings.pollTemplate = normalizePollTemplateCopy(migrated.settings.pollTemplate || defaultPollTemplate());
  if (!migrated.settings.finalListTemplate) {
    migrated.settings.finalListTemplate = defaultFinalListTemplate();
  } else {
    migrated.settings.finalListTemplate = normalizeFinalListTemplateCopy(migrated.settings.finalListTemplate);
  }
  delete migrated.reminders;
  migrated.courts = migrated.courts.map((court) => normalizeCourt(court));
  migrated.players = migrated.players.map((player) => normalizePlayer(player));
  migrated.sessions = migrated.sessions.map((session) => normalizeSession(session, migrated.settings));
  migrated.sessions.forEach((session) => syncSessionPayments(session, migrated.players, migrated.settings));
  migrated.activities = migrated.activities.map((activity) => normalizeActivity(activity, migrated.players));
  migrated.paymentGroups = (migrated.paymentGroups || [])
    .map((group) => normalizePaymentGroup(group, migrated.players))
    .filter((group) => group.playerIds.length);
  migrated.paymentTransactions = (migrated.paymentTransactions || [])
    .map((transaction) => normalizePaymentTransaction(transaction, migrated.players))
    .filter((transaction) => transaction.paidById && transaction.playerIds.length);
  const playerIds = new Set(migrated.players.map((player) => player.id));
  migrated.advances = Object.fromEntries(
    Object.entries(migrated.advances || {})
      .map(([playerId, amount]) => [playerId, Number(amount || 0)])
      .filter(([playerId, amount]) => playerIds.has(playerId) && amount > 0)
  );
  assignGroupPaymentAdvancesToPayers(migrated);
  const previousState = state;
  state = migrated;
  migrated.sessions.forEach((session) => applyAutomaticSessionStage(session));
  state = previousState;
  return migrated;
}

function restoreStateFromBackup(data) {
  return migrateState(data, { useSeedCollections: false });
}

function activityIsShuttle(activity) {
  return String(activity?.name || "").toLowerCase().includes("shuttle");
}

function seedState() {
  return emptyState();
}
function normalizeCourt(court) {
  const { courtsAvailable, typicalRate, preferredSlots, ...rest } = court;
  const contactNumber = court.phone || court.whatsapp || "";
  let aedPerHour = Number(court.aedPerHour ?? typicalRate ?? 0);
  if (court.id === "court-bat-ball-ens" && aedPerHour === 200) aedPerHour = 50;
  if (court.id === "court-ens-girls-school" && aedPerHour === 240) aedPerHour = 60;
  return {
    ...rest,
    phone: contactNumber,
    whatsapp: contactNumber,
    playoLink: court.playoLink || "",
    aedPerHour
  };
}

function playerSeed(name, displayName, preferredDays, paymentMethod, skillLevel = "TBD") {
  return {
    id: createId("player"),
    name,
    displayName,
    phone: "",
    whatsapp: "",
    preferredDays,
    skillLevel: normalizeSkillLevel(skillLevel),
    racketOwned: DEFAULT_RACKET_OWNED,
    usuallyNeedsRacket: false,
    paymentMethod,
    attendanceCount: 0,
    noShowCount: 0,
    pendingBalance: 0,
    notes: "",
    active: true
  };
}

function interleavedCourtResponses(courts, playerIdLookup) {
  const responses = [];
  const maxLength = Math.max(...courts.map((court) => court.length));
  for (let index = 0; index < maxLength; index += 1) {
    courts.forEach((court) => {
      const playerName = court[index];
      const playerId = playerName ? playerIdLookup(playerName) : null;
      if (playerId) {
        responses.push(responseSeed(playerId, responses.length + 1, "in", 0, false));
      }
    });
  }
  return responses;
}

function normalizeSkillLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "tbd" || normalized === "unknown") return "TBD";
  if (normalized === "professional" || normalized === "profession" || normalized === "pro") return "Professional";
  if (normalized === "beginner") return "Beginner";
  if (normalized === "intermediate") return "Intermediate";
  return "TBD";
}

function normalizePaymentMethod(value) {
  const method = String(value || "").trim();
  if (!method) return DEFAULT_PAYMENT_METHOD;
  if (method.toLowerCase() === "bank transfer") return "Bank";
  return method;
}

function normalizePlayer(player) {
  const contactNumber = player.phone || player.whatsapp || "";
  const racketOwned = player.racketOwned || DEFAULT_RACKET_OWNED;
  return {
    ...player,
    displayName: player.name || player.displayName || "Player",
    phone: contactNumber,
    whatsapp: contactNumber,
    preferredDays: player.preferredDays || "",
    skillLevel: normalizeSkillLevel(player.skillLevel),
    paymentMethod: normalizePaymentMethod(player.paymentMethod),
    racketOwned,
    usuallyNeedsRacket: player.usuallyNeedsRacket ?? racketOwned === "No",
    active: player.active !== false
  };
}

function storedNumberOrFallback(value, fallback) {
  if (value === undefined || value === null || value === "") return Number(fallback || 0);
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : Number(fallback || 0);
}

function normalizeCountMap(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [key, Math.max(0, Math.floor(Number(count || 0)))])
      .filter(([key, count]) => key && count > 0)
  );
}

function normalizeTextMap(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, text]) => [String(key || ""), String(text || "").trim()])
      .filter(([key, text]) => key && text)
  );
}

function normalizeSession(session, settings = state?.settings || {}) {
  const playersPerCourt = Number(session.playersPerCourt || settings.defaultPlayersPerCourt || PLAYERS_PER_COURT);
  const type = sessionTypeForDate(session.date, session.type);
  const fallbackExpectedPlayers = calculateExpectedPlayers(session.bookedCourts, playersPerCourt);
  const expectedPlayers = storedNumberOrFallback(session.expectedPlayers, fallbackExpectedPlayers);
  const waterCost = storedNumberOrFallback(session.waterCost, 0);
  const fallbackPerPersonAmount = calculatePerPersonRate(
    session.totalPaid,
    expectedPlayers,
    session.shuttleCost ?? settings.defaultShuttleCost
  );
  const normalized = {
    ...session,
    type,
    groupId: sessionGroupIdFor({ ...session, type }),
    stage: normalizeSessionStage(session),
    playersPerCourt,
    expectedPlayers,
    waterCost,
    perPersonAmount: storedNumberOrFallback(session.perPersonAmount, fallbackPerPersonAmount),
    responses: orderedSessionResponses({ responses: session.responses || [] }).map((response, index) => ({
      ...response,
      voteOrder: index + 1
    })),
    payments: Object.fromEntries(
      Object.entries(session.payments || {}).map(([playerId, payment]) => [
        playerId,
        {
          ...payment,
          method: normalizePaymentMethod(payment?.method)
        }
      ])
    ),
    attendanceManual: session.attendanceManual === true,
    manualAttendedPlayerIds: uniqueIds(session.manualAttendedPlayerIds || []),
    removedGuestKeys: uniqueIds(session.removedGuestKeys || []),
    manualGuestCounts: normalizeCountMap(session.manualGuestCounts),
    guestNames: normalizeTextMap(session.guestNames),
    sent: session.sent || {}
  };
  if (Array.isArray(session.attendedPlayerIds)) {
    normalized.attendedPlayerIds = uniqueIds(session.attendedPlayerIds);
  }
  return normalized;
}

function normalizeActivity(activity, players = state?.players || []) {
  const activeIds = new Set(players.map((player) => player.id));
  const playerIds = uniqueIds(activity.playerIds || Object.keys(activity.shares || {})).filter((id) => activeIds.has(id));
  return syncActivityShares({
    id: activity.id || createId("activity"),
    name: activity.name || "Activity",
    date: activity.date || new Date().toISOString().slice(0, 10),
    totalPaid: Number(activity.totalPaid || 0),
    paidById: activeIds.has(activity.paidById) ? activity.paidById : "",
    playerIds,
    notes: String(activity.notes || "").trim(),
    shares: activity.shares || {}
  });
}

function normalizePaymentGroup(group, players = state?.players || []) {
  const activeIds = new Set(players.filter((player) => player.active !== false).map((player) => player.id));
  const playerIds = uniqueIds(group?.playerIds || []).filter((id) => activeIds.has(id));
  const payerId = activeIds.has(group?.payerId) ? group.payerId : playerIds[0] || "";
  return {
    id: group?.id || createId("payment-group"),
    name: String(group?.name || "Payment Group").trim() || "Payment Group",
    payerId,
    playerIds,
    guests: normalizePaymentGroupGuests(group?.guests || []),
    active: group?.active !== false
  };
}

function normalizePaymentGroupGuests(guests = []) {
  return (Array.isArray(guests) ? guests : [])
    .map((guest, index) => {
      const isTextGuest = typeof guest === "string";
      const id = isTextGuest ? "" : String(guest?.id || "");
      const ownerPlayerId = isTextGuest ? "" : String(guest?.ownerPlayerId || guest?.playerId || "");
      const name = String(isTextGuest ? guest : guest?.name || "").trim() || `Guest ${index + 1}`;
      return {
        id: id || createId("payment-group-guest"),
        ownerPlayerId,
        name
      };
    })
    .filter((guest) => guest.id);
}

function paymentGroupGuestNames(groupOrDraft) {
  return (Array.isArray(groupOrDraft?.guests) ? groupOrDraft.guests : []).map((guest, index) => String(guest?.name || "").trim() || `Guest ${index + 1}`);
}

function sessionGuestName(session, guestKey, fallback) {
  return String(session?.guestNames?.[guestKey] || "").trim() || fallback;
}

function ensureSessionGuestNames(session) {
  if (!session.guestNames || typeof session.guestNames !== "object" || Array.isArray(session.guestNames)) {
    session.guestNames = {};
  }
  return session.guestNames;
}

function updateSessionGuestName(sessionId, guestKey, name) {
  const session = getSession(sessionId);
  if (!session || !guestKey) return false;
  const guestNames = ensureSessionGuestNames(session);
  const cleanName = String(name || "").trim();
  if (cleanName) {
    guestNames[guestKey] = cleanName;
  } else {
    delete guestNames[guestKey];
  }
  saveState();
  return true;
}

function normalizePaymentTransaction(transaction, players = state?.players || []) {
  const activeIds = new Set(players.map((player) => player.id));
  const allocations = (transaction?.allocations || [])
    .map((allocation) => ({
      type: allocation.type || "",
      playerId: allocation.playerId || "",
      sessionId: allocation.sessionId || "",
      activityId: allocation.activityId || "",
      amount: Number(allocation.amount || 0)
    }))
    .filter((allocation) => activeIds.has(allocation.playerId) && allocation.amount > 0);
  return {
    id: transaction?.id || createId("payment-transaction"),
    type: transaction?.type || "group-payment",
    date: transaction?.date || new Date().toISOString().slice(0, 10),
    paidById: activeIds.has(transaction?.paidById) ? transaction.paidById : "",
    groupId: transaction?.groupId || "",
    playerIds: uniqueIds(transaction?.playerIds || allocations.map((allocation) => allocation.playerId)).filter((id) => activeIds.has(id)),
    amountPaid: Number(transaction?.amountPaid || 0),
    appliedAmount: Number(transaction?.appliedAmount || 0),
    advanceAmount: Number(transaction?.advanceAmount || 0),
    allocations
  };
}

function normalizeSessionStage(session) {
  const stage = String(session?.stage || "");
  if (stage === "Booking In Progress" || stage === "Court Booked" || stage === "Booked") {
    return session?.sent?.poll || (session?.responses || []).length ? "Poll Live" : "Draft";
  }
  return normalizeStage(stage);
}

function normalizeStage(stage) {
  if (stage === "Poll Closed") return "Poll Live";
  if (stage === "Booking In Progress" || stage === "Court Booked" || stage === "Booked") return "Draft";
  return SESSION_STAGES.includes(stage) ? stage : "Draft";
}

function responseSeed(playerId, voteOrder, attendanceChoice, guestCount, racketNeeded) {
  return {
    id: createId("response"),
    playerId,
    voteOrder,
    attendanceChoice,
    guestCount,
    racketNeeded,
    rawOptions: rawOptionsFor(attendanceChoice, racketNeeded),
    notes: ""
  };
}

function rawOptionsFor(attendanceChoice, racketNeeded) {
  const options = [];
  if (attendanceChoice === "in") options.push("I'm in");
  if (attendanceChoice === "in_plus_1") options.push("I'm in +1");
  if (attendanceChoice === "in_plus_2") options.push("I'm in +2");
  if (attendanceChoice === "not_playing") options.push("Not playing");
  if (attendanceChoice === "incomplete" || racketNeeded) options.push("I need a racket");
  return options;
}

function guestCountForVote(attendanceChoice) {
  if (attendanceChoice === "in_plus_2") return 2;
  if (attendanceChoice === "in_plus_1") return 1;
  return 0;
}

function updateResponseVote(sessionId, responseId, attendanceChoice) {
  const session = getSession(sessionId);
  const response = session?.responses?.find((item) => item.id === responseId);
  if (!response) return;
  response.attendanceChoice = POLL_VOTE_OPTIONS.includes(attendanceChoice) ? attendanceChoice : "in";
  response.guestCount = guestCountForVote(response.attendanceChoice);
  response.racketNeeded = false;
  response.rawOptions = rawOptionsFor(response.attendanceChoice, response.racketNeeded);
  pruneRemovedGuestsForResponse(session, response.id, response.guestCount);
  syncSessionPayments(session);
  applyAutomaticSessionStage(session);
  saveState();
  render();
}

function attendanceChoiceForGuestCount(guestCount) {
  const count = Math.max(0, Math.floor(Number(guestCount || 0)));
  if (count >= 2) return "in_plus_2";
  if (count === 1) return "in_plus_1";
  return "in";
}

function setResponseGuestCount(response, guestCount) {
  const count = Math.max(0, Math.floor(Number(guestCount || 0)));
  response.guestCount = count;
  if (["in", "in_plus_1", "in_plus_2"].includes(response.attendanceChoice)) {
    response.attendanceChoice = attendanceChoiceForGuestCount(count);
  }
  response.rawOptions = rawOptionsFor(response.attendanceChoice, response.racketNeeded);
}

function pruneRemovedGuestsForResponse(session, responseId, guestCount) {
  if (!Array.isArray(session?.removedGuestKeys)) return;
  const maxGuestCount = Math.max(0, Math.floor(Number(guestCount || 0)));
  session.removedGuestKeys = session.removedGuestKeys.filter((key) => {
    const text = String(key || "");
    if (!text.startsWith(`${responseId}-guest-`)) return true;
    const guestIndex = Number(text.replace(`${responseId}-guest-`, ""));
    return guestIndex > 0 && guestIndex <= maxGuestCount;
  });
}

function restoreResponseGuestAttendance(session, responseId, guestIndex) {
  if (!Array.isArray(session?.removedGuestKeys)) return;
  const key = `${responseId}-guest-${guestIndex}`;
  session.removedGuestKeys = session.removedGuestKeys.filter((item) => item !== key);
}

function addResponseGuest(session, responseId) {
  const response = session?.responses?.find((item) => item.id === responseId);
  const currentCount = Number(response?.guestCount || 0);
  if (!response) return false;
  const nextCount = currentCount + 1;
  setResponseGuestCount(response, nextCount);
  restoreResponseGuestAttendance(session, response.id, nextCount);
  syncSessionPayments(session);
  applyAutomaticSessionStage(session);
  return true;
}

function removeResponseGuest(session, responseId) {
  const response = session?.responses?.find((item) => item.id === responseId);
  if (!response || Number(response.guestCount || 0) <= 0) return false;
  const nextCount = Number(response.guestCount || 0) - 1;
  setResponseGuestCount(response, nextCount);
  pruneRemovedGuestsForResponse(session, response.id, nextCount);
  syncSessionPayments(session);
  applyAutomaticSessionStage(session);
  return true;
}

function manualAttendanceGuestKey(session, playerId, guestIndex) {
  return `manual-${session?.id || "session"}-${playerId}-guest-${guestIndex}`;
}

function manualGuestCount(session, playerId) {
  const count = session?.manualGuestCounts?.[playerId];
  return Math.max(0, Math.floor(Number(count || 0)));
}

function ensureManualGuestCounts(session) {
  if (!session.manualGuestCounts || typeof session.manualGuestCounts !== "object" || Array.isArray(session.manualGuestCounts)) {
    session.manualGuestCounts = {};
  }
  return session.manualGuestCounts;
}

function pruneRemovedManualGuestsForPlayer(session, playerId, guestCount) {
  if (!Array.isArray(session?.removedGuestKeys)) return;
  const maxGuestCount = Math.max(0, Math.floor(Number(guestCount || 0)));
  const prefix = `manual-${session?.id || "session"}-${playerId}-guest-`;
  session.removedGuestKeys = session.removedGuestKeys.filter((key) => {
    const text = String(key || "");
    if (!text.startsWith(prefix)) return true;
    const guestIndex = Number(text.replace(prefix, ""));
    return guestIndex > 0 && guestIndex <= maxGuestCount;
  });
}

function restoreManualGuestAttendance(session, playerId, guestIndex) {
  if (!Array.isArray(session?.removedGuestKeys)) return;
  const key = manualAttendanceGuestKey(session, playerId, guestIndex);
  session.removedGuestKeys = session.removedGuestKeys.filter((item) => item !== key);
}

function setManualGuestCount(session, playerId, guestCount) {
  if (!session || !playerId) return false;
  const count = Math.max(0, Math.floor(Number(guestCount || 0)));
  const counts = ensureManualGuestCounts(session);
  if (count > 0) {
    counts[playerId] = count;
  } else {
    delete counts[playerId];
  }
  pruneRemovedManualGuestsForPlayer(session, playerId, count);
  return true;
}

function clearManualGuestCount(session, playerId) {
  return setManualGuestCount(session, playerId, 0);
}

function addManualAttendanceGuest(session, playerId) {
  if (!session || !playerId) return false;
  if (!effectiveAttendedPlayerIds(session).includes(playerId)) {
    setManualAttendedPlayerIds(session, [...manualAttendedPlayerIds(session), playerId]);
  }
  ensureSessionAttendance(session);
  const nextCount = manualGuestCount(session, playerId) + 1;
  setManualGuestCount(session, playerId, nextCount);
  restoreManualGuestAttendance(session, playerId, nextCount);
  syncSessionPayments(session);
  applyAutomaticSessionStage(session);
  return true;
}

function getSession(id = activeSessionId) {
  return state.sessions.find((session) => session.id === id) || state.sessions[0] || null;
}

function getCourt(id) {
  return state.courts.find((court) => court.id === id) || state.courts[0] || null;
}

function getGroup(id) {
  return state.groups.find((group) => group.id === id) || state.groups[0];
}

function sessionWeekday(dateValue) {
  const value = String(dateValue || "").trim();
  if (!value) return null;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function sessionTypeForDate(dateValue, fallbackType = "Friday") {
  const weekday = sessionWeekday(dateValue);
  if (weekday === 5) return "Friday";
  if (weekday === 6) return "Saturday";
  if (weekday !== null) return "FlexiDay";
  const normalizedType = String(fallbackType || "").trim().toLowerCase();
  if (normalizedType === "saturday") return "Saturday";
  if (normalizedType === "flexiday" || normalizedType === "flexi day" || normalizedType === "flexi") return "FlexiDay";
  return "Friday";
}

function sessionDefaultTimesForType(type) {
  const normalizedType = sessionTypeForDate("", type);
  if (normalizedType === "Friday") return { startTime: "19:00", endTime: "21:00" };
  if (normalizedType === "Saturday") return { startTime: "18:00", endTime: "20:00" };
  return { startTime: "20:00", endTime: "22:00" };
}

function sessionDefaultTimesForDate(dateValue, fallbackType = "Friday") {
  return sessionDefaultTimesForType(sessionTypeForDate(dateValue, fallbackType));
}

function sessionGroupIdFor(session = {}) {
  const type = sessionTypeForDate(session.date, session.type);
  if (type === "Saturday") return "group-saturday";
  if (type === "FlexiDay") return "group-flexiday";
  return "group-friday";
}

function getSessionGroup(session) {
  const groupId = sessionGroupIdFor(session);
  return state.groups.find((group) => group.id === groupId) || null;
}

function settingsGroups() {
  return SETTINGS_GROUP_IDS.map((id) => state.groups.find((group) => group.id === id)).filter(Boolean);
}

function getPlayer(id) {
  return state.players.find((player) => player.id === id);
}

function getPlayerName(id) {
  const player = getPlayer(id);
  return player ? player.name || player.displayName : "Unknown player";
}

function playerRoleConfig(role) {
  const configs = {
    organizer: {
      field: "organizerPlayerId",
      label: "Organizer",
      icon: "organizer"
    },
    coOrganizer: {
      field: "coOrganizerPlayerId",
      label: "Co-Organizer",
      icon: "coOrganizer"
    }
  };
  return configs[role] || configs.organizer;
}

function roleFreePlayerIds(settings = state.settings) {
  return uniqueIds([settings?.organizerPlayerId, settings?.coOrganizerPlayerId]);
}

function playerRoleLabels(playerId, settings = state.settings) {
  return ["organizer", "coOrganizer"]
    .filter((role) => settings?.[playerRoleConfig(role).field] === playerId)
    .map((role) => playerRoleConfig(role).label);
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function activePlayersAlphabetical() {
  return state.players
    .filter((player) => player.active !== false)
    .sort((a, b) => (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "", undefined, { sensitivity: "base" }));
}

function playerAttendanceCount(playerId) {
  if (!playerId) return 0;
  return (state.sessions || []).filter((session) => {
    return sessionIsCollectible(session) && effectiveAttendedPlayerIds(session).includes(playerId);
  }).length;
}

function playersWithRolesFirst() {
  const activePlayers = activePlayersAlphabetical();
  const roleIds = uniqueIds([state.settings?.organizerPlayerId, state.settings?.coOrganizerPlayerId]);
  const roleOrder = new Map(roleIds.map((id, index) => [id, index]));
  return [...activePlayers].sort((a, b) => {
    const aAttendance = playerAttendanceCount(a.id);
    const bAttendance = playerAttendanceCount(b.id);
    const aHasAttendance = aAttendance > 0;
    const bHasAttendance = bAttendance > 0;
    if (aHasAttendance !== bHasAttendance) return aHasAttendance ? -1 : 1;
    const aRoleOrder = roleOrder.has(a.id) ? roleOrder.get(a.id) : Number.POSITIVE_INFINITY;
    const bRoleOrder = roleOrder.has(b.id) ? roleOrder.get(b.id) : Number.POSITIVE_INFINITY;
    if (aRoleOrder !== bRoleOrder) return aRoleOrder - bRoleOrder;
    return (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "", undefined, { sensitivity: "base" });
  });
}

function captureActivityDraft(form) {
  if (!form) return activityDraft;
  const formData = new FormData(form);
  const activeIds = new Set(state.players.filter((player) => player.active !== false).map((player) => player.id));
  const paidById = String(formData.get("paidById") || "");
  activityDraft = {
    id: String(formData.get("id") || activityDraft.id || ""),
    name: String(formData.get("name") || ""),
    date: String(formData.get("date") || new Date().toISOString().slice(0, 10)),
    totalPaid: String(formData.get("totalPaid") || ""),
    paidById: activeIds.has(paidById) ? paidById : "",
    playerIds: uniqueIds(formData.getAll("playerIds")).filter((id) => activeIds.has(id)),
    notes: String(formData.get("notes") || ""),
    shuttlePurchase: formData.get("shuttlePurchase") === "true" || Boolean(activityDraft.shuttlePurchase)
  };
  return activityDraft;
}

function captureGroupPaymentDraft(form) {
  if (!form) return groupPaymentDraft;
  const formData = new FormData(form);
  const activeIds = new Set(state.players.filter((player) => player.active !== false).map((player) => player.id));
  const paidById = String(formData.get("paidById") || "");
  groupPaymentDraft = {
    groupId: String(formData.get("groupId") || groupPaymentDraft.groupId || ""),
    paidById: activeIds.has(paidById) ? paidById : "",
    amountPaid: String(formData.get("amountPaid") || ""),
    saveAsGroupName: String(formData.get("saveAsGroupName") || ""),
    playerIds: uniqueIds(formData.getAll("playerIds")).filter((id) => activeIds.has(id))
  };
  return groupPaymentDraft;
}

function capturePaymentGroupDraft(form) {
  if (!form) return paymentGroupDraft;
  const formData = new FormData(form);
  const activeIds = new Set(state.players.filter((player) => player.active !== false).map((player) => player.id));
  const payerId = String(formData.get("payerId") || "");
  paymentGroupDraft = {
    id: String(formData.get("id") || paymentGroupDraft.id || ""),
    name: String(formData.get("name") || ""),
    payerId: activeIds.has(payerId) ? payerId : "",
    playerIds: uniqueIds(formData.getAll("playerIds")).filter((id) => activeIds.has(id)),
    guests: normalizePaymentGroupGuests(paymentGroupDraft.guests || [])
  };
  return paymentGroupDraft;
}

function addPaymentGroupDraftGuest(ownerPlayerId = "") {
  const guests = normalizePaymentGroupGuests(paymentGroupDraft.guests || []);
  const playerId = String(ownerPlayerId || "");
  const ownerName = playerId ? getPlayerName(playerId) : "";
  const ownerGuestCount = guests.filter((guest) => guest.ownerPlayerId === playerId).length;
  const guest = {
    id: createId("payment-group-guest"),
    ownerPlayerId: playerId,
    name: ownerName ? `${ownerName} Guest ${ownerGuestCount + 1}` : `Guest ${guests.length + 1}`
  };
  paymentGroupDraft.guests = [...guests, guest];
  return guest;
}

function removePaymentGroupDraftGuest(guestId) {
  paymentGroupDraft.guests = normalizePaymentGroupGuests(paymentGroupDraft.guests || []).filter((guest) => guest.id !== guestId);
  return paymentGroupDraft.guests;
}

function updatePaymentGroupDraftGuestName(guestId, name) {
  paymentGroupDraft.guests = normalizePaymentGroupGuests(paymentGroupDraft.guests || []).map((guest) =>
    guest.id === guestId ? { ...guest, name: String(name || "") } : guest
  );
  return paymentGroupDraft.guests;
}
