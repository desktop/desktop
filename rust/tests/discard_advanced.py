"""Discard recovery across index flags, encoding, conflicts, hashes, worktrees and signals."""
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import tempfile
import time

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


class Fixture:
    def __init__(self, path, *options):
        self.path = path
        subprocess.run(['git', 'init', '-q', '-b', 'main', *options, str(path)], check=True)
        self.git('config', 'user.name', 'Discard Edge Test'); self.git('config', 'user.email', 'edges@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
    def git(self, *args, check=True):
        return subprocess.run(['git', '-C', str(self.path), *args], capture_output=True, check=check)
    def rpc(self, method, fail=False, **params):
        result = subprocess.run([str(BINARY), '-C', str(self.path), 'repo', '-'], input=json.dumps({'method': method, **params}), capture_output=True, text=True)
        if fail:
            assert result.returncode, (method, result.stdout)
            return result
        assert result.returncode == 0, (method, result.stderr)
        return json.loads(result.stdout)
    def discard(self, path, scope='all_changes', selection=None):
        plan = self.rpc('discard_preview', path=path, scope=scope, selection=selection)
        value = self.rpc('discard', path=path, scope=scope, selection=selection, basis=plan['basis'])
        return value['undo_id']
    def commit(self): self.git('add', '--all'); self.git('commit', '-qm', 'checkpoint')
    def undo(self, id, fail=False): return self.rpc('undo_discard', undo_id=id, fail=fail)


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-discard-edge-') as temporary:
        root = Path(temporary)
        f = Fixture(root / 'unborn')
        new = f.path / 'new'; new.write_bytes(b'new staged\n'); f.git('add', '--', 'new')
        id = f.discard('new'); assert not new.exists() and not f.git('ls-files').stdout
        f.undo(id); assert new.read_bytes() == b'new staged\n' and f.git('show', ':new').stdout == b'new staged\n'
        f.git('reset', '--', 'new'); new.unlink()
        empty = f.path / 'empty'; empty.touch(); id = f.discard('empty'); f.undo(id); assert empty.exists() and not empty.read_bytes()
        new.write_bytes(b'one\ntwo\n'); f.git('add', '-N', '--', 'new')
        view = f.rpc('diff_detail', path='new')
        assert view['before']['mode'] is None
        ids = [line['id'] for h in view['hunks'] for line in h['lines'] if line['kind'] in ['added','deleted']]
        id = f.discard('new', 'working_tree', {'basis':view['basis'],'lines':ids})
        assert not new.exists(); f.undo(id); assert new.read_bytes() == b'one\ntwo\n'
        # A genuine merge conflict restores HEAD on discard and all stages/markers on undo.
        f = Fixture(root / 'conflict'); file = f.path / 'file'; file.write_bytes(b'base\n'); f.commit()
        f.git('switch', '-qc', 'side'); file.write_bytes(b'side\n'); f.commit()
        f.git('switch', '-q', 'main'); file.write_bytes(b'main\n'); f.commit()
        assert f.git('merge', 'side', check=False).returncode
        stages = f.git('ls-files', '--stage').stdout; markers = file.read_bytes()
        f.rpc('discard_preview', path='file', scope='working_tree', fail=True)
        id = f.discard('file'); assert file.read_bytes() == b'main\n' and not f.git('ls-files', '-u').stdout
        f.undo(id); assert file.read_bytes() == markers and f.git('ls-files', '--stage').stdout == stages
        id = f.discard('file')
        f.git('merge', '--abort')
        original_file = file.read_bytes(); f.undo(id, fail=True)
        assert file.read_bytes() == original_file and not f.git('ls-files', '-u').stdout
        file.write_bytes(b'external changed\n')
        plan = f.rpc('discard_preview', path='file')
        new_head = f.git('commit-tree', 'HEAD^{tree}', '-m', 'other HEAD').stdout.strip()
        old_head = f.git('rev-parse', 'HEAD').stdout.strip()
        f.git('update-ref', 'HEAD', new_head)
        f.rpc('discard', path='file', basis=plan['basis'], fail=True)
        assert file.read_bytes() == b'external changed\n'
        f.git('update-ref', 'HEAD', old_head)
        plan = f.rpc('discard_preview', path='file')
        file.chmod(0o640)
        f.rpc('discard', path='file', basis=plan['basis'], fail=True)
        assert file.stat().st_mode & 0o777 == 0o640
        f.git('reset', '--hard', '-q')
        # Sparse and assume-unchanged flags are restored, with conservative index fencing.
        for flag in ['skip-worktree', 'assume-unchanged']:
            file.write_bytes(b'staged flagged\n'); f.git('add', '--', 'file'); f.git('update-index', '--' + flag, '--', 'file')
            before = (f.path / '.git/index').read_bytes(); id = f.discard('file')
            unrelated = f.path / 'unrelated'; unrelated.write_bytes(b'new\n'); f.git('add', '--', 'unrelated')
            f.undo(id, fail=True); assert file.read_bytes() == b'main\n'
            journal = f.path / '.git/desktop-undo' / id
            (f.path / '.git/index').write_bytes((journal / 'index.after').read_bytes())
            f.undo(id); assert file.read_bytes() == b'staged flagged\n' and (f.path / '.git/index').read_bytes() == before
            f.git('update-index', '--no-' + flag, '--', 'file'); f.git('reset', '--hard', '-q'); f.git('clean', '-fdq')
        # Canonical diff selection converts back through UTF-16/CRLF without touching the index.
        f = Fixture(root / 'encoding'); attributes = f.path / '.gitattributes'
        attributes.write_text('utf16.txt text working-tree-encoding=UTF-16LE eol=crlf\n')
        file = f.path / 'utf16.txt'; file.write_bytes('one\r\ntwo\r\nthree'.encode('utf-16le')); f.commit()
        modified = 'ONE\r\ntwo\r\nTHREE'.encode('utf-16le'); file.write_bytes(modified)
        view = f.rpc('diff_detail', path='utf16.txt')
        ids = [line['id'] for h in view['hunks'] for line in h['lines'] if line['kind'] in ['added', 'deleted']]
        selection = {'basis': view['basis'], 'lines': ids}
        original_index = (f.path / '.git/index').read_bytes()
        f.git('config', 'core.eol', 'lf')
        f.rpc('discard_preview', path='utf16.txt', scope='working_tree', selection=selection, fail=True)
        view = f.rpc('diff_detail', path='utf16.txt'); selection['basis'] = view['basis']
        id = f.discard('utf16.txt', 'working_tree', selection)
        assert file.read_bytes() == 'one\r\ntwo\r\nthree'.encode('utf-16le')
        assert (f.path / '.git/index').read_bytes() == original_index
        f.undo(id); assert file.read_bytes() == modified
        # SHA-256 objects, detached HEAD, and linked-worktree-local recovery journals.
        f = Fixture(root / 'sha256', '--object-format=sha256'); file = f.path / 'file'; file.write_bytes(b'base\n'); f.commit()
        f.git('config', 'core.splitIndex', 'true'); f.git('update-index', '--split-index')
        assert list((f.path / '.git').glob('sharedindex.*'))
        f.git('switch', '--detach', '-q'); file.write_bytes(b'detached\n'); id = f.discard('file'); f.undo(id)
        assert file.read_bytes() == b'detached\n'
        f.git('reset', '--hard', '-q'); f.git('switch', '-q', 'main')
        sibling = root / 'linked tree'; f.git('worktree', 'add', '-q', '-b', 'linked', str(sibling))
        original_main_index = (f.path / '.git/index').read_bytes()
        parent = f.path; f.path = sibling; (sibling / 'file').write_bytes(b'linked\n'); id = f.discard('file')
        gitdir = Path(f.git('rev-parse', '--absolute-git-dir').stdout.decode().strip())
        assert (gitdir / 'desktop-undo' / id / 'manifest.json').exists()
        f.undo(id); assert (sibling / 'file').read_bytes() == b'linked\n'
        assert (parent / '.git/index').read_bytes() == original_main_index
        # Parent symlinks introduced after discard cannot redirect undo outside the tree.
        f = Fixture(root / 'parents'); (f.path / 'dir').mkdir(); file = f.path / 'dir/file'; file.write_bytes(b'base\n'); f.commit()
        file.write_bytes(b'edited\n'); id = f.discard('dir/file')
        (f.path / 'dir').rename(f.path / 'saved-dir')
        outside = root / 'outside'; outside.mkdir(); (outside / 'file').write_bytes(b'outside\n')
        (f.path / 'dir').symlink_to(outside)
        f.undo(id, fail=True); assert (outside / 'file').read_bytes() == b'outside\n'
        (f.path / 'dir').unlink(); (f.path / 'saved-dir').rename(f.path / 'dir'); f.undo(id)
        assert file.read_bytes() == b'edited\n'
        # Required smudge code cannot change HEAD during a real discard; cancellation
        # while a smudge blocks leaves all user files/index and owned locks intact.
        f = Fixture(root / 'filter'); file = f.path / 'file'; file.write_bytes(b'base\n'); f.commit()
        alternate_head = f.git('commit-tree', 'HEAD^{tree}', '-m', 'alternate').stdout.decode().strip()
        head = f.git('rev-parse', 'HEAD').stdout
        started = root / 'filter-started'; block = root / 'filter-block'; attempted = root / 'filter-attempted'
        script = root / 'guard.py'
        script.write_text('import json,subprocess,sys,time\nfrom pathlib import Path\n' +
            f'repo=Path({str(f.path)!r})\nblock=Path({str(block)!r})\nstarted=Path({str(started)!r})\nattempted=Path({str(attempted)!r})\n' +
            f"if (repo/'.git/HEAD.lock').exists():\n result=subprocess.run(['git','-C',str(repo),'update-ref','HEAD',{alternate_head!r}],capture_output=True)\n attempted.write_text(str(result.returncode))\n" +
            "if block.exists():\n started.write_text('started')\n time.sleep(60)\nsys.stdout.buffer.write(sys.stdin.buffer.read())\n")
        f.git('config', 'filter.guard.clean', 'cat'); f.git('config', 'filter.guard.smudge', shlex.quote(sys.executable) + ' ' + shlex.quote(str(script)))
        f.git('config', 'filter.guard.required', 'true'); (f.path / '.gitattributes').write_text('file filter=guard\n'); f.commit()
        # Recompute an alternate ref after committing the attributes.
        head = f.git('rev-parse', 'HEAD').stdout
        file.write_bytes(b'edited\n'); id = f.discard('file')
        assert attempted.read_text() != '0' and f.git('rev-parse', 'HEAD').stdout == head
        f.undo(id); assert file.read_bytes() == b'edited\n'
        plan = f.rpc('discard_preview', path='file'); original_index = (f.path / '.git/index').read_bytes()
        block.touch()
        command = subprocess.Popen([str(BINARY), '-C', str(f.path), 'discard', 'file', '--basis', plan['basis']], stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while not started.exists() and time.monotonic() < deadline: time.sleep(.02)
            assert started.exists(), 'smudge did not start'
            command.send_signal(signal.SIGINT); command.wait(timeout=6)
            assert command.returncode == 130, command.stderr.read()
            assert file.read_bytes() == b'edited\n' and (f.path / '.git/index').read_bytes() == original_index
            assert not (f.path / '.git/index.lock').exists() and not (f.path / '.git/HEAD.lock').exists()
            assert not list((f.path / '.git/desktop-undo').glob('.preparing-*'))
        finally:
            if command.poll() is None: command.kill(); command.wait()
        # Reftable is explicitly refused before any mutation until its transactional
        # ref-fencing implementation is available.
        f = Fixture(root / 'reftable', '--ref-format=reftable'); file = f.path / 'file'; file.write_bytes(b'base'); f.commit(); file.write_bytes(b'changed')
        plan = f.rpc('discard_preview', path='file')
        f.rpc('discard', path='file', basis=plan['basis'], fail=True)
        assert file.read_bytes() == b'changed' and not (f.path / '.git/index.lock').exists()
    print('PASS: unborn/conflicted indexes, sparse/intent flags, UTF-16 CRLF selection, SHA-256/detached/linked trees, symlink parent fences, ref locks and cancellation')


if __name__ == '__main__': main()
