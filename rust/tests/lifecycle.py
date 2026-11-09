"""Check process and socket cleanup while a real bridge RPC is still running."""
import os
from pathlib import Path
import re
import select
import signal
import socket
import subprocess
import sys
import tempfile
import time
from smoke import BINARY, WebSocket


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # A killed child can await OS reaping after its owner exits.
    status = Path(f'/proc/{pid}/status')
    try:
        if status.exists() and 'State:\tZ' in status.read_text():
            return False
    except (FileNotFoundError, ProcessLookupError):
        return False
    return True


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-lifecycle-') as temporary:
        root = Path(temporary)
        tools = root / 'bin'
        tools.mkdir()
        pid_file = root / 'gh.pid'
        gh = tools / 'gh'
        gh.write_text(f'#!{sys.executable}\n' + '''import os,time
from pathlib import Path
Path(os.environ['LIFECYCLE_PID']).write_text(str(os.getpid()))
time.sleep(60)
''')
        gh.chmod(0o755)
        env = dict(os.environ, PATH=str(tools) + os.pathsep + os.environ['PATH'],
                   LIFECYCLE_PID=str(pid_file))
        server = subprocess.Popen([str(BINARY), '--config', str(root / 'registry.json'),
                                   'serve', '--empty', '--port', '0'], env=env,
                                  stderr=subprocess.PIPE, text=True)
        ws = None
        pid = None
        try:
            assert select.select([server.stderr], [], [], 5)[0], 'server did not start'
            match = re.search(r'Open http://([^/]+)/#token=(\S+)', server.stderr.readline())
            assert match, 'missing session URL'
            authority, token = match.groups()
            ws = WebSocket(authority, 'http://' + authority)
            ws.send({'token': token})
            assert ws.receive()['ready']
            ws.send({'id': 1, 'method': 'github', 'request': {
                'action': {'type': 'auth_status', 'hostname': 'github.com'}}})
            deadline = time.monotonic() + 5
            while not pid_file.exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            assert pid_file.exists(), 'RPC did not start gh'
            pid = int(pid_file.read_text())
            assert alive(pid)
            server.send_signal(signal.SIGINT)
            server.wait(timeout=5)
            assert server.returncode == 0
            deadline = time.monotonic() + 5
            while alive(pid) and time.monotonic() < deadline:
                time.sleep(0.02)
            assert not alive(pid), 'server shutdown left its command running'
            host, port = authority.split(':')
            try:
                socket.create_connection((host, int(port)), timeout=1).close()
            except ConnectionRefusedError:
                pass
            else:
                raise AssertionError('listener still accepts connections')
            try:
                result = ws.receive()
                assert result is None, result
            except (EOFError, ConnectionResetError):
                pass
        finally:
            if ws:
                ws.close()
            if server.poll() is None:
                server.kill()
                server.wait()
            if pid and alive(pid):
                os.kill(pid, signal.SIGKILL)
        native = BINARY.with_name('desktop-native')
        help_result = subprocess.run([str(native), '--help'], capture_output=True, text=True)
        assert help_result.returncode == 0 and '--selected' in help_result.stdout
        unsupported = subprocess.run([str(native), '--empty'], capture_output=True, text=True)
        assert unsupported.returncode != 0 and 'desktop-rs serve --empty' in unsupported.stderr
    print('PASS: shutdown interrupts in-flight gh RPC and releases listener; default native stub guides headless users')


if __name__ == '__main__':
    main()
