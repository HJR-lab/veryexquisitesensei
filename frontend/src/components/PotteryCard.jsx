import { useState } from 'react';
import '../styles/PotteryCard.css';

export default function PotteryCard({ piece, showArtist = false }) {
  const [imageError, setImageError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const formattedDate = piece.date_completed
    ? new Date(piece.date_completed).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Date not set';

  return (
    <>
      <div className="pottery-card" onClick={() => setIsExpanded(true)}>
        <div className="card-image">
          {piece.images && piece.images[0] && !imageError ? (
            <img
              src={piece.images[0]}
              alt={piece.title}
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="image-placeholder">
              <span>🏺</span>
            </div>
          )}
          {piece.featured && (
            <div className="featured-badge">Featured</div>
          )}
        </div>

        <div className="card-content">
          <h3 className="card-title">{piece.title}</h3>

          {showArtist && piece.artist && (
            <div className="card-artist">by {piece.artist}</div>
          )}

          {piece.clay_type && (
            <div className="card-detail">
              <span className="detail-label">Clay:</span>
              <span className="detail-value">{piece.clay_type}</span>
            </div>
          )}

          {piece.glaze && (
            <div className="card-detail">
              <span className="detail-label">Glaze:</span>
              <span className="detail-value">{piece.glaze}</span>
            </div>
          )}

          {piece.tags && piece.tags.length > 0 && (
            <div className="card-tags">
              {piece.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="card-date">{formattedDate}</div>
        </div>
      </div>

      {isExpanded && (
        <div className="modal-overlay" onClick={() => setIsExpanded(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setIsExpanded(false)}
            >
              ×
            </button>

            <div className="modal-body">
              <div className="modal-images">
                {piece.images && piece.images.length > 0 ? (
                  piece.images.map((img, index) => (
                    <img key={index} src={img} alt={`${piece.title} ${index + 1}`} />
                  ))
                ) : (
                  <div className="image-placeholder large">
                    <span>🏺</span>
                  </div>
                )}
              </div>

              <div className="modal-details">
                <h2>{piece.title}</h2>

                {piece.description && (
                  <div className="detail-section">
                    <h3>Description</h3>
                    <p>{piece.description}</p>
                  </div>
                )}

                <div className="detail-grid">
                  {piece.clay_type && (
                    <div className="detail-item">
                      <span className="label">Clay Type</span>
                      <span className="value">{piece.clay_type}</span>
                    </div>
                  )}

                  {piece.glaze && (
                    <div className="detail-item">
                      <span className="label">Glaze</span>
                      <span className="value">{piece.glaze}</span>
                    </div>
                  )}

                  {piece.firing_temp && (
                    <div className="detail-item">
                      <span className="label">Firing Temperature</span>
                      <span className="value">{piece.firing_temp}</span>
                    </div>
                  )}

                  {piece.dimensions && (
                    <div className="detail-item">
                      <span className="label">Dimensions</span>
                      <span className="value">{piece.dimensions}</span>
                    </div>
                  )}

                  <div className="detail-item">
                    <span className="label">Completed</span>
                    <span className="value">{formattedDate}</span>
                  </div>
                </div>

                {piece.student_notes && (
                  <div className="detail-section">
                    <h3>My Notes</h3>
                    <p>{piece.student_notes}</p>
                  </div>
                )}

                {piece.instructor_notes && (
                  <div className="detail-section instructor-notes">
                    <h3>Instructor Feedback</h3>
                    <p>{piece.instructor_notes}</p>
                  </div>
                )}

                {piece.tags && piece.tags.length > 0 && (
                  <div className="modal-tags">
                    {piece.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
