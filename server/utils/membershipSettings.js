const supabaseDb = require('./supabaseDb');

const DEFAULT_MEMBERSHIP_SETTINGS = {
  accessCode: '050590#',
  studioHours: [
    { day: 'Monday',    hours: '11:00 am – 9:00 pm' },
    { day: 'Tuesday',   hours: '11:00 am – 6:00 pm' },
    { day: 'Wednesday', hours: '11:00 am – 6:00 pm' },
    { day: 'Thursday',  hours: '11:00 am – 6:00 pm' },
    { day: 'Friday',    hours: '11:00 am – 9:00 pm' },
    { day: 'Saturday',  hours: '4:00 pm – 8:00 pm' },
    { day: 'Sunday',    hours: '12:00 pm – 6:00 pm' },
  ],
};

async function readMembershipSettings() {
  const { data, error } = await supabaseDb.supabase
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', 'membership_settings')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return { ...DEFAULT_MEMBERSHIP_SETTINGS };
  try {
    const parsed = JSON.parse(data.setting_value);
    return {
      accessCode: parsed.accessCode || DEFAULT_MEMBERSHIP_SETTINGS.accessCode,
      studioHours: Array.isArray(parsed.studioHours) && parsed.studioHours.length === 7
        ? parsed.studioHours
        : DEFAULT_MEMBERSHIP_SETTINGS.studioHours,
    };
  } catch {
    return { ...DEFAULT_MEMBERSHIP_SETTINGS };
  }
}

async function writeMembershipSettings({ accessCode, studioHours }) {
  const value = JSON.stringify({ accessCode: accessCode.trim(), studioHours });
  const now = new Date().toISOString();

  const { data: existing } = await supabaseDb.supabase
    .from('admin_settings')
    .select('id')
    .eq('setting_key', 'membership_settings')
    .single();

  if (existing) {
    const { error } = await supabaseDb.supabase
      .from('admin_settings')
      .update({ setting_value: value, updated_at: now })
      .eq('setting_key', 'membership_settings');
    if (error) throw error;
  } else {
    const { error } = await supabaseDb.supabase
      .from('admin_settings')
      .insert({
        setting_key: 'membership_settings',
        setting_value: value,
        description: 'Membership entry code + studio access hours, surfaced in the membership confirmation email',
        updated_at: now,
      });
    if (error) throw error;
  }
}

module.exports = {
  DEFAULT_MEMBERSHIP_SETTINGS,
  readMembershipSettings,
  writeMembershipSettings,
};
