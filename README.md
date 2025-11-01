# Pottery Gallery - Shopify Customer Account Extension

A professional student pottery portfolio system for Shopify customer accounts. Students can view all their completed ceramic pieces with detailed specifications, images, and progress tracking.

## Features

- **Personal Gallery**: Grid view of all student pottery pieces
- **Detailed Piece View**:
  - Swipeable image gallery
  - Complete specifications (clay type, glazes, dimensions, weights)
  - Automatic shrinkage calculation
  - Student notes and tags
- **Search & Filter**:
  - Search by title, clay type, glaze, or tags
  - Filter by clay type and tags
- **Stats Dashboard**:
  - Total pieces created
  - Favorite clay type (most used)
  - Total clay used
- **Empty State**: Friendly welcome message for new students
- **Clean Design**: Minimal, pottery studio aesthetic with focus on images

## Project Structure

```
pottery-gallery-app/
├── extensions/
│   └── pottery-gallery/
│       ├── shopify.extension.toml
│       └── src/
│           ├── components/
│           │   ├── EmptyState.tsx
│           │   ├── GalleryGrid.tsx
│           │   ├── PieceDetailView.tsx
│           │   ├── SearchAndFilters.tsx
│           │   └── StatsCard.tsx
│           ├── types/
│           │   └── pottery.ts
│           ├── utils/
│           │   ├── calculations.ts
│           │   └── filtering.ts
│           ├── theme.ts
│           ├── PotteryGallery.tsx
│           └── index.tsx
├── shopify.app.toml
├── tsconfig.json
└── package.json
```

## Setup Instructions

### Prerequisites

1. Node.js 18+ installed
2. Shopify Partner account
3. Shopify store (development or production)
4. Shopify CLI installed globally: `npm install -g @shopify/cli`

### Installation

1. Navigate to the project directory:
```bash
cd pottery-gallery-app
```

2. Install dependencies (already done):
```bash
npm install
```

3. Configure your Shopify app:
   - Update `shopify.app.toml` with your app credentials
   - Get your client_id from Shopify Partners dashboard

4. Connect to your Shopify store:
```bash
npm run dev
```

5. Follow the prompts to:
   - Log in to your Shopify Partner account
   - Select or create an app
   - Select your development store

6. Deploy the extension:
```bash
npm run deploy
```

## Metafield Configuration

The extension reads pottery pieces from a customer metafield:

**Metafield Details:**
- Namespace: `custom`
- Key: `design_projects`
- Type: JSON
- Owner: Customer

### Data Structure

Each pottery piece should follow this structure:

```json
{
  "id": "piece_001",
  "title": "Ceramic Bowl",
  "images": [
    "https://cdn.shopify.com/image1.jpg",
    "https://cdn.shopify.com/image2.jpg"
  ],
  "date_completed": "2024-10-01",
  "clay_type": "Stoneware",
  "glazes": ["Celadon", "Iron Oxide"],
  "original_weight": "2.5 kg",
  "final_weight": "2.1 kg",
  "dimensions": {
    "height": "25 cm",
    "length": "15 cm",
    "width": "15 cm"
  },
  "notes": "First wheel-thrown bowl. Learned centering technique.",
  "is_public": true,
  "tags": ["wheel-thrown", "functional", "beginner"]
}
```

### Setting Up Metafield in Shopify Admin

1. Go to **Settings > Custom data > Customers**
2. Click **Add definition**
3. Configure:
   - Name: `Design Projects`
   - Namespace and key: `custom.design_projects`
   - Type: `JSON`
4. Save the definition

### Adding Pottery Pieces to Customer Accounts

You can add pottery pieces via:

1. **Shopify Admin**:
   - Go to Customers
   - Select a customer
   - Scroll to Metafields
   - Add JSON array of pottery pieces

2. **Shopify API**:
```javascript
const mutation = `
  mutation updateCustomerMetafield($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        id
      }
    }
  }
`;

const variables = {
  input: {
    id: "gid://shopify/Customer/CUSTOMER_ID",
    metafields: [
      {
        namespace: "custom",
        key: "design_projects",
        value: JSON.stringify([/* array of pottery pieces */]),
        type: "json"
      }
    ]
  }
};
```

3. **Shopify Flow** (for automation):
   - Create a workflow that updates the metafield when students complete courses

## Usage

### For Studio Owners

1. **Deploy the extension** to your Shopify store
2. **Enable customer accounts** in your Shopify store settings
3. **Add pottery pieces** to customer metafields as students complete work
4. Students can view their gallery by logging into their customer account

### For Students

1. Log in to your customer account on the pottery studio store
2. Navigate to the "Pottery Gallery" page
3. View all your completed pieces in the gallery grid
4. Click any piece to see full details and all images
5. Use search to find specific pieces
6. Filter by clay type or tags to organize your work

## Development

### Running Locally

```bash
npm run dev
```

This starts the Shopify CLI development server with hot reloading.

### Building for Production

```bash
npm run build
```

### Deploying

```bash
npm run deploy
```

## Customization

### Styling

The extension uses Shopify's UI Extensions components which provide consistent styling. The color palette is documented in `src/theme.ts` for reference.

### Adding Features

To add new features:

1. Create components in `src/components/`
2. Add types to `src/types/pottery.ts`
3. Add utility functions to `src/utils/`
4. Update `PotteryGallery.tsx` to integrate new features

### Modifying Data Structure

If you need to modify the pottery piece data structure:

1. Update the `PotteryPiece` interface in `src/types/pottery.ts`
2. Update components that display this data
3. Update the metafield definition in Shopify Admin

## Technical Details

### Built With

- TypeScript
- React 18
- @shopify/ui-extensions-react
- Shopify Customer Account UI Extensions

### Browser Support

Supports all modern browsers that Shopify customer accounts support.

### Performance

- Efficient filtering with useMemo hooks
- Lazy image loading
- Minimal re-renders with React best practices

## Troubleshooting

### Extension not appearing

- Ensure customer accounts are enabled in your store
- Check that the extension is deployed and activated
- Verify the metafield namespace/key matches exactly

### Pieces not showing

- Verify the metafield exists on the customer
- Check JSON format is valid
- Ensure metafield type is set to JSON

### Images not loading

- Verify image URLs are accessible
- Check that images are hosted on Shopify CDN or publicly accessible URLs
- Ensure URLs are HTTPS

## Support

For issues or questions:
1. Check Shopify's UI Extensions documentation
2. Review the code comments
3. Test with sample data in development store

## License

ISC
