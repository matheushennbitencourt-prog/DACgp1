create table if not exists users (
  id uuid primary key,
  name text not null,
  username text not null default '',
  registration text not null unique,
  email text not null unique,
  course_id text not null,
  avatar_url text not null default '',
  password_hash text not null,
  session_token text,
  preferences_theme text not null default 'brand' check (preferences_theme in ('brand', 'dark', 'white')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_progress (
  user_id uuid not null references users(id) on delete cascade,
  course_id text not null,
  subject_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id, subject_id)
);

alter table users drop constraint if exists users_course_id_check;
alter table user_progress drop constraint if exists user_progress_course_id_check;

create table if not exists imported_curriculums (
  id text primary key,
  code text not null,
  base_code text not null default '',
  name text not null,
  catalog_name text not null default '',
  catalog_key text not null default '',
  academic_year integer,
  version_label text not null default '',
  trail_labels jsonb not null default '[]'::jsonb,
  subjects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table imported_curriculums add column if not exists base_code text not null default '';
alter table imported_curriculums add column if not exists catalog_name text not null default '';
alter table imported_curriculums add column if not exists catalog_key text not null default '';
alter table imported_curriculums add column if not exists academic_year integer;
alter table imported_curriculums add column if not exists version_label text not null default '';

create index if not exists idx_users_session_token on users(session_token);
create index if not exists idx_user_progress_user_course on user_progress(user_id, course_id);
create index if not exists idx_imported_curriculums_name on imported_curriculums(name);
create index if not exists idx_imported_curriculums_catalog on imported_curriculums(catalog_key, academic_year desc);
