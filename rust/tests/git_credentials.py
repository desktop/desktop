"""Saved-account Git and Git LFS credentials against real loopback HTTPS services."""
import base64
from contextlib import contextmanager
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import ssl
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit

from discard_advanced import BINARY
from lfs_diffs import cached, pointer
from lifecycle import alive
from repository_accounts import Accounts, ALICE, BOB, ENV, NAMED, OTHER, NONE, EFFECTIVE, call, clean
from repository_context import private, stop, wait_for


def optional_tool(name, variable, package):
    candidate = os.environ.get(variable) or shutil.which(name)
    if not candidate:
        local = Path.home()/'.local/share/desktop-migration-tools'/package/'data/data/com.termux/files/usr/bin'/name
        if local.is_file(): candidate = str(local)
    assert candidate, 'Install '+name+' or set '+variable
    return str(Path(candidate).resolve())


def read_records(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def process_descendants(parent):
    result = subprocess.run(['ps', '-A', '-o', 'pid=,ppid=,comm='], capture_output=True, text=True, check=True, timeout=5)
    rows = [line.split(None, 2) for line in result.stdout.splitlines()]
    descendants = {}; parents = {parent}
    while True:
        found = {int(pid): Path(name).name for pid, ppid, name in rows if int(ppid) in parents and int(pid) not in descendants}
        if not found: return descendants
        descendants.update(found); parents = set(found)


class HttpsGit:
    """Real smart HTTP plus a minimal authenticated Git LFS batch/object service."""
    def __init__(self, root, openssl, real_git):
        self.root = root/'https'; self.root.mkdir()
        self.projects = self.root/'projects'; self.projects.mkdir()
        self.real_git = real_git
        self.backend = Path(subprocess.run([real_git, '--exec-path'], check=True, capture_output=True, text=True).stdout.strip())/'git-http-backend'
        assert self.backend.is_file(), 'Git smart HTTP backend is required'
        self.records = []; self.objects = {}; self.allowed = {}; self.errors = []
        self.reject_lfs_batch = False
        self.block_path = None; self.started = threading.Event(); self.release = threading.Event()
        certificate, key = self.root/'certificate.pem', self.root/'key.pem'
        result = subprocess.run([openssl, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
                                 '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
                                 '-keyout', str(key), '-out', str(certificate)], capture_output=True)
        assert result.returncode == 0, 'Could not create the isolated loopback TLS certificate'
        key.chmod(0o600); certificate.chmod(0o600); self.certificate = certificate
        service = self
        class Handler(BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'
            def log_message(self, *args): pass
            def do_GET(self): self.dispatch()
            def do_POST(self): self.dispatch()
            def do_PUT(self): self.dispatch()
            def read_body(self):
                if self.headers.get('Transfer-Encoding', '').lower() != 'chunked':
                    return self.rfile.read(int(self.headers.get('Content-Length', '0')))
                chunks = []
                while True:
                    size = int(self.rfile.readline().split(b';', 1)[0], 16)
                    if not size:
                        while self.rfile.readline() not in (b'\r\n', b'\n', b''): pass
                        return b''.join(chunks)
                    chunks.append(self.rfile.read(size)); assert self.rfile.read(2) == b'\r\n'
            def respond(self, status, body=b'', headers=None):
                self.send_response(status)
                for name, value in (headers or {}).items(): self.send_header(name, value)
                self.send_header('Content-Length', str(len(body))); self.end_headers()
                if body: self.wfile.write(body)
            def json(self, value, status=200):
                self.respond(status, json.dumps(value).encode(), {'Content-Type': 'application/vnd.git-lfs+json'})
            def dispatch(self):
                try: self.handle_request()
                except (BrokenPipeError, ConnectionResetError): pass
                except BaseException as error:
                    service.errors.append(type(error).__name__+': '+str(error))
                    try: self.respond(500)
                    except (BrokenPipeError, ConnectionResetError): pass
            def handle_request(self):
                path = urlsplit(self.path).path; body = self.read_body()
                actor = None
                authorization = self.headers.get('Authorization', '')
                if authorization.startswith('Basic '):
                    try:
                        credential = base64.b64decode(authorization[6:], validate=True).decode().split(':', 1)[1]
                        actor = {ALICE: 'alicecase', BOB: 'bobcase', ENV: 'environment-user'}.get(credential, 'invalid')
                    except (ValueError, UnicodeDecodeError): actor = 'invalid'
                elif authorization.startswith('Bearer '):
                    actor = {ALICE: 'alicecase', BOB: 'bobcase', ENV: 'environment-user'}.get(authorization[7:], 'invalid')
                repository = next((name for name in service.allowed if path == name or path.startswith(name+'/')), None)
                record = {'method': self.command, 'path': path, 'actor': actor}; service.records.append(record)
                if service.block_path and service.block_path in path:
                    self.close_connection = True
                    service.started.set(); service.release.wait(25)
                if repository is None: self.respond(404); return
                if actor != service.allowed[repository]:
                    self.respond(401, headers={'WWW-Authenticate': 'Basic realm="isolated Git credential fixture"'}); return
                suffix = path[len(repository):]
                if suffix.startswith('/info/lfs'):
                    if suffix.endswith('/locks/verify'):
                        self.json({'ours': [], 'theirs': [], 'next_cursor': ''}); return
                    if suffix.endswith('/objects/batch') and self.command == 'POST':
                        if service.reject_lfs_batch:
                            record['lfs_batch_rejected'] = True
                            encoded = base64.b64encode(('AliceCase:'+ALICE).encode()).decode()
                            self.json({'message': 'fixture batch rejected '+ALICE+' Basic '+encoded}, status=422); return
                        request = json.loads(body); operation = request['operation']; objects = []
                        for item in request['objects']:
                            oid, size = item['oid'], item['size']; value = {'oid': oid, 'size': size, 'authenticated': False}
                            if operation == 'upload' and oid not in service.objects:
                                value['actions'] = {'upload': {'href': service.url+repository+'/info/lfs/objects/'+oid}}
                            elif operation == 'download' and oid in service.objects:
                                value['actions'] = {'download': {'href': service.url+repository+'/info/lfs/objects/'+oid}}
                            elif operation == 'download': value['error'] = {'code': 404, 'message': 'No fixture object'}
                            objects.append(value)
                        self.json({'transfer': 'basic', 'objects': objects}); return
                    if suffix.startswith('/info/lfs/objects/'):
                        oid = suffix.rsplit('/', 1)[1]
                        if self.command == 'PUT':
                            assert hashlib.sha256(body).hexdigest() == oid
                            service.objects[oid] = body; self.respond(200); return
                        if self.command == 'GET' and oid in service.objects:
                            self.respond(200, service.objects[oid], {'Content-Type': 'application/octet-stream'}); return
                    self.respond(404); return
                environment = {**os.environ, 'GIT_PROJECT_ROOT': str(service.projects), 'GIT_HTTP_EXPORT_ALL': '1',
                               'REQUEST_METHOD': self.command, 'PATH_INFO': path, 'QUERY_STRING': urlsplit(self.path).query,
                               'CONTENT_TYPE': self.headers.get('Content-Type', ''), 'CONTENT_LENGTH': str(len(body)),
                               'REMOTE_USER': actor, 'REMOTE_ADDR': '127.0.0.1', 'SERVER_PROTOCOL': self.protocol_version}
                if self.headers.get('Git-Protocol'): environment['HTTP_GIT_PROTOCOL'] = self.headers['Git-Protocol']
                result = subprocess.run([str(service.backend)], input=body, env=environment, capture_output=True, timeout=20)
                assert result.returncode == 0, 'Git HTTP backend failed'
                head, separator, payload = result.stdout.partition(b'\r\n\r\n')
                if not separator: head, separator, payload = result.stdout.partition(b'\n\n')
                assert separator, 'Git HTTP backend returned no CGI header'
                status = 200; headers = {}
                for line in head.decode('latin-1').splitlines():
                    name, value = line.split(':', 1); value = value.strip()
                    if name.lower() == 'status': status = int(value.split()[0])
                    elif name.lower() not in ('content-length', 'transfer-encoding', 'connection'): headers[name] = value
                self.respond(status, payload, headers)
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); context.load_cert_chain(certificate, key)
        self.http.socket = context.wrap_socket(self.http.socket, server_side=True)
        self.host = '127.0.0.1:'+str(self.http.server_port); self.url = 'https://'+self.host
        self.worker = threading.Thread(target=self.http.serve_forever, daemon=True); self.worker.start()

    def seed(self, f):
        self.records.clear(); self.objects.clear(); self.allowed.clear(); self.errors.clear()
        self.reject_lfs_batch = False
        for name in ['fork/repo.git', 'parent/repo.git', 'other/repo.git', 'fork/repo-other.git']:
            path = self.projects/name
            if path.exists(): shutil.rmtree(path)
            path.parent.mkdir(exist_ok=True)
            subprocess.run([self.real_git, 'init', '--bare', '-q', str(path)], check=True)
            subprocess.run([self.real_git, '-C', str(path), 'symbolic-ref', 'HEAD', 'refs/heads/main'], check=True)
            subprocess.run([self.real_git, '-C', str(path), 'config', 'http.receivepack', 'true'], check=True)
            result = f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(path), 'HEAD:refs/heads/main')
            assert result.returncode == 0
            self.allowed['/'+name] = 'alicecase' if name == 'fork/repo.git' else 'bobcase'

    def authenticated(self): return [row for row in self.records if row['actor'] is not None]
    def close(self):
        self.release.set(); self.http.shutdown(); self.http.server_close(); self.worker.join(timeout=5)


class Credentials(Accounts):
    def __init__(self, root, service, real_git):
        self.service = service; self.real_git = real_git
        super().__init__(root)
        self.native_log = root/'native-helpers.jsonl'; self.git_log = root/'native-git.jsonl'
        self.control = root/'git-control.json'; self.gate_started = root/'git-gate-started'; self.gate_release = root/'git-gate-release'
        private(self.control, '{}')
        self.env.update(CREDENTIALS_NATIVE_LOG=str(self.native_log), CREDENTIALS_GIT_LOG=str(self.git_log),
                        CREDENTIALS_CONTROL=str(self.control), CREDENTIALS_GATE_STARTED=str(self.gate_started),
                        CREDENTIALS_GATE_RELEASE=str(self.gate_release), GIT_SSL_CAINFO=str(service.certificate),
                        SSL_CERT_FILE=str(service.certificate), GIT_ASKPASS='false', SSH_ASKPASS='false')
        helper = root/'bin/native-credential-helper'
        helper.write_text(f'#!{sys.executable}\n'+r'''import json,os,sys
from pathlib import Path
scenario=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
body=sys.stdin.buffer.read(); action=sys.argv[1] if len(sys.argv)>1 else ''
with open(os.environ['CREDENTIALS_NATIVE_LOG'],'a') as log:log.write(json.dumps({'action':action,'keys':[line.split(b'=',1)[0].decode('ascii','replace') for line in body.splitlines() if b'=' in line]})+'\n')
if action=='get':
 print('username=BobCase\npassword='+scenario['users']['BobCase']['token']+'\n')
'''); helper.chmod(0o700)
        self.helper_command = '!'+shlex.quote(str(helper))
        self.env['CREDENTIALS_HOSTILE_HELPER'] = self.helper_command
        self.global_config = Path(self.env['GIT_CONFIG_GLOBAL'])
        subprocess.run([real_git, 'config', '--file', str(self.global_config), 'credential.helper', self.helper_command], check=True)
        subprocess.run([real_git, 'config', '--file', str(self.global_config), 'http.sslCAInfo', str(service.certificate)], check=True)
        wrapper = root/'bin/git'
        wrapper.write_text(f'#!{sys.executable}\n'+f'REAL_GIT={real_git!r}\n'+r'''import json,os,subprocess,sys,time
from pathlib import Path
args=sys.argv[1:];remaining=iter(args);command=None
for argument in remaining:
 if argument in ['-C','-c','--git-dir','--work-tree','--namespace']:next(remaining,None)
 elif not argument.startswith('-'):command=argument;break
scenario=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
secrets=[user['token'] for user in scenario['users'].values()]+[scenario['environment']['token']]
row={'command':command,'argv_clean':not any(secret in argument for secret in secrets for argument in args),'alice_environment_clean':scenario['users']['AliceCase']['token'] not in os.environ.values()}
credential_input=None
if command=='credential':
 chunks=[]
 while True:
  line=sys.stdin.buffer.readline(65537);chunks.append(line)
  if line in [b'',b'\n',b'\r\n']:break
 credential_input=b''.join(chunks)
 row['routing']={}
 for line in credential_input.splitlines():
  key,separator,value=line.partition(b'=')
  if separator and key in [b'protocol',b'host',b'path']:
   text=value.decode('utf-8','replace')
   for secret in secrets:text=text.replace(secret,'[redacted]')
   row['routing'][key.decode()]=text[:1024]
 row['cwd']=os.getcwd()
with open(os.environ['CREDENTIALS_GIT_LOG'],'a') as log:log.write(json.dumps(row)+'\n')
control=json.loads(Path(os.environ['CREDENTIALS_CONTROL']).read_text())
if control.get('gate') is not None and control['gate']==command and not os.environ.get('CREDENTIALS_GATE_CHILD'):
 Path(os.environ['CREDENTIALS_GATE_STARTED']).write_text('started');deadline=time.monotonic()+25
 while not Path(os.environ['CREDENTIALS_GATE_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
 os.environ['CREDENTIALS_GATE_CHILD']='1'
result=subprocess.run([REAL_GIT,*args],input=credential_input);sys.exit(result.returncode)
'''); wrapper.chmod(0o700)
        self.wrapper_kind = self.install_c_wrapper(wrapper)
        self.configure()

    def install_c_wrapper(self, wrapper):
        compiler = shlex.split(os.environ['CC']) if os.environ.get('CC') else [shutil.which('cc') or shutil.which('clang')]
        if os.name != 'posix' or not compiler or not compiler[0]: return 'python'
        directory = self.root/'wrapper-config'; directory.mkdir(mode=0o700)
        def literal(value):
            return '"'+''.join('\\%03o' % byte for byte in os.fsencode(value))+'"'
        header = ''.join('#define '+name+' '+literal(value)+'\n' for name, value in [
            ('FIXTURE_REAL_GIT', self.real_git), ('FIXTURE_ALICE', ALICE),
            ('FIXTURE_BOB', BOB), ('FIXTURE_ENV', ENV)])
        private(directory/'git_credentials_wrapper_config.h', header)
        compiled = wrapper.with_name('git-compiled')
        try:
            result = subprocess.run([*compiler, '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
                                     '-I', str(directory), str(Path(__file__).with_name('git_credentials_wrapper.c')),
                                     '-o', str(compiled)], capture_output=True, timeout=40)
            if result.returncode == 0:
                compiled.chmod(0o700); compiled.replace(wrapper); return 'c'
        except (OSError, subprocess.TimeoutExpired): pass
        compiled.unlink(missing_ok=True)
        print('TOOLS: C Git fixture wrapper unavailable; using Python fallback', flush=True)
        return 'python'

    def configure(self, **changes):
        super().configure(host=self.service.host, **changes)

    def invoke(self, arguments, *, payload=None, **kwargs):
        request = json.loads(payload) if payload is not None else {}
        method = request.get('method')
        checkout = method == 'github' and request.get('request', {}).get('action', {}).get('type') == 'checkout_pull_request'
        network = method in ['fetch', 'push', 'pull', 'lfs_transfer'] or checkout
        kwargs.setdefault('timeout', 60 if network else 25)
        started = time.monotonic(); before = len(read_records(self.git_log))
        try: return super().invoke(arguments, payload=payload, **kwargs)
        finally:
            if network:
                print('TIMING: '+json.dumps({'method': method, 'action': request.get('request', {}).get('action'),
                                            'elapsed_seconds': round(time.monotonic()-started, 3),
                                            'git_commands': len(read_records(self.git_log))-before}), flush=True)

    @contextmanager
    def server(self, f):
        with super().server(f) as ws:
            ws.sock.settimeout(60)
            yield ws

    def websocket(self, ws, method, **params):
        started = time.monotonic(); before = len(read_records(self.git_log))
        try: return call(ws, method, **params)
        finally:
            print('TIMING: '+json.dumps({'transport': 'websocket', 'method': method,
                                        'elapsed_seconds': round(time.monotonic()-started, 3),
                                        'git_commands': len(read_records(self.git_log))-before}), flush=True)

    def assigned_target(self, target):
        return {**target, 'host': self.service.host} if target.get('mode') == 'assigned' else target

    def preview(self, f, target=NAMED, **kwargs):
        return super().preview(f, self.assigned_target(target), **kwargs)

    def assign(self, f, target=NAMED, **kwargs):
        return super().assign(f, self.assigned_target(target), **kwargs)

    def seed(self, name, *options, save=True):
        f = super().seed(name, *options, save=save)
        self.service.seed(f)
        self.native_log.unlink(missing_ok=True); self.git_log.unlink(missing_ok=True)
        return f

    def transfer(self, f, method, *, fail=False, **params):
        return self.rpc(f, method, fail=fail, **params)

    def assert_actor(self, actor='alicecase'):
        rows = self.service.authenticated(); assert rows, 'Git never authenticated to the loopback service'
        assert all(row['actor'] == actor for row in rows), rows
        assert not self.native_log.exists(), read_records(self.native_log)
        assert all(row['argv_clean'] and row['alice_environment_clean'] for row in read_records(self.git_log))
        assert not self.service.errors, self.service.errors

    def clear_transport(self):
        self.service.records.clear(); self.native_log.unlink(missing_ok=True); self.git_log.unlink(missing_ok=True)

    def assert_private_storage(self, f):
        for path in [self.registry, self.global_config, f.path/'.git/config']:
            if path.exists(): clean(path.read_text())
        clean(read_records(self.native_log)); clean(read_records(self.git_log)); clean(self.service.records)

    def delayed_transfer(self, f, method='fetch', **params):
        self.gate_started.unlink(missing_ok=True); self.gate_release.unlink(missing_ok=True)
        private(self.control, json.dumps({'gate': method}))
        child = subprocess.Popen(
            [str(BINARY), '--config', str(self.registry), '-C', str(f.path), 'repo', '-'],
            env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        child.stdin.write(json.dumps({'method': method, **params})); child.stdin.close(); child.stdin = None
        try: wait_for(self.gate_started.exists, 'typed Git did not reach its operation gate'); return child
        except BaseException: stop(child); raise


def named_git_transfers(s):
    s.configure(); f = s.seed('named-git'); s.assign(f)
    global_before = s.global_config.read_bytes()
    s.clear_transport(); assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
    s.env['GIT_CONFIG_PARAMETERS'] = shlex.quote('credential.helper='+s.helper_command)
    try:
        s.clear_transport(); assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
    finally: s.env.pop('GIT_CONFIG_PARAMETERS', None)
    (f.path/'file').write_bytes(b'named account local push\n'); f.commit()
    s.clear_transport(); assert s.transfer(f, 'push', remote='origin', branch='main')['code'] == 0; s.assert_actor()
    remote = s.service.projects/'fork/repo.git'
    assert subprocess.run([s.real_git, '-C', str(remote), 'rev-parse', 'refs/heads/main'], check=True, capture_output=True).stdout == f.git('rev-parse', 'HEAD').stdout
    writer = s.root/'remote-writer'; subprocess.run([s.real_git, 'clone', '-q', str(remote), str(writer)], check=True)
    subprocess.run([s.real_git, '-C', str(writer), 'config', 'user.name', 'HTTPS Writer'], check=True)
    subprocess.run([s.real_git, '-C', str(writer), 'config', 'user.email', 'writer@example.invalid'], check=True)
    (writer/'file').write_bytes(b'remote fast forward\n')
    subprocess.run([s.real_git, '-C', str(writer), 'commit', '-qam', 'remote forward'], check=True)
    subprocess.run([s.real_git, '-C', str(writer), 'push', '-q', 'origin', 'main'], check=True)
    s.clear_transport(); assert s.transfer(f, 'pull', remote='origin', branch='main')['code'] == 0; s.assert_actor()
    assert (f.path/'file').read_bytes() == b'remote fast forward\n'
    # The remote can include arbitrary credential bytes in Git diagnostics.
    # Keep those bytes confined to the rejected protocol response, never argv,
    # application output, application state, or any persistent transport log.
    (f.path/'file').write_bytes(b'local rejected diagnostic push\n'); f.commit()
    hook = remote/'hooks/pre-receive'
    hook.write_text(f'#!{sys.executable}\n'+f'SCENARIO={str(s.scenario)!r}\n'+
                    "import base64,json,sys\nfrom pathlib import Path\n"+
                    "sys.stdin.buffer.read()\n"+
                    "token=json.loads(Path(SCENARIO).read_text())['users']['AliceCase']['token']\n"+
                    "sys.stderr.write('synthetic remote diagnostic '+token+'\\n')\n"+
                    "sys.stderr.write('Basic '+base64.b64encode(('AliceCase:'+token).encode()).decode()+'\\n')\nsys.exit(1)\n")
    hook.chmod(0o700); stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_transport()
    try: rejected = s.transfer(f, 'push', remote='origin', branch='main', fail=True)
    finally: hook.unlink()
    encoded = base64.b64encode(('AliceCase:'+ALICE).encode()).decode()
    assert encoded not in rejected.stdout+rejected.stderr
    s.assert_actor(); assert s.registry.read_bytes() == stored and s.evidence(f) == before
    s.assign(f, OTHER); s.service.allowed['/fork/repo.git'] = 'bobcase'
    s.clear_transport(); assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor('bobcase')
    assert s.global_config.read_bytes() == global_before; s.assert_private_storage(f)


def disabled_and_missing_accounts(s):
    s.configure(); f = s.seed('disabled-git'); s.assign(f, NONE)
    stored = s.registry.read_bytes(); before = s.evidence(f)
    for method, options in [('fetch', {'remote': 'origin'}), ('pull', {'remote': 'origin', 'branch': 'main'}),
                            ('push', {'remote': 'origin', 'branch': 'main'})]:
        s.clear_transport(); s.transfer(f, method, fail=True, **options)
        assert not s.service.authenticated() and not s.native_log.exists()
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
    s.assign(f); s.update(signed_out=['AliceCase']); stored = s.registry.read_bytes(); before = s.evidence(f)
    s.clear_transport(); s.transfer(f, 'fetch', remote='origin', fail=True)
    assert not s.service.authenticated() and not s.native_log.exists()
    assert s.registry.read_bytes() == stored and s.account(f)['assignment']['id'] == 101 and s.evidence(f) == before
    s.assert_private_storage(f)



def native_git_lfs_descendants(s):
    s.configure(); f = s.seed('named-lfs')
    f.git('lfs', 'install', '--local'); f.git('lfs', 'track', '*.asset')
    payload = b'direct named LFS payload\x00\n'; asset = f.path/'large.asset'; asset.write_bytes(payload); f.commit()
    s.assign(f); s.clear_transport()
    assert s.rpc(f, 'lfs_transfer', request={'action': 'push', 'remote': 'origin'})['code'] == 0
    oid = hashlib.sha256(payload).hexdigest(); assert s.service.objects[oid] == payload; s.assert_actor()
    cached(f, payload).unlink(); asset.write_bytes(pointer(payload)); s.clear_transport()
    assert s.rpc(f, 'lfs_transfer', request={'action': 'fetch', 'remote': 'origin'})['code'] == 0
    assert cached(f, payload).read_bytes() == payload and asset.read_bytes() == pointer(payload); s.assert_actor()
    cached(f, payload).unlink(); s.clear_transport()
    assert s.rpc(f, 'lfs_transfer', request={'action': 'pull', 'remote': 'origin'})['code'] == 0
    assert asset.read_bytes() == payload; s.assert_actor()
    # Ordinary typed Git push inherits the same broker through its installed
    # Git LFS pre-push hook and transfer-adapter subprocesses.
    pushed = b'pre-push inherited named LFS payload\n'; asset.write_bytes(pushed); f.commit(); s.clear_transport()
    assert s.transfer(f, 'push', remote='origin', branch='main')['code'] == 0
    assert s.service.objects[hashlib.sha256(pushed).hexdigest()] == pushed
    assert any('/info/lfs/' in row['path'] for row in s.service.authenticated()); s.assert_actor()
    # Build a remote pointer commit without using any HTTP credentials. The
    # following typed pull must download its missing content through smudge.
    pulled = b'pull smudge inherited named LFS payload\n'; pulled_oid = hashlib.sha256(pulled).hexdigest()
    s.service.objects[pulled_oid] = pulled
    remote = s.service.projects/'fork/repo.git'
    environment = {**os.environ, 'GIT_INDEX_FILE': str(s.root/'remote-lfs.index'),
                   'GIT_AUTHOR_NAME': 'Fixture Writer', 'GIT_AUTHOR_EMAIL': 'writer@example.invalid',
                   'GIT_COMMITTER_NAME': 'Fixture Writer', 'GIT_COMMITTER_EMAIL': 'writer@example.invalid'}
    def remote_git(*args, body=None):
        result = subprocess.run([s.real_git, '--git-dir', str(remote), *args], input=body, env=environment, capture_output=True)
        assert result.returncode == 0, result.stderr
        return result.stdout.strip().decode()
    remote_git('read-tree', 'refs/heads/main')
    blob = remote_git('hash-object', '-w', '--stdin', body=pointer(pulled))
    remote_git('update-index', '--add', '--cacheinfo', '100644,'+blob+',large.asset')
    tree = remote_git('write-tree'); parent = remote_git('rev-parse', 'refs/heads/main')
    tip = remote_git('commit-tree', tree, '-p', parent, '-m', 'remote pointer commit')
    remote_git('update-ref', 'refs/heads/main', tip)
    assert not cached(f, pulled).exists(); s.clear_transport()
    assert s.transfer(f, 'pull', remote='origin', branch='main')['code'] == 0
    assert asset.read_bytes() == pulled and cached(f, pulled).read_bytes() == pulled
    assert any('/info/lfs/' in row['path'] for row in s.service.authenticated()); s.assert_actor()
    # Native LFS writes an error log for rejected batch responses. Exercise the
    # application-owned storage alias with credentials reflected by the server.
    storage = f.path/'.git/lfs'; assert not (storage/'logs').exists()
    aliases_before = len(list(storage.glob('.desktop-lfs-*')))
    cached(f, pulled).unlink(); s.clear_transport(); s.service.reject_lfs_batch = True
    try:
        rejected = s.rpc(f, 'lfs_transfer', request={'action': 'fetch', 'remote': 'origin'}, fail=True)
    finally: s.service.reject_lfs_batch = False
    encoded = base64.b64encode(('AliceCase:'+ALICE).encode()).decode()
    diagnostics = rejected.stdout+rejected.stderr
    assert encoded not in diagnostics
    value = json.loads(rejected.stdout)
    assert value['code'] != 0 and value['error_kind'] == 'failed' and value['stdout'] == '', value
    rejected_batches = [row for row in s.service.authenticated() if row['path'] == '/fork/repo.git/info/lfs/objects/batch' and row.get('lfs_batch_rejected')]
    assert rejected_batches, 'LFS did not reach the authenticated 422 batch response'
    s.assert_actor()
    print('LFS_ERROR: '+json.dumps({'code': value['code'], 'error_kind': value['error_kind'],
                                   'stdout_empty': value['stdout'] == '', 'authenticated_rejections': len(rejected_batches),
                                   'aliases_before': aliases_before, 'aliases_after': len(list(storage.glob('.desktop-lfs-*')))}), flush=True)
    assert not cached(f, pulled).exists() and asset.read_bytes() == pulled
    assert not (storage/'logs').exists(), 'Native LFS persisted a raw error log'
    for path in storage.rglob('*'):
        if path.is_file():
            content = path.read_bytes()
            assert all(secret.encode() not in content for secret in [ALICE, BOB, ENV, encoded]), 'LFS cache retained credential bytes'
    assert not list(storage.glob('.desktop-lfs-*')), 'Operation-owned LFS storage was not removed'
    # Block an authenticated request from the actual Git LFS child after its
    # private storage is initialized, then cancel the typed operation.
    unrelated = f.path/'lfs-cancel-unrelated'; unrelated.write_bytes(b'unrelated cancellation sentinel\n')
    before = s.evidence(f); stored = s.registry.read_bytes(); global_before = s.global_config.read_bytes()
    s.clear_transport(); s.service.started.clear(); s.service.release.clear()
    s.service.block_path = '/fork/repo.git/info/lfs/objects/batch'
    process = subprocess.Popen([str(BINARY), '--config', str(s.registry), '-C', str(f.path), 'repo', '-'],
                               env=s.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write(json.dumps({'method': 'lfs_transfer', 'request': {'action': 'fetch', 'remote': 'origin'}}))
    process.stdin.close(); process.stdin = None
    descendants = {}
    try:
        wait_for(s.service.started.is_set, 'Actual Git LFS child did not reach the blocked authenticated batch')
        aliases = list(storage.glob('.desktop-lfs-*'))
        assert aliases and all((alias/'logs').is_file() and not (alias/'logs').is_dir() for alias in aliases)
        assert any(row['actor'] == 'alicecase' and row['path'] == s.service.block_path for row in s.service.records)
        descendants = process_descendants(process.pid)
        assert any(name == 'git-lfs' for name in descendants.values()), 'No real Git LFS child was blocked'
        process.send_signal(signal.SIGINT)
        stdout, stderr = process.communicate(timeout=15); clean(stdout); clean(stderr)
        assert encoded not in stdout+stderr and process.returncode == 130
        wait_for(lambda: all(not alive(pid) for pid in descendants), 'Cancelled LFS left a helper or child alive')
        assert s.evidence(f) == before and s.registry.read_bytes() == stored and s.global_config.read_bytes() == global_before
        assert unrelated.read_bytes() == b'unrelated cancellation sentinel\n' and asset.read_bytes() == pulled
        assert cached(f, payload).read_bytes() == payload and cached(f, pushed).read_bytes() == pushed
        assert not cached(f, pulled).exists() and not (storage/'logs').exists()
        for path in storage.rglob('*'):
            if path.is_file():
                content = path.read_bytes()
                assert all(secret.encode() not in content for secret in [ALICE, BOB, ENV, encoded]), 'Cancelled LFS cache retained credential bytes'
        assert not list(storage.glob('.desktop-lfs-*')), 'Cancelled LFS left an operation-owned storage alias'
        s.assert_actor()
        print('LFS_CANCEL: '+json.dumps({'code': process.returncode, 'aliases_initialized': len(aliases),
                                        'aliases_after': len(list(storage.glob('.desktop-lfs-*'))),
                                        'children_observed': len(descendants), 'live_children': sum(alive(pid) for pid in descendants)}), flush=True)
    finally:
        s.service.block_path = None; s.service.release.set(); stop(process)
    s.assert_private_storage(f)


def credential_protocol_and_submodule_scope(s):
    s.configure(); f = s.seed('credential-protocol'); s.assign(f)
    child_path = f.path/'child'
    f.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', str(s.service.projects/'fork/repo.git'), 'child')
    subprocess.run([s.real_git, '-C', str(child_path), 'remote', 'set-url', 'origin', s.service.url+'/fork/repo.git'], check=True)
    f.commit()
    control = s.root/'credential-probes.json'; output = s.root/'credential-probes-result.json'
    base = 'protocol=https\nhost='+s.service.host+'\n'
    valid = [base+'path=fork/repo.git\n\n', base+'path=fork/repo\n\n', base+'path=fork/repo.git/info/lfs\n\n',
             (base+'path=fork/repo.git\n\n').replace('\n', '\r\n')]
    wrong_port = '127.0.0.1:'+str(1 if s.service.http.server_port != 1 else 2)
    invalid = [
        ('host-only', base+'\n'),
        ('other-repository', base+'path=other/repo.git\n\n'),
        ('repository-prefix', base+'path=fork/repo-other.git\n\n'),
        ('lfs-prefix', base+'path=fork/repo.git/info/lfs-evil\n\n'),
        ('lfs-extra', base+'path=fork/repo.git/info/lfs/objects/arbitrary\n\n'),
        ('encoded-separator', base+'path=fork/repo%2fother.git\n\n'),
        ('encoded-backslash', base+'path=fork/repo%5cother.git\n\n'),
        ('encoded-dotdot', base+'path=fork/%2e%2e\n\n'),
    ]
    raw_invalid = [
        ('wrong-port', 'protocol=https\nhost='+wrong_port+'\npath=fork/repo.git\n\n'),
        ('http', 'protocol=http\nhost='+s.service.host+'\npath=fork/repo.git\n\n'),
        ('duplicate-protocol', 'protocol=https\n'+valid[0]),
        ('duplicate-host', 'host='+s.service.host+'\n'+valid[0]),
        ('duplicate-path', 'path=fork/repo.git\n'+valid[0]),
        ('carriage-return', base+'path=fork/re\rpo.git\n\n'),
        ('nul', base+'path=fork/repo.git\x00\n\n'),
        ('oversize', base+'path='+('x'*70000)+'\n\n'),
    ]
    private(control, json.dumps({'valid': valid, 'invalid': invalid, 'raw_invalid': raw_invalid,
                                'child': str(child_path), 'output': str(output), 'scenario': str(s.scenario), 'host': s.service.host}))
    hook = f.path/'.git/hooks/pre-push'
    hook.write_text(f'#!{sys.executable}\n'+f'CONTROL={str(control)!r}\n'+r'''import json,os,subprocess,sys
from pathlib import Path
c=json.loads(Path(CONTROL).read_text());scenario=json.loads(Path(c['scenario']).read_text())
secrets=[user['token'] for user in scenario['users'].values()]+[scenario['environment']['token']]
expected=scenario['users']['AliceCase']['token'];rows=[]
def run(payload,arguments,cwd=None):
 return subprocess.run(arguments,input=payload.encode(),cwd=cwd,capture_output=True,timeout=12)
def record(label,result,valid=False,raw=False):
 text=result.stdout.decode('utf-8','replace');actual=dict(line.split('=',1) for line in text.splitlines() if '=' in line)
 ok=(result.returncode==0 and actual.get('password')==expected) if valid else not any(secret in text for secret in secrets)
 if not valid and raw:ok=ok and 'quit=true' in text.splitlines()
 if not valid and not raw:ok=ok and result.returncode!=0
 rows.append({'label':label,'ok':ok,'code':result.returncode})
arguments=['git','-c','credential.helper='+os.environ['CREDENTIALS_HOSTILE_HELPER'],'credential','fill']
for index,payload in enumerate(c['valid']):record('valid-'+str(index),run(payload,arguments),valid=True)
for label,payload in c['invalid']:record(label,run(payload,arguments))
record('submodule-cannot-borrow',run(c['valid'][0],arguments,cwd=c['child']))
helpers=subprocess.run(['git','config','--get-all','credential.https://'+c['host']+'.helper'],capture_output=True,text=True,check=True).stdout.splitlines()
helper=next(value for value in reversed(helpers) if value and value!=os.environ['CREDENTIALS_HOSTILE_HELPER'])
assert helper.startswith('!')
for label,payload in c['raw_invalid']:record(label,run(payload,['sh','-c',helper[1:]+' get']),raw=True)
for action in ['store','erase']:
 payload=c['valid'][0].rstrip('\n')+'\nusername=AliceCase\npassword='+expected+'\n\n'
 result=run(payload,['sh','-c',helper[1:]+' '+action])
 rows.append({'label':action+'-read-only','ok':result.returncode==0 and not result.stdout,'code':result.returncode})
Path(c['output']).write_text(json.dumps(rows))
sys.exit(0 if all(row['ok'] for row in rows) else 91)
'''); hook.chmod(0o700)
    stored = s.registry.read_bytes(); global_before = s.global_config.read_bytes(); s.clear_transport()
    result = s.transfer(f, 'push', remote='origin', branch='main')
    rows = json.loads(output.read_text()) if output.exists() else []
    assert result['code'] == 0 and rows and all(row['ok'] for row in rows), rows
    assert s.registry.read_bytes() == stored and s.global_config.read_bytes() == global_before
    s.assert_actor(); s.assert_private_storage(f)
    # A directly dispatched operation in an independently saved child obtains
    # that child's account instead of the parent's inherited broker lease.
    child = type(f).__new__(type(f)); child.path = child_path
    s.cli('repositories', 'add', child_path); s.assign(child, OTHER)
    s.service.allowed['/fork/repo.git'] = 'bobcase'; s.clear_transport()
    assert s.transfer(child, 'fetch', remote='origin')['code'] == 0; s.assert_actor('bobcase')


def destination_rewrites_and_multiple_push_urls(s):
    s.configure(); f = s.seed('credential-destinations'); s.assign(f)
    original = s.service.url+'/fork/repo.git'
    # Git must apply its own effective URL rewrite before the operation grants
    # an exact host/port/repository destination to descendants.
    f.git('remote', 'set-url', 'origin', 'saved-account-alias:fork/repo.git')
    f.git('config', 'url.'+s.service.url+'/.insteadOf', 'saved-account-alias:')
    s.clear_transport(); assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
    f.git('remote', 'set-url', 'origin', original)
    f.git('remote', 'set-url', '--add', '--push', 'origin', original)
    f.git('remote', 'set-url', '--add', '--push', 'origin', s.service.url+'/other/repo.git')
    # The named actor must be verified for every intentional push destination.
    # Fake gh only grants fork/repo, so the other repository cannot be borrowed.
    s.clear_transport(); result = s.transfer(f, 'push', remote='origin', branch='main', fail=True)
    assert result.returncode
    assert not any(row['path'].startswith('/other/repo.git') and row['actor'] == 'alicecase' for row in s.service.records)
    assert not s.native_log.exists(); s.assert_private_storage(f)


def lease_revocation_and_cancellation(s):
    for change in ['account', 'source', 'forget', 'cancel']:
        s.configure(); f = s.seed('credential-revoke-'+change); s.assign(f); s.clear_transport()
        process = s.delayed_transfer(f, remote='origin')
        try:
            if change == 'account': s.assign(f, NONE)
            elif change == 'source': f.git('remote', 'set-url', 'origin', s.service.url+'/other/repo.git')
            elif change == 'forget': s.cli('repositories', 'forget', f.path)
            else: process.send_signal(signal.SIGINT)
            stored = s.registry.read_bytes(); before = s.evidence(f)
            if change != 'cancel': s.gate_release.write_text('release')
            stdout, stderr = process.communicate(timeout=15); clean(stdout); clean(stderr)
            assert process.returncode, (change, stdout, stderr)
            assert not s.service.authenticated() and not s.native_log.exists()
            assert s.registry.read_bytes() == stored and s.evidence(f) == before
        finally:
            s.gate_release.write_text('release'); stop(process); private(s.control, '{}')
        s.assert_private_storage(f)



def native_effective_and_ssh_credentials(s):
    s.configure(); f = s.seed('native-credential-preservation'); s.assign(f, EFFECTIVE)
    s.service.allowed['/fork/repo.git'] = 'bobcase'; s.clear_transport()
    assert s.transfer(f, 'fetch', remote='origin')['code'] == 0
    rows = s.service.authenticated(); assert rows and all(row['actor'] == 'bobcase' for row in rows), rows
    assert any(row['action'] == 'get' for row in read_records(s.native_log))
    # The account profile does not replace native SSH transport behavior. This
    # isolated SSH shim runs upload-pack locally instead of contacting SSH.
    s.assign(f); ssh_log = s.root/'native-ssh.jsonl'; ssh = s.root/'bin/ssh'
    ssh.write_text(f'#!{sys.executable}\n'+f'GIT={s.real_git!r}\nREMOTE={str(s.service.projects/"fork/repo.git")!r}\nLOG={str(ssh_log)!r}\n'+r'''import json,os,subprocess,sys
from pathlib import Path
scenario=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
secrets=[value['token'] for value in scenario['users'].values()]
with open(LOG,'a') as log:log.write(json.dumps({'argv_clean':not any(secret in argument for secret in secrets for argument in sys.argv),'alice_environment_clean':scenario['users']['AliceCase']['token'] not in os.environ.values()})+'\n')
assert sys.argv[-1].startswith('git-upload-pack ')
sys.exit(subprocess.run([GIT,'upload-pack',REMOTE]).returncode)
'''); ssh.chmod(0o700)
    s.env.update(GIT_SSH=str(ssh), GIT_SSH_VARIANT='ssh')
    f.git('remote', 'add', 'native-ssh', 'ssh://git@'+s.service.host+'/fork/repo.git')
    s.clear_transport()
    try: assert s.transfer(f, 'fetch', remote='native-ssh')['code'] == 0
    finally:
        s.env.pop('GIT_SSH', None); s.env.pop('GIT_SSH_VARIANT', None)
    rows = read_records(ssh_log)
    assert rows and all(row['argv_clean'] and row['alice_environment_clean'] for row in rows)
    assert not s.service.authenticated() and not s.native_log.exists()
    s.assert_private_storage(f)



def conflicting_authorization_sources(s):
    s.configure(); f = s.seed('credential-header-conflicts'); s.assign(f)
    header = 'Authorization: Bearer '+BOB
    for key in ['http.extraHeader', 'http.'+s.service.url+'.extraHeader',
                'http.'+s.service.url+'/fork/repo.git.extraHeader']:
        f.git('config', key, header)
        try:
            stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_transport()
            s.transfer(f, 'fetch', remote='origin', fail=True)
            assert not s.service.authenticated() and not s.native_log.exists()
            assert s.registry.read_bytes() == stored and s.evidence(f) == before
        finally: f.git('config', '--unset-all', key)
    s.env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.'+s.service.url+'.extraHeader',
                 GIT_CONFIG_VALUE_0=header)
    try:
        stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_transport()
        s.transfer(f, 'fetch', remote='origin', fail=True)
        assert not s.service.authenticated() and not s.native_log.exists()
        assert s.registry.read_bytes() == stored and s.evidence(f) == before
    finally:
        for key in ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']: s.env.pop(key, None)
    # An unrelated origin's native header remains configured and does not
    # interfere with the exact saved HTTPS origin's broker.
    key = 'http.https://unrelated.invalid.extraHeader'; f.git('config', key, header)
    try:
        stored = s.registry.read_bytes(); configured = (f.path/'.git/config').read_bytes(); s.clear_transport()
        assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
        assert f.git('config', '--get', key).stdout.strip().decode() == header
        assert s.registry.read_bytes() == stored and (f.path/'.git/config').read_bytes() == configured
    finally: f.git('config', '--unset-all', key)
    s.assert_private_storage(f)



def native_pull_request_checkout(s):
    s.configure(); f = s.seed('native-pr-checkout')
    f.git('switch', '-qc', 'fixture-pr-source')
    (f.path/'file').write_bytes(b'verified remote pull request content\n'); f.commit()
    first = f.git('rev-parse', 'HEAD').stdout.strip().decode()
    remote = s.service.projects/'fork/repo.git'
    def publish(oid):
        f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(remote), '+'+oid+':refs/pull/7/head')
    publish(first); f.git('switch', '-q', 'main')
    pull = {'number': 7, 'base': {'repo': {**s.data['repositories']['alicecase'], 'default_branch': 'main'}},
            'head': {'ref': 'reviewed-pr', 'sha': first, 'repo': {'owner': {'login': 'contributor'}},
                     'user': {'login': 'contributor'}}}
    def update_pull(**changes):
        pull['head'].update(changes); s.update(pull_requests={'/repos/fork/repo/pulls/7': pull})
    update_pull(); s.assign(f); stored = s.registry.read_bytes(); s.clear_calls(); s.clear_transport()
    action = {'type': 'checkout_pull_request', 'number': 7}
    assert s.github(f, action)['code'] == 0
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'reviewed-pr\n'
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == first
    assert (f.path/'file').read_bytes() == b'verified remote pull request content\n'
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout
    assert s.registry.read_bytes() == stored
    assert not any(row['args'][:2] == ['pr', 'checkout'] for row in s.calls())
    s.assert_actor(); s.assert_private_storage(f)
    # Existing branches advance only through an ordinary native fast-forward.
    second = f.git('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'remote PR fast forward').stdout.strip().decode()
    publish(second); update_pull(sha=second); s.clear_transport()
    assert s.github(f, action)['code'] == 0
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == second
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout; s.assert_actor()
    # Local commits ahead of the verified PR remain intact.
    (f.path/'file').write_bytes(b'local PR work must survive\n'); f.commit()
    ahead = f.git('rev-parse', 'HEAD').stdout; s.clear_transport()
    assert s.github(f, action)['code'] == 0 and f.git('rev-parse', 'HEAD').stdout == ahead
    # Diverged local work is retained, with no branch/index/file reset.
    divergent = f.git('commit-tree', first+'^{tree}', '-p', first, '-m', 'diverged remote PR').stdout.strip().decode()
    publish(divergent); update_pull(sha=divergent); before = s.evidence(f); s.clear_transport()
    s.github(f, action, fail=True)
    assert s.evidence(f) == before and s.registry.read_bytes() == stored
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout
    # An API/ref race must fail before a local branch can be created or reset.
    update_pull(sha='a'*40); before = s.evidence(f); s.clear_transport()
    s.github(f, action, fail=True)
    assert s.evidence(f) == before and not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout
    # Reuse the conventional owner/head spelling instead of overwriting main.
    f.git('switch', '-q', 'main'); update_pull(ref='main', sha=divergent); s.clear_transport()
    assert s.github(f, action)['code'] == 0
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'contributor/main\n'
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == divergent
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout; s.assert_actor()
    s.clear_transport(); before = s.evidence(f)
    s.github(f, action, repository=s.service.host+'/other/repo', fail=True)
    assert not s.service.authenticated() and s.evidence(f) == before
    assert s.registry.read_bytes() == stored; s.assert_private_storage(f)



    # Fork contributions can explicitly select an already declared parent
    # fetch remote; their API and Git phases retain the same assigned actor.
    parent = {**s.data['repositories']['alicecase'], 'id': 9002, 'full_name': 'parent/repo',
              'html_url': s.service.url+'/parent/repo', 'owner': {'login': 'parent'},
              'fork': False, 'parent': None, 'default_branch': 'main'}
    parent_pull = {'number': 9, 'base': {'repo': parent},
                   'head': {'ref': 'parent-review', 'sha': divergent,
                            'repo': {'owner': {'login': 'contributor'}}, 'user': {'login': 'contributor'}}}
    parent_remote = s.service.projects/'parent/repo.git'
    f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(parent_remote), '+'+divergent+':refs/pull/9/head')
    s.service.allowed['/parent/repo.git'] = 'alicecase'
    s.update(repository_responses={'/repos/parent/repo': parent},
             pull_requests={'/repos/parent/repo/pulls/9': parent_pull})
    s.clear_transport()
    assert s.github(f, {'type': 'checkout_pull_request', 'number': 9},
                    repository=s.service.host+'/parent/repo')['code'] == 0
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'parent-review\n'
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == divergent
    assert any(row['path'].startswith('/parent/repo.git/') for row in s.service.authenticated())
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout
    assert s.registry.read_bytes() == stored; s.assert_actor(); s.assert_private_storage(f)



def lfs_configuration_sources(s):
    bad = '[lfs]\n url = https://embedded:'+ALICE+'@'+s.service.host+'/fork/repo.git/info/lfs\n'
    safe = '[lfs]\n url = '+s.service.url+'/fork/repo.git/info/lfs\n'
    for source in ['index', 'head']:
        s.configure(); f = s.seed('credential-lfsconfig-'+source); s.assign(f)
        configuration = f.path/'.lfsconfig'; configuration.write_text(bad); f.git('add', '--', '.lfsconfig')
        if source == 'head':
            f.git('commit', '-qm', 'malicious fixture LFS configuration')
            f.git('rm', '--cached', '-q', '--', '.lfsconfig')
        configuration.unlink(); stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_transport()
        s.transfer(f, 'fetch', remote='origin', fail=True)
        assert not s.service.authenticated() and not s.native_log.exists()
        assert s.registry.read_bytes() == stored and s.evidence(f) == before and not configuration.exists()
    for source in ['index', 'head']:
        s.configure(); f = s.seed('credential-lfsconfig-working-over-'+source); s.assign(f)
        configuration = f.path/'.lfsconfig'; configuration.write_text(bad); f.git('add', '--', '.lfsconfig')
        if source == 'head':
            f.git('commit', '-qm', 'malicious fixture LFS configuration')
            f.git('rm', '--cached', '-q', '--', '.lfsconfig')
        configuration.write_text(safe); stored = s.registry.read_bytes()
        index = (f.path/'.git/index').read_bytes(); s.clear_transport()
        assert s.transfer(f, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
        assert configuration.read_text() == safe and (f.path/'.git/index').read_bytes() == index
        assert s.registry.read_bytes() == stored; s.assert_private_storage(f)



def websocket_credentials_and_pull_request(s):
    s.configure(); f = s.seed('bridge-credentials')
    f.git('switch', '-qc', 'fixture-bridge-pr-source')
    (f.path/'file').write_bytes(b'bridge assigned PR content\n'); f.commit()
    oid = f.git('rev-parse', 'HEAD').stdout.strip().decode()
    f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(s.service.projects/'fork/repo.git'),
          '+'+oid+':refs/pull/11/head')
    f.git('switch', '-q', 'main')
    pull = {'number': 11, 'base': {'repo': {**s.data['repositories']['alicecase'], 'default_branch': 'main'}},
            'head': {'ref': 'bridge-review', 'sha': oid, 'repo': {'owner': {'login': 'contributor'}},
                     'user': {'login': 'contributor'}}}
    s.update(pull_requests={'/repos/fork/repo/pulls/11': pull}); s.assign(f)
    basis = s.account(f)['basis']; record = s.record(f)
    with s.server(f) as ws:
        stored = s.registry.read_bytes()
        s.clear_transport()
        assert s.websocket(ws, 'fetch', remote='origin')['code'] == 0; s.assert_actor()
        s.clear_transport()
        assert s.websocket(ws, 'github', request={'repository': s.service.host+'/fork/repo', 'account_basis': basis,
                                          'action': {'type': 'checkout_pull_request', 'number': 11}})['code'] == 0
        assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'bridge-review\n'
        assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == oid
        assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout; s.assert_actor()
    assert s.registry.read_bytes() == stored and s.record(f) == record; s.assert_private_storage(f)



def reference_transaction_hook_credentials(s):
    s.configure(); f = s.seed('reference-hook-credentials'); s.assign(f)
    sentinel = 'synthetic-private-caller-configuration'; s.update(fixture_secret=sentinel)
    inherited = s.env.get('GIT_CONFIG_PARAMETERS')
    parameter = 'desktop.fixtureSecret='+sentinel
    s.env['GIT_CONFIG_PARAMETERS'] = "'"+parameter.replace("'", "'\\''")+"'"
    output = s.root/'reference-hook-result.json'; hook = f.path/'.git/hooks/reference-transaction'
    hook.write_text(f'#!{sys.executable}\n'+f'SCENARIO={str(s.scenario)!r}\nOUTPUT={str(output)!r}\nHOST={s.service.host!r}\n'+r'''import json,subprocess,sys
from pathlib import Path
transactions=sys.stdin.buffer.read()
if sys.argv[1]!='prepared' or b'refs/heads/broker-reference-hook' not in transactions:sys.exit(0)
scenario=json.loads(Path(SCENARIO).read_text())
request=('protocol=https\nhost='+HOST+'\npath=fork/repo.git\n\n').encode()
result=subprocess.run(['git','credential','fill'],input=request,capture_output=True,timeout=35)
fields=dict(line.split(b'=',1) for line in result.stdout.splitlines() if b'=' in line)
ok=result.returncode==0 and fields.get(b'password')==scenario['users']['AliceCase']['token'].encode()
parameter=subprocess.run(['git','config','--get','desktop.fixtureSecret'],capture_output=True,timeout=5)
retained=parameter.returncode==0 and parameter.stdout.rstrip(b'\n')==scenario['fixture_secret'].encode()
Path(OUTPUT).write_text(json.dumps({'ok':ok,'caller_parameter':retained,'code':result.returncode,'phase':sys.argv[1]}))
sys.exit(0 if ok and retained else 91)
'''); hook.chmod(0o700)
    try:
        plan = s.rpc(f, 'create_branch_preview', name='broker-reference-hook', start_point='refs/heads/main', no_track=True)
        stored = s.registry.read_bytes(); before = s.evidence(f); s.clear_calls(); s.clear_transport()
        request = {'method': 'create_branch', 'name': 'broker-reference-hook', 'start_point': 'refs/heads/main',
                   'no_track': True, 'basis': plan['basis']}
        started = time.monotonic()
        result = s.invoke(['-C', f.path, 'repo', '-'], payload=json.dumps(request), timeout=60)
        print('TIMING: '+json.dumps({'method': 'create_branch_reference_hook',
                                    'elapsed_seconds': round(time.monotonic()-started, 3),
                                    'git_commands': len(read_records(s.git_log))}), flush=True)
        assert result['code'] == 0 and json.loads(output.read_text()) == {'ok': True, 'caller_parameter': True, 'code': 0, 'phase': 'prepared'}
        assert f.git('rev-parse', 'refs/heads/broker-reference-hook').stdout == f.git('rev-parse', 'HEAD').stdout
        assert s.registry.read_bytes() == stored and s.evidence(f)[1:] == before[1:]
        assert not s.native_log.exists()
        assert any(row['kind'] == 'api' and row['actor'] == 'alicecase' for row in s.calls())
        assert all(row['argv_clean'] and row['alice_environment_clean'] for row in read_records(s.git_log))
        for directory in (f.path/'.git').rglob('*.create-hooks'):
            for script in directory.iterdir():
                if script.is_file():
                    body = script.read_bytes()
                    assert sentinel.encode() not in body and ALICE.encode() not in body
        s.assert_private_storage(f)
    finally:
        if inherited is None: s.env.pop('GIT_CONFIG_PARAMETERS', None)
        else: s.env['GIT_CONFIG_PARAMETERS'] = inherited



def main():
    openssl = optional_tool('openssl', 'OPENSSL_BIN', 'openssl-local')
    lfs = optional_tool('git-lfs', 'GIT_LFS_BIN', 'git-lfs-local')
    real_git = shutil.which('git'); assert real_git
    os.environ['PATH'] = str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
    os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
    for name in list(os.environ):
        if name in ('GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS') or name.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
            os.environ.pop(name)
    os.environ['GIT_ASKPASS'] = 'false'; os.environ['SSH_ASKPASS'] = 'false'
    with tempfile.TemporaryDirectory(prefix='desktop-git-credentials-') as temporary:
        root = Path(temporary).resolve(); os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        service = HttpsGit(root, openssl, real_git)
        try:
            suite = Credentials(root, service, real_git)
            print('TOOLS: Git instrumentation wrapper='+suite.wrapper_kind, flush=True)
            for check in [named_git_transfers, disabled_and_missing_accounts, native_git_lfs_descendants,
                          credential_protocol_and_submodule_scope, destination_rewrites_and_multiple_push_urls,
                          lease_revocation_and_cancellation, native_effective_and_ssh_credentials,
                          conflicting_authorization_sources, native_pull_request_checkout, lfs_configuration_sources,
                          websocket_credentials_and_pull_request, reference_transaction_hook_credentials]:
                try: check(suite)
                except BaseException:
                    print('DIAGNOSTIC section: '+check.__name__, flush=True)
                    print('DIAGNOSTIC transport: '+json.dumps({'count': len(service.records), 'first': service.records[:8], 'last': service.records[-8:]}), flush=True)
                    print('DIAGNOSTIC gh: '+json.dumps(suite.calls()[-8:]), flush=True)
                    print('DIAGNOSTIC helpers: '+json.dumps(read_records(suite.native_log)[-8:]), flush=True)
                    print('DIAGNOSTIC git: '+json.dumps(read_records(suite.git_log)[-12:]), flush=True)
                    raise
                print('PASS: Git credentials '+check.__name__, flush=True)
        finally: service.close()
    print('PASS: real HTTPS Git transfers stay bound to the saved named account')


if __name__ == '__main__': main()
