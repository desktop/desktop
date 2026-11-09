"""Typed CLI signal handling preserves Git state and passthrough remains native exec."""
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from cancellation import wait_for
from lifecycle import alive
from smoke import BINARY


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-signals-') as temporary:
        root = Path(temporary)
        repo = root / 'repo'
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        def git(*args):
            return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True, check=True).stdout
        git('config', 'user.name', 'Signal Test')
        git('config', 'user.email', 'signals@example.invalid')
        (repo / 'file.txt').write_text('initial\n')
        git('add', '--', 'file.txt')
        git('commit', '-qm', 'initial')
        original = git('rev-parse', 'HEAD')
        (repo / 'file.txt').write_text('staged\n')
        git('add', '--', 'file.txt')
        marker = root / 'processes.json'
        hook = repo / '.git/hooks/pre-commit'
        hook.write_text(f'#!{sys.executable}\n' + '''import json,os,subprocess,sys,time
from pathlib import Path
child=subprocess.Popen([sys.executable,'-c',"import signal,time;signal.signal(signal.SIGINT,signal.SIG_IGN);print('ready',flush=True);time.sleep(60)"],stdout=subprocess.PIPE,text=True)
child.stdout.readline()
Path(os.environ['SIGNAL_MARKER']).write_text(json.dumps([os.getpid(),child.pid]))
time.sleep(60)
''')
        hook.chmod(0o755)
        env = dict(os.environ, SIGNAL_MARKER=str(marker))
        for sig, code in [(signal.SIGINT, 130), (signal.SIGTERM, 143)]:
            command = subprocess.Popen([str(BINARY), '-C', str(repo), 'commit', 'must not commit'], env=env, stderr=subprocess.PIPE)
            pids = []
            try:
                wait_for(marker.exists, 'CLI hook did not start')
                pids = json.loads(marker.read_text())
                command.send_signal(sig)
                command.wait(timeout=6)
                assert command.returncode == code, (sig, command.returncode, command.stderr.read())
                wait_for(lambda: all(not alive(pid) for pid in pids), 'CLI left command descendants running')
                assert not (repo / '.git/index.lock').exists()
                assert git('rev-parse', 'HEAD') == original
                assert git('show', ':file.txt') == 'staged\n'
            finally:
                if command.poll() is None:
                    command.kill()
                    command.wait()
                for pid in pids:
                    if alive(pid):
                        os.kill(pid, signal.SIGKILL)
                marker.unlink(missing_ok=True)
        config = root / 'registry.json'
        subprocess.run([str(BINARY), '--config', str(config), 'preferences', 'set', '{"theme":"light"}'], check=True, capture_output=True)
        preferences = root / 'registry.preferences.json'
        original_preferences = preferences.read_bytes()
        with open(preferences.with_suffix('.lock'), 'r+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            command = subprocess.Popen([str(BINARY), '--config', str(config), 'preferences', 'set', '{"theme":"dark"}'], stderr=subprocess.PIPE)
            time.sleep(0.15)
            command.send_signal(signal.SIGINT)
            command.wait(timeout=3)
            assert command.returncode == 130, command.stderr.read()
            assert preferences.read_bytes() == original_preferences
        # exec passthrough must leave signal behavior to the forwarded executable.
        tools = root / 'bin'
        tools.mkdir()
        gh = tools / 'gh'
        gh.write_text(f'#!{sys.executable}\n' + '''import os,signal,sys,time
from pathlib import Path
signal.signal(signal.SIGINT,lambda *_:sys.exit(42))
Path(os.environ['SIGNAL_MARKER']).write_text('ready')
time.sleep(60)
''')
        gh.chmod(0o755)
        command = subprocess.Popen([str(BINARY), 'gh', 'custom-command'], env=dict(env, PATH=str(tools) + os.pathsep + os.environ['PATH']))
        try:
            wait_for(marker.exists, 'passthrough did not start')
            command.send_signal(signal.SIGINT)
            command.wait(timeout=3)
            assert command.returncode == 42, command.returncode
        finally:
            if command.poll() is None:
                command.kill()
                command.wait()
    print('PASS: CLI SIGINT/SIGTERM cleanup and exit codes, cancelled metadata locks, and unmodified passthrough signals')


if __name__ == '__main__':
    main()
