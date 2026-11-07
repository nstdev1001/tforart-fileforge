// Usage: npm run deploy:app            -> patch bump (0.3.1 -> 0.3.2)
//        npm run deploy:app -- minor   -> 0.3.1 -> 0.4.0
//        npm run deploy:app -- major   -> 0.3.1 -> 1.0.0
//        npm run deploy:app -- 1.2.3   -> explicit version
// Bumps the version in all files, commits, tags vX.Y.Z and pushes (GitHub Actions then builds the release).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
const out = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

const confPath = path.join(root, "src-tauri", "tauri.conf.json");
const pkgPath = path.join(root, "package.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");

const read = (p) => fs.readFileSync(p, "utf8");
const current = JSON.parse(read(confPath)).version;
if (!/^\d+\.\d+\.\d+$/.test(current)) fail(`Invalid current version: ${current}`);

const arg = process.argv[2] || "patch";
let [maj, min, pat] = current.split(".").map(Number);
let next;
if (arg === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else if (arg === "major") next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else fail(`Unknown argument "${arg}". Use patch | minor | major | x.y.z`);

const tag = `v${next}`;

// Safety checks
if (out("git status --porcelain")) fail("Working tree has uncommitted changes. Commit or stash them first.");
const branch = out("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") fail(`You are on "${branch}". Switch to main before deploying.`);
if (out(`git tag -l ${tag}`)) fail(`Tag ${tag} already exists.`);

console.log(`\nVersion ${current} -> ${next}  (tag ${tag})\n`);

// tauri.conf.json + package.json: replace only the top-level "version" line
const bumpJson = (p) => {
  const text = read(p);
  const re = /^(\s*"version":\s*")[^"]+(")/m;
  if (!re.test(text)) fail(`No version field found in ${p}`);
  fs.writeFileSync(p, text.replace(re, `$1${next}$2`));
};
bumpJson(confPath);
bumpJson(pkgPath);

// Cargo.toml: version in the [package] section
const toml = read(cargoTomlPath);
const tomlRe = /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/;
if (!tomlRe.test(toml)) fail("No version found in Cargo.toml");
fs.writeFileSync(cargoTomlPath, toml.replace(tomlRe, `$1${next}$2`));

// Cargo.lock: the "fileforge" package entry
const crateName = /^name\s*=\s*"([^"]+)"/m.exec(toml)[1];
const lock = read(cargoLockPath);
const lockRe = new RegExp(`(name = "${crateName}"\r?\nversion = ")[^"]+(")`);
if (!lockRe.test(lock)) fail(`Package "${crateName}" not found in Cargo.lock`);
fs.writeFileSync(cargoLockPath, lock.replace(lockRe, `$1${next}$2`));

run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
run(`git commit -m "chore: release ${tag}"`);
run(`git tag ${tag}`);
run("git push origin main");
run(`git push origin ${tag}`);

console.log(`\n✔ Pushed ${tag}. GitHub Actions is building the release:`);
console.log("  https://github.com/nstdev1001/tforart-fileforge/actions");
