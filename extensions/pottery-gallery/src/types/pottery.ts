export interface PotteryPiece {
  id: string;
  title: string;
  images: string[];
  date_completed: string;
  clay_type: string;
  glazes: string[];
  original_weight: string;
  final_weight: string;
  dimensions: {
    height: string;
    length: string;
    width: string;
  };
  notes: string;
  is_public: boolean;
  tags: string[];
}

export interface PotteryStats {
  totalPieces: number;
  favoriteClayType: string;
  totalClayUsed: number;
}

export interface FilterState {
  searchQuery: string;
  selectedClayTypes: string[];
  selectedTags: string[];
}
