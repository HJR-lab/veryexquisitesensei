import { useState, useEffect } from 'react';
import api from '../utils/api';

const TC = '#C4622D';
const TC_LIGHT = '#F9EDE6';
const INK = '#282828';
const MUTED = '#888888';

export default function WheelPicker({ classInstanceId, bookingId, currentWheel, onSelect, locked }) {
  const [wheels, setWheels] = useState({});
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [pendingWheel, setPendingWheel] = useState(null);

  useEffect(() => {
    if (!classInstanceId) return;
    api.get(`/classes/${classInstanceId}/wheels`)
      .then(({ data }) => setWheels(data.wheels || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classInstanceId]);

  const handleSelect = (num) => {
    if (selecting || locked) return;
    if (wheels[num] && wheels[num].bookingId !== bookingId) return;
    // If clicking current pending, cancel
    if (pendingWheel === num) { setPendingWheel(null); return; }
    setPendingWheel(num);
  };

  const handleConfirm = async () => {
    if (!pendingWheel || selecting) return;
    setSelecting(pendingWheel);
    try {
      await api.post(`/classes/bookings/${bookingId}/wheel`, { wheelNumber: pendingWheel });
      const updated = { ...wheels };
      Object.keys(updated).forEach(k => {
        if (updated[k].bookingId === bookingId) delete updated[k];
      });
      updated[pendingWheel] = { bookingId, studentId: null, name: 'You' };
      setWheels(updated);
      if (onSelect) onSelect(pendingWheel);
    } catch (err) {
      if (err.response?.status === 409) {
        const { data } = await api.get(`/classes/${classInstanceId}/wheels`);
        setWheels(data.wheels || {});
      }
    }
    setPendingWheel(null);
    setSelecting(null);
  };

  if (loading) return null;

  const topRow = [6, 7, 8, 9, 10]; // top row (back of studio)
  const bottomRow = [1, 2, 3, 4, 5]; // bottom row (front of studio)

  const renderWheel = (num) => {
    const taken = wheels[num];
    const isMine = currentWheel === num || (taken && taken.bookingId === bookingId);
    const isTaken = taken && !isMine;
    const isSelecting = selecting === num;
    const isPending = pendingWheel === num;

    return (
      <button
        key={num}
        onClick={() => handleSelect(num)}
        disabled={locked || isTaken || isSelecting}
        style={{
          width: '36px', height: '36px',
          borderRadius: '50%',
          border: (isMine || isPending) ? `2px solid ${TC}` : `1px solid ${isTaken ? '#DDD' : '#CCC'}`,
          backgroundColor: (isMine || isPending) ? TC_LIGHT : isTaken ? '#F0F0F0' : '#FFF',
          color: (isMine || isPending) ? TC : isTaken ? '#BBB' : INK,
          fontSize: '11px', fontWeight: 700,
          cursor: locked ? 'default' : isTaken ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
          opacity: isSelecting ? 0.5 : (locked && !isMine) ? 0.4 : 1,
          position: 'relative',
        }}
        title={locked && isMine ? `Wheel ${num} (locked)` : isTaken ? taken.name : isMine ? 'Your wheel (click to deselect)' : `Wheel ${num}`}
      >
        {num}
      </button>
    );
  };

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
        {locked ? 'Your wheel' : 'Choose your wheel'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
        {/* Top row: 6-10 (back of studio) */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: MUTED, width: '30px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '4px' }}>Back</span>
          {topRow.map(renderWheel)}
        </div>
        {/* Bottom row: 1-5 (front of studio) */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <span style={{ fontSize: '8px', color: MUTED, width: '30px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '4px' }}>Front</span>
          {bottomRow.map(renderWheel)}
        </div>
      </div>
      {pendingWheel && !locked && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: INK, marginBottom: '6px' }}>
            Confirm <strong>Wheel #{pendingWheel}</strong>? This cannot be changed later.
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={handleConfirm}
              disabled={!!selecting}
              style={{
                fontSize: '10px', fontWeight: 700, padding: '4px 14px',
                backgroundColor: TC, color: '#FFF', border: 'none', cursor: 'pointer',
                opacity: selecting ? 0.5 : 1,
              }}
            >
              {selecting ? 'Saving…' : 'Confirm'}
            </button>
            <button
              onClick={() => setPendingWheel(null)}
              style={{
                fontSize: '10px', fontWeight: 700, padding: '4px 14px',
                backgroundColor: 'transparent', color: MUTED, border: `1px solid ${MUTED}`, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {!pendingWheel && currentWheel && (
        <div style={{ fontSize: '10px', color: TC, fontWeight: 600, textAlign: 'center', marginTop: '6px' }}>
          Wheel #{currentWheel}{locked ? ' (locked)' : ''}
        </div>
      )}
    </div>
  );
}
