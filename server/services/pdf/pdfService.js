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

module.exports = {
  extractNameFromFilename,
  calculateFileHash
};
