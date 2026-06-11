import type { Producto } from "../tipos";
import { normalizar } from "../util/busqueda";

/**
 * Catálogo inicial de productos de Porto Alegre (seeder).
 * Fuente de verdad: la carta entregada en la especificación.
 */

interface CategoriaCatalogo {
  categoria: string;
  productos: { nombre: string; precio: number }[];
}

const CATALOGO: CategoriaCatalogo[] = [
  {
    categoria: "Bebidas",
    productos: [
      { nombre: "Guaraná Antarctica", precio: 2690 },
      { nombre: "Bebidas Gaseosas", precio: 2690 },
      { nombre: "Jugos Naturales de la Estación", precio: 3890 },
      { nombre: "Té", precio: 2200 },
      { nombre: "Café", precio: 2200 },
      { nombre: "Bebida Energética", precio: 3900 },
      { nombre: "Mojito Sin Alcohol", precio: 6000 },
      { nombre: "Primavera Sin Alcohol", precio: 2500 },
    ],
  },
  {
    categoria: "Cervezas",
    productos: [
      { nombre: "Heineken", precio: 3800 },
      { nombre: "Budweiser", precio: 3700 },
      { nombre: "Kunstmann Torobayo", precio: 3990 },
      { nombre: "Austral", precio: 3990 },
      { nombre: "Corona", precio: 3800 },
      { nombre: "Royal", precio: 3800 },
      { nombre: "Cristal", precio: 3200 },
      { nombre: "Cristal Cero", precio: 3200 },
      { nombre: "Calafate", precio: 3990 },
      { nombre: "Michelada (Agregado)", precio: 1200 },
    ],
  },
  {
    categoria: "Cócteles",
    productos: [
      { nombre: "Mojito Cubano", precio: 6000 },
      { nombre: "Mojito Sabores", precio: 6000 },
      { nombre: "Mojito Coco", precio: 6000 },
      { nombre: "Mojito Jäger", precio: 6000 },
      { nombre: "Tropical Gin", precio: 6500 },
      { nombre: "Mojito Manzana", precio: 6000 },
      { nombre: "Ramazzotti Spritz", precio: 6000 },
      { nombre: "Royale Tom Collins", precio: 6000 },
      { nombre: "Aperol Spritz", precio: 6000 },
      { nombre: "Daiquirí", precio: 4000 },
      { nombre: "Tequila Margarita", precio: 4500 },
      { nombre: "Margarita Blue", precio: 3200 },
      { nombre: "Tequila Sunrise", precio: 3000 },
      { nombre: "Aspirado (Flambeado)", precio: 2200 },
      { nombre: "Cucaracha (Flambeado)", precio: 2200 },
      { nombre: "Tequiliña", precio: 4200 },
      { nombre: "Mango Sour", precio: 3500 },
      { nombre: "Pisco Frutilla", precio: 3500 },
      { nombre: "Tequila Fruta", precio: 3200 },
      { nombre: "Tequila Collins", precio: 3200 },
      { nombre: "Golpeado", precio: 2000 },
      { nombre: "Pisco Sour Alto del Carmen", precio: 3500 },
      { nombre: "Pisco Sour Capel", precio: 3000 },
      { nombre: "Pisco Sour a la Peruana", precio: 4000 },
      { nombre: "Primavera Pisco", precio: 3200 },
      { nombre: "Primavera Whisky", precio: 3300 },
      { nombre: "Clavo Oxidado", precio: 4400 },
      { nombre: "Manhattan", precio: 3300 },
      { nombre: "Old Fashioned", precio: 3400 },
      { nombre: "John Collins", precio: 3200 },
      { nombre: "Piña Colada", precio: 4500 },
      { nombre: "Caipirissima", precio: 4200 },
      { nombre: "Ron Collins", precio: 3500 },
      { nombre: "Daiquirí Fruta", precio: 4000 },
      { nombre: "Cosmopolitan", precio: 3300 },
      { nombre: "Sex in the Beach", precio: 3300 },
      { nombre: "Caipiroska", precio: 4000 },
      { nombre: "Vodka Collins", precio: 3000 },
      { nombre: "Ruso Blanco", precio: 3300 },
      { nombre: "Ruso Negro", precio: 3200 },
      { nombre: "Vodka Naranja", precio: 3700 },
      { nombre: "Tom Collins", precio: 4000 },
      { nombre: "Alexander", precio: 3200 },
      { nombre: "Long Island Tea", precio: 3500 },
      { nombre: "Amaretto Sour", precio: 3000 },
      { nombre: "Vaina", precio: 3000 },
      { nombre: "Caipiriña", precio: 4700 },
      { nombre: "Martini Seco", precio: 3200 },
    ],
  },
  {
    categoria: "Tragos Cortos",
    productos: [
      { nombre: "Corto Capel", precio: 2600 },
      { nombre: "Corto Alto del Carmen", precio: 3400 },
      { nombre: "Corto Tres Palos", precio: 2800 },
      { nombre: "Corto Gin Beefeater", precio: 2500 },
      { nombre: "Corto Gin Bosfords", precio: 2000 },
      { nombre: "Corto Martini", precio: 1900 },
      { nombre: "Corto Campari", precio: 2600 },
      { nombre: "Corto Vodka Eristoff", precio: 3000 },
      { nombre: "Corto Vodka Stolichnaya", precio: 3500 },
      { nombre: "Corto Bacardí", precio: 2400 },
      { nombre: "Corto Bacardí Añejo", precio: 3000 },
      { nombre: "Corto Havana", precio: 3500 },
      { nombre: "Corto Havana 7 Años", precio: 5000 },
      { nombre: "Corto Tequila", precio: 4000 },
      { nombre: "Corto 100 Pipers", precio: 3500 },
      { nombre: "Corto Ballantine's", precio: 5000 },
      { nombre: "Corto Johnnie Walker Rojo", precio: 5000 },
      { nombre: "Corto Chivas Regal", precio: 6900 },
      { nombre: "Corto Ballantine's 12 Años", precio: 5500 },
      { nombre: "Corto Jack Daniel's", precio: 6500 },
      { nombre: "Corto Mistral", precio: 3500 },
      { nombre: "Corto Jägermeister", precio: 4000 },
    ],
  },
  {
    categoria: "Botellas",
    productos: [
      { nombre: "Botella Capel", precio: 22000 },
      { nombre: "Botella Alto del Carmen", precio: 28000 },
      { nombre: "Botella Tres Palos", precio: 22000 },
      { nombre: "Botella Mistral", precio: 29000 },
      { nombre: "Botella José Cuervo", precio: 33000 },
      { nombre: "Botella Ron Bacardí", precio: 25000 },
      { nombre: "Botella Ballantine's", precio: 41000 },
      { nombre: "Botella Jack Daniel's", precio: 53900 },
      { nombre: "Botella Johnnie Walker Rojo", precio: 41000 },
      { nombre: "Botella Chivas Regal", precio: 57000 },
      { nombre: "Botella Eristoff", precio: 24000 },
      { nombre: "Botella 100 Pipers", precio: 29000 },
      { nombre: "Botella Havana", precio: 29000 },
      { nombre: "Botella Havana 7 Años", precio: 41000 },
    ],
  },
  {
    categoria: "Vinos",
    productos: [
      { nombre: "Undurraga Cabernet Pinot", precio: 9900 },
      { nombre: "Undurraga Rhin", precio: 9900 },
      { nombre: "Undurraga Cabernet Pinot 1/2", precio: 6500 },
      { nombre: "Undurraga Rhin 1/2", precio: 6500 },
      { nombre: "Misiones de Rengo Varietal", precio: 9900 },
      { nombre: "Misiones de Rengo Reserva", precio: 11900 },
      { nombre: "Misiones de Rengo Reserva Cabernet Syrah", precio: 11900 },
      { nombre: "Misiones de Rengo Cuvée", precio: 15900 },
      { nombre: "Santa Rita 120 Tres Medallas", precio: 9900 },
      { nombre: "Santa Rita 120 Tres Medallas 1/2", precio: 6500 },
      { nombre: "Carmen Margaux", precio: 9900 },
      { nombre: "Carmen Margaux 1/2", precio: 6500 },
      { nombre: "Concha y Toro Casillero del Diablo", precio: 13900 },
      { nombre: "Concha y Toro Casillero del Diablo 1/2", precio: 7900 },
      { nombre: "Casa Silva Reserva", precio: 14900 },
      { nombre: "Valdivieso Demi Sec", precio: 15900 },
      { nombre: "Miguel Torres Santa Digna", precio: 16900 },
      { nombre: "Miguel Torres Santa Digna 1/2", precio: 9900 },
      { nombre: "Castillo de Molina Reserva", precio: 16900 },
      { nombre: "Miguel Torres Sangre de Toro", precio: 22900 },
      { nombre: "Concha y Toro Marqués Casa Concha", precio: 23900 },
      { nombre: "Montes Alpha", precio: 26900 },
    ],
  },
];

/** Id estable y legible a partir del nombre ("Mojito Jäger" → "mojito-jager"). */
function idDeProducto(nombre: string): string {
  return normalizar(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const CATEGORIAS: string[] = CATALOGO.map((c) => c.categoria);

export const PRODUCTOS: Producto[] = CATALOGO.flatMap((c) =>
  c.productos.map((p) => ({
    id: idDeProducto(p.nombre),
    nombre: p.nombre,
    categoria: c.categoria,
    precio: p.precio,
  }))
);

// Los ids derivan del nombre: si la carta repitiera un nombre, fallar al
// cargar es preferible a mezclar consumos de dos productos distintos.
if (new Set(PRODUCTOS.map((p) => p.id)).size !== PRODUCTOS.length) {
  throw new Error("Catálogo con productos duplicados: revisa los nombres");
}

const POR_ID = new Map(PRODUCTOS.map((p) => [p.id, p]));

export function getProducto(id: string): Producto {
  const producto = POR_ID.get(id);
  if (!producto) throw new Error(`Producto desconocido: ${id}`);
  return producto;
}
