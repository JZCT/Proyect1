#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function getArg(args, key, fallback) {
  if (args[key] !== undefined) {
    return args[key];
  }

  return fallback;
}

function requireArg(args, key, fallback) {
  const value = getArg(args, key, fallback);

  if (value === undefined || value === null || value === '') {
    throw new Error(`Falta el argumento --${key}`);
  }

  return value;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunkArray(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function resolveFile(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function loadServiceAccount(filePath) {
  return JSON.parse(fs.readFileSync(resolveFile(filePath), 'utf8'));
}

function loadCorsConfiguration(filePath) {
  const resolvedFile = resolveFile(filePath);
  const parsed = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('El archivo CORS debe contener un arreglo JSON con al menos una regla.');
  }

  return parsed.map((rule) => {
    const origin = Array.isArray(rule.origin)
      ? rule.origin.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const method = Array.isArray(rule.method)
      ? rule.method.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const responseHeader = Array.isArray(rule.responseHeader)
      ? rule.responseHeader.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const maxAgeSeconds = Number(rule.maxAgeSeconds);

    if (origin.length === 0) {
      throw new Error('Cada regla CORS debe incluir al menos un origen valido.');
    }

    if (method.length === 0) {
      throw new Error('Cada regla CORS debe incluir al menos un metodo valido.');
    }

    return {
      origin,
      method,
      responseHeader,
      maxAgeSeconds: Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
        ? Math.floor(maxAgeSeconds)
        : 3600
    };
  });
}

function normalizeCompanyTag(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function normalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSearch(value, minLength = 2) {
  return normalizeSearchValue(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= minLength);
}

function parseLocation(value) {
  const raw = normalizeSearchValue(value);
  if (!raw) {
    return { raw: '', city: '', state: '', tokens: [] };
  }

  const parts = raw
    .split(/[;,]+/g)
    .map((part) => part.trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter(Boolean);

  return {
    raw,
    city: parts[0] || '',
    state: parts.length > 1 ? parts[parts.length - 1] : '',
    tokens: Array.from(new Set(tokenizeSearch(raw, 3)))
  };
}

function buildSearchTokens(values) {
  const tokens = values.flatMap((value) => tokenizeSearch(String(value || ''), 2));
  return Array.from(new Set(tokens));
}

function normalizeYear(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const normalized = Math.floor(numeric);
  return normalized >= 2000 && normalized <= 2100 ? normalized : undefined;
}

function extractYear(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const directYear = normalizeYear(value);
  if (directYear) {
    return directYear;
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const converted = value.toDate();
      if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
        return normalizeYear(converted.getFullYear());
      }
    }

    if (value.seconds !== undefined) {
      const timestampDate = new Date(Number(value.seconds) * 1000);
      if (!Number.isNaN(timestampDate.getTime())) {
        return normalizeYear(timestampDate.getFullYear());
      }
    }
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeYear(parsed.getFullYear());
  }

  return undefined;
}

function normalizeMonth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  const normalized = Math.floor(numeric);
  return normalized >= 1 && normalized <= 12 ? normalized : undefined;
}

function extractMonth(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const directMonth = normalizeMonth(value);
  if (directMonth) {
    return directMonth;
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const converted = value.toDate();
      if (converted instanceof Date && !Number.isNaN(converted.getTime())) {
        return normalizeMonth(converted.getMonth() + 1);
      }
    }

    if (value.seconds !== undefined) {
      const timestampDate = new Date(Number(value.seconds) * 1000);
      if (!Number.isNaN(timestampDate.getTime())) {
        return normalizeMonth(timestampDate.getMonth() + 1);
      }
    }
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeMonth(parsed.getMonth() + 1);
  }

  return undefined;
}

function initAdminApp(name, serviceAccountPath) {
  const serviceAccount = loadServiceAccount(serviceAccountPath);

  return initializeApp(
    {
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    },
    name
  );
}

function printHelp() {
  console.log(`
Uso:
  node scripts/firebase-admin-tools.cjs bootstrap-admin --dest-key DEST.json --email admin@empresa.com --password admin123! --nombre "Administrador"
  node scripts/firebase-admin-tools.cjs migrate-firestore --source-key SOURCE.json --dest-key DEST.json --collections users,cursos,instructores,personas,usuarios
  node scripts/firebase-admin-tools.cjs normalize-users --dest-key DEST.json
  node scripts/firebase-admin-tools.cjs backfill-persona-company-tags --dest-key DEST.json
  node scripts/firebase-admin-tools.cjs backfill-persona-indexes --dest-key DEST.json
  node scripts/firebase-admin-tools.cjs backfill-curso-years --dest-key DEST.json

Comandos:
  bootstrap-admin   Crea o actualiza el primer admin en Auth y Firestore/users del proyecto destino.
  migrate-firestore Copia colecciones de Firestore entre dos proyectos, preservando IDs y subcolecciones.
  normalize-users   Reescribe users/{uid} a partir de cualquier doc legacy con campo uid.
  backfill-persona-company-tags   Agrega companyTag normalizado a las personas existentes.
  backfill-persona-indexes   Completa companyTag, cursoIds, assignedCursoId, assignmentStatus, indices de busqueda/ubicacion y periodo (anioPersona/mesPersona) en personas.
  backfill-curso-years   Completa anioCurso y mesCurso para cursos existentes usando Fecha_inicio o createdAt.

Variables opcionales:
  FIREBASE_SOURCE_KEY
  FIREBASE_DEST_KEY
  FIREBASE_COLLECTIONS
  BOOTSTRAP_ADMIN_EMAIL
  BOOTSTRAP_ADMIN_PASSWORD
`);
}

async function bootstrapAdmin(args) {
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const email = requireArg(args, 'email', process.env.BOOTSTRAP_ADMIN_EMAIL);
  const password = requireArg(args, 'password', process.env.BOOTSTRAP_ADMIN_PASSWORD);
  const nombre = getArg(args, 'nombre', process.env.BOOTSTRAP_ADMIN_NOMBRE || 'Administrador');
  const role = getArg(args, 'role', process.env.BOOTSTRAP_ADMIN_ROLE || 'admin');
  const companyTag = getArg(args, 'company-tag', process.env.BOOTSTRAP_ADMIN_COMPANY_TAG || '');
  const instructorId = getArg(args, 'instructor-id', process.env.BOOTSTRAP_ADMIN_INSTRUCTOR_ID || '');
  const assignedCourseIds = parseCsv(
    getArg(args, 'assigned-course-ids', process.env.BOOTSTRAP_ADMIN_ASSIGNED_COURSE_IDS || '')
  );

  const app = initAdminApp('destination-admin', destinationKey);

  try {
    const auth = getAuth(app);
    const db = getFirestore(app);

    let userRecord;

    try {
      const existing = await auth.getUserByEmail(email);
      userRecord = await auth.updateUser(existing.uid, {
        email,
        password,
        displayName: nombre,
        disabled: false
      });
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }

      userRecord = await auth.createUser({
        email,
        password,
        displayName: nombre
      });
    }

    const profile = {
      nombre,
      email,
      role,
      uid: userRecord.uid,
      companyTag: role === 'company' ? companyTag : '',
      instructorId: role === 'instructor' ? instructorId : '',
      assignedCourseIds: role === 'instructor' ? assignedCourseIds : [],
      createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(userRecord.uid).set(profile, { merge: true });

    console.log(JSON.stringify({
      ok: true,
      command: 'bootstrap-admin',
      projectId: app.options.projectId,
      uid: userRecord.uid,
      email,
      documentPath: `users/${userRecord.uid}`
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

async function copyCollection(sourceCollectionRef, destinationCollectionRef, options, counters) {
  const snapshot = await sourceCollectionRef.get();
  counters.collections += 1;

  for (const documentSnapshot of snapshot.docs) {
    await copyDocumentTree(documentSnapshot, destinationCollectionRef.doc(documentSnapshot.id), options, counters);
  }
}

async function copyDocumentTree(sourceDocumentSnapshot, destinationDocumentRef, options, counters) {
  const data = sourceDocumentSnapshot.data();

  if (options.merge) {
    await destinationDocumentRef.set(data, { merge: true });
  } else {
    await destinationDocumentRef.set(data);
  }

  counters.documents += 1;

  const subcollections = await sourceDocumentSnapshot.ref.listCollections();
  for (const subcollection of subcollections) {
    await copyCollection(subcollection, destinationDocumentRef.collection(subcollection.id), options, counters);
  }
}

async function migrateFirestore(args) {
  const sourceKey = requireArg(args, 'source-key', process.env.FIREBASE_SOURCE_KEY);
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const collections = parseCsv(
    getArg(args, 'collections', process.env.FIREBASE_COLLECTIONS || 'users,cursos,instructores,personas,usuarios')
  );
  const merge = toBoolean(getArg(args, 'merge', process.env.FIREBASE_MIGRATE_MERGE), true);

  if (collections.length === 0) {
    throw new Error('Debes indicar al menos una coleccion en --collections');
  }

  const sourceApp = initAdminApp('source-admin', sourceKey);
  const destinationApp = initAdminApp('destination-admin', destinationKey);

  try {
    const sourceDb = getFirestore(sourceApp);
    const destinationDb = getFirestore(destinationApp);
    const counters = {
      collections: 0,
      documents: 0
    };

    for (const collectionName of collections) {
      await copyCollection(
        sourceDb.collection(collectionName),
        destinationDb.collection(collectionName),
        { merge },
        counters
      );
    }

    console.log(JSON.stringify({
      ok: true,
      command: 'migrate-firestore',
      sourceProjectId: sourceApp.options.projectId,
      destinationProjectId: destinationApp.options.projectId,
      collections,
      merge,
      copiedCollections: counters.collections,
      copiedDocuments: counters.documents
    }, null, 2));
  } finally {
    await deleteApp(sourceApp);
    await deleteApp(destinationApp);
  }
}

async function normalizeUsers(args) {
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const app = initAdminApp('destination-admin', destinationKey);

  try {
    const db = getFirestore(app);
    const usersSnapshot = await db.collection('users').get();
    const movedDocs = [];
    const skippedDocs = [];

    for (const documentSnapshot of usersSnapshot.docs) {
      const data = documentSnapshot.data();
      const uid = String(data.uid || '').trim();

      if (!uid) {
        skippedDocs.push(documentSnapshot.id);
        continue;
      }

      const payload = {
        ...data,
        uid,
        companyTag: data.role === 'company' ? normalizeCompanyTag(data.companyTag || data.nombre || data.email || '') : '',
        instructorId: data.role === 'instructor' ? String(data.instructorId || '').trim() : '',
        assignedCourseIds: Array.isArray(data.assignedCourseIds)
          ? Array.from(new Set(data.assignedCourseIds.map((item) => String(item || '').trim()).filter(Boolean)))
          : []
      };

      await db.collection('users').doc(uid).set(payload, { merge: true });

      if (documentSnapshot.id !== uid) {
        await documentSnapshot.ref.delete();
        movedDocs.push({ from: documentSnapshot.id, to: uid });
      }
    }

    console.log(JSON.stringify({
      ok: true,
      command: 'normalize-users',
      projectId: app.options.projectId,
      movedDocs,
      skippedDocs
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

async function backfillPersonaCompanyTags(args) {
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const app = initAdminApp('destination-admin', destinationKey);

  try {
    const db = getFirestore(app);
    const personasSnapshot = await db.collection('personas').get();
    const updatedDocs = [];
    const skippedDocs = [];

    for (const documentSnapshot of personasSnapshot.docs) {
      const data = documentSnapshot.data();
      const companyTag = normalizeCompanyTag(data.companyTag || data.empresa || '');

      if (!companyTag) {
        skippedDocs.push(documentSnapshot.id);
        continue;
      }

      await documentSnapshot.ref.set({
        companyTag
      }, { merge: true });

      updatedDocs.push(documentSnapshot.id);
    }

    console.log(JSON.stringify({
      ok: true,
      command: 'backfill-persona-company-tags',
      projectId: app.options.projectId,
      updatedDocs,
      skippedDocs
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

async function backfillCursoYears(args) {
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const app = initAdminApp('destination-admin', destinationKey);

  try {
    const db = getFirestore(app);
    const cursosSnapshot = await db.collection('cursos').get();
    const updatedDocs = [];
    const skippedDocs = [];

    for (const cursoDoc of cursosSnapshot.docs) {
      const data = cursoDoc.data();
      const anioCurso = extractYear(
        data.anioCurso
        || data.anio_curso
        || data.anio
        || data.year
        || data.Fecha_inicio
        || data.fecha_inicio
        || data.createdAt
      );

      const mesCurso = extractMonth(
        data.mesCurso
        || data.mes_curso
        || data.mes
        || data.month
        || data.Fecha_inicio
        || data.fecha_inicio
        || data.createdAt
      );

      if (!anioCurso && !mesCurso) {
        skippedDocs.push(cursoDoc.id);
        continue;
      }

      await cursoDoc.ref.set({
        anioCurso,
        mesCurso
      }, { merge: true });

      updatedDocs.push(cursoDoc.id);
    }

    console.log(JSON.stringify({
      ok: true,
      command: 'backfill-curso-years',
      projectId: app.options.projectId,
      updatedDocs,
      skippedDocs
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

async function backfillPersonaIndexes(args) {
  const destinationKey = requireArg(args, 'dest-key', process.env.FIREBASE_DEST_KEY);
  const app = initAdminApp('destination-admin', destinationKey);

  try {
    const db = getFirestore(app);
    const cursosSnapshot = await db.collection('cursos').get();
    const personasSnapshot = await db.collection('personas').get();
    const assignedCursoByPersonaId = new Map();

    for (const cursoDoc of cursosSnapshot.docs) {
      const cursoData = cursoDoc.data();
      const personasIds = Array.isArray(cursoData.personasIds)
        ? cursoData.personasIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];

      for (const personaId of personasIds) {
        if (!assignedCursoByPersonaId.has(personaId)) {
          assignedCursoByPersonaId.set(personaId, cursoDoc.id);
        }
      }
    }

    const updatedDocs = [];
    const skippedDocs = [];

    for (const personaDoc of personasSnapshot.docs) {
      const data = personaDoc.data();
      const existingCursoIds = Array.isArray(data.cursoIds)
        ? data.cursoIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const cursoIdFromCursosCollection = assignedCursoByPersonaId.get(personaDoc.id) || '';
      const cursoIds = Array.from(
        new Set([...existingCursoIds, cursoIdFromCursosCollection].filter(Boolean))
      );
      const assignedCursoId = String(data.assignedCursoId || cursoIdFromCursosCollection || cursoIds[0] || '').trim();
      const assignmentStatus = assignedCursoId ? 'assigned' : 'available';
      const companyTag = normalizeCompanyTag(data.companyTag || data.empresa || '');
      const createdAtSource = data.createdAt || data.created_at;
      const anioPersona = extractYear(
        data.anioPersona
        || data.anio_persona
        || data.anio
        || data.year
        || createdAtSource
      );
      const mesPersona = extractMonth(
        data.mesPersona
        || data.mes_persona
        || data.mes
        || data.month
        || createdAtSource
      );
      const location = parseLocation(data.lugar || data.ubicacion || data['ubicación'] || '');
      const searchTokens = buildSearchTokens([
        data.nombre,
        data.curp,
        data.email,
        data.telefono,
        data.empresa,
        data.companyTag,
        data.lugar,
        data.ubicacion,
        data['ubicación']
      ]);

      if (
        !companyTag &&
        cursoIds.length === 0 &&
        !searchTokens.length &&
        !location.raw &&
        !assignedCursoId &&
        !anioPersona &&
        !mesPersona
      ) {
        skippedDocs.push(personaDoc.id);
        continue;
      }

      await personaDoc.ref.set({
        companyTag,
        cursoIds,
        assignedCursoId,
        assignmentStatus,
        searchTokens,
        locationTokens: location.tokens,
        locationCity: location.city,
        locationState: location.state,
        anioPersona,
        mesPersona
      }, { merge: true });

      updatedDocs.push(personaDoc.id);
    }

    console.log(JSON.stringify({
      ok: true,
      command: 'backfill-persona-indexes',
      projectId: app.options.projectId,
      updatedDocs,
      skippedDocs
    }, null, 2));
  } finally {
    await deleteApp(app);
  }
}

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return;
  }

  switch (command) {
    case 'bootstrap-admin':
      await bootstrapAdmin(args);
      return;
    case 'migrate-firestore':
      await migrateFirestore(args);
      return;
    case 'normalize-users':
      await normalizeUsers(args);
      return;
    case 'backfill-persona-company-tags':
      await backfillPersonaCompanyTags(args);
      return;
    case 'backfill-persona-indexes':
      await backfillPersonaIndexes(args);
      return;
    case 'backfill-curso-years':
      await backfillCursoYears(args);
      return;
    default:
      throw new Error(`Comando no soportado: ${command}`);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || 'script-error',
    message: error.message || String(error)
  }, null, 2));
  process.exit(1);
});
