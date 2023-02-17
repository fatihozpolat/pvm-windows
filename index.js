const axios = require("axios");
const fs = require('fs');
const decompress = require('decompress');
const {exec} = require('child_process');

const userName = process.env.USERNAME;
const pvmPath = `C:\\Users\\${userName}\\pvm\\`;
const symLinkPath = `C:\\Users\\${userName}\\pvm\\sym\\`;
const basePath = 'https://windows.php.net/downloads/releases/';

const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36'
    }
};

/**
 * List all Downloadable PHP versions
 * @returns {Promise<void>}
 */
async function listDownloadablePHPVersions() {
    const url = `${basePath}releases.json`;
    const versions = [];

    const response = await axios.get(url, axiosConfig);
    const data = response.data;

    Object.keys(data).forEach((key) => {
        versions.push(data[key].version);
    });

    console.log('Downloadable PHP versions:');
    for (let i = 0; i < versions.length; i++) {
        console.log(`${i + 1}: ${versions[i]}`);
    }

    console.log('"pvm install <version>" to install a PHP version.');
}

/**
 * List all usable PHP versions
 * @returns {Promise<void>}
 */
async function listUsablePHPVersions() {
    const versions = fs.readdirSync(`${pvmPath}php\\`);

    if (versions.length === 0) {
        console.log('No PHP versions installed.');
        console.log('"pvm install <version>" to install a PHP version.');
        return;
    }

    console.log('Usable PHP versions:');
    for (let i = 0; i < versions.length; i++) {
        console.log(`${i + 1}: ${versions[i]}`);
    }

    console.log('"pvm use <version>" to use a PHP version.');
}

/**
 * Set PHP version
 * @param version
 * @returns {Promise<void>}
 */
async function setPHPVersion(version) {
    const dirs = fs.readdirSync(`${pvmPath}php\\`);
    version = dirs.find(dir => dir.startsWith(version));

    if (!version) {
        console.log('Version not found.');
        return;
    }

    const rmLink = `rmdir "${symLinkPath}"`;
    const mkLink = `mklink /D ${symLinkPath} ${pvmPath}php\\${version}`;

    await new Promise((resolve, reject) => {
        exec(rmLink, (err, stdout, stderr) => {
            if (err) {
                console.log(err.message);
                resolve('No sym link found.');
            }
            console.log(stdout);
            resolve();
        });
    });

    await new Promise((resolve, reject) => {
        console.log('Creating sym link...')
        exec(`powershell -command "start-process cmd -verb runas -argumentlist '/c ${mkLink}'"`, (err, stdout, stderr) => {
            if (err) {
                console.log(err.message);
                reject();
                return;
            }
            console.log('Sym link created.')
            resolve();
        });
    });

    console.log('PHP version set. '.concat(version));

    createSym();
}

/**
 * SHA256 a file
 * @param s
 * @returns {Promise<unknown>}
 */
async function sha256File(s) {
    return new Promise((resolve, reject) => {
        exec(`powershell -command "Get-FileHash -Algorithm SHA256 ${s}"`, (err, stdout, stderr) => {
            if (err) {
                console.log(err.message);
                reject();
                return;
            }
            resolve(stdout);
        });
    });
}

/**
 * Decompress PHP zip
 * @param versionDir
 * @returns {Promise<void>}
 */
async function decompressPhpZip(versionDir) {
    console.log('Decompressing PHP...')
    await decompress(`${versionDir}php.zip`, versionDir);
    console.log('Removing PHP zip...')
    fs.unlinkSync(`${versionDir}php.zip`);

    fs.copyFileSync(`${versionDir}php.ini-development`, `${versionDir}php.ini`);

    // changed php.ini file
    const phpIni = fs.readFileSync(`${versionDir}php.ini`, 'utf8');
    const phpIniChanged = phpIni.replace(/;extension_dir = "ext"/g, 'extension_dir = "ext"');
    fs.writeFileSync(`${versionDir}php.ini`, phpIniChanged, 'utf8');
}

/**
 * Create symlink
 */
function createSym() {
    const varName = 'PHP_SYMLINK';

    exec(`powershell -command "setx ${varName} '${symLinkPath}'"`, (err, stdout, stderr) => {
        if (err) {
            console.log(err.message);
            return;
        }
        console.log('Successfully set PHP_SYMLINK environment variable.');
    });
}

/**
 * Create PVM directory
 */
function createPvm() {
    if (!fs.existsSync(pvmPath))
        fs.mkdirSync(pvmPath);

    if (!fs.existsSync(`${pvmPath}php\\`))
        fs.mkdirSync(`${pvmPath}php\\`);
}

/**
 * Download PHP version
 * @param version
 * @returns {Promise<void>}
 */
async function downloadPHP(version) {
    const arch = process.arch;
    const os = arch === 'x64' ? 'x64' : 'x86';

    createPvm();

    try {
        const res = await axios.get(`${basePath}releases.json`, axiosConfig);
        const data = res.data;

        const findVersion = Object.keys(data).find((key) => {
            return data[key].version.startsWith(version);
        });
        if (!findVersion) {
            console.log('PHP version not found.');
            return;
        }

        version = data[findVersion].version;
        const versionDir = `${pvmPath}php\\${version}\\`;

        if (!fs.existsSync(versionDir))
            fs.mkdirSync(versionDir);

        console.log('PHP version found. Version: ' + data[findVersion].version);

        const el = data[findVersion];
        const findThreadSafe = Object.keys(el).find((key) => {
            return key.startsWith('ts-v') && key.endsWith(`-${os}`);
        });

        if (!findThreadSafe) {
            console.log('PHP version not found.');
            return;
        }

        const ts = el[findThreadSafe];

        const zipUrl = `${basePath}${ts.zip.path}`;
        const sha256 = ts.zip.sha256;

        // check if zip exists
        if (fs.existsSync(`${versionDir}php.zip`)) {
            // check if zip is valid
            const hash = await sha256File(`${versionDir}php.zip`);
            if (hash.includes(sha256)) {
                console.log('PHP already downloaded.');
                await decompressPhpZip(versionDir);
                return;
            } else {
                console.log('PHP zip is invalid. Downloading again.');
                fs.unlinkSync(`${versionDir}php.zip`);
            }
        }

        console.log('Downloading PHP...');
        await new Promise((resolve, reject) => {
            axios.get(zipUrl, {
                responseType: 'stream',
                ...axiosConfig
            }).then((response) => {
                response.data.pipe(fs.createWriteStream(`${versionDir}php.zip`));
                response.data.on('end', () => {
                    resolve();
                });
            });
        });

        await decompressPhpZip(versionDir);

        console.log('PHP downloaded. Use "pvm use ' + version + '" to use this version.');
    } catch (e) {
        console.log(e);
    }
}

exports.listDownloadablePHPVersions = listDownloadablePHPVersions;
exports.listUsablePHPVersions = listUsablePHPVersions;
exports.setPHPVersion = setPHPVersion;
exports.downloadPHP = downloadPHP;
exports.sha256File = sha256File;
exports.decompressPhpZip = decompressPhpZip;
exports.createPvm = createPvm;