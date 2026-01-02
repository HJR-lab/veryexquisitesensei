# Public Holiday Light Blue Highlighting - 2026

## Classes on Public Holidays (2026)
1. **WT2001NT_JL6.2** - Tuesday, Jan 27, 2026 - Chinese New Year
2. **HB_280126_LT** - Wednesday, Jan 28, 2026 - Chinese New Year (Day 2)

## Frontend Detection
```javascript
// Check if class is on a public holiday
const isPublicHoliday = classInstance.cancellation_reason?.includes('Public Holiday');

// Apply light blue background
className={isPublicHoliday ? 'public-holiday' : ''}
```

## CSS Styling
```css
.public-holiday {
  background-color: #E3F2FD;  /* Light blue */
}
```

## Database Field
- **Field**: `cancellation_reason`
- **Format**: `"Public Holiday: [Holiday Name]"`
- **Example**: `"Public Holiday: Chinese New Year"`
