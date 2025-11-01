import { PotteryPiece, FilterState } from '../types/pottery';

export function filterPieces(
  pieces: PotteryPiece[],
  filters: FilterState
): PotteryPiece[] {
  return pieces.filter(piece => {
    // Search query filter (searches title, clay type, glazes, and tags)
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesTitle = piece.title.toLowerCase().includes(query);
      const matchesClayType = piece.clay_type.toLowerCase().includes(query);
      const matchesGlazes = piece.glazes.some(glaze =>
        glaze.toLowerCase().includes(query)
      );
      const matchesTags = piece.tags.some(tag =>
        tag.toLowerCase().includes(query)
      );

      if (!matchesTitle && !matchesClayType && !matchesGlazes && !matchesTags) {
        return false;
      }
    }

    // Clay type filter
    if (filters.selectedClayTypes.length > 0) {
      if (!filters.selectedClayTypes.includes(piece.clay_type)) {
        return false;
      }
    }

    // Tag filter
    if (filters.selectedTags.length > 0) {
      const hasMatchingTag = filters.selectedTags.some(tag =>
        piece.tags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  });
}
