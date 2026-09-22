const { createClient } = require('@supabase/supabase-js');
let publicClient;
let serviceClient;
function initSupabase(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  publicClient = env.SUPABASE_ANON_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
  serviceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}
function supabase() { if (!serviceClient) throw new Error('Supabase is not configured.'); return serviceClient; }
function supabasePublic() { if (!publicClient) throw new Error('Supabase public client is not configured.'); return publicClient; }
module.exports = { initSupabase, supabase, supabasePublic };
