const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Clay Types
  console.log('Adding clay types...');
  const clayTypes = [
    { name: 'Stoneware', description: 'Durable, vitrified clay that fires at high temperatures' },
    { name: 'Earthenware', description: 'Low-fire clay with a porous body' },
    { name: 'Porcelain', description: 'High-fire, white, translucent clay' },
    { name: 'Other', description: 'Custom or mixed clay bodies' }
  ];

  for (const clayType of clayTypes) {
    await prisma.clayType.upsert({
      where: { name: clayType.name },
      update: {},
      create: clayType
    });
  }
  console.log('✅ Clay types added');

  // Seed Common Glazes
  console.log('Adding common glazes...');
  const glazes = [
    { name: 'Celadon Green', colorHex: '#9FD6B7', description: 'Classic pale green glaze' },
    { name: 'Tenmoku', colorHex: '#3C1F1F', description: 'Dark brown/black iron glaze' },
    { name: 'Shino', colorHex: '#F4E6D8', description: 'Warm orange/cream Japanese glaze' },
    { name: 'Clear Gloss', colorHex: '#FFFFFF', description: 'Transparent glossy glaze' },
    { name: 'White Satin', colorHex: '#F5F5F5', description: 'Opaque white matte glaze' },
    { name: 'Cobalt Blue', colorHex: '#0047AB', description: 'Deep blue glaze' },
    { name: 'Copper Red', colorHex: '#B87333', description: 'Reduction-fired red glaze' },
    { name: 'Ash Glaze', colorHex: '#D3D3D3', description: 'Natural wood ash glaze' }
  ];

  for (const glaze of glazes) {
    await prisma.glaze.upsert({
      where: { name: glaze.name },
      update: {},
      create: glaze
    });
  }
  console.log('✅ Glazes added');

  // Seed Admin Settings (from PRD)
  console.log('Adding admin settings...');
  const settings = [
    { settingKey: 'classes_per_course', settingValue: '6', description: 'Number of classes in a standard course' },
    { settingKey: 'course_duration_days', settingValue: '90', description: 'Days until course expires (3 months)' },
    { settingKey: 'change_cutoff_hours', settingValue: '24', description: 'Hours before class that changes are allowed' },
    { settingKey: 'waitlist_claim_hours', settingValue: '24', description: 'Hours to claim a waitlist spot' },
    { settingKey: 'max_images_per_piece', settingValue: '5', description: 'Maximum images per pottery piece' },
    { settingKey: 'gold_firing_discount', settingValue: '10', description: 'Gold member firing discount %' },
    { settingKey: 'gold_workshop_discount', settingValue: '10', description: 'Gold member workshop discount %' },
    { settingKey: 'platinum_firing_discount', settingValue: '15', description: 'Platinum member firing discount %' },
    { settingKey: 'platinum_workshop_discount', settingValue: '15', description: 'Platinum member workshop discount %' }
  ];

  for (const setting of settings) {
    await prisma.adminSetting.upsert({
      where: { settingKey: setting.settingKey },
      update: { settingValue: setting.settingValue },
      create: setting
    });
  }
  console.log('✅ Admin settings added');

  console.log('✨ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
