'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("../../common/errors");
class KubernetesClusterConfig {
    constructor(apiVersion, storage) {
        this.storage = storage;
        this.apiVersion = apiVersion;
    }
    get storageType() {
        throw new errors_1.MethodNotImplementedError();
    }
}
exports.KubernetesClusterConfig = KubernetesClusterConfig;
class StorageConfig {
    constructor(storage) {
        this.storage = storage;
    }
}
exports.StorageConfig = StorageConfig;
class KubernetesClusterConfigNFS extends KubernetesClusterConfig {
    constructor(apiVersion, nfs, storage) {
        super(apiVersion, storage);
        this.nfs = nfs;
    }
    get storageType() {
        return 'nfs';
    }
    static getInstance(jsonObject) {
        const kubernetesClusterConfigObjectNFS = jsonObject;
        return new KubernetesClusterConfigNFS(kubernetesClusterConfigObjectNFS.apiVersion, kubernetesClusterConfigObjectNFS.nfs, kubernetesClusterConfigObjectNFS.storage);
    }
}
exports.KubernetesClusterConfigNFS = KubernetesClusterConfigNFS;
class KubernetesClusterConfigAzure extends KubernetesClusterConfig {
    constructor(apiVersion, keyVault, azureStorage, storage, uploadRetryCount) {
        super(apiVersion, storage);
        this.keyVault = keyVault;
        this.azureStorage = azureStorage;
        this.uploadRetryCount = uploadRetryCount;
    }
    get storageType() {
        return 'azureStorage';
    }
    static getInstance(jsonObject) {
        const kubernetesClusterConfigObjectAzure = jsonObject;
        return new KubernetesClusterConfigAzure(kubernetesClusterConfigObjectAzure.apiVersion, kubernetesClusterConfigObjectAzure.keyVault, kubernetesClusterConfigObjectAzure.azureStorage, kubernetesClusterConfigObjectAzure.storage, kubernetesClusterConfigObjectAzure.uploadRetryCount);
    }
}
exports.KubernetesClusterConfigAzure = KubernetesClusterConfigAzure;
class KubernetesClusterConfigFactory {
    static generateKubernetesClusterConfig(jsonObject) {
        const storageConfig = jsonObject;
        switch (storageConfig.storage) {
            case 'azureStorage':
                return KubernetesClusterConfigAzure.getInstance(jsonObject);
            case 'nfs':
            case undefined:
                return KubernetesClusterConfigNFS.getInstance(jsonObject);
            default:
                throw new Error(`Invalid json object ${jsonObject}`);
        }
    }
}
exports.KubernetesClusterConfigFactory = KubernetesClusterConfigFactory;
class NFSConfig {
    constructor(server, path) {
        this.server = server;
        this.path = path;
    }
}
exports.NFSConfig = NFSConfig;
class KeyVaultConfig {
    constructor(vaultName, name) {
        this.vaultName = vaultName;
        this.name = name;
    }
}
exports.KeyVaultConfig = KeyVaultConfig;
class AzureStorage {
    constructor(azureShare, accountName) {
        this.azureShare = azureShare;
        this.accountName = accountName;
    }
}
exports.AzureStorage = AzureStorage;
class KubernetesTrialConfigTemplate {
    constructor(command, gpuNum, cpuNum, memoryMB, image, privateRegistryAuthPath) {
        this.command = command;
        this.gpuNum = gpuNum;
        this.cpuNum = cpuNum;
        this.memoryMB = memoryMB;
        this.image = image;
        this.privateRegistryAuthPath = privateRegistryAuthPath;
    }
}
exports.KubernetesTrialConfigTemplate = KubernetesTrialConfigTemplate;
class KubernetesTrialConfig {
    constructor(codeDir) {
        this.codeDir = codeDir;
    }
}
exports.KubernetesTrialConfig = KubernetesTrialConfig;
