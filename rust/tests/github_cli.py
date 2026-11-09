"""Run installed gh against a local HTTPS GitHub API fixture, using fake credentials."""
import http.server
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
import threading

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    openssl = os.environ.get('OPENSSL_BIN') or shutil.which('openssl')
    assert shutil.which('gh') and openssl, 'requires installed gh and openssl (or OPENSSL_BIN)'
    with tempfile.TemporaryDirectory(prefix='desktop-real-gh-') as temporary:
        root=Path(temporary)
        cert,key=root/'cert.pem',root/'key.pem'
        subprocess.run([openssl,'req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1','-keyout',str(key),'-out',str(cert),'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        requests=[]
        pr={'number':7,'title':'Fixture PR','url':'https://github.example/owner/repo/pull/7','state':'OPEN','isDraft':True,'headRefName':'feature','baseRefName':'main','author':{'login':'tester'},'updatedAt':'2026-01-01T00:00:00Z','reviewDecision':'REVIEW_REQUIRED'}
        issue={'number':8,'title':'Fixture issue','url':'https://github.example/owner/repo/issues/8','state':'OPEN','author':{'login':'tester'},'labels':{'nodes':[]},'updatedAt':'2026-01-01T00:00:00Z'}
        def connection(nodes):return {'nodes':nodes,'edges':[{'node':node} for node in nodes],'totalCount':len(nodes),'pageInfo':{'hasNextPage':False,'endCursor':''}}
        repository={'id':'R_fixture','name':'repo','nameWithOwner':'owner/repo','url':'https://github.example/owner/repo','description':'Local fixture','owner':{'login':'owner'},'defaultBranchRef':{'name':'main'},'isPrivate':False,'isFork':False,'parent':None,'viewerPermission':'WRITE','hasIssuesEnabled':True,'pullRequests':connection([pr]),'issues':connection([issue])}
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def reply(self,data):
                data=json.dumps(data).encode();self.send_response(200)
                self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)))
                self.send_header('X-GitHub-Enterprise-Version','3.17.0');self.end_headers();self.wfile.write(data)
            def do_GET(self):
                requests.append(('GET',self.path,None))
                if '/actions/runs' in self.path:
                    self.reply({'total_count':1,'workflow_runs':[{'id':99,'name':'CI','display_title':'Fixture run','status':'completed','conclusion':'success','head_branch':'main','head_sha':'a'*40,'html_url':'https://github.example/run/99','updated_at':'2026-01-01T00:00:00Z'}]})
                else:self.reply({'id':1,'name':'repo','full_name':'owner/repo','default_branch':'main','owner':{'login':'owner'},'html_url':'https://github.example/owner/repo'})
            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
                requests.append(('POST',self.path,body))
                query=body.get('query','')
                if '__type' in query:
                    self.reply({'data':{'Issue':{'fields':[{'name':name} for name in ['id','title','body','url','number']]}}})
                elif 'mutation' in query and 'createIssue' in query:
                    self.reply({'data':{'createIssue':{'issue':{'url':'https://github.example/owner/repo/issues/9'}}}})
                else:self.reply({'data':{'repository':repository}})
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
        server.socket=context.wrap_socket(server.socket,server_side=True)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        hostname=f'localhost:{server.server_port}'
        env={key:value for key,value in os.environ.items() if key not in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']}
        env.update(GH_HOST=hostname,GH_ENTERPRISE_TOKEN='fixture-token',GH_CONFIG_DIR=str(root/'gh-config'),SSL_CERT_FILE=str(cert),GH_NO_UPDATE_NOTIFIER='1',GH_NO_EXTENSION_UPDATE_NOTIFIER='1')
        def run(action):
            value={'repository':hostname+'/owner/repo','action':action}
            result=subprocess.run([str(BINARY),'-C',str(root),'github',json.dumps(value)],env=env,capture_output=True,text=True,timeout=20)
            assert result.returncode==0,(action,result.stdout,result.stderr,[(method,path,payload.get('query','')[:160] if payload else None) for method,path,payload in requests])
            return json.loads(result.stdout)
        try:
            assert run({'type':'repository'})['data']['nameWithOwner']=='owner/repo'
            assert run({'type':'pull_requests'})['data'][0]['number']==7
            assert run({'type':'issues'})['data'][0]['number']==8
            assert run({'type':'workflow_runs'})['data'][0]['databaseId']==99
            body='Literal $(not-shell)\n\nMultiline body'
            assert 'issues/9' in run({'type':'create_issue','title':'Offline issue','body':body})['stdout']
            mutations=[payload for _,_,payload in requests if payload and 'createIssue' in payload.get('query','')]
            assert mutations and mutations[-1]['variables']['input']['body']==body,mutations
            assert mutations[-1]['variables']['input']['title']=='Offline issue'
            # Repository-bound fork metadata uses the actual installed gh,
            # verifies the selected remote, and stays offline after refresh.
            repo=root/'worktree';subprocess.run(['git','init','-qb','main',str(repo)],check=True)
            repo_env={**env,'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':str(root/'global.config'),'GH_REPO':'wrong.invalid/wrong/repository'}
            def git(*args):return subprocess.run(['git','-C',str(repo),*args],env=repo_env,capture_output=True,check=True).stdout
            git('config','user.name','Context fixture');git('config','user.email','context@example.invalid');git('config','commit.gpgsign','false')
            (repo/'file').write_text('base');git('add','--','file');git('commit','-qm','base');git('branch','trunk')
            git('remote','add','origin',f'https://private:secret@{hostname}/owner/repo.git?token=secret')
            git('remote','add','upstream',f'https://{hostname}/parent/repo.git')
            tip=git('rev-parse','HEAD').strip().decode()
            for name,branch in [('origin','main'),('upstream','trunk')]:
                git('update-ref',f'refs/remotes/{name}/{branch}',tip);git('symbolic-ref',f'refs/remotes/{name}/HEAD',f'refs/remotes/{name}/{branch}')
            repository.update(url=f'https://{hostname}/owner/repo',isFork=True,parent={'id':'R_parent','name':'repo','nameWithOwner':'parent/repo','owner':{'login':'parent'},'url':f'https://{hostname}/parent/repo'})
            context_result=subprocess.run([str(BINARY),'-C',str(repo),'repository-context','--refresh'],env=repo_env,capture_output=True,text=True,timeout=20)
            assert context_result.returncode==0,(context_result.stdout,context_result.stderr)
            metadata=json.loads(context_result.stdout)
            assert metadata['status']=='verified' and metadata['repository']['parent']['owner']=='parent',metadata
            assert 'secret' not in context_result.stdout
            request_count=len(requests)
            offline=subprocess.run([str(BINARY),'-C',str(repo),'branch-policy'],env=repo_env,capture_output=True,text=True,timeout=20)
            assert offline.returncode==0,offline.stderr
            assert json.loads(offline.stdout)['default_branch']['name']=='trunk' and len(requests)==request_count
        finally:
            server.shutdown();server.server_close();worker.join(timeout=5)
    print('PASS: installed gh reads/issue creation and repository-bound fork refresh against local HTTPS mock API; literal multiline body and offline policy preserved')


if __name__=='__main__':main()
