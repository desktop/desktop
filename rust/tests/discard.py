"""Certified whole/partial discards, streamed filters, durable undo and recovery."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-discard-') as temporary:
        root = Path(temporary)
        repo = root / 'repository with spaces'
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(repo)], check=True)
        def git(*args, check=True):
            return subprocess.run(['git', '-C', str(repo), *args], check=check, capture_output=True)
        git('config', 'user.name', 'Discard Test')
        git('config', 'user.email', 'discard@example.invalid')
        git('config', 'commit.gpgsign', 'false')
        def rpc(method, fail=False, **parameters):
            result = subprocess.run([str(BINARY), '-C', str(repo), 'repo', '-'], input=json.dumps({'method': method, **parameters}), capture_output=True, text=True)
            if fail:
                assert result.returncode != 0, (method, result.stdout, result.stderr)
                return result
            assert result.returncode == 0, (method, result.stdout, result.stderr)
            return json.loads(result.stdout)
        def preview(path='file.txt', scope='all_changes', selection=None):
            return rpc('discard_preview', path=path, scope=scope, selection=selection)
        def discard(plan, path='file.txt', scope='all_changes', selection=None, fail=False):
            return rpc('discard', path=path, scope=scope, selection=selection, basis=plan['basis'], fail=fail)
        def undo(id, fail=False): return rpc('undo_discard', undo_id=id, fail=fail)
        def history(): return rpc('list_discards')
        def commit(): git('add', '--all'); git('commit', '-qm', 'checkpoint')
        def indexed(path='file.txt'): return git('show', ':' + path).stdout
        def lines(view): return [line['id'] for hunk in view['hunks'] for line in hunk['lines'] if line['kind'] in ['added', 'deleted']]
        file = repo / 'file.txt'
        baseline = b''.join(f'line {number}\n'.encode() for number in range(70))
        file.write_bytes(baseline); commit()
        staged = baseline.replace(b'line 2\n', b'STAGED TWO\n')
        file.write_bytes(staged); git('add', '--', 'file.txt')
        working = staged.replace(b'line 50\n', b'WORKING FIFTY\n')
        file.write_bytes(working)
        original_index = (repo / '.git/index').read_bytes()
        plan = preview(scope='working_tree')
        assert not plan['index_changes']
        id = discard(plan, scope='working_tree')['undo_id']
        private = repo / '.git/desktop-undo' / id
        assert private.stat().st_mode & 0o777 == 0o700
        assert (private / '0.before').stat().st_mode & 0o777 == 0o600
        assert file.read_bytes() == staged and indexed() == staged
        assert (repo / '.git/index').read_bytes() == original_index
        undo(id)
        assert file.read_bytes() == working and indexed() == staged
        plan = preview()
        assert plan['index_changes'] and plan['backup_bytes'] == len(working) + len(staged)
        id = discard(plan)['undo_id']
        assert file.read_bytes() == baseline and indexed() == baseline
        (repo / 'unrelated').write_text('keep staged\n'); git('add', '--', 'unrelated')
        unrelated = git('ls-files', '--stage', '--', 'unrelated').stdout
        undo(id)
        assert file.read_bytes() == working and indexed() == staged
        assert git('ls-files', '--stage', '--', 'unrelated').stdout == unrelated
        undo(id, fail=True)
        # Partial discard keeps staged changes and unselected content, including raw bytes.
        file.write_bytes(staged.replace(b'line 15\n', b'working fifteen\n').replace(b'line 55\n', b'working fifty five'))
        before = file.read_bytes()
        view = rpc('diff_detail', path='file.txt')
        first = [line['id'] for line in view['hunks'][0]['lines'] if line['kind'] in ['added', 'deleted']]
        selection = {'basis': view['basis'], 'lines': first}
        plan = preview(scope='working_tree', selection=selection)
        id = discard(plan, scope='working_tree', selection=selection)['undo_id']
        assert indexed() == staged and file.read_bytes() == before.replace(b'working fifteen\n', b'line 15\n')
        undo(id); assert file.read_bytes() == before
        # A reviewed token expires on content, index, HEAD, mode, or filter changes.
        plan = preview(); file.write_bytes(before + b'external\n')
        discard(plan, fail=True); assert file.read_bytes().endswith(b'external\n')
        file.write_bytes(before); plan = preview(); git('add', '--', 'file.txt')
        discard(plan, fail=True); assert file.read_bytes() == before
        git('reset', '--hard', '-q', 'HEAD'); git('clean', '-fdq')
        # Byte paths, pathspec-looking names, untracked empty files and deleted parents.
        for name, contents in [(b':(glob)*.txt', b'literal\n'), (b'-option', b''), (b'line\nbreak', b'new\n'), (b'raw-\xff', b'bytes\n')]:
            native = os.fsencode(repo) + b'/' + name
            with open(native, 'wb') as handle: handle.write(contents)
            path = {'bytes': list(name)}
            id = discard(preview(path), path)['undo_id']
            assert not os.path.lexists(native)
            undo(id)
            with open(native, 'rb') as handle: assert handle.read() == contents
        git('clean', '-fdq')
        directory = repo / 'nested'
        directory.mkdir(); (directory / 'deleted').write_bytes(b'restore parent\n'); commit()
        (directory / 'deleted').unlink(); directory.rmdir()
        id = discard(preview('nested/deleted'), 'nested/deleted')['undo_id']
        assert (directory / 'deleted').read_bytes() == b'restore parent\n'
        undo(id); assert not (directory / 'deleted').exists()
        git('reset', '--hard', '-q')
        # A staged rename covers both paths and recovers a partially published journal.
        git('mv', '--', 'file.txt', 'renamed.txt')
        renamed = repo / 'renamed.txt'; renamed.write_bytes(b'edited destination\n')
        before_rename = git('ls-files', '--stage').stdout
        plan = preview('renamed.txt'); assert len(plan['files']) == 2
        id = discard(plan, 'renamed.txt')['undo_id']
        assert file.read_bytes() == baseline and not renamed.exists()
        journal = repo / '.git/desktop-undo' / id
        manifest = json.loads((journal / 'manifest.json').read_text())
        manifest['state'] = 'prepared'
        (journal / 'manifest.json').write_text(json.dumps(manifest))
        renamed.write_bytes((journal / '0.before').read_bytes())
        rpc('forget_discard', undo_id=id, fail=True); assert journal.exists()
        undo(id)
        assert not file.exists() and renamed.read_bytes() == b'edited destination\n'
        assert git('ls-files', '--stage').stdout == before_rename
        git('reset', '--hard', '-q'); git('clean', '-fdq')
        # Undo will not overwrite edits or corrupted backup data; data stays recoverable.
        file.write_bytes(b'valuable\n'); id = discard(preview())['undo_id']
        file.write_bytes(b'new external edit\n'); undo(id, fail=True)
        assert file.read_bytes() == b'new external edit\n'
        file.write_bytes(baseline)
        backup = repo / '.git/desktop-undo' / id / '0.before'
        backup.write_bytes(b'tampered')
        undo(id, fail=True); assert file.read_bytes() == baseline
        backup.write_bytes(b'valuable\n'); undo(id); assert file.read_bytes() == b'valuable\n'
        git('reset', '--hard', '-q')
        # Stream a binary well past preview/stdout limits, preserving executable permissions.
        large = repo / 'large.bin'; old = b'a\x00b\xff' * (3 * 1024 * 1024)
        large.write_bytes(old); large.chmod(0o750); commit()
        new = b'edited\x00' * (2 * 1024 * 1024); large.write_bytes(new)
        id = discard(preview('large.bin'), 'large.bin')['undo_id']
        assert large.read_bytes() == old and large.stat().st_mode & 0o777 == 0o750
        undo(id); assert large.read_bytes() == new and large.stat().st_mode & 0o777 == 0o750
        git('reset', '--hard', '-q')
        # Symlinks are replaced as links, never by writing to their outside targets.
        outside = root / 'outside'; outside.write_bytes(b'outside remains\n')
        other = root / 'other'; other.write_bytes(b'other remains\n')
        link = repo / 'link'; link.symlink_to(outside); commit()
        link.unlink(); link.symlink_to(other)
        id = discard(preview('link'), 'link')['undo_id']
        assert os.readlink(link) == str(outside)
        undo(id); assert os.readlink(link) == str(other)
        assert outside.read_bytes() == b'outside remains\n' and other.read_bytes() == b'other remains\n'
        # Built-in conversions and required custom filters are applied only to temporary data.
        git('reset', '--hard', '-q')
        (repo / '.gitattributes').write_text('file.txt text eol=crlf\n'); commit()
        file.write_bytes(b'new\r\ncontent\r\n')
        id = discard(preview())['undo_id']
        assert b'\r\n' in file.read_bytes() and b'\n' not in file.read_bytes().replace(b'\r\n', b'')
        undo(id); assert file.read_bytes() == b'new\r\ncontent\r\n'
        git('reset', '--hard', '-q')
        filter_script = root / 'filter.py'
        filter_script.write_text("import sys\ndata=sys.stdin.buffer.read()\nsys.stdout.buffer.write(data.removeprefix(b'W:') if sys.argv[1]=='clean' else b'W:'+data)\n")
        command = shlex.quote(sys.executable) + ' ' + shlex.quote(str(filter_script))
        git('config', 'filter.wrap.clean', command + ' clean'); git('config', 'filter.wrap.smudge', command + ' smudge'); git('config', 'filter.wrap.required', 'true')
        (repo / '.gitattributes').write_text('file.txt filter=wrap\n'); file.write_bytes(b'W:stored\n'); commit()
        file.write_bytes(b'W:changed\n'); id = discard(preview())['undo_id']
        assert file.read_bytes() == b'W:stored\n'
        undo(id); assert file.read_bytes() == b'W:changed\n'
        git('config', 'filter.wrap.smudge', 'false')
        old_index = (repo / '.git/index').read_bytes()
        preview_failure = rpc('discard_preview', path='file.txt', fail=True)
        assert file.read_bytes() == b'W:changed\n' and (repo / '.git/index').read_bytes() == old_index
        git('config', 'filter.wrap.smudge', command + ' smudge')
        # Owned locks survive rejection; sparse/intent flags round-trip through exact index undo.
        plan = preview(); lock = repo / '.git/index.lock'; lock.write_bytes(b'foreign')
        discard(plan, fail=True); assert lock.read_bytes() == b'foreign'; lock.unlink()
        lock = repo / '.git/HEAD.lock'; lock.write_bytes(b'foreign')
        discard(plan, fail=True); assert lock.read_bytes() == b'foreign'; lock.unlink()
        assert not (repo / '.git/index.lock').exists()
        new_file = repo / 'intent'; new_file.write_bytes(b'intent to add\n'); git('add', '-N', '--', 'intent')
        before_debug = git('ls-files', '--debug', '--', 'intent').stdout
        plan = preview('intent'); assert plan['undo_requires_unchanged_index']
        id = discard(plan, 'intent')['undo_id']; assert not new_file.exists()
        undo(id)
        assert new_file.read_bytes() == b'intent to add\n' and git('ls-files', '--debug', '--', 'intent').stdout == before_debug
        git('reset', '--', 'intent'); new_file.unlink()
        rpc('forget_discard', undo_id=id)
        assert not (repo / '.git/desktop-undo' / id).exists()
        assert all(item['id'] != id for item in history())
        # Malformed manifests remain visible and cannot be used to target metadata.
        bad = repo / '.git/desktop-undo' / '00000000-0000-4000-8000-000000000000'; bad.mkdir()
        (bad / 'manifest.json').write_text('{broken')
        assert any(item['id'] == bad.name and item['state'] == 'invalid' for item in history())
        undo(bad.name, fail=True)
        for path in ['.git/config', '../outside', str(outside), '']:
            rpc('discard_preview', path=path, fail=True)
        assert not list(repo.rglob('.desktop-change-*'))
        assert not list((repo / '.git').glob('*.lock'))
        assert not list((repo / '.git/desktop-undo').glob('.preparing-*'))
    print('PASS: certified whole/partial discard, staged content, rename recovery, byte paths, undo guards, streamed binaries/filters, symlinks, flags, and owned locks')


if __name__ == '__main__':
    main()
