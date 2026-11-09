"""Cancellation while preview waits for publication registry lock, offline."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

from discard_advanced import BINARY
from publish_context import PublishFixture, snapshot
from publish_preview import request
from repository_context import stop, wait_for


def main():
    home=os.environ.get('HOME')
    with tempfile.TemporaryDirectory(prefix='desktop-preview-cancel-') as temporary:
        root=Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM']='1'; os.environ['GIT_CONFIG_GLOBAL']=str(root/'empty-global')
        s=PublishFixture(root); s.configure(organizations={'alicecase':[]})
        f=s.local('preview cancel'); (f.path/'file').write_text('base\n'); f.commit()
        before=snapshot(s,f)
        git=root/'bin/git'; previous=root/'bin/git-original-wrapper'; git.rename(previous)
        git.write_text(f'#!{sys.executable}\n' + r'''import os,subprocess,sys
from pathlib import Path
args=sys.argv[1:]
result=subprocess.run([str(Path(__file__).with_name('git-original-wrapper')),*args],capture_output=True)
sys.stdout.buffer.write(result.stdout);sys.stdout.buffer.flush()
sys.stderr.buffer.write(result.stderr);sys.stderr.buffer.flush()
if '--absolute-git-dir' in args:
 count_file=Path(os.environ['PREVIEW_GITDIR_COUNT'])
 count=int(count_file.read_text())+1 if count_file.exists() else 1
 count_file.write_text(str(count))
 if count==4:Path(os.environ['PREVIEW_LOCK_STAGE']).write_text('availability')
sys.exit(result.returncode)
''')
        git.chmod(0o700)
        marker=root/'preview-availability'; count=root/'gitdir-count'
        environment={**s.env,'PREVIEW_GITDIR_COUNT':str(count),'PREVIEW_LOCK_STAGE':str(marker)}
        command=[str(BINARY),'--config',str(s.registry),'-C',str(f.path),'repo','-']
        with open(s.registry.with_suffix('.lock'),'a+b') as guard:
            fcntl.flock(guard,fcntl.LOCK_EX)
            child=subprocess.Popen(command,env=environment,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                child.stdin.write(json.dumps({'method':'publish_preview','request':request()})); child.stdin.close(); child.stdin=None
                wait_for(lambda:marker.exists() or child.poll() is not None,'preview did not reach availability',timeout=45)
                if not marker.exists():
                    out,err=child.communicate(timeout=5); s.assert_clean(out+err)
                    raise AssertionError(('preview exited before lock',child.returncode,out,err))
                # The instrumented command is the final Git-dir lookup immediately
                # before the availability helper attempts this held registry lock.
                time.sleep(.3)
                assert child.poll() is None
                child.send_signal(signal.SIGINT)
                out,err=child.communicate(timeout=15); s.assert_clean(out+err)
                assert child.returncode!=0 and not out.strip(),(child.returncode,out,err)
                assert 'cancel' in err.lower()
            finally:
                fcntl.flock(guard,fcntl.LOCK_UN); stop(child)
        assert snapshot(s,f)==before
        assert not any('POST' in row.get('args',[]) for row in s.calls())
        assert os.environ.get('HOME')==home
    print('PASS: preview cancelled while waiting for registry lock, with no output or POST',flush=True)


if __name__=='__main__': main()
