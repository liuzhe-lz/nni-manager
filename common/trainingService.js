'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class TrainingServiceError extends Error {
    constructor(errorCode, errorMessage) {
        super(errorMessage);
        this.errCode = errorCode;
    }
    get errorCode() {
        return this.errCode;
    }
}
exports.TrainingServiceError = TrainingServiceError;
class TrainingService {
}
exports.TrainingService = TrainingService;
class NNIManagerIpConfig {
    constructor(nniManagerIp) {
        this.nniManagerIp = nniManagerIp;
    }
}
exports.NNIManagerIpConfig = NNIManagerIpConfig;
