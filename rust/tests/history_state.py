"""History, tracking, conflict resolution, and recovery using real local Git."""
import json
from pathlib import Path
import subprocess
import tempfile

BINARY=Path(__file__).resolve().parents[1]/'target/debug/desktop-rs'

def main():
    with tempfile.TemporaryDirectory(prefix='desktop-history-') as temporary:
        root=Path(temporary);repo=root/'repo'
        subprocess.run(['git','init','-q','-b','main',str(repo)],check=True)
        def git(*args,check=True):return subprocess.run(['git','-C',str(repo),*args],capture_output=True,check=check)
        git('config','user.name','Test Author');git('config','user.email','author@example.invalid');git('config','commit.gpgsign','false')
        def rpc(method,fail=False,**fields):
            result=subprocess.run([str(BINARY),'-C',str(repo),'repo','-'],input=json.dumps({'method':method,**fields}),capture_output=True,text=True)
            if fail:assert result.returncode!=0,(method,result);return result
            assert result.returncode==0,(method,result.stdout,result.stderr)
            value=json.loads(result.stdout);assert not isinstance(value,dict) or value.get('code',0)==0,value;return value
        assert rpc('history')['commits']==[]
        file=repo/'file.txt';file.write_text('initial\n');git('add','--all');git('commit','-qm','Initial\n\nBody with delimiter \u001e and text')
        initial=git('rev-parse','HEAD').stdout.decode().strip()
        root_files=rpc('commit_files',commit=initial);assert root_files['parent'] is None and root_files['files'][0]['display_path']=='file.txt'
        root_diff=rpc('commit_diff',path='file.txt',commit=initial);assert not root_diff['can_select'] and root_diff['before']['mode'] is None
        for n in range(5):file.write_text(f'version {n}\n');git('add','--all');git('commit','-qm',f'Commit {n}')
        first=rpc('history',limit=2);assert len(first['commits'])==2 and first['next_offset']==2
        pinned=first['revision'];file.write_text('later\n');git('add','--all');git('commit','-qm','Later commit')
        rest=rpc('history',revision=pinned,offset=2,limit=100);assert len(rest['commits'])==4
        assert rest['commits'][-1]['message']=='Initial\n\nBody with delimiter \u001e and text\n'
        assert first['commits'][0]['author']['name']=='Test Author'
        rpc('history',limit=101,fail=True);rpc('history',revision='--help',fail=True)
        git('mv','file.txt','renamed.txt');git('commit','-qm','Rename')
        rename=git('rev-parse','HEAD').stdout.decode().strip();files=rpc('commit_files',commit=rename)['files']
        assert files[0]['status'].startswith('R') and files[0]['original_path']['bytes']==list(b'file.txt')
        diff=rpc('commit_diff',path='renamed.txt',commit=rename);assert diff['before']['oid']==diff['after']['oid'] and not diff['hunks']
        # Raw filename bytes survive commit file listings and historical diffs.
        path=b'raw-\xff';(repo/'normal').write_text('normal')
        import os
        with open(os.fsencode(repo)+b'/'+path,'wb') as handle:handle.write(b'raw content\n')
        git('add','--all');git('commit','-qm','Raw filename')
        raw_commit=git('rev-parse','HEAD').stdout.decode().strip();raw_files=rpc('commit_files',commit=raw_commit)['files']
        assert any(entry['path']['bytes']==list(path) for entry in raw_files)
        assert rpc('commit_diff',path={'bytes':list(path)},commit=raw_commit)['hunks'][0]['lines'][0]['text']=='raw content'
        # Upstream names and ahead/behind are computed from pinned object IDs.
        remote=root/'remote.git';subprocess.run(['git','init','--bare','-q',str(remote)],check=True)
        git('remote','add','origin',str(remote));git('push','-qu','origin','main')
        snapshot=rpc('snapshot');assert snapshot['upstream']=='refs/remotes/origin/main' and snapshot['ahead']==snapshot['behind']==0
        (repo/'ahead').write_text('ahead');git('add','--all');git('commit','-qm','Ahead')
        assert rpc('snapshot')['ahead']==1
        branches=rpc('branch_list');assert any(branch['current'] and branch['name']=='main' and branch['upstream']=='refs/remotes/origin/main' for branch in branches)
        rpc('rename_branch_preview',name='main',new_name='primary',fail=True)
        git('switch','-qc','published-topic');git('branch','--set-upstream-to','origin/main','published-topic')
        rpc('rename_branch',name='published-topic',new_name='primary');rpc('track_branch',name='primary',upstream='origin/main');assert rpc('snapshot')['branch']=='primary'
        rpc('detach',commit=initial);assert rpc('snapshot')['branch'] is None;git('switch','-q','primary')
        # Both-sides conflict, stale certification, resolution, and merge continuation.
        target=repo/'renamed.txt';git('switch','-qc','conflict');target.write_text('theirs\n');git('add','--all');git('commit','-qm','Theirs')
        git('switch','-q','primary');target.write_text('ours\n');git('add','--all');git('commit','-qm','Ours')
        rpc('merge',branch='conflict',fail=True);assert rpc('snapshot')['operation']['kind']=='merge'
        conflict=rpc('conflict_detail',path='renamed.txt');assert [entry['stage'] for entry in conflict['stages']]==[1,2,3]
        target.write_text('manually edited\n');rpc('resolve_conflict',path='renamed.txt',choice='theirs',basis=conflict['basis'],fail=True)
        conflict=rpc('conflict_detail',path='renamed.txt');rpc('resolve_conflict',path='renamed.txt',choice='theirs',basis=conflict['basis'])
        assert target.read_text()=='theirs\n' and not any(file['conflicted'] for file in rpc('snapshot')['files'])
        rpc('recover',kind='merge',action='continue');assert rpc('snapshot')['operation'] is None
        merged=git('rev-parse','HEAD').stdout.decode().strip();assert len(rpc('history',limit=1)['commits'][0]['parents'])==2
        assert rpc('commit_files',commit=merged,parent=1)['parent'] is not None
        rpc('revert',commit=merged,mainline=1);assert target.read_text()=='ours\n'
        rpc('cherry_pick',commit=merged,mainline=1);assert target.read_text()=='theirs\n'
        rpc('revert',commit=merged,mainline=0,fail=True)
        rpc('recover',kind='merge',action='abort',fail=True);rpc('commit_files',commit=initial,parent=1,fail=True)
        # A cherry-pick conflict is recognized and abort restores the prior branch.
        git('switch','-qc','pick-base',initial);file.write_text('pick ours\n');git('add','--all');git('commit','-qm','Pick base')
        git('switch','-qc','pick-source',initial);file.write_text('pick theirs\n');git('add','--all');git('commit','-qm','Pick source')
        pick=git('rev-parse','HEAD').stdout.decode().strip();git('switch','-q','pick-base')
        rpc('cherry_pick',commit=pick,fail=True);assert rpc('snapshot')['operation']['kind']=='cherry_pick'
        rpc('recover',kind='rebase',action='abort',fail=True)
        rpc('recover',kind='cherry_pick',action='abort');assert file.read_text()=='pick ours\n'
        # A missing conflict side means resolve as deletion, not a failed checkout.
        git('switch','-qc','delete-side');git('rm','-q','--','file.txt');git('commit','-qm','Delete side')
        git('switch','-q','pick-base');file.write_text('modified ours\n');git('add','--all');git('commit','-qm','Modify side')
        rpc('merge',branch='delete-side',fail=True);details=rpc('conflict_detail',path='file.txt')
        assert [entry['stage'] for entry in details['stages']]==[1,2]
        rpc('resolve_conflict',path='file.txt',choice='theirs',basis=details['basis']);assert not file.exists()
        rpc('recover',kind='merge',action='continue')
        # Binary choices preserve exact bytes and can complete a merge.
        binary=repo/'binary';binary.write_bytes(b'\0base');git('add','--all');git('commit','-qm','Binary base')
        git('switch','-qc','binary-side');binary.write_bytes(b'\0theirs');git('add','--all');git('commit','-qm','Binary theirs')
        git('switch','-q','pick-base');binary.write_bytes(b'\0ours');git('add','--all');git('commit','-qm','Binary ours')
        rpc('merge',branch='binary-side',fail=True);details=rpc('conflict_detail',path='binary')
        assert all(entry['text'] is None for entry in details['stages'])
        rpc('resolve_conflict',path='binary',choice='ours',basis=details['basis']);assert binary.read_bytes()==b'\0ours'
        rpc('recover',kind='merge',action='continue')
        # Recovery detects revert and rebase/apply operations as distinct states.
        recover_file=repo/'recover.txt';recover_file.write_text('A\n');git('add','--all');git('commit','-qm','A')
        base=git('rev-parse','HEAD').stdout.decode().strip()
        git('switch','-qc','replay-source');recover_file.write_text('B\n');git('add','--all');git('commit','-qm','B')
        replay=git('rev-parse','HEAD').stdout.decode().strip();patch=git('format-patch','-1','--stdout').stdout
        git('switch','-qc','replay-dest',base);recover_file.write_text('C\n');git('add','--all');git('commit','-qm','C')
        rpc('rebase',branch='replay-source',fail=True);assert rpc('snapshot')['operation']['kind']=='rebase'
        rpc('recover',kind='rebase',action='abort');assert recover_file.read_text()=='C\n'
        rpc('revert',commit=replay,fail=True);assert rpc('snapshot')['operation']['kind']=='revert'
        rpc('recover',kind='revert',action='abort');assert recover_file.read_text()=='C\n'
        attempted=subprocess.run(['git','-C',str(repo),'am'],input=patch,capture_output=True)
        assert attempted.returncode!=0 and rpc('snapshot')['operation']['kind']=='am'
        rpc('recover',kind='am',action='abort');assert recover_file.read_text()=='C\n'
        git('commit','--amend','-qm','C\n\nCo-authored-by: Helper <helper@example.invalid>')
        last=rpc('history',limit=1)['commits'][0];assert last['trailers']==[{'token':'Co-authored-by','value':'Helper <helper@example.invalid>'}]
        # Friendly CLI commands use the same pinned history data.
        assert json.loads(subprocess.run([str(BINARY),'-C',str(repo),'history','--limit','1'],capture_output=True,text=True,check=True).stdout)['commits'][0]['summary']=='C'
    print('PASS: pinned history, raw commit paths/diffs, tracking, renames/detach, conflict certifications, merge/cherry-pick recovery')

if __name__=='__main__':main()
