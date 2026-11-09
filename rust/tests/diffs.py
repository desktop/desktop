"""Real Git tests for captured diffs and transactional partial staging."""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-diff-') as temporary:
        root = Path(temporary)
        repo = root/'repo'
        subprocess.run(['git','init','-q','-b','main',str(repo)],check=True)
        def git(*args,check=True):return subprocess.run(['git','-C',str(repo),*args],capture_output=True,check=check)
        git('config','user.name','Diff Test');git('config','user.email','diff@example.invalid');git('config','commit.gpgsign','false')
        def rpc(method,fail=False,**fields):
            result=subprocess.run([str(BINARY),'-C',str(repo),'repo','-'],input=json.dumps({'method':method,**fields}),capture_output=True,text=True)
            if fail:
                assert result.returncode!=0,(method,result)
                return result
            assert result.returncode==0,(method,result.stdout,result.stderr)
            value=json.loads(result.stdout)
            assert value.get('code',0)==0,value
            return value
        def detail(path='file.txt',staged=False):return rpc('diff_detail',path=path,staged=staged)
        def changes(view):return [line['id'] for hunk in view['hunks'] for line in hunk['lines'] if line['kind'] in ['added','deleted']]
        def select(view,lines=None,fail=False):return rpc('select_diff',path=view['path'],staged=view['staged'],basis=view['basis'],lines=changes(view) if lines is None else lines,fail=fail)
        def index(path='file.txt'):return git('show',':'+path).stdout
        def commit():git('add','--all');git('commit','-qm','checkpoint')
        baseline=''.join(f'line {number}\n' for number in range(60)).encode()
        file=repo/'file.txt';file.write_bytes(baseline);commit()
        modified=baseline.replace(b'line 2\n',b'changed two\n').replace(b'line 50\n',b'changed fifty\n')
        file.write_bytes(modified)
        (repo/'unrelated').write_text('preserved');git('add','--','unrelated')
        before_unrelated=git('ls-files','--stage','--','unrelated').stdout
        view=detail();assert view['kind']=='text' and len(view['hunks'])==2 and view['can_select']
        first=[line['id'] for line in view['hunks'][0]['lines'] if line['kind'] in ['added','deleted']]
        select(view,first)
        assert index()==baseline.replace(b'line 2\n',b'changed two\n') and file.read_bytes()==modified
        assert git('ls-files','--stage','--','unrelated').stdout==before_unrelated
        select(view,first,fail=True) # Any index edit expires the old view.
        select(detail())
        assert index()==modified
        staged=detail(staged=True);assert len(staged['hunks'])==2
        select(staged,[line['id'] for line in staged['hunks'][0]['lines'] if line['kind'] in ['added','deleted']])
        assert index()==baseline.replace(b'line 50\n',b'changed fifty\n')
        select(detail(staged=True));assert index()==baseline and file.read_bytes()==modified
        # Reject stale content, invalid IDs/context, and a lock owned by another process.
        view=detail();old_index=(repo/'.git/index').read_bytes()
        file.write_bytes(modified+b'external\n');select(view,fail=True)
        assert (repo/'.git/index').read_bytes()==old_index
        current=detail();context=[line['id'] for h in current['hunks'] for line in h['lines'] if line['kind']=='context'][0]
        select(current,[context],fail=True);select(current,[999999],fail=True);select(current,[],fail=True)
        lock=repo/'.git/index.lock';lock.write_bytes(b'other-owner');select(current,fail=True);assert lock.read_bytes()==b'other-owner';lock.unlink()
        assert not list((repo/'.git').glob('desktop-diff-*'))
        # New/deleted files and the lack of a final newline survive selective updates.
        new=repo/'new.txt';new.write_bytes(b'one\ntwo\nthree')
        view=detail('new.txt');ids=changes(view);select(view,[ids[0],ids[2]])
        assert index('new.txt')==b'one\nthree' and new.read_bytes()==b'one\ntwo\nthree'
        view=detail('new.txt',True);select(view,[changes(view)[0]])
        assert index('new.txt')==b'three'
        select(detail('new.txt',True));assert git('ls-files','--','new.txt').stdout==b''
        # Filename bytes and pathspec-looking names must remain literal.
        for name in [b':(glob)*.txt',b'-flag',b'line\nbreak',b'raw-\xff']:
            path={'bytes':list(name)}
            with open(os.fsencode(repo)+b'/'+name,'wb') as handle:handle.write(b'first\nlast')
            select(detail(path));assert git('show',b':'+name).stdout==b'first\nlast'
        commit()
        deleted_before=git('show','HEAD:file.txt').stdout
        file.unlink();view=detail();deleted=changes(view);select(view,[deleted[0]])
        assert index()==deleted_before.split(b'\n',1)[1] and not file.exists()
        select(detail());assert git('ls-files','--','file.txt').stdout==b''
        select(detail(staged=True));assert index()==git('show','HEAD:file.txt').stdout and not file.exists()
        git('restore','--','file.txt')
        # Git's built-in CRLF conversion is honored while the working file is untouched.
        git('config','core.autocrlf','true')
        file.write_bytes(b'alpha\nbeta\n');commit()
        file.write_bytes(b'alpha\r\nBETA\r\n');view=detail();select(view)
        assert index()==b'alpha\nBETA\n' and file.read_bytes()==b'alpha\r\nBETA\r\n'
        git('config','core.autocrlf','false');file.write_bytes(b'alpha\nBETA\n');commit()
        # Attributes, binary/image data, symlinks, and protected metadata.
        (repo/'binary').write_bytes(b'a\x00b');assert detail('binary')['kind']=='binary'
        image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==')
        (repo/'image.png').write_bytes(image);view=detail('image.png');assert view['kind']=='image' and base64.b64decode(view['after']['image']['data'])==image
        (repo/'.gitattributes').write_text('*.dat -diff\n*.flt filter=custom\n')
        (repo/'file.dat').write_text('text marked binary');assert detail('file.dat')['kind']=='binary'
        (repo/'file.flt').write_text('filtered text');assert not detail('file.flt')['can_select']
        (repo/'large').write_bytes(b'x'*(1024*1024+1));assert detail('large')['kind']=='too_large'
        external=root/'outside';external.write_text('private')
        (repo/'link').symlink_to(external);assert detail('link')['kind']=='symlink'
        rpc('diff_detail',path='.git/config',fail=True)
        rpc('diff_detail',path='../outside',fail=True)
        (repo/'linked-dir').symlink_to(root,target_is_directory=True);rpc('diff_detail',path='linked-dir/outside',fail=True)
        # Staged rename content compares with its original path and preserves the rename.
        git('mv','file.txt','renamed.txt');renamed=repo/'renamed.txt';renamed.write_bytes(b'alpha\nBETA\nextra\n')
        select(detail('renamed.txt'));view=detail('renamed.txt',True)
        assert view['before']['mode']=='100644';select(view)
        assert index('renamed.txt')==b'alpha\nBETA\n' and not file.exists()
        # Split-index extensions remain readable after a partial transaction.
        git('update-index','--split-index')
        renamed.write_bytes(b'alpha\nBETA\nchanged\n')
        select(detail('renamed.txt'))
        assert index('renamed.txt')==b'alpha\nBETA\nchanged\n'
        select(detail('renamed.txt',True));assert index('renamed.txt')==b'alpha\nBETA\n'
        # Independent working tree indexes must be updated in the correct Git directory.
        worktree=root/'worktree';git('worktree','add','-qb','linked',str(worktree),'HEAD')
        working=worktree/'file.txt';working.write_bytes(b'linked content\n')
        old_repo=repo;repo=worktree
        select(detail());assert index()==b'linked content\n'
        repo=old_repo;assert index('renamed.txt')==b'alpha\nBETA\n'
        # Unborn SHA-256 repositories have no index initially.
        sha=root/'sha256';subprocess.run(['git','init','-q','--object-format=sha256',str(sha)],check=True)
        repo=sha;file=repo/'file.txt';file.write_bytes(b'first\nlast')
        select(detail());assert index()==b'first\nlast'
        select(detail(staged=True));assert not git('ls-files','--','file.txt').stdout
        (repo/'.gitattributes').write_text('*.utf16 working-tree-encoding=UTF-16LE\n')
        encoded=repo/'file.utf16';encoded.write_bytes('first\nsecond'.encode('utf-16le'))
        select(detail('file.utf16'));assert index('file.utf16')==b'first\nsecond'
        # Friendly CLI commands expose the same captured diff and selection token.
        structured=subprocess.run([str(BINARY),'-C',str(repo),'diff','--json','file.txt'],capture_output=True,text=True,check=True)
        parsed=json.loads(structured.stdout)
        picked=changes(parsed)
        selected=subprocess.run([str(BINARY),'-C',str(repo),'select-lines','file.txt','--basis',parsed['basis'],'--lines',','.join(map(str,picked))],capture_output=True,text=True)
        assert selected.returncode==0,selected.stderr
        assert index()==b'first\nlast'
    print('PASS: partial staging/unstaging, stale views, index lock ownership, raw paths, new/deleted files, CRLF, images/binaries, renames and linked worktrees')


if __name__=='__main__':main()
