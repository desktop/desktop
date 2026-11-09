"""Actual LFS payload previews and selected staging/unstaging/discard, offline."""
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from discard_advanced import Fixture


def changes(view, hunk=None):
    hunks = view['hunks'] if hunk is None else [view['hunks'][hunk]]
    return [line['id'] for item in hunks for line in item['lines'] if line['kind'] in ('added', 'deleted')]


def pointer(body):
    return f"version https://git-lfs.github.com/spec/v1\noid sha256:{hashlib.sha256(body).hexdigest()}\nsize {len(body)}\n".encode()


def media(f):
    return Path(os.fsdecode(next(line.removeprefix(b'LocalMediaDir=') for line in f.git('lfs','env').stdout.splitlines() if line.startswith(b'LocalMediaDir='))))


def cached(f, body):
    oid = hashlib.sha256(body).hexdigest()
    return media(f) / oid[:2] / oid[2:4] / oid


def index(f, name):
    raw = f.git('show', b':' + os.fsencode(name)).stdout
    if not raw: return b''
    oid = next(line.removeprefix(b'oid sha256:').decode() for line in raw.splitlines() if line.startswith(b'oid '))
    return (media(f) / oid[:2] / oid[2:4] / oid).read_bytes()


def select(f, name, view, ids=None, fail=False):
    return f.rpc('select_diff',path=name,staged=view['staged'],basis=view['basis'],lines=changes(view) if ids is None else ids,fail=fail)


def create(root, name='data.lfs', *options):
    f = Fixture(root, *options)
    assert f.rpc('lfs_install')['code'] == 0
    f.git('lfs','track','*.lfs')
    return f, f.path / name


def main():
    binary = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    assert binary, 'Install git-lfs or set GIT_LFS_BIN'
    os.environ['PATH'] = str(Path(binary).resolve().parent) + os.pathsep + os.environ['PATH']
    os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
    with tempfile.TemporaryDirectory(prefix='desktop-lfs-diff-') as temporary:
        root = Path(temporary); os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global')
        f, file = create(root/'text')
        base = b''.join(f'line {n}\n'.encode() for n in range(60))
        modified = base.replace(b'line 2\n', b'changed two\n').replace(b'line 50\n',b'changed fifty\n')
        file.write_bytes(base); f.commit(); file.write_bytes(modified)
        (f.path/'unrelated').write_bytes(b'keep staged'); f.git('add','--','unrelated')
        unrelated = f.git('ls-files','--stage','--','unrelated').stdout
        view = f.rpc('diff_detail',path='data.lfs')
        assert view['kind'] == 'text' and view['can_select'] and len(view['hunks']) == 2, view
        assert view['before']['lfs']['state'] == 'available' and view['before']['size'] == len(base)
        assert all('version https:' not in line['text'] for h in view['hunks'] for line in h['lines'])
        first = changes(view,0); select(f,'data.lfs',view,first)
        assert index(f,'data.lfs') == base.replace(b'line 2\n',b'changed two\n') and file.read_bytes() == modified
        assert f.git('ls-files','--stage','--','unrelated').stdout == unrelated
        select(f,'data.lfs',view,first,fail=True)
        select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs'))
        assert index(f,'data.lfs') == modified
        staged = f.rpc('diff_detail',path='data.lfs',staged=True)
        assert staged['before']['lfs']['state'] == staged['after']['lfs']['state'] == 'available'
        select(f,'data.lfs',staged,changes(staged,0))
        assert index(f,'data.lfs') == base.replace(b'line 50\n',b'changed fifty\n')
        select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs',staged=True))
        assert index(f,'data.lfs') == base and file.read_bytes() == modified
        view = f.rpc('diff_detail',path='data.lfs'); selection = {'basis':view['basis'],'lines':changes(view,0)}
        undo = f.discard('data.lfs',scope='working_tree',selection=selection)
        assert file.read_bytes() == base.replace(b'line 50\n',b'changed fifty\n') and index(f,'data.lfs') == base
        f.undo(undo); assert file.read_bytes() == modified
        # Changing LFS configuration expires an already captured selection.
        view = f.rpc('diff_detail',path='data.lfs'); before_index = (f.path/'.git/index').read_bytes()
        f.git('config','filter.lfs.smudge','git-lfs smudge --skip -- %f')
        select(f,'data.lfs',view,fail=True)
        assert (f.path/'.git/index').read_bytes() == before_index
        f.rpc('lfs_install',force=True)
        # A broken/forged clean filter cannot publish ordinary bytes as pointers.
        f.git('config','--unset','filter.lfs.process'); f.git('config','filter.lfs.clean','cat')
        view = f.rpc('diff_detail',path='data.lfs'); select(f,'data.lfs',view,fail=True)
        assert (f.path/'.git/index').read_bytes() == before_index and file.read_bytes() == modified
        f.rpc('lfs_install',force=True)
        select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs')); f.git('commit','-qm','modified LFS')
        history = f.rpc('commit_diff',path='data.lfs',commit='HEAD')
        assert history['kind'] == 'text' and len(history['hunks']) == 2 and not history['can_select']
        # Prove preview reads never fetch or recreate the evicted object.
        contacts = []
        class Server(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                contacts.append(self.path); self.send_response(404); self.send_header('Content-Length','0'); self.end_headers()
            do_GET = do_POST
        server = ThreadingHTTPServer(('127.0.0.1',0),Server)
        worker = threading.Thread(target=server.serve_forever,daemon=True); worker.start()
        try:
            f.git('config','lfs.url',f'http://127.0.0.1:{server.server_port}/objects')
            cache = cached(f,modified); cache.unlink(); file.write_bytes(modified + b'working\n')
            before_index = (f.path/'.git/index').read_bytes(); working = file.read_bytes()
            for method, params in [('diff_detail',{}),('diff_detail',{'staged':True}),('commit_diff',{'commit':'HEAD'})]:
                missing = f.rpc(method,path='data.lfs',**params)
                assert missing['kind'] == 'lfs_unavailable' and not missing['hunks'] and not missing['can_select'], missing
                assert not cache.exists() and not contacts
            assert (f.path/'.git/index').read_bytes() == before_index and file.read_bytes() == working
            cache.write_bytes(b'x' * len(modified))
            corrupt = f.rpc('diff_detail',path='data.lfs')
            assert corrupt['before']['lfs']['state'] == 'corrupt' and corrupt['kind'] == 'lfs_unavailable'
            cache.unlink(); outside = root/'outside'; outside.write_bytes(modified); cache.symlink_to(outside)
            assert f.rpc('diff_detail',path='data.lfs')['before']['lfs']['state'] == 'unavailable'
            assert outside.read_bytes() == modified
            cache.unlink(); os.mkfifo(cache)
            assert f.rpc('diff_detail',path='data.lfs')['kind'] == 'lfs_unavailable'
            cache.unlink(); cache.write_bytes(modified)
            assert not contacts
        finally: server.shutdown(); server.server_close(); worker.join()
        file.unlink(); select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs'))
        assert f.git('ls-files','--','data.lfs').stdout == b''
        select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs',staged=True))
        assert index(f,'data.lfs') == modified and not file.exists()
        file.write_bytes(b''); select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs'))
        assert f.git('show',':data.lfs').stdout == b''
        select(f,'data.lfs',f.rpc('diff_detail',path='data.lfs',staged=True))
        assert index(f,'data.lfs') == modified; file.write_bytes(modified)
        # New/deleted files, empty index content, CRLF/no-newline bytes and raw paths.
        for name in ['new.lfs',':(glob)*.lfs','-dash.lfs','line\nbreak.lfs','\udcff.lfs']:
            path = {'bytes':list(os.fsencode(name))}
            target = f.path/name; target.write_bytes(b'one\r\ntwo\r\nlast')
            view = f.rpc('diff_detail',path=path); assert view['can_select']
            ids = changes(view); select(f,path,view,[ids[0],ids[-1]])
            assert index(f,name) == b'one\r\nlast' and target.read_bytes() == b'one\r\ntwo\r\nlast'
            select(f,path,f.rpc('diff_detail',path=path,staged=True))
            assert f.git('--literal-pathspecs','ls-files','--',name).stdout == b''
        # SHA-256 Git blobs, split indexes, linked trees and a configured cache.
        for label, options in [('sha256',['--object-format=sha256']),('linked',[]),('split',[]),('storage',[])]:
            x, target = create(root/label,'data.lfs',*options)
            if label == 'storage': x.git('config','lfs.storage',str(root/'custom store'))
            target.write_bytes(b'before\nsecond\n'); x.commit()
            if label == 'linked':
                linked = root/'worktree'; x.git('worktree','add','-qb','linked',str(linked)); x.path = linked; target = linked/'data.lfs'
            if label == 'split': x.git('config','core.splitIndex','true'); x.git('update-index','--split-index')
            target.write_bytes(b'after\nsecond\n'); view = x.rpc('diff_detail',path='data.lfs'); select(x,'data.lfs',view)
            assert index(x,'data.lfs') == target.read_bytes()
        # A conflict's stage previews expose actual bodies; missing objects do
        # not turn into pointer-text conflict choices or repair the cache.
        c, target = create(root/'conflict')
        target.write_bytes(b'base\nsecond\n'); c.commit()
        c.git('switch','-qc','side'); target.write_bytes(b'side\nsecond\n'); c.commit()
        c.git('switch','main'); target.write_bytes(b'main\nsecond\n'); c.commit()
        assert c.git('merge','side',check=False).returncode != 0
        detail = c.rpc('conflict_detail',path='data.lfs')
        assert [item['text'] for item in detail['stages']] == ['base\nsecond\n','main\nsecond\n','side\nsecond\n']
        assert all(item['preview']['lfs']['state'] == 'available' for item in detail['stages'])
        side_cache = cached(c,b'side\nsecond\n'); side_cache.unlink()
        before = (c.path/'.git/index').read_bytes()
        detail = c.rpc('conflict_detail',path='data.lfs')
        assert detail['stages'][2]['text'] is None and detail['stages'][2]['preview']['lfs']['state'] == 'missing'
        assert not side_cache.exists() and (c.path/'.git/index').read_bytes() == before
        side_cache.write_bytes(b'side\nsecond\n')
        c.rpc('resolve_conflict',path='data.lfs',choice='ours',basis=detail['basis'])
        assert target.read_bytes() == b'main\nsecond\n' and index(c,'data.lfs') == b'main\nsecond\n'
        assert not c.git('ls-files','-u').stdout
        # Images, binary bodies and large pointer sizes expose payload metadata.
        x, target = create(root/'formats')
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==')
        target.write_bytes(png); x.commit(); target.write_bytes(png+b'after')
        view = x.rpc('diff_detail',path='data.lfs'); assert view['kind'] == 'image' and base64.b64decode(view['before']['image']['data']) == png
        target.write_bytes(b'before\x00binary'); x.commit(); target.write_bytes(b'after\x00binary')
        assert x.rpc('diff_detail',path='data.lfs')['kind'] == 'binary'
        target.write_bytes(b'large\n' * 180000); x.commit(); target.write_bytes(b'working small')
        large = x.rpc('diff_detail',path='data.lfs'); assert large['kind'] == 'too_large' and large['before']['lfs']['state'] == 'too_large' and large['before']['size'] == 1080000
        # Preserve extension pointers verbatim, and never preview encoded bytes.
        encoded = b'encoded extension bytes'; target.write_bytes(encoded); x.git('add','--','data.lfs')
        extended = pointer(encoded).replace(b'oid sha256:',b'ext-0-example sha256:' + b'a'*64 + b'\noid sha256:')
        blob_file = root/'extension-pointer'; blob_file.write_bytes(extended)
        oid = x.git('hash-object','-w','--no-filters','--',str(blob_file)).stdout.strip().decode()
        x.git('update-index','--cacheinfo','100644',oid,'data.lfs')
        extension = x.rpc('diff_detail',path='data.lfs'); assert extension['kind'] == 'lfs_unavailable' and extension['before']['lfs']['state'] == 'extension'
        # Noncanonical historical pointers retain their Git identity while
        # previews and new selections use the verified payload body.
        old = pointer(encoded).rstrip(b'\n').replace(b'git-lfs.github',b'hawser.github').replace(b'\n',b'\r\n').replace(b'size ',b'size +0')
        blob_file.write_bytes(old)
        oid = x.git('hash-object','-w','--no-filters','--',str(blob_file)).stdout.strip().decode()
        x.git('update-index','--cacheinfo','100644',oid,'data.lfs'); target.write_bytes(encoded+b' edited')
        old_view = x.rpc('diff_detail',path='data.lfs')
        assert old_view['before']['oid'] == oid and old_view['before']['lfs']['state'] == 'available' and old_view['can_select']
        select(x,'data.lfs',old_view); assert index(x,'data.lfs') == target.read_bytes()
        # Configured extensions disable selection even before a new extension
        # pointer has been staged, without invoking the configured command.
        marker = root/'extension-must-not-run'
        x.git('config','lfs.extension.test.clean','touch ' + str(marker))
        target.write_bytes(encoded+b' another edit')
        extension_config = x.rpc('diff_detail',path='data.lfs')
        assert not extension_config['can_select'] and not marker.exists()
        x.git('config','--remove-section','lfs.extension.test')
        fake = root/'missing-lfs'; fake.mkdir()
        tool = fake/'git-lfs'; tool.write_text('#!/bin/sh\nexit 1\n'); tool.chmod(0o700)
        os.environ['PATH'] = str(fake) + os.pathsep + os.environ['PATH']; os.environ['GIT_EXEC_PATH'] = str(fake)
        unavailable = x.rpc('diff_detail',path='data.lfs')
        assert unavailable['kind'] == 'lfs_unavailable' and unavailable['before']['lfs']['state'] == 'unavailable'

    print('PASS: actual local LFS text/image/binary/history previews; selected staging/unstaging/discard; stale/broken filters; no fetch/cache mutation; missing/corrupt/symlink/FIFO cache entries; raw names, custom caches, SHA256/split/linked indexes')


if __name__ == '__main__': main()
