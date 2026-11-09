"""Reviewed remote deletion: actual local bare servers, native hooks, leases and recovery."""
import json
import os
from pathlib import Path
import shlex
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from discard_advanced import BINARY, Fixture


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-remote-delete-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        real_git=subprocess.check_output(['sh','-c','command -v git'],text=True).strip()
        def seed(label,*options):
            f=Fixture(root/label,*options);(f.path/'file').write_text('base');f.commit();return f
        def bare(label,*options):
            path=root/label;subprocess.run([real_git,'init','-q','--bare',*options,str(path)],check=True);return path
        def git_at(path,*args,check=True):return subprocess.run([real_git,'-C',str(path),*args],capture_output=True,check=check)
        def oid(f):return f.git('rev-parse','HEAD').stdout.strip().decode()
        def head(path,name='victim'):
            p=git_at(path,'show-ref','--verify','--hash','refs/heads/'+name,check=False)
            return p.stdout.strip().decode() if p.returncode==0 else None
        def publish(f,path,name='victim'):
            f.git('push','-q',str(path),'HEAD:refs/heads/'+name)
        def preview(f,request):return f.rpc('remote_branch_delete_preview',request=request)
        def delete(f,request,plan=None,fail=False):
            plan=plan or preview(f,request);return f.rpc('delete_remote_branch',request=request,basis=plan['basis'],fail=fail)
        def history(f):return f.rpc('remote_deletion_history')
        # A fetch-only destination is not touched; each push URL has its own tip.
        f=seed('multi');fetch=bare('fetch-only');a=bare('push-a');b=bare('push-b')
        for p in [fetch,a]:publish(f,p)
        tip_a=oid(f);(f.path/'different').write_text('remote b');f.commit();tip_b=oid(f);publish(f,b)
        f.git('remote','add','team/origin',str(fetch));f.git('config','--add','remote.team/origin.pushurl',str(a));f.git('config','--add','remote.team/origin.pushurl',str(b))
        f.git('fetch','-q','team/origin');f.git('config','branch.main.remote','team/origin');f.git('config','branch.main.merge','refs/heads/victim')
        targets=f.rpc('remote_deletion_targets');assert targets['remotes']==['team/origin'] and targets['upstreams']==[{'local_ref':'refs/heads/main','remote':'team/origin','branch':'refs/heads/victim'}]
        (f.path/'file').write_text('staged');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('untracked')
        index=(f.path/'.git/index').read_bytes();status=f.git('status','--porcelain=v2','-z').stdout;config=(f.path/'.git/config').read_bytes()
        request={'remote':'team/origin','branch':'refs/heads/victim'};plan=preview(f,request)
        assert [e['expected'] for e in plan['endpoints']]==[tip_a,tip_b] and not (f.path/'.git/desktop-remote-branch-deletions').exists()
        result=delete(f,request,plan);id=result['receipt_id'];record=history(f)[0]
        assert head(fetch)==tip_a and head(a) is None and head(b) is None
        assert record['phase']=='complete' and [e['phase'] for e in record['endpoints']]==['deleted','deleted']
        assert [e['backup_oid'] for e in record['endpoints']]==[tip_a,tip_b]
        assert (f.path/'.git/config').read_bytes()==config and (f.path/'.git/index').read_bytes()==index and f.git('status','--porcelain=v2','-z').stdout==status
        assert f.git('show-ref','--verify','--quiet','refs/remotes/team/origin/victim',check=False).returncode==1
        f.git('reflog','expire','--expire=now','--all');f.git('gc','--prune=now')
        f.git('symbolic-ref','refs/heads/dangling-restore','refs/heads/leave-absent');f.rpc('restore_remote_tip',receipt_id=id,endpoint=0,name='dangling-restore',fail=True);assert head(f.path,'leave-absent') is None and f.git('symbolic-ref','refs/heads/dangling-restore').stdout==b'refs/heads/leave-absent\n'
        f.git('config','branch.occupied.description','existing');f.rpc('restore_remote_tip',receipt_id=id,endpoint=0,name='occupied',fail=True);assert head(f.path,'occupied') is None and f.git('config','branch.occupied.description').stdout==b'existing\n'
        f.rpc('restore_remote_tip',receipt_id=id,endpoint=0,name='restored-a');f.rpc('restore_remote_tip',receipt_id=id,endpoint=1,name='restored-b')
        assert f.git('rev-parse','restored-a').stdout.strip().decode()==tip_a and f.git('rev-parse','restored-b').stdout.strip().decode()==tip_b
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n' and f.git('status','--porcelain=v2','-z').stdout==status
        f.rpc('restore_remote_tip',receipt_id=id,endpoint=0,name='restored-a',fail=True)
        f.rpc('forget_remote_deletion',receipt_id=id);assert history(f)==[] and head(a) is None and head(b) is None
        # Any changed reviewed input stops before backup creation or server mutation.
        for kind in ['tip','config','cache']:
            f=seed('stale-'+kind);a=bare('stale-server-'+kind);publish(f,a);f.git('remote','add','origin',str(a));f.git('fetch','-q','origin');request={'remote':'origin','branch':'victim'};plan=preview(f,request)
            newer=f.git('commit-tree','HEAD^{tree}','-p','HEAD','-m','outside').stdout.strip().decode()
            if kind=='tip':f.git('push','-q',str(a),newer+':refs/heads/victim')
            elif kind=='config':f.git('config','remote.origin.proxy','changed')
            else:f.git('update-ref','refs/remotes/origin/victim',newer)
            delete(f,request,plan,fail=True);assert head(a)==(newer if kind=='tip' else oid(f)) and not (f.path/'.git/desktop-remote-branch-deletions').exists()
        # A pre-push concurrent writer defeats the explicit lease, not the review.
        # The first URL succeeds; the second refuses, and cache changes survive.
        f=seed('partial');a=bare('partial-a');b=bare('partial-b');publish(f,a);publish(f,b);tip=oid(f)
        f.git('remote','add','origin',str(a));f.git('config','--add','remote.origin.pushurl',str(a));f.git('config','--add','remote.origin.pushurl',str(b));f.git('fetch','-q','origin')
        newer=f.git('commit-tree','HEAD^{tree}','-p','HEAD','-m','outside').stdout.strip().decode();f.git('push','-q',str(b),newer+':refs/heads/other')
        hooks=root/"hooks with 'quote\nand newline";hooks.mkdir();log=root/'hook-log'
        hook=hooks/'pre-push';hook.write_text(f'#!{sys.executable}\nimport json,subprocess,sys\ndata=sys.stdin.read()\nwith open({str(log)!r},"a") as log:log.write(json.dumps([sys.argv[1:],data])+"\\n")\nif sys.argv[-1]=={str(b)!r}:\n subprocess.run([{real_git!r},"-C",{str(b)!r},"update-ref","refs/heads/victim",{newer!r}],check=True)\n subprocess.run([{real_git!r},"-C",{str(f.path)!r},"update-ref","refs/remotes/origin/victim",{newer!r}],check=True)\n');hook.chmod(0o700)
        f.git('config','core.hooksPath',str(hooks));request={'remote':'origin','branch':'victim'}
        delete(f,request,fail=True);record=history(f)[0]
        assert head(a) is None and head(b)==newer and [e['phase'] for e in record['endpoints']]==['deleted','failed']
        assert f.git('rev-parse','refs/remotes/origin/victim').stdout.strip().decode()==newer
        events=[json.loads(line) for line in log.read_text().splitlines()];assert len(events)==2 and all(e[0][0]=='origin' for e in events)
        assert all('refs/heads/victim '+tip+'\n' in e[1] for e in events),events
        # Native file/configured hooks are each invoked once with original argv/stdin.
        f=seed('configured-hook');a=bare('configured-server');publish(f,a);f.git('remote','add','origin',str(a));f.git('fetch','-q','origin');log=root/'configured-log'
        hook=f.path/'.git/hooks/pre-push';hook.write_text(f'#!{sys.executable}\nimport json,sys\nwith open({str(log)!r},"a") as log:log.write(json.dumps([sys.argv[1:],sys.stdin.read()])+"\\n")\n');hook.chmod(0o700)
        f.git('config','hook.extra.event','pre-push');f.git('config','--add','hook.extra.event','reference-transaction');f.git('config','hook.extra.command',shlex.quote(str(hook))+' configured')
        delete(f,{'remote':'origin','branch':'victim'});events=[json.loads(line) for line in log.read_text().splitlines()];pushes=[e for e in events if 'refs/heads/victim ' in e[1]]
        assert len(pushes)==2 and sorted(e[0] for e in pushes)==sorted([['origin',str(a)],['configured','origin',str(a)]]),pushes
        assert pushes[0][1]==pushes[1][1]
        # Explicit expectations permit push-only workflows; no ls-remote server read.
        f=seed('push-only');a=bare('push-only-server');publish(f,a);f.git('remote','add','origin',str(a));shim=root/'shim';shim.mkdir();wrapper=shim/'git';wrapper.write_text(f'#!{sys.executable}\nimport os,sys\nif "ls-remote" in sys.argv and "--get-url" not in sys.argv:sys.exit(87)\nos.execv({real_git!r},[{real_git!r},*sys.argv[1:]])\n');wrapper.chmod(0o700)
        old_path=os.environ['PATH'];os.environ['PATH']=str(shim)+os.pathsep+old_path
        try:
            request={'remote':'origin','branch':'victim','expected':[oid(f)]};plan=preview(f,request);assert plan['supplied_expectations'];delete(f,request,plan);assert head(a) is None
            f.rpc('remote_branch_delete_preview',request={'remote':'origin','branch':'victim'},fail=True)
        finally:os.environ['PATH']=old_path
        # Exact custom and negative fetch refspecs; local branch mappings stay local.
        for kind in ['custom','negative','heads']:
            f=seed('refspec-'+kind);a=bare('refspec-server-'+kind);publish(f,a);f.git('remote','add','origin',str(a));f.git('config','--unset-all','remote.origin.fetch')
            destination='refs/heads/keep' if kind=='heads' else 'refs/cache/team/victim'
            f.git('config','--add','remote.origin.fetch','+refs/heads/*:'+('refs/heads/*' if kind=='heads' else 'refs/cache/team/*'))
            if kind=='heads':f.git('config','--replace-all','remote.origin.fetch','+refs/heads/victim:refs/heads/keep')
            if kind=='negative':f.git('config','--add','remote.origin.fetch','^refs/heads/victim')
            f.git('update-ref',destination,oid(f));plan=preview(f,{'remote':'origin','branch':'victim'})
            assert bool(plan['cached_refs'])==(kind=='custom')
            delete(f,{'remote':'origin','branch':'victim'},plan)
            assert (f.git('show-ref','--verify','--quiet',destination,check=False).returncode==0)==(kind!='custom')
        # Native insteadOf/pushInsteadOf, multiple fallback URLs, and empty resets.
        for kind in ['instead','push-instead','fallback','reset']:
            f=seed('rewrite-'+kind);a=bare('rewrite-server-'+kind);publish(f,a);f.git('remote','add','origin','alias:repo')
            key='pushInsteadOf' if kind=='push-instead' else 'insteadOf';f.git('config','url.'+str(a)+'.'+key,'alias:repo')
            if kind=='fallback':f.git('config','--add','remote.origin.url',str(a))
            if kind=='reset':f.git('config','--add','remote.origin.pushurl','/never-use');f.git('config','--add','remote.origin.pushurl','');f.git('config','--add','remote.origin.pushurl',str(a))
            delete(f,{'remote':'origin','branch':'victim'});assert head(a) is None
        # Server-only tips can be fetched before mutation; no FETCH_HEAD/index writes.
        f=seed('fetch-backup');writer=seed('writer');(writer.path/'foreign').write_text('server-only');writer.commit();a=bare('fetch-backup-server');publish(writer,a);f.git('remote','add','origin',str(a))
        before=(f.path/'.git/index').read_bytes();request={'remote':'origin','branch':'victim','fetch_backup':True};result=delete(f,request);record=history(f)[0];assert record['endpoints'][0]['backup_oid']==oid(writer)
        assert not (f.path/'.git/FETCH_HEAD').exists() and (f.path/'.git/index').read_bytes()==before
        f.rpc('restore_remote_tip',receipt_id=result['receipt_id'],endpoint=0,name='retained-foreign');assert f.git('show','retained-foreign:foreign').stdout==b'server-only'
        # Symbolic recovery refs never dereference into active local branches.
        reference=record['endpoints'][0]['backup_ref'];f.git('symbolic-ref',reference,'refs/heads/main');f.rpc('forget_remote_deletion',receipt_id=result['receipt_id'],fail=True);assert head(f.path,'main')==oid(f)
        # Already absent remotes allow stale cache pruning without deleting local refs.
        f=seed('absent');a=bare('absent-server');f.git('remote','add','origin',str(a));f.git('update-ref','refs/remotes/origin/victim',oid(f));request={'remote':'origin','branch':'victim'};delete(f,request);assert history(f)[0]['endpoints'][0]['phase']=='already_missing'
        # Server policy refusal and malformed requests leave all remote tips intact.
        f=seed('policy');a=bare('policy-server');publish(f,a);f.git('remote','add','origin',str(a));git_at(a,'config','receive.denyDeletes','true');delete(f,{'remote':'origin','branch':'victim'},fail=True);assert head(a)==oid(f)
        for request in [{'remote':'origin','branch':'refs/tags/victim'},{'remote':str(a),'branch':'victim'},{'remote':'origin','branch':'victim','expected':['abcd']},{'remote':'origin','branch':'victim','expected':[]}]:f.rpc('remote_branch_delete_preview',request=request,fail=True)
        # Corrupt index and preferences are irrelevant to a ref-only remote deletion.
        f=seed('corrupt');a=bare('corrupt-server');publish(f,a);f.git('remote','add','origin',str(a));(f.path/'.git/index').write_bytes(b'not an index');delete(f,{'remote':'origin','branch':'victim'});assert (f.path/'.git/index').read_bytes()==b'not an index'
        # SHA-256, reftable and linked-worktree metadata paths use the same protocol.
        for kind,options in [('sha256',['--object-format=sha256']),('reftable',['--ref-format=reftable']),('linked',[])]:
            f=seed('native-'+kind,*options);a=bare('native-server-'+kind,*(['--object-format=sha256'] if kind=='sha256' else []));publish(f,a);f.git('remote','add','origin',str(a))
            if kind=='linked':
                linked=root/'linked';f.git('worktree','add','-qb','linked',str(linked));f.path=linked
            result=delete(f,{'remote':'origin','branch':'victim'});f.rpc('restore_remote_tip',receipt_id=result['receipt_id'],endpoint=0,name='restore-native');assert head(f.path,'restore-native')==oid(f)
        # Canonical refs may contain another refs/heads prefix in the branch name.
        f=seed('nested-ref');a=bare('nested-ref-server');publish(f,a,'refs/heads/topic');f.git('remote','add','origin',str(a));assert preview(f,{'remote':'origin','branch':'topic'})['endpoints'][0]['expected'] is None;delete(f,{'remote':'origin','branch':'refs/heads/refs/heads/topic'});assert head(a,'refs/heads/topic') is None
        # Push mirror/follow-tags defaults cannot broaden an explicit deletion.
        f=seed('mirror');a=bare('mirror-server');publish(f,a);publish(f,a,'keep');f.git('remote','add','origin',str(a));f.git('config','remote.origin.mirror','true');f.git('config','push.followTags','true');f.git('tag','-am','local tag','local-tag');delete(f,{'remote':'origin','branch':'victim'});assert head(a) is None and head(a,'keep')==oid(f) and git_at(a,'show-ref','--verify','--quiet','refs/tags/local-tag',check=False).returncode==1
        # A missing local tip can be deliberately deleted and its notice forgotten.
        f=seed('no-backup');a=bare('no-backup-server');publish(writer,a);f.git('remote','add','origin',str(a));request={'remote':'origin','branch':'victim'};plan=preview(f,request);assert not plan['endpoints'][0]['available_locally'];result=delete(f,request,plan);assert result['warnings'] and history(f)[0]['endpoints'][0]['backup_oid'] is None;f.rpc('forget_remote_deletion',receipt_id=result['receipt_id']);assert history(f)==[]
        # Expecting absence is still a lease: a branch that exists is retained.
        f=seed('expect-absent');a=bare('expect-absent-server');publish(f,a);f.git('remote','add','origin',str(a));delete(f,{'remote':'origin','branch':'victim','expected':[None]},fail=True);assert head(a)==oid(f)
        # Native diagnostics and the public journal omit URL userinfo and tokens.
        f=seed('url-errors');url='http://private-user:private-secret@127.0.0.1:1/repo?token=private-token';f.git('remote','add','origin',url)
        error=f.rpc('remote_branch_delete_preview',request={'remote':'origin','branch':'victim'},fail=True);assert all(secret not in error.stderr for secret in ['private-user','private-secret','private-token'])
        delete(f,{'remote':'origin','branch':'victim','expected':[oid(f)]},fail=True);public=json.dumps(history(f));assert all(secret not in public for secret in ['private-user','private-secret','private-token'])
        if lfs:
            f=seed('lfs');a=bare('lfs-server');f.git('lfs','install','--local');f.git('lfs','track','*.lfs');(f.path/'payload.lfs').write_bytes(b'native LFS branch tip');f.commit();f.git('remote','add','origin',str(a));f.git('push','-q','origin','HEAD:refs/heads/victim');result=delete(f,{'remote':'origin','branch':'victim'});assert head(a) is None;f.rpc('restore_remote_tip',receipt_id=result['receipt_id'],endpoint=0,name='restored-lfs');assert f.git('show','restored-lfs:payload.lfs').stdout.startswith(b'version https://git-lfs.github.com/spec/v1')
        # Interrupted push after server deletion is recorded as uncertain, never replayed.
        f=seed('cancel');a=bare('cancel-server');publish(f,a);f.git('remote','add','origin',str(a));marker=root/'remote-mutated';hook=a/'hooks/post-receive';hook.write_text(f'#!{sys.executable}\nimport pathlib,time\npathlib.Path({str(marker)!r}).touch()\ntime.sleep(60)\n');hook.chmod(0o700)
        request={'remote':'origin','branch':'victim'};plan=preview(f,request)
        process=subprocess.Popen([str(BINARY),'-C',str(f.path),'repo','-'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        process.stdin.write(json.dumps({'method':'delete_remote_branch','request':request,'basis':plan['basis']}));process.stdin.close();process.stdin=None
        try:
            deadline=time.time()+20
            while not marker.exists() and time.time()<deadline:time.sleep(.02)
            assert marker.exists();process.send_signal(signal.SIGINT);out,err=process.communicate(timeout=15);assert process.returncode==130,(process.returncode,out,err)
        finally:
            if process.poll() is None:process.kill();process.wait()
        assert head(a) is None;record=history(f)[0];assert record['phase']=='pushing' and record['endpoints'][0]['phase']=='pushing' and record['endpoints'][0]['backup_oid']==oid(f)
        assert all(str(root) not in json.dumps(r) for r in history(f))
        # Journal no-follow/nonblocking/size validation does not hang history reads.
        base=f.path/'.git/desktop-remote-branch-deletions';id=record['id'];file=base/(id+'.json');original=file.read_bytes();file.unlink();file.symlink_to(root/'global');assert history(f)[0]['error'];file.unlink();os.mkfifo(file);assert history(f)[0]['error'];file.unlink();file.write_bytes(b'x'*(1024*1024+1));assert history(f)[0]['error'];file.write_bytes(original)
    print('remote deletion: leases, native transport/hooks, multi-URL partial outcomes, cache guards, recovery and cancellation passed')

if __name__=='__main__':main()
