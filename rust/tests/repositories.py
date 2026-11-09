"""Offline coverage of initialization, clone, selection, and atomic registry updates."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-registry-') as temporary:
        root = Path(temporary)
        config = root / 'config/repositories.json'
        def cli(*args, fail=False):
            result = subprocess.run([str(BINARY), '--config', str(config), *map(str, args)], capture_output=True, text=True)
            if fail:
                assert result.returncode != 0, result
                return result
            assert result.returncode == 0, (args, result.stderr, result.stdout)
            return json.loads(result.stdout)
        empty = cli('repositories', 'list')
        assert empty == {'version': 1, 'selected': None, 'repositories': []}
        assert not config.exists(), 'read must not create config files'
        source = root / 'source'
        initialized = cli('init', source)
        assert initialized['selected'] == str(source)
        assert source.joinpath('.git').is_dir()
        subprocess.run(['git', '-C', str(source), 'config', 'user.name', 'Registry Test'], check=True)
        subprocess.run(['git', '-C', str(source), 'config', 'user.email', 'registry@example.invalid'], check=True)
        source.joinpath('file').write_text('data')
        subprocess.run(['git', '-C', str(source), 'add', '--', 'file'], check=True)
        subprocess.run(['git', '-C', str(source), '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Initial'], check=True)
        clone = root / 'cloned'
        saved = cli('clone', source, clone)
        assert saved['selected'] == str(clone)
        assert clone.joinpath('file').read_text() == 'data'
        assert cli('--selected', 'snapshot')['root'] == str(clone)
        cli('repositories', 'select', source)
        assert cli('--selected', 'snapshot')['root'] == str(source)
        cli('repositories', 'add', source)
        assert len(cli('repositories', 'list')['repositories']) == 2
        cli('init', source, fail=True)
        cli('clone', source, clone, fail=True)
        cli('clone', 'ext::bad', root / 'bad', fail=True)
        assert not (root / 'bad').exists()
        # All writers must retain each other's saved entries.
        added = [root / f'repo-{i}' for i in range(6)]
        for path in added:
            subprocess.run(['git', 'init', '-q', str(path)], check=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(lambda path: cli('repositories', 'add', path), added))
        listed = cli('repositories', 'list')
        assert len(listed['repositories']) == 8 and listed['selected'] == str(source)
        cli('repositories', 'forget', source)
        assert source.joinpath('file').read_text() == 'data'
        assert cli('repositories', 'list')['selected'] is None
        cli('--selected', 'snapshot', fail=True)
        # Registry corruption is reported without overwriting the original data.
        config.write_text('{broken')
        result = cli('repositories', 'add', source, fail=True)
        assert 'not overwritten' in result.stderr
        assert config.read_text() == '{broken'
        assert not list(config.parent.glob('*.tmp'))
    print('PASS: init/clone, saved selection, concurrent atomic updates, non-destructive forget, corrupt registry preservation')


if __name__ == '__main__':
    main()
