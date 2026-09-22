const { createClient } = require('@supabase/supabase-js');

let publicConfig = null;
let serviceConfig = null;
let serviceClient = null;

function initSupabase(env) {
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';

  publicConfig = {
    url: env.SUPABASE_URL || '',
    key: publicKey
  };

  serviceConfig = {
    url: env.SUPABASE_URL || '',
    key: serviceKey
  };

  serviceClient = null;

  if (serviceConfig.url && serviceConfig.key) {
    serviceClient = createClient(serviceConfig.url, serviceConfig.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }
}

function supabase() {
  if (!serviceClient) {
    throw new Error('Supabase service client is not configured.');
  }
  return serviceClient;
}

function supabaseAdmin() {
  if (!serviceConfig?.url || !serviceConfig?.key) {
    throw new Error('Supabase admin client is not configured.');
  }

  return createClient(serviceConfig.url, serviceConfig.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function supabasePublic() {
  if (!publicConfig?.url || !publicConfig?.key) {
    throw new Error('Supabase public client is not configured.');
  }

  return createClient(publicConfig.url, publicConfig.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

module.exports = {
  initSupabase,
  supabase,
  supabaseAdmin,
  supabasePublic
};
