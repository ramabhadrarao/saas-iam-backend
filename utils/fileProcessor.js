// File: utils/fileProcessor.js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

/**
 * Process an uploaded file
 * @param {Object} file - Multer file object
 * @returns {Promise<string>} Path to processed file
 */
exports.processUploadedFile = async (file) => {
  // Create processed file directory if it doesn't exist
  const processedDir = path.join(__dirname, '../processed_files');
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir);
  }
  
  // Generate processed file path
  const timestamp = Date.now();
  const filename = `${timestamp}_${file.originalname}`;
  const processedPath = path.join(processedDir, filename);
  
  // Copy file to processed directory
  await fs.promises.copyFile(file.path, processedPath);
  
  // Delete the original file
  await unlinkAsync(file.path);
  
  return processedPath;
};