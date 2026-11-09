"""Offline GitHub branch-name rules: fixed reads, pinned actors and mutation fences."""
import copy
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
from urllib.parse import quote
from repository_context import Suite, private, stop, wait_for
from discard_advanced import BINARY

# Synthetic fixture credentials. The fake CLI never logs any credential value.
TOKEN = 'synthetic-policy-session-private'
SECOND = 'synthetic-policy-other-account-private'
ENV_TOKEN = 'synthetic-policy-env-private'
SECRET = 'policy-private-diagnostic-sentinel'
PREFIX = '/repos/fork/repo'


def pattern(identifier=11, text='approved/', operator='starts_with'):
    return {'type': 'branch_name_pattern', 'ruleset_id': identifier,
            'parameters': {'operator': operator, 'pattern': text, 'negate': False}}


def clean(value):
    text = value if isinstance(value, str) else json.dumps(value)
    assert not any(secret in text for secret in [TOKEN, SECOND, ENV_TOKEN, SECRET]), text
    return value


class RuleSuite(Suite):
    def __init__(self, root):
        super().__init__(root)
        self.token_file = root/'private-gh-token'
        self.git_log = root/'git-calls.jsonl'
        self.env.update(RULE_TOKEN_FILE=str(self.token_file), RULE_GIT_LOG=str(self.git_log),
                        GH_REPO='unrelated.invalid/wrong/repository', GH_HOST='unrelated.invalid',
                        GH_DEBUG='api', DEBUG='1')
        for key in ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']:
            self.env.pop(key, None)
        gh = root/'bin/gh'
        gh.write_text(f'#!{sys.executable}\n' + r'''import json,os,sys,time
from pathlib import Path
args=sys.argv[1:]
c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
store=Path(os.environ['RULE_TOKEN_FILE'])
host=args[args.index('--hostname')+1] if '--hostname' in args else c['host']
variables=['GH_TOKEN','GITHUB_TOKEN'] if host=='github.com' or host.endswith('.ghe.com') else ['GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']
selected=next((os.environ[key] for key in variables if os.environ.get(key)),store.read_text())
kind='metadata' if args[:2]==['repo','view'] else 'token' if args[:2]==['auth','token'] else 'status' if args[:2]==['auth','status'] else 'api' if args and args[0]=='api' else 'unexpected'
endpoint=args[-1] if kind=='api' else None
entry={'args':args,'kind':kind}
if kind!='metadata':
 entry.update(debug_cleared=not any(key in os.environ for key in ['GH_DEBUG','DEBUG']),repo_cleared='GH_REPO' not in os.environ,host_cleared='GH_HOST' not in os.environ)
if kind=='api':
 entry.update(pinned=all(os.environ.get(key)==c['expected_token'] for key in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']),store_still_original=store.read_text()==c['expected_token'])
with open(os.environ['CONTEXT_GH_LOG'],'a') as log:log.write(json.dumps(entry)+'\n')
if kind=='unexpected':sys.exit(96)
if kind=='api' and not entry['pinned']:
 sys.stderr.write(c['secret']);sys.exit(95)
if c.get('delay_endpoint')==endpoint and kind=='api':
 Path(os.environ['CONTEXT_GH_STARTED']).write_text('started')
 deadline=time.monotonic()+25
 while not Path(os.environ['CONTEXT_GH_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
failure=c.get('failures',{}).get(kind if kind!='api' else endpoint)
if failure:
 sys.stderr.write(c['secret'])
 sys.stdout.write(failure.get('raw',c['secret']))
 sys.exit(failure.get('code',1))
if kind=='metadata':value=c['metadata']
elif kind=='token':
 sys.stdout.write(c.get('token_raw',selected)+'\n');sys.exit(0)
elif kind=='status':value={'hosts':{}} if c.get('no_account',False) else {'hosts':{host:[{'state':'error','login':'fork'}]}}
elif endpoint=='/user':
 value=c['user']
 if c.get('rotate_token'):store.write_text(c['other_token'])
 if c.get('change_actor_on_second_user'):
  count=Path(os.environ['CONTEXT_GH_STARTED']+'-user-count')
  number=int(count.read_text())+1 if count.exists() else 1
  count.write_text(str(number))
  if number>1:value={**value,'id':value['id']+1,'login':'changed-actor'}
elif endpoint==c['prefix']:value=c['repository']
elif endpoint.startswith(c['prefix']+'/rules/branches/'):
 page=endpoint.rsplit('page=',1)[1]
 value=c.get('pages',{}).get(page,c['rules'])
elif endpoint.startswith(c['prefix']+'/rulesets/'):
 identifier=endpoint.rsplit('/',1)[1]
 if identifier not in c['rulesets']:
  sys.stderr.write(c['secret']);sys.exit(1)
 value=c['rulesets'][identifier]
else:sys.stderr.write(c['secret']);sys.exit(94)
print(json.dumps(value))
''')
        gh.chmod(0o700)
        real_git = shutil.which('git'); assert real_git
        git = root/'bin/git'
        git.write_text(f'#!{sys.executable}\n' + f'''import json,os,subprocess,sys
args=sys.argv[1:]
with open(os.environ['RULE_GIT_LOG'],'a') as log:log.write(json.dumps(args)+'\\n')
remaining=iter(args);command=None;tail=[]
for argument in remaining:
 if argument in ['-C','-c','--git-dir','--work-tree','--namespace']:next(remaining,None)
 elif not argument.startswith('-'):
  command=argument;tail=list(remaining);break
if command in ['fetch','push','pull','clone'] or (command=='ls-remote' and '--get-url' not in tail) or (command=='remote' and any(value in tail for value in ['update','prune','-f','--fetch'])):sys.exit(97)
result=subprocess.run([{real_git!r},*args]);sys.exit(result.returncode)
''')
        git.chmod(0o700)
        self.configure()

    def configure(self, host='github.com', fork=True, **changes):
        metadata = {'nameWithOwner': 'fork/repo', 'url': f'https://{host}/fork/repo',
                    'isFork': fork, 'parent': {'nameWithOwner': 'parent/repo', 'url': f'https://{host}/parent/repo'} if fork else None}
        self.data = {'host': host, 'prefix': PREFIX, 'metadata': metadata,
                     'user': {'id': 1001, 'login': 'fork', 'plan': {'name': 'pro'}},
                     'repository': {'id': 2001, 'full_name': 'fork/repo', 'name': 'repo',
                                    'html_url': f'https://{host}/fork/repo', 'owner': {'login': 'fork'}, 'private': False},
                     'rules': [], 'rulesets': {}, 'expected_token': TOKEN, 'other_token': SECOND,
                     'secret': SECRET, **changes}
        self.started.unlink(missing_ok=True); self.release.unlink(missing_ok=True)
        Path(str(self.started)+'-user-count').unlink(missing_ok=True)
        private(self.token_file, TOKEN)
        private(self.scenario, json.dumps(self.data))

    def update(self, **changes):
        self.data.update(changes)
        private(self.scenario, json.dumps(self.data))

    def seed(self, name, *options, verified=True, **kwargs):
        f = super().seed(name, *options)
        host = self.data['host']
        f.git('remote', 'set-url', 'origin', f'https://{host}/fork/repo.git')
        f.git('remote', 'set-url', 'upstream', f'https://{host}/parent/repo.git')
        if verified: assert self.refresh(f)['status'] == 'verified'
        return f

    def clear_calls(self): self.log.unlink(missing_ok=True)
    def api_calls(self): return [row for row in self.calls() if row['kind'] == 'api']
    def rules(self, f, name='approved/topic', **kwargs): return self.rpc(f, 'branch_name_rules', name=name, **kwargs)

    def command(self, *args, **kwargs):
        result = super().command(*args, **kwargs)
        if isinstance(result, subprocess.CompletedProcess): clean(result.stdout); clean(result.stderr)
        else: clean(result)
        return result
    def rpc(self, *args, **kwargs):
        result = super().rpc(*args, **kwargs)
        if isinstance(result, subprocess.CompletedProcess): clean(result.stdout); clean(result.stderr)
        else: clean(result)
        return result

    def evidence(self, f):
        common = Path(f.git('rev-parse', '--path-format=absolute', '--git-common-dir').stdout.decode().strip())
        index = Path(f.git('rev-parse', '--path-format=absolute', '--git-path', 'index').stdout.decode().strip())
        receipts = {}
        for directory in ['desktop-checkout', 'desktop-branch-renames', 'desktop-branch-deletions']:
            path = common/directory
            if path.exists():
                receipts[directory] = {str(item.relative_to(path)): item.read_bytes() for item in path.rglob('*') if item.is_file()}
        return (f.git('for-each-ref', '--format=%(refname) %(objectname)').stdout,
                f.git('symbolic-ref', '-q', 'HEAD', check=False).stdout,
                index.read_bytes(), (common/'config').read_bytes(),
                (f.path/'file').read_bytes(), (f.path/'loose').read_bytes() if (f.path/'loose').exists() else None,
                f.git('stash', 'list', '--format=%H %gs').stdout, receipts)


def fixed_reads_and_encoding(s):
    s.configure()
    f = s.seed('fixed-reads')
    s.clear_calls(); before = s.evidence(f)
    name = 'feature/雪/%2F#tag{literal}'
    view = s.command(f, 'branch-name-rules', name)
    assert view['status'] == 'checked' and view['result'] == 'pass'
    assert view['branch'] == name and view['repository'] == {'host': 'github.com', 'owner': 'fork', 'name': 'repo'}
    assert view['actor'] == {'id': 1001, 'login': 'fork'} and len(view['basis']) == 64
    assert s.evidence(f) == before
    calls = s.calls()
    assert [row['kind'] for row in calls] == ['token', 'api', 'api', 'api', 'api']
    assert [row['args'][-1] for row in s.api_calls()] == ['/user', PREFIX, PREFIX+'/rules/branches/'+quote(name, safe='')+'?per_page=100&page=1', '/user']
    for row in calls:
        assert row['debug_cleared'] and row['repo_cleared'] and row['host_cleared']
        assert row['args'][row['args'].index('--hostname')+1] == 'github.com'
        assert '--repo' not in row['args']
        if row['kind'] == 'api':
            assert row['args'][1:3] == ['--method', 'GET'] and row['pinned']
    assert '--no-refresh' in calls[0]['args']
    assert s.context(f)['contribution_remote'] == 'upstream'
    clean(calls)
    # A native URL's credentials remain outside the REST selector and outputs.
    f.git('remote', 'set-url', 'origin', f'https://private:{SECRET}@github.com/fork/repo.git?token={SECRET}')
    s.refresh(f); s.clear_calls(); assert s.rules(f)['result'] == 'pass'; clean(s.calls())
    before = len(s.calls())
    for name in ['--help', 'bad name', 'bad\nname']:
        s.rules(f, name, fail=True)
    s.rpc(f, 'branch_name_rules', name='main', endpoint='/user', fail=True)
    assert len(s.calls()) == before


def authentication_and_capabilities(s):
    s.configure(); f = s.seed('unverified', verified=False); s.clear_calls()
    view = s.rules(f); assert view['status'] == 'skipped' and view['actor'] is None and not s.calls()
    s.configure(host='github.example'); f = s.seed('unsupported-ghes'); s.clear_calls()
    assert s.rules(f)['status'] == 'skipped' and not s.calls()
    s.configure(host='tenant.ghe.com'); f = s.seed('supported-residency'); s.clear_calls()
    assert s.rules(f)['status'] == 'checked'
    assert all(row['args'][row['args'].index('--hostname')+1] == 'tenant.ghe.com' for row in s.calls())
    s.configure(); f = s.seed('auth-failures')
    for code, proven_empty, expected in [(1, True, 'skipped'), (1, False, 'unavailable'), (4, False, 'skipped'), (7, True, 'unavailable')]:
        s.configure(failures={'token': {'code': code}}, no_account=proven_empty); s.clear_calls()
        assert s.rules(f)['status'] == expected
        assert not s.api_calls()
        assert [row['kind'] for row in s.calls()] == (['token', 'status'] if code == 1 else ['token'])
    for token in ['', 'two\nlines', 'with space']:
        s.configure(token_raw=token); s.clear_calls()
        assert s.rules(f)['status'] == 'unavailable' and not s.api_calls()
    s.configure(); details = copy.deepcopy(s.data['repository']); details['private'] = True
    for plan in [None, 'free']:
        user = {'id': 1001, 'login': 'fork'}
        if plan: user['plan'] = {'name': plan}
        s.configure(user=user, repository=details); s.clear_calls()
        view = s.rules(f); assert view['status'] == 'skipped' and view['result'] == 'not_checked'
        assert [row['args'][-1] for row in s.api_calls()] == ['/user', PREFIX]
    # The legacy exemption uses the original owner/login spelling and belongs
    # only to the authenticated owner, not collaborators on a private fork.
    s.configure(user={'id': 1002, 'login': 'collaborator', 'plan': {'name': 'free'}}, repository=details)
    assert s.rules(f)['status'] == 'checked'
    details['owner']['login'] = 'Fork'
    s.configure(user={'id': 1001, 'login': 'fork', 'plan': {'name': 'free'}}, repository=details)
    assert s.rules(f)['status'] == 'checked'


def policy_results_and_pagination(s):
    s.configure(rules=[pattern()], rulesets={'11': {'id': 11, 'current_user_can_bypass': 'never'}})
    f = s.seed('policy-results')
    blocked = s.rules(f, 'blocked')
    assert blocked['status'] == 'checked' and blocked['result'] == 'blocked' and len(blocked['failed']) == 1
    assert s.rules(f)['result'] == 'pass'
    s.update(rulesets={'11': {'id': 11, 'current_user_can_bypass': 'always'}})
    warning = s.rules(f, 'blocked'); assert warning['result'] == 'warning' and warning['bypassed'] and not warning['failed']
    s.update(rules=[{'type': 'creation', 'ruleset_id': 11}])
    assert s.rules(f)['result'] == 'pass'  # Legacy creation-only bypass behavior.
    s.update(rulesets={'11': {'id': 11, 'current_user_can_bypass': 'pull_requests_only'}})
    assert s.rules(f)['result'] == 'blocked'
    s.update(rules=[pattern()], rulesets={})
    missing = s.rules(f, 'blocked'); assert missing['status'] == 'unavailable' and missing['result'] == 'pass'
    s.update(rules=[pattern(), pattern(12)], rulesets={'11': {'id': 11, 'current_user_can_bypass': 'never'}})
    partial = s.rules(f, 'blocked'); assert partial['status'] == 'unavailable' and partial['result'] == 'blocked'
    irrelevant = {'type': 'required_signatures', 'ruleset_id': 999}
    s.configure(pages={'1': [irrelevant]*100, '2': [pattern()]}, rulesets={'11': {'id': 11, 'current_user_can_bypass': 'never'}, '999': {'id': 999, 'current_user_can_bypass': 'never'}})
    s.clear_calls(); assert s.rules(f, 'blocked')['result'] == 'blocked'
    pages = [row['args'][-1] for row in s.api_calls() if '/rules/branches/' in row['args'][-1]]
    assert len(pages) == 2 and pages[0].endswith('&page=1') and pages[1].endswith('&page=2')
    # Legacy bypass reduction includes every rule's ruleset when name rules exist.
    assert sum('/rulesets/999' in row['args'][-1] for row in s.api_calls()) == 1
    s.configure(rules=[irrelevant]*100); s.clear_calls()
    assert s.rules(f)['status'] == 'unavailable'
    pages = [row for row in s.api_calls() if '/rules/branches/' in row['args'][-1]]
    assert len(pages) == 16 and pages[-1]['args'][-1].endswith('&page=16')


def denied_mutations_preserve_changes(s):
    s.configure(rules=[pattern()], rulesets={'11': {'id': 11, 'current_user_can_bypass': 'never'}})
    f = s.seed('denied-mutations')
    # Existing branch-associated data must not be copied, dropped or relabelled.
    f.git('switch', '-q', 'feature'); (f.path/'file').write_bytes(b'saved on feature\n')
    saved = s.rpc(f, 'stash_save', desktop=True)['oid']; f.git('switch', '-q', 'main')
    (f.path/'file').write_bytes(b'staged payload\n'); f.git('add', '--', 'file')
    (f.path/'file').write_bytes(b'working payload\n'); (f.path/'loose').write_bytes(b'untracked\0')
    for checkout in [False, True]:
        name = 'blocked-checkout' if checkout else 'blocked-ref'
        plan = s.rpc(f, 'create_branch_preview', name=name, checkout=checkout)
        assert plan['name_rules']['result'] == 'blocked'
        before = s.evidence(f)
        s.rpc(f, 'create_branch', name=name, checkout=checkout, strategy='StashOnCurrentBranch', basis=plan['basis'], fail=True)
        assert s.evidence(f) == before
    plan = s.rpc(f, 'rename_branch_preview', name='feature', new_name='blocked-rename')
    assert plan['name_rules']['result'] == 'blocked'; before = s.evidence(f)
    s.rpc(f, 'rename_branch', name='feature', new_name='blocked-rename', basis=plan['basis'], fail=True)
    assert s.evidence(f) == before and f.git('show', saved+':file').stdout == b'saved on feature\n'
    for new_branch in [True, False]:
        name = 'blocked-worktree-new' if new_branch else 'blocked-worktree-dwim'
        if not new_branch:
            f.git('update-ref', 'refs/remotes/origin/'+name, f.git('rev-parse', 'HEAD').stdout.strip().decode())
        path = s.root/name; before = s.evidence(f)
        s.rpc(f, 'worktree_add', path=str(path), branch=name, new_branch=new_branch, fail=True)
        assert s.evidence(f) == before and not path.exists()
    # Reusing a local branch and a same-name rename do not invent GitHub writes
    # or a name check where native Git creates no branch name.
    s.configure(failures={'token': {'code': 7}}); s.clear_calls()
    assert s.rpc(f, 'rename_branch', name='feature', new_name='feature')['unchanged']
    path = s.root/'existing-worktree'
    assert s.rpc(f, 'worktree_add', path=str(path), branch='feature', new_branch=False)['code'] == 0
    assert not s.calls()
    f.git('worktree', 'remove', str(path))


def stale_reviewed_policy(s):
    for operation in ['ref', 'checkout', 'rename']:
        for change in ['actor', 'repository', 'rules']:
            s.configure(); f = s.seed('stale-'+operation+'-'+change)
            (f.path/'file').write_bytes(b'dirty reviewed data\n'); (f.path/'loose').write_bytes(b'keep loose\n')
            name = 'reviewed-'+operation+'-'+change
            if operation == 'rename':
                plan = s.rpc(f, 'rename_branch_preview', name='feature', new_name=name)
            else:
                plan = s.rpc(f, 'create_branch_preview', name=name, checkout=operation == 'checkout')
            if change == 'actor':
                user = copy.deepcopy(s.data['user']); user.update(id=1002, login='second-user'); s.update(user=user)
            elif change == 'repository':
                details = copy.deepcopy(s.data['repository']); details['id'] = 2002; s.update(repository=details)
            else:
                s.update(rules=[pattern(text='reviewed')], rulesets={'11': {'id': 11, 'current_user_can_bypass': 'never'}})
            before = s.evidence(f)
            if operation == 'rename':
                result = s.rpc(f, 'rename_branch', name='feature', new_name=name, basis=plan['basis'], fail=True)
            else:
                result = s.rpc(f, 'create_branch', name=name, checkout=operation == 'checkout', strategy='StashOnCurrentBranch', basis=plan['basis'], fail=True)
            assert 'review' in result.stderr.lower() and s.evidence(f) == before
    s.configure(); f = s.seed('stale-contribution-context')
    plan = s.rpc(f, 'create_branch_preview', name='reviewed-context')
    s.target(f, 'self', basis=s.context(f)['basis']); before = s.evidence(f)
    s.rpc(f, 'create_branch', name='reviewed-context', basis=plan['basis'], fail=True)
    assert s.evidence(f) == before


def pinned_authentication(s):
    s.configure(rotate_token=True); f = s.seed('pinned-token'); s.clear_calls()
    baseline = s.rules(f)
    assert baseline['status'] == 'checked' and s.token_file.read_text() == SECOND
    calls = s.api_calls()
    assert all(row['pinned'] for row in calls) and any(not row['store_still_original'] for row in calls)
    assert len([row for row in s.calls() if row['kind'] == 'token']) == 1
    # Changing a credential without changing its actor or verified data never
    # changes the public policy certificate: no token or derivative is hashed.
    s.configure(expected_token=SECOND); private(s.token_file, SECOND)
    assert s.rules(f)['basis'] == baseline['basis']
    # Effective environment credentials win over the configured account. GET
    # children receive exactly that captured credential in every gh token slot.
    s.configure(expected_token=ENV_TOKEN, rotate_token=True)
    s.env.update(GH_TOKEN=ENV_TOKEN, GITHUB_TOKEN=SECOND,
                 GH_ENTERPRISE_TOKEN=SECOND, GITHUB_ENTERPRISE_TOKEN=SECOND)
    try:
        s.clear_calls(); view = s.rules(f)
        assert view['status'] == 'checked' and all(row['pinned'] for row in s.api_calls())
    finally:
        for key in ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']: s.env.pop(key, None)
    # Even a server returning a different principal under one credential cannot
    # certify a check: the second /user read binds the completed result.
    s.configure(change_actor_on_second_user=True)
    assert s.rules(f)['status'] == 'unavailable'
    clean(s.calls())


def invalid_api_data_and_privacy(s):
    s.configure(); f = s.seed('invalid-api-data')
    for endpoint in ['/user', PREFIX, PREFIX+'/rules/branches/approved%2Ftopic?per_page=100&page=1']:
        s.configure(failures={endpoint: {'code': 1}})
        assert s.rules(f)['status'] == 'unavailable'
        s.configure(failures={endpoint: {'code': 0, 'raw': '{broken '+SECRET}})
        assert s.rules(f)['status'] == 'unavailable'
    s.configure(rules=[{}]*101)
    assert s.rules(f)['status'] == 'unavailable'
    s.configure(); wrong = copy.deepcopy(s.data['repository']); wrong['html_url'] = 'https://github.com/foreign/repo'
    s.update(repository=wrong); view = s.rules(f)
    assert view['status'] == 'unavailable' and view['result'] == 'blocked'
    for ruleset, status in [({'id': 999, 'current_user_can_bypass': 'always'}, 'unavailable'), ({'id': 11}, 'checked'), ({'id': 11, 'current_user_can_bypass': 'unknown'}, 'checked')]:
        s.configure(rules=[pattern()], rulesets={'11': ruleset})
        view = s.rules(f, 'blocked'); assert view['status'] == status and view['result'] == 'blocked'
    clean(s.calls())


def context_races_and_cancellation(s):
    endpoint = PREFIX+'/rules/branches/approved%2Frace?per_page=100&page=1'
    for label in ['origin-change', 'cancel']:
        s.configure(delay_endpoint=endpoint); f = s.seed(label); before = s.evidence(f)
        child = subprocess.Popen([str(BINARY), '-C', str(f.path), 'branch-name-rules', 'approved/race'],
                                 env=s.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            wait_for(s.started.exists, 'branch-rule request did not reach delayed GET')
            if label == 'origin-change':
                f.git('remote', 'set-url', 'origin', 'https://github.com/another/repo.git')
                before = s.evidence(f); s.release.write_text('release')
            else: child.send_signal(signal.SIGINT)
            stdout, stderr = child.communicate(timeout=10)
            clean(stdout); clean(stderr)
            assert child.returncode == (130 if label == 'cancel' else 1), (stdout, stderr)
            assert s.evidence(f) == before
        finally: stop(child)


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-branch-name-rules-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'; os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global.config')
        suite = RuleSuite(root)
        for check in [fixed_reads_and_encoding, authentication_and_capabilities,
                      policy_results_and_pagination, denied_mutations_preserve_changes,
                      stale_reviewed_policy, pinned_authentication,
                      invalid_api_data_and_privacy, context_races_and_cancellation]:
            check(suite)
            print('PASS: branch name rules '+check.__name__, flush=True)
    print('PASS: fixed GitHub GETs, whole-branch encoding, effective-account token pinning, honest policy statuses, legacy plan/bypass behavior, stale review fences and pre-mutation data preservation')


if __name__ == '__main__': main()
