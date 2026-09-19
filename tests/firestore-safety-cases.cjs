const root = '/databases/(default)/documents/adSmashers/main';
const owner = { uid: 'test-owner', token: { email: 'admin@adsmashers.app' } };
const before = { appId: 'adSmashers', version: 1492, saveId: 'old-save', collections: { players: ['p1'], sessions: ['s1'] } };
const after = { ...before, version: 1493, saveId: 'new-save' };
const audit = { id: 'new-save', writeProtocol: 2, recoveryId: '', baseVersion: 1492, version: 1493, actor: { uid: owner.uid } };
const mock = (name, path, value) => ({ function: name, args: [{ exactValue: path }], result: { value } });

function saveCase(name, expectation, options = {}) {
  const previous = options.before || before;
  const next = options.after || after;
  const receipt = options.audit || audit;
  const path = options.path || root;
  return { name, test: {
    expectation,
    request: {
      path, method: options.method || 'update',
      auth: options.auth === undefined ? owner : options.auth,
      resource: { data: path === root ? next : { id: 'p1', name: 'Example Player' } }
    },
    resource: { data: path === root ? previous : { id: 'p1', name: 'Example Player' } },
    functionMocks: [
      mock('exists', root, true),
      mock('get', root, { data: previous }),
      mock('getAfter', root, { data: next }),
      mock('getAfter', root + '/auditLogs/' + next.saveId, { data: receipt })
    ]
  } };
}

module.exports = [
  saveCase('normal owner save', 'ALLOW'),
  saveCase('incident version reset', 'DENY', { after: { ...after, version: 1 } }),
  saveCase('version skip', 'DENY', { after: { ...after, version: 1494 } }),
  saveCase('whole workspace erase', 'DENY', { after: { ...after, collections: {} } }),
  saveCase('old cached client without protocol', 'DENY', { audit: { ...audit, writeProtocol: null } }),
  saveCase('audit belongs to another actor', 'DENY', { audit: { ...audit, actor: { uid: 'other' } } }),
  saveCase('reused audit', 'DENY', { after: { ...after, saveId: before.saveId } }),
  saveCase('delete workspace', 'DENY', { method: 'delete' }),
  saveCase('ordinary record update in atomic save', 'ALLOW', { path: root + '/players/p1' }),
  saveCase('ordinary record deletion in atomic save', 'ALLOW', { path: root + '/sessions/s1', method: 'delete', after: { ...after, collections: { players: ['p1'] } } }),
  saveCase('standalone record deletion', 'DENY', { path: root + '/players/p1', method: 'delete', after: before }),
  saveCase('unauthenticated write', 'DENY', { auth: null }),
  saveCase('owner read remains allowed', 'ALLOW', { method: 'get' })
];

module.exports.push(saveCase('pre-recovery save cannot cross a restore checkpoint', 'DENY', { after: { ...after, recoveryId: 'restore-1' } }));
module.exports.push(saveCase('post-recovery save with matching checkpoint', 'ALLOW', { after: { ...after, recoveryId: 'restore-1' }, audit: { ...audit, recoveryId: 'restore-1' } }));
for (const role of ['editor', 'viewer']) {
  const auth = { uid: 'test-member', token: { email: 'member@example.test' } };
  const test = saveCase(role + ' access preserved', role === 'editor' ? 'ALLOW' : 'DENY', {auth, audit:{...audit,actor:{uid:auth.uid}}});
  test.test.functionMocks.push(mock('exists',root+'/members/'+auth.uid,true),mock('get',root+'/members/'+auth.uid,{data:{role,status:'active'}}));
  module.exports.push(test);
}
const plannerMember = '/databases/(default)/documents/planners/test-planner/members/test-member';
module.exports.push({name:'Healthy Lifestyle member access unchanged',test:{expectation:'ALLOW',request:{path:'/databases/(default)/documents/planners/test-planner/state/current',method:'update',auth:{uid:'test-member'},resource:{data:{example:1}}},resource:{data:{example:0}},functionMocks:[mock('exists',plannerMember,true)]}});
module.exports.push({name:'Healthy Lifestyle non-member access denied',test:{expectation:'DENY',request:{path:'/databases/(default)/documents/planners/test-planner/state/current',method:'update',auth:{uid:'test-member'},resource:{data:{example:1}}},resource:{data:{example:0}},functionMocks:[mock('exists',plannerMember,false)]}});
