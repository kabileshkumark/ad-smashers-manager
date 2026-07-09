const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(root, "..");
const backupRoot = path.join(workspaceRoot, "Backups");
const firebaseConfig = {
  apiKey: "AIzaSyD5Xv6DdYbH2bHhxePxcbRLBpoGLUjtzcE",
  projectId: "home-kaish"
};
const adminEmail = process.env.ADS_FIREBASE_EMAIL || "admin@adsmashers.app";
const providedPassword = process.env.ADS_FIREBASE_PASSWORD || "";
const generatedPassword = providedPassword || generatePassword();
const documentsUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:commit`;
const workspacePath = "adSmashers/main";
const legacyStatePath = "adSmashers/state";
const credentialsPath = path.join(root, "firebase-auth-login.txt");
const backupOnly = process.argv.includes("--backup-only");
const settingsGroupIds = ["group-friday", "group-saturday", "group-flexiday"];
const collectionSpecs = [
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

async function main() {
  const authSession = await createOrSignInAdmin(adminEmail, generatedPassword, Boolean(providedPassword));
  const remoteState = await readRemoteState(authSession.idToken);
  if (remoteState) {
    const backupPath = writeRemoteBackup(remoteState.state, remoteState.source);
    console.log(`Remote backup saved to ${backupPath}`);
  } else {
    console.log("No existing remote AD Smashers state found to back up.");
  }

  if (backupOnly) {
    console.log("Backup completed. No Firestore writes were made.");
    return;
  }

  const sourceState = readBackupState();
  await writeStructuredState(authSession.idToken, sourceState, authSession.email, remoteState);
  if (!providedPassword) {
    fs.writeFileSync(
      credentialsPath,
      [
        "AD Smashers Firebase login",
        `Email: ${adminEmail}`,
        `Password: ${generatedPassword}`,
        "URL: https://adsmashers.web.app",
        ""
      ].join("\n"),
      "utf8"
    );
  }
  console.log(`Imported ${sourceState.players?.length || 0} players and ${sourceState.sessions?.length || 0} sessions to structured Firestore.`);
  console.log(`Firebase Auth email: ${adminEmail}`);
  if (!providedPassword) {
    console.log(`Login saved to ${credentialsPath}`);
  }
}

function readBackupState() {
  const explicitSource = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length);
  const candidates = [
    explicitSource,
    path.join(backupRoot, "ad-smashers-backup-2026-07-02.json"),
    path.join(root, "ad-smashers-backup-2026-07-02.json"),
    path.join(root, "js", "bundled-backup.js")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const filePath = path.resolve(root, candidate);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    if (filePath.endsWith(".json")) {
      return JSON.parse(content);
    }
    const match = content.match(/window\.AD_SMASHERS_BUNDLED_BACKUP\s*=\s*({[\s\S]*});\s*$/);
    if (!match) continue;
    return JSON.parse(match[1]).state;
  }

  throw new Error("Could not find backup JSON. Pass --source=path/to/backup.json if needed.");
}

async function readRemoteState(idToken) {
  const workspace = await fetchDocument(idToken, workspacePath, true);
  if (workspace) {
    const structured = await readStructuredState(idToken, workspace);
    return {
      source: "structured",
      state: structured.state,
      collectionIds: structured.collectionIds,
      version: Number(fromFirestoreDocument(workspace).version || 0)
    };
  }

  const legacy = await fetchDocument(idToken, legacyStatePath, true);
  if (!legacy) return null;
  const legacyData = fromFirestoreDocument(legacy);
  if (!legacyData.stateJson) return { source: "legacy", state: emptyState(), collectionIds: emptyCollectionIds(), version: 0 };
  return {
    source: "legacy",
    state: JSON.parse(legacyData.stateJson),
    collectionIds: emptyCollectionIds(),
    version: Number(legacyData.version || 0)
  };
}

async function readStructuredState(idToken, workspace) {
  const workspaceData = fromFirestoreDocument(workspace);
  const workspaceCollections = workspaceData.collections || {};
  const collectionIds = normalizeCollectionIds(workspaceCollections);
  const existingCollectionIds = emptyCollectionIds();
  const settings = await fetchDocument(idToken, `${workspacePath}/settings/current`, true);
  const state = {
    settings: settings ? fromFirestoreDocument(settings) : {},
    groups: [],
    courts: [],
    players: [],
    sessions: [],
    activities: [],
    paymentGroups: [],
    paymentTransactions: [],
    advances: {}
  };

  for (const spec of collectionSpecs) {
    const documents = await listCollection(idToken, workspacePath, spec.collectionId);
    existingCollectionIds[spec.collectionId] = documentIds(documents);
    state[spec.stateKey].push(
      ...orderedCollectionItems(documents, collectionIds[spec.collectionId], {
        useAllWhenNoOrder: !hasCollectionOrder(workspaceCollections, spec.collectionId)
      })
    );
  }

  const advanceDocuments = await listCollection(idToken, workspacePath, "advances");
  existingCollectionIds.advances = documentIds(advanceDocuments);
  state.advances = advancesFromDocuments(advanceDocuments, collectionIds.advances, {
    useAllWhenNoOrder: !hasCollectionOrder(workspaceCollections, "advances")
  });
  return {
    state,
    collectionIds: unionCollectionIds(collectionIds, existingCollectionIds, collectionIdsFromState(state))
  };
}

async function writeStructuredState(idToken, sourceState, email, remoteState) {
  const collectionIds = collectionIdsFromState(sourceState);
  const nextVersion = Number(remoteState?.version || 0) + 1;
  const writes = [
    {
      update: {
        name: documentName(workspacePath),
        fields: toFirestoreFields({
          appId: "adSmashers",
          name: sourceState.settings?.clubName || "AD Smashers Manager",
          schemaVersion: 1,
          version: nextVersion,
          updatedAt: new Date().toISOString(),
          updatedBy: email,
          clientId: "manual-import",
          saveId: `manual-import-${Date.now()}`,
          collections: collectionIds
        })
      },
      updateMask: {
        fieldPaths: ["appId", "name", "schemaVersion", "version", "updatedAt", "updatedBy", "clientId", "saveId", "collections"]
      }
    },
    {
      update: {
        name: documentName(`${workspacePath}/settings/current`),
        fields: toFirestoreFields(sourceState.settings || {})
      }
    }
  ];

  collectionSpecs.forEach((spec) => {
    collectionItemsForSpec(sourceState, spec).forEach((item) => {
      if (!item?.id) return;
      writes.push({
        update: {
          name: documentName(`${workspacePath}/${spec.collectionId}/${item.id}`),
          fields: toFirestoreFields(item)
        }
      });
    });
  });

  Object.entries(sourceState.advances || {}).forEach(([playerId, amount]) => {
    writes.push({
      update: {
        name: documentName(`${workspacePath}/advances/${playerId}`),
        fields: toFirestoreFields({ playerId, amount: Number(amount || 0) })
      }
    });
  });

  writes.push(...staleDeleteWrites(remoteState?.collectionIds, collectionIds));
  await commitWrites(idToken, writes);
}

function writeRemoteBackup(state, source) {
  fs.mkdirSync(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupRoot, `ad-smashers-firestore-${source}-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return backupPath;
}

function staleDeleteWrites(previousIds, nextIds) {
  if (!previousIds) return [];
  const writes = [];
  collectionSpecs.forEach((spec) => {
    const next = new Set(nextIds[spec.collectionId] || []);
    (previousIds[spec.collectionId] || []).forEach((id) => {
      if (!next.has(id)) writes.push({ delete: documentName(`${workspacePath}/${spec.collectionId}/${id}`) });
    });
  });
  const nextAdvances = new Set(nextIds.advances || []);
  (previousIds.advances || []).forEach((id) => {
    if (!nextAdvances.has(id)) writes.push({ delete: documentName(`${workspacePath}/advances/${id}`) });
  });
  return writes;
}

async function createOrSignInAdmin(email, password, passwordWasProvided) {
  if (passwordWasProvided) {
    try {
      return await signIn(email, password);
    } catch (error) {
      return signUp(email, password);
    }
  }
  try {
    return await signUp(email, password);
  } catch (error) {
    if (String(error.message || "").includes("EMAIL_EXISTS")) {
      throw new Error(`Firebase Auth user ${email} already exists. Re-run with ADS_FIREBASE_PASSWORD set to that user's password.`);
    }
    throw error;
  }
}

async function signUp(email, password) {
  const payload = await firebaseRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`, {
    email,
    password,
    returnSecureToken: true
  });
  return {
    idToken: payload.idToken,
    email: payload.email || email
  };
}

async function signIn(email, password) {
  const payload = await firebaseRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`, {
    email,
    password,
    returnSecureToken: true
  });
  return {
    idToken: payload.idToken,
    email: payload.email || email
  };
}

async function fetchDocument(idToken, documentPath, allowMissing = false) {
  const response = await fetch(documentUrl(documentPath), {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  if (response.status === 404 && allowMissing) return null;
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

async function listCollection(idToken, parentPath, collectionId) {
  const documents = [];
  let pageToken = "";
  do {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const response = await fetch(`${documentsUrl}/${parentPath}/${collectionId}?pageSize=300${tokenParam}`, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });
    if (response.status === 404) return documents;
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json();
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || "";
  } while (pageToken);
  return documents;
}

async function commitWrites(idToken, writes) {
  for (let index = 0; index < writes.length; index += 450) {
    const chunk = writes.slice(index, index + 450);
    const response = await fetch(commitUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ writes: chunk })
    });
    if (!response.ok) throw new Error(await errorMessage(response));
  }
}

async function firebaseRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json();
}

async function errorMessage(response) {
  try {
    const payload = await response.json();
    return payload.error?.message || payload.error?.status || response.statusText;
  } catch (error) {
    return response.statusText;
  }
}

function orderedCollectionItems(documents, orderedIds = [], options = {}) {
  const byId = new Map();
  documents.forEach((document) => {
    const data = fromFirestoreDocument(document);
    const id = data.id || documentId(document.name);
    if (id) byId.set(id, { ...data, id });
  });
  const ids = orderedIds.length ? orderedIds : options.useAllWhenNoOrder === false ? [] : [...byId.keys()];
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function advancesFromDocuments(documents, orderedIds = [], options = {}) {
  const byId = new Map();
  documents.forEach((document) => {
    const data = fromFirestoreDocument(document);
    const id = data.playerId || documentId(document.name);
    if (id) byId.set(id, Number(data.amount || 0));
  });
  const ids = orderedIds.length ? orderedIds : options.useAllWhenNoOrder === false ? [] : [...byId.keys()];
  return Object.fromEntries(ids.map((id) => [id, byId.get(id)]).filter(([, amount]) => Number(amount || 0) > 0));
}

function collectionIdsFromState(state = {}) {
  const ids = emptyCollectionIds();
  collectionSpecs.forEach((spec) => {
    ids[spec.collectionId] = collectionItemsForSpec(state, spec).map((item) => item?.id).filter(Boolean);
  });
  ids.advances = Object.keys(state.advances || {}).filter((playerId) => Number(state.advances[playerId] || 0) > 0);
  return ids;
}

function collectionItemsForSpec(state = {}, spec = {}) {
  const items = Array.isArray(state[spec.stateKey]) ? state[spec.stateKey] : [];
  return spec.includeItem ? items.filter((item) => spec.includeItem(item)) : items;
}

function isSettingsGroup(item) {
  return settingsGroupIds.includes(item?.id);
}

function normalizeCollectionIds(value = {}) {
  const ids = emptyCollectionIds();
  collectionSpecs.forEach((spec) => {
    ids[spec.collectionId] = Array.isArray(value?.[spec.collectionId]) ? value[spec.collectionId].filter(Boolean) : [];
  });
  ids.advances = Array.isArray(value?.advances) ? value.advances.filter(Boolean) : [];
  return ids;
}

function hasCollectionOrder(value = {}, collectionId) {
  return Array.isArray(value?.[collectionId]);
}

function unionCollectionIds(...sources) {
  const ids = emptyCollectionIds();
  collectionSpecs.forEach((spec) => {
    ids[spec.collectionId] = uniqueList(sources.flatMap((source) => source?.[spec.collectionId] || []));
  });
  ids.advances = uniqueList(sources.flatMap((source) => source?.advances || []));
  return ids;
}

function uniqueList(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function emptyCollectionIds() {
  return Object.fromEntries([...collectionSpecs.map((spec) => [spec.collectionId, []]), ["advances", []]]);
}

function documentName(documentPath) {
  return `projects/${firebaseConfig.projectId}/databases/(default)/documents/${documentPath}`;
}

function documentUrl(documentPath) {
  return `${documentsUrl}/${documentPath}`;
}

function documentId(name = "") {
  return String(name || "").split("/").pop() || "";
}

function documentIds(documents = []) {
  return documents.map((document) => documentId(document.name)).filter(Boolean);
}

function fromFirestoreDocument(document = {}) {
  return fromFirestoreFields(document.fields || {});
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function fromFirestoreValue(field = {}) {
  if ("nullValue" in field) return null;
  if ("booleanValue" in field) return Boolean(field.booleanValue);
  if ("integerValue" in field) return Number(field.integerValue || 0);
  if ("doubleValue" in field) return Number(field.doubleValue || 0);
  if ("timestampValue" in field) return field.timestampValue || "";
  if ("stringValue" in field) return field.stringValue || "";
  if ("arrayValue" in field) return (field.arrayValue.values || []).map((item) => fromFirestoreValue(item));
  if ("mapValue" in field) return fromFirestoreFields(field.mapValue.fields || {});
  return null;
}

function toFirestoreFields(value = {}) {
  const fields = {};
  Object.entries(value || {}).forEach(([key, fieldValue]) => {
    if (fieldValue !== undefined) fields[key] = toFirestoreValue(fieldValue);
  });
  return fields;
}

function toFirestoreValue(value) {
  if (value === undefined || value === null) return { nullValue: "NULL_VALUE" };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { doubleValue: 0 };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") return { mapValue: { fields: toFirestoreFields(value) } };
  return { stringValue: String(value) };
}

function emptyState() {
  return {
    settings: {},
    groups: [],
    courts: [],
    players: [],
    sessions: [],
    activities: [],
    paymentGroups: [],
    paymentTransactions: [],
    advances: {}
  };
}

function generatePassword() {
  return `${crypto.randomBytes(12).toString("base64url")}Aa1!`;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
