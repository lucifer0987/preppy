-- The nightly window, made configurable from the admin console.
--
-- Was a constant in lib/time.ts. The times are a scheduling decision rather
-- than a code decision, and changing them meant a deploy.
--
-- One row, enforced. A settings table that can hold two rows eventually holds
-- two rows, and then which one wins is a coin toss.

begin;

create table if not exists app_settings (
  id                    boolean primary key default true check (id),
  -- When a paper unlocks, in IST.
  open_hour             smallint not null default 22 check (open_hour between 0 and 23),
  open_minute           smallint not null default 0  check (open_minute between 0 and 59),
  -- The last moment an attempt may start. Someone starting at the instant
  -- before this still gets the full paper, which is what the check below
  -- guarantees.
  entry_close_hour      smallint not null default 23 check (entry_close_hour between 0 and 23),
  entry_close_minute    smallint not null default 15 check (entry_close_minute between 0 and 59),
  updated_at            timestamptz not null default now(),
  updated_by            uuid references profiles(id) on delete set null,

  -- Entry must open before it closes.
  constraint window_opens_before_it_closes
    check (open_hour * 60 + open_minute < entry_close_hour * 60 + entry_close_minute),

  -- And the last entrant's full 45 minutes must finish inside the same IST
  -- day. An attempt running past midnight would sit on the wrong date for the
  -- archive, the leaderboard and the nightly job, all of which key off the
  -- paper's own date. 23:15 is therefore the latest entry close a 45-minute
  -- paper allows.
  constraint window_ends_within_the_day
    check (entry_close_hour * 60 + entry_close_minute + 45 <= 24 * 60)
);

insert into app_settings (id) values (true) on conflict (id) do nothing;

alter table app_settings enable row level security;

commit;
