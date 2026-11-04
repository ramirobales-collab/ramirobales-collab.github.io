// Sala de bots: datos de la simulación. TODO es inventado (club, jugadores, cifras, tiendas, materias).
// Lo único real que aparece en la página es el tipo de bot, su arquitectura y el costo medido del radar.

export const CLUB = { semana: 14, limite: 20 };

// carga = UA de la semana; prom = promedio de las 4 semanas anteriores; acwr = carga / prom.
// sprint y sprintProm en metros (>25 km/h) de la última sesión y su promedio; bienestar 1–5; sueño en horas.
export const PLANTEL = [
  { id: 'ferraro', nombre: 'Tomás Ferraro', pos: 'medio', carga: 3120, prom: 2890, sprint: 192, sprintProm: 209, bienestar: 4, sueno: 7.6, medico: 'restriccion' },
  { id: 'quiroga', nombre: 'Iván Quiroga', pos: 'pilar', carga: 3850, prom: 2500, sprint: 96, sprintProm: 104, bienestar: 2, sueno: 6.1, medico: 'apto' },
  { id: 'arrieta', nombre: 'Joaquín Arrieta', pos: 'centro', carga: 4180, prom: 2580, sprint: 248, sprintProm: 231, bienestar: 3, sueno: 7.0, medico: 'apto' },
  { id: 'lisandrelli', nombre: 'Mateo Lisandrelli', pos: 'wing', carga: 3010, prom: 2950, sprint: 410, sprintProm: 205, bienestar: 4, sueno: 8.1, medico: 'apto' },
  { id: 'salvatierra', nombre: 'Bruno Salvatierra', pos: 'zaguero', carga: 2980, prom: 2810, sprint: 260, sprintProm: 244, bienestar: 4, sueno: 7.4, medico: 'apto' },
  { id: 'bencomo', nombre: 'Lautaro Bencomo', pos: 'hooker', carga: 2240, prom: 2620, sprint: 120, sprintProm: 131, bienestar: 3, sueno: 6.8, medico: 'apto' },
  { id: 'ardanaz', nombre: 'Nicolás Ardanaz', pos: 'segunda', carga: 2760, prom: 2700, sprint: 180, sprintProm: 176, bienestar: 4, sueno: 7.2, medico: 'apto' },
  { id: 'iturbide', nombre: 'Franco Iturbide', pos: 'apertura', carga: 2890, prom: 2840, sprint: 150, sprintProm: 158, bienestar: 5, sueno: 7.9, medico: 'apto' },
  { id: 'melgarejo', nombre: 'Santiago Melgarejo', pos: 'tercera', carga: 640, prom: 2450, sprint: 0, sprintProm: 168, bienestar: 3, sueno: 7.1, medico: 'baja' },
  { id: 'corvalan', nombre: 'Elías Corvalán', pos: 'centro', carga: 2930, prom: 2880, sprint: 230, sprintProm: 226, bienestar: 4, sueno: 7.5, medico: 'apto' },
];
for (const j of PLANTEL) j.acwr = Math.round((j.carga / j.prom) * 100) / 100;

export const UMBRAL_ACWR = 1.5;

// Reporte GPS de la sesión de hoy que «llega» como foto. km = distancia; kmProm = promedio habitual.
// Una fila tiene lectura dudosa (la cifra está corrida en el papel): el bot pregunta antes de guardarla.
export const REPORTE_FOTO = [
  { id: 'lisandrelli', km: 5.9, kmProm: 5.6, sprint: 410, sprintProm: 205 },
  { id: 'bencomo', km: 3.1, kmProm: 4.8, sprint: 120, sprintProm: 131 },
  { id: 'salvatierra', km: null, dudas: [7.3, 7.8], kmProm: 7.4, sprint: 260, sprintProm: 244 },
  { id: 'ardanaz', km: 5.2, kmProm: 5.1, sprint: 180, sprintProm: 176 },
  { id: 'iturbide', km: 4.7, kmProm: 4.9, sprint: 150, sprintProm: 158 },
  { id: 'corvalan', km: 6.1, kmProm: 6.0, sprint: 230, sprintProm: 226 },
];

export const VOZ = { segundos: 6, jugador: 'ferraro' };

// Forma de onda de la nota de voz (alturas 0–1, fija para que la captura sea reproducible).
export const ONDA = [0.18, 0.32, 0.55, 0.42, 0.7, 0.88, 0.62, 0.4, 0.3, 0.52, 0.76, 0.94, 0.8, 0.58, 0.36, 0.22, 0.46, 0.68, 0.84, 0.6, 0.44, 0.7, 0.9, 0.74, 0.5, 0.34, 0.26, 0.48, 0.64, 0.4, 0.28, 0.2, 0.36, 0.56, 0.42, 0.24, 0.16, 0.12];

// Línea de tiempo de los bots proactivos (minutos desde las 0:00).
export const DIA = { desde: 6 * 60, hasta: 22 * 60 };
export const EVENTOS = [
  { id: 'precios', min: 8 * 60, proyecto: 'athleteiq', canal: 'mensaje' },
  { id: 'radar', min: 9 * 60, proyecto: 'athleteiq', canal: 'mensaje', costo: true },
  { id: 'parcial', min: 10 * 60, proyecto: 'cathedra', canal: 'mensaje' },
  { id: 'rutina', min: 18 * 60 + 30, proyecto: 'fortal', canal: 'push' },
];

// Brief de precios: 12 productos en 3 tiendas inventadas; se avisan sólo cambios ≥ 5 % o faltantes.
export const PRECIOS = [
  { prod: 'pelota', tienda: 'norte', antes: 38, ahora: 35 },
  { prod: 'camiseta', tienda: 'sur', antes: 64, ahora: 69 },
  { prod: 'botines', tienda: 'centro', antes: 129, ahora: null },
];

// Radar: lo que encontró la corrida de hoy y qué hizo con cada cosa.
export const RADAR = [
  { id: 'liga', estado: 'nueva' },
  { id: 'gimnasio', estado: 'nueva' },
  { id: 'seven', estado: 'repetida' },
  { id: 'feria', estado: 'repetida' },
  { id: 'remo', estado: 'repetida' },
  { id: 'tendencias', estado: 'baja' },
  { id: 'empleo', estado: 'baja' },
];

export const PROYECTOS = {
  athleteiq: '../../proyectos/athleteiq.html',
  cathedra: '../../proyectos/cathedra.html',
  fortal: '../../proyectos/fortal.html',
};
