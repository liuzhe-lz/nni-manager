'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const crypto_1 = require("crypto");
const cpp = require("child-process-promise");
const cp = require("child_process");
const child_process_1 = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const lockfile = require("lockfile");
const ts_deferred_1 = require("ts-deferred");
const typescript_ioc_1 = require("typescript-ioc");
const util = require("util");
const glob = require("glob");
const datastore_1 = require("./datastore");
const experimentStartupInfo_1 = require("./experimentStartupInfo");
const manager_1 = require("./manager");
const experimentManager_1 = require("./experimentManager");
const trainingService_1 = require("./trainingService");
const log_1 = require("./log");
function getExperimentRootDir() {
    return experimentStartupInfo_1.getExperimentStartupInfo()
        .getLogDir();
}
exports.getExperimentRootDir = getExperimentRootDir;
function getLogDir() {
    return path.join(getExperimentRootDir(), 'log');
}
exports.getLogDir = getLogDir;
function getLogLevel() {
    return experimentStartupInfo_1.getExperimentStartupInfo()
        .getLogLevel();
}
exports.getLogLevel = getLogLevel;
function getDefaultDatabaseDir() {
    return path.join(getExperimentRootDir(), 'db');
}
exports.getDefaultDatabaseDir = getDefaultDatabaseDir;
function getCheckpointDir() {
    return path.join(getExperimentRootDir(), 'checkpoint');
}
exports.getCheckpointDir = getCheckpointDir;
function getExperimentsInfoPath() {
    return path.join(os.homedir(), 'nni-experiments', '.experiment');
}
exports.getExperimentsInfoPath = getExperimentsInfoPath;
function mkDirP(dirPath) {
    const deferred = new ts_deferred_1.Deferred();
    fs.exists(dirPath, (exists) => {
        if (exists) {
            deferred.resolve();
        }
        else {
            const parent = path.dirname(dirPath);
            mkDirP(parent).then(() => {
                fs.mkdir(dirPath, (err) => {
                    if (err) {
                        deferred.reject(err);
                    }
                    else {
                        deferred.resolve();
                    }
                });
            }).catch((err) => {
                deferred.reject(err);
            });
        }
    });
    return deferred.promise;
}
exports.mkDirP = mkDirP;
function mkDirPSync(dirPath) {
    if (fs.existsSync(dirPath)) {
        return;
    }
    mkDirPSync(path.dirname(dirPath));
    fs.mkdirSync(dirPath);
}
exports.mkDirPSync = mkDirPSync;
const delay = util.promisify(setTimeout);
exports.delay = delay;
function charMap(index) {
    if (index < 26) {
        return index + 97;
    }
    else if (index < 52) {
        return index - 26 + 65;
    }
    else {
        return index - 52 + 48;
    }
}
function uniqueString(len) {
    if (len === 0) {
        return '';
    }
    const byteLength = Math.ceil((Math.log2(52) + Math.log2(62) * (len - 1)) / 8);
    let num = crypto_1.randomBytes(byteLength).reduce((a, b) => a * 256 + b, 0);
    const codes = [];
    codes.push(charMap(num % 52));
    num = Math.floor(num / 52);
    for (let i = 1; i < len; i++) {
        codes.push(charMap(num % 62));
        num = Math.floor(num / 62);
    }
    return String.fromCharCode(...codes);
}
exports.uniqueString = uniqueString;
function randomInt(max) {
    return Math.floor(Math.random() * max);
}
exports.randomInt = randomInt;
function randomSelect(a) {
    assert(a !== undefined);
    return a[Math.floor(Math.random() * a.length)];
}
exports.randomSelect = randomSelect;
function parseArg(names) {
    if (process.argv.length >= 4) {
        for (let i = 2; i < process.argv.length - 1; i++) {
            if (names.includes(process.argv[i])) {
                return process.argv[i + 1];
            }
        }
    }
    return '';
}
exports.parseArg = parseArg;
function getCmdPy() {
    let cmd = 'python3';
    if (process.platform === 'win32') {
        cmd = 'python';
    }
    return cmd;
}
exports.getCmdPy = getCmdPy;
function getMsgDispatcherCommand(expParams) {
    const clonedParams = Object.assign({}, expParams);
    delete clonedParams.searchSpace;
    return `${getCmdPy()} -m nni --exp_params ${Buffer.from(JSON.stringify(clonedParams)).toString('base64')}`;
}
exports.getMsgDispatcherCommand = getMsgDispatcherCommand;
function generateParamFileName(hyperParameters) {
    assert(hyperParameters !== undefined);
    assert(hyperParameters.index >= 0);
    let paramFileName;
    if (hyperParameters.index == 0) {
        paramFileName = 'parameter.cfg';
    }
    else {
        paramFileName = `parameter_${hyperParameters.index}.cfg`;
    }
    return paramFileName;
}
exports.generateParamFileName = generateParamFileName;
function prepareUnitTest() {
    typescript_ioc_1.Container.snapshot(experimentStartupInfo_1.ExperimentStartupInfo);
    typescript_ioc_1.Container.snapshot(datastore_1.Database);
    typescript_ioc_1.Container.snapshot(datastore_1.DataStore);
    typescript_ioc_1.Container.snapshot(trainingService_1.TrainingService);
    typescript_ioc_1.Container.snapshot(manager_1.Manager);
    typescript_ioc_1.Container.snapshot(experimentManager_1.ExperimentManager);
    const logLevel = parseArg(['--log_level', '-ll']);
    if (logLevel.length > 0 && !log_1.logLevelNameMap.has(logLevel)) {
        console.log(`FATAL: invalid log_level: ${logLevel}`);
    }
    experimentStartupInfo_1.setExperimentStartupInfo(true, 'unittest', 8080, 'unittest', undefined, logLevel);
    mkDirPSync(getLogDir());
    const sqliteFile = path.join(getDefaultDatabaseDir(), 'nni.sqlite');
    try {
        fs.unlinkSync(sqliteFile);
    }
    catch (err) {
    }
}
exports.prepareUnitTest = prepareUnitTest;
function cleanupUnitTest() {
    typescript_ioc_1.Container.restore(manager_1.Manager);
    typescript_ioc_1.Container.restore(trainingService_1.TrainingService);
    typescript_ioc_1.Container.restore(datastore_1.DataStore);
    typescript_ioc_1.Container.restore(datastore_1.Database);
    typescript_ioc_1.Container.restore(experimentStartupInfo_1.ExperimentStartupInfo);
    typescript_ioc_1.Container.restore(experimentManager_1.ExperimentManager);
}
exports.cleanupUnitTest = cleanupUnitTest;
let cachedipv4Address = '';
function getIPV4Address() {
    if (cachedipv4Address && cachedipv4Address.length > 0) {
        return cachedipv4Address;
    }
    const networkInterfaces = os.networkInterfaces();
    if (networkInterfaces.eth0) {
        for (const item of networkInterfaces.eth0) {
            if (item.family === 'IPv4') {
                cachedipv4Address = item.address;
                return cachedipv4Address;
            }
        }
    }
    else {
        throw Error(`getIPV4Address() failed because os.networkInterfaces().eth0 is undefined. Please specify NNI manager IP in config.`);
    }
    throw Error('getIPV4Address() failed because no valid IPv4 address found.');
}
exports.getIPV4Address = getIPV4Address;
function getJobCancelStatus(isEarlyStopped) {
    return isEarlyStopped ? 'EARLY_STOPPED' : 'USER_CANCELED';
}
exports.getJobCancelStatus = getJobCancelStatus;
function countFilesRecursively(directory) {
    if (!fs.existsSync(directory)) {
        throw Error(`Direcotory ${directory} doesn't exist`);
    }
    const deferred = new ts_deferred_1.Deferred();
    let timeoutId;
    const delayTimeout = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout: path ${directory} has too many files`));
        }, 5000);
    });
    let fileCount = -1;
    let cmd;
    if (process.platform === "win32") {
        cmd = `powershell "Get-ChildItem -Path ${directory} -Recurse -File | Measure-Object | %{$_.Count}"`;
    }
    else {
        cmd = `find ${directory} -type f | wc -l`;
    }
    cpp.exec(cmd).then((result) => {
        if (result.stdout && parseInt(result.stdout)) {
            fileCount = parseInt(result.stdout);
        }
        deferred.resolve(fileCount);
    });
    return Promise.race([deferred.promise, delayTimeout]).finally(() => {
        clearTimeout(timeoutId);
    });
}
exports.countFilesRecursively = countFilesRecursively;
function validateFileName(fileName) {
    const pattern = '^[a-z0-9A-Z._-]+$';
    const validateResult = fileName.match(pattern);
    if (validateResult) {
        return true;
    }
    return false;
}
exports.validateFileName = validateFileName;
async function validateFileNameRecursively(directory) {
    if (!fs.existsSync(directory)) {
        throw Error(`Direcotory ${directory} doesn't exist`);
    }
    const fileNameArray = fs.readdirSync(directory);
    let result = true;
    for (const name of fileNameArray) {
        const fullFilePath = path.join(directory, name);
        try {
            result = validateFileName(name);
            if (fs.lstatSync(fullFilePath).isDirectory()) {
                result = result && await validateFileNameRecursively(fullFilePath);
            }
            if (!result) {
                return Promise.reject(new Error(`file name in ${fullFilePath} is not valid!`));
            }
        }
        catch (error) {
            return Promise.reject(error);
        }
    }
    return Promise.resolve(result);
}
exports.validateFileNameRecursively = validateFileNameRecursively;
async function getVersion() {
    const deferred = new ts_deferred_1.Deferred();
    Promise.resolve().then(() => require(path.join(__dirname, '..', 'package.json'))).then((pkg) => {
        deferred.resolve(pkg.version);
    }).catch((error) => {
        deferred.reject(error);
    });
    return deferred.promise;
}
exports.getVersion = getVersion;
function getTunerProc(command, stdio, newCwd, newEnv) {
    let cmd = command;
    let arg = [];
    let newShell = true;
    if (process.platform === "win32") {
        cmd = command.split(" ", 1)[0];
        arg = command.substr(cmd.length + 1).split(" ");
        newShell = false;
    }
    const tunerProc = child_process_1.spawn(cmd, arg, {
        stdio,
        cwd: newCwd,
        env: newEnv,
        shell: newShell
    });
    return tunerProc;
}
exports.getTunerProc = getTunerProc;
async function isAlive(pid) {
    const deferred = new ts_deferred_1.Deferred();
    let alive = false;
    if (process.platform === 'win32') {
        try {
            const str = cp.execSync(`powershell.exe Get-Process -Id ${pid} -ErrorAction SilentlyContinue`).toString();
            if (str) {
                alive = true;
            }
        }
        catch (error) {
        }
    }
    else {
        try {
            await cpp.exec(`kill -0 ${pid}`);
            alive = true;
        }
        catch (error) {
        }
    }
    deferred.resolve(alive);
    return deferred.promise;
}
exports.isAlive = isAlive;
async function killPid(pid) {
    const deferred = new ts_deferred_1.Deferred();
    try {
        if (process.platform === "win32") {
            await cpp.exec(`cmd.exe /c taskkill /PID ${pid} /F`);
        }
        else {
            await cpp.exec(`kill -9 ${pid}`);
        }
    }
    catch (error) {
    }
    deferred.resolve();
    return deferred.promise;
}
exports.killPid = killPid;
function getNewLine() {
    if (process.platform === "win32") {
        return "\r\n";
    }
    else {
        return "\n";
    }
}
exports.getNewLine = getNewLine;
function unixPathJoin(...paths) {
    const dir = paths.filter((path) => path !== '').join('/');
    if (dir === '')
        return '.';
    return dir;
}
exports.unixPathJoin = unixPathJoin;
function withLockSync(func, filePath, lockOpts, ...args) {
    const lockName = path.join(path.dirname(filePath), path.basename(filePath) + `.lock.${process.pid}`);
    if (typeof lockOpts.stale === 'number') {
        const lockPath = path.join(path.dirname(filePath), path.basename(filePath) + '.lock.*');
        const lockFileNames = glob.sync(lockPath);
        const canLock = lockFileNames.map((fileName) => {
            return fs.existsSync(fileName) && Date.now() - fs.statSync(fileName).mtimeMs > lockOpts.stale;
        }).filter(isExpired => isExpired === false).length === 0;
        if (!canLock) {
            throw new Error('File has been locked.');
        }
    }
    lockfile.lockSync(lockName, lockOpts);
    const result = func(...args);
    lockfile.unlockSync(lockName);
    return result;
}
exports.withLockSync = withLockSync;
