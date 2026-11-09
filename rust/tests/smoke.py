"""Offline integration checks; uses only Python's standard library."""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import struct
import subprocess
import sys
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def run(*args, **kwargs):
    return subprocess.run([str(BINARY), *args], capture_output=True, text=True, **kwargs)


def read_exact(sock, size):
    data = b''
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise EOFError('socket closed')
        data += chunk
    return data


class WebSocket:
    def __init__(self, authority, origin):
        host, port = authority.split(':')
        self.sock = socket.create_connection((host, int(port)), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f'GET /ws HTTP/1.1\r\nHost: {authority}\r\n'
                           f'Origin: {origin}\r\nUpgrade: websocket\r\n'
                           f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
                           'Sec-WebSocket-Version: 13\r\n\r\n').encode())
        header = b''
        while not header.endswith(b'\r\n\r\n'):
            header += read_exact(self.sock, 1)
        self.accepted = header.startswith(b'HTTP/1.1 101')
        if self.accepted:
            expected = base64.b64encode(hashlib.sha1(
                (key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
            assert expected in header
        else:
            assert b'403' in header

    def send(self, value):
        data = json.dumps(value).encode()
        mask = os.urandom(4)
        length = bytes([0x80 | len(data)]) if len(data) < 126 else bytes([0xfe]) + struct.pack('!H', len(data))
        self.sock.sendall(bytes([0x81]) + length + mask +
                          bytes(byte ^ mask[i % 4] for i, byte in enumerate(data)))

    def receive(self, events=False):
        first, second = read_exact(self.sock, 2)
        size = second & 127
        if size == 126:
            size = struct.unpack('!H', read_exact(self.sock, 2))[0]
        elif size == 127:
            size = struct.unpack('!Q', read_exact(self.sock, 8))[0]
        data = read_exact(self.sock, size)
        if first & 15 == 8:
            return None
        value = json.loads(data)
        if 'event' in value and not events:
            return self.receive(events=events)
        return value

    def close(self):
        self.sock.close()


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-smoke-') as temp:
        repo = Path(temp) / 'repository with spaces'
        repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        def git(*args):
            subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True)
        git('config', 'user.name', 'Local Test')
        git('config', 'user.email', 'local@example.invalid')
        file = repo / 'file.txt'
        file.write_text('initial\n')
        git('add', '--', 'file.txt')
        git('commit', '-qm', 'initial commit')
        file.write_text('changed\n')
        status = run('-C', str(repo), 'status', '--json')
        assert status.returncode == 0, status.stderr
        assert ' M file.txt' in json.loads(status.stdout)['stdout']
        assert ' M file.txt' in run('-C', str(repo), 'git', 'status', '--short').stdout
        assert run('-C', str(repo), 'git', 'rev-parse', '--verify', 'refs/heads/nonexistent').returncode != 0
        assert run('-C', temp, 'status').returncode != 0
        assert run('gh', '--version').stdout.startswith('gh version ')
        for program in ('git', 'gh'):
            fake_bin = Path(temp) / 'bin'
            fake_bin.mkdir(exist_ok=True)
            stub = fake_bin / program
            stub.write_text(f'#!{sys.executable}\nimport sys,json\nprint(json.dumps(sys.argv[1:]))\nsys.exit(23)\n')
            stub.chmod(0o755)
            env = dict(os.environ, PATH=str(fake_bin) + os.pathsep + os.environ['PATH'])
            args = ['--help', 'space value', '$(not-a-shell)', '--flag=✓']
            forwarded = run('-C', str(repo), program, *args, env=env)
            assert forwarded.returncode == 23, forwarded
            assert json.loads(forwarded.stdout) == args
            stub.unlink()
        server = subprocess.Popen([str(BINARY), '--config', str(Path(temp) / 'registry.json'), '-C', str(repo), 'serve', '--empty', '--port', '0'],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            assert select.select([server.stderr], [], [], 10)[0], 'server startup timed out'
            line = server.stderr.readline()
            match = re.search(r'http://([^/]+)/#token=(\S+)', line)
            assert match, line
            authority, token = match.groups()
            conn = http.client.HTTPConnection(authority, timeout=5)
            conn.request('GET', '/')
            response = conn.getresponse()
            assert response.status == 200
            assert b'Current branch' in response.read()
            for asset in ['client.js', 'transport.js', 'styles.css', 'panels.js']:
                conn.request('GET', '/' + asset)
                response = conn.getresponse()
                assert response.status == 200, asset
                assert response.read() == (Path(__file__).resolve().parents[1] / 'web' / asset).read_bytes(), f'stale embedded asset: {asset}'
            conn.request('GET', '/', headers={'Host': 'untrusted.example'})
            response = conn.getresponse()
            assert response.status == 403
            response.read()
            conn.close()
            hostile = WebSocket(authority, 'https://untrusted.example')
            assert not hostile.accepted
            hostile.close()
            unauthorized = WebSocket(authority, 'http://' + authority)
            unauthorized.send({'token': 'wrong'})
            assert unauthorized.receive() is None
            unauthorized.close()
            ws = WebSocket(authority, 'http://' + authority)
            ws.send({'token': token})
            assert ws.receive() == {'ready': True, 'version': 3, 'capabilities': {'cancel': True, 'max_pending': 32}}
            ws.send({'id': 100, 'method': 'snapshot'})
            assert ws.receive()['result'] is None
            ws.send({'id': 101, 'method': 'open_repository', 'path': str(repo)})
            assert ws.receive()['result']['root'] == str(repo)
            new_repo = Path(temp) / 'browser-created'
            ws.send({'id': 102, 'method': 'init_repository', 'path': str(new_repo)})
            created = ws.receive()
            assert created['result']['head'] is None, created
            ws.send({'id': 103, 'method': 'list_repositories'})
            saved = ws.receive()['result']
            assert len(saved['repositories']) == 2 and saved['selected'] == str(new_repo)
            ws.send({'id': 104, 'method': 'select_repository', 'path': str(repo)})
            assert ws.receive()['result']['root'] == str(repo)
            ws.send({'id': 105, 'method': 'forget_repository', 'path': str(new_repo)})
            assert ws.receive()['result']['repositories'] == [str(repo)]
            assert (new_repo / '.git').exists()
            ws.send({'id': 106, 'method': 'branch_policy'})
            policy = ws.receive()
            assert policy['id'] == 106 and policy['result'] == json.loads(run('-C', str(repo), 'branch-policy').stdout), policy
            for number, method in enumerate(['status', 'log', 'branches', 'diff'], 1):
                ws.send({'id': number, 'method': method})
                result = ws.receive()
                assert result['id'] == number and result['result']['code'] == 0, result
                if method == 'diff':
                    assert '+changed' in result['result']['stdout']
            ws.send({'id': 9, 'method': 'git', 'args': ['reset', '--hard']})
            assert 'error' in ws.receive()
            ws.send({'id': 10, 'method': 'status'})
            assert ' M file.txt' in ws.receive()['result']['stdout']
            assert file.read_text() == 'changed\n'
            ws.send({'id': 11, 'method': 'stage', 'paths': ['file.txt']})
            assert ws.receive()['result']['code'] == 0
            ws.send({'id': 12, 'method': 'snapshot'})
            assert ws.receive()['result']['files'][0]['index'] == 'M'
            ws.send({'id': 13, 'method': 'unstage', 'paths': ['file.txt']})
            assert ws.receive()['result']['code'] == 0
            for request_id, staged in [(14,False),(16,True)]:
                ws.send({'id':request_id,'method':'diff_detail','path':'file.txt','staged':staged})
                diff=ws.receive()['result']
                selected=[line['id'] for hunk in diff['hunks'] for line in hunk['lines'] if line['kind'] in ['added','deleted']]
                ws.send({'id':request_id+1,'method':'select_diff','path':'file.txt','staged':staged,'basis':diff['basis'],'lines':selected})
                assert ws.receive()['result']['code']==0
            ws.send({'id':20,'method':'history','limit':1})
            history=ws.receive()['result'];commit=history['commits'][0]['oid']
            ws.send({'id':21,'method':'commit_files','commit':commit})
            assert ws.receive()['result']['files'][0]['display_path']=='file.txt'
            ws.send({'id':22,'method':'commit_diff','commit':commit,'path':'file.txt'})
            assert not ws.receive()['result']['can_select']
            ws.send({'id':23,'method':'branch_list'})
            assert any(branch['current'] for branch in ws.receive()['result'])
            # A content edit with the same status flags must still emit a change event.
            file.write_text('external change\n')
            while True:
                event = ws.receive(events=True)
                if event['event'] == 'repository_changed' and event['snapshot']['files'] and event['snapshot']['files'][0]['size'] == len('external change\n'):
                    break
            ws.close()
        finally:
            server.send_signal(signal.SIGINT)
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
    print('PASS: CLI forwarding/exit codes, repository reads, HTTP host, WS origin/auth/RPC/mutations/change events/repository management')


if __name__ == '__main__':
    main()
