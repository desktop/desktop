"""Offline, read-only review of publication and its state witnesses."""
import copy
import json
import os
from pathlib import Path
import tempfile

from publish_context import PublishFixture, snapshot
from repository_accounts import EFFECTIVE, NAMED, NONE
from repository_context import private, stop


def request(target=NAMED, owner='alicecase', **overrides):
    return {'host':'github.com','target':target,'owner':owner,'name':'example-repo',
            'description':' exact description\n','private':True,**overrides}


def preview(s, f, value=None, **kwargs):
    return s.request(f,'publish_preview',request=value or request(),**kwargs)


def setup(s, name, *, committed=True, saved=True, **changes):
    s.configure(organizations={'alicecase':[{'login':'ExampleOrg','id':987}],
                               'environment-user':[{'login':'EffectiveOrg','id':654}]},**changes)
    f=s.local(name,saved=saved)
    if committed:
        (f.path/'file').write_text('first commit\n'); f.commit()
    return f


def check_read_only_calls(s):
    # The test gh implementation has no mutating endpoint; assert that even an
    # attempted mutation is visible rather than silently accepted by the stub.
    for row in s.calls():
        args=row.get('args',[])
        assert not any(value in args for value in ['POST','PATCH','PUT','DELETE','--input','-f','-F']), args


def personal_and_organization(s):
    f=setup(s,'personal and organization')
    before=snapshot(s,f); s.clear_calls()
    personal=preview(s,f)
    assert personal['can_apply'] is False and personal['reason']
    assert personal['actor']=={'login':'alicecase','id':101}
    assert personal['owner']=={'login':'alicecase','id':101,'kind':'personal'}
    assert personal['push_status']=='planned'
    assert len(personal['pushes'])==1
    assert personal['pushes'][0]['branch']=='main'
    assert personal['pushes'][0]['oid']==f.git('rev-parse','HEAD').stdout.decode().strip()
    assert personal['basis'] and snapshot(s,f)==before
    cli=s.cli_publish(f,'preview','--host','github.com','--login','AliceCase',
                      '--owner','alicecase','--name','example-repo','--description',' exact description\n')
    assert cli==personal
    organization=preview(s,f,request(owner='ExampleOrg'))
    assert organization['owner']=={'login':'ExampleOrg','id':987,'kind':'organization'}
    assert organization['actor']==personal['actor'] and organization['basis']!=personal['basis']
    assert preview(s,f,request(owner='ExampleOrg'))['basis']==organization['basis']
    for change in [{'name':'other-repo'},{'private':False},{'description':'exact description'}]:
        assert preview(s,f,request(owner='ExampleOrg',**change))['basis']!=organization['basis']
    effective=preview(s,f,request(target=EFFECTIVE,owner='EffectiveOrg'))
    assert effective['actor']=={'login':'environment-user','id':303}
    assert effective['owner']=={'login':'EffectiveOrg','id':654,'kind':'organization'}
    cli=s.cli_publish(f,'preview','--host','github.com','--effective','--owner','EffectiveOrg',
                      '--name','example-repo','--description',' exact description\n')
    assert cli==effective
    public=preview(s,f,request(target=EFFECTIVE,owner='EffectiveOrg',private=False))
    assert s.cli_publish(f,'preview','--effective','--owner','EffectiveOrg','--name','example-repo',
                         '--description',' exact description\n','--public')==public
    preview(s,f,request(owner='MissingOrg'),fail=True)
    assert snapshot(s,f)==before
    check_read_only_calls(s)
    print('PASS: personal/organization owner identity, immutable requests and no writes',flush=True)


def head_states(s):
    f=setup(s,'unborn',committed=False); before=snapshot(s,f)
    value=preview(s,f)
    assert value['push_status']=='unborn' and value['pushes']==[] and snapshot(s,f)==before
    g=setup(s,'detached')
    g.git('switch','--detach','-q'); before=snapshot(s,g)
    value=preview(s,g)
    assert value['push_status']=='detached' and value['pushes']==[] and snapshot(s,g)==before
    h=setup(s,'branch pushes')
    h.git('branch','feature'); h.git('switch','-q','feature')
    (h.path/'file').write_text('feature commit\n'); h.commit(); before=snapshot(s,h)
    value=preview(s,h)
    assert value['push_status']=='planned'
    assert value['pushes'][-1]['branch']=='feature'
    assert value['pushes'][-1]['oid']==h.git('rev-parse','HEAD').stdout.decode().strip()
    assert snapshot(s,h)==before
    k=setup(s,'tracked default branch')
    k.git('branch','tracked')
    k.git('remote','add','upstream','https://github.com/fork/repo.git')
    tip=k.git('rev-parse','tracked').stdout.decode().strip()
    k.git('update-ref','refs/remotes/upstream/stable',tip)
    k.git('symbolic-ref','refs/remotes/upstream/HEAD','refs/remotes/upstream/stable')
    k.git('config','branch.tracked.remote','upstream')
    k.git('config','branch.tracked.merge','refs/heads/stable')
    before=snapshot(s,k); value=preview(s,k)
    assert value['push_status']=='planned'
    assert [(p['branch'],p['role']) for p in value['pushes']]==[('tracked','default'),('main','current')]
    assert value['pushes'][0]['oid']==tip and snapshot(s,k)==before
    check_read_only_calls(s)
    print('PASS: unborn, detached, tracking default and current branch planning is read-only',flush=True)


def invalid_local_state(s):
    f=setup(s,'unsaved preview',saved=False); before=snapshot(s,f)
    preview(s,f,fail=True); assert snapshot(s,f)==before
    g=setup(s,'existing origin'); g.git('remote','add','origin','https://github.com/fork/repo.git')
    before=snapshot(s,g); preview(s,g,fail=True); assert snapshot(s,g)==before
    h=setup(s,'no account'); before=snapshot(s,h)
    preview(s,h,request(target=NONE),fail=True); assert snapshot(s,h)==before
    check_read_only_calls(s)
    print('PASS: unsaved, preexisting origin and no-account previews rejected',flush=True)


def basis_changes(s):
    f=setup(s,'basis changes')
    before=snapshot(s,f); first=preview(s,f,request(owner='ExampleOrg'))['basis']
    f.git('config','branch.main.merge','refs/heads/alternate')
    after_config=snapshot(s,f); second=preview(s,f,request(owner='ExampleOrg'))['basis']
    assert second!=first and snapshot(s,f)==after_config
    f.git('remote','add','upstream','https://github.com/fork/repo.git')
    after_remote=snapshot(s,f); third=preview(s,f,request(owner='ExampleOrg'))['basis']
    assert third!=second and snapshot(s,f)==after_remote
    (f.path/'file').write_text('second commit\n'); f.commit()
    after_head=snapshot(s,f); fourth=preview(s,f,request(owner='ExampleOrg'))['basis']
    assert fourth!=third and snapshot(s,f)==after_head
    orgs=copy.deepcopy(s.data['organizations']); orgs['alicecase'][0]['id']=988
    s.update(organizations=orgs)
    fifth=preview(s,f,request(owner='ExampleOrg'))['basis']
    assert fifth!=fourth and snapshot(s,f)==after_head
    assert before!=after_config
    check_read_only_calls(s)
    print('PASS: basis binds configuration, remote, HEAD and organization ID',flush=True)


def change_during_read(s, label, change):
    f=setup(s,'race '+label,delay_org_page=1)
    child=s.start_rpc(f,'publish_preview',request=request(owner='ExampleOrg'))
    try:
        change(s,f)
        retained=snapshot(s,f)
        s.release.write_text('release')
        out,err=child.communicate(timeout=15)
        s.assert_clean(out+err)
        assert child.returncode!=0 and not out.strip(), (label,out,err)
        assert snapshot(s,f)==retained
    finally:
        s.release.write_text('release'); stop(child)
    check_read_only_calls(s)


def fences(s):
    change_during_read(s,'remote',lambda s,f:f.git('remote','add','upstream','https://github.com/fork/repo.git'))
    change_during_read(s,'config',lambda s,f:f.git('config','branch.main.merge','refs/heads/changed'))
    change_during_read(s,'HEAD',lambda s,f:f.git('switch','-qc','other'))
    change_during_read(s,'account',lambda s,f:s.assign(f,NONE))
    def remove_saved(s,f):
        registry=json.loads(s.registry.read_text())
        registry['records']=[r for r in registry['records'] if r['path']!=str(f.path)]
        private(s.registry,json.dumps(registry))
    change_during_read(s,'saved record',remove_saved)
    print('PASS: concurrent account, record, remote, HEAD and config changes rejected',flush=True)


def invalid_provider_ids(s):
    f=setup(s,'invalid github ids')
    before=snapshot(s,f)
    users=copy.deepcopy(s.data['users']); users['AliceCase']['id']=9007199254740992
    s.update(users=users)
    preview(s,f,request(owner='ExampleOrg'),fail=True)
    assert snapshot(s,f)==before
    users['AliceCase']['id']=101
    s.update(users=users,organizations={'alicecase':[{'login':'ExampleOrg','id':9007199254740992}]})
    preview(s,f,request(owner='ExampleOrg'),fail=True)
    assert snapshot(s,f)==before
    check_read_only_calls(s)
    print('PASS: actor and organization IDs beyond safe integer bounds rejected',flush=True)


def credential_reflection(s):
    f=setup(s,'credential reflection preview')
    token='SyntheticAlphaToken123456'
    users=copy.deepcopy(s.data['users']); users['AliceCase']['token']=token
    s.update(users=users,organizations={'alicecase':[{'login':token,'id':987}]})
    before=snapshot(s,f)
    preview(s,f,request(owner=token),fail=True)
    assert snapshot(s,f)==before
    s.update(org_fail_page=1)
    preview(s,f,request(owner=token),fail=True)
    assert snapshot(s,f)==before
    check_read_only_calls(s)
    print('PASS: provider credential reflection and errors never disclose credentials',flush=True)


def main():
    original_home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-preview-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=PublishFixture(root)
        for check in [personal_and_organization,head_states,invalid_local_state,basis_changes,fences,invalid_provider_ids,credential_reflection]:
            check(s)
        assert os.environ.get('HOME')==original_home
    print('PASS: publication preview binds identity and local state without mutations',flush=True)


if __name__=='__main__': main()
