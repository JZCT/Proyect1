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

Comandos:
  bootstrap-admin   Crea o actualiza el primer admin en Auth y Firestore/users del proyecto destino.
  migrate-firestore Copia colecciones de Firestore entre dos proyectos, preservando IDs y subcolecciones.
  normalize-users   Reescribe users/{uid} a partir de cualquier doc legacy con campo uid.
  backfill-persona-company-tags   Agrega companyTag normalizado a las personas existentes.

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
