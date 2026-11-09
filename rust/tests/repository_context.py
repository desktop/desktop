"""Offline fork metadata/preferences, native policy binding and private shared storage."""
import errno
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import hashlib
import uuid
from discard_advanced import BINARY, Fixture


FORK = {
    'nameWithOwner': 'fork/repo',
    'url': 'https://github.example/fork/repo',
    'isFork': True,
    'parent': {'nameWithOwner': 'parent/repo', 'url': 'https://github.example/parent/repo'},
}
NONFORK = {**FORK, 'isFork': False, 'parent': None}


def private(path, content):
    path.write_bytes(content if isinstance(content, bytes) else content.encode())
    path.chmod(0o600)


def hardlink(source, destination):
    if hasattr(os, 'link'):
        os.link(source, destination)
        return
    # Android's Python can omit os.link; use the ordinary libc API when present.
    import ctypes
    libc = ctypes.CDLL(None, use_errno=True)
    linkat = libc.linkat
    linkat.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    linkat.restype = ctypes.c_int
    if linkat(-100, os.fsencode(source), -100, os.fsencode(destination), 0) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))


def hardlinks_available(root):
    source, destination = root/'hardlink-source', root/'hardlink-destination'
    private(source, b'hardlink fixture')
    try:
        hardlink(source, destination)
        assert source.stat().st_nlink == destination.stat().st_nlink == 2
        return True
    except OSError as error:
        if error.errno not in [errno.EACCES, errno.EPERM, errno.ENOTSUP, errno.ENOSYS]:
            raise
        print('SKIP: hardlink fixture unavailable on this filesystem (OS error '+str(error.errno)+')', flush=True)
        return False
    finally:
        source.unlink(missing_ok=True); destination.unlink(missing_ok=True)


def wait_for(predicate, label, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.02)
    raise AssertionError(label)


def stop(child):
    if child.poll() is None:
        child.send_signal(signal.SIGINT)
        try:
            child.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill(); child.communicate(timeout=5)


class Suite:
    def __init__(self, root):
        self.root = root
        self.scenario = root/'gh-response.json'
        self.log = root/'gh-calls.jsonl'
        self.started = root/'gh-started'
        self.release = root/'gh-release'
        tools = root/'bin'; tools.mkdir()
        gh = tools/'gh'
        gh.write_text(f'#!{sys.executable}\n' + '''import json,os,sys,time
from pathlib import Path
scenario=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
with open(os.environ['CONTEXT_GH_LOG'],'a') as log: log.write(json.dumps(sys.argv[1:])+'\\n')
if scenario.get('delay'):
    Path(os.environ['CONTEXT_GH_STARTED']).write_text('started')
    deadline=time.monotonic()+25
    while not Path(os.environ['CONTEXT_GH_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
if scenario.get('stderr'):sys.stderr.write(scenario['stderr'])
if 'raw' in scenario:sys.stdout.write(scenario['raw'])
else:print(json.dumps(scenario.get('data')))
sys.exit(scenario.get('exit',0))
''')
        gh.chmod(0o700)
        self.env = {**os.environ,
                    'PATH': str(tools)+os.pathsep+os.environ['PATH'],
                    'CONTEXT_SCENARIO': str(self.scenario), 'CONTEXT_GH_LOG': str(self.log),
                    'CONTEXT_GH_STARTED': str(self.started), 'CONTEXT_GH_RELEASE': str(self.release)}
        self.respond()

    def respond(self, data=None, **extra):
        self.started.unlink(missing_ok=True); self.release.unlink(missing_ok=True)
        private(self.scenario, json.dumps({'data': FORK if data is None else data, **extra}))

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def seed(self, name, *options, remotes=True):
        f = Fixture(self.root/name, *options)
        (f.path/'file').write_bytes(b'base\n'); f.commit()
        for branch in ['fork-main', 'parent-main', 'feature']:
            f.git('branch', branch)
        if remotes:
            tip = f.git('rev-parse', 'HEAD').stdout.strip().decode()
            for remote, owner, default in [('origin', 'fork', 'fork-main'), ('upstream', 'parent', 'parent-main')]:
                f.git('remote', 'add', remote, f'https://github.example/{owner}/repo.git')
                f.git('update-ref', f'refs/remotes/{remote}/{default}', tip)
                f.git('symbolic-ref', f'refs/remotes/{remote}/HEAD', f'refs/remotes/{remote}/{default}')
                f.git('branch', '--set-upstream-to', f'{remote}/{default}', default)
        return f

    def command(self, f, *args, fail=False):
        result = subprocess.run([str(BINARY), '-C', str(f.path), *args], env=self.env,
                                capture_output=True, text=True, timeout=20)
        if fail:
            assert result.returncode, (args, result.stdout)
            return result
        assert result.returncode == 0, (args, result.stderr)
        return json.loads(result.stdout)

    def rpc(self, f, method, fail=False, **params):
        result = subprocess.run([str(BINARY), '-C', str(f.path), 'repo', '-'],
                                input=json.dumps({'method': method, **params}), env=self.env,
                                capture_output=True, text=True, timeout=20)
        if fail:
            assert result.returncode, (method, result.stdout)
            return result
        assert result.returncode == 0, (method, result.stderr)
        return json.loads(result.stdout)

    def context(self, f): return self.rpc(f, 'repository_context')
    def refresh(self, f, **kwargs): return self.rpc(f, 'refresh_repository_context', **kwargs)
    def target(self, f, target, basis=None, **kwargs):
        return self.rpc(f, 'set_fork_contribution_target', target=target, basis=basis, **kwargs)
    def policy(self, f): return self.rpc(f, 'branch_policy')
    def files(self, f):
        common = Path(f.git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.decode().strip())
        return common/'desktop-repository.json', common/'desktop-repository.lock'

    def marker(self, f): return self.files(f)[0].with_name('desktop-repository.id')

    def delayed(self, f):
        self.respond(delay=True)
        child = subprocess.Popen([str(BINARY), '-C', str(f.path), 'repository-context', '--refresh'],
                                 env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            wait_for(self.started.exists, 'gh metadata read did not start')
            return child
        except BaseException:
            stop(child)
            raise


def readonly_and_preferences(s):
    f = s.seed('no-remote', remotes=False)
    context = s.context(f)
    assert context['status'] == 'unverified' and context['remote'] is None
    assert context['contribution_remote'] is None and context['repository'] is None
    assert s.policy(f)['default_branch']['name'] == 'main'
    s.refresh(f, fail=True)
    assert not any(path.exists() for path in s.files(f)) and not s.marker(f).exists() and not s.calls()
    f = s.seed('readonly')
    record, lock = s.files(f)
    before = f.git('for-each-ref', '--format=%(refname) %(objectname)').stdout
    context = s.context(f)
    assert context['fork_contribution_target'] == 'parent' and context['status'] == 'unverified'
    assert context['repository'] is None and context['remote'] == 'origin'
    assert context['contribution_remote'] == 'origin'
    assert s.policy(f)['default_branch']['name'] == 'fork-main'
    assert s.rpc(f, 'snapshot')['repository_context'] == context
    assert s.command(f, 'repository-context') == context
    assert not record.exists() and not lock.exists() and not s.marker(f).exists() and not s.calls()
    assert f.git('for-each-ref', '--format=%(refname) %(objectname)').stdout == before
    s.rpc(f, 'set_fork_contribution_target', target='self', is_fork=True, fail=True)
    assert not record.exists() and not s.marker(f).exists()
    verified = s.refresh(f)
    assert verified['status'] == 'verified' and verified['repository']['is_fork']
    assert verified['repository']['identity'] == {'host': 'github.example', 'owner': 'fork', 'name': 'repo'}
    assert verified['repository']['parent']['owner'] == 'parent'
    assert verified['upstream_status'] == 'matches_parent' and verified['contribution_remote'] == 'upstream'
    assert s.policy(f)['default_branch']['name'] == 'parent-main'
    assert record.stat().st_mode & 0o777 == lock.stat().st_mode & 0o777 == s.marker(f).stat().st_mode & 0o777 == 0o600
    calls = s.calls(); assert len(calls) == 1
    assert calls[0][:3] == ['repo', 'view', '--json'] and calls[0][-1] == 'github.example/fork/repo'
    assert len(calls[0]) == 5
    changed = s.command(f, 'repository-context', '--target', 'self', '--basis', verified['basis'])
    assert changed['fork_contribution_target'] == 'self' and changed['basis'] != verified['basis']
    assert changed['contribution_remote'] == 'origin' and s.policy(f)['default_branch']['name'] == 'fork-main'
    original = record.read_bytes()
    s.target(f, 'parent', basis=verified['basis'], fail=True)
    assert record.read_bytes() == original
    changed = s.target(f, 'parent', basis=changed['basis'])
    assert changed['contribution_remote'] == 'upstream'
    assert s.command(f, 'repository-context', '--refresh')['status'] == 'verified'
    s.command(f, 'repository-context', '--refresh', '--target', 'self', fail=True)
    # Missing or mismatched upstream metadata must never fall back to origin's
    # cached HEAD, nor rewrite an occupied remote name.
    f.git('symbolic-ref', '--delete', 'refs/remotes/upstream/HEAD')
    assert s.policy(f)['default_branch']['name'] == 'main'
    f.git('symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/parent-main')
    f.git('remote', 'set-url', 'upstream', 'https://github.example/unrelated/repo.git')
    config = f.path/'.git/config'; before = config.read_bytes()
    assert s.context(f)['upstream_status'] == 'mismatch'
    assert s.policy(f)['default_branch']['name'] == 'main'
    assert config.read_bytes() == before
    f.git('remote', 'remove', 'upstream')
    assert s.context(f)['upstream_status'] == 'missing'
    assert s.policy(f)['default_branch']['name'] == 'main'
    # An upstream remote alone does not turn a nonfork into a parent contribution.
    f.git('remote', 'add', 'upstream', 'https://github.example/parent/repo.git')
    f.git('update-ref', 'refs/remotes/upstream/parent-main', f.git('rev-parse', 'HEAD').stdout.strip().decode())
    f.git('symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/parent-main')
    s.respond(NONFORK); s.refresh(f)
    assert s.context(f)['repository']['parent'] is None
    assert s.policy(f)['default_branch']['name'] == 'fork-main'
    assert s.context(f)['contribution_remote'] == 'origin'
    s.respond()


def identity_staleness_and_failures(s):
    f = s.seed('stale'); record, _ = s.files(f)
    s.refresh(f); good = record.read_bytes()
    f.git('remote', 'set-url', 'origin', 'https://github.example/another/repo.git')
    stale = s.context(f)
    assert stale['status'] == 'stale' and stale['repository'] is None
    assert stale['contribution_remote'] == 'origin'
    assert s.policy(f)['default_branch']['name'] == 'fork-main'
    assert record.read_bytes() == good
    s.refresh(f, fail=True); assert record.read_bytes() == good
    f.git('remote', 'set-url', 'origin', 'ssh://git@github.example:2222/fork/repo.git')
    assert s.context(f)['status'] == 'stale'
    assert s.refresh(f)['status'] == 'verified'
    assert s.calls()[-1][-1] == 'github.example/fork/repo'
    # Native insteadOf expansion determines identity; configured URL aliases
    # never become arbitrary API selectors.
    f.git('config', 'url.https://github.example/.insteadOf', 'gh-short:')
    f.git('remote', 'set-url', 'origin', 'gh-short:fork/repo.git')
    assert s.context(f)['status'] == 'stale'
    s.refresh(f); assert s.calls()[-1][-1] == 'github.example/fork/repo'
    f.git('remote', 'set-url', 'origin', 'https://private:password@github.example/fork/repo.git?token=secret#private-fragment')
    clean = s.refresh(f)
    assert not any(word in json.dumps(clean) for word in ['password', 'secret', 'private-fragment'])
    assert not any(word in json.dumps(s.calls()) for word in ['password', 'secret', 'private-fragment'])
    good = record.read_bytes()
    bad = [
        ({**FORK, 'url': 'https://github.example/wrong/repo'}, {}),
        ({**FORK, 'nameWithOwner': 'wrong/repo'}, {}),
        ({**FORK, 'isFork': True, 'parent': None}, {}),
        ({**FORK, 'isFork': False}, {}),
        ({**FORK, 'parent': {'nameWithOwner': 'parent/repo', 'url': 'https://other.example/parent/repo'}}, {}),
        ({**FORK, 'parent': {'nameWithOwner': 'fork/repo', 'url': FORK['url']}}, {}),
        ({**FORK, 'parent': {'nameWithOwner': '../repo', 'url': 'https://github.example/../repo'}}, {}),
        ({'isFork': True}, {}),
        (FORK, {'raw': '{broken private-secret'}),
        (FORK, {'exit': 4, 'stderr': 'https://private:password@example.invalid/repo?token=secret'}),
    ]
    for data, extra in bad:
        s.respond(data, **extra)
        result = s.refresh(f, fail=True)
        assert record.read_bytes() == good
        assert not any(word in result.stderr for word in ['password', 'private-secret', 'token=secret'])
    s.respond()
    f.git('remote', 'set-url', 'origin', str(s.root/'local-only.git'))
    before = len(s.calls())
    assert s.context(f)['status'] == 'stale' and s.context(f)['repository'] is None
    s.refresh(f, fail=True); assert len(s.calls()) == before and record.read_bytes() == good
    f = s.seed('unrecognized', remotes=False)
    f.git('remote', 'add', 'origin', str(s.root/'uncontacted.git'))
    assert s.context(f)['status'] == 'unrecognized_remote'
    assert not s.files(f)[0].exists()
    s.refresh(f, fail=True); assert not s.files(f)[0].exists()


def shared_and_reviewed(s):
    f = s.seed('reviews'); s.refresh(f)
    record, _ = s.files(f)
    review = s.rpc(f, 'delete_branch_preview', name='feature')
    context = s.context(f)
    s.target(f, 'self', basis=context['basis'])
    result = s.rpc(f, 'delete_branch', name='feature', force=True, basis=review['basis'], fail=True)
    assert 'context changed' in result.stderr or 'review changed' in result.stderr
    assert not (f.path/'.git/desktop-branch-deletions').exists()
    review = s.rpc(f, 'rename_branch_preview', name='feature', new_name='renamed-feature')
    s.target(f, 'parent', basis=s.context(f)['basis'])
    s.rpc(f, 'rename_branch', name='feature', new_name='renamed-feature', basis=review['basis'], fail=True)
    assert not (f.path/'.git/desktop-branch-renames').exists()
    # Same common Git directory means a linked checkout shares preference/cache.
    linked = s.root/'linked-context'; f.git('worktree', 'add', '-qb', 'linked', str(linked))
    primary = f.path; primary_context = s.context(f); f.path = linked
    assert s.context(f) == primary_context
    changed = s.target(f, 'self', basis=primary_context['basis'])
    f.path = primary
    assert s.context(f) == changed and record.exists()
    # Repository context reads/changes do not require a valid index/preferences.
    index=f.path/'.git/index'; index.write_bytes(b'corrupt index preserved')
    config=s.root/'broken-registry.json'; prefs=config.with_suffix('.preferences.json'); private(prefs, '{broken')
    result = s.command(f, '--config', str(config), 'repository-context')
    assert result['fork_contribution_target'] == 'self' and not config.exists()
    s.command(f, '--config', str(config), 'repository-context', '--target', 'parent', '--basis', result['basis'])
    assert index.read_bytes() == b'corrupt index preserved' and prefs.read_bytes() == b'{broken'


def races_and_cancellation(s):
    f = s.seed('remote-race'); s.refresh(f); record, _ = s.files(f); before = record.read_bytes()
    child = s.delayed(f)
    try:
        f.git('remote', 'set-url', 'origin', 'https://github.example/new/repo.git')
        s.release.write_text('release')
        stdout, stderr = child.communicate(timeout=12)
        assert child.returncode and 'Fetch remote changed' in stderr, (stdout, stderr)
        assert record.read_bytes() == before
    finally: stop(child)
    f = s.seed('preference-race')
    child = s.delayed(f)
    try:
        s.target(f, 'self', basis=s.context(f)['basis'])
        s.release.write_text('release')
        stdout, stderr = child.communicate(timeout=12)
        assert child.returncode == 0, stderr
        value = json.loads(stdout)
        assert value['status'] == 'verified' and value['fork_contribution_target'] == 'self'
        assert s.context(f)['fork_contribution_target'] == 'self'
    finally: stop(child)
    s.respond()
    record, lock_path = s.files(f); before = record.read_bytes()
    with open(lock_path, 'r+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        child = subprocess.Popen([str(BINARY), '-C', str(f.path), 'repository-context', '--target', 'parent'],
                                 env=s.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            time.sleep(.2); assert child.poll() is None
            child.send_signal(signal.SIGINT); _, stderr = child.communicate(timeout=6)
            assert child.returncode == 130, stderr
            assert record.read_bytes() == before
        finally: stop(child)
    assert s.target(f, 'parent')['fork_contribution_target'] == 'parent'


def native_backends(s):
    for name, options in [('context-sha256', ('--object-format=sha256',)),
                          ('context-reftable', ('--ref-format=reftable',)),
                          ('context-packed', ())]:
        f = s.seed(name, *options)
        if name == 'context-packed': f.git('pack-refs', '--all', '--prune')
        assert s.refresh(f)['status'] == 'verified'
        assert s.policy(f)['default_branch']['name'] == 'parent-main'
        s.target(f, 'self', basis=s.context(f)['basis'])
        assert s.policy(f)['default_branch']['name'] == 'fork-main'


def relocation_and_legacy_owner(s):
    f = s.seed('relocation'); s.refresh(f)
    context = s.target(f, 'self', basis=s.context(f)['basis'])
    marker = s.marker(f).read_bytes(); before_calls = len(s.calls())
    original = f.path; destination = s.root/'relocated-repository'
    f.path.rename(destination); f.path = destination
    assert not original.exists() and s.marker(f).read_bytes() == marker
    moved = s.context(f)
    assert moved == context and moved['status'] == 'verified'
    assert moved['fork_contribution_target'] == 'self'
    snapshot = s.rpc(f, 'snapshot')
    assert snapshot['repository_context'] == moved and snapshot['default_branch']['name'] == 'fork-main'
    assert s.command(f, 'repository-context') == moved
    s.target(f, 'parent', basis=moved['basis'])
    assert s.policy(f)['default_branch']['name'] == 'parent-main'
    assert len(s.calls()) == before_calls and s.marker(f).read_bytes() == marker
    # Earlier path-bound records remain readable at their original location,
    # then acquire the portable marker on their next explicit mutation.
    f = s.seed('legacy-owner'); s.refresh(f)
    record, _ = s.files(f); state = json.loads(record.read_text())
    state['repository_id'] = hashlib.sha256(os.fsencode(record.parent.resolve())).hexdigest()
    s.marker(f).unlink(); private(record, json.dumps(state))
    context = s.context(f)
    assert context['status'] == 'verified' and not s.marker(f).exists()
    s.target(f, 'self', basis=context['basis'])
    marker = s.marker(f).read_text().strip()
    assert str(uuid.UUID(marker)) == marker
    assert json.loads(record.read_text())['repository_id'] == marker
    assert s.context(f)['status'] == 'verified'
    # Simulate the valid two-publication upgrade window: the UUID marker is
    # durable, while the previous JSON record still contains its path owner.
    f = s.seed('legacy-marker-window'); s.refresh(f)
    record, _ = s.files(f); marker = s.marker(f).read_bytes()
    state = json.loads(record.read_text())
    state['repository_id'] = hashlib.sha256(os.fsencode(record.parent.resolve())).hexdigest()
    legacy = json.dumps(state).encode(); private(record, legacy)
    context = s.context(f)
    assert context['status'] == 'verified' and record.read_bytes() == legacy
    assert s.marker(f).read_bytes() == marker
    s.target(f, 'self', basis=context['basis'])
    assert json.loads(record.read_text())['repository_id'] == marker.decode().strip()
    assert s.marker(f).read_bytes() == marker


def storage_faults(s):
    f = s.seed('storage'); s.refresh(f); record, lock = s.files(f)
    original = record.read_bytes()
    for content in [b'{broken', b'x'*(64*1024+1),
                    json.dumps({**json.loads(original), 'version': 2}).encode(),
                    json.dumps({**json.loads(original), 'repository_id': '0'*64}).encode(),
                    json.dumps({**json.loads(original), 'unknown': True}).encode()]:
        private(record, content)
        s.rpc(f, 'repository_context', fail=True)
        s.target(f, 'self', fail=True)
        assert record.read_bytes() == content
    private(record, original)
    other = s.seed('foreign-storage'); other_record, _ = s.files(other)
    private(other_record, original)
    s.rpc(other, 'repository_context', fail=True)
    assert other_record.read_bytes() == original
    faults = ['symlink', 'fifo', 'directory', 'mode']
    if hardlinks_available(s.root): faults.append('hardlink')
    for name, path in [('record', record), ('lock', lock)]:
        baseline = path.read_bytes()
        outside = s.root/('outside-'+name); private(outside, baseline)
        for fault in faults:
            path.unlink()
            if fault == 'symlink': path.symlink_to(outside)
            elif fault == 'fifo': os.mkfifo(path, 0o600)
            elif fault == 'hardlink': hardlink(outside, path)
            elif fault == 'directory': path.mkdir()
            else: private(path, baseline); path.chmod(0o644)
            if name == 'record': s.rpc(f, 'repository_context', fail=True)
            else: assert s.context(f)['status'] == 'verified'
            s.target(f, 'self', fail=True)
            assert outside.read_bytes() == baseline
            if name == 'lock': assert record.read_bytes() == original
            if fault == 'directory': path.rmdir()
            else: path.unlink()
            private(path, baseline)
        assert record.read_bytes() == original
    assert not list(record.parent.glob('.desktop-repository-*.tmp'))


def marker_faults(s):
    f = s.seed('marker-storage'); s.refresh(f)
    record, _ = s.files(f); marker = s.marker(f)
    original_record, original_marker = record.read_bytes(), marker.read_bytes()
    marker.unlink()
    s.rpc(f, 'repository_context', fail=True); s.target(f, 'self', fail=True)
    assert not marker.exists() and record.read_bytes() == original_record
    private(marker, original_marker)
    for content in [b'', b'not-a-uuid', b'x'*1024, (str(uuid.uuid4())+'\n').encode()]:
        private(marker, content)
        s.rpc(f, 'repository_context', fail=True); s.target(f, 'self', fail=True)
        assert marker.read_bytes() == content and record.read_bytes() == original_record
    private(marker, original_marker)
    outside = s.root/'outside-marker'; private(outside, original_marker)
    faults = ['symlink', 'fifo', 'directory', 'mode']
    if hardlinks_available(s.root): faults.append('hardlink')
    for fault in faults:
        marker.unlink()
        if fault == 'symlink': marker.symlink_to(outside)
        elif fault == 'fifo': os.mkfifo(marker, 0o600)
        elif fault == 'directory': marker.mkdir()
        elif fault == 'hardlink': hardlink(outside, marker)
        else: private(marker, original_marker); marker.chmod(0o644)
        s.rpc(f, 'repository_context', fail=True); s.target(f, 'self', fail=True)
        assert outside.read_bytes() == original_marker and record.read_bytes() == original_record
        if fault == 'directory': marker.rmdir()
        else: marker.unlink()
        private(marker, original_marker)
    assert s.context(f)['status'] == 'verified'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-repository-context-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        suite = Suite(root)
        for check in [readonly_and_preferences, identity_staleness_and_failures,
                      shared_and_reviewed, races_and_cancellation, native_backends,
                      relocation_and_legacy_owner, storage_faults, marker_faults]:
            check(suite)
            print('PASS: repository context '+check.__name__, flush=True)
    print('PASS: offline verified fork/parent/self policy, private bound metadata, canonical gh reads, stale identity/response fences, shared worktree preferences, reviewed mutations, concurrent refresh/preference, cancellation and metadata/lock fault safety')


if __name__ == '__main__': main()
