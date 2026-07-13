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
    if (!activity.playerIds.includes(playerId) && Number(activity.shares[playerId]?.paidAmount || 0) <= 0) {
      delete activity.shares[playerId];
    }
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

function activityOutstandingAfterCoverage(activity) {
  return Object.values(activity.shares || {}).reduce((total, share) => total + shareOutstandingAfterCoverage(activity, share), 0);
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

function paymentTransactionIsActive(transaction) {
  return Boolean(transaction && transaction.status !== "reversed" && !transaction.reversedAt);
}

function playerIntentionalAdvancePayments(playerId) {
  return [...(state.paymentTransactions || [])]
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.type === "advance-payment" && paymentTransactionIsActive(transaction))
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
    .filter((transaction) => transaction.type === "advance-payment" && transaction.separateAdvance !== true && paymentTransactionIsActive(transaction))
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
    createdAt: new Date().toISOString(),
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
  syncSessionStages();
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

function transactionReferencesSession(transaction, sessionId, playerId = "") {
  if (!transaction || !sessionId) return false;
  if (transaction.sessionId === sessionId && (!playerId || transaction.paidById === playerId || (transaction.playerIds || []).includes(playerId))) {
    return true;
  }
  return (transaction.allocations || []).some((allocation) => (
    allocation.type === "session"
    && allocation.sessionId === sessionId
    && (!playerId || allocation.playerId === playerId)
  ));
}

function transactionReferencesActivity(transaction, activityId, playerId = "") {
  if (!transaction || !activityId) return false;
  if (transaction.activityId === activityId && (!playerId || transaction.paidById === playerId || (transaction.playerIds || []).includes(playerId))) {
    return true;
  }
  return (transaction.allocations || []).some((allocation) => (
    allocation.type === "activity"
    && allocation.activityId === activityId
    && (!playerId || allocation.playerId === playerId)
  ));
}

function transactionHasActiveSessionAllocation(transaction, sessionId, playerId = "") {
  if (!paymentTransactionIsActive(transaction)) return false;
  return (transaction.allocations || []).some((allocation) => (
    allocation.type === "session"
    && allocation.sessionId === sessionId
    && (!playerId || allocation.playerId === playerId)
    && Number(allocation.amount || 0) > 0
  ));
}

function transactionHasActiveActivityAllocation(transaction, activityId, playerId = "") {
  if (!paymentTransactionIsActive(transaction)) return false;
  return (transaction.allocations || []).some((allocation) => (
    allocation.type === "activity"
    && allocation.activityId === activityId
    && (!playerId || allocation.playerId === playerId)
    && Number(allocation.amount || 0) > 0
  ));
}

function paymentHasActiveTransactionAllocation(sessionId, playerId = "") {
  return (state.paymentTransactions || []).some((transaction) => (
    transactionHasActiveSessionAllocation(transaction, sessionId, playerId)
  ));
}

function activityShareHasActiveTransactionAllocation(activityId, playerId = "") {
  return (state.paymentTransactions || []).some((transaction) => (
    transactionHasActiveActivityAllocation(transaction, activityId, playerId)
  ));
}

function activityPlayerHasActiveFinancialState(activity, playerId) {
  const share = activity?.shares?.[playerId];
  return Boolean(
    share
    && !share.paidBySelf
    && (
      Number(share.paidAmount || 0) > 0
      || shareCoverageApplied(activity, share) > 0
      || activityShareHasActiveTransactionAllocation(activity.id, playerId)
    )
  );
}

function sessionPlayerHasActiveFinancialState(session, playerId) {
  const payment = session?.payments?.[playerId];
  return Boolean(
    Number(payment?.paidAmount || 0) > 0
    || Number(payment?.advanceAmount || 0) > 0
    || (payment && paymentCoverageApplied(session, payment) > 0)
    || paymentHasActiveTransactionAllocation(session?.id, playerId)
  );
}

function sessionHasActiveFinancialState(session) {
  if (!session) return false;
  return Object.keys(session.payments || {}).some((playerId) => sessionPlayerHasActiveFinancialState(session, playerId))
    || paymentHasActiveTransactionAllocation(session.id);
}

function sessionPlayerHasFinancialHistory(session, playerId) {
  return Boolean(
    sessionPlayerHasActiveFinancialState(session, playerId)
    || (state.paymentTransactions || []).some((transaction) => transactionReferencesSession(transaction, session?.id, playerId))
  );
}

function sessionHasFinancialHistory(session) {
  if (!session) return false;
  return sessionHasActiveFinancialState(session)
    || Object.keys(session.payments || {}).some((playerId) => sessionPlayerHasFinancialHistory(session, playerId))
    || (state.paymentTransactions || []).some((transaction) => transactionReferencesSession(transaction, session.id));
}

function activityHasActiveFinancialState(activity) {
  if (!activity) return false;
  return Object.keys(activity.shares || {}).some((playerId) => activityPlayerHasActiveFinancialState(activity, playerId))
    || activityShareHasActiveTransactionAllocation(activity.id);
}

function activityHasFinancialHistory(activity) {
  if (!activity) return false;
  return activityHasActiveFinancialState(activity)
    || (state.paymentTransactions || []).some((transaction) => transactionReferencesActivity(transaction, activity.id));
}

function playerHasFinancialHistory(playerId) {
  if (!playerId) return false;
  if (Number(state.advances?.[playerId] || 0) > 0) return true;
  if ((state.sessions || []).some((session) => sessionPlayerHasFinancialHistory(session, playerId))) return true;
  if ((state.activities || []).some((activity) => (
    activity.paidById === playerId
    || activityPlayerHasActiveFinancialState(activity, playerId)
    || (state.paymentTransactions || []).some((transaction) => transactionReferencesActivity(transaction, activity.id, playerId))
  ))) return true;
  return (state.paymentTransactions || []).some((transaction) => (
    transaction.paidById === playerId
    || (transaction.playerIds || []).includes(playerId)
    || (transaction.allocations || []).some((allocation) => allocation.playerId === playerId)
  ));
}

function executeConfirmedDelete(target) {
  const deleteType = target.dataset.deleteType;
  const nextModal = modal?.previousModal || null;
  if (deleteType === "session") {
    const session = getSession(target.dataset.session);
    if (!session) return false;
    if (sessionHasFinancialHistory(session)) {
      modal = null;
      showToast("This session has retained financial history and cannot be deleted.");
      return false;
    }
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
    if (playerHasFinancialHistory(player.id)) {
      modal = null;
      showToast("This player has financial history and cannot be deleted.");
      return false;
    }
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
    if (removedResponse?.playerId && sessionPlayerHasActiveFinancialState(session, removedResponse.playerId)) {
      modal = nextModal;
      showToast("Clear this player's active cash, Advance, or Credit coverage before removing them.");
      return false;
    }
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
    const response = session?.responses?.find((item) => item.id === target.dataset.response);
    if (response?.playerId && sessionPlayerHasActiveFinancialState(session, response.playerId)) {
      modal = nextModal;
      showToast("Clear this player's active cash, Advance, or Credit coverage before changing guests.");
      return false;
    }
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
    if (sessionPlayerHasActiveFinancialState(session, playerId)) {
      modal = nextModal;
      showToast("Clear this player's active cash, Advance, or Credit coverage before removing attendance.");
      return false;
    }
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
    if (sessionPlayerHasActiveFinancialState(session, target.dataset.player)) {
      modal = nextModal;
      showToast("Clear this player's active cash, Advance, or Credit coverage before changing guests.");
      return false;
    }
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
    if (activityHasFinancialHistory(activity)) {
      modal = null;
      showToast("This activity has retained financial history and cannot be deleted.");
      return false;
    }
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
    syncSessionStages();
    modal = null;
    saveState();
    showToast("Payment group deleted.");
    return true;
  }
  if (deleteType === "payment-transaction") {
    if (!deletePaymentTransaction(target.dataset.transaction)) return false;
    modal = nextModal?.type === "groupPaymentHistory" ? nextModal : null;
    saveState();
    showToast("Payment reversed. Audit history retained.");
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
      if (paymentHasActiveTransactionAllocation(session.id, playerId)) {
        modal = { type: "paymentHistory", playerId };
        showToast("Reverse the receipt in Transactions instead.");
        return false;
      }
      const previous = {
        paidAmount: Number(payment.paidAmount || 0),
        advanceAmount: Number(payment.advanceAmount || 0),
        status: payment.status || "Pending"
      };
      adjustPaymentAdvance(payment, playerId, 0);
      payment.paidAmount = 0;
      payment.paidDate = "";
      payment.status = "Pending";
      recordSessionPaymentAdjustment(session, payment, previous, "history-reversal");
      syncSessionStages();
    } else if (historyType === "activity") {
      const activity = state.activities.find((item) => item.id === target.dataset.activity);
      const share = activity?.shares?.[playerId];
      if (!activity || !share) return false;
      if (activityShareHasActiveTransactionAllocation(activity.id, playerId)) {
        modal = { type: "paymentHistory", playerId };
        showToast("Reverse the receipt in Transactions instead.");
        return false;
      }
      const previous = { paidAmount: Number(share.paidAmount || 0), status: share.status || "Pending" };
      share.paidAmount = 0;
      share.status = "Pending";
      recordActivityPaymentAdjustment(activity, share, previous, "history-reversal");
    } else if (historyType === "credit") {
      showToast("Reverse the payment transaction that created this Credit.");
      return false;
    } else {
      return false;
    }
    modal = { type: "paymentHistory", playerId };
    saveState();
    showToast("Payment reversed. Audit history retained.");
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

function paymentLedgerKey(session, payment) {
  return `session:${session?.id || ""}:${payment?.playerId || ""}`;
}

function shareLedgerKey(activity, share) {
  return `activity:${activity?.id || ""}:${share?.playerId || ""}`;
}

function ledgerItemKey(item) {
  if (item?.type === "session") return paymentLedgerKey(item.session, item.payment);
  if (item?.type === "activity") return shareLedgerKey(item.activity, item.share);
  return String(item?.id || "");
}

function ledgerMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function ledgerCoverageApplied(details) {
  return ledgerMoney(
    Number(details?.advanceApplied || 0)
      + Number(details?.ownCreditApplied || 0)
      + Number(details?.groupCreditApplied || 0)
  );
}

function ledgerCoverageOutstanding(details) {
  return Math.max(0, ledgerMoney(Number(details?.rawOutstanding || 0) - ledgerCoverageApplied(details)));
}

function allocateLedgerCoverage(detailsList, amount, field, source = {}) {
  let remaining = Math.max(0, ledgerMoney(amount));
  let applied = 0;
  detailsList.forEach((details) => {
    if (remaining <= 0) return;
    const outstanding = ledgerCoverageOutstanding(details);
    const itemAmount = Math.min(remaining, outstanding);
    if (itemAmount <= 0) return;
    details[field] = ledgerMoney(Number(details[field] || 0) + itemAmount);
    if (field === "groupCreditApplied") {
      details.groupCreditSources.push({
        payerId: source.payerId || "",
        groupId: source.groupId || "",
        amount: ledgerMoney(itemAmount)
      });
    }
    applied = ledgerMoney(applied + itemAmount);
    remaining = ledgerMoney(remaining - itemAmount);
  });
  return { applied, remaining };
}

function ledgerCoverageSnapshot() {
  const itemDetails = new Map();
  const ledgersByPlayer = new Map();
  const playerSummaries = new Map();
  const groupSummaries = new Map();
  const playerIds = uniqueIds([
    ...(state.players || []).map((player) => player.id),
    ...Object.keys(state.advances || {})
  ]);

  playerIds.forEach((playerId) => {
    const detailsList = playerLedger(playerId).map((item) => {
      const details = {
        key: ledgerItemKey(item),
        playerId,
        item,
        rawOutstanding: ledgerMoney(item.outstanding),
        advanceApplied: 0,
        ownCreditApplied: 0,
        groupCreditApplied: 0,
        groupCreditSources: []
      };
      itemDetails.set(details.key, details);
      return details;
    });
    ledgersByPlayer.set(playerId, detailsList);
    playerSummaries.set(playerId, {
      playerId,
      rawOutstanding: ledgerMoney(detailsList.reduce((total, details) => total + details.rawOutstanding, 0)),
      advanceApplied: 0,
      ownCreditApplied: 0,
      groupCreditReceived: 0,
      groupCreditProvided: 0,
      remainingAdvance: ledgerMoney(playerIntentionalAdvancePaid(playerId)),
      remainingCredit: ledgerMoney(playerAvailableCredit(playerId)),
      balance: 0
    });
  });

  playerIds.forEach((playerId) => {
    const summary = playerSummaries.get(playerId);
    const detailsList = ledgersByPlayer.get(playerId) || [];
    const advanceResult = allocateLedgerCoverage(detailsList, summary.remainingAdvance, "advanceApplied");
    summary.advanceApplied = advanceResult.applied;
    summary.remainingAdvance = advanceResult.remaining;
    const creditResult = allocateLedgerCoverage(detailsList, summary.remainingCredit, "ownCreditApplied");
    summary.ownCreditApplied = creditResult.applied;
    summary.remainingCredit = creditResult.remaining;
  });

  (state.paymentGroups || [])
    .filter((group) => group.active !== false)
    .forEach((group) => {
      const memberIds = paymentGroupPlayerIds(group);
      const payerSummary = playerSummaries.get(group.payerId);
      const balanceByPlayer = new Map(
        memberIds.map((playerId) => [
          playerId,
          ledgerMoney((ledgersByPlayer.get(playerId) || []).reduce((total, details) => total + ledgerCoverageOutstanding(details), 0))
        ])
      );
      const grossBalance = ledgerMoney([...balanceByPlayer.values()].reduce((total, amount) => total + amount, 0));
      const payerCreditBefore = ledgerMoney(payerSummary?.remainingCredit || 0);
      const availableForGroup = Math.min(grossBalance, payerCreditBefore);
      const split = splitAmountAcrossPlayerBalances(memberIds, availableForGroup, balanceByPlayer);
      let creditApplied = 0;

      split.allocations.forEach(({ playerId, amount }) => {
        const result = allocateLedgerCoverage(
          ledgersByPlayer.get(playerId) || [],
          amount,
          "groupCreditApplied",
          { payerId: group.payerId, groupId: group.id }
        );
        creditApplied = ledgerMoney(creditApplied + result.applied);
      });

      if (payerSummary) {
        payerSummary.remainingCredit = Math.max(0, ledgerMoney(payerSummary.remainingCredit - creditApplied));
        payerSummary.groupCreditProvided = ledgerMoney(payerSummary.groupCreditProvided + creditApplied);
      }
      groupSummaries.set(group.id, {
        groupId: group.id,
        payerId: group.payerId || "",
        grossBalance,
        creditApplied,
        balance: Math.max(0, ledgerMoney(grossBalance - creditApplied)),
        payerCreditBefore,
        payerCreditAfter: Math.max(0, ledgerMoney(payerCreditBefore - creditApplied))
      });
    });

  playerIds.forEach((playerId) => {
    const summary = playerSummaries.get(playerId);
    const detailsList = ledgersByPlayer.get(playerId) || [];
    summary.groupCreditReceived = ledgerMoney(detailsList.reduce((total, details) => total + details.groupCreditApplied, 0));
    summary.balance = ledgerMoney(detailsList.reduce((total, details) => total + ledgerCoverageOutstanding(details), 0));
  });

  return {
    items: itemDetails,
    ledgersByPlayer,
    players: playerSummaries,
    groups: groupSummaries
  };
}

function emptyLedgerCoverageDetails(rawOutstanding = 0) {
  return {
    rawOutstanding: ledgerMoney(rawOutstanding),
    advanceApplied: 0,
    ownCreditApplied: 0,
    groupCreditApplied: 0,
    groupCreditSources: [],
    applied: 0,
    outstanding: ledgerMoney(rawOutstanding)
  };
}

function normalizedLedgerCoverageDetails(details, rawOutstanding = 0) {
  const normalized = details || emptyLedgerCoverageDetails(rawOutstanding);
  return {
    rawOutstanding: ledgerMoney(normalized.rawOutstanding),
    advanceApplied: ledgerMoney(normalized.advanceApplied),
    ownCreditApplied: ledgerMoney(normalized.ownCreditApplied),
    groupCreditApplied: ledgerMoney(normalized.groupCreditApplied),
    groupCreditSources: (normalized.groupCreditSources || []).map((source) => ({ ...source })),
    applied: ledgerCoverageApplied(normalized),
    outstanding: ledgerCoverageOutstanding(normalized)
  };
}

function paymentCoverageDetails(session, payment) {
  if (!session || !payment?.playerId) return emptyLedgerCoverageDetails();
  const rawOutstanding = paymentOutstanding(payment, session);
  return normalizedLedgerCoverageDetails(ledgerCoverageSnapshot().items.get(paymentLedgerKey(session, payment)), rawOutstanding);
}

function shareCoverageDetails(activity, share) {
  if (!activity || !share?.playerId) return emptyLedgerCoverageDetails();
  const rawOutstanding = shareOutstanding(share);
  return normalizedLedgerCoverageDetails(ledgerCoverageSnapshot().items.get(shareLedgerKey(activity, share)), rawOutstanding);
}

function paymentCoverageApplied(session, payment) {
  return paymentCoverageDetails(session, payment).applied;
}

function paymentOutstandingAfterCoverage(payment, session) {
  return paymentCoverageDetails(session, payment).outstanding;
}

function paymentCollectedAmount(session, payment) {
  return Math.min(paymentDueAmount(payment, session), Number(payment?.paidAmount || 0) + paymentCoverageApplied(session, payment));
}

function paymentEffectiveStatus(session, payment) {
  if (!payment) return "Pending";
  const due = paymentDueAmount(payment, session);
  const covered = paymentCollectedAmount(session, payment);
  if (due <= 0 || payment.status === "Paid" || covered >= due) return "Paid";
  return covered > 0 ? "Partial" : "Pending";
}

function shareCoverageApplied(activity, share) {
  return shareCoverageDetails(activity, share).applied;
}

function groupCreditAmountsByPayer(details) {
  const amounts = new Map();
  (details?.groupCreditSources || []).forEach((source) => {
    if (!source.payerId) return;
    amounts.set(source.payerId, ledgerMoney(Number(amounts.get(source.payerId) || 0) + Number(source.amount || 0)));
  });
  return amounts;
}

function ledgerCoverageDescription(details) {
  const parts = [];
  if (Number(details?.advanceApplied || 0) > 0) {
    parts.push(`${currency(details.advanceApplied)} Advance`);
  }
  if (Number(details?.ownCreditApplied || 0) > 0) {
    parts.push(`${currency(details.ownCreditApplied)} Credit`);
  }
  groupCreditAmountsByPayer(details).forEach((amount, payerId) => {
    parts.push(`${currency(amount)} Credit from ${getPlayerName(payerId)}`);
  });
  return parts.join(" + ");
}

function shareOutstandingAfterCoverage(activity, share) {
  return shareCoverageDetails(activity, share).outstanding;
}

function shareCollectedAmount(activity, share) {
  return Math.min(Number(share?.amount || 0), Number(share?.paidAmount || 0) + shareCoverageApplied(activity, share));
}

function playerLedgerOutstanding(playerId) {
  return playerLedger(playerId).reduce((total, item) => total + item.outstanding, 0);
}

function playerBalance(playerId) {
  return Number(ledgerCoverageSnapshot().players.get(playerId)?.balance || 0);
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
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  if (!summary) return 0;
  if (summary.balance > 0) return summary.balance;
  return ledgerMoney(-(summary.remainingAdvance + summary.remainingCredit));
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
  return playerIntentionalAdvancePaid(playerId);
}

function playerAdvanceAppliedToLedger(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  return ledgerMoney(summary?.advanceApplied);
}

function playerRemainingAdvance(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  return ledgerMoney(summary?.remainingAdvance);
}

function playerRemainingCredit(playerId) {
  return Number(ledgerCoverageSnapshot().players.get(playerId)?.remainingCredit || 0);
}

function playerStoredCredit(playerId) {
  return Math.max(0, Number((playerCreditAdvance(playerId) - playerLinkedAdvance(playerId)).toFixed(2)));
}

function coverageItemOutstanding(coverage, item) {
  const details = coverage?.items?.get(ledgerItemKey(item));
  return details ? ledgerCoverageOutstanding(details) : ledgerMoney(item?.outstanding);
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
  const storedCredit = playerStoredCredit(playerId);
  const creditItem = storedCredit > 0
    ? [{ type: "credit", id: "credit", date: "", label: "Credit balance", paidAmount: 0, creditAmount: storedCredit }]
    : [];
  return [...sessionItems, ...activityItems, ...creditItem].sort((a, b) => {
    if (a.type === "credit" || b.type === "credit") return a.type === "credit" ? 1 : -1;
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare) return dateCompare;
    return String(a.label || "").localeCompare(String(b.label || ""), undefined, { sensitivity: "base" });
  });
}

function paymentHistoryAmount(item) {
  return Number(item.paidAmount || 0) + Number(item.advanceAmount || 0) + Number(item.creditAmount || 0);
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

function playerAdvanceHistorySummaries(playerId) {
  const activeSummaries = new Map(playerAdvanceCycleSummaries(playerId).map((summary) => [summary.id, summary]));
  return [...(state.paymentTransactions || [])]
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.type === "advance-payment" && transaction.paidById === playerId)
    .map(({ transaction, index }) => {
      const activeSummary = activeSummaries.get(transaction.id);
      if (activeSummary) return { ...activeSummary, reversed: false };
      const received = ledgerMoney(
        (transaction.allocations || [])
          .filter((allocation) => allocation.type === "advance" && allocation.playerId === playerId)
          .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
        || transaction.advanceAmount
        || transaction.amountPaid
      );
      return {
        id: transaction.id,
        transaction,
        index,
        date: transaction.date || "",
        received,
        deducted: 0,
        balance: 0,
        deductions: [],
        reversed: true
      };
    })
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.index - b.index);
}

function emptyAdvanceSummary() {
  return { received: 0, deducted: 0, balance: 0, deductions: [], transaction: null, date: "" };
}

function playerAdvanceAggregateSummary(playerId) {
  const summaries = playerAdvanceCycleSummaries(playerId);
  if (!summaries.length) return emptyAdvanceSummary();
  return {
    received: ledgerMoney(summaries.reduce((total, summary) => total + summary.received, 0)),
    deducted: ledgerMoney(summaries.reduce((total, summary) => total + summary.deducted, 0)),
    balance: ledgerMoney(summaries.reduce((total, summary) => total + summary.balance, 0)),
    deductions: summaries.flatMap((summary) => summary.deductions),
    transaction: null,
    date: summaries[summaries.length - 1]?.date || ""
  };
}

function playerAdvanceSummary(playerId) {
  const summary = playerAdvanceAggregateSummary(playerId);
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
  return playerAdvanceAggregateSummary(playerId).deductions.map(advanceDeductionCopyLine);
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
  const coverage = ledgerCoverageSnapshot().players.get(playerId);
  const revisedDue = Number(coverage?.balance || 0);
  const currentStatus = revisedDue > 0
    ? `${currency(revisedDue)} owed`
    : Number(coverage?.remainingCredit || 0) > 0
      ? `${currency(coverage.remainingCredit)} Credit available`
      : Number(coverage?.remainingAdvance || 0) > 0
        ? `${currency(coverage.remainingAdvance)} Advance available`
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
  appendCoverageCopySection(lines, [playerId]);

  return lines.join("\n");
}

function buildPaymentGroupPaymentHistoryCopy(groupId = "") {
  const group = getPaymentGroup(groupId);
  if (!group) return "Payment group not found.";
  const playerIds = paymentGroupPlayerIds(group);
  const groupSummary = paymentGroupCoverageSummary(group);
  const revisedDue = groupSummary.balance;
  const lines = [
    `${group.name || "Payment Group"} - Payment History`,
    `Paid by: ${group.payerId ? getPlayerName(group.payerId) : "Not set"}`,
    `Members: ${paymentGroupMemberNames(group)}`,
    `Current Status: ${revisedDue > 0 ? `${currency(revisedDue)} owed` : "Clear"}`
  ];

  appendCopySection(lines, "Sessions", sessionPaymentCopyLinesForPlayers(playerIds, { dueOnly: false }));
  appendCopySection(lines, "Activities", activityPaymentCopyLinesForPlayers(playerIds, { dueOnly: false }));
  appendCopySection(lines, "Payment Transactions", paymentGroupTransactionCopyLines(group.id));
  appendCoverageCopySection(lines, playerIds);
  if (groupSummary.creditApplied > 0) {
    lines.push("", "Payment Group Credit", `- ${currency(groupSummary.creditApplied)} Credit applied from ${getPlayerName(group.payerId)}`);
  }

  return lines.join("\n");
}

function coverageTotalsForPlayers(playerIds) {
  const snapshot = ledgerCoverageSnapshot();
  return uniqueIds(playerIds || []).reduce(
    (totals, playerId) => {
      const summary = snapshot.players.get(playerId);
      if (!summary) return totals;
      totals.rawOutstanding += Number(summary.rawOutstanding || 0);
      totals.advanceApplied += Number(summary.advanceApplied || 0);
      totals.ownCreditApplied += Number(summary.ownCreditApplied || 0);
      totals.groupCreditReceived += Number(summary.groupCreditReceived || 0);
      totals.remainingAdvance += Number(summary.remainingAdvance || 0);
      totals.remainingCredit += Number(summary.remainingCredit || 0);
      totals.balance += Number(summary.balance || 0);
      return totals;
    },
    { rawOutstanding: 0, advanceApplied: 0, ownCreditApplied: 0, groupCreditReceived: 0, remainingAdvance: 0, remainingCredit: 0, balance: 0 }
  );
}

function appendCoverageCopySection(lines, playerIds) {
  const totals = coverageTotalsForPlayers(playerIds);
  const hasCoverage = totals.advanceApplied > 0 || totals.ownCreditApplied > 0 || totals.groupCreditReceived > 0;
  const hasBalance = totals.remainingAdvance > 0 || totals.remainingCredit > 0;
  if (!hasCoverage && !hasBalance) return;
  lines.push("", "Coverage");
  if (totals.advanceApplied > 0) lines.push(`- Advance applied: ${currency(totals.advanceApplied)}`);
  if (totals.ownCreditApplied > 0) lines.push(`- Own Credit applied: ${currency(totals.ownCreditApplied)}`);
  if (totals.groupCreditReceived > 0) lines.push(`- Payment-group Credit applied: ${currency(totals.groupCreditReceived)}`);
  if (totals.balance > 0) lines.push(`- Remaining due: ${currency(totals.balance)}`);
  if (totals.remainingAdvance > 0) lines.push(`- Advance remaining: ${currency(totals.remainingAdvance)}`);
  if (totals.remainingCredit > 0) lines.push(`- Credit remaining: ${currency(totals.remainingCredit)}`);
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
  const coverage = coverageTotalsForPlayers(playerIds);
  const revisedDue = coverage.balance;
  const lines = [title, ...introLines];

  if (coverage.rawOutstanding > revisedDue) {
    lines.push(`Total Due Before Coverage: ${currency(coverage.rawOutstanding)}`);
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
  appendCoverageCopySection(lines, playerIds);

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
  const coverageSnapshot = ledgerCoverageSnapshot();
  sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .forEach((session) => {
      ids.forEach((playerId) => {
        const payment = session.payments?.[playerId];
        if (!payment) return;
        const coverage = normalizedLedgerCoverageDetails(
          coverageSnapshot.items.get(paymentLedgerKey(session, payment)),
          paymentOutstanding(payment, session)
        );
        const pending = coverage.outstanding;
        if (dueOnly && pending <= 0) return;
        const due = paymentDueAmount(payment, session);
        const paid = Number(payment.paidAmount || 0);
        const creditCreated = Number(payment.advanceAmount || 0);
        if (!dueOnly && due <= 0 && paid <= 0 && coverage.applied <= 0 && creditCreated <= 0) return;
        const dateKey = session.date || "";
        const summary = byDate.get(dateKey) || {
          date: dateKey,
          due: 0,
          paid: 0,
          advanceApplied: 0,
          ownCreditApplied: 0,
          groupCreditApplied: 0,
          creditCreated: 0,
          pending: 0
        };
        summary.due += due;
        summary.paid += paid;
        summary.advanceApplied += coverage.advanceApplied;
        summary.ownCreditApplied += coverage.ownCreditApplied;
        summary.groupCreditApplied += coverage.groupCreditApplied;
        summary.creditCreated += creditCreated;
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
      if (summary.paid > 0) details.push(`Cash recorded ${currency(summary.paid)}`);
      if (summary.advanceApplied > 0) details.push(`Advance applied ${currency(summary.advanceApplied)}`);
      if (summary.ownCreditApplied > 0) details.push(`Own Credit applied ${currency(summary.ownCreditApplied)}`);
      if (summary.groupCreditApplied > 0) details.push(`Group Credit applied ${currency(summary.groupCreditApplied)}`);
      if (!dueOnly && summary.creditCreated > 0) details.push(`Credit created ${currency(summary.creditCreated)}`);
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
  const coverageSnapshot = ledgerCoverageSnapshot();
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
          const coverage = normalizedLedgerCoverageDetails(
            coverageSnapshot.items.get(shareLedgerKey(activity, share)),
            shareOutstanding(share)
          );
          total.advanceApplied += coverage.advanceApplied;
          total.ownCreditApplied += coverage.ownCreditApplied;
          total.groupCreditApplied += coverage.groupCreditApplied;
          total.pending += coverage.outstanding;
          total.hasShare = true;
          return total;
        },
        { share: 0, paid: 0, advanceApplied: 0, ownCreditApplied: 0, groupCreditApplied: 0, pending: 0, hasShare: false }
      );
      if (!summary.hasShare) return null;
      if (dueOnly && summary.pending <= 0) return null;
      const coverageApplied = summary.advanceApplied + summary.ownCreditApplied + summary.groupCreditApplied;
      if (!dueOnly && summary.share <= 0 && summary.paid <= 0 && coverageApplied <= 0 && summary.pending <= 0) return null;
      const details = [
        `Share ${currency(summary.share)}`
      ];
      if (summary.paid > 0) details.push(`Cash recorded ${currency(summary.paid)}`);
      if (summary.advanceApplied > 0) details.push(`Advance applied ${currency(summary.advanceApplied)}`);
      if (summary.ownCreditApplied > 0) details.push(`Own Credit applied ${currency(summary.ownCreditApplied)}`);
      if (summary.groupCreditApplied > 0) details.push(`Group Credit applied ${currency(summary.groupCreditApplied)}`);
      if (summary.pending) details.push(`Pending ${currency(summary.pending)}`);
      return `- ${formatDate(activity.date)} ${activity.name || "Activity"}: ${details.join(", ")}`;
    })
    .filter(Boolean);
}

function playerPaymentTransactionCopyLines(playerId) {
  return playerPaymentTransactions(playerId)
    .map((transaction) => {
      const group = getPaymentGroup(transaction.groupId);
      const historyStatus = !paymentTransactionIsActive(transaction)
        ? " [REVERSED]"
        : transaction.status === "migrated" ? " [MIGRATED]" : "";
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
        return `- ${formatDate(transaction.date)} Advance payment${historyStatus}: Received ${currency(transaction.amountPaid)}, Added to Advance ${currency(advance || transaction.advanceAmount || transaction.amountPaid)}`;
      }
      if (transaction.type === "session-payment-adjustment") {
        const session = getSession(transaction.sessionId);
        const previousTotal = Number(transaction.previousPayment?.paidAmount || 0) + Number(transaction.previousPayment?.advanceAmount || 0);
        const nextTotal = Number(transaction.nextPayment?.paidAmount || 0) + Number(transaction.nextPayment?.advanceAmount || 0);
        return `- ${formatDate(transaction.date)} ${session ? formatDate(session.date) : "Session"} adjustment${historyStatus}: ${currency(previousTotal)} to ${currency(nextTotal)}`;
      }
      if (transaction.type === "activity-payment-adjustment") {
        const activity = (state.activities || []).find((item) => item.id === transaction.activityId);
        const previousTotal = Number(transaction.previousPayment?.paidAmount || 0);
        const nextTotal = Number(transaction.nextPayment?.paidAmount || 0);
        return `- ${formatDate(transaction.date)} ${activity?.name || "Activity"} adjustment${historyStatus}: ${currency(previousTotal)} to ${currency(nextTotal)}`;
      }
      const details = [`Paid by ${getPlayerName(transaction.paidById)}`];
      if (applied) details.push(`Applied ${currency(applied)}`);
      if (creditUsed) details.push(`Credit used ${currency(creditUsed)}`);
      if (advance) details.push(`Credit added ${currency(advance)}`);
      const title = transaction.type === "player-payment" ? "Player payment" : group?.name || "Group payment";
      return `- ${formatDate(transaction.date)} ${title}${historyStatus}: ${details.join(", ")}`;
    });
}

function playerPaymentTransactions(playerId) {
  return [...(state.paymentTransactions || [])]
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => (
      transaction.paidById === playerId
      || (transaction.playerIds || []).includes(playerId)
      || (transaction.allocations || []).some((allocation) => allocation.playerId === playerId)
    ))
    .sort((a, b) => (
      String(b.transaction.createdAt || b.transaction.date || "").localeCompare(String(a.transaction.createdAt || a.transaction.date || ""))
      || b.index - a.index
    ))
    .map(({ transaction }) => transaction);
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
    const historyStatus = !paymentTransactionIsActive(transaction)
      ? " [REVERSED]"
      : transaction.status === "migrated" ? " [MIGRATED]" : "";
    return `- ${formatDate(transaction.date)}${historyStatus}: Paid by ${payerName}${coveredLabel}, ${details.join(", ")}`;
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
    const aCredit = playerRemainingCredit(a.id);
    const bCredit = playerRemainingCredit(b.id);
    const aHasCredit = aCredit > 0;
    const bHasCredit = bCredit > 0;
    if (!aDue && aHasCredit !== bHasCredit) return aHasCredit ? -1 : 1;
    if (!aDue && aCredit !== bCredit) return bCredit - aCredit;
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
  return paymentGroupCoverageSummary(group).grossBalance;
}

function paymentGroupCreditApplied(group) {
  return paymentGroupCoverageSummary(group).creditApplied;
}

function paymentGroupBalance(group) {
  return paymentGroupCoverageSummary(group).balance;
}

function paymentGroupCoverageSummary(group) {
  const summary = group?.id ? ledgerCoverageSnapshot().groups.get(group.id) : null;
  if (summary) return { ...summary };
  const balance = ledgerMoney(paymentGroupPlayerIds(group).reduce((total, playerId) => total + playerBalance(playerId), 0));
  return {
    groupId: group?.id || "",
    payerId: group?.payerId || "",
    grossBalance: balance,
    creditApplied: 0,
    balance,
    payerCreditBefore: Number(group?.payerId ? playerRemainingCredit(group.payerId) : 0),
    payerCreditAfter: Number(group?.payerId ? playerRemainingCredit(group.payerId) : 0)
  };
}

function paymentGroupPlayerIds(group) {
  return uniqueIds(group?.playerIds || []).filter((playerId) => getPlayer(playerId)?.active !== false);
}

function paymentGroupMembers(group) {
  return paymentGroupPlayerIds(group)
    .map((playerId) => getPlayer(playerId))
    .filter(Boolean);
}

function paymentGroupMembershipConflicts(playerIds, excludedGroupId = "", payerId = "") {
  const selectedIds = new Set(uniqueIds(playerIds || []));
  return (state.paymentGroups || [])
    .filter((group) => group.active !== false && group.id !== excludedGroupId)
    .map((group) => ({
      group,
      playerIds: paymentGroupPlayerIds(group).filter((playerId) => (
        selectedIds.has(playerId)
        && !(playerId === payerId && group.payerId === payerId)
      ))
    }))
    .filter((conflict) => conflict.playerIds.length > 0);
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
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.groupId === groupId)
    .sort((a, b) => (
      String(b.transaction.createdAt || b.transaction.date || "").localeCompare(String(a.transaction.createdAt || a.transaction.date || ""))
      || b.index - a.index
    ))
    .map(({ transaction }) => transaction);
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
    if (transaction.type !== "group-payment" || !paymentTransactionIsActive(transaction)) return;
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

function migrateLegacyCreditUseTransactions(targetState = state) {
  (targetState.paymentTransactions || []).forEach((transaction) => {
    const creditUsed = ledgerMoney(
      (transaction.allocations || [])
        .filter((allocation) => allocation.type === "credit-use")
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
    );
    if (creditUsed <= 0 || transaction.legacyCreditUseMigrated === true) return;

    let remaining = creditUsed;
    const allocations = (transaction.allocations || []).map((allocation) => ({ ...allocation }));
    for (let index = allocations.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const allocation = allocations[index];
      if (allocation.type !== "session" && allocation.type !== "activity") continue;
      const reduction = Math.min(remaining, Number(allocation.amount || 0));
      if (reduction <= 0) continue;
      allocation.amount = ledgerMoney(Number(allocation.amount || 0) - reduction);
      remaining = ledgerMoney(remaining - reduction);

      if (allocation.type === "session") {
        const session = (targetState.sessions || []).find((item) => item.id === allocation.sessionId);
        const payment = session?.payments?.[allocation.playerId];
        if (payment) {
          payment.paidAmount = Math.max(0, ledgerMoney(Number(payment.paidAmount || 0) - reduction));
          payment.status = payment.paidAmount <= 0
            ? "Pending"
            : payment.paidAmount >= paymentDueAmount(payment, session) ? "Paid" : "Partial";
          if (payment.paidAmount <= 0) payment.paidDate = "";
        }
      } else {
        const activity = (targetState.activities || []).find((item) => item.id === allocation.activityId);
        const share = activity?.shares?.[allocation.playerId];
        if (share) {
          share.paidAmount = Math.max(0, ledgerMoney(Number(share.paidAmount || 0) - reduction));
          share.status = share.paidAmount <= 0
            ? "Pending"
            : share.paidAmount >= Number(share.amount || 0) ? "Paid" : "Partial";
        }
      }
    }

    transaction.allocations = allocations.filter((allocation) => allocation.type !== "credit-use" && Number(allocation.amount || 0) > 0);
    transaction.appliedAmount = ledgerMoney(
      transaction.allocations
        .filter((allocation) => allocation.type === "session" || allocation.type === "activity")
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
    );
    transaction.legacyCreditUseMigrated = true;
    transaction.migratedCreditAmount = creditUsed;
    if (Number(transaction.amountPaid || 0) <= 0 && transaction.appliedAmount <= 0) transaction.status = "migrated";
    adjustStateAdvanceBalance(targetState, transaction.paidById, creditUsed);
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

function applyGroupPaymentForPlayer(playerId, amount, coverage = ledgerCoverageSnapshot()) {
  let remaining = Number(amount || 0);
  let playerRemaining = Number(coverage.players.get(playerId)?.balance || 0);
  let applied = 0;
  const allocations = [];
  playerLedger(playerId).forEach((item) => {
    if (remaining <= 0 || playerRemaining <= 0) return;
    const itemBalance = coverageItemOutstanding(coverage, item);
    const paymentAmount = Math.min(remaining, itemBalance, playerRemaining);
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
  if (!paidById || !selectedIds.length || !Number.isFinite(paidAmount) || paidAmount <= 0) {
    return { applied: 0, creditUsed: 0, remaining: Math.max(0, paidAmount || 0), allocations: [] };
  }
  let applied = 0;
  const allocations = [];
  const coverage = ledgerCoverageSnapshot();
  const balanceByPlayer = new Map(selectedIds.map((playerId) => [playerId, Number(coverage.players.get(playerId)?.balance || 0)]));
  const dueSplit = splitAmountAcrossPlayerBalances(selectedIds, paidAmount, balanceByPlayer);

  dueSplit.allocations.forEach((share) => {
    const result = applyGroupPaymentForPlayer(share.playerId, share.amount, coverage);
    applied += result.applied;
    allocations.push(...result.allocations);
  });

  const creditTotal = Math.max(0, Number((paidAmount - applied).toFixed(2)));
  if (creditTotal > 0) {
    addPlayerAdvance(paidById, creditTotal);
    allocations.push({ type: "advance", playerId: paidById, amount: creditTotal });
  }
  const transaction = {
    id: createId("payment-transaction"),
    createdAt: new Date().toISOString(),
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
  syncSessionStages();
  return {
    applied: Number(applied.toFixed(2)),
    creditUsed: 0,
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
  if (!paymentTransactionIsActive(transaction)) return false;
  if (!(transaction.type === "advance-payment" && transaction.separateAdvance === true)) {
    [...(transaction.allocations || [])].reverse().forEach((allocation) => reversePaymentAllocation(allocation));
  }
  transaction.status = "reversed";
  transaction.reversedAt = new Date().toISOString();
  syncSessionStages();
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
  if (!playerId || !Number.isFinite(remaining) || remaining <= 0) {
    return { applied: 0, remaining: Math.max(0, remaining || 0), allocations: [], transaction: null };
  }
  const amountPaid = ledgerMoney(remaining);
  let applied = 0;
  const allocations = [];
  const coverage = ledgerCoverageSnapshot();
  playerLedger(playerId).forEach((item) => {
    if (remaining <= 0) return;
    const itemBalance = coverageItemOutstanding(coverage, item);
    const paymentAmount = Math.min(remaining, itemBalance);
    if (paymentAmount <= 0) return;
    if (item.type === "session") {
      applySessionPayment(item.payment, item.session, paymentAmount);
      allocations.push({ type: "session", playerId, sessionId: item.session.id, amount: ledgerMoney(paymentAmount) });
    } else {
      applyActivityPayment(item.share, paymentAmount);
      allocations.push({ type: "activity", playerId, activityId: item.activity.id, amount: ledgerMoney(paymentAmount) });
    }
    applied = Number((applied + paymentAmount).toFixed(2));
    remaining = Number((remaining - paymentAmount).toFixed(2));
  });
  if (remaining > 0) {
    addPlayerAdvance(playerId, remaining);
    allocations.push({ type: "advance", playerId, amount: ledgerMoney(remaining) });
  }
  const transaction = {
    id: createId("payment-transaction"),
    createdAt: new Date().toISOString(),
    type: "player-payment",
    date: new Date().toISOString().slice(0, 10),
    paidById: playerId,
    groupId: "",
    playerIds: [playerId],
    amountPaid,
    appliedAmount: ledgerMoney(applied),
    advanceAmount: ledgerMoney(remaining),
    allocations
  };
  state.paymentTransactions = state.paymentTransactions || [];
  state.paymentTransactions.push(transaction);
  syncSessionStages();
  return {
    applied: ledgerMoney(applied),
    remaining: ledgerMoney(remaining),
    allocations,
    transaction
  };
}

function recordSessionPaymentAdjustment(session, payment, previous, source = "manual") {
  if (!session || !payment?.playerId) return null;
  const next = {
    paidAmount: ledgerMoney(payment.paidAmount),
    advanceAmount: ledgerMoney(payment.advanceAmount),
    status: payment.status || "Pending"
  };
  if (
    ledgerMoney(previous?.paidAmount) === next.paidAmount
    && ledgerMoney(previous?.advanceAmount) === next.advanceAmount
    && String(previous?.status || "Pending") === next.status
  ) {
    return null;
  }
  const transaction = {
    id: createId("payment-transaction"),
    createdAt: new Date().toISOString(),
    type: "session-payment-adjustment",
    date: new Date().toISOString().slice(0, 10),
    paidById: payment.playerId,
    groupId: "",
    playerIds: [payment.playerId],
    amountPaid: next.paidAmount + next.advanceAmount,
    appliedAmount: next.paidAmount,
    advanceAmount: next.advanceAmount,
    allocations: [],
    sessionId: session.id,
    source,
    previousPayment: {
      paidAmount: ledgerMoney(previous?.paidAmount),
      advanceAmount: ledgerMoney(previous?.advanceAmount),
      status: String(previous?.status || "Pending")
    },
    nextPayment: next
  };
  state.paymentTransactions = state.paymentTransactions || [];
  state.paymentTransactions.push(transaction);
  return transaction;
}

function recordActivityPaymentAdjustment(activity, share, previous, source = "manual") {
  if (!activity || !share?.playerId) return null;
  const next = { paidAmount: ledgerMoney(share.paidAmount), status: share.status || "Pending" };
  if (ledgerMoney(previous?.paidAmount) === next.paidAmount && String(previous?.status || "Pending") === next.status) {
    return null;
  }
  const transaction = {
    id: createId("payment-transaction"),
    createdAt: new Date().toISOString(),
    type: "activity-payment-adjustment",
    date: new Date().toISOString().slice(0, 10),
    paidById: share.playerId,
    groupId: "",
    playerIds: [share.playerId],
    amountPaid: next.paidAmount,
    appliedAmount: next.paidAmount,
    advanceAmount: 0,
    allocations: [],
    activityId: activity.id,
    source,
    previousPayment: {
      paidAmount: ledgerMoney(previous?.paidAmount),
      status: String(previous?.status || "Pending")
    },
    nextPayment: next
  };
  state.paymentTransactions = state.paymentTransactions || [];
  state.paymentTransactions.push(transaction);
  return transaction;
}

function savePaymentAmount(session, playerId, paidAmount) {
  const payment = session?.payments?.[playerId];
  if (!payment) return false;
  if (paymentHasActiveTransactionAllocation(session.id, playerId)) {
    showToast("Reverse the receipt in Payment History before editing this amount.");
    return false;
  }
  const amountDue = paymentDueAmount(payment, session);
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    showToast("Enter a valid amount.");
    return false;
  }
  const previous = {
    paidAmount: Number(payment.paidAmount || 0),
    advanceAmount: Number(payment.advanceAmount || 0),
    status: payment.status || "Pending"
  };
  const advanceAmount = Math.max(0, paidAmount - amountDue);
  payment.paidAmount = Math.min(paidAmount, amountDue);
  payment.paidDate = paidAmount > 0 ? new Date().toISOString().slice(0, 10) : "";
  payment.status = paidAmount <= 0 ? "Pending" : paidAmount >= amountDue ? "Paid" : "Partial";
  adjustPaymentAdvance(payment, playerId, advanceAmount);
  recordSessionPaymentAdjustment(session, payment, previous, "amount-edit");
  syncSessionStages();
  if (advanceAmount > 0) {
    showToast(`Marked paid. ${currency(advanceAmount)} added as Credit.`);
  } else {
    showToast(payment.status === "Partial" ? "Partial payment saved." : `Marked ${payment.status.toLowerCase()}.`);
  }
  return true;
}

function updatePaymentStatus(session, playerId, status) {
  const payment = session?.payments?.[playerId];
  if (!payment) return false;
  if (paymentHasActiveTransactionAllocation(session.id, playerId)) {
    showToast("Reverse the receipt in Payment History before changing this status.");
    return false;
  }
  const amountDue = paymentDueAmount(payment, session);
  const previous = {
    paidAmount: Number(payment.paidAmount || 0),
    advanceAmount: Number(payment.advanceAmount || 0),
    status: payment.status || "Pending"
  };
  if (status === "Paid") {
    adjustPaymentAdvance(payment, playerId, 0);
    payment.status = "Paid";
    payment.paidAmount = amountDue;
    payment.paidDate = new Date().toISOString().slice(0, 10);
    recordSessionPaymentAdjustment(session, payment, previous, "status-paid");
    syncSessionStages();
    showToast("Marked paid.");
    return true;
  }
  if (status === "Pending") {
    adjustPaymentAdvance(payment, playerId, 0);
    payment.status = "Pending";
    payment.paidAmount = 0;
    payment.paidDate = "";
    recordSessionPaymentAdjustment(session, payment, previous, "status-pending");
    syncSessionStages();
    showToast("Marked pending.");
    return true;
  }
  return false;
}
