"""Offline, read-only publication history and acknowledgement safety."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

from discard_advanced import BINARY
from publish_context import PublishFixture, snapshot
from repository_context import private, stop, wait_for


def digest(value):
    return hashlib.sha256(value).hexdigest()


def receipt_dir(s,f,registry=None):
    registry=s.registry if registry is None else registry
    record=next(row for row in json.loads(registry.read_text())['records'] if row['path']==str(f.path))
    namespace=digest(os.fsencode(registry.absolute()))
    repository_id=digest(os.fsencode(f.path))
    record_id=record['id']
    directory=digest(json.dumps([namespace,record_id],separators=(',',':')).encode())
    return (f.path/'.git/desktop-publish-receipts'/directory, namespace, repository_id, record_id)


def synthetic(s,f,phase='created',error=None,registry=None):
    directory,namespace,repository_id,record_id=receipt_dir(s,f,registry)
    identifier=str(uuid.uuid4())
    value={'version':1,'id':identifier,'repository_id':repository_id,'namespace':namespace,
           'record_id':record_id,'phase':phase,'host':'github.com','owner':'ExampleOrg',
           'name':'example-repo','error':error,'acknowledged':False}
    directory.mkdir(parents=True,exist_ok=True,mode=0o700)
    path=directory/(identifier+'.json'); private(path,json.dumps(value))
    return path,value


def rpc(s,f,method,*,config=None,fail=False,timeout=15,**params):
    command=[str(BINARY),'--config',str(s.registry if config is None else config),'-C',str(f.path),'repo','-']
    result=subprocess.run(command,input=json.dumps({'method':method,**params}),env=s.env,
                          capture_output=True,text=True,timeout=timeout)
    s.assert_clean(result.stdout+result.stderr)
    if fail:
        assert result.returncode!=0,(method,result.stdout,result.stderr)
        return result
    assert result.returncode==0,(method,result.stderr,result.stdout)
    return json.loads(result.stdout)


def history(s,f,**kwargs): return rpc(s,f,'publish_history',**kwargs)
def acknowledge(s,f,identifier,**kwargs): return rpc(s,f,'acknowledge_publish',receipt_id=identifier,**kwargs)


def history_and_acknowledgement(s):
    s.configure(); f=s.local('history and acknowledgement')
    p,r=synthetic(s,f,'created',error='network')
    q,unknown=synthetic(s,f,'creation_unknown')
    before=snapshot(s,f); untouched=q.read_bytes(); s.clear_calls()
    value=history(s,f); rows={row['id']:row for row in value['receipts']}
    assert rows[r['id']]['phase']=='created' and rows[r['id']]['acknowledged'] is False
    assert rows[r['id']]['url'] is None
    assert rows[unknown['id']]['phase']=='creation_unknown' and rows[unknown['id']]['url'] is None
    assert s.cli_publish(f,'history')==value
    acknowledge(s,f,r['id']); once=p.read_bytes()
    acknowledged=history(s,f); rows={row['id']:row for row in acknowledged['receipts']}
    assert rows[r['id']]['acknowledged'] is True and rows[unknown['id']]['acknowledged'] is False
    assert q.read_bytes()==untouched and snapshot(s,f)==before
    s.cli_publish(f,'acknowledge',r['id'])
    assert p.read_bytes()==once and history(s,f)==acknowledged
    assert p.stat().st_mode & 0o077 == 0
    assert not s.calls() and snapshot(s,f)==before
    print('PASS: history and idempotent acknowledgement preserve outcomes, state and other receipts',flush=True)


def isolate_registry_and_record(s):
    s.configure(); f=s.local('history scope')
    p,r=synthetic(s,f); before=p.read_bytes(); original=s.registry.read_bytes()
    alternate=s.root/'alternate-registry'/'repositories.json'
    s.cli('repositories','add',f.path,config=alternate)
    assert history(s,f,config=alternate)['receipts']==[]
    acknowledge(s,f,r['id'],config=alternate,fail=True)
    assert p.read_bytes()==before and s.registry.read_bytes()==original
    # Record identity changes when the same worktree is removed and re-added.
    s.cli('repositories','forget',f.path)
    s.cli('repositories','add',f.path)
    assert history(s,f)['receipts']==[]
    acknowledge(s,f,r['id'],fail=True)
    assert p.read_bytes()==before
    print('PASS: histories are isolated by registry namespace and saved record',flush=True)


def bad_receipts(s):
    s.configure(); f=s.local('invalid receipts')
    p,r=synthetic(s,f)
    for key,value in [('version',2),('repository_id','0'*64),('namespace','0'*64),
                      ('record_id',str(uuid.uuid4())),('phase','unrecognized'),
                      ('host','github.com@private.invalid'),('owner','owner/elsewhere'),
                      ('name','repo?token=private-marker'),('error','private-marker')]:
        bad={**r,key:value}; private(p,json.dumps(bad)); before=p.read_bytes()
        result=history(s,f)
        assert 'private-marker' not in json.dumps(result)
        response=acknowledge(s,f,r['id'],fail=True)
        assert 'private-marker' not in response.stderr and p.read_bytes()==before
    private(p,b'{' + b'x'*(1024*1024+1))
    history(s,f); acknowledge(s,f,r['id'],fail=True)
    for identifier in ['../private-marker','/tmp/private-marker',r['id'].upper(),'not-a-uuid']:
        response=acknowledge(s,f,identifier,fail=True)
        assert 'private-marker' not in response.stderr
    assert not s.calls()
    print('PASS: invalid, foreign, oversized, traversal and reflected receipt data rejected safely',flush=True)


def registry_races(s):
    for method in ['publish_history','acknowledge_publish']:
        s.configure(); f=s.local('registry race '+method)
        p,r=synthetic(s,f); retained=p.read_bytes()
        marker=s.root/('marker-'+method)
        environment={**s.env,'PUBLISH_MARK_GITDIR':str(marker)}
        params={'method':method}
        if method=='acknowledge_publish': params['receipt_id']=r['id']
        command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
        with open(s.registry.with_suffix('.lock'),'a+b') as guard:
            fcntl.flock(guard,fcntl.LOCK_EX)
            child=subprocess.Popen(command,env=environment,stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                child.stdin.write(json.dumps(params)); child.stdin.close(); child.stdin=None
                wait_for(marker.exists,'receipt operation never reached its captured scope')
                data=json.loads(s.registry.read_text())
                row=next(row for row in data['records'] if row['path']==str(f.path))
                row['id']=str(uuid.uuid4())
                private(s.registry,json.dumps(data))
                fcntl.flock(guard,fcntl.LOCK_UN)
                out,err=child.communicate(timeout=15)
                s.assert_clean(out+err)
                assert child.returncode!=0 and not out.strip(),(method,out,err)
                assert p.read_bytes()==retained
            finally:
                fcntl.flock(guard,fcntl.LOCK_UN); stop(child)
    print('PASS: registry replacement during history and acknowledgement is rejected',flush=True)


def untrusted_identity_privacy(s):
    s.configure(); f=s.local('untrusted identity')
    p,r=synthetic(s,f)
    token='SyntheticAlphaToken123456'
    users={key:dict(value) for key,value in s.data['users'].items()}
    users['AliceCase']['token']=token; s.update(users=users)
    private(p,json.dumps({**r,'name':token}))
    row=history(s,f)['receipts'][0]
    assert row['url'] is None and token not in json.dumps(row)
    result=acknowledge(s,f,r['id'])
    assert token not in json.dumps(result) and result['receipt']['url'] is None
    assert not s.calls()
    print('PASS: untrusted identity cannot disclose a credential through history or acknowledgement',flush=True)


def unsafe_paths(s):
    s.configure(); f=s.local('unsafe receipts')
    p,r=synthetic(s,f); good=p.read_bytes(); outside=s.root/'receipt-outside'; outside.write_bytes(b'outside-sentinel')
    p.unlink(); p.symlink_to(outside)
    result=history(s,f); assert 'outside-sentinel' not in json.dumps(result)
    acknowledge(s,f,r['id'],fail=True)
    assert outside.read_bytes()==b'outside-sentinel' and p.is_symlink()
    p.unlink()
    if hasattr(os,'mkfifo'):
        os.mkfifo(p,0o600)
        history(s,f,timeout=8); acknowledge(s,f,r['id'],fail=True,timeout=8)
        assert outside.read_bytes()==b'outside-sentinel'; p.unlink()
    private(p,good)
    directory=p.parent; p.unlink(); directory.rmdir()
    other=s.root/'receipt-outside-directory'; other.mkdir()
    directory.symlink_to(other,target_is_directory=True)
    response=history(s,f,fail=True)
    assert 'outside-sentinel' not in response.stderr and not list(other.iterdir())
    acknowledge(s,f,r['id'],fail=True)
    assert not list(other.iterdir()) and outside.read_bytes()==b'outside-sentinel'
    g=s.local('unsafe receipts root')
    root=g.path/'.git/desktop-publish-receipts'
    root.symlink_to(other,target_is_directory=True)
    history(s,g,fail=True)
    assert not list(other.iterdir()) and outside.read_bytes()==b'outside-sentinel'
    print('PASS: receipt symlinks, FIFO and directory symlinks refused without writes',flush=True)


def main():
    home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-publish-receipts-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=PublishFixture(root)
        git=root/'bin/git'; original=root/'bin/git-original'; git.rename(original)
        git.write_text(f'#!{sys.executable}\n' + r'''import os,sys
from pathlib import Path
if any(arg in ('push','pull','fetch','clone','ls-remote') for arg in sys.argv[1:]):
 Path(os.environ['PUBLISH_GIT_WATCH']).write_text('unexpected network git operation')
if '--absolute-git-dir' in sys.argv and os.environ.get('PUBLISH_MARK_GITDIR'):
 Path(os.environ['PUBLISH_MARK_GITDIR']).write_text('gitdir inspected')
os.execv(str(Path(__file__).with_name('git-original')),[str(Path(__file__).with_name('git-original')),*sys.argv[1:]])
''')
        git.chmod(0o700); s.env['PUBLISH_GIT_WATCH']=str(root/'network-git-attempted')
        for check in [history_and_acknowledgement,isolate_registry_and_record,bad_receipts,registry_races,untrusted_identity_privacy,unsafe_paths]:
            check(s)
        assert not Path(s.env['PUBLISH_GIT_WATCH']).exists()
        assert os.environ.get('HOME')==home
    print('PASS: publication history is scoped, bounded, private and has no replay',flush=True)


if __name__=='__main__': main()
