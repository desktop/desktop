"""Exercise direct typed Git CLI workflows against an isolated local repository."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

BINARY = Path(__file__).resolve().parents[1] / 'target/debug/desktop-rs'


def main():
    with tempfile.TemporaryDirectory(prefix='desktop-direct-git-cli-') as temporary:
        root = Path(temporary)
        repo = root / 'repository with spaces'
        env = os.environ.copy()
        for name in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_SYSTEM']:
            env.pop(name, None)
        env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=str(root / 'global'),
                   GIT_TERMINAL_PROMPT='0', GIT_EDITOR='true')
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(repo)], env=env, check=True)

        def git(*args, check=True):
            result = subprocess.run(['git', '-C', str(repo), *args], env=env, capture_output=True, text=True)
            if check:
                assert result.returncode == 0, (args, result.stdout, result.stderr)
            return result.stdout.strip()

        def cli(*args, fail=False):
            result = subprocess.run([str(BINARY), '-C', str(repo), '--config', str(root / 'registry.json'), *args],
                                    env=env, capture_output=True, text=True, timeout=30)
            if fail:
                assert result.returncode != 0, (args, result.stdout, result.stderr)
                return result
            assert result.returncode == 0, (args, result.stdout, result.stderr)
            value = json.loads(result.stdout)
            assert value.get('code', 0) == 0, (args, value)
            return value

        def commit(name, content):
            (repo / name).write_text(content)
            git('add', '--', name)
            git('commit', '-qm', name)
            return git('rev-parse', 'HEAD')

        git('config', 'user.name', 'CLI fixture')
        git('config', 'user.email', 'cli@example.invalid')
        git('config', 'commit.gpgsign', 'false')
        commit('base.txt', 'base\n')
        git('switch', '-qc', 'merge-source')
        commit('merged.txt', 'merge content\n')
        git('switch', '-q', 'main')
        cli('merge', 'merge-source')
        assert (repo / 'merged.txt').read_text() == 'merge content\n'

        git('switch', '-qc', 'pick-source')
        picked = commit('picked.txt', 'picked content\n')
        git('switch', '-q', 'main')
        cli('cherry-pick', picked)
        assert (repo / 'picked.txt').read_text() == 'picked content\n'
        cli('revert', 'HEAD')
        assert not (repo / 'picked.txt').exists()

        git('switch', '-qc', 'merge-parent-source')
        commit('merge-parent.txt', 'merge parent\n')
        git('switch', '-q', 'main')
        git('merge', '--no-ff', '-qm', 'merge parent fixture', 'merge-parent-source')
        merge_oid = git('rev-parse', 'HEAD')
        git('switch', '-qc', 'pick-merge', merge_oid + '^1')
        cli('cherry-pick', merge_oid, '--mainline', '1')
        assert (repo / 'merge-parent.txt').exists()
        git('switch', '-q', 'main')
        cli('revert', merge_oid, '--mainline', '1')
        assert not (repo / 'merge-parent.txt').exists()
        before = git('rev-parse', 'HEAD')
        cli('revert', merge_oid, '--mainline', '0', fail=True)
        assert git('rev-parse', 'HEAD') == before

        git('switch', '-qc', 'rebase-topic')
        commit('topic.txt', 'topic\n')
        git('switch', '-q', 'main')
        commit('new-main.txt', 'new main\n')
        git('switch', '-q', 'rebase-topic')
        cli('rebase', 'main')
        assert (repo / 'topic.txt').exists() and (repo / 'new-main.txt').exists()

        git('switch', '-q', 'main')
        commit('conflict.txt', 'base\n')
        git('switch', '-qc', 'conflict-side')
        side = commit('conflict.txt', 'side\n')
        git('switch', '-q', 'main')
        commit('conflict.txt', 'main\n')
        cli('merge', 'conflict-side', fail=True)
        assert git('diff', '--name-only', '--diff-filter=U') == 'conflict.txt'
        cli('recover', 'merge', 'abort')
        assert (repo / 'conflict.txt').read_text() == 'main\n'
        cli('rebase', 'conflict-side', fail=True)
        assert git('diff', '--name-only', '--diff-filter=U') == 'conflict.txt'
        cli('recover', 'rebase', 'abort')
        assert (repo / 'conflict.txt').read_text() == 'main\n'
        cli('cherry-pick', side, fail=True)
        assert git('diff', '--name-only', '--diff-filter=U') == 'conflict.txt'
        cli('recover', 'cherry_pick', 'abort')
        assert (repo / 'conflict.txt').read_text() == 'main\n'
        assert git('status', '--porcelain') == ''
    print('PASS: direct merge/rebase/cherry-pick/revert, merge mainline, conflicts and recovery')


if __name__ == '__main__':
    main()
