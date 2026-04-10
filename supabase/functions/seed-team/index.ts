import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supabase.from("team").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { error } = await supabase.from("team").insert([
    { name: "Noah Mrosek",        email: "noah@viralconnect.de",         rolle: "Admin",           department: "Management",  einstiegsdatum: "2023-02-23" },
    { name: "Maximilian Büsse",   email: "maximilian@haushhaush.de",     rolle: "Admin",           department: "Management",  einstiegsdatum: "2023-02-23" },
    { name: "Max Driesner",       email: "max.driesner@viralconnect.de", rolle: "Admin",           department: "Management",  einstiegsdatum: "2024-02-01" },
    { name: "Dennis Öztürk",      email: "dennis@haushhaush.de",         rolle: "Account-Manager", department: "Tech",        einstiegsdatum: "2023-09-01" },
    { name: "Timo Stich",         email: "timo@stich.digital",           rolle: "Account-Manager", department: "Websites",    einstiegsdatum: "2024-01-01" },
    { name: "Jonas Reller",       email: "jonas@viralconnect.de",        rolle: "Account-Manager", department: "Media Buying",einstiegsdatum: "2024-06-01" },
    { name: "Justin Jackstell",   email: "justin@viralconnect.de",       rolle: "Account-Manager", department: "Fulfillment", einstiegsdatum: "2024-02-01" },
    { name: "Antonia Götte",      email: "antonia@viralconnect.de",      rolle: "Account-Manager", department: "Backoffice",  einstiegsdatum: "2024-02-01" },
    { name: "Olga Buchhaltung",   email: "buchhaltung@haushaush.de",     rolle: "Account-Manager", department: "Backoffice",  einstiegsdatum: "2024-02-01" },
    { name: "Osman Hanci",        email: "osman@viralconnect.de",        rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Jelle Altmiks",      email: "jelle@viralconnect.de",        rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Manis Achami",       email: "manis@viralconnect.de",        rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Thalia Schiedeck",   email: "thalia@viralconnect.de",       rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Khalifa Ben Ameur",  email: "khalifa@viralconnect.de",      rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Lilly Matejcek",     email: "lilly@viralconnect.de",        rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Marc Hammer",        email: "marc@viralconnect.de",         rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Lleyton Puls",       email: "lleyton@viralconnect.de",      rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Nico von Engelmann", email: "nico@viralconnect.de",         rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Lucian Ciocea",      email: "lucian@viralconnect.de",       rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Lara Peter",         email: "lara@viralconnect.de",         rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Mohammed Arkbawi",   email: "mohammed@viralconnect.de",     rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Samet Karayel",      email: "samet@viralconnect.de",        rolle: "Setter",          department: "Setter",      einstiegsdatum: "2024-02-01" },
    { name: "Marcel Veit",        email: "marcel@viralconnect.de",       rolle: "Closer",          department: "Closer",      einstiegsdatum: "2024-02-01" },
  ]);

  return new Response(
    JSON.stringify({ success: !error, error: error?.message }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
