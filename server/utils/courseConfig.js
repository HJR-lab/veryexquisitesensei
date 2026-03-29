const supabaseDb = require('./supabaseDb');

let configCache = null;
let cacheLoadedAt = null;

async function loadConfig() {
  const { data, error } = await supabaseDb.supabase
    .from('course_config')
    .select('*')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    console.error('Failed to load course config:', error);
    throw error;
  }

  configCache = {};
  for (const row of data) {
    configCache[row.course_type_key] = row;
  }
  cacheLoadedAt = new Date();
  console.log(`[CourseConfig] Loaded ${data.length} course configs at ${cacheLoadedAt.toISOString()}`);
  return configCache;
}

function getConfig(courseTypeKey) {
  if (!configCache) {
    throw new Error('Course config not loaded yet. Call loadConfig() on startup.');
  }
  return configCache[courseTypeKey] || null;
}

function getAllConfigs() {
  if (!configCache) {
    throw new Error('Course config not loaded yet. Call loadConfig() on startup.');
  }
  return Object.values(configCache);
}

function getConfigByCategory(category) {
  return getAllConfigs().filter(c => c.category === category);
}

async function refreshConfig() {
  return loadConfig();
}

module.exports = {
  loadConfig,
  getConfig,
  getAllConfigs,
  getConfigByCategory,
  refreshConfig,
};
