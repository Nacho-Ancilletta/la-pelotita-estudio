// xG manual — SIN UI, se edita este archivo directo cuando Ignacio pasa
// capturas de FootyStats. Sin panel, sin formulario dentro de la app,
// a propósito (pedido explícito).
//
// Los IDs son los mismos que usa Promiedos (src/lib/promiedos.ts) para
// esta liga — así se cruza directo sin mapeo adicional. Se sacaron de la
// tabla anual (Apertura+Clausura combinado) de Liga Profesional
// Argentina, ago 2026, 30 equipos.
//
// xGFor/xGAgainst en null = todavía no cargado para ese equipo — el
// diagnóstico de necesidad (src/lib/refuerzo-magico.ts) sigue funcionando
// igual con menos precisión, usando solo goles reales de Promiedos hasta
// que se complete.

export interface TeamXG { xGFor: number | null; xGAgainst: number | null; }

export const XG_DATA: Record<string, TeamXG> = {
  "hcch": { xGFor: null, xGAgainst: null }, // Independiente Rivadavia
  "ihb":  { xGFor: null, xGAgainst: null }, // Argentinos Juniors
  "ihc":  { xGFor: null, xGAgainst: null }, // Vélez Sarsfield
  "ihf":  { xGFor: null, xGAgainst: null }, // Rosario Central
  "igh":  { xGFor: null, xGAgainst: null }, // Estudiantes de La Plata
  "igg":  { xGFor: null, xGAgainst: null }, // Boca Juniors
  "fhid": { xGFor: null, xGAgainst: null }, // Belgrano
  "iia":  { xGFor: null, xGAgainst: null }, // Gimnasia La Plata
  "ihe":  { xGFor: null, xGAgainst: null }, // Independiente
  "hchc": { xGFor: null, xGAgainst: null }, // Instituto
  "igi":  { xGFor: null, xGAgainst: null }, // River Plate
  "igj":  { xGFor: null, xGAgainst: null }, // Lanús
  "jafb": { xGFor: null, xGAgainst: null }, // Barracas Central
  "iie":  { xGFor: null, xGAgainst: null }, // Huracán
  "jche": { xGFor: null, xGAgainst: null }, // Talleres de Córdoba
  "iid":  { xGFor: null, xGAgainst: null }, // Tigre
  "igf":  { xGFor: null, xGAgainst: null }, // San Lorenzo
  "hbbh": { xGFor: null, xGAgainst: null }, // Sarmiento Junín
  "bbjbf":{ xGFor: null, xGAgainst: null }, // Gimnasia de Mendoza
  "hcbh": { xGFor: null, xGAgainst: null }, // Defensa y Justicia
  "hcag": { xGFor: null, xGAgainst: null }, // Unión de Santa Fe
  "ihg":  { xGFor: null, xGAgainst: null }, // Racing Club
  "ihi":  { xGFor: null, xGAgainst: null }, // Banfield
  "gbfc": { xGFor: null, xGAgainst: null }, // Atlético Tucumán
  "ihh":  { xGFor: null, xGAgainst: null }, // Newell's Old Boys
  "beafh":{ xGFor: null, xGAgainst: null }, // Central Córdoba SdE
  "hcah": { xGFor: null, xGAgainst: null }, // Platense
  "bbjea":{ xGFor: null, xGAgainst: null }, // Deportivo Riestra
  "hccd": { xGFor: null, xGAgainst: null }, // Aldosivi
  "bheaf":{ xGFor: null, xGAgainst: null }, // Estudiantes RC
};
