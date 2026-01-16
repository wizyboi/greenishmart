const Tree = require(`${process.env['_JETBRAINS_BASE_TEST_REPORTER_ABSOLUTE_PATH']}/intellij-tree`);
const utils = require(`${process.env['_JETBRAINS_BASE_TEST_REPORTER_ABSOLUTE_PATH']}/intellij-util`);
const { FileNodes, createNameForFileNode} = require('./file-nodes');
const { StderrCollector } = require('./stderr-collector');

/**
 * @typedef {import('../../../../../JavaScriptLanguage/resources/helpers/base-test-reporter/intellij-tree.js').Tree} BaseReporterTestsTree
 */


/**
 * @typedef {import('../../../../../JavaScriptLanguage/resources/helpers/base-test-reporter/intellij-tree.js').SyncWriter} Writer
 */

/**
 * @typedef {NodeJsTestRunnerTestStartEventData[]} TestsStartData
 */

const IS_FILTRATION_RUNNING = process.env['_JETBRAINS_TEST_NAME_PATTERN_FILTRATION'] === 'true';

/**
 * @param {NodeJsTestRunnerTestPassEventData} testData
 * @return {boolean}
 */
const isTestSkippedByFiltration = testData =>
  IS_FILTRATION_RUNNING && testData.skip === 'test name does not match pattern';

/**
 * @param {NodeJsTestRunnerTestPassEventData} testData
 * @return {Tree.TestOutcome}
 */
const resolveOutcomeStateForPassedTest = testData => {
  if (testData.skip) {
    return Tree.TestOutcome.SKIPPED;
  } else if (testData.todo) {
    return Tree.TestOutcome.SKIPPED;
  }
  return Tree.TestOutcome.SUCCESS;
};

/**
 * @param {TestNode|TestSuiteNode} testNode
 * @param {NodeJsTestRunnerTestPassEventData} testPassData
 * @return {null|string}
 */
const resolveFailureMessageForPassedTest = (testNode, testPassData) => {
  if (testPassData.todo) {
    let todoMessage = `Todo test '${testNode.name}'`;
    if (typeof testPassData.todo === 'string') {
      todoMessage += `\nMessage '${testPassData.todo}'`;
    }
    return todoMessage;
  } else if (typeof testPassData.skip === 'string') {
    return `Skipped test '${testNode.name}'\nMessage '${testPassData.skip}'`;
  }
  return null;
};

/**
 * @param {NodeJsTestRunnerTestFailEventData} testData
 * @return {Tree.TestOutcome}
 */
const resolveOutcomeStateForFailedTest = testData => {
  const error = testData.details.error;
  if (error.cause && error.cause.code !== 'ERR_ASSERTION') {
    return Tree.TestOutcome.ERROR;
  }
  return Tree.TestOutcome.FAILED;
};

/**
 * @param {*} assertionValue
 * @return {string|*}
 */
const prepareAssertionValue = assertionValue => {
  if (typeof assertionValue === 'number') {
    return assertionValue.toString();
  }
  return assertionValue;
};

/**
 * @param {NodeJsTestRunnerTestFailEventData} failedTestData
 * @return {{ message: string, stack: string, expected: string, actual: string }}
 */
const resolveFailedTestErrorProps = failedTestData => {
  let stack;
  let expected;
  let actual;

  const baseError = failedTestData.details.error;
  const message = baseError.message;

  const causeError = baseError.cause;
  // we have a string cause for tests timeouts by timeout see https://nodejs.org/api/test.html#testname-options-fn
  if (causeError && typeof causeError !== 'string') {
    stack = causeError.stack;
    expected = prepareAssertionValue(causeError.expected);
    actual = prepareAssertionValue(causeError.actual);
  }

  if (stack == null) {
    stack = baseError.stack;
  }

  return {
    message,
    stack,
    expected,
    actual,
  };
};

/**
 * @param {NodeJsTestRunnerTestStartEventData|NodeJsTestRunnerTestFailEventData|NodeJsTestRunnerTestPassEventData} testData
 * @return {boolean}
 */
const checkFiledTestFile = testData =>
  // In cases with syntax error in test file Node.js test runner store test file path in `name` prop
  testData.file == null || testData.details != null && testData.details.error != null && testData.details.error.exitCode === 1;

const FILE_PROTOCOL_PREFIX = 'file://';
const FILE_PROTOCOL_PREFIX_SIZE = FILE_PROTOCOL_PREFIX.length;

/**
 * Since version 21+ Node.js started to add 'file://' protocol for files. It breaks
 * @param {string} filepath
 * @return {string}
 */
const fixFilepathFoLocation = filepath => filepath.indexOf(FILE_PROTOCOL_PREFIX) === 0
  ? filepath.substring(FILE_PROTOCOL_PREFIX_SIZE)
  : filepath;

/**
 * @param {NodeJsTestRunnerTestStartEventData|NodeJsTestRunnerTestFailEventData|NodeJsTestRunnerTestPassEventData} testData
 * @return {string}
 */
// In cases with syntax error in test file Node.js test runner store test file path in `name` prop
const resolveTestFilepath = testData => fixFilepathFoLocation(testData.file || testData.name)

/**
 * @param {TestSuiteNode} testFileNode
 * @param {TestSuiteNode} parent
 * @param {boolean} isTest
 * @param {NodeJsTestRunnerTestStartEventData} testStartData
 * @return {TestNode|TestSuiteNode}
 */
const createTestNode = (testFileNode, parent, isTest, testStartData) => {
  const name = testStartData.name;
  const testFilePath = resolveTestFilepath(testStartData);
  const location = utils.getTestLocationPath(parent, name, testFileNode, testFilePath);

  return isTest
    // add a location path normally
    ? parent.addTestChild(name, 'test', location)
    : parent.addTestSuiteChild(name, 'suite', location);
};

class TestTreeBuilder {
  /**
   * @type {Writer}
   * @private
   */
  _writer = utils.createWriter();

  /**
   * @type {BaseReporterTestsTree}
   * @private
   */
  _tree = new Tree(null, this._writer.write.bind(this._writer));

  /**
   * @type {FileNodes}
   * @private
   */
  _fileNodes = new FileNodes(this._tree);

  /**
   * @type {TestsStartData}
   * @private
   */
  _testsStartDataStack = [];

  /**
   * @param {StderrCollector} stderrCollector
   */
  constructor(stderrCollector) {
    this._stderrCollector = stderrCollector;
  }

  async start() {
    this._tree.startNotify();
    this._tree.testingStarted();
    await this._writer.flush();
  }

  /**
   * @param {NodeJsTestRunnerTestStartEventData} testStartData
   */
  startTest(testStartData) {
    this._testsStartDataStack.push(testStartData);
  }

  /**
   * @param {NodeJsTestRunnerTestPassEventData} testPassData
   */
  async passTest(testPassData) {
    // doesn't work for suites (describe blocks) in Node.js version **20.4+**,
    // and it's "correct", because Node.js test runner calls the sutes callbacks
    if (isTestSkippedByFiltration(testPassData)) {
      this._testsStartDataStack.pop();
      return;
    }

    const testNode = this._popLastDoneTestNode(testPassData);

    if (testNode.getType() === 'test') {
      testNode.setOutcome(
        resolveOutcomeStateForPassedTest(testPassData),
        testPassData.details.duration,
        resolveFailureMessageForPassedTest(testNode, testPassData)
      );
    }

    testNode.finish(false);
    await this._writer.flush();
  }

  /**
   * @param {NodeJsTestRunnerTestFailEventData} testFailData
   */
  async failTest(testFailData) {
    const isFailedTestFile = checkFiledTestFile(testFailData);
    let testNode;
    if (isFailedTestFile) {
      const testStartData = this._testsStartDataStack.pop();
      const testFilePath = resolveTestFilepath(testStartData);
      testNode = this._tree.root.addTestChild(createNameForFileNode(testFilePath), 'file', testFilePath);
      testNode.start();
    } else {
      testNode = this._popLastDoneTestNode(testFailData);
    }

    if (testNode.getType() === 'test' || isFailedTestFile) {
      const { duration } = testFailData.details;

      let message, stack, expected, actual;
      const failedFileError = isFailedTestFile ? this._stderrCollector.tryToBuildError() : undefined;
      if (failedFileError) {
        message = failedFileError.failureMsg;
        stack = failedFileError.failureDetails;
      } else {
        const failedTestProps = resolveFailedTestErrorProps(testFailData);
        message = failedTestProps.message;
        stack = failedTestProps.stack;
        actual = failedTestProps.actual;
        expected = failedTestProps.expected;
      }

      testNode.setOutcome(
        resolveOutcomeStateForFailedTest(testFailData),
        duration,
        message,
        stack,
        expected,
        actual
      );
    }

    testNode.finish(false);
    await this._writer.flush();
  }

  /**
   * @param {NodeJsTestRunnerTestPassEventData|NodeJsTestRunnerTestFailEventData} doneTestData
   * @return {TestNode|TestSuiteNode}
   */
  _popLastDoneTestNode(doneTestData) {
    const filePath = resolveTestFilepath(doneTestData);
    const testFileNode = this._fileNodes.getFor(filePath);

    let currentNode = testFileNode;
    const lastElementIndex = this._testsStartDataStack.length - 1;
    this._testsStartDataStack.forEach((testStartData, index) => {
      const children = currentNode.findChildNodesByName(testStartData.name);
      const isLastInStack = index === lastElementIndex;
      if (children.length === 0) {
        // If no one test in the file is satisfied for a filter query,
        // Node.js test runner will send test:start and test:pass events with name as filepath.
        // Here we ignore this case. (See '2.' at https://youtrack.jetbrains.com/issue/WEB-63419/#focus=Comments-27-9830999.0-0)
        if (testStartData.name !== filePath) {
          currentNode = createTestNode(testFileNode, currentNode, isLastInStack, testStartData);
          currentNode.start();
        }
      } else {
        currentNode = children[children.length - 1];

        // handle the case for tests suites with the same names
        if (currentNode.isFinished()) {
          currentNode = createTestNode(testFileNode, currentNode.parent, currentNode.getType() === 'test', testStartData);
          currentNode.start();
        }
      }
    });

    this._testsStartDataStack.pop();

    return currentNode;
  }

  async build() {
    this._fileNodes.finishLast();
    this._tree.testingFinished();
    await this._writer.close();
  }

  /**
   * @param {string} testFilePath
   * @param {string} failureMsg
   * @param {string} failureDetails
   */
  async buildWithReporterError(testFilePath, failureMsg, failureDetails) {
    this._fileNodes.finishLast();
    const testNode = this._tree.root.addTestChild(createNameForFileNode(testFilePath), 'test', testFilePath);
    testNode.start();
    testNode.setOutcome(
      Tree.TestOutcome.ERROR,
      // test wasn't run in this case
      0,
      failureMsg,
      failureDetails
    );
    testNode.finish(true);
    this._tree.testingFinished();
    await this._writer.close();
  }
}

module.exports = {
  TestTreeBuilder,
};
