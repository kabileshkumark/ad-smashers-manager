const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(root, "..");
const backupRoot = path.join(workspaceRoot, "Backups");
const firebaseConfig = {
  apiKey: "AIzaSyD5Xv6DdYbH2bHhxePxcbRLBpoGLUjtzcE",
  projectId: "home-kaish"
};
const adminEmail = process.env.ADS_FIREBASE_EMAIL || "admin@adsmashers.app";
const adminPassword = process.env.ADS_FIREBASE_PASSWORD || "";
const documentsUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const workspacePath = "adSmashers/main";
const legacyStatePath = "adSmashers/state";
const settingsGroupIds = ["group-friday", "group-saturday", "group-flexiday"];
const auditLogCollectionId = "auditLogs";
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
  if (!adminPassword) {
    throw new Error("Set ADS_FIREBASE_PASSWORD to the AD Smashers Firebase Auth password before exporting.");
  }
  const auth = await signIn(adminEmail, adminPassword);
  const exportData = await exportFirestore(auth.idToken);
  const report = compareExport(exportData);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(backupRoot, { recursive: true });
  const exportPath = path.join(backupRoot, `ad-smashers-firestore-export-${stamp}.json`);
  const reportPath = path.join(backupRoot, `ad-smashers-firestore-compare-${stamp}.json`);
  fs.writeFileSync(exportPath, `${JSON.stringify(exportData, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printSummary(report, exportPath, reportPath);
}

async function exportFirestore(idToken) {
  const legacyDocument = await fetchDocument(idToken, legacyStatePath, true);
  const workspaceDocument = await fetchDocument(idToken, workspacePath, true);
  const workspace = workspaceDocument ? fromFirestoreDocument(workspaceDocument) : null;
  const collectionOrders = normalizeCollectionIds(workspace?.collections || {});
  const structured = {
    exists: Boolean(workspaceDocument),
    workspace,
    workspaceRaw: workspaceDocument || null,
    settings: null,
    settingsRaw: null,
    collections: {},
    state: null
  };

  if (workspaceDocument) {
    const settingsDocument = await fetchDocument(idToken, `${workspacePath}/settings/current`, true);
    structured.settings = settingsDocument ? fromFirestoreDocument(settingsDocument) : {};
    structured.settingsRaw = settingsDocument;
    const workspaceCollections = workspace?.collections || {};
    const state = {
      settings: structured.settings,
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
      const physical = documents.map((document) => {
        const data = fromFirestoreDocument(document);
        return {
          id: data.id || documentId(document.name),
          path: firestoreRelativePath(document.name),
          updateTime: document.updateTime || "",
          data
        };
      });
      const active = orderedItems(physical, collectionOrders[spec.collectionId], {
        useAllWhenNoOrder: !hasCollectionOrder(workspaceCollections, spec.collectionId)
      });
      structured.collections[spec.collectionId] = {
        stateKey: spec.stateKey,
        orderIds: collectionOrders[spec.collectionId],
        physicalIds: physical.map((item) => item.id).filter(Boolean),
        activeIds: active.map((item) => item.id).filter(Boolean),
        physical,
        active
      };
      state[spec.stateKey].push(...active.map((item) => item.data));
    }

    const advanceDocuments = await listCollection(idToken, workspacePath, "advances");
    const advancesPhysical = advanceDocuments.map((document) => {
      const data = fromFirestoreDocument(document);
      return {
        id: data.playerId || documentId(document.name),
        path: firestoreRelativePath(document.name),
        updateTime: document.updateTime || "",
        data
      };
    });
    const advancesActive = orderedItems(advancesPhysical, collectionOrders.advances, {
      useAllWhenNoOrder: !hasCollectionOrder(workspaceCollections, "advances")
    });
    structured.collections.advances = {
      stateKey: "advances",
      orderIds: collectionOrders.advances,
      physicalIds: advancesPhysical.map((item) => item.id).filter(Boolean),
      activeIds: advancesActive.map((item) => item.id).filter(Boolean),
      physical: advancesPhysical,
      active: advancesActive
    };
    state.advances = Object.fromEntries(
      advancesActive
        .map((item) => [item.id, Number(item.data.amount || 0)])
        .filter(([, amount]) => amount > 0)
    );

    const auditDocuments = await listCollection(idToken, workspacePath, auditLogCollectionId);
    const auditPhysical = auditDocuments.map((document) => {
      const data = fromFirestoreDocument(document);
      return {
        id: data.id || documentId(document.name),
        path: firestoreRelativePath(document.name),
        updateTime: document.updateTime || "",
        data
      };
    });
    const exportNow = new Date();
    const auditActive = auditPhysical.filter((item) => !auditLogIsExpired(item.data, exportNow));
    structured.collections[auditLogCollectionId] = {
      stateKey: auditLogCollectionId,
      orderIds: [],
      physicalIds: auditPhysical.map((item) => item.id).filter(Boolean),
      activeIds: auditActive.map((item) => item.id).filter(Boolean),
      physical: auditPhysical,
      active: auditActive
    };
    structured.state = state;
  }

  const legacy = {
    exists: Boolean(legacyDocument),
    raw: legacyDocument || null,
    data: legacyDocument ? fromFirestoreDocument(legacyDocument) : null,
    state: null
  };
  if (legacy.data?.stateJson) {
    legacy.state = JSON.parse(legacy.data.stateJson);
  }

  return {
    projectId: firebaseConfig.projectId,
    exportedAt: new Date().toISOString(),
    legacy,
    structured
  };
}

function compareExport(exportData) {
  const structured = exportData.structured;
  const report = {
    exportedAt: exportData.exportedAt,
    structuredExists: structured.exists,
    legacyExists: exportData.legacy.exists,
    stalePhysicalDocs: {},
    missingPhysicalDocs: {},
    counts: {},
    legacyVsStructured: {}
  };

  Object.entries(structured.collections || {}).forEach(([collectionId, collection]) => {
    const physicalIds = collection.physicalIds || [];
    const activeIds = collection.activeIds || [];
    const physical = new Set(physicalIds);
    const active = new Set(activeIds);
    report.stalePhysicalDocs[collectionId] = physicalIds.filter((id) => !active.has(id));
    report.missingPhysicalDocs[collectionId] = activeIds.filter((id) => !physical.has(id));
    report.counts[collectionId] = {
      physical: physicalIds.length,
      active: activeIds.length,
      stale: report.stalePhysicalDocs[collectionId].length,
      missing: report.missingPhysicalDocs[collectionId].length
    };
  });

  const legacyState = exportData.legacy.state;
  const structuredState = structured.state;
  if (legacyState && structuredState) {
    [...collectionSpecs, { stateKey: "advances", collectionId: "advances" }].forEach((spec) => {
      const legacyIds = stateIdsForSpec(legacyState, spec);
      const structuredIds = stateIdsForSpec(structuredState, spec);
      const legacySet = new Set(legacyIds);
      const structuredSet = new Set(structuredIds);
      report.legacyVsStructured[spec.collectionId] = {
        legacyCount: legacyIds.length,
        structuredCount: structuredIds.length,
        onlyInLegacy: legacyIds.filter((id) => !structuredSet.has(id)),
        onlyInStructured: structuredIds.filter((id) => !legacySet.has(id))
      };
    });
  }

  return report;
}

function stateIdsForSpec(state, spec) {
  if (spec.stateKey === "advances") return Object.keys(state?.advances || {});
  const items = Array.isArray(state?.[spec.stateKey]) ? state[spec.stateKey] : [];
  const filtered = spec.includeItem ? items.filter((item) => spec.includeItem(item)) : items;
  return filtered.map((item) => item?.id).filter(Boolean);
}

function isSettingsGroup(item) {
  return settingsGroupIds.includes(item?.id);
}

function auditLogIsExpired(log = {}, now = new Date()) {
  const nowMs = now.getTime();
  const expiresAtMs = Date.parse(log.expiresAt || "");
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

function orderedItems(items, orderedIds = [], options = {}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ids = orderedIds.length ? orderedIds : options.useAllWhenNoOrder === false ? [] : items.map((item) => item.id).filter(Boolean);
  return ids.map((id) => byId.get(id)).filter(Boolean);
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

function emptyCollectionIds() {
  return Object.fromEntries([...collectionSpecs.map((spec) => [spec.collectionId, []]), ["advances", []]]);
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

async function firebaseRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await errorMessage(response));
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

function documentUrl(documentPath) {
  return `${documentsUrl}/${documentPath}`;
}

function documentId(name = "") {
  return String(name || "").split("/").pop() || "";
}

function firestoreRelativePath(name = "") {
  const marker = "/documents/";
  const index = String(name || "").indexOf(marker);
  return index >= 0 ? name.slice(index + marker.length) : name;
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

function printSummary(report, exportPath, reportPath) {
  console.log(`Firestore export saved to ${exportPath}`);
  console.log(`Comparison report saved to ${reportPath}`);
  Object.entries(report.counts).forEach(([collectionId, counts]) => {
    console.log(`${collectionId}: active=${counts.active}, physical=${counts.physical}, stale=${counts.stale}, missing=${counts.missing}`);
    const stale = report.stalePhysicalDocs[collectionId] || [];
    if (stale.length) console.log(`  stale: ${stale.join(", ")}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
