import json
from datetime import timedelta

E2E_INPUTS = "/etc/nu-lint-e2e"
ALICE_HOME = "/home/alice"
CODIUM_LOG = f"{ALICE_HOME}/codium-e2e.log"
SUITE_REPORT = f"{ALICE_HOME}/suite-report.json"
EXPECTED_MINIMUM_PASSED_TESTS = 7


def run_as_alice(shell_command: str) -> str:
    return f"su - alice -c '{shell_command}'"


editor.wait_for_x()
editor.wait_for_file(f"{ALICE_HOME}/.Xauthority")

with subtest("prepare a writable workspace and extensions directory"):
    editor.succeed(
        run_as_alice(
            "mkdir -p ~/.config ~/extensions ~/workspace"
            f" && cp -rL {E2E_INPUTS}/nushell-extensions/. ~/extensions/"
            f" && cp -rL {E2E_INPUTS}/workspace/. ~/workspace/"
            " && chmod -R u+w ~/extensions ~/workspace"
        )
    )

with subtest("extension suites pass against the real nu-lint language server"):
    codium_arguments = " ".join(
        [
            "--disable-gpu",
            "--no-sandbox",
            "--password-store=basic",
            "--disable-workspace-trust",
            "--skip-welcome",
            "--skip-release-notes",
            "--disable-updates",
            f"--user-data-dir={ALICE_HOME}/codium-data",
            f"--extensions-dir={ALICE_HOME}/extensions",
            f"--extensionDevelopmentPath={E2E_INPUTS}/extension",
            f"--extensionTestsPath={E2E_INPUTS}/extension-suites/run_extension_suites.js",
            f"{ALICE_HOME}/workspace",
        ]
    )
    exit_code, _ = editor.execute(
        run_as_alice(
            f"DISPLAY=:0 NU_LINT_E2E_REPORT={SUITE_REPORT}"
            f" {E2E_INPUTS}/codium-electron {codium_arguments} > {CODIUM_LOG} 2>&1"
        ),
        timeout=timedelta(minutes=15),
    )
    editor.screenshot("after_extension_suites")
    print(editor.succeed(f"cat {CODIUM_LOG}"))
    t.assertEqual(exit_code, 0, "codium exited with a failure, see the log above")
    suite_report = json.loads(editor.succeed(f"cat {SUITE_REPORT}"))
    t.assertEqual(suite_report["failedTestCount"], 0)
    t.assertGreaterEqual(suite_report["passedTestCount"], EXPECTED_MINIMUM_PASSED_TESTS)
