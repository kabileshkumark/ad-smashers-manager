function sortSessions(sessions = state.sessions) {
  return [...sessions].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function buildEntries(session, playersList = state.players) {
  const entries = [];
  const responses = [...(session.responses || [])].sort((a, b) => Number(a.voteOrder) - Number(b.voteOrder));
  responses.forEach((response) => {
    if (response.attendanceChoice === "not_playing" || response.attendanceChoice === "incomplete") {
      return;
    }
    const player = playersList.find((item) => item.id === response.playerId);
    const playerName = player ? player.name || player.displayName : "Unknown player";
    const skillLevel = normalizeSkillLevel(player?.skillLevel);
    entries.push({
      key: `${response.id}-main`,
      responseId: response.id,
      playerId: response.playerId,
      name: playerName,
      skillLevel,
      skillRank: SKILL_RANK[skillLevel],
      voteOrder: response.voteOrder,
      racketNeeded: response.racketNeeded,
      guest: false
    });
    for (let index = 1; index <= Number(response.guestCount || 0); index += 1) {
      const key = `${response.id}-guest-${index}`;
      entries.push({
        key,
        responseId: response.id,
        playerId: response.playerId,
        name: sessionGuestName(session, key, `${playerName} Guest ${index}`),
        skillLevel: "Guest",
        skillRank: SKILL_RANK.Guest,
        voteOrder: response.voteOrder,
        racketNeeded: false,
        guest: true
      });
    }
  });
  return entries;
}

function votedPlayerIds(session, playersList = state.players) {
  return uniqueIds(
    buildEntries(session, playersList)
      .filter((entry) => !entry.guest)
      .map((entry) => entry.playerId)
  );
}

function confirmedVotedPlayerIds(session, playersList = state.players) {
  return uniqueIds(confirmedSessionEntries(session, playersList).filter((entry) => !entry.guest).map((entry) => entry.playerId));
}

function confirmedSessionEntries(session, playersList = state.players) {
  const allocation = allocateSession(session, playersList);
  return allocation.capacity > 0 ? allocation.entries.slice(0, allocation.capacity) : allocation.entries;
}

function defaultAttendedPlayerIds(session, playersList = state.players) {
  const confirmedIds = confirmedVotedPlayerIds(session, playersList);
  return confirmedIds.length ? confirmedIds : votedPlayerIds(session, playersList);
}

function sessionResponsePlayerIds(session) {
  return uniqueIds((session?.responses || []).map((response) => response.playerId));
}

function storedAttendedPlayerIds(session) {
  return Array.isArray(session?.attendedPlayerIds) ? uniqueIds(session.attendedPlayerIds) : [];
}

function explicitManualAttendedPlayerIds(session) {
  return uniqueIds(session?.manualAttendedPlayerIds || []);
}

function legacyManualAttendedPlayerIds(session, playersList = state.players) {
  if (session?.attendanceManual === true || explicitManualAttendedPlayerIds(session).length) return [];
  const savedIds = storedAttendedPlayerIds(session);
  if (!savedIds.length) return [];
  const responseIds = new Set(sessionResponsePlayerIds(session));
  const activeIds = new Set(playersList.filter((player) => player.active !== false).map((player) => player.id));
  return savedIds.filter((playerId) => activeIds.has(playerId) && !responseIds.has(playerId));
}

function manualAttendedPlayerIds(session, playersList = state.players) {
  return uniqueIds([...explicitManualAttendedPlayerIds(session), ...legacyManualAttendedPlayerIds(session, playersList)]);
}

function setManualAttendedPlayerIds(session, playerIds = []) {
  session.manualAttendedPlayerIds = uniqueIds(playerIds);
  return session.manualAttendedPlayerIds;
}

function effectiveAttendedPlayerIds(session, playersList = state.players) {
  const savedIds = storedAttendedPlayerIds(session);
  if (session.attendanceManual === true && Array.isArray(session.attendedPlayerIds)) {
    return uniqueIds([...savedIds, ...manualAttendedPlayerIds(session, playersList)]);
  }
  return uniqueIds([...defaultAttendedPlayerIds(session, playersList), ...manualAttendedPlayerIds(session, playersList)]);
}

function manualConfirmedPlayerIds(session, playersList = state.players) {
  const votedIds = new Set(votedPlayerIds(session, playersList));
  return effectiveAttendedPlayerIds(session, playersList).filter((playerId) => !votedIds.has(playerId));
}

function effectiveAttendedEntries(session, playersList = state.players) {
  const attendedIds = new Set(effectiveAttendedPlayerIds(session, playersList));
  const removedGuestKeys = new Set(session?.removedGuestKeys || []);
  const sourceEntries = confirmedSessionEntries(session, playersList);
  const entries = sourceEntries.filter((entry) => {
    if (!attendedIds.has(entry.playerId)) return false;
    return !entry.guest || !removedGuestKeys.has(entry.key);
  });
  const displayedPlayerIds = new Set();
  const manualGuestPlayerIds = new Set();
  const withManualGuests = entries.flatMap((entry, index) => {
    const output = [entry];
    if (!entry.guest) displayedPlayerIds.add(entry.playerId);
    const hasLaterEntryForPlayer = entries.slice(index + 1).some((item) => item.playerId === entry.playerId);
    if (!entry.guest && !hasLaterEntryForPlayer && !manualGuestPlayerIds.has(entry.playerId)) {
      manualGuestPlayerIds.add(entry.playerId);
      output.push(...manualAttendanceGuestEntries(session, entry.playerId, playersList, index, removedGuestKeys));
    }
    return output;
  });
  const manualEntries = [...attendedIds]
    .filter((playerId) => !displayedPlayerIds.has(playerId))
    .flatMap((playerId, index) => manualAttendanceEntries(session, playerId, playersList, index, removedGuestKeys));
  return [...withManualGuests, ...manualEntries];
}

function manualAttendanceEntry(session, playerId, playersList = state.players, index = 0) {
  const player = playersList.find((item) => item.id === playerId && item.active !== false);
  if (!player) return null;
  const skillLevel = normalizeSkillLevel(player.skillLevel);
  return {
    key: `manual-${session?.id || "session"}-${playerId}`,
    responseId: "",
    playerId,
    name: player.name || player.displayName || "Player",
    skillLevel,
    skillRank: SKILL_RANK[skillLevel],
    voteOrder: Number.MAX_SAFE_INTEGER - 1000 + index,
    racketNeeded: Boolean(player.usuallyNeedsRacket),
    guest: false,
    manual: true
  };
}

function manualAttendanceEntries(session, playerId, playersList = state.players, index = 0, removedGuestKeys = new Set()) {
  const playerEntry = manualAttendanceEntry(session, playerId, playersList, index);
  if (!playerEntry) return [];
  return [playerEntry, ...manualAttendanceGuestEntries(session, playerId, playersList, index, removedGuestKeys)];
}

function manualAttendanceGuestEntries(session, playerId, playersList = state.players, index = 0, removedGuestKeys = new Set()) {
  const playerEntry = manualAttendanceEntry(session, playerId, playersList, index);
  if (!playerEntry) return [];
  const entries = [];
  for (let guestIndex = 1; guestIndex <= manualGuestCount(session, playerId); guestIndex += 1) {
    const key = manualAttendanceGuestKey(session, playerId, guestIndex);
    if (removedGuestKeys.has(key)) continue;
    entries.push({
      key,
      responseId: "",
      playerId,
      name: sessionGuestName(session, key, `${playerEntry.name} Guest ${guestIndex}`),
      skillLevel: "Guest",
      skillRank: SKILL_RANK.Guest,
      voteOrder: playerEntry.voteOrder,
      racketNeeded: false,
      guest: true,
      manual: true
    });
  }
  return entries;
}

function ensureSessionAttendance(session, playersList = state.players) {
  session.attendedPlayerIds = effectiveAttendedPlayerIds(session, playersList);
  return session.attendedPlayerIds;
}

function addManualAttendedPlayer(session, playerId, playersList = state.players, settings = state.settings) {
  if (!session || !playerId) return false;
  const attendedIds = effectiveAttendedPlayerIds(session, playersList);
  if (attendedIds.includes(playerId)) return false;
  setManualAttendedPlayerIds(session, [...manualAttendedPlayerIds(session, playersList), playerId]);
  ensureSessionAttendance(session, playersList);
  syncSessionPayments(session, playersList, settings);
  applyAutomaticSessionStage(session);
  return true;
}

function removeManualAttendedPlayer(session, playerId, playersList = state.players, settings = state.settings) {
  if (!session || !playerId) return false;
  const manualIds = manualAttendedPlayerIds(session, playersList);
  if (!manualIds.includes(playerId)) return false;
  session.attendedPlayerIds = storedAttendedPlayerIds(session).filter((id) => id !== playerId);
  setManualAttendedPlayerIds(session, manualIds.filter((id) => id !== playerId));
  clearManualGuestCount(session, playerId);
  ensureSessionAttendance(session, playersList);
  syncSessionPayments(session, playersList, settings);
  applyAutomaticSessionStage(session);
  return true;
}

function paymentPlayerIds(session, playersList = state.players, settings = state.settings) {
  const ids = effectiveAttendedPlayerIds(session, playersList);
  const freeIds = roleFreePlayerIds(settings);
  return uniqueIds(ids).filter((id) => {
    const activePlayer = playersList.some((player) => player.id === id && player.active !== false);
    if (!activePlayer) return false;
    return !freeIds.includes(id) || sessionPaymentUnits(session, id, playersList) > 1;
  });
}

function sessionPaymentUnits(session, playerId, playersList = state.players) {
  if (!playerId) return 0;
  const units = effectiveAttendedEntries(session, playersList).filter((entry) => entry.playerId === playerId).length;
  return Math.max(0, units);
}

function sessionPaymentGuestCount(session, playerId, playersList = state.players) {
  return Math.max(0, sessionPaymentUnits(session, playerId, playersList) - 1);
}

function sessionPaymentChargeableUnits(session, playerId, playersList = state.players, settings = state.settings) {
  const units = sessionPaymentUnits(session, playerId, playersList);
  const freeIds = roleFreePlayerIds(settings);
  return freeIds.includes(playerId) ? Math.max(0, units - 1) : units;
}

function sessionPaymentAmount(session, playerId, playersList = state.players, settings = state.settings) {
  const chargeableUnits = sessionPaymentChargeableUnits(session, playerId, playersList, settings);
  const perPerson = Number(session.perPersonAmount || 0);
  return Number((Math.max(0, chargeableUnits) * Math.max(0, perPerson)).toFixed(2));
}

function allocateSession(session, playersList = state.players) {
  const courtCount = Number(session.bookedCourts || session.plannedCourts || 0);
  const playersPerCourt = getPlayersPerCourt(session);
  const entries = buildEntries(session, playersList);
  const capacity = expectedPlayersValue(session.expectedPlayers, session.bookedCourts, playersPerCourt);
  const courts = Array.from({ length: courtCount }, (_, index) => ({
    number: index + 1,
    players: [],
    skillScore: 0,
    skillGroup: ""
  }));
  const confirmed = capacity > 0 ? entries.slice(0, capacity) : [];
  const waiting = capacity > 0 ? entries.slice(capacity) : entries;
  balanceEntriesAcrossCourts(confirmed, courts, playersPerCourt);
  return {
    entries,
    courts,
    waiting,
    confirmedCount: confirmed.length,
    capacity,
    racketCount: entries.filter((entry) => entry.racketNeeded).length
  };
}

function getPlayersPerCourt(session) {
  return Number(session.playersPerCourt || PLAYERS_PER_COURT);
}

function calculateExpectedPlayers(bookedCourts, playersPerCourt) {
  const courtCount = Number(bookedCourts || 0);
  const perCourt = Number(playersPerCourt || 0);
  if (!Number.isFinite(courtCount) || !Number.isFinite(perCourt)) return 0;
  return Math.max(0, courtCount) * Math.max(0, perCourt);
}

function calculateWaterCost(bookedCourts) {
  const courtCount = Math.max(0, Number(bookedCourts || 0));
  if (!Number.isFinite(courtCount) || courtCount <= 0) return 0;
  return Math.ceil(courtCount / 2) * 6;
}

function expectedPlayersValue(value, bookedCourts, playersPerCourt) {
  if (value === undefined || value === null || value === "") {
    return calculateExpectedPlayers(bookedCourts, playersPerCourt);
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : calculateExpectedPlayers(bookedCourts, playersPerCourt);
}

function calculatePerPersonRate(courtFee, expectedPlayers, shuttleFee) {
  const players = Number(expectedPlayers || 0);
  if (!Number.isFinite(players) || players <= 0) return 0;
  const fee = Number(courtFee || 0);
  const shuttle = Number(shuttleFee || 0);
  const total = Math.max(0, fee) + players * Math.max(0, shuttle);
  return Math.ceil(total / players);
}

function perPersonRateValue(value, courtFee, expectedPlayers, shuttleFee, manual = false) {
  if (manual) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  }
  const amount = Number(value || 0);
  return amount > 0 ? amount : calculatePerPersonRate(courtFee, expectedPlayers, shuttleFee);
}

function sessionDurationHours(startTime, endTime) {
  const start = parseClockTime(startTime);
  const end = parseClockTime(endTime);
  let minutes = end.hours * 60 + end.minutes - (start.hours * 60 + start.minutes);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes / 60);
}

function calculateCourtFee(courtId, startTime, endTime, bookedCourts) {
  const court = getCourt(courtId);
  const hourlyRate = Number(court?.aedPerHour || 0);
  const courtCount = Number(bookedCourts || 0);
  return Math.round(hourlyRate * courtCount * sessionDurationHours(startTime, endTime));
}

function courtSkillGroup(entry) {
  const skillLevel = normalizeSkillLevel(entry.skillLevel);
  return skillLevel === "Intermediate" || skillLevel === "Professional" ? "Intermediate" : "Beginner";
}

function courtSkillGroupLabel(players) {
  const groups = [...new Set(players.map(courtSkillGroup))];
  return groups.length === 1 ? groups[0] : "Mixed";
}

function addEntriesToCourt(court, entries) {
  court.players.push(...entries);
  court.skillScore = court.players.reduce((total, entry) => total + Number(entry.skillRank || 0), 0);
  court.skillGroup = court.players.length ? courtSkillGroupLabel(court.players) : "";
}

function chooseRemainderGroup(grouped) {
  const intermediateCount = grouped.Intermediate.length;
  const beginnerCount = grouped.Beginner.length;
  if (!intermediateCount) return "Beginner";
  if (!beginnerCount) return "Intermediate";
  if (intermediateCount !== beginnerCount) return intermediateCount > beginnerCount ? "Intermediate" : "Beginner";
  return Number(grouped.Intermediate[0]?.voteOrder || 0) <= Number(grouped.Beginner[0]?.voteOrder || 0) ? "Intermediate" : "Beginner";
}

function balanceEntriesAcrossCourts(entries, courts, playersPerCourt) {
  const grouped = {
    Intermediate: entries.filter((entry) => courtSkillGroup(entry) === "Intermediate"),
    Beginner: entries.filter((entry) => courtSkillGroup(entry) === "Beginner")
  };
  let courtIndex = 0;

  ["Intermediate", "Beginner"].forEach((group) => {
    while (courtIndex < courts.length && grouped[group].length >= playersPerCourt) {
      addEntriesToCourt(courts[courtIndex], grouped[group].splice(0, playersPerCourt));
      courtIndex += 1;
    }
  });

  while (courtIndex < courts.length && (grouped.Intermediate.length || grouped.Beginner.length)) {
    const primaryGroup = chooseRemainderGroup(grouped);
    const secondaryGroup = primaryGroup === "Intermediate" ? "Beginner" : "Intermediate";
    const courtEntries = grouped[primaryGroup].splice(0, Math.min(playersPerCourt, grouped[primaryGroup].length));
    if (courtEntries.length < playersPerCourt) {
      courtEntries.push(...grouped[secondaryGroup].splice(0, playersPerCourt - courtEntries.length));
    }
    addEntriesToCourt(courts[courtIndex], courtEntries);
    courtIndex += 1;
  }

  courts.forEach((court) => {
    court.players.sort((a, b) => Number(a.voteOrder) - Number(b.voteOrder));
  });
}

function syncSessionPayments(session, players = state.players, settings = state.settings) {
  session.payments = session.payments || {};
  const playerIds = paymentPlayerIds(session, players, settings);
  playerIds.forEach((playerId) => {
    const player = players.find((item) => item.id === playerId);
    const method = normalizePaymentMethod(player?.paymentMethod);
    const amount = sessionPaymentAmount(session, playerId, players, settings);
    const units = sessionPaymentUnits(session, playerId, players);
    const chargeableUnits = sessionPaymentChargeableUnits(session, playerId, players, settings);
    const guestCount = sessionPaymentGuestCount(session, playerId, players);
    if (!session.payments[playerId]) {
      session.payments[playerId] = {
        playerId,
        status: "Pending",
        amount,
        units,
        chargeableUnits,
        guestCount,
        paidAmount: 0,
        method,
        paidDate: "",
        notes: ""
      };
    } else {
      const hasRecordedPayment = Number(session.payments[playerId].paidAmount || 0) > 0
        || Number(session.payments[playerId].advanceAmount || 0) > 0;
      if (!hasRecordedPayment) session.payments[playerId].method = method;
      session.payments[playerId].amount = amount;
      session.payments[playerId].units = units;
      session.payments[playerId].chargeableUnits = chargeableUnits;
      session.payments[playerId].guestCount = guestCount;
      session.payments[playerId].paidAmount = Number(session.payments[playerId].paidAmount || 0);
      session.payments[playerId].advanceAmount = Number(session.payments[playerId].advanceAmount || 0);
      if (session.payments[playerId].paidAmount > 0) {
        session.payments[playerId].status = session.payments[playerId].paidAmount >= amount ? "Paid" : "Partial";
      } else if (session.payments[playerId].status === "Paid" && amount > 0) {
        session.payments[playerId].status = "Pending";
      }
    }
  });
  players.forEach((player) => {
    if (!playerIds.includes(player.id)) {
      const payment = session.payments[player.id];
      const hasRecordedPayment = Number(payment?.paidAmount || 0) > 0 || Number(payment?.advanceAmount || 0) > 0;
      if (!hasRecordedPayment) delete session.payments[player.id];
    }
  });
}

function orderedSessionResponses(session) {
  return [...(session.responses || [])].sort((a, b) => Number(a.voteOrder || 0) - Number(b.voteOrder || 0));
}

function renumberSessionResponses(session) {
  session.responses = orderedSessionResponses(session).map((response, index) => ({
    ...response,
    voteOrder: index + 1
  }));
}

function moveSessionResponse(session, responseId, direction) {
  const responses = orderedSessionResponses(session);
  const index = responses.findIndex((response) => response.id === responseId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= responses.length) return false;
  const [response] = responses.splice(index, 1);
  responses.splice(nextIndex, 0, response);
  session.responses = responses.map((item, itemIndex) => ({
    ...item,
    voteOrder: itemIndex + 1
  }));
  return true;
}

function reorderSessionResponses(session, responseIds = []) {
  const responses = orderedSessionResponses(session);
  const byId = new Map(responses.map((response) => [response.id, response]));
  const nextResponses = [];
  responseIds.forEach((responseId) => {
    const response = byId.get(responseId);
    if (!response) return;
    nextResponses.push(response);
    byId.delete(responseId);
  });
  if (nextResponses.length !== responses.length) return false;
  session.responses = nextResponses.map((item, itemIndex) => ({
    ...item,
    voteOrder: itemIndex + 1
  }));
  return true;
}

function updateSessionPerPersonAmount(session, amount) {
  const nextAmount = Number(amount || 0);
  if (
    Number(session?.perPersonAmount || 0) !== nextAmount
    && typeof sessionHasActiveFinancialState === "function"
    && sessionHasActiveFinancialState(session)
  ) {
    return false;
  }
  session.perPersonAmount = nextAmount;
  syncSessionPayments(session);
  return true;
}

function paymentDueAmount(payment, session) {
  return Number(payment?.amount || session?.perPersonAmount || 0);
}

function paymentOutstanding(payment, session) {
  if (!payment || payment.status === "Paid") return 0;
  return Math.max(0, paymentDueAmount(payment, session) - Number(payment.paidAmount || 0));
}
