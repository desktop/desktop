"""Real staged-blob size review, consent fencing, LFS pointers and native hooks."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

from discard_advanced import BINARY, Fixture

LIMIT = 100 * 1024 * 1024


def preview(f):
    return f.rpc('commit_preview')


def stage_object(f, name, oid, mode='100644'):
    f.git('update-index', '--add', '--cacheinfo', mode, oid, name)


def reviewed(f, plan=None, **params):
    return f.rpc('commit', summary='reviewed commit', **({'basis': plan['basis']} if plan else {}), **params)


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-commit-review-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
        os.environ['GIT_CONFIG_GLOBAL'] = str(root / 'global')
        for key in list(os.environ):
            if key in ['GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS'] or key.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
                del os.environ[key]
        f = Fixture(root / 'repo')
        assert preview(f)['staged_count'] == 0
        # Compressible but genuine Git blobs on both sides of the exact limit.
        payload = root / 'payload'
        with payload.open('wb') as stream:
            stream.truncate(LIMIT)
        exact = f.git('hash-object', '-w', '--', str(payload)).stdout.decode().strip()
        with payload.open('ab') as stream:
            stream.write(b'x')
        large = f.git('hash-object', '-w', '--', str(payload)).stdout.decode().strip()
        stage_object(f, 'exact.bin', exact)
        assert preview(f)['large_files'] == []
        assert reviewed(f)['code'] == 0  # Backward-compatible ordinary commits.
        old_head = f.git('rev-parse', 'HEAD').stdout
        stage_object(f, 'oversized.bin', large)
        plan = preview(f)
        assert plan['staged_count'] == 1 and plan['threshold_bytes'] == LIMIT
        assert plan['large_files'][0]['size'] == LIMIT + 1
        assert plan['large_files'][0]['display_path'] == 'oversized.bin'
        assert plan['large_files'][0]['path'] == {'bytes': list(b'oversized.bin')}
        assert plan['large_files'][0]['oid'] == large
        assert not plan['large_files'][0]['tracked_by_lfs']
        before = (f.path / '.git/index').read_bytes()
        blocked = f.rpc('commit', fail=True, summary='blocked')
        denial = json.loads(blocked.stdout)
        assert denial['code'] == 2 and denial['requires_confirmation']
        assert (f.path / '.git/index').read_bytes() == before
        assert f.git('rev-parse', 'HEAD').stdout == old_head
        f.rpc('commit', fail=True, summary='unreviewed override', allow_large_files=True)
        cli = subprocess.run([str(BINARY), '-C', str(f.path), 'commit-preview'], capture_output=True, text=True, check=True)
        assert json.loads(cli.stdout)['basis'] == plan['basis']
        # Replacement refs cannot make the actual oversized blob appear small.
        small_file = f.path / 'normal.txt'; small_file.write_text('small\n')
        small = f.git('hash-object', '-w', '--', 'normal.txt').stdout.decode().strip()
        f.git('replace', large, small)
        assert int(f.git('cat-file', '-s', large).stdout) < LIMIT
        assert preview(f)['large_files'][0]['size'] == LIMIT + 1
        f.git('replace', '-d', large)
        # Working file existence/size is irrelevant; effective LFS attributes
        # are a hint only when the actual staged blob is still oversized.
        (f.path / '.gitattributes').write_text('*.bin filter=lfs\n')
        lfs_plan = preview(f)
        assert lfs_plan['large_files'][0]['tracked_by_lfs']
        f.rpc('commit', fail=True, summary='stale attributes', basis=plan['basis'], allow_large_files=True)
        (f.path / '.gitattributes').unlink()
        # Changing only branch identity at the same commit invalidates consent.
        f.git('branch', 'same-head')
        f.git('symbolic-ref', 'HEAD', 'refs/heads/same-head')
        f.rpc('commit', fail=True, summary='wrong branch', basis=plan['basis'], allow_large_files=True)
        f.git('symbolic-ref', 'HEAD', 'refs/heads/main')
        merge_message = f.path / '.git/MERGE_MSG'; merge_message.write_text('new operation context\n')
        f.rpc('commit', fail=True, summary='stale operation', basis=plan['basis'], allow_large_files=True)
        merge_message.unlink()
        f.git('add', '--', 'normal.txt')
        f.rpc('commit', fail=True, summary='stale index', basis=plan['basis'], allow_large_files=True)
        f.git('reset', '-q', '--', 'normal.txt')
        # Index refresh metadata can legitimately change a certificate: get a
        # fresh one after resetting rather than assuming byte-identical indexes.
        plan = preview(f)
        override = subprocess.run([str(BINARY), '-C', str(f.path), 'commit', 'reviewed CLI override', '--allow-large-files', '--basis', plan['basis']], capture_output=True, text=True, check=True)
        assert json.loads(override.stdout)['code'] == 0
        assert f.git('--no-replace-objects', 'cat-file', '-s', 'HEAD:oversized.bin').stdout.strip() == str(LIMIT + 1).encode()
        # Existing large blobs are not re-warned for an unrelated new commit.
        f.git('add', '--', 'normal.txt')
        assert preview(f)['large_files'] == []
        assert reviewed(f, preview(f))['code'] == 0
        # A proper LFS pointer is small even if the working file is huge.
        pointer = f.path / 'pointer.bin'
        pointer.write_text('version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a' * 64 + '\nsize ' + str(LIMIT + 1) + '\n')
        f.git('add', '--', 'pointer.bin')
        with pointer.open('wb') as stream:
            stream.truncate(LIMIT + 1)
        assert preview(f)['large_files'] == []
        # Intent-to-add, gitlinks and symlinks do not produce regular-blob warnings.
        intent = f.path / 'intent.bin'
        with intent.open('wb') as stream: stream.truncate(LIMIT + 1)
        f.git('add', '-N', '--', 'intent.bin')
        stage_object(f, 'module', 'b' * len(large), '160000')
        stage_object(f, 'link', large, '120000')
        assert preview(f)['large_files'] == []
        f.git('reset', '-q', 'HEAD', '--')
        # Raw names are preserved and a staged rename destination is checked.
        raw_name = b'raw-\xff\n.bin'
        stage_object(f, raw_name, large)
        raw = preview(f)['large_files'][0]
        assert raw['path']['bytes'] == list(raw_name)
        f.git('reset', '-q', 'HEAD', '--')
        f.git('update-index', '--force-remove', '--', 'oversized.bin')
        stage_object(f, 'renamed.bin', large)
        assert preview(f)['large_files'][0]['display_path'] == 'renamed.bin'
        f.git('reset', '-q', 'HEAD', '--')
        # HEAD-only changes also invalidate a captured review.
        f.git('add', '--', 'normal.txt')
        plan = preview(f)
        old_head = f.git('rev-parse', 'HEAD').stdout.strip()
        new_head = f.git('commit-tree', 'HEAD^{tree}', '-m', 'different HEAD').stdout.strip()
        f.git('update-ref', 'HEAD', new_head)
        f.rpc('commit', fail=True, summary='stale HEAD', basis=plan['basis'])
        f.git('update-ref', 'HEAD', old_head)
        # Normal hooks keep Git's native pathspec semantics, even when the
        # parent environment requests literal paths for typed file operations.
        (f.path / 'normal.txt').write_text('changed\n'); f.git('add', '--', 'normal.txt')
        hook = f.path / '.git/hooks/pre-commit'
        hook.write_text('#!/bin/sh\ngit ls-files "*.txt" > hook-paths\n')
        hook.chmod(0o700)
        os.environ['GIT_LITERAL_PATHSPECS'] = '1'
        try:
            assert reviewed(f, preview(f))['code'] == 0
        finally:
            del os.environ['GIT_LITERAL_PATHSPECS']
        assert (f.path / 'hook-paths').read_text() == 'normal.txt\n'
        hook.unlink()
        # Split indexes, linked worktrees and SHA-256 use the same review path.
        for name, options in [('split', []), ('sha256', ['--object-format=sha256'])]:
            other = Fixture(root / name, *options)
            item = other.path / 'file'; item.write_text('first\n'); other.commit()
            if name == 'split': other.git('update-index', '--split-index')
            item.write_text('second\n'); other.git('add', '--', 'file')
            assert reviewed(other, preview(other))['code'] == 0
            if name == 'sha256':
                oid = other.git('hash-object', '-w', '--', str(payload)).stdout.decode().strip()
                stage_object(other, 'big', oid)
                assert preview(other)['large_files'][0]['size'] == LIMIT + 1
                assert reviewed(other, preview(other), allow_large_files=True)['code'] == 0
        linked = root / 'linked'
        f.git('worktree', 'add', '-qb', 'linked', str(linked))
        worktree = object.__new__(Fixture); worktree.path = linked
        (linked / 'normal.txt').write_text('linked\n'); worktree.git('add', '--', 'normal.txt')
        assert reviewed(worktree, preview(worktree))['code'] == 0
    print('commit review: real size boundary, no-write denial, consent fencing, replacement refs, LFS pointers, raw paths, hooks, split/SHA256/worktree passed')


if __name__ == '__main__':
    main()
