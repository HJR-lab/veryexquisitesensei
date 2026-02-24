-- Delete Carolyn's Joyce Lim bookings (the 5 Monday classes that don't exist)
DELETE FROM bookings
WHERE customer_id = (SELECT id FROM customers WHERE email = 'carolyn.wee@gmail.com')
AND class_instance_id IN (
  SELECT ci.id
  FROM class_instances ci
  WHERE ci.instructor = 'Joyce Lim'
  AND ci.class_date IN (
    '2026-01-19',  -- Monday Jan 19
    '2026-01-26',  -- Monday Jan 26
    '2026-02-02',  -- Monday Feb 2
    '2026-02-09',  -- Monday Feb 9
    '2026-02-16'   -- Monday Feb 16
  )
);

-- Verify deletion
SELECT
  b.id,
  ci.class_date,
  ci.instructor,
  ci.class_type
FROM bookings b
JOIN class_instances ci ON b.class_instance_id = ci.id
JOIN customers c ON b.customer_id = c.id
WHERE c.email = 'carolyn.wee@gmail.com'
ORDER BY ci.class_date;
