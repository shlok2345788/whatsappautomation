const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    trim: true
  },
  originalMobile: {
    type: String,
    trim: true
  },
  isValid: {
    type: Boolean,
    default: true
  },
  statusMessage: {
    type: String,
    default: 'Valid'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

contactSchema.index({ userId: 1, mobile: 1 });

module.exports = mongoose.model('Contact', contactSchema);
