// VES Pottery Studio - Brand Colors
// Reference: www.ves.sg (Dawn theme customized)
// These colors are defined for reference and can be used in future custom styling
export const theme = {
  colors: {
    // VES Brand Colors
    primary: '#121212',        // Black - primary text
    offWhite: '#F5F3F0',       // Off-white - backgrounds
    white: '#FFFFFF',          // Pure white

    // Earth tones for pottery studio aesthetic (complementary)
    terracotta: '#C1694F',
    clay: '#A67C52',
    sandstone: '#D4B59E',
    earthBrown: '#8B7355',
    warmGray: '#A89F91',

    // Functional colors
    background: '#F5F3F0',
    text: '#121212',
    textSubdued: '#8B7355',
    border: '#E8E6E3',
  },

  typography: {
    // VES uses "Atak" font with Assistant as fallback
    primary: 'Atak, Assistant, sans-serif',
  },

  spacing: {
    extraTight: 4,
    tight: 8,
    base: 16,
    loose: 24,
    extraLoose: 32,
  },

  borderRadius: {
    base: 8,
    large: 12,
  },
};

// Note: Shopify UI Extensions use their own design tokens
// This theme is primarily for documentation and future custom styling needs
// The extensions will use Shopify's built-in styling which provides a clean,
// minimal design that aligns with the pottery studio aesthetic
