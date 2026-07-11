const FIREBASE_AUTH_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
const FIREBASE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const FIRESTORE_DOCUMENTS_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const FIRESTORE_COMMIT_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:commit`;
const FIRESTORE_LEGACY_DOCUMENT_NAME = firestoreDocumentName(FIRESTORE_STATE_PATH);
const FIRESTORE_LEGACY_DOCUMENT_URL = firestoreDocumentUrl(FIRESTORE_STATE_PATH);
const FIRESTORE_WORKSPACE_DOCUMENT_NAME = firestoreDocumentName(FIRESTORE_WORKSPACE_PATH);
const FIRESTORE_WORKSPACE_DOCUMENT_URL = firestoreDocumentUrl(FIRESTORE_WORKSPACE_PATH);
const FIRESTORE_SCHEMA_VERSION = 1;
const FIRESTORE_COMMIT_BATCH_SIZE = 450;
const FIRESTORE_AUDIT_LOG_COLLECTION = "auditLogs";
const AUDIT_LOG_RETENTION_DAYS = 30;
const AUDIT_LOG_RETENTION_MS = AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const FIRESTORE_STRUCTURED_COLLECTIONS = [
  { stateKey: "groups", collectionId: "groups", includeItem: isSettingsGroup },
  { stateKey: "groups", collectionId: "archivedGroups", includeItem: (item) => !isSettingsGroup(item) },
  { stateKey: "courts", collectionId: "courts" },
  { stateKey: "players", collectionId: "players", includeItem: (item) => item?.active !== false },
  { stateKey: "players", collectionId: "archivedPlayers", includeItem: (item) => item?.active === false },
  { stateKey: "sessions", collectionId: "sessions" },
  { stateKey: "activities", collectionId: "activities" },
  { stateKey: "paymentGroups", collectionId: "paymentGroups", includeItem: (item) => item?.active !== false },
  { stateKey: "paymentGroups", collectionId: "archivedPaymentGroups", includeItem: (item) => item?.active === false },
  { stateKey: "paymentTransactions", collectionId: "paymentTransactions" }
];
const PENDING_JOURNAL_COLLECTIONS = ["groups", "courts", "players", "sessions", "activities", "paymentGroups", "paymentTransactions"];
const CLOUD_SAVE_DEBOUNCE_MS = 650;
const CLOUD_SAVE_RETRY_MS = 5000;
const CLOUD_STATE_CONFLICT_MESSAGE = "Cloud data changed on another device. Reload before saving more changes.";
const CLOUD_PENDING_STALE_MESSAGE = "Cloud data changed on another device. Loaded latest cloud data.";
const LEGACY_STORAGE_KEYS = [
  "ad-smashers-webapp-v3-real-data-seeded",
  "ad-smashers-bundled-backup-v1",
  "ad-smashers-manager-auth-v1"
];

function isAuthenticated() {
  return Boolean(currentUser?.idToken);
}

function clearLegacyLocalState() {
  LEGACY_STORAGE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn("Could not clear legacy app state", error);
    }
  });
}

async function signInToFirebase(email, password) {
  const payload = await firebaseRequest(`${FIREBASE_AUTH_BASE_URL}/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`, {
    method: "POST",
    body: {
      email,
      password,
      returnSecureToken: true
    }
  });
  currentUser = normalizeFirebaseSession(payload);
  saveFirebaseAuthSession(currentUser);
  await prepareAdSmashersAccess(currentUser.idToken);
  return currentUser;
}

async function restoreFirebaseAuthSession() {
  const session = loadFirebaseAuthSession();
  if (!session?.refreshToken) return null;
  currentUser = session;
  try {
    const token = await ensureFirebaseIdToken();
    primeAdSmashersAccessRole();
    refreshAdSmashersAccess(token);
    return currentUser;
  } catch (error) {
    clearFirebaseAuthSession();
    currentUser = null;
    throw error;
  }
}

async function signOutFromFirebase() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  resetCloudStateVersion();
  clearFirebaseAuthSession();
  currentUser = null;
  currentUserMembership = null;
  currentUserRole = "";
  state = emptyState();
}

async function ensureFirebaseIdToken() {
  if (!currentUser?.refreshToken) throw new Error("Sign in again.");
  if (currentUser.idToken && Number(currentUser.expiresAt || 0) - Date.now() > 60000) {
    return currentUser.idToken;
  }
  const payload = await firebaseRequest(`${FIREBASE_TOKEN_URL}?key=${FIREBASE_CONFIG.apiKey}`, {
    method: "POST",
    form: {
      grant_type: "refresh_token",
      refresh_token: currentUser.refreshToken
    }
  });
  currentUser = {
    ...currentUser,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token || currentUser.refreshToken,
    localId: payload.user_id || currentUser.localId,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  };
  saveFirebaseAuthSession(currentUser);
  return currentUser.idToken;
}

async function prepareAdSmashersAccess(token) {
  currentUserMembership = (await ensureAdSmashersOwnerMembership(token)) || (await loadCurrentUserMembership(token));
  currentUserRole = currentUserMembership?.role || (isAdSmashersOwnerEmail(currentUser?.email) ? "owner" : "");
}

function refreshAdSmashersAccess(token) {
  prepareAdSmashersAccess(token).catch((error) => {
    console.warn("Could not refresh RBAC membership", error);
  });
}

function primeAdSmashersAccessRole() {
  if (isAdSmashersOwnerEmail(currentUser?.email)) {
    currentUserRole = "owner";
  }
}

async function ensureAdSmashersOwnerMembership(token) {
  if (!currentUser?.localId || !isAdSmashersOwnerEmail(currentUser.email)) return null;
  const memberPath = adSmashersMemberPath(currentUser.localId);
  const existingPayload = await fetchFirestoreDocument(memberPath, token, { allowMissing: true });
  const existing = existingPayload ? firestoreObjectFromDocument(existingPayload) : {};
  if (ownerMembershipIsCurrent(existing)) {
    return existing;
  }
  const now = new Date().toISOString();
  const member = {
    ...existing,
    uid: currentUser.localId,
    email: AD_SMASHERS_OWNER_EMAIL,
    role: "owner",
    status: "active",
    permissions: AD_SMASHERS_OWNER_PERMISSIONS,
    createdAt: existing.createdAt || now,
    updatedAt: now,
    updatedBy: AD_SMASHERS_OWNER_EMAIL
  };
  await commitFirestoreWrites(token, [
    {
      update: {
        name: firestoreDocumentName(memberPath),
        fields: firestoreFieldsFromObject(member)
      }
    }
  ]);
  return member;
}

function ownerMembershipIsCurrent(member = {}) {
  return member.uid === currentUser?.localId
    && isAdSmashersOwnerEmail(member.email)
    && member.role === "owner"
    && member.status === "active"
    && Boolean(member.createdAt)
    && ownerPermissionsAreCurrent(member.permissions);
}

function ownerPermissionsAreCurrent(permissions = {}) {
  return Object.entries(AD_SMASHERS_OWNER_PERMISSIONS).every(([key, value]) => permissions?.[key] === value);
}

async function loadCurrentUserMembership(token) {
  if (!currentUser?.localId) return null;
  const payload = await fetchFirestoreDocument(adSmashersMemberPath(currentUser.localId), token, { allowMissing: true });
  if (!payload) return null;
  const member = firestoreObjectFromDocument(payload);
  if (!AD_SMASHERS_ROLES.includes(member.role) || member.status !== "active") return null;
  return member;
}

function adSmashersMemberPath(uid) {
  return `${FIRESTORE_WORKSPACE_PATH}/members/${uid}`;
}

function isAdSmashersOwnerEmail(email) {
  return String(email || "").trim().toLowerCase() === AD_SMASHERS_OWNER_EMAIL;
}

function isSettingsGroup(item) {
  return SETTINGS_GROUP_IDS.includes(item?.id);
}

async function loadCloudState() {
  const token = await ensureFirebaseIdToken();
  const structuredState = await loadStructuredCloudState(token);
  const cloudState = structuredState || (await loadLegacyCloudState(token));
  setCloudStateBaseSnapshot(cloudState);
  return restorePendingCloudState(cloudState);
}

async function loadStructuredCloudState(token) {
  const workspacePayload = await fetchFirestoreDocument(FIRESTORE_WORKSPACE_PATH, token, { allowMissing: true });
  if (!workspacePayload) return null;

  const workspaceData = firestoreObjectFromDocument(workspacePayload);
  if (workspaceData.appId && workspaceData.appId !== "adSmashers") return null;

  const workspaceCollections = workspaceData.collections || {};
  const collectionIds = normalizeCloudCollectionIds(workspaceCollections);
  const existingCollectionIds = emptyCloudCollectionIds();
  const settingsPromise = fetchFirestoreDocument(`${FIRESTORE_WORKSPACE_PATH}/settings/current`, token, { allowMissing: true });
  const collectionPromises = FIRESTORE_STRUCTURED_COLLECTIONS.map(async (spec) => ({
    spec,
    documents: await listFirestoreCollection(FIRESTORE_WORKSPACE_PATH, spec.collectionId, token)
  }));
  const advanceDocumentsPromise = listFirestoreCollection(FIRESTORE_WORKSPACE_PATH, "advances", token);
  const [settingsPayload, collectionResults, advanceDocuments] = await Promise.all([
    settingsPromise,
    Promise.all(collectionPromises),
    advanceDocumentsPromise
  ]);
  const rawState = {
    settings: settingsPayload ? firestoreObjectFromDocument(settingsPayload) : {},
    groups: [],
    courts: [],
    players: [],
    sessions: [],
    activities: [],
    paymentGroups: [],
    paymentTransactions: [],
    advances: {}
  };

  collectionResults.forEach(({ spec, documents }) => {
    existingCollectionIds[spec.collectionId] = firestoreDocumentIds(documents);
    rawState[spec.stateKey].push(
      ...orderedDocumentsFromCollection(documents, collectionIds[spec.collectionId], {
        useAllWhenNoOrder: !hasCloudCollectionOrder(workspaceCollections, spec.collectionId)
      })
    );
  });

  existingCollectionIds.advances = firestoreDocumentIds(advanceDocuments);
  rawState.advances = advancesFromDocuments(advanceDocuments, collectionIds.advances, {
    useAllWhenNoOrder: !hasCloudCollectionOrder(workspaceCollections, "advances")
  });

  const migratedState = migrateState(rawState, { useSeedCollections: false });
  const loadedIds = cloudCollectionIdsFromState(migratedState);
  cloudStructuredCollectionIds = unionCloudCollectionIds(collectionIds, existingCollectionIds, loadedIds);
  cloudStateNeedsMigrationSave = JSON.stringify(rawState) !== JSON.stringify(migratedState);
  updateCloudStateVersionFromWorkspaceDocument(workspacePayload, workspaceData);
  cloudSaveConflict = false;
  return migratedState;
}

async function loadLegacyCloudState(token) {
  const payload = await fetchFirestoreDocument(FIRESTORE_STATE_PATH, token, { allowMissing: true });
  if (!payload) {
    resetCloudStateVersion();
    cloudStateExists = false;
    cloudSaveConflict = false;
    return emptyState();
  }

  const data = firestoreObjectFromDocument(payload);
  const stateJson = data.stateJson || "";
  cloudStateExists = false;
  cloudStateVersion = normalizeFirestoreVersion(data.version);
  cloudStateUpdateTime = "";
  cloudStateRemoteUpdatedAtMs = remoteStateUpdatedAtMs(payload, data);
  cloudStructuredCollectionIds = emptyCloudCollectionIds();
  if (!stateJson) {
    cloudStateNeedsMigrationSave = true;
    cloudSaveConflict = false;
    return emptyState();
  }

  const rawState = JSON.parse(stateJson);
  const migratedState = migrateState(rawState, { useSeedCollections: false });
  cloudStateNeedsMigrationSave = true;
  cloudSaveConflict = false;
  return migratedState;
}

function saveState() {
  if (!isAuthenticated()) return;
  if (cloudSaveConflict) {
    lastCloudSaveError = CLOUD_STATE_CONFLICT_MESSAGE;
    return;
  }
  persistPendingCloudState(state);
  queueCloudSave();
}

function queueCloudSave(delayMs = CLOUD_SAVE_DEBOUNCE_MS) {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    flushCloudSave();
  }, delayMs);
}

async function saveStateNow() {
  if (isAuthenticated() && !cloudSaveConflict) persistPendingCloudState(state);
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  while (cloudSaveInFlight) {
    cloudSavePending = true;
    await waitForCloudSaveTurn();
    if (lastCloudSaveError) throw new Error(lastCloudSaveError);
  }
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  await flushCloudSave();
  if (lastCloudSaveError) throw new Error(lastCloudSaveError);
}

function waitForCloudSaveTurn() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

async function flushCloudSave() {
  if (!isAuthenticated()) return;
  if (cloudSaveConflict) {
    lastCloudSaveError = CLOUD_STATE_CONFLICT_MESSAGE;
    return;
  }
  if (cloudSaveInFlight) {
    cloudSavePending = true;
    return;
  }
  cloudSaveInFlight = true;
  lastCloudSaveError = "";
  try {
    await saveCloudStateWithJournalRecovery();
  } catch (error) {
    lastCloudSaveError = error.message || "Could not save to Firestore.";
    if (error.cloudStateConflict) {
      cloudSaveConflict = true;
      cloudError = lastCloudSaveError;
      notifyCloudSyncError(lastCloudSaveError);
    } else {
      cloudError = "Cloud save is pending. Retrying...";
      cloudSavePending = true;
      console.warn("Could not save Firestore state", error);
    }
  } finally {
    cloudSaveInFlight = false;
    if (cloudSavePending && !cloudSaveConflict) {
      const retryDelay = lastCloudSaveError ? CLOUD_SAVE_RETRY_MS : CLOUD_SAVE_DEBOUNCE_MS;
      cloudSavePending = false;
      queueCloudSave(retryDelay);
    } else {
      cloudSavePending = false;
    }
  }
}

async function saveCloudStateWithJournalRecovery() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await saveCloudState(state);
      return;
    } catch (error) {
      if (!error.cloudStateConflict || attempt > 0) throw error;
      try {
        await recoverCloudSaveConflict();
      } catch (recoveryError) {
        throw error;
      }
    }
  }
}

async function recoverCloudSaveConflict() {
  const mergedState = await loadCloudState();
  state = mergedState;
  cloudSaveConflict = false;
  cloudError = "";
  lastCloudSaveError = "";
}

async function saveCloudState(nextState) {
  const token = await ensureFirebaseIdToken();
  const saveStartedAtMs = Date.now();
  const cleanState = migrateState(JSON.parse(JSON.stringify(nextState || emptyState())), { useSeedCollections: false });
  const baseVersion = Number(cloudStateVersion || 0);
  const nextVersion = baseVersion + 1;
  const auditLogDocuments = await listFirestoreCollection(FIRESTORE_WORKSPACE_PATH, FIRESTORE_AUDIT_LOG_COLLECTION, token);
  const { writes, collectionIds } = structuredStateWrites(cleanState, nextVersion, auditLogDocuments);
  const updateTime = await commitFirestoreWrites(token, writes);
  cloudStateVersion = nextVersion;
  cloudStateUpdateTime = updateTime;
  cloudStateExists = true;
  cloudStructuredCollectionIds = collectionIds;
  cloudSaveConflict = false;
  cloudStateNeedsMigrationSave = false;
  setCloudStateBaseSnapshot(cleanState);
  clearSavedPendingCloudState(saveStartedAtMs);
}

function structuredStateWrites(cleanState, nextVersion, auditLogDocuments = []) {
  const collectionIds = cloudCollectionIdsFromState(cleanState);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + AUDIT_LOG_RETENTION_MS);
  const clientId = getCloudClientId();
  const saveId = createId("cloud-save");
  const writes = [
    {
      update: {
        name: FIRESTORE_WORKSPACE_DOCUMENT_NAME,
        fields: firestoreFieldsFromObject({
          appId: "adSmashers",
          name: cleanState.settings?.clubName || "AD Smashers Manager",
          schemaVersion: FIRESTORE_SCHEMA_VERSION,
          version: nextVersion,
          updatedAt: createdAt.toISOString(),
          updatedBy: currentUser.email || "",
          clientId,
          saveId,
          collections: collectionIds
        })
      },
      updateMask: {
        fieldPaths: ["appId", "name", "schemaVersion", "version", "updatedAt", "updatedBy", "clientId", "saveId", "collections"]
      },
      currentDocument: cloudWritePrecondition()
    },
    {
      update: {
        name: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/settings/current`),
        fields: firestoreFieldsFromObject(cleanState.settings || {})
      }
    }
  ];

  FIRESTORE_STRUCTURED_COLLECTIONS.forEach((spec) => {
    collectionItemsForSpec(cleanState, spec).forEach((item) => {
      if (!item?.id) return;
      writes.push({
        update: {
          name: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/${spec.collectionId}/${item.id}`),
          fields: firestoreFieldsFromObject(item)
        }
      });
    });
  });

  Object.entries(cleanState.advances || {}).forEach(([playerId, amount]) => {
    writes.push({
      update: {
        name: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/advances/${playerId}`),
        fields: firestoreFieldsFromObject({
          playerId,
          amount: Number(amount || 0)
        })
      }
    });
  });

  writes.push(cloudSaveAuditWrite(saveId, clientId, nextVersion, collectionIds, createdAt, expiresAt));
  writes.push(...staleStructuredDeleteWrites(cloudStructuredCollectionIds, collectionIds));
  writes.push(...expiredAuditLogDeleteWrites(auditLogDocuments, createdAt));
  return { writes, collectionIds };
}

function cloudSaveAuditWrite(saveId, clientId, version, collectionIds, createdAt, expiresAt) {
  return {
    update: {
      name: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/${FIRESTORE_AUDIT_LOG_COLLECTION}/${saveId}`),
      fields: firestoreFieldsFromObject({
        id: saveId,
        action: "cloudSave",
        appId: "adSmashers",
        version,
        createdAt,
        expiresAt,
        retentionDays: AUDIT_LOG_RETENTION_DAYS,
        actor: {
          uid: currentUser.localId || "",
          email: currentUser.email || "",
          role: currentUserRole || ""
        },
        clientId,
        collectionCounts: auditCollectionCounts(collectionIds)
      })
    }
  };
}

function auditCollectionCounts(collectionIds = {}) {
  return Object.fromEntries(
    Object.entries(collectionIds).map(([collectionId, ids]) => [collectionId, Array.isArray(ids) ? ids.length : 0])
  );
}

function expiredAuditLogDeleteWrites(documents = [], now = new Date()) {
  const nowMs = now.getTime();
  const createdBeforeMs = nowMs - AUDIT_LOG_RETENTION_MS;
  return documents
    .filter((document) => auditLogIsExpired(firestoreObjectFromDocument(document), nowMs, createdBeforeMs))
    .map((document) => ({ delete: document.name }));
}

function auditLogIsExpired(log, nowMs, createdBeforeMs) {
  const expiresAtMs = Date.parse(log.expiresAt || "");
  if (Number.isFinite(expiresAtMs)) return expiresAtMs <= nowMs;
  const createdAtMs = Date.parse(log.createdAt || "");
  return Number.isFinite(createdAtMs) && createdAtMs <= createdBeforeMs;
}

function staleStructuredDeleteWrites(previousIds, nextIds) {
  if (!previousIds) return [];
  const writes = [];
  FIRESTORE_STRUCTURED_COLLECTIONS.forEach((spec) => {
    const next = new Set(nextIds[spec.collectionId] || []);
    (previousIds[spec.collectionId] || []).forEach((id) => {
      if (!next.has(id)) {
        writes.push({ delete: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/${spec.collectionId}/${id}`) });
      }
    });
  });
  const nextAdvances = new Set(nextIds.advances || []);
  (previousIds.advances || []).forEach((id) => {
    if (!nextAdvances.has(id)) {
      writes.push({ delete: firestoreDocumentName(`${FIRESTORE_WORKSPACE_PATH}/advances/${id}`) });
    }
  });
  return writes;
}

async function commitFirestoreWrites(token, writes) {
  let rootUpdateTime = "";
  for (let index = 0; index < writes.length; index += FIRESTORE_COMMIT_BATCH_SIZE) {
    const chunk = writes.slice(index, index + FIRESTORE_COMMIT_BATCH_SIZE);
    const response = await fetch(FIRESTORE_COMMIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ writes: chunk })
    });
    if (!response.ok) {
      const payload = await firebaseErrorPayload(response);
      if (isCloudVersionConflict(response, payload)) {
        throw cloudStateConflictError(firebaseErrorText(payload, response));
      }
      throw new Error(firebaseErrorText(payload, response));
    }
    const payload = await response.json();
    if (index === 0) {
      rootUpdateTime = payload.writeResults?.[0]?.updateTime || payload.commitTime || "";
    }
  }
  return rootUpdateTime;
}

function resetCloudStateVersion() {
  cloudStateExists = false;
  cloudStateVersion = 0;
  cloudStateUpdateTime = "";
  cloudStateRemoteUpdatedAtMs = 0;
  cloudStateClientId = "";
  cloudStateSaveId = "";
  cloudStructuredCollectionIds = emptyCloudCollectionIds();
  cloudStateBaseSnapshot = null;
  cloudSaveConflict = false;
}

function updateCloudStateVersionFromWorkspaceDocument(payload, data = firestoreObjectFromDocument(payload)) {
  cloudStateExists = true;
  cloudStateVersion = normalizeFirestoreVersion(data.version);
  cloudStateUpdateTime = payload.updateTime || "";
  cloudStateRemoteUpdatedAtMs = remoteStateUpdatedAtMs(payload, data);
  cloudStateClientId = String(data.clientId || "");
  cloudStateSaveId = String(data.saveId || "");
}

function remoteStateUpdatedAtMs(payload = {}, data = {}) {
  const candidates = [data.updatedAt, payload.updateTime, payload.createTime];
  const value = candidates.map((item) => Date.parse(item || "")).find((item) => Number.isFinite(item));
  return value || 0;
}

function cloneCloudStateValue(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function setCloudStateBaseSnapshot(sourceState) {
  try {
    cloudStateBaseSnapshot = cloneCloudStateValue(sourceState || emptyState());
  } catch (error) {
    cloudStateBaseSnapshot = emptyState();
  }
}

function valuesAreEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isPlainPatchObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function createObjectPatch(baseValue = {}, nextValue = {}) {
  const patch = { set: [], delete: [] };
  collectObjectPatch(baseValue, nextValue, [], patch);
  return patchHasEntries(patch) ? patch : null;
}

function collectObjectPatch(baseValue, nextValue, path, patch) {
  if (valuesAreEqual(baseValue, nextValue)) return;
  if (isPlainPatchObject(baseValue) && isPlainPatchObject(nextValue)) {
    const keys = new Set([...Object.keys(baseValue), ...Object.keys(nextValue)]);
    keys.forEach((key) => {
      const nextPath = [...path, key];
      const hasBase = Object.prototype.hasOwnProperty.call(baseValue, key);
      const hasNext = Object.prototype.hasOwnProperty.call(nextValue, key);
      if (!hasNext) {
        patch.delete.push(nextPath);
      } else if (!hasBase) {
        patch.set.push({ path: nextPath, value: cloneCloudStateValue(nextValue[key]) });
      } else {
        collectObjectPatch(baseValue[key], nextValue[key], nextPath, patch);
      }
    });
    return;
  }
  patch.set.push({ path, value: cloneCloudStateValue(nextValue) });
}

function patchHasEntries(patch = {}) {
  if (!isPlainPatchObject(patch)) return false;
  return Boolean((patch.set || []).length || (patch.delete || []).length);
}

function applyObjectPatch(targetValue = {}, patch = {}) {
  let nextValue = cloneCloudStateValue(targetValue || {});
  (patch.delete || []).forEach((path) => {
    if (!Array.isArray(path) || !path.length) {
      nextValue = {};
      return;
    }
    deletePatchPath(nextValue, path);
  });
  (patch.set || []).forEach((entry) => {
    const path = Array.isArray(entry?.path) ? entry.path : [];
    if (!path.length) {
      nextValue = cloneCloudStateValue(entry?.value);
      return;
    }
    setPatchPath(nextValue, path, entry?.value);
  });
  return nextValue;
}

function setPatchPath(target, path, value) {
  let cursor = target;
  path.slice(0, -1).forEach((key) => {
    if (!isPlainPatchObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = cloneCloudStateValue(value);
}

function deletePatchPath(target, path) {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor?.[path[index]];
    if (!isPlainPatchObject(cursor)) return;
  }
  if (isPlainPatchObject(cursor)) delete cursor[path[path.length - 1]];
}

function createPendingCloudChanges(baseState = emptyState(), nextState = emptyState()) {
  const changes = { schemaVersion: PENDING_CLOUD_JOURNAL_SCHEMA_VERSION, collections: {} };
  const settingsPatch = createObjectPatch(baseState.settings || {}, nextState.settings || {});
  const advancesPatch = createObjectPatch(baseState.advances || {}, nextState.advances || {});
  if (settingsPatch) changes.settings = settingsPatch;
  if (advancesPatch) changes.advances = advancesPatch;
  PENDING_JOURNAL_COLLECTIONS.forEach((collectionKey) => {
    const collectionChange = createCollectionChange(baseState[collectionKey] || [], nextState[collectionKey] || []);
    if (collectionChange) changes.collections[collectionKey] = collectionChange;
  });
  return pendingCloudChangesHaveEntries(changes) ? changes : null;
}

function createCollectionChange(baseItems = [], nextItems = []) {
  const base = collectionIndexById(baseItems);
  const next = collectionIndexById(nextItems);
  const change = { upsert: [], patch: [], delete: [], order: [] };
  base.ids.forEach((id) => {
    if (!next.byId.has(id)) change.delete.push(id);
  });
  next.ids.forEach((id) => {
    const nextItem = next.byId.get(id);
    if (!base.byId.has(id)) {
      change.upsert.push(cloneCloudStateValue(nextItem));
      return;
    }
    const itemPatch = createObjectPatch(base.byId.get(id), nextItem);
    if (itemPatch) {
      change.patch.push({
        id,
        baseItem: cloneCloudStateValue(base.byId.get(id)),
        patch: itemPatch
      });
    }
  });
  if (base.ids.join("|") !== next.ids.join("|")) change.order = [...next.ids];
  return collectionChangeHasEntries(change) ? change : null;
}

function collectionIndexById(items = []) {
  const byId = new Map();
  const ids = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item?.id || "");
    if (!id) return;
    if (!byId.has(id)) ids.push(id);
    byId.set(id, item);
  });
  return { byId, ids };
}

function collectionChangeHasEntries(change = {}) {
  if (!isPlainPatchObject(change)) return false;
  return Boolean((change.upsert || []).length || (change.patch || []).length || (change.delete || []).length || (change.order || []).length);
}

function pendingCloudChangesHaveEntries(changes = {}) {
  if (!isPlainPatchObject(changes)) return false;
  return Boolean(
    patchHasEntries(changes.settings)
      || patchHasEntries(changes.advances)
      || Object.values(changes.collections || {}).some((change) => collectionChangeHasEntries(change))
  );
}

function replayPendingCloudChanges(cloudState, changes = {}) {
  changes = isPlainPatchObject(changes) ? changes : {};
  const nextState = cloneCloudStateValue(cloudState || emptyState());
  if (patchHasEntries(changes.settings)) {
    nextState.settings = applyObjectPatch(nextState.settings || {}, changes.settings);
  }
  if (patchHasEntries(changes.advances)) {
    nextState.advances = applyObjectPatch(nextState.advances || {}, changes.advances);
  }
  Object.entries(changes.collections || {}).forEach(([collectionKey, collectionChange]) => {
    if (!PENDING_JOURNAL_COLLECTIONS.includes(collectionKey)) return;
    nextState[collectionKey] = applyCollectionChange(nextState[collectionKey] || [], collectionChange);
  });
  return migrateState(nextState, { useSeedCollections: false });
}

function applyCollectionChange(latestItems = [], change = {}) {
  const latest = collectionIndexById(latestItems);
  const byId = new Map(latest.byId);
  const naturalOrder = [...latest.ids];
  (change.delete || []).forEach((id) => byId.delete(String(id || "")));
  (change.upsert || []).forEach((item) => {
    const id = String(item?.id || "");
    if (!id) return;
    if (!naturalOrder.includes(id)) naturalOrder.push(id);
    byId.set(id, cloneCloudStateValue(item));
  });
  (change.patch || []).forEach((entry) => {
    const id = String(entry?.id || "");
    if (!id) return;
    const target = byId.get(id) || entry.baseItem || { id };
    if (!naturalOrder.includes(id)) naturalOrder.push(id);
    byId.set(id, applyObjectPatch(target, entry.patch || {}));
  });
  const requestedOrder = Array.isArray(change.order) ? change.order.map((id) => String(id || "")).filter(Boolean) : [];
  const orderedIds = requestedOrder.length ? [...requestedOrder, ...naturalOrder] : naturalOrder;
  const seen = new Set();
  return orderedIds
    .filter((id) => {
      if (!byId.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => byId.get(id));
}

function persistPendingCloudState(sourceState = state) {
  if (!isAuthenticated()) return;
  try {
    const pendingState = cloneCloudStateValue(sourceState || emptyState());
    const baseState = cloudStateBaseSnapshot || emptyState();
    const changes = createPendingCloudChanges(baseState, pendingState);
    localStorage.setItem(
      PENDING_CLOUD_STATE_STORAGE_KEY,
      JSON.stringify({
        appVersion: APP_VERSION,
        schemaVersion: PENDING_CLOUD_JOURNAL_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        savedAtMs: Date.now(),
        baseVersion: Number(cloudStateVersion || 0),
        baseUpdateTime: cloudStateUpdateTime || "",
        clientId: getCloudClientId(),
        userId: currentUser.localId || "",
        email: currentUser.email || "",
        baseState,
        changes,
        state: pendingState
      })
    );
  } catch (error) {
    console.warn("Could not keep pending cloud save locally", error);
  }
}

function readPendingCloudState() {
  try {
    const stored = localStorage.getItem(PENDING_CLOUD_STATE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn("Could not read pending cloud save", error);
    return null;
  }
}

function removePendingCloudState() {
  try {
    localStorage.removeItem(PENDING_CLOUD_STATE_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear pending cloud save", error);
  }
}

function clearSavedPendingCloudState(saveStartedAtMs) {
  const pending = readPendingCloudState();
  if (!pending) return;
  const savedAtMs = pendingCloudStateSavedAtMs(pending);
  if (!savedAtMs || savedAtMs <= saveStartedAtMs) removePendingCloudState();
}

function pendingCloudStateSavedAtMs(pending) {
  const savedAtMs = Number(pending?.savedAtMs || 0);
  if (Number.isFinite(savedAtMs) && savedAtMs > 0) return savedAtMs;
  const parsed = Date.parse(pending?.savedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function restorePendingCloudState(cloudState) {
  const pending = readPendingCloudState();
  if (!pending?.state && !pending?.changes) return cloudState;
  if (!pendingCloudStateBelongsToCurrentUser(pending)) {
    removePendingCloudState();
    return cloudState;
  }
  if (pendingCloudChangesHaveEntries(pending.changes)) {
    cloudStateNeedsMigrationSave = true;
    cloudSaveConflict = false;
    lastCloudSaveError = "";
    return replayPendingCloudChanges(cloudState, pending.changes);
  }
  if (!pendingCloudStateIsNewer(pending)) {
    discardStalePendingCloudState(pending);
    return cloudState;
  }
  cloudStateNeedsMigrationSave = true;
  cloudSaveConflict = false;
  lastCloudSaveError = "";
  return migrateState(pending.state, { useSeedCollections: false });
}

function pendingCloudStateBelongsToCurrentUser(pending) {
  const pendingUserId = String(pending?.userId || "");
  const currentUserId = String(currentUser?.localId || "");
  if (pendingUserId && currentUserId) return pendingUserId === currentUserId;
  const pendingEmail = String(pending?.email || "").trim().toLowerCase();
  const currentEmail = String(currentUser?.email || "").trim().toLowerCase();
  return !pendingEmail || !currentEmail || pendingEmail === currentEmail;
}

function pendingCloudStateIsNewer(pending) {
  const pendingBaseVersion = normalizeFirestoreVersion(pending?.baseVersion);
  const currentVersion = Number(cloudStateVersion || 0);
  if (pendingBaseVersion === currentVersion) return true;
  return pendingCloudStateFollowsOwnRecentSave(pending, pendingBaseVersion, currentVersion);
}

function pendingCloudStateFollowsOwnRecentSave(pending, pendingBaseVersion, currentVersion) {
  const pendingClientId = String(pending?.clientId || "");
  return Boolean(
    pendingClientId
      && cloudStateClientId
      && pendingClientId === cloudStateClientId
      && pendingBaseVersion + 1 === currentVersion
  );
}

function discardStalePendingCloudState(pending) {
  removePendingCloudState();
  const pendingBaseVersion = normalizeFirestoreVersion(pending?.baseVersion);
  if (pendingBaseVersion !== Number(cloudStateVersion || 0)) {
    lastCloudSaveError = CLOUD_PENDING_STALE_MESSAGE;
    notifyCloudSyncError(CLOUD_PENDING_STALE_MESSAGE);
  }
}

function normalizeFirestoreVersion(value) {
  const version = Number(value || 0);
  return Number.isInteger(version) && version >= 0 ? version : 0;
}

function firestoreNumber(field) {
  if (!field) return 0;
  const value = field.integerValue ?? field.doubleValue ?? field.stringValue ?? 0;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function cloudWritePrecondition() {
  if (cloudStateUpdateTime) return { updateTime: cloudStateUpdateTime };
  return { exists: false };
}

function getCloudClientId() {
  if (cloudClientId) return cloudClientId;
  try {
    const stored = localStorage.getItem(FIREBASE_CLIENT_STORAGE_KEY);
    if (stored) {
      cloudClientId = stored;
      return cloudClientId;
    }
    cloudClientId = createId("client");
    localStorage.setItem(FIREBASE_CLIENT_STORAGE_KEY, cloudClientId);
    return cloudClientId;
  } catch (error) {
    cloudClientId = cloudClientId || createId("client");
    return cloudClientId;
  }
}

function byteLength(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(String(text || "")).length;
  if (typeof Blob !== "undefined") return new Blob([String(text || "")]).size;
  return String(text || "").length;
}

function isCloudVersionConflict(response, payload) {
  const status = payload?.error?.status || "";
  return response.status === 409 || response.status === 412 || (response.status === 404 && cloudStateUpdateTime) || status === "ABORTED" || status === "FAILED_PRECONDITION";
}

function cloudStateConflictError(message) {
  const error = new Error(CLOUD_STATE_CONFLICT_MESSAGE);
  error.cloudStateConflict = true;
  error.details = message;
  return error;
}

function notifyCloudSyncError(message) {
  const toast = document.querySelector("#toast");
  if (toast && typeof showToast === "function") {
    showToast(message);
  }
}

async function fetchFirestoreDocument(path, token, options = {}) {
  const response = await fetch(firestoreDocumentUrl(path), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (response.status === 404 && options.allowMissing) return null;
  if (!response.ok) {
    throw new Error(await firebaseErrorMessage(response));
  }
  return response.json();
}

async function listFirestoreCollection(parentPath, collectionId, token) {
  const documents = [];
  let pageToken = "";
  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const response = await fetch(`${FIRESTORE_DOCUMENTS_URL}/${parentPath}/${collectionId}?pageSize=300${tokenParam}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (response.status === 404) return documents;
    if (!response.ok) {
      throw new Error(await firebaseErrorMessage(response));
    }
    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return documents;
}

function orderedDocumentsFromCollection(documents, orderedIds = [], options = {}) {
  const byId = new Map();
  documents.forEach((document) => {
    const data = firestoreObjectFromDocument(document);
    const id = data.id || firestoreDocumentId(document.name);
    if (!id) return;
    byId.set(id, { ...data, id });
  });
  const ids = orderedIds.length ? orderedIds : options.useAllWhenNoOrder === false ? [] : [...byId.keys()];
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function firestoreDocumentIds(documents = []) {
  return documents.map((document) => firestoreDocumentId(document.name)).filter(Boolean);
}

function advancesFromDocuments(documents, orderedIds = [], options = {}) {
  const byId = new Map();
  documents.forEach((document) => {
    const data = firestoreObjectFromDocument(document);
    const id = data.playerId || firestoreDocumentId(document.name);
    if (!id) return;
    byId.set(id, Number(data.amount || 0));
  });
  const ids = orderedIds.length ? orderedIds : options.useAllWhenNoOrder === false ? [] : [...byId.keys()];
  return Object.fromEntries(ids.map((id) => [id, byId.get(id)]).filter(([, amount]) => Number(amount || 0) > 0));
}

function cloudCollectionIdsFromState(sourceState = {}) {
  const ids = emptyCloudCollectionIds();
  FIRESTORE_STRUCTURED_COLLECTIONS.forEach((spec) => {
    ids[spec.collectionId] = collectionItemsForSpec(sourceState, spec).map((item) => item?.id).filter(Boolean);
  });
  ids.advances = Object.keys(sourceState.advances || {}).filter((playerId) => Number(sourceState.advances[playerId] || 0) > 0);
  return ids;
}

function collectionItemsForSpec(sourceState = {}, spec = {}) {
  const items = Array.isArray(sourceState[spec.stateKey]) ? sourceState[spec.stateKey] : [];
  return spec.includeItem ? items.filter((item) => spec.includeItem(item)) : items;
}

function normalizeCloudCollectionIds(value = {}) {
  const ids = emptyCloudCollectionIds();
  FIRESTORE_STRUCTURED_COLLECTIONS.forEach((spec) => {
    ids[spec.collectionId] = Array.isArray(value?.[spec.collectionId]) ? value[spec.collectionId].filter(Boolean) : [];
  });
  ids.advances = Array.isArray(value?.advances) ? value.advances.filter(Boolean) : [];
  return ids;
}

function hasCloudCollectionOrder(value = {}, collectionId) {
  return Array.isArray(value?.[collectionId]);
}

function unionCloudCollectionIds(...sources) {
  const merged = emptyCloudCollectionIds();
  FIRESTORE_STRUCTURED_COLLECTIONS.forEach((spec) => {
    merged[spec.collectionId] = uniqueIds(sources.flatMap((source) => source?.[spec.collectionId] || []));
  });
  merged.advances = uniqueIds(sources.flatMap((source) => source?.advances || []));
  return merged;
}

function emptyCloudCollectionIds() {
  return Object.fromEntries([...FIRESTORE_STRUCTURED_COLLECTIONS.map((spec) => [spec.collectionId, []]), ["advances", []]]);
}

function firestoreDocumentName(path) {
  return `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${path}`;
}

function firestoreDocumentUrl(path) {
  return `${FIRESTORE_DOCUMENTS_URL}/${path}`;
}

function firestoreDocumentId(documentName = "") {
  return String(documentName || "").split("/").pop() || "";
}

function firestoreObjectFromDocument(document = {}) {
  return firestoreObjectFromFields(document.fields || {});
}

function firestoreObjectFromFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, jsonFromFirestoreValue(value)]));
}

function jsonFromFirestoreValue(field = {}) {
  if ("nullValue" in field) return null;
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("integerValue" in field) return Number(field.integerValue || 0);
  if ("doubleValue" in field) return Number(field.doubleValue || 0);
  if ("timestampValue" in field) return field.timestampValue || "";
  if ("stringValue" in field) return field.stringValue || "";
  if ("arrayValue" in field) return (field.arrayValue.values || []).map((item) => jsonFromFirestoreValue(item));
  if ("mapValue" in field) return firestoreObjectFromFields(field.mapValue.fields || {});
  return null;
}

function firestoreFieldsFromObject(value = {}) {
  const fields = {};
  Object.entries(value || {}).forEach(([key, fieldValue]) => {
    if (fieldValue !== undefined) fields[key] = firestoreValueFromJson(fieldValue);
  });
  return fields;
}

function firestoreValueFromJson(value) {
  if (value === undefined || value === null) return { nullValue: "NULL_VALUE" };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => firestoreValueFromJson(item))
      }
    };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { doubleValue: 0 };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: firestoreFieldsFromObject(value)
      }
    };
  }
  return { stringValue: String(value) };
}

function normalizeFirebaseSession(payload) {
  return {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    localId: payload.localId,
    email: payload.email || "",
    expiresAt: Date.now() + Number(payload.expiresIn || 3600) * 1000
  };
}

function loadFirebaseAuthSession() {
  try {
    const stored = localStorage.getItem(FIREBASE_AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function saveFirebaseAuthSession(session) {
  try {
    localStorage.setItem(FIREBASE_AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn("Could not save Firebase session", error);
  }
}

function clearFirebaseAuthSession() {
  try {
    localStorage.removeItem(FIREBASE_AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear Firebase session", error);
  }
}

async function firebaseRequest(url, options = {}) {
  const request = {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {})
    }
  };
  if (options.body) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }
  if (options.form) {
    request.headers["Content-Type"] = "application/x-www-form-urlencoded";
    request.body = new URLSearchParams(options.form).toString();
  }
  const response = await fetch(url, request);
  if (!response.ok) {
    throw new Error(await firebaseErrorMessage(response));
  }
  return response.json();
}

async function firebaseErrorMessage(response) {
  return firebaseErrorText(await firebaseErrorPayload(response), response);
}

async function firebaseErrorPayload(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function firebaseErrorText(payload, response) {
  const message = payload?.error?.message || payload?.error?.status || response.statusText;
  if (message === "EMAIL_NOT_FOUND" || message === "INVALID_PASSWORD" || message === "INVALID_LOGIN_CREDENTIALS") {
    return "Email or password is incorrect.";
  }
  if (message === "PERMISSION_DENIED") {
    return "This account does not have AD Smashers access.";
  }
  return message || "Firebase request failed.";
}
