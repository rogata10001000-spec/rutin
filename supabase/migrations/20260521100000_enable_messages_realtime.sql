-- Enable Supabase Realtime for messages table (inbound/outbound INSERT events)
alter publication supabase_realtime add table public.messages;
