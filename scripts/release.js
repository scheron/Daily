import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { spawnSync } from 'child_process';
import readline from 'readline';

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(prompt, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

const cwd = process.cwd();
const pkgPath = path.join(cwd, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const oldVersion = pkg.version;
const [major, minor, patch] = oldVersion.split('.').map(n => parseInt(n, 10));
let nextVersion = `${major}.${minor}.${patch + 1}`;
const BRANCH = 'main';

(async () => {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  if (branch !== BRANCH) {
    console.error(`❌ Error: run from ${BRANCH} branch.`);
    process.exit(1);
  }
  if (execSync('git status --porcelain').toString().trim()) {
    console.error(`❌ Error: there are uncommitted changes on ${BRANCH} branch.`);
    process.exit(1);
  }

  const ans = await question(`Current version is ${oldVersion}. Bump to ${nextVersion}? (Y/n): `);
  if (/^n$/i.test(ans)) {
    const custom = await question('Enter desired version (SemVer): ');
    if (!/^\d+\.\d+\.\d+$/.test(custom)) {
      console.error('❌ Error: invalid version format.');
      process.exit(1);
    }
    nextVersion = custom;
  }

  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  let lastTag = '';
  try { lastTag = execSync('git describe --tags --abbrev=0').toString().trim(); } catch {};

  const sectionHeader = `## v${nextVersion}`;
  const regex = new RegExp(
    `## v${nextVersion.replace(/\./g, '\\.')}[\s\S]*?(?=## v\\d|$)`
  );

  let section = `## v${nextVersion} - ${new Date().toISOString().split('T')[0]}\n\n`;
  if (lastTag) {
    const commits = execSync(
      `git log ${lastTag}..HEAD --pretty=format:"- %s" --no-merges`
    ).toString().trim();
    section += commits + '\n';
  }
  const tmpPath = path.join(os.tmpdir(), `release-v${nextVersion}.md`);
  fs.writeFileSync(tmpPath, section, 'utf8');

  spawnSync(process.env.EDITOR || 'vi', [tmpPath], { stdio: 'inherit' });

  const confirm = await question('Continue with this release description? (y/N): ');
  if (!/^y$/i.test(confirm)) {
    console.log('❌ Release aborted');
    process.exit(0);
  }

  const releaseBody = fs.readFileSync(tmpPath, 'utf8');

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  let newChangelog;
  if (regex.test(changelog)) {
    newChangelog = changelog.replace(regex, releaseBody);
  } else {
    newChangelog = changelog.replace(
      '# Changelog\n',
      `# Changelog\n\n${releaseBody}\n`
    );
  }
  fs.writeFileSync(changelogPath, newChangelog, 'utf8');

  execSync(`git add package.json CHANGELOG.md`);
  execSync(`git commit -m "release: v${nextVersion}"`);
  execSync(`git tag -a v${nextVersion} -m "${releaseBody.replace(/"/g, '\"')}"`);

  execSync(`git push origin ${BRANCH}`);
  execSync(`git push origin v${nextVersion}`);

  fs.unlinkSync(tmpPath);

  console.log(`🚀 Released v${nextVersion}`);
})();
