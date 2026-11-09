"""Reviewed native local deletion, pinned ref guards, checkout and retained recovery."""
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
LEAVE='StashOnCurrentBranch'
BRING='MoveToNewBranch'



def policy_and_partial_cases(root):
    def seed(label):
        f=Fixture(root/label);(f.path/'file').write_text('base');f.commit();return f
    def delete(f,**kwargs):
        plan=f.rpc('delete_branch_preview',name='victim');return f.rpc('delete_branch',name='victim',force=True,basis=plan['basis'],**kwargs)
    def exists(f):return f.git('show-ref','--verify','--quiet','refs/heads/victim',check=False).returncode==0
    # Named and file hooks each get one unchanged payload per native phase.
    f=seed('configured-hooks');f.git('branch','victim');log=root/'configured-log';hook=f.path/'.git/hooks/reference-transaction'
    hook.write_text(f'#!{sys.executable}\nimport json,sys\ntag="configured" if len(sys.argv)>2 else "file"\nwith open({str(log)!r},"a") as f:f.write(json.dumps([tag,sys.argv[-1],sys.stdin.read()])+"\\n")\n');hook.chmod(0o700)
    f.git('config','hook.extra.event','reference-transaction');f.git('config','hook.extra.command',str(hook)+' configured')
    f.git('branch','-D','victim')
    expected=[event for event in [json.loads(line) for line in log.read_text().splitlines()] if 'refs/heads/victim\n' in event[2]]
    f.git('branch','victim');log.write_text('')
    delete(f)
    events=[event for event in [json.loads(line) for line in log.read_text().splitlines()] if 'refs/heads/victim\n' in event[2]]
    assert events==expected,(expected,events)
    assert not f.git('config','--get','hook.extra.enabled',check=False).stdout
    # Disabling user reference hooks must not disable the application's own
    # reviewed-tip gate, and their original disabled state is preserved.
    f=seed('disabled-hooks');f.git('branch','victim');f.git('config','hook.reference-transaction.enabled','false')
    new=f.git('commit-tree','HEAD^{tree}','-m','new').stdout.strip().decode();real=shutil.which('git');assert real
    tool_dir=root/'disabled-wrapper';tool_dir.mkdir();tool=tool_dir/'git'
    tool.write_text(f'#!{sys.executable}\nimport subprocess,sys\na=sys.argv[1:]\nif "branch" in a and "-D" in a and "victim" in a: subprocess.run([{real!r},"-C",{str(f.path)!r},"update-ref","refs/heads/victim",{new!r}],check=True)\nr=subprocess.run([{real!r},*a])\nsys.exit(r.returncode)\n');tool.chmod(0o700)
    old=os.environ['PATH'];os.environ['PATH']=str(tool_dir)+os.pathsep+old
    try:delete(f,fail=True)
    finally:os.environ['PATH']=old
    assert exists(f) and f.git('rev-parse','victim').stdout.strip().decode()==new and f.git('config','--bool','hook.reference-transaction.enabled').stdout==b'false\n'
    # Existing hook policies can still refuse deletion, after the backup was made.
    f=seed('refusal');f.git('branch','victim');hook=f.path/'.git/hooks/reference-transaction'
    hook.write_text(f'#!{sys.executable}\nimport sys\ndata=sys.stdin.read()\nsys.exit(72 if sys.argv[1]=="prepared" and "refs/heads/victim\\n" in data else 0)\n');hook.chmod(0o700)
    delete(f,fail=True);assert exists(f) and f.rpc('deleted_branches')[0]['phase']=='deleting'
    # A failed checkout can already have switched, but must keep the victim,
    # saved changes, recovery tip and related checkout receipt intact.
    f=seed('checkout-failure');f.git('switch','-qc','victim');(f.path/'unique').write_text('unique');f.commit();(f.path/'file').write_text('saved working');(f.path/'loose').write_text('saved loose')
    shell=shutil.which('sh');assert shell;hook=f.path/'.git/hooks/post-checkout';hook.write_text(f'#!{shell}\nexit 65\n');hook.chmod(0o700)
    delete(f,strategy=LEAVE,fail=True)
    record=f.rpc('deleted_branches')[0];assert record['phase']=='switching' and record['backup_oid']==record['oid'] and exists(f) and f.rpc('snapshot')['branch']=='main'
    related=next(item for item in f.rpc('checkout_history') if item['receipt']['id']==record['checkout_receipt_id']);assert related['saved_stashes']
    stash=related['saved_stashes'][0];assert f.git('show',stash['oid']+':file').stdout==b'saved working' and f.git('show',stash['parents'][2]+':loose').stdout==b'saved loose'
    # The native branch command also protects refs used by a detached rebase.
    f=seed('rebase');f.git('switch','-qc','victim');(f.path/'file').write_text('victim');f.commit();f.git('switch','-q','main');(f.path/'file').write_text('main');f.commit();f.git('switch','-q','victim');assert f.git('rebase','main',check=False).returncode
    index=(f.path/'.git/index').read_bytes();working=(f.path/'file').read_bytes()
    delete(f,fail=True)
    assert exists(f) and (f.path/'.git/index').read_bytes()==index and (f.path/'file').read_bytes()==working


def main():
    lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-delete-') as temporary:
        root=Path(temporary);os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        def seed(label,*options):
            f=Fixture(root/label,*options);(f.path/'file').write_text(''.join(f'line {i}\n' for i in range(30)));f.commit();return f
        def delete(f,name='victim',**kwargs):
            plan=f.rpc('delete_branch_preview',name=name,**({'to_checkout':kwargs['to_checkout']} if 'to_checkout' in kwargs else {}))
            return f.rpc('delete_branch',name=name,basis=plan['basis'],**kwargs)
        def exists(f,name):return f.git('show-ref','--verify','--quiet','refs/heads/'+name,check=False).returncode==0
        def entries(f):return f.rpc('deleted_branches')
        def wrapper(f,label,body):
            directory=root/label;directory.mkdir();real=shutil.which('git');assert real
            path=directory/'git';path.write_text(f'#!{sys.executable}\nimport subprocess,sys,time\nfrom pathlib import Path\na=sys.argv[1:]\nreal={real!r}\nrepo={str(f.path)!r}\n'+body);path.chmod(0o700);return directory
        # Preview/history are read-only; ordinary merged deletion retains native config.
        f=seed('normal');f.git('branch','victim');assert entries(f)==[] and not (f.path/'.git/desktop-branch-deletions').exists()
        f.git('config','branch.victim.description','saved\ntext');f.git('config','--add','branch.victim.merge','refs/heads/main');f.git('config','--add','branch.victim.merge','refs/heads/other');f.git('branch','victim.child');f.git('config','branch.victim.child.description','keep other branch')
        (f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('loose')
        before=(f.path/'.git/index').read_bytes();status=f.git('status','--porcelain=v2','-z').stdout;tip=f.git('rev-parse','victim').stdout.strip().decode()
        plan=f.rpc('delete_branch_preview',name='refs/heads/victim');assert not plan['force_required'] and plan['checkout'] is None and not (f.path/'.git/desktop-branch-deletions').exists()
        result=f.rpc('delete_branch',name='refs/heads/victim',basis=plan['basis']);assert not exists(f,'victim')
        record=entries(f)[0];assert record['phase']=='complete' and record['backup_oid']==tip and record['current_oid'] is None and 'config' not in record
        assert (f.path/'.git/index').read_bytes()==before and f.git('status','--porcelain=v2','-z').stdout==status
        assert f.git('config','branch.victim.child.description').stdout==b'keep other branch\n'
        f.git('symbolic-ref','refs/heads/dangling-restore','refs/heads/leave-absent');f.rpc('restore_deleted_branch',receipt_id=result['receipt_id'],name='dangling-restore',fail=True);assert not exists(f,'leave-absent') and f.git('symbolic-ref','refs/heads/dangling-restore').stdout==b'refs/heads/leave-absent\n'
        f.rpc('restore_deleted_branch',receipt_id=result['receipt_id']);assert exists(f,'victim') and f.git('config','branch.victim.description').stdout==b'saved\ntext\n'
        assert f.git('config','--get-all','branch.victim.merge').stdout==b'refs/heads/main\nrefs/heads/other\n'
        assert f.git('status','--porcelain=v2','-z').stdout==status and entries(f)[0]['phase']=='restored'
        f.rpc('forget_deleted_branch',receipt_id=result['receipt_id']);assert entries(f)==[] and exists(f,'victim')
        # Force needs explicit consent; a retained ref survives aggressive Git GC.
        f=seed('unmerged');f.git('switch','-qc','victim');(f.path/'unique').write_text('unmerged commit');f.commit();tip=f.git('rev-parse','HEAD').stdout.strip().decode();f.git('switch','-q','main')
        plan=f.rpc('delete_branch_preview',name='victim');assert plan['force_required'];result=delete(f,fail=True);assert json.loads(result.stdout)['requires_force'] and exists(f,'victim') and not (f.path/'.git/desktop-branch-deletions').exists()
        result=delete(f,force=True);f.git('reflog','expire','--expire=now','--all');f.git('gc','--prune=now')
        assert f.git('show',result['backup_ref']+':unique').stdout==b'unmerged commit'
        f.git('branch','victim');f.rpc('restore_deleted_branch',receipt_id=result['receipt_id'],fail=True)
        f.rpc('restore_deleted_branch',receipt_id=result['receipt_id'],name='restored-tip');assert f.git('rev-parse','restored-tip').stdout.strip().decode()==tip
        # Current branch deletion chooses main; leave saves staged/working/untracked
        # data with the deleted branch marker and does not remove existing stashes.
        f=seed('current');f.git('switch','-qc','victim');(f.path/'unique').write_text('commit');f.commit()
        (f.path/'file').write_text('previous');old=f.rpc('stash_save',desktop=True)['oid'];(f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_bytes(b'loose\0')
        plan=f.rpc('delete_branch_preview',name='victim');assert plan['checkout']['target']['branch']=='main'
        result=delete(f,force=True,fail=True);assert json.loads(result.stdout)['requires_confirmation'] and exists(f,'victim') and not (f.path/'.git/desktop-branch-deletions').exists()
        result=delete(f,force=True,strategy=LEAVE,fail=True);assert json.loads(result.stdout)['requires_confirmation']
        result=delete(f,force=True,strategy=LEAVE,replace_stash=True);assert f.rpc('snapshot')['branch']=='main' and not exists(f,'victim')
        saved=f.rpc('stash_list')['entries'];assert len(saved)==1 and saved[0]['branch']=='victim' and saved[0]['oid']!=old
        assert f.git('show',saved[0]['oid']+':file').stdout==b'working' and f.git('show',saved[0]['parents'][1]+':file').stdout==b'index' and f.git('show',saved[0]['parents'][2]+':loose').stdout==b'loose\0'
        record=entries(f)[0];assert any(item['receipt']['id']==record['checkout_receipt_id'] for item in f.rpc('checkout_history'))
        f.rpc('restore_deleted_branch',receipt_id=result['receipt_id']);assert exists(f,'victim') and f.rpc('snapshot')['branch']=='main'
        # Bring preserves ordinary staging and file content on the fallback branch.
        f=seed('bring');f.git('switch','-qc','victim');(f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');delete(f,strategy=BRING)
        assert f.rpc('snapshot')['branch']=='main' and f.git('show',':file').stdout==b'index' and (f.path/'file').read_text()=='working'
        # Every review input is fenced; failed preflight creates no recovery ref.
        for kind in ['ref','config','index','bytes','stash','target']:
            f=seed('stale-'+kind);f.git('branch','victim');f.git('branch','other');(f.path/'loose').write_text('one');plan=f.rpc('delete_branch_preview',name='victim',to_checkout='other')
            if kind=='ref':f.git('update-ref','refs/heads/victim',f.git('commit-tree','HEAD^{tree}','-m','different').stdout.strip().decode())
            elif kind=='config':f.git('config','branch.victim.description','changed')
            elif kind=='index':f.git('add','--','loose')
            elif kind=='bytes':
                file=f.path/'loose';stat=file.stat();file.write_text('two');os.utime(file,ns=(stat.st_atime_ns,stat.st_mtime_ns))
            elif kind=='stash':(f.path/'file').write_text('stashed');f.rpc('stash_save',message='new stash')
            else:f.git('update-ref','refs/heads/other',f.git('commit-tree','HEAD^{tree}','-m','new target').stdout.strip().decode())
            f.rpc('delete_branch',name='victim',to_checkout='other',basis=plan['basis'],force=True,strategy=BRING,fail=True)
            assert exists(f,'victim') and not (f.path/'.git/desktop-branch-deletions').exists()
        # Native hooks receive exact phase/stdin data through a quoted hooks path.
        f=seed('hooks');f.git('branch',"victim'quoted");directory=root/"hooks space'and\nnewline";directory.mkdir();log=root/'hook-events'
        hook=directory/'reference-transaction';hook.write_text(f'#!{sys.executable}\nimport json,sys\nwith open({str(log)!r},"a") as f:f.write(json.dumps([sys.argv[1],sys.stdin.read()])+"\\n")\n');hook.chmod(0o700);f.git('config','core.hooksPath',str(directory))
        delete(f,name="victim'quoted");events=[json.loads(line) for line in log.read_text().splitlines()]
        assert any(phase=='prepared' and "refs/heads/victim'quoted\n" in data for phase,data in events) and any(phase=='committed' and "refs/heads/victim'quoted\n" in data for phase,data in events)
        assert f.git('config','core.hooksPath').stdout==os.fsencode(directory)+b'\n'
        # A native writer moving the selected tip inside the branch command is
        # refused under Git's prepared transaction locks, without config cleanup.
        f=seed('race');f.git('branch','victim');f.git('config','branch.victim.description','retained');old=f.git('rev-parse','victim').stdout.strip().decode();new=f.git('commit-tree','HEAD^{tree}','-m','concurrent').stdout.strip().decode()
        tool=wrapper(f,'race-wrapper',f'if "branch" in a and "victim" in a and "-D" in a: subprocess.run([real,"-C",repo,"update-ref","refs/heads/victim",{new!r}],check=True)\nr=subprocess.run([real,*a])\nsys.exit(r.returncode)\n')
        path=os.environ['PATH'];os.environ['PATH']=str(tool)+os.pathsep+path
        try:result=delete(f,force=True,fail=True);assert 'tip changed' in result.stderr
        finally:os.environ['PATH']=path
        assert f.git('rev-parse','victim').stdout.strip().decode()==new and f.git('config','branch.victim.description').stdout==b'retained\n'
        assert entries(f)[0]['backup_oid']==old and entries(f)[0]['phase']=='deleting'
        # Native worktree/rebase restrictions remain enforced, including -D.
        f=seed('held');held=root/'held-tree';f.git('worktree','add','-qb','victim',str(held));delete(f,force=True,fail=True);assert exists(f,'victim')
        f=seed('only');f.rpc('delete_branch_preview',name='main',fail=True);f.rpc('delete_branch',name='main',force=True,fail=True);assert exists(f,'main')
        # Ref-only deletion/restore also works with a broken index and preferences.
        f=seed('broken-index');f.git('branch','victim');index=f.path/'.git/index';index.write_bytes(b'corrupt index preserved');config=root/'registry.json';config.with_suffix('.preferences.json').write_text('{bad')
        result=subprocess.run([str(BINARY),'-C',str(f.path),'--config',str(config),'delete-branch','victim'],capture_output=True,text=True);assert result.returncode==0,result.stderr
        result=json.loads(result.stdout);f.rpc('restore_deleted_branch',receipt_id=result['receipt_id']);assert index.read_bytes()==b'corrupt index preserved'
        # Git ref backends, packed refs and linked worktree journals are native.
        for label,options in [('sha256',('--object-format=sha256',)),('split',()),('linked',()),('reftable',('--ref-format=reftable',)),('packed',())]:
            f=seed(label,*options);f.git('branch','victim')
            if label=='split':f.git('update-index','--split-index')
            if label=='linked':
                linked=root/'linked-tree';f.git('worktree','add','-qb','other',str(linked));f.path=linked
            if label=='packed':f.git('pack-refs','--all','--prune')
            result=delete(f);assert not exists(f,'victim');f.rpc('restore_deleted_branch',receipt_id=result['receipt_id']);assert exists(f,'victim')
        # Cancellation after Git deletes still retains the backup and last phase.
        f=seed('cancel');f.git('branch','victim');started=root/'deleted'
        tool=wrapper(f,'cancel-wrapper',f'r=subprocess.run([real,*a])\nif "branch" in a and "victim" in a and "-D" in a and r.returncode==0:\n    Path({str(started)!r}).write_text("deleted")\n    time.sleep(60)\nsys.exit(r.returncode)\n')
        child=subprocess.Popen([str(BINARY),'-C',str(f.path),'delete-branch','victim','--force'],env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ['PATH']},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+12
            while not started.exists() and time.monotonic()<deadline:time.sleep(.02)
            assert started.exists();child.send_signal(signal.SIGINT);child.communicate(timeout=8);assert child.returncode==130
        finally:
            if child.poll() is None:child.kill();child.wait()
        record=entries(f)[0];assert record['phase']=='deleting' and record['backup_oid']==record['oid'] and record['current_oid'] is None
        f.rpc('restore_deleted_branch',receipt_id=record['id']);assert exists(f,'victim')
        # OS locks serialize deletion with independent stash/checkout processes.
        f=seed('lock');f.git('branch','victim');lock=open(f.path/'.git/desktop-stash.lock','a+b');fcntl.flock(lock,fcntl.LOCK_EX)
        child=subprocess.Popen([str(BINARY),'-C',str(f.path),'delete-branch','victim'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            time.sleep(.2);assert child.poll() is None and exists(f,'victim');fcntl.flock(lock,fcntl.LOCK_UN);stdout,stderr=child.communicate(timeout=15);assert child.returncode==0,stderr
        finally:
            lock.close()
            if child.poll() is None:child.kill();child.wait()
        # Recovery readers reject symlinks/FIFOs, and forgetting checks the ref CAS.
        record=entries(f)[0];metadata=f.path/'.git/desktop-branch-deletions'/f'{record["id"]}.json';original=metadata.read_bytes();outside=root/'outside';outside.write_bytes(original);metadata.unlink();metadata.symlink_to(outside)
        assert entries(f)[0]['error'];f.rpc('forget_deleted_branch',receipt_id=record['id'],fail=True);assert outside.read_bytes()==original
        metadata.unlink();os.mkfifo(metadata,0o600);assert entries(f)[0]['error'];metadata.unlink();metadata.write_bytes(b'x'*(1024*1024+1));assert 'size' in entries(f)[0]['error'];metadata.write_bytes(original)
        new=f.git('commit-tree','HEAD^{tree}','-m','changed backup').stdout.strip().decode();f.git('update-ref',record['backup_ref'],new)
        f.rpc('forget_deleted_branch',receipt_id=record['id'],fail=True);assert metadata.exists()
        # Forgetting a recovery ref must never follow a symbolic replacement
        # into a user's active branch, even when its object ID is unchanged.
        f=seed('symbolic-backup');f.git('branch','victim');result=delete(f)
        f.git('symbolic-ref',result['backup_ref'],'refs/heads/main')
        attempt=f.rpc('forget_deleted_branch',receipt_id=result['receipt_id'])
        assert exists(f,'main') and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
        policy_and_partial_cases(root)
        if lfs:
            f=seed('lfs');f.rpc('lfs_install');f.git('lfs','track','*.lfs');payload=f.path/'data.lfs';payload.write_bytes(b'base');f.commit();f.git('switch','-qc','victim');payload.write_bytes(b'index');f.git('add','--','data.lfs');payload.write_bytes(b'working');(f.path/'new.lfs').write_bytes(b'untracked')
            result=delete(f,strategy=LEAVE);f.rpc('restore_deleted_branch',receipt_id=result['receipt_id']);saved=f.rpc('stash_list')['entries'][0];f.rpc('stash_apply',oid=saved['oid'],restore_index=True)
            assert payload.read_bytes()==b'working' and (f.path/'new.lfs').read_bytes()==b'untracked'
    print('PASS: reviewed local deletion/force, pinned native transactions/hooks, current-branch leave/bring, tip/config recovery, stale fences, GC, native backends/worktrees, locks/cancellation and real LFS')

if __name__=='__main__':main()
