const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

const session = {
  shop: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const client = new shopify.clients.Graphql({ session });

async function createAdminUser() {
  try {
    // First check if admin customer exists
    const searchQuery = `
      query {
        customers(first: 1, query: "email:admin@pottery.com") {
          edges {
            node {
              id
              email
              firstName
              lastName
            }
          }
        }
      }
    `;

    const searchResult = await client.query({ data: searchQuery });

    if (searchResult.body.data.customers.edges.length > 0) {
      console.log('✅ Admin user already exists in Shopify');
      console.log('Email: admin@pottery.com');
      console.log('Password: admin123');
      console.log('');
      console.log('You can now login at: https://frontend-b0z6r6j6m-hjr-labs-projects.vercel.app');
      return;
    }

    // Create admin customer with password metafield
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const createMutation = `
      mutation {
        customerCreate(input: {
          email: "admin@pottery.com"
          firstName: "Admin"
          lastName: "User"
        }) {
          customer {
            id
            email
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResult = await client.query({ data: createMutation });

    if (createResult.body.data.customerCreate.userErrors.length > 0) {
      console.error('❌ Error creating customer:', createResult.body.data.customerCreate.userErrors);
      return;
    }

    const customerId = createResult.body.data.customerCreate.customer.id;
    console.log('✅ Created customer:', customerId);

    // Add password metafield
    const metafieldMutation = `
      mutation {
        metafieldsSet(metafields: [{
          ownerId: "${customerId}"
          namespace: "custom"
          key: "app_password"
          value: "${hashedPassword}"
          type: "single_line_text_field"
        }]) {
          metafields {
            id
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const metafieldResult = await client.query({ data: metafieldMutation });

    if (metafieldResult.body.data.metafieldsSet.userErrors.length > 0) {
      console.error('❌ Error setting password:', metafieldResult.body.data.metafieldsSet.userErrors);
      return;
    }

    console.log('✅ Admin user created successfully!');
    console.log('Email: admin@pottery.com');
    console.log('Password: admin123');
    console.log('');
    console.log('You can now login at: https://frontend-b0z6r6j6m-hjr-labs-projects.vercel.app');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

createAdminUser();
