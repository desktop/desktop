"""Real native stash metadata, saved files/index, pinned mutations and recovery."""
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


def main():
    lfs_binary = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-stashes-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        if lfs_binary:os.environ['PATH']=str(Path(lfs_binary).parent)+os.pathsep+os.environ['PATH']
        def seeded(name,*options):
            f=Fixture(root/name,*options);(f.path/'file').write_bytes(b'one\ntwo\n');f.commit();return f
        def select(f,index=0):
            listing=f.rpc('stash_list');entry=listing['entries'][index]
            return {'oid':entry['oid'],'index':entry['index'],'basis':listing['basis']}
        def save(f,message='saved',**kwargs):return f.rpc('stash_save',message=message,**kwargs)
        f=Fixture(root/'unborn');(f.path/'new').write_text('keep');result=f.rpc('stash_save',fail=True)
        assert json.loads(result.stdout)['created'] is False and (f.path/'new').read_text()=='keep'
        f=seeded('normal');assert not f.rpc('stash_list')['entries']
        assert save(f)['created'] is False
        (f.path/'file').write_bytes(b'index\ntwo\n');f.git('add','--','file')
        index=f.git('ls-files','--stage','-z').stdout
        (f.path/'file').write_bytes(b'index\nworking\n')
        raw=os.fsdecode(b'-untracked-\xff\n');(f.path/raw).write_bytes(b'raw saved\n')
        (f.path/'.gitignore').write_text('ignored\n');f.git('add','--','.gitignore')
        (f.path/'ignored').write_text('ignored data')
        f.git('tag','main')  # An ambiguous short ref must not change the branch marker.
        saved=save(f,'',desktop=True,include_untracked=True);assert saved['created']
        selected=select(f);assert selected['oid']==saved['oid']
        listing=f.rpc('stash_list');entry=listing['entries'][0]
        assert entry['branch']=='main' and '!!GitHub_Desktop<main>' in entry['message'] and len(entry['parents'])==3
        assert (f.path/'file').read_bytes()==b'one\ntwo\n' and not (f.path/raw).exists() and (f.path/'ignored').read_text()=='ignored data'
        capture=f.rpc('stash_files',oid=entry['oid']);paths={bytes(file['path']['bytes']):file for file in capture['files']}
        assert paths[os.fsencode(raw)]['untracked'] and not paths[b'file']['untracked']
        assert any(file['display_path']=='file' for file in capture['staged_files'])
        for file in [paths[b'file'],paths[os.fsencode(raw)],next(file for file in capture['staged_files'] if file['display_path']=='file')]:
            view=f.rpc('commit_diff',path=file['path'],commit=file['commit'],parent=0)
            assert not view['can_select'] and view['hunks']
        before=f.git('status','--porcelain=v2','-z').stdout;f.rpc('stash_list');f.rpc('stash_files',oid=entry['oid'])
        assert f.git('status','--porcelain=v2','-z').stdout==before
        # A new entry makes the old numeric position/review stale, never applies
        # or removes the newer entry when the caller still selects an older ID.
        (f.path/'file').write_bytes(b'newer stash\n');new=save(f,'newer')
        for method in ['stash_apply','stash_drop','stash_move']:
            f.rpc(method,**selected,**({'branch':'other'} if method=='stash_move' else {}),fail=True)
        assert len(f.rpc('stash_list')['entries'])==2 and (f.path/'file').read_bytes()==b'one\ntwo\n'
        result=f.rpc('stash_apply',oid=saved['oid'],restore_index=True)
        assert result['retained'] and (f.path/'file').read_bytes()==b'index\nworking\n' and (f.path/raw).read_bytes()==b'raw saved\n'
        assert f.git('show',':file').stdout==b'index\ntwo\n'
        f.git('reset','--hard','-q');(f.path/raw).unlink();(f.path/'ignored').unlink();f.git('clean','-fdq')
        pop=f.rpc('stash_apply',**select(f),pop=True);assert not pop['retained']
        assert (f.path/'file').read_bytes()==b'newer stash\n' and len(f.rpc('stash_list')['entries'])==1
        f.git('reset','--hard','-q')
        # Reassociation preserves all trees/parents and replaces only its selected entry.
        selected=select(f);original=f.rpc('stash_list')['entries'][0]
        moved=f.rpc('stash_move',**selected,branch='feature/other')
        assert not moved['original_retained']
        after=f.rpc('stash_list')['entries'][0]
        assert after['branch']=='feature/other' and after['parents']==original['parents'] and after['tree']==original['tree']
        unchanged=f.rpc('stash_move',**select(f),branch='feature/other')
        assert unchanged['unchanged'] and unchanged['oid']==after['oid'] and len(f.rpc('stash_list')['entries'])==1
        assert len(f.rpc('stash_files',oid=after['oid'])['files'])==len(capture['files'])
        # A failure before storing the replacement never removes the old entry.
        f.git('config','user.useConfigOnly','true');f.git('config','--unset','user.name');f.git('config','--unset','user.email')
        selected=select(f);f.rpc('stash_move',**selected,branch='another',fail=True)
        assert f.rpc('stash_list')['entries'][0]['oid']==selected['oid']
        f.git('config','user.name','Stash Test');f.git('config','user.email','stash@example.invalid')
        f.rpc('stash_drop',**select(f));assert not f.rpc('stash_list')['entries']
        # Failed application keeps the stash and exposes normal conflict recovery.
        f=seeded('conflict');(f.path/'file').write_bytes(b'stashed version\n');saved=save(f)
        (f.path/'file').write_bytes(b'committed other version\n');f.commit()
        result=f.rpc('stash_apply',**select(f),pop=True,fail=True);value=json.loads(result.stdout)
        assert value['retained'] and f.git('ls-files','-u').stdout and select(f)['oid']==saved['oid']
        (f.path/'file').write_bytes(b'resolved conflict\n');review=f.rpc('conflict_detail',path='file')
        f.rpc('stage_conflict',path='file',basis=review['basis']);f.commit();f.rpc('stash_drop',**select(f))
        assert not f.rpc('stash_list')['entries']
        # Native index/hash/worktree/ref backends and symlinks remain native Git behavior.
        for label,options in [('sha256',('--object-format=sha256',)),('split',()),('linked',()),('reftable',('--ref-format=reftable',))]:
            f=seeded(label,*options)
            if label=='split':f.git('update-index','--split-index')
            if label=='linked':
                sibling=root/'linked-checkout';f.git('worktree','add','-qb','other',str(sibling));f.path=sibling
            link=f.path/'link';link.symlink_to('outside-not-followed');f.git('add','--','link')
            (f.path/'file').write_bytes(b'changed\0binary\n');value=save(f,'',desktop=True)
            assert value['created'] and len(value['oid'])==(64 if label=='sha256' else 40)
            f.rpc('stash_apply',**select(f),restore_index=True,pop=True)
            assert (f.path/'file').read_bytes()==b'changed\0binary\n' and os.readlink(link)=='outside-not-followed'
            assert not f.rpc('stash_list')['entries']
        # Serialize separate CLI processes against the same common repository.
        f=seeded('parallel-drop')
        for text in ['first','second']:(f.path/'file').write_text(text);save(f,text)
        selected=select(f,1);request=json.dumps({'method':'stash_drop',**selected})
        commands=[subprocess.Popen([str(BINARY),'-C',str(f.path),'repo',request],stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(2)]
        results=[(command.communicate(timeout=15),command.returncode) for command in commands]
        assert sorted(code for _,code in results)==[0,1] and len(f.rpc('stash_list')['entries'])==1
        # Waiting for the application lock is cancellable without invoking Git stash.
        common=Path(os.fsdecode(f.git('rev-parse','--path-format=absolute','--git-common-dir').stdout.strip()))
        (f.path/'file').write_text('keep waiting edit')
        with open(common/'desktop-stash.lock','a+b') as locked:
            fcntl.flock(locked,fcntl.LOCK_EX)
            child=subprocess.Popen([str(BINARY),'-C',str(f.path),'stash','save','blocked'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            time.sleep(.15);child.send_signal(signal.SIGINT);child.communicate(timeout=5)
            assert child.returncode==130 and (f.path/'file').read_text()=='keep waiting edit'
        assert len(f.rpc('stash_list')['entries'])==1
        # Metadata lock symlinks cannot redirect the OS lock to another file.
        lock=common/'desktop-stash.lock';lock.unlink();outside=root/'outside-lock';outside.write_text('untouched');lock.symlink_to(outside)
        f.rpc('stash_save',fail=True);assert outside.read_text()=='untouched' and (f.path/'file').read_text()=='keep waiting edit';lock.unlink()
        for label in ['push-error-after-save','pop-concurrent-store','move-drop-failure']:
            f=seeded(label);(f.path/'file').write_text('saved data');saved=save(f)
            if label=='push-error-after-save':(f.path/'file').write_text('newly saved data')
            external_id=f.git('commit-tree',saved['oid']+'^{tree}','-p',saved['oid']+'^1','-p',saved['oid']+'^2','-m','concurrent saved stash').stdout.strip().decode() if label=='pop-concurrent-store' else saved['oid']
            real_git=shutil.which('git');assert real_git
            fake=root/f'git-wrapper-{label}';fake.mkdir();wrapper=fake/'git'
            wrapper.write_text(f'#!{sys.executable}\nimport subprocess,sys\n'
                f'args=sys.argv[1:]\n'
                + ('if "stash" in args and "drop" in args: sys.exit(42)\n' if label=='move-drop-failure' else '')
                + f'result=subprocess.run([{real_git!r},*args])\n'
                + (f'if "stash" in args and "apply" in args and result.returncode==0: subprocess.run([{real_git!r},"-C",{str(f.path)!r},"stash","store","-m","concurrent store",{external_id!r}],check=True)\n' if label=='pop-concurrent-store' else '')
                + ('if "stash" in args and "push" in args and result.returncode==0: sys.exit(1)\n' if label=='push-error-after-save' else '')
                + 'sys.exit(result.returncode)\n');wrapper.chmod(0o700)
            selected=select(f);old_path=os.environ['PATH']
            try:
                os.environ['PATH']=str(fake)+os.pathsep+old_path
                if label=='push-error-after-save':
                    result=f.rpc('stash_save',message='failure after save',fail=True);value=json.loads(result.stdout)
                    assert value['code']==1 and value['created'] and len(f.rpc('stash_list')['entries'])==2
                    assert f.git('show',value['oid']+':file').stdout==b'newly saved data'
                elif label=='pop-concurrent-store':
                    value=f.rpc('stash_apply',**selected,pop=True)
                    assert value['retained'] and 'list changed' in value['warning'] and len(f.rpc('stash_list')['entries'])==2, value
                    assert (f.path/'file').read_text()=='saved data'
                else:
                    value=f.rpc('stash_move',**selected,branch='new-branch')
                    assert value['original_retained'] and len(f.rpc('stash_list')['entries'])==2
                    assert any(entry['oid']==saved['oid'] for entry in f.rpc('stash_list')['entries'])
            finally:os.environ['PATH']=old_path
        if lfs_binary:
            f=seeded('lfs');f.rpc('lfs_install');f.git('lfs','track','*.lfs');file=f.path/'data.lfs';file.write_bytes(b'base payload\n');f.commit()
            file.write_bytes(b'saved LFS payload\n');f.git('add','--','data.lfs');file.write_bytes(b'working LFS payload\n')
            old=os.environ.get('GIT_LITERAL_PATHSPECS');os.environ['GIT_LITERAL_PATHSPECS']='1'
            try:
                save(f);f.rpc('stash_apply',**select(f),restore_index=True,pop=True)
                assert file.read_bytes()==b'working LFS payload\n' and b'oid sha256:' in f.git('show',':data.lfs').stdout
            finally:
                if old is None:os.environ.pop('GIT_LITERAL_PATHSPECS',None)
                else:os.environ['GIT_LITERAL_PATHSPECS']=old
    print('PASS: structured/branch stashes, saved staged/working/untracked files, pinned apply/pop/drop/move, stale reviews, conflict retention/recovery, byte paths, SHA256/split/linked/reftable, symlinks, cross-process locking/cancellation and native LFS')

if __name__=='__main__':main()
