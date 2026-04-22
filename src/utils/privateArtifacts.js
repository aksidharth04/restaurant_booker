const fs = require('fs');
const path = require('path');

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function ensurePrivateDirectory(dirPath, mode = PRIVATE_DIR_MODE) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
  }

  tightenPathMode(dirPath, mode);
}

function ensurePrivateFile(filePath, mode = PRIVATE_FILE_MODE) {
  ensureParentDirectory(filePath);
  const handle = fs.openSync(filePath, 'a', mode);
  fs.closeSync(handle);
  tightenPathMode(filePath, mode);
}

function copyPrivateFile(sourcePath, destinationPath, mode = PRIVATE_FILE_MODE) {
  ensureParentDirectory(destinationPath);
  fs.copyFileSync(sourcePath, destinationPath);
  tightenPathMode(destinationPath, mode);
}

function writePrivateFile(filePath, contents, mode = PRIVATE_FILE_MODE) {
  ensureParentDirectory(filePath);
  fs.writeFileSync(filePath, contents, { mode });
  tightenPathMode(filePath, mode);
}

function ensureParentDirectory(filePath) {
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true, mode: PRIVATE_DIR_MODE });
  }
}

function tightenPathMode(targetPath, mode) {
  if (!fs.existsSync(targetPath)) {
    return false;
  }

  try {
    fs.chmodSync(targetPath, mode);
    return true;
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') {
      return false;
    }

    throw error;
  }
}

module.exports = {
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE,
  copyPrivateFile,
  ensurePrivateDirectory,
  ensurePrivateFile,
  ensureParentDirectory,
  tightenPathMode,
  writePrivateFile
};
