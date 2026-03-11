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

Comandos:
  bootstrap-admin   Crea o actualiza el primer admin en Auth y Firestore/users del proyecto destino.
  migrate-firestore Copia colecciones de Firestore entre dos proyectos, preservando IDs y subcolecciones.

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
