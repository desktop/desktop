"""Offline verification of an existing, durably recorded GitHub repository."""
import base64
import copy
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

from discard_advanced import BINARY
from publish_context import snapshot
from publish_create import CreateFixture, call_and_observe, create, setup, wait_for_child
from repository_accounts import EFFECTIVE
from publish_receipts import history, synthetic
from repository_context import private, stop


def continuing(s,f,receipt_id,**kwargs):
    return s.request(f,'publish_continue_preview',receipt_id=receipt_id,timeout=35,**kwargs)


def prepare(s,name,*,org=False):
    f,review,owner=setup(s,name,org=org)
    result=create(s,f,review,owner=owner)
    assert result['phase']=='created'
    response=copy.deepcopy(s.data['post_response'])
    endpoint='/repos/'+owner.lower()+'/example-repo'
    s.update(repository_responses={endpoint:response})
    s.clear_calls()
    return f,result['receipt_id'],owner,endpoint,response


def assert_get_only(s,endpoint):
    calls=s.calls()
    api=[row for row in calls if row.get('kind')=='api' and row.get('args',[])[-1:]==[endpoint]]
    assert api and all(row['pinned'] for row in api)
    assert not any('POST' in row.get('args',[]) for row in calls)
    assert len(s.posts())==1 and not s.git_watch.exists()


def success_and_response_validation(s):
    f,receipt,owner,endpoint,response=prepare(s,'continuation personal')
    before=snapshot(s,f)
    result=continuing(s,f,receipt)
    assert result['phase']=='created' and result['basis'] and result['can_continue'] is False
    assert result['url']=='https://github.com/alicecase/example-repo'
    assert result['actor']=={'login':'alicecase','id':101}
    assert result['owner']=={'login':'alicecase','id':101} and result['private'] is True
    assert result['reason'] and history(s,f)['receipts'][0]['url'] is None
    assert s.cli_publish(f,'continue-preview',receipt)==result
    assert snapshot(s,f)==before
    assert_get_only(s,endpoint)
    changes=[('repo id',lambda value:value.update(id=8002)),
             ('owner id',lambda value:value['owner'].update(id=777)),
             ('full name',lambda value:value.update(full_name='other/example-repo')),
             ('html host',lambda value:value.update(html_url='https://attacker.invalid/alicecase/example-repo')),
             ('token URL',lambda value:value.update(clone_url='https://github.com/alicecase/example-repo.git?token=synthetic-assigned-alice-private'))]
    for label,mutate in changes:
        changed=copy.deepcopy(response); mutate(changed)
        s.update(repository_responses={endpoint:changed})
        continuing(s,f,receipt,fail=True)
        assert snapshot(s,f)==before and len(s.posts())==1,label
    s.update(repository_responses={endpoint:{**response,'private':False}})
    public=continuing(s,f,receipt)
    assert public['private'] is False and public['basis']!=result['basis']
    assert snapshot(s,f)==before and len(s.posts())==1
    print('PASS: GET verifies personal repository identity and CLI/RPC return current visibility',flush=True)


def effective_continuation(s):
    s.configure_create(); f=s.local('effective continuation')
    (f.path/'file').write_text('base\n'); f.commit()
    owner='environment-user'; endpoint='/repos/environment-user/example-repo'
    response=copy.deepcopy(s.data['post_response'])
    response.update(full_name=owner+'/example-repo',owner={'login':owner,'id':303},
                    html_url='https://github.com/'+owner+'/example-repo',
                    clone_url='https://github.com/'+owner+'/example-repo.git')
    s.update(post_actor='effective',post_response=response,repository_responses={endpoint:response})
    from publish_preview import preview, request
    proposal=request(target=EFFECTIVE,owner=owner); review=preview(s,f,proposal)
    created=s.request(f,'publish_create',request=proposal,basis=review['basis'],acknowledge_partial=True)
    assert created['phase']=='created'
    before=snapshot(s,f); s.clear_calls()
    result=continuing(s,f,created['receipt_id'])
    assert result['actor']=={'login':owner,'id':303} and result['owner']=={'login':owner,'id':303}
    assert result['url']=='https://github.com/environment-user/example-repo'
    calls=[row for row in s.calls() if row.get('kind')=='api' and row.get('args',[])[-1:]==[endpoint]]
    assert calls and all(row['actor']==owner and row['pinned'] for row in calls)
    actor=copy.deepcopy(s.data['environment']); actor['id']=304
    s.update(environment=actor); s.clear_calls()
    continuing(s,f,created['receipt_id'],fail=True)
    assert not [row for row in s.calls() if row.get('kind')=='api' and row.get('args',[])[-1:]==[endpoint]]
    assert snapshot(s,f)==before and len(s.posts())==1
    print('PASS: effective GH_TOKEN continuation is pinned and actor identity changes are refused',flush=True)


def organization_and_actor_fences(s):
    f,receipt,owner,endpoint,response=prepare(s,'continuation organization',org=True)
    before=snapshot(s,f)
    result=continuing(s,f,receipt)
    assert result['owner']=={'login':'ExampleOrg','id':987}
    assert result['url']=='https://github.com/ExampleOrg/example-repo'
    assert_get_only(s,endpoint)
    users=copy.deepcopy(s.data['users']); users['AliceCase']['id']=999
    s.update(users=users); s.clear_calls()
    continuing(s,f,receipt,fail=True)
    assert not [row for row in s.calls() if row.get('kind')=='api' and row.get('args',[])[-1:]==[endpoint]]
    users['AliceCase']['id']=101
    s.update(users=users,organizations={'alicecase':[{'login':'ExampleOrg','id':999}]}); s.clear_calls()
    continuing(s,f,receipt,fail=True)
    assert not [row for row in s.calls() if row.get('kind')=='api' and row.get('args',[])[-1:]==[endpoint]]
    assert snapshot(s,f)==before and len(s.posts())==1
    print('PASS: actor and organization identity changes fail before repository GET',flush=True)


def secret_identity_never_persisted(s):
    s.configure_create(); f=s.local('secret identity')
    (f.path/'file').write_text('base\n'); f.commit()
    token='SyntheticAlphaToken123456'
    users=copy.deepcopy(s.data['users']); users['AliceCase']['token']=token
    s.update(users=users)
    before=snapshot(s,f)
    from publish_preview import preview, request
    from publish_create import receipts
    for name in [token,base64.b64encode(token.encode()).decode().rstrip('=')]:
        proposal=request(name=name); review=preview(s,f,proposal)
        s.request(f,'publish_create',request=proposal,basis=review['basis'],acknowledge_partial=True,fail=True)
        assert not s.posts() and not receipts(s,f) and snapshot(s,f)==before
        assert token not in s.registry.read_text()
    print('PASS: token-like name cannot enter durable identity or reach POST',flush=True)


def unverified_and_account(s):
    s.configure_create(post_failure=True); f=s.local('unknown continuation')
    (f.path/'file').write_text('base\n'); f.commit()
    from publish_preview import preview, request
    review=preview(s,f,request()); call_and_observe(s,f,review,'alicecase')
    row=history(s,f)['receipts'][0]; assert row['phase']=='creation_unknown'
    before=snapshot(s,f); s.clear_calls()
    continuing(s,f,row['id'],fail=True)
    assert not [call for call in s.calls() if call.get('kind')=='api']
    assert snapshot(s,f)==before and len(s.posts())==1
    s.configure_create(); old=s.local('untrusted legacy receipt')
    file,record=synthetic(s,old,phase='created'); old_before=snapshot(s,old); s.clear_calls()
    continuing(s,old,record['id'],fail=True)
    assert not [call for call in s.calls() if call.get('kind')=='api'] and snapshot(s,old)==old_before
    f,receipt,owner,endpoint,response=prepare(s,'account disabled continuation')
    s.assign(f,{'mode':'none'}); after=snapshot(s,f); s.clear_calls()
    continuing(s,f,receipt,fail=True)
    assert not [call for call in s.calls() if call.get('kind')=='api'] and snapshot(s,f)==after
    print('PASS: unknown and legacy receipts and changed account cannot be adopted',flush=True)


def change_during_get(s,label,change):
    f,receipt,owner,endpoint,response=prepare(s,'continuation race '+label)
    s.update(delay={'kind':'api','endpoint':endpoint})
    command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
    child=subprocess.Popen(command,env=s.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    child.stdin.write(json.dumps({'method':'publish_continue_preview','receipt_id':receipt}))
    child.stdin.close(); child.stdin=None
    try:
        wait_for_child(s,child,s.started,'repository GET did not begin')
        change(s,f)
        retained=snapshot(s,f)
        s.release.write_text('release')
        out,err=child.communicate(timeout=25); s.assert_clean(out+err)
        assert child.returncode!=0 and not out.strip(),(label,out,err)
        assert snapshot(s,f)==retained and len(s.posts())==1
    finally:
        s.release.write_text('release'); stop(child)


def racing_changes(s):
    change_during_get(s,'origin',lambda s,f:f.git('remote','add','origin','https://github.com/other/repo.git'))
    change_during_get(s,'config',lambda s,f:f.git('config','branch.main.merge','refs/heads/other'))
    change_during_get(s,'HEAD',lambda s,f:f.git('switch','-qc','another'))
    def record(s,f):
        with open(s.registry.with_suffix('.lock'),'a+b') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            data=json.loads(s.registry.read_text())
            next(row for row in data['records'] if row['path']==str(f.path))['id']=str(uuid.uuid4())
            private(s.registry,json.dumps(data)); fcntl.flock(lock,fcntl.LOCK_UN)
    change_during_get(s,'record',record)
    print('PASS: remote, config, HEAD and record changes during repository GET reject stale review',flush=True)


def main():
    home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-continue-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=CreateFixture(root)
        for check in [success_and_response_validation,effective_continuation,organization_and_actor_fences,secret_identity_never_persisted,unverified_and_account,racing_changes]:
            check(s)
        assert not s.git_watch.exists() and os.environ.get('HOME')==home
    print('PASS: verified continuation never mutates Git or retries creation',flush=True)


if __name__=='__main__': main()
