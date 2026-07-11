import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const dir = projectRoot;

// IGNORE PATTERNS
const ignorePatterns = [
  /node_modules/,
  /\.git/,
  /\.env/,
  /\.vscode/,
  /scratch/,
  /venv/,
  /\.venv/,
  /__pycache__/,
  /\.DS_Store/,
  /\.gemini/
];

function shouldIgnore(filepath) {
  return ignorePatterns.some(re => re.test(filepath));
}

function getAllFiles(currentDir, relativePath = '') {
  let results = [];
  const list = fs.readdirSync(currentDir);
  
  list.forEach(file => {
    const fullPath = path.join(currentDir, file);
    const relPath = relativePath ? `${relativePath}/${file}` : file;
    
    if (shouldIgnore(relPath)) {
      return;
    }
    
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relPath));
    } else {
      results.push(relPath);
    }
  });
  
  return results;
}

async function run() {
  try {
    console.log('🏁 Initialising Git repository...');
    await git.init({ fs, dir });
    
    console.log('⚙️ Configuring user info...');
    await git.setConfig({
      fs,
      dir,
      path: 'user.name',
      value: 'sebin-gg'
    });
    await git.setConfig({
      fs,
      dir,
      path: 'user.email',
      value: 'sebin-gg@users.noreply.github.com'
    });
    
    console.log('🔗 Adding remote origin...');
    try {
      await git.addRemote({
        fs,
        dir,
        remote: 'origin',
        url: 'https://github.com/sebin-gg/shrinkprompt.git'
      });
    } catch (e) {
      // Remote might already exist
      console.log('ℹ️ Remote origin already exists.');
    }
    
    console.log('📂 Staging files...');
    const files = getAllFiles(dir);
    
    for (const file of files) {
      await git.add({ fs, dir, filepath: file });
    }
    console.log(`✅ Staged ${files.length} files.`);
    
    console.log('✍️ Creating local commit...');
    const sha = await git.commit({
      fs,
      dir,
      author: {
        name: 'sebin-gg',
        email: 'sebin-gg@users.noreply.github.com'
      },
      message: 'feat: complete Phase 1-5 build (WASM tokenizer, network telemetry, SQLite WAL cache, Chrome loader, and UI integrations)'
    });
    
    console.log(`🎉 Success! Local commit created with SHA: ${sha}`);
    console.log('\n👉 Final step: On your host machine terminal, navigate to D:\\extension hack and run:');
    console.log('   git push origin adil');
  } catch (err) {
    console.error('❌ Git operation failed:', err);
  }
}

run();
