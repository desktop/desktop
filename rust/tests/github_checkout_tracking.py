"""Native assigned-account PR checkout tracking against isolated Git transports."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from discard_advanced import BINARY
from git_credentials import Credentials, HttpsGit, optional_tool, read_records
from repository_accounts import clean
from lfs_diffs import cached, pointer
import hashlib
from repository_context import private, stop, wait_for

ACTION = {'type': 'checkout_pull_request', 'number': 7}


def identity(s, owner, identifier=9003):
    return {'id': identifier, 'name': 'repo', 'full_name': owner+'/repo',
            'html_url': 'https://'+s.data['host']+'/'+owner+'/repo',
            'owner': {'login': owner}, 'default_branch': 'main', 'fork': False, 'parent': None}


def prepare(s, name, *, head_owner='fork', branch='tracking-topic', declared=True, deleted=False, editable=False):
    s.configure(); f = s.seed(name)
    base = {**s.data['repositories']['alicecase'], 'default_branch': 'main'}
    head = None if deleted else identity(s, head_owner, base['id'] if head_owner == 'fork' else 9003)
    f.git('switch', '-qc', 'fixture-pr-source')
    (f.path/'file').write_bytes(b'verified tracking pull request\n'); f.commit()
    oid = f.git('rev-parse', 'HEAD').stdout.strip().decode()
    f.git('switch', '-q', 'main')
    if declared:
        project = s.service.projects/(head_owner+'/repo.git')
        assert project.is_dir()
        f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(project), '+'+oid+':refs/heads/'+branch)
        s.service.allowed['/'+head_owner+'/repo.git'] = 'alicecase'
    else:
        project = s.service.projects/'fork/repo.git'
        f.git('-c', 'core.hooksPath=/dev/null', 'push', '-q', str(project), '+'+oid+':refs/pull/7/head')
    pull = {'number': 7, 'base': {'repo': base}, 'maintainer_can_modify': editable,
            'head': {'ref': branch, 'sha': oid, 'repo': head, 'user': {'login': head_owner}}}
    responses = {} if head is None or head_owner == 'fork' else {'/repos/'+head_owner+'/repo': head}
    s.update(pull_requests={'/repos/fork/repo/pulls/7': pull}, repository_responses=responses)
    s.assign(f); s.clear_calls(); s.clear_transport()
    return f, oid


def setting(f, branch, key):
    result = f.git('config', '--get', 'branch.'+branch+'.'+key, check=False)
    assert result.returncode in [0, 1]
    return None if result.returncode else result.stdout.rstrip(b'\n').decode()


def assert_finished(s, f):
    assert not f.git('for-each-ref', 'refs/desktop/pr-checkout/').stdout
    assert not (f.path/'.git/config.lock').exists()
    assert not (f.path/'.git/config.lock.lock').exists()
    assert not list((f.path/'.git/desktop-pr-checkout').glob('*.create-hooks'))
    assert not any(row['args'][:2] == ['pr', 'checkout'] for row in s.calls())
    s.assert_private_storage(f)


def known_head_remotes(s):
    branch = 'native-tracking'
    f, oid = prepare(s, 'tracking-known-origin', branch=branch)
    f.git('config', 'branch.autoSetupMerge', 'false')
    f.git('config', 'branch.autoSetupRebase', 'remote')
    f.git('config', 'remote.pushDefault', 'upstream')
    f.git('config', 'branch.'+branch+'.gh-merge-base', 'caller-base')
    assert s.github(f, ACTION)['code'] == 0
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == (branch+'\n').encode()
    assert f.git('rev-parse', 'refs/remotes/origin/'+branch).stdout.strip().decode() == oid
    assert setting(f, branch, 'remote') == 'origin'
    assert setting(f, branch, 'merge') == 'refs/heads/'+branch
    assert setting(f, branch, 'rebase') == 'true'
    assert setting(f, branch, 'pushRemote') is None
    assert setting(f, branch, 'gh-merge-base') == 'caller-base'
    assert f.git('config', 'remote.pushDefault').stdout == b'upstream\n'
    assert all(row['path'].startswith('/fork/repo.git/') for row in s.service.authenticated())
    s.assert_actor(); assert_finished(s, f)
    # A declared fork remote uses the unprefixed head name, even for main.
    f, oid = prepare(s, 'tracking-known-fork', head_owner='parent', branch='main')
    f.git('branch', '-m', 'main', 'fixture-base')
    assert s.github(f, ACTION)['code'] == 0
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'main\n'
    assert f.git('rev-parse', 'refs/remotes/upstream/main').stdout.strip().decode() == oid
    assert setting(f, 'main', 'remote') == 'upstream'
    assert setting(f, 'main', 'merge') == 'refs/heads/main'
    assert setting(f, 'main', 'pushRemote') is None
    assert all(row['path'].startswith('/parent/repo.git/') for row in s.service.authenticated())
    s.assert_actor(); assert_finished(s, f)
    # A repeated fast-forward runs with HEAD already tracking the declared fork.
    # Real smudge must retain that verified transport scope for missing LFS data.
    f.git('lfs', 'install', '--local')
    payload = b'known fork PR fast-forward LFS body\n'
    payload_oid = hashlib.sha256(payload).hexdigest(); s.service.objects[payload_oid] = payload
    remote = s.service.projects/'parent/repo.git'
    environment = {**os.environ, 'GIT_INDEX_FILE': str(s.root/'tracking-remote-lfs.index'),
                   'GIT_AUTHOR_NAME': 'Fixture Writer', 'GIT_AUTHOR_EMAIL': 'writer@example.invalid',
                   'GIT_COMMITTER_NAME': 'Fixture Writer', 'GIT_COMMITTER_EMAIL': 'writer@example.invalid'}
    def remote_git(*args, body=None):
        result = subprocess.run([s.real_git, '--git-dir', str(remote), *args], input=body,
                                env=environment, capture_output=True, timeout=10)
        assert result.returncode == 0, 'Could not prepare the isolated fork pointer commit'
        return result.stdout.strip().decode()
    remote_git('read-tree', 'refs/heads/main')
    for path, body in [('.gitattributes', b'*.asset filter=lfs diff=lfs merge=lfs -text\n'),
                       ('fork.asset', pointer(payload))]:
        blob = remote_git('hash-object', '-w', '--stdin', body=body)
        remote_git('update-index', '--add', '--cacheinfo', '100644,'+blob+','+path)
    tree = remote_git('write-tree')
    next_oid = remote_git('commit-tree', tree, '-p', oid, '-m', 'fork LFS fast forward')
    remote_git('update-ref', 'refs/heads/main', next_oid)
    pull = s.data['pull_requests']['/repos/fork/repo/pulls/7']; pull['head']['sha'] = next_oid
    s.update(pull_requests={'/repos/fork/repo/pulls/7': pull}); s.clear_transport()
    assert not cached(f, payload).exists()
    lfs_route = s.root/'tracking-lfs-route.jsonl'; lfs_wrapper = s.root/'bin/git-lfs'
    assert not lfs_wrapper.exists()
    real_lfs = optional_tool('git-lfs', 'GIT_LFS_BIN', 'git-lfs-local')
    lfs_wrapper.write_text(f'#!{sys.executable}\n'+f'GIT={s.real_git!r}\nLFS={real_lfs!r}\nLOG={str(lfs_route)!r}\n'+r'''import json,os,sys,subprocess
from pathlib import Path
def git(*args):
 result=subprocess.run([GIT,*args],capture_output=True,text=True)
 return result.stdout.rstrip('\n') if result.returncode==0 else None
branch=git('symbolic-ref','--quiet','--short','HEAD')
remote=git('config','--get','branch.'+branch+'.remote') if branch else None
with open(LOG,'a') as log:log.write(json.dumps({'command':sys.argv[1] if len(sys.argv)>1 else None,'branch':branch,'remote':remote,'base_repository':'fork/repo','head_repository':'parent/repo','saved_source_remote':'origin'})+'\n')
os.execv(LFS,[LFS,*sys.argv[1:]])
'''); lfs_wrapper.chmod(0o700)
    try:
        assert s.github(f, ACTION)['code'] == 0
    except BaseException:
        print('DIAGNOSTIC LFS route: '+json.dumps(read_records(lfs_route)), flush=True)
        raise
    finally: lfs_wrapper.unlink()
    assert (f.path/'fork.asset').read_bytes() == payload and cached(f, payload).read_bytes() == payload
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == next_oid
    assert any('/info/lfs/' in row['path'] for row in s.service.authenticated())
    s.assert_actor(); assert_finished(s, f)


def existing_known_branch(s):
    branch = 'existing-tracking'
    f, oid = prepare(s, 'tracking-existing', branch=branch)
    f.git('branch', branch, 'main')
    for key, value in [('remote', 'caller-remote'), ('pushRemote', 'caller-push'), ('merge', 'refs/heads/caller'),
                       ('rebase', 'interactive'), ('gh-merge-base', 'caller-base')]:
        f.git('config', 'branch.'+branch+'.'+key, value)
    configured = (f.path/'.git/config').read_bytes()
    for _ in range(2):
        s.clear_transport(); assert s.github(f, ACTION)['code'] == 0
        assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == oid
        assert (f.path/'.git/config').read_bytes() == configured
        assert f.git('rev-parse', 'refs/remotes/origin/'+branch).stdout.strip().decode() == oid
        s.assert_actor(); assert_finished(s, f)


def missing_head_tracking(s):
    for name, deleted, editable, branch, expected_branch in [
            ('uneditable', False, False, 'uneditable-topic', 'uneditable-topic'),
            ('editable', False, True, 'editable-topic', 'editable-topic'),
            ('deleted', True, True, 'main', 'contributor/main')]:
        f, oid = prepare(s, 'tracking-missing-'+name, head_owner='contributor', branch=branch,
                         declared=False, deleted=deleted, editable=editable)
        remotes_before = f.git('for-each-ref', 'refs/remotes/').stdout
        assert s.github(f, ACTION)['code'] == 0
        assert f.git('symbolic-ref', '--short', 'HEAD').stdout == (expected_branch+'\n').encode()
        assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == oid
        remote = 'https://'+s.data['host']+'/contributor/repo.git' if editable and not deleted else 'origin'
        merge = 'refs/heads/'+branch if editable and not deleted else 'refs/pull/7/head'
        assert setting(f, expected_branch, 'remote') == remote
        assert setting(f, expected_branch, 'pushRemote') == remote
        assert setting(f, expected_branch, 'merge') == merge
        assert f.git('for-each-ref', 'refs/remotes/').stdout == remotes_before
        if editable and not deleted:
            assert any(row['args'][:3] == ['config', 'get', 'git_protocol'] and row['tokens_absent'] for row in s.calls())
        s.assert_actor(); assert_finished(s, f)


    branch = 'editable-case-topic'
    f, _ = prepare(s, 'tracking-missing-editable-case', head_owner='ContributorCase', branch=branch, declared=False, editable=True)
    pull = s.data['pull_requests']['/repos/fork/repo/pulls/7']
    pull['head']['repo'].update(name='RepoCase', full_name='ContributorCase/RepoCase',
                               html_url='https://'+s.data['host']+'/ContributorCase/RepoCase')
    s.update(pull_requests={'/repos/fork/repo/pulls/7': pull})
    assert s.github(f, ACTION)['code'] == 0
    expected = 'https://'+s.data['host']+'/ContributorCase/RepoCase.git'
    assert setting(f, branch, 'remote') == expected and setting(f, branch, 'pushRemote') == expected
    s.assert_actor(); assert_finished(s, f)


def editable_fork_ssh_preference(s):
    # The HTTPS service remains isolated and idle. A native SSH shim supplies
    # the base PR ref locally while gh's host preference selects the fork URL.
    authority = s.service.host; s.service.host = 'github.com'
    try:
        branch = 'ssh-editable-topic'
        f, oid = prepare(s, 'tracking-ssh-preference', head_owner='contributor', branch=branch, declared=False, editable=True)
        f.git('remote', 'set-url', 'origin', 'ssh://git@github.com/fork/repo.git')
        s.update(git_protocol='ssh')
        ssh = s.root/'bin/checkout-tracking-ssh'; log = s.root/'checkout-tracking-ssh.jsonl'
        ssh.write_text(f'#!{sys.executable}\n'+f'GIT={s.real_git!r}\nREMOTE={str(s.service.projects/"fork/repo.git")!r}\nLOG={str(log)!r}\n'+r'''import json,os,sys
from pathlib import Path
scenario=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
token=scenario['users']['AliceCase']['token']
assert sys.argv[-1].startswith('git-upload-pack ')
with open(LOG,'a') as log:log.write(json.dumps({'argv_clean':all(token not in argument for argument in sys.argv),'environment_clean':token not in os.environ.values()})+'\n')
os.execv(GIT,[GIT,'upload-pack',REMOTE])
'''); ssh.chmod(0o700)
        s.env.update(GIT_SSH=str(ssh), GIT_SSH_VARIANT='ssh')
        try:
            s.clear_transport(); assert s.github(f, ACTION)['code'] == 0
        finally:
            s.env.pop('GIT_SSH', None); s.env.pop('GIT_SSH_VARIANT', None)
        assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == oid
        assert setting(f, branch, 'remote') == 'git@github.com:contributor/repo.git'
        assert setting(f, branch, 'pushRemote') == 'git@github.com:contributor/repo.git'
        assert setting(f, branch, 'merge') == 'refs/heads/'+branch
        rows = read_records(log)
        assert rows and all(row['argv_clean'] and row['environment_clean'] for row in rows)
        assert not s.service.records and not s.native_log.exists()
        assert_finished(s, f)
    finally: s.service.host = authority


def missing_merge_preservation(s):
    for empty in [False, True]:
        branch = 'empty-merge' if empty else 'existing-merge'
        f, _ = prepare(s, 'tracking-'+branch, head_owner='contributor', branch=branch, declared=False)
        for key, value in [('remote', 'caller-remote'), ('pushRemote', 'caller-push'),
                           ('merge', '' if empty else 'refs/heads/caller'), ('gh-merge-base', 'caller-base'),
                           ('rebase', 'interactive')]:
            f.git('config', 'branch.'+branch+'.'+key, value)
        configured = (f.path/'.git/config').read_bytes()
        assert s.github(f, ACTION)['code'] == 0
        assert setting(f, branch, 'gh-merge-base') == 'caller-base'
        assert setting(f, branch, 'rebase') == 'interactive'
        if empty:
            assert setting(f, branch, 'remote') == 'origin'
            assert setting(f, branch, 'pushRemote') == 'origin'
            assert setting(f, branch, 'merge') == 'refs/pull/7/head'
        else:
            assert (f.path/'.git/config').read_bytes() == configured
        s.assert_actor(); assert_finished(s, f)


def start_checkout(s, f):
    process = subprocess.Popen([str(BINARY), '--config', str(s.registry), '-C', str(f.path), 'repo', '-'],
                               env=s.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write(json.dumps({'method': 'github', 'request': {'action': ACTION}}))
    process.stdin.close(); process.stdin = None
    return process


def remote_ref_races(s):
    for race in ['symbolic', 'tip']:
        branch = 'raced-'+race
        f, _ = prepare(s, 'tracking-'+branch, branch=branch)
        old = f.git('rev-parse', 'main').stdout.strip().decode()
        reference = 'refs/remotes/origin/'+branch
        f.git('update-ref', reference, old); f.git('branch', 'protected', old)
        s.gate_started.unlink(missing_ok=True); s.gate_release.unlink(missing_ok=True)
        private(s.control, json.dumps({'gate': 'update-ref'}))
        process = start_checkout(s, f)
        try:
            wait_for(s.gate_started.exists, 'Canonical remote ref update did not reach the deterministic gate')
            if race == 'symbolic': f.git('symbolic-ref', reference, 'refs/heads/protected')
            else:
                foreign = f.git('commit-tree', old+'^{tree}', '-p', old, '-m', 'caller remote tip').stdout.strip().decode()
                f.git('update-ref', reference, foreign)
            s.gate_release.write_text('release')
            stdout, stderr = process.communicate(timeout=60); clean(stdout); clean(stderr)
            assert process.returncode
            assert f.git('symbolic-ref', '--short', 'HEAD').stdout == b'main\n'
            assert f.git('rev-parse', 'protected').stdout.strip().decode() == old
            assert f.git('show-ref', '--verify', '--quiet', 'refs/heads/'+branch, check=False).returncode == 1
            if race == 'symbolic': assert f.git('symbolic-ref', reference).stdout == b'refs/heads/protected\n'
            else: assert f.git('rev-parse', reference).stdout.strip().decode() == foreign
            s.assert_actor(); assert_finished(s, f)
        finally:
            s.gate_release.write_text('release'); stop(process); private(s.control, '{}')


def tracking_configuration_races(s):
    branch = 'config-after-checkout'
    f, oid = prepare(s, 'tracking-config-hook', head_owner='contributor', branch=branch, declared=False)
    hook = f.path/'.git/hooks/post-checkout'
    hook.write_text('#!/bin/sh\ngit config branch.'+branch+'.merge refs/heads/caller-change\n')
    hook.chmod(0o700)
    result = s.github(f, ACTION, fail=True)
    assert result.returncode
    assert f.git('symbolic-ref', '--short', 'HEAD').stdout == (branch+'\n').encode()
    assert f.git('rev-parse', 'HEAD').stdout.strip().decode() == oid
    assert setting(f, branch, 'merge') == 'refs/heads/caller-change'
    assert setting(f, branch, 'remote') is None and setting(f, branch, 'pushRemote') is None
    s.assert_actor(); assert_finished(s, f)
    branch = 'config-during-fetch'
    f, _ = prepare(s, 'tracking-config-fetch', head_owner='contributor', branch=branch, declared=False)
    before = s.evidence(f, config=False)
    s.service.started.clear(); s.service.release.clear(); s.service.block_path = '/info/refs'
    process = start_checkout(s, f)
    try:
        wait_for(s.service.started.is_set, 'PR Git fetch did not reach the deterministic HTTP gate')
        f.git('config', 'branch.'+branch+'.merge', 'refs/heads/concurrent')
        s.service.release.set()
        stdout, stderr = process.communicate(timeout=60); clean(stdout); clean(stderr)
        assert process.returncode
        assert s.evidence(f, config=False) == before
        assert setting(f, branch, 'merge') == 'refs/heads/concurrent'
        assert setting(f, branch, 'remote') is None
        s.assert_actor(); assert_finished(s, f)
    finally:
        s.service.block_path = None; s.service.release.set(); stop(process)


def main():
    openssl = optional_tool('openssl', 'OPENSSL_BIN', 'openssl-local')
    lfs = optional_tool('git-lfs', 'GIT_LFS_BIN', 'git-lfs-local')
    real_git = shutil.which('git'); assert real_git
    os.environ['PATH'] = str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
    os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
    os.environ['GIT_ASKPASS'] = 'false'; os.environ['SSH_ASKPASS'] = 'false'
    for name in list(os.environ):
        if name in ('GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS') or name.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
            os.environ.pop(name)
    with tempfile.TemporaryDirectory(prefix='desktop-pr-checkout-tracking-') as temporary:
        root = Path(temporary).resolve(); os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        service = HttpsGit(root, openssl, real_git)
        try:
            suite = Credentials(root, service, real_git)
            print('TOOLS: Git instrumentation wrapper='+suite.wrapper_kind, flush=True)
            for check in [known_head_remotes, existing_known_branch, missing_head_tracking, editable_fork_ssh_preference,
                          missing_merge_preservation, remote_ref_races, tracking_configuration_races]:
                try: check(suite)
                except BaseException:
                    print('DIAGNOSTIC section: '+check.__name__, flush=True)
                    print('DIAGNOSTIC HTTP: '+json.dumps(service.records[-10:]), flush=True)
                    print('DIAGNOSTIC gh: '+json.dumps(suite.calls()[-8:]), flush=True)
                    print('DIAGNOSTIC Git: '+json.dumps(read_records(suite.git_log)[-12:]), flush=True)
                    raise
                print('PASS: PR checkout tracking '+check.__name__, flush=True)
        finally: service.close()
    print('PASS: native assigned PR checkout preserves gh tracking semantics and caller data')


if __name__ == '__main__': main()
