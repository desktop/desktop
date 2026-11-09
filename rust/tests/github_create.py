"""Assigned PR creation through fixed GraphQL requests against loopback TLS only."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import copy
import hashlib
import json
import os
import select
import socket
from pathlib import Path
import shlex
import shutil
import signal
import ssl
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlsplit

from discard_advanced import BINARY
from git_credentials import Credentials, optional_tool, process_descendants
from lifecycle import alive
from repository_accounts import Accounts, ALICE, BOB, ENV, SECRET, NAMED, OTHER, NONE, EFFECTIVE, clean
from repository_context import private, stop, wait_for


TOKENS = (ALICE, BOB, ENV, SECRET)
URL = 'https://github.com/fork/repo/pull/7'
ACTION = {'type': 'create_pull_request', 'title': 'Literal {owner}/{repo}/{branch} $title 雪',
          'body': 'First line\n\nLiteral {owner}/{repo}/{branch}, $(no-shell), `quotes`, \\ and 雪\n',
          'base': 'base-{branch}', 'head': 'fork:head-{owner}', 'draft': True}


def records(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


class LocalApi:
    """TLS API with response gates; credentials are represented only by actors in logs."""
    def __init__(self, root, openssl, scenario):
        self.scenario = scenario
        self.records = []
        self.failures = {}
        self.url = URL
        self.node = {'id': 'R_fixture', 'nameWithOwner': 'fork/repo', 'url': 'https://github.com/fork/repo'}
        self.pages = [[]]
        self.page_override = None
        self.gate = None
        self.started = threading.Event()
        self.release = threading.Event()
        self.errors = []
        certificate, key = root/'api-cert.pem', root/'api-key.pem'
        result = subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
                                 '-subj', '/CN=api.github.com', '-addext', 'subjectAltName=DNS:api.github.com,DNS:github.com,DNS:localhost,IP:127.0.0.1',
                                 '-keyout', str(key), '-out', str(certificate)], capture_output=True)
        assert result.returncode == 0, 'Could not create the isolated TLS API certificate'
        certificate.chmod(0o600); key.chmod(0o600); self.certificate = certificate
        service = self
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def log_message(self, *args): pass
            def handle(self):
                try: super().handle()
                except (BrokenPipeError, ConnectionResetError): pass
                except ssl.SSLError as error:
                    if error.reason != 'UNEXPECTED_EOF_WHILE_READING': service.errors.append('unexpected TLS read failure')
            def do_GET(self): self.dispatch()
            def do_POST(self): self.dispatch()
            def reply(self, body, status=200):
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                self.send_response(status); self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            def dispatch(self):
                try: self.handle_request()
                except (BrokenPipeError, ConnectionResetError): pass
                except BaseException as error:
                    service.errors.append(type(error).__name__)
                    try: self.reply({'message': 'isolated API fixture failed'}, 500)
                    except (BrokenPipeError, ConnectionResetError): pass
            def handle_request(self):
                state = json.loads(service.scenario.read_text())
                authorization = self.headers.get('Authorization', '').split(' ', 1)
                supplied = authorization[1] if len(authorization) == 2 and authorization[0].lower() in ['bearer', 'token'] else ''
                actor = next((user for user in [*state['users'].values(), state['environment']]
                              if user['token'] == supplied), None)
                if self.headers.get('Transfer-Encoding', '').lower() == 'chunked':
                    chunks = []
                    while True:
                        count = int(self.rfile.readline(1024).split(b';', 1)[0], 16)
                        if not count:
                            while self.rfile.readline(1024) not in [b'\r\n', b'\n', b'']: pass
                            break
                        chunks.append(self.rfile.read(count)); assert self.rfile.read(2) == b'\r\n'
                        assert sum(map(len, chunks)) <= 2*1024*1024
                    body = b''.join(chunks)
                else:
                    count = int(self.headers.get('Content-Length', '0')); assert count <= 2*1024*1024
                    body = self.rfile.read(count)
                payload = json.loads(body) if body else None
                query = payload.get('query', '') if isinstance(payload, dict) else ''
                path = urlsplit(self.path).path.removeprefix('/api/v3')
                if path == '/api/graphql': path = '/graphql'
                stage = 'mutation' if 'createPullRequest' in query else 'lookup' if path == '/graphql' else 'user' if path == '/user' else 'repository'
                row = {'method': self.command, 'path': path, 'stage': stage,
                       'actor': None if actor is None else actor['login'], 'payload': payload}
                clean(row); service.records.append(row)
                if actor is None: self.reply({'message': 'fixture authentication required'}, 401); return
                if service.gate == stage:
                    service.started.set()
                    assert service.release.wait(25), 'fixture API response gate timed out'
                failure = service.failures.get(stage)
                if failure == 'http': self.reply({'message': 'fixture rejected '+ALICE}, 422); return
                if failure == 'malformed': self.reply(b'{bad '+ALICE.encode()); return
                if failure == 'graphql': self.reply({'errors': [{'message': 'fixture GraphQL rejected '+ALICE}]}); return
                if stage == 'user':
                    self.reply({'id': actor['id'], 'login': actor['login']}); return
                if stage == 'repository':
                    value = state.get('repository_responses', {}).get(path)
                    self.reply(value if value is not None else state['repositories'][actor['login']]); return
                if stage == 'lookup':
                    variables = payload.get('variables', {})
                    after = variables.get('after')
                    page = 0 if after is None else int(after.removeprefix('cursor-'))
                    node = copy.deepcopy(service.node)
                    if node is not None:
                        rows = service.pages[page] if page < len(service.pages) else []
                        info = {'hasNextPage': page+1 < len(service.pages), 'endCursor': 'cursor-'+str(page+1)}
                        node['pullRequests'] = service.page_override or {'nodes': rows, 'pageInfo': info}
                    self.reply({'data': {'repository': node}}); return
                if stage == 'mutation':
                    self.reply({'data': {'createPullRequest': {'pullRequest': {'id': 'PR_fixture', 'url': service.url}}}}); return
                self.reply({'message': 'unknown isolated API request'}, 404)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(certificate, key)
        self.http.socket = context.wrap_socket(self.http.socket, server_side=True)
        self.endpoint = 'https://127.0.0.1:'+str(self.http.server_port)
        self.worker = threading.Thread(target=self.http.serve_forever, daemon=True); self.worker.start()
        class Proxy(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_CONNECT(self):
                if self.path != 'api.github.com:443':
                    service.errors.append('unexpected API proxy target'); self.send_error(403); return
                upstream = socket.create_connection(('127.0.0.1', service.http.server_port), timeout=5)
                try:
                    self.send_response(200, 'Connection established'); self.end_headers()
                    streams = [self.connection, upstream]
                    while True:
                        readable, _, _ = select.select(streams, [], [], 25)
                        if not readable: return
                        for source in readable:
                            data = source.recv(65536)
                            if not data: return
                            (upstream if source is self.connection else self.connection).sendall(data)
                except (BrokenPipeError, ConnectionResetError, OSError): pass
                finally: upstream.close(); self.close_connection = True
        self.proxy = ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
        self.proxy_url = 'http://127.0.0.1:'+str(self.proxy.server_port)
        self.proxy_worker = threading.Thread(target=self.proxy.serve_forever, daemon=True); self.proxy_worker.start()
    def reset(self):
        self.records.clear(); self.failures.clear(); self.errors.clear(); self.url = URL
        self.node = {'id': 'R_fixture', 'nameWithOwner': 'fork/repo', 'url': 'https://github.com/fork/repo'}
        self.pages = [[]]; self.page_override = None
        self.gate = None; self.started.clear(); self.release.clear()
    def mutations(self): return [row for row in self.records if row['stage'] == 'mutation']
    def close(self):
        self.release.set(); self.proxy.shutdown(); self.proxy.server_close(); self.proxy_worker.join(timeout=5)
        self.http.shutdown(); self.http.server_close(); self.worker.join(timeout=5)


class Unborn:
    def __init__(self, path, suite):
        self.path = path; self.suite = suite
        subprocess.run([suite.real_git, 'init', '-q', '-b', 'main', str(path)], env=suite.env, check=True)
        (path/'file').write_bytes(b'unchanged working file\n')
        self.git('remote', 'add', 'origin', 'https://github.com/fork/repo.git')
    def git(self, *args, check=True):
        return subprocess.run([self.suite.real_git, '-C', str(self.path), *args], env=self.suite.env,
                              capture_output=True, check=check)


class Creation(Accounts):
    def __init__(self, root, openssl):
        self.real_git = shutil.which('git'); self.real_gh = shutil.which('gh')
        assert self.real_git and self.real_gh, 'requires installed git and gh'
        super().__init__(root)
        global_config = root/'global.config'; private(global_config, '')
        templates = root/'empty-templates'; templates.mkdir()
        self.env.update(GIT_CONFIG_GLOBAL=str(global_config), GIT_CONFIG_SYSTEM=str(global_config),
                        GIT_CONFIG_NOSYSTEM='1', GIT_ATTR_NOSYSTEM='1', GIT_TERMINAL_PROMPT='0', GIT_TEMPLATE_DIR=str(templates))
        for key in list(self.env):
            if key in ['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG', 'GIT_DIR', 'GIT_COMMON_DIR',
                       'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'] or key.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_', 'GIT_TRACE')) or key in ['GIT_CURL_VERBOSE', 'GIT_TRANSFER_TRACE', 'GIT_LOG_STATS', 'LFS_DEBUG_HTTP', 'GIT_LFS_PROGRESS']:
                self.env.pop(key, None)
        self.git_log = root/'git-calls.jsonl'
        self.service = LocalApi(root, openssl, self.scenario)
        self.control = root/'git-control.json'; private(self.control, '{}')
        self.env.update(CREATE_API_ENDPOINT=self.service.endpoint, CREATE_API_CA=str(self.service.certificate),
                        CREATE_GIT_LOG=str(self.git_log), CREATE_REAL_GH=self.real_gh, CREATE_API_PROXY=self.service.proxy_url,
                        GH_CONFIG_DIR=str(root/'gh-config'), GH_NO_UPDATE_NOTIFIER='1', GH_NO_EXTENSION_UPDATE_NOTIFIER='1',
                        CREDENTIALS_GIT_LOG=str(self.git_log), CREDENTIALS_CONTROL=str(self.control),
                        CREDENTIALS_GATE_STARTED=str(root/'git-started'), CREDENTIALS_GATE_RELEASE=str(root/'git-release'))
        gh = root/'bin/gh'
        gh.write_text(f'#!{sys.executable}\n'+r'''import json,os,ssl,subprocess,sys,urllib.error,urllib.request
from pathlib import Path
args=sys.argv[1:];body=sys.stdin.buffer.read();c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
secrets=[user['token'] for user in c['users'].values()]+[c['environment']['token'],c['secret']]
def safe(value):
 for secret in secrets:value=value.replace(secret,'[redacted]')
 return value
host=args[args.index('--hostname')+1] if '--hostname' in args else c['host']
kind='protocol' if args[:3]==['config','get','git_protocol'] else 'token' if args[:2]==['auth','token'] else 'catalog' if args[:2]==['auth','status'] else 'api' if args and args[0]=='api' else 'metadata' if args[:2]==['repo','view'] else 'typed'
login=args[args.index('--user')+1] if '--user' in args else None
variables=['GH_TOKEN','GITHUB_TOKEN'] if host=='github.com' or host.endswith('.ghe.com') else ['GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']
token=next((os.environ[key] for key in variables if os.environ.get(key)),c['users'][c['active']]['token'])
if kind=='token' and login is not None:token=c['users'].get(login,{}).get('token','')
actors={user['token']:user for user in [*c['users'].values(),c['environment']]};actor=actors.get(token)
row={'args':[safe(value) for value in args],'kind':kind,'actor':None if actor is None else actor['login'],
 'body':safe(body.decode('utf-8')),'argv_clean':not any(secret in value for secret in secrets for value in args),
 'stdin_clean':not any(secret.encode() in body for secret in secrets),
 'tokens_absent':not any(key in os.environ for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']),
 'pinned':bool(actor) and all(os.environ.get(key)==token for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']),
 'debug_cleared':not any(key in os.environ for key in ['GH_DEBUG','DEBUG']),
 'defaults_cleared':not any(key in os.environ for key in ['GH_HOST','GH_REPO']),
 'native_api':kind=='api' and bool(os.environ.get('CREATE_REAL_GH'))}
with open(os.environ['CONTEXT_GH_LOG'],'a') as out:out.write(json.dumps(row)+'\n')
if kind=='protocol':print(c.get('git_protocol','https'));sys.exit(0)
if kind=='token':
 if login is not None and (login not in c['visible'] or login in c['signed_out']):sys.stderr.write(c['secret']);sys.exit(1)
 print(token);sys.exit(0)
if kind=='catalog':
 rows=[{'host':host,'login':name,'active':name==c['active'],'state':'error' if name in c['signed_out'] else 'success'} for name in c['visible']]
 print(json.dumps({'hosts':{host:rows}}));sys.exit(0)
if kind=='metadata':
 value=c['repositories'][actor['login']];parent=value.get('parent')
 print(json.dumps({'nameWithOwner':value['full_name'],'url':value['html_url'],'isFork':value['fork'],'parent':None if parent is None else {'nameWithOwner':parent['full_name'],'url':parent['html_url']}}));sys.exit(0)
if kind=='api':
 query=json.loads(body).get('query','') if body else ''
 stage='mutation' if 'createPullRequest' in query else 'lookup' if query else 'user' if '/user' in args else 'repository'
 api_exit=c.get('api_exits',{}).get(stage,c.get('api_exit',0))
 if os.environ.get('CREATE_REAL_GH'):
  native_args=list(args)
  native_env={key:value for key,value in os.environ.items() if key.upper() not in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY']}
  native_env.update(SSL_CERT_FILE=os.environ['CREATE_API_CA'],HTTPS_PROXY=os.environ['CREATE_API_PROXY'],HTTP_PROXY=os.environ['CREATE_API_PROXY'],NO_PROXY='',no_proxy='',CREATE_FROM_GH='1')
  result=subprocess.run([os.environ['CREATE_REAL_GH'],*native_args],input=body,env=native_env)
  sys.exit(result.returncode or api_exit)
 endpoint=None;iterator=iter(args[1:])
 for arg in iterator:
  if arg in ['--hostname','--method','--header','--input','--cache','-X','-H']:next(iterator,None)
  elif not arg.startswith('-') and endpoint is None:endpoint=arg
 assert endpoint is not None
 method=args[args.index('--method')+1] if '--method' in args else 'POST' if body else 'GET'
 request=urllib.request.Request(os.environ['CREATE_API_ENDPOINT']+'/'+endpoint.lstrip('/'),data=body or None,method=method,
  headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 context=ssl.create_default_context(cafile=os.environ['CREATE_API_CA'])
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),urllib.request.HTTPSHandler(context=context))
 try:
  with opener.open(request,timeout=20) as response:sys.stdout.buffer.write(response.read())
 except urllib.error.HTTPError as error:
  value=error.read();sys.stdout.buffer.write(value);sys.stderr.buffer.write(b'fixture HTTP failure '+value);sys.exit(1)
 sys.exit(api_exit)
if args[:2]==['pr','create']:
 # This child deliberately models the real gh command's local Git inspection.
 # The assigned fixed-API path must never reach it; Effective retains it.
 child_env={**os.environ,'CREATE_FROM_GH':'1'}
 result=subprocess.run(['git','remote','-v'],env=child_env,capture_output=True)
 assert result.returncode==0
 print('https://github.com/fork/repo/pull/7');sys.exit(c.get('typed_code',0))
print(json.dumps({'unexpected':kind}));sys.exit(96)
'''); gh.chmod(0o700)
        wrapper = root/'bin/git'
        wrapper.write_text(f'#!{sys.executable}\n'+f'REAL_GIT={self.real_git!r}\n'+r'''import json,os,sys
from pathlib import Path
args=sys.argv[1:];c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
secrets=[user['token'] for user in c['users'].values()]+[c['environment']['token'],c['secret']]
iterator=iter(args);command=None;tail=[]
for arg in iterator:
 if arg in ['-c','-C','--git-dir','--work-tree','--namespace']:next(iterator,None)
 elif not arg.startswith('-'):command=arg;tail=list(iterator);break
row={'command':command,'from_gh':os.environ.get('CREATE_FROM_GH')=='1',
 'argv_clean':not any(secret in value for secret in secrets for value in args),
 'alice_environment_clean':not any(c['users']['AliceCase']['token'] in value for value in os.environ.values())}
with open(os.environ['CREATE_GIT_LOG'],'a') as out:out.write(json.dumps(row)+'\n')
if command in ['fetch','push','pull','clone'] or (command=='ls-remote' and '--get-url' not in tail) or (command=='remote' and any(value in tail for value in ['update','prune','-f','--fetch'])):sys.exit(97)
os.execv(REAL_GIT,[REAL_GIT,*args])
'''); wrapper.chmod(0o700)
        # The shared C logger keeps per-command instrumentation cheap. Its exec
        # target is an additional local-only guard, so unexpected transfers can
        # never reach the public remote even if the product regresses.
        guard = root/'bin/git-local-only'
        shell = shutil.which('sh'); assert shell
        guard.write_text('#!'+shell+'\n'+'''command=; skip=0
for argument do
 if [ "$skip" = 1 ]; then skip=0; continue; fi
 case "$argument" in
  -c|-C|--git-dir|--work-tree|--namespace) skip=1;;
  -*) ;;
  *) command=$argument; break;;
 esac
done
case "$command" in
 fetch|push|pull|clone) exit 97;;
 ls-remote) allowed=0; for argument do [ "$argument" = --get-url ] && allowed=1; done; [ "$allowed" = 1 ] || exit 97;;
 remote) for argument do case "$argument" in update|prune|-f|--fetch) exit 97;; esac; done;;
esac
exec '''+shlex.quote(self.real_git)+''' "$@"
'''); guard.chmod(0o700)
        actual_git = self.real_git; self.real_git = str(guard)
        try: self.wrapper_kind = Credentials.install_c_wrapper(self, wrapper)
        finally: self.real_git = actual_git
    def seed_unborn(self, name):
        self.configure(); self.service.reset()
        fixture = Unborn(self.root/name, self); self.cli('repositories', 'add', fixture.path)
        self.assign(fixture)
        return fixture
    def clear(self):
        self.clear_calls(); self.git_log.unlink(missing_ok=True); self.service.reset()
    def evidence(self, fixture):
        rows = []
        for path in sorted(fixture.path.rglob('*')):
            if path.is_file(): rows.append((os.fsencode(path.relative_to(fixture.path)), hashlib.sha256(path.read_bytes()).hexdigest()))
        return rows
    def invoke_create(self, fixture, *, action=None, basis=None, fail=False):
        request = {'action': copy.deepcopy(ACTION if action is None else action)}
        if basis is not None: request['account_basis'] = basis
        return self.rpc(fixture, 'github', request=request, fail=fail)
    @contextmanager
    def pending_create(self, fixture, *, basis=None, stage='lookup'):
        request = {'action': copy.deepcopy(ACTION)}
        if basis is not None: request['account_basis'] = basis
        self.service.gate = stage
        child = subprocess.Popen([str(BINARY), '--config', str(self.registry), '-C', str(fixture.path), 'repo', '-'],
                                 env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        child.stdin.write(json.dumps({'method': 'github', 'request': request})); child.stdin.close(); child.stdin = None
        try:
            assert self.service.started.wait(12), 'PR '+stage+' did not reach the local TLS gate'
            yield child
        finally:
            self.service.release.set()
            if child.poll() is None: stop(child)
    def close(self): self.service.close()


def assert_private_transport(s, *, actor='alicecase', assigned=True):
    rows = s.calls(); clean(rows); clean(s.service.records)
    assert all(row['argv_clean'] and row['stdin_clean'] for row in rows)
    assert all(row['argv_clean'] and row['alice_environment_clean'] for row in records(s.git_log))
    if assigned:
        assert not any(row['args'][:2] == ['pr', 'create'] for row in rows), 'assigned PR creation reached gh pr create'
        api = [row for row in rows if row['kind'] == 'api']
        assert api and all(row['actor'] == actor and row['pinned'] and row['debug_cleared'] and row['defaults_cleared'] for row in api)
        assert all(row['actor'] == actor for row in s.service.records)
    assert not s.service.errors, s.service.errors


def graphql_calls(s):
    return [row for row in s.calls() if row['kind'] == 'api' and 'graphql' in row['args']]


def assert_graphql_argv(row):
    args = row['args']; assert args[0] == 'api'
    options = {}; positional = []; iterator = iter(args[1:])
    for argument in iterator:
        if argument.startswith('-'):
            assert argument in ['--method', '--hostname', '--header', '--input'], args
            assert argument not in options, args
            options[argument] = next(iterator)
        else: positional.append(argument)
    assert positional == ['graphql']
    assert options == {'--method': 'POST', '--hostname': 'github.com',
                       '--header': 'Accept: application/vnd.github+json', '--input': '-'}, args


def assigned_success_and_real_gh_literals(s):
    f = s.seed_unborn('assigned-api-create')
    before = s.evidence(f); stored = s.registry.read_bytes()
    for action in [dict(ACTION, title='Ordinary PR', body='ordinary body', base='main', head='fork:main', draft=False),
                   ACTION, dict(ACTION, title='Normalized unqualified head', base='main', head=':feature')]:
        s.clear()
        result = s.invoke_create(f, action=action)
        assert result == {'code': 0, 'data': None, 'stdout': URL+'\n', 'stderr': '', 'hint': None}, result
        calls = graphql_calls(s); assert len(calls) == 2
        for row in calls:
            assert_graphql_argv(row); assert row['native_api'], 'ordinary and literal payloads must reach installed gh'
        lookup, mutation = [json.loads(row['body']) for row in calls]
        assert 'DesktopPullRequestCreateContext' in lookup['query']
        assert lookup['variables'] == {'owner': 'fork', 'name': 'repo', 'head': action['head'].split(':')[-1], 'after': None}
        assert 'PullRequestCreate' in mutation['query'] and 'createPullRequest' in mutation['query']
        assert mutation['variables'] == {'input': {'repositoryId': 'R_fixture', 'title': action['title'], 'body': action['body'],
                                                    'baseRefName': action['base'], 'headRefName': action['head'].removeprefix(':'),
                                                    'draft': action['draft'], 'maintainerCanModify': True}}
        assert len(s.service.mutations()) == 1
        assert len([row for row in s.service.records if row['stage'] == 'user']) >= 2, 'actor must be rechecked before mutation'
        assert_private_transport(s)
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
    assert s.data['active'] == 'BobCase' and s.env['GH_TOKEN'] == ENV


@contextmanager
def fake_api(s):
    real = s.env.pop('CREATE_REAL_GH')
    try: yield
    finally: s.env['CREATE_REAL_GH'] = real


def open_pull(*, owner='fork', base=None, head=None, cross=True, number=7):
    return {'url': URL.rsplit('/', 1)[0]+'/'+str(number), 'state': 'OPEN',
            'baseRefName': ACTION['base'] if base is None else base,
            'headRefName': ACTION['head'].split(':')[-1] if head is None else head,
            'isCrossRepository': cross, 'headRepositoryOwner': {'login': owner}}


def duplicate_pagination_and_invalid_context(s):
    f = s.seed_unborn('create-context-proof'); before = s.evidence(f); stored = s.registry.read_bytes()
    with fake_api(s):
        for head in ['main', ':main']:
            s.clear(); s.invoke_create(f, action=dict(ACTION, base='main', head=head), fail=True)
            assert not graphql_calls(s) and not s.service.mutations()
        s.clear(); s.service.pages = [[open_pull()]]
        s.invoke_create(f, fail=True); assert not s.service.mutations()
        s.clear(); s.service.pages = [[open_pull(base='another-base'), open_pull(head='another-head'), open_pull(owner='other', cross=True)]]
        assert s.invoke_create(f)['code'] == 0 and len(s.service.mutations()) == 1
        # An existing PR on the next page must also stop creation.
        s.clear(); s.service.pages = [[open_pull(head='not-the-head', number=number+100) for number in range(100)], [open_pull()]]
        s.invoke_create(f, fail=True); assert not s.service.mutations()
        lookups = [row for row in s.service.records if row['stage'] == 'lookup']
        assert len(lookups) == 2 and lookups[1]['payload']['variables']['after'] == 'cursor-1'
        for invalid in [None, {'id': '', 'nameWithOwner': 'fork/repo', 'url': 'https://github.com/fork/repo'},
                        {'id': 'R_wrong', 'nameWithOwner': 'other/repo', 'url': 'https://github.com/other/repo'}]:
            s.clear(); s.service.node = invalid
            s.invoke_create(f, fail=True); assert not s.service.mutations()
        for invalid in [{'nodes': [open_pull(head='different')]*101, 'pageInfo': {'hasNextPage': False, 'endCursor': None}},
                        {'nodes': [], 'pageInfo': {'hasNextPage': True, 'endCursor': None}},
                        {'nodes': [dict(open_pull(), headRepositoryOwner=None)], 'pageInfo': {'hasNextPage': False, 'endCursor': None}}]:
            s.clear(); s.service.page_override = invalid
            s.invoke_create(f, fail=True); assert not s.service.mutations()
        s.clear(); s.service.pages = [[open_pull(head='different', number=number+100) for number in range(100)] for _ in range(17)]
        s.invoke_create(f, fail=True)
        assert len([row for row in s.service.records if row['stage'] == 'lookup']) == 16 and not s.service.mutations()
    assert s.registry.read_bytes() == stored and s.evidence(f) == before
    assert_private_transport(s)


def api_failures_and_ambiguous_success(s):
    f = s.seed_unborn('create-api-errors'); before = s.evidence(f); stored = s.registry.read_bytes()
    with fake_api(s):
        for stage, failure in [('lookup', 'graphql'), ('lookup', 'malformed'), ('lookup', 'http'),
                               ('mutation', 'graphql'), ('mutation', 'malformed'), ('mutation', 'http')]:
            s.clear(); s.service.failures[stage] = failure
            result = s.invoke_create(f, fail=True)
            clean(result.stdout); clean(result.stderr)
            assert len(s.service.mutations()) == (1 if stage == 'mutation' else 0)
            assert_private_transport(s)
        for stage in ['lookup', 'mutation']:
            s.clear(); s.update(api_exits={stage: 7})
            result = s.invoke_create(f, fail=True)
            assert result.returncode == 7 and json.loads(result.stdout)['code'] == 7
            assert len(s.service.mutations()) == (1 if stage == 'mutation' else 0)
            s.update(api_exits={})
        for url in ['https://foreign.invalid/fork/repo/pull/7', 'http://github.com/fork/repo/pull/7',
                    'https://github.com/other/repo/pull/7', 'https://github.com/fork/repo/pull/0',
                    'https://github.com/fork/repo/pull/7?trace='+ALICE, None]:
            s.clear(); s.service.url = url
            result = s.invoke_create(f, fail=True); value = json.loads(result.stdout)
            assert value['code'] == 1 and not value['stdout'] and value['data'] is None
            assert 'inspect' in value['hint'].lower() and 'retry' in value['hint'].lower(), value
            assert len(s.service.mutations()) == 1
            assert_private_transport(s)
    assert s.registry.read_bytes() == stored and s.evidence(f) == before


def before_write_fences(s):
    for change in ['actor', 'source', 'account']:
        f = s.seed_unborn('create-prewrite-'+change); basis = s.account(f)['basis']; s.clear()
        with fake_api(s):
            with s.pending_create(f, basis=basis) as child:
                if change == 'actor':
                    users = copy.deepcopy(s.data['users']); users['AliceCase']['id'] = 999
                    s.update(users=users)
                elif change == 'source': f.git('remote', 'set-url', 'origin', 'https://github.com/fork/repo')
                else: s.assign(f, OTHER)
                before = s.evidence(f); stored = s.registry.read_bytes()
                s.service.release.set(); stdout, stderr = child.communicate(timeout=35)
                clean(stdout); clean(stderr)
                assert child.returncode != 0, (change, stdout, stderr)
                assert not s.service.mutations(), 'stale '+change+' reached createPullRequest'
                assert s.registry.read_bytes() == stored and s.evidence(f) == before
        assert all(row['argv_clean'] and row['alice_environment_clean'] for row in records(s.git_log))
        assert not any(row['args'][:2] == ['pr', 'create'] for row in s.calls())
        assert not s.service.errors


def saved_modes_and_queued_basis(s):
    f = s.seed_unborn('create-saved-modes'); assignment = s.account(f)['assignment']
    before = s.evidence(f); stored = s.registry.read_bytes(); s.update(signed_out=['AliceCase']); s.clear()
    s.invoke_create(f, fail=True)
    assert s.account(f)['assignment'] == assignment and s.registry.read_bytes() == stored
    assert not s.service.mutations() and not graphql_calls(s) and s.evidence(f) == before
    s.update(signed_out=[])
    old = s.account(f)['basis']; s.assign(f, OTHER); stored = s.registry.read_bytes(); s.clear()
    s.invoke_create(f, basis=old, fail=True)
    assert not s.calls() and not s.service.records and s.registry.read_bytes() == stored
    s.assign(f, NONE); before = s.evidence(f); stored = s.registry.read_bytes(); s.clear()
    s.invoke_create(f, fail=True)
    assert not s.calls() and not s.service.records and s.registry.read_bytes() == stored and s.evidence(f) == before
    s.assign(f, EFFECTIVE); before = s.evidence(f); stored = s.registry.read_bytes(); s.clear()
    result = s.invoke_create(f)
    assert result == {'code': 0, 'data': None, 'stdout': URL+'\n', 'stderr': '', 'hint': None}
    typed = [row for row in s.calls() if row['kind'] == 'typed']
    assert len(typed) == 1 and typed[0]['args'][:2] == ['pr', 'create'] and typed[0]['actor'] == 'environment-user'
    assert typed[0]['body'] == ACTION['body'] and '--body-file' in typed[0]['args']
    assert not s.service.records and any(row['command'] == 'remote' for row in records(s.git_log))
    assert_private_transport(s, assigned=False)
    assert s.registry.read_bytes() == stored and s.evidence(f) == before



def cancellation_preserves_remote_ambiguity(s):
    # Both paths use installed gh over real loopback TLS. The mutation gate is
    # reached only after the server has recorded the POST, so cancellation must
    # describe an ambiguous remote write instead of encouraging a blind retry.
    for stage in ['lookup', 'mutation']:
        f = s.seed_unborn('create-cli-cancel-'+stage); basis = s.account(f)['basis']
        before = s.evidence(f); stored = s.registry.read_bytes(); s.clear()
        with s.pending_create(f, basis=basis, stage=stage) as child:
            descendants = process_descendants(child.pid)
            assert descendants and any(name == 'gh' for name in descendants.values()), 'installed gh child did not reach the TLS response gate'
            assert len(s.service.mutations()) == (1 if stage == 'mutation' else 0)
            child.send_signal(signal.SIGINT); stdout, stderr = child.communicate(timeout=15)
            clean(stdout); clean(stderr)
            assert child.returncode == 130, (stage, child.returncode)
            assert 'cancelled' in stderr.lower()
            if stage == 'mutation':
                assert 'inspect github' in stderr.lower() and 'remote mutation may have completed' in stderr.lower(), stderr
            else: assert 'inspect github' not in stderr.lower(), stderr
            wait_for(lambda: not any(alive(pid) for pid in descendants), 'PR cancellation left a gh child running')
        assert len(s.service.mutations()) == (1 if stage == 'mutation' else 0)
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
        assert_private_transport(s)
    f = s.seed_unborn('create-active-ws-cancel'); basis = s.account(f)['basis']
    s.clear()
    with s.server(f) as ws:
        # Startup deliberately selects the served saved record. Fence the
        # cancelled request against the post-ready state, as the app does.
        before = s.evidence(f); stored = s.registry.read_bytes()
        ws.sock.settimeout(20); s.service.gate = 'mutation'
        ws.send({'id': 7001, 'method': 'github', 'request': {'account_basis': basis, 'action': ACTION}})
        try:
            assert s.service.started.wait(12), 'active WebSocket mutation did not reach the TLS response gate'
            assert len(s.service.mutations()) == 1
            ws.send({'id': 7002, 'method': 'cancel', 'request_id': 7001})
            replies = {}
            while len(replies) < 2:
                reply = ws.receive(); clean(reply); replies[reply['id']] = reply
            assert replies[7002]['result']['status'] == 'requested', replies
            cancelled = replies[7001]
            assert cancelled['error_code'] == 'cancelled'
            assert 'inspect github' in cancelled['error'].lower() and 'remote mutation may have completed' in cancelled['error'].lower(), cancelled
        finally: s.service.release.set()
        # A subsequent read works and cannot replay the cancelled mutation.
        ws.send({'id': 7003, 'method': 'repository_account'})
        reply = ws.receive(); clean(reply)
        assert reply['id'] == 7003 and reply['result']['assignment']['login'] == 'AliceCase'
        assert len(s.service.mutations()) == 1
    assert s.registry.read_bytes() == stored, 'cancelled PR changed post-ready registry state'
    assert s.evidence(f) == before, 'cancelled PR changed repository files'
    assert_private_transport(s)


def main():
    openssl = optional_tool('openssl', 'OPENSSL_BIN', 'openssl-local')
    original_home = os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-pr-create-') as temporary:
        root = Path(temporary); root.chmod(0o700)
        suite = Creation(root, openssl)
        try:
            for check in [assigned_success_and_real_gh_literals, duplicate_pagination_and_invalid_context,
                          api_failures_and_ambiguous_success, before_write_fences, saved_modes_and_queued_basis,
                          cancellation_preserves_remote_ambiguity]:
                check(suite); print('PASS: fixed PR creation '+check.__name__, flush=True)
        finally: suite.close()
    assert os.environ.get('HOME') == original_home
    print('PASS: assigned PR API pinning, installed gh literal stdin, duplicate pagination, private errors, prewrite actor/source/account fences, queued basis, native/no-account modes, and CLI/WebSocket remote-write cancellation')


if __name__ == '__main__': main()
