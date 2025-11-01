const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function addDummyData() {
  console.log('🗑️  Clearing existing data...\n');

  // Delete existing class instances
  const { error: deleteClassError } = await supabase
    .from('class_instances')
    .delete()
    .neq('id', 0); // Delete all rows

  if (deleteClassError) {
    console.log('⚠️  Warning: Could not clear existing classes:', deleteClassError.message);
  } else {
    console.log('✓ Cleared existing class instances');
  }

  // Delete existing pottery pieces
  const { error: deletePieceError } = await supabase
    .from('pottery_pieces')
    .delete()
    .neq('id', 0); // Delete all rows

  if (deletePieceError) {
    console.log('⚠️  Warning: Could not clear existing pottery pieces:', deletePieceError.message);
  } else {
    console.log('✓ Cleared existing pottery pieces');
  }

  console.log('\n📝 Adding fresh dummy data...\n');
  const now = new Date().toISOString();

  // Add realistic VES class instances based on actual VES.sg offerings from 2023
  // Real VES instructors: Belle Lam, Dillon Lin, Joyce Lim
  // Real VES courses: Wheelthrowing Beginner (6 weeks, $480), Handbuilding (4-8 weeks, $360)
  //
  // ACTUAL VES SCHEDULES from ves.sg (2023 dates, using same pattern for 2025):
  // - TUESDAYS • 21 Oct –25 Nov • 7:00pm-9:30pm (Oct 21, 28, Nov 4, 11, 18, 25)
  // - THURSDAYS • 16 Oct –20 Nov • 7:00pm-9:30pm (Oct 16, 23, 30, Nov 6, 13, 20)
  // - FRIDAYS • 10 Oct –14 Nov • 9:30am-12:00pm (Oct 10, 17, 24, 31, Nov 7, 14)
  // - SATURDAYS • 4 Oct –8 Nov • 9:30am-12:00pm (Oct 4, 11, 18, 25, Nov 1, 8)
  // - SATURDAYS • 20 Sept –25 Oct • 1:00pm-3:30pm (Sept 20, 27, Oct 4, 11, 18, 25)
  // - SUNDAYS • 12 Oct –16 Nov • 9:30am-12:00pm (Oct 12, 19, 26, Nov 2, 9, 16)

  // Helper: Create date string in Singapore timezone (GMT+8)
  // Store as ISO string but at Singapore midnight (not UTC midnight)
  const createDate = (year, month, day) => {
    // Create date at midnight Singapore time
    const singaporeDate = new Date(year, month - 1, day, 8, 0, 0); // 8 AM UTC = midnight Singapore
    return singaporeDate.toISOString();
  };

  const classesRaw = [];

  // Course 1: TUESDAYS 7:00pm-9:30pm (Oct 21 - Nov 25, 2025) - Joyce Lim
  const tuesdayDates = [
    { week: 1, date: createDate(2025, 10, 21) },
    { week: 2, date: createDate(2025, 10, 28) },
    { week: 3, date: createDate(2025, 11, 4) },
    { week: 4, date: createDate(2025, 11, 11) },
    { week: 5, date: createDate(2025, 11, 18) },
    { week: 6, date: createDate(2025, 11, 25) },
  ];
  tuesdayDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Joyce Lim',
      class_date: date,
      start_time: '7:00 PM',
      end_time: '9:30 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio A',
    });
  });

  // Course 2: THURSDAYS 7:00pm-9:30pm (Oct 16 - Nov 20, 2025) - Joyce Lim
  const thursdayDates = [
    { week: 1, date: createDate(2025, 10, 16) },
    { week: 2, date: createDate(2025, 10, 23) },
    { week: 3, date: createDate(2025, 10, 30) },
    { week: 4, date: createDate(2025, 11, 6) },
    { week: 5, date: createDate(2025, 11, 13) },
    { week: 6, date: createDate(2025, 11, 20) },
  ];
  thursdayDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Joyce Lim',
      class_date: date,
      start_time: '7:00 PM',
      end_time: '9:30 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio C', // Changed from Studio B to avoid conflict with Wednesday handbuilding
    });
  });

  // Course 3: FRIDAYS 9:30am-12:00pm (Oct 10 - Nov 14, 2025) - Joyce Lim
  const fridayDates = [
    { week: 1, date: createDate(2025, 10, 10) },
    { week: 2, date: createDate(2025, 10, 17) },
    { week: 3, date: createDate(2025, 10, 24) },
    { week: 4, date: createDate(2025, 10, 31) },
    { week: 5, date: createDate(2025, 11, 7) },
    { week: 6, date: createDate(2025, 11, 14) },
  ];
  fridayDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Joyce Lim',
      class_date: date,
      start_time: '9:30 AM',
      end_time: '12:00 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio A',
    });
  });

  // Course 4: SATURDAYS 9:30am-12:00pm (Oct 4 - Nov 8, 2025) - Dillon Lin
  const saturdayMorningDates = [
    { week: 1, date: createDate(2025, 10, 4) },
    { week: 2, date: createDate(2025, 10, 11) },
    { week: 3, date: createDate(2025, 10, 18) },
    { week: 4, date: createDate(2025, 10, 25) },
    { week: 5, date: createDate(2025, 11, 1) },
    { week: 6, date: createDate(2025, 11, 8) },
  ];
  saturdayMorningDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Dillon Lin',
      class_date: date,
      start_time: '9:30 AM',
      end_time: '12:00 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio C',
    });
  });

  // Course 5: SATURDAYS 1:00pm-3:30pm (Sept 20 - Oct 25, 2025) - Dillon Lin (Wheelthrowing)
  const saturdayAfternoonDates = [
    { week: 1, date: createDate(2025, 9, 20) },
    { week: 2, date: createDate(2025, 9, 27) },
    { week: 3, date: createDate(2025, 10, 4) },
    { week: 4, date: createDate(2025, 10, 11) },
    { week: 5, date: createDate(2025, 10, 18) },
    { week: 6, date: createDate(2025, 10, 25) },
  ];
  saturdayAfternoonDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Dillon Lin',
      class_date: date,
      start_time: '1:00 PM',
      end_time: '3:30 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio B',
    });
  });

  // Course 6: SUNDAYS 9:30am-12:00pm (Oct 12 - Nov 16, 2025) - Dillon Lin
  const sundayDates = [
    { week: 1, date: createDate(2025, 10, 12) },
    { week: 2, date: createDate(2025, 10, 19) },
    { week: 3, date: createDate(2025, 10, 26) },
    { week: 4, date: createDate(2025, 11, 2) },
    { week: 5, date: createDate(2025, 11, 9) },
    { week: 6, date: createDate(2025, 11, 16) },
  ];
  sundayDates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 6 ? 'Wheelthrowing Beginner (Week 6/6) - Glazing' : `Wheelthrowing Beginner (Week ${week}/6)`,
      instructor: 'Dillon Lin',
      class_date: date,
      start_time: '9:30 AM',
      end_time: '12:00 PM',
      max_capacity: week === 6 ? 12 : 10, // Glazing classes can fit 12
      current_enrollment: 8, // 8 enrolled (sold out for new courses, 2-4 spots for makeup)
      room: 'Studio A',
    });
  });

  // Handbuilding Course: WEDNESDAYS 7:00pm-9:00pm (4-week course, repeating) - Lynette Ting
  // Starting October 9, 2025 (4 weeks)
  const handbuilding1Dates = [
    { week: 1, date: createDate(2025, 10, 9) },
    { week: 2, date: createDate(2025, 10, 16) },
    { week: 3, date: createDate(2025, 10, 23) },
    { week: 4, date: createDate(2025, 10, 30) },
  ];
  handbuilding1Dates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 4 ? 'Handbuilding (Week 4/4) - Glazing' : `Handbuilding (Week ${week}/4)`,
      instructor: 'Lynette Ting',
      class_date: date,
      start_time: '7:00 PM',
      end_time: '9:00 PM',
      max_capacity: week === 4 ? 10 : 8, // Glazing class can fit 10
      current_enrollment: 6, // Some availability
      room: 'Studio B',
    });
  });

  // Handbuilding Course 2: WEDNESDAYS 7:00pm-9:00pm (4-week course, next session) - Lynette Ting
  // Starting November 6, 2025 (4 weeks)
  const handbuilding2Dates = [
    { week: 1, date: createDate(2025, 11, 6) },
    { week: 2, date: createDate(2025, 11, 13) },
    { week: 3, date: createDate(2025, 11, 20) },
    { week: 4, date: createDate(2025, 11, 27) },
  ];
  handbuilding2Dates.forEach(({ week, date }) => {
    classesRaw.push({
      class_type: week === 4 ? 'Handbuilding (Week 4/4) - Glazing' : `Handbuilding (Week ${week}/4)`,
      instructor: 'Lynette Ting',
      class_date: date,
      start_time: '7:00 PM',
      end_time: '9:00 PM',
      max_capacity: week === 4 ? 10 : 8, // Glazing class can fit 10
      current_enrollment: 4, // Some availability
      room: 'Studio B',
    });
  });

  const classes = classesRaw.map(c => ({ ...c, status: 'active', updated_at: now }));

  const { data: classData, error: classError } = await supabase
    .from('class_instances')
    .insert(classes)
    .select();

  if (classError) {
    console.log('❌ Error adding classes:', classError.message);
  } else {
    console.log('✓ Added', classData.length, 'class instances');
  }

  // Add dummy pottery pieces
  const piecesRaw = [
    {
      customer_id: 1,
      title: 'Midnight Blue Vase',
      notes: 'A tall elegant vase with deep blue glaze, perfect for displaying flowers',
      clay_type: 'Stoneware',
      glazes: ['Midnight Blue'],
      date_completed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: true,
      tags: ['vase', 'wheel-thrown'],
      images: ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800']
    },
    {
      customer_id: 1,
      title: 'Rustic Tea Bowl',
      notes: 'Hand-built tea bowl with natural ash glaze finish',
      clay_type: 'Porcelain',
      glazes: ['Natural Ash'],
      date_completed: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: false,
      tags: ['bowl', 'hand-built', 'functional'],
      images: ['https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800']
    },
    {
      customer_id: 1,
      title: 'Terracotta Planter Set',
      notes: 'Set of three planters with drainage holes, ideal for succulents',
      clay_type: 'Terracotta',
      glazes: [],
      date_completed: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: true,
      tags: ['planter', 'functional', 'set'],
      images: ['https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=800']
    },
    {
      customer_id: 1,
      title: 'Celadon Serving Plate',
      notes: 'Large serving plate with traditional crackle celadon glaze',
      clay_type: 'Porcelain',
      glazes: ['Celadon'],
      date_completed: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: false,
      tags: ['plate', 'wheel-thrown', 'functional'],
      images: ['https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800']
    },
    {
      customer_id: 1,
      title: 'Abstract Sculpture',
      notes: 'Contemporary abstract form inspired by ocean waves',
      clay_type: 'Stoneware',
      glazes: ['Matte White'],
      date_completed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: true,
      tags: ['sculpture', 'art', 'contemporary'],
      images: ['https://images.unsplash.com/photo-1615963244664-5b845b2025ee?w=800']
    },
    {
      customer_id: 1,
      title: 'Coffee Mug Collection',
      notes: 'Set of four matching mugs with hand-carved geometric details',
      clay_type: 'Stoneware',
      glazes: ['Speckled Brown'],
      date_completed: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: false,
      tags: ['mug', 'functional', 'wheel-thrown', 'set'],
      images: ['https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800']
    },
    {
      customer_id: 1,
      title: 'Textured Decorative Bowl',
      notes: 'Large decorative bowl with impressed botanical patterns',
      clay_type: 'Stoneware',
      glazes: ['Iron Red'],
      date_completed: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: false,
      tags: ['bowl', 'decorative', 'hand-built'],
      images: ['https://images.unsplash.com/photo-1493106819501-66d381c466f1?w=800']
    },
    {
      customer_id: 1,
      title: 'Sake Set',
      notes: 'Traditional sake set with bottle and four cups',
      clay_type: 'Porcelain',
      glazes: ['Shino'],
      date_completed: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      is_public: true,
      featured: false,
      tags: ['set', 'functional', 'traditional'],
      images: ['https://images.unsplash.com/photo-1580870069867-74c57ee60d19?w=800']
    }
  ];

  const pieces = piecesRaw.map(p => ({ ...p, updated_at: now }));

  const { data: pieceData, error: pieceError } = await supabase
    .from('pottery_pieces')
    .insert(pieces)
    .select();

  if (pieceError) {
    console.log('❌ Error adding pottery pieces:', pieceError.message);
  } else {
    console.log('✓ Added', pieceData.length, 'pottery pieces');
  }

  console.log('\n✅ Dummy data added successfully!');
  console.log('\nYou can now view:');
  console.log('📅 Classes at http://localhost:5174/classes');
  console.log('🏺 Gallery at http://localhost:5174/');
}

addDummyData().catch(console.error);
