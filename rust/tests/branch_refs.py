"""Creation transaction identity, preserved native callbacks and case-only rename parity."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from discard_advanced import BINARY, Fixture


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-branch-refs-') as temporary:
        root=Path(temporary);os.environ['GIT_CONFIG_NOSYSTEM']='1';os.environ['GIT_CONFIG_GLOBAL']=str(root/'global');real=shutil.which('git');assert real
        def seed(label,*options):
            f=Fixture(root/label,*options);(f.path/'file').write_text('base');f.commit();return f
        def head(f,name):
            p=f.git('show-ref','--verify','--hash','refs/heads/'+name,check=False);return p.stdout.strip().decode() if p.returncode==0 else None
        def create(f,name='new',**kwargs):
            plan=f.rpc('create_branch_preview',name=name,**{k:v for k,v in kwargs.items() if k in ['start_point','no_track','checkout']});return f.rpc('create_branch',name=name,basis=plan['basis'],**kwargs)
        def shim(label,body):
            path=root/label;path.mkdir();tool=path/'git';tool.write_text(f'#!{sys.executable}\nimport os,subprocess,sys,json\na=sys.argv[1:]\nreal={real!r}\n'+body+'\nos.execv(real,[real,*a])\n');tool.chmod(0o700);return path
        def wrapped(path,task):
            old=os.environ['PATH'];os.environ['PATH']=str(path)+os.pathsep+old
            try:return task()
            finally:os.environ['PATH']=old
        # Existing symbolic destinations are not empty names, even if dangling.
        for backend,options in [('files',[]),('sha256',['--object-format=sha256']),('reftable',['--ref-format=reftable'])]:
            f=seed('symbolic-'+backend,*options);f.git('symbolic-ref','refs/heads/new','refs/heads/unborn-other');(f.path/'file').write_text('keep index');f.git('add','--','file');(f.path/'file').write_text('keep working');index=(f.path/'.git/index').read_bytes()
            for checkout in [False,True]:f.rpc('create_branch_preview',name='new',checkout=checkout,fail=True)
            f.rpc('rename_branch_preview',name='main',new_name='new',fail=True)
            assert head(f,'unborn-other') is None and f.git('symbolic-ref','refs/heads/new').stdout==b'refs/heads/unborn-other\n' and (f.path/'.git/index').read_bytes()==index and (f.path/'file').read_text()=='keep working'
            assert not (f.path/'.git/desktop-checkout').exists() and not (f.path/'.git/desktop-branch-renames').exists()
        # A remote checkout also rejects a dangling local branch destination in
        # its read-only preview rather than changing files and detecting it later.
        f=seed('remote-preview');f.git('update-ref','refs/remotes/origin/topic',head(f,'main'));f.git('symbolic-ref','refs/heads/topic','refs/heads/other');f.rpc('checkout_preview',branch='refs/remotes/origin/topic',fail=True);assert head(f,'other') is None
        # The same destination guard runs just before deferred unborn switching.
        f=Fixture(root/'unborn-symbolic');f.git('symbolic-ref','refs/heads/new','refs/heads/other');f.rpc('create_branch_preview',name='new',checkout=True,fail=True);assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/main\n'
        # A writer inside the native branch invocation cannot redirect creation
        # through a freshly inserted symbolic ref or move its reviewed start tip.
        for backend,options in [('files',[]),('sha256',['--object-format=sha256']),('reftable',['--ref-format=reftable'])]:
            for kind in ['symbolic','start','direct']:
                f=seed('race-'+backend+'-'+kind,*options);f.git('branch','start');new=f.git('commit-tree','HEAD^{tree}','-m','writer').stdout.strip().decode();(f.path/'file').write_text('working');(f.path/'loose').write_text('loose');before=(f.path/'.git/index').read_bytes();plan=f.rpc('create_branch_preview',name='new',start_point='refs/heads/start',checkout=True)
                command=['symbolic-ref','refs/heads/new','refs/heads/unborn-other'] if kind=='symbolic' else ['update-ref','refs/heads/start' if kind=='start' else 'refs/heads/new',new]
                tool=shim('tool-'+backend+'-'+kind,f'if "branch" in a and "new" in a:subprocess.run([real,"-C",{str(f.path)!r},*{command!r}],check=True)')
                wrapped(tool,lambda:f.rpc('create_branch',name='new',start_point='refs/heads/start',checkout=True,strategy='StashOnCurrentBranch',basis=plan['basis'],fail=True))
                assert head(f,'unborn-other') is None and (f.path/'.git/index').read_bytes()==before and (f.path/'file').read_text()=='working' and (f.path/'loose').read_text()=='loose' and not f.rpc('stash_list')['entries']
                assert head(f,'new')==(new if kind=='direct' else None)
                assert f.rpc('checkout_history')[0]['receipt']['phase']=='creating_branch'
        # Git can skip a non-executable hook with a successful exit code. The
        # app proves its dispatcher ran before allowing the mutating command.
        f=seed('hook-not-run');marker=root/'must-not-create';tool=shim('no-hook-tool',f'if "hook" in a and any(arg.startswith("desktop-branch-probe-") for arg in a):sys.exit(0)\nif "branch" in a and "new" in a:open({str(marker)!r},"w").close()')
        wrapped(tool,lambda:create(f,fail=True));assert not marker.exists() and head(f,'new') is None
        # Moving the start ref from the user's preparing callback is checked
        # again under the destination's prepared lock before Git can commit it.
        f=seed('hook-race');f.git('branch','start');new=f.git('commit-tree','HEAD^{tree}','-m','writer').stdout.strip().decode();hook=f.path/'.git/hooks/reference-transaction';hook.write_text(f'#!{sys.executable}\nimport subprocess,sys\ndata=sys.stdin.read()\nif sys.argv[1]=="preparing" and data.endswith(" refs/heads/new\\n"):\n subprocess.run([{real!r},"update-ref","refs/heads/start",{new!r}],check=True)\n');hook.chmod(0o700)
        create(f,start_point='refs/heads/start',fail=True);assert head(f,'new') is None and head(f,'start')==new
        # A symbolic redirect inserted by preparing is caught at prepared too.
        f=seed('prepared-destination');hook=f.path/'.git/hooks/reference-transaction';hook.write_text(f'#!{sys.executable}\nimport subprocess,sys\ndata=sys.stdin.read()\nif sys.argv[1]=="preparing" and data.endswith(" refs/heads/new\\n") and "ref:" not in data:\n subprocess.run([{real!r},"symbolic-ref","refs/heads/new","refs/heads/unborn-other"],check=True)\n');hook.chmod(0o700);create(f,fail=True);assert head(f,'unborn-other') is None and f.git('symbolic-ref','refs/heads/new').stdout==b'refs/heads/unborn-other\n'
        # Shell metacharacters remain literal in refs and the inherited caller
        # configuration; private configuration never enters public history.
        f=seed('quoted-refs');source="start/'$(touch${IFS}PWNED)`";name="new/'$(touch${IFS}PWNED)`";f.git('branch','--',source);old_parameters=os.environ.get('GIT_CONFIG_PARAMETERS');os.environ['GIT_CONFIG_PARAMETERS']="'desktop.private-token'='private-secret-value $(touch${IFS}PWNED)' 'hook.reference-transaction.enabled'='false'"
        try:
            result=create(f,name=name,start_point='refs/heads/'+source);assert head(f,name)==head(f,'main') and not (f.path/'PWNED').exists();assert 'private-secret-value' not in json.dumps(f.rpc('checkout_history'));f.rpc('acknowledge_checkout',receipt_id=result['receipt_id'])
        finally:
            if old_parameters is None:os.environ.pop('GIT_CONFIG_PARAMETERS',None)
            else:os.environ['GIT_CONFIG_PARAMETERS']=old_parameters
        # Traditional and configured callbacks get native phase/stdin/counts,
        # including enabled/disabled event and multi-event friendly hook states.
        for disabled in ['none','friendly','event']:
            f=seed('callbacks-'+disabled);log=root/('callback-log-'+disabled);hooks=root/("hooks 'quote\n"+disabled);hooks.mkdir();hook=hooks/'reference-transaction'
            hook.write_text(f'#!{sys.executable}\nimport json,sys\nwith open({str(log)!r},"a") as log:log.write(json.dumps([sys.argv[1:],sys.stdin.read()])+"\\n")\n');hook.chmod(0o700);f.git('config','core.hooksPath',str(hooks));f.git('config','hook.named.event','reference-transaction');f.git('config','hook.named.command',"'"+str(hook).replace("'","'\\''")+"' named")
            if disabled=='friendly':f.git('config','hook.named.enabled','false')
            if disabled=='event':f.git('config','hook.reference-transaction.enabled','false')
            f.git('branch','native');expected=[json.loads(s) for s in log.read_text().splitlines()] if log.exists() else [];f.git('branch','-D','native');log.write_text('');result=create(f)
            events=[json.loads(s) for s in log.read_text().splitlines()]
            def normalize(rows,name):return [(argv,data.replace('refs/heads/'+name,'refs/heads/BRANCH')) for argv,data in rows]
            assert normalize(expected,'native')==normalize(events,'new'),(disabled,expected,events)
            id=result['receipt_id'];guard=f.path/'.git/desktop-checkout'/(id+'.create-hooks');assert guard.is_dir() and guard.stat().st_mode&0o77==0 and (guard/'reference-transaction').stat().st_mode&0o77==0
            f.rpc('acknowledge_checkout',receipt_id=id);assert not guard.exists()
            # Disabling user hooks cannot disable the application's own check.
            if disabled=='event':
                f.git('branch','start');new=f.git('commit-tree','HEAD^{tree}','-m','writer').stdout.strip().decode();plan=f.rpc('create_branch_preview',name='raced',start_point='refs/heads/start');tool=shim('disabled-shim',f'if "branch" in a and "raced" in a:subprocess.run([real,"-C",{str(f.path)!r},"update-ref","refs/heads/start",{new!r}],check=True)');wrapped(tool,lambda:f.rpc('create_branch',name='raced',start_point='refs/heads/start',basis=plan['basis'],fail=True));assert head(f,'raced') is None and f.git('config','--bool','hook.reference-transaction.enabled').stdout==b'false\n'
        # Nested Git from an original reference callback must see the other
        # repository's own hook path and enabled state, not the app's dispatcher.
        f=seed('nested-callback');other=seed('nested-other');marker=root/'nested-marker';hook=other.path/'.git/hooks/reference-transaction';hook.write_text(f'#!{sys.executable}\nfrom pathlib import Path\nPath({str(marker)!r}).touch()\n');hook.chmod(0o700);hook=f.path/'.git/hooks/reference-transaction';hook.write_text(f'#!{sys.executable}\nimport os,subprocess,sys\ndata=sys.stdin.read()\nenv=os.environ.copy()\nfor key in ["GIT_DIR","GIT_WORK_TREE","GIT_COMMON_DIR","GIT_INDEX_FILE","GIT_OBJECT_DIRECTORY","GIT_ALTERNATE_OBJECT_DIRECTORIES","GIT_PREFIX"]:env.pop(key,None)\nif sys.argv[1]=="preparing":subprocess.run([{real!r},"-C",{str(other.path)!r},"branch","nested"],check=True,env=env)\n');hook.chmod(0o700);create(f);assert marker.exists() and head(other,'nested')
        # Normal case-only rename uses -m. A native collision alone may retry
        # -M, and only if a fresh namespace/context still proves the same owner.
        for kind in ['normal','fallback','alias','unicode','exact','other-case','source-race','destination-race','config-race','hook-refusal','hook-detail']:
            f=seed('case-'+kind);source='fÖÖ\'s' if kind=='unicode' else 'main';dest='Föö\'S' if kind=='unicode' else 'MAIN'
            if source!='main':f.git('branch','-m',source)
            f.git('config','branch.'+source+'.description','saved');(f.path/'file').write_text('saved');original=f.rpc('stash_save',desktop=True)['oid'];(f.path/'file').write_text('untouched');index=(f.path/'.git/index').read_bytes();tip=head(f,source)
            if kind=='exact':f.git('branch',dest);f.rpc('rename_branch_preview',name=source,new_name=dest,fail=True);assert head(f,source)==head(f,dest)==tip;continue
            if kind=='other-case':f.git('branch','mAiN')
            plan=f.rpc('rename_branch_preview',name=source,new_name=dest);assert plan['case_only'] and plan['case_retry']==(kind!='other-case');log=root/('case-log-'+kind)
            new=f.git('commit-tree','HEAD^{tree}','-m','writer').stdout.strip().decode()
            if kind=='normal':
                result=f.rpc('rename_branch',name=source,new_name=dest,basis=plan['basis'])
            else:
                alias=f'if "show-ref" in a and "--hash" in a and a[-1]=="refs/heads/{dest}":\n r=subprocess.run([real,"-C",{str(f.path)!r},"show-ref","--verify","--hash","refs/heads/{source}"],capture_output=True)\n if r.returncode==0:sys.stdout.buffer.write(r.stdout);sys.exit(0)\n' if kind=='alias' else ''
                body=alias+f'if "branch" in a and ("-m" in a or "-M" in a):\n with open({str(log)!r},"a") as log:log.write(("-M" if "-M" in a else "-m")+"\\n")\n if "-m" in a:\n'
                if kind=='source-race':body+=f'  subprocess.run([real,"-C",{str(f.path)!r},"update-ref","refs/heads/{source}",{new!r}],check=True)\n'
                if kind=='destination-race':body+=f'  subprocess.run([real,"-C",{str(f.path)!r},"branch","--",{dest!r},{new!r}],check=True)\n'
                if kind=='config-race':body+=f'  subprocess.run([real,"-C",{str(f.path)!r},"config","branch.{source}.description","changed"],check=True)\n'
                if kind=='hook-detail':body+='  sys.stderr.write("fatal: ref updates aborted by hook\\n")\n'
                body+=f'  sys.stderr.write({("fatal: a branch named "+chr(39)+dest+chr(39)+" already exists\\n")!r}.replace("\\\\n","\\n"))\n  sys.exit({1 if kind=="hook-refusal" else 128})\n'
                tool=shim('case-tool-'+kind,body);success=kind in ['fallback','alias','unicode'];result=wrapped(tool,lambda:f.rpc('rename_branch',name=source,new_name=dest,basis=plan['basis'],fail=not success));assert log.read_text().splitlines()==(['-m','-M'] if success else ['-m'])
                if not success:
                    assert head(f,source)==(new if kind=='source-race' else tip) and head(f,dest)==(new if kind=='destination-race' else None) and any(e['oid']==original for e in f.rpc('stash_list')['entries']);continue
            assert head(f,source) is None and head(f,dest)==tip and f.git('symbolic-ref','HEAD').stdout.strip().decode()=='refs/heads/'+dest and f.git('config','branch.'+dest+'.description').stdout==b'saved\n'
            assert (f.path/'file').read_text()=='untouched' and (f.path/'.git/index').read_bytes()==index
            saved=f.rpc('stash_list')['entries'];assert len(saved)==1 and saved[0]['branch']==dest and f.git('show',saved[0]['oid']+':file').stdout==b'saved'
    print('branch refs: symbolic destinations, creation start/transaction races, native hook delegation/cleanup, case-only fallback and ownership races passed')

if __name__=='__main__':main()
