const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');

// GET /api/listings - Get all listings with filters
router.get('/', async (req, res) => {
  try {
    const {
      city,
      province,
      minPrice,
      maxPrice,
      type,
      bedrooms,
      furnished,
      studentFriendly,
      limit = 50,
      page = 1,
      sortBy = 'dateCollected',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = { isActive: true };

    if (city) {
      query.city = new RegExp(city, 'i');
    }
    
    if (province) {
      query.province = province.toUpperCase();
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (type) {
      query.type = type;
    }

    if (bedrooms) {
      query.bedrooms = Number(bedrooms);
    }

    if (furnished !== undefined) {
      query.furnished = furnished === 'true';
    }

    // Execute query
    const skip = (Number(page) - 1) * Number(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const listings = await Listing.find(query)
      .sort(sort)
      .limit(Number(limit))
      .skip(skip)
      .lean();

    // Filter for student-friendly if requested
    let filteredListings = listings;
    if (studentFriendly === 'true') {
      filteredListings = listings.filter(listing => {
        const keywords = ['student', 'university', 'college', 'shared', 'roommate'];
        const text = `${listing.title} ${listing.description}`.toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
      });
    }

    const total = await Listing.countDocuments(query);

    res.json({
      success: true,
      data: filteredListings,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
        limit: Number(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/listings/:id - Get single listing
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        error: 'Listing not found'
      });
    }

    res.json({
      success: true,
      data: listing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/listings - Create new listing (user-submitted)
router.post('/', async (req, res) => {
  try {
    const listing = new Listing({
      ...req.body,
      source: 'Manual',
      url: req.body.url || `manual-${Date.now()}`
    });

    await listing.save();

    res.status(201).json({
      success: true,
      data: listing
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/listings/analytics/overview - Get analytics
router.get('/analytics/overview', async (req, res) => {
  try {
    const { city, province, type } = req.query;
    
    let matchStage = { isActive: true };
    if (city) matchStage.city = new RegExp(city, 'i');
    if (province) matchStage.province = province.toUpperCase();
    if (type) matchStage.type = type;

    const analytics = await Listing.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$price' },
          medianPrice: { $median: { input: '$price', method: 'approximate' } },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' },
          totalListings: { $sum: 1 }
        }
      }
    ]);

    // Price distribution
    const priceRanges = await Listing.aggregate([
      { $match: matchStage },
      {
        $bucket: {
          groupBy: '$price',
          boundaries: [0, 500, 750, 1000, 1250, 1500, 2000, 3000, 10000],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    // Listings by city
    const byCity = await Listing.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        summary: analytics[0] || {},
        priceDistribution: priceRanges,
        topCities: byCity
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
