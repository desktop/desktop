"""Read-only publication account context and organization selection, offline."""
import base64
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.parse

from discard_advanced import BINARY, Fixture
from repository_accounts import Accounts, ALICE, BOB, ENV, NAMED, OTHER, NONE, EFFECTIVE
from repository_context import private, stop


class PublishFixture(Accounts):
    def __init__(self, root):
        super().__init__(root)
        gh = root/'bin/gh'
        original = root/'bin/gh-original'
        gh.rename(original)
        gh.write_text(f'#!{sys.executable}\n' + r'''import json,os,sys,time,urllib.parse
from pathlib import Path
args=sys.argv[1:]
endpoint=args[-1] if args else ''
if args[:1]!=['api'] or not endpoint.startswith('/user/orgs?'):
 os.execv(str(Path(__file__).with_name('gh-original')),[str(Path(__file__).with_name('gh-original')),*args])
c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
token=os.environ.get('GH_TOKEN','')
actors={value['token']:value for value in c['users'].values()}
actors[c['environment']['token']]=c['environment']
actor=actors.get(token)
assert actor is not None
assert all(os.environ.get(k)==token for k in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'])
page=int(urllib.parse.parse_qs(urllib.parse.urlsplit(endpoint).query)['page'][0])
with open(os.environ['CONTEXT_GH_LOG'],'a') as log:
 log.write(json.dumps({'kind':'orgs','page':page,'actor':actor['login'],'pinned':True,'args':args})+'\n')
if c.get('delay_org_page')==page:
 Path(os.environ['CONTEXT_GH_STARTED']).write_text('started')
 deadline=time.monotonic()+25
 while not Path(os.environ['CONTEXT_GH_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
rows=c.get('organizations',{}).get(actor['login'],[])
if c.get('org_fail_page')==page:
 sys.stderr.write('provider diagnostic '+token);sys.exit(1)
print(json.dumps(rows[(page-1)*100:page*100]))
''')
        gh.chmod(0o700)
        self.env['GH_CONFIG_DIR'] = str(root/'private-gh-config')
        self.env['GIT_CONFIG_NOSYSTEM'] = '1'
        self.env['GIT_CONFIG_GLOBAL'] = str(root/'isolated-global')

    def local(self, name, saved=True):
        fixture = Fixture(self.root/name)
        if saved:
            self.cli('repositories', 'add', fixture.path)
        return fixture

    def request(self, fixture, method, *, fail=False, timeout=25, **fields):
        arguments = [str(BINARY), '--config', str(self.registry), '-C', str(fixture.path), 'repo', '-']
        result = subprocess.run(arguments, input=json.dumps({'method':method, **fields}), env=self.env,
                                capture_output=True, text=True, timeout=timeout)
        self.assert_clean(result.stdout+result.stderr)
        if fail:
            assert result.returncode != 0, (method, result.stdout)
            return result
        assert result.returncode == 0, (method, result.stderr, result.stdout)
        return json.loads(result.stdout)

    def cli_publish(self, fixture, *args, fail=False):
        command = [str(BINARY), '--config', str(self.registry), '-C', str(fixture.path), 'publish', *args]
        result = subprocess.run(command, env=self.env, capture_output=True, text=True, timeout=25)
        self.assert_clean(result.stdout+result.stderr)
        if fail:
            assert result.returncode != 0, (args, result.stdout)
            return result
        assert result.returncode == 0, (args, result.stderr)
        return json.loads(result.stdout)

    def assert_clean(self, value):
        secrets = [ALICE, BOB, ENV, self.data['users']['AliceCase']['token']]
        for secret in secrets:
            forms = [secret, base64.b64encode(secret.encode()).decode(), urllib.parse.quote(secret, safe='')]
            assert all(form not in value for form in forms if form), 'Credential appeared in output'


def snapshot(s, f):
    gitdir = f.path/'.git'
    return ((gitdir/'config').read_bytes(), (gitdir/'HEAD').read_bytes(),
            f.git('for-each-ref', '--format=%(refname) %(objectname)').stdout,
            (gitdir/'index').read_bytes() if (gitdir/'index').exists() else None,
            s.registry.read_bytes() if s.registry.exists() else None)


def rpc_org(s, f, target, **kwargs):
    return s.request(f, 'publish_organizations', host='github.com', target=target, **kwargs)


def context_and_description(s):
    s.configure(); f=s.local('local unpublished')
    before=snapshot(s,f)
    context=s.request(f,'publish_context',host='github.com')
    assert context['saved'] and not context['origin_exists'] and context['private'] is True
    assert context['name']=='local unpublished' and context['description']==''
    assert {row['login'] for row in context['accounts']}=={'AliceCase','BobCase'}
    cli=s.cli_publish(f,'context','--host','github.com')
    assert cli==context and snapshot(s,f)==before
    description=f.path/'.git/description'
    description.write_text('  literal leading and trailing  \nsecond line\n')
    before=snapshot(s,f)
    value=s.request(f,'publish_context',host='github.com')
    assert value['description']=='  literal leading and trailing  \nsecond line\n'
    assert snapshot(s,f)==before and description.read_text()=='  literal leading and trailing  \nsecond line\n'
    outside=s.root/'description-outside'; outside.write_text('private outside sentinel')
    description.unlink(); description.symlink_to(outside)
    before=snapshot(s,f)
    assert s.request(f,'publish_context',host='github.com')['description']==''
    assert outside.read_text()=='private outside sentinel' and description.is_symlink() and snapshot(s,f)==before
    description.unlink()
    if hasattr(os,'mkfifo'):
        os.mkfifo(description,0o600)
        before=snapshot(s,f)
        assert s.request(f,'publish_context',host='github.com',timeout=8)['description']==''
        assert snapshot(s,f)==before
        description.unlink()
    unsaved=s.local('unsaved unpublished',saved=False)
    assert s.request(unsaved,'publish_context',host='github.com')['saved'] is False
    print('PASS: unpublished catalog/CLI and exact, symlink-safe, nonblocking description',flush=True)


def organizations_and_modes(s):
    s.configure(); f=s.local('organization selection')
    alice=[{'login':f'org{i:03}','id':i+1000} for i in range(101)]
    alice[0]={'login':'Zulu','id':900}; alice[1]={'login':'alpha','id':901}
    env=[{'login':'EffectiveOrg','id':7001}]
    s.update(organizations={'alicecase':alice,'bobcase':[], 'environment-user':env})
    before=snapshot(s,f); s.clear_calls()
    result=rpc_org(s,f,NAMED)
    assert result['status']=='available' and len(result['organizations'])==101
    assert result['organizations']==sorted(result['organizations'],key=lambda x:x['login'].lower())
    assert {row['id'] for row in result['organizations']}=={row['id'] for row in alice}
    calls=[row for row in s.calls() if row['kind']=='orgs']
    assert [(row['actor'],row['page']) for row in calls]==[('alicecase',1),('alicecase',2)]
    assert all(row['pinned'] for row in calls) and snapshot(s,f)==before
    assert s.cli_publish(f,'organizations','--host','github.com','--login','AliceCase')==result
    s.clear_calls(); value=rpc_org(s,f,EFFECTIVE)
    assert value['organizations']==env
    assert [row['actor'] for row in s.calls() if row['kind']=='orgs']==['environment-user']
    assert s.cli_publish(f,'organizations','--host','github.com','--effective')==value
    s.clear_calls(); rpc_org(s,f,NONE,fail=True)
    assert not [row for row in s.calls() if row['kind']=='orgs']
    assert snapshot(s,f)==before
    print('PASS: explicit stored/effective actor, CLI/RPC parity, pagination and stable state',flush=True)


def retained_numeric_actor(s):
    s.configure(); f=s.seed('stored actor no remote'); s.assign(f)
    f.git('remote','remove','origin'); f.git('remote','remove','upstream')
    assert s.account(f)['assignment']['id']==101
    before=snapshot(s,f); users=copy.deepcopy(s.data['users']); users['AliceCase']['id']=999
    s.update(users=users,organizations={'alicecase':[{'login':'WrongActor','id':444}]})
    s.clear_calls(); rpc_org(s,f,NAMED,fail=True)
    assert not [row for row in s.calls() if row['kind']=='orgs']
    assert snapshot(s,f)==before
    print('PASS: retained assignment fences same-login numeric actor replacement',flush=True)


def effective_without_stored_accounts(s):
    organizations=[{'login':'EffectiveOrg','id':7001}]
    s.configure(visible=[],organizations={'environment-user':organizations})
    f=s.local('effective without stored accounts')
    before=snapshot(s,f); s.clear_calls()
    context=s.request(f,'publish_context',host='github.com')
    assert context['accounts']==[] and context['status']=='available'
    result=rpc_org(s,f,EFFECTIVE)
    assert result['organizations']==organizations
    assert s.cli_publish(f,'organizations','--host','github.com','--effective')==result
    assert [row['actor'] for row in s.calls() if row['kind']=='orgs']==['environment-user','environment-user']
    assert snapshot(s,f)==before
    print('PASS: effective token works without stored accounts',flush=True)


def effective_actor_change_fence(s):
    s.configure(organizations={'environment-user':[{'login':'TrustedOrg','id':42}]},delay_org_page=1)
    f=s.local('effective actor changing')
    before=snapshot(s,f)
    child=s.start_rpc(f,'publish_organizations',host='github.com',target=EFFECTIVE)
    try:
        actor=copy.deepcopy(s.data['environment']); actor['id']=999
        s.update(environment=actor)
        s.release.write_text('release')
        out,err=child.communicate(timeout=15)
        s.assert_clean(out+err)
        assert child.returncode != 0 and not out.strip(), (out,err)
        assert snapshot(s,f)==before
    finally:
        s.release.write_text('release'); stop(child)
    print('PASS: effective actor identity change expires the result',flush=True)


def credential_reflection(s):
    s.configure(); f=s.local('credential reflection')
    token='SyntheticAlphaToken123456'
    users=copy.deepcopy(s.data['users']); users['AliceCase']['token']=token
    s.update(users=users,organizations={'alicecase':[{'login':token,'id':400}]})
    before=snapshot(s,f); result=rpc_org(s,f,NAMED,fail=True)
    assert 'Cannot safely display GitHub organizations' in result.stderr
    assert snapshot(s,f)==before
    s.update(organizations={'alicecase':[{'login':base64.b64encode(token.encode()).decode().rstrip('='),'id':400}]})
    before=snapshot(s,f); rpc_org(s,f,NAMED,fail=True); assert snapshot(s,f)==before
    print('PASS: alphanumeric token and encoded-token provider reflection refused privately',flush=True)


def changed_source_fence(s):
    s.configure(); f=s.local('changing source')
    s.update(organizations={'alicecase':[{'login':'TrustedOrg','id':42}]},delay_org_page=1)
    before_registry=s.registry.read_bytes()
    child=s.start_rpc(f,'publish_organizations',host='github.com',target=NAMED)
    try:
        f.git('remote','add','origin','https://github.com/other/repo.git')
        after_config=(f.path/'.git/config').read_bytes()
        s.release.write_text('release')
        out,err=child.communicate(timeout=15)
        s.assert_clean(out+err)
        assert child.returncode != 0 and not out.strip(), (out,err)
        assert s.registry.read_bytes()==before_registry and (f.path/'.git/config').read_bytes()==after_config
    finally:
        s.release.write_text('release'); stop(child)
    print('PASS: account/source changes during organization read expire the result',flush=True)


def corrupt_context_and_url_change(s):
    s.configure(); f=s.local('corrupt unrelated context')
    cache=f.path/'.git/desktop-repository.json'
    cache.write_bytes(b'{broken unrelated association cache')
    before=snapshot(s,f); data=cache.read_bytes()
    context=s.request(f,'publish_context',host='github.com')
    assert context['status']=='available' and not context['origin_exists']
    s.update(organizations={'alicecase':[{'login':'VerifiedOrg','id':88}]})
    assert rpc_org(s,f,NAMED)['organizations']==[{'login':'VerifiedOrg','id':88}]
    assert cache.read_bytes()==data and snapshot(s,f)==before
    cache.unlink()
    f.git('remote','add','upstream','https://github.com/fork/repo.git?initial-marker=1')
    before_registry=s.registry.read_bytes()
    s.update(delay_org_page=1)
    child=s.start_rpc(f,'publish_organizations',host='github.com',target=NAMED)
    try:
        f.git('remote','set-url','upstream','https://github.com/fork/repo?changed-marker=2')
        after_config=(f.path/'.git/config').read_bytes()
        s.release.write_text('release')
        out,err=child.communicate(timeout=15)
        s.assert_clean(out+err)
        assert child.returncode != 0 and not out.strip(), (out,err)
        assert 'initial-marker' not in err and 'changed-marker' not in err
        assert s.registry.read_bytes()==before_registry and (f.path/'.git/config').read_bytes()==after_config
    finally:
        s.release.write_text('release'); stop(child)
    print('PASS: corrupt unrelated context stays untouched and remote URL changes expire results',flush=True)


def pagination_and_account_fences(s):
    s.configure(); f=s.local('pagination limit')
    rows=[{'login':f'org{i:04}','id':i+1} for i in range(1600)]
    s.update(organizations={'alicecase':rows})
    before=snapshot(s,f); s.clear_calls()
    result=rpc_org(s,f,NAMED,fail=True)
    assert 'Too many GitHub organizations' in result.stderr
    assert len([row for row in s.calls() if row['kind']=='orgs'])==16
    assert snapshot(s,f)==before
    s.update(organizations={'alicecase':[{'login':'First','id':9},{'login':'Second','id':9}]})
    rpc_org(s,f,NAMED,fail=True); assert snapshot(s,f)==before
    s.configure(); g=s.local('account changing')
    s.update(organizations={'alicecase':[{'login':'TrustedOrg','id':42}]},delay_org_page=1)
    child=s.start_rpc(g,'publish_organizations',host='github.com',target=NAMED)
    try:
        s.assign(g,NONE)
        retained=s.registry.read_bytes()
        s.release.write_text('release')
        out,err=child.communicate(timeout=15)
        s.assert_clean(out+err)
        assert child.returncode != 0 and not out.strip(), (out,err)
        assert s.registry.read_bytes()==retained and s.account(g)['assignment']==NONE
    finally:
        s.release.write_text('release'); stop(child)
    print('PASS: pagination bounds, duplicate identities and account-change fencing',flush=True)


def main():
    original_home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-context-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        suite=PublishFixture(root)
        for check in [context_and_description,organizations_and_modes,effective_without_stored_accounts,effective_actor_change_fence,retained_numeric_actor,credential_reflection,changed_source_fence,corrupt_context_and_url_change,pagination_and_account_fences]:
            check(suite)
        assert os.environ.get('HOME')==original_home
    print('PASS: publication context, account pinning, organization pages and read-only fences',flush=True)


if __name__=='__main__': main()
