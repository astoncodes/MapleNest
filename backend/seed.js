require('dotenv').config();
const mongoose = require('mongoose');
const Listing = require('../src/models/Listing');

const sampleListings = [
  // Toronto Listings
  {
    title: 'Cozy room near University of Toronto',
    city: 'Toronto',
    province: 'ON',
    price: 950,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Furnished room in shared house, 10 min walk to UofT campus. Great for students!',
    url: 'https://example.com/listing-1',
    source: 'Kijiji',
    utilities: 'included',
    tags: ['student-friendly', 'near-transit'],
    location: { lat: 43.6629, lng: -79.3957 }
  },
  {
    title: 'Downtown 1BR sublet - 4 months',
    city: 'Toronto',
    province: 'ON',
    price: 1600,
    type: 'sublet',
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    description: 'Available May-August. Perfect for summer internship.',
    url: 'https://example.com/listing-2',
    source: 'Facebook',
    leaseDuration: '4 months',
    utilities: 'extra',
    location: { lat: 43.6532, lng: -79.3832 }
  },
  {
    title: 'Shared apartment near Ryerson',
    city: 'Toronto',
    province: 'ON',
    price: 850,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Looking for one roommate to share 2BR apartment. Close to campus.',
    url: 'https://example.com/listing-3',
    source: 'Manual',
    utilities: 'included',
    tags: ['student-friendly', 'shared'],
    location: { lat: 43.6577, lng: -79.3788 }
  },

  // Vancouver Listings
  {
    title: 'Room in Kitsilano - UBC students welcome',
    city: 'Vancouver',
    province: 'BC',
    price: 1100,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Bright room in friendly house. 15 min bus to UBC.',
    url: 'https://example.com/listing-4',
    source: 'Kijiji',
    utilities: 'included',
    tags: ['student-friendly', 'near-ubc'],
    location: { lat: 49.2608, lng: -123.1535 }
  },
  {
    title: 'Studio apartment downtown',
    city: 'Vancouver',
    province: 'BC',
    price: 1800,
    type: 'apartment',
    bedrooms: 0,
    bathrooms: 1,
    furnished: false,
    description: 'Modern studio in the heart of downtown. Available immediately.',
    url: 'https://example.com/listing-5',
    source: 'Other',
    utilities: 'extra',
    location: { lat: 49.2827, lng: -123.1207 }
  },

  // Montreal Listings
  {
    title: 'Chambre près de McGill / Room near McGill',
    city: 'Montreal',
    province: 'QC',
    price: 750,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Chambre meublée dans le Plateau. 5 min à pied de McGill.',
    url: 'https://example.com/listing-6',
    source: 'Kijiji',
    utilities: 'included',
    tags: ['student-friendly', 'bilingual'],
    location: { lat: 45.5048, lng: -73.5772 }
  },
  {
    title: '2BR apartment - Concordia area',
    city: 'Montreal',
    province: 'QC',
    price: 1400,
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: false,
    description: 'Perfect for 2 students or young professionals.',
    url: 'https://example.com/listing-7',
    source: 'Facebook',
    utilities: 'extra',
    tags: ['student-friendly'],
    location: { lat: 45.4972, lng: -73.5789 }
  },

  // Halifax Listings
  {
    title: 'Room near Dalhousie University',
    city: 'Halifax',
    province: 'NS',
    price: 650,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Cozy room in shared house. Walking distance to Dal campus.',
    url: 'https://example.com/listing-8',
    source: 'Manual',
    utilities: 'included',
    tags: ['student-friendly', 'pet-friendly'],
    location: { lat: 44.6361, lng: -63.5915 }
  },

  // Charlottetown Listings
  {
    title: 'Student room near UPEI',
    city: 'Charlottetown',
    province: 'PE',
    price: 550,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Perfect for UPEI students. Quiet neighborhood, great landlord.',
    url: 'https://example.com/listing-9',
    source: 'Kijiji',
    utilities: 'included',
    tags: ['student-friendly', 'quiet'],
    location: { lat: 46.2382, lng: -63.1311 }
  },
  {
    title: 'Downtown 1BR - short term OK',
    city: 'Charlottetown',
    province: 'PE',
    price: 900,
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Flexible lease terms. Perfect for work terms or summer students.',
    url: 'https://example.com/listing-10',
    source: 'Manual',
    utilities: 'included',
    leaseDuration: 'flexible',
    location: { lat: 46.2352, lng: -63.1311 }
  },

  // Ottawa Listings
  {
    title: 'Room in Sandy Hill - uOttawa/Carleton',
    city: 'Ottawa',
    province: 'ON',
    price: 800,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Great location for university students. On bus route to both campuses.',
    url: 'https://example.com/listing-11',
    source: 'Facebook',
    utilities: 'included',
    tags: ['student-friendly', 'near-transit'],
    location: { lat: 45.4215, lng: -75.6972 }
  },

  // Calgary Listings
  {
    title: 'Shared house near University of Calgary',
    city: 'Calgary',
    province: 'AB',
    price: 700,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: true,
    description: 'Looking for 2 roommates. House is 5 min from UC campus.',
    url: 'https://example.com/listing-12',
    source: 'Kijiji',
    utilities: 'included',
    tags: ['student-friendly', 'shared'],
    location: { lat: 51.0786, lng: -114.1339 }
  },

  // Edmonton Listings
  {
    title: 'Basement suite near UofA',
    city: 'Edmonton',
    province: 'AB',
    price: 850,
    type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    description: 'Separate entrance, utilities included. Great for grad students.',
    url: 'https://example.com/listing-13',
    source: 'Other',
    utilities: 'included',
    tags: ['student-friendly', 'quiet'],
    location: { lat: 53.5232, lng: -113.5263 }
  },

  // More variety - higher end
  {
    title: 'Luxury 2BR condo - Toronto Waterfront',
    city: 'Toronto',
    province: 'ON',
    price: 2800,
    type: 'apartment',
    bedrooms: 2,
    bathrooms: 2,
    furnished: true,
    description: 'Premium waterfront living. Gym, pool, concierge.',
    url: 'https://example.com/listing-14',
    source: 'Other',
    utilities: 'extra',
    location: { lat: 43.6426, lng: -79.3871 }
  },

  // Budget options
  {
    title: 'Affordable room in North York',
    city: 'Toronto',
    province: 'ON',
    price: 650,
    type: 'room',
    bedrooms: 1,
    bathrooms: 1,
    furnished: false,
    description: 'Great value! Close to subway, grocery stores nearby.',
    url: 'https://example.com/listing-15',
    source: 'Manual',
    utilities: 'extra',
    tags: ['budget-friendly', 'near-transit'],
    location: { lat: 43.7615, lng: -79.4111 }
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing listings
    await Listing.deleteMany({});
    console.log('Cleared existing listings');

    // Insert sample listings
    const inserted = await Listing.insertMany(sampleListings);
    console.log(`✅ Inserted ${inserted.length} sample listings`);

    // Display summary
    const cityCounts = await Listing.aggregate([
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📊 Listings by city:');
    cityCounts.forEach(city => {
      console.log(`   ${city._id}: ${city.count} listings (avg $${Math.round(city.avgPrice)})`);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();