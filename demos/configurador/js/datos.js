// Catálogo de la demo. Ámbar Muebles es una marca ficticia: nombres, precios y plazos son de ejemplo.
// variante: índice de KHR_materials_variants del GLB (lo que trae el archivo).
// color / brillo / rugosidad / metal: colores y acabados propios aplicados por factor sobre el material base.
// muestra: [color base, brillo] en sRGB para pintar el swatch antes de que cargue el 3D.

export const PRODUCTOS = {
  silla: {
    id: 'silla',
    glb: 'assets/3d/modelos/silla.glb',
    precioBase: 540,
    mallas: { tela: '_fabric', madera: '_wood', metal: '_metal' },
    vista: { theta: 0.62, phi: 1.2 },
    macro: { theta: 0.42, phi: 1.12, dist: 0.62, objetivo: [0.06, 0.37, 0.2] },
    grupos: [
      {
        id: 'tela',
        opciones: [
          { id: 'mango', variante: 0, precio: 0, muestra: ['#c8341a', '#ff9b59'] },
          { id: 'pavo', variante: 1, precio: 0, muestra: ['#00484b', '#2ea3a6'] },
          { id: 'arcilla', color: '#7d3a26', brillo: '#e3a07c', precio: 40, muestra: ['#7d3a26', '#e3a07c'] },
          { id: 'oliva', color: '#4c4a22', brillo: '#b8b37a', precio: 40, muestra: ['#4c4a22', '#b8b37a'] },
          { id: 'tinta', color: '#161d36', brillo: '#6f8cd0', precio: 40, muestra: ['#161d36', '#6f8cd0'] },
          { id: 'marfil', color: '#cfc3ad', brillo: '#fff6e6', precio: 60, muestra: ['#cfc3ad', '#fff6e6'] },
        ],
      },
      {
        id: 'madera',
        opciones: [
          { id: 'nogal', variante: 0, precio: 0, muestra: ['#5a3b14', '#8a6232'] },
          { id: 'ebano', variante: 1, precio: 30, muestra: ['#232120', '#4a4644'] },
          { id: 'roble', color: '#b98d58', rugosidad: 0.62, precio: 30, muestra: ['#a87d4a', '#d2ad7c'] },
          { id: 'fresno', color: '#d7c6aa', rugosidad: 0.7, precio: 50, muestra: ['#cbb89a', '#ece0c9'] },
        ],
      },
      {
        id: 'metal',
        opciones: [
          { id: 'laton', color: '#e2c27a', metal: 1, rugosidad: 0.26, precio: 0, muestra: ['#b48a3c', '#f1dc9c'] },
          { id: 'cromo', color: '#d6d8da', metal: 1, rugosidad: 0.07, precio: 20, muestra: ['#8d9196', '#f4f6f8'] },
          { id: 'negro', color: '#1d1c1b', metal: 0.25, rugosidad: 0.58, precio: 0, muestra: ['#1d1c1b', '#45423f'] },
        ],
      },
    ],
  },
  sofa: {
    id: 'sofa',
    glb: 'assets/3d/modelos/sofa.glb',
    precioBase: 1890,
    mallas: { tela: '_fabric', patas: '_legs', punteras: '_feet' },
    vista: { theta: 0.5, phi: 1.22 },
    macro: { theta: 0.3, phi: 1.1, dist: 0.85, objetivo: [-0.45, 0.4, 0.22] },
    grupos: [
      {
        id: 'tela',
        opciones: [
          { id: 'champan', variante: 0, precio: 0, muestra: ['#4d4538', '#f3dacb'] },
          { id: 'marino', variante: 1, precio: 0, muestra: ['#141820', '#3f73bc'] },
          { id: 'gris', variante: 2, precio: 0, muestra: ['#7d7d77', '#e8eef9'] },
          { id: 'negro', variante: 3, precio: 0, muestra: ['#161616', '#56565a'] },
          { id: 'rosa', variante: 4, precio: 90, muestra: ['#d9b3b5', '#fff3f3'] },
          { id: 'musgo', variante: 0, color: '#272e1c', brillo: '#9aa874', precio: 120, muestra: ['#272e1c', '#9aa874'] },
          { id: 'terracota', variante: 0, color: '#5e2414', brillo: '#d9866a', precio: 120, muestra: ['#5e2414', '#d9866a'] },
        ],
      },
      {
        id: 'patas',
        opciones: [
          { id: 'laca', precio: 0, muestra: ['#1b1b1b', '#3a3a3a'] },
          { id: 'nogal', color: '#4a2c18', rugosidad: 0.55, precio: 60, muestra: ['#4a2c18', '#7a5434'] },
          { id: 'roble', color: '#a8814f', rugosidad: 0.6, precio: 60, muestra: ['#9c7446', '#c9a676'] },
          { id: 'marfil', color: '#e6ddcc', rugosidad: 0.34, precio: 40, muestra: ['#d8cdb9', '#f6f0e4'] },
        ],
      },
      {
        id: 'punteras',
        opciones: [
          { id: 'oro', precio: 0, muestra: ['#c7a08e', '#ffe7da'] },
          { id: 'laton', color: '#e2c27a', metal: 1, rugosidad: 0.26, precio: 0, muestra: ['#b48a3c', '#f1dc9c'] },
          { id: 'cromo', color: '#d6d8da', metal: 1, rugosidad: 0.07, precio: 30, muestra: ['#8d9196', '#f4f6f8'] },
          { id: 'negro', color: '#1d1c1b', metal: 0.25, rugosidad: 0.58, precio: 0, muestra: ['#1d1c1b', '#45423f'] },
        ],
      },
    ],
  },
};
