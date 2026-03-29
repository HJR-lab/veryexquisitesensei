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
    console.error('[CourseConfig] Failed to load course config:', error);
    if (error.code === 'PGRST205') {
      console.warn('[CourseConfig] Table not in PostgREST schema cache yet — this resolves automatically within a few minutes');
      console.warn('[CourseConfig] Server will retry on next config access');
    }
    configCache = {};
    return configCache;
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
  if (!configCache) return null;
  return configCache[courseTypeKey] || null;
}

async function ensureLoaded() {
  if (!configCache || Object.keys(configCache).length === 0) {
    await loadConfig();
  }
}

function getAllConfigs() {
  if (!configCache) return [];
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
  ensureLoaded,
};
