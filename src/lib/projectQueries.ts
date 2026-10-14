import { supabase } from '@/integrations/supabase/client';

/** Operational reads exclude the archive. Historical references must use their original IDs. */
export function projectQuery(showArchive = false) {
  const query = supabase.from('projects').select('*');
  return showArchive ? query : query.is('archiviert_am', null);
}
export async function loadProjects(showArchive = false) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await projectQuery(showArchive).order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return rows;
}