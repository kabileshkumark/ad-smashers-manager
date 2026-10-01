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
    if (!hasLaterEntryForPlayer && !manualGuestPlayerIds.has(entry.playerId)) {
      manualGuestPlayerIds.add(entry.playerId);
      const responseGuestCount = entries.filter((item) => item.playerId === entry.playerId && item.guest).length;
      output.push(...manualAttendanceGuestEntries(session, entry.playerId, playersList, index, removedGuestKeys, responseGuestCount));
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

function manualAttendanceGuestEntries(session, playerId, playersList = state.players, index = 0, removedGuestKeys = new Set(), guestNumberOffset = 0) {
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
      name: sessionGuestName(session, key, `${playerEntry.name} Guest ${guestNumberOffset + guestIndex}`),
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

function removeAttendedPlayer(session, playerId, playersList = state.players, settings = state.settings) {
  if (!session || !playerId) return false;
  if (sessionPlayerHasRecordedFinancialState(session, playerId)) return false;
  const attendedIds = effectiveAttendedPlayerIds(session, playersList);
  if (!attendedIds.includes(playerId)) return false;
  const manualIds = manualAttendedPlayerIds(session, playersList);
  // A poll-derived no-show must not be restored by automatic attendance sync.
  if (defaultAttendedPlayerIds(session, playersList).includes(playerId)) session.attendanceManual = true;
  session.attendedPlayerIds = attendedIds.filter((id) => id !== playerId);
  setManualAttendedPlayerIds(session, manualIds.filter((id) => id !== playerId));
  clearManualGuestCount(session, playerId);
  ensureSessionAttendance(session, playersList);
  syncSessionPayments(session, playersList, settings);
  applyAutomaticSessionStage(session);
  return true;
}

function paymentPlayerIds(session, playersList = state.players, settings = state.settings) {
  const ids = effectiveAttendedPlayerIds(session, playersList);
  const freeIds = sessionRoleFreePlayerIds(session, settings);
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
  const freeIds = sessionRoleFreePlayerIds(session, settings);
  return freeIds.includes(playerId) ? Math.max(0, units - 1) : units;
}

function sessionPaymentAmount(session, playerId, playersList = state.players, settings = state.settings) {
  const chargeableUnits = sessionPaymentChargeableUnits(session, playerId, playersList, settings);
  const perPerson = Number(session.perPersonAmount || 0);
  return Number((Math.max(0, chargeableUnits) * Math.max(0, perPerson)).toFixed(2));
}

function allocateSession(session, playersList = state.players) {
  const hasCourtSchedule = sessionHasCourtSchedule(session);
  const courtCount = hasCourtSchedule ? sessionMaxCourts(session) : Number(session.bookedCourts || session.plannedCourts || 0);
  const playersPerCourt = getPlayersPerCourt(session);
  const entries = buildEntries(session, playersList);
  const capacity = expectedPlayersValue(session.expectedPlayers, courtCount, playersPerCourt);
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

function normalizeCourtSlotClock(value, fallback = "00:00") {
  const normalize = (candidate) => {
    const match = String(candidate || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return "";
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };
  return normalize(value) || normalize(fallback) || "00:00";
}

function normalizeCourtSlotCount(value, fallback = 1) {
  const count = Number(value);
  if (Number.isFinite(count) && count > 0) return Math.max(1, Math.floor(count));
  const fallbackCount = Number(fallback);
  return Number.isFinite(fallbackCount) && fallbackCount > 0 ? Math.max(1, Math.floor(fallbackCount)) : 1;
}

function parseBookedCourtNumbers(value) {
  const entries = Array.isArray(value) ? value : String(value ?? "").trim().split(/[\s,]+/);
  return entries.filter((entry) => String(entry).trim() !== "").map((entry) => {
    const text = String(entry).trim();
    return /^\d+$/.test(text) ? Number(text) : text;
  });
}

function courtBookingFinancialFields(slots) {
  return Array.isArray(slots) ? slots.map((slot) => ({ startTime: slot?.startTime, endTime: slot?.endTime, courts: slot?.courts })) : slots;
}

function normalizeCourtSlots(slots, fallback = {}) {
  const fallbackSlot = {
    startTime: normalizeCourtSlotClock(fallback.startTime, "00:00"),
    endTime: normalizeCourtSlotClock(fallback.endTime, "01:00"),
    courts: normalizeCourtSlotCount(fallback.courts, 1)
  };
  const source = Array.isArray(slots) && slots.length ? slots : [fallbackSlot];
  return source.map((slot) => {
    const courtNumbers = parseBookedCourtNumbers(slot?.courtNumbers);
    return {
      startTime: normalizeCourtSlotClock(slot?.startTime, fallbackSlot.startTime),
      endTime: normalizeCourtSlotClock(slot?.endTime, fallbackSlot.endTime),
      courts: normalizeCourtSlotCount(slot?.courts, fallbackSlot.courts),
      ...(courtNumbers.length ? { courtNumbers } : {})
    };
  });
}

function courtSlotClockMinutes(value) {
  const [hours, minutes] = normalizeCourtSlotClock(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function courtSlotClockFromMinutes(value) {
  const minutes = ((Number(value || 0) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function validateCourtSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) {
    return { valid: false, message: "Add at least one court booking.", slots: [], timeline: [] };
  }
  const normalized = normalizeCourtSlots(slots);
  const hasNumbers = normalized.some((slot) => slot.courtNumbers?.length);
  const bookings = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const booking = normalized[index];
    if (hasNumbers) {
      const numbers = booking.courtNumbers || [];
      let message = "";
      if (numbers.some((number) => !Number.isSafeInteger(number) || number <= 0)) {
        message = "Use positive whole court numbers separated by commas.";
      } else if (new Set(numbers).size !== numbers.length) {
        message = "Each court number must appear only once in a booking.";
      } else if (numbers.length !== booking.courts) {
        message = `Enter ${booking.courts} court ${booking.courts === 1 ? "number" : "numbers"}, matching the Courts count.`;
      }
      if (message) return { valid: false, message: `Booking ${index + 1}: ${message}`, slots: normalized, timeline: [] };
    }
    const startClockMinutes = courtSlotClockMinutes(booking.startTime);
    const endClockMinutes = courtSlotClockMinutes(booking.endTime);
    if (startClockMinutes === endClockMinutes) {
      return { valid: false, message: `Court booking ${index + 1} must have different start and end times.`, slots: normalized, timeline: [] };
    }
    const durationMinutes = (endClockMinutes - startClockMinutes + 24 * 60) % (24 * 60);
    bookings.push({ ...booking, startClockMinutes, durationMinutes });
  }

  const candidateAnchors = [...new Set(bookings.map((booking) => booking.startClockMinutes))];
  let alignedBookings = null;
  let alignedSpan = Number.POSITIVE_INFINITY;
  for (const anchor of candidateAnchors) {
    const candidate = bookings.map((booking) => {
      const startMinutes = booking.startClockMinutes < anchor
        ? booking.startClockMinutes + 24 * 60
        : booking.startClockMinutes;
      return { ...booking, startMinutes, endMinutes: startMinutes + booking.durationMinutes };
    });
    const sessionEnd = Math.max(...candidate.map((booking) => booking.endMinutes));
    const span = sessionEnd - anchor;
    if (span <= 24 * 60 && span < alignedSpan) {
      alignedBookings = candidate;
      alignedSpan = span;
    }
  }
  if (!alignedBookings) {
    return { valid: false, message: "Court bookings must fit within one 24-hour session.", slots: normalized, timeline: [] };
  }

  const boundaries = [...new Set(alignedBookings.flatMap((booking) => [booking.startMinutes, booking.endMinutes]))].sort((a, b) => a - b);
  const timeline = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMinutes = boundaries[index];
    const endMinutes = boundaries[index + 1];
    const activeBookings = alignedBookings.filter((booking) => booking.startMinutes < endMinutes && booking.endMinutes > startMinutes);
    const courts = activeBookings.reduce((total, booking) => total + booking.courts, 0);
    if (!courts) continue;
    const courtNumbers = activeBookings.flatMap((booking) => booking.courtNumbers || []).sort((a, b) => a - b);
    if (new Set(courtNumbers).size !== courtNumbers.length) {
      return { valid: false, message: "The same court number cannot be booked in overlapping time slots.", slots: normalized, timeline: [] };
    }
    const previous = timeline[timeline.length - 1];
    if (previous && previous.courts === courts && previous.endMinutes === startMinutes
      && JSON.stringify(previous.courtNumbers || []) === JSON.stringify(courtNumbers)) {
      previous.endMinutes = endMinutes;
      previous.endTime = courtSlotClockFromMinutes(endMinutes);
      previous.durationHours = (previous.endMinutes - previous.startMinutes) / 60;
      continue;
    }
    timeline.push({
      startTime: courtSlotClockFromMinutes(startMinutes),
      endTime: courtSlotClockFromMinutes(endMinutes),
      courts,
      ...(hasNumbers ? { courtNumbers } : {}),
      startMinutes,
      endMinutes,
      durationHours: (endMinutes - startMinutes) / 60
    });
  }
  const canonicalSlots = timeline.map(({ startTime, endTime, courts, courtNumbers }) => ({
    startTime, endTime, courts, ...(courtNumbers ? { courtNumbers: [...courtNumbers] } : {})
  }));
  return { valid: true, message: "", slots: canonicalSlots, timeline };
}

function sessionHasCourtSchedule(session = {}) {
  return (Array.isArray(session.courtBookings) && session.courtBookings.length > 0)
    || (Array.isArray(session.courtSlots) && session.courtSlots.length > 0);
}

function sessionCourtBookings(session = {}) {
  const fallback = {
    startTime: session.startTime || "00:00",
    endTime: session.endTime || "01:00",
    courts: session.bookedCourts || session.plannedCourts || 1
  };
  const source = Array.isArray(session.courtBookings) && session.courtBookings.length
    ? session.courtBookings
    : session.courtSlots;
  return normalizeCourtSlots(source, fallback);
}

function sessionCourtSlots(session = {}) {
  const candidate = sessionCourtBookings(session);
  const validation = validateCourtSlots(candidate);
  // Invalid imported labels must never discard an otherwise valid financial schedule.
  const financialValidation = validation.valid ? validation : validateCourtSlots(courtBookingFinancialFields(candidate));
  return financialValidation.valid ? financialValidation.slots : normalizeCourtSlots([], {
    startTime: session.startTime || "00:00",
    endTime: session.endTime || "01:00",
    courts: session.bookedCourts || session.plannedCourts || 1
  });
}

function courtSlotMaxCourts(slots) {
  const validation = validateCourtSlots(courtBookingFinancialFields(slots));
  const source = validation.valid ? validation.slots : normalizeCourtSlots(slots);
  return source.reduce((maximum, slot) => Math.max(maximum, slot.courts), 0);
}

function sessionMaxCourts(session) {
  return courtSlotMaxCourts(sessionCourtSlots(session));
}

function courtSlotCourtHours(slots) {
  const validation = validateCourtSlots(courtBookingFinancialFields(slots));
  if (!validation.valid) return 0;
  return validation.timeline.reduce((total, slot) => total + slot.courts * slot.durationHours, 0);
}

function sessionCourtHours(session) {
  return courtSlotCourtHours(sessionCourtSlots(session));
}

function sessionCourtCountLabel(session) {
  const sequence = sessionCourtSlots(session)
    .map((slot) => slot.courts)
    .filter((count, index, counts) => index === 0 || count !== counts[index - 1]);
  return sequence.join(" → ");
}

function sessionFinancialBasisChanged(currentSession, nextSession) {
  if (!currentSession || !nextSession) return false;
  const fields = ["date", "startTime", "endTime", "courtId", "bookedCourts", "expectedPlayers", "totalPaid", "shuttleCost", "waterCost", "perPersonAmount"];
  return fields.some((fieldName) => String(currentSession[fieldName] ?? "") !== String(nextSession[fieldName] ?? ""))
    || JSON.stringify(courtBookingFinancialFields(sessionCourtBookings(currentSession))) !== JSON.stringify(courtBookingFinancialFields(sessionCourtBookings(nextSession)));
}

function courtSlotDescription(slot) {
  return slot.courtNumbers?.length
    ? `${slot.courtNumbers.length === 1 ? "Court" : "Courts"} ${slot.courtNumbers.join(", ")}`
    : `${slot.courts} ${slot.courts === 1 ? "court" : "courts"}`;
}

function sessionCourtAllocationDisplay(session) {
  const allocation = allocateSession(session);
  const displays = sessionCourtDisplays(session, allocation.courts.length);
  return {
    ...allocation,
    hasBookedCourtNumbers: sessionCourtBookings(session).some((booking) => booking.courtNumbers?.length),
    courts: allocation.courts.map((court, index) => ({ ...court, ...displays[index] }))
  };
}

function sessionCourtDisplays(session, count) {
  const emptyDisplays = Array.from({ length: count }, (_, index) => ({ label: `Court ${index + 1}`, availability: "" }));
  if (!sessionCourtBookings(session).some((booking) => booking.courtNumbers?.length)) return emptyDisplays;
  const slots = sessionCourtSlots(session);
  const numbers = [...new Set(slots.flatMap((slot) => slot.courtNumbers || []))].sort((a, b) => a - b);
  if (!numbers.length) return emptyDisplays;
  const peak = Math.max(...slots.map((slot) => slot.courts));
  return emptyDisplays.map((_, index) => {
    // A changing set larger than peak capacity has no single court per roster group.
    if (numbers.length > peak || !numbers[index]) return { label: `Player Group ${index + 1}`, availability: "" };
    const number = numbers[index];
    const available = slots.filter((slot) => slot.courtNumbers?.includes(number));
    return {
      number,
      label: `Court ${number}`,
      availability: available.length < slots.length ? available.map((slot) => messageTimeRange(slot, true)).join("; ") : ""
    };
  });
}

function validIsoSessionDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeRecurrenceFrequency(value) {
  return value === "weekly" ? "weekly" : "none";
}

function buildSessionRecurrencePlan(startDate, frequency = "none", endDate = "") {
  if (!validIsoSessionDate(startDate)) {
    return { valid: false, message: "Select a valid session date.", frequency: "none", dates: [] };
  }
  const normalizedFrequency = normalizeRecurrenceFrequency(frequency);
  if (normalizedFrequency === "none") {
    return { valid: true, message: "", frequency: normalizedFrequency, dates: [startDate], endDate: startDate };
  }
  if (!validIsoSessionDate(endDate)) {
    return { valid: false, message: "Select a valid recurrence end date.", frequency: normalizedFrequency, dates: [] };
  }
  if (endDate < startDate) {
    return { valid: false, message: "Recurrence end date cannot be before the first session.", frequency: normalizedFrequency, dates: [] };
  }
  const dates = [];
  let nextDate = startDate;
  while (nextDate <= endDate) {
    if (dates.length >= MAX_RECURRING_SESSIONS) {
      return {
        valid: false,
        message: `Create at most ${MAX_RECURRING_SESSIONS} weekly sessions at a time.`,
        frequency: normalizedFrequency,
        dates: []
      };
    }
    dates.push(nextDate);
    nextDate = addDaysIso(nextDate, 7);
  }
  return { valid: true, message: "", frequency: normalizedFrequency, dates, endDate };
}

function normalizeSessionRecurrence(recurrence) {
  if (!recurrence || recurrence.frequency !== "weekly" || !recurrence.id) return null;
  if (!validIsoSessionDate(recurrence.startDate) || !validIsoSessionDate(recurrence.endDate) || recurrence.endDate < recurrence.startDate) return null;
  const count = normalizedIntegerSetting(recurrence.count, 1, 1, MAX_RECURRING_SESSIONS);
  return {
    id: String(recurrence.id),
    frequency: "weekly",
    startDate: recurrence.startDate,
    endDate: recurrence.endDate,
    sequence: normalizedIntegerSetting(recurrence.sequence, 1, 1, count),
    count
  };
}

function sessionScheduleKey(session) {
  return [
    String(session?.date || ""),
    String(session?.courtId || ""),
    JSON.stringify(validateCourtSlots(courtBookingFinancialFields(sessionCourtBookings(session || {}))).slots)
  ].join("|");
}

function buildNewSessionRecords(baseData, recurrenceOptions = {}, existingSessions = state.sessions) {
  const plan = buildSessionRecurrencePlan(baseData?.date, recurrenceOptions.frequency, recurrenceOptions.endDate);
  if (!plan.valid) return { ...plan, records: [] };
  const candidates = plan.dates.map((date) => {
    const type = sessionTypeForDate(date, baseData.type);
    const candidate = {
      ...baseData,
      date,
      type,
      groupId: sessionGroupIdFor({ date, type }),
      courtBookings: sessionCourtBookings(baseData).map((booking) => ({ ...booking }))
    };
    delete candidate.courtSlots;
    return candidate;
  });
  const existingKeys = new Set((existingSessions || []).map((session) => sessionScheduleKey(session)));
  const conflict = candidates.find((candidate) => existingKeys.has(sessionScheduleKey(candidate)));
  if (conflict) {
    return {
      valid: false,
      message: `A matching session already exists on ${formatDate(conflict.date)}. No sessions were created.`,
      frequency: plan.frequency,
      dates: plan.dates,
      records: []
    };
  }
  const recurrenceId = plan.frequency === "weekly" ? createId("recurrence") : "";
  const records = candidates.map((candidate, index) => {
    const record = {
      ...candidate,
      id: createId("session"),
      responses: [],
      payments: {},
      sent: {},
      notes: ""
    };
    delete record.recurrence;
    if (recurrenceId) {
      record.recurrence = {
        id: recurrenceId,
        frequency: "weekly",
        startDate: plan.dates[0],
        endDate: plan.endDate,
        sequence: index + 1,
        count: plan.dates.length
      };
    }
    return record;
  });
  return { ...plan, records };
}

function upcomingSessionSeries(session, sessions = state.sessions) {
  const recurrence = normalizeSessionRecurrence(session?.recurrence);
  if (!recurrence) return [];
  return sessions.filter((item) => item.recurrence?.id === recurrence.id
    && sessionStartTime(item) > Date.now()
    && !["Completed", "Payment Collection"].includes(item.stage))
    .sort((a, b) => sessionStartTime(a) - sessionStartTime(b) || String(a.id).localeCompare(String(b.id)));
}

function sessionSeriesCancellationBlocked(session) {
  return Boolean((session.responses || []).length
    || session.attendanceManual
    || (session.attendedPlayerIds || []).length
    || (session.manualAttendedPlayerIds || []).length
    || (session.removedGuestKeys || []).length
    || Object.keys(session.manualGuestCounts || {}).length
    || Object.keys(session.guestNames || {}).length
    || Object.keys(session.payments || {}).length
    || Object.values(session.sent || {}).some(Boolean)
    || String(session.notes || "").trim()
    || normalizeStage(session.stage) !== "Draft"
    || (session.pollStatus && session.pollStatus !== "Draft")
    || sessionHasFinancialHistory(session));
}

function buildSessionEditPlan(session, formData, options = {}, sessions = state.sessions) {
  const fail = (message) => ({ valid: false, message, updated: [], created: [], removed: [] });
  if (!session || !sessions.some((item) => item.id === session.id)) return fail("Session no longer exists. Reopen the session list.");
  const bookingFields = ["courtId", "startTime", "endTime", "courtBookings", "plannedCourts", "bookedCourts", "playersPerCourt", "expectedPlayers", "totalPaid", "shuttleCost", "waterCost", "perPersonAmount"];
  const sessionData = Object.fromEntries([...bookingFields, "date", "type", "groupId", "stage", "bookingStatus"]
    .filter((key) => Object.hasOwn(formData, key)).map((key) => [key, formData[key]]));
  if (!validIsoSessionDate(sessionData.date)) return fail("Select a valid session date.");
  const recurrence = normalizeSessionRecurrence(session.recurrence);
  const seriesEdit = Boolean(recurrence && options.scope === "series");
  const copy = (value) => JSON.parse(JSON.stringify(value));
  let updated = [];
  let created = [];
  let removed = [];
  let selectedId = session.id;
  // New occurrences copy booking details only, never rosters, receipts or published state.
  const newBase = {
    ...copy(sessionData), stage: "Draft", pollStatus: "Draft",
    organizerPlayerId: String(session.organizerPlayerId ?? state.settings.organizerPlayerId ?? ""),
    coOrganizerPlayerId: String(session.coOrganizerPlayerId ?? state.settings.coOrganizerPlayerId ?? "")
  };
  if (!seriesEdit) {
    const next = { ...copy(session), ...copy(sessionData) };
    delete next.courtSlots;
    updated = [next];
    if (!recurrence && normalizeRecurrenceFrequency(options.frequency) === "weekly") {
      if (sessionStartTime(next) <= Date.now() || ["Completed", "Payment Collection"].includes(session.stage)) {
        return fail("Start a new recurring session on an upcoming date. Past sessions cannot become a new series.");
      }
      const creation = buildNewSessionRecords(newBase, options, sessions.filter((item) => item.id !== session.id));
      if (!creation.valid) return fail(creation.message);
      next.recurrence = creation.records[0].recurrence;
      created = creation.records.slice(1);
    }
  } else {
    const upcoming = upcomingSessionSeries(session, sessions);
    if (!upcoming.length) return fail("No upcoming sessions in this series. Past sessions are preserved.");
    const first = upcoming[0];
    const plan = buildSessionRecurrencePlan(sessionData.date, options.frequency, options.endDate);
    if (!plan.valid) return fail(plan.message);
    const dayShift = Math.round((Date.parse(`${sessionData.date}T12:00:00Z`) - Date.parse(`${first.date}T12:00:00Z`)) / 86400000);
    const patch = {};
    bookingFields.filter((key) => Object.hasOwn(sessionData, key)).forEach((key) => {
      const before = key === "courtBookings" ? sessionCourtBookings(session) : session[key];
      if (JSON.stringify(before) !== JSON.stringify(sessionData[key])) patch[key] = sessionData[key];
    });
    if (options.capacityExplicit) patch.expectedPlayers = sessionData.expectedPlayers;
    if (options.feeExplicit) patch.totalPaid = sessionData.totalPaid;
    if (options.rateExplicit) patch.perPersonAmount = sessionData.perPersonAmount;
    upcoming.forEach((original, index) => {
      const date = addDaysIso(original.date, dayShift);
      if ((plan.frequency === "none" && index > 0) || date > plan.endDate) {
        removed.push(original);
        return;
      }
      const next = { ...copy(original), ...copy(patch), date };
      const schedule = validateCourtSlots(sessionCourtBookings(next));
      if (schedule.valid) {
        next.startTime = schedule.slots[0].startTime;
        next.endTime = schedule.slots.at(-1).endTime;
        next.bookedCourts = courtSlotMaxCourts(schedule.slots);
        next.plannedCourts = next.bookedCourts;
      }
      if (!options.capacityExplicit) {
        next.expectedPlayers = original.expectedPlayers === calculateExpectedPlayers(sessionMaxCourts(original), original.playersPerCourt)
          ? calculateExpectedPlayers(next.bookedCourts, next.playersPerCourt)
          : original.expectedPlayers;
      }
      if (!options.feeExplicit) {
        next.totalPaid = original.totalPaid === calculateCourtFeeForSlots(original.courtId, sessionCourtSlots(original))
          ? calculateCourtFeeForSlots(next.courtId, sessionCourtSlots(next))
          : original.totalPaid;
      }
      if (!options.rateExplicit) {
        const automaticRate = calculatePerPersonRate(original.totalPaid, original.expectedPlayers, original.shuttleCost);
        next.perPersonAmount = original.perPersonAmount === automaticRate
          ? calculatePerPersonRate(next.totalPaid, next.expectedPlayers, next.shuttleCost)
          : original.perPersonAmount;
      }
      if (date !== original.date) {
        next.type = sessionTypeForDate(date, original.type);
        next.groupId = sessionGroupIdFor(next);
      }
      delete next.courtSlots;
      updated.push(next);
    });
    const blocked = removed.find(sessionSeriesCancellationBlocked);
    if (blocked) return fail(`${formatDate(blocked.date)} has player, publication or payment history. It cannot be cancelled by a series edit. No sessions changed.`);
    // Missing dates inside the previous range are cancelled occurrences, not gaps to refill.
    const previousEnd = upcoming.reduce((end, item) => item.recurrence?.endDate > end ? item.recurrence.endDate : end, first.date);
    const shiftedEnd = addDaysIso(previousEnd, dayShift);
    const recurrenceAnchor = addDaysIso(first.recurrence.startDate, dayShift);
    if (plan.frequency === "weekly") {
      const elapsedDays = Math.round((Date.parse(`${shiftedEnd}T12:00:00Z`) - Date.parse(`${recurrenceAnchor}T12:00:00Z`)) / 86400000);
      const extensionStart = addDaysIso(shiftedEnd, 7 - ((elapsedDays % 7 + 7) % 7));
      const extension = extensionStart <= plan.endDate ? buildSessionRecurrencePlan(extensionStart, "weekly", plan.endDate) : {valid:true,dates:[]};
      if (!extension.valid) return fail(extension.message);
      for (const date of extension.dates) {
        const creation = buildNewSessionRecords({ ...newBase, date }, { frequency: "none" }, []);
        if (!creation.valid) return fail(creation.message);
        created.push(...creation.records);
      }
    }
    const occurrences = [...updated, ...created].sort((a, b) => a.date.localeCompare(b.date));
    if (occurrences.length > MAX_RECURRING_SESSIONS) return fail(`Keep at most ${MAX_RECURRING_SESSIONS} upcoming sessions in a series.`);
    if (occurrences.some((item) => sessionStartTime(item) <= Date.now())) return fail("Series edits must keep all upcoming sessions in the future.");
    occurrences.forEach((item, index) => {
      if (plan.frequency === "weekly") {
        item.recurrence = { id: recurrence.id, frequency: "weekly", startDate: recurrenceAnchor, endDate: plan.endDate, sequence: index + 1, count: occurrences.length };
      } else {
        delete item.recurrence;
      }
    });
    selectedId = occurrences.some((item) => item.id === session.id) ? session.id : occurrences[0]?.id;
  }
  const changedIds = new Set([...updated, ...removed].map((item) => item.id));
  const keys = new Set(sessions.filter((item) => !changedIds.has(item.id)).map(sessionScheduleKey));
  for (const item of [...updated, ...created]) {
    const validation = validateCourtSlots(sessionCourtBookings(item));
    if (!validation.valid) return fail(validation.message);
    const original = sessions.find((source) => source.id === item.id);
    if (original && sessionFinancialBasisChanged(original, item) && sessionHasRecordedFinancialState(original)) {
      return fail(`${formatDate(original.date)} has recorded payments. Reverse or delete those payments before changing its financial basis. No sessions changed.`);
    }
    const key = sessionScheduleKey(item);
    if (keys.has(key)) return fail(`A matching session already exists on ${formatDate(item.date)}. No sessions changed.`);
    keys.add(key);
  }
  return { valid: true, message: "", updated, created, removed, selectedId, seriesEdit };
}

function applySessionEditPlan(plan) {
  if (!plan?.valid) return false;
  const replacements = new Map(plan.updated.map((session) => [session.id, session]));
  const removedIds = new Set(plan.removed.map((session) => session.id));
  state.sessions = state.sessions.filter((session) => !removedIds.has(session.id))
    .map((session) => replacements.get(session.id) || session);
  state.sessions.push(...plan.created);
  plan.updated.forEach((session) => {
    syncSessionPayments(session);
    applyAutomaticSessionStage(session);
  });
  return true;
}

function calculateExpectedPlayers(bookedCourts, playersPerCourt) {
  const courtCount = Number(bookedCourts || 0);
  const perCourt = Number(playersPerCourt || 0);
  if (!Number.isFinite(courtCount) || !Number.isFinite(perCourt)) return 0;
  return Math.max(0, courtCount) * Math.max(0, perCourt);
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
  return calculateCourtFeeForSlots(courtId, [{ startTime, endTime, courts: bookedCourts }]);
}

function calculateCourtFeeForSlots(courtId, slots) {
  const court = getCourt(courtId);
  const hourlyRate = Number(court?.aedPerHour || 0);
  return Math.round(hourlyRate * courtSlotCourtHours(slots));
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
    && typeof sessionHasRecordedFinancialState === "function"
    && sessionHasRecordedFinancialState(session)
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
