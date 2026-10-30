const fs = require("node:fs");
const path = require("node:path");
const INDEX_NAME = ".index.json";
const DESIGN_FILE = /\.(voo|fig|psd|svg)$/i;
function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
function trashDirectory(root, create = false) {
  const directory = path.join(root, ".trash");
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("invalid_trash_directory");
  } else if (create) fs.mkdirSync(directory);
  return directory;
}
function readIndex(directory) {
  const file = path.join(directory, INDEX_NAME);
  if (!fs.existsSync(file)) return Object.create(null);
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!index || typeof index !== "object" || Array.isArray(index)) throw new Error("invalid_trash_index");
  return Object.assign(Object.create(null), index);
}
function writeIndex(directory, index) {
  const file = path.join(directory, INDEX_NAME);
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(index));
  fs.renameSync(temporary, file);
}
function availableName(directory, name) {
  const extension = path.extname(name),
    stem = path.basename(name, extension);
  let candidate = name,
    suffix = 1;
  while (fs.existsSync(path.join(directory, candidate))) candidate = `${stem}-${suffix++}${extension}`;
  return candidate;
}
function findEntry(root, directory, index, source) {
  const requested = path.isAbsolute(source) ? path.resolve(source) : path.resolve(root, source);
  if (!inside(root, requested)) throw new Error("outside_workspace");
  const recorded = Object.entries(index).find(([, record]) => path.resolve(root, record.relativePath) === requested);
  if (recorded) return recorded;
  const name = path.basename(source);
  const record = index[name];
  if (record && requested === path.join(directory, name)) return [name, record];
  if (!record && fs.existsSync(path.join(directory, name))) return [name, {
    relativePath: name
  }];
  return null;
}
function validFile(root, file) {
  if (!inside(root, file)) throw new Error("outside_workspace");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid_file");
  // Project folders may not redirect a write or restore outside the configured workspace.
  if (!inside(fs.realpathSync(root), fs.realpathSync(file))) throw new Error("outside_workspace");
  return stat;
}

/** App Trash must remain restorable. Never fall back to OS trash or permanent deletion. */
async function moveToTrash(file, root) {
  if (!file || typeof file !== "string" || !fs.existsSync(file)) return {
    ok: false,
    error: "file_not_found"
  };
  try {
    validFile(root, file);
    if (!DESIGN_FILE.test(path.basename(file)) || path.basename(file).startsWith(".")) throw new Error("invalid_file");
    const directory = trashDirectory(root, true);
    if (inside(directory, file)) return {
      ok: false,
      error: "already_trashed"
    };
    const index = readIndex(directory),
      name = availableName(directory, path.basename(file));
    const target = path.join(directory, name);
    const original = index[name];
    index[name] = {
      relativePath: path.relative(root, file),
      trashedAt: Date.now()
    };
    fs.renameSync(file, target);
    try {
      writeIndex(directory, index);
    } catch (error) {
      fs.renameSync(target, file);
      if (original) index[name] = original;else delete index[name];
      throw error;
    }
    return {
      ok: true,
      method: "hidden_trash_folder",
      trashPath: target,
      originalPath: file
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}
async function restoreFromTrash(source, root) {
  try {
    const directory = trashDirectory(root),
      index = readIndex(directory);
    const found = findEntry(root, directory, index, source);
    if (!found) return {
      ok: false,
      error: "file_not_found_in_trash"
    };
    const [name, record] = found;
    const file = path.join(directory, name),
      destination = path.resolve(root, record.relativePath);
    validFile(directory, file);
    if (!inside(root, destination) || inside(directory, destination)) throw new Error("outside_workspace");
    if (fs.existsSync(destination)) return {
      ok: false,
      error: "already_exists"
    };
    let ancestor = path.dirname(destination);
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const realRoot = fs.realpathSync(root),
      realAncestor = fs.realpathSync(ancestor);
    if (realAncestor !== realRoot && !inside(realRoot, realAncestor)) throw new Error("outside_workspace");
    fs.mkdirSync(path.dirname(destination), {
      recursive: true
    });
    if (!inside(fs.realpathSync(root), path.join(fs.realpathSync(path.dirname(destination)), path.basename(destination)))) throw new Error("outside_workspace");
    fs.renameSync(file, destination);
    delete index[name];
    try {
      writeIndex(directory, index);
    } catch (error) {
      fs.renameSync(destination, file);
      throw error;
    }
    return {
      ok: true,
      path: destination,
      name: path.basename(destination)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}
function listTrash(root) {
  const directory = trashDirectory(root);
  if (!fs.existsSync(directory)) return [];
  const index = readIndex(directory),
    files = [];
  for (const name of fs.readdirSync(directory)) {
    if (!DESIGN_FILE.test(name) || name.startsWith(".")) continue;
    const file = path.join(directory, name),
      record = index[name] ?? {
        relativePath: name
      };
    const original = path.resolve(root, record.relativePath);
    if (!inside(root, original)) throw new Error("outside_workspace");
    const stat = validFile(directory, file);
    files.push({
      id: original,
      path: file,
      name: path.basename(original),
      folder: path.dirname(record.relativePath) === "." ? null : path.dirname(record.relativePath),
      extension: path.extname(original).slice(1).toLowerCase(),
      size: stat.size,
      updatedAt: Math.round(stat.mtimeMs),
      createdAt: Math.round(stat.birthtimeMs || stat.mtimeMs),
      trashed: true,
      trashedAt: record.trashedAt ?? Math.round(stat.mtimeMs),
      starred: false
    });
  }
  return files;
}
async function deletePermanently(source, root) {
  try {
    const directory = trashDirectory(root),
      index = readIndex(directory);
    const found = findEntry(root, directory, index, source);
    const file = found ? path.join(directory, found[0]) : source;
    if (!file || !fs.existsSync(file)) return {
      ok: false,
      error: "file_not_found"
    };
    validFile(root, file);
    if (found) {
      delete index[found[0]];
      writeIndex(directory, index);
      try {
        fs.unlinkSync(file);
      } catch (error) {
        index[found[0]] = found[1];
        writeIndex(directory, index);
        throw error;
      }
    } else fs.unlinkSync(file);
    return {
      ok: true
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}
async function emptyTrash(root) {
  try {
    const directory = trashDirectory(root);
    if (!fs.existsSync(directory)) return {
      ok: true,
      deletedCount: 0
    };
    const files = listTrash(root);
    let count = 0;
    for (const file of files) {
      const result = await deletePermanently(file.id, root);
      if (!result.ok) return {
        ...result,
        deletedCount: count
      };
      count++;
    }
    if (fs.existsSync(path.join(directory, INDEX_NAME))) fs.unlinkSync(path.join(directory, INDEX_NAME));
    return {
      ok: true,
      deletedCount: count
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      deletedCount: 0
    };
  }
}
module.exports = {
  moveToTrash,
  restoreFromTrash,
  listTrash,
  deletePermanently,
  emptyTrash
};
