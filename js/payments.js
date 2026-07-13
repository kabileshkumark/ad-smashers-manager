function syncActivityShares(activity) {
  activity.playerIds = uniqueIds(activity.playerIds || []);
  activity.shares = activity.shares || {};
  const shareAmount = activity.playerIds.length ? Number((Number(activity.totalPaid || 0) / activity.playerIds.length).toFixed(2)) : 0;
  activity.playerIds.forEach((playerId) => {
    const existing = activity.shares[playerId] || {};
    const autoPaidByPayer = Boolean(existing.paidBySelf);
    const paidAmount = activity.paidById && playerId === activity.paidById
      ? shareAmount
      : autoPaidByPayer
        ? 0
      : Math.min(Number(existing.paidAmount || 0), shareAmount);
    activity.shares[playerId] = {
      playerId,
      amount: shareAmount,
      paidAmount,
      paidBySelf: Boolean(activity.paidById && playerId === activity.paidById),
      status: paidAmount <= 0 ? "Pending" : paidAmount >= shareAmount ? "Paid" : "Partial"
    };
  });
  Object.keys(activity.shares).forEach((playerId) => {
    if (!activity.playerIds.includes(playerId)) delete activity.shares[playerId];
  });
  return activity;
}

function shareOutstanding(share) {
  if (!share || share.status === "Paid") return 0;
  return Math.max(0, Number(share.amount || 0) - Number(share.paidAmount || 0));
}

function activityOutstanding(activity) {
  return Object.values(activity.shares || {}).reduce((total, share) => total + shareOutstanding(share), 0);
}

function activityOutstandingAfterAdvance(activity) {
  return Object.values(activity.shares || {}).reduce((total, share) => total + shareOutstandingAfterAdvance(activity, share), 0);
}

function activityPayerName(activity) {
  return activity?.paidById ? getPlayerName(activity.paidById) : "Not set";
}

function activityLedgerLabel(activity, prefix = "owed to") {
  const name = activity?.name || "Activity";
  return activity?.paidById ? `${name} - ${prefix} ${activityPayerName(activity)}` : name;
}

function playerAdvance(playerId) {
  return Number(state.advances?.[playerId] || 0);
}

function playerIntentionalAdvancePaid(playerId) {
  return playerIntentionalAdvancePayments(playerId).reduce((total, payment) => total + payment.amount, 0);
}

function playerIntentionalAdvancePayments(playerId) {
  return [...(state.paymentTransactions || [])]
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.type === "advance-payment")
    .map(({ transaction, index }) => {
      const amount = (transaction.allocations || [])
        .filter((allocation) => allocation.type === "advance" && allocation.playerId === playerId)
        .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
      return amount > 0
        ? {
            transaction,
            index,
            id: transaction.id,
            date: transaction.date || "",
            amount: Number(amount.toFixed(2))
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.index - b.index);
}

function playerLegacyIntentionalAdvanceInCredit(playerId) {
  return [...(state.paymentTransactions || [])]
    .filter((transaction) => transaction.type === "advance-payment" && transaction.separateAdvance !== true)
    .reduce((total, transaction) => {
      const amount = (transaction.allocations || [])
        .filter((allocation) => allocation.type === "advance" && allocation.playerId === playerId)
        .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
      return total + amount;
    }, 0);
}

function playerCreditAdvance(playerId) {
  return Math.max(0, Number((playerAdvance(playerId) - playerLegacyIntentionalAdvanceInCredit(playerId)).toFixed(2)));
}

function addPlayerAdvance(playerId, amount) {
  const value = Number(amount || 0);
  if (!playerId || !Number.isFinite(value) || value <= 0) return 0;
  state.advances = state.advances || {};
  state.advances[playerId] = Number((playerAdvance(playerId) + value).toFixed(2));
  return value;
}

function recordPlayerAdvance(playerId, amount) {
  const value = Number(amount || 0);
  if (!playerId || !Number.isFinite(value) || value <= 0) return null;
  const transaction = {
    id: createId("payment-transaction"),
    type: "advance-payment",
    separateAdvance: true,
    date: new Date().toISOString().slice(0, 10),
    paidById: playerId,
    groupId: "",
    playerIds: [playerId],
    amountPaid: Number(value.toFixed(2)),
    appliedAmount: 0,
    advanceAmount: Number(value.toFixed(2)),
    allocations: [{ type: "advance", playerId, amount: Number(value.toFixed(2)) }]
  };
  state.paymentTransactions = state.paymentTransactions || [];
  state.paymentTransactions.push(transaction);
  return transaction;
}

function adjustPaymentAdvance(payment, playerId, amount) {
  const nextAdvance = Math.max(0, Number(amount || 0));
  const previousAdvance = Number(payment.advanceAmount || 0);
  const delta = Number((nextAdvance - previousAdvance).toFixed(2));
  if (delta > 0) {
    addPlayerAdvance(playerId, delta);
  } else if (delta < 0 && state.advances) {
    const nextPlayerAdvance = Math.max(0, playerAdvance(playerId) + delta);
    if (nextPlayerAdvance > 0) {
      state.advances[playerId] = Number(nextPlayerAdvance.toFixed(2));
    } else {
      delete state.advances[playerId];
    }
  }
  payment.advanceAmount = Number(nextAdvance.toFixed(2));
  return payment.advanceAmount;
}

function clearPlayerAdvance(playerId) {
  if (state.advances) delete state.advances[playerId];
}

function openDeleteConfirmation(config) {
  modal = {
    type: "confirmDelete",
    previousModal: modal && modal.type !== "confirmDelete" ? modal : null,
    ...config
  };
  render();
}

function cancelDeleteConfirmation() {
  const previousModal = modal?.previousModal || null;
  modal = previousModal;
  render();
}

function executeConfirmedDelete(target) {
  const deleteType = target.dataset.deleteType;
  const nextModal = modal?.previousModal || null;
  if (deleteType === "session") {
    const session = getSession(target.dataset.session);
    if (!session) return false;
    state.sessions = state.sessions.filter((item) => item.id !== session.id);
    if (activeSessionId === session.id) {
      activeSessionId = sortSessions()[0]?.id || null;
    }
    modal = null;
    saveState();
    showToast("Session deleted.");
    return true;
  }
  if (deleteType === "court") {
    const court = state.courts.find((item) => item.id === target.dataset.court);
    if (!court) return false;
    state.courts = state.courts.filter((item) => item.id !== court.id);
    const fallbackCourtId = state.courts[0]?.id || "";
    state.sessions.forEach((item) => {
      if (item.courtId === court.id) item.courtId = fallbackCourtId;
    });
    modal = null;
    saveState();
    showToast("Court deleted.");
    return true;
  }
  if (deleteType === "player") {
    const player = getPlayer(target.dataset.player);
    if (!player) return false;
    player.active = false;
    ["organizer", "coOrganizer"].forEach((role) => {
      const field = playerRoleConfig(role).field;
      if (state.settings?.[field] === player.id) state.settings[field] = "";
    });
    state.sessions.forEach((item) => {
      if (Array.isArray(item.attendedPlayerIds)) {
        item.attendedPlayerIds = item.attendedPlayerIds.filter((id) => id !== player.id);
      }
      item.manualAttendedPlayerIds = uniqueIds(item.manualAttendedPlayerIds || []).filter((id) => id !== player.id);
      clearManualGuestCount(item, player.id);
      syncSessionPayments(item);
    });
    state.activities.forEach((activity) => {
      activity.playerIds = activity.playerIds.filter((id) => id !== player.id);
      if (activity.paidById === player.id) activity.paidById = "";
      syncActivityShares(activity);
    });
    state.paymentGroups = (state.paymentGroups || [])
      .map((group) => {
        const playerIds = (group.playerIds || []).filter((id) => id !== player.id);
        return {
          ...group,
          payerId: group.payerId === player.id ? playerIds[0] || "" : group.payerId,
          playerIds,
          guests: normalizePaymentGroupGuests(group.guests || []).filter((guest) => guest.ownerPlayerId !== player.id),
          active: group.active !== false && playerIds.length > 0
        };
      })
      .filter((group) => group.active !== false);
    clearPlayerAdvance(player.id);
    modal = null;
    saveState();
    showToast("Player deleted.");
    return true;
  }
  if (deleteType === "response") {
    const session = getSession(target.dataset.session);
    if (!session) return false;
    const removedResponse = session.responses.find((response) => response.id === target.dataset.response);
    session.responses = session.responses.filter((response) => response.id !== target.dataset.response);
    if (removedResponse?.playerId) {
      session.attendedPlayerIds = storedAttendedPlayerIds(session).filter((id) => id !== removedResponse.playerId);
      setManualAttendedPlayerIds(
        session,
        manualAttendedPlayerIds(session).filter((id) => id !== removedResponse.playerId)
      );
      clearManualGuestCount(session, removedResponse.playerId);
    }
    renumberSessionResponses(session);
    syncSessionPayments(session);
    applyAutomaticSessionStage(session);
    modal = nextModal;
    saveState();
    showToast("Player removed.");
    return true;
  }
  if (deleteType === "response-guest") {
    const session = getSession(target.dataset.session);
    if (!session || !removeResponseGuest(session, target.dataset.response)) return false;
    modal = nextModal;
    saveState();
    showToast("Guest removed.");
    return true;
  }
  if (deleteType === "attendance") {
    const session = getSession(target.dataset.session);
    const playerId = target.dataset.player;
    if (!session || !playerId) return false;
    if (!removeManualAttendedPlayer(session, playerId)) {
      ensureSessionAttendance(session);
      session.attendanceManual = true;
      session.attendedPlayerIds = session.attendedPlayerIds.filter((id) => id !== playerId);
      setManualAttendedPlayerIds(
        session,
        manualAttendedPlayerIds(session).filter((id) => id !== playerId)
      );
      clearManualGuestCount(session, playerId);
      syncSessionPayments(session);
      applyAutomaticSessionStage(session);
    }
    modal = nextModal;
    saveState();
    showToast("Player removed from attendance.");
    return true;
  }
  if (deleteType === "attendance-guest") {
    const session = getSession(target.dataset.session);
    const guestKey = target.dataset.guestKey;
    if (!session || !guestKey) return false;
    ensureSessionAttendance(session);
    session.removedGuestKeys = uniqueIds([...(session.removedGuestKeys || []), guestKey]);
    syncSessionPayments(session);
    applyAutomaticSessionStage(session);
    modal = nextModal;
    saveState();
    showToast("Guest removed from attendance.");
    return true;
  }
  if (deleteType === "activity") {
    const activity = state.activities.find((item) => item.id === target.dataset.activity);
    if (!activity) return false;
    state.activities = state.activities.filter((item) => item.id !== activity.id);
    modal = null;
    saveState();
    showToast("Activity deleted.");
    return true;
  }
  if (deleteType === "payment-group") {
    const group = getPaymentGroup(target.dataset.paymentGroup);
    if (!group) return false;
    group.active = false;
    modal = null;
    saveState();
    showToast("Payment group deleted.");
    return true;
  }
  if (deleteType === "payment-transaction") {
    if (!deletePaymentTransaction(target.dataset.transaction)) return false;
    modal = nextModal?.type === "groupPaymentHistory" ? nextModal : null;
    saveState();
    showToast("Group payment deleted.");
    return true;
  }
  if (deleteType === "payment-history") {
    const playerId = target.dataset.player;
    const historyType = target.dataset.historyType;
    if (!playerId || !historyType) return false;
    if (historyType === "session") {
      const session = getSession(target.dataset.session);
      const payment = session?.payments?.[playerId];
      if (!session || !payment) return false;
      adjustPaymentAdvance(payment, playerId, 0);
      payment.paidAmount = 0;
      payment.paidDate = "";
      payment.status = "Pending";
      applyAutomaticSessionStage(session);
    } else if (historyType === "activity") {
      const activity = state.activities.find((item) => item.id === target.dataset.activity);
      const share = activity?.shares?.[playerId];
      if (!activity || !share) return false;
      share.paidAmount = 0;
      share.status = "Pending";
    } else if (historyType === "advance") {
      reducePlayerAdvance(playerId, Number(target.dataset.amount || playerLooseAdvance(playerId)));
    } else {
      return false;
    }
    modal = { type: "paymentHistory", playerId };
    saveState();
    showToast("Payment entry deleted.");
    return true;
  }
  return false;
}

function playerLedger(playerId) {
  const sessionItems = sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .map((session) => {
      const payment = session.payments?.[playerId];
      const outstanding = paymentOutstanding(payment, session);
      return payment && outstanding > 0
        ? {
            type: "session",
            id: `${session.id}:${playerId}`,
            date: session.date || "",
            label: `${formatDate(session.date)} session`,
            session,
            payment,
            outstanding
          }
        : null;
    })
    .filter(Boolean);
  const activityItems = [...(state.activities || [])]
    .filter((activity) => !activityIsShuttle(activity))
    .sort((a, b) => `${a.date}${a.name}`.localeCompare(`${b.date}${b.name}`))
    .map((activity) => {
      const share = activity.shares?.[playerId];
      const outstanding = shareOutstanding(share);
      return share && outstanding > 0
        ? {
            type: "activity",
            id: `${activity.id}:${playerId}`,
            date: activity.date || "",
            label: activityLedgerLabel(activity),
            activity,
            share,
            outstanding
          }
        : null;
    })
    .filter(Boolean);
  return [...sessionItems, ...activityItems].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare) return dateCompare;
    if (a.type !== b.type) return a.type === "session" ? -1 : 1;
    return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
  });
}

function paymentAdvanceKey(session, payment) {
  return `session:${session?.id || ""}:${payment?.playerId || ""}`;
}

function shareAdvanceKey(activity, share) {
  return `activity:${activity?.id || ""}:${share?.playerId || ""}`;
}

function playerAdvanceRecoveryDetails(playerId) {
  let remaining = playerAvailableAdvance(playerId);
  const applications = new Map();
  playerLedger(playerId).forEach((item) => {
    if (remaining <= 0) return;
    const applied = Math.min(remaining, item.outstanding);
    const balanceAfter = Number((remaining - applied).toFixed(2));
    const recovery = {
      applied: Number(applied.toFixed(2)),
      balanceAfter
    };
    if (item.type === "session") {
      applications.set(paymentAdvanceKey(item.session, item.payment), recovery);
    }
    if (item.type === "activity") {
      applications.set(shareAdvanceKey(item.activity, item.share), recovery);
    }
    remaining = balanceAfter;
  });
  return applications;
}

function playerAdvanceApplications(playerId) {
  const applications = new Map();
  playerAdvanceRecoveryDetails(playerId).forEach((recovery, key) => {
    applications.set(key, recovery.applied);
  });
  return applications;
}

function paymentAdvanceApplied(session, payment) {
  if (!session || !payment?.playerId || payment.status === "Paid") return 0;
  return Number(playerAdvanceApplications(payment.playerId).get(paymentAdvanceKey(session, payment)) || 0);
}

function paymentAdvanceBalanceAfter(session, payment) {
  if (!session || !payment?.playerId || payment.status === "Paid") return 0;
  const recovery = playerAdvanceRecoveryDetails(payment.playerId).get(paymentAdvanceKey(session, payment));
  return Number(recovery?.balanceAfter || 0);
}

function paymentOutstandingAfterAdvance(payment, session) {
  return Math.max(0, Number((paymentOutstanding(payment, session) - paymentAdvanceApplied(session, payment)).toFixed(2)));
}

function paymentCollectedAmount(session, payment) {
  return Math.min(paymentDueAmount(payment, session), Number(payment?.paidAmount || 0) + paymentAdvanceApplied(session, payment));
}

function paymentEffectiveStatus(session, payment) {
  if (!payment) return "Pending";
  const due = paymentDueAmount(payment, session);
  const covered = paymentCollectedAmount(session, payment);
  if (due <= 0 || payment.status === "Paid" || covered >= due) return "Paid";
  return covered > 0 ? "Partial" : "Pending";
}

function shareAdvanceApplied(activity, share) {
  if (!activity || !share?.playerId || share.status === "Paid") return 0;
  return Number(playerAdvanceApplications(share.playerId).get(shareAdvanceKey(activity, share)) || 0);
}

function shareAdvanceBalanceAfter(activity, share) {
  if (!activity || !share?.playerId || share.status === "Paid") return 0;
  const recovery = playerAdvanceRecoveryDetails(share.playerId).get(shareAdvanceKey(activity, share));
  return Number(recovery?.balanceAfter || 0);
}

function shareOutstandingAfterAdvance(activity, share) {
  return Math.max(0, Number((shareOutstanding(share) - shareAdvanceApplied(activity, share)).toFixed(2)));
}

function shareCollectedAmount(activity, share) {
  return Math.min(Number(share?.amount || 0), Number(share?.paidAmount || 0) + shareAdvanceApplied(activity, share));
}

function playerLedgerOutstanding(playerId) {
  return playerLedger(playerId).reduce((total, item) => total + item.outstanding, 0);
}

function playerBalance(playerId) {
  return Math.max(0, Number((playerLedgerOutstanding(playerId) - playerAvailableAdvance(playerId)).toFixed(2)));
}

function playerCoveredAmount(playerId) {
  const sessionCovered = sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .reduce((total, session) => total + paymentCollectedAmount(session, session.payments?.[playerId]), 0);
  const activityCovered = [...(state.activities || [])]
    .filter((activity) => !activityIsShuttle(activity))
    .reduce((total, activity) => total + shareCollectedAmount(activity, activity.shares?.[playerId]), 0);
  return Number((sessionCovered + activityCovered).toFixed(2));
}

function playerNetBalance(playerId) {
  return Number((playerLedgerOutstanding(playerId) - playerAvailableAdvance(playerId)).toFixed(2));
}

function playerLinkedAdvance(playerId) {
  return sortSessions().reduce((total, session) => total + Number(session.payments?.[playerId]?.advanceAmount || 0), 0);
}

function playerUpcomingLinkedAdvance(playerId) {
  return sortSessions()
    .filter((session) => !sessionIsCollectible(session))
    .reduce((total, session) => total + Number(session.payments?.[playerId]?.advanceAmount || 0), 0);
}

function playerAvailableCredit(playerId) {
  return Math.max(0, Number((playerCreditAdvance(playerId) - playerUpcomingLinkedAdvance(playerId)).toFixed(2)));
}

function playerAvailableAdvance(playerId) {
  return Math.max(0, Number((playerAvailableCredit(playerId) + playerIntentionalAdvancePaid(playerId)).toFixed(2)));
}

function playerAdvanceAppliedToLedger(playerId) {
  return Math.min(playerLedgerOutstanding(playerId), playerAvailableAdvance(playerId));
}

function playerRemainingAdvance(playerId) {
  return Math.max(0, Number((playerAvailableAdvance(playerId) - playerLedgerOutstanding(playerId)).toFixed(2)));
}

function playerRemainingCredit(playerId) {
  const ledgerAfterIntentionalAdvance = Math.max(0, Number((playerLedgerOutstanding(playerId) - playerIntentionalAdvancePaid(playerId)).toFixed(2)));
  return Math.max(0, Number((playerAvailableCredit(playerId) - ledgerAfterIntentionalAdvance).toFixed(2)));
}

function playerLooseAdvance(playerId) {
  return Math.max(0, Number((playerCreditAdvance(playerId) - playerLinkedAdvance(playerId)).toFixed(2)));
}

function reducePlayerAdvance(playerId, amount) {
  const nextAdvance = Math.max(0, playerAdvance(playerId) - Number(amount || 0));
  state.advances = state.advances || {};
  if (nextAdvance > 0) {
    state.advances[playerId] = Number(nextAdvance.toFixed(2));
  } else {
    delete state.advances[playerId];
  }
}

function reducePlayerCredit(playerId, amount) {
  const requestedAmount = Number(amount || 0);
  if (!playerId || !Number.isFinite(requestedAmount) || requestedAmount <= 0) return 0;
  const creditUsed = Math.min(playerRemainingCredit(playerId), requestedAmount);
  if (creditUsed <= 0) return 0;
  reducePlayerAdvance(playerId, creditUsed);
  return Number(creditUsed.toFixed(2));
}

function playerPaymentCorrectionItems(playerId) {
  const sessionItems = sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .map((session) => {
      const payment = session.payments?.[playerId];
      const paidAmount = Number(payment?.paidAmount || 0);
      const advanceAmount = Number(payment?.advanceAmount || 0);
      return paidAmount > 0 || advanceAmount > 0
        ? {
            type: "session",
            id: session.id,
            date: session.date || "",
            label: `${formatDate(session.date)} session`,
            paidAmount,
            advanceAmount,
            session,
            payment
          }
        : null;
    })
    .filter(Boolean);
  const activityItems = [...(state.activities || [])]
    .filter((activity) => !activityIsShuttle(activity))
    .map((activity) => {
      const share = activity.shares?.[playerId];
      const paidAmount = Number(share?.paidAmount || 0);
      if (activity.paidById === playerId) return null;
      return paidAmount > 0
        ? {
            type: "activity",
            id: activity.id,
            date: activity.date || "",
            label: activityLedgerLabel(activity, "paid to"),
            paidAmount,
            advanceAmount: 0,
            activity,
            share
          }
        : null;
    })
    .filter(Boolean);
  const looseAdvance = playerLooseAdvance(playerId);
  const advanceItem = looseAdvance > 0
    ? [{ type: "advance", id: "advance", date: "", label: "Advance balance", paidAmount: 0, advanceAmount: looseAdvance }]
    : [];
  return [...sessionItems, ...activityItems, ...advanceItem].sort((a, b) => {
    if (a.type === "advance" || b.type === "advance") return a.type === "advance" ? 1 : -1;
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
  });
}

function paymentHistoryAmount(item) {
  return Number(item.paidAmount || 0) + Number(item.advanceAmount || 0);
}

function playerAdvanceCycleSummaries(playerId) {
  const ledgerRemainders = playerLedger(playerId).map((item) => ({
    item,
    remaining: Number(item.outstanding || 0)
  }));
  return playerIntentionalAdvancePayments(playerId).map((payment) => {
    let balance = payment.amount;
    let deducted = 0;
    const deductions = [];
    ledgerRemainders.forEach((ledger) => {
      if (balance <= 0 || ledger.remaining <= 0) return;
      const amount = Math.min(balance, ledger.remaining);
      balance = Number((balance - amount).toFixed(2));
      ledger.remaining = Number((ledger.remaining - amount).toFixed(2));
      deducted = Number((deducted + amount).toFixed(2));
      deductions.push({
        type: ledger.item.type,
        date: ledger.item.date || "",
        label: advanceDeductionLabel(ledger.item),
        amount: Number(amount.toFixed(2)),
        balanceAfter: balance
      });
    });
    return {
      id: payment.id,
      transaction: payment.transaction,
      date: payment.date,
      received: payment.amount,
      deducted,
      balance,
      deductions
    };
  });
}

function emptyAdvanceSummary() {
  return { received: 0, deducted: 0, balance: 0, deductions: [], transaction: null, date: "" };
}

function playerCurrentAdvanceCycle(playerId) {
  const summaries = playerAdvanceCycleSummaries(playerId);
  if (!summaries.length) return emptyAdvanceSummary();
  return summaries.find((summary) => summary.balance > 0) || summaries[summaries.length - 1];
}

function playerAdvanceSummary(playerId) {
  const summary = playerCurrentAdvanceCycle(playerId);
  return {
    received: summary.received,
    deducted: summary.deducted,
    balance: summary.balance
  };
}

function advanceDeductionLabel(item) {
  if (item.type === "session") return `${formatDate(item.session.date)} session`;
  if (item.type === "activity") return `${formatDate(item.activity.date)} ${item.activity.name || "Activity"}`;
  return item.label || "Deduction";
}

function advanceDeductionCopyLine(deduction) {
  return `- ${deduction.label}: Deducted ${currency(deduction.amount)}, Bal adv ${currency(deduction.balanceAfter)}`;
}

function playerAdvanceSummaryLines(playerId) {
  return playerCurrentAdvanceCycle(playerId).deductions.map(advanceDeductionCopyLine);
}

function buildPlayerAdvanceSummaryCopy(playerId) {
  const player = getPlayer(playerId);
  if (!player) return "Player not found.";
  const playerName = player.name || player.displayName || "Player";
  const summary = playerAdvanceSummary(playerId);
  const lines = [
    `${playerName} - Advance Summary`,
    `Advance Paid: ${currency(summary.received)}`,
    `Deducted: ${currency(summary.deducted)}`,
    `Balance: ${currency(summary.balance)}`
  ];
  appendCopySection(lines, "Deductions", playerAdvanceSummaryLines(playerId));
  return lines.join("\n");
}

function buildPlayerPaymentHistoryCopy(playerId) {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  if (!player) return "Player not found.";
  const attendanceCount = playerAttendanceCount(playerId);
  const totalDue = playerLedgerOutstanding(playerId);
  const advanceBalance = playerAvailableAdvance(playerId);
  const revisedDue = playerBalance(playerId);
  const currentStatus = revisedDue > 0
    ? `${currency(revisedDue)} owed`
    : playerRemainingAdvance(playerId) > 0
      ? `${currency(playerRemainingAdvance(playerId))} advance available`
      : "Clear";
  const lines = [
    `${playerName} - Payment History`,
    `Attendance: ${attendanceCount}`,
    `Payment Method: ${normalizePaymentMethod(player.paymentMethod) || "Not set"}`,
    `Current Status: ${currentStatus}`
  ];

  appendCopySection(lines, "Sessions", playerSessionPaymentCopyLines(playerId));
  appendCopySection(lines, "Activities", playerActivityPaymentCopyLines(playerId));
  appendCopySection(lines, "Payment Transactions", playerPaymentTransactionCopyLines(playerId));
  appendAdvanceCopySection(lines, totalDue, advanceBalance, revisedDue);

  return lines.join("\n");
}

function buildPaymentGroupPaymentHistoryCopy(groupId = "") {
  const group = getPaymentGroup(groupId);
  if (!group) return "Payment group not found.";
  const playerIds = paymentGroupPlayerIds(group);
  const totalDue = groupPlayerIdsTotal(playerIds, playerLedgerOutstanding);
  const advanceBalance = groupPlayerIdsTotal(playerIds, playerAvailableAdvance);
  const revisedDue = groupPlayerIdsTotal(playerIds, playerBalance);
  const lines = [
    `${group.name || "Payment Group"} - Payment History`,
    `Paid by: ${group.payerId ? getPlayerName(group.payerId) : "Not set"}`,
    `Members: ${paymentGroupMemberNames(group)}`,
    `Current Status: ${revisedDue > 0 ? `${currency(revisedDue)} owed` : "Clear"}`
  ];

  appendCopySection(lines, "Sessions", sessionPaymentCopyLinesForPlayers(playerIds, { dueOnly: false }));
  appendCopySection(lines, "Activities", activityPaymentCopyLinesForPlayers(playerIds, { dueOnly: false }));
  appendCopySection(lines, "Payment Transactions", paymentGroupTransactionCopyLines(group.id));
  appendAdvanceCopySection(lines, totalDue, advanceBalance, revisedDue);

  return lines.join("\n");
}

function appendAdvanceCopySection(lines, totalDue, advanceBalance, revisedDue) {
  const appliedAdvance = Math.min(Number(totalDue || 0), Number(advanceBalance || 0));
  const remainingAdvance = Math.max(0, Number((Number(advanceBalance || 0) - Number(totalDue || 0)).toFixed(2)));
  if (advanceBalance <= 0) return;
  lines.push("", "Advance");
  if (totalDue > 0) {
    lines.push(`- Total due before advance: ${currency(totalDue)}`);
    lines.push(`- Advance used: ${currency(appliedAdvance)}`);
    lines.push(`- Revised due: ${currency(revisedDue)}`);
    if (remainingAdvance > 0) lines.push(`- Advance balance remaining: ${currency(remainingAdvance)}`);
  } else {
    lines.push(`- Advance balance available: ${currency(advanceBalance)}`);
  }
}

function buildPlayerDueHistoryCopy(playerId) {
  const player = getPlayer(playerId);
  const playerName = player?.name || player?.displayName || "Player";
  if (!player) return "Player not found.";
  const lines = playerDueHistoryCopyLines(`${playerName} - Payment Reminder`, [playerId]);
  return lines.join("\n");
}

function buildPaymentGroupDueHistoryCopy(groupId = "") {
  const group = getPaymentGroup(groupId);
  if (!group) return "Payment group not found.";
  const playerIds = paymentGroupPlayerIds(group);
  const lines = playerDueHistoryCopyLines(`${group.name || "Payment Group"} - Payment Reminder`, playerIds, [
    `Paid by: ${group.payerId ? getPlayerName(group.payerId) : "Not set"}`,
    `Members: ${paymentGroupMemberNames(group)}`
  ]);
  return lines.join("\n");
}

function playerDueHistoryCopyLines(title, playerIds, introLines = []) {
  const totalDue = groupPlayerIdsTotal(playerIds, playerLedgerOutstanding);
  const advanceBalance = groupPlayerIdsTotal(playerIds, playerAvailableAdvance);
  const revisedDue = groupPlayerIdsTotal(playerIds, playerBalance);
  const lines = [title, ...introLines];

  if (advanceBalance > 0 && totalDue > 0) {
    lines.push(`Total Due: ${currency(totalDue)}`);
    lines.push(`Advance Balance: ${currency(advanceBalance)}`);
    lines.push(`Revised Due: ${currency(revisedDue)}`);
  } else {
    lines.push(`Total Due: ${currency(revisedDue)}`);
  }

  if (revisedDue <= 0) {
    lines.push("", "No pending balance.");
    return lines;
  }

  appendCopySection(lines, "Sessions", sessionPaymentCopyLinesForPlayers(playerIds, { dueOnly: true }));
  appendCopySection(lines, "Activities", activityPaymentCopyLinesForPlayers(playerIds, { dueOnly: true }));

  return lines;
}

function appendCopySection(lines, title, sectionLines) {
  if (!sectionLines.length) return;
  lines.push("", title);
  lines.push(...sectionLines);
}

function playerSessionPaymentCopyLines(playerId) {
  return sessionPaymentCopyLinesForPlayers([playerId], { dueOnly: false });
}

function playerSessionDueCopyLines(playerId) {
  return sessionPaymentCopyLinesForPlayers([playerId], { dueOnly: true });
}

function sessionPaymentCopyLinesForPlayers(playerIds, { dueOnly = false } = {}) {
  const ids = uniqueIds(playerIds || []).filter((playerId) => getPlayer(playerId)?.active !== false);
  const byDate = new Map();
  sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .forEach((session) => {
      ids.forEach((playerId) => {
        const payment = session.payments?.[playerId];
        if (!payment) return;
        const pending = paymentOutstandingAfterAdvance(payment, session);
        if (dueOnly && pending <= 0) return;
        const due = paymentDueAmount(payment, session);
        const paid = Number(payment.paidAmount || 0);
        const advanceUsed = paymentAdvanceApplied(session, payment);
        const extraAdvance = Number(payment.advanceAmount || 0);
        if (!dueOnly && due <= 0 && paid <= 0 && advanceUsed <= 0 && extraAdvance <= 0) return;
        const dateKey = session.date || "";
        const summary = byDate.get(dateKey) || {
          date: dateKey,
          due: 0,
          paid: 0,
          advanceUsed: 0,
          advanceBalanceByPlayer: new Map(),
          extraAdvance: 0,
          pending: 0
        };
        summary.due += due;
        summary.paid += paid;
        summary.advanceUsed += advanceUsed;
        if (advanceUsed > 0) {
          summary.advanceBalanceByPlayer.set(playerId, paymentAdvanceBalanceAfter(session, payment));
        }
        summary.extraAdvance += extraAdvance;
        summary.pending += pending;
        byDate.set(dateKey, summary);
      });
    });

  return [...byDate.values()]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
    .map((summary) => {
      const details = [
        `Due ${currency(summary.due)}`
      ];
      if (summary.paid > 0 || !summary.advanceUsed) details.push(`Paid ${currency(summary.paid)}`);
      if (summary.advanceUsed) {
        details.push(`Recovered from adv ${currency(summary.advanceUsed)}`);
        details.push(`Bal adv ${currency(summaryAdvanceBalance(summary))}`);
      }
      if (!dueOnly && summary.extraAdvance) details.push(`Extra advance ${currency(summary.extraAdvance)}`);
      if (summary.pending) details.push(`Pending ${currency(summary.pending)}`);
      return `- ${summary.date ? formatDate(summary.date) : "Date not set"}: ${details.join(", ")}`;
    });
}

function playerActivityPaymentCopyLines(playerId) {
  return activityPaymentCopyLinesForPlayers([playerId], { dueOnly: false });
}

function playerActivityDueCopyLines(playerId) {
  return activityPaymentCopyLinesForPlayers([playerId], { dueOnly: true });
}

function activityPaymentCopyLinesForPlayers(playerIds, { dueOnly = false } = {}) {
  const ids = uniqueIds(playerIds || []).filter((playerId) => getPlayer(playerId)?.active !== false);
  return [...(state.activities || [])]
    .filter((activity) => !activityIsShuttle(activity))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }))
    .map((activity) => {
      const summary = ids.reduce(
        (total, playerId) => {
          const share = activity.shares?.[playerId];
          if (!share) return total;
          total.share += Number(share.amount || 0);
          total.paid += Number(share.paidAmount || 0);
          const advanceUsed = shareAdvanceApplied(activity, share);
          total.advanceUsed += advanceUsed;
          if (advanceUsed > 0) {
            total.advanceBalanceByPlayer.set(playerId, shareAdvanceBalanceAfter(activity, share));
          }
          total.pending += shareOutstandingAfterAdvance(activity, share);
          total.hasShare = true;
          return total;
        },
        { share: 0, paid: 0, advanceUsed: 0, advanceBalanceByPlayer: new Map(), pending: 0, hasShare: false }
      );
      if (!summary.hasShare) return null;
      if (dueOnly && summary.pending <= 0) return null;
      if (!dueOnly && summary.share <= 0 && summary.paid <= 0 && summary.advanceUsed <= 0 && summary.pending <= 0) return null;
      const details = [
        `Share ${currency(summary.share)}`
      ];
      if (summary.paid > 0 || !summary.advanceUsed) details.push(`Paid ${currency(summary.paid)}`);
      if (summary.advanceUsed) {
        details.push(`Recovered from adv ${currency(summary.advanceUsed)}`);
        details.push(`Bal adv ${currency(summaryAdvanceBalance(summary))}`);
      }
      if (summary.pending) details.push(`Pending ${currency(summary.pending)}`);
      return `- ${formatDate(activity.date)} ${activity.name || "Activity"}: ${details.join(", ")}`;
    })
    .filter(Boolean);
}

function summaryAdvanceBalance(summary) {
  return Number([...summary.advanceBalanceByPlayer.values()].reduce((total, amount) => total + Number(amount || 0), 0).toFixed(2));
}

function playerPaymentTransactionCopyLines(playerId) {
  return [...(state.paymentTransactions || [])]
    .filter((transaction) => (transaction.allocations || []).some((allocation) => allocation.playerId === playerId))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map((transaction) => {
      const group = getPaymentGroup(transaction.groupId);
      const allocations = (transaction.allocations || []).filter((allocation) => allocation.playerId === playerId);
      const applied = allocations
        .filter((allocation) => allocation.type === "session" || allocation.type === "activity")
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
      const creditUsed = allocations
        .filter((allocation) => allocation.type === "credit-use")
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
      const advance = allocations
        .filter((allocation) => allocation.type === "advance")
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0);
      if (transaction.type === "advance-payment") {
        return `- ${formatDate(transaction.date)} Advance payment: Received ${currency(transaction.amountPaid)}, Added to advance ${currency(advance || transaction.advanceAmount || transaction.amountPaid)}`;
      }
      const details = [`Paid by ${getPlayerName(transaction.paidById)}`];
      if (applied) details.push(`Applied ${currency(applied)}`);
      if (creditUsed) details.push(`Credit used ${currency(creditUsed)}`);
      if (advance) details.push(`Credit added ${currency(advance)}`);
      return `- ${formatDate(transaction.date)} ${group?.name || "Group payment"}: ${details.join(", ")}`;
    });
}

function paymentTransactionCreditUsed(transaction) {
  return Number((transaction?.allocations || [])
    .filter((allocation) => allocation.type === "credit-use")
    .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
    .toFixed(2));
}

function paymentGroupTransactionCopyLines(groupId = "") {
  return paymentGroupTransactions(groupId).map((transaction) => {
    const payerName = getPlayerName(transaction.paidById);
    const coveredNames = uniqueIds(transaction.playerIds || []).map(getPlayerName).filter(Boolean);
    const coveredLabel = coveredNames.length ? ` for ${coveredNames.join(", ")}` : "";
    const creditUsed = paymentTransactionCreditUsed(transaction);
    const details = [
      `Cash paid ${currency(transaction.amountPaid)}`,
      `Applied ${currency(Number(transaction.appliedAmount || 0))}`
    ];
    if (creditUsed) details.push(`Credit used ${currency(creditUsed)}`);
    if (Number(transaction.advanceAmount || 0)) details.push(`Credit added ${currency(transaction.advanceAmount)}`);
    return `- ${formatDate(transaction.date)}: Paid by ${payerName}${coveredLabel}, ${details.join(", ")}`;
  });
}

function groupPlayerIdsTotal(playerIds, amountFn) {
  return Number(uniqueIds(playerIds || []).reduce((total, playerId) => total + Number(amountFn(playerId) || 0), 0).toFixed(2));
}

function balancePlayersOrder(players) {
  return [...players].sort((a, b) => {
    const aBalance = playerBalance(a.id);
    const bBalance = playerBalance(b.id);
    const aDue = aBalance > 0;
    const bDue = bBalance > 0;
    if (aDue !== bDue) return aDue ? -1 : 1;
    const aAdvance = playerRemainingAdvance(a.id);
    const bAdvance = playerRemainingAdvance(b.id);
    const aHasAdvance = aAdvance > 0;
    const bHasAdvance = bAdvance > 0;
    if (!aDue && aHasAdvance !== bHasAdvance) return aHasAdvance ? -1 : 1;
    if (!aDue && aAdvance !== bAdvance) return bAdvance - aAdvance;
    return (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "", undefined, { sensitivity: "base" });
  });
}

function advancePlayersOrder(players) {
  return [...players]
    .filter((player) => playerAdvanceSummary(player.id).received > 0)
    .sort((a, b) => {
      const aSummary = playerAdvanceSummary(a.id);
      const bSummary = playerAdvanceSummary(b.id);
      if (aSummary.balance !== bSummary.balance) return bSummary.balance - aSummary.balance;
      if (aSummary.deducted !== bSummary.deducted) return bSummary.deducted - aSummary.deducted;
      return (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "", undefined, { sensitivity: "base" });
    });
}

function paymentGroupsList() {
  return [...(state.paymentGroups || [])]
    .filter((group) => group.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
}

function getPaymentGroup(groupId = "") {
  return (state?.paymentGroups || []).find((group) => group.id === groupId) || null;
}

function paymentGroupGrossBalance(group) {
  return groupPlayerIdsTotal(paymentGroupPlayerIds(group), playerBalance);
}

function paymentGroupPayerCreditOffset(group) {
  const grossBalance = paymentGroupGrossBalance(group);
  if (!group?.payerId || grossBalance <= 0) return 0;
  return Math.min(grossBalance, playerRemainingCredit(group.payerId));
}

function paymentGroupBalance(group) {
  return Math.max(0, Number((paymentGroupGrossBalance(group) - paymentGroupPayerCreditOffset(group)).toFixed(2)));
}

function paymentGroupPlayerIds(group) {
  return uniqueIds(group?.playerIds || []).filter((playerId) => getPlayer(playerId)?.active !== false);
}

function paymentGroupMembers(group) {
  return paymentGroupPlayerIds(group)
    .map((playerId) => getPlayer(playerId))
    .filter(Boolean);
}

function paymentGroupMemberCount(group) {
  return paymentGroupMembers(group).length + paymentGroupGuestNames(group).length;
}

function paymentGroupMemberNames(group) {
  const names = [...paymentGroupMembers(group).map((player) => player.name || player.displayName || "Player"), ...paymentGroupGuestNames(group)];
  return names.length ? names.join(", ") : "No players selected";
}

function paymentGroupTransactions(groupId) {
  return [...(state.paymentTransactions || [])]
    .filter((transaction) => transaction.groupId === groupId)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function adjustStateAdvanceBalance(targetState, playerId, delta) {
  if (!playerId || !Number.isFinite(delta) || delta === 0) return;
  targetState.advances = targetState.advances || {};
  const nextAmount = Number(((Number(targetState.advances[playerId] || 0) + delta)).toFixed(2));
  if (nextAmount > 0) {
    targetState.advances[playerId] = nextAmount;
  } else {
    delete targetState.advances[playerId];
  }
}

function assignGroupPaymentCreditsToPayers(targetState = state) {
  const playerIds = new Set((targetState.players || []).map((player) => player.id));
  (targetState.paymentTransactions || []).forEach((transaction) => {
    if (transaction.type !== "group-payment") return;
    const payerId = String(transaction.paidById || "");
    if (!payerId || !playerIds.has(payerId)) return;
    const allocations = transaction.allocations || [];
    // Group credit retains the legacy "advance" schema fields for backup compatibility.
    const creditAllocations = allocations.filter((allocation) => allocation.type === "advance" && Number(allocation.amount || 0) > 0);
    const creditTotal = Number(creditAllocations.reduce((total, allocation) => total + Number(allocation.amount || 0), 0).toFixed(2));
    if (creditTotal <= 0) return;

    const currentByPlayer = new Map();
    creditAllocations.forEach((allocation) => {
      currentByPlayer.set(allocation.playerId, Number(((currentByPlayer.get(allocation.playerId) || 0) + Number(allocation.amount || 0)).toFixed(2)));
    });
    const alreadyAssignedToPayer = creditAllocations.length === 1
      && creditAllocations[0].playerId === payerId
      && Number(creditAllocations[0].amount || 0) === creditTotal;
    if (alreadyAssignedToPayer) return;

    new Set([...currentByPlayer.keys(), payerId]).forEach((playerId) => {
      const targetAmount = playerId === payerId ? creditTotal : 0;
      adjustStateAdvanceBalance(targetState, playerId, targetAmount - Number(currentByPlayer.get(playerId) || 0));
    });
    transaction.allocations = [
      ...allocations.filter((allocation) => allocation.type !== "advance"),
      { type: "advance", playerId: payerId, sessionId: "", activityId: "", amount: creditTotal }
    ];
    transaction.advanceAmount = creditTotal;
  });
  return targetState;
}

function splitAmountAcrossPlayerBalances(playerIds, amount, balanceByPlayer = new Map()) {
  const ids = uniqueIds(playerIds).filter((playerId) => getPlayer(playerId)?.active !== false);
  let remainingCents = Math.max(0, Math.round(Number(amount || 0) * 100));
  const capByPlayer = new Map(
    ids.map((playerId) => {
      const balanceValue = balanceByPlayer.has(playerId) ? balanceByPlayer.get(playerId) : playerBalance(playerId);
      return [playerId, Math.max(0, Math.round(Number(balanceValue || 0) * 100))];
    })
  );
  const centsByPlayer = new Map(ids.map((playerId) => [playerId, 0]));
  let eligibleIds = ids.filter((playerId) => (capByPlayer.get(playerId) || 0) > 0);

  while (remainingCents > 0 && eligibleIds.length) {
    const baseCents = Math.floor(remainingCents / eligibleIds.length);
    const extraCents = remainingCents % eligibleIds.length;
    let distributedCents = 0;
    const nextEligibleIds = [];

    eligibleIds.forEach((playerId, index) => {
      const desiredCents = baseCents + (index < extraCents ? 1 : 0);
      const paymentCents = Math.min(desiredCents, capByPlayer.get(playerId) || 0);
      if (paymentCents <= 0) return;
      centsByPlayer.set(playerId, (centsByPlayer.get(playerId) || 0) + paymentCents);
      capByPlayer.set(playerId, (capByPlayer.get(playerId) || 0) - paymentCents);
      distributedCents += paymentCents;
      if ((capByPlayer.get(playerId) || 0) > 0) nextEligibleIds.push(playerId);
    });

    if (distributedCents <= 0) break;
    remainingCents -= distributedCents;
    eligibleIds = nextEligibleIds;
  }

  return {
    allocations: ids
      .map((playerId) => ({ playerId, amount: Number(((centsByPlayer.get(playerId) || 0) / 100).toFixed(2)) }))
      .filter((item) => item.amount > 0),
    remaining: Number((remainingCents / 100).toFixed(2))
  };
}

function applyGroupPaymentForPlayer(playerId, amount) {
  let remaining = Number(amount || 0);
  let playerRemaining = playerBalance(playerId);
  let applied = 0;
  const allocations = [];
  playerLedger(playerId).forEach((item) => {
    if (remaining <= 0 || playerRemaining <= 0) return;
    const paymentAmount = Math.min(remaining, item.outstanding, playerRemaining);
    if (paymentAmount <= 0) return;
    if (item.type === "session") {
      applySessionPayment(item.payment, item.session, paymentAmount);
      allocations.push({ type: "session", playerId, sessionId: item.session.id, amount: Number(paymentAmount.toFixed(2)) });
    } else {
      applyActivityPayment(item.share, paymentAmount);
      allocations.push({ type: "activity", playerId, activityId: item.activity.id, amount: Number(paymentAmount.toFixed(2)) });
    }
    applied += paymentAmount;
    remaining = Number((remaining - paymentAmount).toFixed(2));
    playerRemaining = Number((playerRemaining - paymentAmount).toFixed(2));
  });
  return { applied: Number(applied.toFixed(2)), remaining: Number(remaining.toFixed(2)), allocations };
}

function applyGroupPayment({ paidById, playerIds, amountPaid, groupId = "" }) {
  const selectedIds = uniqueIds(playerIds).filter((playerId) => getPlayer(playerId)?.active !== false);
  const paidAmount = Number(amountPaid || 0);
  if (!paidById || !selectedIds.length || !Number.isFinite(paidAmount) || paidAmount < 0) {
    return { applied: 0, remaining: Math.max(0, paidAmount || 0), allocations: [] };
  }
  let applied = 0;
  const allocations = [];
  const balanceByPlayer = new Map(selectedIds.map((playerId) => [playerId, playerBalance(playerId)]));
  const groupDue = groupPlayerIdsTotal(selectedIds, (playerId) => balanceByPlayer.get(playerId));
  const availableCredit = Math.min(groupDue, playerRemainingCredit(paidById));
  const fundingAmount = Number((paidAmount + availableCredit).toFixed(2));
  if (fundingAmount <= 0) {
    return { applied: 0, creditUsed: 0, remaining: 0, allocations: [] };
  }
  const dueSplit = splitAmountAcrossPlayerBalances(selectedIds, fundingAmount, balanceByPlayer);

  dueSplit.allocations.forEach((share) => {
    const result = applyGroupPaymentForPlayer(share.playerId, share.amount);
    applied += result.applied;
    allocations.push(...result.allocations);
  });

  const creditUsed = reducePlayerCredit(paidById, Math.min(availableCredit, applied));
  if (creditUsed > 0) {
    allocations.push({ type: "credit-use", playerId: paidById, amount: creditUsed });
  }
  const cashApplied = Math.max(0, Number((applied - creditUsed).toFixed(2)));
  const creditTotal = Math.max(0, Number((paidAmount - cashApplied).toFixed(2)));
  if (creditTotal > 0) {
    addPlayerAdvance(paidById, creditTotal);
    allocations.push({ type: "advance", playerId: paidById, amount: creditTotal });
  }
  const transaction = {
    id: createId("payment-transaction"),
    type: "group-payment",
    date: new Date().toISOString().slice(0, 10),
    paidById,
    groupId,
    playerIds: selectedIds,
    amountPaid: Number(paidAmount.toFixed(2)),
    appliedAmount: Number(applied.toFixed(2)),
    advanceAmount: Number(creditTotal.toFixed(2)),
    allocations
  };
  state.paymentTransactions = state.paymentTransactions || [];
  state.paymentTransactions.push(transaction);
  return {
    applied: Number(applied.toFixed(2)),
    creditUsed,
    remaining: Number(creditTotal.toFixed(2)),
    allocations,
    transaction
  };
}

function reversePaymentAllocation(allocation) {
  const amount = Number(allocation?.amount || 0);
  if (!allocation?.playerId || amount <= 0) return;
  if (allocation.type === "session") {
    const session = getSession(allocation.sessionId);
    const payment = session?.payments?.[allocation.playerId];
    if (!session || !payment) return;
    payment.paidAmount = Math.max(0, Number(payment.paidAmount || 0) - amount);
    payment.paidDate = payment.paidAmount > 0 ? payment.paidDate || new Date().toISOString().slice(0, 10) : "";
    payment.status = payment.paidAmount <= 0 ? "Pending" : payment.paidAmount >= paymentDueAmount(payment, session) ? "Paid" : "Partial";
    applyAutomaticSessionStage(session);
    return;
  }
  if (allocation.type === "activity") {
    const activity = (state.activities || []).find((item) => item.id === allocation.activityId);
    const share = activity?.shares?.[allocation.playerId];
    if (!share) return;
    share.paidAmount = Math.max(0, Number(share.paidAmount || 0) - amount);
    share.status = share.paidAmount <= 0 ? "Pending" : share.paidAmount >= Number(share.amount || 0) ? "Paid" : "Partial";
    return;
  }
  if (allocation.type === "credit-use") {
    addPlayerAdvance(allocation.playerId, amount);
    return;
  }
  if (allocation.type === "advance") {
    reducePlayerAdvance(allocation.playerId, amount);
  }
}

function deletePaymentTransaction(transactionId) {
  const transaction = (state.paymentTransactions || []).find((item) => item.id === transactionId);
  if (!transaction) return false;
  if (transaction.type === "advance-payment" && transaction.separateAdvance === true) {
    state.paymentTransactions = state.paymentTransactions.filter((item) => item.id !== transaction.id);
    return true;
  }
  [...(transaction.allocations || [])].reverse().forEach((allocation) => reversePaymentAllocation(allocation));
  state.paymentTransactions = state.paymentTransactions.filter((item) => item.id !== transaction.id);
  return true;
}

function applySessionPayment(payment, session, amount) {
  const due = paymentDueAmount(payment, session);
  payment.paidAmount = Math.min(due, Number(payment.paidAmount || 0) + amount);
  payment.paidDate = payment.paidAmount > 0 ? new Date().toISOString().slice(0, 10) : "";
  payment.status = payment.paidAmount <= 0 ? "Pending" : payment.paidAmount >= due ? "Paid" : "Partial";
  applyAutomaticSessionStage(session);
}

function applyActivityPayment(share, amount) {
  const due = Number(share.amount || 0);
  share.paidAmount = Math.min(due, Number(share.paidAmount || 0) + amount);
  share.status = share.paidAmount <= 0 ? "Pending" : share.paidAmount >= due ? "Paid" : "Partial";
}

function applyPlayerPayment(playerId, amount) {
  let remaining = Number(amount || 0);
  if (!playerId || !Number.isFinite(remaining) || remaining <= 0) return { applied: 0, remaining: Math.max(0, remaining || 0) };
  let applied = 0;
  playerLedger(playerId).forEach((item) => {
    if (remaining <= 0) return;
    const paymentAmount = Math.min(remaining, item.outstanding);
    if (item.type === "session") {
      applySessionPayment(item.payment, item.session, paymentAmount);
    } else {
      applyActivityPayment(item.share, paymentAmount);
    }
    applied = Number((applied + paymentAmount).toFixed(2));
    remaining = Number((remaining - paymentAmount).toFixed(2));
  });
  if (remaining > 0) {
    addPlayerAdvance(playerId, remaining);
  }
  return { applied: Number(applied.toFixed(2)), remaining: Number(remaining.toFixed(2)) };
}

function savePaymentAmount(session, playerId, paidAmount) {
  const payment = session?.payments?.[playerId];
  if (!payment) return false;
  const amountDue = paymentDueAmount(payment, session);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    showToast("Enter a valid amount.");
    return false;
  }
  const advanceAmount = Math.max(0, paidAmount - amountDue);
  payment.paidAmount = Math.min(paidAmount, amountDue);
  payment.paidDate = paidAmount > 0 ? new Date().toISOString().slice(0, 10) : "";
  payment.status = paidAmount <= 0 ? "Pending" : paidAmount >= amountDue ? "Paid" : "Partial";
  adjustPaymentAdvance(payment, playerId, advanceAmount);
  if (advanceAmount > 0) {
    showToast(`Marked paid. ${currency(advanceAmount)} added as advance.`);
  } else {
    showToast(payment.status === "Partial" ? "Partial payment saved." : `Marked ${payment.status.toLowerCase()}.`);
  }
  return true;
}

function updatePaymentStatus(session, playerId, status) {
  const payment = session?.payments?.[playerId];
  if (!payment) return false;
  const amountDue = paymentDueAmount(payment, session);
  if (status === "Paid") {
    adjustPaymentAdvance(payment, playerId, 0);
    payment.status = "Paid";
    payment.paidAmount = amountDue;
    payment.paidDate = new Date().toISOString().slice(0, 10);
    showToast("Marked paid.");
    return true;
  }
  if (status === "Pending") {
    adjustPaymentAdvance(payment, playerId, 0);
    payment.status = "Pending";
    payment.paidAmount = 0;
    payment.paidDate = "";
    showToast("Marked pending.");
    return true;
  }
  return false;
}
