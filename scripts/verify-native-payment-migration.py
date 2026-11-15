"""Exercise real application startup against disposable database fixtures only."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import urllib.request


# The last deployed application, rather than a reconstructed subset of its schema.
BASELINE = "exlau/lftech-newapi@sha256:ce826b334aeba46c202bbff115c0a885e1b3d73fbb80b7091fce5538ec40dba7"
CANDIDATE = Path(os.environ["NATIVE_PAYMENT_CANDIDATE"]).resolve()
PREFIX = "native-payment-startup-"


def run(*args, input=None):
    return subprocess.run(args, input=input, text=True, capture_output=True, check=True).stdout.strip()


def sql(engine, root, database, statement):
    if engine == "sqlite":
        with sqlite3.connect(root / "main.db") as connection:
            cursor = connection.execute(statement)
            return cursor.fetchall() if cursor.description else []
    if engine == "mysql":
        output = run("docker", "exec", "-i", PREFIX + engine, "mysql", "-uroot",
                     "-pstartup-fixture-only", "--batch", "--skip-column-names", database, input=statement)
    else:
        output = run("docker", "exec", "-i", PREFIX + engine, "psql", "-U", "postgres",
                     "-d", database, "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", input=statement)
    return [tuple(row.split("\t")) for row in output.splitlines() if row]


def indexes(engine, root, database):
    if engine == "sqlite":
        return {str(row) for row in sql(engine, root, database,
                "SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name")}
    if engine == "mysql":
        return {str(row) for row in sql(engine, root, database,
                "SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME "
                "FROM information_schema.statistics WHERE TABLE_SCHEMA=DATABASE() "
                "ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX")}
    return {str(row) for row in sql(engine, root, database,
            "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY indexname")}


def startup(engine, root, old=False):
    name = PREFIX + "app"
    args = ["docker", "run", "-d", "--name", name, "--network", "host",
            "-v", str(root) + ":/fixture", "-e", "PORT=18190",
            "-e", "SESSION_SECRET=startup-fixture-session-only-32-bytes",
            "-e", "SQLITE_PATH=/fixture/main.db", "-e", "NODE_TYPE=master"]
    if engine == "mysql":
        for key, db in [("SQL_DSN", "main"), ("LOG_SQL_DSN", "logs")]:
            args += ["-e", key + "=root:startup-fixture-only@tcp(127.0.0.1:13306)/" + db + "?charset=utf8mb4&parseTime=True&loc=Local"]
    elif engine == "postgres":
        for key, db in [("SQL_DSN", "main"), ("LOG_SQL_DSN", "logs")]:
            args += ["-e", key + "=postgres://postgres:startup-fixture-only@127.0.0.1:15432/" + db + "?sslmode=disable"]
    else:
        # The application's SQLite log connection shares SQLITE_PATH.
        args += ["-e", "LOG_SQL_DSN=local"]
    if not old:
        args += ["-v", str(CANDIDATE) + ":/candidate:ro", "--entrypoint", "/candidate"]
    try:
        run(*args, BASELINE)
        for _ in range(180):
            try:
                with urllib.request.urlopen("http://127.0.0.1:18190/api/status", timeout=2) as response:
                    if json.load(response).get("success"):
                        return
            except (OSError, ValueError):
                pass
            state = run("docker", "inspect", "--format", "{{.State.Running}}", name)
            if state != "true":
                break
            time.sleep(1)
        raise RuntimeError("Application startup failed: " + run("docker", "logs", name)[-12000:])
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        if engine == "sqlite":
            # The released image writes as root; return only this disposable
            # fixture's files to the CI runner before seeding or inspecting it.
            run("docker", "run", "--rm", "-v", str(root) + ":/fixture",
                "--entrypoint", "chown", BASELINE, "-R", f"{os.getuid()}:{os.getgid()}", "/fixture")


def reset(engine, root):
    if engine == "sqlite":
        for name in ("main.db", "logs.db"):
            (root / name).unlink(missing_ok=True)
        return
    for database in ("main", "logs"):
        if engine == "mysql":
            run("docker", "exec", "-i", PREFIX + engine, "mysql", "-uroot", "-pstartup-fixture-only",
                input=f"DROP DATABASE IF EXISTS {database}; CREATE DATABASE {database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        else:
            run("docker", "exec", PREFIX + engine, "dropdb", "-U", "postgres", "--if-exists", database)
            run("docker", "exec", PREFIX + engine, "createdb", "-U", "postgres", database)


def verify(engine, root, upgraded):
    tables = ("native_payment_orders", "native_payment_refunds", "native_payment_bills")
    for table in tables:
        assert str(sql(engine, root, "main", "SELECT COUNT(*) FROM " + table)[0][0]) == "0"
    if upgraded:
        assert tuple(map(str, sql(engine, root, "main", "SELECT username,quota FROM users WHERE id=90001")[0])) == ("migration-fixture", "600001")
        assert tuple(map(str, sql(engine, root, "main", "SELECT title,currency FROM subscription_plans WHERE id=90001")[0])) == ("Existing plan", "USD")
        assert str(sql(engine, root, "main", "SELECT cny_price_cents FROM subscription_plans WHERE id=90001")[0][0]) in ("0", "None", "")
        assert str(sql(engine, root, "logs", "SELECT content FROM logs WHERE id=90001")[0][0]) == "existing-log"
        try:
            sql(engine, root, "main", "INSERT INTO users(id,username,password) VALUES(90002,'migration-fixture','fixture-login-disabled')")
        except (sqlite3.IntegrityError, subprocess.CalledProcessError):
            pass
        else:
            raise AssertionError("Existing username uniqueness was lost")


def main():
    assert CANDIDATE.is_file()
    containers = [PREFIX + engine for engine in ("mysql", "postgres")]
    try:
        run("docker", "pull", BASELINE)
        run("docker", "run", "-d", "--name", containers[0], "-p", "127.0.0.1:13306:3306",
            "-e", "MYSQL_ROOT_PASSWORD=startup-fixture-only", "mysql:5.7.44",
            "--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci")
        run("docker", "run", "-d", "--name", containers[1], "-p", "127.0.0.1:15432:5432",
            "-e", "POSTGRES_PASSWORD=startup-fixture-only", "postgres:17.6-alpine")
        for engine in ("mysql", "postgres"):
            for attempt in range(120):
                try:
                    reset(engine, Path("."))
                    break
                except subprocess.CalledProcessError:
                    if attempt == 119:
                        raise
                    time.sleep(1)
        with tempfile.TemporaryDirectory(prefix=PREFIX) as directory:
            root = Path(directory)
            root.chmod(0o777)
            for engine in ("sqlite", "mysql", "postgres"):
                for upgrade in (False, True):
                    reset(engine, root)
                    before = {}
                    if upgrade:
                        startup(engine, root, old=True)
                        sql(engine, root, "main", "INSERT INTO users(id,username,password,quota) VALUES(90001,'migration-fixture','fixture-login-disabled',600001)")
                        sql(engine, root, "main", "INSERT INTO subscription_plans(id,title,price_amount,currency) VALUES(90001,'Existing plan',12.5,'USD')")
                        sql(engine, root, "logs", "INSERT INTO logs(id,user_id,type,content) VALUES(90001,90001,1,'existing-log')")
                        before = {db: indexes(engine, root, db) for db in ("main", "logs")}
                    for iteration in range(2):
                        startup(engine, root)
                        verify(engine, root, upgrade)
                        for db, original in before.items():
                            assert original <= indexes(engine, root, db), (engine, db, "Existing index changed")
                        print(json.dumps({"engine": engine, "scenario": "upgrade" if upgrade else "fresh", "startup": iteration + 1, "result": "passed"}), flush=True)
    finally:
        for container in containers + [PREFIX + "app"]:
            subprocess.run(["docker", "rm", "-f", container], capture_output=True)


if __name__ == "__main__":
    main()
