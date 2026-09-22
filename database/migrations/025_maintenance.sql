create table if not exists maintenance_settings(
 id smallint primary key default 1 check(id=1), enabled boolean not null default false, title text not null default 'Maintenance', message text, scheduled_start timestamptz, scheduled_end timestamptz, allow_owner_access boolean not null default true, updated_at timestamptz not null default now()
);
insert into maintenance_settings(id,enabled,title,message) values(1,false,'Maintenance','Jyy''R Store sedang dalam pemeliharaan.') on conflict(id) do nothing;
