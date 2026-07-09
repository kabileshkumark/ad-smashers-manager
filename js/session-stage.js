function stageIndex(stage) {
  return SESSION_STAGES.indexOf(normalizeStage(stage));
}

function bookingPlaceholderCourt(session) {
  const courtName = getCourt(session.courtId)?.name || "";
  return bookingCourtName(courtName);
}

function sessionBookingStatus(session) {
  if (bookingPlaceholderCourt(session)) {
    return { label: "Booking in Progress", tone: "teal" };
  }
  return { label: "Court Booked", tone: "blue" };
}

function bookingCourtName(name) {
  return String(name || "").trim().toLowerCase().includes("booking");
}

function orderedCourtOptions() {
  return [...state.courts].sort((a, b) => {
    const aBooking = bookingCourtName(a.name);
    const bBooking = bookingCourtName(b.name);
    if (aBooking !== bBooking) return aBooking ? -1 : 1;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  });
}

function sessionHasEnded(session) {
  return sessionEndTime(session) <= Date.now();
}

function allSessionPaymentsPaid(session) {
  const payments = Object.values(session.payments || {});
  return payments.length > 0 && payments.every((payment) => paymentEffectiveStatus(session, payment) === "Paid");
}

function setSessionStage(session, stage) {
  session.stage = normalizeStage(stage);
}

function advanceSessionStage(session, stage) {
  const currentIndex = stageIndex(session.stage);
  const nextIndex = stageIndex(stage);
  if (nextIndex > currentIndex) {
    setSessionStage(session, stage);
  } else {
    setSessionStage(session, session.stage);
  }
  applyAutomaticSessionStage(session);
}

function applyBookingStage(session, force = false) {
  if (!session) return;
  if (bookingPlaceholderCourt(session)) {
    session.bookingStatus = "Pending";
    return;
  }
  if (force || session.bookingStatus === "Pending") {
    session.bookingStatus = "Booked";
  }
}

function applyAutomaticSessionStage(session) {
  if (!session) return;
  setSessionStage(session, session.stage);
  if (allSessionPaymentsPaid(session)) {
    setSessionStage(session, "Completed");
    return;
  }
  if (sessionHasEnded(session)) {
    setSessionStage(session, "Payment Collection");
    return;
  }
  applyBookingStage(session);
}

function syncSessionStages() {
  state.sessions.forEach((session) => applyAutomaticSessionStage(session));
}

function sessionStats(session) {
  const allocation = allocateSession(session);
  const payments = sessionIsCollectible(session) ? Object.values(session.payments || {}) : [];
  return {
    ...allocation,
    paidCount: payments.filter((payment) => paymentEffectiveStatus(session, payment) === "Paid").length,
    pendingCount: payments.filter((payment) => paymentEffectiveStatus(session, payment) !== "Paid").length,
    pendingAmount: payments
      .filter((payment) => paymentEffectiveStatus(session, payment) !== "Paid")
      .reduce((total, payment) => total + paymentOutstandingAfterAdvance(payment, session), 0)
  };
}
