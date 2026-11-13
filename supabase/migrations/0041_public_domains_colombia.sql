-- 0041 · Colombian ISP mail domains count as public again (une.net.co, etb.net.co, live.com.co).
-- 0038 listed them; 0039 replaced is_public_email_domain() with a list that missed them. This is the union of both.
-- Only the function changes (the schools trigger and start_teacher_trial use it). Re-runnable.
create or replace function public.is_public_email_domain(p_domain text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_domain, '')) in (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.mx',
    'live.com.co', 'msn.com', 'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'une.net.co', 'etb.net.co');
$$;
-- Check: select public.is_public_email_domain('une.net.co');  -- true
