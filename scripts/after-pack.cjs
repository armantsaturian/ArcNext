const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin' || context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = fs.readdirSync(context.appOutDir).find((entry) => entry.endsWith('.app'))
  if (!appName) {
    throw new Error(`No .app bundle found in ${context.appOutDir}`)
  }

  const appPath = path.join(context.appOutDir, appName)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })

  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    stdio: 'inherit'
  })
}
