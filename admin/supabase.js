// js/supabase.js
// Initialize Supabase Client

// TODO: Replace these placeholders with your actual Supabase project URL and anon key.
const SUPABASE_URL = 'https://spamrrcfoablporcvida.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h0rtZeGc8NQglSWAYeKJYw_xIFAkR3N';

let supabaseClient = null;

try {
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY_HERE') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.warn("Supabase credentials not set. Dynamic features will be disabled.");
    }
} catch (error) {
    console.error("Failed to initialize Supabase client:", error);
}

// Export the client for other scripts to use
window.supabaseClient = supabaseClient;
