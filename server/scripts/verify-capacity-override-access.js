const { supabase, findCapacityOverride, getInstanceCapacityOverrides } = require('../utils/supabaseDb');

(async () => {
  let createdId;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: classes, error: classError } = await supabase
      .from('class_instances').select('id').gte('class_date', today).order('class_date').limit(20);
    if (classError) throw classError;
    const { data: students, error: studentError } = await supabase
      .from('customers').select('id').order('id').limit(20);
    if (studentError) throw studentError;

    let pair;
    for (const cls of classes || []) {
      for (const student of students || []) {
        const { data } = await supabase.from('capacity_overrides').select('id')
          .eq('class_instance_id', cls.id).eq('student_id', student.id).is('revoked_at', null).maybeSingle();
        if (!data) { pair = { cls, student }; break; }
      }
      if (pair) break;
    }
    if (!pair) throw new Error('no unused class/student pair found');

    const { data: created, error: insertError } = await supabase.from('capacity_overrides').insert({
      class_instance_id: pair.cls.id,
      student_id: pair.student.id,
      reason: 'RLS SERVICE-ROLE VERIFICATION — SAFE TO DELETE',
      created_by: 'deus-security-verification',
    }).select().single();
    if (insertError) throw insertError;
    createdId = created.id;

    const found = await findCapacityOverride(pair.cls.id, pair.student.id);
    if (found?.id !== createdId) throw new Error('findCapacityOverride did not return created grant');
    const listed = await getInstanceCapacityOverrides(pair.cls.id);
    if (!listed.some((row) => row.id === createdId)) throw new Error('getInstanceCapacityOverrides omitted created grant');

    const { error: updateError } = await supabase.from('capacity_overrides')
      .update({ revoked_at: new Date().toISOString(), revoked_by: 'deus-security-verification' }).eq('id', createdId);
    if (updateError) throw updateError;
    const activeAfter = await findCapacityOverride(pair.cls.id, pair.student.id);
    if (activeAfter) throw new Error('revoked grant remained active');

    console.log(`PASS capacity override service flow: inserted, read, listed, revoked id ${createdId}`);
  } finally {
    if (createdId) {
      const { error } = await supabase.from('capacity_overrides').delete().eq('id', createdId);
      if (error) throw error;
      console.log(`PASS cleanup: deleted verification override ${createdId}`);
    }
  }
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
});
