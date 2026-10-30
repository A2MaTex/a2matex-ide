import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.resolve(import.meta.dirname, '../dist-electron');
const aliases = new Map([
  ['@/', 'src/'],
  ['@app/', 'src/app/'],
  ['@domain/', 'src/domain/'],
  ['@application/', 'src/application/'],
  ['@infrastructure/', 'src/infrastructure/'],
  ['@presentation/', 'src/presentation/'],
  ['@shared/', 'src/shared/'],
  ['@electron/', 'electron/'],
]);

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? javascriptFiles(entryPath) : [entryPath];
    }),
  );

  return files.flat().filter((file) => file.endsWith('.js'));
}

function resolveAlias(specifier, importer) {
  const alias = [...aliases.keys()].find((candidate) => specifier.startsWith(candidate));
  if (!alias) return specifier;

  const target = path.join(outputRoot, aliases.get(alias), specifier.slice(alias.length));
  const targetWithExtension = /\.(?:[cm]?js|json)$/.test(target) ? target : `${target}.js`;
  const relativePath = path
    .relative(path.dirname(importer), targetWithExtension)
    .split(path.sep)
    .join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

for (const file of await javascriptFiles(outputRoot)) {
  const source = await readFile(file, 'utf8');
  const rewritten = source.replace(
    /(['"])(@(?:\/|app\/|domain\/|application\/|infrastructure\/|presentation\/|shared\/|electron\/)[^'"]+)\1/g,
    (_match, quote, specifier) => `${quote}${resolveAlias(specifier, file)}${quote}`,
  );

  if (rewritten !== source) await writeFile(file, rewritten);
}
