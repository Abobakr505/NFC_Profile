// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// تهيئة العميل مع التحقق من وجود المتغيرات
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are missing!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);