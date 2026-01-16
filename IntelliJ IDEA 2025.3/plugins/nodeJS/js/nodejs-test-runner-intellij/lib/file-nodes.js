const path = require('path');


/**
 * @param {string} testFilePath
 * @return {string}
 */
const createNameForFileNode = testFilePath => path.basename(testFilePath);

/**
 * @typedef {import('../../../../../JavaScriptLanguage/resources/helpers/base-test-reporter/intellij-tree.js').Tree} BaseReporterTestsTree
 */

class FileNodes {
  /**
   * @type {Object<string, TestSuiteNode>}
   * @private
   * */
  _suitesByFilePaths = {};
  /**
   * @type {TestSuiteNode|null}
   * @private
   */
  _lastFileNode = null;

  /**
   * @param {BaseReporterTestsTree} tree
   */
  constructor(tree) {
    /**
     * @type {BaseReporterTestsTree}
     * @private
     */
    this._tree = tree;
  }

  /**
   * @param {string} testFilePath
   * @return {TestSuiteNode}
   */
  getFor(testFilePath) {
    let fileNode = this._suitesByFilePaths[testFilePath];

    if (!fileNode) {
      fileNode = this._tree.root.addTestSuiteChild(createNameForFileNode(testFilePath), 'file', testFilePath);
      this._suitesByFilePaths[testFilePath] = fileNode;
      fileNode.start();
    }

    if (this._lastFileNode && this._lastFileNode !== fileNode) {
      this._lastFileNode.finish(false);
    }
    this._lastFileNode = fileNode;

    return fileNode;
  }

  finishLast() {
    if (this._lastFileNode && !this._lastFileNode.isFinished()) {
      this._lastFileNode.finish(false);
    }
  }
}

module.exports = {
  FileNodes,
  createNameForFileNode,
};
