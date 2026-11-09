"""Native checkout hooks/LFS, nested Git worktrees and read-only CLI review."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import signal
import time
import tempfile
from discard_advanced import BINARY, Fixture
LEAVE='StashOnCurrentBranch';BRING='MoveToNewBranch'


def stale_registration(root):
    f=Fixture(root/'stale-registration');(f.path/'file').write_text('base');f.commit();f.git('branch','other')
    held=root/'missing-worktree';f.git('worktree','add','-q',str(held),'other');shutil.rmtree(held)
    (f.path/'file').write_text('keep local work')
    plan=f.rpc('checkout_preview',branch='other');assert plan['occupied_worktree']['prunable']
    f.rpc('worktree_remove',path=str(held),force=False)
    plan=f.rpc('checkout_preview',branch='other');assert plan['occupied_worktree'] is None and (f.path/'file').read_text()=='keep local work'
    f.rpc('checkout',branch='other',strategy=BRING,basis=plan['basis'])
    assert (f.path/'file').read_text()=='keep local work' and f.git('symbolic-ref','--short','HEAD').stdout==b'other\n'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-checkout-native-') as temporary:
        root=Path(temporary);os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        stale_registration(root)
        def seed(path):
            f=Fixture(path);(f.path/'file').write_bytes(b'base\n');f.commit();return f
        def checkout(f,branch,strategy=BRING,**kwargs):
            plan=f.rpc('checkout_preview',branch=branch)
            return f.rpc('checkout',branch=branch,strategy=strategy,basis=plan['basis'],**kwargs)
        def git(directory,*args):return subprocess.run(['git','-C',str(directory),*args],capture_output=True,check=True).stdout
        f=seed(root/'preview');f.git('branch','other');(f.path/'file').write_text('keep review data')
        config=root/'registry.json';prefs=config.with_suffix('.preferences.json');prefs.write_text('{broken')
        command=[str(BINARY),'-C',str(f.path),'--config',str(config),'checkout','other','--preview']
        result=subprocess.run(command,capture_output=True,text=True,check=True)
        assert json.loads(result.stdout)['dirty'] and prefs.read_text()=='{broken' and not config.exists() and not (f.path/'.git/desktop-checkout').exists()
        assert subprocess.run(command+['--open-worktree'],capture_output=True).returncode and not config.exists()
        review=f.rpc('checkout_preview',branch='other');f.git('config','core.hooksPath',str(root/'hooks'))
        f.rpc('checkout',branch='other',strategy=BRING,basis=review['basis'],fail=True)
        assert not f.rpc('stash_list')['entries'] and (f.path/'file').read_text()=='keep review data'
        # Git metadata attributes are effective conversion inputs even when no
        # working file, status entry or ordinary configuration value changes.
        review=f.rpc('checkout_preview',branch='other');(f.path/'.git/info/attributes').write_text('file review-flag\n')
        f.rpc('checkout',branch='other',strategy=BRING,basis=review['basis'],fail=True)
        assert not f.rpc('stash_list')['entries'] and (f.path/'file').read_text()=='keep review data'
        # Canonical remote refs cannot be shadowed by similarly named local branches.
        f=seed(root/'canonical');f.git('branch','other');f.git('remote','add','origin',str(root/'not-contacted'))
        head=f.git('rev-parse','HEAD').stdout.strip();f.git('update-ref','refs/remotes/origin/topic',head);f.git('branch','refs/remotes/origin/topic')
        plan=f.rpc('checkout_preview',branch='refs/remotes/origin/topic');assert plan['target']['remote'] and plan['target']['branch']=='topic'
        f.git('update-ref','refs/remotes/origin/refs/heads/missing',head)
        f.rpc('checkout_preview',branch='refs/heads/missing',fail=True)
        checkout(f,'refs/remotes/origin/topic');assert f.git('symbolic-ref','--short','HEAD').stdout==b'topic\n'
        assert f.git('config','branch.topic.remote').stdout==b'origin\n' and f.git('config','branch.topic.merge').stdout==b'refs/heads/topic\n'
        # A native writer changing either source identity or target while Git
        # saves the new stash cannot cause deletion of the old branch stash.
        for kind in ['source','target']:
            f=seed(root/('changed-'+kind));f.git('branch','other');f.git('branch','same-head')
            (f.path/'file').write_text('previous work');previous=f.rpc('stash_save',desktop=True)['oid'];(f.path/'file').write_text('new saved work')
            plan=f.rpc('checkout_preview',branch='other');new=f.git('commit-tree','HEAD^{tree}','-m','new target').stdout.strip().decode()
            fake=root/('git-wrapper-'+kind);fake.mkdir();wrapper=fake/'git';real=shutil.which('git');assert real
            update=['symbolic-ref','HEAD','refs/heads/same-head'] if kind=='source' else ['update-ref','refs/heads/other',new]
            wrapper.write_text(f'#!{sys.executable}\nimport subprocess,sys\na=sys.argv[1:]\nr=subprocess.run([{real!r},*a])\n'
                +f'if "stash" in a and "push" in a and r.returncode==0: subprocess.run([{real!r},"-C",{str(f.path)!r},*{update!r}],check=True)\n'
                +'sys.exit(r.returncode)\n');wrapper.chmod(0o700)
            old=os.environ['PATH'];os.environ['PATH']=str(fake)+os.pathsep+old
            try:f.rpc('checkout',branch='other',strategy=LEAVE,basis=plan['basis'],replace_stash=True,fail=True)
            finally:os.environ['PATH']=old
            entries=f.rpc('stash_list')['entries'];assert len(entries)==2 and any(entry['oid']==previous for entry in entries)
            receipt=f.rpc('checkout_history')[0];assert receipt['receipt']['phase']=='stashed' and receipt['saved_stashes']
        # Cancellation can arrive after Git saved data but before its child
        # reports completion. The nonce reconciles the otherwise unknown OID.
        f=seed(root/'cancel-saving');f.git('branch','other');(f.path/'file').write_text('saved before cancellation')
        plan=f.rpc('checkout_preview',branch='other');fake=root/'git-cancel-save';fake.mkdir();tool=fake/'git';started=fake/'started';real=shutil.which('git');assert real
        tool.write_text(f'#!{sys.executable}\nimport subprocess,sys,time\nfrom pathlib import Path\na=sys.argv[1:]\nr=subprocess.run([{real!r},*a])\n'
            +f'if "stash" in a and "push" in a and r.returncode==0:\n    Path({str(started)!r}).write_text("saved")\n    time.sleep(60)\n'
            +'sys.exit(r.returncode)\n');tool.chmod(0o700)
        env={**os.environ,'PATH':str(fake)+os.pathsep+os.environ['PATH']}
        child=subprocess.Popen([str(BINARY),'-C',str(f.path),'checkout','other','--strategy','leave','--basis',plan['basis']],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+10
            while not started.exists() and time.monotonic()<deadline:time.sleep(.02)
            assert started.exists();child.send_signal(signal.SIGINT);child.communicate(timeout=8);assert child.returncode==130
        finally:
            if child.poll() is None:child.kill();child.wait()
        item=f.rpc('checkout_history')[0];assert item['receipt']['phase']=='stashing' and item['receipt']['saved_oid'] is None and item['saved_stashes']
        assert f.git('show',item['saved_stashes'][0]['oid']+':file').stdout==b'saved before cancellation'
        # Native recursive submodule updates, retained local data and failed updates.
        child=seed(root/'child');first=child.git('rev-parse','HEAD').stdout.strip().decode();(child.path/'file').write_text('target child\n');child.commit();second=child.git('rev-parse','HEAD').stdout.strip().decode()
        f=seed(root/'parent');f.git('-c','protocol.file.allow=always','submodule','add','--',str(child.path),'module');nested=f.path/'module';git(nested,'checkout','--detach','-q',first);f.commit()
        f.git('switch','-qc','other');git(nested,'checkout','--detach','-q',second);f.commit();f.git('switch','-q','main');git(nested,'checkout','--detach','-q',first)
        checkout(f,'other');assert git(nested,'rev-parse','HEAD').strip().decode()==second
        checkout(f,'main');assert git(nested,'rev-parse','HEAD').strip().decode()==first
        local=nested/'local-only';local.write_bytes(b'keep one');review=f.rpc('checkout_preview',branch='other');stat=local.stat();local.write_bytes(b'keep two');os.utime(local,ns=(stat.st_atime_ns,stat.st_mtime_ns))
        f.rpc('checkout',branch='other',strategy=BRING,basis=review['basis'],fail=True)
        assert git(nested,'rev-parse','HEAD').strip().decode()==first and local.read_bytes()==b'keep two'
        checkout(f,'other');assert git(nested,'rev-parse','HEAD').strip().decode()==second and local.read_bytes()==b'keep two'
        checkout(f,'main');(nested/'file').write_bytes(b'keep competing local\n')
        checkout(f,'other',fail=True)
        record=f.rpc('checkout_history')[0]['receipt'];assert record['phase']=='submodules' and record['error']
        assert f.git('symbolic-ref','--short','HEAD').stdout==b'other\n' and git(nested,'rev-parse','HEAD').strip().decode()==first
        assert (nested/'file').read_bytes()==b'keep competing local\n' and local.read_bytes()==b'keep two'
        git(nested,'stash','push','--include-untracked','-m','retained child work')
        f.rpc('submodule_update',paths=['module'],recursive=True)
        assert git(nested,'rev-parse','HEAD').strip().decode()==second and b'retained child work' in git(nested,'stash','list')
        if lfs:
            f=seed(root/'lfs');f.rpc('lfs_install');f.git('lfs','track','*.lfs');file=f.path/'data.lfs';file.write_bytes(b'base payload\n');f.commit()
            f.git('switch','-qc','other');file.write_bytes(b'target payload\n');f.commit();f.git('switch','-q','main')
            file.write_bytes(b'index payload\n');f.git('add','--','data.lfs');file.write_bytes(b'working payload\n');(f.path/'new.lfs').write_bytes(b'untracked payload\n')
            hook=f.path/'.git/hooks/post-checkout';before=hook.read_text();marker=root/'hook-ran'
            import shlex
            hook.write_text(before.replace('#!/bin/sh','#!/bin/sh\nprintf ran > '+shlex.quote(str(marker)),1));hook.chmod(0o700)
            old=os.environ.get('GIT_LITERAL_PATHSPECS');os.environ['GIT_LITERAL_PATHSPECS']='1'
            try:
                value=checkout(f,'other',LEAVE);assert value['saved_oid'] and marker.read_text()=='ran'
                assert file.read_bytes()==b'target payload\n' and not (f.path/'new.lfs').exists()
                checkout(f,'main');f.rpc('stash_apply',oid=value['saved_oid'],restore_index=True,pop=True)
                assert file.read_bytes()==b'working payload\n' and (f.path/'new.lfs').read_bytes()==b'untracked payload\n'
                assert b'oid sha256:'+hashlib.sha256(b'index payload\n').hexdigest().encode() in f.git('show',':data.lfs').stdout
            finally:
                if old is None:os.environ.pop('GIT_LITERAL_PATHSPECS',None)
                else:os.environ['GIT_LITERAL_PATHSPECS']=old
    print('PASS: read-only CLI preview with corrupt preferences, incompatible preview flags, hook/attribute-config fences, stale worktree recovery, recursive submodule checkout/certificates/retained failures, native LFS index/working/untracked data and post-checkout hooks')

if __name__=='__main__':main()
