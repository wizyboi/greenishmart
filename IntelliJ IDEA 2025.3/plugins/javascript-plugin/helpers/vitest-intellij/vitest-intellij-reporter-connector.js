// noinspection NodeCoreCodingAssistance
const path = require('path');
const vitestIntellijUtil = require('./vitest-intellij-util.js');
const { VitestIntellijFilePathResolver } = require('./vitest-intellij-file-path-resolver.js')
const intellijTestUtil = require('../base-test-reporter/intellij-util.js')

/**
 * See https://github.com/vitest-dev/vitest/blob/6b21cfe5571df215e344803c025175f0264d994d/packages/runner/src/types/tasks.ts#L238
 * @typedef {Object} VitestReporterFileTask
 * @property {string} type
 * @property {string} filepath
 * @property {string?} projectName
 * @property {VitestReporterSuiteTask|VitestReporterTestTask[]} tasks
 */

/**
 * @typedef {Object} VitestReporterTaskResult
 * @property {string} state
 * @property {VitestReporterSerializedError} [error]
 * @property {VitestReporterSerializedError[]} [errors]
 * @property {{ beforeAll: string, afterAll: string }} [hooks]
 */

/**
 * See https://github.com/vitest-dev/vitest/blob/6b21cfe5571df215e344803c025175f0264d994d/packages/runner/src/types/tasks.ts#L226
 * @typedef {Object} VitestReporterSuiteTask
 * @property {'suite'} type
 * @property {string} id
 * @property {string} name
 * @property {string} mode
 * @property {VitestReporterSuiteTask|VitestReporterTestTask[]} tasks
 * @property {VitestReporterSuiteTask} [suite]
 * @property {VitestReporterTaskResult} result
 */

/**
 * See https://github.com/vitest-dev/vitest/blob/6b21cfe5571df215e344803c025175f0264d994d/packages/runner/src/types/tasks.ts#L272
 * @typedef {Object} VitestReporterTestTask
 * @property {'test'} type
 * @property {string} id
 * @property {string} name
 * @property {string} mode
 * @property {VitestReporterSuiteTask} [suite]
 */

/**
 * @typedef {VitestReporterSuiteTask|VitestReporterTestTask} VitestReporterSuiteOrTestTask
 */

/**
 * @see https://github.com/vitest-dev/vitest/blob/fe13be635cb938da5c7e884ed8e58bccac82fc97/packages/vitest/src/types/general.ts#L12
 * @typedef {Object} VitestUserConsoleLog
 * @property {string} type
 * @property {string} content
 * @property {string} [taskId]
 */

class VitestIntellijReporterConnector {
  /**
   * @private
   * @type {Object<string, TestSuiteNode>}
   * */
  _filePathToFileNodeMap = {};
  /**
   * @private
   * @type {Object<string, TestSuiteNode>}
   * */
  _suiteIdToSuiteNodeMap = {};
  /**
   * @private
   * @type {Object<string, TestNode>}
   * */
  _testIdToTestNodeMap = {};

  beforeTestingStart = true;
  filePathResolver = new VitestIntellijFilePathResolver()

  /**
   * @type {function|undefined}
   * @private
   */
  _onStarted;

  /**
   * @param {Tree} tree
   * @param {{[onStarted]: function}} [options]
   */
  constructor(tree, options) {
    this.tree = tree;
    if (options) {
      this._onStarted = options.onStarted;
    }
  }

  clear() {
    this._filePathToFileNodeMap = {};
    this._suiteIdToSuiteNodeMap = {};
    this._testIdToTestNodeMap = {};
    this.filePathResolver.clearCache()
  }

  startNotify() {
    this.tree.startNotify();
  }

  startTestingIfNeeded() {
    if (this.beforeTestingStart) {
      this.tree.testingStarted();
      this.beforeTestingStart = false;
      this.clear();
      if (this._onStarted) {
        this._onStarted();
      }
    }
  }

  finishTesting() {
    if (this.beforeTestingStart) {
      intellijTestUtil.warn('Cannot finish not started testing');
      return;
    }
    this.tree.testingFinished();
    this.beforeTestingStart = true;
  }

  /**
   * @param {Object} vitestCtx - Vitest global object. See https://github.com/vitest-dev/vitest/blob/8e15bc8f97b5032dae6bec0d329f5ca5706a404c/packages/vitest/src/node/core.ts#L58
   * @returns {boolean}
   */
  configureCoverage(vitestCtx) {
    if (process.env['_JETBRAINS_VITEST_RUN_WITH_COVERAGE']) {
      vitestIntellijUtil.configureCoverage(vitestCtx.config, this.tree);
      return true;
    }
    return false;
  }

  /**
   * @param {VitestReporterFileTask} fileTask
   * @returns {TestSuiteNode}
   */
  getOrCreateFileNode(fileTask) {
    const testFilePath = this.filePathResolver.resolve(fileTask.filepath)
    const projectName = fileTask.projectName;
    const isWorkspace = projectName != null;
    const fileNodeKey = isWorkspace ? projectName + '|' + testFilePath : testFilePath;
    let fileNode = this._filePathToFileNodeMap[fileNodeKey];
    if (fileNode == null) {
      const fileNodeName = createFileNodeName(testFilePath, projectName)
      const tree = this.tree;
      if (vitestIntellijUtil.isSingleTestFileScope()
        // Don't update the root node for workspaces, because they can rerun file more than once
        && !isWorkspace
      ) {
        tree.updateRootNode(
          fileNodeName,
          path.relative('', path.dirname(testFilePath)),
          'file://' + testFilePath
        );
        fileNode = tree.root;
      }
      else {
        fileNode = tree.root.addTestSuiteChild(
          fileNodeName,
          'file',
          testFilePath
        );
        fileNode.start();
      }
      this._filePathToFileNodeMap[fileNodeKey] = fileNode;
    }
    return fileNode;
  }

  /**
   * @param {TestSuiteNode} fileNode
   * @param {VitestReporterFileTask} fileTask
   * @returns {boolean} has a file error flag
   */
  addErrorNodeInFileIfNeeded(fileNode, fileTask) {
    const fileError = vitestIntellijUtil.getNormalizedErrorByTask(fileTask);
    if (fileError != null) {
      vitestIntellijUtil.addErrorTestChild(fileNode, fileError.name, fileError.message, fileError.stack);
      return true;
    }
    return false;
  }

  /**
   * @param {VitestReporterSuiteOrTestTask} task
   * @param {TestSuiteNode} fileNode
   * @returns {TestSuiteNode}
   * @private
   */
  _getParentSuiteNode(task, fileNode) {
    let parentSuiteId = task.suite ? task.suite.id : null;
    if (parentSuiteId) {
      const parentSuiteNode = this._suiteIdToSuiteNodeMap[parentSuiteId];
      if (parentSuiteNode) {
        return parentSuiteNode;
      }
    }
    return fileNode;
  }

  /**
   * @param {VitestReporterSuiteTask} suiteTask
   * @param {TestSuiteNode} fileNode
   * @param {String} filePath
   */
  getOrCreateSuiteNode(suiteTask, fileNode, filePath) {
    let suiteNode = this._suiteIdToSuiteNodeMap[suiteTask.id];
    if (suiteNode == null) {
      const parentNode = this._getParentSuiteNode(suiteTask, fileNode);
      const suiteName = suiteTask.name;
      const suiteLocationPath = intellijTestUtil.getTestLocationPath(parentNode, suiteName, fileNode, filePath);
      suiteNode = parentNode.addTestSuiteChild(suiteName, 'suite', suiteLocationPath);
      this._suiteIdToSuiteNodeMap[suiteTask.id] = suiteNode;
      suiteNode.start();
    }
    return suiteNode;
  }

  /**
   * @param {string} taskId
   * @returns {TestSuiteNode|undefined}
   */
  getSuiteNodeByTaskId(taskId) {
    return this._suiteIdToSuiteNodeMap[taskId];
  }

  /**
   * @param {VitestReporterTestTask} testTask
   * @param {TestSuiteNode} fileNode
   * @param {String} filePath
   */
  getOrCreateTestNode(testTask, fileNode, filePath) {
    let testNode = this._testIdToTestNodeMap[testTask.id];
    if (testNode == null) {
      const parentNode = this._getParentSuiteNode(testTask, fileNode);
      const testLocationPath = intellijTestUtil.getTestLocationPath(parentNode, testTask.name, fileNode, filePath)
      testNode = parentNode.addTestChild(testTask.name, 'test', testLocationPath)
      this._testIdToTestNodeMap[testTask.id] = testNode;
      testNode.start()
    }
    return testNode;
  }

  /**
   * @callback ProcessTestNodeCallback
   * @param {VitestReporterTestTask} testTask - The test task being processed
   * @param {TestNode} testNode - The test node being operated on
   * @param {string} filePath - The path to the test file
   */

  /**
   * @callback ProcessSuiteNodeCallback
   * @param {VitestReporterSuiteTask} suiteTask - The test task being processed
   * @param {TestSuiteNode} suiteNode - The test node being operated on
   */

  /**
   * @param {VitestReporterFileTask} fileTask
   * @param {ProcessTestNodeCallback} [testNodeCallback]
   * @param {ProcessSuiteNodeCallback} [suiteNodeDoneCallback]
   */
  buildAndProcessFileTests(fileTask, testNodeCallback, suiteNodeDoneCallback) {
    const filePath = this.filePathResolver.resolve(fileTask.filepath);
    const fileNode = this.getOrCreateFileNode(fileTask);
    for (const task of fileTask.tasks) {
      traverseSuitesAndProcessTasks(
        task,
        testTask => {
          if (this.shouldIgnoreSkippedTask(testTask)) {
            return; // ignore other tests when running a single suite/test
          }
          const testNode = this.getOrCreateTestNode( testTask, fileNode, filePath);
          if (testNodeCallback) {
            testNodeCallback(testTask, testNode, filePath);
          }
        },
        suiteTask => {
          if (this.shouldIgnoreSkippedTask(suiteTask)) {
            return; // ignore other tests when running a single suite/test
          }
          this.getOrCreateSuiteNode( suiteTask, fileNode, filePath);
        },
        suiteTask => {
          if (suiteNodeDoneCallback) {
            const suiteNode = this.getSuiteNodeByTaskId(suiteTask.id)
            if (suiteNode) {
              suiteNodeDoneCallback(suiteTask, suiteNode);
            }
          }
        })
    }
  }

  /**
   * @param {string} testTaskId
   * @returns {TestNode}
   */
  getTestNodeByTaskId(testTaskId) {
    return this._testIdToTestNodeMap[testTaskId];
  }

  /**
   * @param {VitestReporterTestTask} testTask
   * @param {TestNode} testNode
   */
  finishTestNode(testTask, testNode) {
    vitestIntellijUtil.finishTestNode(testTask, testNode);
  }

  /**
   * @param {VitestReporterSuiteOrTestTask} testTask
   * @returns {boolean}
   */
  shouldIgnoreSkippedTask(testTask){
    return testTask.mode === 'skip' && vitestIntellijUtil.isSuitesOrTestsScope()
  }

  /**
   * @param {VitestReporterSerializedError[]} unhandledErrors
   */
  processUnhandledErrors(unhandledErrors) {
    if (Array.isArray(unhandledErrors)) {
      for (const error of unhandledErrors) {
        const normalizedError = vitestIntellijUtil.normalizeError(error);
        vitestIntellijUtil.addErrorTestChild(
          this.tree.root,
          normalizedError.name,
          normalizedError.message,
          normalizedError.stack,
        );
      }
    }
  }

  /**
   * @param {VitestUserConsoleLog} log
   */
  addUserConsoleLog(log) {
    // TODO: Vitest sends log for suites and files too. Please support these logs too WEB-75431
    const testNode = this._testIdToTestNodeMap[log.taskId];
    if (testNode) {
      vitestIntellijUtil.sendConsoleLog(testNode, log);
    }
  }

  /**
   * @param {VitestReporterSuiteTask} suiteTask
   * @param {TestSuiteNode} suiteNode
   */
  processSuiteFailedHooks(suiteTask, suiteNode) {
    const taskResult = suiteTask.result;
    if (isThisSuiteHasErrors(suiteTask)) {
      const resultHooks = taskResult.hooks;
      if (resultHooks) {
        /**
         * Hooks:
         * - beforeEach https://vitest.dev/api/#beforeeach
         * - afterEach https://vitest.dev/api/#aftereach
         * - onTestFinished https://vitest.dev/api/#ontestfinished
         * - onTestFailed https://vitest.dev/api/#ontestfailed
         * are bound to its suites and handled as `TestNode` state.
         */
        if (resultHooks.beforeAll === 'run') {
          const error = vitestIntellijUtil.getFirstError(taskResult);
          if (error != null) {
            const normalizedError = vitestIntellijUtil.normalizeError(error);
            vitestIntellijUtil.addErrorTestChild(
              suiteNode,
              "Error in beforeAll hook",
              normalizedError.message,
              normalizedError.stack,
            );
          }
        }

        if (resultHooks.afterAll === 'run') {
          // take last because in case of error in the `beforeAll` the suite task has 2 errors
          const error = vitestIntellijUtil.getLastError(taskResult);
          if (error != null) {
            const normalizedError = vitestIntellijUtil.normalizeError(error);
            vitestIntellijUtil.addErrorTestChild(
              suiteNode,
              "Error in afterAll hook",
              normalizedError.message,
              normalizedError.stack,
            );
          }
        }
      }
    }
  }
}

/**
 * @param {string} filePath
 * @param {string?} projectName
 * @return {string}
 */
function createFileNodeName(filePath, projectName) {
  const baseName = path.basename(filePath);
  // use `|` as workspace name selection, for the following default vitest cli reporter
  // https://github.com/vitest-dev/vitest/blob/85fb94a3081558b01f47bd763ccdaeb5df1b98cb/packages/vitest/src/node/reporters/renderers/utils.ts#L258
  return projectName ? `|${projectName}| ${baseName}` : baseName;
}

/**
 * @param {VitestReporterSuiteOrTestTask} task
 * @param {function(VitestReporterTestTask)} testCallback
 * @param {function(VitestReporterSuiteTask)} suiteStartedCallback
 * @param {function(VitestReporterSuiteTask)} suiteProcessedCallback
 */
function traverseSuitesAndProcessTasks(
  task,
  testCallback,
  suiteStartedCallback,
  suiteProcessedCallback,
) {
  if (task.type === 'test') {
    testCallback(task);
  }
  else if (task.type === 'suite') {
    if (suiteStartedCallback) {
      suiteStartedCallback(task);
    }
    for (const childTask of task.tasks) {
      traverseSuitesAndProcessTasks(
        childTask,
        testCallback,
        suiteStartedCallback,
        suiteProcessedCallback,
      );
    }
    if (suiteProcessedCallback) {
      suiteProcessedCallback(task);
    }
  }
}

/**
 * @param {VitestReporterSuiteTask} suiteTask
 * @returns {boolean}
 */
function isThisSuiteHasErrors(suiteTask) {
  const result = suiteTask.result;
  // skipped and todo suites don't have the state
  return result != null
    // the 'fails' state will be set for all levels of suites
    && result.state === 'fail'
    // but if the result has errors, the errors happen in this suite
    && (result.error || result.errors);
}

module.exports = {
  VitestIntellijReporterConnector: VitestIntellijReporterConnector,
};
