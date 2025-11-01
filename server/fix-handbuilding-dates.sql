-- Fix handbuilding class dates from Thursday to Wednesday
-- Current: Oct 9, 16, 23, 30 (Thursdays)
-- Correct: Oct 8, 15, 22, 29 (Wednesdays)

UPDATE class_instances
SET class_date = class_date - INTERVAL '1 day'
WHERE class_type LIKE '%Handbuilding%'
  AND class_date IN ('2025-10-09', '2025-10-16', '2025-10-23', '2025-10-30');
