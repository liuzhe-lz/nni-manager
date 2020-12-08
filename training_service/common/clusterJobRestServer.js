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
const assert = require("assert");
const bodyParser = require("body-parser");
const express_1 = require("express");
const fs = require("fs");
const path = require("path");
const typescript_string_operations_1 = require("typescript-string-operations");
const component = require("../../common/component");
const experimentStartupInfo_1 = require("../../common/experimentStartupInfo");
const restServer_1 = require("../../common/restServer");
const utils_1 = require("../../common/utils");
let ClusterJobRestServer = class ClusterJobRestServer extends restServer_1.RestServer {
    constructor() {
        super();
        this.API_ROOT_URL = '/api/v1/nni-pai';
        this.NNI_METRICS_PATTERN = `NNISDK_MEb'(?<metrics>.*?)'`;
        this.expId = experimentStartupInfo_1.getExperimentId();
        this.enableVersionCheck = true;
        const basePort = experimentStartupInfo_1.getBasePort();
        assert(basePort !== undefined && basePort > 1024);
        this.port = basePort + 1;
    }
    get apiRootUrl() {
        return this.API_ROOT_URL;
    }
    get clusterRestServerPort() {
        if (this.port === undefined) {
            throw new Error('PAI Rest server port is undefined');
        }
        return this.port;
    }
    get getErrorMessage() {
        return this.errorMessage;
    }
    set setEnableVersionCheck(versionCheck) {
        this.enableVersionCheck = versionCheck;
    }
    registerRestHandler() {
        this.app.use(bodyParser.json());
        this.app.use(this.API_ROOT_URL, this.createRestHandler());
    }
    createRestHandler() {
        const router = express_1.Router();
        router.use((req, res, next) => {
            this.log.info(`${req.method}: ${req.url}: body:\n${JSON.stringify(req.body, undefined, 4)}`);
            res.setHeader('Content-Type', 'application/json');
            next();
        });
        router.post(`/version/${this.expId}/:trialId`, (req, res) => {
            if (this.enableVersionCheck) {
                try {
                    const checkResultSuccess = req.body.tag === 'VCSuccess' ? true : false;
                    if (this.versionCheckSuccess !== undefined && this.versionCheckSuccess !== checkResultSuccess) {
                        this.errorMessage = 'Version check error, version check result is inconsistent!';
                        this.log.error(this.errorMessage);
                    }
                    else if (checkResultSuccess) {
                        this.log.info(`Version check in trialKeeper success!`);
                        this.versionCheckSuccess = true;
                    }
                    else {
                        this.versionCheckSuccess = false;
                        this.errorMessage = req.body.msg;
                    }
                }
                catch (err) {
                    this.log.error(`json parse metrics error: ${err}`);
                    res.status(500);
                    res.send(err.message);
                }
            }
            else {
                this.log.info(`Skipping version check!`);
            }
            res.send();
        });
        router.post(`/update-metrics/${this.expId}/:trialId`, (req, res) => {
            try {
                this.log.info(`Get update-metrics request, trial job id is ${req.params.trialId}`);
                this.log.info(`update-metrics body is ${JSON.stringify(req.body)}`);
                this.handleTrialMetrics(req.body.jobId, req.body.metrics);
                res.send();
            }
            catch (err) {
                this.log.error(`json parse metrics error: ${err}`);
                res.status(500);
                res.send(err.message);
            }
        });
        router.post(`/stdout/${this.expId}/:trialId`, (req, res) => {
            if (this.enableVersionCheck && (this.versionCheckSuccess === undefined || !this.versionCheckSuccess)
                && this.errorMessage === undefined) {
                this.errorMessage = `Version check failed, didn't get version check response from trialKeeper,`
                    + ` please check your NNI version in NNIManager and TrialKeeper!`;
            }
            const trialLogDir = path.join(utils_1.getExperimentRootDir(), 'trials', req.params.trialId);
            utils_1.mkDirPSync(trialLogDir);
            const trialLogPath = path.join(trialLogDir, 'stdout_log_collection.log');
            try {
                let skipLogging = false;
                if (req.body.tag === 'trial' && req.body.msg !== undefined) {
                    const metricsContent = req.body.msg.match(this.NNI_METRICS_PATTERN);
                    if (metricsContent && metricsContent.groups) {
                        const key = 'metrics';
                        this.handleTrialMetrics(req.params.trialId, [metricsContent.groups[key]]);
                        skipLogging = true;
                    }
                }
                if (!skipLogging) {
                    const writeStream = fs.createWriteStream(trialLogPath, {
                        flags: 'a+',
                        encoding: 'utf8',
                        autoClose: true
                    });
                    writeStream.write(typescript_string_operations_1.String.Format('{0}\n', req.body.msg));
                    writeStream.end();
                }
                res.send();
            }
            catch (err) {
                this.log.error(`json parse stdout data error: ${err}`);
                res.status(500);
                res.send(err.message);
            }
        });
        return router;
    }
};
ClusterJobRestServer = __decorate([
    component.Singleton,
    __metadata("design:paramtypes", [])
], ClusterJobRestServer);
exports.ClusterJobRestServer = ClusterJobRestServer;
