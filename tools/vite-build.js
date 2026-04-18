const { build } = require('vite')
const { builtinModules } = require('module')
const path = require('path')
const fs = require('fs')

const root = path.join(__dirname, '..')
const nodeExternals = ['electron', ...builtinModules, ...builtinModules.map(m => `node:${m}`)]

function mainConfig(watch) {
  return {
    root,
    configFile: false,
    build: {
      outDir: 'dist/src/main',
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      target: 'node22',
      lib: { entry: 'src/main/main.ts', formats: ['cjs'], fileName: () => 'main.js' },
      rollupOptions: {
        external: [...nodeExternals, 'electron-squirrel-startup', 'update-electron-app'],
      },
      watch: watch ? {} : undefined,
    },
  }
}

async function compileVite(options = {}) {
  if (!options.watch) {
    await fs.promises.rm(path.join(root, 'dist'), { recursive: true, force: true })
  }
  await build(mainConfig(options.watch))
}

module.exports = { compileVite }

if (require.main === module) compileVite()
