function renderDashboard() {
  const data = buildDashboardData();
  if (!data.allSessions.length) {
    return renderSetupDashboard();
  }
  return `
    <section class="page dashboard-page">
      <div class="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p class="page-kicker">Operational visibility from sessions, payments, courts, and player activity.</p>
          <div class="page-actions dashboard-range-actions">
            ${renderDashboardRangeControl(data.range)}
          </div>
        </div>
      </div>

      <div class="dashboard-kpi-grid analytics-kpi-grid">
        ${renderDashboardNextSession(data)}
        ${renderDashboardChartCard(
          "Collection Status",
          "Cash, Advance, Credit, and outstanding dues from the canonical ledger.",
          renderDashboardCollectionChart(data),
          "dashboard-collection-status-card"
        )}
      </div>

      ${renderDashboardFinancePanel(data)}

      <div class="dashboard-chart-grid">
        ${renderDashboardChartCard(
          "Attendance Trend",
          `${data.rangeLabel} past session capacity and voted players.`,
          renderDashboardTrendChart(data.pastRangeSummaries)
        )}
        ${renderDashboardChartCard(
          "Court Spend by Venue",
          dashboardCourtSpendSubtitle(data.range),
          renderDashboardHorizontalBars(data.courtSpend, { valueKey: "amount", detailKey: "detail", tone: "teal", empty: "No court spend in this range." })
        )}
        ${renderDashboardChartCard(
          "Session Pipeline",
          "All sessions, including future sessions, based on the session cards.",
          renderDashboardPipeline(data.stageBreakdown)
        )}
      </div>

      ${renderDashboardPlayerPanel(data)}
    </section>
  `;
}

function dashboardRangeConfig() {
  return DASHBOARD_RANGES.find((range) => range.id === uiState.dashboardRange) || DASHBOARD_RANGES.find((range) => range.id === "90");
}

function dashboardRangeStart(range) {
  if (!range?.days) return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - range.days + 1);
  return date.getTime();
}

function dashboardDateTime(value) {
  return new Date(`${value || ""}T12:00:00`).getTime();
}

function dashboardMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function dashboardSessionsForRange(sessions, range) {
  const start = dashboardRangeStart(range);
  if (!start) return sessions;
  return sessions.filter((session) => dashboardDateTime(session.date) >= start);
}

function dashboardActivitiesForRange(activities, range) {
  const start = dashboardRangeStart(range);
  if (!start) return activities;
  return activities.filter((activity) => dashboardDateTime(activity.date) >= start);
}

function dashboardRangeLabel(range) {
  return range.id === "all" ? "All past" : `Last ${range.label}`;
}

function buildDashboardData() {
  const allSessions = sortSessions();
  const pastSessions = allSessions.filter((session) => sessionIsCollectible(session));
  const range = dashboardRangeConfig();
  const rangeAllSessions = dashboardSessionsForRange(allSessions, range);
  const rangeSessions = dashboardSessionsForRange(pastSessions, range);
  const rangeActivities = dashboardActivitiesForRange(state.activities || [], range);
  const rangeAllSummaries = rangeAllSessions.map(dashboardSessionSummary);
  const rangeSummaries = rangeSessions.map(dashboardSessionSummary);
  const pastRangeSessions = rangeSessions.filter(dashboardFinanceSessionIsBillable);
  const pastRangeSummaries = pastRangeSessions.map(dashboardSessionSummary);
  const allSummaries = allSessions.map(dashboardSessionSummary);
  const upcoming = allSessions.filter((session) => !sessionIsCollectible(session));
  const nextSession = upcoming[0] || allSessions[allSessions.length - 1] || null;
  const nextSummary = nextSession ? dashboardSessionSummary(nextSession) : null;
  const paymentTotals = dashboardPaymentTotals(pastRangeSessions);
  const activityTotals = dashboardActivityTotals(rangeActivities);
  const activePlayers = activePlayersAlphabetical();
  const advanceTotal = dashboardMoney(activePlayers.reduce((total, player) => total + playerRemainingAdvance(player.id), 0));
  const creditTotal = dashboardMoney(activePlayers.reduce((total, player) => total + playerRemainingCredit(player.id), 0));
  const cashCollected = dashboardMoney(paymentTotals.cashApplied + activityTotals.cashApplied);
  const advanceApplied = dashboardMoney(paymentTotals.advanceApplied + activityTotals.advanceApplied);
  const creditApplied = dashboardMoney(paymentTotals.creditApplied + activityTotals.creditApplied);
  const financeSnapshot = dashboardFinanceSnapshot(rangeAllSessions, rangeActivities);
  return {
    range,
    rangeLabel: dashboardRangeLabel(range),
    allSessions,
    pastSessions,
    rangeAllSessions,
    rangeSessions,
    rangeAllSummaries,
    rangeSummaries,
    pastRangeSessions,
    pastRangeSummaries,
    allSummaries,
    upcoming,
    nextSession,
    nextSummary,
    paymentTotals,
    activityTotals,
    advanceTotal,
    creditTotal,
    cashCollected,
    advanceApplied,
    creditApplied,
    financeSnapshot,
    courtSpend: dashboardCourtSpend(rangeAllSummaries),
    stageBreakdown: dashboardStageBreakdown(allSessions),
    attendanceLeaders: dashboardAttendanceLeaders(pastRangeSessions),
    skillMix: dashboardSkillMix()
  };
}

function dashboardCourtSpendSubtitle(range) {
  if (range?.id === "all") return "All saved session court fees, including future sessions.";
  return `Last ${range?.label || "90D"} plus future session court fees from saved sessions.`;
}

function dashboardSessionSummary(session) {
  const stats = sessionStats(session);
  const court = getCourt(session.courtId);
  const payments = Object.values(session.payments || {});
  const paid = payments.reduce((total, payment) => total + paymentCollectedAmount(session, payment), 0);
  const pendingAmount = stats.pendingAmount;
  const capacity = Number(stats.capacity || 0);
  const confirmed = Number(stats.confirmedCount || 0);
  return {
    session,
    stats,
    court,
    dateTime: dashboardDateTime(session.date),
    capacity,
    confirmed,
    waiting: stats.waiting.length,
    racketCount: stats.racketCount,
    utilization: capacity ? confirmed / capacity : 0,
    courtFee: Number(session.totalPaid || 0),
    paid,
    pendingAmount,
    pendingCount: stats.pendingCount,
    paymentCount: payments.length
  };
}

function dashboardPaymentTotals(sessions) {
  return sessions.reduce(
    (totals, session) => {
      Object.values(session.payments || {}).forEach((payment) => {
        const coverage = paymentCoverageDetails(session, payment);
        const due = paymentDueAmount(payment, session);
        const cashApplied = Math.min(due, Number(payment.paidAmount || 0));
        totals.due = dashboardMoney(totals.due + due);
        totals.cashApplied = dashboardMoney(totals.cashApplied + cashApplied);
        totals.advanceApplied = dashboardMoney(totals.advanceApplied + coverage.advanceApplied + coverage.groupAdvanceApplied);
        totals.creditApplied = dashboardMoney(totals.creditApplied + coverage.ownCreditApplied + coverage.groupCreditApplied);
        totals.covered = dashboardMoney(totals.covered + Math.min(due, cashApplied + coverage.applied));
        totals.outstanding = dashboardMoney(totals.outstanding + paymentOutstandingAfterCoverage(payment, session));
      });
      return totals;
    },
    { due: 0, cashApplied: 0, advanceApplied: 0, creditApplied: 0, covered: 0, outstanding: 0 }
  );
}

function dashboardActivityTotals(activities = state.activities || []) {
  return activities.reduce(
    (totals, activity) => {
      if (dashboardActivityIsShuttle(activity)) return totals;
      totals.spent = dashboardMoney(totals.spent + Number(activity.totalPaid || 0));
      Object.values(activity.shares || {}).forEach((share) => {
        if (share.paidBySelf) return;
        const due = Number(share.amount || 0);
        const cashApplied = Math.min(due, Number(share.paidAmount || 0));
        const coverage = shareCoverageDetails(activity, share);
        totals.due = dashboardMoney(totals.due + due);
        totals.cashApplied = dashboardMoney(totals.cashApplied + cashApplied);
        totals.advanceApplied = dashboardMoney(totals.advanceApplied + coverage.advanceApplied + coverage.groupAdvanceApplied);
        totals.creditApplied = dashboardMoney(totals.creditApplied + coverage.ownCreditApplied + coverage.groupCreditApplied);
        totals.covered = dashboardMoney(totals.covered + Math.min(due, cashApplied + coverage.applied));
        totals.outstanding = dashboardMoney(totals.outstanding + shareOutstandingAfterCoverage(activity, share));
      });
      return totals;
    },
    { spent: 0, due: 0, cashApplied: 0, advanceApplied: 0, creditApplied: 0, covered: 0, outstanding: 0 }
  );
}

function dashboardActivityIsShuttle(activity) {
  return activityIsShuttle(activity);
}

function dashboardFinanceSessionIsBillable(session) {
  const stage = normalizeStage(session.stage);
  return sessionIsCollectible(session) && (stage === "Completed" || stage === "Payment Collection" || (stage === "Player List Published" && sessionHasEnded(session)));
}

function dashboardFinancePlayerIds(session) {
  return uniqueIds(effectiveAttendedPlayerIds(session));
}

function dashboardSessionShuttleFee(session) {
  const amount = Number(session?.shuttleCost ?? state.settings.defaultShuttleCost ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function dashboardSessionWaterCost(session) {
  const amount = Number(session?.waterCost || 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function dashboardPaymentChargeableUnits(payment, session) {
  const storedUnits = Number(payment?.chargeableUnits);
  if (Number.isFinite(storedUnits) && storedUnits >= 0) return storedUnits;
  const due = paymentDueAmount(payment, session);
  const perPerson = Number(session?.perPersonAmount || 0);
  if (perPerson > 0) return Math.max(0, Math.round(due / perPerson));
  return due > 0 ? 1 : 0;
}

function dashboardSessionChargeableUnits(session) {
  return paymentPlayerIds(session).reduce((total, playerId) => total + sessionPaymentChargeableUnits(session, playerId), 0);
}

function dashboardSessionChargedTotals(session) {
  const units = dashboardSessionChargeableUnits(session);
  const perPerson = Math.max(0, Number(session?.perPersonAmount || 0));
  const total = Number((perPerson * units).toFixed(2));
  const shuttle = Math.min(total, Number((dashboardSessionShuttleFee(session) * units).toFixed(2)));
  return {
    court: Math.max(0, Number((total - shuttle).toFixed(2))),
    shuttle,
    total,
    units
  };
}

function dashboardPaymentShuttleAmount(session, payment) {
  const shuttleFee = dashboardSessionShuttleFee(session);
  const due = paymentDueAmount(payment, session);
  if (shuttleFee <= 0 || due <= 0) return 0;
  return Math.min(due, Number((shuttleFee * dashboardPaymentChargeableUnits(payment, session)).toFixed(2)));
}

function dashboardPaymentCourtAmount(session, payment) {
  return Math.max(0, Number((paymentDueAmount(payment, session) - dashboardPaymentShuttleAmount(session, payment)).toFixed(2)));
}

function dashboardPaymentCollectionSplit(session, payment) {
  const due = paymentDueAmount(payment, session);
  const cashApplied = Math.min(due, Number(payment.paidAmount || 0));
  const covered = paymentCollectedAmount(session, payment);
  const shuttleDue = dashboardPaymentShuttleAmount(session, payment);
  const courtDue = dashboardPaymentCourtAmount(session, payment);
  const shuttleCollected = Math.min(shuttleDue, cashApplied);
  const courtCollected = Math.min(courtDue, Math.max(0, Number((cashApplied - shuttleCollected).toFixed(2))));
  const shuttleCovered = Math.min(shuttleDue, covered);
  const courtCovered = Math.min(courtDue, Math.max(0, Number((covered - shuttleCovered).toFixed(2))));
  return {
    courtDue,
    courtCollected,
    courtCovered,
    courtOutstanding: Math.max(0, Number((courtDue - courtCovered).toFixed(2))),
    shuttleDue,
    shuttleCollected,
    shuttleCovered,
    shuttleOutstanding: Math.max(0, Number((shuttleDue - shuttleCovered).toFixed(2)))
  };
}

function dashboardShuttleActivitySpent(activities) {
  return (activities || []).reduce((total, activity) => {
    return total + (dashboardActivityIsShuttle(activity) ? Number(activity.totalPaid || 0) : 0);
  }, 0);
}

function dashboardFinanceSnapshot(sessions, activities = []) {
  const billableSessions = sessions.filter(dashboardFinanceSessionIsBillable);
  let chargedCourtTotal = 0;
  let chargedPlayerTotal = 0;
  let shuttleCharged = 0;
  let shuttleCollected = 0;
  let shuttleOutstanding = 0;
  const courtRows = sessions
    .map((session) => {
      const court = getCourt(session.courtId);
      const amount = Number(session.totalPaid || 0);
      return {
        session,
        label: `${formatDate(session.date)} ${court?.name || "Court not selected"}`,
        detail: `${titleCase(normalizeStage(session.stage))} - ${timeRange(session)}`,
        amount,
        billable: dashboardFinanceSessionIsBillable(session)
      };
    })
    .filter((row) => row.amount > 0)
    .sort((a, b) => dashboardDateTime(b.session.date) - dashboardDateTime(a.session.date));
  const playerMap = new Map();
  activePlayersAlphabetical()
    .forEach((player) => {
      playerMap.set(player.id, {
        id: player.id,
        name: player.name || player.displayName || "Player",
        collected: 0,
        due: 0,
        billed: 0,
        advance: 0,
        credit: 0,
        sessions: 0
      });
    });
  billableSessions.forEach((session) => {
    const charged = dashboardSessionChargedTotals(session);
    chargedCourtTotal += charged.court;
    chargedPlayerTotal += charged.total;
    shuttleCharged += charged.shuttle;
    Object.values(session.payments || {}).forEach((payment) => {
      if (!payment?.playerId || !playerMap.has(payment.playerId)) return;
      const row = playerMap.get(payment.playerId);
      const split = dashboardPaymentCollectionSplit(session, payment);
      const coverage = paymentCoverageDetails(session, payment);
      shuttleCollected += split.shuttleCollected;
      shuttleOutstanding += split.shuttleOutstanding;
      row.billed += split.courtDue;
      row.collected += split.courtCollected;
      row.advance += coverage.advanceApplied + coverage.groupAdvanceApplied;
      row.credit += coverage.ownCreditApplied + coverage.groupCreditApplied;
      row.due += split.courtOutstanding;
      row.sessions += 1;
    });
  });
  const playerRows = [...playerMap.values()]
    .map((row) => ({
      ...row,
      billed: Number(row.billed.toFixed(2)),
      collected: Number(row.collected.toFixed(2)),
      due: Number(row.due.toFixed(2)),
      advance: Number(row.advance.toFixed(2)),
      credit: Number(row.credit.toFixed(2))
    }))
    .filter((row) => row.billed > 0 || row.collected > 0 || row.due > 0)
    .sort((a, b) => b.due - a.due || b.collected - a.collected || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const allCourtFee = dashboardMoney(sessions.reduce((total, session) => total + Number(session.totalPaid || 0), 0));
  const billableCourtFee = dashboardMoney(billableSessions.reduce((total, session) => total + Number(session.totalPaid || 0), 0));
  const billableWaterCost = dashboardMoney(billableSessions.reduce((total, session) => total + dashboardSessionWaterCost(session), 0));
  const upcomingCourtFee = dashboardMoney(Math.max(0, allCourtFee - billableCourtFee));
  const totalCollected = dashboardMoney(playerRows.reduce((total, row) => total + row.collected, 0));
  const totalDue = dashboardMoney(playerRows.reduce((total, row) => total + row.due, 0));
  const shuttleSpent = dashboardMoney(dashboardShuttleActivitySpent(activities));
  chargedCourtTotal = dashboardMoney(chargedCourtTotal);
  chargedPlayerTotal = dashboardMoney(chargedPlayerTotal);
  shuttleCharged = dashboardMoney(shuttleCharged);
  shuttleCollected = dashboardMoney(shuttleCollected);
  shuttleOutstanding = dashboardMoney(shuttleOutstanding);
  const organizerChargeTotal = dashboardMoney(chargedPlayerTotal - billableCourtFee - billableWaterCost - shuttleSpent);
  return {
    courtRows,
    playerRows,
    billableSessionCount: billableSessions.length,
    allCourtFee,
    billableCourtFee,
    billableWaterCost,
    upcomingCourtFee,
    chargedCourtTotal,
    chargedPlayerTotal,
    totalCollected,
    totalDue,
    organizerChargeTotal,
    shuttleCharged,
    shuttleCollected,
    shuttleDue: shuttleOutstanding,
    shuttleSpent
  };
}

function dashboardCourtSpend(summaries) {
  const byCourt = new Map();
  summaries.forEach((summary) => {
    const key = summary.court?.id || "unknown";
    const item = byCourt.get(key) || {
      id: key,
      label: summary.court?.name || "Court not selected",
      amount: 0,
      sessions: 0,
      hours: 0
    };
    item.amount += summary.courtFee;
    item.sessions += 1;
    item.hours += sessionCourtHours(summary.session);
    byCourt.set(key, item);
  });
  return [...byCourt.values()]
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      value: currency(item.amount),
      detail: `${item.sessions} sessions, ${Number(item.hours.toFixed(1))} court-hours`
    }));
}

function dashboardStageBreakdown(sessions) {
  return SESSION_STAGES.filter((stage) => stage !== "Draft").map((stage) => ({
    label: titleCase(stage),
    stage,
    count: sessions.filter((session) => normalizeStage(session.stage) === stage).length,
    tone: stageTone(stage)
  }));
}

function dashboardAttendanceLeaders(sessions) {
  const counts = new Map();
  sessions.forEach((session) => {
    const playerIds = effectiveAttendedPlayerIds(session);
    uniqueIds(playerIds).forEach((playerId) => {
      counts.set(playerId, Number(counts.get(playerId) || 0) + 1);
    });
  });
  return activePlayersAlphabetical()
    .map((player) => ({
      player,
      count: Number(counts.get(player.id) || 0),
      balance: playerBalance(player.id)
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || (a.player.name || a.player.displayName || "").localeCompare(b.player.name || b.player.displayName || "", undefined, { sensitivity: "base" }))
    .slice(0, 6);
}

function dashboardSkillMix() {
  const counts = new Map();
  activePlayersAlphabetical().forEach((player) => {
    const skill = normalizeSkillLevel(player.skillLevel);
    counts.set(skill, Number(counts.get(skill) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, tone: skillTone(label) }))
    .sort((a, b) => (SKILL_RANK[b.label] || 0) - (SKILL_RANK[a.label] || 0));
}

function renderDashboardRangeControl(activeRange) {
  return `
    <div class="segment dashboard-range-control" role="group" aria-label="Dashboard date range">
      ${DASHBOARD_RANGES.map((range) => `
        <button type="button" class="${activeRange.id === range.id ? "active" : ""}" data-dashboard-range="${range.id}" aria-pressed="${activeRange.id === range.id}">
          ${range.label}
        </button>
      `).join("")}
    </div>
  `;
}

function renderDashboardNextSession(data) {
  const sessions = data.upcoming.length ? data.upcoming.slice(0, 4) : data.allSessions.slice(-4);
  if (!sessions.length) {
    return `
      <article class="row-card dashboard-focus-card">
        <p class="metric-label">Session Readiness</p>
        <h2>No Session</h2>
        <p class="row-subtitle">Create a session to start tracking operations.</p>
      </article>
    `;
  }
  return `
    <article class="row-card dashboard-focus-card dashboard-next-session dashboard-readiness-card">
      <div class="row-main">
        <div>
          <p class="metric-label">Session Readiness</p>
          <h2>Upcoming Sessions</h2>
          <p class="row-subtitle">Capacity, waitlist, and payment signals.</p>
        </div>
        <button class="btn icon-only" type="button" data-view="sessions" aria-label="Open sessions" title="Open sessions">${icon("calendar")}</button>
      </div>
      <div class="dashboard-readiness-list">
        ${sessions.map(renderDashboardReadinessRow).join("")}
      </div>
    </article>
  `;
}

function renderDashboardReadinessRow(session) {
  const stats = sessionStats(session);
  const court = getCourt(session.courtId);
  const remainingSlots = Math.max(0, Number(stats.capacity || 0) - Number(stats.confirmedCount || 0));
  const pendingAmount = dashboardReadinessPendingAmount(session, stats);
  return `
    <article class="dashboard-readiness-row">
      <div class="dashboard-readiness-row-head">
        <div>
          <h3 class="row-title">${escapeHtml(formatDate(session.date))}</h3>
          <p class="row-subtitle">${escapeHtml(timeRange(session))} at ${escapeHtml(court?.name || "Court not selected")}</p>
        </div>
        ${renderSessionStageChips(session)}
      </div>
      <div class="dashboard-session-readiness">
        <span><strong>${stats.confirmedCount}/${stats.capacity || 0}</strong> players</span>
        <span><strong>${remainingSlots}</strong> open</span>
        <span><strong>${stats.waiting.length}</strong> waiting</span>
        <span><strong>${currency(pendingAmount)}</strong> pending</span>
      </div>
    </article>
  `;
}

function dashboardReadinessPendingAmount(session, stats = sessionStats(session)) {
  if (sessionIsCollectible(session)) return Number(stats.pendingAmount || 0);
  return Number(stats.confirmedCount || 0) * Number(session.perPersonAmount || 0);
}

function renderDashboardMetric(title, value, detail, tone = "teal") {
  return `
    <article class="row-card dashboard-metric dashboard-metric-${tone}">
      <p class="metric-label">${escapeHtml(title)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span class="badge ${tone}">${escapeHtml(detail)}</span>
    </article>
  `;
}

function renderDashboardChartCard(title, subtitle, content, className = "") {
  return `
    <section class="panel dashboard-chart-card ${escapeAttr(className)}">
      <div class="section-heading">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </div>
      ${content}
    </section>
  `;
}

function renderDashboardCollectionChart(data) {
  const segments = [
    { label: "Cash Collected", value: data.cashCollected, tone: "teal", text: currency(data.cashCollected) },
    { label: "Advance Applied", value: data.advanceApplied, tone: "blue", text: currency(data.advanceApplied) },
    { label: "Credit Applied", value: data.creditApplied, tone: "green", text: currency(data.creditApplied) },
    { label: "Session Dues", value: data.paymentTotals.outstanding, tone: "gold", text: currency(data.paymentTotals.outstanding) },
    { label: "Activity Dues", value: data.activityTotals.outstanding, tone: "red", text: currency(data.activityTotals.outstanding) }
  ];
  return `
    ${renderDashboardStackedBar(segments)}
  `;
}

function renderDashboardStackedBar(segments) {
  const total = segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0);
  if (total <= 0) {
    return `<div class="empty compact-empty">No receivables or collections recorded yet.</div>`;
  }
  return `
    <div class="stacked-bar" aria-label="Collection status">
      ${segments
        .filter((segment) => Number(segment.value || 0) > 0)
        .map((segment) => {
          const width = Math.max(3, Math.round((Number(segment.value || 0) / total) * 100));
          return `<span class="stacked-segment ${segment.tone}" style="width: ${width}%;" title="${escapeAttr(`${segment.label}: ${segment.text}`)}"></span>`;
        })
        .join("")}
    </div>
    <div class="chart-legend">
      ${segments.map((segment) => `
        <span><i class="${segment.tone}"></i>${escapeHtml(segment.label)} <strong>${escapeHtml(segment.text)}</strong></span>
      `).join("")}
    </div>
  `;
}

function renderDashboardTrendChart(summaries) {
  const points = summaries.slice(-12);
  if (!points.length) return `<div class="empty compact-empty">No sessions in this range.</div>`;
  const width = 620;
  const height = 210;
  const paddingX = 34;
  const bottom = 170;
  const chartHeight = 126;
  const maxValue = Math.max(1, ...points.map((item) => Math.max(item.capacity, item.confirmed + item.waiting)));
  const step = (width - paddingX * 2) / Math.max(1, points.length);
  const barWidth = Math.min(34, Math.max(12, step * 0.42));
  const bars = points.map((item, index) => {
    const x = paddingX + index * step + step / 2 - barWidth / 2;
    const capacityHeight = (item.capacity / maxValue) * chartHeight;
    const confirmedHeight = (item.confirmed / maxValue) * chartHeight;
    const waitY = bottom - ((item.confirmed + item.waiting) / maxValue) * chartHeight;
    const label = formatDate(item.session.date).replace(",", "");
    return `
      <g>
        <title>${escapeHtml(`${label}: ${item.confirmed}/${item.capacity} players, ${item.waiting} waiting`)}</title>
        <rect class="trend-capacity" x="${x.toFixed(1)}" y="${(bottom - capacityHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${capacityHeight.toFixed(1)}" rx="5"></rect>
        <rect class="trend-confirmed" x="${x.toFixed(1)}" y="${(bottom - confirmedHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${confirmedHeight.toFixed(1)}" rx="5"></rect>
        ${item.waiting ? `<circle class="trend-waiting" cx="${(x + barWidth / 2).toFixed(1)}" cy="${waitY.toFixed(1)}" r="4"></circle>` : ""}
        <text x="${(x + barWidth / 2).toFixed(1)}" y="195" text-anchor="middle">${escapeHtml(label.split(" ").slice(1).join(" "))}</text>
      </g>
    `;
  }).join("");
  return `
    <div class="trend-chart-wrap">
      <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Attendance trend chart">
        <line class="trend-axis" x1="${paddingX}" y1="${bottom}" x2="${width - paddingX}" y2="${bottom}"></line>
        ${bars}
      </svg>
      <div class="chart-legend">
        <span><i class="teal"></i>Confirmed</span>
        <span><i class="muted"></i>Capacity</span>
        <span><i class="blue"></i>Waiting</span>
      </div>
    </div>
  `;
}

function renderDashboardHorizontalBars(items, options = {}) {
  const valueKey = options.valueKey || "count";
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey] || 0)));
  if (!items.length) return `<div class="empty compact-empty">${escapeHtml(options.empty || "No data yet.")}</div>`;
  return `
    <div class="bar-list">
      ${items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100));
        const tone = item.tone || options.tone || "teal";
        return `
          <article class="bar-row">
            <div class="bar-row-header">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.value || String(value))}</span>
            </div>
            <div class="bar-track"><span class="bar-fill ${tone}" style="width: ${width}%;"></span></div>
            ${item[options.detailKey] ? `<p>${escapeHtml(item[options.detailKey])}</p>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardPipeline(stages) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  if (!total) return `<div class="empty compact-empty">No sessions yet.</div>`;
  return `
    <div class="pipeline-list">
      ${stages.map((stage) => {
        const width = Math.max(stage.count ? 8 : 0, Math.round((stage.count / total) * 100));
        return `
          <div class="pipeline-row">
            <div class="pipeline-label">
              <span class="badge ${stage.tone}">${escapeHtml(stage.label)}</span>
              <strong>${stage.count}</strong>
            </div>
            <div class="bar-track"><span class="bar-fill ${stage.tone}" style="width: ${width}%;"></span></div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardFinancePanel(data) {
  const snapshot = data.financeSnapshot;
  const rangeText = data.range.id === "all" ? "all past sessions" : `the last ${data.range.label}`;
  return `
    <section class="panel dashboard-panel dashboard-finance-panel">
      <div class="section-heading">
        <div>
          <h2>Court and Collection Snapshot</h2>
          <p>Court, shuttle, activity, advance, and organizer totals for ${rangeText}.</p>
        </div>
      </div>
      <div class="finance-summary-grid">
        ${renderFinanceSummaryCard("Court Spent", currency(snapshot.billableCourtFee), "Past sessions only", "teal")}
        ${renderFinanceSummaryCard("Court Cash Collected", currency(snapshot.totalCollected), `${currency(snapshot.totalDue)} pending`, snapshot.totalDue ? "gold" : "green")}
        ${renderFinanceSummaryCard("Shuttle Spent", currency(snapshot.shuttleSpent), "From shuttle purchases", "teal")}
        ${renderFinanceSummaryCard("Shuttle Cash Collected", currency(snapshot.shuttleCollected), `${currency(snapshot.shuttleDue)} pending`, snapshot.shuttleDue ? "gold" : "green")}
        ${renderFinanceSummaryCard("Activity Spent", currency(data.activityTotals.spent), "Excludes shuttle purchases", data.activityTotals.spent ? "teal" : "green")}
        ${renderFinanceSummaryCard("Activity Cash Collected", currency(data.activityTotals.cashApplied), data.activityTotals.outstanding ? `${currency(data.activityTotals.outstanding)} pending` : "Clear", data.activityTotals.outstanding ? "gold" : "green")}
        ${renderFinanceSummaryCard("Advance", currency(data.advanceTotal), "Available Advance", data.advanceTotal ? "teal" : "green")}
        ${renderFinanceSummaryCard("Credit", currency(data.creditTotal), "Available Credit", data.creditTotal ? "teal" : "green")}
        ${renderFinanceSummaryCard("Organizer Net", financeCurrency(snapshot.organizerChargeTotal), "Charged - Spent", snapshot.organizerChargeTotal < 0 ? "gold" : "green")}
      </div>
      <div class="finance-detail-grid">
        <div>
          <h3 class="mini-title">Session Court Fees</h3>
          <div class="finance-table">
            ${snapshot.courtRows.length ? snapshot.courtRows.map(renderDashboardCourtFeeRow).join("") : `<div class="empty compact-empty">No court fees in this range.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderFinanceSummaryCard(label, value, detail, tone) {
  return `
    <article class="finance-summary-card ${tone}">
      <p>${escapeHtml(label)}</p>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(detail)}</span>
    </article>
  `;
}

function renderDashboardCourtFeeRow(row) {
  return `
    <article class="finance-row">
      <div>
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row.detail)}</span>
      </div>
      <div class="finance-row-values">
        <span class="badge ${row.billable ? "teal" : "blue"}">${row.billable ? "Past" : "Pre-Booking"}</span>
        <strong>${currency(row.amount)}</strong>
      </div>
    </article>
  `;
}

function renderDashboardPlayerPanel(data) {
  const attendanceRows = data.attendanceLeaders.map((item) => ({
    label: item.player.name || item.player.displayName || "Player",
    count: item.count,
    value: `${item.count} sessions`,
    detail: item.balance ? `${currency(item.balance)} owed` : "Clear",
    tone: item.balance ? "gold" : "teal"
  }));
  const skillRows = data.skillMix.map((item) => ({
    label: item.label,
    count: item.count,
    value: String(item.count),
    detail: "Active players",
    tone: item.tone
  }));
  return `
    <section class="panel dashboard-panel">
      <div class="section-heading">
        <div>
          <h2>Player Signals</h2>
          <p>Attendance leaders and active player mix.</p>
        </div>
        <button class="btn icon-only" type="button" data-view="players" aria-label="Open players" title="Open players">${icon("users")}</button>
      </div>
      <div class="dashboard-mini-grid">
        <div>
          <h3 class="mini-title">Attendance Leaders</h3>
          ${renderDashboardHorizontalBars(attendanceRows, { empty: "No attendance in this range.", detailKey: "detail" })}
        </div>
        <div>
          <h3 class="mini-title">Skill Mix</h3>
          ${renderDashboardHorizontalBars(skillRows, { empty: "No players yet.", detailKey: "detail" })}
        </div>
      </div>
    </section>
  `;
}

function renderDashboardSessionPanel(data) {
  const sessions = data.upcoming.length ? data.upcoming.slice(0, 4) : data.allSessions.slice(-4);
  return `
    <section class="panel dashboard-panel">
      <div class="section-heading">
        <div>
          <h2>Session Readiness</h2>
          <p>Upcoming sessions with capacity and payment signal.</p>
        </div>
        <button class="btn icon-only" type="button" data-view="sessions" aria-label="Open sessions" title="Open sessions">${icon("calendar")}</button>
      </div>
      <div class="dashboard-list">
        ${sessions.map(renderDashboardSessionRow).join("")}
      </div>
    </section>
  `;
}

function renderDashboardSessionRow(session) {
  const stats = sessionStats(session);
  const court = getCourt(session.courtId);
  const utilization = stats.capacity ? Math.round((stats.confirmedCount / stats.capacity) * 100) : 0;
  return `
    <article class="dashboard-list-row">
      <div>
        <h3 class="row-title">${escapeHtml(formatDate(session.date))}</h3>
        <p class="row-subtitle">${escapeHtml(timeRange(session))} at ${escapeHtml(court?.name || "Court not selected")}</p>
      </div>
      <div class="dashboard-row-actions">
        <span class="badge ${stageTone(session.stage)}">${escapeHtml(titleCase(session.stage))}</span>
        <span class="badge ${stats.confirmedCount >= stats.capacity && stats.capacity ? "green" : "gold"}">${stats.confirmedCount}/${stats.capacity || 0}</span>
        <span class="badge teal">${utilization}%</span>
        <button class="btn icon-only" type="button" data-view="sessions" data-session="${escapeAttr(session.id)}" aria-label="Open ${escapeAttr(formatDate(session.date))}" title="Open">${icon("arrowRight")}</button>
      </div>
    </article>
  `;
}

function renderSetupDashboard() {
  const courtsReady = state.courts.filter((court) => court.active !== false).length;
  const playersReady = state.players.filter((player) => player.active !== false).length;
  const groupsReady = settingsGroups().filter((group) => group.url).length;
  return `
    <section class="page">
      <div class="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p class="page-kicker">Create the first session to start tracking readiness and payments.</p>
        </div>
        <button class="btn primary icon-only" type="button" data-action="open-session-modal" aria-label="New session" title="New session">${icon("plus")}</button>
      </div>

      <div class="dashboard-kpi-grid">
        ${renderDashboardMetric("Courts", String(courtsReady), courtsReady ? "Ready" : "Needed", courtsReady ? "green" : "gold")}
        ${renderDashboardMetric("Players", String(playersReady), playersReady ? "Ready" : "Needed", playersReady ? "green" : "gold")}
        ${renderDashboardMetric("WhatsApp Links", String(groupsReady), groupsReady ? "Ready" : "Needed", groupsReady ? "green" : "gold")}
        ${renderDashboardMetric("Sessions", "0", "Create first session", "gold")}
      </div>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h2>Start Here</h2>
            <p>Only missing operational inputs are listed.</p>
          </div>
        </div>
        <div class="dashboard-list">
          ${!courtsReady ? renderSetupItem("Add Courts", "Add venue, location, and AED per hour.", "courts", courtsReady) : ""}
          ${!playersReady ? renderSetupItem("Add Players", "Add the regular player list before sessions.", "players", playersReady) : ""}
          ${!groupsReady ? renderSetupItem("Add WhatsApp Links", "Keep shortcuts for copy-and-paste flow.", "settings", groupsReady) : ""}
          ${renderSetupItem("Create First Session", "Add date, court, capacity, and per-person rate.", "sessions", 0)}
        </div>
      </section>
    </section>
  `;
}

function renderSetupItem(title, description, view, count) {
  return `
    <article class="dashboard-list-row">
      <div>
        <h3 class="row-title">${escapeHtml(title)}</h3>
        <p class="row-subtitle">${escapeHtml(description)}</p>
      </div>
      <div class="dashboard-row-actions">
        <span class="badge ${count ? "green" : "gold"}">${count ? "Ready" : "Needed"}</span>
        <button class="btn primary" type="button" data-view="${escapeAttr(view)}">Open</button>
      </div>
    </article>
  `;
}
