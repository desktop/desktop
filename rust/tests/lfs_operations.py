"""Real offline LFS transfers, tracking/setup, empty-service RPC, and cancellation."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import select
import shutil
import signal
import subprocess
import tempfile
import threading
from discard_advanced import Fixture, BINARY
from lfs_diffs import cached, pointer
from smoke import WebSocket


def cli(path, *args, fail=False):
    result = subprocess.run([str(BINARY),'-C',str(path),*args],capture_output=True,text=True)
    assert bool(result.returncode) == fail, (args,result.returncode,result.stdout,result.stderr)
    return json.loads(result.stdout) if not fail else result


def transfer(f, action, fail=False, **options):
    return f.rpc('lfs_transfer',request={'action':action,**options},fail=fail)


def git(path, *args, env=None):
    return subprocess.run(['git','-C',str(path),*args],env=env,capture_output=True,check=True)


def legacy_hook_setup(root):
    """Preserve and explicitly replace hooks using the legacy global scope."""
    f = Fixture(root/'existing hooks'); hook = f.path/'.git/hooks/pre-push'
    secret = 'synthetic-hook-secret'; hook.write_text('#!/bin/sh\necho '+secret+'\n'); hook.chmod(0o700)
    failed = f.rpc('lfs_install',scope='global',fail=True)
    assert json.loads(failed.stdout)['error_kind'] == 'configuration'
    assert secret in hook.read_text() and secret not in failed.stdout + failed.stderr
    assert f.git('config','--global','filter.lfs.required').stdout == b'true\n', 'global filters can be installed before a hook conflict'
    assert f.rpc('lfs_install',scope='global',force=True)['code'] == 0
    assert 'git lfs pre-push' in hook.read_text() and secret not in hook.read_text()
    (root/'global').unlink()


def startup_filter_conflict(root):
    """Non-forcing startup preserves custom filters and redacts their values."""
    outside = root/'not a repository'
    secret = 'custom-clean-synthetic-filter-secret -- %f'
    git(outside,'config','--global','filter.lfs.clean',secret)
    failed = cli(outside,'lfs','install','--global','--skip-repo',fail=True)
    assert json.loads(failed.stdout)['error_kind'] == 'configuration'
    assert secret not in failed.stdout + failed.stderr
    assert git(outside,'config','--global','filter.lfs.clean').stdout.decode().strip() == secret
    assert cli(outside,'lfs','install','--global','--skip-repo','--force')['code'] == 0
    assert git(outside,'config','--global','filter.lfs.clean').stdout == b'git-lfs clean -- %f\n'
    (root/'global').unlink()


def main():
    lfs = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    assert lfs, 'Install git-lfs or set GIT_LFS_BIN'
    os.environ['PATH'] = str(Path(lfs).resolve().parent) + os.pathsep + os.environ['PATH']
    os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
    # Local authentication fixtures must not invoke a user's askpass program or
    # inherit injected credential helpers / HTTP authorization headers.
    for name in list(os.environ):
        if name in ('GIT_CONFIG_COUNT','GIT_CONFIG_PARAMETERS') or name.startswith(('GIT_CONFIG_KEY_','GIT_CONFIG_VALUE_')):
            os.environ.pop(name)
    os.environ['GIT_ASKPASS'] = 'false'; os.environ['SSH_ASKPASS'] = 'false'
    with tempfile.TemporaryDirectory(prefix='desktop-lfs-ops-') as temporary:
        root = Path(temporary); global_config = root/'global'; os.environ['GIT_CONFIG_GLOBAL'] = str(global_config)
        outside = root/'not a repository'; outside.mkdir()
        assert cli(outside,'lfs','tool-status')['available']
        assert cli(outside,'repo',json.dumps({'method':'lfs_tool_status'}))['available']
        assert cli(outside,'lfs')['available']
        assert not global_config.exists()
        cli(outside,'lfs','install','--global',fail=True)
        assert not global_config.exists(), 'missing repository must not partially install global filters'
        assert cli(outside,'lfs','install','--global','--skip-repo','--skip-smudge')['code'] == 0
        assert b'--skip' in git(outside,'config','--global','filter.lfs.smudge').stdout
        # The typed JSON entry point has identical standalone behavior.
        request = json.dumps({'method':'lfs_install','scope':'global','skip_repo':True,'force':True})
        assert cli(outside,'repo',request)['code'] == 0
        global_config.unlink()
        # Authenticate an empty service and configure global filters before any
        # repository selection. All writes remain in the isolated global file.
        server = subprocess.Popen([str(BINARY),'-C',str(outside),'--config',str(root/'registry.json'),'serve','--empty','--port','0'],cwd=outside,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
        ws = None
        try:
            assert select.select([server.stderr],[],[],10)[0], 'server did not start'
            match = re.search(r'http://([^/]+)/#token=(\S+)',server.stderr.readline()); assert match
            authority, token = match.groups(); ws = WebSocket(authority,'http://'+authority)
            ws.send({'token':token}); assert ws.receive()['ready']
            def rpc(number,method,**fields):
                ws.send({'id':number,'method':method,**fields}); result = ws.receive(); assert result['id'] == number; return result
            assert rpc(1,'lfs_status')['result']['available']
            assert rpc(2,'lfs_install',scope='global',skip_repo=True)['result']['code'] == 0
            assert 'error' in rpc(3,'lfs_install',scope='local')
            assert 'error' in rpc(4,'lfs_checkout')
            assert 'error' in rpc(5,'lfs_status',paths=['file'])
            assert rpc(6,'snapshot')['result'] is None
            assert rpc(7,'lfs_tool_status',repository_id='an obsolete repository')['result']['available']
        finally:
            if ws: ws.close()
            server.send_signal(signal.SIGINT); server.communicate(timeout=10)
        global_config.unlink()
        startup_filter_conflict(root)
        legacy_hook_setup(root)
        lock = Fixture(root/'lock rules'); lock.rpc('lfs_install')
        lock_file = lock.path/'file.asset'; lock_file.write_bytes(b'existing regular Git content'); lock.commit()
        original_blob = lock.git('show',':file.asset').stdout
        assert lock.rpc('lfs_track',patterns=['*.asset'],lockable=True)['code'] == 0
        assert lock_file.read_bytes() == original_blob and lock_file.stat().st_mode & 0o222 == 0
        assert lock.git('show',':file.asset').stdout == original_blob, 'tracking must not convert the index silently'
        assert lock.rpc('lfs_track',patterns=['*.asset'],lockable=False)['code'] == 0
        assert lock_file.stat().st_mode & 0o200
        assert lock.rpc('lfs_untrack',patterns=['*.asset'])['code'] == 0
        f = Fixture(root/'source')
        assert f.rpc('lfs_install')['code'] == 0
        attrs = f.path/'.gitattributes'
        attrs.write_text('# preserve this comment\nordinary text=auto\n'); f.commit()
        assert cli(f.path,'lfs','track','--filename','--','literal[1]*.bin')['code'] == 0
        status = f.rpc('lfs_status',paths=['literal[1]*.bin','literal11foo.bin'])
        assert [item['tracked'] for item in status['files']] == [True,False], status
        assert '# preserve this comment' in attrs.read_text() and 'ordinary text=auto' in attrs.read_text()
        assert not f.git('diff','--cached','--name-only').stdout, 'tracking must not stage attributes'
        assert f.rpc('lfs_track',patterns=['-leading.bin'])['code'] == 0
        assert f.rpc('lfs_status',paths=['-leading.bin'])['files'][0]['tracked']
        assert f.rpc('lfs_untrack',patterns=['-leading.bin'])['code'] == 0
        assert not f.rpc('lfs_status',paths=['-leading.bin'])['files'][0]['tracked']
        f.rpc('lfs_track',patterns=['../outside'],fail=True)
        f.rpc('lfs_track',patterns=['bad\npattern'],fail=True)
        f.rpc('lfs_track',patterns=[],fail=True)
        previous = attrs.read_bytes(); attrs.unlink(); sentinel = root/'outside-attributes'; sentinel.write_bytes(b'outside')
        attrs.symlink_to(sentinel); f.rpc('lfs_track',patterns=['*.bad'],fail=True); assert sentinel.read_bytes() == b'outside'
        attrs.unlink(); attrs.write_bytes(previous)
        assert f.rpc('lfs_track',patterns=['*.bin'])['code'] == 0
        a, b, c = b'payload A\x00\n', b'payload B\n', b'payload C on side\n'
        (f.path/'a.bin').write_bytes(a); (f.path/'b.bin').write_bytes(b); f.commit()
        f.git('switch','-qc','side'); (f.path/'c.bin').write_bytes(c); f.commit(); f.git('switch','main')
        remote = root/'remote store.git'; subprocess.run(['git','init','--bare','-q',str(remote)],check=True)
        git(remote,'symbolic-ref','HEAD','refs/heads/main')
        f.git('remote','add','origin',str(remote))
        def remote_object(body):
            oid = hashlib.sha256(body).hexdigest(); return remote/'lfs/objects'/oid[:2]/oid[2:4]/oid
        plan = cli(f.path,'lfs','push','--dry-run')
        assert hashlib.sha256(a).hexdigest() in plan['stdout'] and hashlib.sha256(b).hexdigest() in plan['stdout'], plan
        assert not remote_object(a).exists()
        assert transfer(f,'push')['code'] == 0
        assert remote_object(a).read_bytes() == a and remote_object(b).read_bytes() == b
        assert not remote_object(c).exists()
        assert transfer(f,'push',all=True)['code'] == 0 and remote_object(c).read_bytes() == c
        # Push Git refs separately, after proving the typed LFS upload itself.
        hooks = root/'no hooks'; hooks.mkdir()
        f.git('-c',f'core.hooksPath={hooks}','push','origin','main','side')
        clone = root/'cloned'; env = dict(os.environ,GIT_LFS_SKIP_SMUDGE='1')
        subprocess.run(['git','clone','-q',str(remote),str(clone)],env=env,check=True)
        x = Fixture.__new__(Fixture); x.path = clone; x.rpc('lfs_install')
        assert (clone/'a.bin').read_bytes() == pointer(a) and not cached(x,a).exists()
        index = x.git('ls-files','--stage').stdout
        assert cli(clone,'lfs','fetch','--include','a.bin')['code'] == 0
        assert cached(x,a).read_bytes() == a and not cached(x,b).exists()
        assert (clone/'a.bin').read_bytes() == pointer(a), 'fetch must not populate working files'
        inherited_literal = os.environ.get('GIT_LITERAL_PATHSPECS')
        os.environ['GIT_LITERAL_PATHSPECS'] = '1'
        try:
            assert cli(clone,'lfs','checkout','a.bin')['code'] == 0
        finally:
            if inherited_literal is None: os.environ.pop('GIT_LITERAL_PATHSPECS')
            else: os.environ['GIT_LITERAL_PATHSPECS'] = inherited_literal
        assert (clone/'a.bin').read_bytes() == a and (clone/'b.bin').read_bytes() == pointer(b)
        (clone/'a.bin').write_bytes(b'user edits must survive')
        assert transfer(x,'pull',include='b.bin')['code'] == 0
        assert (clone/'a.bin').read_bytes() == b'user edits must survive' and (clone/'b.bin').read_bytes() == b
        assert x.git('ls-files','--stage').stdout == index
        cached(x,b).unlink(); (clone/'b.bin').write_bytes(pointer(b))
        assert transfer(x,'fetch',dry_run=True)['code'] == 0 and not cached(x,b).exists()
        assert transfer(x,'fetch',exclude='a.bin')['code'] == 0 and cached(x,b).read_bytes() == b
        cached(x,b).write_bytes(b'corrupt')
        assert transfer(x,'fetch',refetch=True)['code'] == 0 and cached(x,b).read_bytes() == b
        assert not cached(x,c).exists()
        assert transfer(x,'fetch',all=True)['code'] == 0 and cached(x,c).read_bytes() == c
        # Checkout patterns are globs, and local checkout never fetches.
        (clone/'a.bin').write_bytes(pointer(a)); (clone/'b.bin').write_bytes(pointer(b))
        assert x.rpc('lfs_checkout',patterns=['a.*'])['code'] == 0
        assert (clone/'a.bin').read_bytes() == a and (clone/'b.bin').read_bytes() == pointer(b)
        cached(x,b).unlink(); x.rpc('lfs_checkout')
        assert not cached(x,b).exists() and (clone/'b.bin').read_bytes() == pointer(b)
        transfer(x,'fetch'); (clone/'b.bin').unlink()
        outside_file = root/'outside-pointer'; outside_file.write_bytes(pointer(b)); (clone/'b.bin').symlink_to(outside_file)
        x.rpc('lfs_checkout'); assert outside_file.read_bytes() == pointer(b), 'checkout followed a working symlink'
        (clone/'b.bin').unlink(); (clone/'b.bin').write_bytes(pointer(b))
        transfer(x,'fetch',all=True,include='',fail=True)
        transfer(x,'fetch',remote='--bad',fail=True); transfer(x,'fetch',remote='missing',fail=True)
        transfer(x,'fetch',refs=['not-a-commit'],fail=True)
        transfer(x,'fetch',prune=True,fail=True)
        # Authentication failures never reflect endpoint credentials to RPC.
        secret = 'synthetic-lfs-secret'; contacted = threading.Event(); release = threading.Event(); block = [False]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                contacted.set()
                if block[0]: release.wait(12)
                try:
                    body = ('401 Authentication failed '+secret).encode()
                    self.send_response(401); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
                except (BrokenPipeError,ConnectionResetError): pass
        http = ThreadingHTTPServer(('127.0.0.1',0),Handler); worker = threading.Thread(target=http.serve_forever,daemon=True); worker.start()
        try:
            x.git('config','lfs.url',f'http://user:{secret}@127.0.0.1:{http.server_port}/objects')
            cached(x,b).unlink(); result = transfer(x,'fetch',fail=True)
            value = json.loads(result.stdout)
            assert value['code'] != 0 and value['error_kind'] == 'authentication',value
            assert secret not in result.stdout + result.stderr
            contacted.clear(); block[0] = True
            before = x.git('ls-files','--stage').stdout; working = (clone/'a.bin').read_bytes()
            process = subprocess.Popen([str(BINARY),'-C',str(clone),'repo',json.dumps({'method':'lfs_transfer','request':{'action':'pull'}})],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            assert contacted.wait(10),'LFS pull never reached the local test endpoint'
            process.send_signal(signal.SIGINT); out,err = process.communicate(timeout=10)
            assert process.returncode == 130,(process.returncode,out,err)
            assert not (clone/'.git/index.lock').exists() and x.git('ls-files','--stage').stdout == before
            assert (clone/'a.bin').read_bytes() == working
        finally:
            release.set(); http.shutdown(); http.server_close(); worker.join()
    print('PASS: standalone and empty-bridge LFS setup; tracking; real local push/fetch/pull/checkout, filters/dry-run/all/refetch, modified-file and symlink safety; sanitized auth errors and HTTP-transfer cancellation')


if __name__ == '__main__': main()
