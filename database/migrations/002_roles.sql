create table if not exists roles(code text primary key, name text not null, description text);
insert into roles(code,name) values ('USER','User'),('MODERATOR','Moderator'),('ADMIN','Admin'),('OWNER','Owner') on conflict(code) do nothing;
