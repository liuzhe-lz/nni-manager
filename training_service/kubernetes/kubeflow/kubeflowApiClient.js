'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const kubernetesApiClient_1 = require("../kubernetesApiClient");
exports.GeneralK8sClient = kubernetesApiClient_1.GeneralK8sClient;
class TFOperatorClientV1Alpha2 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/tfjob-crd-v1alpha2.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1alpha2.namespaces('default').tfjobs;
    }
    get containerName() {
        return 'tensorflow';
    }
}
class TFOperatorClientV1Beta1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/tfjob-crd-v1beta1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1beta1.namespaces('default').tfjobs;
    }
    get containerName() {
        return 'tensorflow';
    }
}
class TFOperatorClientV1Beta2 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/tfjob-crd-v1beta2.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1beta2.namespaces('default').tfjobs;
    }
    get containerName() {
        return 'tensorflow';
    }
}
class TFOperatorClientV1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/tfjob-crd-v1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1.namespaces('default').tfjobs;
    }
    get containerName() {
        return 'tensorflow';
    }
}
class PyTorchOperatorClientV1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/pytorchjob-crd-v1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1.namespaces('default').pytorchjobs;
    }
    get containerName() {
        return 'pytorch';
    }
}
class PyTorchOperatorClientV1Alpha2 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/pytorchjob-crd-v1alpha2.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1alpha2.namespaces('default').pytorchjobs;
    }
    get containerName() {
        return 'pytorch';
    }
}
class PyTorchOperatorClientV1Beta1 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/pytorchjob-crd-v1beta1.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1beta1.namespaces('default').pytorchjobs;
    }
    get containerName() {
        return 'pytorch';
    }
}
class PyTorchOperatorClientV1Beta2 extends kubernetesApiClient_1.KubernetesCRDClient {
    constructor() {
        super();
        this.crdSchema = JSON.parse(fs.readFileSync('./config/kubeflow/pytorchjob-crd-v1beta2.json', 'utf8'));
        this.client.addCustomResourceDefinition(this.crdSchema);
    }
    get operator() {
        return this.client.apis['kubeflow.org'].v1beta2.namespaces('default').pytorchjobs;
    }
    get containerName() {
        return 'pytorch';
    }
}
class KubeflowOperatorClientFactory {
    static createClient(kubeflowOperator, operatorApiVersion) {
        switch (kubeflowOperator) {
            case 'tf-operator': {
                switch (operatorApiVersion) {
                    case 'v1alpha2': {
                        return new TFOperatorClientV1Alpha2();
                    }
                    case 'v1beta1': {
                        return new TFOperatorClientV1Beta1();
                    }
                    case 'v1beta2': {
                        return new TFOperatorClientV1Beta2();
                    }
                    case 'v1': {
                        return new TFOperatorClientV1();
                    }
                    default:
                        throw new Error(`Invalid tf-operator apiVersion ${operatorApiVersion}`);
                }
            }
            case 'pytorch-operator': {
                switch (operatorApiVersion) {
                    case 'v1alpha2': {
                        return new PyTorchOperatorClientV1Alpha2();
                    }
                    case 'v1beta1': {
                        return new PyTorchOperatorClientV1Beta1();
                    }
                    case 'v1beta2': {
                        return new PyTorchOperatorClientV1Beta2();
                    }
                    case 'v1': {
                        return new PyTorchOperatorClientV1();
                    }
                    default:
                        throw new Error(`Invalid pytorch-operator apiVersion ${operatorApiVersion}`);
                }
            }
            default:
                throw new Error(`Invalid operator ${kubeflowOperator}`);
        }
    }
}
exports.KubeflowOperatorClientFactory = KubeflowOperatorClientFactory;
