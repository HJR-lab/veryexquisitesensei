/**
 * Create a test user in both Shopify and local PostgreSQL database
 * Usage: node create-test-user.js <email> <password> <firstName> <lastName>
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initialize Shopify API
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

async function createTestUser(email, password, firstName, lastName) {
  try {
    console.log(`\n🔨 Creating test user: ${email}`);

    const client = getShopifyClient();

    // Check if customer already exists in Shopify
    console.log('1️⃣  Checking if customer exists in Shopify...');
    const searchQuery = `
      query {
        customers(first: 1, query: "email:${email}") {
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
    let customerId;

    if (searchResponse.body.data.customers.edges.length > 0) {
      console.log('   ✓ Customer already exists in Shopify');
      customer = searchResponse.body.data.customers.edges[0].node;
      customerId = customer.id.split('/').pop();
    } else {
      // Create customer in Shopify
      console.log('2️⃣  Creating customer in Shopify...');
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
              email,
              firstName: firstName || 'Test',
              lastName: lastName || 'User',
              tags: ['pottery-app-user', 'test-account']
            }
          }
        }
      });

      if (createResponse.body.data.customerCreate.userErrors.length > 0) {
        const error = createResponse.body.data.customerCreate.userErrors[0];
        throw new Error(`Shopify error: ${error.message}`);
      }

      customer = createResponse.body.data.customerCreate.customer;
      customerId = customer.id.split('/').pop();
      console.log(`   ✓ Created customer in Shopify (ID: ${customerId})`);
    }

    // Hash password
    console.log('3️⃣  Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`   ✓ Password hashed`);

    // Store password in Shopify metafield
    console.log('4️⃣  Storing password in Shopify metafield...');
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
    console.log('   ✓ Password stored in Shopify');

    // Create customer in PostgreSQL
    console.log('5️⃣  Creating customer in PostgreSQL...');

    // Check if already exists
    const existingDbCustomer = await prisma.customer.findUnique({
      where: { shopifyCustomerId: customerId }
    });

    let dbCustomer;
    if (existingDbCustomer) {
      console.log('   ✓ Customer already exists in PostgreSQL');
      dbCustomer = existingDbCustomer;
    } else {
      dbCustomer = await prisma.customer.create({
        data: {
          shopifyCustomerId: customerId,
          email: customer.email,
          firstName: customer.firstName || firstName || 'Test',
          lastName: customer.lastName || lastName || 'User',
          customerType: 'student',
          classesAllocated: 6,
          classesUsed: 0,
          classesForfeited: 0
        }
      });
      console.log(`   ✓ Created customer in PostgreSQL (ID: ${dbCustomer.id})`);
    }

    console.log('\n✅ Test user created successfully!');
    console.log('━'.repeat(50));
    console.log(`📧 Email:          ${email}`);
    console.log(`🔑 Password:       ${password}`);
    console.log(`👤 Name:           ${customer.firstName} ${customer.lastName}`);
    console.log(`🆔 Shopify ID:     ${customerId}`);
    console.log(`🆔 Database ID:    ${dbCustomer.id}`);
    console.log('━'.repeat(50));
    console.log('\n🌐 Login at: http://localhost:5173/login\n');

  } catch (error) {
    console.error('\n❌ Error creating test user:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const email = args[0] || 'admin@ves.sg';
const password = args[1] || 'pottery123';
const firstName = args[2] || 'Admin';
const lastName = args[3] || 'User';

createTestUser(email, password, firstName, lastName);
