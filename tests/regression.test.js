const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

const APP_FILES = [
  "js/config.js",
  "js/core.js",
  "js/messages.js",
  "js/data.js",
  "js/sessions.js",
  "js/payments.js",
  "js/session-stage.js",
  "js/firebase-rest.js",
  "js/browser-runtime.js",
  "js/render-shell.js",
  "js/render-dashboard.js",
  "js/render-sessions.js",
  "js/render-directories.js",
  "js/render-payments.js",
  "js/render-settings-modals.js",
  "js/events.js"
];

function isoDateFromToday(offsetDays) {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

function createElementStub() {
  return {
    value: "",
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    remove() {},
    select() {},
    setSelectionRange() {},
    addEventListener() {},
    removeEventListener() {}
  };
}

function jsonResponse(status, payload, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async json() {
      return payload;
    },
    clone() {
      return jsonResponse(status, payload, statusText);
    }
  };
}

function createAppContext(options = {}) {
  const appElementStub = createElementStub();
  appElementStub.innerHTML = "";
  const documentStub = {
    hidden: false,
    body: {
      scrollTop: 0,
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {}
    },
    documentElement: { scrollTop: 0 },
    querySelector(selector) {
      if (selector === "#app") return appElementStub;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return createElementStub();
    },
    addEventListener() {},
    removeEventListener() {},
    execCommand() {
      return false;
    }
  };
  const locationStub = { href: "https://adsmashers.web.app/" };
  const windowStub = {
    location: locationStub,
    navigator: null,
    document: documentStub,
    addEventListener() {},
    removeEventListener() {},
    open() {},
    scrollTo() {},
    setTimeout,
    clearTimeout
  };
  const navigatorStub = {
    userAgent: options.userAgent || "",
    platform: options.platform || "",
    maxTouchPoints: options.maxTouchPoints || 0,
    serviceWorker: null
  };
  windowStub.navigator = navigatorStub;

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    Intl,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    RegExp,
    Map,
    Set,
    Promise,
    TextEncoder,
    document: documentStub,
    window: windowStub,
    navigator: navigatorStub,
    localStorage: createStorage(),
    caches: {
      async keys() {
        return [];
      },
      async delete() {
        return true;
      }
    },
    fetch: async () => jsonResponse(200, {}),
    FormData: class FormDataStub {}
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);

  for (const file of APP_FILES) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  run(
    context,
    `
      uiState = { dashboardRange: "90", paymentsSearch: "", sessionWeekStart: "", appLastUpdatedAt: "", scrollPositions: {} };
      activeView = DEFAULT_VIEW;
      activeSessionId = null;
      activeSessionTab = DEFAULT_SESSION_TAB;
      modal = null;
      state = emptyState();
      currentUser = { idToken: "test-token", refreshToken: "refresh-token", localId: "test-uid", email: "admin@adsmashers.app", expiresAt: Date.now() + 3600000 };
      currentUserMembership = { uid: "test-uid", email: "admin@adsmashers.app", role: "owner", status: "active" };
      currentUserRole = "owner";
      authLoading = false;
      cloudLoading = false;
      cloudError = "";
      cloudLoadFailed = false;
      cloudSaveTimer = null;
      cloudSaveInFlight = false;
      cloudSavePending = false;
      cloudStateNeedsMigrationSave = false;
      cloudStateExists = false;
      cloudStateVersion = 0;
      cloudStateUpdateTime = "";
      cloudStateRemoteUpdatedAtMs = 0;
      cloudStateClientId = "";
      cloudStateSaveId = "";
      cloudStructuredCollectionIds = null;
      cloudStateBaseSnapshot = null;
      cloudClientId = "";
      cloudSaveConflict = false;
      lastCloudSaveError = "";
      loginError = "";
      serviceWorkerRegistration = null;
      pendingAppReload = false;
    `
  );
  return context;
}

function run(context, code) {
  return vm.runInContext(code, context);
}

function jsonValue(context, expression) {
  return JSON.parse(run(context, `JSON.stringify(${expression})`));
}

function installFakeDate(context, fixedNow) {
  context.__RealDate = Date;
  context.__fixedNow = fixedNow;
  run(
    context,
    `
      Date = class FakeDate extends __RealDate {
        constructor(...args) {
          super(...(args.length ? args : [__fixedNow]));
        }

        static now() {
          return new __RealDate(__fixedNow).getTime();
        }

        static parse(value) {
          return __RealDate.parse(value);
        }

        static UTC(...args) {
          return __RealDate.UTC(...args);
        }
      };
      window.Date = Date;
    `
  );
}

function setAppState(context, fixture) {
  context.__fixture = fixture;
  return run(context, "state = migrateState(__fixture, { useSeedCollections: false }); state");
}

function setCloudBaseState(context, fixture) {
  context.__cloudBaseFixture = fixture;
  return run(context, "setCloudStateBaseSnapshot(migrateState(__cloudBaseFixture, { useSeedCollections: false }))");
}

function player(id, name, skillLevel = "Beginner", paymentMethod = "Bank") {
  return {
    id,
    name,
    displayName: name,
    phone: "",
    whatsapp: "",
    preferredDays: "Friday, Saturday",
    skillLevel,
    paymentMethod,
    racketOwned: "Yes",
    usuallyNeedsRacket: false,
    active: true
  };
}

function court(id, name, area = "Test Area", rate = 50) {
  return {
    id,
    name,
    area,
    aedPerHour: rate,
    location: "https://maps.google.com/maps?q=test",
    phone: "",
    whatsapp: "",
    bookingMethod: "WhatsApp"
  };
}

function baseSession(overrides = {}) {
  return {
    id: "session-1",
    type: "Friday",
    date: isoDateFromToday(-1),
    startTime: "19:00",
    endTime: "21:00",
    courtId: "court-1",
    plannedCourts: 1,
    bookedCourts: 1,
    playersPerCourt: 6,
    expectedPlayers: 6,
    totalPaid: 120,
    shuttleCost: 0,
    waterCost: 0,
    perPersonAmount: 20,
    stage: "Payment Collection",
    bookingStatus: "Booked",
    responses: [],
    payments: {},
    sent: {},
    ...overrides
  };
}

function baseFixture(overrides = {}) {
  return {
    settings: {
      clubName: "AD Smashers Tamil Club",
      defaultPlayersPerCourt: 6,
      defaultShuttleCost: 0,
      currency: "AED",
      pollTemplate: "",
      finalListTemplate: "",
      organizerPlayerId: "",
      coOrganizerPlayerId: "",
      ...overrides.settings
    },
    groups: overrides.groups || [
      { id: "group-friday", name: "Friday", url: "https://chat.whatsapp.com/friday" },
      { id: "group-saturday", name: "Saturday", url: "https://chat.whatsapp.com/saturday" },
      { id: "group-flexiday", name: "FlexiDay", url: "https://chat.whatsapp.com/flexi" }
    ],
    courts: overrides.courts || [court("court-1", "Court One")],
    players: overrides.players || [],
    sessions: overrides.sessions || [],
    activities: overrides.activities || [],
    paymentGroups: overrides.paymentGroups || [],
    paymentTransactions: overrides.paymentTransactions || [],
    advances: overrides.advances || {}
  };
}

function firestoreStateDocument(stateValue, version = 1, updateTime = "2026-07-03T03:00:00.000000Z") {
  return {
    name: "projects/home-kaish/databases/(default)/documents/adSmashers/state",
    fields: {
      stateJson: { stringValue: JSON.stringify(stateValue) },
      version: { integerValue: String(version) },
      updatedAt: { timestampValue: updateTime },
      updatedBy: { stringValue: "admin@adsmashers.app" }
    },
    createTime: updateTime,
    updateTime
  };
}

function firestoreValue(value) {
  if (value === undefined || value === null) return { nullValue: "NULL_VALUE" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => firestoreValue(item)) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") return { mapValue: { fields: firestoreFields(value) } };
  return { stringValue: String(value) };
}

function firestoreFields(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, firestoreValue(item)]));
}

function firestoreDocument(name, data, updateTime = "2026-07-03T03:00:00.000000Z") {
  return {
    name,
    fields: firestoreFields(data),
    createTime: updateTime,
    updateTime
  };
}

const TEST_STRUCTURED_COLLECTIONS = [
  { stateKey: "groups", collectionId: "groups", includeItem: isTestSettingsGroup },
  { stateKey: "groups", collectionId: "archivedGroups", includeItem: (item) => !isTestSettingsGroup(item) },
  { stateKey: "courts", collectionId: "courts" },
  { stateKey: "players", collectionId: "players", includeItem: (item) => item?.active !== false },
  { stateKey: "players", collectionId: "archivedPlayers", includeItem: (item) => item?.active === false },
  { stateKey: "sessions", collectionId: "sessions" },
  { stateKey: "activities", collectionId: "activities" },
  { stateKey: "paymentGroups", collectionId: "paymentGroups", includeItem: (item) => item?.active !== false },
  { stateKey: "paymentGroups", collectionId: "archivedPaymentGroups", includeItem: (item) => item?.active === false },
  { stateKey: "paymentTransactions", collectionId: "paymentTransactions" }
];

const TEST_SETTINGS_GROUP_IDS = ["group-friday", "group-saturday", "group-flexiday"];

function isTestSettingsGroup(item) {
  return TEST_SETTINGS_GROUP_IDS.includes(item?.id);
}

function testCollectionItemsForSpec(stateValue, spec) {
  const items = Array.isArray(stateValue?.[spec.stateKey]) ? stateValue[spec.stateKey] : [];
  return spec.includeItem ? items.filter((item) => spec.includeItem(item)) : items;
}

function structuredWorkspaceDocument(stateValue, version = 1, updateTime = "2026-07-03T03:00:00.000000Z", options = {}) {
  const collections = Object.fromEntries(
    TEST_STRUCTURED_COLLECTIONS.map((spec) => [
      spec.collectionId,
      testCollectionItemsForSpec(stateValue, spec).map((item) => item.id).filter(Boolean)
    ])
  );
  collections.advances = Object.keys(stateValue.advances || {});
  return firestoreDocument(
    "projects/home-kaish/databases/(default)/documents/adSmashers/main",
    {
      appId: "adSmashers",
      name: "AD Smashers Manager",
      schemaVersion: 1,
      version,
      updatedAt: updateTime,
      updatedBy: "admin@adsmashers.app",
      clientId: options.clientId || "",
      saveId: options.saveId || "",
      collections
    },
    updateTime
  );
}

function structuredList(collectionId, items, updateTime = "2026-07-03T03:00:00.000000Z") {
  return {
    documents: (items || []).map((item) =>
      firestoreDocument(`projects/home-kaish/databases/(default)/documents/adSmashers/main/${collectionId}/${item.id}`, item, updateTime)
    )
  };
}

function structuredAdvancesList(advances, updateTime = "2026-07-03T03:00:00.000000Z") {
  return {
    documents: Object.entries(advances || {}).map(([playerId, amount]) =>
      firestoreDocument(`projects/home-kaish/databases/(default)/documents/adSmashers/main/advances/${playerId}`, { playerId, amount }, updateTime)
    )
  };
}

function structuredAuditLogsList(items = [], updateTime = "2026-07-03T03:00:00.000000Z") {
  return {
    documents: (items || []).map((item) =>
      firestoreDocument(`projects/home-kaish/databases/(default)/documents/adSmashers/main/auditLogs/${item.id}`, item, updateTime)
    )
  };
}

function structuredFetchForState(stateValue, version = 1, updateTime = "2026-07-03T03:00:00.000000Z", options = {}) {
  return async (url) => {
    if (url.endsWith("/documents/adSmashers/main")) {
      return jsonResponse(200, structuredWorkspaceDocument(stateValue, version, updateTime, options));
    }
    if (url.endsWith("/documents/adSmashers/main/settings/current")) {
      return jsonResponse(200, firestoreDocument("projects/home-kaish/databases/(default)/documents/adSmashers/main/settings/current", stateValue.settings || {}, updateTime));
    }
    const collectionMap = Object.fromEntries(
      TEST_STRUCTURED_COLLECTIONS.map((spec) => [spec.collectionId, testCollectionItemsForSpec(stateValue, spec)])
    );
    const collectionMatch = url.match(/\/documents\/adSmashers\/main\/([^/?]+)\?pageSize=300/);
    if (collectionMatch) {
      const collectionId = collectionMatch[1];
      if (collectionId === "advances") return jsonResponse(200, structuredAdvancesList(stateValue.advances || {}, updateTime));
      if (collectionId === "auditLogs") return jsonResponse(200, structuredAuditLogsList([], updateTime));
      return jsonResponse(200, structuredList(collectionId, collectionMap[collectionId] || [], updateTime));
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND", message: "Not found" } });
  };
}

test("session dates select the correct WhatsApp group", () => {
  const context = createAppContext();
  setAppState(context, baseFixture());

  assert.equal(run(context, 'sessionGroupIdFor({ date: "2026-07-03" })'), "group-friday");
  assert.equal(run(context, 'sessionGroupIdFor({ date: "2026-07-04" })'), "group-saturday");
  assert.equal(run(context, 'sessionGroupIdFor({ date: "2026-07-05" })'), "group-flexiday");
});

test("saved final list template does not re-add removed no-show copy on refresh", () => {
  const context = createAppContext();
  const finalListTemplate = [
    "List ordered based on timing of the vote.",
    "",
    "In case of cancellation, please update by {{no_show_deadline}}, so players in the waiting list have enough time to join."
  ].join("\n");

  setAppState(context, baseFixture({ settings: { finalListTemplate } }));

  assert.equal(run(context, "state.settings.finalListTemplate"), [
    "List ordered based on timing of the vote.",
    "",
    "{{final_list_cancellation_notice}}"
  ].join("\n"));
  assert.equal(run(context, "state.settings.finalListTemplate.includes('In case of no show')"), false);
});

test("final list message says no waiting list and uses group voting cancellation note", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Confirmed Player")],
      sessions: [
        baseSession({
          id: "no-waiting-session",
          expectedPlayers: 6,
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const message = run(context, "buildFinalListMessage(state.sessions[0])");
  assert.match(message, /Waiting List[\s\S]*No waiting list/);
  assert.doesNotMatch(message, /Waiting List[\s\S]*1\.\s*\n2\.\s*\n3\.\s*\n4\.\s*\n5\./);
  assert.match(message, /so our friends in the group have time to vote and join\./);
  assert.doesNotMatch(message, /players in the waiting list have enough time to join/);
});

test("final list message keeps numbered waiting players and waiting-list cancellation note", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Confirmed Player"), player("p2", "Waiting Player")],
      sessions: [
        baseSession({
          id: "waiting-session",
          expectedPlayers: 1,
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const message = run(context, "buildFinalListMessage(state.sessions[0])");
  assert.match(message, /Waiting List[\s\S]*1\. Waiting Player/);
  assert.match(message, /our friend in the waiting list has enough time to join\./);
  assert.doesNotMatch(message, /our friends in the group have time to vote and join/);
});

test("final list message uses friends for multiple waiting players", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Confirmed Player"), player("p2", "Waiting One"), player("p3", "Waiting Two")],
      sessions: [
        baseSession({
          id: "multiple-waiting-session",
          expectedPlayers: 1,
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "response-3",
              playerId: "p3",
              voteOrder: 3,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const message = run(context, "buildFinalListMessage(state.sessions[0])");
  assert.match(message, /Waiting List[\s\S]*1\. Waiting One[\s\S]*2\. Waiting Two/);
  assert.match(message, /our friends in the waiting list have enough time to join\./);
});

test("final list message shows default guests as player plus numbers", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Saravanan")],
      sessions: [
        baseSession({
          id: "guest-session",
          expectedPlayers: 3,
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in_plus_2",
              guestCount: 2,
              racketNeeded: false,
              rawOptions: ["I'm in +2"]
            }
          ]
        })
      ]
    })
  );

  const message = run(context, "buildFinalListMessage(state.sessions[0])");
  assert.match(message, /1\. Saravanan[\s\S]*2\. Saravanan \+1[\s\S]*3\. Saravanan \+2/);
  assert.doesNotMatch(message, /Saravanan Guest 1/);
  assert.doesNotMatch(message, /Saravanan Guest 2/);
});

test("booking court stays pinned before alphabetical court names", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      courts: [
        court("court-z", "Zeta Sports"),
        court("court-booking", "Booking"),
        court("court-alpha", "Alpha Sports")
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "orderedCourtOptions().map((item) => item.name)"), [
    "Booking",
    "Alpha Sports",
    "Zeta Sports"
  ]);
});

test("activity notes and player list move to the details modal", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Kabilesh"), player("p2", "Aishu")],
      activities: [
        {
          id: "activity-notes",
          name: "Dinner",
          date: isoDateFromToday(-1),
          totalPaid: 100,
          paidById: "p1",
          playerIds: ["p1", "p2"],
          notes: "Paid by cash after the game.",
          shares: {}
        }
      ]
    })
  );

  assert.equal(run(context, "state.activities[0].notes"), "Paid by cash after the game.");
  assert.match(run(context, "activitySearchText(state.activities[0])"), /Paid by cash/);
  const rowHtml = run(context, "renderActivityRow(state.activities[0])");
  assert.match(rowHtml, /open-activity-details/);
  assert.ok(rowHtml.indexOf("open-activity-details") < rowHtml.indexOf("edit-activity"));
  assert.doesNotMatch(rowHtml, /Notes:/);
  assert.doesNotMatch(rowHtml, /Paid by cash after the game\./);
  assert.doesNotMatch(rowHtml, /Kabilesh, Aishu/);

  const detailsHtml = run(context, 'renderActivityDetailsModal("activity-notes")');
  assert.match(detailsHtml, /Players/);
  assert.match(detailsHtml, /Kabilesh/);
  assert.match(detailsHtml, /Aishu/);
  assert.match(detailsHtml, /Notes/);
  assert.match(detailsHtml, /Paid by cash after the game\./);
});

test("players with zero attendance move to the end without payment copy action", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      settings: { organizerPlayerId: "zero" },
      players: [
        player("zero", "Abdul"),
        player("attended", "Aishu"),
        player("later", "Kabilesh")
      ],
      sessions: [
        baseSession({
          responses: [
            {
              id: "response-attended",
              playerId: "attended",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const orderedIds = jsonValue(context, "playersWithRolesFirst().map((item) => item.id)");
  assert.deepEqual(orderedIds, ["attended", "zero", "later"]);
  const html = run(context, "renderPlayers()");
  assert.doesNotMatch(html, /data-action="copy-player-payment-history"/);
  assert.doesNotMatch(html, /Copy Payment History/);
});

test("player payment copy includes full history and due reminder options", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Aishu"), player("payer", "Kabilesh")],
      sessions: [
        baseSession({
          id: "copy-session",
          responses: [
            {
              id: "copy-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        }),
        baseSession({
          id: "copy-session-extra",
          responses: [
            {
              id: "copy-response-extra",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ],
      activities: [
        {
          id: "dinner",
          name: "Dinner",
          date: isoDateFromToday(-1),
          totalPaid: 30,
          paidById: "payer",
          playerIds: ["p1", "payer"],
          shares: {
            p1: { playerId: "p1", amount: 15, paidAmount: 5, paidBySelf: false, status: "Partial" },
            payer: { playerId: "payer", amount: 15, paidAmount: 15, paidBySelf: true, status: "Paid" }
          }
        }
      ],
      paymentGroups: [
        {
          id: "copy-group",
          name: "Aishu Group",
          payerId: "payer",
          playerIds: ["payer", "p1"],
          guests: [],
          active: true
        }
      ],
      advances: { p1: 5 }
    })
  );
  run(
    context,
    `
      const session = getSession("copy-session");
      session.payments.p1.paidAmount = 10;
      session.payments.p1.status = "Partial";
    `
  );

  const text = run(context, 'buildPlayerPaymentHistoryCopy("p1")');
  assert.match(text, /Aishu - Payment History/);
  assert.match(text, /Attendance: 2/);
  assert.match(text, /Current Status: 35 AED owed/);
  assert.match(text, /Sessions[\s\S]*Due 40 AED, Cash recorded 10 AED, Own Credit applied 5 AED, Pending 25 AED/);
  assert.doesNotMatch(text, /Advance applied/);
  assert.doesNotMatch(text, /19:00|21:00| at /);
  assert.match(text, /Activities[\s\S]*Dinner: Share 15 AED, Cash recorded 5 AED, Pending 10 AED/);
  assert.doesNotMatch(text, /Paid by Kabilesh/);
  assert.match(text, /Coverage[\s\S]*Own Credit applied: 5 AED/);
  assert.match(text, /Coverage[\s\S]*Remaining due: 35 AED/);

  const dueText = run(context, 'buildPlayerDueHistoryCopy("p1")');
  assert.match(dueText, /Aishu - Payment Reminder/);
  assert.match(dueText, /Total Due Before Coverage: 40 AED/);
  assert.match(dueText, /Revised Due: 35 AED/);
  assert.match(dueText, /Sessions[\s\S]*Due 40 AED, Cash recorded 10 AED, Own Credit applied 5 AED, Pending 25 AED/);
  assert.doesNotMatch(dueText, /19:00|21:00| at |No session dues|No activity dues/);
  assert.match(dueText, /Activities[\s\S]*Dinner: Share 15 AED, Cash recorded 5 AED, Pending 10 AED/);

  const modalHtml = run(context, 'renderPlayerPaymentDetailsModal("p1")');
  assert.match(modalHtml, /Payment Details/);
  assert.match(modalHtml, /Copy Full History/);
  assert.match(modalHtml, /copy-player-payment-history/);
  assert.match(modalHtml, /Copy Due History/);
  assert.match(modalHtml, /copy-player-due-history/);

  const groupCardHtml = run(context, 'renderPaymentGroupCard(getPaymentGroup("copy-group"))');
  assert.match(groupCardHtml, /open-payment-group-copy/);
  assert.match(groupCardHtml, /Copy Payment Details/);
  assert.match(groupCardHtml, /payment-group-details/);
  const groupAmountInput = groupCardHtml.match(/<input[^>]*name="amountPaid"[^>]*>/)?.[0] || "";
  assert.ok(groupAmountInput);
  assert.doesNotMatch(groupAmountInput, /\svalue=/);
  assert.match(groupAmountInput, /placeholder="0"/);

  const groupModalHtml = run(context, 'renderPaymentGroupCopyModal("copy-group")');
  assert.match(groupModalHtml, /Copy Full History/);
  assert.match(groupModalHtml, /copy-payment-group-history/);
  assert.match(groupModalHtml, /Copy Due History/);
  assert.match(groupModalHtml, /copy-payment-group-due-history/);

  const groupDueText = run(context, 'buildPaymentGroupDueHistoryCopy("copy-group")');
  assert.match(groupDueText, /Aishu Group - Payment Reminder/);
  assert.match(groupDueText, /Members: Kabilesh, Aishu/);
  assert.match(groupDueText, /Revised Due: 35 AED/);
  assert.match(groupDueText, /Sessions[\s\S]*Due 40 AED, Cash recorded 10 AED, Own Credit applied 5 AED, Pending 25 AED/);
  assert.match(groupDueText, /Activities[\s\S]*Dinner: Share 30 AED, Cash recorded 20 AED, Pending 10 AED/);
});

test("new session modal defaults from date and selects booking court", () => {
  const context = createAppContext();
  installFakeDate(context, "2026-07-03T10:00:00");
  setAppState(
    context,
    baseFixture({
      courts: [
        court("court-z", "Zeta Sports"),
        court("court-booking", "Booking"),
        court("court-alpha", "Alpha Sports")
      ]
    })
  );

  const html = run(context, "renderSessionModal()");
  assert.ok(html.indexOf(">Date<") < html.indexOf(">Session Type<"));
  assert.match(html, /type="date"[^>]*value="2026-07-10"[^>]*data-session-date-source/);
  assert.match(html, /<option value="Friday" selected>Friday<\/option>/);
  assert.match(html, /name="slotStartTime"[^>]*value="19:00"/);
  assert.match(html, /name="slotEndTime"[^>]*value="21:00"/);
  assert.match(html, /name="slotCourts"[^>]*value="2"/);
  assert.match(html, /name="expectedPlayers"[^>]*value="12"[^>]*readonly/);
  assert.match(html, /4 court-hours; 2 courts set capacity/);
  assert.match(html, /<option value="court-booking" selected>Booking<\/option>/);
  assert.match(html, /name="shuttleCost"[^>]*value="0"[^>]*data-session-rate-source/);
  assert.match(html, /name="waterCost"[^>]*value="6"[^>]*data-water-cost-input/);
  assert.match(html, /name="perPersonAmount"[^>]*value="17"/);
});

test("existing session modal keeps water cost at zero when not saved", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ sessions: [baseSession({ id: "existing-water-session" })] }));

  const html = run(context, 'renderSessionModal("existing-water-session")');
  assert.match(html, /name="waterCost"[^>]*value="0"[^>]*data-water-cost-input/);
});

test("existing session modal preserves explicit fee and rate overrides", () => {
  const context = createAppContext();
  const slots = [
    { startTime: "20:00", endTime: "21:00", courts: 3 },
    { startTime: "21:00", endTime: "22:00", courts: 2 }
  ];
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Test Court", "Test Area", 50)],
      sessions: [baseSession({ id: "manual-fee-session", courtSlots: slots, courtId: "court-1", totalPaid: 240, perPersonAmount: 20 })]
    })
  );

  const manualHtml = run(context, 'renderSessionModal("manual-fee-session")');
  assert.match(manualHtml, /name="totalPaid"[^>]*value="240"[^>]*data-court-fee-input[^>]*data-manual="true"/);
  assert.match(manualHtml, /name="perPersonAmount"[^>]*value="20"[^>]*data-per-person-input[^>]*data-manual="true"/);

  run(context, "state.sessions[0].totalPaid = 250; state.sessions[0].perPersonAmount = 14");
  const calculatedHtml = run(context, 'renderSessionModal("manual-fee-session")');
  const courtFeeInput = calculatedHtml.match(/<input[^>]*name="totalPaid"[^>]*>/)?.[0] || "";
  const perPersonInput = calculatedHtml.match(/<input[^>]*name="perPersonAmount"[^>]*>/)?.[0] || "";
  assert.doesNotMatch(courtFeeInput, /data-manual="true"/);
  assert.doesNotMatch(perPersonInput, /data-manual="true"/);
});

test("water cost formula groups every two courts", () => {
  const context = createAppContext();

  assert.equal(run(context, "calculateWaterCost(0)"), 0);
  assert.equal(run(context, "calculateWaterCost(1)"), 6);
  assert.equal(run(context, "calculateWaterCost(2)"), 6);
  assert.equal(run(context, "calculateWaterCost(3)"), 12);
  assert.equal(run(context, "calculateWaterCost(4)"), 12);
  assert.equal(run(context, "calculateWaterCost(5)"), 18);
});

test("variable court slots derive total court-hours fee and highest-count capacity", () => {
  const context = createAppContext();
  const slots = [
    { startTime: "20:00", endTime: "21:00", courts: 3 },
    { startTime: "21:00", endTime: "22:00", courts: 2 }
  ];
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Test Court", "Test Area", 50)],
      sessions: [baseSession({ id: "variable-courts", courtSlots: slots, expectedPlayers: 6, totalPaid: 250 })]
    })
  );

  assert.deepEqual(jsonValue(context, "state.sessions[0].courtSlots"), slots);
  assert.equal(run(context, "state.sessions[0].startTime"), "20:00");
  assert.equal(run(context, "state.sessions[0].endTime"), "22:00");
  assert.equal(run(context, "state.sessions[0].bookedCourts"), 3);
  assert.equal(run(context, "state.sessions[0].expectedPlayers"), 18);
  assert.equal(run(context, "sessionCourtHours(state.sessions[0])"), 5);
  assert.equal(run(context, "calculateCourtFeeForSlots('court-1', state.sessions[0].courtSlots)"), 250);
  assert.equal(run(context, "allocateSession(state.sessions[0]).capacity"), 18);
  assert.equal(run(context, "sessionCourtCountLabel(state.sessions[0])"), "3 → 2");
  assert.deepEqual(jsonValue(context, "jsonFromFirestoreValue(firestoreValueFromJson(state.sessions[0].courtSlots))"), slots);

  const card = run(context, "renderSessionCard(state.sessions[0])");
  assert.match(card, /<span>Courts<\/span><strong>3 → 2<\/strong>/);
  assert.match(card, /8:00 to 9:00 PM/);
  assert.match(card, /9:00 to 10:00 PM/);
  assert.match(card, />3 courts</);
  assert.match(card, />2 courts</);
  assert.equal(run(context, "templateData(state.sessions[0]).planned_courts"), "3 → 2");
  assert.match(run(context, "buildBookingRequest(state.courts[0])"), /Total court-hours: 5/);
  assert.equal(
    run(context, "dashboardCourtSpend([{ court: state.courts[0], courtFee: 250, session: state.sessions[0] }])[0].detail"),
    "1 sessions, 5 court-hours"
  );
});

test("court slot validation rejects overlaps and supports overnight sequences", () => {
  const context = createAppContext();

  assert.equal(run(context, `validateCourtSlots([{ startTime: "20:00", endTime: "20:00", courts: 2 }]).valid`), false);
  assert.equal(
    run(context, `validateCourtSlots([
      { startTime: "20:00", endTime: "21:00", courts: 3 },
      { startTime: "20:30", endTime: "22:00", courts: 2 }
    ]).valid`),
    false
  );
  assert.match(
    run(context, `validateCourtSlots([
      { startTime: "20:00", endTime: "21:00", courts: 3 },
      { startTime: "20:30", endTime: "22:00", courts: 2 }
    ]).message`),
    /overlaps/
  );
  assert.equal(
    run(context, `courtSlotCourtHours([
      { startTime: "23:00", endTime: "00:00", courts: 2 },
      { startTime: "00:00", endTime: "01:00", courts: 1 }
    ])`),
    3
  );
});

test("legacy single-allocation sessions keep their stored capacity until edited", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ sessions: [baseSession({ expectedPlayers: 4, bookedCourts: 2, plannedCourts: 2 })] }));

  assert.equal(run(context, "Object.hasOwn(state.sessions[0], 'courtSlots')"), false);
  assert.deepEqual(jsonValue(context, "sessionCourtSlots(state.sessions[0])"), [
    { startTime: "19:00", endTime: "21:00", courts: 2 }
  ]);
  assert.equal(run(context, "allocateSession(state.sessions[0]).capacity"), 4);
});

test("court slot changes are part of the protected session financial basis", () => {
  const context = createAppContext();
  context.__current = baseSession({
    courtSlots: [{ startTime: "20:00", endTime: "22:00", courts: 2 }],
    startTime: "20:00",
    endTime: "22:00",
    bookedCourts: 2,
    plannedCourts: 2
  });
  context.__same = { ...context.__current, courtSlots: [{ startTime: "20:00", endTime: "22:00", courts: 2 }] };
  context.__changed = {
    ...context.__current,
    courtSlots: [
      { startTime: "20:00", endTime: "21:00", courts: 3 },
      { startTime: "21:00", endTime: "22:00", courts: 2 }
    ],
    bookedCourts: 3,
    plannedCourts: 3
  };

  assert.equal(run(context, "sessionFinancialBasisChanged(__current, __same)"), false);
  assert.equal(run(context, "sessionFinancialBasisChanged(__current, __changed)"), true);
});

test("session date defaults choose friday saturday and flexiday timings", () => {
  const context = createAppContext();

  assert.equal(run(context, 'sessionTypeForDate("2026-07-10")'), "Friday");
  assert.deepEqual(jsonValue(context, 'sessionDefaultTimesForDate("2026-07-10")'), { startTime: "19:00", endTime: "21:00" });
  assert.equal(run(context, 'sessionTypeForDate("2026-07-11")'), "Saturday");
  assert.deepEqual(jsonValue(context, 'sessionDefaultTimesForDate("2026-07-11")'), { startTime: "18:00", endTime: "20:00" });
  assert.equal(run(context, 'sessionTypeForDate("2026-07-12")'), "FlexiDay");
  assert.deepEqual(jsonValue(context, 'sessionDefaultTimesForDate("2026-07-12")'), { startTime: "20:00", endTime: "22:00" });
});

test("session date change updates modal type and time defaults", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ courts: [court("court-booking", "Booking")] }));

  const result = jsonValue(
    context,
    `(() => {
      const form = {
        dataset: {},
        elements: {
          date: { value: "2026-07-11" },
          type: { value: "Friday" },
          startTime: { value: "19:00" },
          endTime: { value: "21:00" },
          courts: { value: "2" },
          courtId: { value: "court-booking" },
          expectedPlayers: { value: "", dataset: {} },
          totalPaid: { value: "", dataset: {} },
          shuttleCost: { value: "5" },
          waterCost: { value: "", dataset: {} },
          perPersonAmount: { value: "", dataset: {} }
        },
        querySelector(selector) {
          return selector === "[data-court-fee-input]" ? this.elements.totalPaid : null;
        }
      };
      applySessionDateDefaults(form);
      return {
        type: form.elements.type.value,
        startTime: form.elements.startTime.value,
        endTime: form.elements.endTime.value,
        expectedPlayers: form.elements.expectedPlayers.value,
        waterCost: form.elements.waterCost.value,
        perPersonAmount: form.elements.perPersonAmount.value
      };
    })()`
  );

  assert.deepEqual(result, { type: "Saturday", startTime: "18:00", endTime: "20:00", expectedPlayers: 12, waterCost: 6, perPersonAmount: 22 });
});

test("session defaults validate every configurable schedule and amount", () => {
  const context = createAppContext();

  assert.equal(run(context, "validateSessionSettingsCandidate(emptyState().settings).valid"), true);
  assert.match(
    run(context, 'validateSessionSettingsCandidate({ ...emptyState().settings, defaultFridayStartTime: "18:15" }).message'),
    /30-minute intervals/
  );
  assert.match(
    run(context, "validateSessionSettingsCandidate({ ...emptyState().settings, defaultSaturdayCourts: 0 }).message"),
    /between 1 and 20/
  );
  assert.match(
    run(context, "validateSessionSettingsCandidate({ ...emptyState().settings, defaultShuttleCost: -1 }).message"),
    /zero or more/
  );
  assert.match(
    run(context, "validateSessionSettingsCandidate({ ...emptyState().settings, defaultRecurrenceWeeks: 54 }).message"),
    /between 1 and 53/
  );
});

test("session defaults drive the complete new-session form", () => {
  const context = createAppContext();
  installFakeDate(context, "2026-07-03T10:00:00");
  setAppState(
    context,
    baseFixture({
      courts: [court("court-a", "Alpha", "Area", 45), court("court-b", "Bravo", "Area", 60)],
      settings: {
        defaultSessionWeekday: 6,
        defaultCourtId: "court-b",
        defaultPlayersPerCourt: 5,
        defaultShuttleCost: 7,
        defaultWaterCostPerTwoCourts: 4,
        defaultSaturdayStartTime: "18:30",
        defaultSaturdayEndTime: "20:30",
        defaultSaturdayCourts: 3,
        autoCalculateCourtFee: false,
        defaultCourtFee: 180,
        autoCalculateWaterCost: false,
        defaultWaterCost: 9,
        autoCalculatePerPersonRate: false,
        defaultPerPersonAmount: 16,
        defaultRecurrence: "weekly",
        defaultRecurrenceWeeks: 5
      }
    })
  );

  const html = run(context, "renderSessionModal()");
  assert.match(html, /type="date"[^>]*value="2026-07-04"/);
  assert.match(html, /<option value="Saturday" selected>Saturday<\/option>/);
  assert.match(html, /<option value="court-b" selected>Bravo<\/option>/);
  assert.match(html, /name="slotStartTime"[^>]*value="18:30"/);
  assert.match(html, /name="slotEndTime"[^>]*value="20:30"/);
  assert.match(html, /name="slotCourts"[^>]*value="3"/);
  assert.match(html, /name="expectedPlayers"[^>]*value="15"/);
  assert.match(html, /name="totalPaid"[^>]*value="180"[^>]*data-manual="true"/);
  assert.match(html, /name="waterCost"[^>]*value="9"[^>]*data-manual="true"/);
  assert.match(html, /name="shuttleCost"[^>]*value="7"/);
  assert.match(html, /name="perPersonAmount"[^>]*value="16"[^>]*data-manual="true"/);
  assert.match(html, /name="recurrence" value="weekly"[^>]*checked/);
  assert.match(html, /name="recurrenceEndDate"[^>]*value="2026-08-01"/);
  assert.match(html, /data-session-recurrence-summary>5 sessions/);
  assert.match(html, />Create Sessions<\/button>/);

  const settingsHtml = run(context, "renderSessionDefaultsSettings()");
  assert.match(settingsHtml, /data-form="session-defaults"/);
  assert.match(settingsHtml, /name="defaultSessionWeekday"/);
  assert.match(settingsHtml, /name="defaultCourtId"/);
  assert.match(settingsHtml, /name="defaultSaturdayStartTime"/);
  assert.match(settingsHtml, /name="defaultRecurrenceWeeks"/);
  assert.match(settingsHtml, /Save Session Defaults/);
});

test("weekly recurrence builds an inclusive bounded date plan", () => {
  const context = createAppContext();

  assert.deepEqual(jsonValue(context, 'buildSessionRecurrencePlan("2026-07-18", "weekly", "2026-08-15").dates'), [
    "2026-07-18",
    "2026-07-25",
    "2026-08-01",
    "2026-08-08",
    "2026-08-15"
  ]);
  assert.equal(run(context, 'weeklyRecurrenceEndDate("2026-07-18", 5)'), "2026-08-15");
  assert.match(
    run(context, 'buildSessionRecurrencePlan("2026-07-18", "weekly", "2026-07-17").message'),
    /cannot be before/
  );
  assert.match(
    run(context, 'buildSessionRecurrencePlan("2026-07-18", "weekly", addDaysIso("2026-07-18", 53 * 7)).message'),
    /at most 53/
  );
});

test("weekly creation produces independent sessions and blocks partial duplicate batches", () => {
  const context = createAppContext();
  setAppState(context, baseFixture());
  context.__recurrenceBase = {
    type: "Saturday",
    date: "2026-07-18",
    startTime: "18:00",
    endTime: "20:00",
    courtId: "court-1",
    courtSlots: [{ startTime: "18:00", endTime: "20:00", courts: 3 }],
    plannedCourts: 3,
    bookedCourts: 3,
    playersPerCourt: 6,
    expectedPlayers: 18,
    totalPaid: 300,
    shuttleCost: 5,
    waterCost: 12,
    perPersonAmount: 18,
    stage: "Draft",
    bookingStatus: "Pre-booked",
    pollStatus: "Draft"
  };
  const creation = jsonValue(
    context,
    '__creation = buildNewSessionRecords(__recurrenceBase, { frequency: "weekly", endDate: "2026-08-15" }, [])'
  );

  assert.equal(creation.valid, true);
  assert.equal(creation.records.length, 5);
  assert.equal(new Set(creation.records.map((session) => session.id)).size, 5);
  assert.equal(new Set(creation.records.map((session) => session.recurrence.id)).size, 1);
  assert.deepEqual(creation.records.map((session) => session.recurrence.sequence), [1, 2, 3, 4, 5]);
  assert.ok(creation.records.every((session) => session.groupId === "group-saturday"));
  assert.deepEqual(
    jsonValue(context, "jsonFromFirestoreValue(firestoreValueFromJson(__creation.records[0].recurrence))"),
    creation.records[0].recurrence
  );

  run(context, "__creation.records[1].courtSlots[0].courts = 2; __creation.records[1].totalPaid = 200");
  assert.equal(run(context, "__creation.records[0].courtSlots[0].courts"), 3);
  assert.equal(run(context, "__creation.records[0].totalPaid"), 300);
  assert.notEqual(run(context, "__creation.records[0].responses === __creation.records[1].responses"), true);

  context.__existingConflict = { ...context.__recurrenceBase, date: "2026-08-01" };
  const duplicate = jsonValue(
    context,
    '__duplicate = buildNewSessionRecords(__recurrenceBase, { frequency: "weekly", endDate: "2026-08-15" }, [__existingConflict])'
  );
  assert.equal(duplicate.valid, false);
  assert.equal(duplicate.records.length, 0);
  assert.match(duplicate.message, /No sessions were created/);
});

test("one recurring occurrence can be edited or cancelled without changing the others", () => {
  const context = createAppContext();
  setAppState(context, baseFixture());
  context.__recurrenceBase = {
    type: "Saturday",
    date: "2026-07-18",
    startTime: "18:00",
    endTime: "20:00",
    courtId: "court-1",
    courtSlots: [{ startTime: "18:00", endTime: "20:00", courts: 3 }],
    plannedCourts: 3,
    bookedCourts: 3,
    playersPerCourt: 6,
    expectedPlayers: 18,
    totalPaid: 300,
    shuttleCost: 5,
    waterCost: 12,
    perPersonAmount: 18,
    stage: "Draft",
    bookingStatus: "Pre-booked",
    pollStatus: "Draft"
  };
  const records = jsonValue(
    context,
    'buildNewSessionRecords(__recurrenceBase, { frequency: "weekly", endDate: "2026-08-15" }, []).records'
  );
  setAppState(context, baseFixture({ sessions: records }));
  const cancelledId = records[1].id;
  const retainedIds = records.filter((session) => session.id !== cancelledId).map((session) => session.id);

  run(context, `state.sessions.find((session) => session.id === ${JSON.stringify(records[2].id)}).totalPaid = 240`);
  assert.equal(run(context, `state.sessions.find((session) => session.id === ${JSON.stringify(records[0].id)}).totalPaid`), 300);
  const editHtml = run(context, `renderSessionModal(${JSON.stringify(records[2].id)})`);
  assert.doesNotMatch(editHtml, /data-session-recurrence-source/);

  run(context, "showToast = () => {};");
  context.__deleteTarget = { dataset: { deleteType: "session", session: cancelledId } };
  assert.equal(run(context, "executeConfirmedDelete(__deleteTarget)"), true);
  assert.equal(run(context, "state.sessions.length"), 4);
  assert.equal(run(context, `Boolean(state.sessions.find((session) => session.id === ${JSON.stringify(cancelledId)}))`), false);
  assert.deepEqual(jsonValue(context, "state.sessions.map((session) => session.id)"), retainedIds);
});

test("message court placeholder uses venue suffix after at-sign with area", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Bat & Ball Sports @ ENS", "Al Manaseer")],
      sessions: [baseSession({ courtId: "court-1" })]
    })
  );

  assert.equal(run(context, "templateData(state.sessions[0]).court_name"), "ENS, Al Manaseer");
  assert.match(run(context, "buildPollMessage(state.sessions[0])"), /ENS, Al Manaseer/);
});

test("message court placeholder keeps full venue name when there is no at-sign", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Booking", "Area not set")],
      sessions: [baseSession({ courtId: "court-1" })]
    })
  );

  assert.equal(run(context, "templateData(state.sessions[0]).court_name"), "Booking, Area not set");
});

test("voter list uses stacked up and down arrow controls", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Kabilesh", "Intermediate"), player("p2", "Aishu", "Beginner")],
      sessions: [
        baseSession({
          id: "session-a",
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 1,
              racketNeeded: false,
              rawOptions: ["I'm in +1"]
            },
            {
              id: "response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const html = run(context, 'renderSessionPlayersModal("session-a")');
  assert.match(html, /data-vote-reorder-list/);
  assert.match(html, /data-vote-response-group/);
  assert.match(html, /quick-vote-reorder/);
  assert.match(html, /data-action="move-response-up"/);
  assert.match(html, /data-action="move-response-down"/);
  assert.match(html, /data-action="move-response-up"[^>]*data-response="response-1"[^>]*disabled/);
  assert.match(html, /data-action="move-response-down"[^>]*data-response="response-2"[^>]*disabled/);
  assert.doesNotMatch(html, /data-vote-drag-handle/);
});

test("modal picker rows keep stable box sizes on iphone widths", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const sessionPlayersModal = css.match(/\.session-players-modal\s*\{[^}]+\}/)?.[0] || "";
  const quickVoteButton = css.match(/\.quick-vote-item \.btn\.icon-only\s*\{[^}]+\}/)?.[0] || "";
  const quickVoteReorder = css.match(/\.quick-vote-reorder\s*\{[^}]+\}/)?.[0] || "";
  const quickVoteReorderButton = css.match(/\.quick-vote-reorder \.btn\.icon-only\s*\{[^}]+\}/)?.[0] || "";

  assert.match(sessionPlayersModal, /var\(--visual-viewport-height/);
  assert.match(quickVoteButton, /width:\s*44px/);
  assert.match(quickVoteButton, /height:\s*44px/);
  assert.match(quickVoteButton, /padding:\s*0/);
  assert.match(quickVoteReorder, /grid-template-rows:\s*repeat\(2,\s*21px\)/);
  assert.match(quickVoteReorder, /gap:\s*2px/);
  assert.match(quickVoteReorderButton, /height:\s*21px/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.btn\.icon-only,[\s\S]*?\.modal-card \.icon-button\s*\{[^}]*padding:\s*0 !important/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.quick-vote-item \.btn\.icon-only\s*\{[^}]*height:\s*44px !important[^}]*min-height:\s*44px !important/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.quick-vote-reorder \.btn\.icon-only\s*\{[^}]*height:\s*21px !important[^}]*min-height:\s*21px !important/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.quick-vote-name-field \.input,[\s\S]*?\.modal-card \.payment-group-guest-item \.input\s*\{[^}]*height:\s*44px !important/);
});

test("compact mobile modals size to content instead of full screen", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const mobileSharedModalBlock = css.match(/@media \(max-width:\s*640px\)[\s\S]*?\.modal-card,\s*\.session-players-modal\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(mobileSharedModalBlock);
  assert.doesNotMatch(mobileSharedModalBlock[1], /(^|\n)\s*height\s*:/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.session-players-modal\s*\{[^}]*height:\s*calc\(var\(--visual-viewport-height/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.confirm-modal,\s*\.stage-picker-modal\s*\{[^}]*align-self:\s*center/);
  const iphoneSharedModalBlock = css.match(/@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card,\s*\.session-players-modal\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(iphoneSharedModalBlock);
  assert.doesNotMatch(iphoneSharedModalBlock[1], /(^|\n)\s*height\s*:/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.session-players-modal\s*\{[^}]*height:\s*calc\(var\(--visual-viewport-height[^}]*!important/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.confirm-modal,\s*\.stage-picker-modal\s*\{[^}]*align-self:\s*center !important/);
});

test("move arrow reorder renumbers session responses", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "One"), player("p2", "Two"), player("p3", "Three")],
      sessions: [
        baseSession({
          responses: [
            { id: "response-1", playerId: "p1", voteOrder: 1, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-2", playerId: "p2", voteOrder: 2, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-3", playerId: "p3", voteOrder: 3, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'moveSessionResponse(state.sessions[0], "response-1", -1)'), false);
  assert.equal(run(context, 'moveSessionResponse(state.sessions[0], "response-1", 1)'), true);
  assert.deepEqual(jsonValue(context, "state.sessions[0].responses.map((response) => response.id)"), [
    "response-2",
    "response-1",
    "response-3"
  ]);
  assert.deepEqual(jsonValue(context, "state.sessions[0].responses.map((response) => response.voteOrder)"), [1, 2, 3]);
});

test("auto attendance keeps following confirmed voters after the modal was opened once", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Cancelled"), player("p2", "Still In"), player("p3", "Waitlist In")],
      sessions: [
        baseSession({
          id: "session-a",
          expectedPlayers: 2,
          responses: [
            { id: "response-1", playerId: "p1", voteOrder: 1, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-2", playerId: "p2", voteOrder: 2, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-3", playerId: "p3", voteOrder: 3, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] }
          ]
        })
      ]
    })
  );

  run(context, "ensureSessionAttendance(state.sessions[0])");
  assert.deepEqual(jsonValue(context, "state.sessions[0].attendedPlayerIds"), ["p1", "p2"]);

  run(context, `state.sessions[0].responses.find((response) => response.id === "response-1").attendanceChoice = "not_playing"`);
  run(context, "syncSessionPayments(state.sessions[0])");

  assert.deepEqual(jsonValue(context, "effectiveAttendedPlayerIds(state.sessions[0])"), ["p2", "p3"]);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), ["Still In", "Waitlist In"]);
  assert.deepEqual(jsonValue(context, "Object.keys(state.sessions[0].payments).sort()"), ["p2", "p3"]);
});

test("attendance-only players stay while voter-derived attendance resyncs", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [
        player("p1", "Cancelled"),
        player("p2", "Still In"),
        player("p3", "Waitlist In"),
        player("p4", "Walk In")
      ],
      sessions: [
        baseSession({
          id: "session-a",
          expectedPlayers: 2,
          attendedPlayerIds: ["p1", "p2", "p4"],
          responses: [
            { id: "response-1", playerId: "p1", voteOrder: 1, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-2", playerId: "p2", voteOrder: 2, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-3", playerId: "p3", voteOrder: 3, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] }
          ]
        })
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "effectiveAttendedPlayerIds(state.sessions[0])"), ["p1", "p2", "p4"]);

  run(context, `state.sessions[0].responses.find((response) => response.id === "response-1").attendanceChoice = "not_playing"`);
  run(context, "syncSessionPayments(state.sessions[0])");

  assert.deepEqual(jsonValue(context, "effectiveAttendedPlayerIds(state.sessions[0])"), ["p2", "p3", "p4"]);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), ["Still In", "Waitlist In", "Walk In"]);
  assert.deepEqual(jsonValue(context, "Object.keys(state.sessions[0].payments).sort()"), ["p2", "p3", "p4"]);
});

test("adding an attendance-only player does not lock voter attendance or add a vote", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [
        player("p1", "Cancelled"),
        player("p2", "Still In"),
        player("p3", "Waitlist In"),
        player("p4", "Walk In")
      ],
      sessions: [
        baseSession({
          id: "session-a",
          expectedPlayers: 2,
          responses: [
            { id: "response-1", playerId: "p1", voteOrder: 1, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-2", playerId: "p2", voteOrder: 2, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-3", playerId: "p3", voteOrder: 3, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'addManualAttendedPlayer(state.sessions[0], "p4")'), true);
  assert.equal(run(context, "state.sessions[0].attendanceManual"), false);
  assert.deepEqual(jsonValue(context, "state.sessions[0].manualAttendedPlayerIds"), ["p4"]);
  assert.deepEqual(jsonValue(context, "state.sessions[0].responses.map((response) => response.playerId)"), ["p1", "p2", "p3"]);

  run(context, `state.sessions[0].responses.find((response) => response.id === "response-1").attendanceChoice = "not_playing"`);
  run(context, "syncSessionPayments(state.sessions[0])");

  assert.deepEqual(jsonValue(context, "effectiveAttendedPlayerIds(state.sessions[0])"), ["p2", "p3", "p4"]);
});

test("extra confirmed players can be added after attendance is manually controlled", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Confirmed Voter"), player("p2", "Removed Voter"), player("p3", "Extra Player")],
      sessions: [
        baseSession({
          id: "session-a",
          expectedPlayers: 2,
          attendanceManual: true,
          attendedPlayerIds: ["p1"],
          responses: [
            { id: "response-1", playerId: "p1", voteOrder: 1, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] },
            { id: "response-2", playerId: "p2", voteOrder: 2, attendanceChoice: "in", guestCount: 0, racketNeeded: false, rawOptions: ["I'm in"] }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'addManualAttendedPlayer(state.sessions[0], "p3")'), true);

  assert.deepEqual(jsonValue(context, "state.sessions[0].manualAttendedPlayerIds"), ["p3"]);
  assert.deepEqual(jsonValue(context, "state.sessions[0].attendedPlayerIds"), ["p1", "p3"]);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), ["Confirmed Voter", "Extra Player"]);
  assert.deepEqual(jsonValue(context, "Object.keys(state.sessions[0].payments).sort()"), ["p1", "p3"]);
});

test("poll players can have more than two admin-added guests and payments scale", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Kabilesh", "Intermediate")],
      sessions: [
        baseSession({
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in_plus_2",
              guestCount: 2,
              racketNeeded: false,
              rawOptions: ["I'm in +2"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'addResponseGuest(state.sessions[0], "response-1")'), true);
  assert.equal(run(context, 'addResponseGuest(state.sessions[0], "response-1")'), true);

  assert.equal(run(context, "state.sessions[0].responses[0].guestCount"), 4);
  assert.equal(run(context, "state.sessions[0].responses[0].attendanceChoice"), "in_plus_2");
  assert.equal(run(context, "state.sessions[0].payments.p1.guestCount"), 4);
  assert.equal(run(context, "state.sessions[0].payments.p1.amount"), 100);
});

test("manual confirmed players can add guests without entering the voter list", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("walkin", "Walk In", "Beginner")],
      sessions: [
        baseSession({
          attendanceManual: true,
          attendedPlayerIds: ["walkin"],
          responses: []
        })
      ]
    })
  );

  assert.equal(run(context, 'addManualAttendanceGuest(state.sessions[0], "walkin")'), true);
  assert.equal(run(context, 'addManualAttendanceGuest(state.sessions[0], "walkin")'), true);

  assert.equal(run(context, "state.sessions[0].responses.length"), 0);
  assert.equal(run(context, "state.sessions[0].manualGuestCounts.walkin"), 2);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), [
    "Walk In",
    "Walk In Guest 1",
    "Walk In Guest 2"
  ]);
  assert.equal(run(context, "state.sessions[0].payments.walkin.guestCount"), 2);
  assert.equal(run(context, "state.sessions[0].payments.walkin.amount"), 60);
});

test("attendance-only guests for poll voters do not update voter guest count", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Kabilesh", "Intermediate")],
      sessions: [
        baseSession({
          id: "session-a",
          attendanceManual: true,
          attendedPlayerIds: ["p1"],
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'addManualAttendanceGuest(state.sessions[0], "p1")'), true);

  assert.equal(run(context, "state.sessions[0].responses[0].guestCount"), 0);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), [
    "Kabilesh",
    "Kabilesh Guest 1"
  ]);
  assert.equal(run(context, "state.sessions[0].payments.p1.guestCount"), 1);
  assert.equal(run(context, "state.sessions[0].payments.p1.amount"), 40);
});

test("manual attendance does not pull waiting-list guests into payments", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Main", "Intermediate"), player("p2", "Walk In", "Beginner")],
      sessions: [
        baseSession({
          id: "session-a",
          expectedPlayers: 1,
          attendanceManual: true,
          attendedPlayerIds: ["p1", "p2"],
          responses: [
            {
              id: "response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in_plus_1",
              guestCount: 1,
              racketNeeded: false,
              rawOptions: ["I'm in +1"]
            }
          ]
        })
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "allocateSession(state.sessions[0]).waiting.map((entry) => entry.name)"), ["Main Guest 1"]);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).map((entry) => entry.name)"), ["Main", "Walk In"]);
  assert.equal(run(context, "state.sessions[0].payments.p1.guestCount"), 0);
  assert.equal(run(context, "state.sessions[0].payments.p1.amount"), 20);
  assert.equal(run(context, "state.sessions[0].payments.p2.amount"), 20);
});

test("attendance guests are numbered in the displayed attendance sequence", () => {
  const context = createAppContext();
  const players = Array.from({ length: 12 }, (_, index) => player(`p${index + 1}`, index === 11 ? "Savan" : `Player ${index + 1}`));
  const responses = players.map((item, index) => ({
    id: `response-${index + 1}`,
    playerId: item.id,
    voteOrder: index + 1,
    attendanceChoice: "in",
    guestCount: 0,
    racketNeeded: false,
    rawOptions: ["I'm in"]
  }));
  setAppState(
    context,
    baseFixture({
      players,
      sessions: [
        baseSession({
          id: "session-a",
          bookedCourts: 2,
          expectedPlayers: 12,
          attendanceManual: true,
          attendedPlayerIds: players.map((item) => item.id),
          responses
        })
      ]
    })
  );

  assert.equal(run(context, 'addManualAttendanceGuest(state.sessions[0], "p12")'), true);
  assert.equal(run(context, "state.sessions[0].responses[11].guestCount"), 0);
  assert.deepEqual(jsonValue(context, "effectiveAttendedEntries(state.sessions[0]).slice(-2).map((entry) => entry.name)"), [
    "Savan",
    "Savan Guest 1"
  ]);

  const html = run(context, 'renderSessionAttendanceModal("session-a")');
  assert.match(html, />12\. Savan</);
  assert.match(html, /quick-vote-guest-number">13\.<\/span>/);
});

test("poll guest rows use the next participant number instead of decimal numbering", () => {
  const context = createAppContext();
  const players = Array.from({ length: 14 }, (_, index) => player(`p${index + 1}`, `Player ${index + 1}`));
  const responses = players.map((item, index) => {
    const isThirteenthPlayer = index === 12;
    return {
      id: `response-${index + 1}`,
      playerId: item.id,
      voteOrder: index + 1,
      attendanceChoice: isThirteenthPlayer ? "in_plus_1" : "in",
      guestCount: isThirteenthPlayer ? 1 : 0,
      racketNeeded: false,
      rawOptions: [isThirteenthPlayer ? "I'm in +1" : "I'm in"]
    };
  });
  setAppState(
    context,
    baseFixture({
      players,
      sessions: [
        baseSession({
          id: "session-a",
          bookedCourts: 4,
          expectedPlayers: 16,
          responses
        })
      ]
    })
  );

  const html = run(context, "renderPollTab(state.sessions[0])");
  assert.match(html, /<span>13\.<\/span> Player 13/);
  assert.match(html, /poll-vote-card-guest[\s\S]*<span>14\.<\/span>[\s\S]*Player 13 Guest 1/);
  assert.match(html, /<span>15\.<\/span> Player 14/);
  assert.doesNotMatch(html, /13\.1\./);
});

test("organizer free seat still charges organizer guests", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      settings: { organizerPlayerId: "org" },
      players: [player("org", "Organizer", "Intermediate")],
      sessions: [
        baseSession({
          responses: [
            {
              id: "response-org",
              playerId: "org",
              voteOrder: 1,
              attendanceChoice: "in_plus_1",
              guestCount: 1,
              racketNeeded: false,
              rawOptions: ["I'm in +1"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, "state.sessions[0].payments.org.units"), 2);
  assert.equal(run(context, "state.sessions[0].payments.org.chargeableUnits"), 1);
  assert.equal(run(context, "state.sessions[0].payments.org.amount"), 20);
  assert.equal(run(context, "dashboardFinanceSnapshot(state.sessions).totalDue"), 20);
  assert.equal(run(context, "dashboardFinanceSnapshot(state.sessions).chargedPlayerTotal"), 20);
  assert.equal(run(context, "dashboardFinanceSnapshot(state.sessions).organizerChargeTotal"), -100);
});

test("upcoming sessions are excluded from balances and pending payment stats", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Past Court"), court("court-2", "Future Court")],
      players: [player("p1", "Future Proof")],
      sessions: [
        baseSession({
          id: "past-session",
          courtId: "court-1",
          date: isoDateFromToday(-1),
          perPersonAmount: 20,
          responses: [
            {
              id: "past-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        }),
        baseSession({
          id: "future-session",
          courtId: "court-2",
          date: isoDateFromToday(7),
          totalPaid: 140,
          perPersonAmount: 100,
          responses: [
            {
              id: "future-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'playerBalance("p1")'), 20);
  assert.equal(run(context, 'sessionStats(getSession("past-session")).pendingCount'), 1);
  assert.equal(run(context, 'sessionStats(getSession("future-session")).pendingCount'), 0);

  const snapshot = jsonValue(context, "buildDashboardData().financeSnapshot");
  assert.equal(snapshot.billableCourtFee, 120);
  assert.equal(snapshot.allCourtFee, 260);
  assert.equal(snapshot.upcomingCourtFee, 140);
  assert.deepEqual(snapshot.courtRows.map((row) => row.session.id), ["future-session", "past-session"]);

  const html = run(context, "renderDashboardFinancePanel(buildDashboardData())");
  assert.match(html, /Future Court[\s\S]*Pre-Booking[\s\S]*140 AED/);
  assert.match(html, /Past Court[\s\S]*Past[\s\S]*120 AED/);
  assert.doesNotMatch(html, /Player Collections/);
});

test("today sessions become collectible after the game end time", () => {
  const context = createAppContext();
  installFakeDate(context, "2026-07-03T13:00:00");
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Time Keeper")],
      sessions: [
        baseSession({
          id: "ended-today",
          date: "2026-07-03",
          startTime: "10:00",
          endTime: "12:00",
          perPersonAmount: 20,
          responses: [
            {
              id: "ended-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        }),
        baseSession({
          id: "later-today",
          date: "2026-07-03",
          startTime: "14:00",
          endTime: "15:00",
          perPersonAmount: 100,
          responses: [
            {
              id: "later-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'sessionIsCollectible(getSession("ended-today"))'), true);
  assert.equal(run(context, 'sessionIsCollectible(getSession("later-today"))'), false);
  assert.equal(run(context, 'playerBalance("p1")'), 20);
  assert.equal(run(context, 'sessionStats(getSession("ended-today")).pendingCount'), 1);
  assert.equal(run(context, 'sessionStats(getSession("later-today")).pendingCount'), 0);
});

test("advance credit marks covered session payments as paid", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Advance Player")],
      advances: { p1: 20 },
      sessions: [
        baseSession({
          id: "covered-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "covered-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'paymentEffectiveStatus(getSession("covered-session"), getSession("covered-session").payments.p1)'), "Paid");
  assert.equal(run(context, 'paymentOutstandingAfterCoverage(getSession("covered-session").payments.p1, getSession("covered-session"))'), 0);
  assert.equal(run(context, 'sessionStats(getSession("covered-session")).paidCount'), 1);
  assert.equal(run(context, 'sessionStats(getSession("covered-session")).pendingCount'), 0);
  assert.equal(run(context, 'playerBalance("p1")'), 0);
});

test("partial advance leaves the remaining session amount pending", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Partial Advance")],
      advances: { p1: 5 },
      sessions: [
        baseSession({
          id: "partial-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "partial-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'paymentEffectiveStatus(getSession("partial-session"), getSession("partial-session").payments.p1)'), "Partial");
  assert.equal(run(context, 'paymentOutstandingAfterCoverage(getSession("partial-session").payments.p1, getSession("partial-session"))'), 15);
  assert.equal(run(context, 'sessionStats(getSession("partial-session")).pendingAmount'), 15);
  assert.equal(run(context, 'playerBalance("p1")'), 15);
});

test("dashboard separates Advance and Credit coverage from cash collections", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("advance", "Dashboard Advance"), player("credit", "Dashboard Credit")],
      advances: { credit: 20 },
      paymentTransactions: [
        {
          id: "dashboard-advance",
          createdAt: `${isoDateFromToday(-1)}T10:00:00.000Z`,
          type: "advance-payment",
          separateAdvance: true,
          date: isoDateFromToday(-1),
          paidById: "advance",
          playerIds: ["advance"],
          amountPaid: 20,
          appliedAmount: 0,
          advanceAmount: 20,
          allocations: [{ type: "advance", playerId: "advance", amount: 20 }]
        }
      ],
      sessions: [
        baseSession({
          id: "dashboard-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "dashboard-advance-response",
              playerId: "advance",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "dashboard-credit-response",
              playerId: "credit",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "dashboardPaymentTotals(state.sessions)"), {
    due: 40,
    cashApplied: 0,
    advanceApplied: 20,
    creditApplied: 20,
    covered: 40,
    outstanding: 0
  });
  assert.equal(run(context, 'dashboardFinanceSnapshot(state.sessions).totalCollected'), 0);
  assert.equal(run(context, 'dashboardFinanceSnapshot(state.sessions).totalDue'), 0);
  assert.equal(run(context, 'buildDashboardData().advanceTotal'), 0);
  assert.equal(run(context, 'buildDashboardData().creditTotal'), 0);
  const chartHtml = run(context, "renderDashboardCollectionChart(buildDashboardData())");
  assert.match(chartHtml, /Cash Collected[\s\S]*0 AED/);
  assert.match(chartHtml, /Advance Applied[\s\S]*20 AED/);
  assert.match(chartHtml, /Credit Applied[\s\S]*20 AED/);
  assert.equal(run(context, 'normalizeStage(getSession("dashboard-session").stage)'), "Completed");
});

test("dashboard court fee collected card excludes shuttle fees", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Shuttle Split"), player("p2", "Shuttle Pending")],
      sessions: [
        baseSession({
          id: "shuttle-split-session",
          totalPaid: 60,
          perPersonAmount: 25,
          shuttleCost: 5,
          responses: [
            {
              id: "shuttle-split-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "shuttle-split-response-pending",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );
  run(
    context,
    `
      const session = getSession("shuttle-split-session");
      session.payments.p1.paidAmount = 25;
      session.payments.p1.status = "Paid";
    `
  );

  const snapshot = jsonValue(context, "dashboardFinanceSnapshot(state.sessions)");
  assert.equal(snapshot.totalCollected, 20);
  assert.equal(snapshot.shuttleCollected, 5);
  assert.equal(snapshot.totalDue, 20);
  assert.equal(snapshot.shuttleDue, 5);
  assert.equal(snapshot.chargedPlayerTotal, 50);
  assert.equal(snapshot.organizerChargeTotal, -10);

  const html = run(context, "renderDashboardFinancePanel(buildDashboardData())");
  assert.doesNotMatch(html, /aria-label="Open payments"/);
  assert.doesNotMatch(html, /Total Player Collected/);
  assert.doesNotMatch(html, /Player Due/);
  assert.doesNotMatch(html, /Organizer Share/);
  assert.doesNotMatch(html, /Water Collected/);
  assert.doesNotMatch(html, /Water Spent/);
  assert.doesNotMatch(html, /Activity Dues/);
  assert.doesNotMatch(html, /Organizer Charges/);
  assert.match(html, /Court Cash Collected[\s\S]*20 AED[\s\S]*20 AED pending/);
  assert.match(html, /Shuttle Cash Collected[\s\S]*5 AED[\s\S]*5 AED pending/);
  assert.match(html, /Activity Cash Collected[\s\S]*0 AED[\s\S]*Clear/);
  assert.match(html, /Organizer Net[\s\S]*\(10 AED\)[\s\S]*Charged - Spent/);
  assert.ok(html.indexOf("Court Spent") < html.indexOf("Court Cash Collected"));
  assert.ok(html.indexOf("Court Cash Collected") < html.indexOf("Shuttle Spent"));
  assert.ok(html.indexOf("Shuttle Spent") < html.indexOf("Shuttle Cash Collected"));
  assert.ok(html.indexOf("Shuttle Cash Collected") < html.indexOf("Activity Spent"));
  assert.ok(html.indexOf("Activity Spent") < html.indexOf("Activity Cash Collected"));
  assert.ok(html.indexOf("Activity Cash Collected") < html.indexOf(">Advance<"));
  assert.ok(html.indexOf(">Advance<") < html.indexOf(">Credit<"));
  assert.ok(html.indexOf(">Credit<") < html.indexOf("Organizer Net"));
});

test("dashboard charged court and shuttle split never exceeds player charges", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "One"), player("p2", "Two")],
      sessions: [
        baseSession({
          id: "court-only-extension",
          totalPaid: 10,
          perPersonAmount: 4,
          shuttleCost: 5,
          responses: [
            {
              id: "extension-response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "extension-response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const charged = jsonValue(context, 'dashboardSessionChargedTotals(getSession("court-only-extension"))');
  const snapshot = jsonValue(context, "dashboardFinanceSnapshot(state.sessions)");
  assert.deepEqual(charged, { court: 0, shuttle: 8, total: 8, units: 2 });
  assert.equal(snapshot.chargedCourtTotal + snapshot.shuttleCharged, snapshot.chargedPlayerTotal);
  assert.equal(snapshot.totalCollected + snapshot.totalDue + snapshot.shuttleCollected + snapshot.shuttleDue, snapshot.chargedPlayerTotal);
});

test("dashboard water cost is organizer-owned", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Water One"), player("p2", "Water Two")],
      sessions: [
        baseSession({
          id: "water-session",
          totalPaid: 10,
          perPersonAmount: 13,
          shuttleCost: 5,
          waterCost: 6,
          responses: [
            {
              id: "water-response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "water-response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );
  run(
    context,
    `
      const session = getSession("water-session");
      session.payments.p1.paidAmount = 13;
      session.payments.p1.status = "Paid";
      session.payments.p2.paidAmount = 0;
      session.payments.p2.status = "Pending";
    `
  );

  const charged = jsonValue(context, 'dashboardSessionChargedTotals(getSession("water-session"))');
  const snapshot = jsonValue(context, "dashboardFinanceSnapshot(state.sessions)");
  assert.deepEqual(charged, { court: 16, shuttle: 10, total: 26, units: 2 });
  assert.equal(snapshot.billableWaterCost, 6);
  assert.equal(snapshot.totalCollected, 8);
  assert.equal(snapshot.totalDue, 8);
  assert.equal(snapshot.shuttleCollected, 5);
  assert.equal(snapshot.shuttleDue, 5);
  assert.equal(snapshot.organizerChargeTotal, 10);

  const html = run(context, "renderDashboardFinancePanel(buildDashboardData())");
  assert.doesNotMatch(html, /Water Collected/);
  assert.doesNotMatch(html, /Water Spent/);
});

test("dashboard upcoming readiness card estimates pending before game ends", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "One"), player("p2", "Two")],
      sessions: [
        baseSession({
          id: "upcoming-dashboard-session",
          date: isoDateFromToday(1),
          startTime: "18:00",
          endTime: "20:00",
          bookedCourts: 1,
          expectedPlayers: 2,
          perPersonAmount: 25,
          responses: [
            {
              id: "upcoming-response-1",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "upcoming-response-2",
              playerId: "p2",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'sessionStats(getSession("upcoming-dashboard-session")).pendingAmount'), 0);
  assert.equal(run(context, 'dashboardReadinessPendingAmount(getSession("upcoming-dashboard-session"))'), 50);

  const html = run(context, 'renderDashboardReadinessRow(getSession("upcoming-dashboard-session"))');
  assert.match(html, /50 AED<\/strong> pending/);
});

test("dashboard session pipeline includes future sessions", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      sessions: [
        baseSession({
          id: "future-pipeline-session",
          date: isoDateFromToday(5),
          stage: "Player List Published",
          responses: []
        })
      ]
    })
  );

  const data = jsonValue(context, "buildDashboardData().stageBreakdown");
  const playerListPublished = data.find((item) => item.stage === "Player List Published");
  assert.equal(playerListPublished.count, 1);

  const html = run(context, "renderDashboard()");
  assert.match(html, /All sessions, including future sessions, based on the session cards\./);
  assert.match(html, /Player List Published[\s\S]*<strong>1<\/strong>/);
});

test("dashboard court spend by venue includes future sessions", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      courts: [court("court-1", "Court One")],
      sessions: [
        baseSession({
          id: "past-court-spend",
          date: isoDateFromToday(-2),
          courtId: "court-1",
          totalPaid: 100
        }),
        baseSession({
          id: "future-court-spend",
          date: isoDateFromToday(5),
          courtId: "court-1",
          stage: "Player List Published",
          totalPaid: 120
        })
      ]
    })
  );

  const courtSpend = jsonValue(context, "buildDashboardData().courtSpend");
  assert.equal(courtSpend[0].amount, 220);
  assert.equal(courtSpend[0].sessions, 2);

  const html = run(context, "renderDashboard()");
  assert.match(html, /Last 90D plus future session court fees from saved sessions\./);
  assert.match(html, /Court One[\s\S]*220 AED[\s\S]*2 sessions/);
});

test("main dashboard does not render removed summary metric cards", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ sessions: [baseSession()] }));

  const html = run(context, "renderDashboard()");
  assert.doesNotMatch(html, /dashboard-summary-grid/);
  assert.doesNotMatch(html, /Outstanding to Collect/);
  assert.doesNotMatch(html, /Collection Rate/);
  assert.doesNotMatch(html, /Capacity Utilization/);
  assert.doesNotMatch(html, /Court Spend<\/p>/);
  assert.doesNotMatch(html, /Payment Priority/);
  assert.doesNotMatch(html, /Highest current dues after applying any advances/);
  assert.match(html, /Collection Status/);
  assert.match(html, /Player Signals/);
});

test("dashboard shows court and collection snapshot after collection status", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ sessions: [baseSession()] }));

  const html = run(context, "renderDashboard()");
  assert.ok(html.indexOf("Collection Status") < html.indexOf("Court and Collection Snapshot"));
  assert.ok(html.indexOf("Court and Collection Snapshot") < html.indexOf("Attendance Trend"));
});

test("activity dues also respect advance credit in finance views", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { member: 20 },
      activities: [
        {
          id: "dinner",
          name: "Dinner",
          date: isoDateFromToday(-1),
          totalPaid: 40,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 20, paidAmount: 20, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 20, paidAmount: 0, paidBySelf: false, status: "Pending" }
          }
        }
      ]
    })
  );

  assert.equal(run(context, 'activityOutstanding(state.activities[0])'), 20);
  assert.equal(run(context, 'activityOutstandingAfterCoverage(state.activities[0])'), 0);
  assert.deepEqual(jsonValue(context, "dashboardActivityTotals(state.activities)"), {
    spent: 40,
    due: 20,
    cashApplied: 0,
    advanceApplied: 0,
    creditApplied: 20,
    covered: 20,
    outstanding: 0
  });
  assert.equal(run(context, 'playerBalance("member")'), 0);
  assert.equal(run(context, 'playerRemainingCredit("member")'), 0);
});

test("dashboard activity summary excludes shuttle purchase logs", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer"), player("member", "Member")],
      activities: [
        {
          id: "shuttle-log",
          name: "Shuttle bought",
          date: isoDateFromToday(-1),
          totalPaid: 120,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 60, paidAmount: 60, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 60, paidAmount: 0, paidBySelf: false, status: "Pending" }
          }
        },
        {
          id: "dinner",
          name: "Dinner",
          date: isoDateFromToday(-1),
          totalPaid: 40,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 20, paidAmount: 20, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 20, paidAmount: 5, paidBySelf: false, status: "Pending" }
          }
        }
      ]
    })
  );

  const activityTotals = jsonValue(context, "dashboardActivityTotals(state.activities)");
  assert.deepEqual(activityTotals, {
    spent: 40,
    due: 20,
    cashApplied: 5,
    advanceApplied: 0,
    creditApplied: 0,
    covered: 5,
    outstanding: 15
  });
  assert.equal(run(context, "dashboardShuttleActivitySpent(state.activities)"), 120);

  const html = run(context, "renderDashboardFinancePanel(buildDashboardData())");
  assert.match(html, /Shuttle Spent[\s\S]*120 AED/);
  assert.match(html, /Activity Spent[\s\S]*40 AED/);
  assert.match(html, /Activity Cash Collected[\s\S]*5 AED[\s\S]*15 AED pending/);
  assert.match(html, /Organizer Net[\s\S]*\(120 AED\)[\s\S]*Charged - Spent/);
  assert.doesNotMatch(html, /Player Due/);
  assert.doesNotMatch(html, /Organizer Share/);
  assert.doesNotMatch(html, /Water Collected/);
  assert.doesNotMatch(html, /Water Spent/);
  assert.doesNotMatch(html, /Activity Dues/);
  assert.ok(html.indexOf("Court Spent") < html.indexOf("Court Cash Collected"));
  assert.ok(html.indexOf("Court Cash Collected") < html.indexOf("Shuttle Spent"));
  assert.ok(html.indexOf("Shuttle Spent") < html.indexOf("Activity Spent"));
  assert.ok(html.indexOf("Activity Spent") < html.indexOf("Activity Cash Collected"));
  assert.ok(html.indexOf("Activity Cash Collected") < html.indexOf(">Advance<"));
  assert.ok(html.indexOf(">Advance<") < html.indexOf(">Credit<"));
  assert.ok(html.indexOf(">Credit<") < html.indexOf("Organizer Net"));

  const paymentsHtml = run(context, "renderPayments()");
  assert.ok(paymentsHtml.indexOf("Activities") < paymentsHtml.indexOf("Shuttle Spent"));
  assert.match(paymentsHtml, /Shuttle Spent[\s\S]*120 AED logged for shuttle purchases/);
  assert.match(paymentsHtml, /Shuttle Purchases[\s\S]*120 AED/);
  assert.match(paymentsHtml, /data-action="open-shuttle-purchase-modal"/);
  assert.match(paymentsHtml, /data-action="open-shuttle-spent-history"/);
  assert.equal((paymentsHtml.match(/shuttle-spent-summary-card/g) || []).length, 1);
  assert.doesNotMatch(paymentsHtml, /Shuttle bought/);
  const activitiesSection = paymentsHtml.slice(paymentsHtml.indexOf("<h2>Activities</h2>"), paymentsHtml.indexOf("<h2>Shuttle Spent</h2>"));
  assert.doesNotMatch(activitiesSection, /Shuttle bought/);
  assert.match(activitiesSection, /Dinner/);

  const shuttleHistoryHtml = run(context, "renderShuttleSpentHistoryModal()");
  assert.match(shuttleHistoryHtml, /Shuttle Purchase History[\s\S]*120 AED across 1 purchase/);
  assert.match(shuttleHistoryHtml, /Shuttle bought[\s\S]*120 AED/);

  const memberHistory = run(context, "buildPlayerPaymentHistoryCopy('member')");
  assert.doesNotMatch(memberHistory, /Shuttle bought/);
  assert.match(memberHistory, /Dinner/);
});

test("dashboard financial totals are normalized to currency precision", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer"), player("member", "Member")],
      activities: [
        {
          id: "decimal-a",
          name: "Decimal A",
          date: isoDateFromToday(-2),
          totalPaid: 0.2,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 0.1, paidAmount: 0.1, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 0.1, paidAmount: 0, paidBySelf: false, status: "Pending" }
          }
        },
        {
          id: "decimal-b",
          name: "Decimal B",
          date: isoDateFromToday(-1),
          totalPaid: 0.4,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 0.2, paidAmount: 0.2, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 0.2, paidAmount: 0, paidBySelf: false, status: "Pending" }
          }
        }
      ]
    })
  );

  const totals = jsonValue(context, "dashboardActivityTotals(state.activities)");
  assert.equal(totals.spent, 0.6);
  assert.equal(totals.due, 0.3);
  assert.equal(totals.outstanding, 0.3);
});

test("shuttle purchase modal locks repeated shuttle fields", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("kabilesh", "Kabilesh")] }));

  run(context, 'activityDraft = createShuttleActivityDraft(); modal = { type: "shuttlePurchase" }');
  const html = run(context, "renderModal()");

  assert.match(html, /Add Shuttle Purchase/);
  assert.match(html, /name="name" value="Shuttle"/);
  assert.match(html, /name="paidById" value="kabilesh"/);
  assert.match(html, /name="playerIds" value="kabilesh"/);
  assert.match(html, /name="totalPaid"/);
  assert.match(html, /name="notes"/);
  assert.doesNotMatch(html, /Activity Name/);
  assert.doesNotMatch(html, /Select payer/);
  assert.doesNotMatch(html, /Select players to split/);
});

test("limited advance applies to earlier session dues first", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Advance Order")],
      advances: { p1: 20 },
      sessions: [
        baseSession({
          id: "first-session",
          date: isoDateFromToday(-2),
          perPersonAmount: 20,
          responses: [
            {
              id: "first-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        }),
        baseSession({
          id: "second-session",
          date: isoDateFromToday(-1),
          perPersonAmount: 20,
          responses: [
            {
              id: "second-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'paymentEffectiveStatus(getSession("first-session"), getSession("first-session").payments.p1)'), "Paid");
  assert.equal(run(context, 'paymentEffectiveStatus(getSession("second-session"), getSession("second-session").payments.p1)'), "Pending");
  assert.equal(run(context, 'sessionStats(getSession("first-session")).pendingCount'), 0);
  assert.equal(run(context, 'sessionStats(getSession("second-session")).pendingCount'), 1);
  assert.equal(run(context, 'playerBalance("p1")'), 20);
});

test("player balances show due players, then advance-credit players, then clear players", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [
        player("clear", "Clear Player"),
        player("advance-small", "Small Advance"),
        player("due", "Due Player"),
        player("advance-large", "Large Advance")
      ],
      advances: {
        "advance-small": 10,
        "advance-large": 50
      },
      sessions: [
        baseSession({
          responses: [
            {
              id: "due-response",
              playerId: "due",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "balancePlayersOrder(activePlayersAlphabetical()).map((item) => item.id)"), [
    "due",
    "advance-large",
    "advance-small",
    "clear"
  ]);
});

test("player balance rows hide zero credit and label positive credit", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("p1", "Chip Player")],
      advances: { p1: 5 },
      sessions: [
        baseSession({
          responses: [
            {
              id: "chip-response",
              playerId: "p1",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );
  run(
    context,
    `
      const payment = getSession("session-1").payments.p1;
      payment.paidAmount = 8;
      payment.status = "Partial";
    `
  );

  assert.equal(run(context, 'playerCoveredAmount("p1")'), 13);
  assert.equal(run(context, 'playerBalance("p1")'), 7);
  assert.equal(run(context, 'playerRemainingAdvance("p1")'), 0);

  const html = run(context, 'renderPlayerBalanceRow(getPlayer("p1"))');
  assert.match(html, /player-balance-title-line/);
  assert.match(html, /Covered 13 AED/);
  assert.match(html, /Due 7 AED/);
  assert.doesNotMatch(html, /Credit/);
  assert.doesNotMatch(html, /Credit 0 AED/);
  assert.match(html, /player-balance-chip-pair[\s\S]*Due 7 AED/);
  assert.match(html, /data-action="open-player-payment-details"[^>]*data-player="p1"/);
  assert.match(html, /Copy Payment Details/);
  assert.doesNotMatch(html, /row-subtitle/);
  assert.doesNotMatch(html, /ledger-list/);
  assert.doesNotMatch(html, /session - 12 AED/);

  run(context, "state.advances.p1 = 30");
  assert.equal(run(context, 'playerRemainingCredit("p1")'), 18);
  const creditHtml = run(context, 'renderPlayerBalanceRow(getPlayer("p1"))');
  assert.match(creditHtml, /Credit 18 AED/);
  assert.doesNotMatch(creditHtml, /Advance/);
});

test("player payment overage is stored as advance credit", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer")],
      sessions: [
        baseSession({
          responses: [
            {
              id: "payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const result = jsonValue(context, 'applyPlayerPayment("payer", 35)');
  assert.equal(result.applied, 20);
  assert.equal(result.remaining, 15);
  assert.equal(result.transaction.type, "player-payment");
  assert.equal(run(context, 'playerBalance("payer")'), 0);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 15);
});

test("overpayment credit stays out of the dedicated advance section", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("payer", "Credit Player")], advances: { payer: 50 } }));

  assert.deepEqual(jsonValue(context, 'playerAdvanceSummary("payer")'), { received: 0, deducted: 0, balance: 0 });
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 50);

  const html = run(context, "renderPayments()");
  const advanceSection = html.slice(html.indexOf("<h2>Advance</h2>"), html.indexOf("<h2>Player Balances</h2>"));
  const advanceList = advanceSection.slice(advanceSection.indexOf('<div class="advance-list">'));
  assert.doesNotMatch(advanceList, /Credit Player/);
  assert.match(html, /Credit Player[\s\S]*Credit 50 AED/);
});

test("payments page records player advances and copies deduction summary", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Advance Payer")],
      sessions: [
        baseSession({
          responses: [
            {
              id: "payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const transaction = jsonValue(context, 'recordPlayerAdvance("payer", 200)');
  assert.equal(transaction.type, "advance-payment");
  assert.equal(transaction.separateAdvance, true);
  assert.equal(transaction.amountPaid, 200);
  assert.deepEqual(transaction.allocations, [{ type: "advance", playerId: "payer", amount: 200 }]);
  assert.equal(run(context, 'playerAdvance("payer")'), 0);
  assert.equal(run(context, 'playerAvailableAdvance("payer")'), 200);
  assert.deepEqual(jsonValue(context, 'playerAdvanceSummary("payer")'), { received: 200, deducted: 20, balance: 180 });

  const html = run(context, "renderPayments()");
  assert.ok(html.indexOf("<h2>Payment Groups</h2>") < html.indexOf("<h2>Advance</h2>"));
  assert.ok(html.indexOf("<h2>Advance</h2>") < html.indexOf("<h2>Player Balances</h2>"));
  assert.match(html, /data-form="advance-payment"/);
  assert.match(html, /Advance Payer[\s\S]*Advance Paid[\s\S]*200 AED[\s\S]*Deducted[\s\S]*20 AED[\s\S]*Balance[\s\S]*180 AED/);
  assert.match(html, /data-action="open-player-advance-details"[^>]*data-player="payer"/);
  assert.match(html, /data-action="open-player-advance-history"[^>]*data-player="payer"/);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.doesNotMatch(run(context, 'renderPlayerBalanceRow(getPlayer("payer"))'), /Credit \d+(?:\.\d+)? AED/);

  const copy = run(context, 'buildPlayerAdvanceSummaryCopy("payer")');
  assert.match(copy, /Advance Payer - Advance Summary/);
  assert.match(copy, /Advance Paid: 200 AED/);
  assert.match(copy, /Deducted: 20 AED/);
  assert.match(copy, /Balance: 180 AED/);
  assert.match(copy, /Deductions[\s\S]*session: Deducted 20 AED, Bal adv 180 AED/);

  const detailsHtml = run(context, 'renderAdvanceDetailsModal("payer")');
  assert.match(detailsHtml, /Advance Summary/);
  assert.match(detailsHtml, /Copy Summary/);
  assert.match(detailsHtml, /copy-player-advance-summary/);

  const historyHtml = run(context, 'renderAdvanceHistoryModal("payer")');
  assert.match(historyHtml, /Advance History/);
  assert.match(historyHtml, /Advance paid 200 AED, deducted 20 AED, balance 180 AED/);
  assert.match(historyHtml, /advance-history-head/);
  assert.match(historyHtml, /advance-history-actions/);
  assert.match(historyHtml, /advance-deduction-list/);
  assert.match(historyHtml, /delete-payment-transaction/);

  assert.equal(run(context, 'deletePaymentTransaction(state.paymentTransactions[0].id)'), true);
  assert.deepEqual(jsonValue(context, 'playerAdvanceSummary("payer")'), { received: 0, deducted: 0, balance: 0 });
});

test("advance summary moves to the next payment cycle after the prior advance is consumed", () => {
  const context = createAppContext();
  const response = {
    id: "payer-response",
    playerId: "payer",
    voteOrder: 1,
    attendanceChoice: "in",
    guestCount: 0,
    racketNeeded: false,
    rawOptions: ["I'm in"]
  };
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Cycle Payer")],
      sessions: [
        baseSession({
          id: "advance-cycle-1",
          date: isoDateFromToday(-3),
          perPersonAmount: 120,
          totalPaid: 120,
          responses: [response]
        }),
        baseSession({
          id: "advance-cycle-2",
          date: isoDateFromToday(-2),
          perPersonAmount: 90,
          totalPaid: 90,
          responses: [{ ...response, id: "payer-response-2" }]
        })
      ]
    })
  );

  run(context, 'recordPlayerAdvance("payer", 200)');
  run(context, 'recordPlayerAdvance("payer", 100)');

  assert.equal(run(context, 'playerAvailableAdvance("payer")'), 300);
  assert.deepEqual(jsonValue(context, 'playerAdvanceSummary("payer")'), { received: 300, deducted: 210, balance: 90 });

  const copy = run(context, 'buildPlayerAdvanceSummaryCopy("payer")');
  assert.match(copy, /Cycle Payer - Advance Summary/);
  assert.match(copy, /Advance Paid: 300 AED/);
  assert.match(copy, /Deducted: 210 AED/);
  assert.match(copy, /Balance: 90 AED/);

  const historyHtml = run(context, 'renderAdvanceHistoryModal("payer")');
  assert.match(historyHtml, /Advance paid 100 AED, deducted 10 AED, balance 90 AED/);
  assert.match(historyHtml, /Advance paid 200 AED, deducted 200 AED, balance 0 AED/);
});

test("legacy advance section entries are not double counted as credit", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Legacy Advance")],
      advances: { payer: 200 },
      paymentTransactions: [
        {
          id: "legacy-advance",
          type: "advance-payment",
          date: isoDateFromToday(-1),
          paidById: "payer",
          groupId: "",
          playerIds: ["payer"],
          amountPaid: 200,
          appliedAmount: 0,
          advanceAmount: 200,
          allocations: [{ type: "advance", playerId: "payer", amount: 200 }]
        }
      ],
      sessions: [
        baseSession({
          responses: [
            {
              id: "legacy-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'playerAvailableCredit("payer")'), 0);
  assert.equal(run(context, 'playerAvailableAdvance("payer")'), 200);
  assert.deepEqual(jsonValue(context, 'playerAdvanceSummary("payer")'), { received: 200, deducted: 20, balance: 180 });
  assert.equal(run(context, 'deletePaymentTransaction("legacy-advance")'), true);
  assert.equal(run(context, 'playerAdvance("payer")'), 0);
});

test("group payment overage credit belongs entirely to the payer", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("payer", "Yogesh"), player("member", "Abhineya")] }));

  assert.deepEqual(jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 100 }).allocations'), [
    { type: "advance", playerId: "payer", amount: 100 }
  ]);
  assert.equal(run(context, 'playerAvailableAdvance("payer")'), 0);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 100);
  assert.equal(run(context, 'playerAvailableAdvance("member")'), 0);
  assert.match(run(context, 'renderPlayerBalanceRow(getPlayer("payer"))'), /Credit 100 AED/);
  assert.doesNotMatch(run(context, 'renderPlayerBalanceRow(getPlayer("member"))'), /Credit/);
  assert.equal(run(context, 'deletePaymentTransaction(state.paymentTransactions[0].id)'), true);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.equal(run(context, 'state.paymentTransactions.length'), 1);
  assert.equal(run(context, 'state.paymentTransactions[0].status'), "reversed");
});

test("payer Credit automatically covers another payment-group member without being written as cash", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 122 },
      paymentGroups: [
        {
          id: "yogesh-group",
          name: "Yogesh",
          payerId: "payer",
          playerIds: ["payer", "member"],
          guests: [],
          active: true
        }
      ],
      sessions: [
        baseSession({
          id: "payer-session",
          totalPaid: 40,
          perPersonAmount: 40,
          responses: [
            {
              id: "payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        }),
        baseSession({
          id: "member-session",
          totalPaid: 40,
          perPersonAmount: 40,
          responses: [
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'playerRemainingCredit("payer")'), 42);
  assert.equal(run(context, 'paymentGroupGrossBalance(getPaymentGroup("yogesh-group"))'), 40);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("yogesh-group"))'), 40);
  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("yogesh-group"))'), 0);
  assert.match(run(context, 'renderPaymentGroupCard(getPaymentGroup("yogesh-group"))'), /Clear/);
  assert.match(run(context, 'renderPaymentGroupCard(getPaymentGroup("yogesh-group"))'), /40 AED Credit applied from Yogesh/);
  assert.equal(run(context, 'playerBalance("member")'), 0);
  assert.equal(run(context, 'paymentEffectiveStatus(getSession("member-session"), getSession("member-session").payments.member)'), "Paid");
  assert.equal(run(context, 'state.sessions.find((session) => session.id === "member-session").payments.member.paidAmount'), 0);
  assert.equal(run(context, 'state.sessions.find((session) => session.id === "member-session").payments.member.status'), "Pending");

  const result = jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 0, groupId: "yogesh-group" })');
  assert.equal(result.applied, 0);
  assert.equal(result.creditUsed, 0);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.allocations, []);
  assert.equal(run(context, 'state.advances.payer'), 122);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 42);
  assert.equal(run(context, 'state.paymentTransactions.length'), 0);

  run(context, 'getPaymentGroup("yogesh-group").active = false');
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 82);
  assert.equal(run(context, 'playerBalance("member")'), 40);
  run(context, 'getPaymentGroup("yogesh-group").active = true');
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 42);
  assert.equal(run(context, 'playerBalance("member")'), 0);
});

test("payer Credit is consumed before new cash for a payment group", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 82 },
      paymentGroups: [
        {
          id: "yogesh-group",
          name: "Yogesh",
          payerId: "payer",
          playerIds: ["payer", "member"],
          guests: [],
          active: true
        }
      ],
      sessions: [
        baseSession({
          id: "member-session",
          totalPaid: 100,
          perPersonAmount: 100,
          responses: [
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("yogesh-group"))'), 18);
  const result = jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 18, groupId: "yogesh-group" })');
  assert.equal(result.applied, 18);
  assert.equal(result.creditUsed, 0);
  assert.equal(result.remaining, 0);
  assert.equal(run(context, 'playerAdvance("payer")'), 82);
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 18);
  assert.equal(run(context, 'state.sessions[0].payments.member.status'), "Partial");
  assert.equal(run(context, 'paymentEffectiveStatus(state.sessions[0], state.sessions[0].payments.member)'), "Paid");
  assert.deepEqual(result.allocations, [{ type: "session", playerId: "member", sessionId: "member-session", amount: 18 }]);
  assert.equal(result.transaction.amountPaid, 18);
  assert.equal(result.transaction.appliedAmount, 18);
  assert.equal(result.transaction.allocations.some((allocation) => allocation.type === "credit-use"), false);
});

test("intentional Advance does not transfer across a payment group", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      paymentGroups: [
        {
          id: "yogesh-group",
          name: "Yogesh",
          payerId: "payer",
          playerIds: ["payer", "member"],
          guests: [],
          active: true
        }
      ],
      sessions: [
        baseSession({
          id: "member-session",
          totalPaid: 40,
          perPersonAmount: 40,
          responses: [
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );
  run(context, 'recordPlayerAdvance("payer", 82)');

  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("yogesh-group"))'), 0);
  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("yogesh-group"))'), 40);
  assert.equal(run(context, 'playerRemainingAdvance("payer")'), 82);
  assert.deepEqual(jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 0, groupId: "yogesh-group" })'), {
    applied: 0,
    creditUsed: 0,
    remaining: 0,
    allocations: []
  });
  assert.equal(run(context, 'state.sessions[0].payments.member.status'), "Pending");
});

test("payer Credit is reserved once across multiple saved payment groups", () => {
  const context = createAppContext();
  const memberSession = (id, playerId) => baseSession({
    id,
    totalPaid: 40,
    perPersonAmount: 40,
    responses: [{
      id: `${id}-response`,
      playerId,
      voteOrder: 1,
      attendanceChoice: "in",
      guestCount: 0,
      racketNeeded: false,
      rawOptions: ["I'm in"]
    }]
  });
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member-a", "Abhineya"), player("member-b", "Ravi")],
      advances: { payer: 60 },
      paymentGroups: [
        { id: "group-a", name: "Group A", payerId: "payer", playerIds: ["payer", "member-a"], guests: [], active: true },
        { id: "group-b", name: "Group B", payerId: "payer", playerIds: ["payer", "member-b"], guests: [], active: true }
      ],
      sessions: [memberSession("session-a", "member-a"), memberSession("session-b", "member-b")]
    })
  );

  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("group-a"))'), 40);
  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("group-a"))'), 0);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("group-b"))'), 20);
  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("group-b"))'), 20);
  assert.equal(run(context, 'playerBalance("member-a")'), 0);
  assert.equal(run(context, 'playerBalance("member-b")'), 20);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.equal(run(context, 'coverageTotalsForPlayers(["member-a", "member-b"]).balance'), 20);

  run(context, 'state = migrateState(JSON.parse(JSON.stringify(state)), { useSeedCollections: false })');
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("group-a"))'), 40);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("group-b"))'), 20);
  assert.equal(run(context, 'playerBalance("member-b")'), 20);
});

test("payment-group membership conflicts reject shared members but allow the same payer", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer"), player("member-a", "Member A"), player("member-b", "Member B")],
      paymentGroups: [
        { id: "group-a", name: "Group A", payerId: "payer", playerIds: ["payer", "member-a"], guests: [], active: true }
      ]
    })
  );

  assert.deepEqual(jsonValue(context, 'paymentGroupMembershipConflicts(["payer", "member-b"], "", "payer")'), []);
  assert.deepEqual(
    jsonValue(context, 'paymentGroupMembershipConflicts(["member-a", "member-b"], "", "member-b").map((conflict) => ({ groupId: conflict.group.id, playerIds: conflict.playerIds }))'),
    [{ groupId: "group-a", playerIds: ["member-a"] }]
  );
  assert.deepEqual(jsonValue(context, 'paymentGroupMembershipConflicts(["payer", "member-a"], "group-a", "payer")'), []);
});

test("backup migration preserves intentional Advance as non-transferable", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      paymentGroups: [
        { id: "advance-group", name: "Advance Group", payerId: "payer", playerIds: ["payer", "member"], guests: [], active: true }
      ],
      paymentTransactions: [
        {
          id: "advance-transaction",
          type: "advance-payment",
          separateAdvance: true,
          date: isoDateFromToday(-2),
          paidById: "payer",
          playerIds: ["payer"],
          amountPaid: 80,
          appliedAmount: 0,
          advanceAmount: 80,
          allocations: [{ type: "advance", playerId: "payer", amount: 80 }]
        }
      ],
      sessions: [
        baseSession({
          id: "advance-member-session",
          totalPaid: 40,
          perPersonAmount: 40,
          responses: [{
            id: "advance-member-response",
            playerId: "member",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 0,
            racketNeeded: false,
            rawOptions: ["I'm in"]
          }]
        })
      ]
    })
  );

  assert.equal(run(context, 'state.paymentTransactions[0].separateAdvance'), true);
  assert.equal(run(context, 'playerRemainingAdvance("payer")'), 80);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("advance-group"))'), 0);
  assert.equal(run(context, 'paymentGroupBalance(getPaymentGroup("advance-group"))'), 40);

  run(context, 'state = migrateState(JSON.parse(JSON.stringify(state)), { useSeedCollections: false })');
  assert.equal(run(context, 'state.paymentTransactions[0].separateAdvance'), true);
  assert.equal(run(context, 'playerRemainingAdvance("payer")'), 80);
  assert.equal(run(context, 'playerBalance("member")'), 40);
});

test("Version 1.0.3 credit-use records migrate back to derived Credit coverage", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      paymentGroups: [
        { id: "legacy-credit-group", name: "Yogesh", payerId: "payer", playerIds: ["payer", "member"], guests: [], active: true }
      ],
      paymentTransactions: [
        {
          id: "legacy-credit-use",
          type: "group-payment",
          date: isoDateFromToday(-1),
          paidById: "payer",
          groupId: "legacy-credit-group",
          playerIds: ["payer", "member"],
          amountPaid: 0,
          appliedAmount: 40,
          advanceAmount: 0,
          allocations: [
            { type: "session", playerId: "member", sessionId: "legacy-credit-session", amount: 40 },
            { type: "credit-use", playerId: "payer", amount: 40 }
          ]
        }
      ],
      sessions: [
        baseSession({
          id: "legacy-credit-session",
          totalPaid: 40,
          perPersonAmount: 40,
          responses: [{
            id: "legacy-credit-response",
            playerId: "member",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 0,
            racketNeeded: false,
            rawOptions: ["I'm in"]
          }],
          payments: {
            member: {
              playerId: "member",
              status: "Paid",
              amount: 40,
              paidAmount: 40,
              method: "Bank",
              paidDate: isoDateFromToday(-1),
              notes: ""
            }
          }
        })
      ]
    })
  );

  assert.equal(run(context, 'state.advances.payer'), 40);
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 0);
  assert.equal(run(context, 'state.sessions[0].payments.member.status'), "Pending");
  assert.equal(run(context, 'state.paymentTransactions[0].status'), "migrated");
  assert.equal(run(context, 'state.paymentTransactions[0].migratedCreditAmount'), 40);
  assert.deepEqual(jsonValue(context, 'state.paymentTransactions[0].allocations'), []);
  assert.equal(run(context, 'paymentGroupCreditApplied(getPaymentGroup("legacy-credit-group"))'), 40);
  assert.equal(run(context, 'playerBalance("member")'), 0);
  assert.equal(run(context, 'paymentEffectiveStatus(state.sessions[0], state.sessions[0].payments.member)'), "Paid");

  run(context, 'state = migrateState(JSON.parse(JSON.stringify(state)), { useSeedCollections: false })');
  assert.equal(run(context, 'state.advances.payer'), 40);
  assert.equal(run(context, 'state.paymentTransactions[0].migratedCreditAmount'), 40);
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 0);
});

test("individual cash receipts keep reversible audit history", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer")],
      sessions: [
        baseSession({
          id: "individual-session",
          responses: [{
            id: "individual-response",
            playerId: "payer",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 0,
            racketNeeded: false,
            rawOptions: ["I'm in"]
          }]
        })
      ]
    })
  );

  const result = jsonValue(context, 'applyPlayerPayment("payer", 30)');
  assert.equal(result.applied, 20);
  assert.equal(result.remaining, 10);
  assert.equal(result.transaction.type, "player-payment");
  assert.match(result.transaction.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(run(context, 'state.paymentTransactions.length'), 1);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 10);
  assert.equal(run(context, 'deletePaymentTransaction(state.paymentTransactions[0].id)'), true);
  assert.equal(run(context, 'state.paymentTransactions.length'), 1);
  assert.equal(run(context, 'state.paymentTransactions[0].status'), "reversed");
  assert.equal(run(context, 'state.sessions[0].payments.payer.paidAmount'), 0);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 0);
  assert.equal(run(context, 'playerBalance("payer")'), 20);
  assert.match(run(context, 'playerPaymentTransactionCopyLines("payer")[0]'), /\[REVERSED\]/);
});

test("derived payment-group Credit locks roster changes only while coverage is active", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 40 },
      paymentGroups: [
        { id: "credit-group", name: "Yogesh", payerId: "payer", playerIds: ["payer", "member"], guests: [], active: true }
      ],
      sessions: [
        baseSession({
          id: "credit-guard-session",
          perPersonAmount: 20,
          responses: [{
            id: "credit-guard-response",
            playerId: "member",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 1,
            racketNeeded: false,
            rawOptions: ["I'm in", "Guest"]
          }]
        })
      ]
    })
  );

  assert.equal(run(context, 'paymentCoverageApplied(state.sessions[0], state.sessions[0].payments.member)'), 40);
  assert.equal(run(context, 'sessionPlayerHasActiveFinancialState(state.sessions[0], "member")'), true);
  assert.equal(run(context, 'removeResponseGuest(state.sessions[0], "credit-guard-response")'), false);
  assert.equal(run(context, 'state.sessions[0].responses[0].guestCount'), 1);

  run(context, 'getPaymentGroup("credit-group").active = false');
  assert.equal(run(context, 'sessionPlayerHasActiveFinancialState(state.sessions[0], "member")'), false);
  assert.equal(run(context, 'removeResponseGuest(state.sessions[0], "credit-guard-response")'), true);
  assert.equal(run(context, 'state.sessions[0].responses[0].guestCount'), 0);
  assert.equal(run(context, 'state.sessions[0].payments.member.amount'), 20);
});

test("activity group-Credit coverage prevents deleting the covered member", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 20 },
      paymentGroups: [
        { id: "activity-credit-group", name: "Yogesh", payerId: "payer", playerIds: ["payer", "member"], guests: [], active: true }
      ],
      activities: [
        {
          id: "activity-credit-guard",
          name: "Dinner",
          date: isoDateFromToday(-1),
          totalPaid: 40,
          paidById: "payer",
          playerIds: ["payer", "member"],
          shares: {
            payer: { playerId: "payer", amount: 20, paidAmount: 20, paidBySelf: true, status: "Paid" },
            member: { playerId: "member", amount: 20, paidAmount: 0, paidBySelf: false, status: "Pending" }
          }
        }
      ]
    })
  );
  run(context, 'showToast = () => {}; render = () => {}');

  assert.equal(run(context, 'shareCoverageApplied(state.activities[0], state.activities[0].shares.member)'), 20);
  assert.equal(run(context, 'activityPlayerHasActiveFinancialState(state.activities[0], "member")'), true);
  assert.equal(run(context, 'playerHasFinancialHistory("member")'), true);
  context.__deleteTarget = { dataset: { deleteType: "player", player: "member" } };
  assert.equal(run(context, 'executeConfirmedDelete(__deleteTarget)'), false);
  assert.equal(run(context, 'getPlayer("member").active'), true);

  run(context, 'getPaymentGroup("activity-credit-group").active = false');
  assert.equal(run(context, 'activityPlayerHasActiveFinancialState(state.activities[0], "member")'), false);
  assert.equal(run(context, 'playerHasFinancialHistory("member")'), false);
});

test("transaction-owned records can only be reversed by the payer transaction", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      sessions: [
        baseSession({
          id: "transaction-owned-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "transaction-payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "transaction-member-response",
              playerId: "member",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );
  run(context, 'showToast = () => {}; render = () => {}');

  const result = jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 40 })');
  assert.match(result.transaction.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(run(context, 'paymentHasActiveTransactionAllocation("transaction-owned-session", "member")'), true);
  assert.doesNotMatch(run(context, 'renderPaymentHistoryModal("member")'), /data-action="delete-payment-transaction"/);
  assert.doesNotMatch(run(context, 'renderPaymentHistoryModal("member")'), /data-action="delete-payment-history"/);
  assert.match(run(context, 'renderPaymentHistoryModal("payer")'), /data-action="delete-payment-transaction"/);

  context.__deleteTarget = {
    dataset: {
      deleteType: "payment-history",
      historyType: "session",
      player: "member",
      session: "transaction-owned-session"
    }
  };
  assert.equal(run(context, 'executeConfirmedDelete(__deleteTarget)'), false);
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 20);
  assert.equal(run(context, 'paymentTransactionIsActive(state.paymentTransactions[0])'), true);

  context.__transactionId = result.transaction.id;
  assert.equal(run(context, 'deletePaymentTransaction(__transactionId)'), true);
  assert.equal(run(context, 'state.sessions[0].payments.payer.paidAmount'), 0);
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 0);
});

test("reversing a receipt unlocks roster edits while retained history blocks session deletion", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer")],
      sessions: [
        baseSession({
          id: "reversed-history-session",
          perPersonAmount: 20,
          responses: [{
            id: "reversed-history-response",
            playerId: "payer",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 1,
            racketNeeded: false,
            rawOptions: ["I'm in", "Guest"]
          }]
        })
      ]
    })
  );
  run(context, 'showToast = () => {}; render = () => {}');
  const transactionId = run(context, 'applyPlayerPayment("payer", 40).transaction.id');

  assert.equal(run(context, 'sessionPlayerHasActiveFinancialState(state.sessions[0], "payer")'), true);
  assert.equal(run(context, 'removeResponseGuest(state.sessions[0], "reversed-history-response")'), false);
  context.__transactionId = transactionId;
  assert.equal(run(context, 'deletePaymentTransaction(__transactionId)'), true);
  assert.equal(run(context, 'sessionPlayerHasActiveFinancialState(state.sessions[0], "payer")'), false);
  assert.equal(run(context, 'sessionPlayerHasFinancialHistory(state.sessions[0], "payer")'), true);
  assert.equal(run(context, 'removeResponseGuest(state.sessions[0], "reversed-history-response")'), true);

  context.__deleteTarget = { dataset: { deleteType: "session", session: "reversed-history-session" } };
  assert.equal(run(context, 'executeConfirmedDelete(__deleteTarget)'), false);
  assert.equal(run(context, 'state.sessions.length'), 1);
  assert.equal(run(context, 'state.paymentTransactions[0].status'), "reversed");
});

test("financial history blocks destructive session and roster mutations", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Payer")],
      sessions: [
        baseSession({
          id: "guarded-session",
          responses: [{
            id: "guarded-response",
            playerId: "payer",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 0,
            racketNeeded: false,
            rawOptions: ["I'm in"]
          }]
        })
      ]
    })
  );
  run(context, 'showToast = () => {}; render = () => {}');
  run(context, 'applyPlayerPayment("payer", 20)');
  run(context, 'state.sessions[0].responses = []; syncSessionPayments(state.sessions[0])');
  assert.equal(run(context, 'Boolean(state.sessions[0].payments.payer)'), true);
  assert.equal(run(context, 'state.sessions[0].payments.payer.paidAmount'), 20);
  assert.equal(run(context, 'setSessionField("guarded-session", "perPersonAmount", 30)'), false);
  assert.equal(run(context, 'state.sessions[0].perPersonAmount'), 20);

  context.__deleteTarget = { dataset: { deleteType: "session", session: "guarded-session" } };
  assert.equal(run(context, 'executeConfirmedDelete(__deleteTarget)'), false);
  assert.equal(run(context, 'state.sessions.length'), 1);
});

test("Advance coverage immediately synchronizes the completed session stage", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Advance Payer")],
      sessions: [
        baseSession({
          id: "advance-stage-session",
          responses: [{
            id: "advance-stage-response",
            playerId: "payer",
            voteOrder: 1,
            attendanceChoice: "in",
            guestCount: 0,
            racketNeeded: false,
            rawOptions: ["I'm in"]
          }]
        })
      ]
    })
  );

  assert.equal(run(context, 'normalizeStage(state.sessions[0].stage)'), "Payment Collection");
  run(context, 'recordPlayerAdvance("payer", 20)');
  assert.equal(run(context, 'paymentEffectiveStatus(state.sessions[0], state.sessions[0].payments.payer)'), "Paid");
  assert.equal(run(context, 'normalizeStage(state.sessions[0].stage)'), "Completed");
});

test("group payment clears member dues before assigning remaining credit to payer", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      sessions: [
        baseSession({
          id: "group-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const result = jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 100 })');
  assert.equal(result.applied, 40);
  assert.equal(result.remaining, 60);
  assert.deepEqual(result.allocations, [
    { type: "session", playerId: "payer", sessionId: "group-session", amount: 20 },
    { type: "session", playerId: "member", sessionId: "group-session", amount: 20 },
    { type: "advance", playerId: "payer", amount: 60 }
  ]);
  assert.equal(run(context, 'state.sessions[0].payments.payer.status'), "Paid");
  assert.equal(run(context, 'state.sessions[0].payments.member.status'), "Paid");
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 60);
  assert.equal(run(context, 'playerAvailableAdvance("payer")'), 0);
  assert.equal(run(context, 'playerAvailableAdvance("member")'), 0);
});

test("partial group payment is split across covered players", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      sessions: [
        baseSession({
          id: "group-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "payer-response",
              playerId: "payer",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            },
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 2,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  const result = jsonValue(context, 'applyGroupPayment({ paidById: "payer", playerIds: ["payer", "member"], amountPaid: 16 })');
  assert.equal(result.applied, 16);
  assert.equal(result.remaining, 0);
  assert.deepEqual(result.allocations, [
    { type: "session", playerId: "payer", sessionId: "group-session", amount: 8 },
    { type: "session", playerId: "member", sessionId: "group-session", amount: 8 }
  ]);
  assert.equal(run(context, 'state.sessions[0].payments.payer.status'), "Partial");
  assert.equal(run(context, 'state.sessions[0].payments.payer.paidAmount'), 8);
  assert.equal(run(context, 'state.sessions[0].payments.member.status'), "Partial");
  assert.equal(run(context, 'state.sessions[0].payments.member.paidAmount'), 8);
});

test("split group payment credits migrate back to the original payer", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 20, member: 20 },
      paymentTransactions: [
        {
          id: "legacy-group-payment",
          type: "group-payment",
          date: isoDateFromToday(-1),
          paidById: "payer",
          groupId: "yogesh-group",
          playerIds: ["payer", "member"],
          amountPaid: 40,
          appliedAmount: 0,
          advanceAmount: 40,
          allocations: [
            { type: "advance", playerId: "payer", amount: 20 },
            { type: "advance", playerId: "member", amount: 20 }
          ]
        }
      ],
      sessions: [
        baseSession({
          id: "abhineya-session",
          perPersonAmount: 20,
          responses: [
            {
              id: "member-response",
              playerId: "member",
              voteOrder: 1,
              attendanceChoice: "in",
              guestCount: 0,
              racketNeeded: false,
              rawOptions: ["I'm in"]
            }
          ]
        })
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "state.paymentTransactions[0].allocations"), [
    { type: "advance", playerId: "payer", sessionId: "", activityId: "", amount: 40 }
  ]);
  assert.equal(run(context, 'playerRemainingCredit("payer")'), 40);
  assert.equal(run(context, 'playerAvailableAdvance("member")'), 0);
  assert.equal(run(context, 'paymentEffectiveStatus(getSession("abhineya-session"), getSession("abhineya-session").payments.member)'), "Pending");
  assert.equal(run(context, 'playerBalance("member")'), 20);

  run(context, "state = migrateState(state, { useSeedCollections: false })");
  assert.deepEqual(jsonValue(context, "state.advances"), { payer: 40 });
  assert.deepEqual(jsonValue(context, "state.paymentTransactions[0].allocations"), [
    { type: "advance", playerId: "payer", sessionId: "", activityId: "", amount: 40 }
  ]);
});

test("group credit migration preserves unrelated player balances", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      advances: { payer: 30, member: 25 },
      paymentTransactions: [
        {
          id: "split-group-payment",
          type: "group-payment",
          date: "2026-07-12",
          paidById: "payer",
          playerIds: ["payer", "member"],
          amountPaid: 40,
          appliedAmount: 0,
          advanceAmount: 40,
          allocations: [
            { type: "advance", playerId: "payer", amount: 20 },
            { type: "advance", playerId: "member", amount: 20 }
          ]
        }
      ]
    })
  );

  assert.deepEqual(jsonValue(context, "state.advances"), { payer: 50, member: 5 });
  assert.deepEqual(jsonValue(context, "state.paymentTransactions[0].allocations"), [
    { type: "advance", playerId: "payer", sessionId: "", activityId: "", amount: 40 }
  ]);
});

test("saved payment groups can include named guests", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Yogesh"), player("member", "Abhineya")],
      paymentGroups: [
        {
          id: "group-yogesh",
          name: "Yogesh +3",
          payerId: "payer",
          playerIds: ["payer", "member"],
          guests: [{ id: "guest-1", name: "Ravi" }, { id: "guest-2", name: "" }],
          active: true
        }
      ]
    })
  );

  assert.equal(run(context, 'paymentGroupMemberCount(getPaymentGroup("group-yogesh"))'), 4);
  assert.equal(run(context, 'paymentGroupMemberNames(getPaymentGroup("group-yogesh"))'), "Yogesh, Abhineya, Ravi, Guest 2");

  const draft = jsonValue(context, 'createPaymentGroupDraft("group-yogesh")');
  assert.deepEqual(draft.guests.map((guest) => guest.name), ["Ravi", "Guest 2"]);
});

test("payments page shows payment groups before player balances", () => {
  const context = createAppContext();
  setAppState(context, baseFixture());

  const html = run(context, "renderPayments()");
  assert.ok(html.indexOf("<h2>Payment Groups</h2>") < html.indexOf("<h2>Player Balances</h2>"));
});

test("payment group card keeps chip below name and every payment control in one row", () => {
  const context = createAppContext();
  setAppState(
    context,
    baseFixture({
      players: [player("payer", "Kuberan"), player("member", "Kalai")],
      paymentGroups: [{ id: "group-kuberan", name: "Kuberan", payerId: "payer", playerIds: ["payer", "member"], guests: [], active: true }]
    })
  );

  const html = run(context, 'renderPaymentGroupCard(getPaymentGroup("group-kuberan"))');
  const title = html.match(/<div class="payment-group-title-line">[\s\S]*?<\/div>/)?.[0] || "";
  const actions = html.match(/<div class="payment-group-actions">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(title, /<h3[^>]*>Kuberan<\/h3>[\s\S]*<span class="badge/);
  assert.match(actions, /name="amountPaid"/);
  assert.equal((actions.match(/<button/g) || []).length, 5);
  assert.equal((html.match(/name="amountPaid"/g) || []).length, 1);
  assert.doesNotMatch(html, /payment-group-payment-line/);
  const amountInput = actions.match(/<input[^>]*name="amountPaid"[^>]*>/)?.[0] || "";
  assert.match(amountInput, /placeholder="0"/);
  assert.doesNotMatch(amountInput, /\svalue=/);
});

test("payment group guest draft supports add, rename, and remove", () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("payer", "Yogesh")] }));
  run(context, 'paymentGroupDraft = { id: "", name: "Yogesh +1", payerId: "payer", playerIds: ["payer"], guests: [] }');

  run(context, "addPaymentGroupDraftGuest()");
  const guestId = run(context, "paymentGroupDraft.guests[0].id");
  run(context, `updatePaymentGroupDraftGuestName(${JSON.stringify(guestId)}, "Ravi")`);

  assert.deepEqual(jsonValue(context, "paymentGroupDraft.guests"), [{ id: guestId, ownerPlayerId: "", name: "Ravi" }]);

  run(context, `removePaymentGroupDraftGuest(${JSON.stringify(guestId)})`);
  assert.deepEqual(jsonValue(context, "paymentGroupDraft.guests"), []);
});

test("session selection keeps one scroll surface for the Sessions page", () => {
  const context = createAppContext();

  assert.equal(run(context, 'surfaceKey("sessions", "session-a")'), "sessions");
  assert.equal(run(context, 'surfaceKey("sessions", "session-b")'), "sessions");
  assert.equal(run(context, 'surfaceKey("payments")'), "payments");
});

test("fresh app startup defaults to Sessions instead of the last saved page", () => {
  const context = createAppContext();
  const view = run(
    context,
    `
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ activeView: "payments", activeSessionId: "old-session" }));
      initialActiveView(loadUiState());
    `
  );

  assert.equal(view, "sessions");
});

test("failed cloud load blocks the empty app shell", () => {
  const context = createAppContext();
  run(
    context,
    `
      state = emptyState();
      cloudLoadFailed = true;
      cloudError = "Network request failed.";
      render();
    `
  );

  const html = run(context, 'document.querySelector("#app").innerHTML');
  assert.match(html, /Cloud Data Did Not Load/);
  assert.match(html, /Your data is not deleted/);
  assert.match(html, /Network request failed\./);
  assert.match(html, /data-action="retry-cloud-load"/);
  assert.match(html, /data-action="check-app-update"/);
  assert.match(html, /data-action="sign-out"/);
  assert.doesNotMatch(html, /Manage poll, booking, allocation, payments, and messages/);
});

test("loading screen renders animated badminton rally instead of shot labels", () => {
  const shell = fs.readFileSync(path.join(ROOT, "js/render-shell.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  ["smash", "drop", "drive", "clear", "net"].forEach((shot) => {
    assert.match(shell, new RegExp(`"${shot}"`));
    assert.match(css, new RegExp(`loading-shuttle-${shot}`));
    assert.match(css, new RegExp(`loading-shot-path-${shot}`));
  });
  assert.match(shell, /function loadingShotSequence/);
  assert.match(shell, /Math\.random/);
  assert.match(shell, /--shot-delay/);
  assert.match(css, /animation-delay:\s*var\(--shot-delay/);
  assert.doesNotMatch(shell, /loading-callouts/);
  assert.doesNotMatch(shell, />Smash<|>Drop</);
  assert.match(css, /\.loading-court-scene\s*{[\s\S]*scale\(1\.08\)/);
  assert.match(css, /\.loading-shuttle\s*{[\s\S]*width:\s*clamp\(78px, 7vw, 132px\)/);
  assert.match(css, /\.loading-card\s*{[^}]*position:\s*relative;/);
  assert.doesNotMatch(css, /\.loading-card\s*{[^}]*bottom:/);
  assert.match(css, /\.loading-card\s*{[\s\S]*width:\s*min\(calc\(100% - 32px\), 420px\)/);
  assert.match(css, /@keyframes loadingSmashFlight/);
  assert.match(css, /@keyframes loadingDriveFlight/);
  assert.match(css, /@keyframes loadingDropFlight/);
  assert.match(css, /@keyframes loadingClearFlight/);
  assert.match(css, /@keyframes loadingNetTumble/);
});

test("dashboard logo navigation paints a loading overlay before rendering", () => {
  const context = createAppContext();
  const shell = fs.readFileSync(path.join(ROOT, "js/render-shell.js"), "utf8");
  assert.equal((shell.match(/data-dashboard-logo="true"/g) || []).length, 2);

  run(
    context,
    `
      activeView = "payments";
      __navigationFrames = [];
      __navigationOverlayEvents = [];
      __navigationRenderCount = 0;
      window.requestAnimationFrame = (callback) => {
        __navigationFrames.push(callback);
        return __navigationFrames.length;
      };
      setAppLoadingOverlay = (visible, message) => {
        __navigationOverlayEvents.push({ visible, message });
      };
      render = () => {
        __navigationRenderCount += 1;
      };
    `
  );

  assert.equal(run(context, "navigateToDashboardWithLoading()"), true);
  assert.equal(run(context, "navigateToDashboardWithLoading()"), false);
  assert.deepEqual(jsonValue(context, "__navigationOverlayEvents"), [{ visible: true, message: "Opening Dashboard..." }]);
  assert.equal(run(context, "__navigationRenderCount"), 0);
  assert.equal(run(context, "__navigationFrames.length"), 1);

  run(context, "__navigationFrames.shift()()");
  assert.equal(run(context, "__navigationRenderCount"), 0);
  assert.equal(run(context, "__navigationFrames.length"), 1);

  run(context, "__navigationFrames.shift()()");
  assert.equal(run(context, "activeView"), "dashboard");
  assert.equal(run(context, "__navigationRenderCount"), 1);
  assert.deepEqual(jsonValue(context, "__navigationOverlayEvents"), [
    { visible: true, message: "Opening Dashboard..." },
    { visible: false }
  ]);
  assert.equal(run(context, "viewNavigationPending"), false);
});

test("WhatsApp Business Android targets use the business package", () => {
  const context = createAppContext({ userAgent: "Mozilla/5.0 Android" });

  const numberTarget = run(context, 'whatsappBusinessNumberTarget("+971 50 123 4567")');
  assert.match(numberTarget.url, /^intent:\/\/send\?phone=971501234567#Intent;/);
  assert.match(numberTarget.url, /package=com\.whatsapp\.w4b/);

  const groupTarget = run(context, 'whatsappBusinessGroupTarget("https://chat.whatsapp.com/InviteCode123")');
  assert.match(groupTarget.url, /^intent:\/\/chat\?code=InviteCode123#Intent;/);
  assert.match(groupTarget.url, /package=com\.whatsapp\.w4b/);
});

test("court action icons keep fixed same-size row controls", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const courtActions = css.match(/\.court-card-actions\s*\{[^}]+\}/)?.[0] || "";
  const courtButtons = css.match(/\.court-card-actions \.btn\.icon-only\s*\{[^}]+\}/)?.[0] || "";
  const courtIcons = css.match(/\.court-card-actions \.icon\s*\{[^}]+\}/)?.[0] || "";

  assert.match(courtActions, /grid-template-columns:\s*repeat\(7,\s*44px\)/);
  assert.match(courtActions, /justify-content:\s*start/);
  assert.match(courtButtons, /width:\s*44px/);
  assert.match(courtButtons, /height:\s*44px/);
  assert.match(courtIcons, /width:\s*20px/);
  assert.match(courtIcons, /height:\s*20px/);
  assert.doesNotMatch(courtIcons, /clamp|vw|fr/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.court-card-actions\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*40px\)/);
});

test("shared icon actions and compact payment group controls keep stable dimensions", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const block = (pattern) => css.match(pattern)?.[0] || "";
  const assertSquare = (rules, size) => {
    assert.match(rules, new RegExp(`width:\\s*${size}px`));
    assert.match(rules, new RegExp(`height:\\s*${size}px`));
    assert.match(rules, new RegExp(`min-height:\\s*${size}px`));
  };
  const sessionActions = block(/\.session-card-actions\s*\{[^}]+\}/);
  const sessionActionButton = block(/\.session-card-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const paymentStatusButton = block(/\.payment-status-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const paymentGroupHeader = block(/\.payment-group-header\s*\{[^}]+\}/);
  const paymentGroupActions = block(/\.payment-group-actions\s*\{[^}]+\}/);
  const paymentGroupActionButton = block(/\.payment-group-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const mobilePaymentGroupActions = block(/@media \(max-width:\s*640px\)[\s\S]*?\.payment-group-actions\s*\{[^}]+\}/);
  const mobilePaymentGroupActionButton = block(/@media \(max-width:\s*640px\)[\s\S]*?\.payment-group-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const narrowPaymentGroupLayout = block(/@media \(max-width:\s*374px\)[\s\S]*?\.payment-group-header\s*\{[^}]+\}/);
  const mobileActivityButtons = block(/@media \(max-width:\s*640px\)[\s\S]*?\.activity-row-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const shuttleSpentActions = block(/\.shuttle-spent-actions\s*\{[^}]+\}/);
  const mobileShuttleSpentActions = block(/@media \(max-width:\s*640px\)[\s\S]*?\.shuttle-spent-actions\s*\{[^}]+\}/);
  const playerBalanceActions = block(/\.player-balance-actions\s*\{[^}]+\}/);
  const mobilePlayerBalanceButton = block(/@media \(max-width:\s*640px\)[\s\S]*?\.player-balance-actions \.btn\.icon-only\s*\{[^}]+\}/);
  const mobilePlayerBalanceRow = block(/@media \(max-width:\s*640px\)[\s\S]*?\.player-balance-row \.row-main\s*\{[^}]+\}/);
  const mobilePlayerBalanceActions = block(/@media \(max-width:\s*640px\)[\s\S]*?\.player-balance-actions\s*\{[^}]+\}/);
  const playerBalanceChips = block(/\.player-balance-chips\s*\{[^}]+\}/);
  const playerBalanceChipPair = block(/\.player-balance-chip-pair\s*\{[^}]+\}/);

  assertSquare(block(/(?:^|\n)\.btn\.icon-only\s*\{[^}]+\}/), 44);
  assertSquare(block(/(?:^|\n)\.icon-button\s*\{[^}]+\}/), 44);
  assertSquare(block(/\.app-update-button\.btn\.icon-only\s*\{[^}]+\}/), 52);
  assert.match(sessionActions, /grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(sessionActionButton, /width:\s*100%/);
  assert.match(sessionActionButton, /height:\s*auto/);
  assert.match(sessionActionButton, /min-width:\s*0/);
  assert.match(sessionActionButton, /min-height:\s*0/);
  assert.match(sessionActionButton, /aspect-ratio:\s*1/);
  assertSquare(paymentStatusButton, 40);
  assert.match(paymentStatusButton, /flex:\s*0 0 40px/);
  assertSquare(block(/\.player-card-actions \.btn\.icon-only\s*\{[^}]+\}/), 44);
  assert.match(paymentGroupHeader, /grid-template-columns:\s*minmax\(96px,\s*1fr\)\s*clamp\(214px,\s*28vw,\s*274px\)/);
  assert.match(paymentGroupHeader, /"title actions"[\s\S]*"details details"/);
  assert.doesNotMatch(paymentGroupHeader, /"payment payment"/);
  assert.match(paymentGroupActions, /grid-area:\s*actions/);
  assert.match(paymentGroupActions, /grid-template-columns:\s*minmax\(44px,\s*1\.3fr\)\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(paymentGroupActions, /align-items:\s*start/);
  assert.match(paymentGroupActionButton, /width:\s*100%/);
  assert.match(paymentGroupActionButton, /height:\s*auto/);
  assert.match(paymentGroupActionButton, /min-width:\s*0/);
  assert.match(paymentGroupActionButton, /min-height:\s*0/);
  assert.match(paymentGroupActionButton, /aspect-ratio:\s*1/);
  assert.match(paymentGroupActionButton, /align-self:\s*start/);
  assert.match(mobilePaymentGroupActions, /grid-template-columns:\s*minmax\(44px,\s*1\.3fr\)\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(mobilePaymentGroupActionButton, /width:\s*100%/);
  assert.match(mobilePaymentGroupActionButton, /height:\s*auto/);
  assert.match(mobilePaymentGroupActionButton, /aspect-ratio:\s*1/);
  assert.match(narrowPaymentGroupLayout, /grid-template-columns:\s*minmax\(68px,\s*1fr\)\s*196px/);
  assert.match(narrowPaymentGroupLayout, /column-gap:\s*4px/);
  assert.match(shuttleSpentActions, /grid-template-columns:\s*repeat\(2,\s*44px\)/);
  assert.match(shuttleSpentActions, /justify-self:\s*end/);
  assert.match(mobileShuttleSpentActions, /grid-template-columns:\s*repeat\(2,\s*40px\)/);
  assertSquare(mobileActivityButtons, 40);
  assert.match(mobileActivityButtons, /flex:\s*0 0 40px/);
  assert.match(playerBalanceActions, /width:\s*clamp\(168px,\s*42vw,\s*212px\)/);
  assert.match(playerBalanceActions, /align-self:\s*start/);
  assert.match(playerBalanceActions, /justify-self:\s*end/);
  assert.match(mobilePlayerBalanceButton, /width:\s*100%/);
  assert.match(mobilePlayerBalanceButton, /height:\s*auto/);
  assert.match(mobilePlayerBalanceButton, /min-width:\s*0/);
  assert.match(mobilePlayerBalanceButton, /min-height:\s*0/);
  assert.match(mobilePlayerBalanceButton, /aspect-ratio:\s*1/);
  assert.match(mobilePlayerBalanceRow, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(mobilePlayerBalanceActions, /justify-self:\s*end/);
  assert.match(playerBalanceChips, /flex:\s*1 1 100%/);
  assert.match(playerBalanceChipPair, /display:\s*inline-flex/);
  assert.match(playerBalanceChipPair, /white-space:\s*nowrap/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.modal-card \.btn:not\(\.icon-only\):not\(\.icon-button\)\s*\{[^}]*min-height:\s*56px/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.btn:not\(\.icon-only\):not\(\.icon-button\)\s*\{[^}]*min-height:\s*56px !important/);
});

test("payment history rows keep text column wide with compact actions", () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const historyRows = css.match(/\.payment-history-item \.row-main,\s*\.payment-transaction-row \.row-main\s*\{[^}]+\}/)?.[0] || "";
  const historyToolbar = css.match(/\.payment-history-modal \.toolbar\.nowrap\s*\{[^}]+\}/)?.[0] || "";
  const advanceHistoryLayout = css.match(/\.advance-history-layout\s*\{[^}]+\}/)?.[0] || "";
  const advanceHistoryHead = css.match(/\.advance-history-head\s*\{[^}]+\}/)?.[0] || "";
  const advanceHistoryActions = css.match(/\.payment-history-modal \.toolbar\.advance-history-actions\s*\{[^}]+\}/)?.[0] || "";

  assert.match(historyRows, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.doesNotMatch(historyRows, /minmax\(192px,\s*232px\)/);
  assert.match(historyToolbar, /justify-content:\s*flex-end/);
  assert.match(advanceHistoryLayout, /display:\s*block/);
  assert.match(advanceHistoryHead, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(advanceHistoryActions, /grid-template-columns:\s*auto 44px/);
  assert.match(advanceHistoryActions, /width:\s*auto/);
});

test("modal values stay left aligned and focused fields scroll above mobile keyboards", async () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  assert.match(css, /\.modal-card \.field:not\(\.compact-field\) > \.input,[\s\S]*?\.modal-card \.field:not\(\.compact-field\) > \.select\s*\{[^}]*text-align:\s*left/);
  assert.match(css, /\.modal-card \.field:not\(\.compact-field\) > \.select\s*\{[^}]*padding-left:\s*var\(--modal-control-padding-x\)[^}]*text-align-last:\s*left/);
  assert.match(css, /\.modal-card \.field:not\(\.compact-field\) > \.input::-webkit-date-and-time-value\s*\{[^}]*justify-content:\s*flex-start[^}]*text-align:\s*left/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*?\.modal-backdrop\s*\{[^}]*align-items:\s*start[^}]*overflow-y:\s*auto/);
  assert.match(css, /@media \(min-width:\s*390px\) and \(max-width:\s*430px\)[\s\S]*?\.modal-card \.field:not\(\.compact-field\) > \.select\s*\{[^}]*padding-left:\s*14px !important[^}]*text-align-last:\s*left !important/);

  const context = createAppContext();
  const modalSelector = run(context, "MODAL_TEXT_CONTROL_SELECTOR");
  context.__modalScrollOptions = [];
  context.__modalField = {
    scrollIntoView(options) {
      context.__modalScrollOptions.push(options);
    }
  };
  context.__modalCard = {};
  context.__modalInput = {
    matches(selector) {
      return selector === modalSelector;
    },
    closest(selector) {
      if (selector === ".modal-card") return context.__modalCard;
      if (selector.includes(".field")) return context.__modalField;
      return null;
    }
  };

  assert.equal(run(context, "scrollFocusedModalControlIntoView(__modalInput, 0)"), true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(context.__modalScrollOptions.length, 1);
  assert.equal(context.__modalScrollOptions[0].block, "center");
  assert.equal(context.__modalScrollOptions[0].inline, "nearest");
  assert.equal(context.__modalScrollOptions[0].behavior, "smooth");
});

test("app shell version is consistent with the configured technical build", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const config = fs.readFileSync(path.join(ROOT, "js", "config.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
  const version = packageJson.appVersion || packageJson.version;
  const cacheMatch = sw.match(/CACHE_NAME\s*=\s*"ad-smashers-manager-v([^"]+)"/);
  const appVersionMatch = config.match(/APP_VERSION\s*=\s*"([^"]+)"/);
  assert.ok(cacheMatch, "service worker cache name should include release version");
  assert.ok(appVersionMatch, "config should expose the app release version");

  const indexVersions = [...indexHtml.matchAll(/\?v=([^"']+)/g)].map((match) => decodeURIComponent(match[1]));
  const swVersions = [...sw.matchAll(/\?v=([^"']+)/g)].map((match) => decodeURIComponent(match[1]));
  assert.ok(indexVersions.length > 0, "index.html should version every app asset");
  assert.ok(swVersions.length > 0, "service worker should version every cached app asset");
  assert.equal(cacheMatch[1], version, "service worker cache version should match package.json appVersion");
  assert.equal(appVersionMatch[1], version, "config app version should match package.json appVersion");
  assert.equal(manifest.version, version, "manifest version should match package.json appVersion");
  assert.ok(indexVersions.every((item) => item === version), "index.html asset versions should match package.json appVersion");
  assert.ok(swVersions.every((item) => item === version), "service worker asset versions should match package.json appVersion");
});

test("manual update check clears every app cache and notifies the service worker", async () => {
  const context = createAppContext();
  const deletedCaches = [];
  const serviceWorkerMessages = [];
  const cacheApi = {
    async keys() {
      return ["ad-smashers-manager-v0.9.0", "ad-smashers-manager-v1.0.0-beta.1", "other-runtime-cache"];
    },
    async delete(cacheName) {
      deletedCaches.push(cacheName);
      return true;
    }
  };
  context.caches = cacheApi;
  context.window.caches = cacheApi;
  context.navigator.serviceWorker = {
    async getRegistration() {
      return {
        active: {
          postMessage(message) {
            serviceWorkerMessages.push(JSON.parse(JSON.stringify(message)));
          }
        }
      };
    }
  };

  await run(context, "clearAppShellCaches()");

  assert.deepEqual(deletedCaches.sort(), ["ad-smashers-manager-v0.9.0", "ad-smashers-manager-v1.0.0-beta.1", "other-runtime-cache"].sort());
  assert.deepEqual(serviceWorkerMessages, [{ type: "CLEAR_CACHES" }]);
});

test("cloud load records Firestore document version metadata", async () => {
  const context = createAppContext();
  const cloudState = baseFixture({ players: [player("p1", "Cloud Player")] });
  context.fetch = structuredFetchForState(cloudState, 7, "2026-07-03T04:00:00.000000Z");

  await run(context, "loadCloudState()");

  assert.equal(run(context, "cloudStateExists"), true);
  assert.equal(run(context, "cloudStateVersion"), 7);
  assert.equal(run(context, "cloudStateUpdateTime"), "2026-07-03T04:00:00.000000Z");
  assert.equal(run(context, "cloudStateRemoteUpdatedAtMs"), Date.parse("2026-07-03T04:00:00.000000Z"));
  assert.equal(run(context, "cloudStateClientId"), "");
  assert.equal(run(context, "cloudSaveConflict"), false);
});

test("pending local cloud state survives refresh before debounced save", async () => {
  const context = createAppContext();
  const cloudSessionDate = isoDateFromToday(6);
  const pendingSessionDate = isoDateFromToday(7);
  const cloudState = baseFixture({
    sessions: [baseSession({ id: "session-cloud", date: cloudSessionDate, stage: "Draft" })]
  });
  const pendingState = baseFixture({
    sessions: [baseSession({ id: "session-local", date: pendingSessionDate, stage: "Poll Live" })]
  });
  setCloudBaseState(context, cloudState);
  setAppState(context, pendingState);
  run(
    context,
    `
      cloudStateVersion = 7;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
      persistPendingCloudState(state);
      state = emptyState();
    `
  );
  context.fetch = structuredFetchForState(cloudState, 7, "2026-07-03T04:00:00.000000Z");

  const loaded = await run(context, "loadCloudState()");

  assert.deepEqual(Array.from(loaded.sessions, (item) => item.id), ["session-local"]);
  assert.equal(loaded.sessions[0].stage, "Poll Live");
  assert.equal(run(context, "cloudStateNeedsMigrationSave"), true);
  assert.ok(context.localStorage.getItem("ad-smashers-pending-cloud-state-v1"));
});

test("pending cloud restore tolerates null change journals from older saves", async () => {
  const context = createAppContext();
  const cloudSessionDate = isoDateFromToday(6);
  const pendingSessionDate = isoDateFromToday(7);
  const cloudState = baseFixture({
    sessions: [baseSession({ id: "session-cloud", date: cloudSessionDate, stage: "Draft" })]
  });
  const pendingState = baseFixture({
    sessions: [baseSession({ id: "session-local", date: pendingSessionDate, stage: "Poll Live" })]
  });
  context.localStorage.setItem(
    "ad-smashers-pending-cloud-state-v1",
    JSON.stringify({
      appVersion: "1.0.83",
      schemaVersion: 1,
      savedAt: "2026-07-03T04:01:00.000Z",
      savedAtMs: Date.parse("2026-07-03T04:01:00.000Z"),
      baseVersion: 7,
      baseUpdateTime: "2026-07-03T04:00:00.000000Z",
      clientId: "client-local",
      userId: "test-uid",
      email: "admin@adsmashers.app",
      changes: null,
      state: pendingState
    })
  );
  context.fetch = structuredFetchForState(cloudState, 7, "2026-07-03T04:00:00.000000Z");

  const loaded = await run(context, "loadCloudState()");

  assert.deepEqual(Array.from(loaded.sessions, (item) => item.id), ["session-local"]);
  assert.equal(loaded.sessions[0].stage, "Poll Live");
  assert.equal(run(context, "pendingCloudChangesHaveEntries(null)"), false);
  assert.equal(run(context, "patchHasEntries(null)"), false);
  assert.equal(run(context, "cloudStateNeedsMigrationSave"), true);
});

test("pending local change journal replays over newer cloud data from another device", async () => {
  const context = createAppContext();
  const raceDate = isoDateFromToday(7);
  const baseCloudState = baseFixture({
    players: [player("p1", "Original Player")],
    sessions: [baseSession({ id: "session-race", date: raceDate, stage: "Payment Collection" })]
  });
  const newerCloudState = baseFixture({
    players: [player("p1", "Original Player"), player("p2", "Other Device Player")],
    sessions: [baseSession({ id: "session-race", date: raceDate, stage: "Completed" })]
  });
  const pendingState = baseFixture({
    players: [{ ...player("p1", "Locally Renamed Player"), phone: "12345" }],
    sessions: [baseSession({ id: "session-race", date: raceDate, stage: "Payment Collection", waterCost: 12 })]
  });
  setCloudBaseState(context, baseCloudState);
  setAppState(context, pendingState);
  run(
    context,
    `
      cloudStateVersion = 7;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
      persistPendingCloudState(state);
      state = emptyState();
    `
  );
  context.fetch = structuredFetchForState(newerCloudState, 8, "2026-07-03T04:05:00.000000Z");

  const loaded = await run(context, "loadCloudState()");

  assert.deepEqual(Array.from(loaded.players, (item) => item.id), ["p1", "p2"]);
  assert.equal(loaded.players.find((item) => item.id === "p1").name, "Locally Renamed Player");
  assert.equal(loaded.players.find((item) => item.id === "p1").phone, "12345");
  assert.equal(loaded.players.find((item) => item.id === "p2").name, "Other Device Player");
  assert.equal(loaded.sessions[0].stage, "Completed");
  assert.equal(loaded.sessions[0].waterCost, 12);
  assert.equal(run(context, "cloudStateNeedsMigrationSave"), true);
  assert.ok(context.localStorage.getItem("ad-smashers-pending-cloud-state-v1"));
  assert.equal(run(context, "lastCloudSaveError"), "");
});

test("same-device pending payment survives refresh after an older save advanced cloud version", async () => {
  const context = createAppContext();
  const p1 = player("p1", "Paid Player");
  const sessionWithPayment = (status, paidAmount) =>
    baseSession({
      id: "session-payment-race",
      date: "2026-07-10",
      stage: "Payment Collection",
      attendanceManual: true,
      attendedPlayerIds: ["p1"],
      manualAttendedPlayerIds: ["p1"],
      payments: {
        p1: {
          playerId: "p1",
          amount: 20,
          method: "Bank",
          status,
          paidAmount,
          paidDate: paidAmount > 0 ? "2026-07-05" : "",
          advanceAmount: 0
        }
      }
    });
  const olderCloudState = baseFixture({
    players: [p1],
    sessions: [sessionWithPayment("Pending", 0)]
  });
  const newerPendingState = baseFixture({
    players: [p1],
    sessions: [sessionWithPayment("Paid", 20)]
  });

  setCloudBaseState(context, olderCloudState);
  setAppState(context, newerPendingState);
  run(
    context,
    `
      cloudClientId = "client-same-device";
      cloudStateVersion = 7;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
      persistPendingCloudState(state);
      state = emptyState();
    `
  );
  context.fetch = structuredFetchForState(
    olderCloudState,
    8,
    "2026-07-03T04:05:00.000000Z",
    { clientId: "client-same-device", saveId: "older-save" }
  );

  const loaded = await run(context, "loadCloudState()");

  assert.equal(loaded.sessions[0].payments.p1.status, "Paid");
  assert.equal(loaded.sessions[0].payments.p1.paidAmount, 20);
  assert.equal(run(context, "cloudStateVersion"), 8);
  assert.equal(run(context, "cloudStateClientId"), "client-same-device");
  assert.equal(run(context, "cloudStateNeedsMigrationSave"), true);
  assert.equal(run(context, "lastCloudSaveError"), "");
  assert.ok(context.localStorage.getItem("ad-smashers-pending-cloud-state-v1"));
});

test("successful cloud save clears saved pending local state", async () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ sessions: [baseSession({ id: "session-saved" })] }));
  run(
    context,
    `
      cloudStateExists = true;
      cloudStateVersion = 7;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
      persistPendingCloudState(state);
    `
  );
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(200, structuredAuditLogsList([]));
    }
    return jsonResponse(200, {
      writeResults: [{ updateTime: "2026-07-03T04:05:00.000000Z" }],
      commitTime: "2026-07-03T04:05:00.000000Z"
    });
  };

  await run(context, "saveCloudState(state)");

  assert.equal(context.localStorage.getItem("ad-smashers-pending-cloud-state-v1"), null);
});

test("owner sign in seeds an RBAC owner membership", async () => {
  const context = createAppContext();
  let memberReadCount = 0;
  let commitBody = null;
  context.fetch = async (url, request = {}) => {
    if (url.includes("/accounts:signInWithPassword")) {
      return jsonResponse(200, {
        idToken: "owner-token",
        refreshToken: "owner-refresh",
        localId: "owner-uid",
        email: "admin@adsmashers.app",
        expiresIn: "3600"
      });
    }
    if (url.endsWith("/documents/adSmashers/main/members/owner-uid")) {
      memberReadCount += 1;
      if (memberReadCount === 1) {
        return jsonResponse(404, { error: { status: "NOT_FOUND" } });
      }
      return jsonResponse(
        200,
        firestoreDocument("projects/home-kaish/databases/(default)/documents/adSmashers/main/members/owner-uid", {
          uid: "owner-uid",
          email: "admin@adsmashers.app",
          role: "owner",
          status: "active",
          permissions: { manageMembers: true }
        })
      );
    }
    if (url.endsWith("/documents:commit")) {
      commitBody = JSON.parse(request.body);
      return jsonResponse(200, {
        writeResults: [{ updateTime: "2026-07-03T05:00:00.000000Z" }],
        commitTime: "2026-07-03T05:00:00.000000Z"
      });
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND" } });
  };

  await run(context, 'signInToFirebase("admin@adsmashers.app", "secret")');

  const memberWrite = commitBody.writes[0].update;
  assert.equal(memberWrite.name, "projects/home-kaish/databases/(default)/documents/adSmashers/main/members/owner-uid");
  assert.equal(memberWrite.fields.email.stringValue, "admin@adsmashers.app");
  assert.equal(memberWrite.fields.role.stringValue, "owner");
  assert.equal(memberWrite.fields.status.stringValue, "active");
  assert.equal(memberWrite.fields.permissions.mapValue.fields.manageMembers.booleanValue, true);
  assert.equal(run(context, "currentUserRole"), "owner");
});

test("restored owner sessions do not wait for RBAC membership refresh", async () => {
  const context = createAppContext();
  const session = {
    idToken: "restored-token",
    refreshToken: "owner-refresh",
    localId: "owner-uid",
    email: "admin@adsmashers.app",
    expiresAt: Date.now() + 3600000
  };
  context.localStorage.setItem("ad-smashers-firebase-auth-v1", JSON.stringify(session));
  run(context, 'currentUser = null; currentUserMembership = null; currentUserRole = "";');
  let memberRequested = false;
  context.fetch = async (url) => {
    if (url.endsWith("/documents/adSmashers/main/members/owner-uid")) {
      memberRequested = true;
      return new Promise(() => {});
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND" } });
  };

  const restored = await run(context, "restoreFirebaseAuthSession()");

  assert.equal(restored.email, "admin@adsmashers.app");
  assert.equal(run(context, "currentUserRole"), "owner");
  assert.equal(memberRequested, true);
});

test("current owner membership is reused without another Firestore write", async () => {
  const context = createAppContext();
  let commitCalled = false;
  context.fetch = async (url) => {
    if (url.endsWith("/documents/adSmashers/main/members/test-uid")) {
      return jsonResponse(
        200,
        firestoreDocument("projects/home-kaish/databases/(default)/documents/adSmashers/main/members/test-uid", {
          uid: "test-uid",
          email: "admin@adsmashers.app",
          role: "owner",
          status: "active",
          permissions: {
            manageMembers: true,
            manageSettings: true,
            manageSessions: true,
            managePayments: true,
            manageDirectories: true,
            viewReports: true
          },
          createdAt: "2026-07-03T04:00:00.000Z",
          updatedAt: "2026-07-03T04:00:00.000Z",
          updatedBy: "admin@adsmashers.app"
        })
      );
    }
    if (url.endsWith("/documents:commit")) {
      commitCalled = true;
      return jsonResponse(200, { writeResults: [], commitTime: "2026-07-03T04:01:00.000000Z" });
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND" } });
  };

  await run(context, 'prepareAdSmashersAccess("test-token")');

  assert.equal(commitCalled, false);
  assert.equal(run(context, "currentUserRole"), "owner");
});

test("Firestore RBAC rules include owner bootstrap and member-gated access", () => {
  const rules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");

  assert.match(rules, /request\.auth\.token\.email == "admin@adsmashers\.app"/);
  assert.match(rules, /adSmashers\/main\/members\/\$\(request\.auth\.uid\)/);
  assert.match(rules, /hasAdSmashersRole\("owner"\)/);
  assert.match(rules, /collection != "members" && canWriteAdSmashers\(\)/);
});

test("structured cloud save deletes stale documents from every collection", async () => {
  const context = createAppContext();
  const currentPlayer = player("p1", "Current Player");
  const cloudState = baseFixture({
    groups: [{ id: "group-current", name: "Current Group", url: "https://chat.whatsapp.com/current", active: true }],
    courts: [court("court-current", "Current Court")],
    players: [currentPlayer],
    sessions: [baseSession({ id: "session-current", courtId: "court-current", payments: { p1: { status: "Paid", amount: 20, paidAmount: 20, method: "Bank" } } })],
    activities: [{ id: "activity-current", name: "Current Activity", date: isoDateFromToday(-1), totalPaid: 20, paidById: "p1", playerIds: ["p1"], shares: { p1: { amount: 20, status: "Paid" } } }],
    paymentGroups: [{ id: "payment-group-current", name: "Current Payment Group", payerId: "p1", playerIds: ["p1"], guests: [], active: true }],
    paymentTransactions: [{ id: "payment-transaction-current", type: "group-payment", date: isoDateFromToday(-1), paidById: "p1", playerIds: ["p1"], amountPaid: 20, appliedAmount: 20, advanceAmount: 0, allocations: [{ type: "session", playerId: "p1", sessionId: "session-current", amount: 20 }] }],
    advances: { p1: 10 }
  });
  const collectionMap = Object.fromEntries(
    TEST_STRUCTURED_COLLECTIONS.map((spec) => [spec.collectionId, testCollectionItemsForSpec(cloudState, spec)])
  );
  const staleByCollection = {
    groups: [{ id: "group-deleted", name: "Deleted Group", url: "https://chat.whatsapp.com/deleted", active: true }],
    archivedGroups: [{ id: "group-archived-deleted", name: "Deleted Archived Group", url: "https://chat.whatsapp.com/archived-deleted", active: false }],
    courts: [court("court-deleted", "Deleted Court")],
    players: [player("p-deleted", "Deleted Player")],
    archivedPlayers: [{ ...player("p-archived-deleted", "Deleted Archived Player"), active: false }],
    sessions: [baseSession({ id: "session-deleted", courtId: "court-current" })],
    activities: [{ id: "activity-deleted", name: "Deleted Activity", date: isoDateFromToday(-1), totalPaid: 20, paidById: "p1", playerIds: ["p1"], shares: { p1: { amount: 20, status: "Paid" } } }],
    paymentGroups: [{ id: "payment-group-deleted", name: "Deleted Payment Group", payerId: "p1", playerIds: ["p1"], guests: [], active: true }],
    archivedPaymentGroups: [{ id: "payment-group-archived-deleted", name: "Deleted Archived Payment Group", payerId: "p1", playerIds: ["p1"], guests: [], active: false }],
    paymentTransactions: [{ id: "payment-transaction-deleted", type: "group-payment", date: isoDateFromToday(-1), paidById: "p1", playerIds: ["p1"], amountPaid: 20, appliedAmount: 20, advanceAmount: 0, allocations: [{ type: "session", playerId: "p1", sessionId: "session-current", amount: 20 }] }]
  };
  context.fetch = async (url) => {
    if (url.endsWith("/documents/adSmashers/main")) {
      return jsonResponse(200, structuredWorkspaceDocument(cloudState, 7, "2026-07-03T04:00:00.000000Z"));
    }
    if (url.endsWith("/documents/adSmashers/main/settings/current")) {
      return jsonResponse(200, firestoreDocument("projects/home-kaish/databases/(default)/documents/adSmashers/main/settings/current", cloudState.settings || {}));
    }
    const collectionMatch = url.match(/\/documents\/adSmashers\/main\/([^/?]+)\?pageSize=300/);
    if (collectionMatch) {
      const collectionId = collectionMatch[1];
      if (collectionId === "advances") return jsonResponse(200, structuredAdvancesList({ ...cloudState.advances, "p-stale-advance": 30 }));
      return jsonResponse(200, structuredList(collectionId, [...(collectionMap[collectionId] || []), ...(staleByCollection[collectionId] || [])]));
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND" } });
  };

  const loaded = await run(context, "loadCloudState()");
  assert.deepEqual(Array.from(loaded.players, (item) => item.id), ["p1"]);
  assert.ok(!loaded.groups.some((item) => item.id === "group-deleted"));
  assert.deepEqual(Array.from(loaded.sessions, (item) => item.id), ["session-current"]);
  assert.deepEqual(Array.from(loaded.activities, (item) => item.id), ["activity-current"]);
  assert.deepEqual(Array.from(loaded.paymentGroups, (item) => item.id), ["payment-group-current"]);
  assert.deepEqual(Array.from(loaded.paymentTransactions, (item) => item.id), ["payment-transaction-current"]);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(loaded.advances))), ["p1"]);

  let captured = null;
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(200, structuredAuditLogsList([]));
    }
    captured = JSON.parse(request.body);
    return jsonResponse(200, {
      writeResults: [{ updateTime: "2026-07-03T04:02:00.000000Z" }],
      commitTime: "2026-07-03T04:02:00.000000Z"
    });
  };
  context.__loadedState = loaded;
  await run(context, "saveCloudState(__loadedState)");

  const deletes = captured.writes.map((write) => write.delete).filter(Boolean);
  [
    "groups/group-deleted",
    "archivedGroups/group-archived-deleted",
    "courts/court-deleted",
    "players/p-deleted",
    "archivedPlayers/p-archived-deleted",
    "sessions/session-deleted",
    "activities/activity-deleted",
    "paymentGroups/payment-group-deleted",
    "archivedPaymentGroups/payment-group-archived-deleted",
    "paymentTransactions/payment-transaction-deleted",
    "advances/p-stale-advance"
  ].forEach((path) => {
    assert.ok(deletes.includes(`projects/home-kaish/databases/(default)/documents/adSmashers/main/${path}`), path);
  });
});

test("structured cloud save keeps only settings groups in the live groups collection", async () => {
  const context = createAppContext();
  const archivedPlayer = { ...player("p-archived", "Archived Player"), active: false };
  const fridayGroup = { id: "group-friday", name: "Friday Group", url: "https://chat.whatsapp.com/friday", active: true };
  const flexidayGroup = { id: "group-flexiday", name: "FlexiDay Group", url: "https://chat.whatsapp.com/flexi", active: false };
  const archivedGroup = { id: "group-automation", name: "Automation Group", url: "https://chat.whatsapp.com/automation", active: true };
  const activePaymentGroup = { id: "payment-group-active", name: "Active Payment Group", payerId: "p-active", playerIds: ["p-active"], guests: [], active: true };
  const archivedPaymentGroup = { id: "payment-group-archived", name: "Archived Payment Group", payerId: "p-active", playerIds: ["p-active"], guests: [], active: false };
  setAppState(
    context,
    baseFixture({
      groups: [fridayGroup, flexidayGroup, archivedGroup],
      players: [player("p-active", "Active Player"), archivedPlayer],
      paymentGroups: [activePaymentGroup, archivedPaymentGroup]
    })
  );
  let captured = null;
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(200, structuredAuditLogsList([]));
    }
    captured = JSON.parse(request.body);
    return jsonResponse(200, {
      writeResults: [{ updateTime: "2026-07-03T04:03:00.000000Z" }],
      commitTime: "2026-07-03T04:03:00.000000Z"
    });
  };

  await run(context, "saveCloudState(state)");

  const updateNames = captured.writes.map((write) => write.update?.name).filter(Boolean);
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/players/p-active"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedPlayers/p-archived"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/players/p-archived"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedPlayers/p-active"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/groups/group-friday"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/groups/group-flexiday"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedGroups/group-automation"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/groups/group-automation"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedGroups/group-friday"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedGroups/group-flexiday"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/paymentGroups/payment-group-active"));
  assert.ok(updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedPaymentGroups/payment-group-archived"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/paymentGroups/payment-group-archived"));
  assert.ok(!updateNames.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/archivedPaymentGroups/payment-group-active"));

  const collectionFields = captured.writes[0].update.fields.collections.mapValue.fields;
  const collectionIds = (key) => (collectionFields[key]?.arrayValue?.values || []).map((value) => value.stringValue);
  assert.deepEqual(collectionIds("players"), ["p-active"]);
  assert.deepEqual(collectionIds("archivedPlayers"), ["p-archived"]);
  assert.deepEqual(collectionIds("groups"), ["group-friday", "group-flexiday"]);
  assert.deepEqual(collectionIds("archivedGroups"), ["group-automation"]);
  assert.deepEqual(collectionIds("paymentGroups"), ["payment-group-active"]);
  assert.deepEqual(collectionIds("archivedPaymentGroups"), ["payment-group-archived"]);
});

test("cloud save commits a versioned write with update-time precondition", async () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("p1", "Saved Player")] }));
  run(
    context,
    `
      cloudStateExists = true;
      cloudStateVersion = 7;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
    `
  );
  let captured = null;
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(
        200,
        structuredAuditLogsList([
          { id: "audit-expired", createdAt: "2026-05-01T00:00:00.000Z", expiresAt: "2026-05-31T00:00:00.000Z" },
          { id: "audit-current", createdAt: "2999-01-01T00:00:00.000Z", expiresAt: "2999-01-31T00:00:00.000Z" }
        ])
      );
    }
    captured = { url, request, body: JSON.parse(request.body) };
    return jsonResponse(200, {
      writeResults: [{ updateTime: "2026-07-03T04:01:00.000000Z" }],
      commitTime: "2026-07-03T04:01:00.000000Z"
    });
  };

  await run(context, "saveCloudState(state)");

  assert.match(captured.url, /documents:commit$/);
  const workspaceWrite = captured.body.writes[0];
  const settingsWrite = captured.body.writes[1];
  const playerWrite = captured.body.writes.find((write) => write.update?.name.endsWith("/adSmashers/main/players/p1"));
  const auditWrite = captured.body.writes.find((write) => write.update?.name.includes("/adSmashers/main/auditLogs/"));
  assert.equal(workspaceWrite.update.name, "projects/home-kaish/databases/(default)/documents/adSmashers/main");
  assert.equal(workspaceWrite.update.fields.version.integerValue, "8");
  assert.equal(workspaceWrite.update.fields.collections.mapValue.fields.players.arrayValue.values[0].stringValue, "p1");
  assert.equal(workspaceWrite.currentDocument.updateTime, "2026-07-03T04:00:00.000000Z");
  assert.deepEqual(workspaceWrite.updateMask.fieldPaths, ["appId", "name", "schemaVersion", "version", "updatedAt", "updatedBy", "clientId", "saveId", "collections"]);
  assert.equal(settingsWrite.update.name, "projects/home-kaish/databases/(default)/documents/adSmashers/main/settings/current");
  assert.equal(playerWrite.update.fields.name.stringValue, "Saved Player");
  assert.ok(auditWrite, "save should write an audit log");
  assert.equal(auditWrite.update.fields.action.stringValue, "cloudSave");
  assert.equal(auditWrite.update.fields.retentionDays.integerValue, "30");
  assert.equal(auditWrite.update.fields.actor.mapValue.fields.email.stringValue, "admin@adsmashers.app");
  assert.equal(auditWrite.update.fields.actor.mapValue.fields.uid.stringValue, "test-uid");
  assert.equal(auditWrite.update.fields.actor.mapValue.fields.role.stringValue, "owner");
  assert.equal(auditWrite.update.fields.collectionCounts.mapValue.fields.players.integerValue, "1");
  assert.equal(
    Date.parse(auditWrite.update.fields.expiresAt.timestampValue) - Date.parse(auditWrite.update.fields.createdAt.timestampValue),
    30 * 24 * 60 * 60 * 1000
  );
  const deletes = captured.body.writes.map((write) => write.delete).filter(Boolean);
  assert.ok(deletes.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/auditLogs/audit-expired"));
  assert.ok(!deletes.includes("projects/home-kaish/databases/(default)/documents/adSmashers/main/auditLogs/audit-current"));
  assert.equal(run(context, "cloudStateVersion"), 8);
  assert.equal(run(context, "cloudStateUpdateTime"), "2026-07-03T04:01:00.000000Z");
});

test("cloud save rejects oversized commits before any partial write", async () => {
  const context = createAppContext();
  let fetchCount = 0;
  context.fetch = async () => {
    fetchCount += 1;
    return jsonResponse(200, {});
  };
  context.__oversizedWrites = Array.from({ length: 501 }, (_, index) => ({
    delete: `projects/home-kaish/databases/(default)/documents/adSmashers/main/test/${index}`
  }));

  let error = null;
  try {
    await run(context, 'commitFirestoreWrites("test-token", __oversizedWrites)');
  } catch (caught) {
    error = caught;
  }

  assert.ok(error);
  assert.match(error.message, /atomic limit is 500/);
  assert.match(error.message, /No data was written/);
  assert.equal(fetchCount, 0);
});

test("first cloud save creates the structured workspace only when it does not exist", async () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("p1", "First Save")] }));
  let captured = null;
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(200, structuredAuditLogsList([]));
    }
    captured = JSON.parse(request.body);
    return jsonResponse(200, {
      writeResults: [{ updateTime: "2026-07-03T04:02:00.000000Z" }],
      commitTime: "2026-07-03T04:02:00.000000Z"
    });
  };

  await run(context, "saveCloudState(state)");

  assert.deepEqual(captured.writes[0].currentDocument, { exists: false });
  assert.equal(captured.writes[0].update.fields.version.integerValue, "1");
  assert.equal(captured.writes[0].update.name, "projects/home-kaish/databases/(default)/documents/adSmashers/main");
  assert.equal(run(context, "cloudStateExists"), true);
  assert.equal(run(context, "cloudStateVersion"), 1);
});

test("cloud load falls back to the legacy state document and marks it for migration", async () => {
  const context = createAppContext();
  const legacyState = baseFixture({ players: [player("p1", "Legacy Player")] });
  context.fetch = async (url) => {
    if (url.endsWith("/documents/adSmashers/main")) {
      return jsonResponse(404, { error: { status: "NOT_FOUND" } });
    }
    if (url.endsWith("/documents/adSmashers/state")) {
      return jsonResponse(200, firestoreStateDocument(legacyState, 3, "2026-07-03T03:00:00.000000Z"));
    }
    return jsonResponse(404, { error: { status: "NOT_FOUND" } });
  };

  const loaded = await run(context, "loadCloudState()");

  assert.equal(loaded.players[0].name, "Legacy Player");
  assert.equal(run(context, "cloudStateExists"), false);
  assert.equal(run(context, "cloudStateVersion"), 3);
  assert.equal(run(context, "cloudStateNeedsMigrationSave"), true);
});

test("stale cloud saves are rejected and do not advance the local version", async () => {
  const context = createAppContext();
  setAppState(context, baseFixture({ players: [player("p1", "Conflict Player")] }));
  run(
    context,
    `
      cloudStateExists = true;
      cloudStateVersion = 4;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
    `
  );
  context.fetch = async (url) => {
    if (url.includes("/documents/adSmashers/main/auditLogs?pageSize=300")) {
      return jsonResponse(200, structuredAuditLogsList([]));
    }
    return jsonResponse(400, {
      error: {
        status: "FAILED_PRECONDITION",
        message: "The document has changed."
      }
    });
  };

  let error = null;
  try {
    await run(context, "saveCloudState(state)");
  } catch (caught) {
    error = caught;
  }

  assert.ok(error);
  assert.equal(error.cloudStateConflict, true);
  assert.equal(error.message, "Cloud data changed on another device. Reload before saving more changes.");
  assert.equal(run(context, "cloudStateVersion"), 4);
  assert.equal(run(context, "cloudStateUpdateTime"), "2026-07-03T04:00:00.000000Z");
});

test("flushCloudSave replays pending journal and retries after a version conflict", async () => {
  const context = createAppContext();
  const baseCloudState = baseFixture({ players: [player("p1", "Cloud Base")] });
  const localState = baseFixture({ players: [player("p1", "Local Winner")] });
  const newerCloudState = baseFixture({ players: [player("p1", "Cloud Base"), player("p2", "Remote Player")] });
  setCloudBaseState(context, baseCloudState);
  setAppState(context, localState);
  run(
    context,
    `
      cloudStateExists = true;
      cloudStateVersion = 2;
      cloudStateUpdateTime = "2026-07-03T04:00:00.000000Z";
      persistPendingCloudState(state);
    `
  );
  const latestCloudFetch = structuredFetchForState(newerCloudState, 3, "2026-07-03T04:05:00.000000Z");
  const commits = [];
  context.fetch = async (url, request = {}) => {
    if (url.includes("/documents:commit")) {
      commits.push(JSON.parse(request.body || "{}"));
      if (commits.length === 1) {
        return jsonResponse(409, {
          error: {
            status: "ABORTED",
            message: "Transaction conflict."
          }
        });
      }
      return jsonResponse(200, {
        writeResults: [{ updateTime: "2026-07-03T04:06:00.000000Z" }],
        commitTime: "2026-07-03T04:06:00.000000Z"
      });
    }
    return latestCloudFetch(url, request);
  };

  await run(context, "flushCloudSave()");

  const players = jsonValue(context, "state.players.map((item) => ({ id: item.id, name: item.name }))");
  assert.deepEqual(players, [
    { id: "p1", name: "Local Winner" },
    { id: "p2", name: "Remote Player" }
  ]);
  assert.equal(commits.length, 2);
  assert.equal(run(context, "cloudSaveConflict"), false);
  assert.equal(run(context, "cloudSavePending"), false);
  assert.equal(run(context, "lastCloudSaveError"), "");
  assert.equal(run(context, "cloudStateVersion"), 4);
  assert.equal(context.localStorage.getItem("ad-smashers-pending-cloud-state-v1"), null);
});
