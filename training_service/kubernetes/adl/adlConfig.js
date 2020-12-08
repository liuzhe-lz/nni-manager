'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const kubernetesConfig_1 = require("../kubernetesConfig");
class CheckpointConfig {
    constructor(storageClass, storageSize) {
        this.storageClass = storageClass;
        this.storageSize = storageSize;
    }
}
exports.CheckpointConfig = CheckpointConfig;
class ImagePullSecretConfig {
    constructor(name) {
        this.name = name;
    }
}
exports.ImagePullSecretConfig = ImagePullSecretConfig;
class NFSConfig {
    constructor(server, path, containerMountPath) {
        this.server = server;
        this.path = path;
        this.containerMountPath = containerMountPath;
    }
}
exports.NFSConfig = NFSConfig;
class AdlTrialConfig extends kubernetesConfig_1.KubernetesTrialConfig {
    constructor(codeDir, command, gpuNum, image, imagePullSecrets, nfs, checkpoint, cpuNum, memorySize, adaptive) {
        super(codeDir);
        this.command = command;
        this.gpuNum = gpuNum;
        this.image = image;
        this.imagePullSecrets = imagePullSecrets;
        this.nfs = nfs;
        this.checkpoint = checkpoint;
        this.cpuNum = cpuNum;
        this.memorySize = memorySize;
        this.adaptive = adaptive;
    }
}
exports.AdlTrialConfig = AdlTrialConfig;
