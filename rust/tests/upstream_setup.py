"""Verified fork upstream setup: reviewed local configuration, without Git transfers."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from repository_context import Suite, FORK, NONFORK, private


CANONICAL = 'https://github.example/parent/repo.git'
SECRET = 'SETUP_PRIVATE_SECRET_6c19'


class SetupSuite(Suite):
    def __init__(self, root):
        super().__init__(root)
        self.git_log = root/'git-calls.jsonl'
        real = shutil.which('git'); assert real
        script = f'#!{sys.executable}\n' + f'real={real!r}\n' + '''import json,os,subprocess,sys
from pathlib import Path
a=sys.argv[1:]
with open(os.environ['SETUP_GIT_LOG'],'a') as log:log.write(json.dumps(a)+'\\n')
i=0
while i<len(a):
    if a[i] in ['-c','-C','--git-dir','--work-tree','--namespace']:i+=2
    elif a[i] in ['--no-pager','--paginate','--literal-pathspecs','--no-optional-locks'] or a[i].startswith(('--git-dir=','--work-tree=')):i+=1
    else:break
cmd=a[i:]
if cmd and (cmd[0] in ['fetch','push','clone','pull'] or (cmd[0]=='ls-remote' and '--get-url' not in cmd) or (cmd[0]=='remote' and ('update' in cmd or 'prune' in cmd or '--fetch' in cmd or '-f' in cmd))):
    sys.stderr.write('Git transfer forbidden by offline upstream fixture\\n');sys.exit(97)
add=len(cmd)>=3 and cmd[:2]==['remote','add'] and 'upstream' in cmd
mode=os.environ.get('SETUP_GIT_MODE','')
if add and mode=='fail_before':
    sys.stderr.write(os.environ['SETUP_PRIVATE_DIAGNOSTIC']);sys.exit(1)
if add and mode=='partial_url':
    subprocess.run([real,'config','remote.upstream.url',os.environ['SETUP_PARENT_URL']],check=True)
    sys.stderr.write(os.environ['SETUP_PRIVATE_DIAGNOSTIC']);sys.exit(1)
r=subprocess.run([real,*a])
if add and mode=='fail_after' and r.returncode==0:
    sys.stderr.write(os.environ['SETUP_PRIVATE_DIAGNOSTIC']);sys.exit(1)
sys.exit(r.returncode)
'''
        git = root/'bin/git'; git.write_text(script); git.chmod(0o700)
        self.env.update(SETUP_GIT_LOG=str(self.git_log), SETUP_PARENT_URL=CANONICAL,
                        SETUP_PRIVATE_DIAGNOSTIC='https://private:'+SECRET+'@elsewhere.invalid/repo?token='+SECRET)

    def git_calls(self):
        return [json.loads(line) for line in self.git_log.read_text().splitlines()] if self.git_log.exists() else []

    def additions(self):
        return [args for args in self.git_calls() if 'remote' in args and 'add' in args and 'upstream' in args]

    @contextmanager
    def environment(self, **values):
        previous = self.env.copy(); self.env.update(values)
        try: yield
        finally: self.env = previous

    def origin_only(self, name, *options):
        f = self.seed(name, *options)
        f.git('remote', 'remove', 'upstream')
        return f

    def verified_missing(self, name, *options):
        self.respond()
        f = self.origin_only(name, *options)
        assert self.refresh(f)['status'] == 'verified'
        f.git('remote', 'remove', 'upstream')
        return f

    def preview(self, f): return self.rpc(f, 'upstream_setup_preview')
    def setup(self, f, basis=None, **kwargs): return self.rpc(f, 'setup_upstream', basis=basis, **kwargs)


def config(f):
    common = Path(f.git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.decode().strip())
    return common/'config'


def state(f):
    index = Path(f.git('rev-parse', '--path-format=absolute', '--git-path', 'index').stdout.decode().strip())
    return {
        'refs': f.git('for-each-ref', '--format=%(refname)%00%(objectname)%00%(symref)').stdout,
        'head': f.git('symbolic-ref', '--quiet', 'HEAD', check=False).stdout,
        'index': index.read_bytes() if index.exists() else None,
        'file': (f.path/'file').read_bytes(),
        'loose': (f.path/'untracked').read_bytes() if (f.path/'untracked').exists() else None,
    }


def clean(value):
    text = value if isinstance(value, str) else json.dumps(value)
    assert all(fragment not in text for fragment in [SECRET, 'private:', 'token='])


def automatic_and_manual(s):
    s.respond()
    f = s.origin_only('automatic')
    (f.path/'file').write_bytes(b'index data\n'); f.git('add', '--', 'file')
    (f.path/'file').write_bytes(b'working data\n'); (f.path/'untracked').write_bytes(b'keep\0')
    before = state(f); additions = len(s.additions())
    result = s.refresh(f)
    assert result['status'] == 'verified' and not result.get('upstream_setup_error')
    assert f.git('config', '--get-all', 'remote.upstream.url').stdout == (CANONICAL+'\n').encode()
    assert f.git('config', '--get-all', 'remote.upstream.fetch').stdout == b'+refs/heads/*:refs/remotes/upstream/*\n'
    assert state(f) == before and len(s.additions()) == additions+1
    assert f.git('for-each-ref', '--format=%(refname)', 'refs/remotes/upstream').stdout == b''
    assert s.policy(f)['default_branch']['name'] == 'main'  # setup never fetches HEAD
    f.git('branch', 'trunk'); f.git('config', '--global', 'init.defaultBranch', 'trunk')
    assert s.policy(f)['default_branch']['name'] == 'trunk'
    f.git('config', '--global', '--unset-all', 'init.defaultBranch')
    f.git('remote', 'remove', 'upstream')
    before, raw = state(f), config(f).read_bytes()
    plan = s.command(f, 'upstream-setup', '--preview')
    assert plan['status'] == 'add' and plan['remote'] == 'upstream' and plan['url'] == CANONICAL
    assert plan['parent'] == {'host': 'github.example', 'owner': 'parent', 'name': 'repo'}
    assert state(f) == before and config(f).read_bytes() == raw
    s.rpc(f, 'setup_upstream', basis=plan['basis'], url='https://elsewhere.invalid/untrusted/repo.git', fail=True)
    assert config(f).read_bytes() == raw
    result = s.command(f, 'upstream-setup', '--basis', plan['basis'])
    assert result['code'] == 0 and result['status'] == 'added' and result['context']['status'] == 'verified'
    assert state(f) == before
    raw = config(f).read_bytes(); additions = len(s.additions())
    assert s.setup(f)['status'] == 'already_configured'
    assert config(f).read_bytes() == raw and len(s.additions()) == additions
    s.setup(f, basis=plan['basis'], fail=True)
    assert config(f).read_bytes() == raw
    # Adding the parent is independent of the contribution preference, as in Desktop.
    f = s.origin_only('self-target'); s.target(f, 'self')
    before = state(f)
    context = s.refresh(f)
    assert context['fork_contribution_target'] == 'self' and context['status'] == 'verified'
    assert context['contribution_remote'] == 'origin' and state(f) == before
    assert f.git('config', 'remote.upstream.url').stdout == (CANONICAL+'\n').encode()
    # An explicit web port belongs to the canonical parent URL.
    f = s.origin_only('custom-port')
    f.git('remote', 'set-url', 'origin', 'https://localhost:34567/fork/repo.git')
    data = {**FORK, 'url': 'https://localhost:34567/fork/repo',
            'parent': {'nameWithOwner': 'parent/repo', 'url': 'https://localhost:34567/parent/repo'}}
    s.respond(data); assert s.refresh(f)['status'] == 'verified'
    assert f.git('config', 'remote.upstream.url').stdout == b'https://localhost:34567/parent/repo.git\n'
    s.respond()


def matching_and_private(s):
    f = s.verified_missing('matching')
    f.git('remote', 'add', 'upstream', 'git@GitHub.Example:Parent/Repo.git')
    f.git('config', '--replace-all', 'remote.upstream.fetch', '+refs/heads/trunk:refs/remotes/upstream/custom')
    f.git('config', '--add', 'remote.upstream.fetch', '^refs/heads/excluded')
    f.git('config', '--add', 'remote.upstream.url', 'https://private:'+SECRET+'@other.invalid/other/repo.git')
    f.git('config', '--add', 'remote.upstream.pushurl', 'https://private:'+SECRET+'@push.invalid/owner/repo.git')
    raw, before, count = config(f).read_bytes(), state(f), len(s.additions())
    plan = s.preview(f)
    assert plan['status'] == 'already_configured'; clean(plan)
    assert s.setup(f, basis=plan['basis'])['status'] == 'already_configured'
    assert config(f).read_bytes() == raw and state(f) == before and len(s.additions()) == count
    # A parent URL returned with credentials/query text still publishes only its canonical HTTPS identity.
    f = s.origin_only('private-metadata')
    f.git('remote', 'set-url', 'origin', 'https://private:'+SECRET+'@github.example/fork/repo.git?token='+SECRET)
    data = {**FORK, 'parent': {'nameWithOwner': 'Parent/Repo',
            'url': 'https://private:'+SECRET+'@GitHub.Example/Parent/Repo.git?token='+SECRET+'#private'}}
    s.respond(data)
    value = s.refresh(f); clean(value)
    assert f.git('config', 'remote.upstream.url').stdout == (CANONICAL+'\n').encode()
    clean(s.preview(f)); clean(s.git_calls())
    s.respond()


def occupied_scopes(s):
    cases = ['local-push', 'local-reset', 'local-proxy', 'global', 'conditional', 'worktree', 'command', 'wrong-url']
    for kind in cases:
        f = s.verified_missing('occupied-'+kind)
        global_section = None
        values = {}
        key = 'remote.upstream.pushurl'
        value = 'https://private:'+SECRET+'@other.invalid/owner/repo.git'
        if kind == 'local-push': f.git('config', key, value)
        elif kind == 'local-reset': f.git('config', 'remote.upstream.url', '')
        elif kind == 'local-proxy': f.git('config', 'remote.upstream.proxy', value)
        elif kind == 'wrong-url': f.git('remote', 'add', 'upstream', value)
        elif kind == 'global':
            f.git('config', '--global', key, value); global_section = 'remote.upstream'
        elif kind == 'conditional':
            included = s.root/'occupied-conditional.cfg'
            private(included, '[remote "upstream"]\n  pushurl = '+value+'\n')
            global_section = 'includeIf.gitdir:'+str(f.path)+'/.git'
            f.git('config', '--global', global_section+'.path', str(included))
            assert f.git('config', key).stdout == (value+'\n').encode()
        elif kind == 'worktree':
            f.git('config', 'extensions.worktreeConfig', 'true')
            f.git('config', '--worktree', key, value)
            assert f.git('config', key).stdout == (value+'\n').encode()
        elif kind == 'command':
            values = {'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': key, 'GIT_CONFIG_VALUE_0': value}
        raw, before, count = config(f).read_bytes(), state(f), len(s.additions())
        try:
            with s.environment(**values):
                plan = s.preview(f)
                assert plan['status'] == 'blocked' and plan['remote'] == 'upstream', (kind, plan)
                clean(plan)
                failure = s.setup(f, basis=plan['basis'], fail=True); clean(failure.stderr)
                refreshed = s.refresh(f)
                assert refreshed['status'] == 'verified' and isinstance(refreshed.get('upstream_setup_error'), str)
                clean(refreshed)
            assert config(f).read_bytes() == raw and state(f) == before and len(s.additions()) == count
        finally:
            if global_section is not None: f.git('config', '--global', '--remove-section', global_section)


def rewrites_and_stale_reviews(s):
    f = s.verified_missing('rewrite-rejected')
    f.git('config', 'url.https://elsewhere.invalid/.insteadOf', 'https://github.example/parent/')
    raw, before = config(f).read_bytes(), state(f)
    assert s.context(f)['status'] == 'verified'
    plan = s.preview(f); assert plan['status'] == 'blocked'
    s.setup(f, basis=plan['basis'], fail=True)
    assert config(f).read_bytes() == raw and state(f) == before
    for kind in ['namespace', 'origin', 'preference', 'cache']:
        f = s.verified_missing('stale-'+kind); plan = s.preview(f)
        assert plan['status'] == 'add'
        if kind == 'namespace': f.git('config', 'remote.upstream.pushurl', 'https://elsewhere.invalid/other/repo.git')
        elif kind == 'origin': f.git('remote', 'set-url', 'origin', 'https://github.example/new/repo.git')
        elif kind == 'preference': s.target(f, 'self', basis=s.context(f)['basis'])
        else:
            record, _ = s.files(f); value = json.loads(record.read_text())
            value['revision'] += 1; private(record, json.dumps(value))
        raw, before, count = config(f).read_bytes(), state(f), len(s.additions())
        s.setup(f, basis=plan['basis'], fail=True)
        assert config(f).read_bytes() == raw and state(f) == before and len(s.additions()) == count


def neighbor_namespaces(s):
    f = s.verified_missing('neighbor-namespace')
    f.git('remote', 'add', 'upstream.extra', 'https://neighbor.invalid/owner/repo.git')
    f.git('config', 'remote.upstream.extra.pushurl', 'https://private:'+SECRET+'@neighbor.invalid/owner/repo.git')
    before = state(f); plan = s.preview(f)
    assert plan['status'] == 'add'
    f.git('remote', 'set-url', 'upstream.extra', 'https://changed.invalid/owner/repo.git')
    f.git('config', 'remote.upstream.extra.fetch', '+refs/heads/only:refs/remotes/upstream.extra/only')
    assert s.preview(f)['basis'] == plan['basis']
    assert s.setup(f, basis=plan['basis'])['status'] == 'added'
    assert state(f) == before
    assert f.git('config', 'remote.upstream.extra.url').stdout == b'https://changed.invalid/owner/repo.git\n'
    assert f.git('config', 'remote.upstream.extra.fetch').stdout == b'+refs/heads/only:refs/remotes/upstream.extra/only\n'


def cache_selection_and_nonforks(s):
    for target in ['parent', 'self']:
        f = s.origin_only('nonorigin-'+target)
        f.git('remote', 'rename', 'origin', 'z-fork')
        s.target(f, target)
        assert s.context(f)['remote'] == 'z-fork'
        value = s.refresh(f)
        assert value['status'] == 'verified' and value['remote'] == 'z-fork'
        assert value['repository']['is_fork'] and value['fork_contribution_target'] == target
        assert s.context(f)['status'] == 'verified' and s.context(f)['remote'] == 'z-fork'
        assert value['contribution_remote'] == ('upstream' if target == 'parent' else 'z-fork')
        assert s.refresh(f)['status'] == 'verified'
        assert s.calls()[-1][-1] == 'github.example/fork/repo'
        # Legacy cache records omitted remote_name. Adding alphabetically
        # earlier upstream must still find the cached fork by its fingerprint.
        record, _ = s.files(f); cached = json.loads(record.read_text())
        cached['association'].pop('remote_name', None); private(record, json.dumps(cached))
        f.git('remote', 'remove', 'upstream')
        assert s.context(f)['status'] == 'verified' and s.context(f)['remote'] == 'z-fork'
        plan = s.preview(f); assert plan['status'] == 'add'
        calls = len(s.calls())
        result = s.setup(f, basis=plan['basis'])
        assert result['status'] == 'added' and result['context']['status'] == 'verified'
        assert result['context']['remote'] == 'z-fork' and len(s.calls()) == calls
        assert s.context(f)['status'] == 'verified' and s.context(f)['remote'] == 'z-fork'
        f.git('remote', 'add', 'origin', 'https://github.example/explicit/repo.git')
        assert s.context(f)['remote'] == 'origin' and s.context(f)['status'] == 'stale'
        raw = config(f).read_bytes()
        assert s.preview(f)['status'] == 'blocked'
        s.setup(f, fail=True)
        assert config(f).read_bytes() == raw
    f = s.origin_only('unverified-no-add')
    before, calls = config(f).read_bytes(), len(s.calls())
    assert s.preview(f)['status'] == 'blocked'
    s.setup(f, fail=True)
    assert config(f).read_bytes() == before and len(s.calls()) == calls
    s.respond(NONFORK)
    assert s.refresh(f)['status'] == 'verified'
    assert s.preview(f)['status'] == 'not_fork' and s.setup(f)['status'] == 'not_fork'
    assert config(f).read_bytes() == before
    s.respond()


def failures_and_preserved_partial_state(s):
    for mode in ['fail_before', 'fail_after', 'partial_url']:
        f = s.verified_missing('failure-'+mode)
        before, raw, count = state(f), config(f).read_bytes(), len(s.additions())
        plan = s.preview(f)
        with s.environment(SETUP_GIT_MODE=mode):
            failure = s.setup(f, basis=plan['basis'], fail=True); clean(failure.stderr)
        assert state(f) == before and len(s.additions()) == count+1
        if mode == 'fail_before':
            assert config(f).read_bytes() == raw and s.preview(f)['status'] == 'add'
        else:
            assert f.git('config', 'remote.upstream.url').stdout == (CANONICAL+'\n').encode()
            if mode == 'partial_url': assert f.git('config', '--get', 'remote.upstream.fetch', check=False).returncode == 1
            assert s.preview(f)['status'] == 'already_configured'
            raw, count = config(f).read_bytes(), len(s.additions())
            assert s.setup(f)['status'] == 'already_configured'
            assert config(f).read_bytes() == raw and len(s.additions()) == count
    f = s.verified_missing('native-config-lock'); plan = s.preview(f)
    lock = config(f).with_name('config.lock'); private(lock, b'outside-owned config lock')
    before, raw = state(f), config(f).read_bytes()
    s.setup(f, basis=plan['basis'], fail=True)
    assert config(f).read_bytes() == raw and state(f) == before
    assert lock.read_bytes() == b'outside-owned config lock'
    lock.unlink()
    assert s.setup(f, basis=plan['basis'])['status'] == 'added'


def native_backends_and_linked(s):
    for name, options in [('sha256', ('--object-format=sha256',)), ('reftable', ('--ref-format=reftable',)), ('packed', ())]:
        f = s.verified_missing('upstream-'+name, *options)
        if name == 'packed': f.git('pack-refs', '--all', '--prune')
        before = state(f); plan = s.preview(f)
        assert s.setup(f, basis=plan['basis'])['status'] == 'added' and state(f) == before
    f = s.verified_missing('linked-parent')
    linked = s.root/'linked-upstream'; f.git('worktree', 'add', '-qb', 'linked', str(linked))
    original = f.path; f.path = linked
    before = state(f); plan = s.preview(f)
    assert s.setup(f, basis=plan['basis'])['status'] == 'added' and state(f) == before
    f.path = original
    assert s.preview(f)['status'] == 'already_configured'
    assert s.context(f)['status'] == 'verified'
    f = s.verified_missing('broken-index')
    index = Path(f.git('rev-parse', '--path-format=absolute', '--git-path', 'index').stdout.decode().strip())
    index.write_bytes(b'corrupt index preserved')
    before = state(f); assert s.setup(f, basis=s.preview(f)['basis'])['status'] == 'added'
    assert state(f) == before


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-upstream-setup-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        suite = SetupSuite(root)
        for check in [automatic_and_manual, matching_and_private, occupied_scopes,
                      rewrites_and_stale_reviews, neighbor_namespaces, cache_selection_and_nonforks,
                      failures_and_preserved_partial_state, native_backends_and_linked]:
            check(suite)
            print('PASS: upstream setup '+check.__name__, flush=True)
        clean(suite.git_calls())
    print('PASS: verified fork upstream automatic/reviewed setup, no transfers/ref/index/file mutations, occupied scope protection, canonical/private URLs, stale reviews/cache selection, native failures/partial state and backends/worktrees')


if __name__ == '__main__': main()
