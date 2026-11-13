import { writeFileSync } from 'node:fs';
import Mocha from 'mocha';
import { registerLanguageServerSuite } from './language_server/language_server_suite.ts';

interface SuiteRunReport {
    readonly passedTestCount: number;
    readonly failedTestCount: number;
}

function writeSuiteRunReport(suiteRunReport: SuiteRunReport): void {
    const reportPath = process.env.NU_LINT_E2E_REPORT;
    if (reportPath !== undefined) {
        writeFileSync(reportPath, JSON.stringify(suiteRunReport));
    }
}

export function run(): Promise<void> {
    const mochaRunner = new Mocha({ ui: 'tdd', timeout: 60_000, color: false });
    mochaRunner.suite.emit('pre-require', globalThis, 'run_extension_suites.ts', mochaRunner);
    registerLanguageServerSuite();
    return new Promise((resolveRun, rejectRun) => {
        const testRunner = mochaRunner.run((failedTestCount) => {
            writeSuiteRunReport({ passedTestCount: testRunner.stats?.passes ?? 0, failedTestCount });
            if (failedTestCount === 0) {
                resolveRun();
            } else {
                rejectRun(new Error(`${String(failedTestCount)} end-to-end test(s) failed`));
            }
        });
    });
}
