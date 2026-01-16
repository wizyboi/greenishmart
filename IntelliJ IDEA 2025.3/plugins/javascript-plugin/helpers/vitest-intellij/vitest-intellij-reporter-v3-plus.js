const path = require('path');
const Tree = require('../base-test-reporter/intellij-tree.js');
const utils = require('../base-test-reporter/intellij-util.js');
const { VitestIntellijFilePathResolver } = require('./vitest-intellij-file-path-resolver.js')
const { VitestIntellijReporterConnector } = require('./vitest-intellij-reporter-connector.js');

const writer = utils.createWriter();
const tree = new Tree(null, writer.write.bind(writer));
const reporterConnector = new VitestIntellijReporterConnector(tree);


// No flush writer here because top-level await is not allowed in all supported JS versions
reporterConnector.startNotify();

/**
 * See https://github.com/vitest-dev/vitest/blob/3be0986aa5968b66ba1d5f4d937864aebda5e524/packages/vitest/src/node/reporters/reported-tasks.ts#L427
 * @typedef {Object} VitestReporterTestModule
 * @property {VitestReporterFileTask} task
 */

/**
 * See https://main.vitest.dev/advanced/api/reporters
 * and https://github.com/vitest-dev/vitest/blob/main/packages/vitest/src/node/types/reporter.ts#L11
 */
class VitestIntellijReporterV3Plus {
  onInit = utils.safeAsyncFn(async (vitestCtx) => {
    if (reporterConnector.configureCoverage(vitestCtx)) {
      await writer.flush();
    }
  });

  onTestModuleQueued = utils.safeAsyncFn(async (testModule) => {
    reporterConnector.startTestingIfNeeded();

    const fileNode = reporterConnector.getOrCreateFileNode(testModule.task);

    await writer.flush();
  })

  onTestModuleCollected = utils.safeAsyncFn(async (testModule) => {
    const fileTask = testModule.task;
    const fileNode = reporterConnector.getOrCreateFileNode(fileTask);

    /**
     * Building all tree nodes on this stage for:
     * - Having nodes when receive `onUserConsoleLog` to bind logs to nodes
     * - Displaying three as early as possible
     */
    reporterConnector.buildAndProcessFileTests(fileTask);

    // In case of syntax error in file, this is the reporter method that will have information with the error.
    // For this reason we've processed a file's error here.
    const isFileError = reporterConnector.addErrorNodeInFileIfNeeded(fileNode, fileTask);
    if (isFileError) {
      fileNode.finish(false);
    }

    await writer.flush();
  })

  onTestModuleEnd = utils.safeAsyncFn(async (testModule) => {
    const fileNode = reporterConnector.getOrCreateFileNode(testModule.task);
    fileNode.finish(false);
    await writer.flush();
  })

  onTestSuiteResult = utils.safeAsyncFn(async (testSuite) => {
    const suiteNode = reporterConnector.getSuiteNodeByTaskId(testSuite.id);
    reporterConnector.processSuiteFailedHooks(testSuite.task, suiteNode);
    if (suiteNode) {
      suiteNode.finish(false);
    }
    await writer.flush();
  })

  onTestCaseResult = utils.safeAsyncFn(async (testCase) => {
    const testNode = reporterConnector.getTestNodeByTaskId(testCase.id)
    if (testNode) {
      reporterConnector.finishTestNode(testCase.task, testNode);
    }
    await writer.flush();
  })

  onTestRunEnd = utils.safeAsyncFn(async (testModule, unhandledErrors) => {
    reporterConnector.processUnhandledErrors(unhandledErrors);
    reporterConnector.finishTesting()
    await writer.flush();
  })

  onUserConsoleLog = utils.safeAsyncFn(async (log) => {
    reporterConnector.addUserConsoleLog(log);
    await writer.flush();
  })
}

// export as default for direct usage in by Vitest
module.exports = VitestIntellijReporterV3Plus
