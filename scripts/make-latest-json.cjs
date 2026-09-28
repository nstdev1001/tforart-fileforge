const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version;

const nsisDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "nsis");
const exeName = `Tforart FileForge_${version}_x64-setup.exe`;
const sigName = `${exeName}.sig`;

const sigPath = path.join(nsisDir, sigName);
if (!fs.existsSync(sigPath)) {
  console.error(`Signature file not found: ${sigPath}`);
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, "utf8").trim();

// GitHub releases replaces spaces with dots in asset download URLs
const githubAssetName = exeName.replace(/ /g, ".");
const downloadUrl = `https://github.com/nstdev1001/tforart-fileforge/releases/download/v${version}/${githubAssetName}`;

const latestJson = {
  version: version,
  notes: `Tforart FileForge v${version} - Hệ thống tự động hóa tệp tin và cập nhật trực tiếp.`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: signature,
      url: downloadUrl,
    },
  },
};

const outputPath = path.join(rootDir, "src-tauri", "target", "release", "bundle", "latest.json");
fs.writeFileSync(outputPath, JSON.stringify(latestJson, null, 2), "utf8");
console.log(`Generated latest.json successfully at: ${outputPath}`);
