# App Helm Chart

This repository contains a **Helm chart template** designed to **simplify and accelerate the migration of existing applications to Helm**.

It provides a standardized structure and reusable Kubernetes resources, making it easy to convert applications into Helm charts in a simple and consistent way. The chart also includes native support for **AWS Secrets Manager** using the **Secrets Store CSI Driver**.

---

## 🎯 Purpose

This Helm chart acts as a **base template** to:

* Facilitate the migration of applications to Helm
* Standardize Kubernetes manifests across environments
* Reduce boilerplate when creating new Helm charts
* Provide built-in integrations (GatewayAPI, HPA, Secrets, ConfigMaps)

You can adapt this template to different applications by customizing the `values.yaml` files.

---

## 📦 Chart Structure

```
├── Chart.yaml
├── helmvalues
│   └── values.yaml
├── README.md
└── templates
    ├── cluster-issuer.yaml
    ├── configmap.yaml
    ├── deployment.yaml
    ├── gateway.yaml
    ├── _helpers.tpl
    ├── hpa.yaml
    ├── httproute.yaml
    ├── NOTES.txt
    ├── pvc.yaml
    ├── secretproviderclass.yaml
    ├── secret.yaml
    ├── serviceaccount.yaml
    └── service.yaml
```

---

## 🚀 Prerequisites

* Kubernetes cluster (EKS recommended)
* Helm v3+
* AWS account
* IAM permissions to access AWS Secrets Manager

---

## 🔐 AWS Secrets Manager Integration

This chart uses **Secrets Store CSI Driver** with the **AWS provider** to mount secrets from AWS Secrets Manager into Kubernetes.

### 1️⃣ Install Secrets Store CSI Driver

Add the Helm repository:

```bash
helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
```

Install the CSI driver:

```bash
helm install secrets-store-csi-driver \
  secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system \
  --create-namespace \
  --set syncSecret.enabled=true
```

> `syncSecret.enabled=true` allows syncing mounted secrets into native Kubernetes Secrets.

---

### 2️⃣ Install AWS Secrets Manager Provider

Add the AWS provider repository:

```bash
helm repo add aws-secrets-manager https://aws.github.io/secrets-store-csi-driver-provider-aws
```

Install the provider:

```bash
helm install secrets-provider-aws \
  aws-secrets-manager/secrets-store-csi-driver-provider-aws \
  --namespace kube-system \
  --create-namespace \
  --set secrets-store-csi-driver.install=false
```

> The CSI driver is already installed, so `secrets-store-csi-driver.install=false` is required.

---

### 3️⃣ IAM Permissions (EKS)

Ensure your workload has access to AWS Secrets Manager. Recommended approaches:

* **IRSA (IAM Roles for Service Accounts)** – preferred
* Node IAM Role (less secure)

Example IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 🧩 SecretProviderClass

The file `templates/secretproviderclass.yaml` defines how secrets are fetched from AWS Secrets Manager and optionally synchronized as Kubernetes Secrets.

Adjust this template according to your application needs and secret structure.

---

## 💾 Persistent Storage

`pvc` creates the PersistentVolumeClaim; mount it with `volumes` / `volumeMounts`:

```yaml
pvc:
  enabled: true
  name: app-data
  storageClass: ""        # "" = cluster default, "-" = none
  accessModes:
    - ReadWriteOnce
  size: 1Gi
  keep: true              # keep the PVC on helm uninstall

volumes:
  - name: data
    persistentVolumeClaim:
      claimName: app-data
volumeMounts:
  - name: data
    mountPath: /data
```

With `ReadWriteOnce` the deployment uses the `Recreate` strategy; keep a single replica.
Non-root images need `podSecurityContext.fsGroup` to write to the volume.

---

## 📥 Installing the Chart

Example installation using a custom values file:

```bash
helm install my-app ./app-chart \
  -f helmvalues/values.yaml
```

---

## 👤 Author

Developed and maintained by **José Lucas**
LinkedIn: [https://www.linkedin.com/in/lucasaffonso0/](https://www.linkedin.com/in/lucasaffonso0/)