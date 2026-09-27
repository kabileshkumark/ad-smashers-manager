function normalizeActivitySplitMode(value) {
  return ["equal", "manual", "percentage", "shares"].includes(value) ? value : "equal";
}

function activitySettlementOwnerId(activity) {
  return String(activity?.settlementOwnerId || state?.settings?.organizerPlayerId || activity?.paidById || "");
}

function activityContributions(activity) {
  const contributions = Array.isArray(activity?.contributions) ? activity.contributions : [];
  if (contributions.length) {
    return contributions
      .map((contribution) => ({
        playerId: String(contribution?.playerId || ""),
        amount: ledgerMoney(contribution?.amount)
      }))
      .filter((contribution) => contribution.playerId && contribution.amount > 0);
  }
  return activity?.paidById
    ? [{ playerId: activity.paidById, amount: ledgerMoney(activity.totalPaid) }]
    : [];
}

function activityPayerIds(activity) {
  return uniqueIds(activityContributions(activity).map((contribution) => contribution.playerId));
}

function activityContributionAmount(activity, playerId) {
  return ledgerMoney(
    activityContributions(activity)
      .filter((contribution) => contribution.playerId === playerId)
      .reduce((total, contribution) => total + contribution.amount, 0)
  );
}

function activityAllocationPriority(activity) {
  const ownerId = activitySettlementOwnerId(activity);
  return [...(activity.playerIds || [])].sort((a, b) => {
    if (a === ownerId || b === ownerId) return a === ownerId ? -1 : 1;
    const aPaid = Number(activity.shares?.[a]?.paidAmount || 0) > 0;
    const bPaid = Number(activity.shares?.[b]?.paidAmount || 0) > 0;
    if (aPaid !== bPaid) return aPaid ? 1 : -1;
    return (activity.playerIds || []).indexOf(a) - (activity.playerIds || []).indexOf(b);
  });
}

function allocateWeightedActivityAmounts(activity, weights) {
  const playerIds = uniqueIds(activity.playerIds || []);
  const totalCents = Math.max(0, Math.round(Number(activity.totalPaid || 0) * 100));
  const weightTotal = playerIds.reduce((total, playerId) => total + Math.max(0, Number(weights[playerId] || 0)), 0);
  if (!playerIds.length || totalCents <= 0 || weightTotal <= 0) {
    return Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  }
  const priority = new Map(activityAllocationPriority(activity).map((playerId, index) => [playerId, index]));
  const allocations = playerIds.map((playerId, index) => {
    const exact = totalCents * Math.max(0, Number(weights[playerId] || 0)) / weightTotal;
    const cents = Math.floor(exact);
    return { playerId, index, cents, remainder: exact - cents };
  });
  let remaining = totalCents - allocations.reduce((total, allocation) => total + allocation.cents, 0);
  const remainderOrder = [...allocations].sort((a, b) => (
    b.remainder - a.remainder
    || (priority.get(a.playerId) ?? a.index) - (priority.get(b.playerId) ?? b.index)
  ));
  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    remainderOrder[index % remainderOrder.length].cents += 1;
  }
  return Object.fromEntries(allocations.map((allocation) => [allocation.playerId, allocation.cents / 100]));
}

function activitySplitValidation(activity) {
  const playerIds = uniqueIds(activity?.playerIds || []);
  const totalCents = Math.max(0, Math.round(Number(activity?.totalPaid || 0) * 100));
  const mode = normalizeActivitySplitMode(activity?.splitMode);
  const values = activity?.splitValues && typeof activity.splitValues === "object" ? activity.splitValues : {};
  if (!playerIds.length) return { valid: false, message: "Select at least one player.", amounts: {} };
  if (mode === "equal") {
    return {
      valid: true,
      message: "",
      amounts: allocateWeightedActivityAmounts(activity, Object.fromEntries(playerIds.map((playerId) => [playerId, 1])))
    };
  }
  if (mode === "manual") {
    const cents = Object.fromEntries(playerIds.map((playerId) => [playerId, Math.round(Number(values[playerId] || 0) * 100)]));
    if (playerIds.some((playerId) => !Number.isFinite(Number(values[playerId])) || cents[playerId] < 0)) {
      return { valid: false, message: "Enter a valid manual amount for every player.", amounts: {} };
    }
    const allocatedCents = Object.values(cents).reduce((total, amount) => total + amount, 0);
    if (allocatedCents !== totalCents) {
      return { valid: false, message: `Manual split must total ${currency(totalCents / 100)}.`, amounts: {} };
    }
    return { valid: true, message: "", amounts: Object.fromEntries(playerIds.map((playerId) => [playerId, cents[playerId] / 100])) };
  }
  if (mode === "percentage") {
    const percentages = Object.fromEntries(playerIds.map((playerId) => [playerId, Number(values[playerId])]));
    if (playerIds.some((playerId) => !Number.isFinite(percentages[playerId]) || percentages[playerId] < 0)) {
      return { valid: false, message: "Enter a valid percentage for every player.", amounts: {} };
    }
    const percentageTotal = ledgerMoney(Object.values(percentages).reduce((total, amount) => total + amount, 0));
    if (percentageTotal !== 100) {
      return { valid: false, message: "Percentage split must total 100%.", amounts: {} };
    }
    return { valid: true, message: "", amounts: allocateWeightedActivityAmounts(activity, percentages) };
  }
  const shares = Object.fromEntries(playerIds.map((playerId) => [playerId, Number(values[playerId])]));
  if (playerIds.some((playerId) => !Number.isInteger(shares[playerId]) || shares[playerId] <= 0)) {
    return { valid: false, message: "Number of shares must be a whole number greater than zero for every player.", amounts: {} };
  }
  return { valid: true, message: "", amounts: allocateWeightedActivityAmounts(activity, shares) };
}

function activitySplitAmounts(activity) {
  const validation = activitySplitValidation(activity);
  if (validation.valid) return validation.amounts;
  return allocateWeightedActivityAmounts(
    { ...activity, splitMode: "equal" },
    Object.fromEntries(uniqueIds(activity?.playerIds || []).map((playerId) => [playerId, 1]))
  );
}

function activityDraftSplitDefaults(draft, mode = draft?.splitMode) {
  const playerIds = uniqueIds(draft?.playerIds || []);
  const splitMode = normalizeActivitySplitMode(mode);
  if (splitMode === "shares") {
    return Object.fromEntries(playerIds.map((playerId) => [playerId, "1"]));
  }
  if (splitMode === "equal") return {};
  const totalPaid = splitMode === "percentage" ? 100 : Number(draft?.totalPaid || 0);
  const amounts = allocateWeightedActivityAmounts(
    {
      totalPaid,
      playerIds,
      settlementOwnerId: state?.settings?.organizerPlayerId || "",
      shares: {}
    },
    Object.fromEntries(playerIds.map((playerId) => [playerId, 1]))
  );
  return Object.fromEntries(playerIds.map((playerId) => [playerId, String(amounts[playerId] ?? "")]));
}

function resetActivityDraftSplitValues(draft, mode = draft?.splitMode) {
  draft.splitMode = normalizeActivitySplitMode(mode);
  draft.splitValues = activityDraftSplitDefaults(draft, draft.splitMode);
  return draft;
}

function syncActivityDraftSplitValues(draft) {
  const playerIds = uniqueIds(draft?.playerIds || []);
  const existing = draft?.splitValues || {};
  if (draft?.splitMode === "percentage") return resetActivityDraftSplitValues(draft, "percentage");
  const defaults = activityDraftSplitDefaults(draft, draft?.splitMode);
  draft.splitValues = Object.fromEntries(playerIds.map((playerId) => [
    playerId,
    existing[playerId] === undefined
      ? draft?.splitMode === "manual" ? "" : defaults[playerId] ?? ""
      : existing[playerId]
  ]));
  return draft;
}

function activityAllocatedAmount(activity, playerId) {
  return ledgerMoney(activity?.shares?.[playerId]?.allocatedAmount ?? activitySplitAmounts(activity)[playerId]);
}

function activityContributionSurplus(activity, playerId) {
  if (!activity || activityIsShuttle(activity) || !playerId || playerId === activitySettlementOwnerId(activity)) return 0;
  return Math.max(0, ledgerMoney(activityContributionAmount(activity, playerId) - activityAllocatedAmount(activity, playerId)));
}

function activityGeneratedCreditAmount(activity, playerId) {
  const amount = activityContributionSurplus(activity, playerId);
  if (!amount || !(state.activities || []).includes(activity)) return amount;
  const source = ledgerCoverageSnapshot().coverageSourcesByPlayer.get(playerId)?.find((item) => item.id === `activity-credit:${activity.id}:${playerId}`);
  return source?.type === "advance" ? 0 : amount;
}

function activityGeneratedCreditTotal(activity) {
  return ledgerMoney(activityPayerIds(activity).reduce((total, playerId) => total + activityGeneratedCreditAmount(activity, playerId), 0));
}

function activitySplitLabel(activity) {
  const labels = { equal: "Equal", manual: "Manual", percentage: "Percentage", shares: "No. of Shares" };
  return labels[normalizeActivitySplitMode(activity?.splitMode)] || labels.equal;
}

function activityPayerSummary(activity) {
  const names = activityPayerIds(activity).map(getPlayerName).filter(Boolean);
  if (!names.length) return "Not set";
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} + ${names.length - 2}` : names.join(", ");
}

function activitySettlementRows(activity) {
  const ownerId = activitySettlementOwnerId(activity);
  return uniqueIds([...(activity?.playerIds || []), ...activityPayerIds(activity)])
    .map((playerId) => {
      const share = activity?.shares?.[playerId];
      return {
        playerId,
        name: getPlayerName(playerId),
        owner: playerId === ownerId,
        allocatedAmount: activityAllocatedAmount(activity, playerId),
        contributionAmount: activityContributionAmount(activity, playerId),
        dueAmount: ledgerMoney(share?.amount),
        outstandingAmount: share ? shareOutstandingAfterCoverage(activity, share) : 0,
        creditAmount: activityGeneratedCreditAmount(activity, playerId)
      };
    });
}

function syncActivityShares(activity) {
  activity.playerIds = uniqueIds(activity.playerIds || []);
  activity.splitMode = normalizeActivitySplitMode(activity.splitMode);
  activity.splitValues = activity.splitValues && typeof activity.splitValues === "object" ? { ...activity.splitValues } : {};
  activity.contributions = activityContributions(activity);
  activity.paidById = activity.contributions[0]?.playerId || "";
  activity.shares = activity.shares || {};
  const splitAmounts = activitySplitAmounts(activity);
  const ownerId = activitySettlementOwnerId(activity);
  const nextShares = {};
  activity.playerIds.forEach((playerId) => {
    const existing = activity.shares[playerId] || {};
    const allocatedAmount = ledgerMoney(splitAmounts[playerId]);
    const contributionAmount = activityContributionAmount(activity, playerId);
    const amount = playerId === ownerId ? 0 : Math.max(0, ledgerMoney(allocatedAmount - contributionAmount));
    const paidAmount = Math.min(Math.max(0, ledgerMoney(existing.paidAmount)), amount);
    nextShares[playerId] = {
      playerId,
      allocatedAmount,
      contributionAmount,
      amount,
      paidAmount,
      paidBySelf: amount <= 0,
      status: amount <= 0 || paidAmount >= amount ? "Paid" : paidAmount > 0 ? "Partial" : "Pending"
    };
  });
  activity.shares = nextShares;
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
  const names = activityPayerIds(activity).map(getPlayerName).filter(Boolean);
  return names.length ? names.join(", ") : "Not set";
}

function activityLedgerLabel(activity, prefix = "owed to") {
  const name = activity?.name || "Activity";
  const ownerId = activitySettlementOwnerId(activity);
  return ownerId ? `${name} - ${prefix} ${getPlayerName(ownerId)}` : name;
}

function playerAdvance(playerId) {
  return Number(state.advances?.[playerId] || 0);
}

function playerIntentionalAdvancePaid(playerId) {
  return playerIntentionalAdvancePayments(playerId).reduce((total, payment) => total + payment.amount, 0);
}

function paymentTransactionIsReversed(transaction) {
  return Boolean(transaction && (transaction.status === "reversed" || transaction.reversedAt));
}

function paymentTransactionIsActive(transaction) {
  return Boolean(transaction && !paymentTransactionIsReversed(transaction));
}

function paymentTransactionIsUserReceipt(transaction) {
  return Boolean(transaction && ["advance-payment", "group-payment", "player-payment"].includes(transaction.type));
}

function paymentTransactionCanBeReversed(transaction) {
  return Boolean(paymentTransactionIsActive(transaction) && transaction.status !== "migrated" && paymentTransactionIsUserReceipt(transaction));
}

function paymentTransactionCanBePurged(transaction) {
  return Boolean(
    paymentTransactionIsReversed(transaction)
    && transaction.status !== "migrated"
    && paymentTransactionIsUserReceipt(transaction)
  );
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
    .sort((a, b) => (
      String(a.date || "").localeCompare(String(b.date || ""))
      || String(a.transaction.createdAt || "").localeCompare(String(b.transaction.createdAt || ""))
      || a.index - b.index
    ));
}

function playerCreditCoverageSources(playerId) {
  const storedCreditTotal = ledgerMoney(playerAvailableCredit(playerId));
  const trackedSources = [...(state.paymentTransactions || [])]
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => (
      ["group-payment", "player-payment"].includes(transaction.type)
      && paymentTransactionIsActive(transaction)
    ))
    .map(({ transaction, index }) => {
      const amount = ledgerMoney(
        (transaction.allocations || [])
          .filter((allocation) => allocation.type === "advance" && allocation.playerId === playerId)
          .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
      );
      return amount > 0
        ? {
            id: transaction.id,
            type: "credit",
            sourceType: "payment-credit",
            transaction,
            date: transaction.date || "",
            createdAt: transaction.createdAt || "",
            index,
            amount
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.index - b.index);
  const trackedTotal = ledgerMoney(trackedSources.reduce((total, source) => total + source.amount, 0));
  if (storedCreditTotal > trackedTotal) {
    trackedSources.unshift({
      id: `legacy-credit:${playerId}`,
      type: "credit",
      date: "",
      index: -1,
      amount: ledgerMoney(storedCreditTotal - trackedTotal)
    });
  }

  let remainingStoredCredit = storedCreditTotal;
  const storedSources = trackedSources
    .map((source) => {
      const amount = Math.min(source.amount, remainingStoredCredit);
      remainingStoredCredit = ledgerMoney(remainingStoredCredit - amount);
      return amount > 0 ? { ...source, amount, remaining: amount } : null;
    })
    .filter(Boolean);
  const activitySources = [...(state.activities || [])]
    .map((activity, index) => {
      const amount = activityContributionSurplus(activity, playerId);
      const contribution = activityContributionAmount(activity, playerId);
      return contribution > 0 && !activityIsShuttle(activity) && playerId !== activitySettlementOwnerId(activity)
        ? {
            id: `activity-credit:${activity.id}:${playerId}`,
            type: "credit",
            sourceType: "activity-contribution",
            activityId: activity.id,
            contributionAmount: contribution,
            directUsageAmount: ledgerMoney(contribution - amount),
            date: activity.date || "",
            index,
            amount,
            remaining: amount
          }
        : null;
    })
    .filter(Boolean);
  return [...storedSources, ...activitySources]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.index - b.index);
}

function compareCoverageSources(a, b) {
  return String(a.date || "").localeCompare(String(b.date || ""))
    || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    || a.index - b.index;
}

function playerChronologicalCoverageSources(playerId) {
  const advanceSources = playerIntentionalAdvancePayments(playerId).map((payment) => ({
    id: payment.id,
    type: "advance",
    sourceType: "advance-payment",
    transaction: payment.transaction,
    date: payment.date || "",
    createdAt: payment.transaction.createdAt || "",
    index: payment.index,
    amount: ledgerMoney(payment.amount),
    remaining: ledgerMoney(payment.amount)
  }));
  return [...advanceSources, ...playerCreditCoverageSources(playerId)]
    .sort(compareCoverageSources);
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

function sessionPlayerHasRecordedFinancialState(session, playerId) {
  const payment = session?.payments?.[playerId];
  return Boolean(
    Number(payment?.paidAmount || 0) > 0
    || Number(payment?.advanceAmount || 0) > 0
    || paymentHasActiveTransactionAllocation(session?.id, playerId)
  );
}

function sessionHasRecordedFinancialState(session) {
  if (!session) return false;
  return Object.keys(session.payments || {}).some((playerId) => sessionPlayerHasRecordedFinancialState(session, playerId))
    || paymentHasActiveTransactionAllocation(session.id);
}

function sessionPlayerHasActiveFinancialState(session, playerId) {
  const payment = session?.payments?.[playerId];
  return Boolean(
    sessionPlayerHasRecordedFinancialState(session, playerId)
    || (payment && paymentCoverageApplied(session, payment) > 0)
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

function activityRecordedCashTotal(activity) {
  if (!activity) return 0;
  return ledgerMoney(
    Object.values(activity.shares || {}).reduce((total, share) => (
      total + (share.paidBySelf ? 0 : Number(share.paidAmount || 0))
    ), 0)
  );
}

function activeActivityAllocationRecords(activityId) {
  return (state.paymentTransactions || [])
    .flatMap((transaction, transactionIndex) => {
      if (!paymentTransactionIsActive(transaction)) return [];
      return (transaction.allocations || [])
        .map((allocation, allocationIndex) => ({ transaction, transactionIndex, allocation, allocationIndex }))
        .filter(({ allocation }) => (
          allocation.type === "activity"
          && allocation.activityId === activityId
          && Number(allocation.amount || 0) > 0
        ));
    })
    .sort((a, b) => (
      String(a.transaction.date || "").localeCompare(String(b.transaction.date || ""))
      || String(a.transaction.createdAt || "").localeCompare(String(b.transaction.createdAt || ""))
      || a.transactionIndex - b.transactionIndex
      || a.allocationIndex - b.allocationIndex
    ));
}

function recalculatePaymentTransactionTotals(transaction) {
  transaction.allocations = (transaction.allocations || []).filter((allocation) => Number(allocation.amount || 0) > 0);
  transaction.appliedAmount = ledgerMoney(
    transaction.allocations
      .filter((allocation) => allocation.type === "session" || allocation.type === "activity")
      .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
  );
  transaction.advanceAmount = ledgerMoney(
    transaction.allocations
      .filter((allocation) => allocation.type === "advance")
      .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
  );
}

function addTransactionCredit(transaction, amount) {
  const creditAmount = ledgerMoney(amount);
  const payerId = transaction?.paidById || "";
  if (!payerId || creditAmount <= 0) return 0;
  const existingCredit = (transaction.allocations || []).find((allocation) => (
    allocation.type === "advance" && allocation.playerId === payerId
  ));
  if (existingCredit) {
    existingCredit.amount = ledgerMoney(existingCredit.amount + creditAmount);
  } else {
    transaction.allocations.push({ type: "advance", playerId: payerId, sessionId: "", activityId: "", amount: creditAmount });
  }
  addPlayerAdvance(payerId, creditAmount);
  return creditAmount;
}

function reconcileActivityFinancials(existingActivity, updatedActivity = null, source = "activity-edit") {
  if (!existingActivity) return { creditReturned: 0 };
  const allocationRecords = activeActivityAllocationRecords(existingActivity.id);
  const allocatedByPlayer = new Map();
  allocationRecords.forEach(({ allocation }) => {
    allocatedByPlayer.set(
      allocation.playerId,
      ledgerMoney((allocatedByPlayer.get(allocation.playerId) || 0) + Number(allocation.amount || 0))
    );
  });

  const legacyCashByPlayer = new Map();
  Object.entries(existingActivity.shares || {}).forEach(([playerId, share]) => {
    if (share.paidBySelf) return;
    const legacyCash = Math.max(0, ledgerMoney(Number(share.paidAmount || 0) - Number(allocatedByPlayer.get(playerId) || 0)));
    if (legacyCash > 0) legacyCashByPlayer.set(playerId, legacyCash);
  });

  const cashCapacityByPlayer = new Map();
  Object.entries(updatedActivity?.shares || {}).forEach(([playerId, share]) => {
    cashCapacityByPlayer.set(playerId, share.paidBySelf ? 0 : ledgerMoney(share.amount));
    if (!share.paidBySelf) {
      share.paidAmount = 0;
      share.status = "Pending";
    }
  });

  let creditReturned = 0;
  legacyCashByPlayer.forEach((amount, playerId) => {
    const capacity = Number(cashCapacityByPlayer.get(playerId) || 0);
    const applied = Math.min(amount, capacity);
    if (applied > 0 && updatedActivity?.shares?.[playerId]) {
      updatedActivity.shares[playerId].paidAmount = ledgerMoney(updatedActivity.shares[playerId].paidAmount + applied);
      cashCapacityByPlayer.set(playerId, ledgerMoney(capacity - applied));
    }
    const excess = ledgerMoney(amount - applied);
    if (excess > 0) {
      addPlayerAdvance(playerId, excess);
      creditReturned = ledgerMoney(creditReturned + excess);
    }
  });

  const touchedTransactions = new Set();
  allocationRecords.forEach(({ transaction, allocation }) => {
    const capacity = Number(cashCapacityByPlayer.get(allocation.playerId) || 0);
    const originalAmount = ledgerMoney(allocation.amount);
    const applied = Math.min(originalAmount, capacity);
    allocation.amount = ledgerMoney(applied);
    if (applied > 0 && updatedActivity?.shares?.[allocation.playerId]) {
      updatedActivity.shares[allocation.playerId].paidAmount = ledgerMoney(
        updatedActivity.shares[allocation.playerId].paidAmount + applied
      );
      cashCapacityByPlayer.set(allocation.playerId, ledgerMoney(capacity - applied));
    }
    const excess = ledgerMoney(originalAmount - applied);
    if (excess > 0) creditReturned = ledgerMoney(creditReturned + addTransactionCredit(transaction, excess));
    touchedTransactions.add(transaction);
  });
  touchedTransactions.forEach(recalculatePaymentTransactionTotals);

  Object.values(updatedActivity?.shares || {}).forEach((share) => {
    if (share.paidBySelf) return;
    share.paidAmount = Math.min(ledgerMoney(share.amount), ledgerMoney(share.paidAmount));
    share.status = share.paidAmount <= 0 ? "Pending" : share.paidAmount >= Number(share.amount || 0) ? "Paid" : "Partial";
  });

  const playerIds = uniqueIds([
    ...Object.keys(existingActivity.shares || {}),
    ...Object.keys(updatedActivity?.shares || {})
  ]);
  playerIds.forEach((playerId) => {
    const previousShare = existingActivity.shares?.[playerId];
    const nextShare = updatedActivity?.shares?.[playerId] || { playerId, paidAmount: 0, status: "Pending" };
    if (!previousShare) return;
    recordActivityPaymentAdjustment(updatedActivity || existingActivity, nextShare, previousShare, source);
  });
  return { creditReturned };
}

function playerRemovalBalances(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  return {
    due: ledgerMoney(summary?.balance),
    advance: ledgerMoney(summary?.remainingAdvance),
    credit: ledgerMoney(summary?.remainingCredit),
    reserved: ledgerMoney(playerUpcomingLinkedAdvance(playerId))
  };
}

function playerHasUnsettledFinances(playerId) {
  return Object.values(playerRemovalBalances(playerId)).some((amount) => amount > 0);
}

function playerHasFinancialHistory(playerId) {
  if (!playerId) return false;
  if (Number(state.advances?.[playerId] || 0) > 0) return true;
  if ((state.sessions || []).some((session) => sessionPlayerHasFinancialHistory(session, playerId))) return true;
  if ((state.activities || []).some((activity) => (
    activitySettlementOwnerId(activity) === playerId
    || activityContributionAmount(activity, playerId) > 0
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
  const cannotDelete = () => {
    modal = nextModal;
    showToast("Could not delete.");
    return false;
  };
  if (deleteType === "session") {
    const session = getSession(target.dataset.session);
    if (!session) return cannotDelete();
    if (sessionHasFinancialHistory(session)) {
      modal = null;
      showToast(`This session has retained financial history and cannot be ${session.recurrence ? "cancelled" : "deleted"}.`);
      return false;
    }
    const recurring = Boolean(normalizeSessionRecurrence(session.recurrence));
    state.sessions = state.sessions.filter((item) => item.id !== session.id);
    if (activeSessionId === session.id) {
      activeSessionId = sortSessions()[0]?.id || null;
    }
    modal = null;
    saveState();
    showToast(recurring ? "Session cancelled. Other weekly sessions were not changed." : "Session deleted.");
    return true;
  }
  if (deleteType === "court") {
    const court = state.courts.find((item) => item.id === target.dataset.court);
    if (!court) return cannotDelete();
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
    if (!player) return cannotDelete();
    const balances = playerRemovalBalances(player.id);
    if (Object.values(balances).some((amount) => amount > 0)) {
      modal = null;
      const pending = [
        balances.due > 0 ? `Due ${currency(balances.due)}` : "",
        balances.advance > 0 ? `Advance ${currency(balances.advance)}` : "",
        balances.credit > 0 ? `Credit ${currency(balances.credit)}` : "",
        balances.reserved > 0 ? `Reserved payment ${currency(balances.reserved)}` : ""
      ].filter(Boolean).join(", ");
      showToast(`Settle ${pending} before removing this player.`);
      return false;
    }
    // Directory removal must not change the ledger's attendance, shares or funding ownership.
    player.archivedAt = new Date().toISOString();
    ["organizer", "coOrganizer"].forEach((role) => {
      const field = playerRoleConfig(role).field;
      if (state.settings?.[field] === player.id) state.settings[field] = "";
    });
    modal = null;
    saveState();
    showToast("Player removed from active lists. History preserved.");
    return true;
  }
  if (deleteType === "response") {
    const session = getSession(target.dataset.session);
    if (!session) return cannotDelete();
    const removedResponse = session.responses.find((response) => response.id === target.dataset.response);
    if (removedResponse?.playerId && sessionPlayerHasRecordedFinancialState(session, removedResponse.playerId)) {
      modal = nextModal;
      showToast("Reverse this player's recorded session payment before removing them. Automatic Advance/Credit coverage recalculates.");
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
    if (response?.playerId && sessionPlayerHasRecordedFinancialState(session, response.playerId)) {
      modal = nextModal;
      showToast("Reverse this player's recorded session payment before changing guests. Automatic Advance/Credit coverage recalculates.");
      return false;
    }
    if (!session || !removeResponseGuest(session, target.dataset.response)) return cannotDelete();
    modal = nextModal;
    saveState();
    showToast("Guest removed.");
    return true;
  }
  if (deleteType === "attendance") {
    const session = getSession(target.dataset.session);
    const playerId = target.dataset.player;
    if (!session || !playerId) return cannotDelete();
    if (sessionPlayerHasRecordedFinancialState(session, playerId)) {
      modal = nextModal;
      showToast("Reverse this player's recorded session payment before removing attendance. Automatic Advance/Credit coverage recalculates.");
      return false;
    }
    if (!removeAttendedPlayer(session, playerId)) return cannotDelete();
    modal = nextModal;
    saveState();
    showToast("Player removed from attendance.");
    return true;
  }
  if (deleteType === "attendance-guest") {
    const session = getSession(target.dataset.session);
    const guestKey = target.dataset.guestKey;
    if (!session || !guestKey) return cannotDelete();
    const guest = effectiveAttendedEntries(session).find((entry) => entry.guest && entry.key === guestKey);
    if (!guest) return cannotDelete();
    if (sessionPlayerHasRecordedFinancialState(session, guest.playerId)) {
      modal = nextModal;
      showToast("Reverse this player's recorded session payment before changing guests. Automatic Advance/Credit coverage recalculates.");
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
    if (!activity) return cannotDelete();
    const reconciliation = reconcileActivityFinancials(activity, null, "activity-delete");
    state.activities = state.activities.filter((item) => item.id !== activity.id);
    syncSessionStages();
    modal = null;
    saveState();
    showToast(reconciliation.creditReturned > 0
      ? `Activity deleted. ${currency(reconciliation.creditReturned)} returned as Credit.`
      : "Activity deleted.");
    return true;
  }
  if (deleteType === "payment-group") {
    const group = getPaymentGroup(target.dataset.paymentGroup);
    if (!group) return cannotDelete();
    group.active = false;
    syncSessionStages();
    modal = null;
    saveState();
    showToast("Payment group deleted.");
    return true;
  }
  if (deleteType === "payment-transaction") {
    if (!reversePaymentTransaction(target.dataset.transaction)) return cannotDelete();
    modal = ["advanceHistory", "groupPaymentHistory", "paymentHistory"].includes(nextModal?.type) ? nextModal : null;
    saveState();
    showToast("Payment reversed. Audit history retained.");
    return true;
  }
  if (deleteType === "active-payment-transaction") {
    if (!deleteActivePaymentTransaction(target.dataset.transaction)) return cannotDelete();
    modal = ["advanceHistory", "groupPaymentHistory", "paymentHistory"].includes(nextModal?.type) ? nextModal : null;
    saveState();
    showToast("Payment permanently deleted. Its financial effect was undone.");
    return true;
  }
  if (deleteType === "reversed-payment-transaction") {
    if (!deleteReversedPaymentTransaction(target.dataset.transaction)) return cannotDelete();
    modal = ["advanceHistory", "groupPaymentHistory", "paymentHistory"].includes(nextModal?.type) ? nextModal : null;
    saveState();
    showToast("Reversed record permanently deleted. Balances were not changed.");
    return true;
  }
  if (deleteType === "payment-history") {
    const playerId = target.dataset.player;
    const historyType = target.dataset.historyType;
    if (!playerId || !historyType) return cannotDelete();
    if (historyType === "session") {
      const session = getSession(target.dataset.session);
      const payment = session?.payments?.[playerId];
      if (!session || !payment) return cannotDelete();
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
      if (!activity || !share) return cannotDelete();
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
      modal = nextModal;
      showToast("Reverse the payment transaction that created this Credit.");
      return false;
    } else {
      return cannotDelete();
    }
    modal = { type: "paymentHistory", playerId };
    saveState();
    showToast("Payment reversed. Audit history retained.");
    return true;
  }
  return cannotDelete();
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
      + Number(details?.groupAdvanceApplied || 0)
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
    if (field === "advanceApplied" || field === "groupAdvanceApplied") {
      details.advanceSourceAllocations.push({
        payerId: source.payerId || details.playerId,
        sourceId: source.sourceId,
        amount: ledgerMoney(itemAmount)
      });
    }
    if (field === "ownCreditApplied" || field === "groupCreditApplied") {
      details.creditSourceAllocations.push({
        payerId: source.payerId || details.playerId,
        sourceId: source.sourceId,
        amount: ledgerMoney(itemAmount)
      });
    }
    if (field === "groupAdvanceApplied") {
      details.groupAdvanceSources.push({
        payerId: source.payerId || "",
        groupId: source.groupId || "",
        amount: ledgerMoney(itemAmount)
      });
    }
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

function paymentGroupLedgerDetails(group, ledgersByPlayer) {
  const memberIds = paymentGroupPlayerIds(group);
  const memberOrder = new Map(memberIds.map((playerId, index) => [playerId, index]));
  return memberIds
    .flatMap((playerId) => ledgersByPlayer.get(playerId) || [])
    .sort((a, b) => {
      const dateCompare = String(a.item?.date || "").localeCompare(String(b.item?.date || ""));
      if (dateCompare) return dateCompare;
      const aPayerOrder = a.playerId === group.payerId ? -1 : (memberOrder.get(a.playerId) ?? Number.MAX_SAFE_INTEGER);
      const bPayerOrder = b.playerId === group.payerId ? -1 : (memberOrder.get(b.playerId) ?? Number.MAX_SAFE_INTEGER);
      if (aPayerOrder !== bPayerOrder) return aPayerOrder - bPayerOrder;
      return String(a.key || "").localeCompare(String(b.key || ""));
    });
}

function allocatePayerCoverageAcrossGroup(detailsList, amount, config) {
  let remaining = Math.max(0, ledgerMoney(amount));
  let ownApplied = 0;
  let groupApplied = 0;
  detailsList.forEach((details) => {
    if (remaining <= 0) return;
    const isPayerCharge = details.playerId === config.payerId;
    const result = allocateLedgerCoverage(
      [details],
      remaining,
      isPayerCharge ? config.ownField : config.groupField,
      { payerId: config.payerId, groupId: config.groupId, sourceId: config.sourceId }
    );
    if (isPayerCharge) ownApplied = ledgerMoney(ownApplied + result.applied);
    else groupApplied = ledgerMoney(groupApplied + result.applied);
    remaining = result.remaining;
  });
  return { ownApplied, groupApplied, remaining };
}

function coverageSourceRemaining(sources, type) {
  return ledgerMoney(
    (sources || [])
      .filter((source) => source.type === type)
      .reduce((total, source) => total + Number(source.remaining || 0), 0)
  );
}

function allocateChronologicalCoverage(detailsList, sources, config = {}) {
  const result = {
    advanceApplied: 0,
    groupAdvanceApplied: 0,
    ownCreditApplied: 0,
    groupCreditApplied: 0,
    remainingAdvance: coverageSourceRemaining(sources, "advance"),
    remainingCredit: coverageSourceRemaining(sources, "credit")
  };

  (sources || []).forEach((source) => {
    if (source.remaining <= 0) return;
    const isAdvance = source.type === "advance";
    if (config.payerId) {
      const allocation = allocatePayerCoverageAcrossGroup(detailsList, source.remaining, {
        payerId: config.payerId,
        groupId: config.groupId,
        sourceId: source.id,
        ownField: isAdvance ? "advanceApplied" : "ownCreditApplied",
        groupField: isAdvance ? "groupAdvanceApplied" : "groupCreditApplied"
      });
      source.remaining = allocation.remaining;
      if (isAdvance) {
        result.advanceApplied = ledgerMoney(result.advanceApplied + allocation.ownApplied);
        result.groupAdvanceApplied = ledgerMoney(result.groupAdvanceApplied + allocation.groupApplied);
      } else {
        result.ownCreditApplied = ledgerMoney(result.ownCreditApplied + allocation.ownApplied);
        result.groupCreditApplied = ledgerMoney(result.groupCreditApplied + allocation.groupApplied);
      }
      return;
    }

    const allocation = allocateLedgerCoverage(
      detailsList,
      source.remaining,
      isAdvance ? "advanceApplied" : "ownCreditApplied",
      { sourceId: source.id }
    );
    source.remaining = allocation.remaining;
    if (isAdvance) result.advanceApplied = ledgerMoney(result.advanceApplied + allocation.applied);
    else result.ownCreditApplied = ledgerMoney(result.ownCreditApplied + allocation.applied);
  });

  result.remainingAdvance = coverageSourceRemaining(sources, "advance");
  result.remainingCredit = coverageSourceRemaining(sources, "credit");
  return result;
}

let ledgerCoverageSnapshotCacheDepth = 0;
let cachedLedgerCoverageSnapshot = null;

function withLedgerCoverageSnapshotCache(callback) {
  const outermostScope = ledgerCoverageSnapshotCacheDepth === 0;
  if (outermostScope) cachedLedgerCoverageSnapshot = null;
  ledgerCoverageSnapshotCacheDepth += 1;
  try {
    return callback();
  } finally {
    ledgerCoverageSnapshotCacheDepth -= 1;
    if (ledgerCoverageSnapshotCacheDepth === 0) cachedLedgerCoverageSnapshot = null;
  }
}

function ledgerCoverageSnapshot() {
  if (ledgerCoverageSnapshotCacheDepth > 0 && cachedLedgerCoverageSnapshot) {
    return cachedLedgerCoverageSnapshot;
  }
  const snapshot = buildLedgerCoverageSnapshot();
  if (ledgerCoverageSnapshotCacheDepth > 0) cachedLedgerCoverageSnapshot = snapshot;
  return snapshot;
}

function buildLedgerCoverageSnapshot() {
  const playerIds = uniqueIds([...(state.players || []).map((player) => player.id), ...Object.keys(state.advances || {})]);
  const sources = new Map(playerIds.map((playerId) => [playerId, playerChronologicalCoverageSources(playerId)]));
  const ledgers = new Map(playerIds.map((playerId) => [playerId, playerLedger(playerId)]));
  prepareSharedAdvanceSources(sources, ledgers);
  return allocateLedgerCoverageSnapshot(sources, ledgers);
}

function fundingSourceExistsBy(source, event) {
  if (source.availableAfter && !fundingSourceExistsBy(source.availableAfter, event)) return false;
  if (!source.date || source.date < event.date) return true;
  if (source.date > event.date) return false;
  if (source.transaction && event.transaction && source.createdAt && event.createdAt) {
    return source.createdAt < event.createdAt || (source.createdAt === event.createdAt && source.index <= event.index);
  }
  return true;
}

function prepareSharedAdvanceSources(sources, ledgers) {
  const groups = (state.paymentGroups || []).filter((group) => group.active !== false);
  const candidates = [...sources].flatMap(([playerId, items]) => items
    .filter((source) => source.type === "credit" && source.date && ["activity-contribution", "payment-credit"].includes(source.sourceType))
    .map((source) => ({ playerId, source })))
    .sort((a, b) => compareCoverageSources(a.source, b.source) || a.playerId.localeCompare(b.playerId));
  const processed = new Set();
  for (const { playerId, source } of candidates) {
    const eligibleGroups = groups.filter((group) => paymentGroupPlayerIds(group).includes(playerId)
      && paymentGroupPlayerIds(group).some((id) => (sources.get(id) || []).some((item) => item.type === "advance" && item.date && fundingSourceExistsBy(item, source))));
    if (eligibleGroups.length) {
      // Replay known funding before this contribution. Later payments cannot reopen an earlier cycle.
      const earlierSources = new Map([...sources].map(([id, items]) => [id, items
        .filter((item) => fundingSourceExistsBy(item, source) && (item.type === "advance" || !item.date || processed.has(item)))
        .map((item) => ({ ...item }))]));
      const earlierLedgers = source.sourceType === "activity-contribution"
        ? new Map([...ledgers].map(([id, items]) => [id, items.filter((item) => item.activity?.id !== source.activityId)]))
        : ledgers;
      const before = allocateLedgerCoverageSnapshot(earlierSources, earlierLedgers);
      let cycleStartDate = "";
      let availableAfter = null;
      const group = eligibleGroups.find((candidate) => {
        cycleStartDate = "";
        availableAfter = null;
        const members = new Set(paymentGroupPlayerIds(candidate));
        let available = 0;
        before.coverageSourcesByPlayer.forEach((items, id) => {
          if (!members.has(id)) return;
          items.filter((item) => item.type === "advance").forEach((item) => {
            const usedBefore = [...before.items.values()].filter((detail) => String(detail.item.date || "") <= source.date
              && !(source.sourceType === "activity-contribution" && detail.item.activity?.id === source.activityId))
              .reduce((sum, detail) => sum + detail.advanceSourceAllocations
                .filter((allocation) => allocation.payerId === id && allocation.sourceId === item.id)
                .reduce((subtotal, allocation) => subtotal + allocation.amount, 0), 0);
            const remainingBefore = Math.max(0, ledgerMoney(item.amount - Number(item.directUsageAmount || 0) - usedBefore));
            available += remainingBefore;
            const start = item.cycleStartDate || item.date;
            if (remainingBefore > 0 && start && (!cycleStartDate || start < cycleStartDate)) cycleStartDate = start;
            const openingSource = item.availableAfter || item;
            if (remainingBefore > 0 && (!availableAfter || compareCoverageSources(openingSource, availableAfter) < 0)) {
              availableAfter = openingSource;
            }
          });
        });
        return ledgerMoney(available) > 0;
      });
      if (group) {
        source.type = "advance";
        source.fundingGroupId = group.id;
        source.cycleStartDate = cycleStartDate;
        source.availableAfter = availableAfter;
        if (source.sourceType === "activity-contribution") source.amount = source.contributionAmount;
      }
    }
    processed.add(source);
  }
}

function allocateLedgerCoverageSnapshot(sourceInputs, ledgerInputs) {
  const itemDetails = new Map();
  const ledgersByPlayer = new Map();
  const playerSummaries = new Map();
  const groupSummaries = new Map();
  const coverageSourcesByPlayer = new Map();
  const playerIds = uniqueIds([
    ...(state.players || []).map((player) => player.id),
    ...Object.keys(state.advances || {})
  ]);
  const activePaymentGroups = (state.paymentGroups || []).filter((group) => group.active !== false);
  const groupedPlayerIds = new Set(activePaymentGroups.flatMap((group) => [...paymentGroupPlayerIds(group), group.payerId]).filter(Boolean));

  playerIds.forEach((playerId) => {
    const coverageSources = (sourceInputs.get(playerId) || []).map((source) => ({
      ...source,
      remaining: ledgerMoney(source.amount - (source.type === "advance" ? Number(source.directUsageAmount || 0) : 0))
    }));
    const detailsList = (ledgerInputs.get(playerId) || []).map((item) => {
      const details = {
        key: ledgerItemKey(item),
        playerId,
        item,
        rawOutstanding: ledgerMoney(item.outstanding),
        advanceApplied: 0,
        advanceSourceAllocations: [],
        creditSourceAllocations: [],
        groupAdvanceApplied: 0,
        groupAdvanceSources: [],
        ownCreditApplied: 0,
        groupCreditApplied: 0,
        groupCreditSources: []
      };
      itemDetails.set(details.key, details);
      return details;
    });
    coverageSourcesByPlayer.set(playerId, coverageSources);
    ledgersByPlayer.set(playerId, detailsList);
    playerSummaries.set(playerId, {
      playerId,
      rawOutstanding: ledgerMoney(detailsList.reduce((total, details) => total + details.rawOutstanding, 0)),
      advanceApplied: 0,
      groupAdvanceReceived: 0,
      groupAdvanceProvided: 0,
      ownCreditApplied: 0,
      groupCreditReceived: 0,
      groupCreditProvided: 0,
      remainingAdvance: coverageSourceRemaining(coverageSources, "advance"),
      remainingCredit: coverageSourceRemaining(coverageSources, "credit"),
      balance: 0
    });
  });

  playerIds.forEach((playerId) => {
    const summary = playerSummaries.get(playerId);
    const detailsList = ledgersByPlayer.get(playerId) || [];
    if (groupedPlayerIds.has(playerId)) return;
    const allocation = allocateChronologicalCoverage(detailsList, coverageSourcesByPlayer.get(playerId));
    summary.advanceApplied = allocation.advanceApplied;
    summary.ownCreditApplied = allocation.ownCreditApplied;
    summary.remainingAdvance = allocation.remainingAdvance;
    summary.remainingCredit = allocation.remainingCredit;
  });

  activePaymentGroups.forEach((group) => {
    const memberIds = paymentGroupPlayerIds(group);
    const detailsList = paymentGroupLedgerDetails(group, ledgersByPlayer);
    const payerSources = coverageSourcesByPlayer.get(group.payerId) || [];
    const payerAdvanceBefore = coverageSourceRemaining(payerSources, "advance");
    const payerCreditBefore = coverageSourceRemaining(payerSources, "credit");
    // Keep source objects shared across groups so each deposit can be spent only once.
    const groupSources = uniqueIds([...memberIds, group.payerId].filter(Boolean))
      .flatMap((playerId) => (coverageSourcesByPlayer.get(playerId) || []).map((source) => ({ playerId, source })))
      .sort((a, b) => compareCoverageSources(a.source, b.source) || a.playerId.localeCompare(b.playerId));
    let advanceApplied = 0;
    let creditApplied = 0;
    groupSources.forEach(({ playerId, source }) => {
      const summary = playerSummaries.get(playerId);
      const eligibleDetails = source.type === "advance" || playerId === group.payerId
        ? detailsList : ledgersByPlayer.get(playerId) || [];
      const allocation = allocateChronologicalCoverage(eligibleDetails, [source], { payerId: playerId, groupId: group.id });
      if (summary) {
        summary.advanceApplied = ledgerMoney(summary.advanceApplied + allocation.advanceApplied);
        summary.groupAdvanceProvided = ledgerMoney(summary.groupAdvanceProvided + allocation.groupAdvanceApplied);
        summary.ownCreditApplied = ledgerMoney(summary.ownCreditApplied + allocation.ownCreditApplied);
        summary.groupCreditProvided = ledgerMoney(summary.groupCreditProvided + allocation.groupCreditApplied);
      }
      advanceApplied = ledgerMoney(advanceApplied + allocation.groupAdvanceApplied);
      creditApplied = ledgerMoney(creditApplied + allocation.groupCreditApplied);
    });
    groupSummaries.set(group.id, {
      groupId: group.id,
      payerId: group.payerId || "",
      grossBalance: 0,
      advanceApplied,
      creditApplied,
      balance: 0,
      payerAdvanceBefore,
      payerAdvanceAfter: coverageSourceRemaining(payerSources, "advance"),
      payerCreditBefore,
      payerCreditAfter: coverageSourceRemaining(payerSources, "credit")
    });
  });

  playerIds.forEach((playerId) => {
    const summary = playerSummaries.get(playerId);
    const detailsList = ledgersByPlayer.get(playerId) || [];
    summary.remainingAdvance = coverageSourceRemaining(coverageSourcesByPlayer.get(playerId), "advance");
    summary.remainingCredit = coverageSourceRemaining(coverageSourcesByPlayer.get(playerId), "credit");
    summary.groupAdvanceReceived = ledgerMoney(detailsList.reduce((total, details) => total + details.groupAdvanceApplied, 0));
    summary.groupCreditReceived = ledgerMoney(detailsList.reduce((total, details) => total + details.groupCreditApplied, 0));
    summary.balance = ledgerMoney(detailsList.reduce((total, details) => total + ledgerCoverageOutstanding(details), 0));
  });
  activePaymentGroups.forEach((group) => {
    const summary = groupSummaries.get(group.id);
    summary.balance = ledgerMoney(paymentGroupPlayerIds(group).reduce((total, playerId) => total + Number(playerSummaries.get(playerId)?.balance || 0), 0));
    summary.grossBalance = ledgerMoney(summary.balance + summary.advanceApplied + summary.creditApplied);
  });

  return {
    items: itemDetails,
    ledgersByPlayer,
    coverageSourcesByPlayer,
    players: playerSummaries,
    groups: groupSummaries
  };
}

function emptyLedgerCoverageDetails(rawOutstanding = 0) {
  return {
    rawOutstanding: ledgerMoney(rawOutstanding),
    advanceApplied: 0,
    groupAdvanceApplied: 0,
    groupAdvanceSources: [],
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
    groupAdvanceApplied: ledgerMoney(normalized.groupAdvanceApplied),
    groupAdvanceSources: (normalized.groupAdvanceSources || []).map((source) => ({ ...source })),
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

function groupAdvanceAmountsByPayer(details) {
  const amounts = new Map();
  (details?.groupAdvanceSources || []).forEach((source) => {
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
  groupAdvanceAmountsByPayer(details).forEach((amount, payerId) => {
    parts.push(`${currency(amount)} Advance from ${getPlayerName(payerId)}`);
  });
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

function playerSessionRoleCoveredAmount(playerId) {
  const covered = sortSessions()
    .filter((session) => sessionIsCollectible(session))
    .filter((session) => sessionRoleFreePlayerIds(session).includes(playerId))
    .filter((session) => effectiveAttendedPlayerIds(session).includes(playerId))
    .reduce((total, session) => total + Math.max(0, Number(session.perPersonAmount || 0)), 0);
  return Number(covered.toFixed(2));
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
  return playerAdvanceAccountSources(playerId).reduce((sum, source) => ledgerMoney(sum + source.amount), 0);
}

function playerAdvanceAccountSources(playerId) {
  return (ledgerCoverageSnapshot().coverageSourcesByPlayer.get(playerId) || []).filter((source) => source.type === "advance");
}

function playerAdvanceAppliedToLedger(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  return ledgerMoney(Number(summary?.advanceApplied || 0) + Number(summary?.groupAdvanceProvided || 0));
}

function playerRemainingAdvance(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  return ledgerMoney(summary?.remainingAdvance);
}

function playerRemainingCredit(playerId) {
  return Number(ledgerCoverageSnapshot().players.get(playerId)?.remainingCredit || 0);
}

function playerCreditAccountSummary(playerId) {
  const summary = ledgerCoverageSnapshot().players.get(playerId);
  const ownApplied = ledgerMoney(summary?.ownCreditApplied);
  const groupApplied = ledgerMoney(summary?.groupCreditProvided);
  const remaining = ledgerMoney(summary?.remainingCredit);
  return {
    total: ledgerMoney(ownApplied + groupApplied + remaining),
    ownApplied,
    groupApplied,
    remaining
  };
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

function playerAdvanceCoverageDeductions(playerId) {
  const deductions = [];
  ledgerCoverageSnapshot().items.forEach((details) => {
    (details.advanceSourceAllocations || []).filter((source) => source.payerId === playerId).forEach((source) => {
      deductions.push({
        item: details.item,
        coveredPlayerId: details.playerId,
        sourceId: source.sourceId,
        date: details.item?.date || "",
        amount: source.amount
      });
    });
  });
  playerAdvanceAccountSources(playerId).filter((source) => source.directUsageAmount > 0).forEach((source) => {
    const activity = state.activities.find((item) => item.id === source.activityId);
    if (!activity?.shares?.[playerId]) return;
    // The payer already settled this part with the vendor; show it once in the gross Advance statement.
    deductions.push({
      item: { type: "activity", date: activity.date, activity, share: activity.shares[playerId] },
      coveredPlayerId: playerId, sourceId: source.id, date: activity.date,
      amount: source.directUsageAmount, directPayment: true
    });
  });
  return deductions.sort((a, b) => (
    String(a.date || "").localeCompare(String(b.date || ""))
    || String(a.coveredPlayerId || "").localeCompare(String(b.coveredPlayerId || ""))
    || String(ledgerItemKey(a.item)).localeCompare(String(ledgerItemKey(b.item)))
  ));
}

function playerAdvanceCycleSummaries(playerId) {
  const ledgerRemainders = playerAdvanceCoverageDeductions(playerId).map((deduction) => ({
    ...deduction,
    remaining: deduction.amount
  }));
  const cycles = playerAdvanceAccountSources(playerId).map((payment) => {
    let balance = payment.amount;
    let deducted = 0;
    const deductions = [];
    ledgerRemainders.forEach((ledger) => {
      if (ledger.sourceId !== payment.id) return;
      if (balance <= 0 || ledger.remaining <= 0) return;
      const amount = Math.min(balance, ledger.remaining);
      balance = Number((balance - amount).toFixed(2));
      ledger.remaining = Number((ledger.remaining - amount).toFixed(2));
      deducted = Number((deducted + amount).toFixed(2));
      deductions.push({
        itemKey: ledgerItemKey(ledger.item),
        coveredPlayerId: ledger.coveredPlayerId,
        type: ledger.item.type,
        date: ledger.item.date || "",
        label: advanceDeductionLabel(ledger.item, ledger.coveredPlayerId, playerId),
        amount: Number(amount.toFixed(2)),
        directPayment: Boolean(ledger.directPayment),
        balanceAfter: balance
      });
    });
    return {
      id: payment.id,
      transaction: payment.transaction,
      sourceType: payment.sourceType,
      activityId: payment.activityId || "",
      fundingGroupId: payment.fundingGroupId || "",
      cycleStartDate: payment.cycleStartDate || payment.date,
      date: payment.date,
      received: payment.amount,
      deducted,
      balance,
      deductions
    };
  });

  const allocationsByItem = new Map();
  cycles.forEach((cycle, cycleIndex) => {
    cycle.deductions.forEach((deduction) => {
      const allocations = allocationsByItem.get(deduction.itemKey) || [];
      allocations.push({ cycleIndex, amount: deduction.amount });
      allocationsByItem.set(deduction.itemKey, allocations);
    });
  });
  cycles.forEach((cycle, cycleIndex) => {
    cycle.deductions.forEach((deduction) => {
      const allocations = allocationsByItem.get(deduction.itemKey) || [];
      const earlier = allocations.filter((allocation) => allocation.cycleIndex < cycleIndex);
      const later = allocations.filter((allocation) => allocation.cycleIndex > cycleIndex);
      deduction.earlierAdvanceAmount = ledgerMoney(earlier.reduce((total, allocation) => total + allocation.amount, 0));
      deduction.earlierAdvanceCount = earlier.length;
      deduction.laterAdvanceAmount = ledgerMoney(later.reduce((total, allocation) => total + allocation.amount, 0));
      deduction.laterAdvanceCount = later.length;
      deduction.advanceCoverageTotal = ledgerMoney(
        allocations.reduce((total, allocation) => total + allocation.amount, 0)
      );
    });
  });
  return cycles;
}

function playerAdvanceHistorySummaries(playerId) {
  const activeSummaries = new Map(playerAdvanceCycleSummaries(playerId).map((summary) => [summary.id, summary]));
  const history = [...(state.paymentTransactions || [])]
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
  return [...history, ...[...activeSummaries.values()]
    .filter((summary) => summary.sourceType !== "advance-payment")
    .map((summary) => ({ ...summary, reversed: false }))]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id).localeCompare(String(b.id)));
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

function advanceDeductionLabel(item, coveredPlayerId = "", payerId = "") {
  let label = item.label || "Deduction";
  if (item.type === "session") label = `${formatDate(item.session.date)} session`;
  if (item.type === "activity") label = `${formatDate(item.activity.date)} ${item.activity.name || "Activity"}`;
  if (coveredPlayerId && coveredPlayerId !== payerId) label += ` - ${getPlayerName(coveredPlayerId)}`;
  return label;
}

function advanceFundingSourceCopy(amount, count, direction) {
  const source = count === 1
    ? `${direction === "earlier" ? "an" : "a"} ${direction} Advance`
    : `${count} ${direction} Advances`;
  return `${currency(amount)} from ${source}`;
}

function advanceDeductionCopyLine(deduction) {
  const earlierAmount = ledgerMoney(deduction.earlierAdvanceAmount);
  const laterAmount = ledgerMoney(deduction.laterAdvanceAmount);
  if (earlierAmount <= 0 && laterAmount <= 0) {
    return `- ${deduction.label}: ${currency(deduction.amount)}`;
  }
  const context = [];
  if (earlierAmount > 0) {
    context.push(advanceFundingSourceCopy(earlierAmount, deduction.earlierAdvanceCount, "earlier"));
  }
  if (laterAmount > 0) {
    context.push(advanceFundingSourceCopy(laterAmount, deduction.laterAdvanceCount, "later"));
  }
  context.push(`${currency(deduction.advanceCoverageTotal)} covered by Advances in total`);
  return `- ${deduction.label}: ${currency(deduction.amount)} from this Advance (${context.join("; ")})`;
}

function advanceUsageByMember(deductions, memberIds = []) {
  const usage = new Map();
  deductions.forEach((deduction) => {
    const existing = usage.get(deduction.itemKey);
    if (existing) existing.amount = ledgerMoney(existing.amount + deduction.amount);
    else usage.set(deduction.itemKey, { ...deduction });
  });
  const recipients = uniqueIds([...memberIds, ...deductions.map((item) => item.coveredPlayerId)]);
  if (!memberIds.length) recipients.sort((a, b) => getPlayerName(a).localeCompare(getPlayerName(b)));
  return recipients.map((playerId) => {
    const items = [...usage.values()].filter((item) => item.coveredPlayerId === playerId)
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.itemKey.localeCompare(b.itemKey));
    return { playerId, items, amount: ledgerMoney(items.reduce((sum, item) => sum + item.amount, 0)) };
  });
}

function advanceSummaryMemberIds(playerId) {
  return uniqueIds([playerId, ...(state.paymentGroups || [])
    .filter((group) => group.active !== false && paymentGroupPlayerIds(group).includes(playerId))
    .flatMap(paymentGroupPlayerIds)]);
}

function advanceContributionCutoff(playerId, memberIds) {
  const ownLatest = playerIntentionalAdvancePayments(playerId).at(-1);
  if (ownLatest) return ownLatest.date;
  const cycles = memberIds.flatMap(playerAdvanceCycleSummaries);
  // Members without a deposit follow the still-open shared advance, not a new top-up's date.
  const openCycles = cycles.filter((cycle) => cycle.balance > 0);
  const relevant = openCycles.length ? openCycles : memberIds.flatMap((id) => playerAdvanceCycleSummaries(id).slice(-1));
  return relevant.map((cycle) => cycle.date).filter(Boolean).sort()[0] || "";
}

function memberContributionCopyLines(playerId, memberIds, complete = false, snapshot = ledgerCoverageSnapshot()) {
  const cutoff = complete ? "" : advanceContributionCutoff(playerId, memberIds);
  const inScope = (date) => !cutoff || (date && date >= cutoff);
  const sources = snapshot.coverageSourcesByPlayer.get(playerId) || [];
  const entries = [];
  sources.filter((source) => source.type === "advance" && source.sourceType !== "advance-payment" && inScope(source.date)).forEach((source) => {
    const activity = state.activities.find((item) => item.id === source.activityId);
    entries.push({ date: source.date || "", id: source.id, lines: [
      `- ${source.date ? formatDate(source.date) : "Date not set"} - ${activity ? `${activity.name}: paid` : "Payment received:"} ${currency(source.amount)} added to group Advance`
    ] });
  });
  const creditLines = (sourceId, createdAmount) => {
    if (createdAmount <= 0) return [];
    const source = sources.find((item) => item.type === "credit" && item.id === sourceId);
    const uses = [...snapshot.items.values()].flatMap((details) => {
      const used = ledgerMoney((details.creditSourceAllocations || [])
        .filter((item) => item.payerId === playerId && item.sourceId === sourceId)
        .reduce((sum, item) => sum + item.amount, 0));
      return used > 0 ? [{ details, used }] : [];
    }).sort((a, b) => String(a.details.item.date || "").localeCompare(String(b.details.item.date || "")) || a.details.key.localeCompare(b.details.key));
    return [
      `  Credit created: ${currency(createdAmount)}`,
      ...uses.map(({ details, used }) => `  Credit applied: ${currency(used)} - ${advanceDeductionLabel(details.item)}${details.playerId === playerId ? "" : ` for ${getPlayerName(details.playerId)}`}`),
      `  Credit remaining: ${currency(source?.remaining || 0)}`
    ];
  };
  (state.activities || []).filter((activity) => inScope(activity.date)).forEach((activity) => {
    if (sources.some((source) => source.type === "advance" && source.activityId === activity.id)) return;
    const paid = activityContributionAmount(activity, playerId);
    if (paid <= 0) return;
    const ownShare = activityAllocatedAmount(activity, playerId);
    entries.push({ date: activity.date || "", id: activity.id, lines: [
      `- ${activity.date ? formatDate(activity.date) : "Date not set"} - ${activity.name || "Activity"}: paid ${currency(paid)}`,
      `  Own share: ${currency(ownShare)}; covered directly: ${currency(Math.min(paid, ownShare))}`,
      ...creditLines(`activity-credit:${activity.id}:${playerId}`, activityGeneratedCreditAmount(activity, playerId))
    ] });
  });
  (state.paymentTransactions || []).filter((transaction) => (
    ["player-payment", "group-payment"].includes(transaction.type)
    && transaction.paidById === playerId && paymentTransactionIsActive(transaction) && inScope(transaction.date)
  )).forEach((transaction) => {
    if (sources.some((source) => source.type === "advance" && source.id === transaction.id)) return;
    const credit = ledgerMoney((transaction.allocations || [])
      .filter((allocation) => allocation.type === "advance" && allocation.playerId === playerId)
      .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
    if (credit <= 0) return;
    entries.push({ date: transaction.date || "", id: transaction.id, lines: [
      `- ${transaction.date ? formatDate(transaction.date) : "Date not set"} - Payment received: ${currency(transaction.amountPaid)}`,
      ...creditLines(transaction.id, credit)
    ] });
  });
  if (!entries.length) return [];
  return [
    `Member payments${cutoff ? ` (since ${formatDate(cutoff)})` : ""}:`,
    ...entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).flatMap((entry) => entry.lines),
    "Payments listed here are not additional usage charges."
  ];
}

function appendAdvanceUsageCopy(lines, deductions, complete = false, memberIds = []) {
  const snapshot = ledgerCoverageSnapshot();
  lines.push("", "*Usage by member*");
  if (!deductions.length) lines.push("No usage from this Advance.");
  advanceUsageByMember(deductions, memberIds).forEach(({ playerId, items, amount }) => {
    const contributions = memberContributionCopyLines(playerId, memberIds, complete, snapshot);
    if (!items.length && !contributions.length) return;
    lines.push("", `*${getPlayerName(playerId)}: ${currency(amount)}*`);
    items.forEach((item) => {
      const details = snapshot.items.get(item.itemKey);
      const label = details ? advanceDeductionLabel(details.item) : item.label;
      const credit = ledgerMoney(Number(details?.ownCreditApplied || 0) + Number(details?.groupCreditApplied || 0));
      const usageLine = complete ? `- ${label}: ${currency(item.amount)}` : advanceDeductionCopyLine({ ...item, label });
      lines.push(`${usageLine}${credit > 0 ? ` (${currency(credit)} Credit also applied)` : ""}`);
    });
    lines.push(...contributions);
  });
}

function buildPlayerLatestAdvanceSummaryCopy(playerId) {
  return withLedgerCoverageSnapshotCache(() => {
    const group = playerSingleAdvanceGroup(playerId);
    return group ? buildPaymentGroupAdvanceSummaryCopy(group.id) : buildPlayerLatestAdvanceCopy(playerId);
  });
}

function buildPlayerCompleteAdvanceSummaryCopy(playerId) {
  return withLedgerCoverageSnapshotCache(() => {
    const group = playerSingleAdvanceGroup(playerId);
    return group ? buildPaymentGroupAdvanceSummaryCopy(group.id, "complete") : buildPlayerCompleteAdvanceCopy(playerId);
  });
}

function playerSingleAdvanceGroup(playerId) {
  const groups = (state.paymentGroups || []).filter((group) => group.active !== false
    && paymentGroupPlayerIds(group).includes(playerId) && paymentGroupAdvancePlayerIds(group).length);
  return groups.length === 1 ? groups[0] : null;
}

function buildPlayerLatestAdvanceCopy(playerId) {
  const player = getPlayer(playerId);
  if (!player) return "Player not found.";
  const playerName = player.name || player.displayName || "Player";
  const cycles = playerAdvanceCycleSummaries(playerId);
  const summary = cycles[cycles.length - 1];
  if (!summary) return finishPaymentSummaryCopy([`*Latest Advance - ${playerName}*`, "No active Advance payments."]);
  const lines = [
    `*Latest Advance - ${playerName}*`,
    `Date: ${summary.date ? formatDate(summary.date) : "Date not set"}`,
    `Advance received: ${currency(summary.received)}`,
    `Deducted: ${currency(summary.deducted)}`,
    `*Balance: ${currency(summary.balance)}*`
  ];
  appendAdvanceUsageCopy(lines, summary.deductions, false, advanceSummaryMemberIds(playerId));
  return finishPaymentSummaryCopy(lines);
}

function buildPlayerCompleteAdvanceCopy(playerId) {
  const player = getPlayer(playerId);
  if (!player) return "Player not found.";
  const playerName = player.name || player.displayName || "Player";
  const cycles = playerAdvanceCycleSummaries(playerId);
  const summary = playerAdvanceAggregateSummary(playerId);
  const lines = [
    `*Complete Advance Summary - ${playerName}*`,
    `Total received: ${currency(summary.received)}`,
    `Total deducted: ${currency(summary.deducted)}`,
    `*Balance: ${currency(summary.balance)}*`
  ];
  if (!cycles.length) {
    lines.push("", "No active Advance payments.");
    return finishPaymentSummaryCopy(lines);
  }
  lines.push("", "*Advance deposits*");
  [...cycles].reverse().forEach((cycle) => {
    lines.push(
      "",
      `*${cycle.date ? formatDate(cycle.date) : "Date not set"} - ${currency(cycle.received)} received*`,
      `Deducted: ${currency(cycle.deducted)}`,
      `Balance: ${currency(cycle.balance)}`
    );
  });
  appendAdvanceUsageCopy(lines, cycles.flatMap((cycle) => cycle.deductions), true, advanceSummaryMemberIds(playerId));
  return finishPaymentSummaryCopy(lines);
}

const PAYMENT_SUMMARY_DISCLAIMER = "_Generated via AD Smashers Manager app._";
const PAYMENT_REMINDER_INSTRUCTIONS = "Please share the payment via Aani. If not available, DM me for A/C details.";

function finishPaymentSummaryCopy(lines) {
  return [...lines, "", PAYMENT_SUMMARY_DISCLAIMER].join("\n");
}

function finishPaymentReminderCopy(lines, amountDue) {
  return finishPaymentSummaryCopy(amountDue > 0 ? [...lines, "", PAYMENT_REMINDER_INSTRUCTIONS] : lines);
}

function coverageTotalsForPlayers(playerIds, snapshot = ledgerCoverageSnapshot()) {
  const totals = uniqueIds(playerIds || []).reduce(
    (result, playerId) => {
      const summary = snapshot.players.get(playerId);
      if (!summary) return result;
      result.rawOutstanding += Number(summary.rawOutstanding || 0);
      result.advanceApplied += Number(summary.advanceApplied || 0);
      result.groupAdvanceReceived += Number(summary.groupAdvanceReceived || 0);
      result.ownCreditApplied += Number(summary.ownCreditApplied || 0);
      result.groupCreditReceived += Number(summary.groupCreditReceived || 0);
      result.remainingAdvance += Number(summary.remainingAdvance || 0);
      result.remainingCredit += Number(summary.remainingCredit || 0);
      result.balance += Number(summary.balance || 0);
      return result;
    },
    { rawOutstanding: 0, advanceApplied: 0, groupAdvanceReceived: 0, ownCreditApplied: 0, groupCreditReceived: 0, remainingAdvance: 0, remainingCredit: 0, balance: 0 }
  );
  Object.keys(totals).forEach((key) => {
    totals[key] = ledgerMoney(totals[key]);
  });
  return totals;
}

function paymentSummaryCoverage(playerIds, snapshot = ledgerCoverageSnapshot()) {
  const totals = coverageTotalsForPlayers(playerIds, snapshot);
  return {
    ...totals,
    advanceTotal: ledgerMoney(totals.advanceApplied + totals.groupAdvanceReceived),
    creditTotal: ledgerMoney(totals.ownCreditApplied + totals.groupCreditReceived)
  };
}

function paymentSummaryItemLabel(item) {
  if (item?.type === "session") return `${item.session?.type || "Badminton"} session`;
  if (item?.type === "activity") return item.activity?.name || "Activity";
  return item?.label || "Payment item";
}

function playerPendingPaymentItems(playerId, snapshot = ledgerCoverageSnapshot()) {
  return (snapshot.ledgersByPlayer.get(playerId) || [])
    .map((details) => ({
      key: details.key,
      item: details.item,
      date: details.item?.date || "",
      amount: normalizedLedgerCoverageDetails(details, details.rawOutstanding).outstanding
    }))
    .filter((details) => details.amount > 0)
    .sort((a, b) => (
      String(b.date || "").localeCompare(String(a.date || ""))
      || paymentSummaryItemLabel(a.item).localeCompare(paymentSummaryItemLabel(b.item), undefined, { sensitivity: "base" })
      || String(a.key || "").localeCompare(String(b.key || ""))
    ));
}

function paymentSummaryPendingLine(details) {
  const date = details.date ? formatDate(details.date) : "Date not set";
  return `- ${date} - ${paymentSummaryItemLabel(details.item)}: ${currency(details.amount)}`;
}

function paymentReminderFunding(playerIds, snapshot, chargeItems) {
  const recipients = new Set(playerIds);
  const contributions = new Map();
  const allocations = [];
  const fundingKey = (type, payerId, sourceId) => JSON.stringify([type, payerId, sourceId]);
  snapshot.coverageSourcesByPlayer.forEach((sources, payerId) => sources.forEach((source) => {
    const type = source.type === "advance" ? "Advance" : "Credit";
    const activity = source.activityId ? state.activities.find((item) => item.id === source.activityId) : null;
    contributions.set(fundingKey(type, payerId, source.id), {
      type, payerId, date: source.date || "", description: activity?.name || "",
      available: recipients.has(payerId) ? ledgerMoney(source.remaining) : 0
    });
  }));
  snapshot.items.forEach((details) => {
    if (!recipients.has(details.playerId)) return;
    for (const [type, sources] of [["Advance", details.advanceSourceAllocations], ["Credit", details.creditSourceAllocations]]) {
      (sources || []).forEach((allocation) => {
        if (allocation.amount <= 0) return;
        const sourceKey = fundingKey(type, allocation.payerId, allocation.sourceId);
        allocations.push({ itemKey: details.key, sourceKey, amount: allocation.amount, date: contributions.get(sourceKey)?.date || "" });
      });
    }
  });
  // Attribute only current recorded settlements; a receipt's unused Credit is not a second payment.
  const settlements = new Map(chargeItems.flatMap((item) => item.charges.map((charge) => [charge.key, {
    playerId: charge.playerId, date: item.date || "", remaining: Math.max(0, ledgerMoney(charge.amount - charge.outstanding))
  }])));
  chargeItems.forEach((item) => item.charges.filter((charge) => charge.directActivityPaid > 0).forEach((charge) => {
    const source = snapshot.coverageSourcesByPlayer.get(charge.playerId)?.find((row) => row.activityId === item.activityId && row.type === "advance");
    const sourceKey = source ? fundingKey("Advance", charge.playerId, source.id) : `activity-payment:${item.activityId}:${charge.playerId}`;
    if (!source) contributions.set(sourceKey, {
      type: "Activity payment", payerId: charge.playerId, date: item.date || "", description: item.label, available: 0
    });
    allocations.push({ itemKey: charge.key, sourceKey, amount: charge.directActivityPaid, date: item.date || "" });
    const settlement = settlements.get(charge.key);
    settlement.remaining = ledgerMoney(settlement.remaining - charge.directActivityPaid);
  }));
  paymentReceiptTransactions(state.paymentTransactions).forEach((transaction) => {
    let amount = 0;
    (transaction.allocations || []).forEach((allocation) => {
      if (!["session", "activity"].includes(allocation.type)) return;
      const id = allocation.type === "session" ? allocation.sessionId : allocation.activityId;
      const settlement = settlements.get(`${allocation.type}:${id}:${allocation.playerId}`);
      if (!settlement) return;
      const applied = Math.min(settlement.remaining, Math.max(0, Number(allocation.amount || 0)));
      if (applied <= 0) return;
      settlement.remaining = ledgerMoney(settlement.remaining - applied);
      amount = ledgerMoney(amount + applied);
      allocations.push({ itemKey: `${allocation.type}:${id}:${allocation.playerId}`, sourceKey: `payment:${transaction.id}`, amount: applied, date: transaction.date || settlement.date });
    });
    if (amount > 0) contributions.set(`payment:${transaction.id}`, {
      type: "Payment", payerId: transaction.paidById, date: transaction.date || "", available: 0
    });
  });
  settlements.forEach(({ playerId, date, remaining }, itemKey) => {
    if (remaining <= 0) return;
    const key = `settlement:${playerId}`;
    contributions.set(key, { type: "Recorded settlement", playerId, date: "", available: 0 });
    allocations.push({ itemKey, sourceKey: key, date, amount: remaining });
  });
  return { contributions, allocations };
}

function paymentReminderPeriod(chargeItems, funding) {
  const charges = new Map();
  const events = new Map();
  const eventOn = (date) => {
    if (!events.has(date)) events.set(date, { charged: 0, settled: 0 });
    return events.get(date);
  };
  chargeItems.forEach((item) => item.charges.forEach((charge) => {
    charges.set(charge.key, { ...charge, date: item.date || "" });
    eventOn(item.date || "").charged += charge.amount;
  }));
  funding.allocations.forEach((allocation) => {
    const charge = charges.get(allocation.itemKey);
    if (!charge) return;
    // A payment cannot clear a charge before it exists. Batch same-day items together.
    eventOn(allocation.date > charge.date ? allocation.date : charge.date).settled += allocation.amount;
  });
  let outstanding = 0;
  let startDate = "";
  [...events].sort(([a], [b]) => a.localeCompare(b)).forEach(([date, event]) => {
    if (outstanding === 0 && event.charged > 0) startDate = date;
    outstanding = Math.max(0, ledgerMoney(outstanding + event.charged - event.settled));
  });
  const items = chargeItems.filter((item) => !startDate || String(item.date || "") >= startDate);
  const itemKeys = new Set(items.flatMap((item) => item.charges.map((charge) => charge.key)));
  const amounts = new Map();
  funding.allocations.filter((allocation) => itemKeys.has(allocation.itemKey)).forEach((allocation) => {
    amounts.set(allocation.sourceKey, ledgerMoney((amounts.get(allocation.sourceKey) || 0) + allocation.amount));
  });
  const contributions = [...funding.contributions].map(([key, row]) => ({
    ...row, amount: ledgerMoney((amounts.get(key) || 0) + row.available),
    carriedForward: ["Advance", "Credit"].includes(row.type) && startDate && (!row.date || row.date < startDate)
  })).filter((row) => row.amount > 0).sort((a, b) => a.date.localeCompare(b.date)
    || getPlayerName(a.payerId || a.playerId).localeCompare(getPlayerName(b.payerId || b.playerId)) || a.type.localeCompare(b.type));
  return { items, contributions, startDate };
}

function buildPaymentDueStatementCopy(name, playerIds, snapshot, memberNames = "") {
  const chargeItems = paymentSummaryChargeItems(playerIds, { includeDirectActivityPayments: true });
  const { items, contributions, startDate } = paymentReminderPeriod(chargeItems, paymentReminderFunding(playerIds, snapshot, chargeItems));
  const totalContributions = ledgerMoney(contributions.reduce((sum, row) => sum + row.amount, 0));
  const totalUsed = ledgerMoney(items.reduce((sum, item) => sum + item.charges.reduce((subtotal, charge) => subtotal + charge.amount, 0), 0));
  const coverage = paymentSummaryCoverage(playerIds, snapshot);
  const due = coverage.balance;
  const lines = [`*Payment Reminder - ${name}*`];
  if (memberNames) lines.push(`Members: ${memberNames}`);
  if (startDate) lines.push(`From: ${formatDate(startDate)}`);
  lines.push("", "*Contributions*");
  if (!contributions.length) lines.push("No contributions for this period.");
  contributions.forEach((row) => {
    const date = row.date ? `${formatDate(row.date)} - ` : "";
    const description = row.description ? ` - ${row.description}` : "";
    const owner = row.payerId ? getPlayerName(row.payerId) : `For ${getPlayerName(row.playerId)}`;
    lines.push(`- ${date}${owner}${description} (${row.type}${row.carriedForward ? " carried forward" : ""}): ${currency(row.amount)}`);
  });
  lines.push("", `*Total Contributions: ${currency(totalContributions)}*`, "", "*Usage by member*");
  playerIds.forEach((playerId) => {
    let total = 0;
    lines.push("", `*${getPlayerName(playerId)}*`);
    const usage = items.flatMap((item) => item.charges.filter((charge) => charge.playerId === playerId && charge.amount > 0)
      .map((charge) => ({ item, charge })));
    if (!usage.length) lines.push("No chargeable usage.");
    usage.forEach(({ item, charge }) => {
      total = ledgerMoney(total + charge.amount);
      const context = charge.units > 1 ? ` (${charge.units} chargeable places, including guests)`
        : charge.allocatedAmount !== undefined && charge.allocatedAmount !== charge.amount ? " (net payable to organizer)" : "";
      lines.push(`- ${item.date ? formatDate(item.date) : "Date not set"} ${item.label}: ${currency(charge.amount)}${context}`);
    });
    lines.push(`*${getPlayerName(playerId)} total: ${currency(total)}*`);
  });
  lines.push("", `*Total Used: ${currency(totalUsed)}*`);
  if (due > 0 || (coverage.remainingCredit <= 0 && coverage.remainingAdvance <= 0)) lines.push(`*Amount Due: ${currency(due)}*`);
  if (coverage.remainingCredit > 0) lines.push(`*Credit Remaining: ${currency(coverage.remainingCredit)}*`);
  if (coverage.remainingAdvance > 0) lines.push(`*Remaining Advance: ${currency(coverage.remainingAdvance)}*`);
  return finishPaymentReminderCopy(lines, due);
}

function appendPaymentSummaryOverview(lines, coverage, { includeAvailable = false, dueLabel = "Amount due" } = {}) {
  if (coverage.advanceTotal > 0 || coverage.creditTotal > 0) {
    lines.push(`Due before adjustments: ${currency(coverage.rawOutstanding)}`);
  }
  if (coverage.advanceTotal > 0) lines.push(`Advance applied: ${currency(coverage.advanceTotal)}`);
  if (coverage.creditTotal > 0) lines.push(`Credit applied: ${currency(coverage.creditTotal)}`);
  lines.push(coverage.balance > 0 ? `*${dueLabel}: ${currency(coverage.balance)}*` : "*Status: Clear*");
  if (includeAvailable && coverage.remainingAdvance > 0) lines.push(`Advance available: ${currency(coverage.remainingAdvance)}`);
  if (includeAvailable && coverage.remainingCredit > 0) lines.push(`Credit available: ${currency(coverage.remainingCredit)}`);
}

function paymentReceiptTransactions(transactions = []) {
  return [...transactions]
    .filter((transaction) => paymentTransactionIsUserReceipt(transaction) && paymentTransactionIsActive(transaction) && Number(transaction.amountPaid || 0) > 0)
    .sort((a, b) => (
      String(a.date || "").localeCompare(String(b.date || ""))
      || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
    ));
}

function paymentTransactionAppliedForPlayer(transaction, playerId) {
  return ledgerMoney(
    (transaction?.allocations || [])
      .filter((allocation) => (
        allocation.playerId === playerId
        && (allocation.type === "session" || allocation.type === "activity")
      ))
      .reduce((total, allocation) => total + Number(allocation.amount || 0), 0)
  );
}

function paymentReceiptDetails(transaction) {
  const details = [];
  if (Number(transaction?.appliedAmount || 0) > 0) details.push(`${currency(transaction.appliedAmount)} applied`);
  if (Number(transaction?.advanceAmount || 0) > 0) details.push(`${currency(transaction.advanceAmount)} Credit created`);
  return details.length ? ` (${details.join("; ")})` : "";
}

function playerPaymentReceiptCopyLine(transaction, playerId) {
  const payerName = getPlayerName(transaction.paidById);
  const playerName = getPlayerName(playerId);
  const date = transaction.date ? formatDate(transaction.date) : "Date not set";
  if (transaction.type === "advance-payment") {
    return transaction.paidById === playerId
      ? `- ${date} - ${payerName} paid ${currency(transaction.amountPaid)} as Advance`
      : "";
  }
  if (transaction.type === "group-payment" && transaction.paidById !== playerId) {
    const playerAmount = paymentTransactionAppliedForPlayer(transaction, playerId);
    if (playerAmount <= 0) return "";
    const group = getPaymentGroup(transaction.groupId);
    return `- ${date} - ${payerName} paid ${currency(playerAmount)} for ${playerName} via ${group?.name || "Payment Group"}`;
  }
  if (transaction.paidById !== playerId) return "";
  const group = transaction.type === "group-payment" ? getPaymentGroup(transaction.groupId) : null;
  return `- ${date} - ${payerName} paid ${currency(transaction.amountPaid)}${group ? ` to ${group.name || "Payment Group"}` : ""}${paymentReceiptDetails(transaction)}`;
}

function playerPaymentReceiptCopyLines(playerId) {
  return paymentReceiptTransactions(playerPaymentTransactions(playerId))
    .map((transaction) => playerPaymentReceiptCopyLine(transaction, playerId))
    .filter(Boolean);
}

function paymentGroupReceiptCopyLines(groupId) {
  const memberIds = new Set(paymentGroupPlayerIds(getPaymentGroup(groupId)));
  return paymentReceiptTransactions(state.paymentTransactions || [])
    .filter((transaction) => transaction.type !== "advance-payment")
    .flatMap((transaction) => {
      const allocations = transaction.allocations || [];
      const memberAmount = ledgerMoney(allocations
        .filter((allocation) => memberIds.has(allocation.playerId) && ["session", "activity", "advance"].includes(allocation.type))
        .reduce((total, allocation) => total + Number(allocation.amount || 0), 0));
      const unallocatedReceipt = transaction.groupId === groupId && !allocations.length;
      const amount = unallocatedReceipt ? Number(transaction.amountPaid) : Math.min(Number(transaction.amountPaid), memberAmount);
      if (amount <= 0) return [];
      const date = transaction.date ? formatDate(transaction.date) : "Date not set";
      const scope = unallocatedReceipt ? " (allocation details unavailable)"
        : amount < Number(transaction.amountPaid) ? ` for these members (full receipt: ${currency(transaction.amountPaid)})` : "";
      return [`- ${date} - ${getPlayerName(transaction.paidById)} paid ${currency(amount)}${scope}`];
    });
}

function appendPaymentsFromStart(lines, paymentLines) {
  lines.push("", "*Payments from the start*");
  lines.push(...(paymentLines.length ? paymentLines : ["No recorded payments."]));
}

function buildPlayerCurrentPaymentCopy(playerId, type = "summary") {
  const player = getPlayer(playerId);
  if (!player) return "Player not found.";
  const playerName = player.name || player.displayName || "Player";
  const snapshot = ledgerCoverageSnapshot();
  if (type === "reminder") return buildPaymentDueStatementCopy(playerName, [playerId], snapshot);
  const coverage = paymentSummaryCoverage([playerId], snapshot);
  const pendingItems = playerPendingPaymentItems(playerId, snapshot);
  const title = type === "reminder" ? "Payment Reminder" : "Payment Summary";
  const lines = [`*${title} - ${playerName}*`];
  if (type === "summary") {
    appendPaymentsFromStart(lines, playerPaymentReceiptCopyLines(playerId));
    lines.push("", "*Current dues*");
  }
  appendPaymentSummaryOverview(lines, coverage, { includeAvailable: type === "summary" });
  lines.push("", "*Pending items*");
  lines.push(...(pendingItems.length ? pendingItems.map(paymentSummaryPendingLine) : ["No pending items."]));
  return finishPaymentSummaryCopy(lines);
}

function paymentGroupSummaryPlayerIds(group) {
  return paymentGroupPlayerIds(group).sort((a, b) => {
    if (a === group.payerId) return -1;
    if (b === group.payerId) return 1;
    return 0;
  });
}

function paymentGroupChargeItems(group) {
  return paymentSummaryChargeItems(paymentGroupSummaryPlayerIds(group));
}

function paymentSummaryChargeItems(memberIds, { includeDirectActivityPayments = false } = {}) {
  const items = [];
  sortSessions().filter(sessionIsCollectible).forEach((session) => {
    const charges = memberIds.flatMap((playerId) => {
      const payment = session.payments?.[playerId];
      if (!payment) return [];
      return [{ playerId, key: paymentLedgerKey(session, payment), outstanding: ledgerMoney(paymentOutstanding(payment, session)), amount: ledgerMoney(payment.amount ?? sessionPaymentAmount(session, playerId)), units: Number(payment.chargeableUnits ?? sessionPaymentChargeableUnits(session, playerId)) }];
    });
    if (charges.length) items.push({ date: session.date, label: `${session.type || "Badminton"} session`, rate: ledgerMoney(session.perPersonAmount), charges });
  });
  (state.activities || []).filter((activity) => !activityIsShuttle(activity)).forEach((activity) => {
    const charges = memberIds.flatMap((playerId) => {
      const share = activity.shares?.[playerId];
      if (!share) return [];
      const allocatedAmount = activityAllocatedAmount(activity, playerId);
      const directActivityPaid = includeDirectActivityPayments
        ? Math.max(0, ledgerMoney(Math.min(activityContributionAmount(activity, playerId), allocatedAmount - Number(share.amount || 0)))) : 0;
      return [{ playerId, key: shareLedgerKey(activity, share), outstanding: ledgerMoney(shareOutstanding(share)), amount: ledgerMoney(Number(share.amount || 0) + directActivityPaid), allocatedAmount, directActivityPaid }];
    });
    if (charges.length) items.push({ activityId: activity.id, date: activity.date, label: activity.name || "Activity", charges });
  });
  return items.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.label.localeCompare(b.label));
}

function appendPaymentGroupCharges(lines, items) {
  lines.push("", "*Per-person charges*");
  if (!items.length) lines.push("No chargeable items.");
  items.forEach((item) => {
    const rate = item.rate === undefined ? "" : ` - ${currency(item.rate)} per player`;
    lines.push(``, `*${item.date ? formatDate(item.date) : "Date not set"} - ${item.label}${rate}*`);
    item.charges.forEach((charge) => {
      let detail = "";
      if (charge.units > 1) detail = ` (${charge.units} chargeable places, including guests)`;
      if (charge.allocatedAmount !== undefined && charge.allocatedAmount !== charge.amount) {
        detail = ` (${currency(charge.allocatedAmount)} split share; ${currency(charge.amount)} payable to organizer)`;
      }
      lines.push(`- ${getPlayerName(charge.playerId)}: ${currency(charge.amount)}${detail}`);
    });
  });
}

function buildPaymentGroupFullSummaryCopy(group, snapshot) {
  const playerIds = paymentGroupSummaryPlayerIds(group);
  const coverage = paymentSummaryCoverage(playerIds, snapshot);
  const items = paymentGroupChargeItems(group);
  const total = ledgerMoney(items.reduce((sum, item) => sum + item.charges.reduce((subtotal, charge) => subtotal + charge.amount, 0), 0));
  const settled = Math.max(0, ledgerMoney(total - coverage.rawOutstanding));
  const lines = [`*Payment Summary - ${group.name || "Payment Group"}*`, `Members: ${paymentGroupMemberNames(group)}`];
  appendPaymentGroupCharges(lines, items);
  lines.push("", `*Total charges: ${currency(total)}*`);
  if (items.some((item) => item.rate === undefined)) lines.push("Activity charges are net amounts payable to the organizer.");
  const receipts = paymentGroupReceiptCopyLines(group.id);
  lines.push("", "*Payments received*", ...(receipts.length ? receipts : ["No recorded payment receipts."]));
  lines.push(`Payments / settlements applied: ${currency(settled)}`);
  if (coverage.advanceTotal > 0) lines.push(`Advance applied: ${currency(coverage.advanceTotal)}`);
  if (coverage.creditTotal > 0) lines.push(`Credit applied: ${currency(coverage.creditTotal)}`);
  lines.push("", `*Remaining due: ${currency(coverage.balance)}*`);
  playerIds.forEach((playerId) => {
    const member = snapshot.players.get(playerId);
    if (member?.remainingAdvance > 0) lines.push(`${getPlayerName(playerId)} - Advance remaining: ${currency(member.remainingAdvance)}`);
    if (member?.remainingCredit > 0) lines.push(`${getPlayerName(playerId)} - Credit remaining: ${currency(member.remainingCredit)}`);
  });
  return finishPaymentSummaryCopy(lines);
}

function paymentGroupAdvancePlayerIds(group) {
  return paymentGroupSummaryPlayerIds(group).filter((playerId) => playerAdvanceAccountSources(playerId).length > 0);
}

function buildPaymentGroupAdvanceSummaryCopy(groupId, mode = "latest") {
  const group = getPaymentGroup(groupId);
  if (!group) return "Payment group not found.";
  return withLedgerCoverageSnapshotCache(() => {
    const complete = mode === "complete";
    const lines = [`*${complete ? "Complete Group Advance Summary" : "Group Advance Summary"} - ${group.name || "Payment Group"}*`, `Members: ${paymentGroupMemberNames(group)}`];
    const snapshot = ledgerCoverageSnapshot();
    const members = paymentGroupSummaryPlayerIds(group);
    const accounts = paymentGroupAdvancePlayerIds(group).map((playerId) => ({ playerId, cycles: playerAdvanceCycleSummaries(playerId) }));
    if (!accounts.length) return finishPaymentSummaryCopy([...lines, "No active Advance payments for these members."]);
    const latestDepositDates = accounts.flatMap(({ cycles }) => cycles.filter((cycle) => cycle.sourceType === "advance-payment").slice(-1).map((cycle) => cycle.date)).filter(Boolean);
    const openCycleDates = accounts.flatMap(({ cycles }) => cycles.filter((cycle) => cycle.balance > 0).map((cycle) => cycle.cycleStartDate)).filter(Boolean);
    const sharedCutoff = (openCycleDates.length ? openCycleDates : latestDepositDates).sort()[0] || "";
    const cycles = accounts.flatMap(({ playerId, cycles }) => {
      const latestDeposit = cycles.filter((cycle) => cycle.sourceType === "advance-payment").at(-1);
      const cutoff = latestDeposit?.date || sharedCutoff;
      return cycles.filter((cycle) => complete || (cycle.sourceType === "advance-payment"
        ? cycle.id === latestDeposit?.id : !cutoff || cycle.date >= cutoff))
        .map((cycle) => ({ ...cycle, playerId }));
    }).sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
      || Number(b.sourceType === "advance-payment") - Number(a.sourceType === "advance-payment")
      || String(a.transaction?.createdAt || "").localeCompare(String(b.transaction?.createdAt || "")));
    const totalReceived = ledgerMoney(cycles.reduce((sum, cycle) => sum + cycle.received, 0));
    const totalUsed = ledgerMoney(cycles.reduce((sum, cycle) => sum + cycle.deducted, 0));
    const selectedBalance = ledgerMoney(cycles.reduce((sum, cycle) => sum + cycle.balance, 0));
    const currentBalance = ledgerMoney(accounts.reduce((sum, account) => sum + account.cycles.reduce((subtotal, cycle) => subtotal + cycle.balance, 0), 0));
    lines.push("", "*Contributions*");
    cycles.forEach((cycle) => {
      const activity = state.activities.find((item) => item.id === cycle.activityId);
      const label = activity ? ` paid for ${activity.name || "Activity"}` : "";
      lines.push(`- ${cycle.date ? formatDate(cycle.date) : "Date not set"} - ${getPlayerName(cycle.playerId)}${label}: ${currency(cycle.received)}`);
    });
    lines.push("", `*Total Advance: ${currency(totalReceived)}*`, "", "*Usage by member*");
    advanceUsageByMember(cycles.flatMap((cycle) => cycle.deductions), members).forEach(({ playerId, items, amount }) => {
      const scope = members.includes(playerId) ? "" : " (outside this group)";
      lines.push("", `*${getPlayerName(playerId)}${scope}*`);
      if (!items.length) lines.push("No usage from these advances.");
      items.forEach((item) => {
        const details = snapshot.items.get(item.itemKey);
        const allAdvances = ledgerMoney(Number(details?.advanceApplied || 0) + Number(details?.groupAdvanceApplied || 0));
        const otherAdvances = Math.max(0, ledgerMoney(allAdvances - item.amount));
        const context = otherAdvances > 0 ? ` from these advances (${currency(otherAdvances)} from other advances; ${currency(allAdvances)} covered in total)` : "";
        const label = details ? advanceDeductionLabel(details.item) : item.label.replace(` - ${getPlayerName(playerId)}`, "");
        lines.push(`- ${label}: ${currency(item.amount)}${context}`);
      });
      lines.push(`*${getPlayerName(playerId)} total: ${currency(amount)}*`);
    });
    lines.push("", `*Total Used: ${currency(totalUsed)}*`);
    if (!complete && currentBalance > selectedBalance) {
      lines.push(`Balance from these advances: ${currency(selectedBalance)}`, `Earlier advance balance: ${currency(ledgerMoney(currentBalance - selectedBalance))}`);
    }
    lines.push(`*Remaining Advance: ${currency(currentBalance)}*`, `*Amount Due: ${currency(paymentSummaryCoverage(members, snapshot).balance)}*`);
    return finishPaymentSummaryCopy(lines);
  });
}

function buildPaymentGroupCurrentCopy(groupId = "", type = "summary") {
  const group = getPaymentGroup(groupId);
  if (!group) return "Payment group not found.";
  const snapshot = ledgerCoverageSnapshot();
  if (type === "summary") return buildPaymentGroupFullSummaryCopy(group, snapshot);
  const playerIds = paymentGroupSummaryPlayerIds(group);
  return buildPaymentDueStatementCopy(group.name || "Payment Group", playerIds, snapshot, paymentGroupMemberNames(group));
}

function buildPlayerPaymentSummaryCopy(playerId) {
  return buildPlayerCurrentPaymentCopy(playerId, "summary");
}

function buildPlayerPaymentReminderCopy(playerId) {
  return withLedgerCoverageSnapshotCache(() => buildPlayerCurrentPaymentCopy(playerId, "reminder"));
}

function buildPaymentGroupSummaryCopy(groupId = "") {
  return withLedgerCoverageSnapshotCache(() => buildPaymentGroupCurrentCopy(groupId, "summary"));
}

function buildPaymentGroupReminderCopy(groupId = "") {
  return withLedgerCoverageSnapshotCache(() => buildPaymentGroupCurrentCopy(groupId, "reminder"));
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
    const aAvailable = ledgerMoney(playerRemainingAdvance(a.id) + playerRemainingCredit(a.id));
    const bAvailable = ledgerMoney(playerRemainingAdvance(b.id) + playerRemainingCredit(b.id));
    const aHasAvailable = aAvailable > 0;
    const bHasAvailable = bAvailable > 0;
    if (!aDue && aHasAvailable !== bHasAvailable) return aHasAvailable ? -1 : 1;
    if (!aDue && aAvailable !== bAvailable) return bAvailable - aAvailable;
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

function paymentGroupAdvanceApplied(group) {
  return paymentGroupCoverageSummary(group).advanceApplied;
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
    advanceApplied: 0,
    creditApplied: 0,
    balance,
    payerAdvanceBefore: Number(group?.payerId ? playerRemainingAdvance(group.payerId) : 0),
    payerAdvanceAfter: Number(group?.payerId ? playerRemainingAdvance(group.payerId) : 0),
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

function reversePaymentTransaction(transactionId) {
  const transaction = (state.paymentTransactions || []).find((item) => item.id === transactionId);
  if (!paymentTransactionCanBeReversed(transaction)) return false;
  if (!(transaction.type === "advance-payment" && transaction.separateAdvance === true)) {
    [...(transaction.allocations || [])].reverse().forEach((allocation) => reversePaymentAllocation(allocation));
  }
  transaction.status = "reversed";
  transaction.reversedAt = new Date().toISOString();
  syncSessionStages();
  return true;
}

function deleteReversedPaymentTransaction(transactionId) {
  const transactionIndex = (state.paymentTransactions || []).findIndex((item) => item.id === transactionId);
  if (transactionIndex < 0) return false;
  const transaction = state.paymentTransactions[transactionIndex];
  if (!paymentTransactionCanBePurged(transaction)) return false;
  state.paymentTransactions.splice(transactionIndex, 1);
  return true;
}

function deleteActivePaymentTransaction(transactionId) {
  const transaction = (state.paymentTransactions || []).find((item) => item.id === transactionId);
  if (!paymentTransactionCanBeReversed(transaction)) return false;
  if (!reversePaymentTransaction(transactionId)) return false;
  return deleteReversedPaymentTransaction(transactionId);
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
