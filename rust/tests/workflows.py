"""Exercise migrated workflows in isolated local repositories, including failure cases."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-workflows-') as temp:
        root = Path(temp)
        repo = root / 'repo'
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(repo)], check=True)
        def git(*args, check=True):
            return subprocess.run(['git', '-C', str(repo), *args], capture_output=True, check=check)
        git('config', 'user.name', 'Migration Test')
        git('config', 'user.email', 'migration@example.invalid')
        git('config', 'commit.gpgsign', 'false')
        def rpc(method, fail=False, **params):
            process = subprocess.run([str(BINARY), '-C', str(repo), 'repo', json.dumps({'method': method, **params})], capture_output=True, text=True)
            if fail:
                assert process.returncode != 0, (method, process)
                return
            assert process.returncode == 0, (method, process.stderr, process.stdout)
            result = json.loads(process.stdout)
            assert result.get('code', 0) == 0, (method, result)
            return result
        # An unborn branch, and a staged file modified again before unstaging.
        file = repo / 'file.txt'
        file.write_text('initial\n')
        rpc('stage', paths=['file.txt'])
        file.write_text('initial modified\n')
        rpc('unstage', paths=['file.txt'])
        snapshot = rpc('snapshot')
        assert snapshot['branch'] == 'main' and snapshot['head'] is None
        assert snapshot['files'][0]['index'] == '?'
        rpc('stage', paths=['file.txt'])
        rpc('commit', summary='First commit', description='Description\nsecond line')
        first = git('rev-parse', 'HEAD').stdout.decode().strip()
        assert 'Description\nsecond line' in git('log', '-1', '--format=%B').stdout.decode()
        # A path that looks like pathspec magic must be literal, including raw bytes.
        names = [b':(glob)*.txt', b'line\nbreak', b'invalid-\xff', b'-flag']
        for name in names:
            with open(os.fsencode(repo) + b'/' + name, 'wb') as handle:
                handle.write(b'unusual\n')
        for name in names:
            rpc('stage', paths=[{'bytes': list(name)}])
        staged = git('diff', '--cached', '--name-only', '-z').stdout.split(b'\0')
        assert all(name in staged for name in names)
        rpc('commit', summary='Unusual paths')
        rpc('stage', paths=[], fail=True)
        rpc('stage', paths=['../outside'], fail=True)
        rpc('stage', paths=['/etc/passwd'], fail=True)
        rpc('create_branch', name='--orphan', fail=True)
        rpc('create_branch', name='@{-1}', fail=True)
        rpc('commit', summary='bad\nsummary', fail=True)
        rpc('stage', paths=['file.txt'], force=True, fail=True)
        # Changes, staging, staged diff, unstage, and stash preservation.
        file.write_text('second\n')
        rpc('stage', paths=['file.txt'])
        assert '+second' in rpc('diff', staged=True, path='file.txt')['stdout']
        rpc('unstage', paths=['file.txt'])
        assert file.read_text() == 'second\n'
        rpc('stash_save', message='saved work')
        assert not rpc('snapshot')['files']
        listing = rpc('stash_list'); entry = listing['entries'][0]
        assert 'saved work' in entry['message']
        rpc('stash_apply', oid=entry['oid'])
        assert file.read_text() == 'second\n'
        rpc('stash_drop', index=0, oid=entry['oid'], basis=listing['basis'])
        rpc('stage', paths=['file.txt'])
        rpc('commit', summary='Second')
        second = git('rev-parse', 'HEAD').stdout.decode().strip()
        # Branches, merge, tags, safe deletion.
        rpc('create_branch', name='feature@work', checkout=True)
        (repo / 'feature').write_text('feature\n')
        rpc('stage', paths=['feature'])
        rpc('commit', summary='Feature')
        feature = git('rev-parse', 'HEAD').stdout.decode().strip()
        rpc('checkout', branch='main')
        rpc('merge', branch='feature@work')
        assert (repo / 'feature').exists()
        rpc('delete_branch', name='feature@work')
        rpc('tag_create', name='v1', target=first)
        assert 'v1' in rpc('tags')['stdout']
        rpc('tag_delete', name='v1')
        # Cherry-pick and revert from a separate base without changing main.
        rpc('create_branch', name='pick', checkout=True)
        git('reset', '--hard', second)
        rpc('cherry_pick', commit=feature)
        picked = git('rev-parse', 'HEAD').stdout.decode().strip()
        rpc('revert', commit=picked)
        assert not (repo / 'feature').exists()
        rpc('checkout', branch='main')
        # Rebase a genuinely divergent branch.
        rpc('create_branch', name='rebased', checkout=True)
        (repo / 'rebase-file').write_text('rebased\n')
        rpc('stage', paths=['rebase-file'])
        rpc('commit', summary='Rebase me')
        rpc('checkout', branch='main')
        (repo / 'main-file').write_text('main\n')
        rpc('stage', paths=['main-file'])
        rpc('commit', summary='Advance main')
        rpc('checkout', branch='rebased')
        rpc('rebase', branch='main')
        assert (repo / 'main-file').exists() and (repo / 'rebase-file').exists()
        rpc('checkout', branch='main')
        # Local bare remote verifies real fetch/push/pull without GitHub credentials.
        remote = root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', '-q', str(remote)], check=True)
        rpc('add_remote', name='origin', url=str(remote))
        assert 'origin' in rpc('remotes')['stdout']
        rpc('push', remote='origin', branch='main', set_upstream=True)
        rpc('fetch', remote='origin')
        rpc('pull', remote='origin', branch='main')
        rpc('remove_remote', name='origin')
        assert not rpc('remotes')['stdout']
        rpc('fetch', remote='--upload-pack=bad', fail=True)
        rpc('add_remote', name='origin', url='ext::malicious', fail=True)
        # Conflicts must remain visible and recoverable with merge_abort.
        rpc('create_branch', name='conflicting', checkout=True)
        file.write_text('conflict side\n')
        rpc('stage', paths=['file.txt'])
        rpc('commit', summary='Conflict side')
        rpc('checkout', branch='main')
        file.write_text('main side\n')
        rpc('stage', paths=['file.txt'])
        rpc('commit', summary='Main side')
        rpc('merge', branch='conflicting', fail=True)
        assert any(change['conflicted'] for change in rpc('snapshot')['files'])
        rpc('merge_abort')
        assert file.read_text() == 'main side\n'
        assert not rpc('snapshot')['files']
        rpc('rebase', branch='conflicting', fail=True)
        assert any(change['conflicted'] for change in rpc('snapshot')['files'])
        rpc('rebase_abort')
        assert file.read_text() == 'main side\n'
        rpc('rebase', branch='conflicting', fail=True)
        file.write_text('resolved\n')
        rpc('stage', paths=['file.txt'])
        rpc('rebase_continue')
        assert not rpc('snapshot')['files']
        assert file.read_text() == 'resolved\n'
        # Paths are relative to the canonical repository root even from a subdirectory.
        subdir = repo / 'subdir'
        subdir.mkdir()
        process = subprocess.run([str(BINARY), '-C', str(subdir), 'snapshot'], capture_output=True, text=True, check=True)
        assert json.loads(process.stdout)['root'] == str(repo)
    print('PASS: typed mutations, raw filename bytes, literal pathspecs, branches, stash, merge/conflict recovery, rebase, cherry-pick/revert, tags, local remotes')


if __name__ == '__main__':
    main()
