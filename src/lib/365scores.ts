// 365scores.com — cuarta fuente, se suma a Promiedos/ESPN/fichajes.com
// sin reemplazar ninguna. YA NO SE SCRAPEA EN VIVO (el proxy
// src/app/api/365scores/route.ts se borró, ver commit) — Ignacio pasa
// capturas manuales a src/data/365scores-data-2026.json, que se lee
// directo. Import estático de TS (`resolveJsonModule`): editar el JSON y
// redeployar alcanza, no hay que tocar código. Mismo motivo que
// src/data/refuerzo-magico-data-2026.json.
//
// El archivo trae 16 categorías (`meta.nota_limite`: top ~20 de cada
// una, límite real de la fuente, no de la UI — ya confirmado a mano
// contra la API real antes de este cambio). Cada categoría es
// `{player, club, valor}[]`.
//
// OJO — unidades mezcladas dentro del mismo archivo (`meta.
// nota_unidades_CRITICA`, confirmado a mano): "Goles esperados"/
// "Asistencias esperadas"/"Puntajes 365"/tarjetas/"Porterías a cero"
// son TOTALES/promedios de temporada, pero "Barridas ganadas
// por partido"/"Intercepciones por partido"/"Goles recibidos por
// partido"/"Atajadas por partido" son PROMEDIOS POR PARTIDO (valores
// bajos tipo 0.2-5, no acumulados). fichajes.com, en cambio, SIEMPRE
// trae totales de temporada. Por eso los campos "por partido" de esta
// fuente NO se mezclan con duelsWon/interceptions/saves/goalsConceded
// (esos son totales de fichajes.com) — se guardan aparte con sufijo
// "PerGame365" y se muestran en fila propia, aclarando "(por partido)".
// Solo tarjetas/porterías a cero (misma unidad — totales — en ambas
// fuentes) se usan como fallback silencioso de los campos existentes.
//
// penaltisConvertidos/penaltisParados vienen como string "2/2" (convertidos
// o atajados / intentados) — se toma solo el numerador (lo convertido/
// atajado), que es lo que el nombre del campo indica.
export interface Scores365PlayerStats {
  name: string;
  xg: number | null;                      // Goles esperados (temporada)
  xa: number | null;                      // Asistencias esperadas (temporada)
  xgXaCombined: number | null;            // Goles+asistencias esperados combinado (temporada)
  rating365: number | null;               // Puntajes 365 (promedio de rendimiento)
  penaltisConvertidos: number | null;     // Penales convertidos (temporada)
  penaltisParados: number | null;         // Penales atajados (temporada, arquero)
  duelsWonPerGame365: number | null;      // Barridas ganadas POR PARTIDO
  interceptionsPerGame365: number | null; // Intercepciones POR PARTIDO
  savesPerGame365: number | null;         // Atajadas POR PARTIDO (arquero)
  goalsConcededPerGame365: number | null; // Goles recibidos POR PARTIDO (arquero)
  yellowCards: number | null;             // Tarjetas Amarillas (temporada — mismo total que fichajes.com)
  redCards: number | null;                // Tarjetas Rojas (temporada)
  cleanSheets: number | null;             // Porterías a cero (temporada, arquero)
}

interface RawRow { player: string; club: string; valor: number | string; }
interface Score365DataFile {
  golesEsperados_xG: RawRow[];
  asistenciasEsperadas_xA: RawRow[];
  golesYAsistenciasEsperadas_xGxA: RawRow[];
  rating365: RawRow[];
  penaltisConvertidos: RawRow[];
  penaltisParados: RawRow[];
  barridasGanadasPorPartido: RawRow[];
  intercepcionesPorPartido: RawRow[];
  tarjetasRojas: RawRow[];
  tarjetasAmarillas: RawRow[];
  porteriasACero: RawRow[];
  golesRecibidosPorPartido: RawRow[];
  atajadasPorPartido: RawRow[];
}

import SCORES_365_RAW from "@/data/365scores-data-2026.json";
const SCORES_365_DATA = SCORES_365_RAW as unknown as Score365DataFile;

function penaltyCount(valor: number | string): number | null {
  if (typeof valor === "number") return valor;
  const m = String(valor).match(/^(\d+)\/\d+$/);
  return m ? parseInt(m[1], 10) : null;
}

let cached: Map<string, Scores365PlayerStats> | null = null;

// Sin fetch, sin caché en localStorage — el dato ya es estático (el
// propio archivo se actualiza a mano y se redeploya, no hace falta TTL,
// pedido explícito). Se memoiza en memoria nomás para no re-parsear en
// cada llamado dentro de la misma sesión de navegador.
export async function getScores365Data(): Promise<Map<string, Scores365PlayerStats>> {
  if (cached) return cached;

  const byName = new Map<string, Scores365PlayerStats>();
  function ensure(name: string): Scores365PlayerStats {
    let p = byName.get(name);
    if (!p) {
      p = {
        name, xg: null, xa: null, xgXaCombined: null, rating365: null,
        penaltisConvertidos: null, penaltisParados: null,
        duelsWonPerGame365: null, interceptionsPerGame365: null,
        savesPerGame365: null, goalsConcededPerGame365: null,
        yellowCards: null, redCards: null, cleanSheets: null,
      };
      byName.set(name, p);
    }
    return p;
  }

  const map: [keyof Score365DataFile, keyof Scores365PlayerStats][] = [
    ["golesEsperados_xG", "xg"],
    ["asistenciasEsperadas_xA", "xa"],
    ["golesYAsistenciasEsperadas_xGxA", "xgXaCombined"],
    ["rating365", "rating365"],
    ["barridasGanadasPorPartido", "duelsWonPerGame365"],
    ["intercepcionesPorPartido", "interceptionsPerGame365"],
    ["tarjetasRojas", "redCards"],
    ["tarjetasAmarillas", "yellowCards"],
    ["porteriasACero", "cleanSheets"],
    ["golesRecibidosPorPartido", "goalsConcededPerGame365"],
    ["atajadasPorPartido", "savesPerGame365"],
  ];
  for (const [srcKey, field] of map) {
    for (const row of SCORES_365_DATA[srcKey] ?? []) {
      const p = ensure(row.player);
      const value = typeof row.valor === "number" ? row.valor : parseFloat(String(row.valor));
      if (Number.isFinite(value)) (p[field] as number | null) = value;
    }
  }
  for (const row of SCORES_365_DATA.penaltisConvertidos ?? []) {
    ensure(row.player).penaltisConvertidos = penaltyCount(row.valor);
  }
  for (const row of SCORES_365_DATA.penaltisParados ?? []) {
    ensure(row.player).penaltisParados = penaltyCount(row.valor);
  }

  cached = byName;
  return byName;
}
