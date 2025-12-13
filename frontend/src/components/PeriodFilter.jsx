import { useState, useEffect } from 'react';

export default function PeriodFilter({ onPeriodChange, initialPeriod = null }) {
  const [filterType, setFilterType] = useState('all');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Generate year options (current year and next 2 years)
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  // Calculate date range based on filter type
  const calculatePeriod = () => {
    let startDate, endDate;

    switch (filterType) {
      case 'year':
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear}-12-31`;
        break;

      case 'month':
        const year = selectedYear;
        const month = selectedMonth.toString().padStart(2, '0');
        const lastDay = new Date(year, selectedMonth, 0).getDate();
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-${lastDay}`;
        break;

      case 'custom':
        startDate = customStartDate;
        endDate = customEndDate;
        break;

      case 'all':
      default:
        startDate = null;
        endDate = null;
        break;
    }

    return { startDate, endDate, type: filterType };
  };

  // Notify parent when period changes
  useEffect(() => {
    const period = calculatePeriod();
    onPeriodChange(period);
  }, [filterType, selectedYear, selectedMonth, customStartDate, customEndDate]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">Period:</label>

        {/* Filter Type Selector */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Time</option>
          <option value="year">Yearly</option>
          <option value="month">Monthly</option>
          <option value="custom">Custom Range</option>
        </select>

        {/* Year Selector */}
        {(filterType === 'year' || filterType === 'month') && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        )}

        {/* Month Selector */}
        {filterType === 'month' && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {months.map(month => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        )}

        {/* Custom Date Range */}
        {filterType === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Period Display */}
        {filterType !== 'all' && (
          <div className="ml-auto text-sm text-gray-600 bg-blue-50 px-3 py-1.5 rounded-lg">
            {filterType === 'year' && `Year: ${selectedYear}`}
            {filterType === 'month' && `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`}
            {filterType === 'custom' && customStartDate && customEndDate &&
              `${customStartDate} to ${customEndDate}`
            }
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-500">Quick:</span>
        <button
          onClick={() => {
            setFilterType('year');
            setSelectedYear(2025);
          }}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          2025
        </button>
        <button
          onClick={() => {
            setFilterType('year');
            setSelectedYear(2026);
          }}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          2026
        </button>
        <button
          onClick={() => {
            setFilterType('month');
            setSelectedYear(new Date().getFullYear());
            setSelectedMonth(new Date().getMonth() + 1);
          }}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          This Month
        </button>
        <button
          onClick={() => setFilterType('all')}
          className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
        >
          All Time
        </button>
      </div>
    </div>
  );
}
