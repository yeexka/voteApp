// 1) Replace these with your Supabase project values.
// Supabase Dashboard -> Project Settings -> API
window.APP_CONFIG = {
  SUPABASE_URL: "https://rnippivdqcbblwwojlvm.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ZNo7_kysE22pinRAn1XzOw_XQKVYA1N",

  // This only protects the admin page in the browser. It is enough for a classroom event,
  // but it is not bank-level security, because humans keep inventing developer tools.
  ADMIN_CODE: "123456",

  // This should be your deployed site base URL, no ending slash.
  // Example: https://your-app.example.com
  PUBLIC_BASE_URL: "",

  CANVASSING_SECONDS: 60,
  THINKING_SECONDS: 60,
  GROUP_COUNT: 10
};
