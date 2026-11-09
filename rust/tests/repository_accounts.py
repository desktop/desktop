"""Saved-record account identity, scoped metadata and pinned gh operations (offline)."""
import copy
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from discard_advanced import BINARY
from repository_context import Suite, private, stop, wait_for
from smoke import WebSocket

ALICE = 'synthetic-assigned-alice-private'
BOB = 'synthetic-assigned-bob-private'
ENV = 'synthetic-effective-environment-private'
SECRET = 'synthetic-account-diagnostic-private'
NAMED = {'mode': 'assigned', 'host': 'github.com', 'login': 'AliceCase'}
OTHER = {**NAMED, 'login': 'BobCase'}
NONE = {'mode': 'none'}
EFFECTIVE = {'mode': 'effective'}


def clean(value):
    text = value if isinstance(value, str) else json.dumps(value)
    assert not any(secret in text for secret in [ALICE, BOB, ENV, SECRET]), text
    return value


def path_json(path):
    try:
        str(path).encode('utf-8')
        return str(path)
    except UnicodeEncodeError:
        return {'bytes': list(os.fsencode(path))}


class Accounts(Suite):
    def __init__(self, root):
        super().__init__(root)
        self.registry = root/'accounts/repositories.json'
        self.env.update(GH_TOKEN=ENV, GITHUB_TOKEN=BOB, GH_ENTERPRISE_TOKEN=ENV,
                        GITHUB_ENTERPRISE_TOKEN=BOB, GH_REPO='foreign.invalid/wrong/repo',
                        GH_HOST='foreign.invalid', GH_DEBUG='api', DEBUG='1')
        gh = root/'bin/gh'
        gh.write_text(f'#!{sys.executable}\n' + r'''import json,os,sys,time
from pathlib import Path
args=sys.argv[1:];c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
body=sys.stdin.buffer.read()
host=args[args.index('--hostname')+1] if '--hostname' in args else c['host']
kind='protocol' if args[:3]==['config','get','git_protocol'] else 'token' if args[:2]==['auth','token'] else 'catalog' if args[:2]==['auth','status'] else 'api' if args and args[0]=='api' else 'metadata' if args[:2]==['repo','view'] else 'typed'
login=args[args.index('--user')+1] if '--user' in args else None
variables=['GH_TOKEN','GITHUB_TOKEN'] if host=='github.com' or host.endswith('.ghe.com') else ['GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']
token=next((os.environ[key] for key in variables if os.environ.get(key)),c['users'][c['active']]['token'])
if kind=='token' and login is not None:token=c['users'].get(login,{}).get('token','')
actors={value['token']:value for value in c['users'].values()}
actors[c['environment']['token']]=c['environment']
actor=actors.get(token)
endpoint=('graphql' if 'graphql' in args else args[-1]) if kind=='api' else None
entry={'args':args,'kind':kind,'actor':None if actor is None else actor['login'],'body':body.decode('utf-8'),
       'tokens_absent':not any(key in os.environ for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']),
       'pinned':bool(actor) and all(os.environ.get(key)==token for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']),
       'debug_cleared':not any(key in os.environ for key in ['GH_DEBUG','DEBUG']),
       'defaults_cleared':not any(key in os.environ for key in ['GH_HOST','GH_REPO'])}
with open(os.environ['CONTEXT_GH_LOG'],'a') as log:log.write(json.dumps(entry)+'\n')
delay=c.get('delay')
if delay and delay['kind']==kind and (delay.get('endpoint') is None or delay['endpoint']==endpoint):
 Path(os.environ['CONTEXT_GH_STARTED']).write_text('started')
 deadline=time.monotonic()+25
 while not Path(os.environ['CONTEXT_GH_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
if kind=='protocol':
 print(c.get('git_protocol','https'));sys.exit(0)
if kind=='catalog':
 if c.get('catalog_failure'):
  sys.stdout.write(c['secret']);sys.stderr.write(c['secret']);sys.exit(1)
 rows=[]
 for name in c['visible']:
  user=c['users'][name]
  rows.append({'host':host,'login':name,'active':name==c['active'],'state':'error' if name in c['signed_out'] else 'success','gitProtocol':'https','tokenSource':'keyring','oauthToken':c['secret'],'token':c['secret'],'unknown':{'token':c['secret']}})
 print(json.dumps({'hosts':{host:rows}}));sys.exit(0)
if kind=='token':
 if login is not None and (login not in c['visible'] or login in c['signed_out']):
  sys.stderr.write(c['secret']);sys.exit(1)
 if not token:sys.stderr.write(c['secret']);sys.exit(1)
 print(token);sys.exit(0)
if actor is None:sys.stderr.write(c['secret']);sys.exit(4)
if kind=='api':
 failure=c.get('api_failures',{}).get(endpoint)
 if failure:
  sys.stdout.write(c['secret']);sys.stderr.write(c['secret']);sys.exit(failure)
 if not entry['pinned']:sys.stderr.write(c['secret']);sys.exit(93)
 if endpoint=='graphql':
  payload=json.loads(body);query=payload['query'];repo=c['repositories'][actor['login']]
  if c.get('echo_credential'):sys.stderr.write('diagnostic '+token+'\n')
  if 'createPullRequest' in query:value={'data':{'createPullRequest':{'pullRequest':{'id':'PR_fixture','url':'https://'+c['host']+'/'+repo['full_name']+'/pull/7'}}}}
  else:value={'data':{'repository':{'id':'R_fixture','nameWithOwner':repo['full_name'],'url':repo['html_url'],'pullRequests':{'nodes':[],'pageInfo':{'hasNextPage':False,'endCursor':None}}}}}
 elif endpoint=='/user':value={'id':actor['id'],'login':actor['login'],'plan':{'name':'pro'}}
 elif endpoint in c.get('pull_requests',{}):value=c['pull_requests'][endpoint]
 elif endpoint in c.get('repository_responses',{}):value=c['repository_responses'][endpoint]
 elif endpoint.startswith('/repos/') and '/rules/' not in endpoint:value=c['repositories'][actor['login']]
 elif '/rules/branches/' in endpoint:value=[]
 else:sys.stderr.write(c['secret']);sys.exit(94)
 print(json.dumps(value));sys.exit(0)
if kind=='metadata':
 repo=c['repositories'][actor['login']]
 parent=repo.get('parent')
 print(json.dumps({'nameWithOwner':repo['full_name'],'url':repo['html_url'],'isFork':repo['fork'],'parent':None if parent is None else {'nameWithOwner':parent['full_name'],'url':parent['html_url']}}));sys.exit(0)
if c.get('echo_credential'):sys.stderr.write('diagnostic '+token+'\n')
if args[:2] in [['pr','create'],['issue','create']]:
 print('https://'+c['host']+'/fork/repo/'+('pull/7' if args[0]=='pr' else 'issues/8')+('?trace='+token if c.get('echo_credential') else ''))
elif '--json' in args:
 value=[{'number':8,'title':'offline issue','body':token if c.get('echo_credential') else 'safe'}] if args[1]=='list' else {'number':8,'title':'offline issue','body':token if c.get('echo_credential') else 'safe'}
 print(json.dumps(value))
else:print('offline typed operation')
sys.exit(c.get('typed_code',0))
''')
        gh.chmod(0o700)
        real_git = shutil.which('git'); assert real_git
        git = root/'bin/git'
        git.write_text(f'#!{sys.executable}\n' + f'''import subprocess,sys
args=sys.argv[1:];remaining=iter(args);command=None;tail=[]
for argument in remaining:
 if argument in ['-C','-c','--git-dir','--work-tree','--namespace']:next(remaining,None)
 elif not argument.startswith('-'):command=argument;tail=list(remaining);break
if command in ['fetch','push','pull','clone'] or (command=='ls-remote' and '--get-url' not in tail) or (command=='remote' and any(value in tail for value in ['update','prune','-f','--fetch'])):sys.exit(97)
result=subprocess.run([{real_git!r},*args]);sys.exit(result.returncode)
''')
        git.chmod(0o700)
        self.configure()

    def configure(self, **changes):
        host = changes.pop('host', 'github.com')
        base = {'id': 2001, 'full_name': 'fork/repo', 'name': 'repo', 'html_url': f'https://{host}/fork/repo',
                'owner': {'login': 'fork'}, 'private': True, 'fork': False, 'parent': None}
        self.data = {'host': host, 'active': 'BobCase', 'visible': ['AliceCase', 'BobCase'], 'signed_out': [],
                     'users': {'AliceCase': {'id': 101, 'login': 'alicecase', 'token': ALICE},
                               'BobCase': {'id': 202, 'login': 'bobcase', 'token': BOB}},
                     'environment': {'id': 303, 'login': 'environment-user', 'token': ENV},
                     'repositories': {'alicecase': {**base, 'fork': True, 'parent': {'full_name': 'parent/repo', 'html_url': f'https://{host}/parent/repo'}},
                                      'bobcase': copy.deepcopy(base), 'environment-user': copy.deepcopy(base)},
                     'secret': SECRET, **changes}
        self.started.unlink(missing_ok=True); self.release.unlink(missing_ok=True)
        private(self.scenario, json.dumps(self.data))

    def update(self, **changes):
        self.data.update(changes); private(self.scenario, json.dumps(self.data))

    def seed(self, name, *options, save=True):
        f = super().seed(name, *options)
        for remote, owner in [('origin', 'fork'), ('upstream', 'parent')]:
            f.git('remote', 'set-url', remote, f'https://{self.data["host"]}/{owner}/repo.git')
        if save: self.cli('repositories', 'add', f.path)
        return f

    def invoke(self, arguments, *, payload=None, fail=False, config=None, timeout=25):
        argv = [str(BINARY), '--config', str(self.registry if config is None else config), *map(str, arguments)]
        result = subprocess.run(argv, input=payload, env=self.env, capture_output=True, text=True, timeout=timeout)
        clean(result.stdout); clean(result.stderr)
        if fail:
            assert result.returncode, (arguments, result.stdout)
            return result
        assert result.returncode == 0, (arguments, result.stderr, result.stdout)
        return json.loads(result.stdout)

    def cli(self, *args, **kwargs): return self.invoke(args, **kwargs)
    def command(self, f, *args, **kwargs): return self.invoke(['-C', f.path, *args], **kwargs)
    def rpc(self, f, method, *, fail=False, config=None, **params):
        return self.command(f, 'repo', '-', payload=json.dumps({'method': method, **params}), fail=fail, config=config)
    def clear_calls(self): self.log.unlink(missing_ok=True)
    def account(self, f, **kwargs): return self.rpc(f, 'repository_account', **kwargs)
    def catalog(self, f, **kwargs): return self.rpc(f, 'repository_account_catalog', **kwargs)
    def preview(self, f, target=NAMED, **kwargs): return self.rpc(f, 'repository_account_preview', target=target, **kwargs)
    def assign(self, f, target=NAMED, **kwargs):
        plan = self.preview(f, target, **kwargs)
        assert plan['can_apply'], plan
        return self.rpc(f, 'set_repository_account', target=target, basis=plan['basis'], **kwargs)
    def github(self, f, action=None, repository=None, **kwargs):
        return self.rpc(f, 'github', request={'repository': repository, 'action': action or {'type': 'issues'}}, **kwargs)
    def record(self, f, config=None):
        path = self.registry if config is None else config
        return next(record for record in json.loads(path.read_text()).get('records', []) if record['path'] == path_json(f.path))
    def evidence(self, f, config=True):
        common = Path(os.fsdecode(f.git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.rstrip(b'\n')))
        index = Path(os.fsdecode(f.git('rev-parse', '--path-format=absolute', '--git-path', 'index').stdout.rstrip(b'\n')))
        return (f.git('for-each-ref', '--format=%(refname) %(objectname)').stdout,
                f.git('symbolic-ref', '-q', 'HEAD', check=False).stdout, index.read_bytes(),
                (common/'config').read_bytes() if config else None,
                f.git('config', 'user.name').stdout, f.git('config', 'user.email').stdout,
                (f.path/'file').read_bytes(), (f.path/'loose').read_bytes() if (f.path/'loose').exists() else None)
    def start_rpc(self, f, method, **params):
        child = subprocess.Popen([str(BINARY), '--config', str(self.registry), '-C', str(f.path), 'repo', '-'],
                                 env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        child.stdin.write(json.dumps({'method': method, **params})); child.stdin.close(); child.stdin = None
        try: wait_for(self.started.exists, 'delayed gh request did not start'); return child
        except BaseException: stop(child); raise

    @contextmanager
    def server(self, f):
        child = subprocess.Popen([str(BINARY), '--config', str(self.registry), '-C', str(f.path), 'serve', '--port', '0'],
                                 env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        ws = None
        try:
            assert select.select([child.stderr], [], [], 12)[0], 'account server startup timed out'
            line = child.stderr.readline(); match = re.search(r'http://([^/]+)/#token=(\S+)', line)
            assert match, line
            authority, token = match.groups(); ws = WebSocket(authority, 'http://'+authority)
            ws.send({'token': token}); assert ws.receive()['ready']
            yield ws
        finally:
            if ws: ws.close()
            stop(child)


def call(ws, method, fail=False, **params):
    request_id = getattr(ws, 'account_request_id', 100)+1; ws.account_request_id = request_id
    ws.send({'id': request_id, 'method': method, **params})
    result = ws.receive(); clean(result)
    assert result['id'] == request_id, result
    if fail: assert 'error' in result, result; return result
    assert 'result' in result, result
    return result['result']


def catalog_and_readonly(s):
    s.configure(); f = s.seed('unsaved-account', save=False)
    absent = s.account(f); assert not absent['saved'] and absent['scope_id'] is None and absent['assignment'] == EFFECTIVE
    assert not s.registry.exists()
    s.preview(f, fail=True); assert not s.registry.exists()
    view = s.catalog(f); assert view['status'] == 'available' and view['account']['assignment'] == EFFECTIVE
    assert [row['login'] for row in view['accounts']] == ['AliceCase', 'BobCase']
    assert view['accounts'][1]['active'] and not s.registry.exists()
    s.cli('repositories', 'add', f.path); before = s.registry.read_bytes(); evidence = s.evidence(f)
    account = s.account(f); assert account['saved'] and account['revision'] == 0 and account['assignment'] == EFFECTIVE
    s.clear_calls(); s.catalog(f)
    assert s.registry.read_bytes() == before and s.evidence(f) == evidence
    assert all(row['kind'] == 'catalog' and row['tokens_absent'] and row['debug_cleared'] and row['defaults_cleared'] for row in s.calls())
    snapshot = s.rpc(f, 'snapshot'); assert snapshot['repository_account']['scope_id'] == account['scope_id']
    assert snapshot['repository_account']['assignment'] == EFFECTIVE
    s.update(visible=['AliceCase']); assert s.catalog(f)['account']['assignment'] == EFFECTIVE
    clean(s.calls())


def assignments_and_atomic_metadata(s):
    s.configure(); f = s.seed('account-transitions'); before = s.evidence(f); initial = s.account(f)
    plan = s.preview(f, {**NAMED, 'login': 'ALICECASE'})
    assert plan['status'] == 'verified' and plan['can_apply'] and plan['actor']['id'] == 101
    assert s.account(f) == initial and s.record(f)['account']['association'] is None
    view = s.rpc(f, 'set_repository_account', target={**NAMED, 'login': 'ALICECASE'}, basis=plan['basis'])
    assert view['assignment'] == {**NAMED, 'id': 101} and view['revision'] == 1
    record = s.record(f)['account']; assert record['assignment'] == view['assignment'] and record['association']['metadata']['is_fork']
    clean(s.registry.read_text())
    context = s.context(f); assert context['status'] == 'verified' and context['repository']['is_fork'] and context['contribution_remote'] == 'upstream'
    assert s.evidence(f) == before
    stored = s.registry.read_bytes(); s.update(visible=['BobCase'])
    missing = s.preview(f, NAMED); assert not missing['can_apply'] and missing['status'] == 'unavailable'
    s.rpc(f, 'set_repository_account', target=NAMED, basis=missing['basis'], fail=True)
    assert s.registry.read_bytes() == stored and s.account(f)['assignment']['id'] == 101
    s.configure(); s.assign(f, NONE)
    assert s.account(f)['assignment'] == NONE and s.record(f)['account']['association'] is None
    assert s.context(f)['repository'] is None
    s.clear_calls(); s.github(f, fail=True); assert not s.calls() and s.evidence(f) == before
    s.assign(f, EFFECTIVE); assert s.account(f)['assignment'] == EFFECTIVE
    assert s.context(f)['repository'] is None
    s.refresh(f); assert s.context(f)['status'] == 'verified' and not s.context(f)['repository']['is_fork']
    assert s.github(f, repository='github.com/fork/repo')['code'] == 0
    assert [row for row in s.calls() if row['kind'] == 'typed'][-1]['actor'] == 'environment-user'
    # An account's failed metadata proof cannot publish either its assignment or cache.
    stored = s.registry.read_bytes(); s.update(api_failures={'/repos/fork/repo': 1})
    unavailable = s.preview(f); assert not unavailable['can_apply']
    s.rpc(f, 'set_repository_account', target=NAMED, basis=unavailable['basis'], fail=True)
    assert s.registry.read_bytes() == stored and s.evidence(f) == before
    # Parent setup follows verified fork metadata, adds only the missing remote,
    # and leaves author, refs, index and user files intact.
    s.configure(); g = s.seed('account-parent-add'); g.git('remote', 'remove', 'upstream')
    evidence = s.evidence(g, config=False); s.assign(g)
    assert g.git('remote', 'get-url', 'upstream').stdout == b'https://github.com/parent/repo.git\n'
    assert s.evidence(g, config=False) == evidence
    # Keep the selected fork when adding an alphabetically earlier upstream,
    # including legacy scoped caches without either remembered remote name.
    h = s.seed('account-without-origin'); h.git('remote', 'rename', 'origin', 'z-fork'); h.git('remote', 'remove', 'upstream')
    s.assign(h); assert s.context(h)['status'] == 'verified' and s.context(h)['remote'] == 'z-fork'
    value = json.loads(s.registry.read_text())
    stored = next(record['account'] for record in value['records'] if record['path'] == str(h.path))
    stored.pop('source_remote', None); stored['association'].pop('remote_name', None)
    private(s.registry, json.dumps(value))
    assert s.context(h)['status'] == 'verified' and s.context(h)['remote'] == 'z-fork'
    s.assign(h, NONE); assert s.account(h)['remote'] == 'z-fork' and s.context(h)['repository'] is None
    s.assign(h, EFFECTIVE); s.refresh(h)
    assert s.context(h)['status'] == 'verified' and s.context(h)['remote'] == 'z-fork'
    assert not s.context(h)['repository']['is_fork']


def typed_operations_and_signed_out(s):
    s.configure(); f = s.seed('typed-account'); s.assign(f); before = s.evidence(f)
    body = 'first line\n\nLiteral $(no-shell), `quoted`, unicode 雪 and NUL-free bytes\n'+('body line\n'*300)
    s.clear_calls(); s.update(echo_credential=True)
    for action in [{'type': 'create_pull_request', 'title': 'Offline PR', 'body': body, 'base': 'main', 'head': 'fork:feature', 'draft': True},
                   {'type': 'create_issue', 'title': 'Offline issue', 'body': body}]:
        assert s.github(f, action)['code'] == 0
    assert s.github(f, {'type': 'issues'})['data'][0]['body'] == '[redacted]'
    typed = [row for row in s.calls() if row['kind'] == 'typed']
    assert len(typed) == 2
    graphql = [row for row in s.calls() if row['kind'] == 'api' and 'graphql' in row['args']]
    assert len(graphql) == 2 and all(row['actor'] == 'alicecase' and row['pinned'] for row in graphql)
    payloads = [json.loads(row['body']) for row in graphql]
    mutation = next(value for value in payloads if 'createPullRequest' in value['query'])
    assert mutation['variables']['input']['body'] == body
    assert mutation['variables']['input']['headRefName'] == 'fork:feature'
    assert all('--input' in row['args'] and row['args'][-1] == '-' for row in graphql)
    assert not any(row['args'][:2] == ['pr', 'create'] for row in s.calls())
    for row in typed:
        assert row['actor'] == 'alicecase' and row['pinned'] and row['debug_cleared'] and row['defaults_cleared']
        assert row['args'][-2:] == ['--repo', 'github.com/fork/repo']
        if row['args'][1] == 'create': assert row['body'] == body and '--body-file' in row['args'] and body not in row['args']
    assert all(row['tokens_absent'] for row in s.calls() if row['kind'] in ['catalog', 'token'])
    assert any('--user' in row['args'] and row['args'][row['args'].index('--user')+1] == 'AliceCase' for row in s.calls())
    assert s.evidence(f) == before
    s.clear_calls(); s.github(f, repository='foreign.example/fork/repo', fail=True); assert not s.calls()
    assignment = s.account(f)['assignment']; stored = s.registry.read_bytes()
    s.update(echo_credential=False, signed_out=['AliceCase']); s.clear_calls()
    s.github(f, {'type': 'create_issue', 'title': 'Must not run', 'body': body}, fail=True)
    assert not any(row['kind'] == 'typed' for row in s.calls())
    assert s.account(f)['assignment'] == assignment and s.registry.read_bytes() == stored
    s.update(catalog_failure=True); catalog = s.catalog(f)
    assert catalog['status'] == 'unavailable' and catalog['account']['assignment'] == assignment
    assert s.registry.read_bytes() == stored
    s.update(catalog_failure=False, visible=[]); assert s.catalog(f)['accounts'] == []
    assert s.account(f)['assignment'] == assignment and s.registry.read_bytes() == stored
    clean(s.calls())
    # A temporarily unavailable .git must not downgrade a saved account into
    # the native unbound credential path, including explicit --repo requests.
    s.configure(); g = s.seed('broken-saved-account-scope'); s.assign(g)
    s.cli('repositories', 'select', g.path)
    subdir = g.path/'inside/working'; subdir.mkdir(parents=True)
    child = copy.copy(g); child.path = subdir
    request = json.dumps({'repository': 'github.com/fork/repo', 'action': {'type': 'issues'}})
    before = s.evidence(g); metadata = g.path/'.git'; hidden = g.path/'.git-account-test-hidden'
    metadata.rename(hidden); s.clear_calls()
    try:
        s.cli('--selected', 'github', request, fail=True)
        s.command(child, 'github', request, fail=True)
        assert not s.calls()
    finally: hidden.rename(metadata)
    assert s.evidence(g) == before
    # An explicit native request outside every saved path retains its existing
    # free CLI behavior. Corrupt registry state cannot authorize that fallback.
    outside = copy.copy(g); outside.path = s.root/'outside-unsaved-git'; outside.path.mkdir()
    assert s.command(outside, 'github', request)['code'] == 0
    assert [row for row in s.calls() if row['kind'] == 'typed'][-1]['actor'] == 'environment-user'
    corrupt = s.root/'invalid-native-namespace.json'; private(corrupt, '{broken')
    s.clear_calls(); s.command(outside, 'github', request, config=corrupt, fail=True)
    assert not s.calls() and corrupt.read_text() == '{broken'


def queued_typed_requests_enforce_account_basis(s):
    for label, target in [('named', OTHER), ('none', NONE)]:
        s.configure(); f = s.seed('queued-account-'+label); s.assign(f)
        basis = s.account(f)['basis']
        requests = [
            {'account_basis': basis, 'action': {'type': 'create_pull_request', 'title': 'Queued offline PR',
                                               'body': 'queued PR body\n', 'base': 'main', 'head': 'fork:feature'}},
            {'account_basis': basis, 'action': {'type': 'create_issue', 'title': 'Queued offline issue',
                                               'body': 'queued issue body\n'}},
        ]
        s.assign(f, target); current = s.account(f)
        stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_calls()
        for request in requests:
            s.rpc(f, 'github', request=request, fail=True)
        assert not s.calls() and s.registry.read_bytes() == stored and s.evidence(f) == before
        if target == OTHER:
            for request in requests:
                assert s.rpc(f, 'github', request={**request, 'account_basis': current['basis']})['code'] == 0
            typed = [row for row in s.calls() if row['kind'] == 'typed']
            assert len(typed) == 1 and all(row['actor'] == 'bobcase' and row['pinned'] for row in typed)
            graphql = [row for row in s.calls() if row['kind'] == 'api' and 'graphql' in row['args']]
            assert len(graphql) == 2 and all(row['actor'] == 'bobcase' and row['pinned'] for row in graphql)
            assert any('createPullRequest' in json.loads(row['body'])['query'] for row in graphql)
            assert s.github(f)['code'] == 0
            assert [row for row in s.calls() if row['kind'] == 'typed'][-1]['actor'] == 'bobcase'
        else:
            s.rpc(f, 'github', request={**requests[0], 'account_basis': current['basis']}, fail=True)
            assert not s.calls()
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
        # Global authentication discovery is independent of the repository's
        # queued actor proof, including when that repository has no account.
        s.clear_calls()
        assert s.rpc(f, 'github', request={'account_basis': basis, 'action': {'type': 'auth_status'}})['code'] == 0
        assert len(s.calls()) == 1 and s.calls()[0]['kind'] == 'catalog'
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
    s.configure(); f = s.seed('queued-account-source'); s.assign(f)
    basis = s.account(f)['basis']; account = s.record(f)['account']; before = s.evidence(f)
    f.git('remote', 'set-url', 'origin', 'https://github.com/changed/repo.git')
    try:
        assert s.account(f)['basis'] != basis and s.record(f)['account'] == account
        stored = s.registry.read_bytes(); changed = s.evidence(f); s.clear_calls()
        for request in requests:
            s.rpc(f, 'github', request={**request, 'account_basis': basis}, fail=True)
        assert not s.calls() and s.registry.read_bytes() == stored and s.evidence(f) == changed
    finally:
        f.git('remote', 'set-url', 'origin', 'https://github.com/fork/repo.git')
    assert s.account(f)['basis'] == basis and s.evidence(f) == before
    # A queued account proof requires its saved repository even when the
    # native CLI's explicit selector would otherwise allow an outside request.
    outside = copy.copy(f); outside.path = s.root/'queued-account-outside'; outside.path.mkdir()
    request = {**requests[0], 'account_basis': basis, 'repository': 'github.com/fork/repo'}
    s.clear_calls(); s.command(outside, 'github', json.dumps(request), fail=True)
    assert not s.calls() and s.registry.read_bytes() == stored and s.evidence(f) == before


def shared_worktrees_relocate_and_adopt(s):
    s.configure(); f = s.seed('shared-main'); s.assign(f); alice = s.account(f)
    linked = s.root/'shared-linked'; f.git('worktree', 'add', '-qb', 'linked-account', str(linked))
    g = copy.copy(f); g.path = linked; s.cli('repositories', 'add', linked); s.assign(g, OTHER); bob = s.account(g)
    assert alice['scope_id'] != bob['scope_id'] and bob['assignment']['id'] == 202
    assert s.context(f)['repository']['is_fork'] and not s.context(g)['repository']['is_fork']
    first = s.record(f); second = s.record(g)
    third = s.root/'shared-unsaved'; f.git('worktree', 'add', '-qb', 'third-account', str(third))
    with s.server(f) as ws:
        adopted = call(ws, 'open_worktree', path=str(linked))
        assert adopted['repository_account']['scope_id'] == bob['scope_id'] and adopted['repository_account']['assignment']['id'] == 202
        assert s.record(f) == first and s.record(g) == second
        moved = call(ws, 'open_worktree', path=str(third))
        assert moved['repository_account']['scope_id'] == bob['scope_id'] and moved['repository_account']['assignment']['id'] == 202
        h = copy.copy(f); h.path = third
        assert s.record(h)['id'] == second['id'] and s.record(h)['account'] == second['account']
        assert s.record(f) == first and not s.account(g)['saved']
        assert not s.context(h)['repository']['is_fork'] and s.context(f)['repository']['is_fork']
        # An unrelated repository is never an account-scope migration target.
        unrelated = s.seed('unrelated-worktree-target'); before = s.registry.read_bytes()
        call(ws, 'open_worktree', path=str(unrelated.path), fail=True)
        assert s.registry.read_bytes() == before


def stale_reviews_and_namespaces(s):
    for change in ['actor', 'repository', 'source', 'account', 'record']:
        s.configure(); f = s.seed('stale-account-'+change); plan = s.preview(f)
        if change == 'actor':
            users = copy.deepcopy(s.data['users']); users['AliceCase']['id'] = 999; s.update(users=users)
        elif change == 'repository':
            repositories = copy.deepcopy(s.data['repositories']); repositories['alicecase']['id'] = 9001; s.update(repositories=repositories)
        elif change == 'source': f.git('remote', 'set-url', 'origin', 'https://github.com/changed/repo.git')
        elif change == 'account': s.assign(f, NONE)
        else:
            s.cli('repositories', 'forget', f.path); s.cli('repositories', 'add', f.path)
        stored = s.registry.read_bytes(); before = s.evidence(f)
        s.rpc(f, 'set_repository_account', target=NAMED, basis=plan['basis'], fail=True)
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
    s.configure(); f = s.seed('namespace-account'); plan = s.preview(f)
    other = s.root/'other-namespace.json'; private(other, s.registry.read_bytes()); before = other.read_bytes()
    s.rpc(f, 'set_repository_account', target=NAMED, basis=plan['basis'], config=other, fail=True)
    assert other.read_bytes() == before
    s.assign(f); assigned = s.account(f)
    subdir = f.path/'nested/working'; subdir.mkdir(parents=True); child = copy.copy(f); child.path = subdir
    assert s.account(child)['scope_id'] == assigned['scope_id'] and s.account(child)['assignment'] == assigned['assignment']
    assert s.account(f, config=other)['assignment'] == EFFECTIVE
    # A client cannot authorize the server's numeric actor identity.
    stored = s.registry.read_bytes(); s.preview(f, {**NAMED, 'id': 999}, fail=True)
    assert s.registry.read_bytes() == stored


def forgotten_bridge_handle(s):
    s.configure(); f = s.seed('forgotten-fixed-handle'); s.assign(f); old = s.account(f)
    linked = s.root/'forgotten-linked'; f.git('worktree', 'add', '-qb', 'forgotten-linked', str(linked))
    with s.server(f) as ws:
        assert call(ws, 'repository_account')['scope_id'] == old['scope_id']
        s.cli('repositories', 'forget', f.path); s.cli('repositories', 'add', f.path)
        assert s.account(f)['scope_id'] != old['scope_id']
        stored = s.registry.read_bytes(); s.clear_calls()
        call(ws, 'repository_account', fail=True)
        call(ws, 'github', request={'action': {'type': 'issues'}}, fail=True)
        call(ws, 'open_worktree', path=str(linked), fail=True)
        assert not s.calls() and s.registry.read_bytes() == stored
        rebound = call(ws, 'open_repository', path=str(f.path))
        assert rebound['repository_account']['scope_id'] != old['scope_id'] and rebound['repository_account']['assignment'] == EFFECTIVE


def malformed_records_legacy_and_native_paths(s):
    s.configure(); f = s.seed('malformed-account-record'); original = json.loads(s.registry.read_text())
    for fault in ['account', 'assignment', 'mode', 'unknown', 'effective_extra', 'none_extra']:
        value = copy.deepcopy(original); account = next(record for record in value['records'] if record['path'] == str(f.path))
        if fault == 'account': del account['account']
        elif fault == 'assignment': del account['account']['assignment']
        elif fault == 'mode': account['account']['assignment'] = {'mode': 'unrecognized'}
        elif fault == 'effective_extra': account['account']['assignment'] = {'mode': 'effective', 'login': 'untrusted', 'token': SECRET}
        elif fault == 'none_extra': account['account']['assignment'] = {'mode': 'none', 'allow': True}
        else: account['account']['unknown'] = SECRET
        encoded = json.dumps(value); private(s.registry, encoded); s.clear_calls()
        s.account(f, fail=True); s.github(f, fail=True)
        assert s.registry.read_text() == encoded and not s.calls()
    private(s.registry, json.dumps(original))
    s.clear_calls(); before = s.registry.read_bytes()
    for target in [{'mode': 'none', 'allow': True}, {'mode': 'effective', 'login': 'untrusted', 'token': SECRET}]:
        s.preview(f, target, fail=True)
        s.rpc(f, 'set_repository_account', target=target, basis='0'*64, fail=True)
    assert not s.calls() and s.registry.read_bytes() == before
    g = s.seed('legacy-account', save=False); legacy = s.root/'legacy-account.json'
    encoded = json.dumps({'version': 1, 'selected': str(g.path), 'repositories': [str(g.path)]}); private(legacy, encoded)
    account = s.account(g, config=legacy); assert account['saved'] and account['assignment'] == EFFECTIVE
    assert account['scope_id'].startswith('legacy-')
    s.catalog(g, config=legacy); s.rpc(g, 'snapshot', config=legacy)
    assert legacy.read_text() == encoded
    if os.name == 'posix':
        one = s.seed(os.fsdecode(b'raw-account-\xff')); two = s.seed(os.fsdecode(b'raw-account-\xfe'))
        s.assign(one); s.assign(two, NONE)
        assert s.account(one)['scope_id'] != s.account(two)['scope_id']
        assert s.account(one)['assignment']['id'] == 101 and s.account(two)['assignment'] == NONE
        assert s.record(one)['path'] == {'bytes': list(os.fsencode(one.path))}
        assert s.record(two)['path'] == {'bytes': list(os.fsencode(two.path))}


def discovery_and_operation_races(s):
    for label, delay, method, params in [
        ('catalog-source', {'kind': 'catalog'}, 'repository_account_catalog', {}),
        ('typed-opening-source', {'kind': 'api', 'endpoint': '/user'}, 'github', {'request': {'action': {'type': 'create_issue', 'title': 'Must not run', 'body': 'offline body'}}}),
        ('typed-response-source', {'kind': 'typed'}, 'github', {'request': {'action': {'type': 'issues'}}}),
    ]:
        s.configure(); f = s.seed(label); s.assign(f); s.clear_calls(); s.update(delay=delay)
        child = s.start_rpc(f, method, **params)
        try:
            f.git('remote', 'set-url', 'origin', 'https://github.com/changed/repo.git')
            stored = s.registry.read_bytes(); evidence = s.evidence(f); s.release.write_text('release')
            stdout, stderr = child.communicate(timeout=15); clean(stdout); clean(stderr)
            assert child.returncode, (label, stdout, stderr)
            assert s.registry.read_bytes() == stored and s.evidence(f) == evidence
            typed = [row for row in s.calls() if row['kind'] == 'typed']
            assert len(typed) == (1 if label == 'typed-response-source' else 0)
        finally: stop(child)
    # A newer account decision while a prior named-account proof is waiting
    # wins atomically: the older proof must not overwrite it or publish metadata.
    s.configure(); f = s.seed('pending-assignment-cas'); plan = s.preview(f)
    s.update(delay={'kind': 'api', 'endpoint': '/user'})
    child = s.start_rpc(f, 'set_repository_account', target=NAMED, basis=plan['basis'])
    try:
        s.assign(f, NONE); stored = s.registry.read_bytes(); before = s.evidence(f)
        s.release.write_text('release'); stdout, stderr = child.communicate(timeout=15)
        clean(stdout); clean(stderr); assert child.returncode and s.registry.read_bytes() == stored
        assert s.account(f)['assignment'] == NONE and s.record(f)['account']['association'] is None
        assert s.evidence(f) == before
    finally: stop(child)


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-repository-accounts-') as temporary:
        root = Path(temporary).resolve()
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'; os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        suite = Accounts(root)
        for check in [catalog_and_readonly, assignments_and_atomic_metadata, typed_operations_and_signed_out,
                      queued_typed_requests_enforce_account_basis,
                      shared_worktrees_relocate_and_adopt, stale_reviews_and_namespaces,
                      forgotten_bridge_handle, malformed_records_legacy_and_native_paths,
                      discovery_and_operation_races]:
            check(suite); print('PASS: repository accounts '+check.__name__, flush=True)
    print('PASS: saved-record account assignment, atomic actor/cache proofs, pinned named gh bodies and redaction, queued actor proofs, independent linked-worktree caches, stale/CAS/namespace fences, forgotten fixed handles, malformed records, native paths and deterministic origin races')


if __name__ == '__main__': main()
