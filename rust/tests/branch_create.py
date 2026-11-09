"""Reviewed branch creation shares leave/bring, native tracking and phase recovery."""
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

ASK='AskForConfirmation'
LEAVE='StashOnCurrentBranch'
BRING='MoveToNewBranch'



def partial_creation_cases(root):
    def seed(label):
        f=Fixture(root/label);(f.path/'file').write_text('base');f.commit();return f
    def create(f,name,**parameters):
        plan=f.rpc('create_branch_preview',name=name,**{key:parameters[key] for key in ['start_point','checkout'] if key in parameters})
        return f.rpc('create_branch',name=name,basis=plan['basis'],**parameters)
    # Ref-only creation is valid during an unrelated merge conflict and never
    # rewrites its unmerged stages or working conflict markers.
    f=seed('during-merge');f.git('switch','-qc','side');(f.path/'file').write_text('side');f.commit();f.git('switch','-q','main');(f.path/'file').write_text('main');f.commit()
    assert f.git('merge','side',check=False).returncode
    index=(f.path/'.git/index').read_bytes();working=(f.path/'file').read_bytes();unmerged=f.git('ls-files','-u','-z').stdout
    create(f,'ref-only-conflicted')
    assert (f.path/'.git/index').read_bytes()==index and (f.path/'file').read_bytes()==working and f.git('ls-files','-u','-z').stdout==unmerged
    assert f.rpc('snapshot')['operation']['kind']=='merge'
    create(f,'switch-conflicted',checkout=True,strategy=BRING,fail=True)
    assert f.git('show-ref','--verify','--quiet','refs/heads/switch-conflicted',check=False).returncode
    # A failed post-checkout hook can report failure after HEAD has changed.
    f=seed('failed-checkout-hook');(f.path/'file').write_text('keep working');(f.path/'loose').write_text('keep untracked')
    shell=shutil.which('sh');assert shell
    hook=f.path/'.git/hooks/post-checkout';hook.write_text(f'#!{shell}\nexit 65\n');hook.chmod(0o700)
    create(f,'created-before-hook',checkout=True,strategy=LEAVE,fail=True)
    item=f.rpc('checkout_history')[0];assert item['receipt']['phase']=='switching' and item['saved_stashes']
    assert f.rpc('snapshot')['branch']=='created-before-hook'
    saved=item['saved_stashes'][0];assert f.git('show',saved['oid']+':file').stdout==b'keep working'
    assert f.git('show',saved['parents'][2]+':loose').stdout==b'keep untracked'
    # A start ref moved by an external native writer between preflight and Git
    # creation cannot lead to a switch/stash at an unreviewed target.
    f=seed('source-race');f.git('branch','start');(f.path/'file').write_text('source remains');(f.path/'loose').write_text('loose remains')
    target=f.git('commit-tree','HEAD^{tree}','-m','changed source').stdout.strip().decode()
    tool_dir=root/'source-race-wrapper';tool_dir.mkdir();real=shutil.which('git');assert real
    tool=tool_dir/'git';tool.write_text(f'#!{sys.executable}\nimport subprocess,sys\na=sys.argv[1:]\nif "branch" in a and "raced" in a: subprocess.run([{real!r},"-C",{str(f.path)!r},"update-ref","refs/heads/start",{target!r}],check=True)\nr=subprocess.run([{real!r},*a])\nsys.exit(r.returncode)\n');tool.chmod(0o700)
    old=os.environ['PATH'];os.environ['PATH']=str(tool_dir)+os.pathsep+old
    try:create(f,'raced',start_point='refs/heads/start',checkout=True,strategy=LEAVE,fail=True)
    finally:os.environ['PATH']=old
    assert f.rpc('snapshot')['branch']=='main' and (f.path/'file').read_text()=='source remains' and (f.path/'loose').read_text()=='loose remains'
    assert not f.rpc('stash_list')['entries'] and f.git('show-ref','--verify','--quiet','refs/heads/raced',check=False).returncode==1
    assert f.rpc('checkout_history')[0]['receipt']['phase']=='creating_branch'



def index_and_unborn_cases(root):
    f=Fixture(root/'corrupt-index');(f.path/'file').write_text('base');f.commit()
    index=f.path/'.git/index';index.write_bytes(b'corrupt index retained exactly')
    # Native Git can create a ref without consulting its index.
    f.git('branch','native-control')
    plan=f.rpc('create_branch_preview',name='rust-ref')
    result=f.rpc('create_branch',name='rust-ref',basis=plan['basis'])
    assert result['created'] and index.read_bytes()==b'corrupt index retained exactly' and f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
    f.rpc('create_branch_preview',name='requires-index',checkout=True,fail=True)
    # Unrelated saved metadata is also not an input to ref-only Git branch.
    f=Fixture(root/'corrupt-stash');(f.path/'file').write_text('base');f.commit();(f.path/'.git/refs/stash').write_text('broken ref\n')
    plan=f.rpc('create_branch_preview',name='without-stash');f.rpc('create_branch',name='without-stash',basis=plan['basis'])
    assert (f.path/'.git/refs/stash').read_text()=='broken ref\n'
    # An unborn source can create/switch directly from a fetched commit, including
    # its existing symbolic branch name; files are populated by native switch.
    source=Fixture(root/'unborn-source');(source.path/'file').write_text('fetched base');source.commit()
    for name,start in [('main','FETCH_HEAD'),('from-remote','refs/remotes/origin/main')]:
        f=Fixture(root/('unborn-'+name));f.git('remote','add','origin',str(source.path));f.git('fetch','-q','origin','main:refs/remotes/origin/main')
        (f.path/'prepared').write_text('staged data');f.git('add','--','prepared');(f.path/'loose').write_text('untracked data')
        plan=f.rpc('create_branch_preview',name=name,start_point=start,checkout=True)
        assert not plan['same_branch'] and plan['target']['creation']['defer_to_switch']
        f.rpc('create_branch',name=name,start_point=start,checkout=True,strategy=BRING,basis=plan['basis'])
        assert f.rpc('snapshot')['branch']==name and (f.path/'file').read_text()=='fetched base'
        assert f.git('show',':prepared').stdout==b'staged data' and (f.path/'loose').read_text()=='untracked data'
        if name=='from-remote':assert f.git('config','branch.from-remote.remote').stdout==b'origin\n'
    # Ref-only creation at the current unborn symbolic name follows native Git:
    # creating its commit ref does not populate or rewrite working/index files.
    f=Fixture(root/'unborn-current-ref');f.git('fetch','-q',str(source.path),'main');(f.path/'loose').write_text('kept')
    plan=f.rpc('create_branch_preview',name='main',start_point='FETCH_HEAD')
    f.rpc('create_branch',name='main',start_point='FETCH_HEAD',basis=plan['basis'])
    assert f.git('show-ref','--verify','--quiet','refs/heads/main').returncode==0 and not (f.path/'file').exists() and (f.path/'loose').read_text()=='kept'


def main():
    lfs=os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-create-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        if lfs:os.environ['PATH']=str(Path(lfs).parent)+os.pathsep+os.environ['PATH']
        def seed(label,*options):
            f=Fixture(root/label,*options);(f.path/'file').write_text(''.join(f'line {i}\n' for i in range(30)));f.commit();return f
        def review(f,name='new',**kwargs):return f.rpc('create_branch_preview',name=name,**kwargs)
        def create(f,name='new',**kwargs):
            arguments={key:kwargs[key] for key in ['start_point','checkout','no_track'] if key in kwargs}
            plan=review(f,name,**arguments)
            return f.rpc('create_branch',name=name,basis=plan['basis'],**kwargs)
        def ref(f,name):return f.git('show-ref','--verify','--quiet','refs/heads/'+name,check=False).returncode==0
        def wrapper(f,label,body):
            directory=root/label;directory.mkdir();real=shutil.which('git');assert real
            tool=directory/'git';tool.write_text(f'#!{sys.executable}\nimport subprocess,sys,time\nfrom pathlib import Path\na=sys.argv[1:]\nreal={real!r}\nrepo={str(f.path)!r}\n'+body);tool.chmod(0o700);return directory
        # Creating only a ref preserves current files, index, branch and stashes.
        f=seed('no-checkout');(f.path/'file').write_text('staged');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('loose')
        index=(f.path/'.git/index').read_bytes();status=f.git('status','--porcelain=v2','-z').stdout
        plan=review(f);assert not plan['dirty'] and not (f.path/'.git/desktop-checkout').exists()
        result=create(f);assert result['created'] and not result['checked_out'] and ref(f,'new')
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n' and (f.path/'.git/index').read_bytes()==index
        assert f.git('status','--porcelain=v2','-z').stdout==status and not f.rpc('stash_list')['entries']
        # Ask and previous-stash replacement consent precede branch creation.
        f=seed('leave');(f.path/'file').write_text('previous');previous=f.rpc('stash_save',desktop=True)['oid']
        (f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');raw=os.fsdecode(b'raw-\xff');(f.path/raw).write_bytes(b'loose\0')
        plan=review(f,checkout=True)
        result=f.rpc('create_branch',name='new',checkout=True,basis=plan['basis'],fail=True);assert json.loads(result.stdout)['requires_confirmation']
        assert not ref(f,'new') and not (f.path/'.git/desktop-checkout').exists()
        result=create(f,checkout=True,strategy=LEAVE,fail=True);assert json.loads(result.stdout)['requires_confirmation'] and not ref(f,'new')
        result=create(f,checkout=True,strategy=LEAVE,replace_stash=True)
        assert result['created'] and result['checked_out'] and f.rpc('snapshot')['branch']=='new'
        entries=f.rpc('stash_list')['entries'];assert len(entries)==1 and entries[0]['branch']=='main' and entries[0]['oid']!=previous
        assert f.git('show',entries[0]['oid']+':file').stdout==b'working' and f.git('show',entries[0]['parents'][1]+':file').stdout==b'index'
        assert f.git('show',entries[0]['parents'][2]+':'+raw).stdout==b'loose\0' and not (f.path/raw).exists()
        # Direct bring from HEAD keeps staging and does not create a temporary stash.
        f=seed('direct');(f.path/'file').write_text('index');f.git('add','--','file');(f.path/'file').write_text('working');(f.path/'loose').write_text('loose')
        create(f,checkout=True,strategy=BRING)
        assert f.git('show',':file').stdout==b'index' and (f.path/'file').read_text()=='working' and not f.rpc('stash_list')['entries']
        # Different start points use normal conflict-aware temporary bring.
        f=seed('fallback');base=(f.path/'file').read_text();f.git('switch','-qc','target');(f.path/'file').write_text(base.replace('line 29','target 29'));f.commit();f.git('switch','-q','main')
        (f.path/'file').write_text(base.replace('line 0','index 0'));f.git('add','--','file');(f.path/'file').write_text(base.replace('line 0','index 0').replace('line 1\n','working 1\n'));(f.path/'loose').write_text('carry')
        create(f,start_point='refs/heads/target',checkout=True,strategy=BRING,restore_index=True)
        assert f.rpc('snapshot')['branch']=='new' and (f.path/'file').read_text()==base.replace('line 0','index 0').replace('line 1\n','working 1\n').replace('line 29','target 29')
        assert b'index 0\n' in f.git('show',':file').stdout and b'working 1\n' not in f.git('show',':file').stdout and not f.rpc('stash_list')['entries']
        # A conflicted application retains the created branch and its saved data.
        f=seed('conflict');f.git('switch','-qc','target');(f.path/'file').write_text('target');f.commit();f.git('switch','-q','main');(f.path/'file').write_text('local')
        create(f,start_point='target',checkout=True,strategy=BRING,fail=True)
        item=f.rpc('checkout_history')[0];assert item['receipt']['phase']=='applying' and item['receipt']['target']['creation']['start_point']=='target' and item['saved_stashes']
        assert ref(f,'new') and f.git('ls-files','-u').stdout and f.rpc('snapshot')['branch']=='new'
        # Native tracking defaults, inherit and explicit no-track match native Git.
        for mode,source,name in [('true','refs/remotes/origin/topic','topic'),('simple','refs/remotes/origin/topic','different'),('always','refs/heads/main','always'),('inherit','refs/heads/main','inherited')]:
            f=seed('tracking-'+mode);f.git('remote','add','origin',str(root/'not-contacted'));head=f.git('rev-parse','HEAD').stdout.strip().decode();f.git('update-ref','refs/remotes/origin/topic',head)
            f.git('branch','refs/remotes/origin/topic');f.git('config','branch.autoSetupMerge',mode);f.git('config','branch.autoSetupRebase','always');f.git('config','branch.main.remote','origin');f.git('config','branch.main.merge','refs/heads/topic')
            f.git('-c','core.warnAmbiguousRefs=false','branch','--',name+'-control',source)
            create(f,name=name,start_point=source)
            for key in ['remote','merge','rebase']:
                actual=f.git('config',f'branch.{name}.{key}',check=False);expected=f.git('config',f'branch.{name}-control.{key}',check=False)
                # simple tracks only matching remote/local names, so native control
                # deliberately has a different name and must be compared separately.
                if mode!='simple':assert actual.stdout==expected.stdout and actual.returncode==expected.returncode,(mode,key,actual.stdout,expected.stdout)
            if mode=='simple':assert not f.git('config','branch.different.remote',check=False).stdout
            create(f,name='no-tracking',start_point=source,no_track=True)
            assert not f.git('config','branch.no-tracking.remote',check=False).stdout
            if mode=='true':assert f.git('config','branch.topic.merge').stdout==b'refs/heads/topic\n'
        # Rev expressions/detached sources pin commits; tagged ref identity is bound.
        f=seed('revisions');first=f.git('rev-parse','HEAD').stdout.strip().decode();(f.path/'more').write_text('more');f.commit()
        create(f,start_point='HEAD~1');assert f.git('rev-parse','refs/heads/new').stdout.strip().decode()==first
        f.git('switch','--detach','-q');create(f,name='from-detached',checkout=True);assert f.rpc('snapshot')['branch']=='from-detached'
        f.git('tag','-a','tagged','-m','first tag');plan=review(f,name='from-tag',start_point='refs/tags/tagged');f.git('tag','-fa','tagged','-m','different tag')
        f.rpc('create_branch',name='from-tag',start_point='refs/tags/tagged',basis=plan['basis'],fail=True);assert not ref(f,'from-tag')
        # Every relevant review input is fenced before any ref/stash mutation.
        for kind in ['bytes','index','head','source-ref','config','stash','destination']:
            f=seed('stale-'+kind);f.git('branch','start');(f.path/'loose').write_text('one');plan=review(f,start_point='start',checkout=True)
            if kind=='bytes':
                path=f.path/'loose';stat=path.stat();path.write_text('two');os.utime(path,ns=(stat.st_atime_ns,stat.st_mtime_ns))
            elif kind=='index':f.git('add','--','loose')
            elif kind=='head':f.git('switch','-qc','other')
            elif kind=='source-ref':
                new=f.git('commit-tree','HEAD^{tree}','-m','new start').stdout.strip().decode();f.git('update-ref','refs/heads/start',new)
            elif kind=='config':f.git('config','branch.autoSetupMerge','always')
            elif kind=='stash':(f.path/'file').write_text('saved');f.rpc('stash_save',message='external')
            else:f.git('branch','new')
            before=f.git('stash','list','--format=%H').stdout
            f.rpc('create_branch',name='new',start_point='start',checkout=True,strategy=BRING,basis=plan['basis'],fail=True)
            assert f.git('stash','list','--format=%H').stdout==before and not (f.path/'.git/desktop-checkout').exists()
            assert ref(f,'new')==(kind=='destination')
        # Unborn creation carries the exact staged/untracked files natively.
        f=Fixture(root/'unborn');(f.path/'file').write_text('staged');f.git('add','--','file');(f.path/'loose').write_text('loose')
        f.rpc('create_branch_preview',name='new',fail=True)
        create(f,checkout=True)
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/new\n' and f.git('show',':file').stdout==b'staged' and (f.path/'loose').read_text()=='loose'
        assert not ref(f,'new') and f.rpc('snapshot')['head'] is None
        for label,options in [('sha256',('--object-format=sha256',)),('split',()),('linked',()),('reftable',('--ref-format=reftable',))]:
            f=seed(label,*options)
            if label=='split':f.git('update-index','--split-index')
            if label=='linked':
                linked=root/'linked-tree';f.git('worktree','add','-qb','other',str(linked));f.path=linked
            (f.path/'file').write_text('carry');create(f,checkout=True,strategy=BRING)
            assert f.rpc('snapshot')['branch']=='new' and (f.path/'file').read_text()=='carry'
        # Before/after native create failures never discard files or replay creation.
        for when in ['before','after']:
            f=seed('failure-'+when);(f.path/'file').write_text('retained')
            body=('if "branch" in a and "new" in a: sys.exit(72)\nr=subprocess.run([real,*a])\n' if when=='before' else 'r=subprocess.run([real,*a])\nif "branch" in a and "new" in a and r.returncode==0: sys.exit(72)\n')+'sys.exit(r.returncode)\n'
            tool=wrapper(f,'wrapper-'+when,body);path=os.environ['PATH'];os.environ['PATH']=str(tool)+os.pathsep+path
            try:create(f,checkout=True,strategy=BRING,fail=True)
            finally:os.environ['PATH']=path
            assert (f.path/'file').read_text()=='retained' and f.rpc('snapshot')['branch']=='main' and ref(f,'new')==(when=='after')
            assert f.rpc('checkout_history')[0]['receipt']['phase']=='creating_branch'
        # Cancellation after Git creates a ref is uncertain, recorded and recoverable.
        f=seed('cancel');(f.path/'file').write_text('cancel data');started=root/'created'
        tool=wrapper(f,'cancel-wrapper',f'r=subprocess.run([real,*a])\nif "branch" in a and "new" in a and r.returncode==0:\n    Path({str(started)!r}).write_text("created")\n    time.sleep(60)\nsys.exit(r.returncode)\n')
        child=subprocess.Popen([str(BINARY),'-C',str(f.path),'create-branch','new','--checkout','--strategy','bring'],env={**os.environ,'PATH':str(tool)+os.pathsep+os.environ['PATH']},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+12
            while not started.exists() and time.monotonic()<deadline:time.sleep(.02)
            assert started.exists();child.send_signal(signal.SIGINT);child.communicate(timeout=8);assert child.returncode==130
        finally:
            if child.poll() is None:child.kill();child.wait()
        assert ref(f,'new') and (f.path/'file').read_text()=='cancel data' and f.rpc('checkout_history')[0]['receipt']['phase']=='creating_branch'
        partial_creation_cases(root)
        index_and_unborn_cases(root)
        # A corrupt preference file does not interfere with read-only preview or ref-only creation.
        f=seed('prefs');config=root/'registry.json';prefs=config.with_suffix('.preferences.json');prefs.write_text('{bad')
        command=[str(BINARY),'-C',str(f.path),'--config',str(config),'create-branch','previewed','--preview','--checkout']
        assert subprocess.run(command,capture_output=True).returncode==0 and prefs.read_text()=='{bad' and not ref(f,'previewed')
        assert subprocess.run([str(BINARY),'-C',str(f.path),'--config',str(config),'create-branch','ref-only'],capture_output=True).returncode==0
        # A FIFO cannot block checkout-history or metadata-only acknowledgement.
        item=f.rpc('checkout_history')[0];identifier=item['receipt']['id'];receipt=f.path/'.git/desktop-checkout'/f'{identifier}.json';receipt.unlink();os.mkfifo(receipt,0o600)
        assert f.rpc('checkout_history')[0]['error'];f.rpc('acknowledge_checkout',receipt_id=identifier,fail=True)
        if lfs:
            f=seed('lfs');f.rpc('lfs_install');f.git('lfs','track','*.lfs');payload=f.path/'data.lfs';payload.write_bytes(b'base');f.commit()
            payload.write_bytes(b'index');f.git('add','--','data.lfs');payload.write_bytes(b'working');(f.path/'new.lfs').write_bytes(b'untracked')
            os.environ['GIT_LITERAL_PATHSPECS']='1'
            try:create(f,checkout=True,strategy=LEAVE)
            finally:os.environ.pop('GIT_LITERAL_PATHSPECS',None)
            entry=f.rpc('stash_list')['entries'][0];f.rpc('stash_apply',oid=entry['oid'],restore_index=True)
            assert payload.read_bytes()==b'working' and (f.path/'new.lfs').read_bytes()==b'untracked'
    print('PASS: reviewed creation/start refs, native tracking/no-track, leave/bring, stale review fences, unborn/native backends, cancellation/phase recovery and real LFS')

if __name__=='__main__':main()
