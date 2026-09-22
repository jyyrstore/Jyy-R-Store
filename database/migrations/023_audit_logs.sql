create table if not exists activity_logs(
 id uuid primary key default gen_random_uuid(), actor_user_id uuid references profiles(id) on delete set null, action text not null, entity_type text, entity_id uuid, metadata jsonb, masked_ip text, user_agent text, created_at timestamptz not null default now()
);
