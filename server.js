// server.js
const express = require('express');
const bodyParser = require('body-parser');
const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromCluster(); // important: in-cluster token via /var/run/secrets/...
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sApps = kc.makeApiClient(k8s.AppsV1Api);
const k8sNetworking = kc.makeApiClient(k8s.NetworkingV1Api);

const app = express();
app.use(bodyParser.json());

// basic auth middleware (replace with JWT/NextAuth real auth)
function ensureAuth(req, res, next) {
  // validate req.headers.authorization token; map to userId
  req.user = { id: req.headers['x-user-id'] || 'demo' };
  next();
}
app.post('/deploy', ensureAuth, async (req, res) => {
  const { image, port = 3000, subdomain = 'user-service' } = req.body;
  const userId = req.user.id;
  const ns = `user-${userId}`;

  // 1) create namespace if not exists
  try {
    await k8sApi.readNamespace(ns);
  } catch (err) {
    await k8sApi.createNamespace({ metadata: { name: ns } });
  }

  // 2) create Deployment
  const deploymentManifest = {
    metadata: { name: 'app', namespace: ns },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'app' } },
      template: {
        metadata: { labels: { app: 'app' } },
        spec: { containers: [{ name: 'app', image, ports: [{ containerPort: port }] }] }
      }
    }
  };
  await k8sApps.createNamespacedDeployment(ns, deploymentManifest).catch(async e => {
    if (e.body && e.body.reason === 'AlreadyExists') {
      await k8sApps.patchNamespacedDeployment('app', ns, deploymentManifest, undefined, undefined, undefined, undefined, { headers: { 'Content-Type': 'application/merge-patch+json' }});
    } else throw e;
  });

  // 3) create Service
  const svc = {
    metadata: { name: 'app-svc', namespace: ns },
    spec: { selector: { app: 'app' }, ports: [{ port: 80, targetPort: port }] }
  };
  await k8sApi.createNamespacedService(ns, svc).catch(async e => {
    if (e.body && e.body.reason === 'AlreadyExists') {
      /* ignore */
    } else throw e;
  });

  // 4) create Ingress
  const host = `${subdomain}.${process.env.BASE_DOMAIN || '0rca.fun'}`;
  const ingress = {
    metadata: {
      name: 'app-ingress',
      namespace: ns,
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
        'cert-manager.io/cluster-issuer': 'letsencrypt-staging'
      }
    },
    spec: {
      tls: [{ hosts: [host], secretName: `${ns}-tls` }],
      rules: [{
        host,
        http: {
          paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'app-svc', port: { number: 80 } } } }]
        }
      }]
    }
  };
  await k8sNetworking.createNamespacedIngress(ns, ingress).catch(async e => {
    if (e.body && e.body.reason === 'AlreadyExists') {
      /* patch if needed */
    } else throw e;
  });

  res.json({ ok: true, host });
});

app.listen(8080, () => console.log('backend listening on 8080'));
