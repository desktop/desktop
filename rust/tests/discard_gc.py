"""Undo must retain staged content and split-index bases across Git garbage collection."""
import subprocess
import tempfile
from pathlib import Path
from discard_advanced import Fixture


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-discard-gc-') as temporary:
        root = Path(temporary)
        f = Fixture(root / 'objects')
        file = f.path / 'file'; file.write_bytes(b'committed\n'); f.commit()
        file.write_bytes(b'staged only\n'); f.git('add', '--', 'file')
        staged_oid = f.git('rev-parse', ':file').stdout.strip()
        file.write_bytes(b'working only\n')
        id = f.discard('file')
        f.git('prune', '--expire', 'now')
        assert f.git('cat-file', '-e', staged_oid, check=False).returncode != 0
        f.undo(id)
        assert f.git('show', ':file').stdout == b'staged only\n'
        assert file.read_bytes() == b'working only\n'
        # Split-index files are auxiliary index data, not Git objects. Recovery
        # must retain them along with assume-unchanged/intent flags.
        f = Fixture(root / 'shared')
        file = f.path / 'file'; file.write_bytes(b'committed\n'); f.commit()
        f.git('config', 'core.splitIndex', 'true'); f.git('update-index', '--split-index')
        file.write_bytes(b'staged flagged\n'); f.git('add', '--', 'file')
        f.git('update-index', '--assume-unchanged', '--', 'file')
        before = (f.path / '.git/index').read_bytes()
        id = f.discard('file')
        shared = list((f.path / '.git').glob('sharedindex.*'))
        assert shared
        f.git('prune', '--expire', 'now')
        for path in shared: path.unlink()
        f.undo(id)
        assert (f.path / '.git/index').read_bytes() == before
        assert f.git('show', ':file').stdout == b'staged flagged\n'
        assert f.git('ls-files', '-v', '--', 'file').stdout.startswith(b'h ')
        assert file.read_bytes() == b'staged flagged\n'
    print('PASS: undo restores staged blobs and flagged split-index data after pruning')


if __name__ == '__main__': main()
