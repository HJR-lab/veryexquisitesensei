-- Studio Access Bookings table
-- Run this in Supabase SQL editor

create table studio_access_bookings (
  id              bigserial primary key,
  customer_id     bigint not null references customers(id),
  booking_date    date not null,
  start_time      text not null,        -- '14:00' (24h format)
  end_time        text not null,        -- '17:00'
  hours           integer not null,     -- always >= 2
  amount_sgd      integer not null,     -- hours * 20
  status          text not null default 'booked',  -- pending | booked | cancelled | attended
  notes           text,
  admin_notes     text,
  cancelled_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_sab_date on studio_access_bookings(booking_date, status);
create index idx_sab_customer on studio_access_bookings(customer_id);
