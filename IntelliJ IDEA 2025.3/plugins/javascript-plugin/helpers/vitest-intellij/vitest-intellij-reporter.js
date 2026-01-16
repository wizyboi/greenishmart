const Tree = require('../base-test-reporter/intellij-tree.js');
const utils = require('../base-test-reporter/intellij-util.js');
const { VitestIntellijReporterConnector } = require('./vitest-intellij-reporter-connector.js');

class Stat {
  collectedTestCount = 0;
  finishedTestCount = 0;
}

/** @type {Object<string, Stat>} */
let collectedFilePathToTestStatMap = {};

const writer = utils.createWriter();
const tree = new Tree(null, writer.write.bind(writer));
const reporterConnector = new VitestIntellijReporterConnector(
  tree,
  {
    onStarted() {
      collectedFilePathToTestStatMap = {};
    }
  },
);

// No flush writer here because top-level await is not allowed in all supported JS versions
reporterConnector.startNotify();

function IntellijReporter() {
}

IntellijReporter.prototype.onInit = utils.safeAsyncFn(async (vitestCtx) => {
  if (reporterConnector.configureCoverage(vitestCtx)) {
    await writer.flush();
  }
});

/**
 * @param {String} filePath
 * @returns {Stat}
 */
function getOrCreateStat(filePath) {
  let stat = collectedFilePathToTestStatMap[filePath];
  if (stat == null) {
    stat = new Stat();
    collectedFilePathToTestStatMap[filePath] = stat;
  }
  return stat;
}

IntellijReporter.prototype.onCollected = utils.safeAsyncFn(async (files) => {
  reporterConnector.startTestingIfNeeded();
  buildTreeAndProcessTests(files, (testTask, testNode, filePath) => {
    getOrCreateStat(filePath).collectedTestCount++;
  });
  await writer.flush();
});

function buildTreeAndProcessTests(files, testNodeCallback, suiteNodeDoneCallback) {
  for (const file of files) {
    reporterConnector.buildAndProcessFileTests(file, testNodeCallback, suiteNodeDoneCallback);
  }
}

IntellijReporter.prototype.onUserConsoleLog = utils.safeAsyncFn(async (log) => {
  reporterConnector.addUserConsoleLog(log);
  await writer.flush();
});

IntellijReporter.prototype.onFinished = utils.safeAsyncFn(async (files, unhandledErrors) => {
  if (reporterConnector.beforeTestingStart) {
    utils.warn("Got finished tests before collecting them");
  }

  buildTreeAndProcessTests(
    files,
    (testTask, testNode, filePath) => {
      reporterConnector.finishTestNode(testTask, testNode);
      const stat = collectedFilePathToTestStatMap[filePath];
      if (stat != null) {
        stat.finishedTestCount++;
      }
    },
    (suiteTask, suiteNode) => {
      reporterConnector.processSuiteFailedHooks(suiteTask, suiteNode)
    },
  );

  reporterConnector.processUnhandledErrors(unhandledErrors);

  for (const file of files) {
    const filePath = reporterConnector.filePathResolver.resolve(file.filepath);
    const fileNode = reporterConnector.getOrCreateFileNode(file);
    reporterConnector.addErrorNodeInFileIfNeeded(fileNode, file);
    const stat = getOrCreateStat(filePath);
    if (stat.collectedTestCount === stat.finishedTestCount) {
      fileNode.children.forEach(function (childNode) {
        childNode.finishIfStarted();
      });
      fileNode.finish(false);
    }
  }
  if (Object.values(collectedFilePathToTestStatMap).every((stat) => stat.collectedTestCount <= stat.finishedTestCount)) {
    reporterConnector.finishTesting();
  }
  await writer.close();
});

// export as default for direct usage in by Vitest
module.exports = IntellijReporter;

/*
function traceCalls(functionName, fn) {
  const old = IntellijReporter.prototype[functionName];
  IntellijReporter.prototype[functionName] = function () {
    process.stdout.write('trace: ' + functionName + '\n');
    if (typeof fn === 'function') {
      fn.apply(this, arguments);
    }
    if (typeof old === 'function') {
      old.apply(this, arguments);
    }
  }
}

traceCalls('onInit');
traceCalls('onPathsCollected');
traceCalls('onCollected', (files) => {
  logFiles('onCollected', files);
});
traceCalls('onFinished', (files) => {
  logFiles('onFinished', files);
});
traceCalls('onTaskUpdate');
traceCalls('onTestRemoved');
traceCalls('onWatcherStart');
traceCalls('onWatcherRerun');
traceCalls('onServerRestart');
traceCalls('onUserConsoleLog');

function logFiles(message, files) {
  process.stdout.write(message + ' ' + files.length + '\n' + files.map(file => '  ' + file.filepath).join('\n') + '\n');
}

*/
