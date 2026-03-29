import { useState, useEffect, useRef } from 'react';

import api from '../utils/api';

const TC       = '#C4622D';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const TC_LIGHT = '#F9EDE6';

const COLUMNS = [
  { key: 'display_name',              label: 'Course',          type: 'text',     width: '180px' },
  { key: 'number_of_weeks',           label: 'Weeks',           type: 'number',   width: '60px' },
  { key: 'max_capacity',              label: 'Max Pax',         type: 'number',   width: '70px' },
  { key: 'min_students_to_activate',  label: 'Min to Activate', type: 'number',   width: '70px' },
  { key: 'max_makeups',               label: 'Makeups',         type: 'number',   width: '70px' },
  { key: 'makeup_fee',                label: 'Makeup Fee',      type: 'currency', width: '80px' },
  { key: 'noshow_fee',                label: 'No-show Fee',     type: 'currency', width: '80px' },
  { key: 'reschedule_notice_hours',   label: 'Notice (hrs)',    type: 'number',   width: '70px' },
  { key: 'finished_pieces',           label: 'Pieces',          type: 'number',   width: '60px' },
  { key: 'clay_weight_limit_g',       label: 'Weight (g)',      type: 'number',   width: '80px' },
  { key: 'additional_piece_fee',      label: "Add'l Piece Fee", type: 'currency', width: '80px' },
];

function formatValue(value, col, courseKey) {
  if (value === null || value === undefined) return '—';

  // Weight shows dash for wheelthrowing courses
  if (col.key === 'clay_weight_limit_g') {
    if (value === null || value === undefined || (typeof courseKey === 'string' && courseKey.toLowerCase().startsWith('wt'))) {
      return '—';
    }
  }

  // Makeup fields show dash for handbuilding when 0
  if ((col.key === 'max_makeups' || col.key === 'makeup_fee' || col.key === 'noshow_fee') &&
      typeof courseKey === 'string' && courseKey.toLowerCase().startsWith('hb') &&
      (value === 0 || value === '0')) {
    return '—';
  }

  if (col.type === 'currency') {
    if (value === 0 || value === '0' || value === null) return '$0';
    return `$${Number(value)}`;
  }

  return value !== null && value !== undefined ? String(value) : '—';
}

export default function AdminCourseConfig() {
  const [configs, setConfigs]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editingCell, setEditingCell] = useState(null); // { key, column }
  const [editValue, setEditValue]   = useState('');
  const [saveStatus, setSaveStatus] = useState(null);   // 'saved' | 'failed' | null
  const inputRef = useRef(null);
  const statusTimerRef = useRef(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/admin/course-config');
      setConfigs(data || []);
    } catch (err) {
      console.error('Failed to fetch course config:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (courseKey, column, currentValue) => {
    // Strip currency prefix for editing
    let val = currentValue;
    if (column.type === 'currency' && typeof val === 'string') {
      val = val.replace(/^\$/, '');
    }
    if (val === '—' || val === null || val === undefined) val = '';
    setEditingCell({ key: courseKey, column: column.key });
    setEditValue(String(val ?? ''));
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const showStatus = (status) => {
    setSaveStatus(status);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setSaveStatus(null), 2500);
  };

  const saveEdit = async (courseKey, columnKey) => {
    const col = COLUMNS.find(c => c.key === columnKey);
    if (!col) { cancelEdit(); return; }

    let parsed = editValue;
    if (col.type === 'number') {
      parsed = editValue === '' ? null : Number(editValue);
    } else if (col.type === 'currency') {
      parsed = editValue === '' ? 0 : Number(editValue);
    }

    try {
      await api.put(`/admin/course-config/${courseKey}`, { [columnKey]: parsed });

      // Update local state
      setConfigs(prev =>
        prev.map(c => c.key === courseKey ? { ...c, [columnKey]: parsed } : c)
      );
      showStatus('saved');
    } catch (err) {
      console.error('Failed to save:', err);
      showStatus('failed');
    } finally {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleKeyDown = (e, courseKey, columnKey) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const isEditing = (courseKey, columnKey) =>
    editingCell && editingCell.key === courseKey && editingCell.column === columnKey;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF9', fontFamily: 'Atak, sans-serif' }}>
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 10px' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: INK, margin: 0 }}>
            Course Configuration
          </h1>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            color: saveStatus === 'saved' ? '#2E7D32' : saveStatus === 'failed' ? '#C0392B' : 'transparent',
            transition: 'color 0.2s',
          }}>
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'failed' ? 'Save failed' : 'Saved'}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: '13px', color: MUTED }}>
            Loading…
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                {COLUMNS.map(col => (
                  <col key={col.key} style={{ width: col.width }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${RULE}` }}>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      style={{
                        padding: '0 8px 8px 8px',
                        textAlign: 'left',
                        fontSize: '9px',
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color: MUTED,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map((course, rowIdx) => (
                  <tr
                    key={course.key}
                    style={{
                      borderBottom: `1px solid ${RULE}`,
                      backgroundColor: rowIdx % 2 === 1 ? '#F9F8F7' : '#FFFFFF',
                    }}
                  >
                    {COLUMNS.map(col => {
                      const editing = isEditing(course.key, col.key);
                      const rawVal = course[col.key];
                      const display = formatValue(rawVal, col, course.key);

                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: '0',
                            height: '36px',
                            verticalAlign: 'middle',
                            position: 'relative',
                          }}
                        >
                          {editing ? (
                            <input
                              ref={inputRef}
                              type={col.type === 'text' ? 'text' : 'number'}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(course.key, col.key)}
                              onKeyDown={e => handleKeyDown(e, course.key, col.key)}
                              style={{
                                width: '100%',
                                height: '36px',
                                padding: '0 8px',
                                fontSize: '12px',
                                fontFamily: 'Atak, sans-serif',
                                color: INK,
                                backgroundColor: TC_LIGHT,
                                border: `1px solid ${TC}`,
                                outline: 'none',
                                boxSizing: 'border-box',
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(course.key, col, rawVal)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                width: '100%',
                                height: '100%',
                                padding: '0 8px',
                                fontSize: '12px',
                                fontFamily: 'Atak, sans-serif',
                                color: display === '—' ? MUTED : INK,
                                fontWeight: col.key === 'display_name' ? 600 : 400,
                                background: 'none',
                                border: 'none',
                                cursor: 'text',
                                textAlign: 'left',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = TC_LIGHT; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              {display}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
