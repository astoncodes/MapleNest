const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    index: true
  },
  province: {
    type: String,
    required: true,
    enum: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']
  },
  price: {
    type: Number,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['room', 'apartment', 'sublet', 'house'],
    index: true
  },
  bedrooms: {
    type: Number,
    default: 1
  },
  bathrooms: {
    type: Number,
    default: 1
  },
  furnished: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    default: ''
  },
  url: {
    type: String,
    required: true,
    unique: true
  },
  source: {
    type: String,
    required: true,
    enum: ['Kijiji', 'Facebook', 'Manual', 'Other']
  },
  datePosted: {
    type: Date,
    default: Date.now
  },
  dateCollected: {
    type: Date,
    default: Date.now,
    index: true
  },
  availableFrom: {
    type: Date
  },
  leaseDuration: {
    type: String,
    default: 'Not specified'
  },
  utilities: {
    type: String,
    enum: ['included', 'extra', 'negotiable', 'not specified'],
    default: 'not specified'
  },
  tags: [{
    type: String
  }],
  location: {
    lat: Number,
    lng: Number
  },
  images: [{
    type: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Add text index for search
listingSchema.index({ title: 'text', description: 'text' });

// Helper method to check if listing is student-friendly
listingSchema.methods.isStudentFriendly = function() {
  const keywords = ['student', 'university', 'college', 'shared', 'roommate'];
  const text = `${this.title} ${this.description}`.toLowerCase();
  return keywords.some(keyword => text.includes(keyword));
};

module.exports = mongoose.model('Listing', listingSchema);