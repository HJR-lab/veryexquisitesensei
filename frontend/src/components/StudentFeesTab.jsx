// ─── Design tokens ───────────────────────────────────────────────────────────
const TC       = '#C4622D';
const TC_DARK  = '#9E4A1E';
const INK      = '#282828';
const MUTED    = '#888888';
const RULE     = 'rgba(40,40,40,0.09)';
const ALT      = '#F5F3F0';

const FEE_STYLE = {
  paid:    { bg: '#F9EDE6',  text: TC_DARK  },
  pending: { bg: '#FFF7E6', text: '#9E6200' },
  waived:  { bg: ALT,       text: MUTED    },
};

export default function StudentFeesTab({
  fees,
  totalFeePaid,
  totalFeePending,
  updatingFeeId,
  updateFeeStatus,
  feeDeleteConfirmId,
  setFeeDeleteConfirmId,
  deletingFeeId,
  handleDeleteFee,
  formatDate,
}) {
  return (
    <div style={{ border: `1px solid ${RULE}`, backgroundColor: '#FFFFFF' }}>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '1px', backgroundColor: RULE, borderBottom: `1px solid ${RULE}` }}>
        {[
          { label: 'Total Paid',    value: `$${totalFeePaid.toFixed(2)}`    },
          { label: 'Outstanding',   value: `$${totalFeePending.toFixed(2)}` },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '16px 20px', backgroundColor: '#FFFFFF' }}>
            <div style={{ fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: '560px' }}>

          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 200px', padding: '9px 16px', backgroundColor: ALT, borderBottom: `1px solid ${RULE}` }}>
            {['Description', 'Amount', 'Date', 'Status', ''].map((h, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED }}>{h}</span>
            ))}
          </div>

          {fees.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: '13px' }}>No fees found.</div>
          ) : fees.map((fee, i) => {
            const feeStyle = FEE_STYLE[fee.payment_status] || { bg: ALT, text: MUTED };
            const isUpdating = updatingFeeId === fee.id;
            const isDeleting = deletingFeeId === fee.id;
            const desc = fee.notes || fee.fee_type || '—';
            return (
              <div key={fee.id} style={{ borderBottom: i < fees.length - 1 ? `1px solid ${RULE}` : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 80px 200px', padding: '12px 16px', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px' }}>{desc}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>${parseFloat(fee.amount || 0).toFixed(2)}</span>
                  <span style={{ fontSize: '12px', color: MUTED }}>{formatDate(fee.fee_date || fee.created_at)}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                    padding: '3px 8px', display: 'inline-block',
                    backgroundColor: feeStyle.bg, color: feeStyle.text,
                  }}>{fee.payment_status}</span>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {fee.payment_status === 'pending' && (
                      <button
                        onClick={() => updateFeeStatus(fee.id, 'paid')}
                        disabled={isUpdating}
                        style={{ padding: '4px 10px', border: `1px solid ${TC}`, background: 'none', cursor: isUpdating ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: TC, opacity: isUpdating ? 0.7 : 1 }}
                      >{isUpdating ? '…' : 'Mark Paid'}</button>
                    )}
                    {fee.payment_status === 'pending' && (
                      <button
                        onClick={() => updateFeeStatus(fee.id, 'waived')}
                        disabled={isUpdating}
                        style={{ padding: '4px 10px', border: `1px solid ${RULE}`, background: 'none', cursor: isUpdating ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED, opacity: isUpdating ? 0.7 : 1 }}
                      >Waive</button>
                    )}
                    <button
                      onClick={() => setFeeDeleteConfirmId(fee.id)}
                      style={{ padding: '4px 10px', border: '1px solid #F0C0C0', background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#C03030' }}
                    >Delete</button>
                  </div>
                </div>

                {/* Inline fee delete confirm */}
                {feeDeleteConfirmId === fee.id && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', backgroundColor: '#FFF5F5', borderTop: '1px solid #F0C0C0' }}>
                    <span style={{ fontSize: '12px', color: '#C03030' }}>Delete this fee record? This cannot be undone.</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setFeeDeleteConfirmId(null)}
                        style={{ padding: '5px 12px', border: `1px solid ${RULE}`, background: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: MUTED }}
                      >Cancel</button>
                      <button
                        onClick={() => handleDeleteFee(fee.id)}
                        disabled={isDeleting}
                        style={{ padding: '5px 12px', border: 'none', backgroundColor: '#C03030', cursor: isDeleting ? 'not-allowed' : 'pointer', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: '#FFF', opacity: isDeleting ? 0.7 : 1 }}
                      >{isDeleting ? 'Deleting…' : 'Confirm Delete'}</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
