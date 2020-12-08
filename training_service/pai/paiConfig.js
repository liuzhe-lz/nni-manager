'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class PAIClusterConfig {
    constructor(userName, host, passWord, token, reuse, cpuNum, memoryMB, gpuNum) {
        this.userName = userName;
        this.passWord = passWord;
        this.host = host;
        this.token = token;
        this.reuse = reuse;
        this.cpuNum = cpuNum;
        this.memoryMB = memoryMB;
        this.gpuNum = gpuNum;
    }
}
exports.PAIClusterConfig = PAIClusterConfig;
class PAITrialJobDetail {
    constructor(id, status, paiJobName, submitTime, workingDirectory, form, logPath, paiJobDetailUrl) {
        this.id = id;
        this.status = status;
        this.paiJobName = paiJobName;
        this.submitTime = submitTime;
        this.workingDirectory = workingDirectory;
        this.form = form;
        this.tags = [];
        this.logPath = logPath;
        this.paiJobDetailUrl = paiJobDetailUrl;
    }
}
exports.PAITrialJobDetail = PAITrialJobDetail;
