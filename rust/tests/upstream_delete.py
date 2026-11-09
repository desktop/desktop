"""Combined local/upstream deletion is reviewed once, prepared first and never replayed."""
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


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-upstream-delete-') as temporary:
        root=Path(temporary);os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        real=shutil.which('git');assert real
        def seed(label,*options):
            f=Fixture(root/label,*options);(f.path/'file').write_text('base');f.commit();return f
        def bare(label,*options):
            p=root/label;subprocess.run([real,'init','-q','--bare',*options,str(p)],check=True);return p
        def at(path,*args,check=True):return subprocess.run([real,'-C',str(path),*args],capture_output=True,check=check)
        def head(path,name='local-topic'):
            r=at(path,'show-ref','--verify','--hash','refs/heads/'+name,check=False);return r.stdout.strip().decode() if r.returncode==0 else None
        def oid(f):return f.git('rev-parse','HEAD').stdout.strip().decode()
        def rpc(f,method,fail=False,**params):
            result=subprocess.run([str(BINARY),'-C',str(f.path),'repo','-'],input=json.dumps({'method':method,**params}),capture_output=True,text=True,timeout=45)
            if fail:assert result.returncode,(method,result.stdout);return result
            assert result.returncode==0,(method,result.stderr);return json.loads(result.stdout)
        def setup(label,*options):
            f=seed(label,*options);server=bare(label+'-server',*(['--object-format=sha256'] if '--object-format=sha256' in options else []));f.git('branch','local-topic');f.git('remote','add','team/origin',str(server));f.git('push','-q','team/origin','local-topic:refs/heads/server-topic');f.git('fetch','-q','team/origin');f.git('config','branch.local-topic.remote','team/origin');f.git('config','branch.local-topic.merge','refs/heads/server-topic');return f,server
        def preview(f,upstream=None,**kwargs):return rpc(f,'delete_branch_preview',name='local-topic',upstream={} if upstream is None else upstream,**kwargs)
        def delete(f,plan=None,upstream=None,fail=False,**kwargs):
            if plan is None:plan=preview(f,upstream=upstream,to_checkout=kwargs.get('to_checkout'))
            return rpc(f,'delete_branch',name='local-topic',upstream={} if upstream is None else upstream,basis=plan['basis'],fail=fail,**kwargs)
        def records(f):return rpc(f,'deleted_branches'),rpc(f,'remote_deletion_history')
        # The upstream's canonical name and remote come from Git, not local names
        # or pushRemote. The index/files stay untouched for a non-current branch.
        f,a=setup('basic');wrong=bare('wrong-remote');f.git('remote','add','wrong',str(wrong));f.git('push','-q','wrong','HEAD:refs/heads/server-topic');f.git('config','branch.local-topic.pushRemote','wrong');f.git('config','branch.local-topic.description','saved\nsettings');f.git('config','branch.local-topic.child.description','other section')
        tip=head(f.path);(f.path/'file').write_text('staged');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('loose');index=(f.path/'.git/index').read_bytes();status=f.git('status','--porcelain=v2','-z').stdout
        plan=preview(f);assert plan['upstream']['remote']=='team/origin' and plan['upstream']['reference']=='refs/heads/server-topic' and plan['checkout'] is None
        assert not (f.path/'.git/desktop-branch-deletions').exists() and not (f.path/'.git/desktop-remote-branch-deletions').exists()
        result=delete(f,plan);local,remote=records(f);local,remote=local[0],remote[0]
        assert local['phase']==remote['phase']=='complete' and result['remote_deletion_receipt_id']==local['remote_deletion_receipt_id']==remote['id'] and remote['local_deletion_receipt_id']==local['id']
        assert head(f.path) is None and head(a,'server-topic') is None and head(wrong,'server-topic')==tip
        assert (f.path/'.git/index').read_bytes()==index and f.git('status','--porcelain=v2','-z').stdout==status
        assert f.git('config','branch.local-topic.child.description').stdout==b'other section\n'
        for directory,id,field,method in [('desktop-branch-deletions',local['id'],'remote_deletion_receipt_id','deleted_branches'),('desktop-remote-branch-deletions',remote['id'],'local_deletion_receipt_id','remote_deletion_history')]:
            path=f.path/'.git'/directory/(id+'.json');original=path.read_bytes();old_record=json.loads(original);old_record.pop(field);path.write_text(json.dumps(old_record));assert rpc(f,method)[0][field] is None;path.write_bytes(original)
        f.git('reflog','expire','--expire=now','--all');f.git('gc','--prune=now');rpc(f,'restore_deleted_branch',receipt_id=local['id']);rpc(f,'restore_remote_tip',receipt_id=remote['id'],endpoint=0,name='recovered-upstream')
        assert head(f.path)==head(f.path,'recovered-upstream')==tip and f.git('config','branch.local-topic.merge').stdout==b'refs/heads/server-topic\n' and f.git('config','branch.local-topic.description').stdout==b'saved\nsettings\n'
        assert f.git('status','--porcelain=v2','-z').stdout==status and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
        # Stale local/upstream config, remote ref, endpoint config or options stops
        # before any backup, checkout or branch deletion.
        for kind in ['remote-tip','remote-config','upstream','local-ref','options']:
            f,a=setup('stale-'+kind);plan=preview(f);new=f.git('commit-tree','HEAD^{tree}','-p','HEAD','-m','new').stdout.strip().decode()
            if kind=='remote-tip':f.git('push','-q',str(a),new+':refs/heads/server-topic')
            elif kind=='remote-config':f.git('config','remote.team/origin.pushurl',str(wrong))
            elif kind=='upstream':f.git('config','branch.local-topic.merge','refs/heads/other')
            elif kind=='local-ref':f.git('update-ref','refs/heads/local-topic',new)
            delete(f,plan,upstream={'fetch_backup':True} if kind=='options' else None,fail=True)
            assert head(f.path) and head(a,'server-topic') and not (f.path/'.git/desktop-branch-deletions').exists()
        # Normal local-only calls never query the upstream. Explicit combined
        # deletion of an unconfigured/local-dot upstream is rejected read-only.
        for kind in ['none','dot']:
            f=seed('no-network-'+kind);f.git('branch','local-topic')
            if kind=='dot':f.git('config','branch.local-topic.remote','.');f.git('config','branch.local-topic.merge','refs/heads/main')
            rpc(f,'delete_branch_preview',name='local-topic',upstream={},fail=True);assert not (f.path/'.git/desktop-branch-deletions').exists()
            rpc(f,'delete_branch',name='local-topic');assert head(f.path) is None
        # Force and dirty-file/stash consent precede all recovery or mutation.
        f,a=setup('consent');f.git('switch','-q','local-topic');(f.path/'file').write_text('dirty');plan=preview(f)
        r=delete(f,plan,fail=True);assert json.loads(r.stdout)['requires_confirmation'] and head(a,'server-topic') and not (f.path/'.git/desktop-branch-deletions').exists()
        # Current-branch leave/bring reuses the existing checkout service; native
        # deletion may remove local branch settings without invalidating transport.
        for strategy in [LEAVE,BRING]:
            f,a=setup('current-'+strategy);f.git('switch','-q','local-topic');(f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('untracked')
            result=delete(f,strategy=strategy,to_checkout='main');local,remote=records(f)
            assert head(f.path) is None and head(a,'server-topic') is None and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
            assert local[0]['checkout_receipt_id'] and remote[0]['phase']=='complete'
            if strategy==LEAVE:
                stash=rpc(f,'stash_list')['entries'][0];assert stash['branch']=='local-topic' and f.git('show',stash['oid']+':file').stdout==b'working' and f.git('show',stash['parents'][1]+':file').stdout==b'index' and f.git('show',stash['parents'][2]+':loose').stdout==b'untracked'
            else:assert (f.path/'file').read_text()=='working' and f.git('show',':file').stdout==b'index' and (f.path/'loose').read_text()=='untracked'
        # Checkout can create a tracked local target from a reviewed remote ref.
        f,a=setup('remote-checkout');f.git('push','-q','team/origin','HEAD:refs/heads/destination');f.git('fetch','-q','team/origin');f.git('switch','-q','local-topic');delete(f,to_checkout='refs/remotes/team/origin/destination')
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/destination\n' and f.git('config','branch.destination.remote').stdout==b'team/origin\n' and head(a,'server-topic') is None
        # Initializing a reviewed destination's submodule legitimately adds local
        # submodule settings while the remote transport certificate stays pinned.
        f,a=setup('submodules');child=seed('submodule-child');f.git('config','protocol.file.allow','always');f.git('-c','protocol.file.allow=always','submodule','add','-q',str(child.path),'nested');f.commit();f.git('submodule','deinit','-f','--all');f.git('switch','-q','local-topic');delete(f,to_checkout='main',strategy=BRING)
        assert (f.path/'nested/file').read_text()=='base' and f.git('config','submodule.nested.url').stdout.strip().decode()==str(child.path) and head(a,'server-topic') is None
        # The public CLI carries the same reviewed options and rejects dependent
        # flags without explicitly requesting upstream deletion.
        f,a=setup('cli');cli=[str(BINARY),'-C',str(f.path),'delete-branch','local-topic'];expect=head(a,'server-topic')
        bad=subprocess.run([*cli,'--fetch-upstream-backup'],capture_output=True,text=True);assert bad.returncode==2 and head(f.path)
        options=['--include-upstream','--fetch-upstream-backup','--expect-upstream',expect];plan=json.loads(subprocess.check_output([*cli,*options,'--preview'],text=True));subprocess.run([*cli,*options,'--basis',plan['basis']],capture_output=True,text=True,check=True);assert head(f.path) is None and head(a,'server-topic') is None
        # Native local deletion policy refusal keeps both live branches. Remote
        # recovery exists, but no push hook runs and no push is replayed later.
        f,a=setup('local-refusal');marker=root/'must-not-push';hook=f.path/'.git/hooks/pre-push';hook.write_text(f'#!{sys.executable}\nfrom pathlib import Path\nPath({str(marker)!r}).touch()\n');hook.chmod(0o700)
        hook=f.path/'.git/hooks/reference-transaction';hook.write_text(f'#!{sys.executable}\nimport sys\nsys.exit(72 if sys.argv[1]=="prepared" and "refs/heads/local-topic\\n" in sys.stdin.read() else 0)\n');hook.chmod(0o700)
        delete(f,fail=True);local,remote=records(f);assert head(f.path) and head(a,'server-topic') and not marker.exists() and remote[0]['phase']=='local_deletion_stopped' and remote[0]['endpoints'][0]['backup_oid']==head(f.path)
        # A post-checkout failure can change HEAD yet must keep the source ref,
        # saved work and both recovery records while never pushing the upstream.
        f,a=setup('checkout-refusal');f.git('switch','-q','local-topic');(f.path/'file').write_text('saved working');hook=f.path/'.git/hooks/post-checkout';hook.write_text(f'#!{sys.executable}\nimport sys\nsys.exit(73)\n');hook.chmod(0o700);delete(f,strategy=LEAVE,fail=True)
        local,remote=records(f);assert head(f.path) and head(a,'server-topic') and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n' and remote[0]['phase']=='local_deletion_stopped' and rpc(f,'stash_list')['entries'] and local[0]['checkout_receipt_id']
        # A server refusal follows a completed local deletion: restore is local
        # and does not automatically re-create or delete any server branch.
        f,a=setup('server-refusal');at(a,'config','receive.denyDeletes','true');delete(f,fail=True);local,remote=records(f);assert head(f.path) is None and head(a,'server-topic') and local[0]['phase']=='deleting_upstream' and remote[0]['endpoints'][0]['phase']=='failed'
        rpc(f,'restore_deleted_branch',receipt_id=local[0]['id']);assert head(f.path) and head(a,'server-topic')
        # The projection allows only exact known local branch/submodule sections.
        # A transport change or a dotted neighboring branch section is still bound.
        for kind in ['transport','neighbor','global']:
            f,a=setup('during-checkout-'+kind);f.git('config','branch.local-topic.child.description','before');f.git('switch','-q','local-topic');hook=f.path/'.git/hooks/post-checkout'
            if kind=='global':f.git('config','--global','branch.local-topic.description','before')
            change=['remote.team/origin.url',str(wrong)] if kind=='transport' else ['branch.local-topic.description' if kind=='global' else 'branch.local-topic.child.description','after']
            scope='--global' if kind=='global' else '--local'
            hook.write_text(f'#!{sys.executable}\nimport subprocess\nsubprocess.run([{real!r},"config",{scope!r},*{change!r}],check=True)\n');hook.chmod(0o700);delete(f,strategy=BRING,fail=True)
            local,remote=records(f);assert head(f.path) is None and head(a,'server-topic') and local[0]['backup_oid'] and remote[0]['endpoints'][0]['phase']=='pending'
            if kind=='global':f.git('config','--global','--unset-all','branch.local-topic.description')
        # Every recovery tip is present and the local branch is absent before the
        # first pre-push hook, including when later destinations fail.
        f,a=setup('multi');b=bare('multi-b');f.git('push','-q',str(b),'HEAD:refs/heads/server-topic');f.git('config','--add','remote.team/origin.pushurl',str(a));f.git('config','--add','remote.team/origin.pushurl',str(b));at(b,'config','receive.denyDeletes','true')
        hook=f.path/'.git/hooks/pre-push';hook.write_text(f'#!{sys.executable}\nimport json,pathlib,subprocess\nbase=pathlib.Path({str(f.path/".git")!r})\nlocal=json.loads(next((base/"desktop-branch-deletions").glob("*.json")).read_text())\nremote=json.loads(next((base/"desktop-remote-branch-deletions").glob("*.json")).read_text())\nassert local["remote_deletion_receipt_id"]==remote["id"] and remote["local_deletion_receipt_id"]==local["id"]\nassert subprocess.run([{real!r},"show-ref","--verify","--quiet","refs/heads/local-topic"]).returncode==1\nfor e in remote["endpoints"]:assert subprocess.check_output([{real!r},"show-ref","--verify","--hash",e["backup_ref"]]).strip().decode()==e["expected"]\n');hook.chmod(0o700);delete(f,fail=True)
        local,remote=records(f);assert head(f.path) is None and head(a,'server-topic') is None and head(b,'server-topic') and [e['phase'] for e in remote[0]['endpoints']]==['deleted','failed']
        # Backup-fetch failure stops before checkout/local deletion, keeping both
        # live refs and an inspectable fetched tip if the server changed mid-fetch.
        f=seed('backup-fetch');writer=seed('backup-writer');(writer.path/'foreign').write_text('one');writer.commit();a=bare('backup-server');writer.git('push','-q',str(a),'HEAD:refs/heads/server-topic');(writer.path/'foreign').write_text('two');writer.commit();new=oid(writer);writer.git('push','-q',str(a),'HEAD:refs/heads/other');f.git('branch','local-topic');f.git('remote','add','origin',str(a));f.git('config','branch.local-topic.remote','origin');f.git('config','branch.local-topic.merge','refs/heads/server-topic')
        shim=root/'fetch-shim';shim.mkdir();tool=shim/'git';tool.write_text(f'#!{sys.executable}\nimport os,subprocess,sys\nif "fetch" in sys.argv:subprocess.run([{real!r},"-C",{str(a)!r},"update-ref","refs/heads/server-topic",{new!r}],check=True)\nos.execv({real!r},[{real!r},*sys.argv[1:]])\n');tool.chmod(0o700);old=os.environ['PATH'];os.environ['PATH']=str(shim)+os.pathsep+old
        try:delete(f,upstream={'fetch_backup':True},force=True,fail=True)
        finally:os.environ['PATH']=old
        local,remote=records(f);assert head(f.path) and head(a,'server-topic')==new and local[0]['phase']=='backing_up_upstream' and remote[0]['phase']=='backing_up' and remote[0]['endpoints'][0]['backup_oid']==new
        # Native ref storage/hash variants and linked worktree receipt ownership.
        for kind,options in [('sha256',['--object-format=sha256']),('reftable',['--ref-format=reftable']),('linked',[])]:
            f,a=setup('native-'+kind,*options)
            if kind=='linked':linked=root/'linked';f.git('worktree','add','-qb','linked',str(linked));f.path=linked
            delete(f);local,remote=records(f);assert head(f.path) is None and head(a,'server-topic') is None and local[0]['remote_deletion_receipt_id']==remote[0]['id']
        # Interrupting checkout keeps the source and server branches, saved work,
        # and a stopped prepared remote record rather than starting a push.
        f,a=setup('cancel-checkout');f.git('switch','-q','local-topic');(f.path/'file').write_text('saved work');marker=root/'checkout-mutated';hook=f.path/'.git/hooks/post-checkout';hook.write_text(f'#!{sys.executable}\nimport pathlib,time\npathlib.Path({str(marker)!r}).touch()\ntime.sleep(60)\n');hook.chmod(0o700);plan=preview(f)
        process=subprocess.Popen([str(BINARY),'-C',str(f.path),'repo','-'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        process.stdin.write(json.dumps({'method':'delete_branch','name':'local-topic','upstream':{},'basis':plan['basis'],'strategy':LEAVE}));process.stdin.close();process.stdin=None
        try:
            deadline=time.time()+30
            while not marker.exists() and time.time()<deadline:time.sleep(.02)
            assert marker.exists();process.send_signal(signal.SIGINT);out,err=process.communicate(timeout=15);assert process.returncode==130,(process.returncode,out,err)
        finally:
            if process.poll() is None:process.kill();process.wait()
        local,remote=records(f);assert head(f.path) and head(a,'server-topic') and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n' and local[0]['phase']=='switching' and remote[0]['phase']=='local_deletion_stopped' and rpc(f,'stash_list')['entries']
        # Acknowledged/uncertain server mutation after local deletion survives SIGINT.
        f,a=setup('cancel');marker=root/'server-mutated';hook=a/'hooks/post-receive';hook.write_text(f'#!{sys.executable}\nimport pathlib,time\npathlib.Path({str(marker)!r}).touch()\ntime.sleep(60)\n');hook.chmod(0o700);plan=preview(f)
        process=subprocess.Popen([str(BINARY),'-C',str(f.path),'repo','-'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        process.stdin.write(json.dumps({'method':'delete_branch','name':'local-topic','upstream':{},'basis':plan['basis']}));process.stdin.close();process.stdin=None
        try:
            deadline=time.time()+30
            while not marker.exists() and time.time()<deadline:time.sleep(.02)
            assert marker.exists();process.send_signal(signal.SIGINT);out,err=process.communicate(timeout=15);assert process.returncode==130,(process.returncode,out,err)
        finally:
            if process.poll() is None:process.kill();process.wait()
        local,remote=records(f);assert head(f.path) is None and head(a,'server-topic') is None and local[0]['phase']=='deleting_upstream' and remote[0]['endpoints'][0]['phase']=='pushing';rpc(f,'restore_deleted_branch',receipt_id=local[0]['id']);assert head(f.path)
        if lfs:
            f,a=setup('lfs');f.git('lfs','install','--local');f.git('lfs','track','*.lfs');(f.path/'data.lfs').write_bytes(b'base');f.commit();f.git('switch','-q','local-topic');f.git('merge','-q','--ff-only','main');f.git('push','-q','team/origin','HEAD:refs/heads/server-topic');f.git('fetch','-q','team/origin');(f.path/'data.lfs').write_bytes(b'working');delete(f,strategy=LEAVE);stash=rpc(f,'stash_list')['entries'][0];assert f.git('show',stash['oid']+':data.lfs').stdout.startswith(b'version https://git-lfs.github.com/spec/v1') and head(a,'server-topic') is None
    print('combined deletion: canonical upstreams, review/consent, prepared backups, checkout, partial policy/config failures, native backends, LFS and cancellation passed')

if __name__=='__main__':main()
