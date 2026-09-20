import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createHandler} from './handler.mjs';
Deno.serve(createHandler(createClient, name => Deno.env.get(name)));
