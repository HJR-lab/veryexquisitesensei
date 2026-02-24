# Quick Start Guide

## 1. Initial Setup (5 minutes)

```bash
cd pottery-gallery-app
npm install
```

## 2. Connect to Shopify (First time only)

```bash
npm run dev
```

Follow prompts to:
- Log in to Shopify Partners
- Select/create your app
- Choose your development store

## 3. Configure Metafield in Shopify Admin

1. Go to **Settings > Custom data > Customers**
2. Click **Add definition**
3. Set:
   - Name: `Design Projects`
   - Namespace and key: `custom.design_projects`
   - Type: `JSON`
4. Save

## 4. Add Test Data to a Customer

1. Go to **Customers** in Shopify Admin
2. Select a test customer (or create one)
3. Scroll to **Metafields**
4. Find `custom.design_projects`
5. Paste content from `sample-data.json`
6. Save customer

## 5. Test the Extension

1. Enable customer accounts in your store settings
2. Log in as the test customer
3. View the Pottery Gallery page
4. Test features:
   - Click pieces to view details
   - Use search bar
   - Filter by clay type and tags
   - Navigate image galleries

## 6. Deploy to Production

```bash
npm run deploy
```

## Adding Pottery Pieces

### Option 1: Shopify Admin (Manual)
Add/edit JSON in customer metafields

### Option 2: Shopify API (Automated)
```graphql
mutation updateCustomerMetafield($input: CustomerInput!) {
  customerUpdate(input: $input) {
    customer {
      id
      metafields(first: 10) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
    }
  }
}
```

Variables:
```json
{
  "input": {
    "id": "gid://shopify/Customer/123456",
    "metafields": [
      {
        "namespace": "custom",
        "key": "design_projects",
        "value": "[{...pottery pieces...}]",
        "type": "json"
      }
    ]
  }
}
```

### Option 3: Shopify Flow (Automated)
Create a workflow that updates the metafield when specific conditions are met (e.g., course completion, order fulfillment, etc.)

## Data Structure Reference

```json
{
  "id": "unique_id",
  "title": "Piece Name",
  "images": ["url1.jpg", "url2.jpg"],
  "date_completed": "2024-10-13",
  "clay_type": "Stoneware",
  "glazes": ["Glaze 1", "Glaze 2"],
  "original_weight": "2.5 kg",
  "final_weight": "2.1 kg",
  "dimensions": {
    "height": "25 cm",
    "length": "15 cm",
    "width": "15 cm"
  },
  "notes": "Student notes here",
  "is_public": true,
  "tags": ["wheel-thrown", "functional"]
}
```

## Troubleshooting

**Extension not visible:**
- Check customer accounts are enabled
- Verify extension is deployed and active
- Ensure you're logged in as a customer

**No pieces showing:**
- Verify metafield namespace/key: `custom.design_projects`
- Check JSON is valid (use JSONLint.com)
- Ensure metafield type is JSON

**Images not loading:**
- Use HTTPS URLs
- Host images on Shopify CDN or accessible URLs
- Check image URLs are publicly accessible

## Next Steps

1. Customize the styling (see `src/theme.ts`)
2. Add more pieces to test filtering
3. Set up automated metafield updates
4. Train staff on adding pottery data
5. Share with students!

## Support

- [Shopify UI Extensions Docs](https://shopify.dev/docs/api/customer-account-ui-extensions)
- [Shopify Metafields Guide](https://shopify.dev/docs/apps/custom-data/metafields)
- Check `README.md` for detailed documentation
