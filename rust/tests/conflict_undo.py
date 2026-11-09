"""Durable conflict undo: exact stages/files, partial publication, GC and LFS."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from discard_advanced import BINARY, Fixture


def conflict(root, name, filename='file', attributes=None, encoding='utf-8', options=(), lfs=False):
    f = Fixture(root/name,*options)
    if lfs:
        assert f.rpc('lfs_install')['code'] == 0
        f.git('lfs','track','*.lfs')
    if attributes: (f.path/'.gitattributes').write_text(attributes)
    file=f.path/filename
    file.write_bytes('base\n'.encode(encoding));f.commit()
    f.git('switch','-qc','side');file.write_bytes('theirs\n'.encode(encoding));f.commit()
    f.git('switch','-q','main');file.write_bytes('ours\n'.encode(encoding));f.commit()
    assert f.git('merge','side',check=False).returncode
    return f,file


def resolve(f, filename, choice='ours'):
    review=f.rpc('conflict_detail',path=filename)
    return f.rpc('resolve_conflict',path=filename,choice=choice,basis=review['basis'])


def main():
    lfs_binary = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-conflict-undo-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global')
        if lfs_binary:
            os.environ['PATH']=str(Path(lfs_binary).parent)+os.pathsep+os.environ['PATH']
        # Older journal schemas retain their defaults and remain restorable.
        for version in [1,2]:
            f=Fixture(root/f'legacy-v{version}');file=f.path/'file';file.write_bytes(b'base');f.commit()
            file.write_bytes(b'edited');id=f.discard('file');journal=f.path/'.git/desktop-undo'/id/'manifest.json'
            record=json.loads(journal.read_text());assert record['version']==2 and 'purpose' not in record
            assert all('skip_working' not in change for change in record['changes'])
            if version==1:
                record['version']=1
                for key in ['objects','lfs','shared','operation']:record.pop(key,None)
                journal.write_text(json.dumps(record))
            f.undo(id);assert file.read_bytes()==b'edited'
        for choice in ['ours','theirs','delete']:
            f,file=conflict(root,choice)
            original=file.read_bytes();stages=f.git('ls-files','--stage','--','file').stdout
            unrelated=f.path/'unrelated';unrelated.write_bytes(b'preserved staged');f.git('add','--','unrelated')
            retained=f.git('ls-files','--stage','--','unrelated').stdout
            value=resolve(f,'file',choice);id=value['undo_id'];assert value['purpose']=='conflict_choice'
            assert not f.git('ls-files','-u').stdout
            after=file.read_bytes() if file.exists() else None
            if after is not None:
                file.write_bytes(b'newer edit');f.undo(id,fail=True);file.write_bytes(after)
            added=f.path/'later';added.write_text('later staged');f.git('add','--','later')
            cli=subprocess.run([str(BINARY),'-C',str(f.path),'undo',id],capture_output=True,text=True,check=True)
            assert json.loads(cli.stdout)['code']==0
            assert file.read_bytes()==original and f.git('ls-files','--stage','--','file').stdout==stages
            assert f.git('ls-files','--stage','--','unrelated').stdout==retained
            assert f.git('show',':later').stdout==b'later staged'
            assert next(item for item in f.rpc('list_discards') if item['id']==id)['state']=='undone'
        # Undo staging restores conflict stages and keeps newer edits (including deletion).
        for label in ['edited','deleted-after-stage']:
            f,file=conflict(root,label);stages=f.git('ls-files','--stage').stdout
            file.write_bytes(b'edited resolution\n');review=f.rpc('conflict_detail',path='file')
            value=f.rpc('stage_conflict',path='file',basis=review['basis'])
            assert value['purpose']=='conflict_stage'
            if label=='edited': file.write_bytes(b'newer editor contents\n')
            else: file.unlink()
            f.undo(value['undo_id'])
            assert f.git('ls-files','--stage').stdout==stages
            assert file.read_bytes()==b'newer editor contents\n' if label=='edited' else not file.exists()
        # Byte paths, encoding, split indexes, linked worktrees and reftable refs.
        for label,filename,attributes,encoding,options in [
            ('raw',os.fsdecode(b'-raw-\xff\n'),None,'utf-8',()),
            ('encoded','file','file text working-tree-encoding=UTF-16LE eol=crlf\n','utf-16-le',()),
            ('sha256','file',None,'utf-8',('--object-format=sha256',)),
            ('split','file',None,'utf-8',()),
            ('linked','file',None,'utf-8',()),
            ('reftable','file',None,'utf-8',('--ref-format=reftable',)),
        ]:
            f,file=conflict(root,label,filename,attributes,encoding,options)
            if label=='linked':
                # Create the conflict in a linked checkout with its own index/journal.
                f.git('merge','--abort');linked=root/'linked-worktree';f.git('worktree','add','-qb','work',str(linked))
                f.path=linked;file=linked/filename;assert f.git('merge','side',check=False).returncode
            if label=='split':f.git('update-index','--split-index')
            path={'bytes':list(os.fsencode(filename))};before=file.read_bytes();stages=f.git('ls-files','--stage').stdout
            id=resolve(f,path)['undo_id'];f.undo(id)
            assert file.read_bytes()==before and f.git('ls-files','--stage').stdout==stages
        # Prepared records recover either publication prefix without replaying filters.
        for prefix in ['file-only','index-only']:
            f,file=conflict(root,prefix);before=file.read_bytes();index=(f.path/'.git/index').read_bytes()
            id=resolve(f,'file')['undo_id'];directory=f.path/'.git/desktop-undo'/id
            manifest=json.loads((directory/'manifest.json').read_text());manifest['state']='prepared'
            (directory/'manifest.json').write_text(json.dumps(manifest))
            if prefix=='file-only':(f.path/'.git/index').write_bytes(index)
            else:file.write_bytes(before)
            f.undo(id);assert file.read_bytes()==before and f.git('ls-files','-u').stdout
        f,file=conflict(root,'stale-context');id=resolve(f,'file')['undo_id']
        head=f.git('rev-parse','HEAD').stdout.strip();f.git('branch','same-head');f.git('symbolic-ref','HEAD','refs/heads/same-head')
        f.undo(id,fail=True);f.git('symbolic-ref','HEAD','refs/heads/main')
        operation=f.path/'.git/MERGE_MSG';old=operation.read_bytes();operation.write_bytes(old+b'changed')
        f.undo(id,fail=True);operation.write_bytes(old)
        other=f.git('commit-tree','HEAD^{tree}','-m','other').stdout.strip();f.git('update-ref','HEAD',other)
        f.undo(id,fail=True);f.git('update-ref','HEAD',head);f.undo(id)
        # Reftable has no file-ref reservation: detect refs changed while
        # restoring saved objects, before publishing working files or the index.
        for changed_ref in ['head','branch']:
            f,file=conflict(root,f'ref-during-undo-{changed_ref}',options=('--ref-format=reftable',))
            original_head=f.git('rev-parse','HEAD').stdout.strip().decode()
            new_head=f.git('commit-tree','HEAD^{tree}','-m','new head').stdout.strip().decode()
            f.git('branch','same-head');id=resolve(f,'file')['undo_id']
            published=file.read_bytes();published_index=f.git('ls-files','--stage').stdout
            fake=root/f'git-wrapper-{changed_ref}';fake.mkdir();marker=fake/'change-ref';marker.touch()
            real_git=shutil.which('git');assert real_git
            update=['update-ref','HEAD',new_head] if changed_ref=='head' else ['symbolic-ref','HEAD','refs/heads/same-head']
            wrapper=fake/'git'
            wrapper.write_text(f'#!{sys.executable}\nimport os, subprocess, sys\n'
                f'result=subprocess.run([{real_git!r}, *sys.argv[1:]])\n'
                f'if "hash-object" in sys.argv and "--no-filters" in sys.argv and os.path.exists({str(marker)!r}):\n'
                f'    os.unlink({str(marker)!r})\n'
                f'    subprocess.run([{real_git!r}, "-C", {str(f.path)!r}, *{update!r}], check=True)\n'
                'sys.exit(result.returncode)\n');wrapper.chmod(0o700)
            old_path=os.environ['PATH']
            try:
                os.environ['PATH']=str(fake)+os.pathsep+old_path
                result=f.undo(id,fail=True)
                assert 'changed before undo' in result.stderr, result.stderr
                assert not marker.exists() and file.read_bytes()==published
                assert f.git('ls-files','--stage').stdout==published_index
            finally:os.environ['PATH']=old_path
            f.git('symbolic-ref','HEAD','refs/heads/main');f.git('update-ref','HEAD',original_head)
            f.undo(id);assert f.git('ls-files','-u').stdout
        # Symlink choices preserve raw targets; Undo never follows the link.
        f=Fixture(root/'symlink');link=f.path/'link';target=root/'outside-target';target.write_text('keep outside')
        link.symlink_to('base-target');f.commit();f.git('switch','-qc','side')
        link.unlink();link.symlink_to(str(target));f.commit();f.git('switch','-q','main')
        link.unlink();link.symlink_to('ours-target');f.commit();assert f.git('merge','side',check=False).returncode
        stages=f.git('ls-files','--stage').stdout
        id=resolve(f,'link','theirs')['undo_id'];assert os.readlink(link)==str(target)
        f.undo(id);assert os.readlink(link)=='ours-target' and target.read_text()=='keep outside'
        assert f.git('ls-files','--stage').stdout==stages
        # Independent blob backups restore missing original objects, and replacement
        # refs must not substitute the bytes retained under the original object ID.
        f,file=conflict(root,'objects');before=file.read_bytes();stage=f.rpc('conflict_detail',path='file')['stages'][2]['preview']['oid']
        small=f.path/'small';small.write_bytes(b'replacement');replacement=f.git('hash-object','-w','--','small').stdout.strip().decode()
        f.git('replace',stage,replacement)
        id=resolve(f,'file')['undo_id'];f.git('replace','-d',stage)
        blob=f.path/'.git/objects'/stage[:2]/stage[2:];blob.unlink()
        assert f.git('cat-file','-e',stage,check=False).returncode
        f.undo(id);assert f.git('cat-file','blob',stage).stdout==b'theirs\n' and file.read_bytes()==before
        # Gitlink undo never touches the nested checkout, even with new local edits.
        f=Fixture(root/'gitlink');(f.path/'base').write_text('base');f.commit()
        child=Fixture(f.path/'module');(child.path/'file').write_text('base');child.commit()
        ids=[child.git('rev-parse','HEAD').stdout.strip().decode()]
        for text in ['ours','theirs']:
            (child.path/'file').write_text(text);child.commit();ids.append(child.git('rev-parse','HEAD').stdout.strip().decode())
        instructions=b''.join(f'160000 {oid} {stage}\tmodule\0'.encode() for stage,oid in enumerate(ids,1))
        subprocess.run(['git','-C',str(f.path),'update-index','-z','--index-info'],input=instructions,capture_output=True,check=True)
        before=f.git('ls-files','--stage').stdout
        id=resolve(f,'module')['undo_id'];(child.path/'file').write_text('keep local changes')
        f.undo(id);assert f.git('ls-files','--stage').stdout==before and (child.path/'file').read_text()=='keep local changes'
        if lfs_binary:
            for label in ['retained-lfs','missing-lfs','no-lfs-tool']:
                f,file=conflict(root,label,'data.lfs',lfs=True);before=file.read_bytes();stages=f.git('ls-files','--stage').stdout
                preview=f.rpc('conflict_detail',path='data.lfs');objects=[entry['preview']['lfs'] for entry in preview['stages']]
                caches=[f.path/'.git/lfs/objects'/entry['oid'][:2]/entry['oid'][2:4]/entry['oid'] for entry in objects]
                if label=='missing-lfs':caches[2].unlink()
                old_path=os.environ['PATH'];old_exec=os.environ.get('GIT_EXEC_PATH')
                try:
                    if label=='no-lfs-tool':
                        fake=root/'unavailable-lfs';fake.mkdir();tool=fake/'git-lfs';tool.write_text('#!/bin/sh\nexit 1\n');tool.chmod(0o700)
                        os.environ['PATH']=str(fake)+os.pathsep+old_path;os.environ['GIT_EXEC_PATH']=str(fake)
                    value=resolve(f,'data.lfs','delete' if label=='no-lfs-tool' else 'ours');id=value['undo_id']
                    assert bool(value['lfs_payloads_unavailable'])==(label!='retained-lfs')
                    if label=='retained-lfs':
                        for cache in caches:cache.unlink(missing_ok=True)
                    f.undo(id)
                    assert file.read_bytes()==before and f.git('ls-files','--stage').stdout==stages
                    if label=='retained-lfs':assert all(cache.exists() for cache in caches)
                    if label=='missing-lfs':assert not caches[2].exists()
                finally:
                    os.environ['PATH']=old_path
                    if old_exec is None:os.environ.pop('GIT_EXEC_PATH',None)
                    else:os.environ['GIT_EXEC_PATH']=old_exec
    print('PASS: durable conflict choices/staging undo; exact stages/files; newer edits; raw/encoded/SHA256/split/linked/reftable; prepared prefixes; stale/concurrent ref contexts; legacy journals; symlinks; object/LFS eviction; gitlinks; unavailable payloads/tooling')


if __name__=='__main__':main()
