const Tree = require('../base-test-reporter/intellij-tree');
const util = require('../base-test-reporter/intellij-util');
const stringifier = require('../base-test-reporter/intellij-stringifier');
const path = require('path');
const processStdoutWrite = process.stdout.write.bind(process.stdout);
const processStderrWrite = process.stderr.write.bind(process.stderr);

const IS_ANGULAR_CLI_CONTEXT = process.env._JETBRAINS_VITEST_IS_NG_CLI_CONTEXT === 'true';
// angular-cli for tests should be run from the project root. Therefore, avoid adding any extra logic for detecting the project root.
const ANGULAR_PROJECT_ROOT_DIR = process.cwd();

function isSuiteNode(node) {
  return node && typeof node.addTestSuiteChild === 'function';
}

function sendConsoleLog(testNode, log) {
  if (log.type === 'stdout') {
    testNode.addStdOut(log.content);
  }
  else {
    testNode.addStdErr(log.content);
  }
}

function getResult(testTask) {
  let testOrSuite = testTask;
  while (testOrSuite != null) {
    const result = testOrSuite.result;
    if (result != null) return result;
    const parentSuite = testOrSuite.suite;
    testOrSuite = parentSuite !== testOrSuite ? parentSuite : null;
  }
  return null;
}

function finishTestNode(testTask, testNode) {
  const result = getResult(testTask);
  const outcome = getOutcome(testTask);
  let failureMessage, failureStack, failureExpectedStr, failureActualStr;
  const resultError = getFirstError(result);
  if (resultError != null) {
    const normalizedError = normalizeError(resultError);
    failureMessage = normalizedError.message;
    failureStack = normalizedError.stack;
    if (resultError.expected !== resultError.actual) {
      failureExpectedStr = stringifier.stringify(resultError.expected);
      failureActualStr = stringifier.stringify(resultError.actual);
      testNode.setPrintExpectedAndActualValues(shouldPrintExpectedAndActualValues(failureMessage, failureExpectedStr, failureActualStr));
    }
  }
  if ((outcome === Tree.TestOutcome.FAILED || outcome === Tree.TestOutcome.ERROR) && process.env.JB_VITEST_LOG_TEST_FAILURE_DETAILS) {
    testNode.addStdOut('[intellij] "' + testNode.name + '" failure details: ' + stringifier.stringify(result));
  }
  if (!failureMessage && isTodo(testTask)) {
    failureMessage = `Todo '${testTask.name}'`;
  }
  let durationMillis = result != null ? result.duration : null;

  // Ad hoc fix for WEB-69673 until IJPL-164000 won't be implemented
  if (durationMillis) {
    durationMillis = Math.floor(durationMillis);
  }

  testNode.setOutcome(outcome, durationMillis, failureMessage, failureStack, failureExpectedStr, failureActualStr, null, null);
  testNode.finish(false);
}

function getNormalizedErrorByTask(task) {
  const result = getResult(task);
  const resultError = getFirstError(result);
  return resultError != null ? normalizeError(resultError) : null;
}

function getFirstError(result) {
  if (result != null) {
    const errors = result.errors;
    const firstError = Array.isArray(errors) && errors.length > 0 ? errors[0] : null;
    return firstError != null ? firstError : result.error;
  }
  return null;
}

function getLastError(result) {
  if (result != null) {
    const errors = result.errors;
    const lastError = Array.isArray(errors) && errors.length > 0 ? errors[errors.length - 1] : null;
    return lastError != null ? lastError : result.error;
  }
}

/**
 * see https://github.com/vitest-dev/vitest/blob/1e60c4f4407036a0648ddeecb4d5675985a67bca/packages/utils/src/types.ts#L31
 * @typedef {Object} VitestReporterSerializedError
 * @property {string} [name]
 * @property {string} message
 * @property {string} [stack] The error stack trace
 * @property {string} [stackStr] The error stack trace
 * @property {VitestReporterSerializedError} [cause] The error that caused this error
 */

/**
 * @typedef {Object} NormalizedVitestError
 * @property {string} [message]
 * @property {string} name The error name/type
 * @property {string} [stack]
 */

/**
 * @param {VitestReporterSerializedError} error
 * @returns {NormalizedVitestError}
 */
function normalizeErrorFields(error) {
  const name = error.name || 'Error';
  let message = error.message;
  let stack = error.stack;
  if (!util.isString(stack)) {
    stack = error.stackStr;
  }

  if (util.isString(name) && util.isString(message) && util.isString(stack)) {
    const messageLines = splitByLines(message);
    const stackLines = splitByLines(stack);
    if (messageLines.length > 0 && stackLines.length > 0 && messageLines.length <= stackLines.length) {
      messageLines[0] = name + ': ' + messageLines[0]
      if (arrayEqual(messageLines, stackLines.slice(0, messageLines.length))) {
        message = messageLines.join('\n')
        stack = stackLines.slice(messageLines.length).join('\n')
      }
    }
  }

  if (IS_ANGULAR_CLI_CONTEXT && stack) {
    // https://github.com/angular/angular-cli/issues/30823
    stack = fixErrorStacktraceForAngularCli(stack);
  }

  return {
    name: name,
    message: message,
    stack: stack,
  };
}

/**
 * @param {VitestReporterSerializedError} error
 * @returns {string}
 */
function buildCauseErrorStack(error) {
  const handledErrors = [error];
  let currentCauseError = error.cause;
  let stack = '';
  while (currentCauseError != null) {
    const normalizedCauseError = normalizeErrorFields(currentCauseError)
    const isCycledCausedError = checkIsCycledCausedError(currentCauseError, handledErrors);
    const message = normalizedCauseError.message || normalizedCauseError.name || '';

    stack += '\n' + (isCycledCausedError ? 'Cyclically caused by: ' : 'Caused by: ') + message;
    if (normalizedCauseError.stack) {
      stack += '\n' + normalizedCauseError.stack;
    }

    if (isCycledCausedError) {
      stack += '\n' + '    ...pruned stack due to a detected cycle';
      break;
    } else {
      handledErrors.push(currentCauseError);
      currentCauseError = currentCauseError.cause;
    }
  }
  return stack
}

/**
 * @param {VitestReporterSerializedError} error
 * @returns {NormalizedVitestError}
 */
function normalizeError(error) {
  const normalizedErrorFields = normalizeErrorFields(error);
  if (error.cause != null) {
    const causeErrorStack = buildCauseErrorStack(error);
    normalizedErrorFields.stack += causeErrorStack;
  }
  return normalizedErrorFields
}

/**
 * @param {VitestReporterSerializedError} error
 * @param {VitestReporterSerializedError[]} handledErrors
 */
function checkIsCycledCausedError(error, handledErrors) {
  // At first try to find the same objects
  if (handledErrors.indexOf(error) !== -1) return true;

  /**
   * Vitest saves a few levels of cycled serialized errors. (It Looks like a serialization issue.)
   * To prevent showing the same caused errors twice, we need to find the same objects.
   * WEB-75026
   */
  const equalHandledError = handledErrors.find(handledError =>
    deepEqualErrors(error, handledError, 1)
  );
  return equalHandledError != null;
}

/**
 * @param {VitestReporterSerializedError} error1
 * @param {VitestReporterSerializedError} error2
 * @param {number} depth
 * @returns {boolean}
 */
function deepEqualErrors(error1, error2, depth) {
  if (error1 == null || error2 == null) return error1 == null && error2 == null;
  return shallowEqualErrors(error1, error2) &&
    (depth === 0 || deepEqualErrors(error1.cause, error2.cause, depth - 1))
}


/**
 * @param {VitestReporterSerializedError} error1
 * @param {VitestReporterSerializedError} error2
 * @returns {boolean}
 */
function shallowEqualErrors(error1, error2) {
  return error1.name === error2.name
    && error1.message === error2.message
    && error1.stack === error2.stack;
}

/**
 * Unfortunately, the Angular and Vitest integration produces incorrect paths in error output due to a combination of the `dist` output path
 * and sources paths, resulting in outputs like this:
 * `dist/test-out/08fa29b3-9365-4a5e-adf6-85e0bde73a9b/src/app/app.spec.ts:18:17`.
 * This function removes `dist/test-out/08fa29b3-9365-4a5e-adf6-85e0bde73a9b` to fix URLs for error navigation in the IDE.
 * If it can't apply its heuristics, it'll just return the passed `stacktrace` parameter as result.
 *
 * More info https://github.com/angular/angular-cli/issues/30823
 *
 * @param {String} stacktrace - Initial stacktrace as string
 * @return {string} Fixed stacktrace
 */
function fixErrorStacktraceForAngularCli(stacktrace) {
  const fistLineBreakIndex = stacktrace.indexOf('\n');
  if (fistLineBreakIndex !== -1) {
    const initialFirstLine = stacktrace.substring(0, fistLineBreakIndex - 1);
    const stacktraceLineStartMatching = initialFirstLine.match(/^\s+at\s/);
    if (stacktraceLineStartMatching) {
      const lineStart = stacktraceLineStartMatching[0];
      const pathToCode = initialFirstLine.substring(lineStart.length).trim();
      if (pathToCode.startsWith(ANGULAR_PROJECT_ROOT_DIR)) {
        const pathToCodeWithoutCwd = pathToCode.substring(ANGULAR_PROJECT_ROOT_DIR.length).split(path.sep);

        // clean all before `src` dir, for cases like this `dist/test-out/08fa29b3-9365-4a5e-adf6-85e0bde73a9b/src/app/app.spec.ts:18:17`
        while (pathToCodeWithoutCwd.length !== 0 && pathToCodeWithoutCwd[0] !== 'src') {
          pathToCodeWithoutCwd.shift();
        }

        if (pathToCodeWithoutCwd.length !== 0) {
          const fixedPathToCode = path.join(ANGULAR_PROJECT_ROOT_DIR, ...pathToCodeWithoutCwd);
          const fixedLine = lineStart + fixedPathToCode;
          return fixedLine + stacktrace.substring(fistLineBreakIndex - 1);
        }
      }
    }
  }

  return stacktrace;
}

function arrayEqual(a1, a2) {
  if (a1.length !== a2.length) return false
  for (let i = 0; i < a1.length; ++i) {
    if (a1[i] !== a2[i]) return false
  }
  return true
}

function splitByLines(text) {
  return text.split(/\n|\r\n/);
}

function shouldPrintExpectedAndActualValues(failureMessage, expectedStr, actualStr) {
  const duplicated = util.isString(failureMessage) && util.isString(expectedStr) && util.isString(actualStr) &&
    failureMessage.endsWith("expected '" + actualStr + "' to equal '" + expectedStr + "'");
  return !duplicated;
}

/**
 * @param {string} testTask
 * @returns {TestOutcome}
 */
function getOutcome(testTask) {
  const result = testTask.result;
  if (result == null) {
    if (testTask.mode === 'skip') {
      return Tree.TestOutcome.SKIPPED;
    }
    if (isTodo(testTask)) {
      return Tree.TestOutcome.SKIPPED;
    }
    return Tree.TestOutcome.ERROR;
  }
  if (result.state === 'pass') {
    return Tree.TestOutcome.SUCCESS;
  }
  return Tree.TestOutcome.FAILED;
}

function isTodo(testTask) {
  return testTask.mode === 'todo';
}

function addErrorTestChild(parentNode, childName, failureMsg, failureDetails) {
  const errorNode = parentNode.addTestChild(childName, 'test', null);
  errorNode.setOutcome(Tree.TestOutcome.ERROR, null, failureMsg, failureDetails, null, null, null, null);
  errorNode.start();
  errorNode.finish(false);
}

let globalRunScopeType;
function getRunScopeType() {
  if (globalRunScopeType == null) {
    globalRunScopeType = process.env['_JETBRAINS_VITEST_RUN_SCOPE_TYPE'];
  }
  return globalRunScopeType;
}

function isSuitesOrTestsScope() {
  const runScopeType = getRunScopeType();
  return runScopeType === 'suite' || runScopeType === 'test' || runScopeType === 'selected_tests';
}

function isSingleTestFileScope() {
  const runScopeType = getRunScopeType();
  return runScopeType === 'test_file' || runScopeType === 'suite' || runScopeType === 'test';
}

function configureCoverage(config, tree) {
  if (config) {
    const coverage = config.coverage;
    if (coverage) {
      const root = config.root;
      const reportsDirectory = coverage.reportsDirectory;
      if (util.isString(root) && util.isString(reportsDirectory)) {
        const resolvedCoverageDirectory = path.resolve(root, reportsDirectory)
        coverage.reporter.push(['lcov', {}]);
        tree.sendMessage('vitest-coverage-config', {coverageDirectory: resolvedCoverageDirectory});
      }
    }
  }
}

exports.addErrorTestChild = addErrorTestChild;
exports.finishTestNode = finishTestNode;
exports.isSuiteNode = isSuiteNode;
exports.isSingleTestFileScope = isSingleTestFileScope;
exports.isSuitesOrTestsScope = isSuitesOrTestsScope;
exports.normalizeError = normalizeError;
exports.getNormalizedErrorByTask = getNormalizedErrorByTask;
exports.sendConsoleLog = sendConsoleLog;
exports.configureCoverage = configureCoverage;
exports.getFirstError = getFirstError;
exports.getLastError = getLastError;
exports.IS_ANGULAR_CLI_CONTEXT = IS_ANGULAR_CLI_CONTEXT
exports.PROJECT_ROOT_DIR = ANGULAR_PROJECT_ROOT_DIR
