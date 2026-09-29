const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const extractNameFromFilename = (filename) => {
  if (!filename) return '';
  // Strip extension
  const ext = path.extname(filename);
  let name = filename;
  if (ext) {
    name = filename.substring(0, filename.length - ext.length);
  }
  // Replace underscores or multiple spaces with single space
  name = name.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return name;
};

const calculateFileHash = (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error('Error calculating file hash:', error.message);
    return '';
  }
};

const scanLocalFolder = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Directory does not exist: ${folderPath}`);
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error(`Provided path is not a directory: ${folderPath}`);
  }

  const files = fs.readdirSync(folderPath);
  const pdfFiles = [];

  files.forEach((file) => {
    const fullPath = path.join(folderPath, file);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.pdf') {
        const extractedName = extractNameFromFilename(file);
        const fileHash = calculateFileHash(fullPath);
        const fileSize = fs.statSync(fullPath).size;

        pdfFiles.push({
          originalFilename: file,
          extractedName,
          filePath: fullPath,
          fileSize,
          fileHash
        });
      }
    }
  });

  return pdfFiles;
};

module.exports = {
  extractNameFromFilename,
  calculateFileHash,
  scanLocalFolder
};
