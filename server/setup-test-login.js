require('dotenv').config();
const bcrypt = require('bcryptjs');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

const TEST_EMAIL = 'test@pottery.com';
const TEST_PASSWORD = 'pottery123';

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_customers', 'write_customers'],
  hostName: process.env.SHOPIFY_SHOP_DOMAIN,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

function getShopifyClient() {
  return new shopify.clients.Graphql({
    session: {
      shop: process.env.SHOPIFY_SHOP_DOMAIN,
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    },
  });
}

async function setupTestUser() {
  try {
    console.log('\n🎨 Setting up test login credentials...\n');

    const client = getShopifyClient();

    // Search for existing test user
    const searchQuery = `
      query {
        customers(first: 1, query: "email:${TEST_EMAIL}") {
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

    const searchResponse = await client.query({ data: searchQuery });
    let customer;

    if (searchResponse.body.data.customers.edges.length > 0) {
      console.log('✓ Found existing test user');
      customer = searchResponse.body.data.customers.edges[0].node;
    } else {
      // Create new customer
      console.log('Creating new test user...');
      const createMutation = `
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              email
              firstName
              lastName
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const createResponse = await client.query({
        data: {
          query: createMutation,
          variables: {
            input: {
              email: TEST_EMAIL,
              firstName: 'Test',
              lastName: 'User',
              tags: ['pottery-app-user', 'test-account']
            }
          }
        }
      });

      if (createResponse.body.data.customerCreate.userErrors.length > 0) {
        throw new Error(createResponse.body.data.customerCreate.userErrors[0].message);
      }

      customer = createResponse.body.data.customerCreate.customer;
      console.log('✓ Created new test user');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    // Update password in metafield
    console.log('Setting password...');
    const metafieldMutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    await client.query({
      data: {
        query: metafieldMutation,
        variables: {
          input: {
            id: customer.id,
            metafields: [
              {
                namespace: 'custom',
                key: 'app_password',
                value: hashedPassword,
                type: 'single_line_text_field'
              }
            ]
          }
        }
      }
    });

    console.log('✓ Password set successfully\n');
    console.log('━'.repeat(60));
    console.log('✅ TEST LOGIN READY');
    console.log('━'.repeat(60));
    console.log(`📧 Email:    ${TEST_EMAIL}`);
    console.log(`🔑 Password: ${TEST_PASSWORD}`);
    console.log('━'.repeat(60));
    console.log('\n🌐 Login at: http://localhost:5173/login\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

setupTestUser().then(() => process.exit(0));
