const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const createDate = (year, month, day) => {
  const singaporeDate = new Date(year, month - 1, day, 8, 0, 0);
  return singaporeDate.toISOString();
};

const classesRaw = [];

// Course 1: TUESDAYS 7:00pm-9:30pm - Studio A
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
    class_date: date,
    start_time: '7:00 PM',
    room: 'Studio A',
  });
});

// Course 3: SATURDAYS 1:00pm-3:30pm - Studio B
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
    class_date: date,
    start_time: '1:00 PM',
    room: 'Studio B',
  });
});

// Handbuilding 1: WEDNESDAYS 7:00pm-9:00pm - Studio B
const handbuilding1Dates = [
  { week: 1, date: createDate(2025, 10, 9) },
  { week: 2, date: createDate(2025, 10, 16) },
  { week: 3, date: createDate(2025, 10, 23) },
  { week: 4, date: createDate(2025, 10, 30) },
];
handbuilding1Dates.forEach(({ week, date }) => {
  classesRaw.push({
    class_date: date,
    start_time: '7:00 PM',
    room: 'Studio B',
  });
});

// Find duplicates
const keys = classesRaw.map(c => `${c.class_date}|${c.start_time}|${c.room}`);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

console.log('Total classes:', classesRaw.length);
console.log('Unique keys:', new Set(keys).size);
console.log('Duplicates found:', duplicates.length);

if (duplicates.length > 0) {
  console.log('\nDuplicate entries:');
  duplicates.forEach(dup => {
    const [date, time, room] = dup.split('|');
    console.log(`  Date: ${new Date(date).toLocaleDateString()}, Time: ${time}, Room: ${room}`);
  });
}
