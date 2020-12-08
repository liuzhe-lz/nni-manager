'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_ioc_1 = require("typescript-ioc");
const component = require("../../common/component");
const clusterJobRestServer_1 = require("../common/clusterJobRestServer");
const kubernetesTrainingService_1 = require("./kubernetesTrainingService");
let KubernetesJobRestServer = class KubernetesJobRestServer extends clusterJobRestServer_1.ClusterJobRestServer {
    constructor(kubernetesTrainingService) {
        super();
        this.kubernetesTrainingService = kubernetesTrainingService;
    }
    handleTrialMetrics(jobId, metrics) {
        if (this.kubernetesTrainingService === undefined) {
            throw Error('kubernetesTrainingService not initialized!');
        }
        for (const singleMetric of metrics) {
            this.kubernetesTrainingService.MetricsEmitter.emit('metric', {
                id: jobId,
                data: singleMetric
            });
        }
    }
};
__decorate([
    typescript_ioc_1.Inject,
    __metadata("design:type", kubernetesTrainingService_1.KubernetesTrainingService)
], KubernetesJobRestServer.prototype, "kubernetesTrainingService", void 0);
KubernetesJobRestServer = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [kubernetesTrainingService_1.KubernetesTrainingService])
], KubernetesJobRestServer);
exports.KubernetesJobRestServer = KubernetesJobRestServer;
