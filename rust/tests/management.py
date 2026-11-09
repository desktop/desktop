"""Real Git worktrees/submodules and isolated application/Git settings."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile
import re
import select
import signal
from smoke import WebSocket

BINARY=Path(__file__).resolve().parents[1]/'target/debug/desktop-rs'

def main():
    with tempfile.TemporaryDirectory(prefix='desktop-management-') as temporary:
        root=Path(temporary);repo=root/'repo';registry=root/'config/repositories.json'
        config=root/'global.gitconfig';config.write_text('[protocol "file"]\n allow = always\n[user]\n name = Fixture\n email = fixture@example.invalid\n[commit]\n gpgsign = false\n')
        env=dict(os.environ,GIT_CONFIG_GLOBAL=str(config),GIT_CONFIG_NOSYSTEM='1')
        subprocess.run(['git','init','-q','-b','main',str(repo)],env=env,check=True)
        def git(*args,check=True):return subprocess.run(['git','-C',str(repo),*args],env=env,capture_output=True,check=check)
        def cli(*args,fail=False):
            result=subprocess.run([str(BINARY),'--config',str(registry),'-C',str(repo),*map(str,args)],env=env,capture_output=True,text=True)
            if fail:assert result.returncode!=0,result;return result
            assert result.returncode==0,(args,result.stdout,result.stderr);return json.loads(result.stdout)
        def rpc(method,fail=False,**fields):return cli('repo',json.dumps({'method':method,**fields}),fail=fail)
        prefs=cli('preferences');assert prefs=={'version':1,'theme':'system','poll_interval_ms':2000,'external_editor':{'kind':'automatic'},'uncommitted_changes':'AskForConfirmation'}
        prefs_path=registry.with_suffix('.preferences.json');assert not prefs_path.exists()
        assert cli('preferences','set','{"theme":"dark"}')['theme']=='dark'
        assert cli('preferences','set','{"poll_interval_ms":500}')['theme']=='dark'
        before=prefs_path.read_bytes();cli('preferences','set','{"poll_interval_ms":1}',fail=True);assert prefs_path.read_bytes()==before
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(cli,'preferences','set','{"theme":"light"}'),pool.submit(cli,'preferences','set','{"poll_interval_ms":1000}')]
            for future in futures:future.result()
        assert cli('preferences')['theme']=='light' and cli('preferences')['poll_interval_ms']==1000
        prefs_path.write_text('{broken');cli('preferences','set','{"theme":"system"}',fail=True);assert prefs_path.read_text()=='{broken';prefs_path.write_bytes(before)
        # Settings are scoped and unknown/credential keys are neither exposed nor writable.
        git('config','credential.helper','fixture-secret')
        values=cli('config')['values'];assert 'credential.helper' not in values and values['user.name'] is None
        assert cli('config','--global')['values']['user.name']=='Fixture'
        assert cli('config','set','user.name','Local Author')['values']['user.name']=='Local Author'
        assert cli('config','--global')['values']['user.name']=='Fixture'
        rpc('set_git_setting',key='credential.helper',value='bad',fail=True)
        rpc('set_git_setting',key='core.autocrlf',value='bad',fail=True)
        cli('config','set','init.defaultBranch','--','--help',fail=True)
        assert cli('config','unset','user.name')['values']['user.name'] is None
        assert cli('config','unset','user.name')['values']['user.name'] is None
        assert 'Fixture' in config.read_text() and 'fixture-secret' in git('config','credential.helper').stdout.decode()
        cli('config','set','init.defaultBranch','trunk','--global')
        created=root/'configured-default';cli('init',created)
        branch=subprocess.run(['git','-C',str(created),'symbolic-ref','--short','HEAD'],env=env,capture_output=True,check=True).stdout
        assert branch==b'trunk\n'
        # Worktree names/path bytes and default dirty/lock protections.
        (repo/'file').write_text('base\n');git('add','--all');git('commit','-qm','base')
        git('branch','existing')
        attached=root/'attached';cli('worktree','add',attached,'existing')
        assert subprocess.run(['git','-C',str(attached),'symbolic-ref','--short','HEAD'],env=env,capture_output=True,check=True).stdout==b'existing\n'
        cli('worktree','remove',attached)
        linked=root/'linked\nwith space';rpc('worktree_add',path=str(linked),branch='topic',new_branch=True)
        listed=rpc('worktrees');assert len(listed)==2 and listed[0]['main']
        row=next(row for row in listed if row['display_path']==str(linked));assert row['path']['bytes']==list(os.fsencode(linked)) and row['branch']=='refs/heads/topic'
        rpc('worktree_lock',path=row['path'],locked=True,reason='kept for work')
        assert next(row for row in rpc('worktrees') if not row['main'])['locked']=='kept for work'
        rpc('worktree_remove',path=str(linked),fail=True);assert linked.exists()
        rpc('worktree_lock',path=str(linked),locked=False)
        (linked/'untracked').write_text('do not lose')
        rpc('worktree_remove',path=str(linked),fail=True);assert (linked/'untracked').read_text()=='do not lose'
        moved=root/'moved';rpc('worktree_move',**{'from':str(linked),'to':str(moved)})
        assert (moved/'untracked').read_text()=='do not lose' and not linked.exists()
        rpc('worktree_remove',path=str(repo),force=True,fail=True);assert repo.exists()
        (moved/'untracked').unlink();rpc('worktree_remove',path=str(moved));assert not moved.exists()
        rpc('worktree_remove',path=str(root/'not-registered'),force=True,fail=True)
        assert len(cli('worktree'))==1
        # Register, inspect, deinitialize, and initialize a local submodule without network.
        source=root/'source';subprocess.run(['git','init','-q',str(source)],env=env,check=True)
        (source/'source-file').write_text('source')
        subprocess.run(['git','-C',str(source),'add','--all'],env=env,check=True);subprocess.run(['git','-C',str(source),'commit','-qm','source'],env=env,check=True)
        rpc('submodule_add',url=str(source),path='modules/with space',name='fixture')
        rpc('submodule_deinit',paths=['modules/with space'],fail=True);git('commit','-qm','Register submodule')
        modules=cli('submodule');assert len(modules)==1 and modules[0]['initialized'] and not modules[0]['dirty'] and not modules[0]['changed']
        (repo/'modules/with space/untracked').write_text('dirty');assert rpc('submodules')[0]['dirty']
        rpc('submodule_deinit',paths=['modules/with space'],fail=True);assert (repo/'modules/with space/untracked').exists()
        (repo/'modules/with space/untracked').unlink();rpc('submodule_deinit',paths=['modules/with space'])
        assert not rpc('submodules')[0]['initialized']
        rpc('submodule_update',paths=['modules/with space']);assert (repo/'modules/with space/source-file').read_text()=='source'
        rpc('submodule_sync',paths=['modules/with space']);assert cli('submodule')[0]['initialized']
        rpc('submodule_deinit',paths=[],fail=True);rpc('submodule_add',url='ext::bad',path='bad',fail=True)
        # Resolving a gitlink must stage the selected commit, not the nested checkout HEAD.
        nested=repo/'modules/with space'
        def subgit(*args):return subprocess.run(['git','-C',str(nested),*args],env=env,capture_output=True,check=True)
        base=subgit('rev-parse','HEAD').stdout.decode().strip()
        (nested/'source-file').write_text('ours');subgit('add','--all');subgit('commit','-qm','ours');ours=subgit('rev-parse','HEAD').stdout.decode().strip()
        (nested/'source-file').write_text('theirs');subgit('add','--all');subgit('commit','-qm','theirs');theirs=subgit('rev-parse','HEAD').stdout.decode().strip()
        subgit('checkout','-q',ours);(nested/'local-only').write_text('preserved')
        module_path=b'modules/with space'
        instructions=b'0 '+b'0'*40+b'\t'+module_path+b'\0'
        for stage,oid in [(1,base),(2,ours),(3,theirs)]:instructions+=f'160000 {oid} {stage}\t'.encode()+module_path+b'\0'
        subprocess.run(['git','-C',str(repo),'update-index','-z','--index-info'],input=instructions,env=env,check=True)
        conflict=rpc('conflict_detail',path='modules/with space')
        rpc('resolve_conflict',path='modules/with space',choice='theirs',basis=conflict['basis'])
        assert git('ls-files','--stage','--','modules/with space').stdout.startswith(f'160000 {theirs} 0'.encode())
        assert not git('ls-files','--unmerged','--','modules/with space').stdout
        assert subgit('rev-parse','HEAD').stdout.decode().strip()==ours and (nested/'local-only').read_text()=='preserved'
        # Persist native root bytes without conflating lossy display paths.
        roots=[]
        for suffix in [b'\xff',b'\xfe']:
            native=os.fsencode(root)+b'/raw-'+suffix
            initialized=subprocess.run([os.fsencode(BINARY),b'--config',os.fsencode(registry),b'init',native],env=env,capture_output=True,check=True)
            saved=json.loads(initialized.stdout);assert saved['selected']=={'bytes':list(native)}
            selected=subprocess.run([str(BINARY),'--config',str(registry),'--selected','snapshot'],env=env,capture_output=True,text=True,check=True)
            snapshot=json.loads(selected.stdout);roots.append(snapshot['root_id'])
        assert roots[0]!=roots[1]
        server=subprocess.Popen([str(BINARY),'--config',str(registry),'serve','--empty','--port','0'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
        try:
            assert select.select([server.stderr],[],[],10)[0]
            match=re.search(r'http://([^/]+)/#token=(\S+)',server.stderr.readline());assert match
            authority,token=match.groups()
            a=WebSocket(authority,'http://'+authority);b=WebSocket(authority,'http://'+authority)
            for socket in [a,b]:socket.send({'token':token});assert socket.receive()['ready']
            a.send({'id':1,'method':'git_settings','scope':'global'});assert a.receive()['result']['values']['user.name']=='Fixture'
            a.send({'id':2,'method':'update_preferences','preferences':{'theme':'light','poll_interval_ms':500}})
            assert a.receive()['result']['theme']=='light'
            event=b.receive(events=True);assert event['event']=='preferences_changed' and event['preferences']['theme']=='light'
            a.send({'id':3,'method':'open_repository','path':{'bytes':list(native)}})
            assert a.receive()['result']['root_id']==roots[-1]
            a.send({'id':4,'method':'worktrees'});assert a.receive()['result'][0]['path']['bytes']==list(native)
            a.send({'id':99,'method':'update_preferences','preferences':{'poll_interval_ms':'invalid'}})
            invalid=a.receive();assert invalid['id']==99 and 'error' in invalid
            a.send({'id':100,'method':'get_preferences'});assert a.receive()['result']['theme']=='light'
            a.close();b.close()
        finally:
            server.send_signal(signal.SIGINT)
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()

    print('PASS: atomic/scoped settings, worktree lifecycle and protections, raw worktree paths, local submodule lifecycle')

if __name__=='__main__':main()
