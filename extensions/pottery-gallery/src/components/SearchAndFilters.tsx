import React from 'react';
import {
  BlockStack,
  TextField,
  InlineLayout,
  Button,
  Text,
} from '@shopify/ui-extensions-react/customer-account';
import { FilterState } from '../types/pottery';

interface SearchAndFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableClayTypes: string[];
  availableTags: string[];
}

export function SearchAndFilters({
  filters,
  onFiltersChange,
  availableClayTypes,
  availableTags,
}: SearchAndFiltersProps) {
  const handleSearchChange = (value: string) => {
    onFiltersChange({
      ...filters,
      searchQuery: value,
    });
  };

  const handleClayTypeToggle = (clayType: string) => {
    const isSelected = filters.selectedClayTypes.includes(clayType);
    const newClayTypes = isSelected
      ? filters.selectedClayTypes.filter(ct => ct !== clayType)
      : [...filters.selectedClayTypes, clayType];

    onFiltersChange({
      ...filters,
      selectedClayTypes: newClayTypes,
    });
  };

  const handleTagToggle = (tag: string) => {
    const isSelected = filters.selectedTags.includes(tag);
    const newTags = isSelected
      ? filters.selectedTags.filter(t => t !== tag)
      : [...filters.selectedTags, tag];

    onFiltersChange({
      ...filters,
      selectedTags: newTags,
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      searchQuery: '',
      selectedClayTypes: [],
      selectedTags: [],
    });
  };

  const hasActiveFilters =
    filters.searchQuery ||
    filters.selectedClayTypes.length > 0 ||
    filters.selectedTags.length > 0;

  return (
    <BlockStack spacing="base">
      <TextField
        label="Search"
        value={filters.searchQuery}
        onChange={handleSearchChange}
      />

      {availableClayTypes.length > 0 && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            Clay Type
          </Text>
          <InlineLayout spacing="tight">
            {availableClayTypes.map(clayType => (
              <Button
                key={clayType}
                onPress={() => handleClayTypeToggle(clayType)}
                kind={
                  filters.selectedClayTypes.includes(clayType)
                    ? 'primary'
                    : 'secondary'
                }
              >
                {clayType}
              </Button>
            ))}
          </InlineLayout>
        </BlockStack>
      )}

      {availableTags.length > 0 && (
        <BlockStack spacing="tight">
          <Text size="small" emphasis="bold">
            Tags
          </Text>
          <InlineLayout spacing="tight">
            {availableTags.map(tag => (
              <Button
                key={tag}
                onPress={() => handleTagToggle(tag)}
                kind={
                  filters.selectedTags.includes(tag) ? 'primary' : 'secondary'
                }
              >
                {tag}
              </Button>
            ))}
          </InlineLayout>
        </BlockStack>
      )}

      {hasActiveFilters && (
        <Button onPress={handleClearFilters} kind="plain">
          Clear all filters
        </Button>
      )}
    </BlockStack>
  );
}
