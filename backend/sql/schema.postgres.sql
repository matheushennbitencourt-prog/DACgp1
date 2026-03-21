create table if not exists users (
  id uuid primary key,
  name text not null,
  username text not null default '',
  registration text not null unique,
  email text not null unique,
  course_id text not null check (course_id in ('cc', 'si')),
  avatar_url text not null default '',
  password_hash text not null,
  session_token text,
  preferences_theme text not null default 'brand' check (preferences_theme in ('brand', 'dark', 'white')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_progress (
  user_id uuid not null references users(id) on delete cascade,
  course_id text not null check (course_id in ('cc', 'si')),
  subject_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id, subject_id)
);

create index if not exists idx_users_session_token on users(session_token);
create index if not exists idx_user_progress_user_course on user_progress(user_id, course_id);
