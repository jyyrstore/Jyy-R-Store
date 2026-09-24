const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');

function read(file){
  return fs.readFileSync(path.join(root,file),'utf8');
}

test('notification read state is stored per user',()=>{
  const migration=read('database/migrations/032_notification_read_state.sql');

  assert.match(migration,/create table if not exists notification_reads/i);
  assert.match(migration,/primary key\(notification_id,user_id\)/i);
});

test('notification repository scopes broadcast read state to current user',()=>{
  const repo=read('src/repositories/notification.repository.js');

  assert.match(repo,/left join notification_reads nr/i);
  assert.match(repo,/nr\.user_id=\$1/i);
  assert.match(repo,/on conflict\(notification_id,user_id\)/i);
  assert.match(repo,/n\.user_id is null/i);
});

test('mark-read handles inaccessible notifications explicitly',()=>{
  const controller=read('src/controllers/api.controller.js');

  assert.match(controller,/NOTIFICATION_NOT_FOUND/);
});

test('notifications are excluded from updated_at trigger',()=>{
  const trigger=read('database/triggers/updated_at.sql');

  assert.doesNotMatch(trigger,/'notifications',/);
});
