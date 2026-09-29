const mongoose = require('mongoose');

const pdfFileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  originalFilename: {
    type: String,
    required: true
  },
  extractedName: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  fileHash: {
    type: String,
    default: ''
  },
  matchedContactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

pdfFileSchema.index({ userId: 1, originalFilename: 1 });

module.exports = mongoose.model('PdfFile', pdfFileSchema);
