// Every tutorial of the app, as data. Each step: { id, title, text, bullets, target, route, owl, final, extra }.
// `target` names a [data-tour] element ("a|b" tries a, then b); `route` moves the app first. Bullets are written
// "Name: what it does", so each function the school gets is named where it lives. The coverage list for the sales
// checklist is generated from these same steps (scripts/tour-coverage.mjs).
import { BETA_STEP } from "../components/Beta.jsx";

const seen = (list) => list.filter(Boolean);

// ——— Teacher panel ————————————————————————————————————————————————————————————————————————————————————

// Which tutorial belongs to a route of the teacher panel.
export function teacherTourId(route) {
  if (!route) return null;
  if (route.section === "actividades" && route.tab === "nueva") return "nueva";
  return { hoy: "hoy", actividades: "actividades", actividad: "actividad", estudiantes: "estudiantes", resultados: "resultados", biblioteca: "biblioteca", colegio: "colegio", cuenta: "cuenta" }[route.section] ?? null;
}
export const TEACHER_TOUR_IDS = ["hoy", "actividades", "nueva", "actividad", "cuadernillo", "estudiantes", "resultados", "biblioteca", "colegio", "cuenta"];

const LABELS = {
  hoy: "Tutorial · Hoy", actividades: "Tutorial · Actividades", nueva: "Tutorial · Nueva actividad", actividad: "Tutorial · Una actividad",
  cuadernillo: "Cómo hacer un cuadernillo", estudiantes: "Tutorial · Estudiantes", resultados: "Tutorial · Resultados", biblioteca: "Tutorial · Biblioteca",
  colegio: "Tutorial · Colegio", cuenta: "Tutorial · Mi cuenta",
};

function hoySteps({ admin, name, first, intro = true }) {
  return seen([
    intro && { id: "hola", owl: "happy", title: `¡Hola${name ? `, ${name}` : ""}!`, text: "Este es tu espacio docente. Cada sección tiene su propio tutorial: se abre la primera vez que entras y lo repites cuando quieras con el botón «?» de arriba. En «Todas las funciones» ves la lista completa. Empezamos por Hoy." },
    intro && BETA_STEP,
    { id: "hoy", route: { section: "hoy" }, target: "nav-hoy", title: "Hoy, tu inicio", text: "Todo lo que pide atención en tus clases, en una sola pantalla.",
      bullets: [
        "Cifras de la semana: entregas, promedio de las últimas 4 semanas con su cambio, actividades abiertas y estudiantes que necesitan apoyo.",
        "Accesos rápidos: Nueva actividad, Escanear hojas, Proyectar clase y Juego en vivo.",
      ] },
    { id: "hoy-alertas", route: { section: "hoy" }, target: "page", title: "Alertas, clases y calendario", bullets: [
      "Alertas y pendientes: una clase que bajó o subió, pocas entregas, una actividad para volver a enseñar (con «Repaso» en diapositivas), un estudiante que bajó en un área o tiene tres entregas bajas seguidas, buenas noticias.",
      "Cada alerta: Ver la lista, Uno por uno, Ver perfil, A seguimiento, Listo y Posponer 1 semana. Las alertas iguales se agrupan en una fila.",
      "Resumen de la semana y la cola de seguimiento (Abrir la cola).",
      "Mis clases: cada curso y materia con su promedio y cuánto entregó.",
      "Dónde cuesta más: las áreas o actividades con el promedio más bajo.",
      "Anuncios para tus estudiantes: escribir, Fijar, Desfijar y Borrar.",
      "Calendario del mes con lo que abre y cierra; toca una entrega para abrirla.",
      "Resultados nuevos: lo último que entró, en línea y en papel.",
      "«Invita a otros profes»: comparte tu enlace por WhatsApp, correo o copiándolo. Cuando los estudiantes de los profes que invitas empiezan a practicar, subes de nivel y tus estudiantes reciben más preguntas al día.",
    ] },
    { id: "ctx", target: "context", title: "Materia y curso", text: "Elige una materia, un curso o un grupo y todo el panel se filtra a esa clase. Coordinación también ve «Todo el colegio». Las clases donde solo tienes permiso de ver aparecen como «Solo ves»." },
    { id: "nueva", target: "new", title: "Nueva actividad", text: "El botón principal: crea cualquier tipo de actividad desde cualquier sección.",
      bullets: ["Tarea, Práctica en clase, Quiz, Simulacro con tiempo y Simulacro en papel.", "También Juego en vivo, Clase para proyectar, Desde el banco de preguntas y Refuerzo personal."] },
    { id: "vivo", target: "live", title: "Juego en vivo", text: "Proyecta preguntas en clase y tus estudiantes responden desde el celular con un código o un QR. Sin posiciones ni ranking: cada estudiante se compara solo consigo mismo." },
    { id: "bell", target: "bell", title: "Novedades", text: "La campana guarda un recibo de todo lo que guardas (actividades, listas importadas, hojas escaneadas, refuerzos) con los lugares donde quedaron los datos." },
    { id: "nav", target: "nav|nav-actividades", title: "Las demás secciones", text: "Cada una abre su propio tutorial la primera vez.",
      bullets: seen([
        "Actividades: todas tus tareas, prácticas, simulacros, juegos en vivo y refuerzos.",
        "Estudiantes: cada estudiante de todas tus clases, seguimiento, grupos y listas de clase.",
        "Resultados: puntaje como el ICFES, hoja de datos con gráficas, tableros y calificación.",
        "Biblioteca: banco de preguntas del ICFES, tus preguntas, clases para proyectar y control de preguntas.",
        admin && "Colegio (solo coordinación): cursos y materias, docentes y permisos, quién hizo qué, calificación y ajustes.",
      ]) },
    { id: "side", target: "side-help", title: "Ayuda y datos de ejemplo", bullets: [
      "Tutorial de esta sección y Recorrido completo: repite cualquier tutorial o recorre todas las funciones de una vez.",
      "Datos de ejemplo: mira todas las herramientas con un colegio inventado, sin tocar el tuyo; apágalo para volver.",
      "Mi cuenta y permisos, contraer la barra lateral y Volver a la app de estudiante (ves exactamente lo que ven tus estudiantes).",
    ] },
    first && { id: "listo", owl: "celebrating", final: true, title: "¡Listo para empezar!", text: "Estos son tus primeros pasos; se marcan solos a medida que avanzas.", extra: first },
  ]);
}

function actividadesSteps({ openTour }) {
  return [
    { id: "a-todas", route: { section: "actividades", tab: "lista" }, target: "tab-lista", title: "Todas las actividades", bullets: [
      "Tarjetas agrupadas por materia, con su estado (Abierta, Programada, Cerrada o Borrador), cuántos entregaron y su promedio.",
      "Filtros Abiertas y Cerradas, por clase y por materia. Toca una actividad para abrir su página.",
    ] },
    { id: "a-tipos", route: { section: "actividades", tab: "tareas" }, target: "tab-tareas", title: "Tareas, prácticas y simulacros", bullets: [
      "Tareas: para resolver en casa antes de una fecha.",
      "Prácticas en clase: en el salón, con corrección inmediata.",
      "Simulacros: con cronómetro, en línea o en papel, como el examen real.",
    ] },
    { id: "a-vivo", route: { section: "actividades", tab: "vivo" }, target: "tab-vivo", title: "Juego en vivo", bullets: [
      "Nueva sala: empieza ahora o programa el día y la hora (tus estudiantes lo ven en su inicio).",
      "Código y QR para entrar desde el celular; modo de juego normal o «la clase discute y vuelve a responder».",
      "Durante el juego: Siguiente pregunta, Cerrar y mostrar respuesta, Cómo respondieron, Cómo va la clase, pausa y Terminar juego.",
      "Seguridad de cada respuesta: quién acertó seguro y quién con dudas, para saber qué explicar otra vez.",
      "Al final: informe de la clase, Tarea de refuerzo con las falladas y Juegos anteriores. Sin ranking.",
    ] },
    { id: "a-refuerzo", route: { section: "actividades", tab: "refuerzo" }, target: "tab-refuerzo", title: "Refuerzo personal", text: "Un plan distinto para cada estudiante con las preguntas que más ha fallado: eliges cuadernillo, cuántas preguntas y la fecha, y «Calcular planes» los arma todos." },
    { id: "a-nueva", target: "new", title: "Crear una actividad", text: "Desde «Nueva actividad» eliges el tipo y armas la actividad; su propio tutorial te guía la primera vez.",
      extra: openTour ? <TourLink onClick={() => openTour("cuadernillo")}>¿Vas a imprimir? Ver «Cómo hacer un cuadernillo»</TourLink> : null },
  ];
}

function nuevaSteps() {
  return [
    { id: "n-banco", target: "ab-bank", title: "1. Elige las preguntas", bullets: [
      "Cuadernillo: cualquier sesión del ICFES (S11-A, B, C…) o tus propias preguntas.",
      "Filtros: área, competencia, componente, tipo de texto y dificultad (estimada con IA); buscar por palabra o tema.",
      "Ver: mira la pregunta completa antes de agregarla.",
      "Las que ya vio el grupo se ocultan («ya usadas, ocultas») para no repetir.",
    ] },
    { id: "n-auto", target: "ab-auto", title: "Agregar en bloque", bullets: [
      "Agregar las N: todas las que cumplen los filtros (por ejemplo, el cuadernillo completo).",
      "Elegir automáticamente: escribe cuántas y se escogen variadas.",
      "Según lo que el curso falla: propone las competencias donde tu curso tiene más errores.",
    ] },
    { id: "n-form", target: "ab-form", title: "2. Tu asignación", bullets: [
      "Lista de preguntas: ordenar ↑↓, quitar, Vaciar, Ordenar como el cuadernillo; tiempo estimado y dificultad media.",
      "Avisos de preguntas que el grupo ya vio o que el colegio reservó: Quitar las repetidas, Quitar las bloqueadas o Usar igual.",
      "Cursos: asigna a varios cursos a la vez.",
      "Tipo, título, fecha de apertura y de entrega, tiempo en minutos e intentos permitidos.",
      "Rutina semanal: elige muchas preguntas y repártelas en 2 a 8 semanas; queda programada una tarea por semana.",
      "Mostrar respuestas y explicaciones: al entregar, cuando cierre o nunca; corrección inmediata o al final.",
      "Calificación: como la clase o un modelo propio para esta actividad.",
      "Reservar estas preguntas para el simulacro, Monitorear el examen (aviso al salir de la pestaña), Permitir pistas y definiciones de palabras escritas por ti.",
      "También como Diapositivas o Hoja de trabajo con las mismas preguntas.",
    ] },
    { id: "n-entrega", target: "ab-delivery", title: "En línea o en papel", text: "«En línea» se resuelve en el celular o el computador. «En papel» crea el cuadernillo impreso y las hojas de burbujas que luego escaneas con el celular." },
    { id: "n-asignar", target: "ab-submit", title: "3. Asignar", text: "Al asignar te llevamos a la página de la actividad y verás un recibo con todo lo que se guardó. En papel, el botón dice «Crear e imprimir» y te lleva directo a imprimir." },
  ];
}

function actividadSteps({ activityId }) {
  const at = (tab) => (activityId ? { section: "actividad", id: activityId, tab } : null);
  return seen([
    { id: "ap-steps", route: at("resultados"), target: "ap-steps", title: "El recorrido de la actividad", text: "Cada actividad muestra en qué va: Crear, Entregar, Recoger, Calificar y Resultados, con lo que falta en cada paso." },
    { id: "ap-actions", target: "ap-actions", title: "Imprimir y escanear", text: "Cualquier actividad se puede imprimir y calificar con hojas escaneadas, aunque la hayas creado en línea." },
    { id: "ap-tools", target: "ap-tools", title: "Lo de todos los días, en un toque", bullets: [
      "Dar más tiempo o Reabrir: +1 día, +3 días, +1 semana u otra fecha; los estudiantes la ven de inmediato.",
      "Recordar a quienes faltan: la lista de quién no ha entregado y un mensaje listo para publicar en la clase, copiar o enviar por WhatsApp.",
      "Usar en otra clase: las mismas preguntas y ajustes en otros cursos, con sus propias fechas.",
    ] },
    { id: "ap-res", route: at("resultados"), target: "ap-tab-resultados", title: "Resultados", bullets: [
      "Mapa y tabla por pregunta: Por número o Más falladas, filtrado por área.",
      "Autopsia de cada pregunta: qué eligió cada estudiante. Proyectar las más falladas en clase.",
      "Crear refuerzo con las más falladas.",
      "Estudiantes: quién entregó y quién falta; detalle por estudiante con sus respuestas, el tiempo en cada pregunta, las pistas y las más lentas.",
      "Salidas de la pestaña si monitoreaste el examen.",
      "Informe familiar con su enlace, Exportar CSV, CSV por pregunta, Imprimir o PDF, Cerrar ahora y Borrar.",
    ] },
    { id: "ap-papel", route: at("papel"), target: "ap-tab-papel", title: "En papel", bullets: [
      "Pasarla a en línea o hacerla solo en papel, y cuándo conviene cada una.",
      "Plano del salón: versiones del cuadernillo y puestos.",
      "Cuadernillo, Hojas de respuestas y Escanear hojas (cámara del celular o fotos).",
    ] },
    { id: "ap-cal", route: at("calificacion"), target: "ap-tab-calificacion", title: "Calificación", text: "El modelo de nota de esta actividad, si quieres uno distinto al de la clase: porcentaje, escala del colegio, estimado Saber 11, IRT o tu propia fórmula." },
  ]);
}

function cuadernilloSteps({ paper }) {
  const at = (tab) => (paper ? { section: "actividad", id: paper, tab } : null);
  return seen([
    { id: "c-hola", owl: "happy", title: "Cómo hacer un cuadernillo", text: "Un cuadernillo impreso se hace en tres pasos: eliges las preguntas, imprimes (cuadernillo y hojas de respuestas) y escaneas las hojas con el celular. Hay tres caminos para empezar:",
      bullets: [
        "Simulacro en papel: Nueva actividad › Simulacro en papel. Es el camino para calificar con el escáner.",
        "Desde el banco: Biblioteca › Banco de preguntas, marca preguntas y elige «Examen en papel».",
        "Desde una clase: Biblioteca › Clases para proyectar › Cuadernillo de examen (para imprimir sin calificar en línea).",
      ] },
    { id: "c-nueva", route: { section: "actividades", tab: "nueva", preset: "papel" }, target: "ab-bank", title: "1. Elige las preguntas", text: "Para un simulacro completo, elige el cuadernillo y toca «Agregar las N». Para uno corto, filtra por área o usa «Elegir automáticamente»." },
    { id: "c-papel", target: "ab-delivery", title: "«En papel» ya está elegido", text: "Así la actividad queda lista para imprimir y para escanear. Elige el curso, la fecha y toca «Crear e imprimir»." },
    { id: "c-plano", route: at("papel"), target: "paper-seating", title: "2. Plano del salón (opcional)", text: "Para evitar copia: hasta cuatro versiones del cuadernillo con las preguntas en otro orden dentro de cada área, y cada estudiante en su puesto. Imprime el plano para el salón." },
    { id: "c-cuadernillo", target: "paper-booklet", title: "3. Imprimir cuadernillo", text: "Abre el estudio de impresión: eliges el tipo de cuadernillo a la izquierda y ajustas papel, página, letra, portada y encabezado, con la vista previa al lado. Sale una copia por versión y la clave del docente." },
    { id: "c-hojas", target: "paper-sheets", title: "4. Hojas de respuestas", text: "Una hoja por estudiante con su código, su versión y las burbujas A a D. Imprime al 100 %, sin «ajustar a la página»." },
    { id: "c-escanear", target: "paper-scan", title: "5. Escanear hojas", text: "Pasa las hojas llenas frente a la cámara del celular (escáner continuo) o sube fotos. Cada hoja se califica con la clave de su versión y los resultados entran junto con los de en línea." },
    { id: "c-fin", owl: "celebrating", final: true, title: "Así de simple", text: "Los resultados salen en la pestaña Resultados de la actividad y en Resultados › Hoja de datos. Todo lo que imprimes lleva en el pie el nombre de tu colegio, la fecha y una referencia." },
  ]);
}

function estudiantesSteps() {
  return [
    { id: "e-lista", route: { section: "estudiantes", tab: "lista" }, target: "tab-lista", title: "Todos tus estudiantes", bullets: [
      "Una sola lista con los estudiantes de todas tus clases: buscar por nombre, correo, clase, grupo o estado.",
      "Filtros rápidos: Necesitan atención, En seguimiento, Tareas sin entregar, Sin ingresar, Mejoraron.",
      "Más filtros: promedio mínimo y máximo, espacio, grupo, estado, alertas, trabajo (incluye «con salidas en exámenes»). Guardar vista para volver a usarla.",
      "Acciones en bloque: cambiar estado, grupo o seguimiento, y exportar. Exportar lista en CSV.",
    ] },
    { id: "e-perfil", target: "page", title: "El perfil de cada estudiante", text: "Toca un estudiante para abrir todo su trabajo:", bullets: [
      "Alertas, cifras y la línea de progreso; resultados por área y actividad por semana.",
      "Todas sus asignaciones e Historial completo, con cada respuesta.",
      "Notas del docente, estado, grupo y seguimiento con fecha y motivo (+1 semana).",
      "Anterior y Siguiente para recorrer la lista, y preparar un plan de refuerzo.",
    ] },
    { id: "e-org", target: "page", title: "Seguimiento, grupos y estados", bullets: [
      "Seguimiento: la cola de estudiantes con fecha y motivo; ciérralo con una nota.",
      "Grupos: los que tú armes (por ejemplo «Refuerzo de lectura»).",
      "Estados del colegio: etiquetas propias para cada estudiante.",
    ] },
    { id: "e-clases", route: { section: "estudiantes", tab: "clases" }, target: "tab-clases", title: "Listas de clase", bullets: [
      "Nueva clase: materia, grado y grupo.",
      "Agregar estudiantes pegando la lista con nombres y correos o subiendo un CSV; al importar ves un recibo.",
      "Ver lista, docentes del curso, quitar un estudiante y borrar el curso.",
    ] },
  ];
}

function resultadosSteps() {
  return [
    { id: "r-resumen", route: { section: "resultados", tab: "resumen" }, target: "tab-resumen", title: "Resumen", bullets: [
      "Estimado Saber 11 del colegio calculado como el ICFES (0 a 500), niveles de desempeño, Inglés con niveles MCER y percentil nacional.",
      "Categoría del colegio estimada (A+ a D) y promedios por área.",
      "Lo que dicen todas las respuestas: patrones de error. Imprimir o guardar PDF.",
    ] },
    { id: "r-act", route: { section: "resultados", tab: "actividades" }, target: "tab-actividades", title: "Por actividad", text: "Todas las actividades con sus entregas y su promedio; cada una abre su página." },
    { id: "r-hoja", route: { section: "resultados", tab: "grafica" }, target: "tab-grafica", title: "Hoja de datos", bullets: [
      "Una hoja de cálculo con todo: Entregas, Estudiantes o Respuestas; por estudiante o todas las entregas.",
      "Plantillas listas (por ejemplo «Nota media por estudiante»), Columnas, Colores, Agregar columna con fórmulas y orden por cualquier columna.",
      "Tabla dinámica y Gráfica: barras, líneas, mapa de calor y más, con su editor al lado.",
      "Gráficas guiadas, Pantalla completa, Copiar y CSV.",
    ] },
    { id: "r-tableros", route: { section: "resultados", tab: "tableros" }, target: "tab-tableros", title: "Tableros", text: "Junta tus gráficas en un tablero que se actualiza solo. Empieza con «Crear un tablero de ejemplo» o uno vacío." },
    { id: "r-cal", route: { section: "resultados", tab: "calificacion" }, target: "tab-calificacion", title: "Calificación", bullets: [
      "Para todo el colegio, una clase o una actividad (la más específica gana).",
      "Porcentaje de aciertos, escala del colegio (1,0 a 5,0), estimado Saber 11, puntaje por dificultad (IRT) o tu propia fórmula.",
      "Ajustes opcionales: pistas que restan, errores que restan, curvas por área y crédito parcial. Notas finales por periodo.",
      "Notas finales: desempeño Bajo, Básico, Alto o Superior; orden por nombre, apellido o nota; Copiar solo las notas finales para la plataforma del colegio.",
      "Informes para padres: una página por estudiante con su nota, sus actividades, sus aciertos por área y tu observación, lista para imprimir o guardar en PDF.",
    ] },
  ];
}

function bibliotecaSteps() {
  return [
    { id: "b-banco", route: { section: "biblioteca", tab: "banco" }, target: "tab-banco", title: "Banco de preguntas", bullets: [
      "Todas las preguntas de los cuadernillos del ICFES, por sesión y área, con la fuente ICFES en cada una.",
      "Editar: corrige o adapta la versión de tu colegio; Volver a la original cuando quieras.",
      "Uso: dónde y cuándo se usó cada pregunta.",
      "Marca preguntas y conviértelas en Diapositivas, Proyectar ahora, Hoja de trabajo, Quiz, Tarea, Práctica en clase, Examen con tiempo o Examen en papel.",
      "Protección del banco: cada cuenta abre un número limitado de cuadernillos nuevos al día (lo ves bajo los filtros); volver a abrir uno ya abierto y los de tus actividades no cuentan.",
    ] },
    { ...BETA_STEP, id: "b-beta", target: "tab-banco", owl: null, title: "Si una pregunta tiene un error", text: "Estamos en beta y muchas preguntas aún pueden tener errores de formato. Corrígela para tu colegio con «Editar» o avísanos con «Reportar un error» desde la vista de estudiante." },
    { id: "b-mias", route: { section: "biblioteca", tab: "preguntas" }, target: "tab-preguntas", title: "Mis preguntas", bullets: [
      "Nueva pregunta con un editor tipo Word: texto, imágenes, tablas y fórmulas.",
      "Trae preguntas de un PDF o una foto al lado: recorta y lee el texto (OCR), o «Detectar preguntas» para separarlas solas.",
      "Copiar y editar, Borrar. Tus preguntas se usan igual que las del ICFES en cualquier actividad.",
    ] },
    { id: "b-clases", route: { section: "biblioteca", tab: "clases" }, target: "tab-clases", title: "Clases para proyectar", bullets: [
      "Arma diapositivas con preguntas, texto o imágenes; ordénalas, duplícalas y elige el diseño (centrada, con objetivos, franja, con imagen, solo título).",
      "Crea una clase con las preguntas de una asignación que ya tienes.",
      "Presentar: revela respuesta y explicación paso a paso, lápiz para marcar, contar manos, quién responde (nombre al azar), cronómetro, pantalla negra, alto contraste, letra más grande o más pequeña y notas.",
      "Convertir en actividad, Jugar en vivo, Hoja de trabajo, Cuadernillo de examen y Clave del docente.",
    ] },
    { id: "b-control", route: { section: "biblioteca", tab: "control" }, target: "tab-control", title: "Control de preguntas", bullets: [
      "Mapa de cada cuadernillo: qué preguntas se usaron, en tareas o simulacros, cuáles se repitieron.",
      "Reservar para un simulacro, Ocultar de la práctica libre o Liberar; una por una, varias o el cuadernillo completo.",
      "Reglas del colegio: bloquear o avisar cuando una pregunta de tarea se repite en un simulacro.",
    ] },
  ];
}

function colegioSteps({ admin }) {
  if (!admin) return [{ id: "co-no", title: "Colegio", text: "Esta sección es de coordinación. Si necesitas cambiar cursos, permisos o la calificación del colegio, pídelo a tu coordinador." }];
  return [
    { id: "co-cursos", route: { section: "colegio", tab: "cursos" }, target: "tab-cursos|nav-colegio", title: "Cursos y materias", bullets: [
      "Nuevo curso: se crea con sus cinco materias del ICFES y todos sus estudiantes.",
      "Tabla de grupos por áreas: quién dicta qué. Asignar docente en cada celda, con permiso Edita o Solo ve.",
      "Director de grupo, Importar lista de estudiantes y Ver curso. Filtra por grado.",
    ] },
    { id: "co-docentes", route: { section: "colegio", tab: "docentes" }, target: "tab-docentes|nav-colegio", title: "Docentes", bullets: [
      "Invitar docentes; ver sus clases, estudiantes y actividades del mes.",
      "Permisos: hacer coordinación, pasar a docente, quitar permisos, dar acceso a una materia.",
    ] },
    { id: "co-registro", route: { section: "colegio", tab: "registro" }, target: "tab-registro|nav-colegio", title: "Quién hizo qué", text: "El registro de todo lo que hace el equipo: actividades creadas, clases, preguntas y cambios de coordinación, con filtros por persona y por tipo." },
    { id: "co-cal", route: { section: "colegio", tab: "calificacion" }, target: "tab-calificacion|nav-colegio", title: "Calificación del colegio", text: "El modelo de nota que usan todas las clases que no tengan uno propio." },
    { id: "co-ajustes", route: { section: "colegio", tab: "ajustes" }, target: "tab-ajustes|nav-colegio", title: "Ajustes", bullets: [
      "Nombre del colegio, grados que tiene, año escolar y periodos.",
      "Código de docente: cópialo para que los docentes entren con su correo, o genera uno nuevo.",
      "Autorización de acudientes y consentimientos.",
      "Formato de impresión del colegio (se guarda desde el estudio del cuadernillo).",
    ] },
  ];
}

function cuentaSteps() {
  return [{ id: "cu", route: { section: "cuenta" }, target: "page", title: "Mi cuenta y permisos", text: "Tu nombre, tus clases y qué puedes editar o solo ver en cada una. Desde aquí también vas a la app de estudiante." }];
}

export function teacherTour(id, ctx) {
  const steps = {
    hoy: () => hoySteps(ctx),
    actividades: () => actividadesSteps(ctx),
    nueva: () => nuevaSteps(ctx),
    actividad: () => actividadSteps({ ...ctx, activityId: ctx.activityId ?? ctx.sample }),
    cuadernillo: () => cuadernilloSteps(ctx),
    estudiantes: () => estudiantesSteps(ctx),
    resultados: () => resultadosSteps(ctx),
    biblioteca: () => bibliotecaSteps(ctx),
    colegio: () => colegioSteps(ctx),
    cuenta: () => cuentaSteps(ctx),
  }[id]?.() ?? hoySteps(ctx);
  return { label: LABELS[id] ?? "Tutorial", steps };
}

// «Todas las funciones»: every function the school gets, grouped by section. Each one opens its section's tutorial
// at that step, on its own screen (a long tour chaining every section lost people). Built from the same steps.
const INDEX = [
  ["hoy", "Hoy", "home"], ["actividades", "Actividades", "grid"], ["nueva", "Nueva actividad", "plus"], ["actividad", "Una actividad", "flag"],
  ["cuadernillo", "Cuadernillos en papel", "print"], ["estudiantes", "Estudiantes", "users"], ["resultados", "Resultados", "chart"],
  ["biblioteca", "Biblioteca", "book"], ["colegio", "Colegio", "school"], ["cuenta", "Mi cuenta", "user"],
];
export function teacherFeatureIndex(ctx) {
  return INDEX
    .filter(([id]) => id !== "colegio" || ctx.admin)
    .filter(([id]) => id !== "actividad" || ctx.activityId || ctx.sample)
    .map(([id, title, icon]) => {
      const steps = teacherTour(id, { ...ctx, intro: false, first: null }).steps;
      const items = steps.map((s, k) => ({ title: s.title, start: k, final: s.final })).filter((s) => !s.final || steps.length === 1);
      return { id, title, icon, items };
    });
}

// A tour opened at step k: that step moves the app to the screen the earlier steps were on.
export function tourFrom(steps, k = 0) {
  if (!k || steps[k]?.route) return steps;
  const route = steps.slice(0, k + 1).reverse().find((s) => s.route)?.route;
  return route ? steps.map((s, n) => (n === k ? { ...s, route } : s)) : steps;
}

// The booklet print studio (BookletStudio): its own tutorial the first time it opens.
export function studioTour({ versions = false, answerSheets = true, schoolStyle = false } = {}) {
  return seen([
    { id: "s-hola", owl: "happy", title: "El estudio del cuadernillo", text: "Aquí diagramas el cuadernillo como el del ICFES o con el formato de tu colegio. Lo que ves a la derecha es exactamente lo que sale de la impresora." },
    { id: "s-doc", target: "bks-doc", title: "Qué imprimir", bullets: seen([
      "Cuadernillo: el que reciben los estudiantes.",
      answerSheets && "Hoja de respuestas: para calificar a mano.",
      "Clave del docente: respuestas de cada versión. Imprímela aparte.",
    ]) },
    versions && { id: "s-ver", target: "bks-versions", title: "Versiones", text: "Si armaste el plano del salón, hay un cuadernillo por versión (A, B, C, D). Imprime todas o una sola." },
    { id: "s-tipo", route: { doc: "booklet", tab: "plantilla" }, target: "bks-rail", title: "Tipo de cuadernillo y opciones", text: "A la izquierda están los grupos de opciones, cada uno con lo que tiene elegido; al tocar uno, sus opciones aparecen al lado.",
      bullets: ["Tipo de cuadernillo: Como el ICFES, Editorial a color, Ahorro de papel, Lectura cómoda o el Formato del colegio."] },
    { id: "s-papel", route: { tab: "papel" }, target: "bks-opts", title: "Papel", bullets: [
      "Carta, A4 u oficio.",
      "Encuadernación: hojas sueltas grapadas, plegado como un libro (cosido al centro) o pequeño (media carta).",
      "Una o doble cara, y blanco y negro o a color.",
    ] },
    { id: "s-pagina", route: { tab: "pagina" }, target: "bks-opts", title: "Página", bullets: ["Márgenes estrechos, normales, amplios o a medida.", "Una o dos columnas, con línea entre columnas.", "Cada prueba en página nueva o seguida; siempre en página derecha."] },
    { id: "s-letra", route: { tab: "letra" }, target: "bks-opts", title: "Letra", bullets: ["Fuente, tamaño e interlineado.", "Espacio entre preguntas y espacio para operaciones en Matemáticas.", "Opciones cortas una al lado de la otra para ahorrar papel."] },
    { id: "s-portada", route: { tab: "portada" }, target: "bks-opts", title: "Portada", bullets: ["Página completa, arriba de la primera página o sin portada.", "Nombre y logo del colegio, texto sobre el título y subtítulo.", "Página de instrucciones, instrucción adicional, hoja de respuestas para recortar y contraportada."] },
    { id: "s-bordes", route: { tab: "bordes" }, target: "bks-opts", title: "Encabezado y pie", bullets: ["Encabezado con tu texto y el nombre de la prueba.", "Número de página (con el total si quieres) y texto del pie. La fuente ICFES siempre va en el pie."] },
    schoolStyle && { id: "s-save", target: "bks-save", title: "Formato del colegio", text: "Coordinación puede guardar este formato para que todos los docentes impriman igual. «Volver al formato inicial» deshace los cambios." },
    { id: "s-hint", target: "bks-hint", title: "Antes de imprimir", text: "Aquí ves cuántas páginas y hojas salen, cómo poner el papel en la impresora y, si tu impresora no imprime por las dos caras, cómo hacerlo en dos pasadas." },
    { id: "s-print", target: "print-go", title: "Imprimir o guardar PDF", text: "Imprime directamente o elige «Guardar como PDF» para mandarlo a una imprenta. Lo que imprimes lleva en el pie el nombre de tu colegio, quién imprimió, la fecha y una referencia.", final: true },
  ]);
}

// ——— Student app —————————————————————————————————————————————————————————————————————————————————————

export function studentTourId(view) {
  return { home: "inicio", subjects: "materias", setup: "practicar", test: "simulacro", results: "resultados", review: "revision", progress: "progreso", profile: "perfil", liveJoin: "vivo" }[view] ?? null;
}
export const STUDENT_TOUR_IDS = ["inicio", "materias", "practicar", "simulacro", "resultados", "revision", "progreso", "perfil", "vivo"];

export function studentTour(id, { name = null, signedIn = true } = {}) {
  const tours = {
    inicio: { label: "Tutorial · Inicio", steps: seen([
      { id: "hola", owl: "happy", title: `¡Hola${name ? `, ${name}` : ""}!`, text: "Así se usa Cóndor para prepararte para el Saber 11. Cada pantalla tiene un tutorial corto que se abre la primera vez; lo repites con el botón «?»." },
      BETA_STEP,
      { id: "hero", target: "s-hero", title: "Lo siguiente que te toca", text: "Tu próxima tarea o la práctica de hoy de tu plan, lista para empezar." },
      { id: "meta", target: "s-goal", title: "Meta de hoy y racha", text: "Ganas XP con cada pregunta. El anillo muestra cuánto llevas de tu meta diaria y los días seguidos que has practicado." },
      signedIn && { id: "tareas", target: "s-tasks", title: "Tus tareas", text: "Las tareas de tus docentes con su materia, su estado y cuándo cierran. «Empezar» abre la tarea. También ves los anuncios de tus docentes." },
      signedIn && { id: "materias", target: "s-subjects", title: "Mis materias", text: "Cada materia con su docente, tu resultado y lo que tienes pendiente." },
      { id: "quick", target: "s-quick", title: "Practicar ya", bullets: ["Hoy en tu plan: la práctica que más te sirve hoy.", "Simulacro: con tiempo, como el examen.", "Repechaje: vuelve a las preguntas que fallaste."] },
      { id: "dominio", target: "s-mastery", title: "Dominio por área", text: "Cómo vas en cada prueba del ICFES. «Ver el reporte como el del ICFES» muestra tu puntaje estimado de 0 a 500." },
      { id: "cuenta", target: "s-count", title: "Cuenta regresiva", text: "Pon la fecha de tu Saber 11 en tu perfil y verás cuántos días faltan y cuántas preguntas te conviene hacer." },
      { id: "vivo", target: "s-live", title: "Juego en vivo", text: "Cuando tu docente proyecte un juego, entra aquí con el código o escaneando el QR. Los juegos programados también aparecen en tu inicio." },
      { id: "nav", target: "snav-subjects", title: "Tu menú", bullets: ["Inicio, Materias, Practicar, Progreso y Perfil.", "En el celular está abajo; en el computador, a la izquierda."], final: true },
    ]) },
    materias: { label: "Tutorial · Materias", steps: [
      { id: "m", target: "snav-subjects", title: "Materias", bullets: [
        "Mis materias: una página por materia con su docente, tus resultados, sus tareas y su historial.",
        "Tareas: todas tus tareas pendientes y entregadas, con su fecha de cierre; abre una entregada para ver tu resultado.",
        "Practicar el área: una práctica libre de esa materia.",
      ] },
    ] },
    practicar: { label: "Tutorial · Practicar", steps: [
      { id: "p", target: "snav-setup", title: "Practicar", bullets: [
        "Elige el cuadernillo y la sesión (Sesión 1 o 2), como en el examen real.",
        "Examen completo o un área, con tu dominio y las preguntas pendientes de cada una; cambia el orden de las áreas.",
        "Modo Práctica (respuesta inmediata, sin tiempo) o Cronometrado (resultados al entregar).",
        "Práctica a medida: elige competencias, dificultad y cuántas preguntas.",
        "Repechaje: solo las que fallaste antes.",
      ] },
    ] },
    simulacro: { label: "Tutorial · Simulacro", steps: seen([
      { id: "t-top", target: "t-top", title: "Arriba", text: "Tu avance, el cronómetro (en modo cronometrado) y la X para salir; tu avance se guarda y puedes continuar después." },
      { id: "t-flag", target: "t-flag", title: "Marcar para revisar", text: "Marca una pregunta para volver a ella antes de entregar." },
      { id: "t-map", target: "t-map|t-bottom", title: "Mapa de preguntas", text: "Salta a cualquier pregunta; ves cuáles respondiste y cuáles marcaste." },
      { id: "t-tools", title: "Mientras lees", bullets: [
        "Texto y pregunta lado a lado; en el celular cambias entre los dos. Acerca las figuras para verlas mejor.",
        "Resaltar y notas: selecciona un texto para resaltarlo o escribir una nota.",
        "Palabras con definición: si tu docente las agregó, toca la palabra subrayada.",
        "Pista: si tu docente la permite, una ayuda antes de responder.",
        "Si tu docente monitorea el examen, te avisamos: ve cuándo sales de la pestaña.",
      ] },
      { id: "t-bottom", target: "t-bottom", title: "Responder", text: "En práctica, «Comprobar» te dice si acertaste y muestra la explicación (hecha con IA); «Saltar» pasa a la siguiente. En cronometrado, «Entregar» al final." },
      { ...BETA_STEP, id: "t-report", target: "t-report", owl: null, title: "¿Ves un error en la pregunta?", final: true },
    ]) },
    resultados: { label: "Tutorial · Resultados", steps: [
      { id: "r", title: "Tus resultados", owl: "happy", bullets: [
        "Correctas, respondidas, XP ganado, la nota de tu docente y tu puntaje estimado.",
        "Por área y tiempo por pregunta: las que más tiempo te tomaron.",
        "Tus respuestas en cuadrícula: toca una para revisarla.",
        "Segunda oportunidad y Repechaje para volver a las que fallaste.",
        "Revisar respuestas: cada pregunta con la correcta y su explicación.",
      ], final: true },
    ] },
    revision: { label: "Tutorial · Revisión", steps: [
      { id: "rv", title: "Revisión", bullets: ["Filtra Todas, Errores o Marcadas.", "Cada pregunta con tu respuesta, la correcta, la explicación y el tiempo que te tomó.", "«Reportar un error» si algo de la pregunta está mal."], final: true },
    ] },
    progreso: { label: "Tutorial · Progreso", steps: [
      { id: "pg", target: "snav-progress", title: "Progreso", bullets: [
        "Resumen: tu resultado y tendencia por área, y qué reforzar primero. «Ver el reporte como el del ICFES».",
        "Plan: lo que te toca practicar cada día hasta el examen.",
        "Errores: las preguntas que fallaste, para practicarlas otra vez.",
        "Logros: medallas por racha, metas y áreas.",
        "Historial: cada simulacro y práctica con su puntaje por área; ábrelo para revisarlo.",
      ], final: true },
    ] },
    perfil: { label: "Tutorial · Perfil", steps: [
      { id: "pf", target: "snav-profile", title: "Perfil", bullets: [
        "Mi meta: la fecha de tu Saber 11, tu XP diaria y el puntaje al que quieres llegar.",
        "Mi progreso y análisis por área, y Mis logros.",
        "Tema claro u oscuro y sonidos.",
        "Mis reportes de errores: el estado de lo que reportaste.",
        "Cerrar sesión. Si eres docente, aquí escribes tu código para abrir el panel docente.",
      ], final: true },
    ] },
    vivo: { label: "Tutorial · Juego en vivo", steps: [
      { id: "lv", title: "Juego en vivo", bullets: ["Escribe el código que proyecta tu docente o escanea el QR.", "Responde desde tu celular antes de que se acabe el tiempo; puedes decir si estás seguro.", "Al final ves cómo te fue y puedes practicar las que fallaste. No hay posiciones ni ranking."], final: true },
    ] },
  };
  return tours[id] ?? tours.inicio;
}

// A link-like button inside a tutorial card that opens another tutorial.
function TourLink({ onClick, children }) {
  return <button type="button" className="link ob-link" onClick={onClick}>{children}</button>;
}
