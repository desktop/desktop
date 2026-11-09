"""Offline origin/account continuation, durable phases and recovery fences."""
import copy
import fcntl
import json
import os
import signal
import sys
from pathlib import Path
import subprocess
import tempfile
import uuid

from discard_advanced import BINARY
from publish_context import snapshot
from publish_create import CreateFixture, wait_for_child
from publish_continue import prepare
from repository_accounts import EFFECTIVE
from repository_context import hardlink, private, stop


class OriginFixture(CreateFixture):
    def cli_publish(self,fixture,*args,fail=False):
        command=[str(BINARY),'--config',str(self.registry),'-C',str(fixture.path),'publish',*args]
        result=subprocess.run(command,env=self.env,capture_output=True,text=True,timeout=180)
        self.assert_clean(result.stdout+result.stderr)
        if fail:
            assert result.returncode!=0,(args,result.stdout)
            return result
        assert result.returncode==0,(args,result.stderr)
        return json.loads(result.stdout)

    def __init__(self,root):
        super().__init__(root)
        gh=root/'bin/gh'; previous=root/'bin/gh-origin-underlying'; gh.rename(previous)
        gh.write_text(f'#!{sys.executable}\n' + r"""import os,sys,time
from pathlib import Path
args=sys.argv[1:]; marker=os.environ.get('ORIGIN_GATE_MARKER'); lock=os.environ.get('ORIGIN_GATE_LOCK')
endpoint=os.environ.get('ORIGIN_GATE_ENDPOINT')
if marker and lock and endpoint and args and args[-1]==endpoint and Path(lock).exists():
 Path(marker).write_text('locked GET')
 deadline=time.monotonic()+45
 while not Path(os.environ['ORIGIN_GATE_RELEASE']).exists() and time.monotonic()<deadline:time.sleep(.02)
os.execv(str(Path(__file__).with_name('gh-origin-underlying')),[str(Path(__file__).with_name('gh-origin-underlying')),*args])
""")
        gh.chmod(0o700)


def setup_origin(s,name,*,org=False):
    f,receipt,owner,endpoint,response=prepare(s,name,org=org)
    response={**response,'fork':False,'parent':None}
    s.update(repository_responses={endpoint:response})
    s.clear_calls()
    return f,receipt,owner,endpoint


def review(s,f,receipt,*,fail=False):
    return s.request(f,'publish_continue_preview',receipt_id=receipt,fail=fail,timeout=180)


def apply(s,f,receipt,basis,*,fail=False):
    return s.request(f,'publish_continue',receipt_id=receipt,basis=basis,
                     acknowledge_partial=True,fail=fail,timeout=180)


def phases(s,f):
    return [row['phase'] for row in s.request(f,'publish_history')['receipts']]


def no_new_network(s):
    assert len(s.posts())==1 and not s.git_watch.exists()
    assert not any('POST' in row.get('args',[]) for row in s.calls())


def success(s,org=False):
    f,receipt,owner,endpoint=setup_origin(s,'origin org' if org else 'origin personal',org=org)
    before=snapshot(s,f); context=review(s,f,receipt)
    assert context['can_continue'] is True and context['basis'] and context['phase']=='created'
    assert s.cli_publish(f,'continue-preview',receipt)==context
    rejected=s.request(f,'publish_continue',receipt_id=receipt,basis=context['basis'],
                       acknowledge_partial=False,fail=True,timeout=180)
    s.cli_publish(f,'continue',receipt,'--basis',context['basis'],fail=True)
    assert snapshot(s,f)==before and phases(s,f)==['created']
    result=(s.cli_publish(f,'continue',receipt,'--basis',context['basis'],'--acknowledge-partial')
            if org else apply(s,f,receipt,context['basis']))
    assert result['phase']=='account_assigned' and result['receipt_id']==receipt
    assert phases(s,f)==['account_assigned']
    expected='https://github.com/'+owner+'/example-repo.git'
    assert f.git('config','--get','remote.origin.url').stdout.decode().strip()==expected
    assert f.git('config','--get-all','remote.origin.fetch').stdout.decode().strip()=='+refs/heads/*:refs/remotes/origin/*'
    account=s.account(f); assignment=account['assignment']
    assert assignment['mode']=='assigned' and assignment['id']==101
    assert assignment['host']=='github.com' and assignment['login'].lower()=='alicecase'
    assert account['scoped_metadata']
    after=snapshot(s,f); assert after[1:4]==before[1:4]
    apply(s,f,receipt,context['basis'],fail=True)
    assert snapshot(s,f)==after and phases(s,f)==['account_assigned']
    no_new_network(s)
    print('PASS: '+('organization' if org else 'personal')+' origin and account assigned once without pushing',flush=True)


def effective_account(s):
    s.configure_create(); f=s.local('origin effective account')
    (f.path/'file').write_text('base\n'); f.commit()
    owner='environment-user'; endpoint='/repos/environment-user/example-repo'
    response=copy.deepcopy(s.data['post_response'])
    response.update(full_name=owner+'/example-repo',owner={'login':owner,'id':303},
                    html_url='https://github.com/'+owner+'/example-repo',
                    clone_url='https://github.com/'+owner+'/example-repo.git',fork=False,parent=None)
    s.update(post_actor='effective',post_response=response,repository_responses={endpoint:response})
    from publish_preview import preview, request
    proposal=request(target=EFFECTIVE,owner=owner); original=preview(s,f,proposal)
    created=s.request(f,'publish_create',request=proposal,basis=original['basis'],acknowledge_partial=True,timeout=90)
    assert created['phase']=='created'; receipt=created['receipt_id']; s.clear_calls()
    context=review(s,f,receipt); assert context['can_continue']
    before=snapshot(s,f); result=apply(s,f,receipt,context['basis'])
    assert result['phase']=='account_assigned' and phases(s,f)==['account_assigned']
    assert s.account(f)['assignment']['mode']=='effective'
    assert f.git('config','--get','remote.origin.url').stdout.decode().strip()=='https://github.com/environment-user/example-repo.git'
    assert snapshot(s,f)[1:4]==before[1:4]
    no_new_network(s)
    print('PASS: effective GH_TOKEN continuation keeps effective account mode without pushing',flush=True)


def occupied_config_lock(s):
    f,receipt,owner,endpoint=setup_origin(s,'origin lock occupied')
    proposal=review(s,f,receipt); before=snapshot(s,f)
    lock=f.path/'.git/config.lock'; lock.write_bytes(b'other-operation-sentinel')
    result=apply(s,f,receipt,proposal['basis'])
    assert result['phase']=='origin_unknown' and phases(s,f)==['origin_unknown']
    assert lock.read_bytes()==b'other-operation-sentinel' and snapshot(s,f)[:4]==before[:4]
    lock.unlink(); retained=snapshot(s,f)
    apply(s,f,receipt,proposal['basis'],fail=True)
    assert snapshot(s,f)==retained and phases(s,f)==['origin_unknown']
    no_new_network(s)
    print('PASS: occupied Git config lock leaves unknown durable and never replays',flush=True)


def replaced_config_lock(s):
    f,receipt,owner,endpoint=setup_origin(s,'origin config lock replacement')
    proposal=review(s,f,receipt); before=snapshot(s,f)
    lock=f.path/'.git/config.lock'; parked=s.root/'original-config-lock'
    marker=s.root/'origin-lock-held'; release=s.root/'origin-lock-release'
    environment={**s.env,'ORIGIN_GATE_MARKER':str(marker),'ORIGIN_GATE_LOCK':str(lock),
                 'ORIGIN_GATE_ENDPOINT':endpoint,'ORIGIN_GATE_RELEASE':str(release)}
    command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
    child=subprocess.Popen(command,env=environment,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    child.stdin.write(json.dumps({'method':'publish_continue','receipt_id':receipt,'basis':proposal['basis'],
                                  'acknowledge_partial':True})); child.stdin.close(); child.stdin=None
    try:
        wait_for_child(s,child,marker,'origin lock was not held during verification GET')
        assert lock.is_file() and phases(s,f)==['origin_unknown']
        lock.rename(parked); lock.write_bytes(b'foreign-lock-sentinel')
        release.write_text('release')
        out,err=child.communicate(timeout=35); s.assert_clean(out+err)
        if child.returncode==0:
            assert json.loads(out)['phase']=='origin_unknown',(out,err)
        else: assert not out.strip(),(out,err)
        assert lock.read_bytes()==b'foreign-lock-sentinel'
        assert snapshot(s,f)[:4]==before[:4] and phases(s,f)==['origin_unknown']
        assert not f.git('remote').stdout.strip()
        no_new_network(s)
    finally:
        release.write_text('release'); stop(child)
    print('PASS: replaced config.lock is never committed or removed by prior holder',flush=True)


def symlink_config(s):
    f,receipt,owner,endpoint=setup_origin(s,'origin config symlink')
    proposal=review(s,f,receipt)
    config=f.path/'.git/config'; outside=s.root/'external-git-config'; original=config.read_bytes()
    outside.write_bytes(original); config.unlink(); config.symlink_to(outside)
    result=apply(s,f,receipt,proposal['basis'],fail=True)
    assert outside.read_bytes()==original and config.is_symlink()
    assert phases(s,f)==['created'] and not f.git('remote').stdout.strip()
    no_new_network(s)
    print('PASS: symlink Git config rejected without following for mutation',flush=True)


def hardlink_config(s):
    f,receipt,owner,endpoint=setup_origin(s,'origin config hardlink')
    proposal=review(s,f,receipt)
    config=f.path/'.git/config'; outside=s.root/'hardlinked-git-config'; original=config.read_bytes()
    try:
        hardlink(config,outside)
    except OSError as error:
        print('SKIP: hardlink not supported in this filesystem:',error.errno,flush=True)
        return
    before=snapshot(s,f)
    result=subprocess.run([str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-'],
                          env=s.env,input=json.dumps({'method':'publish_continue','receipt_id':receipt,
                              'basis':proposal['basis'],'acknowledge_partial':True}),
                          text=True,capture_output=True,timeout=90)
    s.assert_clean(result.stdout+result.stderr)
    if result.returncode==0:
        assert json.loads(result.stdout)['phase'] in ['created','origin_unknown']
    else: assert not result.stdout.strip()
    assert config.read_bytes()==original and outside.read_bytes()==original and snapshot(s,f)[:4]==before[:4]
    assert phases(s,f)[0] in ['created','origin_unknown']
    no_new_network(s)
    print('PASS: hardlinked Git config is never mutated through publication',flush=True)


def fifo_config(s):
    if not hasattr(os,'mkfifo'):
        print('SKIP: FIFO unavailable',flush=True); return
    for mode in ['rpc','cli']:
        f,receipt,owner,endpoint=setup_origin(s,'origin config FIFO '+mode)
        proposal=review(s,f,receipt)
        config=f.path/'.git/config'; original=config.read_bytes(); config.unlink(); os.mkfifo(config,0o600)
        prefix=[str(BINARY),'--config',str(s.registry),'-C',str(f.path)]
        command=(prefix+['repo','-'] if mode=='rpc' else prefix+['publish','continue',receipt,
                 '--basis',proposal['basis'],'--acknowledge-partial'])
        child=subprocess.Popen(command,env=s.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE,text=True,start_new_session=True)
        try:
            if mode=='rpc':
                child.stdin.write(json.dumps({'method':'publish_continue','receipt_id':receipt,
                                              'basis':proposal['basis'],'acknowledge_partial':True}))
            child.stdin.close(); child.stdin=None
            try:
                out,err=child.communicate(timeout=8)
            except subprocess.TimeoutExpired:
                child.send_signal(signal.SIGINT)
                try: out,err=child.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    stop(child); raise AssertionError(('FIFO config left blocked process',mode))
                raise AssertionError(('FIFO config did not fail promptly',mode,child.returncode,out,err))
            s.assert_clean(out+err)
            assert child.returncode!=0 and not out.strip(),(mode,child.returncode,out,err)
        finally:
            stop(child); config.unlink(); config.write_bytes(original)
        assert phases(s,f)==['created'] and not f.git('remote').stdout.strip()
        no_new_network(s)
    print('PASS: FIFO Git config fails promptly in direct CLI and RPC without mutation',flush=True)


def run_failfast(s,command,payload=None,environment=None):
    child=subprocess.Popen(command,env=environment or s.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE,text=True,start_new_session=True)
    try:
        if payload is not None: child.stdin.write(json.dumps(payload))
        child.stdin.close(); child.stdin=None
        try: out,err=child.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            child.send_signal(signal.SIGINT)
            try: out,err=child.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                stop(child); raise AssertionError('Unsafe Git configuration blocked continuation')
            raise AssertionError(('Unsafe Git configuration did not fail promptly',child.returncode,out,err))
        s.assert_clean(out+err)
        assert child.returncode!=0 and not out.strip(),(child.returncode,out,err)
        return err
    finally: stop(child)


def fifo_include(s):
    if not hasattr(os,'mkfifo'):
        print('SKIP: FIFO unavailable',flush=True); return
    for source in ['local','global']:
        f,receipt,owner,endpoint=setup_origin(s,'FIFO include '+source)
        proposal=review(s,f,receipt); config=f.path/'.git/config'; original=config.read_bytes()
        fifo=s.root/('git-include-fifo-'+source); os.mkfifo(fifo,0o600)
        unsafe=('[include]\n    path = '+str(fifo)+'\n').encode()
        global_path=Path(s.env['GIT_CONFIG_GLOBAL'])
        if source=='local': config.write_bytes(original+b'\n'+unsafe)
        else: private(global_path,unsafe)
        retained=config.read_bytes()
        prefix=[str(BINARY),'--config',str(s.registry),'-C',str(f.path)]
        try:
            run_failfast(s,prefix+['repo','-'],{'method':'publish_continue','receipt_id':receipt,
                         'basis':proposal['basis'],'acknowledge_partial':True})
            run_failfast(s,prefix+['publish','continue',receipt,'--basis',proposal['basis'],'--acknowledge-partial'])
            assert config.read_bytes()==retained and fifo.exists()
        finally:
            if source=='local': config.write_bytes(original)
            else: global_path.unlink(missing_ok=True)
            fifo.unlink(missing_ok=True)
        assert phases(s,f)==['created'] and not f.git('remote').stdout.strip()
        no_new_network(s)
    print('PASS: local/global FIFO includes fail promptly before any mutation',flush=True)


def default_system_config_refused(s):
    f,receipt,owner,endpoint=setup_origin(s,'uncontrolled system config')
    proposal=review(s,f,receipt); before=snapshot(s,f)
    shadow=s.root/'no-system-git'; shadow.mkdir(); marker=s.root/'no-system-git-invoked'
    fake=shadow/'git'; fake.write_text('#!/bin/sh\nprintf blocked > '+str(marker)+'\nexit 97\n'); fake.chmod(0o700)
    environment=dict(s.env); environment.pop('GIT_CONFIG_NOSYSTEM',None); environment.pop('GIT_CONFIG_SYSTEM',None)
    environment['PATH']=str(shadow)+os.pathsep+s.env['PATH']
    prefix=[str(BINARY),'--config',str(s.registry),'-C',str(f.path)]
    err=run_failfast(s,prefix+['publish','continue',receipt,'--basis',proposal['basis'],'--acknowledge-partial'],environment=environment)
    assert 'system' in err.lower() and not marker.exists()
    assert snapshot(s,f)==before and phases(s,f)==['created']
    no_new_network(s)
    print('PASS: uncontrolled system Git configuration is refused before Git is started',flush=True)


def explicit_system_config(s):
    f,receipt,owner,endpoint=setup_origin(s,'explicit safe system config')
    config=s.root/'safe-system-config'; private(config,'[core]\n    autocrlf = false\n')
    before=config.read_bytes(); original=dict(s.env)
    try:
        s.env.pop('GIT_CONFIG_NOSYSTEM',None); s.env['GIT_CONFIG_SYSTEM']=str(config)
        proposal=review(s,f,receipt); assert proposal['can_continue']
        result=apply(s,f,receipt,proposal['basis'])
        assert result['phase']=='account_assigned' and config.read_bytes()==before
        assert f.git('config','--get','remote.origin.url').stdout
        no_new_network(s)
    finally:
        s.env.clear(); s.env.update(original)
    print('PASS: explicit private system Git config is supported without modification',flush=True)


def unsafe_system_config(s):
    if not hasattr(os,'mkfifo'):
        print('SKIP: FIFO unavailable',flush=True); return
    for kind in ['fifo','symlink','writable']:
        f,receipt,owner,endpoint=setup_origin(s,'unsafe system config '+kind)
        proposal=review(s,f,receipt); before=snapshot(s,f)
        path=s.root/('unsafe-system-'+kind); target=s.root/'system-target'
        if kind=='fifo': os.mkfifo(path,0o600)
        elif kind=='symlink':
            private(target,'private system sentinel'); path.symlink_to(target)
        else: private(path,'[core]\n autocrlf = false\n'); path.chmod(0o666)
        environment=dict(s.env); environment.pop('GIT_CONFIG_NOSYSTEM',None)
        environment['GIT_CONFIG_SYSTEM']=str(path)
        prefix=[str(BINARY),'--config',str(s.registry),'-C',str(f.path)]
        run_failfast(s,prefix+['publish','continue',receipt,'--basis',proposal['basis'],'--acknowledge-partial'],environment=environment)
        if kind=='symlink': assert target.read_text()=='private system sentinel' and path.is_symlink()
        assert snapshot(s,f)==before and phases(s,f)==['created']
        no_new_network(s)
    print('PASS: FIFO, symlink and writable explicit system configurations are rejected',flush=True)


def blocked_preview(s,f,receipt):
    result=subprocess.run([str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-'],
                          env=s.env,input=json.dumps({'method':'publish_continue_preview','receipt_id':receipt}),
                          text=True,capture_output=True,timeout=90)
    s.assert_clean(result.stdout+result.stderr)
    if result.returncode==0:
        assert json.loads(result.stdout)['can_continue'] is False
    else:
        assert not result.stdout.strip()


def rewrites_and_occupied_origin(s):
    for key in ['insteadOf','pushInsteadOf']:
        f,receipt,owner,endpoint=setup_origin(s,'origin rewrite '+key)
        f.git('config','url.ssh://untrusted.invalid/.{}'.format(key),'https://github.com/')
        before=snapshot(s,f); blocked_preview(s,f,receipt)
        assert snapshot(s,f)==before and phases(s,f)==['created']
        no_new_network(s)
    for key,value in [('remote.origin.pushurl','https://synthetic-assigned-alice-private@untrusted.invalid/foreign.git'),
                      ('remote.origin.fetch','+refs/heads/*:refs/remotes/origin/*')]:
        f,receipt,owner,endpoint=setup_origin(s,'occupied '+key)
        f.git('config','--add',key,value); before=snapshot(s,f)
        blocked_preview(s,f,receipt)
        assert snapshot(s,f)==before and phases(s,f)==['created']
        no_new_network(s)
    f,receipt,owner,endpoint=setup_origin(s,'unexpected fork metadata')
    value=copy.deepcopy(s.data['repository_responses'][endpoint]); value['fork']=True
    value['parent']={'full_name':'other/base','html_url':'https://github.com/other/base'}
    s.update(repository_responses={endpoint:value})
    before=snapshot(s,f); blocked_preview(s,f,receipt)
    assert snapshot(s,f)==before and phases(s,f)==['created']; no_new_network(s)
    f,receipt,owner,endpoint=setup_origin(s,'global URL rewrite')
    global_config=Path(s.env['GIT_CONFIG_GLOBAL'])
    private(global_config,'[url "ssh://untrusted.invalid/"]\n    insteadOf = https://github.com/\n')
    try:
        before=snapshot(s,f); blocked_preview(s,f,receipt)
        assert snapshot(s,f)==before and phases(s,f)==['created']; no_new_network(s)
    finally:
        global_config.unlink(missing_ok=True)
    f,receipt,owner,endpoint=setup_origin(s,'worktree scoped origin')
    f.git('config','extensions.worktreeConfig','true')
    f.git('config','--worktree','remote.origin.fetch','+refs/heads/*:refs/remotes/origin/*')
    before=snapshot(s,f); blocked_preview(s,f,receipt)
    assert snapshot(s,f)==before and phases(s,f)==['created']; no_new_network(s)
    f,receipt,owner,endpoint=setup_origin(s,'includeIf scoped origin')
    include=s.root/'included-git-config'; include.write_text('[remote "origin"]\n    fetch = +refs/heads/*:refs/remotes/origin/*\n')
    config=f.path/'.git/config'
    with config.open('a') as output:
        output.write('[includeIf "gitdir:'+str(f.path/'.git')+'"]\n    path = '+str(include)+'\n')
    assert f.git('config','--includes','--get','remote.origin.fetch').stdout.strip()
    before=snapshot(s,f); included=include.read_bytes(); blocked_preview(s,f,receipt)
    assert snapshot(s,f)==before and include.read_bytes()==included and phases(s,f)==['created']; no_new_network(s)
    print('PASS: rewrites, origin fragments, worktree config and includeIf block continuation',flush=True)


def race(s,label,change):
    f,receipt,owner,endpoint=setup_origin(s,'origin race '+label)
    proposal=review(s,f,receipt)
    s.update(delay={'kind':'api','endpoint':endpoint})
    command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
    child=subprocess.Popen(command,env=s.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    child.stdin.write(json.dumps({'method':'publish_continue','receipt_id':receipt,'basis':proposal['basis'],
                                  'acknowledge_partial':True})); child.stdin.close(); child.stdin=None
    try:
        wait_for_child(s,child,s.started,'continuation verification GET did not begin')
        change(s,f)
        retained=snapshot(s,f)
        s.release.write_text('release')
        out,err=child.communicate(timeout=30); s.assert_clean(out+err)
        if child.returncode==0:
            assert json.loads(out)['phase']!='account_assigned',(label,out,err)
        else:
            assert not out.strip(),(label,out,err)
        assert snapshot(s,f)==retained and phases(s,f)==['created']
        no_new_network(s)
    finally:
        s.release.write_text('release'); stop(child)


def include_if_only(s):
    f,receipt,owner,endpoint=setup_origin(s,'includeIf scoped origin isolated')
    include=s.root/'included-git-config'; include.write_text('[remote "origin"]\n    fetch = +refs/heads/*:refs/remotes/origin/*\n')
    config=f.path/'.git/config'
    with config.open('a') as output:
        output.write('[includeIf "gitdir:'+str(f.path/'.git')+'"]\n    path = '+str(include)+'\n')
    assert f.git('config','--includes','--get','remote.origin.fetch').stdout.strip()
    before=snapshot(s,f); included=include.read_bytes(); blocked_preview(s,f,receipt)
    assert snapshot(s,f)==before and include.read_bytes()==included and phases(s,f)==['created']
    no_new_network(s)
    print('PASS: active includeIf origin configuration blocks continuation',flush=True)


def trailing_backslash_config(s):
    f,receipt,owner,endpoint=setup_origin(s,'unterminated config continuation')
    config=f.path/'.git/config'
    config.write_bytes(config.read_bytes()+b'[user]\n    name = dangling'+bytes([92]))
    original=config.read_bytes(); before=snapshot(s,f)
    blocked_preview(s,f,receipt)
    assert config.read_bytes()==original and snapshot(s,f)==before and phases(s,f)==['created']
    no_new_network(s)
    print('PASS: unterminated config continuation is rejected before receipt or mutation',flush=True)


def cancellation_before_mutation(s):
    f,receipt,owner,endpoint=setup_origin(s,'cancel origin preflight')
    proposal=review(s,f,receipt); before=snapshot(s,f)
    s.update(delay={'kind':'api','endpoint':endpoint})
    command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
    child=subprocess.Popen(command,env=s.env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    child.stdin.write(json.dumps({'method':'publish_continue','receipt_id':receipt,'basis':proposal['basis'],
                                  'acknowledge_partial':True})); child.stdin.close(); child.stdin=None
    try:
        wait_for_child(s,child,s.started,'cancellable verification GET did not begin')
        child.send_signal(signal.SIGINT)
        out,err=child.communicate(timeout=20); s.assert_clean(out+err)
        assert child.returncode!=0 and not out.strip(),(child.returncode,out,err)
        assert snapshot(s,f)==before and phases(s,f)==['created']
        no_new_network(s)
    finally:
        s.release.write_text('release'); stop(child)
    print('PASS: cancellation during GET preserves created receipt and performs no local mutation',flush=True)


def races(s):
    race(s,'foreign origin',lambda s,f:f.git('remote','add','origin','https://github.com/other/repo.git'))
    race(s,'config',lambda s,f:f.git('config','branch.main.merge','refs/heads/other'))
    def record(s,f):
        with open(s.registry.with_suffix('.lock'),'a+b') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX); data=json.loads(s.registry.read_text())
            next(row for row in data['records'] if row['path']==str(f.path))['id']=str(uuid.uuid4())
            private(s.registry,json.dumps(data)); fcntl.flock(lock,fcntl.LOCK_UN)
    race(s,'record',record)
    def account(s,f):
        with open(s.registry.with_suffix('.lock'),'a+b') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX); data=json.loads(s.registry.read_text())
            item=next(row for row in data['records'] if row['path']==str(f.path))['account']
            item['assignment']={'mode':'none'}; item['association']=None; item['source_remote']=None; item['revision']+=1
            private(s.registry,json.dumps(data)); fcntl.flock(lock,fcntl.LOCK_UN)
    race(s,'account',account)
    print('PASS: origin/config/record/account changes during verification reject before mutation',flush=True)


def main():
    home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-origin-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=OriginFixture(root)
        for check in [lambda s:success(s,False),lambda s:success(s,True),effective_account,occupied_config_lock,replaced_config_lock,
                      symlink_config,hardlink_config,fifo_config,fifo_include,default_system_config_refused,
                      explicit_system_config,unsafe_system_config,rewrites_and_occupied_origin,trailing_backslash_config,cancellation_before_mutation,races]:
            check(s)
        assert not s.git_watch.exists() and os.environ.get('HOME')==home
    print('PASS: origin/account continuation is fenced and durable, without network writes',flush=True)


if __name__=='__main__': main()
