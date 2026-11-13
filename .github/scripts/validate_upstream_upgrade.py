"""Exercise production migrations against disposable CI databases only."""

import os
from pathlib import Path
import subprocess
import tempfile


def run(*args, cwd=None, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def main():
    root = Path(__file__).resolve().parents[2]
    source = (root / '.github/scripts/upstream_upgrade_check.go').read_text()
    with tempfile.TemporaryDirectory(prefix='rc51-upgrade-') as directory:
        work = Path(directory)
        current_source = work / 'current.go'
        current_source.write_text(source.replace('// UPGRADE_HOOK', 'must(model.MigrateSensitiveWords())'))
        current = work / 'current'
        run('go', 'build', '-o', str(current), str(current_source), cwd=root)
        binaries = {}
        for name, revision in {
            'fork_main': 'f3fd5966a51bf4a1dace6c537e757d3307d41093',
            'upstream_rc50': 'f2aa91232ed3e5878a614762ace6736a2b74257f',
        }.items():
            checkout = work / name
            run('git', 'worktree', 'add', '--detach', str(checkout), revision, cwd=root)
            try:
                old_source = work / f'{name}.go'
                old_source.write_text(source)
                binaries[name] = work / f'{name}-fixture'
                run('go', 'build', '-o', str(binaries[name]), str(old_source), cwd=checkout)
            finally:
                run('git', 'worktree', 'remove', str(checkout), cwd=root)

        for engine in ('sqlite', 'mysql', 'postgres'):
            for baseline in ('fresh', *binaries):
                case = f'rc51_{engine}_{baseline}'
                environment = os.environ.copy()
                environment.update(RC51_STATE=str(work / f'{case}.json'), DEBUG='false')
                if engine == 'mysql':
                    for database in (case, case + '_logs'):
                        run('docker', 'exec', os.environ['MYSQL_CONTAINER'], 'mysql',
                            '-uroot', '-prc51-test-only', '-e',
                            f'CREATE DATABASE {database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
                    dsn = 'root:rc51-test-only@tcp(127.0.0.1:3306)/{}?charset=utf8mb4&parseTime=True&loc=Local'
                    environment.update(SQL_DSN=dsn.format(case), LOG_SQL_DSN=dsn.format(case + '_logs'))
                else:
                    # SQLite also exercises the independently configured PostgreSQL log DB.
                    for database in ((case, case + '_logs') if engine == 'postgres' else (case + '_logs',)):
                        run('docker', 'exec', os.environ['POSTGRES_CONTAINER'], 'createdb', '-U', 'postgres', database)
                    dsn = 'postgres://postgres:rc51-test-only@127.0.0.1:5432/{}?sslmode=disable'
                    environment.update(SQL_DSN=dsn.format(case) if engine == 'postgres' else 'local',
                                       LOG_SQL_DSN=dsn.format(case + '_logs'), SQLITE_PATH=str(work / f'{case}.db'))
                if baseline == 'fresh':
                    environment['RC51_PHASE'] = 'fresh'
                else:
                    environment['RC51_PHASE'] = 'seed'
                    run(str(binaries[baseline]), cwd=work, env=environment)
                    environment['RC51_PHASE'] = 'verify'
                for _ in range(2):
                    run(str(current), cwd=work, env=environment)


if __name__ == '__main__':
    main()
