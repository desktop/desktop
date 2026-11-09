"""Reviewed native branch renames preserve saved index/working/untracked data."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from discard_advanced import BINARY, Fixture



def metadata_faults(root):
    f=Fixture(root/'receipt-files'); (f.path/'file').write_text('untouched'); f.commit()
    plan=f.rpc('rename_branch_preview',name='main',new_name='renamed')
    result=f.rpc('rename_branch',name='main',new_name='renamed',basis=plan['basis'])
    receipt_id=result['receipt']['id']; metadata=f.path/'.git/desktop-branch-renames'/f'{receipt_id}.json'
    original=metadata.read_bytes(); external=root/'external-receipt'; external.write_bytes(original)
    metadata.unlink(); metadata.symlink_to(external)
    assert f.rpc('branch_rename_history')[0]['error']
    f.rpc('acknowledge_branch_rename',receipt_id=receipt_id,fail=True)
    assert external.read_bytes()==original
    metadata.unlink(); os.mkfifo(metadata,0o600)
    assert f.rpc('branch_rename_history')[0]['error']
    f.rpc('acknowledge_branch_rename',receipt_id=receipt_id,fail=True)
    metadata.unlink(); metadata.write_bytes(b'x'*(1024*1024+1))
    assert 'size' in f.rpc('branch_rename_history')[0]['error']
    metadata.write_bytes(original); f.rpc('acknowledge_branch_rename',receipt_id=receipt_id)
    assert (f.path/'file').read_text()=='untouched' and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/renamed\n'


def main():
    lfs = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-rename-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global')
        if lfs: os.environ['PATH'] = str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        def seed(label, *options):
            f = Fixture(root/label, *options)
            (f.path/'file').write_bytes(b'base\n'); f.commit()
            return f
        def save(f, content, **kwargs):
            (f.path/'file').write_bytes(content)
            return f.rpc('stash_save', **kwargs)['oid']
        def review(f, name='main', new_name='renamed'):
            return f.rpc('rename_branch_preview', name=name, new_name=new_name)
        def rename(f, name='main', new_name='renamed', **kwargs):
            plan = review(f, name, new_name)
            return f.rpc('rename_branch', name=name, new_name=new_name, basis=plan['basis'], **kwargs)
        def entries(f): return f.rpc('stash_list')['entries']
        def wrapper(f, label, body):
            directory = root/label; directory.mkdir()
            path = directory/'git'; real = shutil.which('git'); assert real
            path.write_text(f'#!{sys.executable}\nimport subprocess,sys,time\nfrom pathlib import Path\na=sys.argv[1:]\nreal={real!r}\nrepo={str(f.path)!r}\n'+body)
            path.chmod(0o700)
            return directory
        f = seed('empty')
        assert f.rpc('branch_rename_history') == []
        assert not (f.path/'.git/desktop-branch-renames').exists()
        same = rename(f, new_name='main'); assert same['unchanged']
        assert not (f.path/'.git/desktop-branch-renames').exists()
        # All associated entries preserve branch order and every native tree/parent.
        f.git('tag','main')
        (f.path/'file').write_bytes(b'index saved\n'); f.git('add','--','file')
        (f.path/'file').write_bytes(b'working saved\n')
        raw = os.fsdecode(b'raw-\xff\n'); (f.path/raw).write_bytes(b'untracked saved\0')
        first = f.rpc('stash_save', desktop=True, include_untracked=True)['oid']
        ordinary = save(f, b'ordinary\n', message='user stash')
        second = save(f, b'newer branch stash\n', desktop=True)
        destination = save(f, b'destination saved\n', message='!!GitHub_Desktop<renamed>')
        old = {entry['oid']:entry for entry in entries(f)}
        (f.path/'file').write_bytes(b'current index\n'); f.git('add','--','file'); (f.path/'file').write_bytes(b'current working\n')
        (f.path/'loose').write_bytes(b'keep loose')
        index = (f.path/'.git/index').read_bytes()
        status = f.git('status','--porcelain=v2','-z').stdout
        f.git('config','branch.main.remote','origin'); f.git('config','branch.main.merge','refs/heads/main')
        plan = review(f, name='refs/heads/main')
        assert [entry['oid'] for entry in plan['saved_stashes']] == [second,first]
        assert plan['destination_stashes'][0]['oid'] == destination
        result = f.rpc('rename_branch', name='refs/heads/main', new_name='renamed', basis=plan['basis'])
        assert result['receipt']['phase'] == 'complete'
        assert f.rpc('snapshot')['branch'] == 'renamed'
        assert f.git('config','branch.renamed.merge').stdout == b'refs/heads/main\n'
        assert (f.path/'.git/index').read_bytes() == index
        assert f.git('status','--porcelain=v2','-z').stdout == status
        now = entries(f); assert len(now) == 4
        assert [entry['tree'] for entry in now[:2]] == [old[second]['tree'],old[first]['tree']]
        assert [entry['parents'] for entry in now[:2]] == [old[second]['parents'],old[first]['parents']]
        assert all(entry['branch']=='renamed' for entry in now[:2])
        assert {entry['oid'] for entry in now[2:]} == {ordinary,destination}
        history = f.rpc('branch_rename_history'); assert len(history)==1 and len(history[0]['saved_stashes'])==2
        receipt_id = history[0]['receipt']['id']; metadata = f.path/'.git/desktop-branch-renames'/f'{receipt_id}.json'
        assert metadata.stat().st_mode & 0o777 == 0o600
        before = f.git('stash','list','--format=%H').stdout
        f.rpc('acknowledge_branch_rename', receipt_id=receipt_id)
        assert f.git('stash','list','--format=%H').stdout == before and f.rpc('branch_rename_history') == []
        f.git('reset','--hard','-q'); (f.path/'loose').unlink()
        moved_first = next(entry for entry in now if entry['parents']==old[first]['parents'])
        f.rpc('stash_apply', oid=moved_first['oid'], restore_index=True)
        assert f.git('show',':file').stdout == b'index saved\n' and (f.path/'file').read_bytes()==b'working saved\n' and (f.path/raw).read_bytes()==b'untracked saved\0'
        # Stale config, ref and reflog reviews fail before metadata/ref mutations.
        for kind in ['config','ref','stash','worktree']:
            f = seed('stale-'+kind); save(f,b'saved',desktop=True); plan=review(f)
            if kind=='config': f.git('config','branch.main.description','changed')
            elif kind=='ref':
                oid = f.git('commit-tree','HEAD^{tree}','-m','changed ref').stdout.strip().decode(); f.git('update-ref','refs/heads/main',oid)
            elif kind=='stash': save(f,b'external saved',message='external')
            else: f.git('worktree','add','-qb','other',str(root/'new-worktree'))
            before = f.git('stash','list','--format=%H').stdout
            f.rpc('rename_branch',name='main',new_name='renamed',basis=plan['basis'],fail=True)
            assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n' and f.git('stash','list','--format=%H').stdout==before
            assert not (f.path/'.git/desktop-branch-renames').exists()
        # Existing destinations, invalid refs and same-name stashes do not force overwrite.
        f = seed('invalid'); save(f,b'saved',desktop=True); f.git('branch','existing')
        for new in ['existing','--help','bad name','@{-1}']:
            review_result = f.rpc('rename_branch_preview',name='main',new_name=new,fail=True)
        assert len(entries(f)) == 1
        # Missing native identity cannot rename the branch or remove original data.
        f = seed('no-identity'); original=save(f,b'keep original',desktop=True)
        f.git('config','user.useConfigOnly','true'); f.git('config','--unset','user.name'); f.git('config','--unset','user.email')
        rename(f,fail=True)
        assert entries(f)[0]['oid']==original and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
        # Config/canonical ref naming, non-current, linked worktree, split index and reftable.
        for label, options in [('sha256',('--object-format=sha256',)),('split',()),('linked',()),('reftable',('--ref-format=reftable',)),('detached',())]:
            f=seed(label,*options); original=save(f,b'saved content\0',desktop=True)
            if label=='split': f.git('update-index','--split-index')
            if label=='linked':
                sibling=root/'sibling'; f.git('worktree','add','-qb','other',str(sibling)); f.path=sibling
            if label=='detached': f.git('switch','--detach','-q')
            rename(f)
            assert f.git('show-ref','--verify','--hash','refs/heads/renamed').returncode==0
            assert len(entries(f))==1 and entries(f)[0]['branch']=='renamed'
            f.rpc('stash_apply',oid=entries(f)[0]['oid']); assert (f.path/'file').read_bytes()==b'saved content\0'
            if label=='linked': assert subprocess.run(['git','-C',str(root/label),'symbolic-ref','HEAD'],capture_output=True,check=True).stdout==b'refs/heads/renamed\n'
            if label=='detached': assert f.rpc('snapshot')['branch'] is None
        # A canonical source can identify a branch whose literal name itself
        # starts with refs/heads, without renaming the separate current branch.
        f=seed('canonical-source'); f.git('branch','refs/heads/main')
        rename(f,name='refs/heads/refs/heads/main',new_name='canonical-renamed')
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
        assert f.git('show-ref','--verify','refs/heads/canonical-renamed').returncode==0
        assert f.git('show-ref','--verify','refs/heads/refs/heads/main',check=False).returncode!=0
        metadata_faults(root)
        # Partial child failures preserve originals and replacement data, before
        # rename, after Git renamed, and when removing obsolete originals.
        for phase in ['before-rename','after-rename','drop','concurrent']:
            f=seed(phase); original=save(f,b'saved payload',desktop=True)
            body='r=subprocess.run([real,*a])\nsys.exit(r.returncode)\n'
            if phase=='before-rename': body='if "branch" in a and "-m" in a: sys.exit(73)\n'+body
            elif phase=='after-rename': body='r=subprocess.run([real,*a])\nif "branch" in a and "-m" in a and r.returncode==0: sys.exit(73)\nsys.exit(r.returncode)\n'
            elif phase=='drop': body='if "stash" in a and "drop" in a: sys.exit(74)\n'+body
            else:
                tip=f.git('commit-tree','HEAD^{tree}','-m','concurrent').stdout.strip().decode()
                body=f'r=subprocess.run([real,*a])\nif "stash" in a and "store" in a and r.returncode==0: subprocess.run([real,"-C",repo,"update-ref","refs/heads/main",{tip!r}],check=True)\nsys.exit(r.returncode)\n'
            tool=wrapper(f,'wrapper-'+phase,body); path=os.environ['PATH']; os.environ['PATH']=str(tool)+os.pathsep+path
            try: rename(f,fail=True)
            finally: os.environ['PATH']=path
            now=entries(f); assert len(now)==2 and any(entry['oid']==original for entry in now)
            history=f.rpc('branch_rename_history')[0]; assert history['receipt']['error'] and len(history['saved_stashes'])==2
            assert (history['destination_oid'] is not None) == (phase in ['after-rename','drop'])
            for entry in now: assert f.git('show',entry['oid']+':file').stdout==b'saved payload'
        # Cancellation after Git stores a copy or renames the branch is recoverable
        # even before its wrapper returns; recorded replacement IDs are prewritten.
        for phase in ['store','rename']:
            f=seed('cancel-'+phase); original=save(f,b'cancelled payload',desktop=True)
            started=root/('started-'+phase)
            condition='"stash" in a and "store" in a' if phase=='store' else '"branch" in a and "-m" in a'
            tool=wrapper(f,'wrapper-cancel-'+phase,f'r=subprocess.run([real,*a])\nif {condition} and r.returncode==0:\n    Path({str(started)!r}).write_text("done")\n    time.sleep(60)\nsys.exit(r.returncode)\n')
            env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ['PATH']}
            child=subprocess.Popen([str(BINARY),'-C',str(f.path),'rename-branch','main','renamed'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+12
                while not started.exists() and time.monotonic()<deadline: time.sleep(.02)
                assert started.exists(); child.send_signal(signal.SIGINT); child.communicate(timeout=8); assert child.returncode==130
            finally:
                if child.poll() is None: child.kill(); child.wait()
            history=f.rpc('branch_rename_history')[0]; assert len(history['saved_stashes'])==2 and history['receipt']['phase']==('storing' if phase=='store' else 'renaming')
            assert any(entry['oid']==original for entry in entries(f))
        # Shared common-directory lock also serializes separate CLI processes.
        f=seed('lock'); save(f,b'locked payload',desktop=True)
        lock=open(f.path/'.git/desktop-stash.lock','a+b'); fcntl.flock(lock,fcntl.LOCK_EX)
        child=subprocess.Popen([str(BINARY),'-C',str(f.path),'rename-branch','main','renamed'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            time.sleep(.2); assert child.poll() is None and not (f.path/'.git/desktop-branch-renames').exists()
            fcntl.flock(lock,fcntl.LOCK_UN); stdout,stderr=child.communicate(timeout=15); assert child.returncode==0,stderr
        finally:
            lock.close()
            if child.poll() is None: child.kill(); child.wait()
        # Nofollow receipt access and acknowledgement never touches outside files.
        f=seed('symlinks'); external=root/'external'; external.mkdir(); (f.path/'.git/desktop-branch-renames').symlink_to(external)
        rename(f,fail=True); f.rpc('branch_rename_history',fail=True); assert not list(external.iterdir())
        if lfs:
            f=seed('lfs'); f.rpc('lfs_install'); f.git('lfs','track','*.lfs')
            payload=f.path/'payload.lfs'; payload.write_bytes(b'base payload'); f.commit()
            payload.write_bytes(b'index payload'); f.git('add','--','payload.lfs'); payload.write_bytes(b'working payload'); (f.path/'untracked.lfs').write_bytes(b'untracked payload')
            original=f.rpc('stash_save',desktop=True,include_untracked=True)['oid']; before=entries(f)[0]
            rename(f); entry=entries(f)[0]; assert entry['tree']==before['tree'] and entry['parents']==before['parents']
            f.rpc('stash_apply',oid=entry['oid'],restore_index=True)
            assert payload.read_bytes()==b'working payload' and (f.path/'untracked.lfs').read_bytes()==b'untracked payload'
            assert f.git('show',':payload.lfs').stdout==f.git('show',before['parents'][1]+':payload.lfs').stdout
    print('PASS: reviewed branch renames, all associated stashes/order, stale fences, native configs/worktrees/hash/index/ref backends, cancellation and recovery')

if __name__=='__main__': main()
