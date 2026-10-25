// Invented people for the demo school. First names and surnames are common in Colombia; combinations are made up.
export const FIRST = [
  "Valentina", "Santiago", "Sofía", "Mateo", "Isabella", "Samuel", "Camila", "Juan Esteban", "Mariana", "Sebastián",
  "Daniela", "Nicolás", "Luciana", "Emmanuel", "Gabriela", "Andrés", "Salomé", "Tomás", "Paula", "Felipe",
  "Manuela", "David", "Juliana", "Alejandro", "Sara", "Miguel Ángel", "Laura", "Simón", "Natalia", "Joaquín",
  "Antonia", "Esteban", "María José", "Daniel", "Catalina", "Julián", "Ana Sofía", "Cristian", "Karen", "Brayan",
  "Luisa", "Diego", "Tatiana", "Kevin", "Mónica", "Jhon", "Yurany", "Óscar", "Lina", "Camilo",
];
export const LAST = [
  "Rodríguez", "Gómez", "González", "Martínez", "López", "Hernández", "Díaz", "Pérez", "Sánchez", "Ramírez",
  "Torres", "Vargas", "Castro", "Rojas", "Moreno", "Jiménez", "Ortiz", "Gutiérrez", "Ruiz", "Mendoza",
  "Cárdenas", "Pineda", "Quintero", "Ospina", "Cortés", "Arias", "Salazar", "Parra", "Herrera", "Zapata",
  "Acosta", "Cifuentes", "Bermúdez", "Reyes", "Montoya", "Calderón", "Duarte", "Franco", "Lozano", "Navarro",
];
export const TEACHERS = [
  ["Marcela", "Ríos"], ["Hernán", "Castaño"], ["Liliana", "Peña"], ["Jorge", "Ballesteros"], ["Adriana", "Fonseca"], ["Ricardo", "Tamayo"],
];
const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
export const emailOf = (first, last, n) => `${fold(first)}.${fold(last)}${n ? n : ""}@demo.invalid`;
