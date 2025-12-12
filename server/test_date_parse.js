// Test the date parsing logic
const title = "TUESDAYS • 21 Oct –25 Nov • 7:00pm-9:30pm";

const dateRangeMatch = title.match(/(\d{1,2})\s+(\w{3})(?:\s*[–-]\s*(\d{1,2})\s+(\w{3}))?/);

console.log('Title:', title);
console.log('Match:', dateRangeMatch);

if (dateRangeMatch) {
  const currentYear = new Date().getFullYear();
  const monthMap = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };

  const startDay = parseInt(dateRangeMatch[1]);
  const startMonth = monthMap[dateRangeMatch[2].toLowerCase()];

  console.log('Start Day:', startDay);
  console.log('Start Month:', startMonth);

  const startDate = new Date(currentYear, startMonth, startDay);
  console.log('Start Date:', startDate.toISOString().split('T')[0]);

  if (dateRangeMatch[3] && dateRangeMatch[4]) {
    const endDay = parseInt(dateRangeMatch[3]);
    const endMonth = monthMap[dateRangeMatch[4].toLowerCase()];

    console.log('End Day:', endDay);
    console.log('End Month:', endMonth);

    let endDate = new Date(currentYear, endMonth, endDay);

    // Handle year wrap
    if (endDate < startDate) {
      endDate.setFullYear(currentYear + 1);
    }

    console.log('End Date:', endDate.toISOString().split('T')[0]);
  }
}
