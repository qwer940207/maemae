import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hnefzxuyuvbxfaoubgxu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhuZWZ6eHV5dXZieGZhb3ViZ3h1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzQyMzksImV4cCI6MjA5NTgxMDIzOX0.O5clgY7OjobKqr8xFI483dF-8VgJ3LjR_WhduSFnlAs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
