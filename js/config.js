const UI_STATE_KEY = "ad-smashers-webapp-ui-state-v1";
const FIREBASE_AUTH_STORAGE_KEY = "ad-smashers-firebase-auth-v1";
const FIREBASE_CLIENT_STORAGE_KEY = "ad-smashers-firebase-client-v1";
const PENDING_CLOUD_STATE_STORAGE_KEY = "ad-smashers-pending-cloud-state-v1";
const PENDING_CLOUD_JOURNAL_SCHEMA_VERSION = 1;
const APP_VERSION = "1.0.6";
const APP_BUILD_VERSION = APP_VERSION;
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD5Xv6DdYbH2bHhxePxcbRLBpoGLUjtzcE",
  authDomain: "home-kaish.firebaseapp.com",
  projectId: "home-kaish",
  storageBucket: "home-kaish.firebasestorage.app",
  messagingSenderId: "307026858029",
  appId: "1:307026858029:web:ad09649a7203eb0c7c68a4",
  measurementId: "G-CQE8NQTDMQ"
};
const FIRESTORE_STATE_PATH = "adSmashers/state";
const FIRESTORE_WORKSPACE_PATH = "adSmashers/main";
const AD_SMASHERS_OWNER_EMAIL = "admin@adsmashers.app";
const AD_SMASHERS_ROLES = ["owner", "admin", "editor", "viewer"];
const AD_SMASHERS_OWNER_PERMISSIONS = {
  manageMembers: true,
  manageSettings: true,
  manageSessions: true,
  managePayments: true,
  manageDirectories: true,
  viewReports: true
};
const PLAYERS_PER_COURT = 6;
const MAX_RECURRING_SESSIONS = 53;
const DEFAULT_PAYMENT_METHOD = "Bank";
const DEFAULT_RACKET_OWNED = "Yes";
const STANDARD_POLL_OPTIONS = ["1. I'm in", "2. I'm in +1", "3. I'm in +2", "4. I need a racket"].join("\n");
const OLD_FINAL_LIST_NO_SHOW_NOTICE = "In Case of No Show, Please Update (3 Hours) Prior to the Session, so Players in the Waiting List Can Plan to Show Up.";
const PREVIOUS_FINAL_LIST_NO_SHOW_NOTICE = "In case of no show, please update (3 hours) prior to the session, so players in the waiting list can plan to show up.";
const DYNAMIC_FINAL_LIST_NO_SHOW_NOTICE = "In case of no show, please update by {{no_show_deadline}}, so players in the waiting list can plan to show up.";
const FINAL_LIST_NO_SHOW_NOTICE = "In case of no show, please update by {{no_show_deadline}}, so players in the waiting list have enough time to join.";
const FINAL_LIST_CANCELLATION_WAITING_NOTICE = "In case of cancellation, please update by {{no_show_deadline}}, so players in the waiting list have enough time to join.";
const FINAL_LIST_CANCELLATION_NOTICE_PLACEHOLDER = "{{final_list_cancellation_notice}}";
const FINAL_LIST_VOTE_ORDER_NOTICE = "ℹ️ List ordered based on timing of the vote.";
const SKILL_LEVELS = ["TBD", "Beginner", "Intermediate", "Professional"];
const SETTINGS_GROUP_IDS = ["group-friday", "group-saturday", "group-flexiday"];
const SESSION_STAGES = ["Draft", "Poll Live", "Player List Published", "Payment Collection", "Completed"];
const SESSION_DETAIL_TABS = ["payments", "poll", "courts", "messages"];
const DEFAULT_SESSION_TAB = SESSION_DETAIL_TABS[0];
const DEFAULT_VIEW = "sessions";
const POLL_VOTE_OPTIONS = ["in", "in_plus_1", "in_plus_2"];
const PULL_REFRESH_THRESHOLD = 140;
const PULL_REFRESH_MAX_OFFSET = 92;
const DASHBOARD_RANGES = [
  { id: "7", label: "7D", days: 7 },
  { id: "28", label: "28D", days: 28 },
  { id: "90", label: "90D", days: 90 },
  { id: "all", label: "All", days: null }
];
const SKILL_RANK = {
  TBD: 2,
  Beginner: 1,
  Guest: 1.5,
  Intermediate: 2,
  Professional: 3
};

const views = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sessions", label: "Sessions" },
  { id: "payments", label: "Payments" },
  { id: "courts", label: "Courts" },
  { id: "players", label: "Players" },
  { id: "settings", label: "Settings" }
];

const bottomViews = ["sessions", "payments", "courts", "players", "settings"];

let uiState;
let activeView;
let activeSessionId;
let activeSessionTab;
let modal;
let toastTimer;
let scrollSaveTimer;
let scrollActivityTimer;
let currentSurfaceKey;
let isRestoringScroll;
let activityDraft;
let groupPaymentDraft;
let paymentGroupDraft;
let state;
let currentUser;
let currentUserMembership;
let currentUserRole;
let authLoading;
let cloudLoading;
let cloudError;
let cloudLoadFailed;
let cloudSaveTimer;
let cloudSaveInFlight;
let cloudSavePending;
let cloudStateNeedsMigrationSave;
let cloudStateExists;
let cloudStateVersion;
let cloudStateUpdateTime;
let cloudStateRemoteUpdatedAtMs;
let cloudStateClientId;
let cloudStateSaveId;
let cloudStructuredCollectionIds;
let cloudStateBaseSnapshot;
let cloudClientId;
let cloudSaveConflict;
let lastCloudSaveError;
let loginError;
let serviceWorkerRegistration;
let pendingAppReload;
const pullRefresh = {
  tracking: false,
  ready: false,
  refreshing: false,
  startX: 0,
  startY: 0,
  offset: 0
};
