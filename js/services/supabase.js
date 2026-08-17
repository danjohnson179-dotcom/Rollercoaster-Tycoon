import{createClient}from'https://esm.sh/@supabase/supabase-js@2.57.4';
import{SUPABASE_URL,SUPABASE_KEY}from'../config.js';
export const supabase=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export async function currentSession(){const{data,error}=await supabase.auth.getSession();if(error)throw error;return data.session}
export async function getProfile(user){if(!user)return null;const{data,error}=await supabase.from('profiles').select('display_name,operator_level,total_score').eq('id',user.id).maybeSingle();if(error&&error.code!=='PGRST116')console.warn('Profile unavailable:',error.message);return data}
