const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  contactName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  pdfFilename: {
    type: String,
    required: true
  },
  pdfPath: {
    type: String,
    required: true
  },
  fileHash: {
    type: String,
    default: ''
  },
  messageText: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Pending', 'Queued', 'Sending', 'Sent', 'Failed', 'Already Sent'],
    default: 'Pending',
    index: true
  },
  errorReason: {
    type: String,
    default: ''
  },
  sentAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

messageLogSchema.index({ userId: 1, fileHash: 1, phone: 1 });
messageLogSchema.index({ userId: 1, pdfFilename: 1, phone: 1 });

module.exports = mongoose.model('MessageLog', messageLogSchema);
