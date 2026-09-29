const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  delayBetweenMessages: {
    type: Number,
    default: 4, // in seconds
    min: 1,
    max: 60
  },
  messageTemplate: {
    type: String,
    default: "Hello {{name}},\n\nPlease find your document attached.\n\nThank you."
  },
  autoRetryFailed: {
    type: Boolean,
    default: false
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
