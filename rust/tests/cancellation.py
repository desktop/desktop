"""Real Git hooks/process groups, bounded RPC queues, cancellation, and socket cleanup."""
import fcntl
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import tempfile
import time
from lifecycle import alive
from smoke import BINARY, WebSocket


def wait_for(predicate, label, timeout=6):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(label)


def receive_ids(ws, expected):
    values = {}
    while not set(expected) <= values.keys():
        value = ws.receive()
        assert value is not None, 'socket closed unexpectedly'
        values[value['id']] = value
    return values


def records(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-cancel-') as temporary:
        root = Path(temporary)
        repo = root / 'repo'
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        def git(*args):
            return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True, check=True).stdout
        git('config', 'user.name', 'Cancellation Test')
        git('config', 'user.email', 'cancel@example.invalid')
        file = repo / 'file.txt'
        file.write_text('before\n')
        git('add', '--', 'file.txt')
        git('commit', '-qm', 'initial')
        original = git('rev-parse', 'HEAD').strip()
        root_id = json.loads(subprocess.run([str(BINARY), '-C', str(repo), 'snapshot'], check=True, capture_output=True, text=True).stdout)['root_id']
        file.write_text('staged\n')
        git('add', '--', 'file.txt')
        log = root / 'processes.jsonl'
        script = f'#!{sys.executable}\n' + '''import json,os,subprocess,sys,time
child=subprocess.Popen([sys.executable,'-c',"import signal,time;signal.signal(signal.SIGINT,signal.SIG_IGN);print('ready',flush=True);time.sleep(60)"],stdout=subprocess.PIPE,text=True)
assert child.stdout.readline().strip()=='ready'
with open(os.environ['CANCELLATION_LOG'],'a') as log:
    log.write(json.dumps([os.getpid(),child.pid])+'\\n')
time.sleep(60)
'''
        hook = repo / '.git/hooks/pre-commit'
        hook.write_text(script)
        hook.chmod(0o755)
        tools = root / 'bin'
        tools.mkdir()
        (tools / 'gh').write_text(script)
        (tools / 'gh').chmod(0o755)
        env = dict(os.environ, PATH=str(tools) + os.pathsep + os.environ['PATH'], CANCELLATION_LOG=str(log))
        config = root / 'registry.json'
        server = subprocess.Popen([str(BINARY), '-C', str(repo), '--config', str(config), 'serve', '--port', '0'], env=env, stderr=subprocess.PIPE, text=True)
        sockets = []
        def connect():
            ws = WebSocket(authority, 'http://' + authority)
            ws.send({'token': token})
            ready = ws.receive()
            assert ready['capabilities']['cancel'] and ready['capabilities']['max_pending'] == 32
            sockets.append(ws)
            return ws
        def gh_request(ws, id):
            ws.send({'id': id, 'method': 'github', 'request': {'action': {'type': 'auth_status'}}})
        try:
            assert select.select([server.stderr], [], [], 5)[0]
            authority, token = re.search(r'Open http://([^/]+)/#token=(\S+)', server.stderr.readline()).groups()
            a, b = connect(), connect()
            a.send({'id': 1, 'method': 'commit', 'summary': 'must not commit'})
            wait_for(lambda: len(records(log)) == 1, 'commit hook did not start')
            hook_pids = records(log)[0]
            # The other connection can cancel its own mutex wait without touching the hook.
            b.send({'id': 1, 'method': 'snapshot'})
            b.send({'id': 2, 'method': 'cancel', 'request_id': 1})
            replies = receive_ids(b, [1, 2])
            assert replies[1]['error_code'] == 'cancelled', replies
            assert all(alive(pid) for pid in hook_pids)
            a.send({'id': 2, 'method': 'create_branch', 'name': 'never-created'})
            a.send({'id': 3, 'method': 'get_preferences'})
            a.send({'id': 100, 'method': 'cancel', 'request_id': 2})
            replies = receive_ids(a, [2, 100])
            assert replies[2]['error_code'] == 'cancelled'
            assert replies[100]['result']['status'] == 'queued'
            a.send({'id': 101, 'method': 'cancel', 'request_id': 1, 'unexpected': True})
            assert 'error' in a.receive()
            assert alive(hook_pids[0]), 'invalid control parameters must not cancel work'
            a.send({'id': 102, 'method': 'cancel', 'request_id': 1})
            replies = receive_ids(a, [1, 3, 102])
            assert replies[1]['error_code'] == 'cancelled', replies
            assert replies[102]['result']['status'] == 'requested'
            assert 'theme' in replies[3]['result']
            wait_for(lambda: all(not alive(pid) for pid in hook_pids), 'hook descendant survived cancellation')
            assert git('rev-parse', 'HEAD').strip() == original
            assert not (repo / '.git/index.lock').exists(), 'Git must get a chance to clean up its lock'
            assert 'never-created' not in git('branch', '--list')
            assert git('show', ':file.txt') == 'staged\n'
            hook.unlink()
            # Atomic metadata updates waiting on a different process's lock are cancellable.
            subprocess.run([str(BINARY), '--config', str(config), 'preferences', 'set', '{"theme":"light"}'], check=True, capture_output=True)
            preference = root / 'registry.preferences.json'
            original_preferences = preference.read_bytes()
            with open(preference.with_suffix('.lock'), 'r+b') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                b.send({'id': 10, 'method': 'update_preferences', 'preferences': {'theme': 'dark'}})
                time.sleep(0.1)
                b.send({'id': 11, 'method': 'cancel', 'request_id': 10})
                replies = receive_ids(b, [10, 11])
                assert replies[10]['error_code'] == 'cancelled', replies
                assert preference.read_bytes() == original_preferences
            # A connection cannot cancel another connection's request IDs.
            gh_request(a, 200)
            wait_for(lambda: len(records(log)) == 2, 'gh did not start')
            gh_pids = records(log)[1]
            b.send({'id': 201, 'method': 'cancel', 'request_id': 200})
            assert b.receive()['result']['status'] == 'not_found'
            assert all(alive(pid) for pid in gh_pids)
            a.send({'id': 300, 'method': 'create_branch', 'name': 'wrong-root', 'repository_id': root_id})
            for id in range(301, 331):
                a.send({'id': id, 'method': 'get_preferences'})
            a.send({'id': 400, 'method': 'get_preferences'})
            assert a.receive()['error_code'] == 'queue_full'
            other_repo = root / 'other-repo'
            subprocess.run(['git', 'init', '-q', str(other_repo)], check=True)
            subprocess.run(['git', '-C', str(other_repo), '-c', 'user.name=Cancellation Test', '-c', 'user.email=cancel@example.invalid', 'commit', '--allow-empty', '-qm', 'other base'], check=True)
            b.send({'id': 202, 'method': 'open_repository', 'path': str(other_repo)})
            assert b.receive()['result']['root_id'] != root_id
            a.send({'id': 401, 'method': 'cancel', 'request_id': 200})
            replies = receive_ids(a, [200, 401, *range(300, 331)])
            assert 'selection changed' in replies[300]['error'], replies[300]
            assert 'wrong-root' not in git('branch', '--list')
            assert not subprocess.run(['git', '-C', str(other_repo), 'branch', '--list', 'wrong-root'], check=True, capture_output=True).stdout
            wait_for(lambda: all(not alive(pid) for pid in gh_pids), 'cancel left gh descendants running')
            gh_request(a, 210)
            wait_for(lambda: len(records(log)) == 3, 'disconnect fixture did not start')
            disconnect_pids = records(log)[2]
            a.close()
            wait_for(lambda: all(not alive(pid) for pid in disconnect_pids), 'disconnect left command descendants running')
            # Duplicate in-flight IDs close that session and clean up its process tree.
            c = connect()
            gh_request(c, 500)
            wait_for(lambda: len(records(log)) == 4, 'second gh did not start')
            duplicate_pids = records(log)[3]
            c.send({'id': 500, 'method': 'get_preferences'})
            duplicate = c.receive()
            assert duplicate['id'] is None and 'duplicate' in duplicate['error']
            wait_for(lambda: all(not alive(pid) for pid in duplicate_pids), 'duplicate ID left subprocesses running')
            # Shutdown also drains process groups before returning success.
            gh_request(b, 600)
            wait_for(lambda: len(records(log)) == 5, 'shutdown fixture did not start')
            shutdown_pids = records(log)[4]
            server.send_signal(signal.SIGINT)
            server.wait(timeout=6)
            assert server.returncode == 0
            wait_for(lambda: all(not alive(pid) for pid in shutdown_pids), 'shutdown left descendants running')
        finally:
            for ws in sockets:
                ws.close()
            if server.poll() is None:
                server.send_signal(signal.SIGINT)
                try:
                    server.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
            for group in records(log):
                for pid in group:
                    if alive(pid):
                        os.kill(pid, signal.SIGKILL)
    print('PASS: active/queued cancellation, Git lock cleanup, descendant escalation, metadata/mutex waits, queue bounds, session isolation, disconnect and shutdown')


if __name__ == '__main__':
    main()
