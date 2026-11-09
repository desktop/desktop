"""External editor argv/TTY contracts and reviewed staging of edited conflicts."""
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import signal
import shutil
import subprocess
import sys
import tempfile
import time

from discard_advanced import BINARY, Fixture
from smoke import WebSocket


def main():
    lfs_binary = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    with tempfile.TemporaryDirectory(prefix='desktop-editor-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(root/'global')
        if lfs_binary:
            os.environ['PATH'] = str(Path(lfs_binary).parent) + os.pathsep + os.environ['PATH']
        configuration = root/'repositories.json'
        f = Fixture(root/'repo with spaces')
        file = f.path/'file'; file.write_bytes(b'base\n'); f.commit()
        def cli(*args, check=True):
            return subprocess.run([str(BINARY),'-C',str(f.path),'--config',str(configuration),*args],capture_output=True,text=True,check=check)
        def preference(editor):
            return cli('preferences','set',json.dumps({'external_editor':editor}))
        old_preferences = root/'repositories.preferences.json'
        old_preferences.write_text(json.dumps({'version':1,'theme':'system','poll_interval_ms':2000}))
        old_contents = old_preferences.read_bytes()
        initial = json.loads(cli('preferences').stdout)
        assert initial['external_editor'] == {'kind':'automatic'}
        assert old_preferences.read_bytes() == old_contents
        for bad in [{'kind':'command','program':''},{'kind':'command','program':'editor','args':['x']*65},{'kind':'unknown'}]:
            assert cli('preferences','set',json.dumps({'external_editor':bad}),check=False).returncode
        script = root/'record editor.py'; marker = root/'editor.json'
        script.write_text('import json,os,sys,time\nfrom pathlib import Path\nPath(sys.argv[1]).write_text(json.dumps({"args":[os.fsencode(a).hex() for a in sys.argv[2:]],"cwd":os.fsencode(os.getcwd()).hex(),"tty":os.isatty(0)}))\n')
        command = {'kind':'command','program':sys.executable,'args':[str(script),str(marker),'{path}','{repo}','$(touch must-not-exist)'],'terminal':False}
        preference(command)
        info = json.loads(cli('editor','--list').stdout)
        assert info['configuration'] == command and isinstance(info['editors'],list)
        raw_name = b'raw-\xff " $(touch must-not-exist)\n.txt'
        raw_path = os.fsencode(f.path)+b'/'+raw_name
        with open(raw_path,'wb') as output: output.write(b'raw file\n')
        assert cli('editor',os.fsdecode(raw_name)).returncode == 0
        recorded = json.loads(marker.read_text())
        assert recorded['args'] == [raw_path.hex(),os.fsencode(f.path).hex(),b'$(touch must-not-exist)'.hex()]
        assert not (f.path/'must-not-exist').exists()
        alias = root/'python-editor-alias'; alias.symlink_to(sys.executable)
        native = subprocess.run([str(alias),'-c','import sys;print(sys.executable)'],capture_output=True,text=True,check=True).stdout
        preference({'kind':'command','program':str(alias),'args':['-c','import sys;print(sys.executable)'],'terminal':False})
        assert cli('editor','file').stdout == native
        command['args'] = [str(script),str(marker),'prefix={repo}']
        preference(command); cli('editor','file')
        assert json.loads(marker.read_text())['args'] == [(b'prefix='+os.fsencode(f.path)).hex(),os.fsencode(file).hex()]
        outside = root/'outside'; outside.write_text('private')
        (f.path/'outside-link').symlink_to(outside)
        (f.path/'metadata-link').symlink_to(f.path/'.git/config')
        for path in ['../outside','.git/config','outside-link','metadata-link','missing']:
            assert cli('editor',path,check=False).returncode
        # CLI launches replace the process, preserving an interactive terminal
        # and the editor's exit status even for terminal editors.
        preference({'kind':'command','program':sys.executable,'args':['-c','import os,sys;input();sys.exit(37 if os.isatty(0) else 3)'],'terminal':True})
        primary, secondary = pty.openpty()
        process = subprocess.Popen([str(BINARY),'-C',str(f.path),'--config',str(configuration),'editor','file'],stdin=secondary,stdout=secondary,stderr=secondary)
        os.close(secondary)
        try:
            os.write(primary,b'input for terminal editor\n')
            assert process.wait(timeout=10) == 37
        finally:
            if process.poll() is None: process.kill(); process.wait()
            os.close(primary)
        # The authenticated bridge uses the same stored command, fences repo
        # selection and refuses a terminal editor without attempting a launch.
        server = subprocess.Popen([str(BINARY),'-C',str(f.path),'--config',str(configuration),'serve','--port','0'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
        ws = None
        child_pid = None
        stop_editor = root/'stop-editor'
        try:
            assert select.select([server.stderr],[],[],10)[0]
            authority,token = re.search(r'http://([^/]+)/#token=(\S+)',server.stderr.readline()).groups()
            ws = WebSocket(authority,'http://'+authority); ws.send({'token':token}); assert ws.receive()['ready']
            count = 0
            def rpc(method, **fields):
                nonlocal count
                count += 1; ws.send({'id':count,'method':method,**fields})
                response = ws.receive(); assert response['id'] == count; return response
            selected = rpc('snapshot')['result']['root_id']
            assert 'interactive terminal' in rpc('open_editor',path='file',repository_id=selected)['error']
            assert 'error' in rpc('open_editor',path='file',repository_id='obsolete')
            command['args'] = [str(script),str(marker),'{path}']; command['terminal'] = False
            preference(command); marker.unlink()
            assert rpc('open_editor',path={'bytes':list(raw_name)},repository_id=selected)['result']['code'] == 0
            deadline = time.monotonic()+5
            while not marker.exists() and time.monotonic()<deadline: time.sleep(.01)
            assert json.loads(marker.read_text())['args'] == [raw_path.hex()]
            assert not json.loads(marker.read_text())['tty']
            assert rpc('available_editors',repository_id='obsolete')['result']['configuration'] == command
            for path in ['outside-link','metadata-link','../outside']:
                assert 'error' in rpc('open_editor',path=path,repository_id=selected)
            preference({'kind':'command','program':sys.executable,'args':['-c','import sys;sys.exit(17)'],'terminal':False})
            assert '17' in rpc('open_editor',path='file')['error']
            persistent = root/'persistent-editor.py'; pid_file = root/'editor-pid'
            persistent.write_text('import os,sys,time\nfrom pathlib import Path\nPath(sys.argv[1]).write_text(str(os.getpid()))\nwhile not Path(sys.argv[2]).exists(): time.sleep(.05)\n')
            preference({'kind':'command','program':sys.executable,'args':[str(persistent),str(pid_file),str(stop_editor)],'terminal':False})
            started = time.monotonic()
            assert rpc('open_editor',path='file')['result']['code'] == 0
            assert time.monotonic()-started < 3
            deadline = time.monotonic()+5
            while not pid_file.exists() and time.monotonic()<deadline: time.sleep(.01)
            child_pid = int(pid_file.read_text())
            assert os.getpgid(child_pid) == child_pid
            assert rpc('snapshot')['result']['root_id'] == selected

        finally:
            if ws: ws.close()
            server.send_signal(signal.SIGINT)
            try: server.wait(timeout=6)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
            try:
                if child_pid: os.kill(child_pid,0)
            finally: stop_editor.touch()
        def conflict(name, filename='file', attributes=None, encoding='utf-8', lfs=False, **options):
            test = Fixture(root/name, *options.get('init_options',[]))
            if lfs:
                assert test.rpc('lfs_install')['code'] == 0
                test.git('lfs','track','*.lfs')
            if attributes: (test.path/'.gitattributes').write_text(attributes)
            target = test.path/filename
            def write(text): target.write_bytes(text.encode(encoding))
            write('base\n'); test.commit()
            test.git('switch','-qc','side'); write('theirs\n'); test.commit()
            test.git('switch','-q','main'); write('ours\n'); test.commit()
            assert test.git('merge','side',check=False).returncode
            return test, target
        f, file = conflict('normal')
        unrelated = f.path/'unrelated'; unrelated.write_text('keep staged'); f.git('add','--','unrelated')
        untouched = f.git('ls-files','--stage','--','unrelated').stdout
        review = f.rpc('conflict_detail',path='file')
        assert review['working']['sha256'] == hashlib.sha256(file.read_bytes()).hexdigest()
        index = (f.path/'.git/index').read_bytes()
        blocked = json.loads(f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True).stdout)
        assert blocked['requires_confirmation'] and blocked['markers'] >= 3
        assert (f.path/'.git/index').read_bytes() == index
        file.write_text('edited result\n')
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        review = f.rpc('conflict_detail',path='file')
        f.git('config','core.autocrlf','true')
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        f.git('config','core.autocrlf','false')
        review = f.rpc('conflict_detail',path='file')
        f.git('branch','same-head'); f.git('symbolic-ref','HEAD','refs/heads/same-head')
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        f.git('symbolic-ref','HEAD','refs/heads/main')
        head = f.git('rev-parse','HEAD').stdout.strip()
        other_head = f.git('commit-tree','HEAD^{tree}','-m','changed HEAD').stdout.strip()
        f.git('update-ref','HEAD',other_head)
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        f.git('update-ref','HEAD',head)
        operation = f.path/'.git/MERGE_MSG'; original_message = operation.read_bytes()
        operation.write_bytes(original_message+b'changed context')
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        operation.write_bytes(original_message)
        attributes = f.path/'.gitattributes'; attributes.write_text('file -text\n')
        f.rpc('stage_conflict',path='file',basis=review['basis'],fail=True)
        attributes.unlink()
        assert (f.path/'.git/index').read_bytes() == index
        review = f.rpc('conflict_detail',path='file')
        assert f.rpc('stage_conflict',path='file',basis=review['basis'])['code'] == 0
        assert f.git('show',':file').stdout == b'edited result\n' and file.read_bytes() == b'edited result\n'
        assert not f.git('ls-files','-u').stdout and f.git('ls-files','--stage','--','unrelated').stdout == untouched
        for name, encoding, attrs, options in [
            ('sha256','utf-8',None,['--object-format=sha256']),
            ('encoded','utf-16-le','file text working-tree-encoding=UTF-16LE eol=crlf\n',[]),
            ('split','utf-8',None,[]),
        ]:
            f, file = conflict(name,attributes=attrs,encoding=encoding,init_options=options)
            if name == 'split': f.git('update-index','--split-index')
            content = ('resolved\r\n' if attrs else 'resolved\n').encode(encoding)
            file.write_bytes(content); review = f.rpc('conflict_detail',path='file')
            assert f.rpc('stage_conflict',path='file',basis=review['basis'])['code'] == 0
            assert f.git('show',':file').stdout == b'resolved\n' and file.read_bytes() == content
        f, file = conflict('explicit-markers')
        review = f.rpc('conflict_detail',path='file')
        assert f.rpc('stage_conflict',path='file',basis=review['basis'],allow_markers=True)['code'] == 0
        assert b'<<<<<<<' in f.git('show',':file').stdout
        f, file = conflict('raw',filename=os.fsdecode(b'raw-\xff\n'))
        file.write_text('raw resolved\n'); path = {'bytes':list(os.fsencode(file.name))}
        raw_review = json.loads(cli('conflict',os.fsdecode(os.fsencode(file.name))).stdout)
        assert f.rpc('stage_conflict',path=path,basis=raw_review['basis'])['code'] == 0
        f, file = conflict('deleted')
        file.unlink(); review = f.rpc('conflict_detail',path='file')
        assert review['working']['kind'] == 'absent'
        assert f.rpc('stage_conflict',path='file',basis=review['basis'])['code'] == 0
        assert not f.git('ls-files','--','file').stdout
        if lfs_binary:
            f, file = conflict('lfs',filename='data.lfs',lfs=True)
            file.write_bytes(b'resolved LFS body\n'); review = f.rpc('conflict_detail',path='data.lfs')
            assert f.rpc('stage_conflict',path='data.lfs',basis=review['basis'])['code'] == 0
            pointer = f.git('show',':data.lfs').stdout
            assert b'oid sha256:'+hashlib.sha256(file.read_bytes()).hexdigest().encode() in pointer
        f, file = conflict('changed-during-filter')
        (f.path/'.gitattributes').write_text('file filter=delayed\n')
        delayed_marker = root/'delayed-started'; release = root/'release-filter'
        delayed = root/'delayed.py'
        delayed.write_text('import sys,time\nfrom pathlib import Path\ndata=sys.stdin.buffer.read()\nPath('+repr(str(delayed_marker))+').write_text("started")\nwhile not Path('+repr(str(release))+').exists(): time.sleep(.02)\nsys.stdout.buffer.write(data)\n')
        import shlex
        f.git('config','filter.delayed.clean',shlex.quote(sys.executable)+' '+shlex.quote(str(delayed)))
        f.git('config','filter.delayed.required','true')
        file.write_text('reviewed before filter\n'); review = f.rpc('conflict_detail',path='file')
        before = (f.path/'.git/index').read_bytes()
        operation = subprocess.Popen([str(BINARY),'-C',str(f.path),'repo','-'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        operation.stdin.write(json.dumps({'method':'stage_conflict','path':'file','basis':review['basis']}));operation.stdin.close();operation.stdin=None
        try:
            deadline = time.monotonic()+10
            while not delayed_marker.exists() and time.monotonic()<deadline: time.sleep(.02)
            assert delayed_marker.exists()
            file.write_text('newer editor changes\n'); release.touch()
            operation.communicate(timeout=10)
            assert operation.returncode and (f.path/'.git/index').read_bytes() == before
            assert file.read_text() == 'newer editor changes\n'
        finally:
            release.touch()
            if operation.poll() is None: operation.kill();operation.wait()

        # Cancelling a slow clean filter leaves the real index and working file intact.
        f, file = conflict('cancel')
        (f.path/'.gitattributes').write_text('file filter=slow\n')
        slow_marker = root/'filter-started'
        slow = root/'slow.py'; slow.write_text('import sys,time\nfrom pathlib import Path\nPath('+repr(str(slow_marker))+').write_text("started")\ntime.sleep(60)\nsys.stdout.buffer.write(sys.stdin.buffer.read())\n')
        import shlex
        f.git('config','filter.slow.clean',shlex.quote(sys.executable)+' '+shlex.quote(str(slow)))
        f.git('config','filter.slow.required','true')
        file.write_text('cancelled resolution\n'); review = f.rpc('conflict_detail',path='file')
        original_index = (f.path/'.git/index').read_bytes()
        process = subprocess.Popen([str(BINARY),'-C',str(f.path),'repo','-'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        process.stdin.write(json.dumps({'method':'stage_conflict','path':'file','basis':review['basis']}));process.stdin.close();process.stdin=None
        deadline = time.monotonic()+10
        while not slow_marker.exists() and time.monotonic()<deadline: time.sleep(.02)
        assert slow_marker.exists()
        process.send_signal(signal.SIGINT); process.communicate(timeout=6)
        assert process.returncode == 130 and (f.path/'.git/index').read_bytes() == original_index
        assert not (f.path/'.git/index.lock').exists() and not list((f.path/'.git').glob('desktop-diff-*'))
    print('PASS: editor settings/discovery, raw literal argv, CLI TTY/status, fenced GUI launches, path refusal; reviewed conflict staging, markers, deletion, encoding, SHA256/split/LFS and cancellation')


if __name__ == '__main__': main()
