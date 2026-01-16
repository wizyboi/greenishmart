const utils = require(`${process.env['_JETBRAINS_BASE_TEST_REPORTER_ABSOLUTE_PATH']}/intellij-util`);

const { TestTreeBuilder } = require('./lib/test-tree-builder');
const { StderrCollector } = require('./lib/stderr-collector');

// TODO [dmitry.makhnev]: add better tree for one file and suite
// TODO [dmitry.makhnev]: watch

/**
 * @description https://nodejs.org/api/test.html#event-teststart
 * @typedef {Object} NodeJsTestRunnerTestStartEventData
 * @property {string} [file]
 * @property {string} name
 * @property {string} nesting
 */

/**
 * @description https://nodejs.org/api/test.html#event-teststart
 * @typedef {Object} NodeJsTestRunnerTestStartEvent
 * @property {'test:start'} type
 * @property {NodeJsTestRunnerTestStartEventData} data
 */

/**
 * @description https://nodejs.org/api/test.html#event-testpass
 * @typedef {Object} NodeJsTestRunnerTestPassEventData
 * @property {{ duration: number }} details
 * @property {string} [file]
 * @property {string} name
 * @property {number} nesting
 * @property {number} testNumber
 * @property {string|boolean} skip
 * @property {string|boolean} todo
 */

/**
 * @description https://nodejs.org/api/test.html#event-testpass
 * @typedef {Object} NodeJsTestRunnerTestPassEvent
 * @property {'test:pass'} type
 * @property {NodeJsTestRunnerTestPassEventData} data
 */

/**
 * @description https://nodejs.org/api/test.html#event-testfail
 * @typedef {Object} NodeJsTestRunnerTestFailEventData
 * @property {{ duration: number, error: Error }} details
 * @property {string} [file]
 * @property {string} name
 * @property {number} nesting
 * @property {number} testNumber
 * @property {string|boolean} skip
 * @property {string|boolean} todo
 */

/**
 * @description https://nodejs.org/api/test.html#event-testfail
 * @typedef {Object} NodeJsTestRunnerTestFailEvent
 * @property {'test:pass'} type
 * @property {NodeJsTestRunnerTestFailEventData} data
 */

/**
 * @description https://nodejs.org/api/test.html#event-teststderr
 * @typedef {Object} NodeJsTestRunnerTestStderrEventData
 * @property {string} file
 * @property {string} message
 */

/**
 * @description https://nodejs.org/api/test.html#event-teststderr
 * @typedef {Object} NodeJsTestRunnerTestStderrEvent
 * @typedef {'test:stderr'} type
 * @typedef {NodeJsTestRunnerTestStderrEventData} data
 */

/**
 * @typedef {NodeJsTestRunnerTestStartEvent|NodeJsTestRunnerTestPassEvent|NodeJsTestRunnerTestFailEvent|NodeJsTestRunnerTestStderrEvent} NodeJsTestRunnerEvent
 */

/**
 * @description Custom Reporter for Node.js Test Runner https://nodejs.org/api/test.html#custom-reporters
 */
module.exports = utils.safeAsyncGeneratorFn(async function* intellijReporter(source) {
  const stderrCollector = new StderrCollector();
  const testTreeBuilder = new TestTreeBuilder(stderrCollector);

  await testTreeBuilder.start();

  for await (/** @type {NodeJsTestRunnerEvent} */ const event of source) {
    switch (event.type) {
      case 'test:start':
        testTreeBuilder.startTest(event.data);
        yield '';
        break;

      case 'test:pass': {
        await testTreeBuilder.passTest(event.data);
        yield '';
        break;
      }

      case 'test:fail': {
        await testTreeBuilder.failTest(event.data);
        yield '';
        break;
      }

      case 'test:stdout':
        // Outputs from tests for file are sent before any other event reporter event.
        // By this reason I just proxy it for collecting for file nodes
        yield `${event.data.message}`;
        break;

      case 'test:stderr':
        stderrCollector.store(event.data);
        yield ``;
        break;
    }
  }

  await testTreeBuilder.build();
});
