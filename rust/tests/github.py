"""Verify typed gh adapters without authenticating or changing any GitHub repository."""
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import tempfile
from smoke import WebSocket

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-gh-') as temporary:
        root = Path(temporary)
        repo = root / 'repo'
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        fake_bin = root / 'bin'
        fake_bin.mkdir()
        log = root / 'calls.jsonl'
        stub = fake_bin / 'gh'
        stub.write_text(f'#!{sys.executable}\n' + '''import json,os,sys
args=sys.argv[1:]
if os.environ.get('GH_TEST_MODE')=='reject_input':
    print('authentication required',file=sys.stderr)
    sys.exit(4)
body=sys.stdin.read()
assert os.environ['GH_PROMPT_DISABLED']=='1'
with open(os.environ['GH_TEST_LOG'],'a') as log:
    log.write(json.dumps({'args':args,'stdin':body})+'\\n')
mode=os.environ.get('GH_TEST_MODE','ok')
if mode=='auth_required':
    print('authentication required',file=sys.stderr)
    sys.exit(4)
if mode=='invalid':
    print('not JSON')
    sys.exit(0)
if args[:2]==['auth','status']:
    print(json.dumps({'hosts':{'github.com':[{'host':'github.com','login':'test-user','active':True,'state':'success','oauthToken':'DO-NOT-EXPOSE','token':'DO-NOT-EXPOSE'}]}}))
elif '--json' in args:
    print(json.dumps([{'name':'test','state':'PENDING'}] if args[1] in ['checks','list'] else {'number':7,'title':'fixture'}))
else:
    print('https://github.com/owner/repo/pull/7')
if mode=='pending':
    sys.exit(8)
''')
        stub.chmod(0o755)
        env = dict(os.environ, PATH=str(fake_bin) + os.pathsep + os.environ['PATH'], GH_TEST_LOG=str(log))
        def request(action, repository='enterprise.example/owner/repo', mode='ok', fail=False):
            value = {'repository': repository, 'action': action}
            result = subprocess.run([str(BINARY), '-C', str(repo), 'github', '-'], input=json.dumps(value), env=dict(env, GH_TEST_MODE=mode), capture_output=True, text=True)
            if fail:
                assert result.returncode != 0, result
                return result
            assert result.returncode == 0, result.stderr
            return json.loads(result.stdout)
        def last_call():
            return json.loads(log.read_text().splitlines()[-1])
        auth = request({'type': 'auth_status', 'hostname': 'github.com'}, repository=None)
        assert 'DO-NOT-EXPOSE' not in json.dumps(auth)
        assert auth['data']['hosts']['github.com'][0]['login'] == 'test-user'
        assert '--no-refresh' in last_call()['args']
        assert '--show-token' not in last_call()['args']
        for action in [
            {'type':'repository'}, {'type':'pull_requests'}, {'type':'pull_request','number':7},
            {'type':'pull_request_checks','number':7}, {'type':'issues'}, {'type':'issue','number':7},
            {'type':'workflow_runs'}, {'type':'workflow_run','id':99},
        ]:
            assert request(action)['data'] is not None
            arguments = last_call()['args']
            if action['type'] == 'repository':
                assert arguments[-1] == 'enterprise.example/owner/repo'
            else:
                assert arguments[-2:] == ['--repo', 'enterprise.example/owner/repo']
        body = 'First paragraph\n\nLiteral $(not-a-shell) and `text`\n' + ('Long body\n' * 4000)
        mutations = [
            {'type':'create_pull_request','title':'Fix $value','body':body,'base':'main','head':'test-user:feature','draft':True},
            {'type':'create_issue','title':'Issue','body':body},
            {'type':'comment','number':7,'body':body},
            {'type':'review_pull_request','number':7,'review':'request_changes','body':body},
            {'type':'merge_pull_request','number':7,'strategy':'squash','head_commit':'a'*40},
            {'type':'checkout_pull_request','number':7}, {'type':'close_issue','number':7},
            {'type':'reopen_issue','number':7}, {'type':'rerun_workflow','id':99,'failed_only':True},
        ]
        for action in mutations:
            assert request(action)['code'] == 0
            call = last_call()
            if 'body' in action:
                assert call['stdin'] == body
                assert '--body-file' in call['args'] and body not in call['args']
            if action['type'] == 'create_pull_request':
                assert '--draft' in call['args'] and '--head' in call['args']
            if action['type'] == 'merge_pull_request':
                assert '--match-head-commit' in call['args'] and 'a'*40 in call['args']
                assert '--admin' not in call['args']
        previous = log.read_text()
        for action, repository in [
            ({'type':'pull_requests','limit':0}, 'owner/repo'),
            ({'type':'pull_requests','state':'invalid'}, 'owner/repo'),
            ({'type':'issue','number':0}, 'owner/repo'),
            ({'type':'merge_pull_request','number':7,'strategy':'squash','head_commit':'HEAD'}, 'owner/repo'),
            ({'type':'auth_status','hostname':'--help'}, None),
            ({'type':'repository'}, '--help'),
            ({'type':'create_pull_request','title':'Fix','body':'body','base':'main','head':'--help'}, 'owner/repo'),
        ]:
            request(action, repository, fail=True)
        assert log.read_text() == previous, 'invalid requests must not start gh'
        unauthenticated = request({'type':'issues'}, mode='auth_required', fail=True)
        assert unauthenticated.returncode == 4
        assert 'auth login' in json.loads(unauthenticated.stdout)['hint']
        pending = request({'type':'pull_request_checks','number':7}, mode='pending', fail=True)
        assert pending.returncode == 8 and json.loads(pending.stdout)['data'][0]['state'] == 'PENDING'
        rejected = request({'type':'create_issue','title':'Issue','body':'x'*400000}, mode='reject_input', fail=True)
        assert rejected.returncode == 4 and 'auth login' in json.loads(rejected.stdout)['hint']
        invalid = request({'type':'repository'}, mode='invalid', fail=True)
        assert 'invalid JSON' in invalid.stderr
        missing = subprocess.run([str(BINARY), '-C', str(repo), 'github', json.dumps({'action': {'type':'auth_status'}})], env=dict(env, PATH=str(root/'missing-bin')), capture_output=True, text=True)
        assert missing.returncode != 0 and 'start gh' in missing.stderr
        # The same adapter is reachable over the authenticated app protocol.
        server = subprocess.Popen([str(BINARY), '--config', str(root/'registry.json'), 'serve', '--empty', '--port', '0'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            assert select.select([server.stderr], [], [], 10)[0]
            match = re.search(r'http://([^/]+)/#token=(\S+)', server.stderr.readline())
            assert match
            authority, token = match.groups()
            ws = WebSocket(authority, 'http://' + authority)
            ws.send({'token':token})
            assert ws.receive()['ready']
            ws.send({'id':1,'method':'github','request':{'action':{'type':'auth_status'}}})
            assert ws.receive()['result']['data']['hosts']['github.com'][0]['active']
            ws.send({'id':2,'method':'open_repository','path':str(repo)})
            assert ws.receive()['result']['root'] == str(repo)
            ws.send({'id':3,'method':'github','request':{'action':{'type':'pull_requests'}}})
            assert ws.receive()['result']['data'][0]['name'] == 'test'
            ws.close()
        finally:
            server.send_signal(signal.SIGINT)
            try: server.wait(timeout=5)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
    print('PASS: gh argument/body handling, reads/mutations, pinned merges, secret filtering, failures, CLI and WebSocket adapters (offline stub)')


if __name__ == '__main__':
    main()
