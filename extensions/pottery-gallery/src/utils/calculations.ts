import { PotteryPiece, PotteryStats } from '../types/pottery';

export function calculateShrinkagePercentage(
  originalWeight: string,
  finalWeight: string
): number {
  const original = parseFloat(originalWeight);
  const final = parseFloat(finalWeight);

  if (isNaN(original) || isNaN(final) || original === 0) {
    return 0;
  }

  return Math.round(((original - final) / original) * 100);
}

export function parseWeight(weight: string): number {
  const parsed = parseFloat(weight);
  return isNaN(parsed) ? 0 : parsed;
}

export function calculateStats(pieces: PotteryPiece[]): PotteryStats {
  const totalPieces = pieces.length;

  // Calculate favorite clay type (most used)
  const clayTypeCounts: Record<string, number> = {};
  pieces.forEach(piece => {
    clayTypeCounts[piece.clay_type] = (clayTypeCounts[piece.clay_type] || 0) + 1;
  });

  let favoriteClayType = 'N/A';
  let maxCount = 0;
  Object.entries(clayTypeCounts).forEach(([clayType, count]) => {
    if (count > maxCount) {
      maxCount = count;
      favoriteClayType = clayType;
    }
  });

  // Calculate total clay used (sum of original weights)
  const totalClayUsed = pieces.reduce((sum, piece) => {
    return sum + parseWeight(piece.original_weight);
  }, 0);

  return {
    totalPieces,
    favoriteClayType,
    totalClayUsed: Math.round(totalClayUsed * 10) / 10, // Round to 1 decimal
  };
}

export function getUniqueClayTypes(pieces: PotteryPiece[]): string[] {
  const uniqueTypes = new Set<string>();
  pieces.forEach(piece => {
    if (piece.clay_type) {
      uniqueTypes.add(piece.clay_type);
    }
  });
  return Array.from(uniqueTypes).sort();
}

export function getUniqueTags(pieces: PotteryPiece[]): string[] {
  const uniqueTags = new Set<string>();
  pieces.forEach(piece => {
    piece.tags?.forEach(tag => uniqueTags.add(tag));
  });
  return Array.from(uniqueTags).sort();
}
