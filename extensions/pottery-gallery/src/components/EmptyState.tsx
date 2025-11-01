import React from 'react';
import {
  BlockStack,
  Text,
  Icon,
} from '@shopify/ui-extensions-react/customer-account';

export function EmptyState() {
  return (
    <BlockStack
      spacing="loose"
      inlineAlignment="center"
      padding="extraLoose"
    >
      <Text size="large" emphasis="bold">
        Welcome to Your Pottery Gallery
      </Text>
      <Text appearance="subdued" alignment="center">
        Your pottery journey begins here! As you complete pieces in your courses,
        they'll appear in this gallery. Each piece will showcase your progress,
        techniques, and the unique characteristics of your work.
      </Text>
      <Text appearance="subdued" alignment="center">
        Start creating to see your collection grow!
      </Text>
    </BlockStack>
  );
}
