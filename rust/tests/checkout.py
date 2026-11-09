"""Reviewed leave/bring checkout, pinned refs, receipts, partial failure and cancellation."""
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

LEAVE='StashOnCurrentBranch';BRING='MoveToNewBranch'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-checkout-') as temporary:
        root=Path(temporary);os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        def repo(name,*options,diverge=True):
            f=Fixture(root/name,*options);(f.path/'file').write_bytes(b'base\n');f.commit();f.git('switch','-qc','other')
            if diverge:(f.path/'file').write_bytes(b'target\n');f.commit()
            f.git('switch','-q','main');return f
        def review(f,target='other'):return f.rpc('checkout_preview',branch=target)
        def switch(f,strategy=BRING,target='other',**kwargs):return f.rpc('checkout',branch=target,strategy=strategy,basis=review(f,target)['basis'],**kwargs)
        def stashes(f):return f.rpc('stash_list')['entries']
        def record(f):return f.rpc('checkout_history')[0]
        def raw_checkout(f,*args,check=True):return subprocess.run([str(BINARY),'-C',str(f.path),*args],capture_output=True,text=True,check=check)
        f=repo('leave');assert f.rpc('checkout_history')==[] and not (f.path/'.git/desktop-checkout').exists()
        f.git('switch','-q','other');(f.path/'file').write_bytes(b'saved destination\n');dest=f.rpc('stash_save',desktop=True)['oid'];f.git('switch','-q','main')
        (f.path/'file').write_bytes(b'previous saved\n');previous=f.rpc('stash_save',desktop=True)['oid']
        (f.path/'file').write_bytes(b'new index\n');f.git('add','--','file');(f.path/'file').write_bytes(b'new working\n');raw=os.fsdecode(b'-raw-\xff\n');(f.path/raw).write_bytes(b'untracked\n')
        preview=review(f);assert preview['dirty'] and preview['source_stash']['oid']==previous and preview['target_stash']['oid']==dest
        ask=json.loads(f.rpc('checkout',branch='other',fail=True).stdout);assert ask['requires_confirmation']
        ask=json.loads(f.rpc('checkout',branch='other',strategy=LEAVE,basis=preview['basis'],fail=True).stdout);assert ask['requires_confirmation'] and (f.path/'file').read_bytes()==b'new working\n'
        value=switch(f,LEAVE,replace_stash=True);saved=value['saved_oid'];assert saved and f.git('symbolic-ref','--short','HEAD').stdout==b'other\n'
        assert (f.path/'file').read_bytes()==b'target\n' and not (f.path/raw).exists() and not f.git('status','--porcelain').stdout
        assert {entry['oid'] for entry in stashes(f)}=={dest,saved};assert f.git('show',saved+':file').stdout==b'new working\n'
        receipt=record(f);assert receipt['receipt']['phase']=='complete' and receipt['receipt']['replaced_oid']==previous
        assert receipt['saved_stashes'][0]['oid']==saved
        switch(f,target='main');assert (f.path/'file').read_bytes()==b'base\n' and any(entry['oid']==saved for entry in stashes(f))
        f.rpc('stash_apply',oid=saved,restore_index=True,pop=True)
        assert (f.path/'file').read_bytes()==b'new working\n' and f.git('show',':file').stdout==b'new index\n' and (f.path/raw).read_bytes()==b'untracked\n'
        # Bringing non-overlapping files uses native switch without a temporary stash.
        f=repo('direct');(f.path/'new').write_bytes(b'new staged');f.git('add','--','new');(f.path/'untracked').write_text('keep')
        value=switch(f);assert value['saved_oid'] is None and not stashes(f)
        assert f.git('show',':new').stdout==b'new staged' and (f.path/'untracked').read_text()=='keep'
        # The same modified file needs a transient stash, then merges cleanly.
        f=repo('fallback',diverge=False);base=''.join(f'line {n}\n' for n in range(30));(f.path/'file').write_text(base);f.commit()
        f.git('switch','-q','other');(f.path/'file').write_text(base.replace('line 29\n','target 29\n'));f.commit();f.git('switch','-q','main')
        staged=base.replace('line 0\n','staged 0\n');working=staged.replace('line 14\n','working 14\n')
        (f.path/'file').write_text(staged);f.git('add','--','file');(f.path/'file').write_text(working);(f.path/'new').write_text('untracked')
        value=switch(f,restore_index=True);assert value['saved_oid'] and not stashes(f)
        assert (f.path/'file').read_text()==working.replace('line 29\n','target 29\n')
        assert f.git('show',':file').stdout.decode()==staged.replace('line 29\n','target 29\n') and (f.path/'new').read_text()=='untracked'
        # A conflicted bring stays on the selected branch and keeps the tagged stash.
        f=repo('conflict');(f.path/'file').write_bytes(b'local competing\n')
        switch(f,fail=True);item=record(f);assert item['receipt']['phase']=='applying' and item['receipt']['error'] and item['saved_stashes']
        assert f.git('symbolic-ref','--short','HEAD').stdout==b'other\n' and f.git('ls-files','-u').stdout
        stash=item['saved_stashes'][0]['oid'];assert f.git('show',stash+':file').stdout==b'local competing\n'
        before=f.git('ls-files','--stage').stdout;f.rpc('acknowledge_checkout',receipt_id=item['receipt']['id'])
        assert f.rpc('checkout_history')==[] and f.git('ls-files','--stage').stdout==before and stashes(f)[0]['oid']==stash
        # Certificates include bytes, source refs, target refs, attributes/configuration and stashes.
        f=repo('stale');file=f.path/'file';file.write_bytes(b'change a\n');plan=review(f);stat=file.stat();file.write_bytes(b'change b\n');os.utime(file,ns=(stat.st_atime_ns,stat.st_mtime_ns))
        f.rpc('checkout',branch='other',strategy=BRING,basis=plan['basis'],fail=True);assert not stashes(f) and file.read_bytes()==b'change b\n'
        plan=review(f);f.git('config','filter.example.clean','cat');f.rpc('checkout',branch='other',strategy=BRING,basis=plan['basis'],fail=True)
        plan=review(f);other=f.git('commit-tree','other^{tree}','-m','changed target').stdout.strip();f.git('update-ref','refs/heads/other',other)
        f.rpc('checkout',branch='other',strategy=BRING,basis=plan['basis'],fail=True)
        plan=review(f);f.git('branch','same-head');f.git('symbolic-ref','HEAD','refs/heads/same-head')
        f.rpc('checkout',branch='other',strategy=BRING,basis=plan['basis'],fail=True)
        assert not (f.path/'.git/desktop-checkout').exists()
        # Canonical remote refs create local tracking branches at their reviewed commit.
        f=repo('remote');f.git('remote','add','origin',str(root/'not-contacted'));tip=f.git('rev-parse','other').stdout.strip().decode();f.git('update-ref','refs/remotes/origin/topic',tip)
        plan=review(f,'refs/remotes/origin/topic');assert plan['target']['remote'] and plan['target']['branch']=='topic'
        switch(f,target='refs/remotes/origin/topic');assert f.git('rev-parse','HEAD').stdout.strip().decode()==tip
        assert f.git('config','branch.topic.remote').stdout==b'origin\n' and f.git('config','branch.topic.merge').stdout==b'refs/heads/topic\n'
        # A registered working tree is selected explicitly instead of overwriting the current one.
        f=repo('occupied');held=root/'held worktree';f.git('worktree','add','-q',str(held),'other');(f.path/'file').write_text('keep source')
        plan=review(f);assert plan['occupied_worktree']['display_path']==str(held)
        blocked=json.loads(f.rpc('checkout',branch='other',strategy=LEAVE,fail=True).stdout);assert blocked['requires_worktree'] and not stashes(f)
        config=root/'registry.json';selected=raw_checkout(f,'--config',str(config),'checkout','other','--open-worktree')
        assert str(held) in selected.stdout and json.loads(config.read_text())['selected']==str(held) and (f.path/'file').read_text()=='keep source'
        # File/index/hash/ref backends and detached/unborn sources use the same workflow.
        for name,options in [('sha256',('--object-format=sha256',)),('split',()),('linked',()),('reftable',('--ref-format=reftable',))]:
            f=repo(name,*options)
            if name=='split':f.git('update-index','--split-index')
            if name=='linked':
                linked=root/'linked source';f.git('worktree','add','-qb','linked',str(linked));f.path=linked
            (f.path/'file').write_text('saved branch data');value=switch(f,LEAVE);assert value['saved_oid'] and record(f)['saved_stashes']
        f=repo('detached');f.git('switch','--detach','-q');(f.path/'only-new').write_text('carry detached');assert not review(f)['can_leave'];switch(f,LEAVE)
        assert (f.path/'only-new').read_text()=='carry detached' and not stashes(f)
        f=repo('unborn');f.git('switch','--orphan','unborn','-q');(f.path/'new').write_text('carry unborn');assert not review(f)['can_leave'];switch(f,LEAVE)
        assert (f.path/'new').read_text()=='carry unborn'
        # Errors before/after the native switch and cancellation retain phase/data evidence.
        for failure in ['before','after','cancel']:
            f=repo('failure-'+failure);(f.path/'file').write_text('recover saved work');plan=review(f)
            fake=root/('git-'+failure);fake.mkdir();started=fake/'started';tool=fake/'git';real=shutil.which('git');assert real
            tool.write_text(f'#!{sys.executable}\nimport subprocess,sys,time\nfrom pathlib import Path\na=sys.argv[1:]\n'
                +(f'if "switch" in a:\n    Path({str(started)!r}).write_text("started")\n    time.sleep(60)\n' if failure=='cancel' else '')
                +('if "switch" in a: sys.exit(33)\n' if failure=='before' else '')
                +f'r=subprocess.run([{real!r},*a])\n'
                +('if "switch" in a and r.returncode==0: sys.exit(33)\n' if failure=='after' else '')+'sys.exit(r.returncode)\n');tool.chmod(0o700)
            previous=os.environ['PATH'];os.environ['PATH']=str(fake)+os.pathsep+previous
            try:
                command=[str(BINARY),'-C',str(f.path),'checkout','other','--strategy','leave','--basis',plan['basis']]
                if failure=='cancel':
                    child=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    try:
                        deadline=time.monotonic()+10
                        while not started.exists() and time.monotonic()<deadline:time.sleep(.02)
                        assert started.exists();child.send_signal(signal.SIGINT);child.communicate(timeout=8);assert child.returncode==130
                    finally:
                        if child.poll() is None:child.kill();child.wait()
                else:assert subprocess.run(command,capture_output=True).returncode
            finally:os.environ['PATH']=previous
            item=record(f);assert item['receipt']['phase']=='switching' and item['receipt']['error'] and item['saved_stashes']
            assert f.git('show',item['saved_stashes'][0]['oid']+':file').stdout==b'recover saved work'
            assert f.git('symbolic-ref','--short','HEAD').stdout==(b'other\n' if failure=='after' else b'main\n')
            assert not list((f.path/'.git').glob('index.lock'))
        # Old preferences gain the existing strategy default without rewriting reads.
        config=root/'old.json';prefs=config.with_suffix('.preferences.json');prefs.write_text('{"version":1,"theme":"system","poll_interval_ms":2000}')
        before=prefs.read_bytes();result=raw_checkout(f,'--config',str(config),'preferences')
        assert json.loads(result.stdout)['uncommitted_changes']=='AskForConfirmation' and prefs.read_bytes()==before
        raw_checkout(f,'--config',str(config),'preferences','set','{"uncommitted_changes":"MoveToNewBranch"}')
        assert json.loads(prefs.read_text())['uncommitted_changes']==BRING
        # Reconcile the uniquely tagged stash even if a crash happened before recording its OID.
        item=record(f);gitdir=Path(os.fsdecode(f.git('rev-parse','--absolute-git-dir').stdout.strip()));manifest=gitdir/'desktop-checkout'/(item['receipt']['id']+'.json')
        data=json.loads(manifest.read_text());data['saved_oid']=None;data['phase']='stashing';data['error']=None;manifest.write_text(json.dumps(data))
        assert record(f)['saved_stashes'][0]['oid']==item['saved_stashes'][0]['oid']
    print('PASS: reviewed leave/bring, replacement consent, pinned remote tracking, original/temporary stash preservation, saved index/untracked data, conflicts, stale bytes/refs/settings, worktree selection, SHA256/split/linked/reftable, detached/unborn, durable partial receipts, cancellation and preferences')

if __name__=='__main__':main()
