'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const kubernetesApiClient_1 = require("../kubernetesApiClient");
exports.GeneralK8sClient = kubernetesApiClient_1.GeneralK8sClient;
class FrameworkControllerClientV1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/frameworkcontroller/frameworkcontrollerjob-crd-v1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['frameworkcontroller.microsoft.com'].v1.namespaces('default').frameworks;
    }
    get containerName() {
        return 'framework';
    }
}
class FrameworkControllerClientFactory {
    static createClient() {
        return new FrameworkControllerClientV1();
    }
}
exports.FrameworkControllerClientFactory = FrameworkControllerClientFactory;
