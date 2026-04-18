const path = require('path');
const fs = require('fs');
const package = require('./package.json');

require('dotenv').config()

const FLAGS = {
  SIGNTOOL_PATH: process.env.SIGNTOOL_PATH,
  AZURE_CODE_SIGNING_DLIB: process.env.AZURE_CODE_SIGNING_DLIB || path.join(__dirname, 'Microsoft.Trusted.Signing.Client.1.0.60/bin/x64/Azure.CodeSigning.Dlib.dll'),
  AZURE_METADATA_JSON: process.env.AZURE_METADATA_JSON || path.resolve(__dirname, 'trusted-signing-metadata.json'),
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
  APPLE_ID: process.env.APPLE_ID,
  APPLE_ID_PASSWORD: process.env.APPLE_ID_PASSWORD,
}

let windowsSign;
if (FLAGS.AZURE_TENANT_ID && FLAGS.SIGNTOOL_PATH) {
  fs.writeFileSync(FLAGS.AZURE_METADATA_JSON, JSON.stringify({
    Endpoint: process.env.AZURE_CODE_SIGNING_ENDPOINT || "https://wcus.codesigning.azure.net",
    CodeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
    CertificateProfileName: process.env.AZURE_CODE_SIGNING_CERTIFICATE_PROFILE_NAME,
  }, null, 2));

  windowsSign = {
    signToolPath: FLAGS.SIGNTOOL_PATH,
    signWithParams: `/v /dlib ${FLAGS.AZURE_CODE_SIGNING_DLIB} /dmdf ${FLAGS.AZURE_METADATA_JSON}`,
    timestampServer: "http://timestamp.acs.microsoft.com",
    hashes: ["sha256"],
  };
} else {
  console.warn('AZURE_TENANT_ID / SIGNTOOL_PATH not set; Windows binaries will not be signed');
}

module.exports = {
  hooks: {
    generateAssets: require('./tools/generateAssets'),
  },
  packagerConfig: {
    asar: false,
    icon: path.resolve(__dirname, 'assets', 'icon'),
    appBundleId: 'com.felixrieseberg.macintoshjs',
    appCategoryType: 'public.app-category.developer-tools',
    win32metadata: {
      CompanyName: 'Felix Rieseberg',
      OriginalFilename: 'macintoshjs'
    },
    osxSign: {
      identity: 'Developer ID Application: Felix Rieseberg (LT94ZKYDCJ)',
    },
    osxNotarize: {
      appleId: FLAGS.APPLE_ID,
      appleIdPassword: FLAGS.APPLE_ID_PASSWORD,
      teamId: 'LT94ZKYDCJ'
    },
    windowsSign,
    ignore: [
      /\/assets(\/?)/,
      /\/docs(\/?)/,
      /\/tools(\/?)/,
      /^\/src\/main(\/?)/,
      /\/src\/basilisk\/user_files(\/?)/,
      /\/patches(\/?)/,
      /\/@types(\/?)/,
      /package-lock\.json/,
      /yarn\.lock/,
      /README\.md/,
      /CREDITS\.md/,
      /tsconfig\.json/,
      /issue_template\.md/,
      /HELP\.md/,
      /forge\.config\.js/,
      /\.github(\/?)/,
      /\.vscode(\/?)/,
      /\.gitignore/,
      /\.gitattributes/,
      /win-certificate\.pfx/,
      /user_image_.*/,
      /\/Microsoft\.Trusted\.Signing\.Client.*/,
      /\/trusted-signing-metadata/,
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: (arch) => {
        return {
          name: 'macintosh.js',
          authors: 'Felix Rieseberg',
          exe: 'macintosh.js.exe',
          noMsi: true,
          remoteReleases: '',
          iconUrl: 'https://raw.githubusercontent.com/felixrieseberg/macintosh.js/master/assets/icon.ico',
          loadingGif: './assets/loadingGif.gif',
          setupExe: `macintoshjs-${package.version}-setup-${arch}.exe`,
          setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'),
          windowsSign
        }
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux']
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux']
    }
  ]
};
