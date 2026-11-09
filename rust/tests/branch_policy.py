"""Default-branch inference and action guards against real, isolated native refs."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from discard_advanced import BINARY, Fixture


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-branch-policy-') as temporary:
        root = Path(temporary)
        global_config = root/'global.config'
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(global_config)
        def seed(name, *options):
            f = Fixture(root/name, *options)
            (f.path/'file').write_text('base'); f.commit()
            return f
        def policy(f): return f.rpc('branch_policy')
        def permission(f, name): return next(branch for branch in policy(f)['branches'] if branch['name'] == name)
        def remote(f, name='origin', default='main'):
            # These URLs must never be contacted by policy inference.
            f.git('remote','add',name,str(root/'uncontacted.git'))
            tip = f.git('rev-parse','HEAD').stdout.strip().decode()
            f.git('update-ref',f'refs/remotes/{name}/{default}',tip)
            f.git('symbolic-ref',f'refs/remotes/{name}/HEAD',f'refs/remotes/{name}/{default}')
        def reject_delete(f, name):
            before = f.git('for-each-ref','--format=%(refname) %(objectname)').stdout
            for method, extra in [('delete_branch_preview',{}),('delete_branch',{'force':True})]:
                result=f.rpc(method,name=name,fail=True,**extra)
                assert 'default branch cannot be deleted' in result.stderr, result.stderr
            assert f.git('for-each-ref','--format=%(refname) %(objectname)').stdout == before
            assert not (f.path/'.git/desktop-branch-deletions').exists()
        def reject_rename(f, name):
            for method in ['rename_branch_preview','rename_branch']:
                result=f.rpc(method,name=name,new_name='replacement',fail=True)
                assert 'published default branch cannot be renamed' in result.stderr, result.stderr
            assert not (f.path/'.git/desktop-branch-renames').exists()
        f=seed('fallback'); f.git('branch','feature')
        (f.path/'file').write_text('working'); (f.path/'untracked').write_bytes(b'keep\0')
        index=(f.path/'.git/index').read_bytes()
        p=policy(f); assert p['source']=='main' and p['default_remote'] is None
        assert p['default_branch']=={'name':'main','reference':'refs/heads/main','local':True}
        assert permission(f,'main')['can_rename'] and not permission(f,'main')['can_delete']
        reject_delete(f,'main')
        assert (f.path/'.git/index').read_bytes()==index and (f.path/'file').read_text()=='working'
        assert (f.path/'untracked').read_bytes()==b'keep\0'
        listed=f.rpc('branch_list'); assert next(b for b in listed if b['name']=='main')['policy']==permission(f,'main')
        snapshot=f.rpc('snapshot'); assert snapshot['branch_policy']==permission(f,'main') and snapshot['default_branch']==p['default_branch']
        # Unpublished default renames remain valid; a new fallback branch must
        # actually exist before it can become the inferred default.
        review=f.rpc('rename_branch_preview',name='main',new_name='renamed')
        assert review['policy']['is_default'] and not review['policy']['published']
        f.rpc('rename_branch',name='main',new_name='renamed',basis=review['basis'])
        assert policy(f)['default_branch'] is None
        f.git('branch','main'); reject_delete(f,'main')
        # Desktop reads the GLOBAL initialization preference; local settings
        # must not change that fallback. Quoted and Unicode names stay literal.
        f=seed('global'); wanted="release/ñ'$(literal)"; f.git('branch',wanted)
        f.git('config','--global','init.defaultBranch',wanted)
        f.git('config','init.defaultBranch','main')
        p=policy(f); assert p['source']=='global_init' and p['default_branch']['name']==wanted
        reject_delete(f,wanted); assert permission(f,'main')['can_delete']
        f.git('config','--global','--unset-all','init.defaultBranch')
        # Desktop's explicit global query does not traverse included files.
        # A repository-conditioned include must not silently change protections.
        f=seed('global-includes'); f.git('branch','trunk')
        included=root/'included-default'; included.write_text('[init]\n    defaultBranch = trunk\n')
        f.git('config','--global','include.path',str(included))
        assert policy(f)['source']=='main' and policy(f)['default_branch']['name']=='main'
        reject_delete(f,'main'); assert permission(f,'trunk')['can_delete']
        f.git('config','--global','--unset-all','include.path')
        f.git('config','--global','includeIf.gitdir:'+str(f.path)+'/.git.path',str(included))
        assert f.git('config','--global','--includes','--null','--get','init.defaultBranch').stdout==b'trunk\0'
        assert policy(f)['default_branch']['name']=='main'
        f.git('config','--global','--remove-section','includeIf.gitdir:'+str(f.path)+'/.git')
        # Origin wins over a lexically earlier remote; otherwise the first
        # native remote is used. A nested default ref is not shortened.
        f=seed('remotes'); remote(f,'aaa','other'); f.git('branch','other'); remote(f,'origin','release/stable'); f.git('branch','release/stable')
        p=policy(f); assert p['default_remote']=='origin' and p['default_name']=='release/stable' and p['source']=='remote_head'
        reject_delete(f,'release/stable')
        f.git('remote','remove','origin'); assert policy(f)['default_branch']['name']=='other'
        f.git('symbolic-ref','--delete','refs/remotes/aaa/HEAD'); assert policy(f)['default_branch']['name']=='main'
        # Push-only and empty-reset remotes do not qualify as defaults. Fetch
        # URL contents (including line breaks/credentials) are never exposed.
        f=seed('fetch-capable'); remote(f,'aaa','other'); f.git('branch','other')
        f.git('config','remote.origin.pushurl','not-contacted')
        assert policy(f)['default_remote']=='aaa'
        f.git('config','--add','remote.origin.url','https://private:secret@example.invalid/repo?token=secret\nsecond line')
        f.git('update-ref','refs/remotes/origin/main',f.git('rev-parse','HEAD').stdout.strip().decode())
        f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main')
        assert policy(f)['default_remote']=='origin' and 'secret' not in json.dumps(policy(f))
        f.git('config','--add','remote.origin.url',''); assert policy(f)['default_remote']=='aaa'
        f.git('config','--add','remote.origin.url','not-contacted-again'); assert policy(f)['default_remote']=='origin'
        f=seed('unicode-remotes'); remote(f,'\ue000','bmp'); remote(f,'\U00010000',"release/ñ'quoted")
        assert policy(f)['default_remote']=='\U00010000' and policy(f)['default_name']=="release/ñ'quoted"
        # A local tracking name has priority over a same-named local branch.
        # Matching names win when several local branches track the remote HEAD.
        f=seed('tracking'); remote(f); f.git('branch','a-track'); f.git('branch','z-track')
        f.git('branch','--set-upstream-to','origin/main','a-track'); f.git('branch','--set-upstream-to','origin/main','z-track')
        assert policy(f)['default_branch']['name']=='a-track'; reject_delete(f,'a-track'); reject_rename(f,'a-track')
        assert permission(f,'main')['can_delete'] and permission(f,'z-track')['can_rename']
        f.git('branch','--set-upstream-to','origin/main','main')
        assert policy(f)['default_branch']['name']=='main'; reject_rename(f,'main')
        # Symbolic aliases cannot become separate default/action candidates.
        # Their tracking configuration must not steal protection from main.
        f=seed('symbolic-alias'); remote(f); f.git('branch','feature')
        f.git('symbolic-ref','refs/heads/aaa','refs/heads/feature')
        f.git('config','branch.aaa.remote','origin'); f.git('config','branch.aaa.merge','refs/heads/main')
        p=policy(f); assert p['default_branch']['name']=='main'
        assert all(branch['name']!='aaa' for branch in p['branches'])
        assert all(branch['name'] not in ['aaa','origin/HEAD'] for branch in f.rpc('branch_list'))
        reject_delete(f,'main')
        f.rpc('rename_branch_preview',name='aaa',new_name='renamed-alias',fail=True)
        f.rpc('delete_branch_preview',name='aaa',fail=True)
        assert f.git('symbolic-ref','refs/heads/aaa').stdout==b'refs/heads/feature\n'
        # Continue the published/gone-tip check on a genuine tracked default.
        f.git('branch','--set-upstream-to','origin/main','main')
        # A missing upstream object is still a configured upstream. Policy is
        # based on tracking identity, not server access or commit availability.
        f.git('update-ref','-d','refs/remotes/origin/main')
        assert permission(f,'main')['published']; reject_rename(f,'main')
        # Remote-only defaults can be checked out before deleting the only
        # local feature. Tracking is native and the new default is protected.
        f=seed('remote-only'); f.git('branch','-m','feature'); remote(f,'origin','trunk')
        p=policy(f); assert not p['default_branch']['local']
        review=f.rpc('delete_branch_preview',name='feature')
        assert review['checkout']['target']['reference']=='refs/remotes/origin/trunk'
        f.rpc('delete_branch',name='feature',force=True,strategy='MoveToNewBranch',basis=review['basis'])
        assert f.git('symbolic-ref','HEAD').stdout==b'refs/heads/trunk\n'
        assert f.git('config','branch.trunk.merge').stdout==b'refs/heads/trunk\n'
        assert permission(f,'trunk')['is_default'] and not permission(f,'trunk')['can_delete']
        # A remote HEAD movement with equal commit IDs changes policy. A stale
        # deletion or rename must stop before stashes, journals or remote work.
        for operation in ['delete','rename']:
            f=seed('stale-'+operation); f.git('branch','feature'); remote(f)
            tip=f.git('rev-parse','HEAD').stdout.strip().decode(); f.git('update-ref','refs/remotes/origin/feature',tip)
            f.git('branch','--set-upstream-to','origin/feature','feature')
            method='delete_branch_preview' if operation=='delete' else 'rename_branch_preview'
            extra={} if operation=='delete' else {'new_name':'replacement'}
            review=f.rpc(method,name='feature',**extra)
            f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/feature')
            result=f.rpc('delete_branch' if operation=='delete' else 'rename_branch',name='feature',basis=review['basis'],fail=True,**({'force':True} if operation=='delete' else extra))
            assert 'default branch' in result.stderr
            assert f.git('show-ref','--verify','--quiet','refs/heads/feature',check=False).returncode==0
            assert not (f.path/'.git/desktop-branch-deletions').exists() and not (f.path/'.git/desktop-branch-renames').exists()
        # The reviewed certificate also changes when a different default is
        # selected but the requested action remains allowed at the same tip.
        for operation in ['delete','rename']:
            f=seed('basis-'+operation); f.git('branch','feature'); f.git('branch','other'); remote(f)
            f.git('update-ref','refs/remotes/origin/other',f.git('rev-parse','HEAD').stdout.strip().decode())
            extra={} if operation=='delete' else {'new_name':'replacement'}
            review=f.rpc('delete_branch_preview' if operation=='delete' else 'rename_branch_preview',name='feature',**extra)
            f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/other')
            assert permission(f,'feature')['can_delete'] and permission(f,'feature')['can_rename']
            result=f.rpc('delete_branch' if operation=='delete' else 'rename_branch',name='feature',basis=review['basis'],fail=True,**({'force':True} if operation=='delete' else extra))
            assert 'context changed' in result.stderr or 'review changed' in result.stderr, result.stderr
            assert not (f.path/'.git/desktop-branch-deletions').exists() and not (f.path/'.git/desktop-branch-renames').exists()
        # Native checkout hooks can change policy after the reviewed switch.
        # Retain the local tip and recovery receipt instead of deleting it.
        f=seed('checkout-hook'); f.git('switch','-qc','feature'); remote(f)
        tip=f.git('rev-parse','HEAD').stdout.strip().decode(); f.git('update-ref','refs/remotes/origin/feature',tip)
        hook=f.path/'.git/hooks/post-checkout'; real=shutil.which('git'); assert real
        hook.write_text(f'#!{sys.executable}\nimport subprocess\nsubprocess.run([{real!r},"symbolic-ref","refs/remotes/origin/HEAD","refs/remotes/origin/feature"],check=True)\n'); hook.chmod(0o700)
        review=f.rpc('delete_branch_preview',name='feature')
        result=f.rpc('delete_branch',name='feature',force=True,basis=review['basis'],strategy='MoveToNewBranch',fail=True)
        assert 'default branch cannot be deleted' in result.stderr
        assert f.git('show-ref','--verify','--quiet','refs/heads/feature',check=False).returncode==0
        assert f.rpc('deleted_branches')[0]['phase']=='switching'
        # Policy reads do not depend on the index, preferences or current HEAD.
        for label,options in [('sha256',('--object-format=sha256',)),('reftable',('--ref-format=reftable',)),('packed',()),('linked',())]:
            f=seed(label,*options); remote(f); f.git('branch','--set-upstream-to','origin/main','main')
            if label=='packed': f.git('pack-refs','--all','--prune')
            if label=='linked':
                linked=root/'linked-tree'; f.git('worktree','add','-qb','feature',str(linked)); f.path=linked
            reject_delete(f,'main'); reject_rename(f,'main')
            f.git('switch','--detach','-q'); assert f.rpc('snapshot')['branch_policy'] is None
            gitdir=Path(f.git('rev-parse','--absolute-git-dir').stdout.decode().strip()); index=gitdir/'index'; index.write_bytes(b'corrupt preserved')
            config=root/(label+'-registry.json'); prefs=config.with_suffix('.preferences.json'); prefs.write_text('{broken')
            result=subprocess.run([str(BINARY),'-C',str(f.path),'--config',str(config),'branch-policy'],capture_output=True,text=True)
            assert result.returncode==0,result.stderr
            assert json.loads(result.stdout)['default_branch']['name']=='main' and not config.exists() and prefs.read_text()=='{broken'
            assert index.read_bytes()==b'corrupt preserved'
        f=Fixture(root/'unborn'); assert policy(f)['branches']==[] and policy(f)['default_branch'] is None and f.rpc('snapshot')['branch_policy'] is None
        f=seed('bad-remote-head'); remote(f); f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/heads/main')
        assert policy(f)['remote_head'] is None and policy(f)['default_branch']['name']=='main'
        assert f.rpc('snapshot')['branch_policy']['is_default']
        reject_delete(f,'main')
        # A broken cached HEAD is also unavailable to Desktop's symbolic-ref
        # helper. Prove this fixture returns 128 before checking both entrypoints.
        f=seed('looping-remote-head'); remote(f)
        f.git('symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/HEAD')
        assert f.git('symbolic-ref','--quiet','refs/remotes/origin/HEAD',check=False).returncode==128
        result=subprocess.run([str(BINARY),'-C',str(f.path),'branch-policy'],capture_output=True,text=True)
        assert result.returncode==0,result.stderr
        fallback=json.loads(result.stdout)
        assert fallback['remote_head'] is None and fallback['source']=='main' and fallback['default_branch']['name']=='main'
        snapshot=f.rpc('snapshot')
        assert snapshot['default_branch']['name']=='main' and snapshot['branch_policy']['is_default']
    print('PASS: default branch global/remote/tracking inference, shared CLI/snapshot/list permissions, protected deletion/rename, stale equal-tip policy and post-checkout fences, remote-only fallback, native backends/worktrees and read-only corrupt-index/preferences cases')


if __name__=='__main__': main()
