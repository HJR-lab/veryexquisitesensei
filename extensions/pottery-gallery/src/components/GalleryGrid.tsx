import React from 'react';
import {
  Grid,
  View,
  Image,
  BlockStack,
  Text,
  Pressable,
  InlineLayout,
} from '@shopify/ui-extensions-react/customer-account';
import { PotteryPiece } from '../types/pottery';

interface GalleryGridProps {
  pieces: PotteryPiece[];
  onPieceClick: (piece: PotteryPiece) => void;
}

export function GalleryGrid({ pieces, onPieceClick }: GalleryGridProps) {
  if (pieces.length === 0) {
    return (
      <View padding="base">
        <Text appearance="subdued" alignment="center">
          No pieces match your current filters. Try adjusting your search.
        </Text>
      </View>
    );
  }

  return (
    <Grid
      columns={['fill', 'fill', 'fill']}
      spacing="base"
    >
      {pieces.map(piece => (
        <Pressable key={piece.id} onPress={() => onPieceClick(piece)}>
          <View
            border="base"
            cornerRadius="base"
            padding="none"
          >
            <BlockStack spacing="none">
              {piece.images.length > 0 ? (
                <Image
                  source={piece.images[0]}
                  fit="cover"
                  aspectRatio={1}
                  cornerRadius="base"
                />
              ) : (
                <View
                  padding="extraLoose"
                  cornerRadius="base"
                >
                  <Text alignment="center" appearance="subdued">
                    No image
                  </Text>
                </View>
              )}
              <View padding="base">
                <BlockStack spacing="tight">
                  <Text emphasis="bold" size="small">
                    {piece.title}
                  </Text>
                  <Text appearance="subdued" size="extraSmall">
                    {piece.clay_type}
                  </Text>
                  <Text appearance="subdued" size="extraSmall">
                    {new Date(piece.date_completed).toLocaleDateString()}
                  </Text>
                  {piece.tags.length > 0 && (
                    <InlineLayout spacing="extraTight">
                      {piece.tags.slice(0, 2).map(tag => (
                        <View
                          key={tag}
                          padding="extraTight"
                          cornerRadius="base"
                        >
                          <Text size="extraSmall" appearance="subdued">
                            {tag}
                          </Text>
                        </View>
                      ))}
                      {piece.tags.length > 2 && (
                        <Text size="extraSmall" appearance="subdued">
                          +{piece.tags.length - 2}
                        </Text>
                      )}
                    </InlineLayout>
                  )}
                </BlockStack>
              </View>
            </BlockStack>
          </View>
        </Pressable>
      ))}
    </Grid>
  );
}
