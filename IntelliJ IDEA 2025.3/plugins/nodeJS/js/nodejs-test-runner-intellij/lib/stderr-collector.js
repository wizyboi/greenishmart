let debuggerMessagesRegExp;

/**
 * @return {RegExp}
 */
const getOrCreateDebuggerMessagesRegExp = () => {
  if (!debuggerMessagesRegExp) {
    const debuggerMessagesStarts = [
      'Waiting for the debugger to disconnect...',
      'Debugger listening on',
      'For help, see: https://nodejs.org/en/docs/inspector',
      'Debugger attached.'
    ];
    debuggerMessagesRegExp = new RegExp(debuggerMessagesStarts.map(key => '^' + key).join('|'));
  }
  return debuggerMessagesRegExp;
}

/**
 * @param {NodeJsTestRunnerTestStderrEventData[]} outData
 * @return {NodeJsTestRunnerTestStderrEventData[]}
 */
const removeDebuggerMessagesFromStderrOutput = outData => {
  const debuggerMessagesRegExp = getOrCreateDebuggerMessagesRegExp();
  return outData.filter(data => !debuggerMessagesRegExp.test(data.message));
}

/**
 * @param {NodeJsTestRunnerTestStderrEventData[]} outData
 * @return {{ message: string, stacktrace: string, nodeVersion: string }}
 */
const groupLastErrorFromStderrOutput = outData => {
  const message = [];
  const stacktrace = [];
  const nodeVersion = [];
  const bufferOrder = [message, stacktrace, nodeVersion];

  let currentBuffer = bufferOrder.pop();
  let i = outData.length;
  while (i--) {
    const currentData = outData[i];
    if (currentData.message === '\n') {
      if (currentBuffer.length === 0) {
        break;
      }
      currentBuffer = bufferOrder.pop();
    } else {
      currentBuffer.unshift(currentData.message);
    }
  }

  return {
    message: message.join(''),
    stacktrace: stacktrace.join(''),
    nodeVersion: nodeVersion.join(''),
  };
};

/**
 * @callback OnReporterErrorCallback
 * @param {string} testFilePath
 * @param {string} failureMsg
 * @param {string} failureDetails
 */

/**
 * @typedef {Object} FullStderrError
 * @property {string} failureMsg
 * @property {string} failureDetails
 */

class StderrCollector {
  /**
   * @type {NodeJsTestRunnerTestStderrEventData[]}
   * @private
   */
  _outData = [];

  /**
   * @param {NodeJsTestRunnerTestStderrEventData} outData
   */
  store(outData) {
    this._outData.push(outData);
  }

  /**
   * @return {FullStderrError|undefined}
   */
  tryToBuildError() {
    if (this._outData.length !== 0) {
      const outData = removeDebuggerMessagesFromStderrOutput(this._outData);
      if (outData.length !== 0) {
        const testFilePath = outData[outData.length - 1].file;

        const { message, stacktrace, nodeVersion } = groupLastErrorFromStderrOutput(outData);

        // if the message starts with a path, add `at ` for IDEA console handles it as active url
        const failureMsg = (message.startsWith(testFilePath) ? 'at ' : '') + message;
        const failureDetails = stacktrace
          // Save information about Node.js version as same as original output.
          // It can be helpful to understand cases with new unsupported syntax in old Node.js versions
          + '\n' + nodeVersion;

        this._outData.length = 0;

        return {
          failureMsg,
          failureDetails
        };
      }
    }
  }
}

module.exports = {
  StderrCollector,
};
