import React, { useState, useMemo, useEffect } from 'react';
import {
  reactExtension,
  BlockStack,
  Text,
  Divider,
  useApi,
  useExtensionApi,
} from '@shopify/ui-extensions-react/customer-account';
import { PotteryPiece, FilterState } from './types/pottery';
import { EmptyState } from './components/EmptyState';
import { StatsCard } from './components/StatsCard';
import { SearchAndFilters } from './components/SearchAndFilters';
import { GalleryGrid } from './components/GalleryGrid';
import { PieceDetailView } from './components/PieceDetailView';
import { calculateStats, getUniqueClayTypes, getUniqueTags } from './utils/calculations';
import { filterPieces } from './utils/filtering';

export default reactExtension('customer-account.page.render', () => <PotteryGallery />);

function PotteryGallery() {
  const { query } = useExtensionApi();
  const [potteryPieces, setPotteryPieces] = useState<PotteryPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPiece, setSelectedPiece] = useState<PotteryPiece | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedClayTypes: [],
    selectedTags: [],
  });

  // Load sample data for now
  // Note: Customer account extensions have limited metafield access in current API
  // This uses hardcoded sample data to demonstrate the gallery functionality
  useEffect(() => {
    console.log('Loading sample pottery data...');

    const sampleData: PotteryPiece[] = [
      {
        id: "piece_001",
        title: "Celadon Bowl",
        images: ["https://cdn.shopify.com/s/files/1/0000/0000/0000/files/bowl1.jpg"],
        date_completed: "2024-09-15",
        clay_type: "Stoneware",
        glazes: ["Celadon", "Iron Oxide Wash"],
        original_weight: "2.5 kg",
        final_weight: "2.1 kg",
        dimensions: {
          height: "12 cm",
          length: "25 cm",
          width: "25 cm"
        },
        notes: "First wheel-thrown bowl. Glaze came out beautifully.",
        is_public: true,
        tags: ["wheel-thrown", "functional", "beginner"]
      },
      {
        id: "piece_002",
        title: "Textured Vase",
        images: ["https://cdn.shopify.com/s/files/1/0000/0000/0000/files/vase1.jpg"],
        date_completed: "2024-09-22",
        clay_type: "Porcelain",
        glazes: ["Clear Gloss", "Cobalt Blue"],
        original_weight: "3.2 kg",
        final_weight: "2.8 kg",
        dimensions: {
          height: "35 cm",
          length: "15 cm",
          width: "15 cm"
        },
        notes: "Experimented with rope texture technique.",
        is_public: true,
        tags: ["wheel-thrown", "decorative", "intermediate"]
      },
      {
        id: "piece_003",
        title: "Sake Set",
        images: ["https://cdn.shopify.com/s/files/1/0000/0000/0000/files/sake1.jpg"],
        date_completed: "2024-10-01",
        clay_type: "Stoneware",
        glazes: ["Shino", "Black Tenmoku"],
        original_weight: "1.8 kg",
        final_weight: "1.5 kg",
        dimensions: {
          height: "18 cm",
          length: "20 cm",
          width: "12 cm"
        },
        notes: "Complete set with bottle and four cups.",
        is_public: true,
        tags: ["wheel-thrown", "functional", "set", "advanced"]
      }
    ];

    setPotteryPieces(sampleData);
    setLoading(false);
    console.log('Sample data loaded:', sampleData);
  }, []);

  // Calculate derived data
  const stats = useMemo(() => calculateStats(potteryPieces), [potteryPieces]);
  const availableClayTypes = useMemo(() => getUniqueClayTypes(potteryPieces), [potteryPieces]);
  const availableTags = useMemo(() => getUniqueTags(potteryPieces), [potteryPieces]);
  const filteredPieces = useMemo(
    () => filterPieces(potteryPieces, filters),
    [potteryPieces, filters]
  );

  // Show empty state if no pieces
  if (potteryPieces.length === 0) {
    return <EmptyState />;
  }

  // Show detail view if a piece is selected
  if (selectedPiece) {
    return (
      <PieceDetailView
        piece={selectedPiece}
        onBack={() => setSelectedPiece(null)}
      />
    );
  }

  // Show gallery view
  return (
    <BlockStack spacing="base">
      <Text size="extraLarge" emphasis="bold">
        My Pottery Gallery
      </Text>

      <StatsCard stats={stats} />

      <Divider />

      <SearchAndFilters
        filters={filters}
        onFiltersChange={setFilters}
        availableClayTypes={availableClayTypes}
        availableTags={availableTags}
      />

      <Divider />

      <GalleryGrid
        pieces={filteredPieces}
        onPieceClick={setSelectedPiece}
      />
    </BlockStack>
  );
}
