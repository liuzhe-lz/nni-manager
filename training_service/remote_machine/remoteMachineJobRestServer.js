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
const remoteMachineTrainingService_1 = require("./remoteMachineTrainingService");
let RemoteMachineJobRestServer = class RemoteMachineJobRestServer extends clusterJobRestServer_1.ClusterJobRestServer {
    constructor() {
        super();
        this.remoteMachineTrainingService = component.get(remoteMachineTrainingService_1.RemoteMachineTrainingService);
    }
    handleTrialMetrics(jobId, metrics) {
        for (const singleMetric of metrics) {
            this.remoteMachineTrainingService.MetricsEmitter.emit('metric', {
                id: jobId,
                data: singleMetric
            });
        }
    }
};
__decorate([
    typescript_ioc_1.Inject,
    __metadata("design:type", remoteMachineTrainingService_1.RemoteMachineTrainingService)
], RemoteMachineJobRestServer.prototype, "remoteMachineTrainingService", void 0);
RemoteMachineJobRestServer = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], RemoteMachineJobRestServer);
exports.RemoteMachineJobRestServer = RemoteMachineJobRestServer;
