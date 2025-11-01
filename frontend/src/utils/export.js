/**
 * Export pottery pieces as JSON file
 */
export function exportAsJSON(pieces, filename = 'pottery-journal.json') {
  const dataStr = JSON.stringify(pieces, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export pottery pieces as CSV file
 */
export function exportAsCSV(pieces, filename = 'pottery-journal.csv') {
  // Define CSV headers
  const headers = [
    'Title',
    'Date Completed',
    'Clay Type',
    'Glazes',
    'Height (cm)',
    'Width (cm)',
    'Length (cm)',
    'Tags',
    'Notes',
    'Is Public'
  ];

  // Convert pieces to CSV rows
  const rows = pieces.map(piece => [
    piece.title || '',
    piece.date_completed || '',
    piece.clay_type || '',
    (piece.glazes || []).join('; '),
    piece.height || '',
    piece.width || '',
    piece.length || '',
    (piece.tags || []).join('; '),
    (piece.description || '').replace(/"/g, '""'), // Escape quotes
    piece.is_public ? 'Yes' : 'No'
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Create and download file
  const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate simple HTML report for printing as PDF
 */
export function exportAsPDFReport(pieces, userInfo, filename = 'pottery-journal.pdf') {
  const reportHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>VES Pottery Journal</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 40px;
      color: #121212;
      background-color: #fff;
    }

    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #121212;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 400;
      margin-bottom: 10px;
    }

    .header p {
      color: #666;
      font-size: 14px;
    }

    .piece {
      page-break-inside: avoid;
      margin-bottom: 40px;
      padding: 20px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .piece-header {
      margin-bottom: 15px;
    }

    .piece-title {
      font-size: 20px;
      font-weight: 500;
      color: #121212;
      margin-bottom: 5px;
    }

    .piece-date {
      color: #666;
      font-size: 14px;
    }

    .piece-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 15px;
    }

    .detail-item {
      font-size: 14px;
    }

    .detail-label {
      color: #666;
      font-weight: 500;
      margin-right: 5px;
    }

    .detail-value {
      color: #121212;
    }

    .piece-notes {
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #e0e0e0;
    }

    .notes-label {
      color: #666;
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 8px;
      display: block;
    }

    .notes-content {
      color: #121212;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .piece-tags {
      margin-top: 15px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag {
      padding: 4px 12px;
      background-color: #f3f3f3;
      border-radius: 12px;
      font-size: 12px;
      color: #666;
    }

    .footer {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 12px;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }

    @media print {
      body {
        padding: 20px;
      }

      .piece {
        page-break-after: auto;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>VES Pottery Journal</h1>
    <p>${userInfo?.firstName || 'Student'}'s Collection - ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p>${pieces.length} piece${pieces.length !== 1 ? 's' : ''}</p>
  </div>

  ${pieces.map(piece => `
    <div class="piece">
      <div class="piece-header">
        <h2 class="piece-title">${escapeHTML(piece.title)}</h2>
        <p class="piece-date">Completed: ${formatDate(piece.date_completed)}</p>
      </div>

      <div class="piece-details">
        ${piece.clay_type ? `
          <div class="detail-item">
            <span class="detail-label">Clay Type:</span>
            <span class="detail-value">${escapeHTML(piece.clay_type)}</span>
          </div>
        ` : ''}

        ${piece.glazes && piece.glazes.length > 0 ? `
          <div class="detail-item">
            <span class="detail-label">Glazes:</span>
            <span class="detail-value">${piece.glazes.map(g => escapeHTML(g)).join(', ')}</span>
          </div>
        ` : ''}

        ${piece.height ? `
          <div class="detail-item">
            <span class="detail-label">Height:</span>
            <span class="detail-value">${piece.height} cm</span>
          </div>
        ` : ''}

        ${piece.width ? `
          <div class="detail-item">
            <span class="detail-label">Width:</span>
            <span class="detail-value">${piece.width} cm</span>
          </div>
        ` : ''}

        ${piece.length ? `
          <div class="detail-item">
            <span class="detail-label">Length:</span>
            <span class="detail-value">${piece.length} cm</span>
          </div>
        ` : ''}
      </div>

      ${piece.description ? `
        <div class="piece-notes">
          <span class="notes-label">Notes:</span>
          <div class="notes-content">${escapeHTML(piece.description)}</div>
        </div>
      ` : ''}

      ${piece.tags && piece.tags.length > 0 ? `
        <div class="piece-tags">
          ${piece.tags.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('')}

  <div class="footer">
    <p>VES Pottery Studio - Generated on ${new Date().toLocaleString('en-US')}</p>
  </div>
</body>
</html>
  `;

  // Open print dialog in a new window
  const printWindow = window.open('', '_blank');
  printWindow.document.write(reportHTML);
  printWindow.document.close();

  // Wait for content to load, then trigger print
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

// Helper functions
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'Date not set';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
