'use strict';

const crypto = require('crypto');

const SUPPORTED_TYPES = new Set(['GITHUB', 'AWS', 'AZURE', 'GCP', 'GITLAB', 'BITBUCKET', 'AWS_CODECOMMIT']);
const SECRET_FIELDS = new Set(['token', 'privateKey', 'clientSecret', 'secretKey', 'serviceAccountJson', 'accessKey']);

function encryptionKey() {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('INTEGRATION_ENCRYPTION_KEY must be configured in production');
  return crypto.createHash('sha256').update(configured || 'local-development-integration-key').digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decrypt(value) {
  const [iv, tag, ciphertext] = String(value || '').split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Invalid encrypted integration credentials');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8'));
}

function maskSecret(value) {
  if (!value) return 'not-configured';
  const text = String(value);
  return text.length <= 4 ? '****' : `****${text.slice(-4)}`;
}

function responseShape(doc) {
  return {
    id: doc.id,
    type: doc.type,
    provider: doc.type,
    name: doc.name,
    projectId: doc.projectId || null,
    status: doc.status,
    config: doc.config || {},
    credentialRef: doc.credentialRef || null,
    lastValidatedAt: doc.lastValidatedAt || null,
    lastError: doc.lastError || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

class ScmIntegrationService {
  constructor({ tenantDbManager, scannerService, projectRepository = null }) {
    this.tenantDbManager = tenantDbManager;
    this.scannerService = scannerService;
    this.projectRepository = projectRepository;
  }

  _getDb(tenantKey) { return this.tenantDbManager.getTenantDb(tenantKey); }

  _validateType(type) {
    const normalized = String(type || '').toUpperCase();
    if (!SUPPORTED_TYPES.has(normalized)) {
      const err = new Error(`Unsupported integration type: ${type}`);
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  _validateCredentials(type, credentials, config) {
    const required = type === 'GITHUB'
      ? ['appId', 'installationId', 'privateKey']
      : type === 'AWS'
        ? ['accessKey', 'secretKey']
        : type === 'AZURE'
          ? ['tenantId', 'clientId', 'clientSecret']
          : type === 'GCP'
            ? ['serviceAccountJson']
            : [];
    for (const field of required) {
      if (!credentials?.[field] && !config?.[field]) {
        const err = new Error(`${field} is required for ${type} integration`);
        err.statusCode = 400;
        throw err;
      }
    }
  }

  async createIntegration(tenantKey, { type, name, projectId = null, credentials = {}, config = {} }, actorUserId) {
    const normalizedType = this._validateType(type);
    if (!name) {
      const err = new Error('Integration name is required');
      err.statusCode = 400;
      throw err;
    }
    this._validateCredentials(normalizedType, credentials, config);
    if (config?.apiUrl) this._validateOutboundUrl(config.apiUrl);

    const id = `integ_${normalizedType.toLowerCase()}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const secretPayload = Object.fromEntries(Object.entries(credentials).filter(([key]) => SECRET_FIELDS.has(key) || key === 'appId' || key === 'installationId'));
    const publicConfig = { ...config };
    for (const key of SECRET_FIELDS) delete publicConfig[key];
    for (const key of ['appId', 'installationId', 'tenantId', 'clientId']) {
      if (credentials[key] && !publicConfig[key]) publicConfig[key] = credentials[key];
      delete secretPayload[key];
    }

    const now = new Date();
    const doc = {
      _id: id,
      id,
      type: normalizedType,
      name,
      projectId: projectId || null,
      status: 'CONFIGURED',
      credentialCiphertext: encrypt(secretPayload),
      credentialRef: { masked: maskSecret(credentials.privateKey || credentials.secretKey || credentials.token || credentials.serviceAccountJson), type: 'ENCRYPTED' },
      config: publicConfig,
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
      lastValidatedAt: null,
      lastError: null
    };
    await this._getDb(tenantKey).collection('integrations').insertOne(doc);
    await this._audit(tenantKey, actorUserId, 'integration.created', projectId, id, { type: normalizedType, name });
    if (projectId && this.projectRepository && ['AWS', 'AZURE', 'GCP'].includes(normalizedType)) {
      await this.projectRepository.addCloudAccount(tenantKey, projectId, {
        integrationId: id,
        provider: normalizedType,
        accountId: publicConfig.accountId || publicConfig.subscriptionId || publicConfig.projectId || null,
        region: publicConfig.region || null,
        status: doc.status,
        lastValidatedAt: null,
        updatedAt: now
      });
    }
    return responseShape(doc);
  }

  async listIntegrations(tenantKey, projectId = null) {
    const query = projectId ? { projectId } : {};
    const docs = await this._getDb(tenantKey).collection('integrations').find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(responseShape);
  }

  async getIntegration(tenantKey, integrationId) {
    const doc = await this._getDb(tenantKey).collection('integrations').findOne({ id: integrationId });
    return doc ? responseShape(doc) : null;
  }

  async _findOwned(tenantKey, integrationId) {
    const doc = await this._getDb(tenantKey).collection('integrations').findOne({ id: integrationId });
    if (!doc) {
      const err = new Error(`Integration ${integrationId} not found`);
      err.statusCode = 404;
      throw err;
    }
    return doc;
  }

  _validateOutboundUrl(urlStr) {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      const err = new Error('Invalid API URL: malformed URL');
      err.statusCode = 400;
      throw err;
    }
    if (parsed.protocol !== 'https:') {
      const err = new Error('Outbound API URL must use https protocol');
      err.statusCode = 400;
      throw err;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      const err = new Error('Outbound API URL cannot target private or loopback networks');
      err.statusCode = 400;
      throw err;
    }
    return parsed.origin;
  }

  _githubJwt(credentials) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(credentials.appId) })).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    return `${header}.${payload}.${signer.sign(credentials.privateKey).toString('base64url')}`;
  }

  async _githubToken(doc, credentials) {
    const rawApiUrl = doc.config?.apiUrl || 'https://api.github.com';
    this._validateOutboundUrl(rawApiUrl);
    const apiUrl = rawApiUrl.replace(/\/$/, '');
    const response = await fetch(`${apiUrl}/app/installations/${encodeURIComponent(credentials.installationId)}/access_tokens`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this._githubJwt(credentials)}`, 'X-GitHub-Api-Version': '2022-11-28' }
    });
    if (!response.ok) throw new Error(`GitHub installation authentication failed (${response.status})`);
    const data = await response.json();
    return { token: data.token, apiUrl };
  }

  async testIntegration(tenantKey, integrationId, actorUserId) {
    const db = this._getDb(tenantKey);
    const doc = await this._findOwned(tenantKey, integrationId);
    try {
      const credentials = decrypt(doc.credentialCiphertext);
      if (doc.type === 'GITHUB') {
        const { token, apiUrl } = await this._githubToken(doc, { ...credentials, ...doc.config });
        const res = await fetch(`${apiUrl}/installation/repositories?per_page=1`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
        if (!res.ok) throw new Error(`GitHub repository access failed (${res.status})`);
      }
      const now = new Date();
      await db.collection('integrations').updateOne({ id: integrationId }, { $set: { status: 'CONNECTED', lastValidatedAt: now, lastError: null, updatedAt: now } });
      await this._audit(tenantKey, actorUserId, 'integration.validated', doc.projectId, integrationId, { type: doc.type });
      return responseShape({ ...doc, status: 'CONNECTED', lastValidatedAt: now, lastError: null, updatedAt: now });
    } catch (err) {
      const now = new Date();
      await db.collection('integrations').updateOne({ id: integrationId }, { $set: { status: 'ERROR', lastValidatedAt: now, lastError: err.message, updatedAt: now } });
      throw err;
    }
  }

  async listRepositories(tenantKey, integrationId) {
    const doc = await this._findOwned(tenantKey, integrationId);
    if (doc.type !== 'GITHUB') return [];
    const credentials = decrypt(doc.credentialCiphertext);
    const { token, apiUrl } = await this._githubToken(doc, { ...credentials, ...doc.config });
    const response = await fetch(`${apiUrl}/installation/repositories?per_page=100`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) throw new Error(`GitHub repository discovery failed (${response.status})`);
    const data = await response.json();
    return (data.repositories || []).map(repo => ({ id: String(repo.id), integrationId, name: repo.name, fullName: repo.full_name, defaultBranch: repo.default_branch || 'main', cloneUrl: repo.clone_url, status: 'READY' }));
  }

  async triggerRepositoryScan(tenantKey, { integrationId, repositoryId, projectId, branch = 'main', manifestPath = 'package.json' }, actorUserId) {
    if (!manifestPath || typeof manifestPath !== 'string' || manifestPath.includes('..') || manifestPath.startsWith('/') || manifestPath.startsWith('\\')) {
      const err = new Error('Invalid manifest path: path traversal is not permitted');
      err.statusCode = 400;
      throw err;
    }
    const doc = await this._findOwned(tenantKey, integrationId);
    if (doc.type !== 'GITHUB') {
      const err = new Error('Repository scans currently require a GitHub integration');
      err.statusCode = 400;
      throw err;
    }
    const credentials = decrypt(doc.credentialCiphertext);
    const { token, apiUrl } = await this._githubToken(doc, { ...credentials, ...doc.config });
    const repoResponse = await fetch(`${apiUrl}/repositories/${encodeURIComponent(repositoryId)}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!repoResponse.ok) throw new Error(`GitHub repository lookup failed (${repoResponse.status})`);
    const repo = await repoResponse.json();
    const contentResponse = await fetch(`${apiUrl}/repos/${repo.full_name}/contents/${manifestPath}?ref=${encodeURIComponent(branch)}`, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!contentResponse.ok) throw new Error(`Manifest lookup failed (${contentResponse.status})`);
    const content = await contentResponse.json();
    if (content.encoding !== 'base64' || !content.content) throw new Error('Selected repository path is not a supported file');
    const scan = await this.scannerService.createScan({ tenantId: tenantKey, userId: actorUserId, originalFileName: `${repo.full_name}/${manifestPath}`, fileContent: Buffer.from(content.content.replace(/\s/g, ''), 'base64'), mimeType: 'application/json', projectId: projectId || doc.projectId, name: `GitHub Scan: ${repo.full_name} (${branch})` });
    await this._audit(tenantKey, actorUserId, 'repository.scanned', projectId || doc.projectId, repositoryId, { integrationId, branch, manifestPath, scanId: scan.id });
    return { scanId: scan.id, status: scan.status, repository: repo.full_name, branch, manifestPath };
  }

  async updateIntegration(tenantKey, integrationId, updates, actorUserId) {
    const doc = await this._findOwned(tenantKey, integrationId);
    const allowed = {};
    if (updates.name) allowed.name = updates.name;
    if (updates.projectId !== undefined) allowed.projectId = updates.projectId || null;
    if (updates.config) {
      if (updates.config.apiUrl) this._validateOutboundUrl(updates.config.apiUrl);
      allowed.config = { ...doc.config, ...updates.config };
    }
    allowed.updatedAt = new Date();
    await this._getDb(tenantKey).collection('integrations').updateOne({ id: integrationId }, { $set: allowed });
    await this._audit(tenantKey, actorUserId, 'integration.updated', allowed.projectId ?? doc.projectId, integrationId, { fields: Object.keys(allowed) });
    return responseShape({ ...doc, ...allowed });
  }

  async deactivateIntegration(tenantKey, integrationId, actorUserId) {
    const doc = await this._findOwned(tenantKey, integrationId);
    const now = new Date();
    await this._getDb(tenantKey).collection('integrations').updateOne({ id: integrationId }, { $set: { status: 'DISABLED', updatedAt: now } });
    await this._audit(tenantKey, actorUserId, 'integration.disabled', doc.projectId, integrationId, {});
    return responseShape({ ...doc, status: 'DISABLED', updatedAt: now });
  }

  async _audit(tenantKey, userId, action, projectId, resourceId, details) {
    await this._getDb(tenantKey).collection('audit_logs').insertOne({ id: crypto.randomUUID(), action, userId, projectId: projectId || null, resourceType: 'integration', resourceId, details, timestamp: new Date() });
  }
}

module.exports = ScmIntegrationService;
