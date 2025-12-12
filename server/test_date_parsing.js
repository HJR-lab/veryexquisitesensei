// Test the date parsing logic
const testCases = [
  {
    orderDate: '2025-10-21T02:50:54Z',
    variantTitle: 'TUESDAYS 21 October –25 November (7:00pm-9:30pm)',
    expected: { start: '2025-10-21', end: '2025-11-25' }
  },
  {
    orderDate: '2025-10-29T12:10:05Z',
    variantTitle: '4 Weeks - WEDNESDAYS: 7:00pm–9:00pm',
    expected: { start: null, end: null } // No dates in this format
  },
  {
    orderDate: '2025-10-23T03:38:46Z',
    variantTitle: 'FRIDAYS 10 October –14 November (9:30am-12:00pm)',
    expected: { start: '2025-10-10', end: '2025-11-14' }
  }
];

function parseDates(orderDateStr, variantTitle) {
  const monthMap = {
    'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
    'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5,
    'july': 6, 'jul': 6, 'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
    'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
  };

  const orderCreatedAt = new Date(orderDateStr);
  const orderYear = orderCreatedAt.getFullYear();
  const orderMonth = orderCreatedAt.getMonth();

  const dateMatch = variantTitle.match(/(\d{1,2})\s+(\w+)(?:\s*[–-]\s*(\d{1,2})\s+(\w+))?/);

  if (!dateMatch) {
    return { start: null, end: null };
  }

  const startDay = parseInt(dateMatch[1]);
  const startMonthStr = dateMatch[2].toLowerCase();
  const startMonth = monthMap[startMonthStr];

  if (startMonth === undefined) {
    return { start: null, end: null };
  }

  // Use order year, or next year if class starts before order was placed
  let classYear = orderYear;
  // If class month is before order month, class is likely in the next year
  if (startMonth < orderMonth - 1) {
    classYear = orderYear + 1;
  }

  const startDate = new Date(classYear, startMonth, startDay);

  let endDate = null;
  // Check for end date
  if (dateMatch[3] && dateMatch[4]) {
    const endDay = parseInt(dateMatch[3]);
    const endMonthStr = dateMatch[4].toLowerCase();
    const endMonth = monthMap[endMonthStr];

    if (endMonth !== undefined) {
      endDate = new Date(classYear, endMonth, endDay);

      // Handle year wrap (if end month is before start month, add a year)
      if (endDate < startDate) {
        endDate.setFullYear(classYear + 1);
      }
    }
  } else {
    endDate = startDate;
  }

  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate ? endDate.toISOString().split('T')[0] : null
  };
}

console.log('Testing date parsing logic:\n');

testCases.forEach((test, i) => {
  const result = parseDates(test.orderDate, test.variantTitle);
  const passed = result.start === test.expected.start && result.end === test.expected.end;

  console.log(`Test ${i + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Order date: ${test.orderDate}`);
  console.log(`  Variant: ${test.variantTitle}`);
  console.log(`  Expected: ${test.expected.start} to ${test.expected.end}`);
  console.log(`  Got: ${result.start} to ${result.end}`);
  console.log();
});
