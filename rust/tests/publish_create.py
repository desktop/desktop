"""Synthetic offline gh POST, durable uncertainty, and no automatic replay."""
import copy
import fcntl
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import tempfile

from discard_advanced import BINARY
from publish_context import PublishFixture, snapshot
from publish_preview import preview, request
from publish_receipts import digest, history, synthetic
from repository_accounts import EFFECTIVE, NAMED
from repository_context import private, stop, wait_for


class CreateFixture(PublishFixture):
    def __init__(self,root):
        super().__init__(root)
        gh=root/'bin/gh'; read_only=root/'bin/gh-read-only'; gh.rename(read_only)
        gh.write_text(f'#!{sys.executable}\n' + r'''import json,os,sys,time
from pathlib import Path
args=sys.argv[1:]
c=json.loads(Path(os.environ['CONTEXT_SCENARIO']).read_text())
if args[:1]!=['api'] or 'POST' not in args:
 if c.get('final_org_gate') and args and args[-1].startswith('/user/orgs?'):
  log=Path(os.environ['CONTEXT_GH_LOG'])
  count=sum(1 for line in log.read_text().splitlines() if json.loads(line).get('kind')=='orgs') if log.exists() else 0
  if count==2:
   Path(os.environ['PUBLISH_FINAL_ORG']).write_text('final org check')
   deadline=time.monotonic()+45
   while not Path(os.environ['PUBLISH_POST_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
 os.execv(str(Path(__file__).with_name('gh-read-only')),[str(Path(__file__).with_name('gh-read-only')),*args])
assert args[:4]==['api','--method','POST','--hostname']
assert args[-2:]==['--input','-'] and args[-3] in ['/user/repos','/orgs/ExampleOrg/repos']
assert args[4]=='github.com' and args[5:7]==['--header','Accept: application/vnd.github+json']
token=os.environ.get('GH_TOKEN','')
expected=c['environment']['token'] if c.get('post_actor')=='effective' else c['users']['AliceCase']['token']
assert token==expected
assert all(os.environ.get(k)==token for k in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'])
body=json.load(sys.stdin)
assert set(body)=={'name','description','private'}
with open(os.environ['PUBLISH_POST_LOG'],'a') as log:
 log.write(json.dumps({'endpoint':args[-3],'name':body['name'],'description':body['description'],'private':body['private'],'pinned':True})+'\n')
Path(os.environ['PUBLISH_POST_STARTED']).write_text('received')
if c.get('post_gate'):
 deadline=time.monotonic()+30
 while not Path(os.environ['PUBLISH_POST_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
if c.get('post_failure'):
 sys.stderr.write('provider diagnostic '+token);sys.exit(1)
print(json.dumps(c['post_response']))
''')
        gh.chmod(0o700)
        self.post_log=root/'post-calls.jsonl'; self.post_started=root/'post-started'; self.post_release=root/'post-release'; self.final_org=root/'final-org-started'
        self.env.update(PUBLISH_POST_LOG=str(self.post_log),PUBLISH_POST_STARTED=str(self.post_started),PUBLISH_POST_RELEASE=str(self.post_release),PUBLISH_FINAL_ORG=str(self.final_org))
        git=root/'bin/git'; original=root/'bin/git-read-only'; git.rename(original)
        git.write_text(f'#!{sys.executable}\n' + r'''import os,sys
from pathlib import Path
args=sys.argv[1:]; remaining=iter(args); command=None; tail=[]
for argument in remaining:
 if argument in ['-C','-c','--git-dir','--work-tree','--namespace']:next(remaining,None)
 elif not argument.startswith('-'):command=argument;tail=list(remaining);break
network=command in ['fetch','push','pull','clone'] or (command=='ls-remote' and '--get-url' not in tail) or (command=='remote' and any(value in tail for value in ['update','prune','-f','--fetch']))
if network:
 import json
 with open(os.environ['PUBLISH_GIT_WATCH'],'a') as log:
  log.write(json.dumps({'command':command,'get_url':'--get-url' in tail})+'\n')
os.execv(str(Path(__file__).with_name('git-read-only')),[str(Path(__file__).with_name('git-read-only')),*sys.argv[1:]])
''')
        git.chmod(0o700); self.git_watch=root/'network-git-attempted'; self.env['PUBLISH_GIT_WATCH']=str(self.git_watch)

    def cli_publish(self,fixture,*args,fail=False):
        command=[str(BINARY),'--config',str(self.registry),'-C',str(fixture.path),'publish',*args]
        result=subprocess.run(command,env=self.env,capture_output=True,text=True,timeout=90)
        self.assert_clean(result.stdout+result.stderr)
        if fail:
            assert result.returncode!=0,(args,result.stdout)
            return result
        assert result.returncode==0,(args,result.stderr)
        return json.loads(result.stdout)

    def configure_create(self,*,org=False,**changes):
        self.configure(organizations={'alicecase':[{'login':'ExampleOrg','id':987}]})
        for path in [self.post_log,self.post_started,self.post_release,self.final_org]: path.unlink(missing_ok=True)
        owner='ExampleOrg' if org else 'alicecase'; owner_id=987 if org else 101
        response={'id':8001,'name':'example-repo','full_name':owner+'/example-repo',
                  'owner':{'login':owner,'id':owner_id},'html_url':'https://github.com/'+owner+'/example-repo',
                  'clone_url':'https://github.com/'+owner+'/example-repo.git','private':True}
        self.update(post_response=response,**changes)

    def posts(self):
        return [json.loads(line) for line in self.post_log.read_text().splitlines()] if self.post_log.exists() else []

    def start_create(self,f,review,*,owner='alicecase'):
        child=subprocess.Popen([str(BINARY),'--config',str(self.registry),'-C',str(f.path),'repo','-'],
                               env=self.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        child.stdin.write(json.dumps({'method':'publish_create','request':request(owner=owner),'basis':review['basis'],'acknowledge_partial':True}))
        child.stdin.close(); child.stdin=None
        return child


def create(s,f,review,*,owner='alicecase',fail=False):
    return s.request(f,'publish_create',request=request(owner=owner),basis=review['basis'],acknowledge_partial=True,fail=fail,timeout=90)


def setup(s,name,*,org=False,**changes):
    s.configure_create(org=org,**changes); f=s.local(name)
    (f.path/'file').write_text('first commit\n'); f.commit()
    owner='ExampleOrg' if org else 'alicecase'
    review=preview(s,f,request(owner=owner))
    return f,review,owner


def receipts(s,f):
    repository_id=digest(os.fsencode(f.path))
    return [entry for entry in json.loads(s.registry.read_text()).get('publication_intents',[])
            if entry['repository_id']==repository_id]


def git_snapshot(s,f): return snapshot(s,f)[:-1]


def call_and_observe(s,f,review,owner):
    command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
    payload={'method':'publish_create','request':request(owner=owner),'basis':review['basis'],'acknowledge_partial':True}
    result=subprocess.run(command,input=json.dumps(payload),env=s.env,capture_output=True,text=True,timeout=90)
    s.assert_clean(result.stdout+result.stderr)
    if result.returncode==0:
        assert json.loads(result.stdout)['phase']=='creation_unknown'
    return result


def successful_creation(s,org):
    f,review,owner=setup(s,'org creation' if org else 'personal creation',org=org)
    before=git_snapshot(s,f)
    s.request(f,'publish_create',request=request(owner=owner),basis=review['basis'],
              acknowledge_partial=False,fail=True)
    assert not s.posts() and not receipts(s,f)
    cli_args=['create','--login','AliceCase','--owner',owner,'--name','example-repo',
              '--description',' exact description\n','--basis',review['basis']]
    s.cli_publish(f,*cli_args,fail=True)
    assert not s.posts() and not receipts(s,f)
    result=create(s,f,review,owner=owner) if org else s.cli_publish(f,*cli_args,'--acknowledge-partial')
    assert result['phase']=='created' and result['receipt_id']
    rows=history(s,f)['receipts']; assert len(rows)==1 and rows[0]['phase']=='created'
    forged,record=synthetic(s,f,phase='complete')
    duplicate=forged.with_name(result['receipt_id']+'.json')
    forged.rename(duplicate); record['id']=result['receipt_id']; private(duplicate,json.dumps(record))
    rows=history(s,f)['receipts']
    assert len(rows)==1 and rows[0]['id']==result['receipt_id'] and rows[0]['phase']=='created'
    duplicate.unlink()
    expected='/orgs/ExampleOrg/repos' if org else '/user/repos'
    assert s.posts()==[{'endpoint':expected,'name':'example-repo','description':' exact description\n','private':True,'pinned':True}]
    assert len(receipts(s,f))==1 and s.registry.stat().st_mode & 0o077==0
    assert git_snapshot(s,f)==before and not s.git_watch.exists()
    create(s,f,review,owner=owner,fail=True)
    assert len(s.posts())==1 and git_snapshot(s,f)==before
    s.request(f,'acknowledge_publish',receipt_id=result['receipt_id'])
    assert not preview(s,f,request(owner=owner))['can_create']
    s.cli('repositories','forget',f.path); s.cli('repositories','add',f.path)
    assert history(s,f)['receipts'][0]['phase']=='created'
    assert not preview(s,f,request(owner=owner))['can_create'] and len(s.posts())==1
    print('PASS: '+('organization' if org else 'personal')+' creation uses one fixed POST and cannot replay',flush=True)


def effective_creation(s):
    s.configure_create(); f=s.local('effective account create')
    (f.path/'file').write_text('first commit\n'); f.commit()
    owner='environment-user'; response=copy.deepcopy(s.data['post_response'])
    response.update(full_name=owner+'/example-repo',owner={'login':owner,'id':303},
                    html_url='https://github.com/'+owner+'/example-repo',
                    clone_url='https://github.com/'+owner+'/example-repo.git')
    s.update(post_actor='effective',post_response=response)
    value=request(target=EFFECTIVE,owner=owner)
    review=preview(s,f,value); assert review['actor']['id']==303
    result=s.cli_publish(f,'create','--effective','--owner',owner,'--name','example-repo',
                         '--description',' exact description\n','--basis',review['basis'],'--acknowledge-partial')
    assert result['phase']=='created' and len(s.posts())==1 and s.posts()[0]['pinned']
    assert history(s,f)['receipts'][0]['phase']=='created'
    print('PASS: effective GH_TOKEN is pinned for creation despite different stored account',flush=True)


def wait_for_child(s,child,marker,label):
    try:
        wait_for(lambda:marker.exists() or child.poll() is not None,label,timeout=45)
    except AssertionError:
        child.send_signal(signal.SIGINT)
        out,err=child.communicate(timeout=15); s.assert_clean(out+err)
        raise AssertionError((label,'timed out',child.returncode,out,err))
    if not marker.exists():
        out,err=child.communicate(timeout=15); s.assert_clean(out+err)
        raise AssertionError((label,'child exited early',child.returncode,out,err))


def in_flight_cancellation(s):
    f,review,owner=setup(s,'cancel creation',post_gate=True)
    before=git_snapshot(s,f); child=s.start_create(f,review,owner=owner)
    try:
        wait_for_child(s,child,s.post_started,'fake provider did not record the POST')
        files=receipts(s,f); assert len(files)==1
        stored=files[0]; assert stored['phase']=='creation_unknown'
        assert s.registry.stat().st_mode & 0o077==0
        assert history(s,f)['receipts'][0]['phase']=='creation_unknown'
        child.send_signal(signal.SIGINT)
        out,err=child.communicate(timeout=20); s.assert_clean(out+err)
        assert child.returncode!=0 and not out.strip(),(child.returncode,out,err)
        assert history(s,f)['receipts'][0]['phase']=='creation_unknown'
        assert len(s.posts())==1 and git_snapshot(s,f)==before
        create(s,f,review,owner=owner,fail=True)
        assert len(s.posts())==1 and git_snapshot(s,f)==before
    finally:
        s.post_release.write_text('release'); stop(child)
    print('PASS: durable uncertainty precedes POST and cancellation never replays',flush=True)


def failed_provider(s):
    f,review,owner=setup(s,'failed provider',post_failure=True)
    before=git_snapshot(s,f); call_and_observe(s,f,review,owner)
    assert len(s.posts())==1 and history(s,f)['receipts'][0]['phase']=='creation_unknown'
    create(s,f,review,owner=owner,fail=True)
    assert len(s.posts())==1 and git_snapshot(s,f)==before
    print('PASS: provider failure and token diagnostics retain unknown outcome and prevent replay',flush=True)


def malformed_responses(s):
    mutations=[('wrong id',lambda x:x.update(id=9007199254740992)),
               ('wrong owner id',lambda x:x['owner'].update(id=999)),
               ('wrong full name',lambda x:x.update(full_name='other/example-repo')),
               ('host redirect',lambda x:x.update(html_url='https://private.invalid/alicecase/example-repo')),
               ('token url',lambda x:x.update(clone_url='https://github.com/alicecase/example-repo.git?token=synthetic-assigned-alice-private'))]
    for label,mutate in mutations:
        f,review,owner=setup(s,'bad response '+label)
        value=copy.deepcopy(s.data['post_response']); mutate(value); s.update(post_response=value)
        before=git_snapshot(s,f); call_and_observe(s,f,review,owner)
        assert len(s.posts())==1 and history(s,f)['receipts'][0]['phase']=='creation_unknown'
        assert git_snapshot(s,f)==before
        create(s,f,review,owner=owner,fail=True); assert len(s.posts())==1
    print('PASS: invalid or credential-bearing responses remain unknown and cannot replay',flush=True)


def concurrent_creation(s):
    f,review,owner=setup(s,'concurrent create',post_gate=True)
    before=git_snapshot(s,f); first=s.start_create(f,review,owner=owner)
    second=None
    try:
        wait_for_child(s,first,s.post_started,'first POST did not begin')
        assert receipts(s,f)[0]['phase']=='creation_unknown'
        second=s.start_create(f,review,owner=owner)
        s.post_release.write_text('release')
        out,err=first.communicate(timeout=30); s.assert_clean(out+err)
        assert first.returncode==0 and json.loads(out)['phase']=='created',(out,err)
        out,err=second.communicate(timeout=30); s.assert_clean(out+err)
        assert second.returncode!=0 and not out.strip(),(out,err)
        assert len(s.posts())==1 and git_snapshot(s,f)==before
    finally:
        s.post_release.write_text('release'); stop(first)
        if second is not None: stop(second)
    print('PASS: concurrent create attempts make at most one POST',flush=True)


def preflight_races(s):
    for label in ['remote','actor','account']:
        f,review,owner=setup(s,'preflight race '+label)
        s.update(delay_org_page=1)
        child=s.start_create(f,review,owner=owner)
        try:
            wait_for_child(s,child,s.started,'preflight org query did not begin')
            if label=='remote': f.git('remote','add','upstream','https://github.com/fork/repo.git')
            elif label=='actor':
                users=copy.deepcopy(s.data['users']); users['AliceCase']['id']=999
                s.update(users=users)
            else:
                with open(s.registry.with_suffix('.lock'),'a+b') as guard:
                    fcntl.flock(guard,fcntl.LOCK_EX)
                    data=json.loads(s.registry.read_text())
                    record=next(row for row in data['records'] if row['path']==str(f.path))
                    record['account']['assignment']={'mode':'none'}
                    record['account']['association']=None
                    record['account']['source_remote']=None
                    record['account']['revision']+=1
                    private(s.registry,json.dumps(data))
                    fcntl.flock(guard,fcntl.LOCK_UN)
            retained=git_snapshot(s,f)
            s.release.write_text('release')
            out,err=child.communicate(timeout=25); s.assert_clean(out+err)
            assert child.returncode!=0 and not out.strip(),(label,out,err)
            assert not s.posts() and not receipts(s,f) and git_snapshot(s,f)==retained
        finally:
            s.release.write_text('release'); stop(child)
    print('PASS: remote, actor and account changes before POST are rejected',flush=True)


def final_organization_race(s):
    f,review,owner=setup(s,'organization changed after receipt',org=True)
    s.clear_calls(); s.update(final_org_gate=True)
    child=s.start_create(f,review,owner=owner)
    try:
        wait_for_child(s,child,s.final_org,'final organization verification did not begin')
        assert receipts(s,f)[0]['phase']=='creation_unknown'
        s.update(organizations={'alicecase':[{'login':'ExampleOrg','id':999}]})
        s.post_release.write_text('release')
        out,err=child.communicate(timeout=35); s.assert_clean(out+err)
        assert child.returncode==0 and json.loads(out)['phase']=='creation_unknown',(out,err)
        assert not s.posts() and history(s,f)['receipts'][0]['phase']=='creation_unknown'
    finally:
        s.post_release.write_text('release'); stop(child)
    print('PASS: organization identity change after durable intent blocks POST',flush=True)


def related_worktrees_and_relocation(s):
    f,review,owner=setup(s,'ledger linked worktree',post_failure=True)
    call_and_observe(s,f,review,owner)
    assert len(s.posts())==1 and receipts(s,f)[0]['phase']=='creation_unknown'
    linked=s.root/'linked publish worktree'
    f.git('worktree','add','-qb','linked',str(linked))
    s.cli('repositories','add',linked)
    other=copy.copy(f); other.path=linked
    assert not preview(s,other,request(owner=owner))['can_create']
    assert history(s,other)['receipts'][0]['phase']=='creation_unknown' and len(s.posts())==1

    g,review,owner=setup(s,'ledger moved repo',post_failure=True)
    call_and_observe(s,g,review,owner)
    old=g.path; moved=s.root/'ledger moved destination'; old.rename(moved)
    data=json.loads(s.registry.read_text())
    data['repositories']=[str(moved) if path==str(old) else path for path in data['repositories']]
    if data.get('selected')==str(old): data['selected']=str(moved)
    for row in data['records']:
        if row['path']==str(old): row['path']=str(moved)
    private(s.registry,json.dumps(data)); g.path=moved
    assert not preview(s,g,request(owner=owner))['can_create']
    assert history(s,g)['receipts'][0]['phase']=='creation_unknown' and len(s.posts())==1
    print('PASS: receipt blocks linked worktrees and relocation of same saved record',flush=True)


def physical_repository_replacement(s):
    for kind in ['gitdir','worktree']:
        f,review,owner=setup(s,'physical replacement '+kind)
        before=snapshot(s,f)
        replacement=s.root/('replacement '+kind); backup=s.root/('replaced '+kind)
        shutil.copytree(f.path,replacement,symlinks=True)
        s.update(delay_org_page=1)
        child=s.start_create(f,review,owner=owner)
        try:
            wait_for_child(s,child,s.started,'physical replacement preflight did not begin')
            if kind=='gitdir':
                (f.path/'.git').rename(backup)
                (replacement/'.git').rename(f.path/'.git')
            else:
                f.path.rename(backup); replacement.rename(f.path)
            assert snapshot(s,f)==before
            s.release.write_text('release')
            out,err=child.communicate(timeout=30); s.assert_clean(out+err)
            assert child.returncode!=0 and not out.strip(),(kind,out,err)
            assert not s.posts() and not receipts(s,f) and snapshot(s,f)==before
        finally:
            s.release.write_text('release'); stop(child)
    print('PASS: replacing worktree or Git directory with identical content blocks POST',flush=True)


def unsafe_registries(s):
    s.configure_create(); f=s.local('unsafe registry',saved=False)
    (f.path/'file').write_text('commit\n'); f.commit()
    for label,config in [('worktree',f.path/'metadata'/'registry.json'),
                         ('gitdir',f.path/'.git'/'unsafe'/'registry.json')]:
        s.cli('repositories','add',f.path,config=config)
        command=[str(BINARY),'--config',str(config),'-C',str(f.path),'repo','-']
        result=subprocess.run(command,input=json.dumps({'method':'publish_preview','request':request()}),
                              env=s.env,capture_output=True,text=True,timeout=30)
        s.assert_clean(result.stdout+result.stderr)
        assert result.returncode==0,(label,result.stderr)
        plan=json.loads(result.stdout); assert not plan['can_create']
        result=subprocess.run(command,input=json.dumps({'method':'publish_create','request':request(),
                              'basis':plan['basis'],'acknowledge_partial':True}),env=s.env,
                              capture_output=True,text=True,timeout=30)
        s.assert_clean(result.stdout+result.stderr)
        assert result.returncode!=0 and not s.posts()
    real=s.root/'outside-registry'; real.mkdir(mode=0o700)
    link=s.root/'registry-alias'; link.symlink_to(real,target_is_directory=True)
    config=link/'registry.json'; s.cli('repositories','add',f.path,config=config)
    command=[str(BINARY),'--config',str(config),'-C',str(f.path),'repo','-']
    result=subprocess.run(command,input=json.dumps({'method':'publish_preview','request':request()}),
                          env=s.env,capture_output=True,text=True,timeout=30)
    s.assert_clean(result.stdout+result.stderr)
    assert result.returncode==0 and not json.loads(result.stdout)['can_create'] and not s.posts()
    linked=s.root/'unsafe linked worktree'
    f.git('worktree','add','-qb','unsafe-linked',str(linked))
    config=f.path/'.git'/'common-registry'/'registry.json'
    s.cli('repositories','add',linked,config=config)
    command=[str(BINARY),'--config',str(config),'-C',str(linked),'repo','-']
    result=subprocess.run(command,input=json.dumps({'method':'publish_preview','request':request()}),
                          env=s.env,capture_output=True,text=True,timeout=30)
    s.assert_clean(result.stdout+result.stderr)
    assert result.returncode==0 and not json.loads(result.stdout)['can_create'] and not s.posts()
    print('PASS: registry in worktree, gitdir, common-dir or symlink path cannot authorize creation',flush=True)


def stale_review(s):
    f,review,owner=setup(s,'stale review')
    f.git('remote','add','upstream','https://github.com/fork/repo.git')
    before=git_snapshot(s,f); create(s,f,review,owner=owner,fail=True)
    assert not s.posts() and not receipts(s,f) and git_snapshot(s,f)==before
    print('PASS: stale review is rejected before a POST or receipt',flush=True)


def main():
    home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-create-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=CreateFixture(root)
        for check in [lambda s:successful_creation(s,False),lambda s:successful_creation(s,True),effective_creation,
                      in_flight_cancellation,failed_provider,malformed_responses,stale_review,concurrent_creation,preflight_races,final_organization_race,related_worktrees_and_relocation,physical_repository_replacement,unsafe_registries]:
            check(s)
        assert not s.git_watch.exists() and os.environ.get('HOME')==home
    print('PASS: synthetic publication POST, durable uncertainty and no replay',flush=True)


if __name__=='__main__': main()
