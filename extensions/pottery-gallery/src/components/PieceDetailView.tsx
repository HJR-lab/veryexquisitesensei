import React, { useState } from 'react';
import {
  BlockStack,
  View,
  Text,
  Image,
  Button,
  InlineLayout,
  Grid,
  Divider,
} from '@shopify/ui-extensions-react/customer-account';
import { PotteryPiece } from '../types/pottery';
import { calculateShrinkagePercentage } from '../utils/calculations';

interface PieceDetailViewProps {
  piece: PotteryPiece;
  onBack: () => void;
}

export function PieceDetailView({ piece, onBack }: PieceDetailViewProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handlePreviousImage = () => {
    setCurrentImageIndex(prev =>
      prev === 0 ? piece.images.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex(prev =>
      prev === piece.images.length - 1 ? 0 : prev + 1
    );
  };

  const shrinkage = calculateShrinkagePercentage(
    piece.original_weight,
    piece.final_weight
  );

  return (
    <BlockStack spacing="base">
      <Button onPress={onBack} kind="secondary">
        Back to Gallery
      </Button>

      {/* Image Gallery */}
      {piece.images.length > 0 && (
        <View>
          <BlockStack spacing="tight">
            <Image
              source={piece.images[currentImageIndex]}
              fit="cover"
              aspectRatio={1}
              cornerRadius="base"
            />
            {piece.images.length > 1 && (
              <InlineLayout
                spacing="tight"
                inlineAlignment="center"
                blockAlignment="center"
              >
                <Button onPress={handlePreviousImage} kind="secondary">
                  Previous
                </Button>
                <Text size="small" appearance="subdued">
                  {currentImageIndex + 1} / {piece.images.length}
                </Text>
                <Button onPress={handleNextImage} kind="secondary">
                  Next
                </Button>
              </InlineLayout>
            )}
          </BlockStack>
        </View>
      )}

      {/* Title and Date */}
      <BlockStack spacing="tight">
        <Text size="extraLarge" emphasis="bold">
          {piece.title}
        </Text>
        <Text appearance="subdued">
          Completed: {new Date(piece.date_completed).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </Text>
      </BlockStack>

      <Divider />

      {/* Clay Type */}
      <BlockStack spacing="tight">
        <Text size="small" emphasis="bold">
          Clay Type
        </Text>
        <Text>{piece.clay_type}</Text>
      </BlockStack>

      {/* Glazes */}
      {piece.glazes.length > 0 && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            Glazes
          </Text>
          <InlineLayout spacing="tight">
            {piece.glazes.map((glaze, index) => (
              <View
                key={index}
                border="base"
                cornerRadius="base"
                padding="tight"
              >
                <Text size="small">{glaze}</Text>
              </View>
            ))}
          </InlineLayout>
        </BlockStack>
      )}

      {/* Weight and Shrinkage */}
      <BlockStack spacing="tight">
        <Text size="small" emphasis="bold">
          Weight & Shrinkage
        </Text>
        <Grid columns={['fill', 'fill']} spacing="tight">
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Original Weight
            </Text>
            <Text>{piece.original_weight}</Text>
          </BlockStack>
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Final Weight
            </Text>
            <Text>{piece.final_weight}</Text>
          </BlockStack>
        </Grid>
        <Text appearance="subdued" size="small">
          Shrinkage: {shrinkage}%
        </Text>
      </BlockStack>

      {/* Dimensions */}
      <BlockStack spacing="tight">
        <Text size="small" emphasis="bold">
          Dimensions
        </Text>
        <Grid columns={['fill', 'fill', 'fill']} spacing="tight">
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Height
            </Text>
            <Text>{piece.dimensions.height}</Text>
          </BlockStack>
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Length
            </Text>
            <Text>{piece.dimensions.length}</Text>
          </BlockStack>
          <BlockStack spacing="extraTight">
            <Text size="small" appearance="subdued">
              Width
            </Text>
            <Text>{piece.dimensions.width}</Text>
          </BlockStack>
        </Grid>
      </BlockStack>

      {/* Notes */}
      {piece.notes && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            Notes
          </Text>
          <Text>{piece.notes}</Text>
        </BlockStack>
      )}

      {/* Tags */}
      {piece.tags.length > 0 && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            Tags
          </Text>
          <InlineLayout spacing="tight">
            {piece.tags.map((tag, index) => (
              <View
                key={index}
                border="base"
                cornerRadius="base"
                padding="tight"
              >
                <Text size="small">{tag}</Text>
              </View>
            ))}
          </InlineLayout>
        </BlockStack>
      )}
    </BlockStack>
  );
}
