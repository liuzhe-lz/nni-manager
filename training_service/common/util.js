'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const cpp = require("child-process-promise");
const cp = require("child_process");
const fs = require("fs");
const ignore_1 = require("ignore");
const path = require("path");
const tar = require("tar");
const log_1 = require("../../common/log");
const typescript_string_operations_1 = require("typescript-string-operations");
const utils_1 = require("../../common/utils");
const gpuData_1 = require("./gpuData");
function* listDirWithIgnoredFiles(root, relDir, ignoreFiles) {
    let ignoreFile = undefined;
    const source = path.join(root, relDir);
    if (fs.existsSync(path.join(source, '.nniignore'))) {
        ignoreFile = path.join(source, '.nniignore');
        ignoreFiles.push(ignoreFile);
    }
    const ig = ignore_1.default();
    ignoreFiles.forEach((i) => ig.add(fs.readFileSync(i).toString()));
    for (const d of fs.readdirSync(source)) {
        const entry = path.join(relDir, d);
        if (ig.ignores(entry))
            continue;
        const entryStat = fs.statSync(path.join(root, entry));
        if (entryStat.isDirectory()) {
            yield entry;
            yield* listDirWithIgnoredFiles(root, entry, ignoreFiles);
        }
        else if (entryStat.isFile())
            yield entry;
    }
    if (ignoreFile !== undefined) {
        ignoreFiles.pop();
    }
}
exports.listDirWithIgnoredFiles = listDirWithIgnoredFiles;
async function validateCodeDir(codeDir) {
    let fileCount = 0;
    let fileTotalSize = 0;
    let fileNameValid = true;
    for (const relPath of listDirWithIgnoredFiles(codeDir, '', [])) {
        const d = path.join(codeDir, relPath);
        fileCount += 1;
        fileTotalSize += fs.statSync(d).size;
        if (fileCount > 2000) {
            throw new Error(`Too many files and directories (${fileCount} already scanned) in ${codeDir},`
                + ` please check if it's a valid code dir`);
        }
        if (fileTotalSize > 300 * 1024 * 1024) {
            throw new Error(`File total size too large in code dir (${fileTotalSize} bytes already scanned, exceeds 300MB).`);
        }
        fileNameValid = true;
        relPath.split(path.sep).forEach(fpart => {
            if (fpart !== '' && !utils_1.validateFileName(fpart))
                fileNameValid = false;
        });
        if (!fileNameValid) {
            throw new Error(`Validate file name error: '${d}' is an invalid file name.`);
        }
    }
    return fileCount;
}
exports.validateCodeDir = validateCodeDir;
async function execMkdir(directory, share = false) {
    if (process.platform === 'win32') {
        await cpp.exec(`powershell.exe New-Item -Path "${directory}" -ItemType "directory" -Force`);
    }
    else if (share) {
        await cpp.exec(`(umask 0; mkdir -p '${directory}')`);
    }
    else {
        await cpp.exec(`mkdir -p '${directory}'`);
    }
    return Promise.resolve();
}
exports.execMkdir = execMkdir;
async function execCopydir(source, destination) {
    if (!fs.existsSync(destination))
        await fs.promises.mkdir(destination);
    for (const relPath of listDirWithIgnoredFiles(source, '', [])) {
        const sourcePath = path.join(source, relPath);
        const destPath = path.join(destination, relPath);
        if (fs.statSync(sourcePath).isDirectory()) {
            if (!fs.existsSync(destPath)) {
                await fs.promises.mkdir(destPath);
            }
        }
        else {
            log_1.getLogger().debug(`Copying file from ${sourcePath} to ${destPath}`);
            await fs.promises.copyFile(sourcePath, destPath);
        }
    }
    return Promise.resolve();
}
exports.execCopydir = execCopydir;
async function execNewFile(filename) {
    if (process.platform === 'win32') {
        await cpp.exec(`powershell.exe New-Item -Path "${filename}" -ItemType "file" -Force`);
    }
    else {
        await cpp.exec(`touch '${filename}'`);
    }
    return Promise.resolve();
}
exports.execNewFile = execNewFile;
function runScript(filePath) {
    if (process.platform === 'win32') {
        return cp.exec(`powershell.exe -ExecutionPolicy Bypass -file "${filePath}"`);
    }
    else {
        return cp.exec(`bash '${filePath}'`);
    }
}
exports.runScript = runScript;
async function execTail(filePath) {
    let cmdresult;
    if (process.platform === 'win32') {
        cmdresult = await cpp.exec(`powershell.exe Get-Content "${filePath}" -Tail 1`);
    }
    else {
        cmdresult = await cpp.exec(`tail -n 1 '${filePath}'`);
    }
    return Promise.resolve(cmdresult);
}
exports.execTail = execTail;
async function execRemove(directory) {
    if (process.platform === 'win32') {
        await cpp.exec(`powershell.exe Remove-Item "${directory}" -Recurse -Force`);
    }
    else {
        await cpp.exec(`rm -rf '${directory}'`);
    }
    return Promise.resolve();
}
exports.execRemove = execRemove;
async function execKill(pid) {
    if (process.platform === 'win32') {
        await cpp.exec(`cmd.exe /c taskkill /PID ${pid} /T /F`);
    }
    else {
        await cpp.exec(`pkill -P ${pid}`);
    }
    return Promise.resolve();
}
exports.execKill = execKill;
function setEnvironmentVariable(variable) {
    if (process.platform === 'win32') {
        return `$env:${variable.key}="${variable.value}"`;
    }
    else {
        return `export ${variable.key}='${variable.value}'`;
    }
}
exports.setEnvironmentVariable = setEnvironmentVariable;
async function tarAdd(tarPath, sourcePath) {
    const fileList = [];
    for (const d of listDirWithIgnoredFiles(sourcePath, '', [])) {
        fileList.push(d);
    }
    tar.create({
        gzip: true,
        file: tarPath,
        sync: true,
        cwd: sourcePath,
    }, fileList);
    return Promise.resolve();
}
exports.tarAdd = tarAdd;
function getScriptName(fileNamePrefix) {
    if (process.platform === 'win32') {
        return typescript_string_operations_1.String.Format('{0}.ps1', fileNamePrefix);
    }
    else {
        return typescript_string_operations_1.String.Format('{0}.sh', fileNamePrefix);
    }
}
exports.getScriptName = getScriptName;
function getGpuMetricsCollectorBashScriptContent(scriptFolder) {
    return `echo $$ > ${scriptFolder}/pid ; METRIC_OUTPUT_DIR=${scriptFolder} python3 -m nni.tools.gpu_tool.gpu_metrics_collector`;
}
exports.getGpuMetricsCollectorBashScriptContent = getGpuMetricsCollectorBashScriptContent;
function runGpuMetricsCollector(scriptFolder) {
    if (process.platform === 'win32') {
        const scriptPath = path.join(scriptFolder, 'gpu_metrics_collector.ps1');
        const content = typescript_string_operations_1.String.Format(gpuData_1.GPU_INFO_COLLECTOR_FORMAT_WINDOWS, scriptFolder, path.join(scriptFolder, 'pid'));
        fs.writeFile(scriptPath, content, { encoding: 'utf8' }, () => { runScript(scriptPath); });
    }
    else {
        cp.exec(getGpuMetricsCollectorBashScriptContent(scriptFolder), { shell: '/bin/bash' });
    }
}
exports.runGpuMetricsCollector = runGpuMetricsCollector;
