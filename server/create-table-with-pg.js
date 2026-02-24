const { Client } = require('pg');

const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.fpdbfbxpthmaceuspcrf',
  password: '34HXi0Kv8X0WJ7gb',
  database: 'postgres'
});

async function createTable() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Create the table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_tracking (
        sync_type VARCHAR(50) PRIMARY KEY,
        last_sync_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ Table created successfully');

    // Insert initial record
    await client.query(`
      INSERT INTO sync_tracking (sync_type, last_sync_at)
      VALUES ('shopify_orders', NOW() - INTERVAL '7 days')
      ON CONFLICT (sync_type) DO NOTHING;
    `);
    console.log('✅ Initial sync record inserted');

    // Verify
    const result = await client.query('SELECT * FROM sync_tracking');
    console.log('✅ Sync tracking records:', result.rows);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
    console.log('✅ Database connection closed');
  }
}

createTable();
