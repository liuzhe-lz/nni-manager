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
const dltsTrainingService_1 = require("./dltsTrainingService");
let DLTSJobRestServer = class DLTSJobRestServer extends clusterJobRestServer_1.ClusterJobRestServer {
    constructor() {
        super();
        this.parameterFileMetaList = [];
        this.dltsTrainingService = component.get(dltsTrainingService_1.DLTSTrainingService);
    }
    handleTrialMetrics(jobId, metrics) {
        for (const singleMetric of metrics) {
            this.dltsTrainingService.MetricsEmitter.emit('metric', {
                id: jobId,
                data: singleMetric
            });
        }
    }
    createRestHandler() {
        const router = super.createRestHandler();
        router.post(`/parameter-file-meta`, (req, res) => {
            try {
                this.log.info(`POST /parameter-file-meta, body is ${JSON.stringify(req.body)}`);
                this.parameterFileMetaList.push(req.body);
                res.send();
            }
            catch (err) {
                this.log.error(`POST parameter-file-meta error: ${err}`);
                res.status(500);
                res.send(err.message);
            }
        });
        router.get(`/parameter-file-meta`, (req, res) => {
            try {
                this.log.info(`GET /parameter-file-meta`);
                res.send(this.parameterFileMetaList);
            }
            catch (err) {
                this.log.error(`GET parameter-file-meta error: ${err}`);
                res.status(500);
                res.send(err.message);
            }
        });
        return router;
    }
};
__decorate([
    typescript_ioc_1.Inject,
    __metadata("design:type", dltsTrainingService_1.DLTSTrainingService)
], DLTSJobRestServer.prototype, "dltsTrainingService", void 0);
DLTSJobRestServer = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], DLTSJobRestServer);
exports.DLTSJobRestServer = DLTSJobRestServer;
