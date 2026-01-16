const fs = require('fs');
const path = require('path');
const { IS_ANGULAR_CLI_CONTEXT, PROJECT_ROOT_DIR } = require("./vitest-intellij-util")

/**
 * Reads a sourcemap file by chunks and extracts the "sources" field. Avoids reading the entire source map file, if possible.
 * @param {string} sourcemapFilePath - Path to the sourcemap file
 * @returns {Array|null} - The value of the "sources" field or null if not found
 */
const getSourcesFiledFromSourcemapFile = sourcemapFilePath => {
  try {
    const fd = fs.openSync(sourcemapFilePath, 'r');
    const bufferSize = 1024; // 1KB chunks
    const buffer = Buffer.alloc(bufferSize);
    let position = 0;
    let accumulatedData = '';
    let sourcesFound = false;
    let sources = null;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    // Read the file in chunks until we find the "sources" field
    while (!sourcesFound) {
      const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, position);
      if (bytesRead === 0) break; // End of the file

      position += bytesRead;
      accumulatedData += buffer.toString('utf8', 0, bytesRead);

      // Look for "sources" field in the accumulated data
      const sourcesMatch = /"sources"\s*:\s*\[/.exec(accumulatedData);
      if (sourcesMatch) {
        // Found the start of sources array, now we need to find the end
        const startIndex = sourcesMatch.index + sourcesMatch[0].length - 1;

        // Parse the JSON array by tracking brackets and quotes
        for (let i = startIndex; i < accumulatedData.length; i++) {
          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          const char = accumulatedData[i];

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"' && !inString) {
            inString = true;
          } else if (char === '"' && inString) {
            inString = false;
          }

          if (!inString) {
            if (char === '[') {
              braceCount++;
            } else if (char === ']') {
              braceCount--;
              if (braceCount === 0) {
                // We've found the complete sources array
                const sourcesJson = accumulatedData.substring(startIndex, i + 1);
                try {
                  sources = JSON.parse(sourcesJson);
                  sourcesFound = true;
                  break;
                } catch (e) {
                  // If parsing fails, we need more data
                }
              }
            }
          }
        }
      }

      // If we haven't found the sources yet, we might need to read more data
      // But if we've accumulated too much data without finding it, we should stop
      if (!sourcesFound && accumulatedData.length > 1000000) { // 1MB limit
        break;
      }
    }

    fs.closeSync(fd);
    return sources;
  } catch (e) {
    return null;
  }
}

/**
 * Resolves the real file path of a source file using a corresponding source map file, if available.
 *
 * @param {string} filePath - The file path for which the source file path should be resolved.
 * @returns {string|null} The resolved source file path if found, otherwise null.
 */
const tryResolveOriginFilepathFromItsSourceMaps = filePath => {
  try {
    const sourcemapFilePath = filePath + '.map'
    const hasSourceMapFile = fs.existsSync(sourcemapFilePath)
    if (!hasSourceMapFile) return null;

    const sources = getSourcesFiledFromSourcemapFile(sourcemapFilePath)
    if (sources == null || sources.length === 0) return null;

    let sourceFilePath = sources[0];
    if (!sourceFilePath.startsWith(PROJECT_ROOT_DIR)) {
      sourceFilePath = path.join(PROJECT_ROOT_DIR, sourceFilePath);
    }

    if (fs.existsSync(sourceFilePath)) {
      return sourceFilePath;
    }
  }
  catch (e) {
    console.warn('Error resolving file path:', e)
  }
  return null;
}

class VitestIntellijFilePathResolver {
  _cache = {};

  resolve(filePath) {
    if (IS_ANGULAR_CLI_CONTEXT) {
      const cache = this._cache;
      if (!cache.hasOwnProperty(filePath)) {
        // Unfortunately, Angular and Vitest integrations use file paths from built assets.
        // For this reason, I’m trying to resolve the original source file paths to fix navigation.
        // More information https://github.com/angular/angular-cli/issues/30822
        const resolvedPath = tryResolveOriginFilepathFromItsSourceMaps(filePath);
        // Use cache to calculate a path only once per session
        cache[filePath] = resolvedPath || filePath;
      }
      return cache[filePath];
    }
    return filePath;
  }

  clearCache() {
    this._cache = {};
  }
}

module.exports = {
  VitestIntellijFilePathResolver,
};
