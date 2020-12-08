'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const kubernetesConfig_1 = require("../kubernetesConfig");
class FrameworkAttemptCompletionPolicy {
    constructor(minFailedTaskCount, minSucceededTaskCount) {
        this.minFailedTaskCount = minFailedTaskCount;
        this.minSucceededTaskCount = minSucceededTaskCount;
    }
}
exports.FrameworkAttemptCompletionPolicy = FrameworkAttemptCompletionPolicy;
class FrameworkControllerTrialConfigTemplate extends kubernetesConfig_1.KubernetesTrialConfigTemplate {
    constructor(taskNum, command, gpuNum, cpuNum, memoryMB, image, frameworkAttemptCompletionPolicy, privateRegistryFilePath) {
        super(command, gpuNum, cpuNum, memoryMB, image, privateRegistryFilePath);
        this.frameworkAttemptCompletionPolicy = frameworkAttemptCompletionPolicy;
        this.name = name;
        this.taskNum = taskNum;
    }
}
exports.FrameworkControllerTrialConfigTemplate = FrameworkControllerTrialConfigTemplate;
class FrameworkControllerTrialConfig extends kubernetesConfig_1.KubernetesTrialConfig {
    constructor(codeDir, taskRoles) {
        super(codeDir);
        this.taskRoles = taskRoles;
        this.codeDir = codeDir;
    }
}
exports.FrameworkControllerTrialConfig = FrameworkControllerTrialConfig;
class FrameworkControllerClusterConfig extends kubernetesConfig_1.KubernetesClusterConfig {
    constructor(apiVersion, serviceAccountName) {
        super(apiVersion);
        this.serviceAccountName = serviceAccountName;
    }
}
exports.FrameworkControllerClusterConfig = FrameworkControllerClusterConfig;
class FrameworkControllerClusterConfigNFS extends kubernetesConfig_1.KubernetesClusterConfigNFS {
    constructor(serviceAccountName, apiVersion, nfs, storage) {
        super(apiVersion, nfs, storage);
        this.serviceAccountName = serviceAccountName;
    }
    static getInstance(jsonObject) {
        const kubeflowClusterConfigObjectNFS = jsonObject;
        assert(kubeflowClusterConfigObjectNFS !== undefined);
        return new FrameworkControllerClusterConfigNFS(kubeflowClusterConfigObjectNFS.serviceAccountName, kubeflowClusterConfigObjectNFS.apiVersion, kubeflowClusterConfigObjectNFS.nfs, kubeflowClusterConfigObjectNFS.storage);
    }
}
exports.FrameworkControllerClusterConfigNFS = FrameworkControllerClusterConfigNFS;
class FrameworkControllerClusterConfigAzure extends kubernetesConfig_1.KubernetesClusterConfigAzure {
    constructor(serviceAccountName, apiVersion, keyVault, azureStorage, storage) {
        super(apiVersion, keyVault, azureStorage, storage);
        this.serviceAccountName = serviceAccountName;
    }
    static getInstance(jsonObject) {
        const kubeflowClusterConfigObjectAzure = jsonObject;
        return new FrameworkControllerClusterConfigAzure(kubeflowClusterConfigObjectAzure.serviceAccountName, kubeflowClusterConfigObjectAzure.apiVersion, kubeflowClusterConfigObjectAzure.keyVault, kubeflowClusterConfigObjectAzure.azureStorage, kubeflowClusterConfigObjectAzure.storage);
    }
}
exports.FrameworkControllerClusterConfigAzure = FrameworkControllerClusterConfigAzure;
class FrameworkControllerClusterConfigFactory {
    static generateFrameworkControllerClusterConfig(jsonObject) {
        const storageConfig = jsonObject;
        if (storageConfig === undefined) {
            throw new Error('Invalid json object as a StorageConfig instance');
        }
        if (storageConfig.storage !== undefined && storageConfig.storage === 'azureStorage') {
            return FrameworkControllerClusterConfigAzure.getInstance(jsonObject);
        }
        else if (storageConfig.storage === undefined || storageConfig.storage === 'nfs') {
            return FrameworkControllerClusterConfigNFS.getInstance(jsonObject);
        }
        throw new Error(`Invalid json object ${jsonObject}`);
    }
}
exports.FrameworkControllerClusterConfigFactory = FrameworkControllerClusterConfigFactory;
