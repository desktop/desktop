"""Real, offline Git LFS setup, exact attributes, and payload-safe discard/undo."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from discard_advanced import Fixture, BINARY


def main():
    binary = os.environ.get('GIT_LFS_BIN') or shutil.which('git-lfs')
    assert binary, 'Install git-lfs or set GIT_LFS_BIN to its executable'
    os.environ['PATH'] = str(Path(binary).resolve().parent) + os.pathsep + os.environ['PATH']
    os.environ['GIT_CONFIG_NOSYSTEM'] = '1'
    with tempfile.TemporaryDirectory(prefix='desktop-lfs-') as temporary:
        root = Path(temporary)
        os.environ['GIT_CONFIG_GLOBAL'] = str(root / 'global')
        f = Fixture(root / 'repo')
        hooks = f.path / '.git/hooks/pre-push'
        local_config = f.path / '.git/config'
        config_before = local_config.read_bytes()
        status = f.rpc('lfs_status')
        assert status['available'] and not status['using_lfs'] and not hooks.exists(), status
        assert local_config.read_bytes() == config_before
        # Listing a repository that has not initialized LFS must still return
        # full tracking data without writing its format version or cache.
        attributes = f.path / '.gitattributes'
        attributes.write_text('*.bin filter=lfs lockable\n*.excluded -filter\n')
        status = f.rpc('lfs_status', paths=['payload.bin', 'payload.excluded'])
        assert status['using_lfs'] and [item['tracked'] for item in status['files']] == [True, False], status
        assert status['patterns'] == [
            {'pattern': '*.bin', 'source': '.gitattributes', 'lockable': True, 'tracked': True},
            {'pattern': '*.excluded', 'source': '.gitattributes', 'lockable': False, 'tracked': False},
        ], status
        assert local_config.read_bytes() == config_before and not hooks.exists()
        assert not (f.path / '.git/lfs').exists()
        assert attributes.read_text() == '*.bin filter=lfs lockable\n*.excluded -filter\n'
        attributes.unlink()
        assert f.rpc('lfs_install')['code'] == 0
        assert hooks.exists() and f.git('config', '--local', 'filter.lfs.required').stdout == b'true\n'
        assert not (root / 'global').exists()
        f.git('lfs', 'track', '*.bin')
        file = f.path / 'data.bin'; file.write_bytes(b'committed LFS body\n'); f.commit()
        status = f.rpc('lfs_status', paths=['data.bin', 'data.bin.txt', {'bytes': list(b'\xff.bin')}])
        assert status['using_lfs'] and [item['tracked'] for item in status['files']] == [True, False, True]
        assert status['patterns'][0]['source'] == '.gitattributes'
        # A read query must never restore deleted hooks.
        hooks.unlink(); f.rpc('lfs_status'); assert not hooks.exists()
        f.rpc('lfs_status', paths=['../outside'], fail=True)
        f.rpc('lfs_install', scope='system', fail=True)
        # Existing hooks are preserved unless --force is explicitly selected.
        hooks.write_text('#!/bin/sh\necho custom-hook\n'); hooks.chmod(0o700)
        assert json.loads(f.rpc('lfs_install', fail=True).stdout)['code'] != 0 and 'custom-hook' in hooks.read_text()
        assert f.rpc('lfs_install', force=True)['code'] == 0 and 'git lfs pre-push' in hooks.read_text()
        global_install = subprocess.run([str(BINARY), '-C', str(f.path), 'lfs', 'install', '--global', '--skip-repo', '--skip-smudge'], capture_output=True)
        assert global_install.returncode == 0, global_install.stderr
        assert b'--skip' in f.git('config', '--global', 'filter.lfs.smudge').stdout
        # Isolate subsequent repositories from global filter/skip-smudge effects.
        (root / 'global').unlink()
        for label, options in [('standard', []), ('sha256', ['--object-format=sha256']), ('custom-storage', []), ('linked', []), ('raw-path', []), ('noncanonical', []), ('raw-repository', [])]:
            f = Fixture(root / ('\udcfe-repository' if label == 'raw-repository' else label), *options)
            assert f.rpc('lfs_install')['code'] == 0
            if label == 'custom-storage': f.git('config', 'lfs.storage', str(root / 'LFS store with spaces'))
            f.git('lfs', 'track', '*.bin')
            name = '\udcff.bin' if label == 'raw-path' else 'large.bin'
            path_param = {'bytes': list(os.fsencode(name))} if label == 'raw-path' else name
            file = f.path / name; file.write_bytes(b'head\x00binary\n'); f.commit()
            if label == 'linked':
                linked = root / 'linked-tree'; f.git('worktree', 'add', '-qb', 'linked', str(linked)); f.path = linked; file = linked / name
            staged = b'staged payload\x00\n' * (300000 if label == 'standard' else 300)  # Exercise streaming limits once; other fixtures cover semantics.
            working = b'working payload\n'
            file.write_bytes(staged); f.git('add', '--', name)
            pointer = f.git('show', ':' + name).stdout
            if label == 'noncanonical':
                pointer = pointer.rstrip(b'\n').replace(b'\n', b'\r\n').replace(b'size ', b'size +0')
                candidate = root / 'noncanonical-pointer'; candidate.write_bytes(pointer)
                assert f.git('lfs', 'pointer', '--check', '--file=' + str(candidate), check=False).returncode == 0
                blob = f.git('hash-object', '-w', '--no-filters', '--', str(candidate)).stdout.strip().decode()
                f.git('update-index', '--cacheinfo', '100644', blob, name)
            oid = next(line.removeprefix(b'oid sha256:') for line in pointer.splitlines() if line.startswith(b'oid ')).decode()
            media = Path(os.fsdecode(next(line.removeprefix(b'LocalMediaDir=') for line in f.git('lfs', 'env').stdout.splitlines() if line.startswith(b'LocalMediaDir=' ))))
            cache = media / oid[:2] / oid[2:4] / oid
            assert cache.read_bytes() == staged
            file.write_bytes(working)
            plan = f.rpc('discard_preview', path=path_param)
            assert plan['backup_bytes'] >= len(staged) + len(working)
            result = f.rpc('discard', path=path_param, basis=plan['basis']); undo_id = result['undo_id']
            assert file.read_bytes() == b'head\x00binary\n'
            gitdir = Path(os.fsdecode(f.git('rev-parse', '--absolute-git-dir').stdout.strip()))
            journal = gitdir / 'desktop-undo' / undo_id
            assert (journal / ('lfs-' + oid)).read_bytes() == staged
            cache.unlink(); f.git('prune', '--expire', 'now')
            if label == 'custom-storage':
                new_storage = root / 'Moved LFS storage'
                shutil.copytree(media, new_storage / 'objects')
                f.git('config', 'lfs.storage', str(new_storage))
                media = new_storage / 'objects'; cache = media / oid[:2] / oid[2:4] / oid
                assert not cache.exists()

            f.undo(undo_id)
            assert file.read_bytes() == working and f.git('show', ':' + name).stdout == pointer
            assert cache.read_bytes() == staged
            # A genuine LFS checkout can now hydrate the restored staged pointer.
            file.write_bytes(pointer); f.git('lfs', 'checkout', name)
            assert file.read_bytes() == staged
            # Missing/corrupt local payloads abort before any discard is published.
            file.write_bytes(working); cache.unlink()
            before_index = (gitdir / 'index').read_bytes()
            f.rpc('discard_preview', path=path_param, fail=True)
            assert file.read_bytes() == working and (gitdir / 'index').read_bytes() == before_index
            cache.write_bytes(b'corrupt local payload')
            f.rpc('discard_preview', path=path_param, fail=True)
            cache.write_bytes(staged)
            undo_id = f.discard(path_param); original_index = (gitdir / 'index').read_bytes()
            saved = gitdir / 'desktop-undo' / undo_id / ('lfs-' + oid)
            saved.write_bytes(b'corrupt backup')
            f.undo(undo_id, fail=True)
            assert file.read_bytes() == b'head\x00binary\n' and (gitdir / 'index').read_bytes() == original_index
            saved.write_bytes(staged); cache.write_bytes(b'corrupt destination')
            f.undo(undo_id, fail=True)
            assert file.read_bytes() == b'head\x00binary\n'
            # Cache symlinks must not be followed or overwrite an outside object.
            cache.unlink(); outside = root / ('outside-' + label); outside.write_bytes(b'untouched')
            cache.symlink_to(outside); f.undo(undo_id, fail=True)
            assert outside.read_bytes() == b'untouched' and file.read_bytes() == b'head\x00binary\n'
            cache.unlink(); f.undo(undo_id)
            assert file.read_bytes() == working and cache.read_bytes() == staged
        # Older zero-size pointer blobs represent an empty body without any
        # cached payload. Undo must preserve those pointer bytes too.
        import hashlib
        f = Fixture(root / 'empty-pointer'); f.rpc('lfs_install'); f.git('lfs', 'track', '*.bin')
        file = f.path / 'empty.bin'; file.write_bytes(b'head body\n'); f.commit()
        empty = f"version https://git-lfs.github.com/spec/v1\noid sha256:{hashlib.sha256(b'').hexdigest()}\nsize 0\n".encode()
        saved_pointer = root / 'empty-pointer-blob'; saved_pointer.write_bytes(empty)
        blob = f.git('hash-object', '-w', '--no-filters', '--', str(saved_pointer)).stdout.strip().decode()
        f.git('update-index', '--cacheinfo', '100644', blob, 'empty.bin')
        file.write_bytes(b'working body\n'); undo_id = f.discard('empty.bin')
        f.undo(undo_id); assert file.read_bytes() == b'working body\n' and f.git('show', ':empty.bin').stdout == empty
        file.write_bytes(empty); f.git('lfs', 'checkout', 'empty.bin'); assert file.read_bytes() == b''
        path_param = 'empty.bin'
        # Exact attribute checks still work when the optional executable is absent.
        fake = root / 'missing-lfs'; fake.mkdir()
        shim = fake / 'git-lfs'; shim.write_text('#!/bin/sh\nexit 1\n'); shim.chmod(0o700)
        os.environ['PATH'] = str(fake) + os.pathsep + os.environ['PATH']
        os.environ['GIT_EXEC_PATH'] = str(fake)
        status = f.rpc('lfs_status', paths=[path_param])
        assert not status['available'] and status['files'][0]['tracked'] and 'hint' in status
    print('PASS: real Git LFS inspection/setup and payload undo after cache/object pruning, including corrupt and missing data, custom storage, linked/SHA256 and raw filenames')


if __name__ == '__main__': main()
