import React from 'react';
import {
  BlockStack,
  InlineLayout,
  View,
  Text,
} from '@shopify/ui-extensions-react/customer-account';
import { PotteryStats } from '../types/pottery';

interface StatsCardProps {
  stats: PotteryStats;
}

export function StatsCard({ stats }: StatsCardProps) {
  return (
    <View
      border="base"
      cornerRadius="base"
      padding="base"
    >
      <BlockStack spacing="base">
        <Text size="medium" emphasis="bold">
          Your Pottery Stats
        </Text>
        <InlineLayout
          spacing="base"
          columns={['fill', 'fill', 'fill']}
          blockAlignment="start"
        >
          <BlockStack spacing="tight">
            <Text size="large" emphasis="bold">
              {stats.totalPieces}
            </Text>
            <Text size="small" appearance="subdued">
              Pieces Created
            </Text>
          </BlockStack>
          <BlockStack spacing="tight">
            <Text size="large" emphasis="bold">
              {stats.favoriteClayType}
            </Text>
            <Text size="small" appearance="subdued">
              Favorite Clay
            </Text>
          </BlockStack>
          <BlockStack spacing="tight">
            <Text size="large" emphasis="bold">
              {stats.totalClayUsed} kg
            </Text>
            <Text size="small" appearance="subdued">
              Total Clay Used
            </Text>
          </BlockStack>
        </InlineLayout>
      </BlockStack>
    </View>
  );
}
